import fs from "node:fs";

/** Lädt .env.local (falls vorhanden), wie Next.js es für die App tut. */
export function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    if (fs.existsSync(file)) {
      try {
        process.loadEnvFile(file);
      } catch {
        // ungültige Datei ignorieren – Next.js meldet das beim Start
      }
    }
  }
}
