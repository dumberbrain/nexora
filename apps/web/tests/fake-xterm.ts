/**
 * jsdom has no canvas/layout, so component tests replace @xterm/xterm and @xterm/addon-fit:
 *   vi.mock("@xterm/xterm", async () => ({ Terminal: (await import(".../fake-xterm")).FakeTerminal }));
 *   vi.mock("@xterm/addon-fit", async () => ({ FitAddon: (await import(".../fake-xterm")).FakeFitAddon }));
 * `FakeTerminal.last()` is the most recent instance; `type()` simulates user keystrokes and
 * `press()` runs the custom key handler like xterm does before handling a key.
 */
type Listener<T> = (value: T) => void;

class Emitter<T> {
  private listeners = new Set<Listener<T>>();
  readonly event = (fn: Listener<T>) => {
    this.listeners.add(fn);
    return { dispose: () => void this.listeners.delete(fn) };
  };
  fire(value: T) {
    for (const fn of this.listeners) fn(value);
  }
}

export class FakeTerminal {
  static instances: FakeTerminal[] = [];
  static last(): FakeTerminal {
    const t = FakeTerminal.instances.at(-1);
    if (!t) throw new Error("no FakeTerminal created");
    return t;
  }

  cols = 80;
  rows = 24;
  written = "";
  disposed = false;
  resets = 0;
  textarea: HTMLTextAreaElement | null = null;
  private keyHandler: ((e: KeyboardEvent) => boolean) | null = null;
  private readonly data = new Emitter<string>();
  private readonly resized = new Emitter<{ cols: number; rows: number }>();
  readonly onData = this.data.event;
  readonly onResize = this.resized.event;

  constructor(readonly options: unknown = {}) {
    FakeTerminal.instances.push(this);
  }
  loadAddon(addon: { activate?: (t: unknown) => void }) {
    addon.activate?.(this);
  }
  open(parent: HTMLElement) {
    const ta = document.createElement("textarea");
    ta.setAttribute("aria-label", "Terminal input");
    parent.appendChild(ta);
    this.textarea = ta;
  }
  focus() {
    this.textarea?.focus();
  }
  write(data: string) {
    this.written += data;
  }
  reset() {
    this.resets += 1;
    this.written = "";
  }
  attachCustomKeyEventHandler(fn: (e: KeyboardEvent) => boolean) {
    this.keyHandler = fn;
  }
  dispose() {
    this.disposed = true;
    this.textarea?.remove();
  }
  // ---- test helpers ----
  type(data: string) {
    this.data.fire(data);
  }
  resize(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.resized.fire({ cols, rows });
  }
  /** true when xterm would handle the key itself */
  press(key: string): boolean {
    return this.keyHandler?.(new KeyboardEvent("keydown", { key })) ?? true;
  }
}

export class FakeFitAddon {
  fits = 0;
  activate() {}
  fit() {
    this.fits += 1;
  }
  dispose() {}
}
