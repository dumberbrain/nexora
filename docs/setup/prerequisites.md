# Prerequisites

| Tool              | Version                                      | Needed for              |
| ----------------- | -------------------------------------------- | ----------------------- |
| Node.js           | ≥ 22.12 (`.nvmrc`)                           | everything              |
| npm               | ≥ 11                                         | workspaces, scripts     |
| git               | ≥ 2.35                                       | worktrees, branch data  |
| Claude Code       | installed and logged in (`claude --version`) | runtime adapters, hooks |
| GitHub CLI (`gh`) | any current release, authenticated           | GitHub view (US7)       |

## GitHub CLI

Nexora reads GitHub data only through `gh api` (read-only). Without it the GitHub view shows
setup guidance instead of data; everything else works.

### Windows

```powershell
# winget (may only exist at %LOCALAPPDATA%\Microsoft\WindowsApps\winget.exe if not on PATH)
winget install --id GitHub.cli -e

# or Chocolatey — run in an *Administrator* PowerShell
choco install gh -y

# or download the MSI from https://cli.github.com and run it
```

Open a new terminal so `gh` is on `PATH`.

### macOS

```bash
brew install gh
```

### Linux

Follow the package instructions at https://github.com/cli/cli/blob/trunk/docs/install_linux.md
(apt, dnf, zypper, pacman …).

### Authenticate and verify

```bash
gh auth login      # interactive: GitHub.com → HTTPS → login with a web browser
gh auth status     # must report "Logged in to github.com"
```

In a Claude Code session run the login as `! gh auth login` so its prompt reaches you.

### Troubleshooting

- `Gateway timeout (504)` while downloading: GitHub release assets were temporarily unavailable
  (seen 2026-11-08 for both winget and direct downloads). Retry later or use the MSI from
  https://cli.github.com in a browser.
- `choco install` fails with access denied: the shell is not elevated — use an Administrator
  terminal.
