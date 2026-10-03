import fs from "node:fs";
import path from "node:path";
import { count, eq, isNull } from "drizzle-orm";
import { databasePath, getDb } from "@/db/client";
import { instruments, marketCache, priceSnapshots, savingsPlans, transactions, watchlist } from "@/db/schema";
import { configFileName, desktopDataDir, getConfig } from "./config";
import { providerInfo, type ProviderInfo } from "./market";
import { getSetting } from "./repo";

export interface SettingsOverview {
  provider: ProviderInfo;
  keys: { finnhub: boolean; fmp: boolean; alphavantage: boolean };
  counts: {
    transactions: number;
    instruments: number;
    savingsPlans: number;
    watchlist: number;
    seedTransactions: number;
    snapshots: number;
    cache: number;
  };
  databasePath: string;
  databaseSize: number | null;
  backups: Array<{ name: string; size: number; createdAt: string }>;
  seededAt: string | null;
  /** Datei für Kursanbieter und API-Keys (.env.local bzw. Konfiguration.env). */
  configFile: string;
  /** Nur in der Mac-App: Datenordner. */
  dataDir: string | null;
}

function backupsDir(): string | null {
  const file = databasePath();
  return file === ":memory:" ? null : path.join(path.dirname(file), "backups");
}

export function getSettingsOverview(): SettingsOverview {
  const db = getDb();
  const n = (rows: Array<{ value: number }>) => rows[0]?.value ?? 0;
  const config = getConfig();
  const file = databasePath();
  const dir = backupsDir();
  const backups =
    dir && fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((f) => f.endsWith(".db"))
          .map((name) => {
            const stat = fs.statSync(path.join(dir, name));
            return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 5)
      : [];
  return {
    provider: providerInfo(),
    keys: { finnhub: !!config.finnhubKey, fmp: !!config.fmpKey, alphavantage: !!config.alphaVantageKey },
    counts: {
      transactions: n(db.select({ value: count() }).from(transactions).where(isNull(transactions.deletedAt)).all()),
      instruments: n(db.select({ value: count() }).from(instruments).all()),
      savingsPlans: n(db.select({ value: count() }).from(savingsPlans).all()),
      watchlist: n(db.select({ value: count() }).from(watchlist).all()),
      seedTransactions: n(db.select({ value: count() }).from(transactions).where(eq(transactions.source, "seed")).all()),
      snapshots: n(db.select({ value: count() }).from(priceSnapshots).all()),
      cache: n(db.select({ value: count() }).from(marketCache).all()),
    },
    databasePath: file,
    databaseSize: file !== ":memory:" && fs.existsSync(file) ? fs.statSync(file).size : null,
    backups,
    seededAt: getSetting<string | null>("seededAt", null),
    configFile: configFileName(),
    dataDir: desktopDataDir(),
  };
}

/** Kurs-Cache leeren (Tagesschlusskurse bleiben als Snapshots erhalten). */
export function clearMarketCache(): void {
  getDb().delete(marketCache).run();
}
