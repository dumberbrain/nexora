import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import {
  type ApiToken,
  type ApiTokenScope,
  type CreateApiTokenInput,
  type CreateApiTokenResult,
  UlidSchema,
} from "@nexora/contracts";
import { desc, eq } from "drizzle-orm";

import { type AuditService } from "./audit.service";
import { type Db } from "../../db/client";
import { apiTokens } from "../../db/schema";
import { AppError } from "../../http/errors";
import { type ApiTokenVerifier } from "../../http/middleware/bearer-auth";
import { newId } from "../../lib/ulid";

/** Prefix of every issued secret (also recognised by the redactor). */
export const TOKEN_PREFIX = "nxr_";
const SECRET_BYTES = 32;

export interface TokenServiceDeps {
  db: Db;
  audit: AuditService;
  now?: () => number;
  /** minimum gap between two `lastUsedAt` writes for one token (default 60 s) */
  lastUsedThrottleMs?: number;
}

/** Identity behind a verified bearer token. */
export interface TokenIdentity {
  id: string;
  name: string;
  scope: ApiTokenScope;
}

type Row = typeof apiTokens.$inferSelect;

const sha256 = (secret: string): string => createHash("sha256").update(secret).digest("hex");

function toApiToken(r: Row): ApiToken {
  return {
    id: r.id,
    name: r.name,
    scope: r.scope,
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt ?? null,
    revokedAt: r.revokedAt ?? null,
  };
}

/**
 * API tokens for MCP clients (US8, FR-043). The secret is generated here, shown exactly once in
 * the create result and stored only as its sha-256 hash. Verification hashes the presented
 * secret, looks it up by hash and compares in constant time; revocation takes effect on the
 * very next request because every verification reads the row.
 */
export class TokenService {
  private readonly now: () => number;
  private readonly throttleMs: number;

  constructor(private readonly deps: TokenServiceDeps) {
    this.now = deps.now ?? Date.now;
    this.throttleMs = deps.lastUsedThrottleMs ?? 60_000;
  }

  /** Newest first, revoked included; never secrets or hashes. */
  list(): ApiToken[] {
    return this.deps.db
      .select()
      .from(apiTokens)
      .orderBy(desc(apiTokens.createdAt), desc(apiTokens.id))
      .all()
      .map(toApiToken);
  }

  create(input: CreateApiTokenInput, actor: string): CreateApiTokenResult {
    const audit = (outcome: "success" | "failed", targetId: string | null, reason?: string) =>
      this.deps.audit.record({
        actor,
        action: "token.create",
        targetType: "api_token",
        targetId,
        outcome,
        details: { name: input.name, scope: input.scope, ...(reason ? { reason } : {}) },
      });
    const taken = this.deps.db
      .select({ id: apiTokens.id })
      .from(apiTokens)
      .where(eq(apiTokens.name, input.name))
      .get();
    if (taken) {
      audit("failed", null, "name already in use");
      throw new AppError("CONFLICT", `A token named "${input.name}" already exists`);
    }
    const now = this.now();
    const secret = `${TOKEN_PREFIX}${randomBytes(SECRET_BYTES).toString("base64url")}`;
    const row: Row = {
      id: newId(now),
      name: input.name,
      tokenHash: sha256(secret),
      scope: input.scope,
      createdAt: now,
      lastUsedAt: null,
      revokedAt: null,
    };
    this.deps.db.insert(apiTokens).values(row).run();
    audit("success", row.id);
    return { token: toApiToken(row), secret };
  }

  /** Idempotent: revoking a revoked token keeps its original `revokedAt`. */
  revoke(id: string, actor: string): ApiToken {
    const row = UlidSchema.safeParse(id).success
      ? this.deps.db.select().from(apiTokens).where(eq(apiTokens.id, id)).get()
      : undefined;
    if (!row) throw new AppError("NOT_FOUND", "API token not found");
    const revokedAt = row.revokedAt ?? this.now();
    if (row.revokedAt === null) {
      this.deps.db.update(apiTokens).set({ revokedAt }).where(eq(apiTokens.id, id)).run();
    }
    this.deps.audit.record({
      actor,
      action: "token.revoke",
      targetType: "api_token",
      targetId: id,
      outcome: "success",
      details: { name: row.name, alreadyRevoked: row.revokedAt !== null },
    });
    return toApiToken({ ...row, revokedAt });
  }

  /** The identity behind an active secret, or null (unknown, malformed or revoked). */
  verify(secret: string): TokenIdentity | null {
    if (!secret) return null;
    const hash = sha256(secret);
    const row = this.deps.db.select().from(apiTokens).where(eq(apiTokens.tokenHash, hash)).get();
    if (!row) return null;
    // the lookup is by hash; compare again in constant time before trusting the match
    if (!timingSafeEqual(Buffer.from(row.tokenHash, "hex"), Buffer.from(hash, "hex"))) return null;
    if (row.revokedAt !== null) return null;
    const now = this.now();
    if (row.lastUsedAt === null || now - row.lastUsedAt >= this.throttleMs) {
      this.deps.db.update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.id, row.id)).run();
    }
    return { id: row.id, name: row.name, scope: row.scope };
  }

  /** {@link ApiTokenVerifier} for bearer auth (REST) and the realtime gateway handshake. */
  readonly verifier: ApiTokenVerifier = (secret) => {
    const identity = this.verify(secret);
    return identity ? { name: identity.name, scope: identity.scope } : null;
  };
}
