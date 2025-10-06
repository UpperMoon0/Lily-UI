// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(feature = "tauri")]
fn main() {
    lily_ui_lib::run()
}

#[cfg(not(feature = "tauri"))]
fn main() {
    // Do nothing for tests
}
