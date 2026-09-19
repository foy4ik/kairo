use crate::error::{AppError, AppResult};
use chrono::{Duration, NaiveDate};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::{BTreeSet, HashMap};

#[derive(Debug, Serialize)]
pub struct DayStat {
    pub date: String,
    pub focus_sec: i64,
    pub sessions: i64,
    pub completed_tasks: i64,
}

#[derive(Debug, Serialize)]
pub struct BreakdownItem {
    pub id: Option<i64>,
    pub name: String,
    pub color: String,
    pub focus_sec: i64,
}

#[derive(Debug, Serialize)]
pub struct Analytics {
    pub from: String,
    pub to: String,
    pub completed_tasks: i64,
    pub sessions: i64,
    pub focus_sec: i64,
    pub streak: i64,
    pub days: Vec<DayStat>,
    pub by_project: Vec<BreakdownItem>,
    pub by_tag: Vec<BreakdownItem>,
}

fn parse_day(s: &str) -> AppResult<NaiveDate> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|_| AppError::validation("Dates must be YYYY-MM-DD"))
}

fn offset(tz_offset_min: i64) -> String {
    format!("{:+} minutes", tz_offset_min)
}

/// Consecutive days (ending today or yesterday) that contain at least one work session.
pub fn compute_streak(days: &BTreeSet<NaiveDate>, today: NaiveDate) -> i64 {
    let mut cursor = if days.contains(&today) { today } else { today - Duration::days(1) };
    let mut n = 0;
    while days.contains(&cursor) {
        n += 1;
        cursor -= Duration::days(1);
    }
    n
}

/// Aggregates focus and completion stats for the inclusive local-date range `[from, to]`.
/// `tz_offset_min` is the user's offset from UTC in minutes (east positive).
pub fn get_analytics(conn: &Connection, from: &str, to: &str, tz_offset_min: i64) -> AppResult<Analytics> {
    let start = parse_day(from)?;
    let end = parse_day(to)?;
    if end < start {
        return Err(AppError::validation("Period end is before its start"));
    }
    if (end - start).num_days() > 3660 {
        return Err(AppError::validation("Period is too long"));
    }
    let tz = offset(tz_offset_min);

    let mut days: HashMap<String, DayStat> = HashMap::new();
    let mut d = start;
    while d <= end {
        let key = d.to_string();
        days.insert(key.clone(), DayStat { date: key, focus_sec: 0, sessions: 0, completed_tasks: 0 });
        d += Duration::days(1);
    }

    let mut stmt = conn.prepare(
        "SELECT date(started_at, ?1) AS d, COUNT(*), COALESCE(SUM(duration_sec), 0)
         FROM focus_sessions WHERE type = 'work' AND d BETWEEN ?2 AND ?3 GROUP BY d",
    )?;
    for row in stmt.query_map(params![tz, from, to], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?)))? {
        let (date, n, sec) = row?;
        if let Some(s) = days.get_mut(&date) {
            s.sessions = n;
            s.focus_sec = sec;
        }
    }
    let mut stmt = conn.prepare(
        "SELECT date(completed_at, ?1) AS d, COUNT(*) FROM tasks
         WHERE completed_at IS NOT NULL AND d BETWEEN ?2 AND ?3 GROUP BY d",
    )?;
    for row in stmt.query_map(params![tz, from, to], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))? {
        let (date, n) = row?;
        if let Some(s) = days.get_mut(&date) {
            s.completed_tasks = n;
        }
    }

    let mut list: Vec<DayStat> = days.into_values().collect();
    list.sort_by(|a, b| a.date.cmp(&b.date));

    let mut stmt = conn.prepare(
        "SELECT p.id, COALESCE(p.name, ''), COALESCE(p.color, '#94a3b8'), SUM(f.duration_sec) AS s
         FROM focus_sessions f LEFT JOIN projects p ON p.id = f.project_id
         WHERE f.type = 'work' AND date(f.started_at, ?1) BETWEEN ?2 AND ?3
         GROUP BY p.id ORDER BY s DESC",
    )?;
    let by_project = stmt
        .query_map(params![tz, from, to], |r| {
            Ok(BreakdownItem { id: r.get(0)?, name: r.get(1)?, color: r.get(2)?, focus_sec: r.get(3)? })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut stmt = conn.prepare(
        "SELECT g.id, g.name, g.color, SUM(f.duration_sec) AS s
         FROM focus_sessions f JOIN task_tags tt ON tt.task_id = f.task_id JOIN tags g ON g.id = tt.tag_id
         WHERE f.type = 'work' AND date(f.started_at, ?1) BETWEEN ?2 AND ?3
         GROUP BY g.id ORDER BY s DESC",
    )?;
    let by_tag = stmt
        .query_map(params![tz, from, to], |r| {
            Ok(BreakdownItem { id: r.get(0)?, name: r.get(1)?, color: r.get(2)?, focus_sec: r.get(3)? })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut stmt = conn.prepare("SELECT DISTINCT date(started_at, ?1) FROM focus_sessions WHERE type = 'work'")?;
    let all_days: BTreeSet<NaiveDate> = stmt
        .query_map([&tz], |r| r.get::<_, String>(0))?
        .filter_map(|r| r.ok())
        .filter_map(|s| NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok())
        .collect();
    let today = (chrono::Utc::now() + Duration::minutes(tz_offset_min)).date_naive();

    Ok(Analytics {
        from: from.to_string(),
        to: to.to_string(),
        completed_tasks: list.iter().map(|d| d.completed_tasks).sum(),
        sessions: list.iter().map(|d| d.sessions).sum(),
        focus_sec: list.iter().map(|d| d.focus_sec).sum(),
        streak: compute_streak(&all_days, today),
        days: list,
        by_project,
        by_tag,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn streak_counts_consecutive_days_ending_today() {
        let days: BTreeSet<_> = ["2026-09-17", "2026-09-18", "2026-09-19"].iter().map(|s| d(s)).collect();
        assert_eq!(compute_streak(&days, d("2026-09-19")), 3);
    }

    #[test]
    fn streak_survives_until_end_of_today() {
        let days: BTreeSet<_> = ["2026-09-17", "2026-09-18"].iter().map(|s| d(s)).collect();
        assert_eq!(compute_streak(&days, d("2026-09-19")), 2);
    }

    #[test]
    fn streak_resets_after_a_gap() {
        let days: BTreeSet<_> = ["2026-09-15", "2026-09-16"].iter().map(|s| d(s)).collect();
        assert_eq!(compute_streak(&days, d("2026-09-19")), 0);
    }
}
