//! Glue between the pure timer, SQLite, the system tray, notifications and the frontend.

use super::timer::{Finished, Timer, TimerState};
use super::tray;
use crate::db::{sessions, settings, tasks, Db};
use crate::error::{AppError, AppResult};
use serde_json::json;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

pub struct AppTimer(pub Mutex<Timer>);

impl AppTimer {
    pub fn new() -> Self {
        AppTimer(Mutex::new(Timer::new()))
    }
}

fn with_timer<R>(app: &AppHandle, f: impl FnOnce(&mut Timer) -> R) -> AppResult<R> {
    let state = app.state::<AppTimer>();
    let mut guard = state.inner().0.lock().map_err(|_| AppError::new("TIMER_STATE", "Timer lock is poisoned"))?;
    Ok(f(&mut guard))
}

pub fn snapshot(app: &AppHandle) -> AppResult<TimerState> {
    with_timer(app, |t| t.state(Instant::now()))
}

pub fn is_active(app: &AppHandle) -> bool {
    with_timer(app, |t| t.is_active()).unwrap_or(false)
}

fn publish(app: &AppHandle) -> AppResult<TimerState> {
    let st = snapshot(app)?;
    let _ = app.emit("timer-state", &st);
    tray::update(app, &st);
    Ok(st)
}

fn default_seconds(app: &AppHandle, kind: &str) -> AppResult<(i64, i64)> {
    let db = app.state::<Db>();
    let conn = db.lock()?;
    let key = match kind {
        "short_break" => "short_break_min",
        "long_break" => "long_break_min",
        _ => "work_min",
    };
    Ok((settings::get_int(&conn, key) * 60, settings::get_int(&conn, "long_break_every")))
}

pub fn start(
    app: &AppHandle,
    kind: Option<String>,
    task_id: Option<i64>,
    duration_sec: Option<i64>,
    long_break_every: Option<i64>,
) -> AppResult<TimerState> {
    let kind = kind.unwrap_or_else(|| "work".into());
    let (default_sec, default_long_every) = default_seconds(app, &kind)?;
    if let Some(n) = long_break_every {
        if !(2..=12).contains(&n) {
            return Err(AppError::validation("Sessions before a long break must be between 2 and 12"));
        }
    }
    let project_id = match task_id {
        Some(id) => {
            let db = app.state::<Db>();
            let conn = db.lock()?;
            Some(sessions::project_of_task(&conn, id)?)
        }
        None => None,
    };
    with_timer(app, |t| {
        t.dismiss();
        t.start(
            Instant::now(),
            &kind,
            task_id,
            project_id,
            duration_sec.unwrap_or(default_sec),
            long_break_every.unwrap_or(default_long_every),
        )
    })??;
    publish(app)
}

pub fn pause(app: &AppHandle) -> AppResult<TimerState> {
    with_timer(app, |t| t.pause(Instant::now()))??;
    publish(app)
}

pub fn resume(app: &AppHandle) -> AppResult<TimerState> {
    with_timer(app, |t| t.resume(Instant::now()))??;
    publish(app)
}

pub fn stop(app: &AppHandle) -> AppResult<TimerState> {
    let finished = with_timer(app, |t| t.stop(Instant::now()))?;
    if let Some(f) = finished {
        save_session(app, &f)?;
        let _ = app.emit("sessions-changed", ());
    }
    publish(app)
}

pub fn dismiss(app: &AppHandle) -> AppResult<TimerState> {
    with_timer(app, |t| t.dismiss())?;
    publish(app)
}

/// Starts, pauses or resumes depending on the current phase (tray menu, global hotkey).
pub fn toggle(app: &AppHandle) -> AppResult<TimerState> {
    let phase = snapshot(app)?.phase;
    use super::timer::Phase::*;
    match phase {
        Running => pause(app),
        Paused => resume(app),
        Idle | Completed => start(app, None, None, None, None),
    }
}

fn save_session(app: &AppHandle, f: &Finished) -> AppResult<()> {
    let db = app.state::<Db>();
    let conn = db.lock()?;
    // The task may have been deleted while the timer was running.
    let task_id = f.task_id.filter(|id| tasks::get_task(&conn, *id).is_ok());
    sessions::insert_session(&conn, task_id, f.project_id, &f.started_at, &f.ended_at, f.duration_sec, &f.kind)?;
    Ok(())
}

fn on_finished(app: &AppHandle, f: Finished) {
    if let Err(e) = save_session(app, &f) {
        let _ = app.emit("app-error", &e);
    }
    let (notify, lang) = {
        let db = app.state::<Db>();
        let s = db.with(|c| settings::get_settings(c)).unwrap_or_default();
        (
            s.get("notifications").and_then(|v| v.as_bool()).unwrap_or(true),
            s.get("language").and_then(|v| v.as_str()).unwrap_or("ru").to_string(),
        )
    };
    if notify {
        let (title, body) = match (f.kind.as_str(), lang.as_str()) {
            ("work", "en") => ("Focus session complete", "Great work! Time for a break."),
            ("work", _) => ("Фокус-сессия завершена", "Отличная работа! Пора отдохнуть."),
            (_, "en") => ("Break is over", "Ready for the next focus session?"),
            (_, _) => ("Перерыв закончился", "Готовы к следующей фокус-сессии?"),
        };
        let _ = app.notification().builder().title(title).body(body).show();
    }
    let state = snapshot(app).ok();
    let _ = app.emit("timer-completed", json!({ "type": f.kind, "duration_sec": f.duration_sec, "state": state }));
    let _ = app.emit("sessions-changed", ());
    let _ = publish(app);
}

/// Background thread: drives the countdown even when the window is hidden in the tray.
pub fn spawn_ticker(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last: Option<(i64, super::timer::Phase)> = None;
        loop {
            std::thread::sleep(Duration::from_millis(250));
            let finished = with_timer(&app, |t| t.tick(Instant::now())).ok().flatten();
            if let Some(f) = finished {
                on_finished(&app, f);
                last = None;
                continue;
            }
            if let Ok(st) = snapshot(&app) {
                let key = (st.remaining_sec, st.phase);
                if st.phase == super::timer::Phase::Running && last != Some(key) {
                    let _ = app.emit("timer-state", &st);
                    tray::update(&app, &st);
                }
                last = Some(key);
            }
        }
    });
}
