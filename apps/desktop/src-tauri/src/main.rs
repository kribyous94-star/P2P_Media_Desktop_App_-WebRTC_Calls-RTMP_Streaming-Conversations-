// Prévient l'ouverture d'une fenêtre console sur Windows en mode release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use tauri_plugin_shell::ShellExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::rtmp::start_rtmp,
            commands::rtmp::stop_rtmp,
            commands::rtmp::get_rtmp_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
