use crate::git_watcher::GitWatcherManager;
use crate::pty_manager::PtyManager;
use serde::Serialize;
use std::process::Command;
use tauri::{AppHandle, Manager, State};

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;

#[tauri::command]
pub fn pty_create(
    state: State<'_, PtyManager>,
    app: AppHandle,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
) -> Result<u32, String> {
    state.create(app, cols, rows, cwd)
}

#[tauri::command]
pub fn pty_write(state: State<'_, PtyManager>, pty_id: u32, data: String) -> Result<(), String> {
    let bytes = BASE64
        .decode(&data)
        .map_err(|e| format!("Base64 decode error: {}", e))?;
    state.write(pty_id, &bytes)
}

#[tauri::command]
pub fn pty_resize(
    state: State<'_, PtyManager>,
    pty_id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state.resize(pty_id, cols, rows)
}

#[tauri::command]
pub fn pty_close(state: State<'_, PtyManager>, pty_id: u32) -> Result<(), String> {
    state.close(pty_id)
}

#[tauri::command]
pub fn pty_get_cwd(state: State<'_, PtyManager>, pty_id: u32) -> Result<String, String> {
    state.get_cwd(pty_id)
}

#[tauri::command]
pub fn get_home_dir() -> Result<String, String> {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Could not determine home directory".to_string())
}

#[tauri::command]
pub fn get_default_shell() -> String {
    std::env::var("SHELL")
        .unwrap_or_else(|_| "unknown".to_string())
}

#[derive(Serialize)]
pub struct GitStatus {
    pub is_repo: bool,
    pub branch: String,
    pub changes: u32,
}

#[derive(Serialize)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
}

#[derive(Serialize)]
pub struct GitTag {
    pub name: String,
    pub hash: String,
    pub is_annotated: bool,
    pub tagger: String,
    pub date: String,
    pub message: String,
}

#[derive(Serialize)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String, // "M", "A", "D", "??" etc.
    pub staged: bool,
}

#[derive(Serialize)]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub refs: Vec<String>,
    pub parents: Vec<String>,
    pub author: String,
    pub time_ago: String,
}

#[derive(Serialize)]
pub struct GitInfo {
    pub is_repo: bool,
    pub current_branch: String,
    pub branches: Vec<GitBranch>,
    pub tags: Vec<GitTag>,
    pub log_graph: Vec<String>,
    pub commits: Vec<GitCommit>,
    pub files: Vec<GitFileStatus>,
    pub ahead: u32,
    pub behind: u32,
}

fn run_git(cwd: &str, args: &[&str]) -> Option<String> {
    Command::new("git")
        .args(args)
        .current_dir(cwd)
        .env("PATH", enriched_path())
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
}

#[tauri::command]
pub fn git_status_short(cwd: String) -> GitStatus {
    let is_repo = run_git(&cwd, &["rev-parse", "--is-inside-work-tree"])
        .map(|s| s == "true")
        .unwrap_or(false);

    if !is_repo {
        return GitStatus {
            is_repo: false,
            branch: String::new(),
            changes: 0,
        };
    }

    let branch = run_git(&cwd, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|| "HEAD".to_string());

    let changes = run_git(&cwd, &["status", "--porcelain", "-u"])
        .map(|s| s.lines().count() as u32)
        .unwrap_or(0);

    GitStatus {
        is_repo: true,
        branch,
        changes,
    }
}

#[tauri::command]
pub fn git_info(cwd: String) -> GitInfo {
    let is_repo = run_git(&cwd, &["rev-parse", "--is-inside-work-tree"])
        .map(|s| s == "true")
        .unwrap_or(false);

    if !is_repo {
        return GitInfo {
            is_repo: false,
            current_branch: String::new(),
            branches: vec![],
            tags: vec![],
            log_graph: vec![],
            commits: vec![],
            files: vec![],
            ahead: 0,
            behind: 0,
        };
    }

    // Current branch
    let current_branch = run_git(&cwd, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|| "HEAD".to_string());

    // All branches
    let branches = run_git(&cwd, &["branch", "-a", "--no-color"])
        .unwrap_or_default()
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.contains("->") {
                return None;
            }
            let is_current = trimmed.starts_with("* ");
            let name = trimmed.trim_start_matches("* ").trim().to_string();
            let is_remote = name.starts_with("remotes/");
            let display_name = name
                .strip_prefix("remotes/")
                .unwrap_or(&name)
                .to_string();
            Some(GitBranch {
                name: display_name,
                is_current,
                is_remote,
            })
        })
        .collect();

    // Tags
    let tags = run_git(
        &cwd,
        &[
            "tag",
            "-l",
            "--format=%(refname:short)%x00%(objectname:short)%x00%(objecttype)%x00%(taggername)%x00%(creatordate:relative)%x00%(contents:subject)",
        ],
    )
    .unwrap_or_default()
    .lines()
    .filter_map(|line| {
        let parts: Vec<&str> = line.split('\0').collect();
        if parts.is_empty() || parts[0].is_empty() {
            return None;
        }
        let name = parts[0].to_string();
        let hash = parts.get(1).unwrap_or(&"").to_string();
        let obj_type = parts.get(2).unwrap_or(&"commit");
        let is_annotated = *obj_type == "tag";
        let tagger = parts.get(3).unwrap_or(&"").to_string();
        let date = parts.get(4).unwrap_or(&"").to_string();
        let message = parts.get(5).unwrap_or(&"").to_string();
        Some(GitTag {
            name,
            hash,
            is_annotated,
            tagger,
            date,
            message,
        })
    })
    .collect();

    // Git log graph
    let log_graph = run_git(
        &cwd,
        &[
            "log",
            "--oneline",
            "--graph",
            "--all",
            "--decorate",
            "--color=never",
        ],
    )
    .unwrap_or_default()
    .lines()
    .map(|l| l.to_string())
    .collect();

    // Status (staged + unstaged)
    let files = run_git(&cwd, &["status", "--porcelain", "-u"])
        .unwrap_or_default()
        .lines()
        .filter_map(|line| {
            if line.len() < 3 {
                return None;
            }
            let index_status = &line[0..1];
            let work_status = &line[1..2];
            let path = line[3..].to_string();

            // Determine display status and whether it's staged
            if index_status != " " && index_status != "?" {
                // Has staged changes
                Some(GitFileStatus {
                    path: path.clone(),
                    status: index_status.to_string(),
                    staged: true,
                })
            } else if work_status != " " || index_status == "?" {
                // Unstaged / untracked
                let st = if index_status == "?" {
                    "??".to_string()
                } else {
                    work_status.to_string()
                };
                Some(GitFileStatus {
                    path,
                    status: st,
                    staged: false,
                })
            } else {
                None
            }
        })
        .collect();

    // Ahead / behind
    let (ahead, behind) = run_git(
        &cwd,
        &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
    )
    .map(|s| {
        let parts: Vec<&str> = s.split('\t').collect();
        let a = parts.first().and_then(|v| v.parse().ok()).unwrap_or(0u32);
        let b = parts.get(1).and_then(|v| v.parse().ok()).unwrap_or(0u32);
        (a, b)
    })
    .unwrap_or((0, 0));

    // Structured commits
    let commits = run_git(
        &cwd,
        &[
            "log",
            "--all",
            "--format=%H%x00%h%x00%s%x00%D%x00%P%x00%an%x00%cr",
        ],
    )
    .unwrap_or_default()
    .lines()
    .filter_map(|line| {
        let parts: Vec<&str> = line.split('\0').collect();
        if parts.len() < 7 {
            return None;
        }
        let refs: Vec<String> = parts[3]
            .split(", ")
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect();
        let parents: Vec<String> = parts[4]
            .split(' ')
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect();
        Some(GitCommit {
            hash: parts[0].to_string(),
            short_hash: parts[1].to_string(),
            message: parts[2].to_string(),
            refs,
            parents,
            author: parts[5].to_string(),
            time_ago: parts[6].to_string(),
        })
    })
    .collect();

    GitInfo {
        is_repo: true,
        current_branch,
        branches,
        tags,
        log_graph,
        commits,
        files,
        ahead,
        behind,
    }
}

