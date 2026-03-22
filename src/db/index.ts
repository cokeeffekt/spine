import { Database } from "bun:sqlite";
import { initializeDatabase } from "./schema.js";

export function openDatabase(dbPath: string): Database {
  const db = new Database(dbPath, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  initializeDatabase(db);
  return db;
}

let _db: Database | null = null;

export function _resetForTests(): void { _db = null; }

export function getDatabase(): Database {
  if (!_db) {
    const dbPath = process.env["DB_PATH"] ?? "/data/spine.db";
    _db = openDatabase(dbPath);
  }
  return _db;
}
