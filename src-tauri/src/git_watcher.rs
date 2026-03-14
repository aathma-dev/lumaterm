use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

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
            Duration::from_millis(500),
            move |res: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
                if let Ok(events) = res {
                    let dominated = events.iter().any(|e| e.kind == DebouncedEventKind::Any);
                    if dominated {
                        let _ = app.emit("git-changed", &emit_cwd);
                    }
                }
            },
        )
        .map_err(|e| format!("Failed to create watcher: {}", e))?;

        let mut debouncer = debouncer;

        // Watch .git directory (covers commits, branch switches, merges, pushes, staging)
        debouncer
            .watcher()
            .watch(&git_dir, notify::RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to watch .git: {}", e))?;

        // Watch working tree (covers file edits, new files, deletions)
        debouncer
            .watcher()
            .watch(&cwd_path, notify::RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to watch cwd: {}", e))?;

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
