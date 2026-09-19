use kairo_lib::db::models::*;
use kairo_lib::db::{analytics, backup, demo, notes, projects, search, sessions, settings, tasks, Db};
use serde_json::json;

fn setup() -> Db {
    Db::in_memory().expect("in-memory db")
}

fn new_project(c: &mut rusqlite::Connection, name: &str) -> Project {
    projects::create_project(
        c,
        NewProject { name: name.into(), description: String::new(), color: None, icon: None, status: None, columns: None },
    )
    .unwrap()
}

fn new_task(c: &mut rusqlite::Connection, p: &Project, col: i64, title: &str) -> Task {
    tasks::create_task(
        c,
        NewTask { project_id: p.id, column_id: col, title: title.into(), description: String::new(), priority: None, due_at: None, tags: vec![] },
    )
    .unwrap()
}

#[test]
fn project_gets_default_columns_and_last_is_done() {
    let db = setup();
    let mut c = db.lock().unwrap();
    let p = new_project(&mut c, "Alpha");
    let cols = projects::list_columns(&c, p.id).unwrap();
    assert_eq!(cols.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(), ["Backlog", "In Progress", "Done"]);
    assert_eq!(cols.iter().map(|c| c.is_done).collect::<Vec<_>>(), [false, false, true]);
}

#[test]
fn rejects_empty_names_and_bad_status() {
    let db = setup();
    let mut c = db.lock().unwrap();
    let err = projects::create_project(
        &mut c,
        NewProject { name: "  ".into(), description: String::new(), color: None, icon: None, status: None, columns: None },
    )
    .unwrap_err();
    assert_eq!(err.code, "VALIDATION");
    let p = new_project(&mut c, "P");
    let err = projects::update_project(&c, p.id, ProjectPatch { status: Some("weird".into()), ..Default::default() }).unwrap_err();
    assert_eq!(err.code, "VALIDATION");
}

#[test]
fn move_task_renumbers_columns_and_tracks_completion() {
    let db = setup();
    let mut c = db.lock().unwrap();
    let p = new_project(&mut c, "Board");
    let cols = projects::list_columns(&c, p.id).unwrap();
    let (backlog, progress, done) = (cols[0].id, cols[1].id, cols[2].id);
    let a = new_task(&mut c, &p, backlog, "A");
    let b = new_task(&mut c, &p, backlog, "B");
    let d = new_task(&mut c, &p, backlog, "C");
    assert_eq!([a.position, b.position, d.position], [0, 1, 2]);

    // Move B into "In Progress", then C in front of it.
    tasks::move_task(&mut c, b.id, progress, 0).unwrap();
    tasks::move_task(&mut c, d.id, progress, 0).unwrap();
    let all = tasks::list_tasks(&c, Some(p.id)).unwrap();
    let in_col = |col: i64| all.iter().filter(|t| t.column_id == col).map(|t| (t.title.clone(), t.position)).collect::<Vec<_>>();
    assert_eq!(in_col(backlog), [("A".to_string(), 0)]);
    assert_eq!(in_col(progress), [("C".to_string(), 0), ("B".to_string(), 1)]);

    // Reorder inside a column.
    tasks::move_task(&mut c, b.id, progress, 0).unwrap();
    let all = tasks::list_tasks(&c, Some(p.id)).unwrap();
    assert_eq!(all.iter().filter(|t| t.column_id == progress).map(|t| t.title.as_str()).collect::<Vec<_>>(), ["B", "C"]);

    // Completion is set when entering the done column and cleared when leaving.
    let moved = tasks::move_task(&mut c, b.id, done, 99).unwrap();
    assert!(moved.completed_at.is_some());
    assert_eq!(moved.position, 0, "position is clamped to the column length");
    let back = tasks::move_task(&mut c, b.id, backlog, 0).unwrap();
    assert!(back.completed_at.is_none());
}

#[test]
fn cannot_move_task_to_another_projects_column() {
    let db = setup();
    let mut c = db.lock().unwrap();
    let p1 = new_project(&mut c, "One");
    let p2 = new_project(&mut c, "Two");
    let c1 = projects::list_columns(&c, p1.id).unwrap()[0].id;
    let c2 = projects::list_columns(&c, p2.id).unwrap()[0].id;
    let t = new_task(&mut c, &p1, c1, "T");
    assert_eq!(tasks::move_task(&mut c, t.id, c2, 0).unwrap_err().code, "VALIDATION");
}

