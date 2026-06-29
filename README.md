# Tux

A fast, terminal-first desktop workspace combining multi-session terminals, lightweight editing, and git-aware workflows in one compact UI.

Tux sits between a traditional terminal emulator and a full IDE — keyboard-driven, native, and built for developers who live in the shell and use AI coding agents.

## Status

**Early development (v0.1.0).** Functional prototype with sessions, embedded PTY terminal, file explorer, code editor, and git integration. See `PRD.md` for the full product spec.

## Features

- **Multi-session terminals** — isolated PTY-backed sessions, each with its own cwd, git context, and foreground process
- **Resizable split layout** — terminal and editor side-by-side, drag to resize
- **Lightweight code editor** — CodeMirror 6, syntax highlighting for HTML/CSS/JS/TS/JSON/Markdown
- **File explorer** — tree view with hidden-file toggle
- **Git integration** — branch display, changed-files list, diff viewer
- **Session persistence** — sessions and layout restore on relaunch (via `tauri-plugin-store`)

## Stack

| Layer | Tech |
|---|---|
| Shell | [Tauri](https://tauri.app/) 2.x |
| Frontend | React 19 + TypeScript + Vite |
| Editor | CodeMirror 6 (`@uiw/react-codemirror`) |
| Terminal | Rust `portable-pty` |
| Git | `git2-rs` |
| State | Tauri store plugin |

## Project Structure

```
.
├── src/                  # React frontend
│   ├── App.tsx           # Root layout + state
│   ├── Sidebar.tsx       # Sessions / Explorer / Git tabs
│   ├── TerminalPane.tsx  # PTY-backed terminal UI
│   ├── EditorPane.tsx    # CodeMirror editor
│   ├── DiffPane.tsx      # Git diff viewer
│   ├── FileTree.tsx
│   ├── GitViewer.tsx
│   └── types.ts
├── src-tauri/            # Rust backend
│   ├── src/
│   │   ├── lib.rs        # Tauri builder + command registry
│   │   ├── pty.rs        # PTY spawn/io/metadata
│   │   ├── fs.rs         # File system commands
│   │   └── git.rs        # Git status/branch/diff/log
│   ├── capabilities/
│   │   └── default.json  # Tauri permission allowlist
│   ├── tauri.conf.json   # Bundle config (productName, identifier, window)
│   └── Cargo.toml
├── PRD.md                # Full product requirements
└── AGENTS.md             # Agent-facing project guide
```

## Development

Prerequisites: Node 20+, Rust stable (1.77.2+), Tauri CLI deps for your OS ([guide](https://tauri.app/start/prerequisites/)).

```bash
npm install
npm run tauri dev      # Dev: Vite + Rust, hot-reload
```

## Build

```bash
npm run tauri build    # Release .app (macOS) / .msi (Windows) / .AppImage / .deb (Linux)
```

Artifacts land in `src-tauri/target/release/bundle/`.

## Configuration

- **Bundle identifier:** `dev.tux.app` (`src-tauri/tauri.conf.json`)
- **Window title:** `Tux`
- **Tauri capabilities** (plugin permissions): `src-tauri/capabilities/default.json`

## License

Private project. License TBD.
