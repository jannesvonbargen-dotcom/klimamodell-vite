import { and, asc, between, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import { instruments, marketCache, priceSnapshots } from "@/db/schema";
import { exchangeForInstrument, marketStatus, todayInBerlin } from "@/domain/market-hours";
import type { Quote } from "@/domain/valuation";
import { searchCatalog } from "@/market/catalog";
import { AlphaVantageProvider } from "@/market/providers/alphavantage";
import { EcbFxProvider } from "@/market/providers/ecb";
import { FinnhubProvider } from "@/market/providers/finnhub";
import { FmpProvider } from "@/market/providers/fmp";
import { inferCurrency } from "@/market/providers/http";
import { MockFxProvider, MockProvider } from "@/market/providers/mock";
import { YahooProvider } from "@/market/providers/yahoo";
import type { Fundamentals, FxProvider, MarketDataProvider, PricePoint, ProviderQuote, SearchResult } from "@/market/types";
import { getConfig } from "./config";

/**
 * Kursdaten-Dienst: wählt den Anbieter, begrenzt die Anfragerate, cacht in
 * SQLite und fällt bei Ausfall auf die letzten bekannten Werte zurück.
 */

interface Providers {
  primary: MarketDataProvider;
  fallback: MarketDataProvider | null;
  fx: FxProvider;
  warnings: string[];
}

let providersCache: { key: string; value: Providers } | null = null;

export function getProviders(): Providers {
  const config = getConfig();
  const key = JSON.stringify(config);
  if (providersCache?.key === key) return providersCache.value;
  const warnings: string[] = [];
  let primary: MarketDataProvider;
  switch (config.provider) {
    case "mock":
      primary = new MockProvider();
      break;
    case "finnhub":
      if (config.finnhubKey) primary = new FinnhubProvider(config.finnhubKey);
      else {
        warnings.push("FINNHUB_API_KEY fehlt – verwende Yahoo Finance.");
        primary = new YahooProvider();
      }
      break;
    case "fmp":
      if (config.fmpKey) primary = new FmpProvider(config.fmpKey);
      else {
        warnings.push("FMP_API_KEY fehlt – verwende Yahoo Finance.");
        primary = new YahooProvider();
      }
      break;
    case "alphavantage":
      if (config.alphaVantageKey) primary = new AlphaVantageProvider(config.alphaVantageKey);
      else {
        warnings.push("ALPHAVANTAGE_API_KEY fehlt – verwende Yahoo Finance.");
        primary = new YahooProvider();
      }
      break;
    default:
      primary = new YahooProvider();
  }
  const fallback = primary.isDemo || primary.id === "yahoo" ? null : new YahooProvider();
  const fx = config.fxProvider === "mock" || primary.isDemo ? new MockFxProvider() : new EcbFxProvider();
  const value = { primary, fallback, fx, warnings };
  providersCache = { key, value };
  return value;
}

/** Datenklasse: Demo-Daten und echte Daten werden im Cache strikt getrennt. */
function dataClass(): "demo" | "live" {
  return getProviders().primary.isDemo ? "demo" : "live";
}

// ---------------------------------------------------------------------------
// Rate-Limit je Anbieter

const lastCall = new Map<string, number>();
const chains = new Map<string, Promise<unknown>>();

function limited<T>(provider: { id: string; minIntervalMs?: number }, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(provider.id) ?? Promise.resolve();
  const run = prev
    .catch(() => undefined)
    .then(async () => {
      const wait = (lastCall.get(provider.id) ?? 0) + (provider.minIntervalMs ?? 0) - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        return await fn();
      } finally {
        lastCall.set(provider.id, Date.now());
      }
    });
  chains.set(provider.id, run);
  return run;
}

