// Prevents an extra console window on Windows in release builds. The shell shows
// the API log through its own window; a stray console is noise, and it is also an
// opportunity for a user to paste a credential into a terminal that records it.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    master_trade_desktop_lib::run();
}
