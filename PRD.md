# Product Requirements Document (PRD)
## Project: Multi-Session Terminal IDE
### Working Name: "Tux"
---

# 1. Overview

Tux is a desktop application built in Rust that combines:

- Multi-session terminal management
- Lightweight code editing
- Git-aware workflows
- File exploration
- Split-pane terminal + diff viewing
- Embedded terminal rendering powered by Ghostty

The goal is to create a fast, developer-focused terminal workspace that sits between:

- a traditional terminal emulator
- a lightweight IDE
- a git-aware coding workspace

The product should feel:

- fast
- minimal
- keyboard-driven
- native
- highly responsive
- optimized for developers working in repositories and AI-assisted workflows

---

# 2. Vision

Create a terminal-native development workspace where developers can:

- manage multiple isolated terminal sessions
- browse files and git changes
- make quick edits without opening a full IDE
- inspect diffs alongside active terminals
- work in a single compact interface

without the overhead of large IDEs like VS Code.

---

# 3. Core Goals

## Primary Goals

### 1. Multi-session development environment
Users can create multiple isolated workspaces/sessions.

Each session contains:
- terminal state
- working directory
- git context
- open files
- pane layout

---

### 2. Integrated lightweight editor
Users can:
- quickly edit files
- inspect diffs
- save changes rapidly
- avoid context switching

The editor is NOT intended to compete with full IDEs.

---

### 3. Git-first workflow
Git should feel native to the interface.

Users should immediately see:
- changed files
- staged/unstaged state
- diffs
- branch info

---

### 4. Native terminal performance
Terminal rendering must feel:
- smooth
- low latency
- GPU accelerated
- production-grade

Ghostty terminal rendering technology will power this experience.

---

# 4. Non-Goals (v1)

The following are explicitly NOT included in v1:

- Full IDE features
- LSP autocomplete
- debugger integration
- plugin marketplace
- collaborative editing
- remote SSH workspaces
- AI coding assistant
- integrated package management
- Docker tooling
- database explorers

---

# 5. Target Users

## Primary Users

### Terminal-first developers
Developers who:
- spend most time in terminal
- use Neovim/Tmux/CLI tooling
- want lightweight workflows

---

### AI-assisted developers
Users working with:
- Claude Code
- OpenAI Codex
- Aider
- terminal agents

who need:
- diff visibility
- quick edits
- multiple sessions

---

### Git-heavy developers
Users constantly:
- reviewing changes
- staging files
- editing configs
- switching branches

---

# 6. User Experience Principles

## 1. Keyboard-first
Every major action should have shortcuts.

Mouse support exists but is secondary.

---

## 2. Fast startup
Target:
- cold start under 2 seconds
- workspace restore under 1 second

---

## 3. Minimal visual noise
UI should feel:
- clean
- dense
- efficient

Inspired by:
- Ghostty
- Warp
- Zed
- LazyGit
- VS Code sidebars

---

## 4. Workspace persistence
Users should be able to quit and reopen without losing context.

---

# 7. Functional Requirements

# 7.1 Session System

## Features

### Create Session
User can:
- create new session
- name session
- assign root directory

---

### Session Sidebar
Left sidebar contains:
- session list
- active session indicator
- git branch label
- session status

---

### Session Persistence
Each session stores:
- cwd
- pane layout
- terminal history
- open files
- git state

---

### Session Actions
User can:
- rename
- duplicate
- close
- reorder
- restore

---

# 7.2 Terminal System

## Core Requirements

### Embedded Terminal
Powered by Ghostty rendering/runtime.

Supports:
- shell execution
- ANSI escape sequences
- interactive CLI apps
- keyboard input
- resizing

---

### Split Terminals
User can:
- split vertically
- split horizontally
- resize panes

---

### Pane Types

A pane may contain:
- terminal
- diff viewer
- editor
- file preview

---

### Terminal Features

#### Required
- scrollback
- copy/paste
- search
- link detection
- color support
- Unicode support

#### Nice-to-have
- terminal tabs
- command history search
- shell integration

---

# 7.3 File Explorer

## Requirements

### Tree View
Display:
- folders
- files
- hidden files (toggle)

---

### Git-aware Tree
Files show:
- modified
- staged
- untracked
- ignored

---

### Interactions
User can:
- open file
- rename
- delete
- create file/folder
- drag reorder (optional)

---

### Search
Basic fuzzy search for:
- filenames
- folders

---

# 7.4 Git Integration

## Git Sidebar

Displays:
- current branch
- ahead/behind count
- changed files

---

## Diff Viewer

User can:
- open diff beside terminal
- inspect changes
- stage hunks
- unstage hunks

---

## Git Operations (v1)

### Required
- stage file
- unstage file
- discard changes
- checkout branch

### Optional
- commit UI
- stash UI

---

# 7.5 Lightweight Editor

## Purpose
Quick edits only.

Not a full IDE.

---

## Requirements

### Editing
Supports:
- typing
- multiline editing
- undo/redo
- find
- replace
- save

---

### Syntax Highlighting
Use:
- Tree-sitter
or
- syntect

Prettier integration for:
- JS
- TS
- JSON
- HTML
- CSS
- Markdown

---

### Editor Tabs
Minimal tab system.

---

### Editor Layout
Editor may open:
- beside terminal
- full pane
- in split view

---

### Editor Features

#### Required
- line numbers
- syntax highlighting
- autosave (optional)
- dirty state indicator

#### Nice-to-have
- minimap
- code folding

---

# 7.6 Diff Viewer

## Requirements

### Side-by-side diff
Display:
- additions
- deletions
- inline highlights

---

### Modes
- unified
- side-by-side

---

### Integration
Can be opened:
- from git tree
- from terminal command
- from editor

---

# 7.7 Layout System

