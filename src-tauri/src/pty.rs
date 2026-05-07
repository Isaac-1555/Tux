use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem, MasterPty};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::io::{Read, Write};
use tauri::{AppHandle, Emitter, Manager, State};

pub struct PtyInstance {
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
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
    let cmd = CommandBuilder::new("cmd.exe");
    #[cfg(not(target_os = "windows"))]
    let cmd = CommandBuilder::new(std::env::var("SHELL").unwrap_or_else(|_| "bash".to_string()));

    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let state = app_handle.state::<PtyState>();
    state.instances.lock().unwrap().insert(id.clone(), PtyInstance {
        master: pair.master,
        writer,
    });

    let id_clone = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // Process died
                Ok(n) => {
                    let data = buf[..n].to_vec();
                    // emit byte array. Tauri can emit vectors.
                    let _ = app_handle.emit(&format!("pty-data-{}", id_clone), data);
                }
                Err(_) => break,
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
