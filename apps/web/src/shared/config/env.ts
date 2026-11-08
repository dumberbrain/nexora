/**
 * Client-visible configuration. Only Rsbuild `PUBLIC_*` variables reach the bundle — never put
 * secrets here. The API is always same-origin (/api/v1), so no URL config is needed.
 */
export const env = {
  mode: import.meta.env.MODE,
  isDev: import.meta.env.DEV,
  appVersion: (import.meta.env.PUBLIC_APP_VERSION as string | undefined) ?? "dev",
} as const;
