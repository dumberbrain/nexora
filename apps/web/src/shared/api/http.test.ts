import { http as mswHttp, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import { ApiError } from "./api-error";
import { __resetSessionForTests, http } from "./http";
import { server } from "../../../tests/msw/server";

afterEach(() => {
  __resetSessionForTests();
  document.cookie = "ubuliera_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("http", () => {
  it("sends the CSRF cookie value as X-Ubuliera-CSRF on mutating requests only", async () => {
    document.cookie = "ubuliera_csrf=tok123; path=/";
    const seen: Array<string | null> = [];
    server.use(
      mswHttp.all("*/api/v1/echo", ({ request }) => {
        seen.push(request.headers.get("x-ubuliera-csrf"));
        return HttpResponse.json({ ok: true });
      }),
    );
    await http.get("/echo");
    await http.post("/echo", {});
    expect(seen).toEqual([null, "tok123"]);
  });

  it("bootstraps the session once for concurrent 401s and retries", async () => {
    let sessionCalls = 0;
    let authed = false;
    server.use(
      mswHttp.get("*/api/v1/auth/session", () => {
        sessionCalls++;
        authed = true;
        return HttpResponse.json({ ok: true });
      }),
      mswHttp.get("*/api/v1/things", () =>
        authed
          ? HttpResponse.json({ items: [] })
          : HttpResponse.json(
              { error: { code: "UNAUTHENTICATED", message: "no" } },
              { status: 401 },
            ),
      ),
    );
    const [a, b] = await Promise.all([http.get("/things"), http.get("/things")]);
    expect(a.data).toEqual({ items: [] });
    expect(b.data).toEqual({ items: [] });
    expect(sessionCalls).toBe(1);
  });

  it("maps the server error shape to a typed ApiError", async () => {
    server.use(
      mswHttp.patch("*/api/v1/tasks/T-1/status", () =>
        HttpResponse.json(
          { error: { code: "CONFLICT", message: "running task cannot be completed" } },
          { status: 409 },
        ),
      ),
    );
    const err = await http.patch("/tasks/T-1/status", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "CONFLICT", status: 409 });
  });

  it("maps network failures to code NETWORK", async () => {
    server.use(mswHttp.get("*/api/v1/down", () => HttpResponse.error()));
    const err = await http.get("/down").catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "NETWORK", status: null });
  });
});
