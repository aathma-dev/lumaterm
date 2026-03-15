use crate::commands::run_git;
use crate::git_cache::GitStatusCache;
use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[derive(serde::Serialize, Clone)]
struct GitStatusPayload {
    cwd: String,
    is_repo: bool,
    branch: String,
    changes: u32,
}

/// Paths within .git/ that are noisy and don't indicate meaningful state changes
fn is_noisy_path(path: &std::path::Path) -> bool {
    let s = path.to_string_lossy();
    s.contains("FETCH_HEAD")
        || s.contains("gc.log")
        || s.contains("objects/pack")
        || s.contains("objects/info")
}

fn compute_git_status(cwd: &str) -> GitStatusPayload {
    let is_repo = run_git(cwd, &["rev-parse", "--is-inside-work-tree"])
        .map(|s| s == "true")
        .unwrap_or(false);

    if !is_repo {
        return GitStatusPayload {
            cwd: cwd.to_string(),
            is_repo: false,
            branch: String::new(),
            changes: 0,
        };
    }

    let branch = run_git(cwd, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|| "HEAD".to_string());

    let changes = run_git(cwd, &["status", "--porcelain", "-u"])
        .map(|s| s.lines().count() as u32)
        .unwrap_or(0);

    GitStatusPayload {
        cwd: cwd.to_string(),
        is_repo: true,
        branch,
        changes,
    }
}

struct WatcherEntry {
    _debouncer: notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>,
}

pub struct GitWatcherManager {
    watchers: Arc<Mutex<HashMap<String, WatcherEntry>>>,
}

impl GitWatcherManager {
    pub fn new() -> Self {
        Self {
            watchers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn watch(&self, app: AppHandle, cwd: String) -> Result<(), String> {
        let mut watchers = self.watchers.lock().map_err(|e| e.to_string())?;

        // Already watching this path
        if watchers.contains_key(&cwd) {
            return Ok(());
        }

        let cwd_path = PathBuf::from(&cwd);
        let git_dir = cwd_path.join(".git");

        // Only watch if .git exists
        if !git_dir.exists() {
            return Ok(());
        }

        let emit_cwd = cwd.clone();
        let debouncer = new_debouncer(
            Duration::from_millis(1500),
            move |res: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
                if let Ok(events) = res {
                    let dominated = events.iter().any(|e| {
                        e.kind == DebouncedEventKind::Any && !is_noisy_path(&e.path)
                    });
                    if dominated {
                        // Invalidate cache
                        if let Some(cache) = app.try_state::<GitStatusCache>() {
                            cache.invalidate(&emit_cwd);
                        }

                        // Compute fresh status and emit rich event for status bar
                        let status = compute_git_status(&emit_cwd);
                        let _ = app.emit("git-status-changed", &status);

                        // Also emit generic event for GitPanel full refresh
                        let _ = app.emit("git-changed", &emit_cwd);
                    }
                }
            },
        )
        .map_err(|e| format!("Failed to create watcher: {}", e))?;

        let mut debouncer = debouncer;

        // Only watch .git directory (all git state changes reflect there)
        debouncer
            .watcher()
            .watch(&git_dir, notify::RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to watch .git: {}", e))?;

        watchers.insert(
            cwd.clone(),
            WatcherEntry {
                _debouncer: debouncer,
            },
        );

        Ok(())
    }

    pub fn unwatch(&self, cwd: &str) {
        if let Ok(mut watchers) = self.watchers.lock() {
            watchers.remove(cwd);
        }
    }

    pub fn unwatch_all(&self) {
        if let Ok(mut watchers) = self.watchers.lock() {
            watchers.clear();
        }
    }
}
