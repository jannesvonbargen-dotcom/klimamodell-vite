import { getSetting, recomputeDedupeKeys, setSetting } from "./repo";

/**
 * Einmalige Einrichtung pro Prozess: Datenbank ist mit dem ersten Zugriff
 * migriert; beim allerersten Start werden Beispieldaten geladen (außer bei
 * SEED_ON_FIRST_RUN=false). Wird von der Mac-App und `next start` genutzt –
 * `npm run dev` erledigt das zusätzlich vorab in scripts/setup.ts.
 */

const state = globalThis as unknown as { __depotInit?: Promise<void> };

export function ensureInitialized(): Promise<void> {
  state.__depotInit ??= (async () => {
    if (!getSetting<boolean>("initialized", false)) {
      if (process.env.SEED_ON_FIRST_RUN !== "false") {
        const { seedDemoData } = await import("@/db/seed");
        await seedDemoData();
      }
      setSetting("initialized", true);
    }
    recomputeDedupeKeys();
  })().catch((error) => {
    state.__depotInit = undefined;
    throw error;
  });
  return state.__depotInit;
}
