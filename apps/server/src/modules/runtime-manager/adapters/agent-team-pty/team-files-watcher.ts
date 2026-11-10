import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  type Agent,
  type AgentStatus,
  type TeamMember,
  type TeamMessage,
  type TeamTask,
  type TeamView,
} from "@ubuliera/contracts";

import { type EventInput } from "../../../event-manager";
import { type EventSink } from "../../runtime-adapter";

/*
 * Agent Teams observation (T137, research R3 + "S2 result"). Claude Code keeps the team in
 * `~/.claude/teams/<team>/config.json` (+ `inboxes/<member>.json`) and the shared task list in
 * `~/.claude/tasks/<team>/`. Ubuliera only READS these files — it never writes, renames or deletes
 * them — and inboxes are emptied within seconds, so everything here is `best_effort`.
 */

type Bag = Record<string, unknown>;
const isBag = (v: unknown): v is Bag => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const MAX_MESSAGES = 500;
const MAX_TASKS = 500;
const MAX_SUMMARY = 2000;

export interface TeamConfigMember {
  agentId: string;
  name: string;
  agentType: string;
  joinedAt: number | null;
  cwd: string | null;
}

export interface TeamConfig {
  name: string;
  leadAgentId: string | null;
  leadSessionId: string | null;
  leadPid: number | null;
  members: TeamConfigMember[];
}

/** `config.json` → TeamConfig; null when it is not a team config. */
export function parseTeamConfig(raw: unknown): TeamConfig | null {
  if (!isBag(raw)) return null;
  const name = text(raw.name);
  if (!name || !Array.isArray(raw.members)) return null;
  const lead = isBag(raw.leadProcess) ? raw.leadProcess : {};
  const members: TeamConfigMember[] = [];
  for (const m of raw.members) {
    if (!isBag(m)) continue;
    const memberName = text(m.name);
    const agentId = text(m.agentId);
    if (!memberName || !agentId) continue;
    members.push({
      agentId,
      name: memberName,
      agentType: text(m.agentType) ?? "teammate",
      joinedAt: num(m.joinedAt),
      cwd: text(m.cwd),
    });
  }
  return {
    name,
    leadAgentId: text(raw.leadAgentId),
    leadSessionId: text(raw.leadSessionId),
    leadPid: num(lead.pid),
    members,
  };
}

export interface InboxEntry {
  id: string;
  from: string;
  text: string;
  ts: number;
}

/** `inboxes/<member>.json` (array of `{from, text, timestamp, msg_id, …}`). */
export function parseInbox(raw: unknown, owner: string, now: number): InboxEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: InboxEntry[] = [];
  for (const e of raw) {
    if (!isBag(e)) continue;
    const from = text(e.from) ?? "unknown";
    const body = typeof e.text === "string" ? e.text : JSON.stringify(e.text ?? "");
    const stamp = text(e.timestamp);
    const parsedTs = stamp ? Date.parse(stamp) : NaN;
    const ts = Number.isFinite(parsedTs) ? parsedTs : now;
    const id = text(e.msg_id) ?? `${owner}:${from}:${stamp ?? ts}:${body.length}`;
    out.push({ id, from, text: body, ts });
  }
  return out;
}

/**
 * User-visible summary of one inbox message. `text` may itself be JSON for protocol messages
 * (idle_notification, shutdown_request/response, …): those are summarised, never shown raw.
 */
export function summariseInboxText(from: string, body: string): { kind: string; summary: string } {
  let parsed: unknown;
  try {
    parsed = body.trimStart().startsWith("{") ? JSON.parse(body) : undefined;
  } catch {
    parsed = undefined;
  }
  if (!isBag(parsed) || !text(parsed.type)) {
    return { kind: "text", summary: cap(body.trim(), MAX_SUMMARY) };
  }
  const kind = cap(text(parsed.type) ?? "message", 64);
  const reason = text(parsed.reason);
  let summary: string;
  switch (kind) {
    case "idle_notification": {
      const why = text(parsed.idleReason);
      const result = text(parsed.result);
      summary = `${from} is idle${why ? ` (${why})` : ""}${result ? `: ${result}` : ""}`;
      break;
    }
    case "shutdown_request":
      summary = `${from} requests shutdown${reason ? `: ${reason}` : ""}`;
      break;
    case "shutdown_response": {
      const approved = parsed.approve ?? parsed.approved;
      const verdict = approved === false ? "rejects" : approved === true ? "approves" : "answers";
      summary = `${from} ${verdict} the shutdown request${reason ? `: ${reason}` : ""}`;
      break;
    }
    default: {
      const content =
        text(parsed.message) ?? text(parsed.content) ?? text(parsed.summary) ?? reason;
      summary = `${from}: ${kind}${content ? ` — ${content}` : ""}`;
    }
  }
  return { kind, summary: cap(summary, MAX_SUMMARY) };
}

