import {
  type PtyModule,
  type PtyProcess,
  type PtySpawnOptions,
} from "../../src/modules/runtime-manager/adapters/agent-team-pty/agent-team-pty.adapter";

type Listener<T> = (value: T) => void;

/** In-memory pseudo-terminal: tests push output and exits, and inspect what was typed. */
export class FakePty implements PtyProcess {
  readonly writes: string[] = [];
  readonly resizes: [number, number][] = [];
  killed = false;
  private readonly dataListeners = new Set<Listener<string>>();
  private readonly exitListeners = new Set<Listener<{ exitCode: number; signal?: number }>>();

  constructor(
    readonly pid: number,
    readonly file: string,
    readonly args: string[],
    readonly opts: PtySpawnOptions,
  ) {}

  onData(listener: Listener<string>) {
    this.dataListeners.add(listener);
    return { dispose: () => this.dataListeners.delete(listener) };
  }

  onExit(listener: Listener<{ exitCode: number; signal?: number }>) {
    this.exitListeners.add(listener);
    return { dispose: () => this.exitListeners.delete(listener) };
  }

  write(data: string): void {
    this.writes.push(data);
  }

  resize(cols: number, rows: number): void {
    this.resizes.push([cols, rows]);
  }

  kill(): void {
    this.killed = true;
    this.exit(0);
  }

  /** what the terminal prints */
  emit(data: string): void {
    for (const l of [...this.dataListeners]) l(data);
  }

  exit(exitCode: number): void {
    for (const l of [...this.exitListeners]) l({ exitCode });
  }

  /** everything typed so far, joined */
  get typed(): string {
    return this.writes.join("");
  }
}

export class FakePtyModule implements PtyModule {
  readonly spawned: FakePty[] = [];

  constructor(private readonly pid = 4242) {}

  spawn(file: string, args: string[], opts: PtySpawnOptions): PtyProcess {
    const p = new FakePty(this.pid + this.spawned.length, file, args, opts);
    this.spawned.push(p);
    return p;
  }

  get last(): FakePty {
    const p = this.spawned.at(-1);
    if (!p) throw new Error("no pty spawned");
    return p;
  }
}

/** Screens of the interactive `claude` TUI the adapter reacts to (S2). */
export const SCREENS = {
  trust:
    "\x1b[1m Do you trust the files in this folder?\x1b[0m\r\n ❯ 1. Yes, I trust this folder\r\n   2. No, exit\r\n",
  ready: "\x1b[2m╭────╮\r\n│ > │\r\n╰────╯\r\n  ? for shortcuts\x1b[0m\r\n",
  acceptEditsFooter: "│ > │\r\n  ⏵⏵ accept edits on (shift+tab to cycle)\r\n",
};