#[test]
fn deleting_a_non_empty_column_requires_a_target() {
    let db = setup();
    let mut c = db.lock().unwrap();
    let p = new_project(&mut c, "P");
    let cols = projects::list_columns(&c, p.id).unwrap();
    let t = new_task(&mut c, &p, cols[0].id, "T");
    assert_eq!(projects::delete_column(&mut c, cols[0].id, None).unwrap_err().code, "VALIDATION");
    projects::delete_column(&mut c, cols[0].id, Some(cols[2].id)).unwrap();
    let t = tasks::get_task(&c, t.id).unwrap();
    assert_eq!(t.column_id, cols[2].id);
    assert!(t.completed_at.is_some(), "moved into the done column");
    let left = projects::list_columns(&c, p.id).unwrap();
    assert_eq!(left.iter().map(|c| c.position).collect::<Vec<_>>(), [0, 1]);
}

#[test]
fn tags_are_case_insensitive_and_shared() {
    let db = setup();
    let mut c = db.lock().unwrap();
    let p = new_project(&mut c, "P");
    let col = projects::list_columns(&c, p.id).unwrap()[0].id;
    let t = tasks::create_task(
        &mut c,
        NewTask { project_id: p.id, column_id: col, title: "x".into(), description: String::new(), priority: Some("high".into()), due_at: Some("2026-10-01".into()), tags: vec!["Work".into(), "#work".into(), " urgent ".into()] },
    )
    .unwrap();
    assert_eq!(t.tags.len(), 2);
    let t2 = tasks::update_task(&mut c, t.id, TaskPatch { tags: Some(vec!["WORK".into()]), ..Default::default() }).unwrap();
    assert_eq!(t2.tags.len(), 1);
    assert_eq!(tasks::list_tags(&c).unwrap().len(), 2);
    // Clearing the deadline through `due_at: null`.
    let cleared: TaskPatch = serde_json::from_value(json!({ "due_at": null })).unwrap();
    assert!(tasks::update_task(&mut c, t.id, cleared).unwrap().due_at.is_none());
    let untouched: TaskPatch = serde_json::from_value(json!({ "title": "renamed" })).unwrap();
    let after = tasks::update_task(&mut c, t.id, untouched).unwrap();
    assert_eq!(after.title, "renamed");
}

#[test]
fn notes_link_to_tasks_and_are_searchable() {
    let db = setup();
    let mut c = db.lock().unwrap();
    let p = new_project(&mut c, "P");
    let col = projects::list_columns(&c, p.id).unwrap()[0].id;
    let t = new_task(&mut c, &p, col, "Write docs");
    let n = notes::create_note(
        &mut c,
        NoteInput { title: "Design".into(), content: "# Heading\nunique-needle 100%".into(), project_id: Some(p.id), tags: vec!["idea".into()], task_ids: vec![t.id, 9999] },
    )
    .unwrap();
    assert_eq!(n.task_ids, [t.id], "unknown task ids are ignored");
    assert_eq!(tasks::get_task(&c, t.id).unwrap().note_ids, [n.id]);
    assert_eq!(notes::search_notes(&c, "unique-needle").unwrap().len(), 1);
    assert_eq!(notes::search_notes(&c, "100%").unwrap().len(), 1, "LIKE wildcards are escaped");
    assert_eq!(notes::search_notes(&c, "%").unwrap().len(), 1);
    assert_eq!(notes::search_notes(&c, "IDEA").unwrap().len(), 1, "search matches tags");
    let saved = notes::save_note(&mut c, n.id, NoteInput { title: "Design v2".into(), content: "changed".into(), project_id: None, tags: vec![], task_ids: vec![] }).unwrap();
    assert!(saved.task_ids.is_empty() && saved.tags.is_empty() && saved.project_id.is_none());
    assert!(tasks::get_task(&c, t.id).unwrap().note_ids.is_empty());
    let hits = search::global_search(&c, "docs").unwrap();
    assert_eq!(hits.tasks.len(), 1);
    // Deleting a project keeps its notes.
    let n2 = notes::create_note(&mut c, NoteInput { title: "Keep".into(), content: String::new(), project_id: Some(p.id), tags: vec![], task_ids: vec![] }).unwrap();
    projects::delete_project(&c, p.id).unwrap();
    assert!(notes::get_note(&c, n2.id).unwrap().project_id.is_none());
    assert!(tasks::list_tasks(&c, None).unwrap().is_empty());
}

