use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::thread::{self, JoinHandle};
use tauri::{AppHandle, Emitter};

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct PtyOutput {
    pub pty_id: u32,
    pub data: String, // base64 encoded
}

struct PtySession {
    master_writer: Box<dyn Write + Send>,
    master_pty: Box<dyn MasterPty + Send>,
    _reader_handle: JoinHandle<()>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

pub struct PtyManager {
    sessions: Mutex<HashMap<u32, PtySession>>,
    next_id: AtomicU32,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            next_id: AtomicU32::new(1),
        }
    }

    pub fn create(
        &self,
        app: AppHandle,
        cols: u16,
        rows: u16,
        cwd: Option<String>,
    ) -> Result<u32, String> {
        let pty_system = native_pty_system();

        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        let pair = pty_system
            .openpty(size)
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let mut cmd = CommandBuilder::new(&shell);
        cmd.arg("-l"); // Login shell: ensures profile/rc files are sourced (PATH, etc.)
        cmd.env("TERM", "xterm-256color");

        // Set the working directory for the shell
        if let Some(ref dir) = cwd {
            let path = std::path::Path::new(dir);
            if path.is_dir() {
                cmd.cwd(path);
            }
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell: {}", e))?;

        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone reader: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take writer: {}", e))?;

        let pty_id = self.next_id.fetch_add(1, Ordering::Relaxed);

        let app_clone = app.clone();
        let reader_handle = thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let encoded = BASE64.encode(&buf[..n]);
                        let _ = app_clone.emit(
                            "pty-output",
                            PtyOutput {
                                pty_id,
                                data: encoded,
                            },
                        );
                    }
                    Err(_) => break,
                }
            }
        });

        let session = PtySession {
            master_writer: writer,
            master_pty: pair.master,
            _reader_handle: reader_handle,
            child,
        };

        self.sessions.lock().unwrap().insert(pty_id, session);

        Ok(pty_id)
    }

    pub fn write(&self, pty_id: u32, data: &[u8]) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(&pty_id)
            .ok_or_else(|| format!("PTY {} not found", pty_id))?;
        session
            .master_writer
            .write_all(data)
            .map_err(|e| format!("Write failed: {}", e))?;
        session
            .master_writer
            .flush()
            .map_err(|e| format!("Flush failed: {}", e))?;
        Ok(())
    }

    pub fn resize(&self, pty_id: u32, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get(&pty_id)
            .ok_or_else(|| format!("PTY {} not found", pty_id))?;
        session
            .master_pty
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Resize failed: {}", e))?;
        Ok(())
    }

    pub fn get_cwd(&self, pty_id: u32) -> Result<String, String> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get(&pty_id)
            .ok_or_else(|| format!("PTY {} not found", pty_id))?;

        let pid = session
            .child
            .process_id()
            .ok_or_else(|| "No PID available".to_string())?;

        // On macOS, use lsof to get the cwd of the process
        let output = std::process::Command::new("lsof")
            .args(["-a", "-p", &pid.to_string(), "-d", "cwd", "-Fn"])
            .output()
            .map_err(|e| format!("Failed to run lsof: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        stdout
            .lines()
            .find(|l| l.starts_with('n'))
            .map(|l| l[1..].to_string())
            .ok_or_else(|| "Could not determine cwd".to_string())
    }

    pub fn close(&self, pty_id: u32) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(mut session) = sessions.remove(&pty_id) {
            let _ = session.child.kill();
            let _ = session.child.wait();
        }
        Ok(())
    }

    pub fn close_all(&self) {
        let mut sessions = self.sessions.lock().unwrap();
        for (_, mut session) in sessions.drain() {
            let _ = session.child.kill();
            let _ = session.child.wait();
        }
    }
}