/** Führt eine Fähigkeit beim Hauptanbieter aus, bei Fehlen/Fehler beim Ersatzanbieter. */
async function withProviders<T>(
  capability: keyof MarketDataProvider,
  fn: (p: MarketDataProvider) => Promise<T>,
): Promise<{ value: T; source: string }> {
  const { primary, fallback } = getProviders();
  const candidates = [primary, fallback].filter((p): p is MarketDataProvider => !!p && typeof p[capability] === "function");
  let lastError: unknown = new Error("Kein Anbieter unterstützt diese Funktion.");
  for (const p of candidates) {
    try {
      return { value: await limited(p, () => fn(p)), source: p.id };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Cache

interface CacheEntry<T> {
  payload: T;
  fetchedAt: number;
  source: string;
}

function readCache<T>(key: string): CacheEntry<T> | null {
  const row = getDb().select().from(marketCache).where(eq(marketCache.key, key)).get();
  if (!row) return null;
  try {
    return { payload: JSON.parse(row.payload) as T, fetchedAt: row.fetchedAt, source: row.source };
  } catch {
    return null;
  }
}

function writeCache(key: string, payload: unknown, source: string): void {
  const value = { key, payload: JSON.stringify(payload), source, fetchedAt: Date.now() };
  getDb()
    .insert(marketCache)
    .values(value)
    .onConflictDoUpdate({ target: marketCache.key, set: { payload: value.payload, source, fetchedAt: value.fetchedAt } })
    .run();
}

/** 60 s, während die Börse des Symbols geöffnet ist, sonst 15 Minuten. */
function quoteTtl(symbol: string): number {
  const open = marketStatus(exchangeForInstrument(symbol, inferCurrency(symbol))).open;
  return open ? 60_000 : 15 * 60_000;
}

// ---------------------------------------------------------------------------
// Kurse

export interface QuotesResult {
  quotes: Map<string, Quote>;
  /** Fehlermeldungen des Anbieters (Kurse kommen dann aus dem Cache). */
  errors: string[];
  /** Ältester verwendeter Kurszeitpunkt (ISO) bzw. letzter erfolgreicher Abruf. */
  lastFetchedAt: string | null;
}

export async function getQuotes(symbols: string[], options: { force?: boolean } = {}): Promise<QuotesResult> {
  const unique = [...new Set(symbols.filter(Boolean))];
  const cls = dataClass();
  const quotes = new Map<string, Quote>();
  const errors: string[] = [];
  const toFetch: string[] = [];
  const cached = new Map<string, CacheEntry<ProviderQuote>>();
  let lastFetched = 0;

  for (const symbol of unique) {
    const entry = readCache<ProviderQuote>(`quote:${cls}:${symbol}`);
    if (entry) cached.set(symbol, entry);
    if (entry && !options.force && Date.now() - entry.fetchedAt < quoteTtl(symbol)) {
      quotes.set(symbol, { ...entry.payload, source: entry.source });
      lastFetched = Math.max(lastFetched, entry.fetchedAt);
    } else {
      toFetch.push(symbol);
    }
  }

  if (toFetch.length > 0) {
    try {
      const { value, source } = await withProviders("quotes", (p) => p.quotes!(toFetch));
      for (const [symbol, q] of value) {
        writeCache(`quote:${cls}:${symbol}`, q, source);
        quotes.set(symbol, { ...q, source });
      }
      lastFetched = Date.now();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    // Nicht geliefert → letzter bekannter Kurs (als veraltet markiert)
    for (const symbol of toFetch) {
      if (quotes.has(symbol)) continue;
      const entry = cached.get(symbol);
      if (entry) {
        quotes.set(symbol, { ...entry.payload, source: entry.source, stale: true });
        lastFetched = Math.max(lastFetched, entry.fetchedAt);
      }
    }
  }

  return { quotes, errors, lastFetchedAt: lastFetched ? new Date(lastFetched).toISOString() : null };
}

// ---------------------------------------------------------------------------
// Tageskurse (Snapshots)

interface HistoryMeta {
  from: string;
  to: string;
}

function sourceFilter() {
  return dataClass() === "demo" ? eq(priceSnapshots.source, "mock") : ne(priceSnapshots.source, "mock");
}

function storePoints(symbol: string, currency: string, source: string, points: PricePoint[]): void {
  if (points.length === 0) return;
  const db = getDb();
  db.transaction((tx) => {
    for (const p of points) {
      tx.insert(priceSnapshots)
        .values({ symbol, date: p.key, close: p.close, currency, source })
        .onConflictDoUpdate({ target: [priceSnapshots.symbol, priceSnapshots.date], set: { close: p.close, currency, source } })
        .run();
    }
  });
}

function readPoints(symbol: string, from: string, to: string): PricePoint[] {
  return getDb()
    .select({ key: priceSnapshots.date, close: priceSnapshots.close })
    .from(priceSnapshots)
    .where(and(eq(priceSnapshots.symbol, symbol), between(priceSnapshots.date, from, to), sourceFilter()))
    .orderBy(asc(priceSnapshots.date))
    .all();
}

function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Tagesschlusskurse eines Symbols. Fehlende Zeiträume werden beim Anbieter
 * nachgeladen und dauerhaft gespeichert (tägliche Kurs-Snapshots).
 */
export async function getDailyHistory(symbol: string, from: string, to: string = todayInBerlin()): Promise<PricePoint[]> {
  const cls = dataClass();
  const metaKey = `history:${cls}:${symbol}`;
  const meta = readCache<HistoryMeta>(metaKey);
  const ranges: Array<[string, string]> = [];
  if (!meta) ranges.push([from, to]);
  else {
    if (from < meta.payload.from) ranges.push([from, dayBefore(meta.payload.from)]);
    const staleTail = meta.payload.to < to || Date.now() - meta.fetchedAt > 6 * 3600_000;
    if (staleTail && Date.now() - meta.fetchedAt > 10 * 60_000) ranges.push([meta.payload.to, to]);
  }
  let newFrom = meta ? (from < meta.payload.from ? from : meta.payload.from) : from;
  let newTo = meta ? meta.payload.to : null;
  for (const [rFrom, rTo] of ranges) {
    if (rFrom > rTo) continue;
    try {
      const { value, source } = await withProviders("dailyHistory", (p) => p.dailyHistory!(symbol, rFrom, rTo));
      storePoints(symbol, inferCurrency(symbol), source === "mock" ? "mock" : source, value);
      newTo = !newTo || rTo > newTo ? rTo : newTo;
    } catch {
      // Anbieter nicht erreichbar → mit vorhandenen Snapshots weiterarbeiten
      if (!meta) newFrom = from;
    }
  }
  if (newTo) writeCache(metaKey, { from: newFrom, to: newTo } satisfies HistoryMeta, cls);
  return readPoints(symbol, from, to);
}

/** Letzter gespeicherter Tagesschlusskurs je Symbol (für Fallbacks). */
export function lastSnapshots(symbols: string[]): Map<string, { date: string; close: string }> {
  const out = new Map<string, { date: string; close: string }>();
  if (symbols.length === 0) return out;
  const rows = getDb()
    .select()
    .from(priceSnapshots)
    .where(and(inArray(priceSnapshots.symbol, symbols), sourceFilter()))
    .orderBy(asc(priceSnapshots.date))
    .all();
  for (const r of rows) out.set(r.symbol, { date: r.date, close: r.close });
  return out;
}

// ---------------------------------------------------------------------------
// Intraday

export async function getIntraday(symbol: string, days: 1 | 5): Promise<{ points: PricePoint[]; stale: boolean }> {
  const cls = dataClass();
  const key = `intraday:${cls}:${days}:${symbol}`;
  const entry = readCache<PricePoint[]>(key);
  if (entry && Date.now() - entry.fetchedAt < quoteTtl(symbol)) return { points: entry.payload, stale: false };
  try {
    const { value, source } = await withProviders("intraday", (p) => p.intraday!(symbol, days));
    writeCache(key, value, source);
    return { points: value, stale: false };
  } catch {
    return { points: entry?.payload ?? [], stale: true };
  }
}

// ---------------------------------------------------------------------------
// Wechselkurse

export interface FxResult {
  rates: Map<string, string>;
  date: string | null;
  stale: boolean;
  source: string;
}

export async function getFxRates(): Promise<FxResult> {
  const { fx } = getProviders();
  const cls = dataClass();
  const key = `fx:${cls}:latest`;
  const entry = readCache<{ date: string; rates: Record<string, string> }>(key);
  if (entry && Date.now() - entry.fetchedAt < 3600_000) {
    return { rates: new Map(Object.entries(entry.payload.rates)), date: entry.payload.date, stale: false, source: fx.label };
  }
  try {
    const latest = await limited({ id: fx.id, minIntervalMs: 0 }, () => fx.latest());
    writeCache(key, { date: latest.date, rates: Object.fromEntries(latest.rates) }, fx.id);
    return { rates: latest.rates, date: latest.date, stale: false, source: fx.label };
  } catch {
    if (entry) return { rates: new Map(Object.entries(entry.payload.rates)), date: entry.payload.date, stale: true, source: fx.label };
    return { rates: new Map(), date: null, stale: true, source: fx.label };
  }
}

/** Historische Wechselkurse je Währung als Snapshots ("FX:USD"). */
export async function getFxHistory(currencies: string[], from: string, to: string = todayInBerlin()): Promise<Map<string, PricePoint[]>> {
  const out = new Map<string, PricePoint[]>();
  const wanted = currencies.filter((c) => c !== "EUR").map((c) => (c === "GBp" || c === "GBX" ? "GBP" : c));
  if (wanted.length === 0) return out;
  const { fx } = getProviders();
  const cls = dataClass();
  const metaKey = `fxhistory:${cls}`;
  const meta = readCache<HistoryMeta>(metaKey);
  const needsFetch = !meta || from < meta.payload.from || (meta.payload.to < to && Date.now() - meta.fetchedAt > 3 * 3600_000);
  if (needsFetch) {
    const fetchFrom = meta && from >= meta.payload.from ? meta.payload.to : from;
    try {
      const history = await limited({ id: fx.id, minIntervalMs: 0 }, () => fx.history(fetchFrom, to));
      const source = fx.isDemo ? "mock" : fx.id;
      for (const [ccy, points] of history) storePoints(`FX:${ccy}`, ccy, source, points);
      writeCache(metaKey, { from: meta ? (from < meta.payload.from ? from : meta.payload.from) : from, to } satisfies HistoryMeta, cls);
    } catch {
      // ohne Netz mit vorhandenen Snapshots weiter
    }
  }
  for (const ccy of new Set(wanted)) out.set(ccy, readPoints(`FX:${ccy}`, from, to));
  return out;
}

// ---------------------------------------------------------------------------
// Kennzahlen & Suche

export async function getFundamentals(symbol: string): Promise<(Fundamentals & { stale?: boolean }) | null> {
  const cls = dataClass();
  const key = `fund:${cls}:${symbol}`;
  const entry = readCache<Fundamentals | null>(key);
  if (entry && Date.now() - entry.fetchedAt < 12 * 3600_000) return entry.payload;
  try {
    const { value, source } = await withProviders("fundamentals", (p) => p.fundamentals!(symbol));
    writeCache(key, value, source);
    return value;
  } catch {
    return entry?.payload ? { ...entry.payload, stale: true } : null;
  }
}

export async function searchInstruments(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  const push = (r: SearchResult) => {
    const key = r.isin ?? r.symbol;
    if (seen.has(key) || seen.has(r.symbol)) return;
    seen.add(key);
    seen.add(r.symbol);
    results.push(r);
  };

  // 1. Eigene Instrumente
  const like = q.toLowerCase();
  for (const i of getDb().select().from(instruments).all()) {
    if (
      i.name.toLowerCase().includes(like) ||
      i.symbol.toLowerCase().startsWith(like) ||
      i.isin.toLowerCase() === like ||
      (i.wkn ?? "").toLowerCase() === like
    ) {
      push({
        symbol: i.symbol,
        name: i.name,
        exchange: null,
        kind: i.kind,
        currency: i.currency,
        isin: i.isin,
        wkn: i.wkn,
        sector: i.sector,
        country: i.country,
        origin: "portfolio",
      });
    }
  }
  // 2. Katalog
  for (const r of searchCatalog(q, 8)) push(r);
  // 3. Anbieter (gecacht)
  if (q.length >= 2 && results.length < 8) {
    const cls = dataClass();
    const key = `search:${cls}:${q.toLowerCase()}`;
    const entry = readCache<SearchResult[]>(key);
    let providerResults: SearchResult[] = [];
    if (entry && Date.now() - entry.fetchedAt < 24 * 3600_000) providerResults = entry.payload;
    else {
      try {
        const { value, source } = await withProviders("search", (p) => p.search!(q));
        providerResults = value;
        writeCache(key, value, source);
      } catch {
        providerResults = entry?.payload ?? [];
      }
    }
    for (const r of providerResults) push(r);
  }
  return results.slice(0, 12);
}

// ---------------------------------------------------------------------------
// Status für die Oberfläche

export interface ProviderInfo {
  id: string;
  label: string;
  isDemo: boolean;
  fallback: string | null;
  fxLabel: string;
  warnings: string[];
}

export function providerInfo(): ProviderInfo {
  const { primary, fallback, fx, warnings } = getProviders();
  return { id: primary.id, label: primary.label, isDemo: primary.isDemo, fallback: fallback?.label ?? null, fxLabel: fx.label, warnings };
}