// ── Docker Commands ──

#[derive(Serialize)]
pub struct DockerPort {
    pub host_ip: String,
    pub host_port: String,
    pub container_port: String,
    pub protocol: String,
}

#[derive(Serialize)]
pub struct DockerContainer {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: String,
    pub state: String,
    pub ports: String,
    pub port_mappings: Vec<DockerPort>,
    pub created: String,
    pub is_project: bool,
}

#[derive(Serialize)]
pub struct DockerImage {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
    pub created: String,
    pub is_project: bool,
}

#[derive(Serialize)]
pub struct DockerVolume {
    pub name: String,
    pub driver: String,
    pub mountpoint: String,
    pub is_project: bool,
}

#[derive(Serialize)]
pub struct DockerInfo {
    pub available: bool,
    pub has_compose: bool,
    pub has_dockerfile: bool,
    pub compose_file: String,
    pub containers: Vec<DockerContainer>,
    pub images: Vec<DockerImage>,
    pub volumes: Vec<DockerVolume>,
    pub project_name: String,
}

/// Build an enriched PATH that includes common install locations.
/// macOS bundled apps inherit a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin),
/// so tools like docker, git, kubectl, etc. won't be found without this.
fn enriched_path() -> String {
    let base = std::env::var("PATH").unwrap_or_default();
    let home = std::env::var("HOME").unwrap_or_default();
    let extras = [
        format!("{home}/.cargo/bin"),
        "/opt/homebrew/bin".into(),
        "/opt/homebrew/sbin".into(),
        "/usr/local/bin".into(),
        "/usr/local/sbin".into(),
        format!("{home}/.local/bin"),
        format!("{home}/.nvm/versions/node/default/bin"),
        "/usr/local/go/bin".into(),
        format!("{home}/go/bin"),
    ];
    let mut parts: Vec<String> = extras.into_iter().collect();
    parts.push(base);
    parts.join(":")
}

fn run_cmd(cmd: &str, args: &[&str]) -> Option<String> {
    Command::new(cmd)
        .args(args)
        .env("PATH", enriched_path())
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
}

/// Parse Docker port strings like "0.0.0.0:8080->80/tcp, :::8080->80/tcp"
fn parse_docker_ports(ports: &str) -> Vec<DockerPort> {
    if ports.is_empty() {
        return vec![];
    }
    ports
        .split(", ")
        .filter_map(|entry| {
            // Format: "host_ip:host_port->container_port/proto" or "container_port/proto"
            if let Some(arrow_pos) = entry.find("->") {
                let host_part = &entry[..arrow_pos];
                let container_part = &entry[arrow_pos + 2..];
                let (container_port, protocol) = if let Some(slash) = container_part.rfind('/') {
                    (&container_part[..slash], &container_part[slash + 1..])
                } else {
                    (container_part, "tcp")
                };
                // host_part is "ip:port"
                let (host_ip, host_port) = if let Some(colon) = host_part.rfind(':') {
                    (&host_part[..colon], &host_part[colon + 1..])
                } else {
                    ("", host_part)
                };
                Some(DockerPort {
                    host_ip: host_ip.to_string(),
                    host_port: host_port.to_string(),
                    container_port: container_port.to_string(),
                    protocol: protocol.to_string(),
                })
            } else {
                // Just "port/proto" (exposed but not mapped)
                let (container_port, protocol) = if let Some(slash) = entry.rfind('/') {
                    (&entry[..slash], &entry[slash + 1..])
                } else {
                    (entry, "tcp")
                };
                Some(DockerPort {
                    host_ip: String::new(),
                    host_port: String::new(),
                    container_port: container_port.to_string(),
                    protocol: protocol.to_string(),
                })
            }
        })
        .collect()
}


/// Directories to skip when recursively scanning for container/k8s files
const SKIP_DIRS: &[&str] = &[
    "node_modules", ".git", "vendor", "target", "dist", "build",
    ".next", "__pycache__", ".venv", "venv", ".tox", ".eggs",
    "coverage", ".nyc_output", ".cache", ".gradle", ".m2",
    "bower_components", ".terraform",
];

/// Recursively find files matching given names, skipping sub-git repos and large dirs.
/// Returns relative paths from `root`. Max depth to avoid runaway scanning.
fn find_files_recursive(root: &std::path::Path, names: &[&str], max_depth: u32) -> Vec<String> {
    let mut results = Vec::new();
    find_files_walk(root, root, names, 0, max_depth, &mut results);
    results
}

fn find_files_walk(
    root: &std::path::Path,
    dir: &std::path::Path,
    names: &[&str],
    depth: u32,
    max_depth: u32,
    results: &mut Vec<String>,
) {
    if depth > max_depth {
        return;
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = match entry.file_name().into_string() {
            Ok(n) => n,
            Err(_) => continue,
        };

        if path.is_dir() {
            // Skip sub-git repos (directories that have their own .git)
            if depth > 0 && path.join(".git").exists() {
                continue;
            }
            // Skip known large/irrelevant directories
            if SKIP_DIRS.contains(&file_name.as_str()) {
                continue;
            }
            find_files_walk(root, &path, names, depth + 1, max_depth, results);
        } else {
            // Check if filename matches any pattern
            let name_lower = file_name.to_lowercase();
            for pattern in names {
                if name_lower == pattern.to_lowercase() {
                    let rel = path.strip_prefix(root).unwrap_or(&path);
                    results.push(rel.to_string_lossy().to_string());
                    break;
                }
            }
        }
    }
}

