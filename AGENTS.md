# AGENTS.md

Agent-facing guide for working in the Tux codebase. Read this before making non-trivial changes.

## What Tux is

Tauri 2.x desktop app. React 19 + TypeScript frontend, Rust backend. Multi-session PTY terminals, lightweight code editor, git integration, data-driven keymap. Full product context: `PRD.md`.

## Layout

```
src/                            # React frontend
├── App.tsx                     # Root: state owner, IPC listeners, keydown handler
├── Sidebar.tsx                 # Tabs: terminals / explorer / git; settings button
├── TerminalPane.tsx            # xterm.js + PTY lifecycle; StrictMode generation counter
├── EditorPane.tsx              # CodeMirror
├── DiffPane.tsx                # @pierre/diffs viewer
├── FileTree.tsx                # Folder tree with git status overlays
├── GitViewer.tsx               # Branch, status, commits
├── KeymapSettings.tsx          # Modal: rebind shortcuts, conflict detection
├── keymap.ts                   # DEFAULT_KEYMAP, types, match/format/findConflict
├── keymapStorage.ts            # plugin-store persistence for KeymapOverride
└── types.ts                    # FileNode, GitFileStatus, TerminalMeta

src-tauri/                      # Rust backend
├── src/
│   ├── main.rs                 # Binary entry, calls tux_lib::run()
│   ├── lib.rs                  # Tauri builder, invoke_handler! registry
│   ├── pty.rs                  # PTY spawn/io, OSC 7999 shell integration, metadata
│   ├── fs.rs                   # read_dir, read_dir_tree, read_file, write_file
│   └── git.rs                  # status, branch, diff, show, commits
├── capabilities/default.json   # Plugin permission allowlist
├── tauri.conf.json             # Bundle/product/window config
└── Cargo.toml
```

## Build / verify

```bash
npm install                     # frontend deps
npm run lint                    # eslint (frontend)
npm run build                   # typecheck + Vite production build
npm run tauri dev               # Vite + Rust, hot-reload
npm run tauri build             # release → src-tauri/target/release/bundle/
```

Rust-only:

```bash
cd src-tauri && cargo check
cd src-tauri && cargo build --release
```

## Architecture

### IPC

Frontend ↔ backend over Tauri's `invoke()` (request/response) and `listen()` (server-push events).

**Request/response commands** — registered in `src-tauri/src/lib.rs` `invoke_handler!`. Each Rust fn in `pty.rs` / `fs.rs` / `git.rs` is annotated `#[tauri::command]`. Add a new command: implement fn in the right module, register in `lib.rs`, call from frontend via `invoke('name', { ...payload })`.

**Server-push events** — emitted from Rust via `app_handle.emit(channel, payload)`, subscribed from frontend via `listen<T>(channel, handler)`. Channels used:

| Channel | Payload | Emitted from |
|---|---|---|
| `pty-data-{id}` | `number[]` (bytes) | `pty.rs` PTY reader thread, after stripping OSC 7999 |
| `pty-cwd-changed-{id}` | `string` (new cwd) | `pty.rs` on detected cwd change |
| `pty-meta-changed-{id}` | `()` | `pty.rs` polling tick (process name, git branch) |
| `pty-cmd-changed-{id}` | `()` | `pty.rs` on OSC 7999 command-start/end marker |

`{id}` is the per-session terminal id (`term-{epoch_ms}`). Frontend `App.tsx` subscribes per-terminal in a `useEffect`.

### Data flow

1. User creates terminal → `App.tsx` adds `{id}` to `terminals` state → `TerminalPane` mounts → xterm opens → `invoke('spawn_pty', {id, rows, cols})`.
2. Rust spawns PTY (login shell), starts reader thread. Reader emits `pty-data-{id}` for raw bytes (OSC 7999 stripped); metadata poller emits `pty-cmd-changed-{id}` and `pty-meta-changed-{id}` on tick.
3. Frontend `App.tsx` updates `terminalMeta[id]` from these events. Sidebar reads `terminalMeta[activeTerminalId]` for tab labels. Explorer syncs root to `terminalMeta[activeTerminalId].cwd`.
4. Persistence: `terminals` and `keymapOverrides` save to plugin-store on change. Window state saved by `tauri-plugin-window-state` independently.

