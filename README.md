# LumaTerm

A modern terminal emulator built with Tauri 2, React 19, and xterm.js. Features multi-pane splits, git integration, Docker management, and an AI agents panel.

![LumaTerm Preview](preview/showcase-containers.png)

## Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Bun](https://bun.sh/) (or Node.js 18+)
- Platform-specific Tauri dependencies — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

## Setup

```bash
git clone <repo-url> && cd lumashell
bun install
```

## Development

```bash
make run
# or: bun run tauri dev
```

Starts Vite on `localhost:1420` with HMR and launches the Tauri window.

## Production Build

```bash
make build    # Build for current platform
```

Build output: `src-tauri/target/release/bundle/`

## Release (GitHub Actions)

Cross-platform builds (macOS ARM + Intel, Linux, Windows) run via GitHub Actions. Push a version tag to trigger:

```bash
make bump-patch           # Bump version (or bump-minor / bump-major)
make release              # Commit, tag, push — triggers CI build
```

The workflow builds for all platforms, signs macOS bundles, and creates a draft GitHub Release with all artifacts attached.

To set up macOS code signing, add these repository secrets:

| Secret                       | Description                          |
|------------------------------|--------------------------------------|
| `APPLE_CERTIFICATE`          | Base64-encoded `.p12` certificate    |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the `.p12` file         |
| `APPLE_SIGNING_IDENTITY`     | Certificate name in Keychain         |
| `APPLE_ID`                   | Apple ID email                       |
| `APPLE_PASSWORD`             | App-specific password                |
| `APPLE_TEAM_ID`              | Apple Developer Team ID              |

## macOS — "App is damaged and can't be opened"

If you see this error after downloading, remove the quarantine attribute:

```bash
xattr -cr /Applications/lumaterm.app
```

## Project Structure

```
lumashell/
├── src/                  # Frontend (React + TypeScript)
│   ├── components/       # UI — TerminalPane, GitPanel, DockerPanel, etc.
│   ├── addons/           # Feature modules (git, containers, agents, system)
│   ├── hooks/            # Custom hooks (use-pty)
│   ├── lib/              # Utilities (keybindings, theme, split-tree)
│   └── state/            # Zustand store
├── src-tauri/            # Backend (Rust)
│   ├── src/
│   │   ├── commands.rs   # Tauri IPC command handlers
│   │   ├── pty_manager.rs# PTY lifecycle management
│   │   └── git_watcher.rs# File system watcher for git status
│   └── tauri.conf.json   # App window & bundle config
├── Makefile              # Build automation
└── package.json          # Frontend dependencies & scripts
```

## Tech Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Frontend | React 19, TypeScript, Vite 6      |
| Terminal | xterm.js 5.5                      |
| State    | Zustand 5                         |
| Backend  | Rust, Tauri 2, portable-pty 0.8   |
| Bundler  | Bun                               |
