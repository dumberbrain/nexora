import { type SessionResult } from "../runtime-adapter";

export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

/** Promise with external resolve/reject (ES2023 has no Promise.withResolvers). */
export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * `SessionHandle.done` per turn: settles once per turn; next() opens a new turn only after the
 * previous one settled (a message sent mid-turn joins the running turn).
 */
export class TurnTracker {
  private turn = deferred<SessionResult>();
  private settled = false;

  get current(): Promise<SessionResult> {
    return this.turn.promise;
  }

  get open(): boolean {
    return !this.settled;
  }

  next(): void {
    if (!this.settled) return;
    this.turn = deferred<SessionResult>();
    this.settled = false;
  }

  settle(result: SessionResult): void {
    if (this.settled) return;
    this.settled = true;
    this.turn.resolve(result);
  }
}
