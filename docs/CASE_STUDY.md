# Kairo — case study

## Problem

Freelancers, developers and students juggle four tools for one loop of work: a task manager, a notes app, a Pomodoro timer and a time tracker. None of them knows about the others, so "how long did I really spend on this, and what did I write down while doing it?" needs manual stitching. Most alternatives also want an account and a server.

**Goal:** one local desktop app where `Project → Task → Focus → Note → Review` is a single connected model, working offline, with data the user owns.

## Research → decisions

| Finding | Decision |
|---|---|
| Kanban tools model *boards*, personal tools model *lists*; both lose the project context | **Project is the top-level entity**; a board is only a view of a project's tasks |
| Timers that live in the UI die with the window | The timer is a **state machine in Rust**; the UI only renders events, the tray shows the countdown |
| Notes detached from tasks get lost | Note ↔ Task ↔ Project links, visible from both sides, plus tags and full-text search |
| Trust in local data comes from being able to leave | **Explicit export/import** (JSON + SQLite copy), schema-validated, transactional, with an automatic safety copy |
| A portfolio app must show engineering, not only UI | Real SQLite, transactional reordering, native tray/notifications, tests on every layer |

## Architecture

```
React UI → feature modules → repositories → IPC → Rust commands → SQLite / timer / tray
```

* SQLite is the source of truth; Zustand is a cache that is re-read after every mutation.
* Rust is a thin layer: commands validate input and return structured `AppError { code, message }`; the UI translates codes into human language with a next step.
* The pure core (`db`, `timer`, `error`) compiles without Tauri (`--no-default-features`), so logic tests need no webview.
* A browser mock implements the same command contract, which made E2E testing of the real UI cheap.

## Hard problems and how they were solved

* **Drag & drop with persistent order.** Cards move between columns and within a column; positions are renumbered in one transaction in Rust. Two subtle races surfaced only in E2E and were fixed: dnd-kit reports the drop target from an effect, so a fast drop can arrive before the last `onDragOver` (the drop handler now applies the move itself), and a second drag can begin while the first is still saving (each drag owns its state; saves are queued so they reach the DB in order).
* **Autosave that cannot lose typing.** A small state machine (`saved / dirty / saving / error`) with debounce, flush on unmount / tab hide / window close, no retry loop on failure and a visible indicator with a retry action.
* **Background timer.** A ticker thread emits events and updates the tray; closing the window during a session hides it to the tray instead of quitting. Sessions shorter than 60 s are discarded, natural completions are written by the backend even if the UI is gone.
* **Safe import.** Structural validation → single transaction with foreign keys off → `foreign_key_check` → commit; any failure rolls back untouched data. Verified by tests that feed five kinds of broken backups.
* **Markdown safety.** Sanitised HTML, no remote images, links only via the system browser and only `http(s)` / `mailto`; verified with an E2E test that tries `<script>` and `onerror`.
* **Toolchain constraints.** The reference machine had no MSVC and a non-ASCII project path; the GNU toolchain plus an ASCII build path made the build reproducible (documented in the README).

## Result (measured)

Measured on the development machine (Windows 11, WebView2), release build:

| Metric | Value |
|---|---|
| Cold start to first interactive screen (process launch → onboarding rendered, includes attaching the test harness) | ≈ 0.85–1.0 s |
| Installer (NSIS, per-user) | 2.4 MB |
| Application binary | 5.9 MB |
| Main process working set at idle | ≈ 30 MB (plus WebView2 processes) |
| Rust tests (repositories, move/reorder, import/export, analytics, timer) | 25 |
| Unit tests (Vitest) | 26 |
| End-to-end scenarios (Playwright) | 18 |
| Native smoke checks against the real Rust backend | 17 |

## What I would do next

FTS5 for very large note libraries, a global hotkey for the timer, password-protected exports as a separate explicit feature, signed installers and auto-update.
