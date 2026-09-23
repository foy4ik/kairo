-- Notes can be filed into a (flat) folder; an empty string means "no folder".
ALTER TABLE notes ADD COLUMN folder TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_notes_folder ON notes(folder);
