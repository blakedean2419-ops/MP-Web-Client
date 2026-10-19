import { DatabaseSync } from "node:sqlite";
import type { Sample, Tag } from "../src/types.js";

export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS samples (tag_id TEXT NOT NULL, timestamp INTEGER NOT NULL, value REAL NOT NULL, PRIMARY KEY(tag_id, timestamp));
      CREATE INDEX IF NOT EXISTS samples_time ON samples(timestamp);`);
  }
  write(tags: Tag[]): void {
    const tag = this.db.prepare(
      "INSERT INTO tags VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
    );
    const sample = this.db.prepare(
      "INSERT OR REPLACE INTO samples VALUES (?, ?, ?)",
    );
    this.db.exec("BEGIN");
    try {
      for (const item of tags) {
        tag.run(item.id, JSON.stringify(item));
        if (item.quality === "good")
          sample.run(item.id, item.timestamp, item.value);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  tags(): Tag[] {
    return this.db
      .prepare("SELECT payload FROM tags")
      .all()
      .map((row) => JSON.parse(String(row.payload)) as Tag)
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }
  history(id: string, from: number, to: number, maxPoints = 600): Sample[] {
    const count = this.db
      .prepare(
        "SELECT count(*) AS total FROM samples WHERE tag_id=? AND timestamp>=? AND timestamp<=?",
      )
      .get(id, from, to)?.total as number;
    if (count <= maxPoints) {
      return this.db
        .prepare(
          "SELECT timestamp, value FROM samples WHERE tag_id=? AND timestamp>=? AND timestamp<=? ORDER BY timestamp",
        )
        .all(id, from, to)
        .map((row) => ({
          timestamp: Number(row.timestamp),
          value: Number(row.value),
        }));
    }
    // Reduce within SQLite rather than allocating a full month of samples in JS.
    // Preserve bucket extrema and range endpoints so short excursions stay visible.
    const width = Math.max(
      1,
      (to - from + 1) / Math.floor((maxPoints - 2) / 2),
    );
    return this.db
      .prepare(
        `WITH ranged AS (
        SELECT timestamp, value, CAST((timestamp - ?) / ? AS INTEGER) AS bucket
        FROM samples WHERE tag_id=? AND timestamp>=? AND timestamp<=?
      ), ranked AS (
        SELECT timestamp, value,
          row_number() OVER (PARTITION BY bucket ORDER BY value ASC, timestamp ASC) AS low_rank,
          row_number() OVER (PARTITION BY bucket ORDER BY value DESC, timestamp ASC) AS high_rank
        FROM ranged
      )
      SELECT timestamp, value FROM ranked WHERE low_rank=1 OR high_rank=1
      UNION SELECT timestamp, value FROM (SELECT timestamp, value FROM ranged ORDER BY timestamp LIMIT 1)
      UNION SELECT timestamp, value FROM (SELECT timestamp, value FROM ranged ORDER BY timestamp DESC LIMIT 1)
      ORDER BY timestamp`,
      )
      .all(from, width, id, from, to)
      .map((row) => ({
        timestamp: Number(row.timestamp),
        value: Number(row.value),
      }));
  }
  prune(before: number): void {
    this.db.prepare("DELETE FROM samples WHERE timestamp < ?").run(before);
  }
  close(): void {
    this.db.close();
  }
}
