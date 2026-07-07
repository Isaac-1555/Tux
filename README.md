# Tux

Terminal-first desktop workspace. Multi-session PTYs, lightweight editor, git-aware UI. Native, keyboard-driven, built for shell-first developers and AI coding agents.

## Status

Early development (v0.1.0). Functional: sessions, embedded terminal, file explorer, code editor, git integration, keymap customization, window-state persistence. See `PRD.md` for product spec.

## Features

- **Multi-session terminals** — isolated PTY-backed sessions, each with own cwd, git context, and foreground process.
- **Login shell by default** — every PTY spawns with `-l`/`-Login` so macOS `path_helper` and `/etc/{profile,zprofile}` populate `PATH`. Tools in `/etc/paths.d/*` resolve without manual setup.
- **Resizable split layout** — terminal and editor side-by-side, drag to resize.
- **Lightweight code editor** — CodeMirror 6, syntax highlighting for HTML/CSS/JS/TS/JSON/Markdown.
- **File explorer** — tree view with hidden-file toggle; syncs to active terminal's cwd.
- **Git integration** — branch display, changed-files list, diff viewer.
- **Shell-integration titles** — terminal tab shows live command + branch (OSC 7999).
- **Data-driven keymap** — every shortcut is a `KeymapEntry` in `src/keymap.ts`; user can rebind via settings modal.
- **Session persistence** — sessions restore on relaunch (`@tauri-apps/plugin-store`).
- **Window-state persistence** — size and maximized state persist across launches (`tauri-plugin-window-state`).
- **GPU-accelerated terminal** — xterm.js WebGL renderer with DPR-aware metrics and optional debug overlay.
- **Rich TUI support** — advertises `TERM=xterm-256color`, `COLORTERM=truecolor`, `TERM_PROGRAM=ghostty` so image-capable TUIs (opencode, claude code) render inline graphics via the image addon (SIXEL/iTerm2/kitty).

## Stack

