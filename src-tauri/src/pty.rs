use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem, MasterPty};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::Command;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tempfile::{NamedTempFile, TempDir};

pub struct PtyInstance {
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
    pub child_pid: Option<u32>,
    pub cwd: Arc<Mutex<String>>,
    pub process_name: Arc<Mutex<String>>,
    pub git_branch: Arc<Mutex<Option<String>>>,
    pub current_command: Arc<Mutex<String>>,
    _init_file: Option<NamedTempFile>,
    _init_dir: Option<TempDir>,
}

pub struct PtyState {
    pub instances: Arc<Mutex<HashMap<String, PtyInstance>>>,
}

impl PtyState {
    pub fn new() -> Self {
        Self {
            instances: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ShellKind {
    Bash,
    Zsh,
    Fish,
    Pwsh,
    Other,
}

fn detect_shell_kind(shell_path: &str) -> ShellKind {
    let basename = shell_path.rsplit('/').next().unwrap_or(shell_path);
    let lower = basename.to_ascii_lowercase();
    let stem = lower.strip_suffix(".exe").unwrap_or(&lower);
    match stem {
        "bash" => ShellKind::Bash,
        "zsh" => ShellKind::Zsh,
        "fish" => ShellKind::Fish,
        "pwsh" | "powershell" => ShellKind::Pwsh,
        _ => ShellKind::Other,
    }
}

// Parse OSC 7: \x1b]7;file://host/path\x07
fn parse_osc7(data: &[u8]) -> Option<String> {
    let mut i = 0;
    while i < data.len() {
        if data[i] == 0x1b && i + 2 < data.len() && data[i+1] == b']' && data[i+2] == b'7' {
            let start = i + 3;
            if start < data.len() && data[start] == b';' {
                let path_start = start + 1;
                let mut end = path_start;
                while end < data.len() {
                    if data[end] == 0x07 { break; }
                    if data[end] == 0x1b && end + 1 < data.len() && data[end+1] == b'\\' { break; }
                    end += 1;
                }
                let path_bytes = &data[path_start..end];
                let path_str = String::from_utf8_lossy(path_bytes);
                if let Some(stripped) = path_str.strip_prefix("file://") {
                    if let Some(slash_idx) = stripped.find('/') {
                        return Some(stripped[slash_idx..].to_string());
                    }
                } else {
                    return Some(path_str.to_string());
                }
            }
        }
        i += 1;
    }
    None
}

#[allow(dead_code)]
enum OscEvent {
    CommandStart(String),
    CommandEnd(i32),
    PromptStart,
}

// Strip OSC 7999 sequences from data and emit events.
fn parse_osc7999(data: &[u8]) -> (Vec<u8>, Vec<OscEvent>) {
    const PREFIX: &[u8] = b"\x1b]7999;";
    let mut cleaned = Vec::with_capacity(data.len());
    let mut events = Vec::new();
    let mut i = 0;
    while i < data.len() {
        if i + PREFIX.len() <= data.len() && &data[i..i + PREFIX.len()] == PREFIX {
            let payload_start = i + PREFIX.len();
            let mut j = payload_start;
            let mut term_len = 0usize;
            while j < data.len() {
                if data[j] == 0x07 { term_len = 1; break; }
                if data[j] == 0x1b && j + 1 < data.len() && data[j+1] == b'\\' { term_len = 2; break; }
                j += 1;
            }
            if j >= data.len() {
                // Incomplete sequence — drop the prefix bytes, keep the rest
                cleaned.extend_from_slice(&data[i..i + 1]);
                i += 1;
                continue;
            }
            let payload = &data[payload_start..j];
            if let Ok(s) = std::str::from_utf8(payload) {
                if let Some(event) = parse_osc7999_payload(s) {
                    events.push(event);
                }
            }
            i = j + term_len;
        } else {
            cleaned.push(data[i]);
            i += 1;
        }
    }
    (cleaned, events)
}

fn parse_osc7999_payload(s: &str) -> Option<OscEvent> {
    let mut parts = s.splitn(2, ';');
    let kind = parts.next()?;
    let rest = parts.next().unwrap_or("");
    match kind {
        "A" => Some(OscEvent::PromptStart),
        "C" => Some(OscEvent::CommandStart(rest.to_string())),
        "D" => {
            let code = rest.parse::<i32>().unwrap_or(0);
            Some(OscEvent::CommandEnd(code))
        }
        _ => None,
    }
}

// Get git branch for a directory
fn get_git_branch(cwd: &str) -> Option<String> {
    Command::new("git")
        .args(["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[cfg(not(target_os = "windows"))]
fn get_foreground_process_name(shell_pid: u32) -> Option<String> {
    let mut current_pid = shell_pid;
    loop {
        let output = Command::new("pgrep")
            .args(["-P", &current_pid.to_string()])
            .output()
            .ok()?;
        if !output.status.success() { break; }
        let children_str = String::from_utf8_lossy(&output.stdout);
        let children: Vec<u32> = children_str
            .split_whitespace()
            .filter_map(|s| s.parse().ok())
            .collect();
        if children.is_empty() { break; }
        current_pid = children[0];
    }
    if current_pid == shell_pid { return None; }
    let output = Command::new("ps")
        .args(["-o", "args=", "-p", &current_pid.to_string()])
        .output()
        .ok()?;
    if !output.status.success() { return None; }
    let args_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if args_str.is_empty() { return None; }
    let parts: Vec<&str> = args_str.split_whitespace().collect();
    if parts.is_empty() { return None; }
    let cmd = parts[0];
    if cmd.ends_with("node") || cmd.ends_with("/node") {
        for part in &parts[1..] {
            if !part.starts_with('-') {
                let name = part.rsplit('/').next().unwrap_or(part);
                let name = name.strip_suffix(".js").unwrap_or(name);
                return Some(name.to_string());
            }
        }
        return Some("node".to_string());
    }
    cmd.rsplit('/').next().unwrap_or(cmd).to_string().into()
}

#[cfg(target_os = "windows")]
fn get_foreground_process_name(_shell_pid: u32) -> Option<String> { None }

#[cfg(not(target_os = "windows"))]
fn get_process_cwd(pid: u32) -> Option<String> {
    let output = Command::new("lsof")
        .args(["-a", "-d", "cwd", "-p", &pid.to_string(), "-Fn"])
        .output()
        .ok()?;
    if !output.status.success() { return None; }
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        if let Some(path) = line.strip_prefix('n') {
            if !path.is_empty() && path.starts_with('/') {
                return Some(path.to_string());
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn get_process_cwd(_pid: u32) -> Option<String> { None }

// Shell init scripts: source user config first, then register OSC 7999 hooks.
const BASH_INIT: &str = r#"# Tux shell integration
if [ -f "$HOME/.bashrc" ]; then
  source "$HOME/.bashrc"
fi
__tux_preexec() {
  printf '\033]7999;C;%s\007' "${BASH_COMMAND//$'\n'/ }"
}
__tux_precmd() {
  printf '\033]7999;A\007'
}
trap '__tux_preexec' DEBUG
PROMPT_COMMAND="__tux_precmd${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
"#;

const ZSH_INIT: &str = r#"# Tux shell integration
if [ -f "$HOME/.zshrc" ]; then
  source "$HOME/.zshrc"
fi
autoload -U add-zsh-hook 2>/dev/null
__tux_preexec() {
  printf '\033]7999;C;%s\007' "${1//$'\n'/ }"
}
__tux_precmd() {
  printf '\033]7999;A\007'
}
add-zsh-hook preexec __tux_preexec 2>/dev/null
add-zsh-hook precmd __tux_precmd 2>/dev/null
"#;

const FISH_INIT: &str = r#"# Tux shell integration
source $HOME/.config/fish/config.fish 2>/dev/null
function __tux_preexec --on-event fish_preexec
  printf '\033]7999;C;%s\007' (string join ' ' -- $argv)
end
function __tux_postexec --on-event fish_postexec
  printf '\033]7999;D;%s\007' $status
end
function __tux_prompt --on-event fish_prompt
  printf '\033]7999;A\007'
end
"#;

const POWERSHELL_INIT: &str = r#"# Tux shell integration
$global:__tux_origPrompt = $function:prompt
if (Test-Path $PROFILE) {
  . $PROFILE
}
$global:__tux_lastCmd = ""
function global:prompt {
  $h = Get-History -Count 1 -ErrorAction SilentlyContinue
  if ($h) {
    $cmd = $h.CommandLine -replace "[\r\n]", " "
    if ($cmd -ne $global:__tux_lastCmd) {
      [Console]::Write("`e]7999;C;$cmd`a")
      [Console]::Write("`e]7999;D;$LASTEXITCODE`a")
      $global:__tux_lastCmd = $cmd
    }
  } else {
    [Console]::Write("`e]7999;A`a")
  }
  if ($global:__tux_origPrompt) { & $global:__tux_origPrompt }
}
"#;

struct InitArtifacts {
    file: Option<NamedTempFile>,
    dir: Option<TempDir>,
    zsh_dir_path: Option<PathBuf>,
}

fn write_init_script(kind: ShellKind) -> Result<InitArtifacts, String> {
    let (script, ext) = match kind {
        ShellKind::Bash => (BASH_INIT, "sh"),
        ShellKind::Zsh => (ZSH_INIT, "zsh"),
        ShellKind::Fish => (FISH_INIT, "fish"),
        ShellKind::Pwsh => (POWERSHELL_INIT, "ps1"),
        ShellKind::Other => return Ok(InitArtifacts { file: None, dir: None, zsh_dir_path: None }),
    };

    if kind == ShellKind::Zsh {
        // zsh sources $ZDOTDIR/.zshrc. We create a temp dir with our own
        // .zshrc that sources the user's first, then registers hooks.
        let dir = TempDir::new().map_err(|e| format!("tempdir: {e}"))?;
        let zshrc_path = dir.path().join(".zshrc");
        std::fs::write(&zshrc_path, script).map_err(|e| format!("write zshrc: {e}"))?;
        // .zshenv must exist in ZDOTDIR or zsh will refuse. We make a no-op
        // one so the user's env-loading still happens (we re-source it).
        let zshenv_path = dir.path().join(".zshenv");
        std::fs::write(&zshenv_path, format!("source \"$HOME/.zshenv\" 2>/dev/null\n"))
            .map_err(|e| format!("write zshenv: {e}"))?;
        let zsh_profile = dir.path().join(".zprofile");
        std::fs::write(&zsh_profile, format!("source \"$HOME/.zprofile\" 2>/dev/null\n"))
            .map_err(|e| format!("write zprofile: {e}"))?;
        let zsh_login = dir.path().join(".zlogin");
        std::fs::write(&zsh_login, format!("source \"$HOME/.zlogin\" 2>/dev/null\n"))
            .map_err(|e| format!("write zlogin: {e}"))?;
        let zsh_logout = dir.path().join(".zlogout");
        std::fs::write(&zsh_logout, format!("source \"$HOME/.zlogout\" 2>/dev/null\n"))
            .map_err(|e| format!("write zlogout: {e}"))?;
        return Ok(InitArtifacts {
            file: None,
            dir: Some(dir),
            zsh_dir_path: Some(zshrc_path.parent().unwrap().to_path_buf()),
        });
    }

    // Other shells: write a single init file.
    let suffix = match ext {
        "sh" | "zsh" => Some(".sh"),
        "fish" => Some(".fish"),
        "ps1" => Some(".ps1"),
        _ => None,
    };
    let mut builder = tempfile::Builder::new();
    if let Some(s) = suffix { builder.suffix(s); }
    let tmp = builder
        .tempfile()
        .map_err(|e| format!("tempfile: {e}"))?;
    std::fs::write(tmp.path(), script).map_err(|e| format!("write init: {e}"))?;
    Ok(InitArtifacts {
        file: Some(tmp),
        dir: None,
        zsh_dir_path: None,
    })
}

#[tauri::command]
pub fn spawn_pty(id: String, rows: u16, cols: u16, app_handle: AppHandle) -> Result<(), String> {
    let pty_system = NativePtySystem::default();
    let pair = pty_system.openpty(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    }).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    let shell_name = "cmd.exe".to_string();
    #[cfg(not(target_os = "windows"))]
    let shell_name = std::env::var("SHELL").unwrap_or_else(|_| "bash".to_string());

    let shell_kind = detect_shell_kind(&shell_name);
    let init = write_init_script(shell_kind)?;

    let mut cmd = CommandBuilder::new(&shell_name);
    cmd.env("TERM", "xterm-256color");
    cmd.env("TERM_PROGRAM", "ghostty");
    cmd.env("TERM_PROGRAM_VERSION", env!("CARGO_PKG_VERSION"));
    cmd.env("COLORTERM", "truecolor");

    let utf8_locale = std::env::var("LC_ALL")
        .or_else(|_| std::env::var("LANG"))
        .ok()
        .filter(|v| v.to_uppercase().contains("UTF-8"))
        .unwrap_or_else(|| "en_US.UTF-8".to_string());
    cmd.env("LC_ALL", &utf8_locale);
    cmd.env("LANG", &utf8_locale);
    cmd.env("LC_CTYPE", &utf8_locale);

    // Inject shell integration.
    match shell_kind {
        ShellKind::Bash => {
            if let Some(f) = init.file.as_ref() {
                cmd.arg("--rcfile");
                cmd.arg(f.path().to_string_lossy().to_string());
            }
        }
        ShellKind::Zsh => {
            if let Some(p) = init.zsh_dir_path.as_ref() {
                cmd.env("ZDOTDIR", p.to_string_lossy().to_string());
            }
        }
        ShellKind::Fish => {
            if let Some(f) = init.file.as_ref() {
                cmd.arg("-C");
                let path = f.path().to_string_lossy();
                cmd.arg(format!("source \"{}\"", path));
            }
        }
        ShellKind::Pwsh => {
            if let Some(f) = init.file.as_ref() {
                cmd.arg("-NoExit");
                let path = f.path().to_string_lossy();
                cmd.arg("-Command");
                cmd.arg(format!(". \"{}\"", path));
            }
        }
        ShellKind::Other => {}
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let child_pid = child.process_id();
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let home_dir = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let default_name = shell_name.rsplit('/').next().unwrap_or(&shell_name).to_string();

    let cwd: Arc<Mutex<String>> = Arc::new(Mutex::new(home_dir));
    let process_name: Arc<Mutex<String>> = Arc::new(Mutex::new(default_name.clone()));
    let git_branch: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let current_command: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));

    let state = app_handle.state::<PtyState>();
    state.instances.lock().unwrap().insert(id.clone(), PtyInstance {
        master: pair.master,
        writer,
        child_pid,
        cwd: cwd.clone(),
        process_name: process_name.clone(),
        git_branch: git_branch.clone(),
        current_command: current_command.clone(),
        _init_file: init.file,
        _init_dir: init.dir,
    });

    let id_clone = id.clone();
    let cwd_clone = cwd.clone();
    let app_clone = app_handle.clone();

    std::thread::spawn(move || {
        let mut buf = [0; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = &buf[..n];

                    if let Some(new_cwd) = parse_osc7(data) {
                        let mut cwd_guard = cwd_clone.lock().unwrap();
                        if *cwd_guard != new_cwd {
                            *cwd_guard = new_cwd.clone();
                            let _ = app_clone.emit(&format!("pty-cwd-changed-{}", id_clone), new_cwd);
                        }
                    }

                    let (cleaned, events) = parse_osc7999(data);
                    let mut cmd_changed = false;
                    for ev in events {
                        match ev {
                            OscEvent::CommandStart(text) => {
                                let mut g = current_command.lock().unwrap();
                                if *g != text {
                                    *g = text;
                                    cmd_changed = true;
                                }
                            }
                            OscEvent::CommandEnd(_) => {
                                let mut g = current_command.lock().unwrap();
                                if !g.is_empty() {
                                    *g = String::new();
                                    cmd_changed = true;
                                }
                            }
                            OscEvent::PromptStart => {}
                        }
                    }
                    if cmd_changed {
                        let _ = app_clone.emit(&format!("pty-cmd-changed-{}", id_clone), ());
                    }

                    let _ = app_clone.emit(&format!("pty-data-{}", id_clone), cleaned);
                }
                Err(_) => break,
            }
        }
    });

    let id_clone2 = id.clone();
    let cwd_clone2 = cwd.clone();
    let process_name_clone = process_name.clone();
    let git_branch_clone = git_branch.clone();
    let app_clone2 = app_handle.clone();

    thread::spawn(move || {
        loop {
            thread::sleep(Duration::from_secs(2));

            let mut changed = false;
            let mut cwd_changed = false;

            if let Some(pid) = child_pid {
                if let Some(new_cwd) = get_process_cwd(pid) {
                    let mut cwd_guard = cwd_clone2.lock().unwrap();
                    if *cwd_guard != new_cwd {
                        *cwd_guard = new_cwd.clone();
                        cwd_changed = true;
                        let _ = app_clone2.emit(&format!("pty-cwd-changed-{}", id_clone2), new_cwd);
                    }
                }
            }

            if let Some(pid) = child_pid {
                let new_name = get_foreground_process_name(pid)
                    .unwrap_or_else(|| default_name.clone());
                let mut name_guard = process_name_clone.lock().unwrap();
                if *name_guard != new_name {
                    *name_guard = new_name;
                    changed = true;
                }
            }

            let cwd_val = cwd_clone2.lock().unwrap().clone();
            if let Some(branch) = get_git_branch(&cwd_val) {
                let mut branch_guard = git_branch_clone.lock().unwrap();
                if branch_guard.as_ref() != Some(&branch) {
                    *branch_guard = Some(branch);
                    changed = true;
                }
            } else {
                let mut branch_guard = git_branch_clone.lock().unwrap();
                if branch_guard.is_some() {
                    *branch_guard = None;
                    changed = true;
                }
            }

            if changed || cwd_changed {
                let _ = app_clone2.emit(&format!("pty-meta-changed-{}", id_clone2), ());
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn write_pty(id: String, data: Vec<u8>, state: State<'_, PtyState>) -> Result<(), String> {
    if let Some(instance) = state.instances.lock().unwrap().get_mut(&id) {
        let _ = instance.writer.write_all(&data);
        let _ = instance.writer.flush();
    }
    Ok(())
}

#[tauri::command]
pub fn resize_pty(id: String, rows: u16, cols: u16, state: State<'_, PtyState>) -> Result<(), String> {
    if let Some(instance) = state.instances.lock().unwrap().get_mut(&id) {
        let _ = instance.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        });
    }
    Ok(())
}

#[tauri::command]
pub fn get_pty_cwd(id: String, state: State<'_, PtyState>) -> Result<String, String> {
    state.instances.lock().unwrap()
        .get(&id)
        .map(|i| i.cwd.lock().unwrap().clone())
        .ok_or_else(|| "PTY not found".to_string())
}

#[tauri::command]
pub fn get_pty_process_name_cmd(id: String, state: State<'_, PtyState>) -> Result<String, String> {
    state.instances.lock().unwrap()
        .get(&id)
        .map(|i| i.process_name.lock().unwrap().clone())
        .ok_or_else(|| "PTY not found".to_string())
}

#[tauri::command]
pub fn get_pty_git_branch(id: String, state: State<'_, PtyState>) -> Result<Option<String>, String> {
    state.instances.lock().unwrap()
        .get(&id)
        .map(|i| i.git_branch.lock().unwrap().clone())
        .ok_or_else(|| "PTY not found".to_string())
}

#[tauri::command]
pub fn get_pty_current_command(id: String, state: State<'_, PtyState>) -> Result<String, String> {
    state.instances.lock().unwrap()
        .get(&id)
        .map(|i| i.current_command.lock().unwrap().clone())
        .ok_or_else(|| "PTY not found".to_string())
}

#[tauri::command]
pub fn close_pty(id: String, state: State<'_, PtyState>) -> Result<(), String> {
    let mut instances = state.instances.lock().unwrap();
    if let Some(instance) = instances.remove(&id) {
        if let Some(pid) = instance.child_pid {
            let _ = Command::new("kill")
                .args(["-9", &pid.to_string()])
                .output();
        }
        // Dropping instance drops _init_file and _init_dir, deleting temp
        // files from disk automatically via tempfile's RAII cleanup.
    }
    Ok(())
}
