import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { importBatches, transactions } from "@/db/schema";
import { d } from "@/domain/decimal";
import { computeLedger, grossAmount } from "@/domain/ledger";
import type { Transaction } from "@/domain/types";
import { validateFields } from "@/domain/validation";
import type { ImportCandidate } from "@/import/types";
import { catalogByIsin } from "@/market/catalog";
import { dedupeKey, getInstrumentByIsin, listSplits, listTransactions, upsertInstrument } from "./repo";
import { searchInstruments } from "./market";

/** Serverseitiger Teil des CSV-Imports: Vorschau, Duplikate, Speichern, Rückgängig. */

export type RowStatus = "new" | "duplicate" | "invalid";

export interface PreviewRow extends ImportCandidate {
  status: RowStatus;
  message: string | null;
  /** Kassenwirkung in EUR (mit Vorzeichen). */
  cashEUR: string | null;
  instrumentKnown: boolean;
}

export interface ImportPreview {
  rows: PreviewRow[];
  newInstruments: Array<{ isin: string | null; symbol: string | null; name: string | null }>;
  counts: { new: number; duplicate: number; invalid: number };
  cashEffectEUR: string;
  warnings: string[];
}

function instrumentKey(c: ImportCandidate): string | null {
  if (c.isin) return c.isin;
  if (c.symbol) return `X-${c.symbol}`;
  return null;
}

function candidateDedupeKey(c: ImportCandidate): string {
  const gross = grossAmount({ amount: c.amount, quantity: c.quantity, price: c.price });
  return dedupeKey(c.executedAt, instrumentKey(c), c.quantity, gross.toString());
}

function cashEffect(c: ImportCandidate): string | null {
  try {
    const ledger = computeLedger([toTransaction(c, 1, c.quantity ? 1 : null)]);
    return ledger.cashEUR.toString();
  } catch {
    return null;
  }
}

function toTransaction(c: ImportCandidate, id: number, instrumentId: number | null): Transaction {
  return {
    id,
    type: c.type,
    executedAt: c.executedAt,
    instrumentId,
    quantity: c.quantity,
    price: c.price,
    amount: c.amount,
    currency: c.currency,
    fxRate: c.fxRate,
    fee: c.fee,
    tax: c.tax,
    note: c.note,
  };
}

function existingKeys(): { dedupe: Set<string>; external: Set<string> } {
  const rows = getDb()
    .select({ key: transactions.dedupeKey, ext: transactions.externalId })
    .from(transactions)
    .where(isNull(transactions.deletedAt))
    .all();
  return {
    dedupe: new Set(rows.map((r) => r.key).filter((k): k is string => !!k)),
    external: new Set(rows.map((r) => r.ext).filter((k): k is string => !!k)),
  };
}

export function previewImport(candidates: ImportCandidate[]): ImportPreview {
  const keys = existingKeys();
  const rows: PreviewRow[] = [];
  const newInstruments = new Map<string, { isin: string | null; symbol: string | null; name: string | null }>();
  const warnings: string[] = [];
  let cash = d(0);

  for (const c of candidates) {
    const key = instrumentKey(c);
    const needsInstrument = ["BUY", "SELL", "SAVINGS_PLAN", "DIVIDEND"].includes(c.type);
    const known = key ? !!getInstrumentByIsin(key) : false;
    let status: RowStatus = "new";
    let message: string | null = null;

    if (needsInstrument && !key) {
      status = "invalid";
      message = "Kein Wertpapier (ISIN/Ticker) angegeben";
    } else {
      const errors = validateFields({ ...toTransaction(c, 0, needsInstrument ? 1 : null) });
      const firstError = Object.values(errors)[0];
      if (firstError) {
        status = "invalid";
        message = firstError;
      } else if ((c.externalId && keys.external.has(c.externalId)) || keys.dedupe.has(candidateDedupeKey(c))) {
        status = "duplicate";
        message = "Bereits vorhanden";
      }
    }
    if (status === "new" && needsInstrument && key && !known && !newInstruments.has(key)) {
      newInstruments.set(key, { isin: c.isin, symbol: c.symbol, name: c.name });
    }
    const effect = cashEffect(c);
    if (status === "new" && effect) cash = cash.plus(effect);
    rows.push({ ...c, status, message, cashEUR: effect, instrumentKnown: known });
  }

  // Gesamtverlauf mit den neuen Zeilen prüfen (z. B. fehlende Einzahlungen, Verkauf ohne Kauf)
  const existing = listTransactions();
  const instrumentIds = new Map<string, number>();
  let nextId = -1;
  const simulated = rows
    .filter((r) => r.status === "new")
    .map((r, i) => {
      const key = instrumentKey(r);
      let instrumentId: number | null = null;
      if (key) {
        const known = getInstrumentByIsin(key);
        if (known) instrumentId = known.id;
        else {
          if (!instrumentIds.has(key)) instrumentIds.set(key, nextId--);
          instrumentId = instrumentIds.get(key)!;
        }
      }
      return toTransaction(r, 1_000_000 + i, instrumentId);
    });
  const ledger = computeLedger([...existing, ...simulated], listSplits());
  const oversells = ledger.issues.filter((i) => i.kind === "OVERSELL" && i.transactionId >= 1_000_000);
  if (oversells.length) warnings.push(`${oversells.length} Verkauf/Verkäufe mit mehr Stücken als gehalten – fehlen ältere Käufe in der Datei?`);
  const negative = ledger.issues.find((i) => i.kind === "NEGATIVE_CASH");
  if (negative && !computeLedger(existing, listSplits()).issues.some((i) => i.kind === "NEGATIVE_CASH")) {
    warnings.push("Das Cash-Konto würde negativ – enthält die Datei auch die Einzahlungen?");
  }

  return {
    rows,
    newInstruments: [...newInstruments.values()],
    counts: {
      new: rows.filter((r) => r.status === "new").length,
      duplicate: rows.filter((r) => r.status === "duplicate").length,
      invalid: rows.filter((r) => r.status === "invalid").length,
    },
    cashEffectEUR: cash.toString(),
    warnings,
  };
}

