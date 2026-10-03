import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Datenbankschema. Geldbeträge, Kurse und Stückzahlen werden als
 * Dezimal-Strings (TEXT) gespeichert – exakt, ohne Float.
 * Positionen und Cash werden NICHT gespeichert, sondern aus den
 * Transaktionen berechnet.
 */

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

export const instruments = sqliteTable(
  "instruments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    isin: text("isin").notNull(),
    wkn: text("wkn"),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["STOCK", "ETF"] })
      .notNull()
      .default("STOCK"),
    currency: text("currency").notNull().default("EUR"),
    sector: text("sector"),
    country: text("country"),
    logoUrl: text("logo_url"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("instruments_isin_idx").on(t.isin), index("instruments_symbol_idx").on(t.symbol)],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", {
      enum: ["BUY", "SELL", "DIVIDEND", "DEPOSIT", "WITHDRAWAL", "FEE", "TAX", "SAVINGS_PLAN", "INTEREST"],
    }).notNull(),
    executedAt: text("executed_at").notNull(),
    instrumentId: integer("instrument_id").references(() => instruments.id, { onDelete: "restrict" }),
    quantity: text("quantity"),
    price: text("price"),
    amount: text("amount"),
    currency: text("currency").notNull().default("EUR"),
    fxRate: text("fx_rate").notNull().default("1"),
    fee: text("fee").notNull().default("0"),
    tax: text("tax").notNull().default("0"),
    note: text("note"),
    source: text("source", { enum: ["manual", "csv", "seed", "savings_plan", "backup"] })
      .notNull()
      .default("manual"),
    /** Schlüssel zur Duplikat-Erkennung: Datum|ISIN|Stück|Betrag */
    dedupeKey: text("dedupe_key"),
    /** ID der Transaktion beim Broker (z. B. transaction_id im TR-Export). */
    externalId: text("external_id"),
    importBatchId: integer("import_batch_id"),
    savingsPlanId: integer("savings_plan_id"),
    /** Soft-Delete für „Rückgängig“; endgültig gelöscht wird beim nächsten Start. */
    deletedAt: text("deleted_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("transactions_executed_at_idx").on(t.executedAt),
    index("transactions_instrument_idx").on(t.instrumentId),
    index("transactions_dedupe_idx").on(t.dedupeKey),
    index("transactions_external_idx").on(t.externalId),
  ],
);

export const splits = sqliteTable(
  "splits",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    effectiveDate: text("effective_date").notNull(),
    ratioFrom: text("ratio_from").notNull().default("1"),
    ratioTo: text("ratio_to").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("splits_instrument_date_idx").on(t.instrumentId, t.effectiveDate)],
);

export const savingsPlans = sqliteTable("savings_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  instrumentId: integer("instrument_id")
    .notNull()
    .references(() => instruments.id, { onDelete: "cascade" }),
  amount: text("amount").notNull(),
  interval: text("interval", { enum: ["WEEKLY", "BIWEEKLY", "MONTHLY", "BIMONTHLY", "QUARTERLY"] })
    .notNull()
    .default("MONTHLY"),
  executionDay: integer("execution_day").notNull().default(1),
  startDate: text("start_date").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  fee: text("fee").notNull().default("0"),
  createdAt: createdAt(),
});

/** Bestätigte oder übersprungene Sparplan-Termine (offene werden berechnet). */
export const savingsPlanExecutions = sqliteTable(
  "savings_plan_executions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    planId: integer("plan_id")
      .notNull()
      .references(() => savingsPlans.id, { onDelete: "cascade" }),
    dueDate: text("due_date").notNull(),
    status: text("status", { enum: ["CONFIRMED", "SKIPPED"] }).notNull(),
    transactionId: integer("transaction_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("spe_plan_date_idx").on(t.planId, t.dueDate)],
);

/** Tagesschlusskurse (und Wechselkurse, Symbol z. B. "FX:USD"). */
export const priceSnapshots = sqliteTable(
  "price_snapshots",
  {
    symbol: text("symbol").notNull(),
    date: text("date").notNull(),
    close: text("close").notNull(),
    currency: text("currency").notNull(),
    source: text("source").notNull(),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.date] })],
);

/** Zwischengespeicherte Antworten des Kursanbieters (Kurse, Intraday, Kennzahlen). */
export const marketCache = sqliteTable("market_cache", {
  key: text("key").primaryKey(),
  payload: text("payload").notNull(),
  source: text("source").notNull(),
  fetchedAt: integer("fetched_at").notNull(),
});

export const watchlist = sqliteTable(
  "watchlist",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    isin: text("isin"),
    currency: text("currency").notNull().default("USD"),
    alertAbove: text("alert_above"),
    alertBelow: text("alert_below"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("watchlist_symbol_idx").on(t.symbol)],
);

export const importBatches = sqliteTable("import_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileName: text("file_name").notNull(),
  preset: text("preset").notNull(),
  rowCount: integer("row_count").notNull(),
  importedCount: integer("imported_count").notNull(),
  skippedCount: integer("skipped_count").notNull(),
  createdAt: createdAt(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type InstrumentRow = typeof instruments.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;
export type SplitRow = typeof splits.$inferSelect;
export type SavingsPlanRow = typeof savingsPlans.$inferSelect;
export type WatchlistRow = typeof watchlist.$inferSelect;
