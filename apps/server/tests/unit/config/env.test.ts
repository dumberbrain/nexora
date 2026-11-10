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
    expect(env.dataDir).toBe(join(HOME, ".ubuliera"));
    expect(env.publicUrl).toBe("http://127.0.0.1:3022");
  });

  it("uses port 3023 in development (web dev server owns 3022 and proxies)", () => {
    expect(loadEnv({ NODE_ENV: "development" }, deps).port).toBe(3023);
  });

  it("defaults NODE_ENV to development", () => {
    expect(loadEnv({}, deps).nodeEnv).toBe("development");
  });

  it("honours UBULIERA_PORT and UBULIERA_DATA_DIR", () => {
    const env = loadEnv({ UBULIERA_PORT: "4000", UBULIERA_DATA_DIR: "/data/nx" }, deps);
    expect(env.port).toBe(4000);
    expect(env.dataDir).toBe("/data/nx");
  });

  it("rejects an invalid port", () => {
    expect(() => loadEnv({ UBULIERA_PORT: "70000" }, deps)).toThrow(ConfigError);
    expect(() => loadEnv({ UBULIERA_PORT: "abc" }, deps)).toThrow(ConfigError);
  });

  it.each(["127.0.0.1", "::1", "localhost"])("accepts loopback host %s without a token", (host) => {
    expect(loadEnv({ UBULIERA_HOST: host }, deps).host).toBe(host);
  });

  it("refuses a non-loopback host without UBULIERA_REMOTE=1", () => {
    expect(() => loadEnv({ UBULIERA_HOST: "0.0.0.0", UBULIERA_TOKEN: TOKEN }, deps)).toThrow(
      /UBULIERA_REMOTE=1/,
    );
  });

  it("refuses a non-loopback host without a token", () => {
    expect(() => loadEnv({ UBULIERA_HOST: "0.0.0.0", UBULIERA_REMOTE: "1" }, deps)).toThrow(
      /UBULIERA_TOKEN/,
    );
  });

  it("refuses a token shorter than 32 chars", () => {
    expect(() =>
      loadEnv(
        { UBULIERA_HOST: "192.168.1.5", UBULIERA_REMOTE: "1", UBULIERA_TOKEN: "t".repeat(31) },
        deps,
      ),
    ).toThrow(/32/);
  });

  it("allows remote binding with UBULIERA_REMOTE=1 and a ≥32-char token", () => {
    const env = loadEnv(
      { UBULIERA_HOST: "0.0.0.0", UBULIERA_REMOTE: "1", UBULIERA_TOKEN: TOKEN },
      deps,
    );
    expect(env.remote).toBe(true);
    expect(env.token).toBe(TOKEN);
  });

  it("allows the fake runtime only when NODE_ENV=test", () => {
    expect(
      loadEnv({ NODE_ENV: "test", UBULIERA_TEST_FAKE_RUNTIME: "1" }, deps).testFakeRuntime,
    ).toBe(true);
    expect(() =>
      loadEnv({ NODE_ENV: "production", UBULIERA_TEST_FAKE_RUNTIME: "1" }, deps),
    ).toThrow(/NODE_ENV=test/);
    expect(() =>
      loadEnv({ NODE_ENV: "development", UBULIERA_TEST_FAKE_RUNTIME: "1" }, deps),
    ).toThrow(/NODE_ENV=test/);
  });

  it("defaults event retention to 30 days and honours UBULIERA_RETENTION_DAYS", () => {
    expect(loadEnv({}, deps).retentionDays).toBe(30);
    expect(loadEnv({ UBULIERA_RETENTION_DAYS: "7" }, deps).retentionDays).toBe(7);
    expect(() => loadEnv({ UBULIERA_RETENTION_DAYS: "0" }, deps)).toThrow(
      /UBULIERA_RETENTION_DAYS/,
    );
    expect(() => loadEnv({ UBULIERA_RETENTION_DAYS: "abc" }, deps)).toThrow(
      /UBULIERA_RETENTION_DAYS/,
    );
  });

  it("uses a throw-away data dir under tmp in test mode when none is given", () => {
    expect(loadEnv({ NODE_ENV: "test" }, deps).dataDir).toBe(join(TMP, "ubuliera-test-4242"));
  });

  it("honours UBULIERA_PUBLIC_URL for hook targets", () => {
    expect(loadEnv({ UBULIERA_PUBLIC_URL: "http://127.0.0.1:9000/" }, deps).publicUrl).toBe(
      "http://127.0.0.1:9000",
    );
  });
});
