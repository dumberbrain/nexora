import { describe, expect, it } from "vitest";

import { REDACTED, redact, redactString } from "../../../src/lib/redactor";

// Fake credentials assembled at runtime so secret scanners don't flag this file.
const fake = (...parts: string[]) => parts.join("");
const ANTHROPIC = fake("sk-ant-api03-", "A".repeat(40));
const OPENAI = fake("sk-proj-", "b".repeat(40));
const GH_PAT = fake("ghp_", "c".repeat(36));
const GH_FINE = fake("github_pat_", "D".repeat(30));
const AWS_ID = fake("AKIA", "ABCDEFGHIJKLMNOP");
const AWS_SECRET = fake("wJalrXUtnFEMI/K7MDENG/", "bPxRfiCY", "EXAMPLEKEY");
const NEXORA = fake("nxr_", "E".repeat(20), "f".repeat(23));

describe("redactString", () => {
  it.each([
    ["Anthropic key", `key=${ANTHROPIC}`],
    ["OpenAI key", `use ${OPENAI} now`],
    ["GitHub PAT", `token ${GH_PAT}`],
    ["GitHub fine-grained PAT", GH_FINE],
    ["AWS access key id", `id ${AWS_ID}`],
    ["Nexora API token", `mcp ${NEXORA} used`],
  ])("removes %s", (_name, input) => {
    const out = redactString(input);
    expect(out).toContain(REDACTED);
    for (const secret of [ANTHROPIC, OPENAI, GH_PAT, GH_FINE, AWS_ID, NEXORA]) {
      expect(out).not.toContain(secret);
    }
  });

  it("removes bearer tokens but keeps the scheme", () => {
    const out = redactString("Authorization: Bearer abc.def-ghi_jkl123");
    expect(out).toBe(`Authorization: Bearer ${REDACTED}`);
  });

  it("removes password=, secret=, token=, api_key= values but keeps the key", () => {
    expect(redactString("password=hunter2")).toBe(`password=${REDACTED}`);
    expect(redactString("db_password: 'p@ss w0rd'")).toBe(`db_password: ${REDACTED}`);
    expect(redactString("--api_key=xyz123")).toBe(`--api_key=${REDACTED}`);
    expect(redactString('"client_secret":"zzz"')).toBe(`"client_secret":"${REDACTED}"`);
  });

  it("removes AWS secret access keys after their name, also in the CLI form", () => {
    expect(redactString(`aws configure set aws_secret_access_key ${AWS_SECRET}`)).toBe(
      `aws configure set aws_secret_access_key ${REDACTED}`,
    );
    expect(redactString(`AWS_SECRET_ACCESS_KEY=${AWS_SECRET}`)).toBe(
      `AWS_SECRET_ACCESS_KEY=${REDACTED}`,
    );
    expect(redactString(`aws_secret_access_key = "${AWS_SECRET}"`)).not.toContain(AWS_SECRET);
    expect(redactString("aws_secret_access_key is required")).toBe(
      "aws_secret_access_key is required",
    );
  });

  it("removes PEM private keys entirely", () => {
    const pem = [
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIEowIBAAKCAQEA1234567890abcdef",
      "-----END RSA PRIVATE KEY-----",
    ].join("\n");
    const out = redactString(`before\n${pem}\nafter`);
    expect(out).toBe(`before\n${REDACTED}\nafter`);
  });

  it("removes high-entropy values in .env lines and any value of a sensitive env key", () => {
    const env = [
      "NODE_ENV=production",
      "PORT=3022",
      "DATABASE_URL=postgres://u:Zx8Qp2Lm9Vt4Rk7Wn3Yb@db.local:5432/app",
      "STRIPE_SECRET=short",
      "RANDOM_BLOB=Q7f9Lk2Zp8Xv4Nm1Rt6Wb3Yc5Hd0Js",
    ].join("\n");
    const out = redactString(env);
    expect(out).toContain("NODE_ENV=production");
    expect(out).toContain("PORT=3022");
    expect(out).toContain(`STRIPE_SECRET=${REDACTED}`);
    expect(out).toContain(`RANDOM_BLOB=${REDACTED}`);
    expect(out).not.toContain("Zx8Qp2Lm9Vt4Rk7Wn3Yb");
  });

  it("leaves ordinary text alone", () => {
    const text = "Edited src/app/main.tsx: added RouterProvider (12 lines)";
    expect(redactString(text)).toBe(text);
  });

  it("is idempotent", () => {
    const input = `password=x Bearer abcdefgh ${ANTHROPIC} RANDOM_BLOB=Q7f9Lk2Zp8Xv4Nm1Rt6Wb3Yc5Hd0Js`;
    const once = redactString(input);
    expect(redactString(once)).toBe(once);
  });
});

describe("redact (structured)", () => {
  it("redacts sensitive keys at any depth without touching usage counters", () => {
    const input = {
      tool_input: {
        command: "curl -H 'Authorization: Bearer abcdefgh123'",
        env: { API_KEY: "plain", apiKey: "plain2", authToken: "t" },
        headers: [{ authorization: "Basic dXNlcjpwYXNz" }, { cookie: "sid=1" }],
      },
      usage: { inputTokens: 1200, outputTokens: 300, maxTokens: 4096 },
      nested: { deeper: { password: "x", note: OPENAI } },
    };
    const out = redact(input) as typeof input;
    expect(out.tool_input.command).toBe(`curl -H 'Authorization: Bearer ${REDACTED}'`);
    expect(out.tool_input.env).toEqual({
      API_KEY: REDACTED,
      apiKey: REDACTED,
      authToken: REDACTED,
    });
    expect(out.tool_input.headers).toEqual([{ authorization: REDACTED }, { cookie: REDACTED }]);
    expect(out.usage).toEqual({ inputTokens: 1200, outputTokens: 300, maxTokens: 4096 });
    expect(out.nested.deeper).toEqual({ password: REDACTED, note: REDACTED });
  });

  it("does not mutate its input", () => {
    const input = { password: "x" };
    redact(input);
    expect(input.password).toBe("x");
  });

  it("handles cycles and non-plain values", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    const out = redact({ a, n: 1, b: true, z: null, d: new Date(0) }) as Record<string, unknown>;
    expect((out.a as Record<string, unknown>).self).toBe("[Circular]");
    expect(out.n).toBe(1);
    expect(out.b).toBe(true);
    expect(out.z).toBeNull();
    expect(out.d).toBe(new Date(0).toISOString());
  });

  it("is idempotent", () => {
    const input = { headers: { Authorization: "Bearer zzzzzzzz" }, text: `use ${GH_PAT}` };
    const once = redact(input);
    expect(redact(once)).toEqual(once);
  });
});
