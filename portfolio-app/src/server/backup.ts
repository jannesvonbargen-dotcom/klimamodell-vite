import fs from "node:fs";
import path from "node:path";
import { isNull } from "drizzle-orm";
import { z } from "zod";
import { databasePath, getDb, getSqlite } from "@/db/client";
import { importBatches, instruments, savingsPlanExecutions, savingsPlans, settings, splits, transactions, watchlist } from "@/db/schema";
import { d } from "@/domain/decimal";
import { TRANSACTION_TYPES, type TransactionType } from "@/domain/types";
import { recomputeDedupeKeys } from "./repo";

/**
 * Sicherung und Wiederherstellung.
 *  - JSON: vollständige Sicherung aller eigenen Daten (ohne Kurs-Cache) –
 *    lässt sich 1:1 wiederherstellen.
 *  - CSV: alle Transaktionen in einem Format, das der eigene CSV-Import
 *    automatisch erkennt (z. B. für Excel oder einen Umzug).
 */

export const BACKUP_FORMAT = "portfolio-app-backup";
export const BACKUP_VERSION = 1;

const str = z.string();
const optStr = z.string().nullable().optional();
const id = z.number().int().positive();
const decimalStr = z.string().regex(/^-?\d+(\.\d+)?$/, "Dezimalzahl erwartet");
const optDecimal = decimalStr.nullable().optional();

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().min(1).max(BACKUP_VERSION),
  exportedAt: str,
  data: z.object({
    instruments: z.array(
      z.object({
        id,
        isin: str.min(1),
        wkn: optStr,
        symbol: str.min(1),
        name: str.min(1),
        kind: z.enum(["STOCK", "ETF"]),
        currency: str.min(3).max(3),
        sector: optStr,
        country: optStr,
        logoUrl: optStr,
        createdAt: str,
      }),
    ),
    transactions: z.array(
      z.object({
        id,
        type: z.enum(TRANSACTION_TYPES),
        executedAt: str.regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/),
        instrumentId: id.nullable().optional(),
        quantity: optDecimal,
        price: optDecimal,
        amount: optDecimal,
        currency: str.min(3).max(3),
        fxRate: decimalStr,
        fee: decimalStr,
        tax: decimalStr,
        note: optStr,
        source: z.enum(["manual", "csv", "seed", "savings_plan", "backup"]),
        dedupeKey: optStr,
        externalId: optStr,
        importBatchId: z.number().int().nullable().optional(),
        savingsPlanId: z.number().int().nullable().optional(),
        createdAt: str,
      }),
    ),
    splits: z.array(
      z.object({ id, instrumentId: id, effectiveDate: str, ratioFrom: decimalStr, ratioTo: decimalStr, note: optStr, createdAt: str }),
    ),
    savingsPlans: z.array(
      z.object({
        id,
        instrumentId: id,
        amount: decimalStr,
        interval: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "BIMONTHLY", "QUARTERLY"]),
        executionDay: z.number().int().min(1).max(31),
        startDate: str,
        active: z.boolean(),
        fee: decimalStr,
        createdAt: str,
      }),
    ),
    savingsPlanExecutions: z.array(
      z.object({
        id,
        planId: id,
        dueDate: str,
        status: z.enum(["CONFIRMED", "SKIPPED"]),
        transactionId: z.number().int().nullable().optional(),
        createdAt: str,
      }),
    ),
    watchlist: z.array(
      z.object({
        id,
        symbol: str.min(1),
        name: str.min(1),
        isin: optStr,
        currency: str,
        alertAbove: optDecimal,
        alertBelow: optDecimal,
        note: optStr,
        createdAt: str,
      }),
    ),
    importBatches: z.array(
      z.object({
        id,
        fileName: str,
        preset: str,
        rowCount: z.number().int(),
        importedCount: z.number().int(),
        skippedCount: z.number().int(),
        createdAt: str,
      }),
    ),
    settings: z.array(z.object({ key: str, value: str })),
  }),
});

