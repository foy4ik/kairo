//! Pomodoro state machine. Pure logic with an injected clock so it can be unit-tested;
//! the Tauri wiring (ticking, persistence, notifications) lives in `services::runtime`.

use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::time::Instant;

/// Stopped work sessions shorter than this are discarded instead of polluting the history.
pub const MIN_SAVED_SEC: i64 = 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Idle,
    Running,
    Paused,
    Completed,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct TimerState {
    pub phase: Phase,
    #[serde(rename = "type")]
    pub kind: String,
    pub next_type: String,
    pub task_id: Option<i64>,
    pub project_id: Option<i64>,
    pub total_sec: i64,
    pub remaining_sec: i64,
    pub started_at: Option<String>,
    pub completed_work_sessions: i64,
    /// Work sessions per long break, for the cycle currently running (may be a one-off override).
    pub long_break_every: i64,
}

/// A finished (or stopped) session ready to be written to history.
#[derive(Debug, Clone, PartialEq)]
pub struct Finished {
    pub kind: String,
    pub task_id: Option<i64>,
    pub project_id: Option<i64>,
    pub started_at: String,
    pub ended_at: String,
    pub duration_sec: i64,
}

pub struct Timer {
    phase: Phase,
    kind: String,
    task_id: Option<i64>,
    project_id: Option<i64>,
    total_ms: i64,
    elapsed_ms: i64,
    resumed_at: Option<Instant>,
    started_at: Option<String>,
    completed_work: i64,
    long_every: i64,
}

fn iso_now() -> String {
    crate::db::now()
}

pub fn valid_kind(kind: &str) -> bool {
    matches!(kind, "work" | "short_break" | "long_break")
}

impl Timer {
    pub fn new() -> Self {
        Timer {
            phase: Phase::Idle,
            kind: "work".into(),
            task_id: None,
            project_id: None,
            total_ms: 0,
            elapsed_ms: 0,
            resumed_at: None,
            started_at: None,
            completed_work: 0,
            long_every: 4,
        }
    }

    fn elapsed_at(&self, now: Instant) -> i64 {
        let running = self.resumed_at.map(|t| now.saturating_duration_since(t).as_millis() as i64).unwrap_or(0);
        (self.elapsed_ms + running).min(self.total_ms)
    }

    fn next_kind(&self) -> String {
        if self.kind == "work" {
            let after = if self.phase == Phase::Completed { self.completed_work } else { self.completed_work + 1 };
            if self.long_every > 0 && after > 0 && after % self.long_every == 0 {
                "long_break".into()
            } else {
                "short_break".into()
            }
        } else {
            "work".into()
        }
    }

    pub fn state(&self, now: Instant) -> TimerState {
        let remaining_ms = match self.phase {
            Phase::Idle => 0,
            Phase::Completed => 0,
            _ => (self.total_ms - self.elapsed_at(now)).max(0),
        };
        TimerState {
            phase: self.phase,
            kind: self.kind.clone(),
            next_type: self.next_kind(),
            task_id: self.task_id,
            project_id: self.project_id,
            total_sec: self.total_ms / 1000,
            // Round up so the display never shows 00:00 while the timer is still running.
            remaining_sec: (remaining_ms + 999) / 1000,
            started_at: self.started_at.clone(),
            completed_work_sessions: self.completed_work,
            long_break_every: self.long_every,
        }
    }

    pub fn is_active(&self) -> bool {
        matches!(self.phase, Phase::Running | Phase::Paused)
    }

    pub fn start(
        &mut self,
        now: Instant,
        kind: &str,
        task_id: Option<i64>,
        project_id: Option<i64>,
        total_sec: i64,
        long_every: i64,
    ) -> AppResult<()> {
        if self.is_active() {
            return Err(AppError::new("TIMER_BUSY", "A session is already in progress"));
        }
        if !valid_kind(kind) {
            return Err(AppError::validation("Unknown session type"));
        }
        if !(1..=6 * 3600).contains(&total_sec) {
            return Err(AppError::validation("Duration must be between 1 second and 6 hours"));
        }
        self.phase = Phase::Running;
        self.kind = kind.to_string();
        self.task_id = task_id;
        self.project_id = project_id;
        self.total_ms = total_sec * 1000;
        self.elapsed_ms = 0;
        self.resumed_at = Some(now);
        self.started_at = Some(iso_now());
        self.long_every = long_every;
        Ok(())
    }

    pub fn pause(&mut self, now: Instant) -> AppResult<()> {
        if self.phase != Phase::Running {
            return Err(AppError::new("TIMER_STATE", "The timer is not running"));
        }
        self.elapsed_ms = self.elapsed_at(now);
        self.resumed_at = None;
        self.phase = Phase::Paused;
        Ok(())
    }

    pub fn resume(&mut self, now: Instant) -> AppResult<()> {
        if self.phase != Phase::Paused {
            return Err(AppError::new("TIMER_STATE", "The timer is not paused"));
        }
        self.resumed_at = Some(now);
        self.phase = Phase::Running;
        Ok(())
    }

    /// Stops the current session. Returns what should be persisted, if anything.
    pub fn stop(&mut self, now: Instant) -> Option<Finished> {
        if !self.is_active() {
            self.phase = Phase::Idle;
            return None;
        }
        let elapsed_sec = self.elapsed_at(now) / 1000;
        let finished = if self.kind == "work" && elapsed_sec >= MIN_SAVED_SEC {
            Some(self.finished(elapsed_sec))
        } else {
            None
        };
        self.phase = Phase::Idle;
        self.resumed_at = None;
        self.elapsed_ms = 0;
        finished
    }

