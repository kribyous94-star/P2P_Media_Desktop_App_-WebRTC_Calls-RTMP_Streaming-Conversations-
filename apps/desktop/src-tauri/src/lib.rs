mod commands;

use commands::rtmp::RtmpStateHandle;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Mutex::new(commands::rtmp::RtmpState::default()))
        .invoke_handler(tauri::generate_handler![
            commands::rtmp::start_rtmp,
            commands::rtmp::stop_rtmp,
            commands::rtmp::get_rtmp_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
