import { createHash } from "node:crypto";

import { ApiTokenSchema, CreateApiTokenResultSchema } from "@nexora/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, openDb, type Db } from "../../../src/db/client";
import { apiTokens } from "../../../src/db/schema";
import { type AppError } from "../../../src/http/errors";
import { AuditService } from "../../../src/modules/permission-manager/audit.service";
import { TokenService } from "../../../src/modules/permission-manager/token.service";

let db: Db;
let audit: AuditService;
let now: number;
let tokens: TokenService;

beforeEach(() => {
  db = openDb({ dataDir: ":memory:" });
  now = 1_700_000_000_000;
  audit = new AuditService(db, () => now);
  tokens = new TokenService({ db, audit, now: () => now, lastUsedThrottleMs: 60_000 });
});
afterEach(() => closeDb(db));

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

describe("TokenService (US8, T152)", () => {
  it("creates a token whose secret is returned once and stored only as sha-256", () => {
    const created = tokens.create({ name: "claude-desktop", scope: "read" }, "user");
    expect(CreateApiTokenResultSchema.parse(created)).toEqual(created);
    expect(created.token).toMatchObject({
      name: "claude-desktop",
      scope: "read",
      createdAt: now,
      lastUsedAt: null,
      revokedAt: null,
    });
    expect(created.secret.length).toBeGreaterThanOrEqual(32);

    const rows = db.select().from(apiTokens).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(sha256(created.secret));
    expect(JSON.stringify(rows)).not.toContain(created.secret);

    // the list never carries secrets or hashes
    const listed = tokens.list();
    expect(listed).toHaveLength(1);
    expect(ApiTokenSchema.strict().parse(listed[0])).toEqual(created.token);
    expect(JSON.stringify(listed)).not.toContain(created.secret);
  });

  it("audits create without the secret", () => {
    const { secret, token } = tokens.create({ name: "ci", scope: "control" }, "user");
    const entry = audit.list({ limit: 10 }).items.find((a) => a.action === "token.create");
    expect(entry).toMatchObject({
      actor: "user",
      targetType: "api_token",
      targetId: token.id,
      outcome: "success",
      details: { name: "ci", scope: "control" },
    });
    expect(JSON.stringify(audit.list({ limit: 10 }))).not.toContain(secret);
  });

  it("every secret is unique", () => {
    const a = tokens.create({ name: "a", scope: "read" }, "user");
    const b = tokens.create({ name: "b", scope: "read" }, "user");
    expect(a.secret).not.toBe(b.secret);
  });

  it("rejects a duplicate name with CONFLICT (audited as failed)", () => {
    tokens.create({ name: "dup", scope: "read" }, "user");
    expect(() => tokens.create({ name: "dup", scope: "control" }, "user")).toThrowError(
      expect.objectContaining({ code: "CONFLICT" }) as AppError,
    );
    expect(audit.list({ limit: 10 }).items.filter((a) => a.action === "token.create")).toHaveLength(
      2,
    );
  });

  it("lists newest first, revoked included", () => {
    const first = tokens.create({ name: "first", scope: "read" }, "user");
    now += 1000;
    const second = tokens.create({ name: "second", scope: "control" }, "user");
    tokens.revoke(first.token.id, "user");
    const listed = tokens.list();
    expect(listed.map((t) => t.name)).toEqual(["second", "first"]);
    expect(listed[1]?.revokedAt).toBe(now);
    expect(listed[0]?.id).toBe(second.token.id);
  });

  it("verifies a valid secret → name + scope; unknown or malformed secrets → null", () => {
    const { secret } = tokens.create({ name: "agent-1", scope: "control" }, "user");
    expect(tokens.verify(secret)).toMatchObject({ name: "agent-1", scope: "control" });
    expect(tokens.verify(`${secret}x`)).toBeNull();
    expect(tokens.verify("")).toBeNull();
    expect(tokens.verify("nxr_short")).toBeNull();
  });

  it("revoked tokens are rejected immediately; revoke is idempotent and audited", () => {
    const { secret, token } = tokens.create({ name: "gone", scope: "read" }, "user");
    expect(tokens.verify(secret)).not.toBeNull();
    const revoked = tokens.revoke(token.id, "user");
    expect(revoked.revokedAt).toBe(now);
    expect(tokens.verify(secret)).toBeNull();
    expect(tokens.verifier(secret)).toBeNull();

    now += 5000;
    const again = tokens.revoke(token.id, "user");
    expect(again.revokedAt).toBe(revoked.revokedAt);
    expect(audit.list({ limit: 10 }).items.filter((a) => a.action === "token.revoke")).toHaveLength(
      2,
    );
  });

  it("revoking an unknown id is NOT_FOUND", () => {
    expect(() => tokens.revoke("01JAAAAAAAAAAAAAAAAAAAAAAA", "user")).toThrowError(
      expect.objectContaining({ code: "NOT_FOUND" }) as AppError,
    );
    expect(() => tokens.revoke("not-a-ulid", "user")).toThrowError(
      expect.objectContaining({ code: "NOT_FOUND" }) as AppError,
    );
  });

  it("updates lastUsedAt on use, throttled", () => {
    const { secret, token } = tokens.create({ name: "busy", scope: "read" }, "user");
    const lastUsed = () => tokens.list().find((t) => t.id === token.id)?.lastUsedAt;
    now += 10;
    tokens.verify(secret);
    expect(lastUsed()).toBe(now);
    const first = now;
    now += 30_000;
    tokens.verify(secret);
    expect(lastUsed()).toBe(first);
    now += 31_000;
    tokens.verify(secret);
    expect(lastUsed()).toBe(now);
  });

  it("verifier matches the ApiTokenVerifier shape used by bearer auth and the gateway", () => {
    const { secret } = tokens.create({ name: "shape", scope: "read" }, "user");
    expect(tokens.verifier(secret)).toEqual({ name: "shape", scope: "read" });
    expect(tokens.verifier("nope")).toBeNull();
  });
});
