use git2::{Repository, StatusOptions};
use serde::Serialize;
use tauri::command;

#[derive(Serialize)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String,
}

#[derive(Serialize)]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub time: i64,
}

#[derive(Serialize)]
pub struct GitBranch {
    pub name: String,
    pub is_head: bool,
}

#[command]
pub fn get_git_status(path: String) -> Result<Vec<GitFileStatus>, String> {
    let repo = Repository::discover(&path).map_err(|e| e.to_string())?;

    let mut opts = StatusOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true);

    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;
    let mut result = Vec::new();

    for entry in statuses.iter() {
        if let Some(path) = entry.path() {
            let status = entry.status();
            let status_str = if status.is_wt_new() || status.is_index_new() {
                "Added"
            } else if status.is_wt_modified() || status.is_index_modified() {
                "Modified"
            } else if status.is_wt_deleted() || status.is_index_deleted() {
                "Deleted"
            } else {
                "Unknown"
            };

            result.push(GitFileStatus {
                path: path.to_string(),
                status: status_str.to_string(),
            });
        }
    }

    Ok(result)
}

#[command]
pub fn get_git_branch(path: String) -> Result<GitBranch, String> {
    let repo = Repository::discover(&path).map_err(|e| e.to_string())?;
    let head = repo.head().map_err(|e| e.to_string())?;
    let branch_name = if let Some(name) = head.shorthand() {
        name.to_string()
    } else {
        "HEAD".to_string()
    };
    Ok(GitBranch {
        name: branch_name,
        is_head: true,
    })
}

#[command]
pub fn get_git_diff(path: String) -> Result<String, String> {
    // Use git command for proper unified diff - shows both staged and unstaged
    let output = std::process::Command::new("git")
        .args(["diff", "HEAD"])  // unstaged
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;
    
    let output2 = std::process::Command::new("git")
        .args(["diff", "--cached", "HEAD"])  // staged
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;

    let mut diff_text = String::new();
    
    // Add unstaged changes
    let unstaged = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
    if !unstaged.is_empty() {
        diff_text.push_str(&unstaged);
    }
    
    // Add staged changes
    let staged = String::from_utf8(output2.stdout).map_err(|e| e.to_string())?;
    if !staged.is_empty() {
        if !diff_text.is_empty() {
            diff_text.push('\n');
        }
        diff_text.push_str(&staged);
    }
    
    Ok(diff_text)
}

#[command]
pub fn git_show_file(path: String, file_path: String) -> Result<String, String> {
    let repo = Repository::discover(&path).map_err(|e| e.to_string())?;
    
    // Get the head commit
    let head = repo.head().map_err(|e| e.to_string())?;
    let head_oid = head.target().ok_or("No HEAD commit")?;
    
    // Get the tree from the commit
    let commit = repo.find_commit(head_oid).map_err(|e| e.to_string())?;
    let tree = commit.tree().map_err(|e| e.to_string())?;
    
    // Try to find the file in the tree
    let file_path_clean = file_path.trim_start_matches("./");
    match tree.get_path(std::path::Path::new(file_path_clean)) {
        Ok(entry) => {
            let blob = repo.find_blob(entry.id()).map_err(|e| e.to_string())?;
            Ok(String::from_utf8(blob.content().to_vec()).unwrap_or_default())
        }
        Err(_) => {
            // File doesn't exist in HEAD (new file)
            Ok(String::new())
        }
    }
}

#[command]
pub fn get_git_commits(path: String) -> Result<Vec<GitCommit>, String> {
    let repo = Repository::discover(&path).map_err(|e| e.to_string())?;
    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    revwalk.push_head().map_err(|e| e.to_string())?;
    revwalk.set_sorting(git2::Sort::TIME).map_err(|e| e.to_string())?;

    let mut commits = Vec::new();
    for oid in revwalk.take(50) {
        let oid = oid.map_err(|e| e.to_string())?;
        let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
        let time = commit.time().seconds();
        commits.push(GitCommit {
            hash: format!("{}", commit.id()),
            short_hash: format!("{:.7}", commit.id()),
            message: commit.summary().unwrap_or("No message").to_string(),
            author: commit.author().name().unwrap_or("Unknown").to_string(),
            time,
        });
    }
    Ok(commits)
}
