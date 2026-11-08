import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { Readable } from "node:stream";

import { type Hono } from "hono";

import { type AppBindings } from "./context";
import { isInsideRoot } from "../lib/path-guard";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * Serve the built SPA (production / e2e). Files are confined to `distDir`; unknown paths fall
 * back to index.html so client-side routes work. Hashed assets under /static are immutable.
 */
export function registerStaticSpa(app: Hono<AppBindings>, distDir: string): void {
  const root = resolve(distDir);
  const indexHtml = join(root, "index.html");

  const send = (file: string, immutable: boolean) => {
    const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
    return new Response(body, {
      headers: {
        "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
        "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
      },
    });
  };

  app.get("*", (c, next) => {
    const path = decodeURIComponent(new URL(c.req.url).pathname);
    if (path.startsWith("/api/") || path.startsWith("/socket.io") || path.startsWith("/mcp")) {
      return next();
    }
    const candidate = resolve(root, `.${path}`);
    if (isInsideRoot(root, candidate) && existsSync(candidate) && statSync(candidate).isFile()) {
      return send(candidate, path.startsWith("/static/"));
    }
    if (!existsSync(indexHtml)) return next();
    return send(indexHtml, false);
  });
}
