import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  instruments,
  type InstrumentRow,
  type NewTransactionRow,
  savingsPlanExecutions,
  savingsPlans,
  settings,
  splits,
  transactions,
  type TransactionRow,
  watchlist,
} from "@/db/schema";
import { d, roundMoney } from "@/domain/decimal";
import type { Instrument, SavingsPlan, Split, Transaction } from "@/domain/types";

/** Datenzugriff – übersetzt zwischen DB-Zeilen und Domain-Typen. */

export function toInstrument(row: InstrumentRow): Instrument {
  return {
    id: row.id,
    isin: row.isin,
    wkn: row.wkn,
    symbol: row.symbol,
    name: row.name,
    kind: row.kind,
    currency: row.currency,
    sector: row.sector,
    country: row.country,
    logoUrl: row.logoUrl,
  };
}

export function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    type: row.type,
    executedAt: row.executedAt,
    instrumentId: row.instrumentId,
    quantity: row.quantity,
    price: row.price,
    amount: row.amount,
    currency: row.currency,
    fxRate: row.fxRate,
    fee: row.fee,
    tax: row.tax,
    note: row.note,
  };
}

export function listInstruments(): Instrument[] {
  return getDb().select().from(instruments).orderBy(asc(instruments.name)).all().map(toInstrument);
}

export function instrumentMap(): Map<number, Instrument> {
  return new Map(listInstruments().map((i) => [i.id, i]));
}

export function getInstrument(id: number): Instrument | null {
  const row = getDb().select().from(instruments).where(eq(instruments.id, id)).get();
  return row ? toInstrument(row) : null;
}

export function getInstrumentByIsin(isin: string): Instrument | null {
  const row = getDb().select().from(instruments).where(eq(instruments.isin, isin.toUpperCase())).get();
  return row ? toInstrument(row) : null;
}

export interface InstrumentInput {
  isin: string;
  wkn?: string | null;
  symbol: string;
  name: string;
  kind?: "STOCK" | "ETF";
  currency?: string;
  sector?: string | null;
  country?: string | null;
  logoUrl?: string | null;
}

/** Legt ein Instrument an oder gibt das vorhandene (gleiche ISIN) zurück. */
export function upsertInstrument(input: InstrumentInput): Instrument {
  const isin = input.isin.trim().toUpperCase();
  const existing = getInstrumentByIsin(isin);
  if (existing) {
    // Fehlende Stammdaten ergänzen, vorhandene nicht überschreiben
    const patch: Partial<InstrumentRow> = {};
    if (!existing.wkn && input.wkn) patch.wkn = input.wkn;
    if (!existing.sector && input.sector) patch.sector = input.sector;
    if (!existing.country && input.country) patch.country = input.country;
    if (!existing.logoUrl && input.logoUrl) patch.logoUrl = input.logoUrl;
    if (Object.keys(patch).length) getDb().update(instruments).set(patch).where(eq(instruments.id, existing.id)).run();
    return { ...existing, ...patch } as Instrument;
  }
  const row = getDb()
    .insert(instruments)
    .values({
      isin,
      wkn: input.wkn ?? null,
      symbol: input.symbol.trim(),
      name: input.name.trim(),
      kind: input.kind ?? "STOCK",
      currency: input.currency ?? "EUR",
      sector: input.sector ?? null,
      country: input.country ?? null,
      logoUrl: input.logoUrl ?? null,
    })
    .returning()
    .get();
  return toInstrument(row);
}

export function updateInstrument(id: number, patch: Partial<InstrumentInput>): void {
  getDb()
    .update(instruments)
    .set({
      ...(patch.symbol !== undefined ? { symbol: patch.symbol } : {}),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.wkn !== undefined ? { wkn: patch.wkn } : {}),
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
      ...(patch.sector !== undefined ? { sector: patch.sector } : {}),
      ...(patch.country !== undefined ? { country: patch.country } : {}),
    })
    .where(eq(instruments.id, id))
    .run();
}

export function listTransactions(): Transaction[] {
  return listTransactionRows().map(toTransaction);
}

export function listTransactionRows(): TransactionRow[] {
  return getDb()
    .select()
    .from(transactions)
    .where(isNull(transactions.deletedAt))
    .orderBy(desc(transactions.executedAt), desc(transactions.id))
    .all();
}

export function getTransaction(id: number): TransactionRow | null {
  return getDb().select().from(transactions).where(eq(transactions.id, id)).get() ?? null;
}

export function listSplits(): Split[] {
  return getDb()
    .select()
    .from(splits)
    .orderBy(asc(splits.effectiveDate))
    .all()
    .map((s) => ({ id: s.id, instrumentId: s.instrumentId, effectiveDate: s.effectiveDate, ratioFrom: s.ratioFrom, ratioTo: s.ratioTo }));
}

export function insertTransaction(values: NewTransactionRow): TransactionRow {
  return getDb().insert(transactions).values(values).returning().get();
}

export function updateTransactionRow(id: number, values: Partial<NewTransactionRow>): void {
  getDb().update(transactions).set(values).where(eq(transactions.id, id)).run();
}

export function softDeleteTransaction(id: number): void {
  getDb().update(transactions).set({ deletedAt: new Date().toISOString() }).where(eq(transactions.id, id)).run();
}

export function restoreTransaction(id: number): void {
  getDb().update(transactions).set({ deletedAt: null }).where(and(eq(transactions.id, id), isNotNull(transactions.deletedAt))).run();
}

/** Duplikat-Schlüssel: Datum | ISIN | Stück (6 NK) | Betrag (2 NK). */
export function dedupeKey(date: string, isin: string | null, quantity: string | null, amount: string | null): string {
  const qty = quantity ? d(quantity).abs().toFixed(6) : "";
  const amt = amount ? roundMoney(d(amount).abs()).toFixed(2) : "";
  return [date.slice(0, 10), (isin ?? "").toUpperCase(), qty, amt].join("|");
}

export function existingDedupeKeys(): Set<string> {
  const rows = getDb()
    .select({ key: transactions.dedupeKey })
    .from(transactions)
    .where(and(isNull(transactions.deletedAt), isNotNull(transactions.dedupeKey)))
    .all();
  return new Set(rows.map((r) => r.key!).filter(Boolean));
}

// Sparpläne -----------------------------------------------------------------

export function listSavingsPlans(): SavingsPlan[] {
  return getDb()
    .select()
    .from(savingsPlans)
    .orderBy(asc(savingsPlans.id))
    .all()
    .map((p) => ({
      id: p.id,
      instrumentId: p.instrumentId,
      amount: p.amount,
      interval: p.interval,
      executionDay: p.executionDay,
      startDate: p.startDate,
      active: p.active,
      fee: p.fee,
    }));
}

export function listExecutions(): Array<{ planId: number; dueDate: string; status: "CONFIRMED" | "SKIPPED"; transactionId: number | null }> {
  return getDb()
    .select({
      planId: savingsPlanExecutions.planId,
      dueDate: savingsPlanExecutions.dueDate,
      status: savingsPlanExecutions.status,
      transactionId: savingsPlanExecutions.transactionId,
    })
    .from(savingsPlanExecutions)
    .all();
}

// Watchlist -----------------------------------------------------------------

export function listWatchlist() {
  return getDb().select().from(watchlist).orderBy(asc(watchlist.name)).all();
}

// Einstellungen -------------------------------------------------------------

export function getSetting<T>(key: string, fallback: T): T {
  const row = getDb().select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(key: string, value: unknown): void {
  const json = JSON.stringify(value);
  getDb().insert(settings).values({ key, value: json }).onConflictDoUpdate({ target: settings.key, set: { value: json } }).run();
}
