use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection};
use serde_json::{json, Map, Value};

#[derive(Clone, Copy)]
enum Kind {
    Str(&'static [&'static str]),
    Int(i64, i64),
    Bool,
}

const SPEC: &[(&str, Kind, &str)] = &[
    ("language", Kind::Str(&["ru", "en"]), "ru"),
    ("theme", Kind::Str(&["light", "dark", "system"]), "system"),
    ("work_min", Kind::Int(1, 180), "25"),
    ("short_break_min", Kind::Int(1, 60), "5"),
    ("long_break_min", Kind::Int(1, 120), "15"),
    ("long_break_every", Kind::Int(2, 12), "4"),
    ("notifications", Kind::Bool, "true"),
    ("sound", Kind::Bool, "true"),
    ("auto_update", Kind::Bool, "true"),
    ("onboarded", Kind::Bool, "false"),
];

fn parse(kind: Kind, raw: &str) -> Value {
    match kind {
        Kind::Str(_) => json!(raw),
        Kind::Int(..) => json!(raw.parse::<i64>().unwrap_or(0)),
        Kind::Bool => json!(raw == "true"),
    }
}

pub fn get_settings(conn: &Connection) -> AppResult<Value> {
    let mut out = Map::new();
    for (key, kind, default) in SPEC {
        let stored: Option<String> =
            conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0)).ok();
        out.insert((*key).to_string(), parse(*kind, stored.as_deref().unwrap_or(default)));
    }
    Ok(Value::Object(out))
}

pub fn get_int(conn: &Connection, key: &str) -> i64 {
    get_settings(conn).ok().and_then(|s| s.get(key).and_then(Value::as_i64)).unwrap_or(0)
}

pub fn get_bool(conn: &Connection, key: &str) -> bool {
    get_settings(conn).ok().and_then(|s| s.get(key).and_then(Value::as_bool)).unwrap_or(false)
}

pub fn update_setting(conn: &Connection, key: &str, value: Value) -> AppResult<Value> {
    let (_, kind, _) = SPEC
        .iter()
        .find(|(k, _, _)| *k == key)
        .ok_or_else(|| AppError::validation(format!("Unknown setting: {key}")))?;
    let text = match *kind {
        Kind::Str(allowed) => {
            let s = value.as_str().ok_or_else(|| AppError::validation("Expected a string"))?;
            if !allowed.contains(&s) {
                return Err(AppError::validation(format!("Invalid value for {key}")));
            }
            s.to_string()
        }
        Kind::Int(min, max) => {
            let n = value.as_i64().ok_or_else(|| AppError::validation("Expected a number"))?;
            if n < min || n > max {
                return Err(AppError::validation(format!("{key} must be between {min} and {max}")));
            }
            n.to_string()
        }
        Kind::Bool => value.as_bool().ok_or_else(|| AppError::validation("Expected true or false"))?.to_string(),
    };
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, text],
    )?;
    get_settings(conn)
}
