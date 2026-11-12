//! spike-spine host: one transparent, always-on-top, click-through stage on the primary monitor.
//! Window flags, focus handling and the cursor poll copy what Petween's stage does
//! (petween/src-tauri/src/stages.rs), so results here carry over. Nothing else is here on purpose.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::time::Duration;

use serde::Serialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const STAGE: &str = "stage";

#[derive(Serialize, Clone, PartialEq)]
struct Cursor {
    x: f64,
    y: f64,
}

/// Work area of the stage in physical pixels + its scale factor.
#[derive(Serialize, Clone)]
struct StageInfo {
    x: i32,
    y: i32,
    w: u32,
    h: u32,
    scale: f64,
}

#[tauri::command]
fn get_stage(app: AppHandle) -> Option<StageInfo> {
    let m = app.primary_monitor().ok().flatten()?;
    let wa = m.work_area();
    Some(StageInfo { x: wa.position.x, y: wa.position.y, w: wa.size.width, h: wa.size.height, scale: m.scale_factor() })
}

/// hit = the cursor is on a figure: the window takes the mouse. Otherwise clicks fall through.
#[tauri::command]
fn set_hit(window: WebviewWindow, hit: bool) {
    let _ = window.set_ignore_cursor_events(!hit);
    no_activate(&window);
}

/// Clicking a figure must not steal keyboard focus from the user's app.
fn no_activate(window: &WebviewWindow) {
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        use windows_sys::Win32::UI::WindowsAndMessaging::{GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE};
        let h = hwnd.0 as windows_sys::Win32::Foundation::HWND;
        unsafe {
            let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
            if ex & WS_EX_NOACTIVATE as isize == 0 {
                SetWindowLongPtrW(h, GWL_EXSTYLE, ex | WS_EX_NOACTIVATE as isize);
            }
        }
    }
    #[cfg(not(windows))]
    let _ = window;
}

#[cfg(windows)]
fn cursor_now(_app: &AppHandle) -> Option<Cursor> {
    use windows_sys::Win32::{Foundation::POINT, UI::WindowsAndMessaging::GetCursorPos};
    let mut p = POINT { x: 0, y: 0 };
    (unsafe { GetCursorPos(&mut p) } != 0).then(|| Cursor { x: p.x as f64, y: p.y as f64 })
}

#[cfg(not(windows))]
fn cursor_now(app: &AppHandle) -> Option<Cursor> {
    app.cursor_position().ok().map(|p| Cursor { x: p.x, y: p.y })
}

fn open_stage(app: &AppHandle) -> tauri::Result<()> {
    let Some(info) = get_stage(app.clone()) else { return Ok(()) };
    let win = WebviewWindowBuilder::new(app, STAGE, WebviewUrl::App("index.html".into()))
        .title("spike-spine stage")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .build()?;
    win.set_position(PhysicalPosition::new(info.x, info.y))?;
    win.set_size(PhysicalSize::new(info.w, info.h))?;
    win.set_ignore_cursor_events(true)?;
    no_activate(&win);
    win.show()?;
    Ok(())
}

/// The stage never takes keyboard focus, so every control of the prototype lives in the tray menu.
/// Each item's id is sent to the page as a `menu` event.
fn tray(app: &AppHandle) -> tauri::Result<()> {
    let item = |id: &str, label: &str| MenuItem::with_id(app, id, label, true, None::<&str>);
    let sep = || PredefinedMenuItem::separator(app);
    let menu = Menu::with_items(
        app,
        &[
            &item("n:1", "1 figure")?,
            &item("n:3", "3 figures")?,
            &item("n:6", "6 figures")?,
            &sep()?,
            &item("fps:15", "15 fps")?,
            &item("fps:30", "30 fps")?,
            &item("fps:60", "60 fps")?,
            &sep()?,
            &item("anim", "Next animation")?,
            &item("skin", "Next skin")?,
            &item("physics", "Physics on / off")?,
            &item("hud", "HUD on / off")?,
            &item("log", "Write measurements to the log")?,
            &sep()?,
            &item("quit", "Quit")?,
        ],
    )?;
    let mut b = TrayIconBuilder::with_id("main").tooltip("spike-spine").menu(&menu).show_menu_on_left_click(true);
    if let Some(icon) = app.default_window_icon() {
        b = b.icon(icon.clone());
    }
    b.on_menu_event(|app, ev| match ev.id().as_ref() {
        "quit" => app.exit(0),
        id => {
            let _ = app.emit("menu", id.to_string());
        }
    })
    .build(app)?;
    Ok(())
}

/// Measurements the page asks to keep (one line each), next to the executable's working directory.
#[tauri::command]
fn log_line(line: String) {
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open("spike-spine.log") {
        let _ = writeln!(f, "{line}");
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_stage, set_hit, log_line])
        .setup(|app| {
            let handle = app.handle().clone();
            tray(&handle)?;
            open_stage(&handle)?;
            // Cursor poll at ~60 Hz; emits only on change (same as Petween).
            std::thread::spawn(move || {
                let mut last: Option<Cursor> = None;
                loop {
                    std::thread::sleep(Duration::from_millis(16));
                    let Some(c) = cursor_now(&handle) else { continue };
                    if last.as_ref() != Some(&c) {
                        let _ = handle.emit("cursor", c.clone());
                        last = Some(c);
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running spike-spine");
}
