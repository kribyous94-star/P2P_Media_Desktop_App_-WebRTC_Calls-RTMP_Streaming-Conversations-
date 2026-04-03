// Prévient l'ouverture d'une fenêtre console sur Windows en mode release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    p2p_media_lib::run();
}
