import { Writable } from "node:stream";

import { UlidSchema } from "@nexora/contracts";
import { describe, expect, it } from "vitest";

import { createLogger } from "../../../src/lib/logger";
import { REDACTED } from "../../../src/lib/redactor";
import { newId } from "../../../src/lib/ulid";

describe("newId", () => {
  it("produces valid, strictly increasing ULIDs within the same millisecond", () => {
    const ids = Array.from({ length: 1000 }, () => newId(1_700_000_000_000));
    for (const id of ids) expect(UlidSchema.safeParse(id).success).toBe(true);
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("createLogger", () => {
  it("redacts secrets in log objects and messages", () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const log = createLogger({ level: "info", destination });
    log.info({ headers: { authorization: "Bearer abcdefgh" }, password: "hunter2" }, "login");
    log.info("token=supersecretvalue in message");

    const out = lines.join("");
    expect(out).not.toContain("abcdefgh");
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("supersecretvalue");
    expect(out).toContain(REDACTED);
  });
});