/** One task file of `~/.claude/tasks/<team>/` (documented shape; not seen in S2). */
export function parseTeamTask(raw: unknown, fallbackId: string): TeamTask | null {
  if (!isBag(raw)) return null;
  const id = text(raw.id) ?? (num(raw.id) === null ? null : String(raw.id)) ?? fallbackId;
  const subject = text(raw.subject) ?? text(raw.title) ?? text(raw.description) ?? `Task ${id}`;
  return {
    id: cap(id, 200),
    subject: cap(subject, 2000),
    status: cap(text(raw.status) ?? "pending", 64),
    owner: text(raw.owner) ?? text(raw.assignee) ?? null,
  };
}

/** Where Ubuliera persists team agents (AgentRepository + entity bus in production). */
export interface TeamAgentSink {
  upsert(agent: Agent): void;
}

export interface TeamContext {
  sessionId: string;
  executionId: string | null;
  taskId: string | null;
}

const AGENT_STATUS: Record<TeamMember["status"], AgentStatus> = {
  active: "running",
  idle: "idle",
  left: "completed",
};

/**
 * The team of one Ubuliera-started lead session, folded from team-file snapshots and hook payloads.
 * File-derived changes are emitted through the session's EventSink (source `team_files`,
 * `best_effort`); hook-derived changes only update state (the hook itself is ingested elsewhere).
 */
export class TeamState {
  private teamName: string | null = null;
  private readonly members = new Map<string, TeamMember>();
  private readonly tasks = new Map<string, TeamTask>();
  private readonly messages: TeamMessage[] = [];
  private readonly seenMessages = new Set<string>();
  private updatedAt: number;
  /** the lead ended a turn and has not worked since */
  private leadIdle = false;
  private lastLeadText: string | null = null;

  constructor(
    private readonly ctx: TeamContext,
    private readonly sink: EventSink,
    private readonly agents: TeamAgentSink | undefined,
    private readonly now: () => number = Date.now,
  ) {
    this.updatedAt = now();
  }

  get name(): string | null {
    return this.teamName;
  }

  applyConfig(cfg: TeamConfig): void {
    this.teamName = cfg.name;
    const present = new Set<string>();
    for (const m of cfg.members) {
      present.add(m.name);
      const isLead = m.agentId === cfg.leadAgentId;
      const existing = this.members.get(m.name);
      if (existing && existing.status !== "left") continue;
      const member: TeamMember = {
        agentId: m.agentId,
        name: m.name,
        agentType: isLead ? "team-lead" : m.agentType,
        isLead,
        status: "active",
        joinedAt: m.joinedAt,
        cwd: m.cwd,
      };
      this.members.set(m.name, member);
      this.touch();
      this.emit({
        type: "agent.spawned",
        agentId: this.agentIdOf(member),
        summary: isLead
          ? `Agent team ${cfg.name} created (lead ${m.name})`
          : `Teammate ${m.name} joined team ${cfg.name}`,
        payload: { team: cfg.name, member: m.name, agentType: member.agentType, isLead },
      });
      this.upsertAgent(member);
    }
    for (const member of this.members.values()) {
      if (present.has(member.name) || member.status === "left") continue;
      member.status = "left";
      this.touch();
      this.emit({
        type: "agent.completed",
        agentId: this.agentIdOf(member),
        summary: `Teammate ${member.name} left team ${cfg.name}`,
        payload: { team: cfg.name, member: member.name },
      });
      this.upsertAgent(member);
    }
  }

