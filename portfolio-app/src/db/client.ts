import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

interface DbState {
  db: Db;
  sqlite: Database.Database;
  file: string;
}

const globalForDb = globalThis as unknown as { __portfolioDb?: DbState };

export function databasePath(): string {
  const configured = process.env.DATABASE_PATH;
  if (configured === ":memory:") return configured;
  return path.resolve(process.cwd(), configured ?? "data/portfolio.db");
}

export function migrationsFolder(): string {
  return path.resolve(process.cwd(), "drizzle");
}

/** Öffnet (und migriert) die lokale SQLite-Datenbank – einmal pro Prozess. */
export function getDb(): Db {
  return getState().db;
}

export function getSqlite(): Database.Database {
  return getState().sqlite;
}

function getState(): DbState {
  const file = databasePath();
  const existing = globalForDb.__portfolioDb;
  if (existing && existing.file === file && existing.sqlite.open) return existing;

  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsFolder() });
  // Soft-gelöschte Transaktionen (Rückgängig-Fenster abgelaufen) endgültig entfernen
  sqlite
    .prepare("DELETE FROM transactions WHERE deleted_at IS NOT NULL AND deleted_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')")
    .run();
  const state = { db, sqlite, file };
  globalForDb.__portfolioDb = state;
  return state;
}

/** Schließt die Verbindung (für Skripte und Tests). */
export function closeDb(): void {
  const state = globalForDb.__portfolioDb;
  if (state?.sqlite.open) state.sqlite.close();
  globalForDb.__portfolioDb = undefined;
}
