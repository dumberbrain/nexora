import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/rspack";

/** Backend dev server (apps/server, NODE_ENV=development). Production serves the SPA itself on 3022. */
const API_TARGET = "http://127.0.0.1:3023";

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    entry: { index: "./src/app/main.tsx" },
  },
  resolve: {
    alias: { "@": "./src" },
  },
  html: {
    template: "./index.html",
    title: "Nexora",
  },
  server: {
    host: "127.0.0.1",
    port: 3022,
    strictPort: true,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: false },
      "/mcp": { target: API_TARGET, changeOrigin: false },
      "/socket.io": { target: API_TARGET, ws: true, changeOrigin: false },
    },
  },
  tools: {
    rspack: {
      // file-based routes from src/routes → src/routeTree.gen.ts (team-front: routes stay thin)
      plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true })],
    },
  },
});
