mod pty;
mod fs;
mod git;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(pty::PtyState::new())
    .plugin(tauri_plugin_store::Builder::new().build())
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![
      pty::spawn_pty,
      pty::write_pty,
      pty::resize_pty,
      pty::close_pty,
      pty::get_pty_cwd,
      pty::get_pty_process_name_cmd,
      pty::get_pty_git_branch,
      fs::read_dir,
      fs::read_dir_tree,
      fs::read_file,
      fs::write_file,
      git::get_git_status,
      git::get_git_branch,
      git::get_git_diff,
      git::git_show_file,
      git::get_git_commits,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