  applyInbox(owner: string, entries: readonly InboxEntry[]): void {
    for (const e of entries) {
      if (this.seenMessages.has(e.id)) continue;
      this.seenMessages.add(e.id);
      const { kind, summary } = summariseInboxText(e.from, e.text);
      const message: TeamMessage = {
        id: cap(e.id, 200),
        from: e.from,
        to: owner,
        kind,
        summary,
        ts: e.ts,
      };
      this.messages.push(message);
      if (this.messages.length > MAX_MESSAGES) this.messages.shift();
      if (kind === "idle_notification") this.setStatus(e.from, "idle");
      this.touch();
      const sender = this.members.get(e.from);
      this.emit({
        type: "message.sent",
        agentId: sender ? this.agentIdOf(sender) : null,
        summary: `${e.from} → ${owner}: ${summary}`,
        payload: { team: this.teamName, ...message },
      });
    }
  }

  applyTasks(list: readonly TeamTask[]): void {
    for (const t of list) {
      const prev = this.tasks.get(t.id);
      if (
        prev &&
        prev.status === t.status &&
        prev.subject === t.subject &&
        prev.owner === t.owner
      ) {
        continue;
      }
      if (!prev && this.tasks.size >= MAX_TASKS) continue;
      this.tasks.set(t.id, t);
      this.touch();
      if (!prev) {
        this.emit({
          type: "task.created",
          agentId: null,
          summary: `Team task ${t.id} created: ${t.subject}`,
          payload: { team: this.teamName, teamTaskId: t.id, ...t },
        });
      }
      if (t.status === "completed" && prev?.status !== "completed") {
        this.emit({
          type: "task.completed",
          agentId: null,
          summary: `Team task ${t.id} completed: ${t.subject}`,
          payload: { team: this.teamName, teamTaskId: t.id, ...t },
        });
      }
    }
  }

  /** Hook payload of the lead's session (teammates appear with `agent_id`/`agent_type`). */
  applyHook(p: Bag): void {
    const event = text(p.hook_event_name);
    const agentType = text(p.agent_type);
    const fromLead = !text(p.agent_id);
    switch (event) {
      case "TeammateIdle":
        this.setStatus(text(p.teammate_name) ?? agentType, "idle");
        return;
      case "SubagentStart":
        this.setStatus(agentType, "active");
        return;
      case "SubagentStop":
        this.setStatus(agentType, "idle");
        return;
      case "TaskCreated":
      case "TaskCompleted": {
        const id = text(p.task_id) ?? (num(p.task_id) === null ? null : String(p.task_id));
        if (!id) return;
        const prev = this.tasks.get(id);
        if (!prev && this.tasks.size >= MAX_TASKS) return;
        this.tasks.set(id, {
          id,
          subject: cap(text(p.task_subject) ?? prev?.subject ?? `Task ${id}`, 2000),
          status: event === "TaskCompleted" ? "completed" : (prev?.status ?? "pending"),
          owner: text(p.teammate_name) ?? prev?.owner ?? null,
        });
        this.touch();
        return;
      }
      case "Stop":
        if (fromLead) {
          this.leadIdle = true;
          this.lastLeadText = text(p.last_assistant_message);
        }
        return;
      case "UserPromptSubmit":
      case "PreToolUse":
      case "PostToolUse":
        if (fromLead) this.leadIdle = false;
        return;
      default:
        return;
    }
  }

  /** The lead finished its turn and no teammate is left in the team. */
  finished(): { resultText: string | null } | null {
    if (!this.leadIdle) return null;
    const teammates = [...this.members.values()].filter((m) => !m.isLead && m.status !== "left");
    return teammates.length === 0 ? { resultText: this.lastLeadText } : null;
  }

  view(): TeamView | null {
    if (!this.teamName) return null;
    return {
      sessionId: this.ctx.sessionId,
      teamName: this.teamName,
      members: [...this.members.values()].map((m) => ({ ...m })),
      tasks: [...this.tasks.values()].map((t) => ({ ...t })),
      messages: this.messages.map((m) => ({ ...m })),
      reliability: "best_effort",
      updatedAt: this.updatedAt,
    };
  }

  /** The lead is the session's main agent (id = session id); teammates use their team agentId. */
  private agentIdOf(m: TeamMember): string {
    return m.isLead ? this.ctx.sessionId : m.agentId;
  }