| Layer | Tech |
|---|---|
| Shell | [Tauri](https://tauri.app/) 2.x |
| Frontend | React 19 + TypeScript + Vite |
| Editor | CodeMirror 6 (`@uiw/react-codemirror` + `@uiw/codemirror-theme-vscode`) |
| Terminal renderer | [xterm.js](https://xtermjs.org/) 6 + addons: `fit`, `webgl`, `image`, `web-links` |
| Diff viewer | [`@pierre/diffs`](https://github.com/pierrecmr/diffs) |
| PTY | Rust [`portable-pty`](https://github.com/wez/wezterm/tree/main/pty) 0.9 |
| Git | [`git2-rs`](https://github.com/rust-lang/git2-rs) 0.20 |
| State | `@tauri-apps/plugin-store` |
| Window state | `tauri-plugin-window-state` |
| Icons | `lucide-react` |

## Project Structure

```
.
├── src/                       # React frontend
│   ├── App.tsx                # Root layout + state owner
│   ├── Sidebar.tsx            # Sessions / Explorer / Git tabs + keymap settings
│   ├── TerminalPane.tsx       # xterm.js + PTY lifecycle (StrictMode-safe)
│   ├── EditorPane.tsx         # CodeMirror editor
│   ├── DiffPane.tsx           # Diff viewer
│   ├── FileTree.tsx           # Folder tree with git status overlays
│   ├── GitViewer.tsx          # Branch, status, commits
│   ├── KeymapSettings.tsx     # Modal: rebind shortcuts
│   ├── keymap.ts              # DEFAULT_KEYMAP + match/format/conflict
│   ├── keymapStorage.ts       # plugin-store persistence for overrides
│   ├── types.ts               # Tauri payload types
│   └── main.tsx
├── src-tauri/                 # Rust backend
│   ├── src/
│   │   ├── main.rs            # Binary entry
│   │   ├── lib.rs             # Tauri builder + invoke_handler! registry
│   │   ├── pty.rs             # PTY spawn/io, shell integration, metadata polling
│   │   ├── fs.rs              # read_dir, read_file, write_file
│   │   └── git.rs             # status, branch, diff, log, show
│   ├── capabilities/
│   │   └── default.json       # Tauri permission allowlist
│   ├── tauri.conf.json        # Bundle config (productName, identifier, window)
│   └── Cargo.toml
├── PRD.md                     # Full product requirements
├── AGENTS.md                  # Agent-facing project guide
└── README.md
```

## Keyboard Shortcuts

Defaults from `src/keymap.ts`. All rebindable via the keymap settings modal (sidebar gear icon).

| Action | macOS | Linux/Windows |
|---|---|---|
| New terminal | `⌘T` | `Ctrl+T` |
| Focus terminal 1/2/3 | `⌘1` `⌘2` `⌘3` | `Ctrl+1` `Ctrl+2` `Ctrl+3` |
| Toggle sidebar | `⌘B` | `Ctrl+B` |
| Show Terminals tab | `⌘⇧T` | `Ctrl+Shift+T` |
| Show Explorer tab | `⌘⇧E` | `Ctrl+Shift+E` |
| Show Git tab | `⌘E` | `Ctrl+E` |
| Toggle diff pane | `⌘D` | `Ctrl+D` |
| Toggle terminal debug overlay | `Alt+D` (in-pane button) | `Alt+D` |

## Development

Prerequisites: Node 20+, Rust stable (1.77.2+), Tauri CLI deps for your OS — [guide](https://tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev          # Vite + Rust, hot-reload
```

Rust-only checks:

```bash
cd src-tauri && cargo check
cd src-tauri && cargo build --release
```

## Build

```bash
npm run tauri build        # Release .app (macOS) / .msi (Windows) / .AppImage / .deb (Linux)
```

Artifacts land in `src-tauri/target/release/bundle/`. On macOS: `bundle/macos/Tux.app` and `bundle/dmg/Tux_<version>_<arch>.dmg`.

A full release build from cold takes several minutes (Rust compile). For local iteration use `npm run tauri dev`.

## Configuration

- **Bundle identifier:** `dev.tux.app` (`src-tauri/tauri.conf.json`). Do not change without intent — affects bundle metadata and user data paths.
- **Window title:** `Tux`.
- **Store:** `workspace.json` via `@tauri-apps/plugin-store` (terminal sessions, keymap overrides).
- **Window state:** size + maximized, persisted by `tauri-plugin-window-state` to its own file.
- **Tauri capabilities** (plugin permissions): `src-tauri/capabilities/default.json`.
- **Login shell:** hardcoded per shell in `pty.rs:390-428`. Not a config flag.

## Troubleshooting

- **Terminal blank or shows no glyphs** — usually a font load race. The pane awaits `document.fonts.ready` before opening xterm; check the dev tools network panel for font 404s.
- **WebGL renderer unavailable** — `TerminalPane` catches and falls back to canvas. Expect lower FPS on Retina; debug overlay (in-pane `DBG` button) shows DPR + actual render size.
- **Command not found in fresh PTY** — login shell is on by default. If you removed `-l` and need `PATH` populated, either restore the flag or `source /etc/profile` manually.
- **Editor and terminal both open, no space** — drag the divider; minimum pane width is 15% (enforced in `App.tsx`).
- **Git tab empty** — `get_git_status` reads the active terminal's cwd. If that path is not a repo, the panel renders nothing.
- **Keymap override not applied** — overrides save to plugin-store on change; relaunch is not required. If a combo collides, the settings modal shows the conflict inline.

## Roadmap

Implemented (PRD §16 MVP MUST HAVE): sessions, embedded terminal, pane splits, file tree, git status + diff viewer, quick editor, syntax highlighting, workspace restore.

In progress: hunk staging, autosave, fuzzy file search (PRD §16 SHOULD HAVE).

Deferred: LSP, plugins, debugger, AI assistant (PRD §4 non-goals).

See `PRD.md` §17 for the full phased plan.

## License

Private project. License TBD.