#[test]
fn analytics_groups_by_local_day() {
    let db = setup();
    let mut c = db.lock().unwrap();
    let p = new_project(&mut c, "P");
    let col = projects::list_columns(&c, p.id).unwrap()[0].id;
    let t = new_task(&mut c, &p, col, "T");
    // 23:30 UTC on Sep 1 is already Sep 2 in UTC+3.
    sessions::insert_session(&c, Some(t.id), Some(p.id), "2026-09-01T23:30:00.000Z", "2026-09-01T23:55:00.000Z", 1500, "work").unwrap();
    sessions::insert_session(&c, Some(t.id), Some(p.id), "2026-09-02T10:00:00.000Z", "2026-09-02T10:25:00.000Z", 1500, "work").unwrap();
    sessions::insert_session(&c, None, Some(p.id), "2026-09-02T11:00:00.000Z", "2026-09-02T11:05:00.000Z", 300, "short_break").unwrap();
    let utc = analytics::get_analytics(&c, "2026-09-01", "2026-09-03", 0).unwrap();
    assert_eq!(utc.days.iter().map(|d| d.sessions).collect::<Vec<_>>(), [1, 1, 0]);
    let msk = analytics::get_analytics(&c, "2026-09-01", "2026-09-03", 180).unwrap();
    assert_eq!(msk.days.iter().map(|d| d.sessions).collect::<Vec<_>>(), [0, 2, 0]);
    assert_eq!(msk.focus_sec, 3000, "breaks are not counted as focus time");
    assert_eq!(msk.by_project.len(), 1);
    assert_eq!(msk.by_project[0].focus_sec, 3000);
    assert!(analytics::get_analytics(&c, "2026-09-03", "2026-09-01", 0).is_err());
    assert!(analytics::get_analytics(&c, "not-a-date", "2026-09-01", 0).is_err());
}

#[test]
fn settings_are_validated() {
    let db = setup();
    let c = db.lock().unwrap();
    let s = settings::get_settings(&c).unwrap();
    assert_eq!(s["work_min"], 25);
    assert_eq!(settings::update_setting(&c, "theme", json!("dark")).unwrap()["theme"], "dark");
    assert!(settings::update_setting(&c, "theme", json!("neon")).is_err());
    assert!(settings::update_setting(&c, "work_min", json!(0)).is_err());
    assert!(settings::update_setting(&c, "work_min", json!("25")).is_err());
    assert!(settings::update_setting(&c, "nope", json!(1)).is_err());
}

fn snapshot(c: &rusqlite::Connection) -> serde_json::Value {
    let mut v = backup::export_value(c).unwrap();
    v.as_object_mut().unwrap().remove("exported_at");
    v
}

#[test]
fn export_then_import_restores_everything() {
    let src = setup();
    {
        let mut c = src.lock().unwrap();
        demo::load_demo(&mut c, "en").unwrap();
        settings::update_setting(&c, "theme", json!("dark")).unwrap();
    }
    let exported = backup::export_value(&src.lock().unwrap()).unwrap();

    let dst = setup();
    let summary = backup::import_value(&mut dst.lock().unwrap(), &exported).unwrap();
    assert_eq!(summary.projects, 3);
    assert!(summary.tasks >= 10 && summary.notes == 3 && summary.sessions > 5);
    assert_eq!(snapshot(&src.lock().unwrap()), snapshot(&dst.lock().unwrap()));
    // Import replaces, it does not merge.
    backup::import_value(&mut dst.lock().unwrap(), &exported).unwrap();
    assert_eq!(projects::list_projects(&dst.lock().unwrap()).unwrap().len(), 3);
}

