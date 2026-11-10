# Installation

Ubuliera is a local, single-user web app: one Node process serves the REST API, the realtime
socket, the optional MCP endpoint and (in production) the built dashboard, all on
`http://localhost:3022`. Data lives in one SQLite file in your home directory.

## 1. Prerequisites

See [setup/prerequisites.md](setup/prerequisites.md) for versions and the GitHub CLI install per
OS. In short:

- Node.js ≥ 22.12 (`.nvmrc` says `22`) and npm ≥ 11 — `engine-strict=true` in `.npmrc` makes npm
  refuse older versions.
- git ≥ 2.35 (worktrees, branch data).
- Claude Code installed and logged in — needed to run or observe sessions, see
  [runtime-setup.md](runtime-setup.md).
- Optional: GitHub CLI `gh`, authenticated, for the GitHub view.

## 2. Install dependencies

```bash
git clone <your fork or copy of this repository> ubuliera
cd ubuliera
npm ci            # exact versions from package-lock.json
```

`npm ci` also runs the web workspace's `postinstall` (`tsr generate`, the TanStack Router route
tree) and installs the native modules:

- `better-sqlite3` — prebuilt binaries for Node 22 on Windows, macOS and Linux.
- `node-pty@1.1.0` — only used to host an Agent Teams lead. 1.1.0 ships a `win32-x64` prebuild;
  if the native module cannot load, Ubuliera still starts and Agent Teams becomes observe-only
  (see [runtime-setup.md](runtime-setup.md#node-pty)).

## 3. Run in production mode (recommended for daily use)

```bash
npm run build     # builds apps/web (Rsbuild) then apps/server (tsup)
npm start         # NODE_ENV=production node apps/server/dist/main.js
```

Open <http://localhost:3022>. The server log line `ubuliera listening` shows the URL, the data
directory and `remote: false`.

The database is created and migrated automatically on start (`~/.ubuliera/ubuliera.db`). You can also
apply migrations explicitly with `npm run db:migrate` — it uses the same `UBULIERA_DATA_DIR`.

Check health:

```bash
curl http://localhost:3022/api/v1/health
# {"status":"ok","version":"0.1.0","db":"ok","uptimeMs":…}
```

## 4. Run in development mode

```bash
npm run dev
```

This starts two processes with `concurrently`:

| Process                   | Port | What it does                                                           |
| ------------------------- | ---- | ---------------------------------------------------------------------- |
| `@ubuliera/web` (Rsbuild) | 3022 | dashboard with hot reload; proxies `/api`, `/mcp`, `/socket.io` → 3023 |
| `@ubuliera/server` (tsx)  | 3023 | API, realtime, MCP; restarts on change (`tsx watch`)                   |

Use <http://localhost:3022> in both modes. Hooks installed by Ubuliera post to
`http://127.0.0.1:3022/api/v1/hooks/ingest` by default, which reaches the server through the
Rsbuild proxy in development — so keep the web dev server running while observing sessions.

## 5. Connect your first session

1. Overview → **Register project**: enter the absolute path of a local repository.
2. **Install hooks** on that project: review the preview of
   `.claude/settings.local.json` and confirm. Nothing is written before you confirm.
3. Run `claude` in that repository as usual. The session appears on the dashboard with its first
   hook event.

More walkthroughs: [usage-examples.md](usage-examples.md).

## 6. Verify the install (optional)

```bash
npm run lint && npm run typecheck
npm test               # Vitest: contracts, server, web
npm run test:e2e       # Playwright + axe against the production build (fake runtime)
```

`npm run test:e2e` builds and starts its own server on port 3022 with `NODE_ENV=test` and the
test-only fake runtime. If something already listens on 3022, set `UBULIERA_E2E_PORT`.

## Uninstall

- Remove Ubuliera's hooks from each project (project row → **Manage hooks** → **Uninstall hooks**), or delete
  the Ubuliera entries from `.claude/settings.local.json` — they are the `http` hooks whose URL ends
  in `/api/v1/hooks/ingest`.
- Delete the data directory (`~/.ubuliera` by default) and any `<repo>/.ubuliera/worktrees` folders
  Ubuliera created for managed executions.
