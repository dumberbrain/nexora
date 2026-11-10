import { CSRF_HEADER } from "@ubuliera/contracts";
import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { toast } from "sonner";

import { toApiError } from "./api-error";

const MUTATING = new Set(["post", "put", "patch", "delete"]);
const CSRF_COOKIE = "ubuliera_csrf";
const SESSION_PATH = "/auth/session";

function readCookie(name: string): string | undefined {
  for (const part of document.cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** The only axios instance in the app. Same-origin; auth is the HttpOnly session cookie. */
export const http = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,
  timeout: 30_000,
  headers: { Accept: "application/json" },
});

http.interceptors.request.use((config) => {
  if (MUTATING.has((config.method ?? "get").toLowerCase())) {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) config.headers.set(CSRF_HEADER, csrf);
  }
  return config;
});

/** Single-flight session bootstrap: concurrent 401s share one GET /auth/session. */
let sessionPromise: Promise<void> | null = null;
export function ensureSession(): Promise<void> {
  sessionPromise ??= http
    .get(SESSION_PATH)
    .then(() => undefined)
    .finally(() => {
      sessionPromise = null;
    });
  return sessionPromise;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

http.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as RetriableConfig | undefined;
  const status = error.response?.status;
  if (status === 401 && config && !config._retried && config.url !== SESSION_PATH) {
    config._retried = true;
    await ensureSession();
    // the CSRF cookie may be new — the request interceptor re-reads it
    return http.request(config);
  }
  const apiError = toApiError(error);
  if (apiError.status !== null && apiError.status >= 500) {
    toast.error("Server error", { id: "http-5xx", description: apiError.message });
  }
  throw apiError;
});

/** Test helper: forget an in-flight session bootstrap. */
export function __resetSessionForTests(): void {
  sessionPromise = null;
}