#[tauri::command]
pub fn docker_info(cwd: String) -> DockerInfo {
    // Check if docker is available
    let available = run_cmd("docker", &["version", "--format", "{{.Server.Version}}"]).is_some();

    if !available {
        return DockerInfo {
            available: false,
            has_compose: false,
            has_dockerfile: false,
            compose_file: String::new(),
            containers: vec![],
            images: vec![],
            volumes: vec![],
            project_name: String::new(),
        };
    }

    // Recursively detect docker files (skip sub-git repos)
    let cwd_path = std::path::Path::new(&cwd);
    let docker_file_names = [
        "docker-compose.yml", "docker-compose.yaml",
        "compose.yml", "compose.yaml",
        "Dockerfile", "dockerfile",
    ];
    let found_docker_files = find_files_recursive(cwd_path, &docker_file_names, 5);

    // First compose file found (prefer root-level)
    let compose_file = found_docker_files
        .iter()
        .find(|f| {
            let name = f.rsplit('/').next().unwrap_or(f).to_lowercase();
            name.contains("compose")
        })
        .cloned()
        .unwrap_or_default();
    let has_compose = !compose_file.is_empty();

    let has_dockerfile = found_docker_files
        .iter()
        .any(|f| {
            let name = f.rsplit('/').next().unwrap_or(f).to_lowercase();
            name == "dockerfile"
        });

    // Derive project name from folder
    let project_name = std::path::Path::new(&cwd)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "");

    // Get project container IDs (by compose label) for ownership detection
    let project_container_ids: std::collections::HashSet<String> = if has_compose {
        let filter_label = format!("label=com.docker.compose.project={}", project_name);
        run_cmd("docker", &["ps", "-a", "--format", "{{.ID}}", "--filter", &filter_label])
            .unwrap_or_default()
            .lines()
            .map(|l| l.chars().take(12).collect::<String>())
            .collect()
    } else {
        std::collections::HashSet::new()
    };

    // Get ALL containers
    let all_containers: Vec<DockerContainer> = run_cmd(
        "docker",
        &["ps", "-a", "--format", "{{.ID}}\\t{{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.State}}\\t{{.Ports}}\\t{{.CreatedAt}}"],
    )
    .unwrap_or_default()
    .lines()
    .filter_map(|line| {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 7 { return None; }
        let id: String = parts[0].chars().take(12).collect();
        let ports_str = parts[5].to_string();
        let port_mappings = parse_docker_ports(&ports_str);
        let is_project = project_container_ids.contains(&id);
        Some(DockerContainer {
            id,
            name: parts[1].to_string(),
            image: parts[2].to_string(),
            status: parts[3].to_string(),
            state: parts[4].to_string(),
            ports: ports_str,
            port_mappings,
            created: parts[6].to_string(),
            is_project,
        })
    })
    .collect();

    // Collect images used by project containers for ownership tagging
    let project_images: std::collections::HashSet<String> = all_containers
        .iter()
        .filter(|c| c.is_project)
        .map(|c| c.image.clone())
        .collect();

    // Sort containers: project-owned first
    let mut containers = all_containers;
    containers.sort_by(|a, b| b.is_project.cmp(&a.is_project));

    // Get ALL images
    let mut images: Vec<DockerImage> = run_cmd(
        "docker",
        &["images", "--format", "{{.ID}}\\t{{.Repository}}\\t{{.Tag}}\\t{{.Size}}\\t{{.CreatedSince}}"],
    )
    .unwrap_or_default()
    .lines()
    .filter_map(|line| {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 5 { return None; }
        let repo = parts[1].to_string();
        let tag = parts[2].to_string();
        let full_ref = if tag != "<none>" {
            format!("{}:{}", repo, tag)
        } else {
            repo.clone()
        };
        let is_project = project_images.contains(&full_ref)
            || project_images.contains(&repo)
            || (has_compose && repo.contains(&project_name));
        Some(DockerImage {
            id: parts[0].chars().take(12).collect(),
            repository: repo,
            tag,
            size: parts[3].to_string(),
            created: parts[4].to_string(),
            is_project,
        })
    })
    .collect();
    images.sort_by(|a, b| b.is_project.cmp(&a.is_project));

    // Get ALL volumes
    let mut volumes: Vec<DockerVolume> = run_cmd(
        "docker",
        &["volume", "ls", "--format", "{{.Name}}\\t{{.Driver}}\\t{{.Mountpoint}}"],
    )
    .unwrap_or_default()
    .lines()
    .filter_map(|line| {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 3 { return None; }
        let name = parts[0].to_string();
        let is_project = has_compose && (
            name.starts_with(&format!("{}_", project_name))
            || name.starts_with(&format!("{}-", project_name))
            || name.contains(&project_name)
        );
        Some(DockerVolume {
            name,
            driver: parts[1].to_string(),
            mountpoint: parts[2].to_string(),
            is_project,
        })
    })
    .collect();
    volumes.sort_by(|a, b| b.is_project.cmp(&a.is_project));

    DockerInfo {
        available,
        has_compose,
        has_dockerfile,
        compose_file,
        containers,
        images,
        volumes,
        project_name,
    }
}