#[test]
fn invalid_backups_are_rejected_without_touching_data() {
    let db = setup();
    {
        let mut c = db.lock().unwrap();
        new_project(&mut c, "Precious");
    }
    let good = backup::export_value(&db.lock().unwrap()).unwrap();

    let mut wrong_format = good.clone();
    wrong_format["format"] = json!("something-else");
    let mut bad_column = good.clone();
    bad_column["tables"]["projects"][0]["name"] = json!(42);
    let mut missing_table = good.clone();
    missing_table["tables"].as_object_mut().unwrap().remove("tasks");
    let mut future = good.clone();
    future["version"] = json!(99);
    let mut dangling = good.clone();
    dangling["tables"]["columns"][0]["project_id"] = json!(12345);

    for (label, bad) in [("format", wrong_format), ("column type", bad_column), ("missing table", missing_table), ("version", future), ("dangling reference", dangling)] {
        let err = backup::import_value(&mut db.lock().unwrap(), &bad).expect_err(label);
        assert_eq!(err.code, "INVALID_BACKUP", "{label}");
        let list = projects::list_projects(&db.lock().unwrap()).unwrap();
        assert_eq!(list.len(), 1, "{label}: data must be untouched");
        assert_eq!(list[0].project.name, "Precious");
    }
    assert!(backup::validate_value(&json!([1, 2])).is_err());
}

#[test]
fn file_roundtrip_makes_a_safety_copy_and_sqlite_backup_works() {
    let dir = std::env::temp_dir().join(format!("kairo-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let db = setup();
    {
        let mut c = db.lock().unwrap();
        new_project(&mut c, "FileTest");
    }
    let json_path = dir.join("backup.json");
    backup::export_to_file(&db.lock().unwrap(), &json_path).unwrap();
    assert_eq!(backup::validate_file(&json_path).unwrap().projects, 1);

    let other = setup();
    {
        let mut c = other.lock().unwrap();
        new_project(&mut c, "Old");
    }
    let safety = dir.join("safety");
    backup::import_file(&mut other.lock().unwrap(), &json_path, Some(&safety)).unwrap();
    assert_eq!(projects::list_projects(&other.lock().unwrap()).unwrap()[0].project.name, "FileTest");
    assert_eq!(std::fs::read_dir(&safety).unwrap().count(), 1, "previous data saved before import");

    let sqlite_path = dir.join("copy.db");
    backup::backup_database(&db.lock().unwrap(), &sqlite_path).unwrap();
    backup::backup_database(&db.lock().unwrap(), &sqlite_path).unwrap(); // overwrite is allowed
    let copy = rusqlite::Connection::open(&sqlite_path).unwrap();
    let n: i64 = copy.query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0)).unwrap();
    assert_eq!(n, 1);

    let garbage = dir.join("garbage.json");
    std::fs::write(&garbage, "not json").unwrap();
    assert_eq!(backup::validate_file(&garbage).unwrap_err().code, "INVALID_BACKUP");
    assert_eq!(backup::validate_file(&dir.join("missing.json")).unwrap_err().code, "FILE_NOT_FOUND");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn reset_keeps_settings_and_workspace() {
    let db = setup();
    let mut c = db.lock().unwrap();
    demo::load_demo(&mut c, "ru").unwrap();
    settings::update_setting(&c, "language", json!("en")).unwrap();
    backup::reset_all(&mut c).unwrap();
    assert!(projects::list_projects(&c).unwrap().is_empty());
    assert_eq!(settings::get_settings(&c).unwrap()["language"], "en");
    let p = new_project(&mut c, "After reset");
    assert_eq!(p.workspace_id, 1);
}

#[test]
fn migrations_are_idempotent() {
    let db = setup();
    let c = db.lock().unwrap();
    kairo_lib::db::migrate(&c).unwrap();
    let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
    assert_eq!(v as usize, kairo_lib::db::schema_version());
}

#[test]
fn file_references_report_missing_files() {
    let db = setup();
    let mut c = db.lock().unwrap();
    let p = new_project(&mut c, "P");
    let here = std::env::current_dir().unwrap();
    let f = kairo_lib::db::files::add_file_reference(&c, p.id, here.to_str().unwrap(), None).unwrap();
    assert!(f.exists);
    assert_eq!(kairo_lib::db::files::add_file_reference(&c, p.id, here.to_str().unwrap(), None).unwrap_err().code, "DUPLICATE");
    assert_eq!(kairo_lib::db::files::add_file_reference(&c, p.id, "Z:/definitely/not/here.txt", None).unwrap_err().code, "FILE_NOT_FOUND");
}
