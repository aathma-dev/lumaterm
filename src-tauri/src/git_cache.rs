use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

#[derive(Serialize, Clone)]
pub struct GitStatus {
    pub is_repo: bool,
    pub branch: String,
    pub changes: u32,
}

pub struct GitStatusCache {
    cache: Mutex<HashMap<String, (GitStatus, Instant)>>,
    ttl_secs: u64,
}

impl GitStatusCache {
    pub fn new(ttl_secs: u64) -> Self {
        Self {
            cache: Mutex::new(HashMap::new()),
            ttl_secs,
        }
    }

    pub fn get(&self, cwd: &str) -> Option<GitStatus> {
        let cache = self.cache.lock().ok()?;
        let (status, instant) = cache.get(cwd)?;
        if instant.elapsed().as_secs() < self.ttl_secs {
            Some(status.clone())
        } else {
            None
        }
    }

    pub fn set(&self, cwd: String, status: GitStatus) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.insert(cwd, (status, Instant::now()));
        }
    }

    pub fn invalidate(&self, cwd: &str) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.remove(cwd);
        }
    }
}