## Dynamic Layouts

Users can:
- resize panes
- split panes
- close panes
- swap pane types

---

## Pane Management
Each pane maintains:
- independent state
- focus
- history

---

# 8. Technical Architecture

# 8.1 Tech Stack

| Layer | Technology |
|---|---|
| Language | Rust |
| UI Framework | Tauri OR egui |
| Terminal Rendering | Ghostty |
| Text Editing | Ropey + Tree-sitter |
| Git | git2-rs |
| Async Runtime | Tokio |
| File Watching | notify |
| State Management | custom reactive state |
| Serialization | serde |

---

# 8.2 Recommended UI Stack

## Preferred: Tauri + Rust Backend

Why:
- modern desktop app
- webview UI flexibility
- easier layout systems
- easier diff/editor rendering

Frontend:
- React
- SolidJS
- Svelte

Backend:
- Rust core engine

---

## Alternative: Native Rust UI

### egui
Pros:
- native
- simpler deployment

Cons:
- harder advanced layouts
- editor implementation harder
- terminal embedding complexity

---

# 8.3 Ghostty Integration

## Requirement
Use Ghostty rendering/runtime for:
- terminal emulation
- rendering
- shell handling

---

## Research Areas
Need investigation into:
- embeddable Ghostty components
- PTY integration
- renderer API access
- pane embedding architecture

---

# 8.4 Process Architecture

## Core Modules

### Session Manager
Handles:
- workspace lifecycle
- persistence

---

### PTY Manager
Handles:
- shell processes
- terminal IO

---

### Layout Engine
Handles:
- pane hierarchy
- resizing
- docking

---

### Git Engine
Handles:
- repository indexing
- diff parsing
- git operations

---

### Editor Engine
Handles:
- text buffers
- syntax trees
- formatting

---

# 9. UX Layout Proposal

```text
+-----------------------------------------------------------+
| Top Bar                                                    |
+----------------+-------------------------+----------------+
| Sessions       | Main Workspace          | Git Panel      |
|                |                         |                |
| Session A      | +-------------------+   | changed.ts     |
| Session B      | | Terminal          |   | config.json    |
| Session C      | +-------------------+   | README.md      |
|                | | Diff / Editor     |   |                |
|                | +-------------------+   |                |
+----------------+-------------------------+----------------+
| Bottom Status Bar                                        |
+-----------------------------------------------------------+
```

---

# 10. Keyboard Shortcuts (Initial)

| Action | Shortcut |
|---|---|
| New Session | Cmd/Ctrl + T |
| Split Pane Vertical | Cmd/Ctrl + D |
| Open File Search | Cmd/Ctrl + P |
| Toggle Git Panel | Cmd/Ctrl + G |
| Open Diff | Cmd/Ctrl + Shift + D |
| Switch Sessions | Cmd/Ctrl + Number |
| Focus Terminal | Esc Esc |
| Save File | Cmd/Ctrl + S |

---

# 11. Performance Requirements

## Startup
- under 2 seconds

## Terminal Latency
- under 16ms render latency target

## Memory
- under 300MB idle target

## Large Repositories
Must handle:
- 100k+ files
- large git histories

---

# 12. Persistence Requirements

Store:
- sessions
- layouts
- recent projects
- open files
- terminal history
- theme preferences

Use:
- SQLite
or
- JSON workspace snapshots

---

# 13. Themes

## v1
- dark mode only
- minimal themes

Potential:
- Ghostty theme compatibility

---

# 14. Security Considerations

## Terminal Isolation
Each session should:
- isolate PTY processes
- avoid accidental cross-session leakage

---

## File Permissions
Respect system permissions.

No elevation system in v1.

---

# 15. Packaging & Distribution

## Platforms
### v1
- macOS
- Linux

### Later
- Windows

---

## Distribution
- GitHub Releases
- Homebrew
- direct downloads

---

# 16. MVP Scope

## MUST HAVE

### Sessions
- create/manage sessions

### Terminal
- embedded Ghostty terminal
- pane splits

### File Explorer
- tree view

### Git
- changed files
- diff viewer

### Editor
- quick editing
- syntax highlighting

### Persistence
- restore workspace

---

## SHOULD HAVE
- fuzzy file search
- hunk staging
- autosave

---

## WON’T HAVE
- LSP
- plugins
- debugger
- AI assistant

---

# 17. Suggested Development Phases

# Phase 1 — Foundation
- app shell
- session model
- Ghostty integration
- PTY management

---

# Phase 2 — Layout Engine
- split panes
- resizing
- focus management

---

# Phase 3 — Workspace Features
- file explorer
- git integration
- diff viewer

---

# Phase 4 — Lightweight Editor
- syntax highlighting
- editing
- prettier integration

---

# Phase 5 — Persistence & Polish
- workspace restore
- themes
- performance optimization

---

# 18. Biggest Technical Risks

## 1. Ghostty Embedding
Biggest unknown.

Need to validate:
- embeddability
- API surface
- renderer integration

---

## 2. Text Editor Complexity
Editors become complicated quickly.

Recommendation:
keep editor intentionally lightweight.

---

## 3. Cross-platform PTY Handling
macOS/Linux differences may introduce complexity.

---

# 19. Success Metrics

## Technical
- <2 second startup
- smooth 60fps rendering
- stable PTY handling

---

## Product
Users can:
- manage projects
- review git changes
- make quick edits
- avoid opening full IDEs

for most terminal-centric workflows.

---

# 20. Recommended Next Step

Before coding the full app:

## Build a Technical Feasibility Prototype

Prototype ONLY:
1. Ghostty embedded terminal
2. pane splitting
3. PTY management
4. basic session persistence

This will validate the hardest architectural problems before investing heavily in editor and git systems.