#[tauri::command]
pub fn docker_container_stop(container_id: String) -> Result<String, String> {
    Command::new("docker")
        .args(["stop", &container_id])
        .env("PATH", enriched_path())
        .output()
        .map_err(|e| e.to_string())
        .and_then(|o| {
            if o.status.success() {
                Ok(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                Err(String::from_utf8_lossy(&o.stderr).trim().to_string())
            }
        })
}

#[tauri::command]
pub fn docker_container_restart(container_id: String) -> Result<String, String> {
    Command::new("docker")
        .args(["restart", &container_id])
        .env("PATH", enriched_path())
        .output()
        .map_err(|e| e.to_string())
        .and_then(|o| {
            if o.status.success() {
                Ok(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                Err(String::from_utf8_lossy(&o.stderr).trim().to_string())
            }
        })
}

#[tauri::command]
pub fn docker_container_remove(container_id: String, force: bool) -> Result<String, String> {
    let mut args = vec!["rm"];
    if force {
        args.push("-f");
    }
    args.push(&container_id);
    Command::new("docker")
        .args(&args)
        .env("PATH", enriched_path())
        .output()
        .map_err(|e| e.to_string())
        .and_then(|o| {
            if o.status.success() {
                Ok(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                Err(String::from_utf8_lossy(&o.stderr).trim().to_string())
            }
        })
}

#[tauri::command]
pub fn docker_image_remove(image_id: String, force: bool) -> Result<String, String> {
    let mut args = vec!["rmi"];
    if force {
        args.push("-f");
    }
    args.push(&image_id);
    Command::new("docker")
        .args(&args)
        .env("PATH", enriched_path())
        .output()
        .map_err(|e| e.to_string())
        .and_then(|o| {
            if o.status.success() {
                Ok(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                Err(String::from_utf8_lossy(&o.stderr).trim().to_string())
            }
        })
}

#[tauri::command]
pub fn docker_container_logs(container_id: String, tail: Option<u32>) -> Result<String, String> {
    let tail_str = tail.unwrap_or(200).to_string();
    Command::new("docker")
        .args(["logs", "--tail", &tail_str, "--timestamps", &container_id])
        .env("PATH", enriched_path())
        .output()
        .map_err(|e| e.to_string())
        .and_then(|o| {
            if o.status.success() {
                // docker logs can output to both stdout and stderr
                let stdout = String::from_utf8_lossy(&o.stdout);
                let stderr = String::from_utf8_lossy(&o.stderr);
                let mut combined = stdout.to_string();
                if !stderr.is_empty() {
                    if !combined.is_empty() {
                        combined.push('\n');
                    }
                    combined.push_str(&stderr);
                }
                Ok(combined)
            } else {
                Err(String::from_utf8_lossy(&o.stderr).trim().to_string())
            }
        })
}

// ── System Commands ──

#[derive(Serialize)]
pub struct FolderEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: String,
}

#[derive(Serialize)]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}

#[derive(Serialize)]
pub struct EnvFile {
    pub path: String,
    pub vars: Vec<EnvVar>,
}

#[derive(Serialize)]
pub struct ProjectTool {
    pub name: String,
    pub category: String, // "package_manager", "language", "linter", "framework", "build", "ci"
    pub config_file: String,
    pub version: String,
}

#[derive(Serialize)]
pub struct PackageDep {
    pub name: String,
    pub version: String,
    pub dep_type: String, // "dependencies", "devDependencies", "require", "require-dev", etc.
}

#[derive(Serialize)]
pub struct PackageManager {
    pub name: String,
    pub config_file: String,
    pub packages: Vec<PackageDep>,
}

#[derive(Serialize)]
pub struct ProjectCommand {
    pub name: String,
    pub command: String,
    pub source: String, // "Makefile", "package.json", "Taskfile", "justfile", "composer.json", "Cargo.toml", "pyproject.toml"
}

#[derive(Serialize)]
pub struct SystemInfo {
    pub cwd: String,
    pub folder_size: String,
    pub file_count: u32,
    pub dir_count: u32,
    pub entries: Vec<FolderEntry>,
    pub env_vars: Vec<EnvVar>,
    pub env_files: Vec<EnvFile>,
    pub os_name: String,
    pub os_version: String,
    pub hostname: String,
    pub shell: String,
    pub detected_tools: Vec<ProjectTool>,
    pub package_managers: Vec<PackageManager>,
    pub commands: Vec<ProjectCommand>,
}

#[tauri::command]
pub fn system_info(cwd: String) -> SystemInfo {
    let cwd_path = std::path::Path::new(&cwd);

    // Folder entries
    let mut entries: Vec<FolderEntry> = Vec::new();
    let mut file_count = 0u32;
    let mut dir_count = 0u32;

    if let Ok(read_dir) = std::fs::read_dir(cwd_path) {
        for entry in read_dir.flatten() {
            let meta = entry.metadata().ok();
            let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
            let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let modified = meta
                .as_ref()
                .and_then(|m| m.modified().ok())
                .and_then(|t| {
                    t.duration_since(std::time::UNIX_EPOCH)
                        .ok()
                        .map(|d| {
                            let secs = d.as_secs();
                            let now = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_secs();
                            let diff = now.saturating_sub(secs);
                            if diff < 60 {
                                format!("{}s ago", diff)
                            } else if diff < 3600 {
                                format!("{}m ago", diff / 60)
                            } else if diff < 86400 {
                                format!("{}h ago", diff / 3600)
                            } else {
                                format!("{}d ago", diff / 86400)
                            }
                        })
                })
                .unwrap_or_default();

            let name = entry.file_name().to_string_lossy().to_string();
            if is_dir {
                dir_count += 1;
            } else {
                file_count += 1;
            }
            entries.push(FolderEntry {
                name,
                is_dir,
                size,
                modified,
            });
        }
    }

    // Sort: dirs first, then by name
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    // Folder size via du
    let folder_size = run_cmd("du", &["-sh", &cwd])
        .map(|s| s.split('\t').next().unwrap_or("").trim().to_string())
        .unwrap_or_else(|| "—".to_string());

    // Environment variables (useful subset)
    let env_keys = [
        "PATH", "HOME", "USER", "SHELL", "TERM", "LANG", "EDITOR",
        "NODE_ENV", "RUST_LOG", "GOPATH", "JAVA_HOME", "PYTHON",
        "VIRTUAL_ENV", "CONDA_DEFAULT_ENV", "NVM_DIR", "CARGO_HOME",
        "XDG_CONFIG_HOME", "XDG_DATA_HOME",
    ];
    let env_vars: Vec<EnvVar> = env_keys
        .iter()
        .filter_map(|key| {
            std::env::var(key).ok().map(|value| EnvVar {
                key: key.to_string(),
                value,
            })
        })
        .collect();

    // Recursively find .env files
    let mut env_files: Vec<EnvFile> = Vec::new();
    fn find_env_files(dir: &std::path::Path, base: &std::path::Path, results: &mut Vec<EnvFile>, depth: u8) {
        if depth > 4 { return; } // limit recursion depth
        let Ok(read_dir) = std::fs::read_dir(dir) else { return };
        for entry in read_dir.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();

            // Skip common large/irrelevant directories
            if path.is_dir() {
                if matches!(name.as_str(), "node_modules" | ".git" | "vendor" | "target" | "dist" | "build" | ".next" | "__pycache__" | ".venv" | "venv") {
                    continue;
                }
                find_env_files(&path, base, results, depth + 1);
                continue;
            }

            // Match env file patterns
            let lower = name.to_lowercase();
            let is_env = lower == ".env"
                || lower.starts_with(".env.")
                || lower.ends_with(".env")
                || lower.ends_with(".env.example")
                || lower.ends_with(".env.local")
                || lower.ends_with(".env.sample")
                || lower.contains(".env.");

            if !is_env { continue; }

            let rel_path = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().to_string();
            let mut vars = Vec::new();
            if let Ok(content) = std::fs::read_to_string(&path) {
                for line in content.lines() {
                    let line = line.trim();
                    if line.is_empty() || line.starts_with('#') {
                        continue;
                    }
                    if let Some((key, value)) = line.split_once('=') {
                        vars.push(EnvVar {
                            key: key.trim().to_string(),
                            value: value.trim().trim_matches('"').trim_matches('\'').to_string(),
                        });
                    }
                }
            }
            results.push(EnvFile {
                path: rel_path,
                vars,
            });
        }
    }
    find_env_files(cwd_path, cwd_path, &mut env_files, 0);
    // Sort: .env first, then alphabetically
    env_files.sort_by(|a, b| {
        let a_is_root = !a.path.contains('/');
        let b_is_root = !b.path.contains('/');
        b_is_root.cmp(&a_is_root).then_with(|| a.path.cmp(&b.path))
    });

    // ── Project detection ──
    let mut detected_tools: Vec<ProjectTool> = Vec::new();
    let mut package_managers: Vec<PackageManager> = Vec::new();

    // Helper: check if a file exists and return its content
    let read_file = |name: &str| -> Option<String> {
        let p = cwd_path.join(name);
        if p.exists() {
            std::fs::read_to_string(&p).ok()
        } else {
            None
        }
    };

    let exists = |name: &str| -> bool { cwd_path.join(name).exists() };

    // -- npm / Node.js --
    if let Some(content) = read_file("package.json") {
        let version = serde_json::from_str::<serde_json::Value>(&content)
            .ok()
            .and_then(|v| v["version"].as_str().map(|s| s.to_string()))
            .unwrap_or_default();

        detected_tools.push(ProjectTool {
            name: "Node.js".into(),
            category: "language".into(),
            config_file: "package.json".into(),
            version: version.clone(),
        });

        // Parse packages
        let mut pkgs: Vec<PackageDep> = Vec::new();
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            for dep_type in &[
                "dependencies",
                "devDependencies",
                "peerDependencies",
                "optionalDependencies",
            ] {
                if let Some(deps) = val[dep_type].as_object() {
                    for (name, ver) in deps {
                        pkgs.push(PackageDep {
                            name: name.clone(),
                            version: ver.as_str().unwrap_or("").to_string(),
                            dep_type: dep_type.to_string(),
                        });
                    }
                }
            }
            // Detect scripts as tools
            if let Some(scripts) = val["scripts"].as_object() {
                if scripts.contains_key("lint") || scripts.contains_key("eslint") {
                    detected_tools.push(ProjectTool {
                        name: "ESLint".into(),
                        category: "linter".into(),
                        config_file: "package.json scripts".into(),
                        version: String::new(),
                    });
                }
                if scripts.contains_key("test") {
                    detected_tools.push(ProjectTool {
                        name: "Tests".into(),
                        category: "build".into(),
                        config_file: "package.json scripts".into(),
                        version: String::new(),
                    });
                }
            }
        }

        let lock_file = if exists("yarn.lock") {
            detected_tools.push(ProjectTool {
                name: "Yarn".into(),
                category: "package_manager".into(),
                config_file: "yarn.lock".into(),
                version: String::new(),
            });
            "yarn.lock"
        } else if exists("pnpm-lock.yaml") {
            detected_tools.push(ProjectTool {
                name: "pnpm".into(),
                category: "package_manager".into(),
                config_file: "pnpm-lock.yaml".into(),
                version: String::new(),
            });
            "pnpm-lock.yaml"
        } else if exists("bun.lockb") || exists("bun.lock") {
            detected_tools.push(ProjectTool {
                name: "Bun".into(),
                category: "package_manager".into(),
                config_file: "bun.lockb".into(),
                version: String::new(),
            });
            "bun.lockb"
        } else {
            detected_tools.push(ProjectTool {
                name: "npm".into(),
                category: "package_manager".into(),
                config_file: "package-lock.json".into(),
                version: String::new(),
            });
            "package-lock.json"
        };

        package_managers.push(PackageManager {
            name: if lock_file == "yarn.lock" { "yarn" } else if lock_file == "pnpm-lock.yaml" { "pnpm" } else if lock_file.starts_with("bun") { "bun" } else { "npm" }.to_string(),
            config_file: "package.json".into(),
            packages: pkgs,
        });
    }

    // -- Cargo / Rust --
    if let Some(content) = read_file("Cargo.toml") {
        let version = content
            .lines()
            .find(|l| l.starts_with("version"))
            .and_then(|l| l.split('=').nth(1))
            .map(|v| v.trim().trim_matches('"').to_string())
            .unwrap_or_default();

        detected_tools.push(ProjectTool {
            name: "Rust / Cargo".into(),
            category: "language".into(),
            config_file: "Cargo.toml".into(),
            version,
        });

        let mut pkgs: Vec<PackageDep> = Vec::new();
        let mut current_section = String::new();
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with('[') && trimmed.ends_with(']') {
                current_section = trimmed[1..trimmed.len() - 1].to_string();
            } else if (current_section == "dependencies"
                || current_section == "dev-dependencies"
                || current_section == "build-dependencies")
                && trimmed.contains('=')
            {
                let parts: Vec<&str> = trimmed.splitn(2, '=').collect();
                if parts.len() == 2 {
                    let name = parts[0].trim().to_string();
                    let ver = parts[1].trim().trim_matches('"').to_string();
                    // Skip inline tables like { version = "..." }
                    let display_ver = if ver.starts_with('{') {
                        ver.split('"')
                            .nth(1)
                            .unwrap_or(&ver)
                            .to_string()
                    } else {
                        ver
                    };
                    pkgs.push(PackageDep {
                        name,
                        version: display_ver,
                        dep_type: current_section.clone(),
                    });
                }
            }
        }
        package_managers.push(PackageManager {
            name: "cargo".into(),
            config_file: "Cargo.toml".into(),
            packages: pkgs,
        });
    }

    // -- Composer / PHP --
    if let Some(content) = read_file("composer.json") {
        detected_tools.push(ProjectTool {
            name: "PHP / Composer".into(),
            category: "language".into(),
            config_file: "composer.json".into(),
            version: String::new(),
        });

        let mut pkgs: Vec<PackageDep> = Vec::new();
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            for dep_type in &["require", "require-dev"] {
                if let Some(deps) = val[dep_type].as_object() {
                    for (name, ver) in deps {
                        pkgs.push(PackageDep {
                            name: name.clone(),
                            version: ver.as_str().unwrap_or("").to_string(),
                            dep_type: dep_type.to_string(),
                        });
                    }
                }
            }
        }
        package_managers.push(PackageManager {
            name: "composer".into(),
            config_file: "composer.json".into(),
            packages: pkgs,
        });
    }

    // -- Python --
    if let Some(content) = read_file("pyproject.toml") {
        detected_tools.push(ProjectTool {
            name: "Python".into(),
            category: "language".into(),
            config_file: "pyproject.toml".into(),
            version: String::new(),
        });
        let mut pkgs: Vec<PackageDep> = Vec::new();
        let mut in_deps = false;
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed == "[project.dependencies]" || trimmed == "[tool.poetry.dependencies]" {
                in_deps = true;
                continue;
            }
            if trimmed.starts_with('[') {
                in_deps = false;
                continue;
            }
            if in_deps && !trimmed.is_empty() && !trimmed.starts_with('#') {
                if trimmed.contains('=') {
                    let parts: Vec<&str> = trimmed.splitn(2, '=').collect();
                    pkgs.push(PackageDep {
                        name: parts[0].trim().to_string(),
                        version: parts.get(1).unwrap_or(&"").trim().trim_matches('"').to_string(),
                        dep_type: "dependencies".into(),
                    });
                } else if trimmed.starts_with('"') || trimmed.starts_with('\'') {
                    // Array-style dependency like "requests>=2.0"
                    let clean = trimmed.trim_matches(|c| c == '"' || c == '\'' || c == ',');
                    pkgs.push(PackageDep {
                        name: clean.to_string(),
                        version: String::new(),
                        dep_type: "dependencies".into(),
                    });
                }
            }
        }
        package_managers.push(PackageManager {
            name: "python".into(),
            config_file: "pyproject.toml".into(),
            packages: pkgs,
        });
    } else if let Some(content) = read_file("requirements.txt") {
        detected_tools.push(ProjectTool {
            name: "Python (pip)".into(),
            category: "language".into(),
            config_file: "requirements.txt".into(),
            version: String::new(),
        });
        let pkgs: Vec<PackageDep> = content
            .lines()
            .filter(|l| !l.trim().is_empty() && !l.starts_with('#'))
            .map(|l| {
                let parts: Vec<&str> = l.splitn(2, |c| c == '=' || c == '>' || c == '<' || c == '!').collect();
                PackageDep {
                    name: parts[0].trim().to_string(),
                    version: if parts.len() > 1 { l[parts[0].len()..].to_string() } else { String::new() },
                    dep_type: "dependencies".into(),
                }
            })
            .collect();
        package_managers.push(PackageManager {
            name: "pip".into(),
            config_file: "requirements.txt".into(),
            packages: pkgs,
        });
    }

    // -- Go --
    if let Some(content) = read_file("go.mod") {
        let go_ver = content
            .lines()
            .find(|l| l.starts_with("go "))
            .map(|l| l.trim_start_matches("go ").trim().to_string())
            .unwrap_or_default();

        detected_tools.push(ProjectTool {
            name: "Go".into(),
            category: "language".into(),
            config_file: "go.mod".into(),
            version: go_ver,
        });

        let mut pkgs: Vec<PackageDep> = Vec::new();
        let mut in_require = false;
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed == "require (" {
                in_require = true;
                continue;
            }
            if trimmed == ")" {
                in_require = false;
                continue;
            }
            if in_require && !trimmed.is_empty() && !trimmed.starts_with("//") {
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                if parts.len() >= 2 {
                    pkgs.push(PackageDep {
                        name: parts[0].to_string(),
                        version: parts[1].to_string(),
                        dep_type: "require".into(),
                    });
                }
            }
        }
        package_managers.push(PackageManager {
            name: "go".into(),
            config_file: "go.mod".into(),
            packages: pkgs,
        });
    }

    // -- Ruby / Bundler --
    if exists("Gemfile") {
        detected_tools.push(ProjectTool {
            name: "Ruby / Bundler".into(),
            category: "language".into(),
            config_file: "Gemfile".into(),
            version: String::new(),
        });
    }

    // -- Linters & formatters --
    let linter_files = [
        (".eslintrc", "ESLint", "linter"),
        (".eslintrc.js", "ESLint", "linter"),
        (".eslintrc.json", "ESLint", "linter"),
        (".eslintrc.yml", "ESLint", "linter"),
        ("eslint.config.js", "ESLint", "linter"),
        ("eslint.config.mjs", "ESLint", "linter"),
        (".prettierrc", "Prettier", "linter"),
        (".prettierrc.json", "Prettier", "linter"),
        ("prettier.config.js", "Prettier", "linter"),
        (".stylelintrc", "Stylelint", "linter"),
        ("biome.json", "Biome", "linter"),
        (".rubocop.yml", "RuboCop", "linter"),
        ("phpstan.neon", "PHPStan", "linter"),
        (".php-cs-fixer.php", "PHP CS Fixer", "linter"),
        ("rustfmt.toml", "rustfmt", "linter"),
        (".golangci.yml", "golangci-lint", "linter"),
        ("mypy.ini", "mypy", "linter"),
        (".flake8", "flake8", "linter"),
        ("ruff.toml", "Ruff", "linter"),
    ];
    let mut seen_tools = std::collections::HashSet::new();
    for (file, name, cat) in &linter_files {
        if exists(file) && seen_tools.insert(*name) {
            detected_tools.push(ProjectTool {
                name: name.to_string(),
                category: cat.to_string(),
                config_file: file.to_string(),
                version: String::new(),
            });
        }
    }

    // -- Frameworks / build tools --
    let framework_files = [
        ("next.config.js", "Next.js", "framework"),
        ("next.config.mjs", "Next.js", "framework"),
        ("next.config.ts", "Next.js", "framework"),
        ("nuxt.config.ts", "Nuxt", "framework"),
        ("vite.config.ts", "Vite", "build"),
        ("vite.config.js", "Vite", "build"),
        ("webpack.config.js", "Webpack", "build"),
        ("tsconfig.json", "TypeScript", "language"),
        ("tailwind.config.js", "Tailwind CSS", "framework"),
        ("tailwind.config.ts", "Tailwind CSS", "framework"),
        ("turbo.json", "Turborepo", "build"),
        ("nx.json", "Nx", "build"),
        ("Makefile", "Make", "build"),
        ("CMakeLists.txt", "CMake", "build"),
        ("Justfile", "Just", "build"),
    ];
    for (file, name, cat) in &framework_files {
        if exists(file) && seen_tools.insert(*name) {
            detected_tools.push(ProjectTool {
                name: name.to_string(),
                category: cat.to_string(),
                config_file: file.to_string(),
                version: String::new(),
            });
        }
    }

    // -- CI/CD --
    let ci_files = [
        (".github/workflows", "GitHub Actions", "ci"),
        (".gitlab-ci.yml", "GitLab CI", "ci"),
        ("Jenkinsfile", "Jenkins", "ci"),
        (".circleci", "CircleCI", "ci"),
        (".travis.yml", "Travis CI", "ci"),
    ];
    for (file, name, cat) in &ci_files {
        if exists(file) && seen_tools.insert(*name) {
            detected_tools.push(ProjectTool {
                name: name.to_string(),
                category: cat.to_string(),
                config_file: file.to_string(),
                version: String::new(),
            });
        }
    }

    // OS info
    let os_name = std::env::consts::OS.to_string();
    let os_version = run_cmd("sw_vers", &["-productVersion"])
        .or_else(|| run_cmd("uname", &["-r"]))
        .unwrap_or_else(|| "unknown".to_string());
    let hostname = run_cmd("hostname", &[])
        .unwrap_or_else(|| "unknown".to_string());
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "unknown".to_string());

    // ── Project Commands ──
    let mut commands: Vec<ProjectCommand> = Vec::new();

    // -- package.json scripts --
    if let Some(content) = read_file("package.json") {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(scripts) = val["scripts"].as_object() {
                for (name, cmd) in scripts {
                    commands.push(ProjectCommand {
                        name: name.clone(),
                        command: cmd.as_str().unwrap_or("").to_string(),
                        source: "package.json".into(),
                    });
                }
            }
        }
    }

    // -- Makefile targets --
    let makefile_path = if cwd_path.join("Makefile").exists() {
        Some(cwd_path.join("Makefile"))
    } else if cwd_path.join("makefile").exists() {
        Some(cwd_path.join("makefile"))
    } else if cwd_path.join("GNUmakefile").exists() {
        Some(cwd_path.join("GNUmakefile"))
    } else {
        None
    };

    if let Some(mf_path) = makefile_path {
        if let Ok(content) = std::fs::read_to_string(&mf_path) {
            let lines: Vec<&str> = content.lines().collect();
            for (_i, line) in lines.iter().enumerate() {
                if line.starts_with('\t') || line.starts_with(' ') {
                    continue;
                }
                let trimmed = line.trim();
                if trimmed.starts_with('#')
                    || trimmed.starts_with('.')
                    || trimmed.starts_with('-')
                    || trimmed.starts_with('@')
                    || trimmed.is_empty()
                    || trimmed.contains('=')
                    || trimmed.starts_with("if")
                    || trimmed.starts_with("else")
                    || trimmed.starts_with("endif")
                    || trimmed.starts_with("define")
                    || trimmed.starts_with("endef")
                    || trimmed.starts_with("export")
                    || trimmed.starts_with("include")
                {
                    continue;
                }

                if let Some(colon_pos) = trimmed.find(':') {
                    let before_colon = &trimmed[..colon_pos];
                    if before_colon.contains('$')
                        || before_colon.contains('%')
                        || before_colon.contains('/')
                    {
                        continue;
                    }
                    let after_colon = &trimmed[colon_pos + 1..];
                    if after_colon.starts_with('=') || after_colon.starts_with(':') {
                        continue;
                    }
                    let deps = after_colon.trim();
                    for target_name in before_colon.split_whitespace() {
                        let name = target_name.trim().to_string();
                        if name.is_empty() {
                            continue;
                        }
                        commands.push(ProjectCommand {
                            name: format!("make {}", name),
                            command: if deps.is_empty() {
                                String::new()
                            } else {
                                format!("deps: {}", deps)
                            },
                            source: "Makefile".into(),
                        });
                    }
                }
            }
        }
    }

    // -- composer.json scripts --
    if let Some(content) = read_file("composer.json") {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(scripts) = val["scripts"].as_object() {
                for (name, cmd) in scripts {
                    let cmd_str = match cmd {
                        serde_json::Value::String(s) => s.clone(),
                        serde_json::Value::Array(arr) => arr
                            .iter()
                            .filter_map(|v| v.as_str())
                            .collect::<Vec<_>>()
                            .join(" && "),
                        _ => continue,
                    };
                    commands.push(ProjectCommand {
                        name: name.clone(),
                        command: cmd_str,
                        source: "composer.json".into(),
                    });
                }
            }
        }
    }

    // -- Cargo.toml [package.metadata.scripts] or cargo-make Makefile.toml --
    if let Some(content) = read_file("Makefile.toml") {
        // cargo-make: extract [tasks.xxx] names
        for line in content.lines() {
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix("[tasks.") {
                if let Some(name) = rest.strip_suffix(']') {
                    if !name.contains('.') {
                        commands.push(ProjectCommand {
                            name: format!("cargo make {}", name),
                            command: String::new(),
                            source: "Makefile.toml".into(),
                        });
                    }
                }
            }
        }
    }

    // -- justfile --
    if exists("justfile") || exists("Justfile") || exists(".justfile") {
        let jf_path = if cwd_path.join("justfile").exists() {
            cwd_path.join("justfile")
        } else if cwd_path.join("Justfile").exists() {
            cwd_path.join("Justfile")
        } else {
            cwd_path.join(".justfile")
        };
        if let Ok(content) = std::fs::read_to_string(&jf_path) {
            for line in content.lines() {
                // justfile recipes start at column 0, are alphanumeric, and end with ':'
                if line.starts_with(' ') || line.starts_with('\t') || line.starts_with('#') || line.is_empty() {
                    continue;
                }
                if let Some(colon_pos) = line.find(':') {
                    let name = line[..colon_pos].trim();
                    if !name.is_empty()
                        && !name.contains('=')
                        && !name.contains('{')
                        && name.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_')
                    {
                        commands.push(ProjectCommand {
                            name: format!("just {}", name),
                            command: String::new(),
                            source: "justfile".into(),
                        });
                    }
                }
            }
        }
    }

    // -- Taskfile.yml (go-task) --
    if exists("Taskfile.yml") || exists("Taskfile.yaml") || exists("taskfile.yml") {
        let tf_name = if cwd_path.join("Taskfile.yml").exists() {
            "Taskfile.yml"
        } else if cwd_path.join("Taskfile.yaml").exists() {
            "Taskfile.yaml"
        } else {
            "taskfile.yml"
        };
        if let Some(content) = read_file(tf_name) {
            // Simple YAML parsing: find "tasks:" section, then indented task names
            let mut in_tasks = false;
            for line in content.lines() {
                if line.trim() == "tasks:" {
                    in_tasks = true;
                    continue;
                }
                if in_tasks {
                    // Top-level task names are indented by 2 spaces and end with ':'
                    if line.starts_with("  ") && !line.starts_with("    ") {
                        let trimmed = line.trim();
                        if let Some(name) = trimmed.strip_suffix(':') {
                            let name = name.trim();
                            if !name.is_empty() && !name.starts_with('#') {
                                commands.push(ProjectCommand {
                                    name: format!("task {}", name),
                                    command: String::new(),
                                    source: tf_name.into(),
                                });
                            }
                        }
                    }
                    // Exit tasks section if we hit another top-level key
                    if !line.starts_with(' ') && !line.is_empty() && line.trim() != "tasks:" {
                        in_tasks = false;
                    }
                }
            }
        }
    }

    // -- pyproject.toml [tool.poetry.scripts] or [project.scripts] --
    if let Some(content) = read_file("pyproject.toml") {
        let mut in_scripts = false;
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed == "[tool.poetry.scripts]"
                || trimmed == "[project.scripts]"
                || trimmed == "[tool.poe.tasks]"
            {
                in_scripts = true;
                continue;
            }
            if in_scripts {
                if trimmed.starts_with('[') {
                    in_scripts = false;
                    continue;
                }
                if let Some((key, val)) = trimmed.split_once('=') {
                    let key = key.trim();
                    let val = val.trim().trim_matches('"').trim_matches('\'');
                    if !key.is_empty() && !key.starts_with('#') {
                        commands.push(ProjectCommand {
                            name: key.to_string(),
                            command: val.to_string(),
                            source: "pyproject.toml".into(),
                        });
                    }
                }
            }
        }
    }

    SystemInfo {
        cwd: cwd.clone(),
        folder_size,
        file_count,
        dir_count,
        entries,
        env_vars,
        env_files,
        os_name,
        os_version,
        hostname,
        shell,
        detected_tools,
        package_managers,
        commands,
    }
}

