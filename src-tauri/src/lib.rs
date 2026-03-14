mod commands;
mod git_watcher;
mod pty_manager;

use commands::{
    detect_agents, docker_container_logs, docker_container_remove, docker_container_restart,
    docker_container_stop, docker_image_remove, docker_info, get_default_shell, get_home_dir,
    git_info, git_status_short, git_unwatch, git_watch, k8s_info, pty_close, pty_create,
    pty_get_cwd, pty_resize, pty_write, set_window_theme, system_info,
};
use git_watcher::GitWatcherManager;
use pty_manager::PtyManager;
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PtyManager::new())
        .manage(GitWatcherManager::new())
        .invoke_handler(tauri::generate_handler![
            pty_create, pty_write, pty_resize, pty_close, pty_get_cwd, get_home_dir,
            get_default_shell, git_status_short, git_info, git_watch, git_unwatch,
            docker_info, docker_container_stop, docker_container_restart,
            docker_container_remove, docker_image_remove, docker_container_logs,
            k8s_info, system_info, detect_agents, set_window_theme
        ])
        .setup(|app| {
            let handle = app.handle();

            // -- Shell menu --
            let new_terminal = MenuItemBuilder::with_id("new_terminal", "New Terminal")
                .accelerator("CmdOrCtrl+N")
                .build(handle)?;
            let new_session = MenuItemBuilder::with_id("new_session", "New Session")
                .accelerator("CmdOrCtrl+T")
                .build(handle)?;
            let close_terminal = MenuItemBuilder::with_id("close_terminal", "Close Terminal")
                .accelerator("CmdOrCtrl+W")
                .build(handle)?;
            let close_session = MenuItemBuilder::with_id("close_session", "Close Session")
                .accelerator("CmdOrCtrl+Shift+W")
                .build(handle)?;

            let shell_menu = SubmenuBuilder::new(handle, "Shell")
                .item(&new_terminal)
                .item(&new_session)
                .separator()
                .item(&close_terminal)
                .item(&close_session)
                .build()?;

            // -- Edit menu --
            let edit_menu = SubmenuBuilder::new(handle, "Edit")
                .copy()
                .paste()
                .select_all()
                .separator()
                .undo()
                .redo()
                .build()?;

            // -- View menu --
            let split_vertical = MenuItemBuilder::with_id("split_vertical", "Split Vertically")
                .accelerator("CmdOrCtrl+D")
                .build(handle)?;
            let split_horizontal =
                MenuItemBuilder::with_id("split_horizontal", "Split Horizontally")
                    .accelerator("CmdOrCtrl+Shift+D")
                    .build(handle)?;
            let zoom_pane = MenuItemBuilder::with_id("zoom_pane", "Zoom Pane")
                .accelerator("CmdOrCtrl+Shift+Return")
                .build(handle)?;
            let toggle_sidebar = MenuItemBuilder::with_id("toggle_sidebar", "Toggle Sidebar")
                .accelerator("CmdOrCtrl+E")
                .build(handle)?;
            let toggle_browser = MenuItemBuilder::with_id("toggle_browser", "Toggle Browser Panel")
                .accelerator("CmdOrCtrl+B")
                .build(handle)?;

            let toggle_info_panel =
                MenuItemBuilder::with_id("toggle_info_panel", "Toggle Info Panel")
                    .accelerator("CmdOrCtrl+G")
                    .build(handle)?;
            let toggle_docker_panel =
                MenuItemBuilder::with_id("toggle_docker_panel", "Containers View")
                    .accelerator("CmdOrCtrl+Shift+K")
                    .build(handle)?;
            let toggle_theme = MenuItemBuilder::with_id("toggle_theme", "Toggle Theme")
                .accelerator("CmdOrCtrl+Shift+T")
                .build(handle)?;

            let view_menu = SubmenuBuilder::new(handle, "View")
                .item(&split_vertical)
                .item(&split_horizontal)
                .item(&zoom_pane)
                .separator()
                .item(&toggle_sidebar)
                .item(&toggle_browser)
                .item(&toggle_info_panel)
                .item(&toggle_docker_panel)
                .separator()
                .item(&toggle_theme)
                .build()?;

            // -- Navigate menu (Terminator-style pane navigation) --
            let focus_up = MenuItemBuilder::with_id("focus_up", "Focus Pane Above")
                .accelerator("CmdOrCtrl+Alt+Up")
                .build(handle)?;
            let focus_down = MenuItemBuilder::with_id("focus_down", "Focus Pane Below")
                .accelerator("CmdOrCtrl+Alt+Down")
                .build(handle)?;
            let focus_left = MenuItemBuilder::with_id("focus_left", "Focus Pane Left")
                .accelerator("CmdOrCtrl+Alt+Left")
                .build(handle)?;
            let focus_right = MenuItemBuilder::with_id("focus_right", "Focus Pane Right")
                .accelerator("CmdOrCtrl+Alt+Right")
                .build(handle)?;
            let next_pane = MenuItemBuilder::with_id("next_pane", "Next Pane")
                .accelerator("CmdOrCtrl+]")
                .build(handle)?;
            let prev_pane = MenuItemBuilder::with_id("prev_pane", "Previous Pane")
                .accelerator("CmdOrCtrl+[")
                .build(handle)?;

            let navigate_menu = SubmenuBuilder::new(handle, "Navigate")
                .item(&focus_up)
                .item(&focus_down)
                .item(&focus_left)
                .item(&focus_right)
                .separator()
                .item(&next_pane)
                .item(&prev_pane)
                .build()?;

            // -- Window menu --
            let next_session = MenuItemBuilder::with_id("next_session", "Next Session")
                .accelerator("CmdOrCtrl+Shift+]")
                .build(handle)?;
            let prev_session = MenuItemBuilder::with_id("prev_session", "Previous Session")
                .accelerator("CmdOrCtrl+Shift+[")
                .build(handle)?;

            let window_menu = SubmenuBuilder::new(handle, "Window")
                .minimize()
                .item(&PredefinedMenuItem::fullscreen(handle, None)?)
                .separator()
                .item(&next_session)
                .item(&prev_session)
                .build()?;

            // -- App menu (macOS) --
            let settings = MenuItemBuilder::with_id("settings", "Settings...")
                .accelerator("CmdOrCtrl+,")
                .build(handle)?;

            let app_menu = SubmenuBuilder::new(handle, "lumaterm")
                .about(None)
                .separator()
                .item(&settings)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;

            // -- Help menu --
            let help_menu = SubmenuBuilder::new(handle, "Help").build()?;

            let menu = MenuBuilder::new(handle)
                .item(&app_menu)
                .item(&shell_menu)
                .item(&edit_menu)
                .item(&view_menu)
                .item(&navigate_menu)
                .item(&window_menu)
                .item(&help_menu)
                .build()?;

            app.set_menu(menu)?;

            // Handle menu events -> emit to frontend
            app.on_menu_event(move |app_handle, event| {
                let _ = app_handle.emit("menu-event", event.id().0.as_str());
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state = window.state::<PtyManager>();
                state.close_all();
                let git_state = window.state::<GitWatcherManager>();
                git_state.unwatch_all();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
