use std::fs;
use serde::Serialize;
use tauri::command;

#[derive(Serialize, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileNode>>,
}

#[command]
pub fn read_dir(path: String) -> Result<Vec<FileNode>, String> {
    let mut nodes = Vec::new();
    let dir = fs::read_dir(&path).map_err(|e| e.to_string())?;

    for entry in dir {
        if let Ok(entry) = entry {
            let file_type = entry.file_type().map_err(|e| e.to_string())?;
            let is_dir = file_type.is_dir();
            let full_path = entry.path();
            nodes.push(FileNode {
                name: entry.file_name().to_string_lossy().to_string(),
                path: full_path.to_string_lossy().to_string(),
                is_dir,
                children: if is_dir { None } else { None }, // Lazy load: None means not loaded yet
            });
        }
    }

    // Sort directories first
    nodes.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name))
    });

    Ok(nodes)
}

#[command]
pub fn read_dir_tree(path: String) -> Result<Vec<FileNode>, String> {
    fn build_tree(path: String) -> Result<Vec<FileNode>, String> {
        let mut nodes = Vec::new();
        let dir = fs::read_dir(&path).map_err(|e| e.to_string())?;

        for entry in dir {
            if let Ok(entry) = entry {
                let file_type = entry.file_type().map_err(|e| e.to_string())?;
                let is_dir = file_type.is_dir();
                let full_path = entry.path();

                let children = if is_dir {
                    Some(build_tree(full_path.to_string_lossy().to_string())?)
                } else {
                    None
                };

                nodes.push(FileNode {
                    name: entry.file_name().to_string_lossy().to_string(),
                    path: full_path.to_string_lossy().to_string(),
                    is_dir,
                    children,
                });
            }
        }

        nodes.sort_by(|a, b| {
            b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name))
        });

        Ok(nodes)
    }

    build_tree(path)
}

#[command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}
