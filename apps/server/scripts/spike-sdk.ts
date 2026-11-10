/**
 * Spike S3 (T071): verify Agent SDK streaming input, permission callbacks, PreToolUse hooks,
 * interrupt() and resume against the installed SDK + Claude Code.
 *
 *   npx tsx apps/server/scripts/spike-sdk.ts <scratch-repo-dir> <out-dir>
 *
 * Uses the cheapest model and isolates from user/project settings (settingSources: []).
 * Writes every SDK message plus canUseTool / hook calls to <out-dir>/*.jsonl.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  type CanUseTool,
  type HookCallback,
  query,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";

const [repoArg, outArg] = process.argv.slice(2);
if (!repoArg || !outArg) throw new Error("usage: spike-sdk.ts <repo> <out>");
const repo: string = repoArg;
const out: string = outArg;
mkdirSync(out, { recursive: true });

const log = (file: string, v: unknown) =>
  appendFileSync(
    join(out, file),
    `${JSON.stringify({ t: Date.now(), ...((v as object) ?? {}) })}\n`,
  );
const say = (m: string) => process.stdout.write(`[spike] ${m}\n`);

/** Push-based async iterable used as the streaming prompt. */
function inputQueue() {
  const items: SDKUserMessage[] = [];
  let wake: (() => void) | undefined;
  let done = false;
  return {
    push(text: string) {
      items.push({
        type: "user",
        message: { role: "user", content: text },
        parent_tool_use_id: null,
      });
      wake?.();
    },
    end() {
      done = true;
      wake?.();
    },
    async *[Symbol.asyncIterator]() {
      for (;;) {
        while (items.length) yield items.shift()!;
        if (done) return;
        await new Promise<void>((r) => (wake = r));
        wake = undefined;
      }
    },
  };
}

const canUseTool: CanUseTool = (toolName, input, opts) => {
  log("permissions.jsonl", { toolName, input, opts: { ...opts, signal: undefined } });
  say(`canUseTool ${toolName}`);
  return Promise.resolve({ behavior: "allow", updatedInput: input });
};

const preToolUse: HookCallback = (input, toolUseID) => {
  log("hooks.jsonl", { input, toolUseID });
  return Promise.resolve({});
};

async function phase1(): Promise<string> {
  const q = inputQueue();
  q.push(
    "Create a file named a.txt containing the single word one. Then reply OK and nothing else.",
  );
  const run = query({
    prompt: q,
    options: {
      cwd: repo,
      model: "haiku",
      permissionMode: "default",
      settingSources: [],
      canUseTool,
      hooks: { PreToolUse: [{ matcher: "*", hooks: [preToolUse] }] },
      includeHookEvents: true,
      maxTurns: 8,
    },
  });

  let sessionId = "";
  let turn = 0;
  let interrupted = false;
  for await (const m of run as AsyncIterable<SDKMessage>) {
    log("phase1.jsonl", m);
    const sub = "subtype" in m ? `/${String(m.subtype)}` : "";
    say(`msg ${m.type}${sub}`);
    if ("session_id" in m && typeof m.session_id === "string") sessionId = m.session_id;

    if (m.type === "result") {
      turn++;
      if (turn === 1) {
        // second message through the same streaming input
        q.push("Count from 1 to 300, one number per line, no other text.");
      } else {
        break;
      }
    } else if (turn === 1 && m.type === "assistant" && !interrupted) {
      interrupted = true;
      const r = await run.interrupt();
      log("phase1.jsonl", { ubuliera: "interrupt() returned", r });
      say("interrupt() sent");
    }
  }
  q.end();
  run.close();
  return sessionId;
}

async function phase2(sessionId: string): Promise<void> {
  const run = query({
    prompt:
      "What is the name of the file you created earlier in this session? Reply with the file name only.",
    options: { cwd: repo, model: "haiku", resume: sessionId, settingSources: [], maxTurns: 2 },
  });
  for await (const m of run as AsyncIterable<SDKMessage>) {
    log("phase2-resume.jsonl", m);
    say(`resume msg ${m.type}${"subtype" in m ? `/${String(m.subtype)}` : ""}`);
    if (m.type === "result") break;
  }
  run.close();
}

const sid = await phase1();
say(`session ${sid}`);
await phase2(sid);
say("done");
