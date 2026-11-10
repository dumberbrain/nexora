import { EventEmitter } from "node:events";

import { type EntityChanged, type UbulieraEvent } from "@ubuliera/contracts";

/**
 * In-process pub/sub between modules and the realtime gateway. Listener errors are isolated so
 * one failing subscriber never breaks event intake (constitution IV).
 */
export class EventBus {
  private readonly emitter = new EventEmitter({ captureRejections: false });

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  onEvent(listener: (e: UbulieraEvent) => void): () => void {
    return this.on("event", listener);
  }

  onEntityChanged(listener: (c: EntityChanged) => void): () => void {
    return this.on("entity", listener);
  }

  publishEvent(e: UbulieraEvent): void {
    this.emitter.emit("event", e);
  }

  publishEntityChanged(c: EntityChanged): void {
    this.emitter.emit("entity", c);
  }

  private on<T>(name: string, listener: (v: T) => void): () => void {
    const safe = (v: T) => {
      try {
        listener(v);
      } catch {
        /* a broken subscriber must not affect producers */
      }
    };
    this.emitter.on(name, safe);
    return () => this.emitter.off(name, safe);
  }
}