export type Backup = z.infer<typeof backupSchema>;

export function exportBackup(): Backup {
  const db = getDb();
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      instruments: db.select().from(instruments).all(),
      transactions: db
        .select()
        .from(transactions)
        .where(isNull(transactions.deletedAt))
        .all()
        .map((row) => {
          const rest: Omit<typeof row, "deletedAt"> & { deletedAt?: string | null } = { ...row };
          delete rest.deletedAt;
          return rest;
        }),
      splits: db.select().from(splits).all(),
      savingsPlans: db.select().from(savingsPlans).all(),
      savingsPlanExecutions: db.select().from(savingsPlanExecutions).all(),
      watchlist: db.select().from(watchlist).all(),
      importBatches: db.select().from(importBatches).all(),
      settings: db.select().from(settings).all(),
    },
  };
}

/** Sichert die aktuelle Datenbankdatei nach data/backups/ (vor riskanten Aktionen). */
export async function backupDatabaseFile(reason: string): Promise<string | null> {
  const file = databasePath();
  if (file === ":memory:") return null;
  const dir = path.join(path.dirname(file), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(dir, `portfolio-${stamp}-${reason}.db`);
  await getSqlite().backup(target);
  return target;
}

export interface RestoreResult {
  ok: boolean;
  message: string;
  counts?: { transactions: number; instruments: number; savingsPlans: number; watchlist: number };
  backupFile?: string | null;
}

export function parseBackup(json: string): { backup: Backup } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { error: "Die Datei ist kein gültiges JSON." };
  }
  if (!raw || typeof raw !== "object" || (raw as { format?: unknown }).format !== BACKUP_FORMAT) {
    return { error: "Das ist keine Sicherung dieser App (Feld „format“ fehlt)." };
  }
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: `Sicherung fehlerhaft: ${issue.path.join(".")} – ${issue.message}` };
  }
  return { backup: parsed.data };
}

