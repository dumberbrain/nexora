-- Full-text search over event summaries (Live Logs search, FR-028).
-- External-content FTS5 table kept in sync by triggers, so retention deletes also remove FTS rows.
CREATE VIRTUAL TABLE `events_fts` USING fts5(summary, content='events', content_rowid='rowid');
--> statement-breakpoint
CREATE TRIGGER `events_fts_ai` AFTER INSERT ON `events` BEGIN
  INSERT INTO events_fts(rowid, summary) VALUES (new.rowid, new.summary);
END;
--> statement-breakpoint
CREATE TRIGGER `events_fts_ad` AFTER DELETE ON `events` BEGIN
  INSERT INTO events_fts(events_fts, rowid, summary) VALUES ('delete', old.rowid, old.summary);
END;
--> statement-breakpoint
CREATE TRIGGER `events_fts_au` AFTER UPDATE OF summary ON `events` BEGIN
  INSERT INTO events_fts(events_fts, rowid, summary) VALUES ('delete', old.rowid, old.summary);
  INSERT INTO events_fts(rowid, summary) VALUES (new.rowid, new.summary);
END;
--> statement-breakpoint
INSERT INTO events_fts(events_fts) VALUES ('rebuild');