// ── Kubernetes Commands ──

#[derive(Serialize)]
pub struct K8sPod {
    pub name: String,
    pub namespace: String,
    pub status: String,
    pub ready: String,
    pub restarts: String,
    pub age: String,
    pub node: String,
    pub is_project: bool,
}

#[derive(Serialize)]
pub struct K8sService {
    pub name: String,
    pub namespace: String,
    pub svc_type: String,
    pub cluster_ip: String,
    pub ports: String,
    pub age: String,
    pub is_project: bool,
}

#[derive(Serialize)]
pub struct K8sDeployment {
    pub name: String,
    pub namespace: String,
    pub ready: String,
    pub up_to_date: String,
    pub available: String,
    pub age: String,
    pub is_project: bool,
}

#[derive(Serialize)]
pub struct K8sInfo {
    pub available: bool,
    pub has_k8s_files: bool,
    pub k8s_files: Vec<String>,
    pub current_context: String,
    pub current_namespace: String,
    pub pods: Vec<K8sPod>,
    pub services: Vec<K8sService>,
    pub deployments: Vec<K8sDeployment>,
}

#[tauri::command]
pub fn k8s_info(cwd: String) -> K8sInfo {
    let available = run_cmd("kubectl", &["version", "--client", "--short"]).is_some()
        || run_cmd("kubectl", &["version", "--client"]).is_some();

    if !available {
        return K8sInfo {
            available: false,
            has_k8s_files: false,
            k8s_files: vec![],
            current_context: String::new(),
            current_namespace: String::new(),
            pods: vec![],
            services: vec![],
            deployments: vec![],
        };
    }

    // Recursively detect k8s files (skip sub-git repos)
    let cwd_path = std::path::Path::new(&cwd);

    // First check for k8s directories at root level
    let k8s_dirs = ["k8s", "kubernetes", "kube", "manifests", "deploy"];
    let mut k8s_files: Vec<String> = Vec::new();
    for dir_name in &k8s_dirs {
        if cwd_path.join(dir_name).is_dir() {
            k8s_files.push(dir_name.to_string());
        }
    }

    // Recursively scan for k8s file patterns
    let k8s_file_names = [
        "deployment.yml", "deployment.yaml",
        "service.yml", "service.yaml",
        "pod.yml", "pod.yaml",
        "statefulset.yml", "statefulset.yaml",
        "ingress.yml", "ingress.yaml",
        "configmap.yml", "configmap.yaml",
        "secret.yml", "secret.yaml",
        "kustomization.yml", "kustomization.yaml",
        "Chart.yaml", "values.yaml",
        "skaffold.yaml",
    ];
    let found_k8s_files = find_files_recursive(cwd_path, &k8s_file_names, 5);
    k8s_files.extend(found_k8s_files);
    k8s_files.sort();
    k8s_files.dedup();

    let has_k8s_files = !k8s_files.is_empty();

    // Current context
    let current_context = run_cmd("kubectl", &["config", "current-context"])
        .unwrap_or_else(|| "none".to_string());

    // Current namespace
    let current_namespace = run_cmd(
        "kubectl",
        &["config", "view", "--minify", "--output", "jsonpath={..namespace}"],
    )
    .unwrap_or_else(|| "default".to_string());
    let current_namespace = if current_namespace.is_empty() {
        "default".to_string()
    } else {
        current_namespace
    };

    // Derive project name from folder for ownership matching
    let k8s_project_name = std::path::Path::new(&cwd)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "");

    // Pods
    let mut pods: Vec<K8sPod> = run_cmd(
        "kubectl",
        &[
            "get", "pods", "-n", &current_namespace,
            "-o", "custom-columns=NAME:.metadata.name,NAMESPACE:.metadata.namespace,STATUS:.status.phase,READY:.status.conditions[?(@.type=='Ready')].status,RESTARTS:.status.containerStatuses[0].restartCount,AGE:.metadata.creationTimestamp,NODE:.spec.nodeName",
            "--no-headers",
        ],
    )
    .unwrap_or_default()
    .lines()
    .filter_map(|line| {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 6 {
            return None;
        }
        let pod_name = parts[0].to_string();
        let is_project = !k8s_project_name.is_empty() && pod_name.to_lowercase().contains(&k8s_project_name);
        Some(K8sPod {
            name: pod_name,
            namespace: parts[1].to_string(),
            status: parts[2].to_string(),
            ready: parts.get(3).unwrap_or(&"<none>").to_string(),
            restarts: parts.get(4).unwrap_or(&"0").to_string(),
            age: parts.get(5).unwrap_or(&"").to_string(),
            node: parts.get(6).unwrap_or(&"<none>").to_string(),
            is_project,
        })
    })
    .collect();

    // Services
    let mut services: Vec<K8sService> = run_cmd(
        "kubectl",
        &[
            "get", "services", "-n", &current_namespace,
            "-o", "custom-columns=NAME:.metadata.name,NAMESPACE:.metadata.namespace,TYPE:.spec.type,CLUSTER-IP:.spec.clusterIP,PORTS:.spec.ports[*].port,AGE:.metadata.creationTimestamp",
            "--no-headers",
        ],
    )
    .unwrap_or_default()
    .lines()
    .filter_map(|line| {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 5 {
            return None;
        }
        let svc_name = parts[0].to_string();
        let is_project = !k8s_project_name.is_empty() && svc_name.to_lowercase().contains(&k8s_project_name);
        Some(K8sService {
            name: svc_name,
            namespace: parts[1].to_string(),
            svc_type: parts[2].to_string(),
            cluster_ip: parts[3].to_string(),
            ports: parts.get(4).unwrap_or(&"").to_string(),
            age: parts.get(5).unwrap_or(&"").to_string(),
            is_project,
        })
    })
    .collect();

    // Deployments
    let mut deployments: Vec<K8sDeployment> = run_cmd(
        "kubectl",
        &[
            "get", "deployments", "-n", &current_namespace,
            "-o", "custom-columns=NAME:.metadata.name,NAMESPACE:.metadata.namespace,READY:.status.readyReplicas,UP-TO-DATE:.status.updatedReplicas,AVAILABLE:.status.availableReplicas,AGE:.metadata.creationTimestamp",
            "--no-headers",
        ],
    )
    .unwrap_or_default()
    .lines()
    .filter_map(|line| {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 5 {
            return None;
        }
        let dep_name = parts[0].to_string();
        let is_project = !k8s_project_name.is_empty() && dep_name.to_lowercase().contains(&k8s_project_name);
        Some(K8sDeployment {
            name: dep_name,
            namespace: parts[1].to_string(),
            ready: parts.get(2).unwrap_or(&"0").to_string(),
            up_to_date: parts.get(3).unwrap_or(&"0").to_string(),
            available: parts.get(4).unwrap_or(&"0").to_string(),
            age: parts.get(5).unwrap_or(&"").to_string(),
            is_project,
        })
    })
    .collect();

    // Sort: project resources first
    pods.sort_by(|a, b| b.is_project.cmp(&a.is_project));
    services.sort_by(|a, b| b.is_project.cmp(&a.is_project));
    deployments.sort_by(|a, b| b.is_project.cmp(&a.is_project));

    K8sInfo {
        available,
        has_k8s_files,
        k8s_files,
        current_context,
        current_namespace,
        pods,
        services,
        deployments,
    }
}

