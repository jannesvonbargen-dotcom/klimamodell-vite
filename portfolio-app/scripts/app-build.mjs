/**
 * Baut die Mac-App „Depot“ nach dist-app/mac…/Depot.app:
 *   1. Next.js-Produktionsbuild (.next/)
 *   2. electron-builder packt Build, Electron und Laufzeit-Abhängigkeiten.
 *      Kompiliert wird nichts: better-sqlite3 bringt fertige N-API-Bindungen
 *      mit, die auch unter Electron laufen (kein Xcode nötig).
 *
 * Danach mit `npm run app:install` nach /Programme kopieren.
 */
import { spawnSync } from "node:child_process";

if (process.platform !== "darwin") {
  console.error("Die Mac-App lässt sich nur auf einem Mac bauen (sie wird dabei für macOS signiert).");
  process.exit(1);
}

function run(step, command, args, env = {}) {
  console.log(`\n▸ ${step}`);
  const result = spawnSync(command, args, { stdio: "inherit", env: { ...process.env, ...env } });
  return result.status === 0;
}

const buildEnv = { NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "production" };
delete process.env.NEXT_DIST_DIR; // immer nach .next/ bauen

const ok =
  run("Next.js-Produktionsbuild", "npx", ["--no-install", "next", "build"], buildEnv) &&
  run("Mac-App packen (electron-builder)", "npx", ["--no-install", "electron-builder", "--mac"]);
if (!ok) {
  console.error("\n✗ Build fehlgeschlagen – siehe Meldungen oben.");
  process.exit(1);
}
console.log("\n✓ Fertig: dist-app/ enthält Depot.app. Installieren mit: npm run app:install");