/** Findet ein passendes Kurssymbol für eine ISIN (Katalog → Anbieter-Suche → ISIN als Platzhalter). */
async function resolveInstrument(c: ImportCandidate) {
  if (c.assetClass === "CRYPTO" && c.symbol) {
    return { isin: `X-${c.symbol}`, symbol: `${c.symbol}-EUR`, name: c.name ?? c.symbol, kind: "STOCK" as const, currency: "EUR", sector: "Krypto", country: null, wkn: null };
  }
  const isin = c.isin ?? (c.symbol ? `X-${c.symbol}` : null);
  if (!isin) return null;
  const catalog = c.isin ? catalogByIsin(c.isin) : undefined;
  if (catalog) {
    return { isin, symbol: catalog.symbol, name: catalog.name, kind: catalog.kind, currency: catalog.currency, sector: catalog.sector, country: catalog.country, wkn: catalog.wkn };
  }
  let symbol = c.symbol ?? null;
  let kind: "STOCK" | "ETF" = c.assetClass === "ETF" ? "ETF" : "STOCK";
  let sector: string | null = null;
  if (!symbol && c.isin) {
    try {
      const results = (await Promise.race([
        searchInstruments(c.isin),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
      ])) as Awaited<ReturnType<typeof searchInstruments>>;
      const providerResults = results.filter((r) => r.origin === "provider");
      // Trade Republic handelt in EUR – deutsche Notierung bevorzugen
      const pick = providerResults.find((r) => r.symbol.endsWith(".DE")) ?? providerResults[0];
      if (pick) {
        symbol = pick.symbol;
        kind = pick.kind === "ETF" ? "ETF" : kind;
        sector = pick.sector;
      }
    } catch {
      // offline – ISIN als Platzhalter, Symbol lässt sich später ändern
    }
  }
  const finalSymbol = symbol ?? c.isin!;
  const currency = !symbol ? "EUR" : finalSymbol.includes(".") ? (finalSymbol.endsWith(".L") ? "GBp" : "EUR") : "USD";
  return { isin, symbol: finalSymbol, name: c.name ?? finalSymbol, kind, currency, sector, country: null, wkn: c.wkn };
}

export interface CommitResult {
  batchId: number;
  imported: number;
  skipped: number;
  instrumentsCreated: number;
}

export async function commitImport(candidates: ImportCandidate[], fileName: string, preset: string): Promise<CommitResult> {
  const preview = previewImport(candidates);
  const toImport = preview.rows.filter((r) => r.status === "new");

  // Instrumente vorab auflösen (Netzwerk außerhalb der DB-Transaktion)
  const resolved = new Map<string, Awaited<ReturnType<typeof resolveInstrument>>>();
  for (const r of toImport) {
    const key = instrumentKey(r);
    if (!key || resolved.has(key) || getInstrumentByIsin(key)) continue;
    resolved.set(key, await resolveInstrument(r));
  }

  const db = getDb();
  let instrumentsCreated = 0;
  const result = db.transaction((tx) => {
    const batch = tx
      .insert(importBatches)
      .values({ fileName: fileName.slice(0, 200), preset, rowCount: candidates.length, importedCount: toImport.length, skippedCount: candidates.length - toImport.length })
      .returning()
      .get();
    const ids = new Map<string, number>();
    for (const r of toImport) {
      const key = instrumentKey(r);
      let instrumentId: number | null = null;
      if (key && ["BUY", "SELL", "SAVINGS_PLAN", "DIVIDEND"].includes(r.type)) {
        if (!ids.has(key)) {
          const existing = getInstrumentByIsin(key);
          if (existing) ids.set(key, existing.id);
          else {
            const info = resolved.get(key);
            if (info) {
              const created = upsertInstrument(info);
              instrumentsCreated++;
              ids.set(key, created.id);
            }
          }
        }
        instrumentId = ids.get(key) ?? null;
      }
      tx.insert(transactions)
        .values({
          type: r.type,
          executedAt: r.executedAt,
          instrumentId,
          quantity: r.quantity,
          price: r.price,
          amount: r.amount,
          currency: r.currency,
          fxRate: r.fxRate,
          fee: r.fee,
          tax: r.tax,
          note: r.note,
          source: "csv",
          dedupeKey: candidateDedupeKey(r),
          externalId: r.externalId,
          importBatchId: batch.id,
        })
        .run();
    }
    return batch.id;
  });

  return { batchId: result, imported: toImport.length, skipped: candidates.length - toImport.length, instrumentsCreated };
}

export function listImportBatches() {
  const db = getDb();
  const batches = db.select().from(importBatches).all().reverse();
  return batches.map((b) => {
    const active = db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.importBatchId, b.id), isNull(transactions.deletedAt)))
      .all().length;
    return { ...b, activeCount: active };
  });
}

export function undoImportBatch(batchId: number): number {
  const db = getDb();
  const rows = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.importBatchId, batchId), isNull(transactions.deletedAt)))
    .all();
  if (rows.length === 0) return 0;
  db.update(transactions)
    .set({ deletedAt: new Date().toISOString() })
    .where(inArray(transactions.id, rows.map((r) => r.id)))
    .run();
  return rows.length;
}

export function restoreImportBatch(batchId: number): void {
  getDb()
    .update(transactions)
    .set({ deletedAt: null })
    .where(and(eq(transactions.importBatchId, batchId), isNotNull(transactions.deletedAt)))
    .run();
}
