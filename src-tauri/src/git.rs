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