    fn finished(&self, duration_sec: i64) -> Finished {
        Finished {
            kind: self.kind.clone(),
            task_id: self.task_id,
            project_id: self.project_id,
            started_at: self.started_at.clone().unwrap_or_else(iso_now),
            ended_at: iso_now(),
            duration_sec,
        }
    }

    /// Advances the clock. Returns the finished session exactly once, when time runs out.
    pub fn tick(&mut self, now: Instant) -> Option<Finished> {
        if self.phase != Phase::Running || self.elapsed_at(now) < self.total_ms {
            return None;
        }
        let done = self.finished(self.total_ms / 1000);
        self.phase = Phase::Completed;
        self.resumed_at = None;
        self.elapsed_ms = self.total_ms;
        if self.kind == "work" {
            self.completed_work += 1;
        }
        Some(done)
    }

    /// Clears a completed session so the UI returns to idle.
    pub fn dismiss(&mut self) {
        if self.phase == Phase::Completed {
            self.phase = Phase::Idle;
        }
    }
}

impl Default for Timer {
    fn default() -> Self {
        Self::new()
    }
}

pub fn format_mmss(sec: i64) -> String {
    let s = sec.max(0);
    format!("{:02}:{:02}", s / 60, s % 60)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn at(base: Instant, secs: u64) -> Instant {
        base + Duration::from_secs(secs)
    }

    #[test]
    fn counts_down_and_completes_once() {
        let t0 = Instant::now();
        let mut t = Timer::new();
        t.start(t0, "work", Some(1), Some(1), 1500, 4).unwrap();
        assert_eq!(t.state(at(t0, 100)).remaining_sec, 1400);
        assert!(t.tick(at(t0, 1499)).is_none());
        let done = t.tick(at(t0, 1500)).expect("completes");
        assert_eq!(done.duration_sec, 1500);
        assert_eq!(t.state(at(t0, 1501)).phase, Phase::Completed);
        assert!(t.tick(at(t0, 1600)).is_none(), "must not complete twice");
        assert_eq!(t.state(at(t0, 1600)).completed_work_sessions, 1);
    }

    #[test]
    fn pause_freezes_the_clock() {
        let t0 = Instant::now();
        let mut t = Timer::new();
        t.start(t0, "work", None, None, 600, 4).unwrap();
        t.pause(at(t0, 100)).unwrap();
        assert_eq!(t.state(at(t0, 5000)).remaining_sec, 500);
        t.resume(at(t0, 5000)).unwrap();
        assert_eq!(t.state(at(t0, 5100)).remaining_sec, 400);
    }

    #[test]
    fn short_stop_is_discarded_long_stop_is_saved() {
        let t0 = Instant::now();
        let mut t = Timer::new();
        t.start(t0, "work", Some(3), Some(2), 1500, 4).unwrap();
        assert!(t.stop(at(t0, 30)).is_none());
        t.start(at(t0, 40), "work", Some(3), Some(2), 1500, 4).unwrap();
        let f = t.stop(at(t0, 40 + 300)).expect("saved");
        assert_eq!(f.duration_sec, 300);
        assert_eq!(f.task_id, Some(3));
        assert_eq!(t.state(at(t0, 500)).phase, Phase::Idle);
    }

    #[test]
    fn stopped_break_is_never_saved() {
        let t0 = Instant::now();
        let mut t = Timer::new();
        t.start(t0, "short_break", None, None, 300, 4).unwrap();
        assert!(t.stop(at(t0, 200)).is_none());
    }

    #[test]
    fn long_break_follows_every_nth_work_session() {
        let t0 = Instant::now();
        let mut t = Timer::new();
        let mut clock = 0;
        for i in 1..=4 {
            t.start(at(t0, clock), "work", None, None, 10, 4).unwrap();
            clock += 10;
            assert!(t.tick(at(t0, clock)).is_some());
            let expected = if i == 4 { "long_break" } else { "short_break" };
            assert_eq!(t.state(at(t0, clock)).next_type, expected, "after session {i}");
            t.dismiss();
        }
    }

    #[test]
    fn long_every_is_per_start_not_fixed() {
        // A one-off override (6 instead of the usual 4) is honoured for that run and reported back in the state.
        let t0 = Instant::now();
        let mut t = Timer::new();
        let mut clock = 0;
        for i in 1..=6 {
            t.start(at(t0, clock), "work", None, None, 10, 6).unwrap();
            assert_eq!(t.state(at(t0, clock)).long_break_every, 6);
            clock += 10;
            assert!(t.tick(at(t0, clock)).is_some());
            let expected = if i == 6 { "long_break" } else { "short_break" };
            assert_eq!(t.state(at(t0, clock)).next_type, expected, "after session {i}");
            t.dismiss();
        }
    }

    #[test]
    fn cannot_start_twice_and_rejects_bad_input() {
        let t0 = Instant::now();
        let mut t = Timer::new();
        t.start(t0, "work", None, None, 60, 4).unwrap();
        assert_eq!(t.start(t0, "work", None, None, 60, 4).unwrap_err().code, "TIMER_BUSY");
        let mut t = Timer::new();
        assert!(t.start(t0, "nap", None, None, 60, 4).is_err());
        assert!(t.start(t0, "work", None, None, 0, 4).is_err());
    }

    #[test]
    fn formats_mmss() {
        assert_eq!(format_mmss(1500), "25:00");
        assert_eq!(format_mmss(65), "01:05");
        assert_eq!(format_mmss(-3), "00:00");
    }
}
