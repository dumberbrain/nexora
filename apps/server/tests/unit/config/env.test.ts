import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ConfigError, loadEnv } from "../../../src/config/env";

const HOME = "/home/tester";
const TMP = "/tmp";
const deps = { homedir: () => HOME, tmpdir: () => TMP, pid: 4242 };
const TOKEN = "t".repeat(32);

describe("loadEnv", () => {
  it("defaults to loopback 127.0.0.1 and port 3022 in production", () => {
    const env = loadEnv({ NODE_ENV: "production" }, deps);
    expect(env.host).toBe("127.0.0.1");
    expect(env.port).toBe(3022);
    expect(env.remote).toBe(false);
    expect(env.dataDir).toBe(join(HOME, ".nexora"));
    expect(env.publicUrl).toBe("http://127.0.0.1:3022");
  });

  it("uses port 3023 in development (web dev server owns 3022 and proxies)", () => {
    expect(loadEnv({ NODE_ENV: "development" }, deps).port).toBe(3023);
  });

  it("defaults NODE_ENV to development", () => {
    expect(loadEnv({}, deps).nodeEnv).toBe("development");
  });

  it("honours NEXORA_PORT and NEXORA_DATA_DIR", () => {
    const env = loadEnv({ NEXORA_PORT: "4000", NEXORA_DATA_DIR: "/data/nx" }, deps);
    expect(env.port).toBe(4000);
    expect(env.dataDir).toBe("/data/nx");
  });

  it("rejects an invalid port", () => {
    expect(() => loadEnv({ NEXORA_PORT: "70000" }, deps)).toThrow(ConfigError);
    expect(() => loadEnv({ NEXORA_PORT: "abc" }, deps)).toThrow(ConfigError);
  });

  it.each(["127.0.0.1", "::1", "localhost"])("accepts loopback host %s without a token", (host) => {
    expect(loadEnv({ NEXORA_HOST: host }, deps).host).toBe(host);
  });

  it("refuses a non-loopback host without NEXORA_REMOTE=1", () => {
    expect(() => loadEnv({ NEXORA_HOST: "0.0.0.0", NEXORA_TOKEN: TOKEN }, deps)).toThrow(
      /NEXORA_REMOTE=1/,
    );
  });

  it("refuses a non-loopback host without a token", () => {
    expect(() => loadEnv({ NEXORA_HOST: "0.0.0.0", NEXORA_REMOTE: "1" }, deps)).toThrow(
      /NEXORA_TOKEN/,
    );
  });

  it("refuses a token shorter than 32 chars", () => {
    expect(() =>
      loadEnv(
        { NEXORA_HOST: "192.168.1.5", NEXORA_REMOTE: "1", NEXORA_TOKEN: "t".repeat(31) },
        deps,
      ),
    ).toThrow(/32/);
  });

  it("allows remote binding with NEXORA_REMOTE=1 and a ≥32-char token", () => {
    const env = loadEnv({ NEXORA_HOST: "0.0.0.0", NEXORA_REMOTE: "1", NEXORA_TOKEN: TOKEN }, deps);
    expect(env.remote).toBe(true);
    expect(env.token).toBe(TOKEN);
  });

  it("allows the fake runtime only when NODE_ENV=test", () => {
    expect(loadEnv({ NODE_ENV: "test", NEXORA_TEST_FAKE_RUNTIME: "1" }, deps).testFakeRuntime).toBe(
      true,
    );
    expect(() => loadEnv({ NODE_ENV: "production", NEXORA_TEST_FAKE_RUNTIME: "1" }, deps)).toThrow(
      /NODE_ENV=test/,
    );
    expect(() => loadEnv({ NODE_ENV: "development", NEXORA_TEST_FAKE_RUNTIME: "1" }, deps)).toThrow(
      /NODE_ENV=test/,
    );
  });

  it("defaults event retention to 30 days and honours NEXORA_RETENTION_DAYS", () => {
    expect(loadEnv({}, deps).retentionDays).toBe(30);
    expect(loadEnv({ NEXORA_RETENTION_DAYS: "7" }, deps).retentionDays).toBe(7);
    expect(() => loadEnv({ NEXORA_RETENTION_DAYS: "0" }, deps)).toThrow(/NEXORA_RETENTION_DAYS/);
    expect(() => loadEnv({ NEXORA_RETENTION_DAYS: "abc" }, deps)).toThrow(/NEXORA_RETENTION_DAYS/);
  });

  it("uses a throw-away data dir under tmp in test mode when none is given", () => {
    expect(loadEnv({ NODE_ENV: "test" }, deps).dataDir).toBe(join(TMP, "nexora-test-4242"));
  });

  it("honours NEXORA_PUBLIC_URL for hook targets", () => {
    expect(loadEnv({ NEXORA_PUBLIC_URL: "http://127.0.0.1:9000/" }, deps).publicUrl).toBe(
      "http://127.0.0.1:9000",
    );
  });
});
