import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { watchlist } from "@/db/schema";
import { d, parseLocaleNumber } from "@/domain/decimal";
import { todayInBerlin } from "@/domain/market-hours";
import type { Quote } from "@/domain/valuation";
import { catalogBySymbol } from "@/market/catalog";
import { getDailyHistory, getQuotes, providerInfo } from "./market";
import { listWatchlist } from "./repo";
import type { ActionResult } from "./transactions";

/** Watchlist mit Kursalarmen (Kurs über/unter einer Schwelle). */

export interface WatchlistInput {
  symbol: string;
  name: string;
  isin?: string | null;
  currency?: string | null;
}

export function addToWatchlist(input: WatchlistInput): ActionResult<{ id: number }> {
  const symbol = input.symbol.trim();
  const name = input.name.trim();
  if (!/^[A-Za-z0-9.\-=^]{1,20}$/.test(symbol)) return { ok: false, errors: { symbol: "Ungültiges Symbol." } };
  if (!name) return { ok: false, errors: { name: "Name fehlt." } };
  const db = getDb();
  const existing = db.select().from(watchlist).where(eq(watchlist.symbol, symbol)).get();
  if (existing) return { ok: true, id: existing.id };
  const currency = input.currency?.trim() || catalogBySymbol(symbol)?.currency || "EUR";
  const row = db
    .insert(watchlist)
    .values({ symbol, name, isin: input.isin?.trim() || null, currency })
    .returning()
    .get();
  return { ok: true, id: row.id };
}

export function removeFromWatchlist(id: number): void {
  getDb().delete(watchlist).where(eq(watchlist.id, id)).run();
}

export function removeSymbolFromWatchlist(symbol: string): void {
  getDb().delete(watchlist).where(eq(watchlist.symbol, symbol)).run();
}

function parseThreshold(raw: string | null | undefined): { value: string | null; error?: string } {
  if (raw === null || raw === undefined || raw.trim() === "") return { value: null };
  const v = parseLocaleNumber(raw, "auto");
  if (!v || v.lte(0)) return { value: null, error: "Positiven Kurs angeben." };
  return { value: v.toString() };
}

export function updateWatchlistItem(
  id: number,
  patch: { alertAbove?: string | null; alertBelow?: string | null; note?: string | null },
): ActionResult {
  const above = parseThreshold(patch.alertAbove);
  const below = parseThreshold(patch.alertBelow);
  const errors: Record<string, string> = {};
  if (above.error) errors.alertAbove = above.error;
  if (below.error) errors.alertBelow = below.error;
  if (above.value && below.value && d(below.value).gte(above.value)) errors.alertBelow = "Muss unter der oberen Schwelle liegen.";
  if (Object.keys(errors).length) return { ok: false, errors };
  getDb()
    .update(watchlist)
    .set({ alertAbove: above.value, alertBelow: below.value, note: patch.note?.trim() || null })
    .where(eq(watchlist.id, id))
    .run();
  return { ok: true };
}

export type AlertState = "above" | "below" | null;

export function alertState(price: string | null, above: string | null, below: string | null): AlertState {
  if (!price) return null;
  if (above && d(price).gte(above)) return "above";
  if (below && d(price).lte(below)) return "below";
  return null;
}

export interface WatchlistEntry {
  id: number;
  symbol: string;
  name: string;
  isin: string | null;
  currency: string;
  alertAbove: string | null;
  alertBelow: string | null;
  note: string | null;
  createdAt: string;
  quote: Quote | null;
  /** Veränderung zum Vortag (Bruch). */
  dayChange: string | null;
  /** Veränderung seit Aufnahme in die Watchlist (Bruch), sofern Kurs von damals bekannt. */
  sinceAdded: string | null;
  alert: AlertState;
  spark: string[];
}

function daysAgo(today: string, days: number): string {
  const dt = new Date(`${today}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

export async function getWatchlist(): Promise<{
  entries: WatchlistEntry[];
  errors: string[];
  isDemo: boolean;
  lastFetchedAt: string | null;
}> {
  const rows = listWatchlist();
  const today = todayInBerlin();
  const { quotes, errors, lastFetchedAt } = await getQuotes(rows.map((r) => r.symbol));
  const entries = await Promise.all(
    rows.map(async (r): Promise<WatchlistEntry> => {
      const q = quotes.get(r.symbol) ?? null;
      const createdAt = new Date(r.createdAt).toISOString();
      const addedDay = createdAt.slice(0, 10);
      let spark: string[] = [];
      let sinceAdded: string | null = null;
      try {
        const from = addedDay < daysAgo(today, 30) ? addedDay : daysAgo(today, 30);
        const history = await getDailyHistory(r.symbol, from, today);
        spark = history.filter((p) => p.key >= daysAgo(today, 30)).map((p) => p.close);
        const atAdd = history.find((p) => p.key >= addedDay);
        if (q && atAdd && addedDay < today && d(atAdd.close).gt(0)) sinceAdded = d(q.price).div(atAdd.close).minus(1).toString();
      } catch {
        // ohne Verlauf
      }
      return {
        id: r.id,
        symbol: r.symbol,
        name: r.name,
        isin: r.isin,
        currency: q?.currency ?? r.currency,
        alertAbove: r.alertAbove,
        alertBelow: r.alertBelow,
        note: r.note,
        createdAt,
        quote: q,
        dayChange: q?.previousClose && d(q.previousClose).gt(0) ? d(q.price).div(q.previousClose).minus(1).toString() : null,
        sinceAdded,
        alert: alertState(q?.price ?? null, r.alertAbove, r.alertBelow),
        spark,
      };
    }),
  );
  return { entries, errors, isDemo: providerInfo().isDemo, lastFetchedAt };
}

export interface TriggeredAlert {
  id: number;
  symbol: string;
  name: string;
  state: "above" | "below";
  threshold: string;
  price: string;
  currency: string;
}

/** Ausgelöste Kursalarme (Kurse aus dem Cache bzw. vom Anbieter, 60 s/15 min Gültigkeit). */
export async function triggeredAlerts(): Promise<TriggeredAlert[]> {
  const rows = listWatchlist().filter((r) => r.alertAbove || r.alertBelow);
  if (rows.length === 0) return [];
  const { quotes } = await getQuotes(rows.map((r) => r.symbol));
  const out: TriggeredAlert[] = [];
  for (const r of rows) {
    const q = quotes.get(r.symbol);
    const state = alertState(q?.price ?? null, r.alertAbove, r.alertBelow);
    if (!state || !q) continue;
    out.push({
      id: r.id,
      symbol: r.symbol,
      name: r.name,
      state,
      threshold: (state === "above" ? r.alertAbove : r.alertBelow)!,
      price: q.price,
      currency: q.currency,
    });
  }
  return out;
}

/** Anzahl ausgelöster Kursalarme (für das Menü). */
export async function triggeredAlertCount(): Promise<number> {
  return (await triggeredAlerts()).length;
}
