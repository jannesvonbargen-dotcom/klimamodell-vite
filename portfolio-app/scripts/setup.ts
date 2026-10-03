/**
 * Wird vor `npm run dev` / `npm start` ausgeführt: legt die Datenbank an,
 * spielt Migrationen ein und lädt beim allerersten Start Beispieldaten.
 */
import { loadEnv } from "./env";

loadEnv();

async function main() {
  const { closeDb, databasePath, getDb } = await import("../src/db/client");
  const { getSetting, setSetting } = await import("../src/server/repo");
  getDb();
  const initialized = getSetting<boolean>("initialized", false);
  if (!initialized) {
    const skipSeed = process.env.SEED_ON_FIRST_RUN === "false";
    if (!skipSeed) {
      process.stdout.write("Erster Start: lade Beispieldaten … ");
      const { seedDemoData } = await import("../src/db/seed");
      const result = await seedDemoData();
      process.stdout.write(`${result.transactions} Transaktionen angelegt.\n`);
    }
    setSetting("initialized", true);
  }
  console.log(`Datenbank bereit: ${databasePath()}`);
  closeDb();
}

main().catch((error) => {
  console.error("Setup fehlgeschlagen:", error);
  process.exit(1);
});