/** Ersetzt alle eigenen Daten durch die Sicherung (Kurs-Cache bleibt erhalten). */
export async function restoreBackup(json: string): Promise<RestoreResult> {
  const result = parseBackup(json);
  if ("error" in result) return { ok: false, message: result.error };
  const { data } = result.backup;
  const backupFile = await backupDatabaseFile("vor-wiederherstellung");
  const db = getDb();
  try {
    db.transaction((tx) => {
      tx.delete(savingsPlanExecutions).run();
      tx.delete(transactions).run();
      tx.delete(splits).run();
      tx.delete(savingsPlans).run();
      tx.delete(watchlist).run();
      tx.delete(importBatches).run();
      tx.delete(instruments).run();
      tx.delete(settings).run();
      const chunked = <T>(rows: T[], insert: (chunk: T[]) => void) => {
        for (let i = 0; i < rows.length; i += 200) insert(rows.slice(i, i + 200));
      };
      chunked(data.instruments, (c) => tx.insert(instruments).values(c).run());
      chunked(data.importBatches, (c) => tx.insert(importBatches).values(c).run());
      chunked(data.savingsPlans, (c) => tx.insert(savingsPlans).values(c).run());
      chunked(data.transactions, (c) => tx.insert(transactions).values(c).run());
      chunked(data.splits, (c) => tx.insert(splits).values(c).run());
      chunked(data.savingsPlanExecutions, (c) => tx.insert(savingsPlanExecutions).values(c).run());
      chunked(data.watchlist, (c) => tx.insert(watchlist).values(c).run());
      chunked(data.settings, (c) => tx.insert(settings).values(c).run());
      tx.insert(settings).values({ key: "initialized", value: "true" }).onConflictDoNothing().run();
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: /FOREIGN KEY/i.test(message)
        ? "Sicherung unvollständig: Verweise auf fehlende Wertpapiere oder Sparpläne."
        : `Wiederherstellen fehlgeschlagen: ${message}`,
      backupFile,
    };
  }
  recomputeDedupeKeys();
  return {
    ok: true,
    message: "Sicherung wiederhergestellt.",
    counts: {
      transactions: data.transactions.length,
      instruments: data.instruments.length,
      savingsPlans: data.savingsPlans.length,
      watchlist: data.watchlist.length,
    },
    backupFile,
  };
}

/** Löscht alle eigenen Daten (vorher wird die Datenbankdatei gesichert). */
export async function wipeAllData(): Promise<{ backupFile: string | null }> {
  const backupFile = await backupDatabaseFile("vor-loeschen");
  getDb().transaction((tx) => {
    tx.delete(savingsPlanExecutions).run();
    tx.delete(transactions).run();
    tx.delete(splits).run();
    tx.delete(savingsPlans).run();
    tx.delete(watchlist).run();
    tx.delete(importBatches).run();
    tx.delete(instruments).run();
    tx.delete(settings).run();
    tx.insert(settings).values({ key: "initialized", value: "true" }).run();
  });
  return { backupFile };
}

// ---------------------------------------------------------------------------
// CSV

export const CSV_HEADERS = [
  "Datum",
  "Uhrzeit",
  "Typ",
  "ISIN",
  "WKN",
  "Ticker",
  "Name",
  "Stück",
  "Kurs",
  "Betrag",
  "Gebühren",
  "Steuern",
  "Währung",
  "Wechselkurs",
  "Notiz",
  "Transaktions-ID",
  "Quelle",
] as const;

const CSV_TYPE: Record<TransactionType, string> = {
  BUY: "Kauf",
  SELL: "Verkauf",
  DIVIDEND: "Dividende",
  DEPOSIT: "Einzahlung",
  WITHDRAWAL: "Auszahlung",
  FEE: "Gebühr",
  TAX: "Steuer",
  SAVINGS_PLAN: "Sparplan",
  INTEREST: "Zinsen",
};

/** Zahl im deutschen Format ohne Tausenderpunkte („1234,5“) – eindeutig lesbar. */
const deNum = (v: string | null | undefined) => (v === null || v === undefined || v === "" ? "" : d(v).toFixed().replace(".", ","));

function csvCell(value: string): string {
  // Formel-Injection in Tabellenkalkulationen verhindern
  const safe = /^[=+\-@\t\r]/.test(value) && !/^-?\d/.test(value) ? `'${value}` : value;
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function exportTransactionsCsv(): string {
  const db = getDb();
  const inst = new Map(
    db
      .select()
      .from(instruments)
      .all()
      .map((i) => [i.id, i]),
  );
  const rows = db
    .select()
    .from(transactions)
    .where(isNull(transactions.deletedAt))
    .all()
    .sort((a, b) => a.executedAt.localeCompare(b.executedAt) || a.id - b.id);
  const lines = [CSV_HEADERS.join(";")];
  for (const t of rows) {
    const i = t.instrumentId ? inst.get(t.instrumentId) : undefined;
    const [date, time = ""] = t.executedAt.split("T");
    const refund = t.type === "TAX" && t.amount && d(t.amount).isNegative();
    const amount = t.amount ?? (t.quantity && t.price ? d(t.quantity).abs().times(t.price).toDecimalPlaces(2).toString() : null);
    const cells = [
      date,
      time.slice(0, 5),
      refund ? "Steuererstattung" : CSV_TYPE[t.type],
      i && !i.isin.startsWith("X-") ? i.isin : "",
      i?.wkn ?? "",
      i?.symbol ?? "",
      i?.name ?? "",
      deNum(t.quantity),
      deNum(t.price),
      deNum(amount ? d(amount).abs().toString() : null),
      deNum(t.fee),
      deNum(t.tax),
      t.currency,
      deNum(t.fxRate),
      t.note ?? "",
      t.externalId ?? `app-${t.id}`,
      t.source,
    ];
    lines.push(cells.map((c) => csvCell(String(c))).join(";"));
  }
  // BOM, damit Excel UTF-8 erkennt
  return `﻿${lines.join("\r\n")}\r\n`;
}
