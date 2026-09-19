//! System tray: live countdown in the tooltip plus quick timer actions.

use super::runtime;
use super::timer::{format_mmss, Phase, TimerState};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

const TRAY_ID: &str = "kairo-tray";

fn labels(lang: &str) -> [&'static str; 4] {
    if lang == "en" {
        ["Show Kairo", "Start / pause focus", "Stop session", "Quit"]
    } else {
        ["Показать Kairo", "Старт / пауза фокуса", "Остановить сессию", "Выход"]
    }
}

fn build_menu(app: &AppHandle, lang: &str) -> tauri::Result<Menu<tauri::Wry>> {
    let l = labels(lang);
    let show = MenuItem::with_id(app, "show", l[0], true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle", l[1], true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop", l[2], true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", l[3], true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    Menu::with_items(app, &[&show, &toggle, &stop, &sep, &quit])
}

pub fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

pub fn setup(app: &AppHandle, lang: &str) -> tauri::Result<()> {
    let menu = build_menu(app, lang)?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Kairo")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "toggle" => {
                let _ = runtime::toggle(app);
            }
            "stop" => {
                let _ = runtime::stop(app);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

pub fn set_language(app: &AppHandle, lang: &str) {
    if let (Some(tray), Ok(menu)) = (app.tray_by_id(TRAY_ID), build_menu(app, lang)) {
        let _ = tray.set_menu(Some(menu));
    }
}

/// Mirrors the timer into the tray tooltip (and the title on macOS).
pub fn update(app: &AppHandle, st: &TimerState) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else { return };
    let kind = match st.kind.as_str() {
        "short_break" => "Short break",
        "long_break" => "Long break",
        _ => "Focus",
    };
    let (tip, title) = match st.phase {
        Phase::Running => (format!("Kairo — {kind} {}", format_mmss(st.remaining_sec)), format_mmss(st.remaining_sec)),
        Phase::Paused => (format!("Kairo — {kind} ⏸ {}", format_mmss(st.remaining_sec)), format_mmss(st.remaining_sec)),
        Phase::Completed => (format!("Kairo — {kind} ✓"), String::new()),
        Phase::Idle => ("Kairo".to_string(), String::new()),
    };
    let _ = tray.set_tooltip(Some(tip));
    let _ = tray.set_title(Some(title));
}