### Store schema

`workspace.json` (Tauri plugin-store):

| Key | Type | Notes |
|---|---|---|
| `terminals` | `Array<{id: string}>` | One entry per session. Cwd not stored — recovered on relaunch via `get_pty_cwd` (PTY survives relaunch if Rust process is alive; otherwise spawn fresh). |
| *(reserved for keymap)* | `KeymapOverride` | See `keymapStorage.ts` for current key name. |

Window size + maximized state: separate file managed by `tauri-plugin-window-state`. Do not duplicate in plugin-store.

## Conventions

- **Tauri commands:** Rust fn in the right module (`pty.rs` / `fs.rs` / `git.rs`), `#[tauri::command]`, registered in `src-tauri/src/lib.rs` `invoke_handler!`. Frontend calls via `invoke()` from `@tauri-apps/api/core`.
- **Frontend state** lives in `App.tsx` (root). Components receive props, hold no internal global state. Persistence via `@tauri-apps/plugin-store`.
- **TypeScript types** for Tauri payloads: `src/types.ts`.
- **Icons:** `lucide-react`. No other icon lib.
- **Editor:** `@uiw/react-codemirror` + `@codemirror/lang-*` packages. Theme: `vscode` from `@uiw/codemirror-theme-vscode`.
- **Styling:** inline `style={{}}` props + `App.css` / `index.css`. No Tailwind, no CSS-in-JS lib.
- **Crate names:** main = `tux`, lib = `tux_lib`. Rust code uses `tux_lib::…`.
- **Tauri identifier:** `dev.tux.app`. Don't change without intent.
- **React 19 + `@tauri-apps/api` 2.x:** use `invoke` from `@tauri-apps/api/core` (not the deprecated `@tauri-apps/api/tauri`).

## Keymap system

All shortcuts are **data-driven**. Source of truth: `DEFAULT_KEYMAP` in `src/keymap.ts:89-156`.

- Each entry: `{id, action, combo, description, category, payload?}`.
- `KeymapAction` type enumerates valid actions: `addTerminal | focusTerminalN | focusTerminalsTab | focusExplorerTab | focusGitTab | toggleSidebar | toggleDiff`.
- New shortcut: add to `DEFAULT_KEYMAP`, handle in `App.tsx` switch (`case 'actionName':`), register the keymap settings row (auto-derived from the entry).
- Never hardcode a combo inside `App.tsx` — read from `effectiveKeymap(overrides)`.
- User overrides persist via `keymapStorage.ts` → plugin-store. Loaded on app mount, written on change.
- Conflict detection: `findConflict(combo, excludeId, entries)` in `keymap.ts`. Settings modal blocks saving a combo that collides with another action.

## PTY subsystem

`src-tauri/src/pty.rs`. Key design points:

- **All shells spawn as login shell** (`-l` / pwsh `-Login`). See `pty.rs:390-428`. Reason: `path_helper` on macOS runs from `/etc/zprofile`/`/etc/profile`, which only execute for login shells. Without `-l`, the PTY inherits the parent process's minimal PATH and tools in `/usr/local/bin`, Homebrew, `~/.local/bin`, and `/etc/paths.d/*` won't resolve. **Do not strip the `-l` flag without understanding the impact — failures look like generic "command not found" rather than config errors.**
- **Shell integration** via OSC 7999: `init.file` and `init.zsh_dir_path` are the rc files injected by the `shell-integration` crate. They emit markers on command start/end and cwd change. The reader thread strips OSC 7999 from `pty-data` payload, parses markers, and emits `pty-cwd-changed-{id}` and `pty-cmd-changed-{id}`.
- **Metadata polling:** background thread per PTY periodically fetches foreground process name and current git branch; emits `pty-meta-changed-{id}` to wake the frontend (which then re-invokes `get_pty_process_name_cmd` / `get_pty_git_branch`).
- **Teardown:** `close_pty` is the single source of truth for killing a PTY. Frontend `TerminalPane` cleanup calls it fire-and-forget.
- **TERMINFO env:** `TERM=xterm-256color`, `COLORTERM=truecolor`, `TERM_PROGRAM=ghostty`. These make image-capable TUIs (opencode, claude code) detect rich rendering and emit inline graphics (consumed by `@xterm/addon-image`).

