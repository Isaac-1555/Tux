use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem, MasterPty};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::process::Command;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

pub struct PtyInstance {
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
    pub child_pid: Option<u32>,
    pub cwd: Arc<Mutex<String>>,
    pub process_name: Arc<Mutex<String>>,
    pub git_branch: Arc<Mutex<Option<String>>>,
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

// Parse OSC 7: \x1b]7;file://host/path\x07
fn parse_osc7(data: &[u8]) -> Option<String> {
    let mut i = 0;
    while i < data.len() {
        // Find ESC
        if data[i] == 0x1b && i + 2 < data.len() && data[i+1] == b']' && data[i+2] == b'7' {
            // Found OSC 7, now find the path
            let start = i + 3;
            if start < data.len() && data[start] == b';' {
                let path_start = start + 1;
                // Find terminator (BEL 0x07 or ST 0x1b 0x5c)
                let mut end = path_start;
                while end < data.len() {
                    if data[end] == 0x07 {
                        break;
                    }
                    if data[end] == 0x1b && end + 1 < data.len() && data[end+1] == b'\\' {
                        break;
                    }
                    end += 1;
                }
                let path_bytes = &data[path_start..end];
                let path_str = String::from_utf8_lossy(path_bytes);
                
                // Parse file://host/path
                if let Some(stripped) = path_str.strip_prefix("file://") {
                    // Remove host if present
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

/// Get the foreground process name for a shell PID.
/// Walks the process tree to find the deepest child (the actual running command).
/// Falls back to the shell name if no children are found.
#[cfg(not(target_os = "windows"))]
fn get_foreground_process_name(shell_pid: u32) -> Option<String> {
    // Find deepest child process by walking the tree
    let mut current_pid = shell_pid;
    loop {
        // Get children of current process
        let output = Command::new("pgrep")
            .args(["-P", &current_pid.to_string()])
            .output()
            .ok()?;
        
        if !output.status.success() {
            break;
        }
        
        let children_str = String::from_utf8_lossy(&output.stdout);
        let children: Vec<u32> = children_str
            .split_whitespace()
            .filter_map(|s| s.parse().ok())
            .collect();
        
        if children.is_empty() {
            break;
        }
        
        // Take the first (usually only) child
        current_pid = children[0];
    }
    
    // If we're still at the shell PID, no foreground process running
    if current_pid == shell_pid {
        return None;
    }
    
    // Get the process name via ps
    let output = Command::new("ps")
        .args(["-o", "comm=", "-p", &current_pid.to_string()])
        .output()
        .ok()?;
    
    if !output.status.success() {
        return None;
    }
    
    let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if name.is_empty() {
        return None;
    }
    
    // Extract just the binary name (strip path)
    let basename = name.rsplit('/').next().unwrap_or(&name).to_string();
    Some(basename)
}

#[cfg(target_os = "windows")]
fn get_foreground_process_name(_shell_pid: u32) -> Option<String> {
    None
}

/// Get the current working directory of a process by PID.
/// Uses lsof on macOS/Linux to read the CWD file descriptor.
#[cfg(not(target_os = "windows"))]
fn get_process_cwd(pid: u32) -> Option<String> {
    // lsof -a -d cwd -p PID -Fn gives us the cwd
    let output = Command::new("lsof")
        .args(["-a", "-d", "cwd", "-p", &pid.to_string(), "-Fn"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8_lossy(&output.stdout);
    // Output format: "p<pid>\nn<path>\n"
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
fn get_process_cwd(_pid: u32) -> Option<String> {
    None
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

    let cmd = CommandBuilder::new(&shell_name);

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let child_pid = child.process_id();
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    // Use actual home directory
    let home_dir = std::env::var("HOME")
        .unwrap_or_else(|_| "/tmp".to_string());

    // Default process name is the shell basename
    let default_name = shell_name.rsplit('/').next().unwrap_or(&shell_name).to_string();

    let cwd: Arc<Mutex<String>> = Arc::new(Mutex::new(home_dir));
    let process_name: Arc<Mutex<String>> = Arc::new(Mutex::new(default_name.clone()));
    let git_branch: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));

    let state = app_handle.state::<PtyState>();
    state.instances.lock().unwrap().insert(id.clone(), PtyInstance {
        master: pair.master,
        writer,
        child_pid,
        cwd: cwd.clone(),
        process_name: process_name.clone(),
        git_branch: git_branch.clone(),
    });

    let id_clone = id.clone();
    let cwd_clone = cwd.clone();
    let app_clone = app_handle.clone();
    
    // Reader thread with OSC 7 parsing
    std::thread::spawn(move || {
        let mut buf = [0; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = &buf[..n];
                    
                    // Check for OSC 7
                    if let Some(new_cwd) = parse_osc7(data) {
                        let mut cwd_guard = cwd_clone.lock().unwrap();
                        if *cwd_guard != new_cwd {
                            *cwd_guard = new_cwd.clone();
                            let _ = app_clone.emit(&format!("pty-cwd-changed-{}", id_clone), new_cwd);
                        }
                    }
                    
                    // Forward data to frontend
                    let _ = app_clone.emit(&format!("pty-data-{}", id_clone), data.to_vec());
                }
                Err(_) => break,
            }
        }
    });

    // Metadata polling thread (git branch + foreground process name + CWD)
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

            // Poll CWD from the shell process (works even without OSC 7)
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

            // Detect foreground process name
            if let Some(pid) = child_pid {
                let new_name = get_foreground_process_name(pid)
                    .unwrap_or_else(|| default_name.clone());
                let mut name_guard = process_name_clone.lock().unwrap();
                if *name_guard != new_name {
                    *name_guard = new_name;
                    changed = true;
                }
            }

            // Get git branch
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
