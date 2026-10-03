/**
 * Kopiert die gebaute Depot.app nach /Programme (ohne Admin-Rechte nach
 * ~/Programme). Eine vorhandene Depot-Version wird ersetzt – deine Daten
 * liegen getrennt davon in ~/Library/Application Support/Depot und bleiben.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP_ID = "local.depot.portfolio";

if (process.platform !== "darwin") {
  console.error("Nur auf dem Mac verfügbar.");
  process.exit(1);
}

const dist = path.resolve("dist-app");
const builds = fs.existsSync(dist)
  ? fs
      .readdirSync(dist)
      .filter((d) => d.startsWith("mac"))
      .map((d) => path.join(dist, d, "Depot.app"))
      .filter((p) => fs.existsSync(p))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
  : [];
if (builds.length === 0) {
  console.error("Keine gebaute App gefunden – zuerst `npm run app:build` ausführen.");
  process.exit(1);
}

let folder = "/Applications";
try {
  fs.accessSync(folder, fs.constants.W_OK);
} catch {
  folder = path.join(os.homedir(), "Applications");
  fs.mkdirSync(folder, { recursive: true });
}
const target = path.join(folder, "Depot.app");

if (fs.existsSync(target)) {
  const id = spawnSync("plutil", ["-extract", "CFBundleIdentifier", "raw", path.join(target, "Contents", "Info.plist")], {
    encoding: "utf8",
  }).stdout?.trim();
  if (id !== APP_ID) {
    console.error(`${target} gehört zu einer anderen App (${id || "unbekannt"}) – Abbruch, es wurde nichts verändert.`);
    process.exit(1);
  }
  if (spawnSync("pgrep", ["-f", path.join(target, "Contents", "MacOS")]).status === 0) {
    console.error("Depot läuft gerade – bitte zuerst beenden (⌘Q) und dann erneut ausführen.");
    process.exit(1);
  }
  fs.rmSync(target, { recursive: true, force: true });
}

const copy = spawnSync("ditto", [builds[0], target], { stdio: "inherit" });
if (copy.status !== 0) process.exit(copy.status ?? 1);
console.log(`✓ Installiert: ${target}\n  Starten über Programme → Depot (oder Spotlight: „Depot“).`);
