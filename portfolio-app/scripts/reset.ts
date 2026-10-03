/**
 * Setzt die Datenbank zurück. Vorher wird automatisch eine Sicherung unter
 * data/backups/ angelegt.
 *
 *   npm run db:reset            → leere Datenbank + Beispieldaten
 *   npm run db:reset -- --empty → leere Datenbank ohne Beispieldaten
 *   --no-backup                 → ohne Sicherung (für Tests)
 */
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "./env";

loadEnv();

async function main() {
  const empty = process.argv.includes("--empty");
  const noBackup = process.argv.includes("--no-backup");
  const { closeDb, databasePath, getDb } = await import("../src/db/client");
  const file = databasePath();
  if (file !== ":memory:" && fs.existsSync(file) && noBackup) {
    for (const suffix of ["", "-wal", "-shm"]) if (fs.existsSync(file + suffix)) fs.rmSync(file + suffix);
  } else if (file !== ":memory:" && fs.existsSync(file)) {
    const backupDir = path.join(path.dirname(file), "backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const target = path.join(backupDir, `portfolio-${stamp}.db`);
    // Sicherung über SQLite selbst, damit auch WAL-Inhalte enthalten sind
    const sqlite = (await import("better-sqlite3")).default(file);
    await sqlite.backup(target);
    sqlite.close();
    console.log(`Sicherung angelegt: ${target}`);
    for (const suffix of ["", "-wal", "-shm"]) {
      if (fs.existsSync(file + suffix)) fs.rmSync(file + suffix);
    }
  }
  getDb();
  const { setSetting } = await import("../src/server/repo");
  if (!empty) {
    const { seedDemoData } = await import("../src/db/seed");
    const result = await seedDemoData();
    console.log(`Beispieldaten geladen (${result.transactions} Transaktionen).`);
  }
  setSetting("initialized", true);
  closeDb();
  console.log(empty ? "Datenbank ist jetzt leer." : "Fertig.");
}

main().catch((error) => {
  console.error("Zurücksetzen fehlgeschlagen:", error);
  process.exit(1);
});