// ── Agents Detection ──

#[derive(Serialize)]
pub struct DetectedAgent {
    pub name: String,
    pub slug: String,
    pub description: String,
    pub config_files: Vec<String>,
    pub config_dirs: Vec<String>,
    pub website: String,
}

#[derive(Serialize)]
pub struct AgentsInfo {
    pub agents: Vec<DetectedAgent>,
}

#[tauri::command]
pub fn detect_agents(cwd: String) -> AgentsInfo {
    let root = std::path::Path::new(&cwd);

    struct AgentDef {
        name: &'static str,
        slug: &'static str,
        description: &'static str,
        files: &'static [&'static str],
        dirs: &'static [&'static str],
        website: &'static str,
    }

    let defs: &[AgentDef] = &[
        AgentDef {
            name: "Claude Code",
            slug: "claude-code",
            description: "Anthropic's CLI coding agent",
            files: &["CLAUDE.md", ".claude/settings.json", ".claude/settings.local.json"],
            dirs: &[".claude", ".claude/commands"],
            website: "https://docs.anthropic.com/en/docs/claude-code",
        },
        AgentDef {
            name: "Cursor",
            slug: "cursor",
            description: "AI-first code editor",
            files: &[".cursorrules", ".cursor/mcp.json"],
            dirs: &[".cursor", ".cursor/rules"],
            website: "https://cursor.com",
        },
        AgentDef {
            name: "Gemini CLI",
            slug: "gemini",
            description: "Google's CLI coding agent",
            files: &["GEMINI.md", ".gemini/settings.json"],
            dirs: &[".gemini"],
            website: "https://github.com/google-gemini/gemini-cli",
        },
        AgentDef {
            name: "GitHub Copilot",
            slug: "copilot",
            description: "GitHub's AI pair programmer",
            files: &[".github/copilot-instructions.md"],
            dirs: &[],
            website: "https://github.com/features/copilot",
        },
        AgentDef {
            name: "Aider",
            slug: "aider",
            description: "AI pair programming in your terminal",
            files: &[".aider.conf.yml", ".aiderignore", ".aider.model.settings.yml"],
            dirs: &[],
            website: "https://aider.chat",
        },
        AgentDef {
            name: "Continue",
            slug: "continue",
            description: "Open-source AI code assistant",
            files: &[".continue/config.json", ".continue/config.yaml", ".continue/config.ts"],
            dirs: &[".continue"],
            website: "https://continue.dev",
        },
        AgentDef {
            name: "Cline / Roo Code",
            slug: "cline",
            description: "Autonomous coding agent for VS Code",
            files: &[".roorules", ".roomodes", ".rooignore"],
            dirs: &[".clinerules", ".roo", ".roo/rules"],
            website: "https://github.com/RooVetGit/Roo-Code",
        },
        AgentDef {
            name: "Windsurf",
            slug: "windsurf",
            description: "Codeium's agentic IDE",
            files: &[".windsurfrules"],
            dirs: &[".windsurf"],
            website: "https://codeium.com/windsurf",
        },
        AgentDef {
            name: "Amazon Q Developer",
            slug: "amazon-q",
            description: "AWS AI coding companion",
            files: &[".amazonq/mcp.json"],
            dirs: &[".amazonq", ".amazonq/rules"],
            website: "https://aws.amazon.com/q/developer",
        },
        AgentDef {
            name: "OpenHands",
            slug: "openhands",
            description: "Open-source AI software developer",
            files: &["config.toml"],
            dirs: &[".openhands"],
            website: "https://github.com/All-Hands-AI/OpenHands",
        },
        AgentDef {
            name: "Goose",
            slug: "goose",
            description: "Block's open-source AI developer agent",
            files: &[".goosehints"],
            dirs: &[".goose"],
            website: "https://github.com/block/goose",
        },
        AgentDef {
            name: "Plandex",
            slug: "plandex",
            description: "AI coding engine for complex tasks",
            files: &["plandex.yml"],
            dirs: &[".plandex"],
            website: "https://plandex.ai",
        },
        AgentDef {
            name: "Sweep",
            slug: "sweep",
            description: "AI-powered code reviewer & writer",
            files: &["sweep.yaml"],
            dirs: &[],
            website: "https://sweep.dev",
        },
        AgentDef {
            name: "Codex CLI",
            slug: "codex",
            description: "OpenAI's CLI coding agent",
            files: &["codex.md", "AGENTS.md", "AGENTS.override.md"],
            dirs: &[],
            website: "https://github.com/openai/codex",
        },
        AgentDef {
            name: "Amp",
            slug: "amp",
            description: "Sourcegraph's agentic coding tool",
            files: &["AGENTS.md"],
            dirs: &[".amp"],
            website: "https://ampcode.com",
        },
    ];

    let mut agents: Vec<DetectedAgent> = Vec::new();

    for def in defs {
        let mut found_files: Vec<String> = Vec::new();
        let mut found_dirs: Vec<String> = Vec::new();

        for file in def.files {
            let p = root.join(file);
            if p.exists() && p.is_file() {
                found_files.push(file.to_string());
            }
        }

        for dir in def.dirs {
            let p = root.join(dir);
            if p.exists() && p.is_dir() {
                found_dirs.push(dir.to_string());
            }
        }

        if !found_files.is_empty() || !found_dirs.is_empty() {
            agents.push(DetectedAgent {
                name: def.name.to_string(),
                slug: def.slug.to_string(),
                description: def.description.to_string(),
                config_files: found_files,
                config_dirs: found_dirs,
                website: def.website.to_string(),
            });
        }
    }

    AgentsInfo { agents }
}

