# AGENTS.md

Agent-facing guide for working in the Tux codebase. Read this before making non-trivial changes.

## What Tux is

Tauri 2.x desktop app. React 19 + TypeScript frontend, Rust backend. Multi-session PTY terminals, lightweight code editor, git integration. Full product context: `PRD.md`.

## Layout

- `src/` — React frontend (`.tsx`, `.ts`, `.css`)
- `src-tauri/src/` — Rust backend modules (`pty.rs`, `fs.rs`, `git.rs`, `lib.rs`)
- `src-tauri/tauri.conf.json` — Tauri bundle/product config
- `src-tauri/capabilities/default.json` — plugin permission allowlist
- `PRD.md` — product spec; reference for intent, not for current implementation
- `README.md` — user-facing docs

## Build / verify commands

```bash
npm install                # frontend deps
npm run lint               # eslint (frontend)
npm run build              # typecheck + Vite production build
npm run tauri dev          # dev: Vite + Rust, hot-reload
npm run tauri build        # release: produces installer/.app in src-tauri/target/release/bundle/
```

Rust-only:

```bash
cd src-tauri && cargo check
cd src-tauri && cargo build --release
```

## Conventions

- **Tauri commands** are registered in `src-tauri/src/lib.rs` `invoke_handler!` macro. Adding a new command requires: Rust fn in the relevant module, register it in `lib.rs`, call from frontend via `invoke()`.
- **Frontend state** lives in `App.tsx` (root). Components receive props, no internal global state. Persistence via `@tauri-apps/plugin-store`.
- **TypeScript types** for Tauri payloads: `src/types.ts`.
- **Icons:** `lucide-react`. Do not add another icon lib.
- **Editor:** `@uiw/react-codemirror` + `@codemirror/lang-*` packages. Use `vscode` theme from `@uiw/codemirror-theme-vscode`.
- **Styling:** inline `style={{}}` props + `App.css` / `index.css`. No Tailwind, no CSS-in-JS lib.
- **Crate names:** main = `tux`, lib = `tux_lib`. Rust code refers to the lib as `tux_lib::…`.
- **Tauri identifier:** `dev.tux.app`. Don't change without intent — affects bundle metadata and user data paths.

## Gotchas

- **`src-tauri/Cargo.lock`** regenerates on `cargo build`. Don't hand-edit it.
- **`src-tauri/target/`** is build output, gitignored. Do not lint/check/format inside it. `eslint.config.js` currently does not ignore it; if you re-run `npm run lint` expect spurious errors from generated `.js` files in `src-tauri/target/`. These are not real errors.
- **Pre-existing lint errors** in `src/App.tsx`, `src/GitViewer.tsx`, `src/TerminalPane.tsx` (any-types, setState-in-effect, unused vars). Not introduced by recent changes — fix only when touching that code, not as drive-by cleanups.
- **Tauri capability allowlist** is strict. New plugin features require permission entries in `src-tauri/capabilities/default.json`.
- **`App.tsx` line 24** hardcodes `explorerRoot` to `/Users/user`. This is a placeholder, not a bug to mass-fix — replace when implementing project-root selection.
- **PTY metadata** (cwd, process name, git branch) is polled by a background thread in `pty.rs`. If terminal metadata looks stale, check the polling interval and shell PID detection.
- **React 19 + `@tauri-apps/api` 2.x**: use `invoke` from `@tauri-apps/api/core` (not the deprecated `@tauri-apps/api/tauri`).

## When asked to "build the app"

```bash
npm run tauri build
```

Output: `src-tauri/target/release/bundle/{macos,dmg,deb,rpm,msi,...}/...`. On macOS the `.app` is in `bundle/macos/Tux.app`; the `.dmg` is in `bundle/dmg/`.

A full release build from cold takes several minutes (Rust compile). If the user just wants to run it locally, prefer `npm run tauri dev`.

## Git

- Default branch: check with `git status` / `git remote -v`.
- Commit style: conventional commits, short subject. Use the `caveman-commit` skill if available.
- Do not commit secrets. There are none in this repo currently.