## Terminal renderer

`src/TerminalPane.tsx` uses `@xterm/xterm` 6 with:

- `@xterm/addon-fit` — fit cols/rows to container.
- `@xterm/addon-webgl` — GPU renderer with DPR handling. Falls back to canvas if WebGL unavailable (warning logged, terminal still works).
- `@xterm/addon-image` — SIXEL / iTerm2 IIP / kitty TGP. Programs that detect image capability render inline graphics.
- `@xterm/addon-web-links` — clickable URLs, opens via `@tauri-apps/plugin-shell`'s `open()`.

Theme: hardcoded dark (`#1e1e1e` background, `#d4d4d4` foreground). Font: Monaco/Menlo/Courier stack at 14px. No theme system yet.

## Gotchas

- **`src-tauri/Cargo.lock`** regenerates on `cargo build`. Don't hand-edit.
- **`src-tauri/target/`** is build output, gitignored. `eslint.config.js` does not ignore it; re-running `npm run lint` will surface spurious errors from generated `.js` files. Not real errors.
- **Pre-existing lint errors** in `src/App.tsx`, `src/GitViewer.tsx`, `src/TerminalPane.tsx` (any-types, setState-in-effect, unused vars). Not introduced by recent changes — fix only when touching that code, not as drive-by cleanups.
- **Tauri capability allowlist** is strict. New plugin features require permission entries in `src-tauri/capabilities/default.json`.
- **`App.tsx:31` hardcodes `explorerRoot`** to `/Users/user`. Placeholder, not a bug to mass-fix — replace when implementing project-root selection.
- **PTY login-shell mode is load-bearing.** See PTY subsystem above. Removing `cmd.arg("-l")` in `pty.rs` silently breaks tool resolution.
- **Shell integration rc files** (`init.file`, `init.zsh_dir_path`) run *after* the login profile. Order on PTY spawn: profile → integration init → prompt. Don't reorder.
- **React 19 StrictMode PTY race** — `TerminalPane.tsx:21` uses a `generationRef` counter. Each effect run captures `myGen = ++generationRef.current`; after every `await`, an `isStale()` check bails if the effect re-ran. **Critical:** the stale-mount cleanup must NOT call `close_pty` on the live PTY from the newer mount. Cleanup is the single source of PTY teardown — if you add a `close_pty` call to a stale path, you'll race-kill the active terminal in dev. See `TerminalPane.tsx:211-232`.
- **xterm.js `term.dispose()` does not remove DOM children.** Cleanup in `TerminalPane.tsx:225-229` manually clears the container's children; otherwise StrictMode remounts stack two terminals in dev.
- **Container `font.ready` must resolve before xterm opens.** `TerminalPane.tsx:61-68` awaits `document.fonts.ready` and preloads the configured font. Without this, xterm measures the wrong cell size on first paint and produces a one-frame layout glitch.
- **PTY metadata looks stale** — check the polling interval in `pty.rs`. Also: `get_pty_process_name_cmd` returns the foreground child's argv[0] (basename), not the parent shell. If a user's prompt shows the wrong process, check shell PID detection in the metadata thread.
- **Window state persistence** — `tauri-plugin-window-state` writes to its own file. Do not write window size to plugin-store; the two will fight on next launch.

## When asked to "build the app"

```bash
npm run tauri build
```

Output: `src-tauri/target/release/bundle/{macos,dmg,deb,rpm,msi,...}/...`. macOS: `bundle/macos/Tux.app` and `bundle/dmg/Tux_<version>_<arch>.dmg`.

A full release build from cold takes several minutes. If the user just wants to run it locally, prefer `npm run tauri dev`.

## Git

- Default branch: check with `git status` / `git remote -v`.
- Commit style: conventional commits, short subject. Use the `caveman-commit` skill if available.
- Do not commit secrets. There are none in this repo currently.
- Remote: `https://github.com/Isaac-1555/Tux.git`.