  private setStatus(name: string | null, status: "active" | "idle"): void {
    if (!name) return;
    const m = this.members.get(name);
    if (!m || m.isLead || m.status === "left" || m.status === status) return;
    m.status = status;
    this.touch();
    this.upsertAgent(m);
  }

  private upsertAgent(m: TeamMember): void {
    if (!this.agents) return;
    this.agents.upsert({
      id: this.agentIdOf(m),
      sessionId: this.ctx.sessionId,
      parentAgentId: m.isLead ? null : this.ctx.sessionId,
      kind: m.isLead ? "team_lead" : "teammate",
      name: m.name,
      role: m.agentType,
      definitionPath: null,
      status: AGENT_STATUS[m.status],
      currentTaskId: m.isLead ? this.ctx.taskId : null,
      summary: null,
    });
  }

  private touch(): void {
    this.updatedAt = this.now();
  }

  private emit(e: Pick<EventInput, "type" | "agentId" | "summary" | "payload">): void {
    this.sink.emit({
      ...e,
      source: "team_files",
      reliability: "best_effort",
      severity: "info",
      executionId: this.ctx.executionId,
      taskId: this.ctx.taskId,
      sessionId: this.ctx.sessionId,
    });
  }
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch {
    return undefined; // missing, half-written or emptied file — best effort
  }
}

async function jsonFiles(dir: string): Promise<string[]> {
  try {
    const names = await readdir(dir);
    return names.filter((n) => n.endsWith(".json")).sort();
  } catch {
    return [];
  }
}

/** Team whose `config.json` names `pid` as its lead process (how Ubuliera finds ITS team). */
export async function findTeamByPid(teamsDir: string, pid: number): Promise<string | null> {
  let dirs: string[];
  try {
    dirs = await readdir(teamsDir);
  } catch {
    return null;
  }
  for (const dir of dirs.sort()) {
    const cfg = parseTeamConfig(await readJson(path.join(teamsDir, dir, "config.json")));
    if (cfg?.leadPid === pid) return dir;
  }
  return null;
}

export interface TeamFilesWatcherOptions {
  /** `~/.claude` */
  claudeHome: string;
  /** the PTY pid of the lead (== config.leadProcess.pid) */
  pid: number;
  state: TeamState;
  /** default 1500 ms; 0 disables the timer (tests poll by hand) */
  intervalMs?: number;
  onPolled?: () => void;
  onError?: (err: unknown) => void;
}

/** Read-only poller of one team's files. */
export class TeamFilesWatcher {
  private team: string | null = null;
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | null = null;

  constructor(private readonly opts: TeamFilesWatcherOptions) {}

  start(): void {
    const ms = this.opts.intervalMs ?? 1500;
    if (ms <= 0 || this.timer) return;
    this.timer = setInterval(() => {
      void this.poll().catch((err: unknown) => this.opts.onError?.(err));
    }, ms);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One poll; concurrent callers share the running one. */
  poll(): Promise<void> {
    this.running ??= this.pollOnce().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async pollOnce(): Promise<void> {
    const teamsDir = path.join(this.opts.claudeHome, "teams");
    this.team ??= await findTeamByPid(teamsDir, this.opts.pid);
    if (!this.team) return;
    const dir = path.join(teamsDir, this.team);
    const cfg = parseTeamConfig(await readJson(path.join(dir, "config.json")));
    if (cfg && (cfg.leadPid === null || cfg.leadPid === this.opts.pid)) {
      this.opts.state.applyConfig({ ...cfg, name: this.team });
    }
    const inboxDir = path.join(dir, "inboxes");
    const now = Date.now();
    for (const file of await jsonFiles(inboxDir)) {
      const owner = file.slice(0, -".json".length);
      this.opts.state.applyInbox(
        owner,
        parseInbox(await readJson(path.join(inboxDir, file)), owner, now),
      );
    }
    const tasksDir = path.join(this.opts.claudeHome, "tasks", this.team);
    const tasks: TeamTask[] = [];
    for (const file of await jsonFiles(tasksDir)) {
      const t = parseTeamTask(await readJson(path.join(tasksDir, file)), file.slice(0, -5));
      if (t) tasks.push(t);
    }
    this.opts.state.applyTasks(tasks);
    this.opts.onPolled?.();
  }
}
