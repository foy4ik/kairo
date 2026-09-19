//! Demo workspace: lets a new user see Projects → Tasks → Notes → Focus → Analytics in one minute.

use super::models::*;
use super::{notes, projects, sessions, tasks};
use crate::error::AppResult;
use chrono::{Duration, Utc};
use rusqlite::{params, Connection};

fn t<'a>(lang: &str, ru: &'a str, en: &'a str) -> &'a str {
    if lang == "en" {
        en
    } else {
        ru
    }
}

struct Demo<'a> {
    lang: &'a str,
}

impl Demo<'_> {
    fn s(&self, ru: &'static str, en: &'static str) -> String {
        t(self.lang, ru, en).to_string()
    }
}

fn days_ago(n: i64, hour: i64) -> String {
    let base = Utc::now().date_naive().and_hms_opt(0, 0, 0).unwrap().and_utc();
    (base - Duration::days(n) + Duration::hours(hour)).to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn in_days(n: i64) -> String {
    (Utc::now() + Duration::days(n)).format("%Y-%m-%d").to_string()
}

pub fn load_demo(conn: &mut Connection, lang: &str) -> AppResult<()> {
    let d = Demo { lang };
    let cols = vec![d.s("Бэклог", "Backlog"), d.s("В работе", "In Progress"), d.s("Готово", "Done")];

    let launch = projects::create_project(
        conn,
        NewProject {
            name: d.s("Запуск Kairo", "Kairo Launch"),
            description: d.s(
                "Подготовка релиза десктопного приложения: сборка, документация, демо.",
                "Preparing the desktop app release: build, docs, demo.",
            ),
            color: Some("#6366f1".into()),
            icon: Some("rocket".into()),
            status: None,
            columns: Some(cols.clone()),
        },
    )?;
    let site = projects::create_project(
        conn,
        NewProject {
            name: d.s("Сайт-портфолио", "Portfolio Website"),
            description: d.s("Личный сайт с кейсами и блогом.", "Personal site with case studies and a blog."),
            color: Some("#10b981".into()),
            icon: Some("globe".into()),
            status: None,
            columns: Some(cols.clone()),
        },
    )?;
    let rust = projects::create_project(
        conn,
        NewProject {
            name: d.s("Изучение Rust", "Learn Rust"),
            description: d.s("Книга, упражнения и небольшой CLI-проект.", "The book, exercises and a small CLI project."),
            color: Some("#f59e0b".into()),
            icon: Some("book".into()),
            status: Some("active".into()),
            columns: Some(cols),
        },
    )?;

    let col = |p: i64, i: usize| -> AppResult<i64> { Ok(projects::list_columns(conn, p)?[i].id) };
    let (l0, l1, l2) = (col(launch.id, 0)?, col(launch.id, 1)?, col(launch.id, 2)?);
    let (s0, s1, s2) = (col(site.id, 0)?, col(site.id, 1)?, col(site.id, 2)?);
    let (r0, r1, r2) = (col(rust.id, 0)?, col(rust.id, 1)?, col(rust.id, 2)?);

    struct T {
        p: i64,
        c: i64,
        title: String,
        desc: String,
        prio: &'static str,
        due: Option<String>,
        tags: Vec<&'static str>,
        subs: Vec<(String, bool)>,
        done_ago: Option<i64>,
    }
    let list = vec![
        T { p: launch.id, c: l2, title: d.s("Спроектировать схему БД", "Design the database schema"), desc: d.s("Таблицы, связи и миграции.", "Tables, relations and migrations."), prio: "high", due: None, tags: vec!["backend"], subs: vec![], done_ago: Some(6) },
        T { p: launch.id, c: l2, title: d.s("Собрать канбан-доску", "Build the Kanban board"), desc: d.s("Drag & drop между колонками и сохранение порядка.", "Drag & drop between columns with persistent order."), prio: "high", due: None, tags: vec!["frontend"], subs: vec![], done_ago: Some(4) },
        T { p: launch.id, c: l1, title: d.s("Реализовать фокус-таймер", "Implement the focus timer"), desc: d.s("Work / Short break / Long break, трей и уведомления.", "Work / Short break / Long break, tray and notifications."), prio: "high", due: Some(in_days(1)), tags: vec!["frontend", "native"], subs: vec![(d.s("Логика таймера в Rust", "Timer logic in Rust"), true), (d.s("Иконка в трее", "Tray icon"), true), (d.s("Системные уведомления", "System notifications"), false)], done_ago: None },
        T { p: launch.id, c: l1, title: d.s("Написать README и кейс", "Write the README and case study"), desc: d.s("Архитектура, запуск, ключевые решения.", "Architecture, setup, key decisions."), prio: "medium", due: Some(in_days(3)), tags: vec!["docs"], subs: vec![], done_ago: None },
        T { p: launch.id, c: l0, title: d.s("Записать демо-ролик", "Record the demo video"), desc: d.s("30–60 секунд: dashboard → канбан → фокус → аналитика.", "30–60 seconds: dashboard → kanban → focus → analytics."), prio: "medium", due: Some(in_days(6)), tags: vec!["docs"], subs: vec![], done_ago: None },
        T { p: launch.id, c: l0, title: d.s("Собрать установщик для Windows", "Build the Windows installer"), desc: String::new(), prio: "low", due: None, tags: vec!["native"], subs: vec![], done_ago: None },
        T { p: site.id, c: s2, title: d.s("Выбрать стек и хостинг", "Choose the stack and hosting"), desc: String::new(), prio: "medium", due: None, tags: vec!["frontend"], subs: vec![], done_ago: Some(5) },
        T { p: site.id, c: s1, title: d.s("Нарисовать главную страницу", "Design the home page"), desc: d.s("Герой-блок, кейсы, контакты.", "Hero, case studies, contacts."), prio: "high", due: Some(in_days(2)), tags: vec!["design"], subs: vec![(d.s("Макет в Figma", "Figma mockup"), true), (d.s("Адаптивная вёрстка", "Responsive layout"), false)], done_ago: None },
        T { p: site.id, c: s0, title: d.s("Написать первую статью", "Write the first article"), desc: String::new(), prio: "low", due: None, tags: vec!["docs"], subs: vec![], done_ago: None },
        T { p: site.id, c: s0, title: d.s("Подключить аналитику", "Add analytics"), desc: String::new(), prio: "low", due: Some(in_days(-1)), tags: vec!["frontend"], subs: vec![], done_ago: None },
        T { p: rust.id, c: r2, title: d.s("Прочитать главы 1–4", "Read chapters 1–4"), desc: String::new(), prio: "medium", due: None, tags: vec!["learning"], subs: vec![], done_ago: Some(2) },
        T { p: rust.id, c: r1, title: d.s("Разобраться с владением и заимствованием", "Understand ownership and borrowing"), desc: d.s("Упражнения rustlings.", "The rustlings exercises."), prio: "high", due: Some(in_days(2)), tags: vec!["learning"], subs: vec![], done_ago: None },
        T { p: rust.id, c: r0, title: d.s("Написать CLI для заметок", "Write a notes CLI"), desc: String::new(), prio: "medium", due: None, tags: vec!["learning", "backend"], subs: vec![], done_ago: None },
    ];

    let mut ids: Vec<i64> = Vec::new();
    for x in list {
        let task = tasks::create_task(
            conn,
            NewTask {
                project_id: x.p,
                column_id: x.c,
                title: x.title,
                description: x.desc,
                priority: Some(x.prio.into()),
                due_at: x.due,
                tags: x.tags.iter().map(|s| s.to_string()).collect(),
            },
        )?;
        for (title, done) in x.subs {
            let t2 = tasks::add_subtask(conn, task.id, &title)?;
            if done {
                let sid = t2.subtasks.last().map(|s| s.id).unwrap_or(0);
                tasks::update_subtask(conn, sid, SubtaskPatch { title: None, completed: Some(true) })?;
            }
        }
        if let Some(n) = x.done_ago {
            conn.execute("UPDATE tasks SET completed_at = ?1 WHERE id = ?2", params![days_ago(n, 15), task.id])?;
        }
        ids.push(task.id);
    }

    let n1 = notes::create_note(
        conn,
        NoteInput {
            title: d.s("Архитектура Kairo", "Kairo architecture"),
            content: d.s(
                "# Архитектура\n\nПриложение делится на слои:\n\n1. **React UI** — только отображение\n2. **Репозитории** — доступ к данным через IPC\n3. **Rust** — источник истины: SQLite, таймер, трей\n\n## Правило\n\n> SQLite — источник истины, Zustand — лишь кэш.\n\n- [x] Схема БД\n- [x] Канбан\n- [ ] Аналитика\n",
                "# Architecture\n\nThe app is split into layers:\n\n1. **React UI** — rendering only\n2. **Repositories** — data access over IPC\n3. **Rust** — source of truth: SQLite, timer, tray\n\n## Rule\n\n> SQLite is the source of truth, Zustand is only a cache.\n\n- [x] Database schema\n- [x] Kanban\n- [ ] Analytics\n",
            ),
            project_id: Some(launch.id),
            tags: vec!["architecture".into()],
            task_ids: vec![ids[0], ids[2]],
        },
    )?;
    let _ = n1;
    notes::create_note(
        conn,
        NoteInput {
            title: d.s("Идеи для демо-ролика", "Demo video ideas"),
            content: d.s(
                "# Сценарий демо\n\n1. Открыть **Dashboard**\n2. Создать задачу горячей клавишей `N`\n3. Перетащить карточку в *В работе*\n4. Запустить фокус\n5. Показать аналитику\n\n[Документация Tauri](https://tauri.app)\n",
                "# Demo script\n\n1. Open the **Dashboard**\n2. Create a task with the `N` hotkey\n3. Drag the card to *In Progress*\n4. Start a focus session\n5. Show analytics\n\n[Tauri docs](https://tauri.app)\n",
            ),
            project_id: Some(launch.id),
            tags: vec!["docs".into()],
            task_ids: vec![ids[4]],
        },
    )?;
    notes::create_note(
        conn,
        NoteInput {
            title: d.s("Конспект: владение в Rust", "Notes: ownership in Rust"),
            content: d.s(
                "# Владение\n\nУ каждого значения есть **один** владелец.\n\n```rust\nlet s = String::from(\"kairo\");\nlet t = s; // s больше недоступна\n```\n\n- Заимствование: `&T` и `&mut T`\n- Одновременно либо много `&T`, либо один `&mut T`\n",
                "# Ownership\n\nEvery value has exactly **one** owner.\n\n```rust\nlet s = String::from(\"kairo\");\nlet t = s; // s is no longer valid\n```\n\n- Borrowing: `&T` and `&mut T`\n- Either many `&T` or a single `&mut T`\n",
            ),
            project_id: Some(rust.id),
            tags: vec!["learning".into()],
            task_ids: vec![ids[11]],
        },
    )?;

    // Focus history over the last days: (days ago, start hour, minutes, task index)
    let history: [(i64, i64, i64, usize); 14] = [
        (9, 9, 25, 0),
        (8, 10, 25, 0),
        (7, 11, 25, 6),
        (6, 9, 25, 0),
        (5, 14, 25, 1),
        (4, 10, 25, 1),
        (4, 11, 25, 1),
        (3, 15, 25, 6),
        (2, 9, 25, 10),
        (2, 10, 25, 10),
        (1, 10, 25, 2),
        (1, 11, 25, 2),
        (0, 8, 25, 11),
        (0, 9, 25, 2),
    ];
    let now = Utc::now();
    for (ago, hour, mins, ti) in history {
        let started = days_ago(ago, hour);
        let end = chrono::DateTime::parse_from_rfc3339(&started).unwrap().with_timezone(&Utc) + Duration::minutes(mins);
        if end > now {
            continue;
        }
        let task = tasks::get_task(conn, ids[ti])?;
        sessions::insert_session(
            conn,
            Some(task.id),
            Some(task.project_id),
            &started,
            &end.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            mins * 60,
            "work",
        )?;
    }
    Ok(())
}
