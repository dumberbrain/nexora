import { type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

/** One streaming-input user message (S3: the shape the SDK accepts). */
export function userMessage(text: string): SDKUserMessage {
  return { type: "user", message: { role: "user", content: text }, parent_tool_use_id: null };
}

/**
 * Push-based AsyncIterable used as the SDK's streaming prompt (S3). Each pushed message after a
 * `result` starts a new turn in the same session; end() lets the SDK finish.
 */
export class InputQueue implements AsyncIterable<SDKUserMessage> {
  private readonly items: SDKUserMessage[] = [];
  private wake: (() => void) | undefined;
  private ended = false;

  push(text: string): void {
    if (this.ended) throw new Error("input queue is closed");
    this.items.push(userMessage(text));
    this.notify();
  }

  end(): void {
    this.ended = true;
    this.notify();
  }

  get closed(): boolean {
    return this.ended;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    for (;;) {
      const next = this.items.shift();
      if (next) {
        yield next;
        continue;
      }
      if (this.ended) return;
      await new Promise<void>((resolve) => (this.wake = resolve));
      this.wake = undefined;
    }
  }

  private notify(): void {
    const wake = this.wake;
    this.wake = undefined;
    wake?.();
  }
}