#[tauri::command]
pub fn set_window_theme(app: AppHandle, theme: String) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Window not found")?;
    let tauri_theme = match theme.as_str() {
        "dark" => Some(tauri::Theme::Dark),
        "light" => Some(tauri::Theme::Light),
        _ => None, // "system" — use OS default
    };
    window.set_theme(tauri_theme).map_err(|e| e.to_string())?;

    // On macOS, also set the app-wide appearance so the menu bar follows the theme
    #[cfg(target_os = "macos")]
    {
        use objc::runtime::{Class, Object};
        use objc::{msg_send, sel, sel_impl};

        unsafe {
            let ns_app_class = Class::get("NSApplication").unwrap();
            let app_instance: *mut Object = msg_send![ns_app_class, sharedApplication];

            let appearance_name_str = match theme.as_str() {
                "dark" => Some("NSAppearanceNameDarkAqua\0"),
                "light" => Some("NSAppearanceNameAqua\0"),
                _ => None,
            };

            let appearance_name: *mut Object = if let Some(name) = appearance_name_str {
                let ns_string_class = Class::get("NSString").unwrap();
                let s: *mut Object = msg_send![ns_string_class, stringWithUTF8String: name.as_ptr()];
                let appearance_class = Class::get("NSAppearance").unwrap();
                msg_send![appearance_class, appearanceNamed: s]
            } else {
                std::ptr::null_mut()
            };

            let () = msg_send![app_instance, setAppearance: appearance_name];
        }
    }

    Ok(())
}

#[tauri::command]
pub fn git_watch(
    state: State<'_, GitWatcherManager>,
    app: AppHandle,
    cwd: String,
) -> Result<(), String> {
    state.watch(app, cwd)
}

#[tauri::command]
pub fn git_unwatch(state: State<'_, GitWatcherManager>, cwd: String) -> Result<(), String> {
    state.unwatch(&cwd);
    Ok(())
}
