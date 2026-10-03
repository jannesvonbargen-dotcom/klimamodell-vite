import { Dec } from "@/domain/decimal";
import { businessDays } from "@/domain/performance";
import { EXCHANGES, exchangeForInstrument, nowInBerlin, wallTime, zonedToUtc } from "@/domain/market-hours";
import { catalogBySymbol, searchCatalog } from "../catalog";
import type { Fundamentals, FxProvider, MarketDataProvider, PricePoint, ProviderQuote, SearchResult } from "../types";

/**
 * Demo-Anbieter: erzeugt deterministische, simulierte Kurse (geometrische
 * Brownsche Bewegung mit festem Startwert je Symbol). Ein bestimmter Tag hat
 * immer denselben Kurs – unabhängig davon, wann abgefragt wird. Die App
 * kennzeichnet diese Kurse sichtbar als „Demo“. Kennzahlen wie KGV werden
 * bewusst NICHT simuliert (→ „keine Daten“).
 */

const HISTORY_START = "2015-01-02";
const ANCHOR_DATE = "2026-10-02";

/** Ungefähre Kursniveaus, an denen die Simulation ausgerichtet wird. */
const LEVELS: Record<string, number> = {
  AAPL: 255, MSFT: 515, AMZN: 220, GOOGL: 245, NVDA: 185, META: 720, TSLA: 430, "BRK-B": 500, V: 345, MA: 570,
  JNJ: 180, PG: 155, KO: 67, MCD: 305, COST: 920, LLY: 830, UNH: 345, JPM: 310, AVGO: 340, O: 60, NFLX: 1180,
  AMD: 165, PLTR: 180, WMT: 103, PEP: 142, "SAP.DE": 230, "SIE.DE": 235, "ALV.DE": 360, "DTE.DE": 29,
  "MBG.DE": 54, "BAS.DE": 43, "MUV2.DE": 545, "RHM.DE": 1900, "IFX.DE": 34, "ADS.DE": 180, "DHL.DE": 38,
  "BMW.DE": 86, "VOW3.DE": 95, "BAYN.DE": 28, "DBK.DE": 30, "ASML.AS": 820, "MC.PA": 520, "NOVO-B.CO": 350,
  "NESN.SW": 79, "TTE.PA": 52, "AIR.PA": 200, "EUNL.DE": 108, "VGWL.DE": 140, "VWCE.DE": 140, "IS3N.DE": 36,
  "XDWD.DE": 130, "SXR8.DE": 590, "SXRV.DE": 1250, "IUSQ.DE": 95, "EXS1.DE": 205, "SPYI.DE": 260,
  "XMME.DE": 64, "IQQH.DE": 7.5,
};

const FX_LEVELS: Record<string, { level: number; annualVol: number }> = {
  USD: { level: 1.17, annualVol: 0.07 },
  GBP: { level: 0.87, annualVol: 0.05 },
  CHF: { level: 0.935, annualVol: 0.05 },
  DKK: { level: 7.46, annualVol: 0.002 },
  SEK: { level: 11.0, annualVol: 0.06 },
  NOK: { level: 11.7, annualVol: 0.07 },
  JPY: { level: 172, annualVol: 0.09 },
  CAD: { level: 1.62, annualVol: 0.06 },
};

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standardnormalverteilte Zufallszahl, deterministisch aus einem Schlüssel. */
function gaussian(key: string): number {
  const rand = mulberry32(hashString(key));
  const u1 = Math.max(rand(), 1e-12);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function profile(symbol: string): { level: number; dailyVol: number; dailyDrift: number } {
  const entry = catalogBySymbol(symbol);
  const h = hashString(symbol);
  const level = LEVELS[symbol] ?? 20 + (h % 280);
  const annualVol = entry?.kind === "ETF" ? 0.14 + ((h >> 8) % 5) / 100 : 0.22 + ((h >> 8) % 18) / 100;
  const annualDrift = entry?.kind === "ETF" ? 0.07 : 0.04 + ((h >> 4) % 10) / 100;
  return { level, dailyVol: annualVol / Math.sqrt(252), dailyDrift: annualDrift / 252 };
}

/** Rundet einen simulierten Kurs auf 2 bzw. 4 Stellen und gibt einen Dezimal-String zurück. */
function toPriceString(value: number): string {
  const dp = value < 1 ? 4 : value < 20 ? 3 : 2;
  return new Dec(value.toFixed(dp)).toString();
}

interface DailyPath {
  days: string[];
  index: Map<string, number>;
  closes: number[];
}

const pathCache = new Map<string, DailyPath>();

function horizonDate(): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + 3);
  return now.toISOString().slice(0, 10);
}

function dailyPath(symbol: string, volOverride?: number, levelOverride?: number): DailyPath {
  const cacheKey = `${symbol}|${volOverride ?? ""}|${levelOverride ?? ""}`;
  const horizon = horizonDate();
  const cached = pathCache.get(cacheKey);
  if (cached && cached.days[cached.days.length - 1] >= horizon) return cached;

  const p = profile(symbol);
  const dailyVol = volOverride ?? p.dailyVol;
  const level = levelOverride ?? p.level;
  const days = businessDays(HISTORY_START, horizon > ANCHOR_DATE ? horizon : ANCHOR_DATE);
  const logs: number[] = [];
  let acc = 0;
  for (const day of days) {
    acc += (volOverride !== undefined ? 0 : p.dailyDrift) - (dailyVol * dailyVol) / 2 + dailyVol * gaussian(`${symbol}|${day}`);
    logs.push(acc);
  }
  let anchorIdx = days.indexOf(ANCHOR_DATE);
  if (anchorIdx < 0) anchorIdx = days.length - 1;
  const anchorLog = logs[anchorIdx];
  const closes = logs.map((l) => level * Math.exp(l - anchorLog));
  const path: DailyPath = { days, index: new Map(days.map((d, i) => [d, i])), closes };
  pathCache.set(cacheKey, path);
  return path;
}

function sessionFor(symbol: string): { tz: string; open: [number, number]; close: [number, number] } {
  const entry = catalogBySymbol(symbol);
  const ex = EXCHANGES[exchangeForInstrument(symbol, entry?.currency ?? (symbol.includes(".") ? "EUR" : "USD"))];
  return { tz: ex.timeZone, open: ex.open, close: ex.close };
}

/** Intraday-Pfad eines Handelstages (5-Minuten-Raster) als Brownsche Brücke vom Vortagesschluss zum Tagesschluss. */
function intradayPath(symbol: string, day: string): Array<{ at: Date; price: number }> {
  const path = dailyPath(symbol);
  const idx = path.index.get(day);
  if (idx === undefined || idx === 0) return [];
  const prev = path.closes[idx - 1];
  const close = path.closes[idx];
  const s = sessionFor(symbol);
  const start = zonedToUtc(day, s.open[0], s.open[1], s.tz).getTime();
  const end = zonedToUtc(day, s.close[0], s.close[1], s.tz).getTime();
  const step = 5 * 60 * 1000;
  const n = Math.max(1, Math.round((end - start) / step));
  const { dailyVol } = profile(symbol);
  const sigma = dailyVol / Math.sqrt(n);
  const walk: number[] = [0];
  for (let i = 1; i <= n; i++) walk.push(walk[i - 1] + sigma * gaussian(`${symbol}|${day}|${i}`));
  const drift = Math.log(close / prev);
  const out: Array<{ at: Date; price: number }> = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const bridge = walk[i] - t * walk[n];
    out.push({ at: new Date(start + i * step), price: prev * Math.exp(t * drift + bridge) });
  }
  return out;
}

function berlinKey(at: Date): string {
  const wt = wallTime(at, "Europe/Berlin");
  const hh = String(Math.floor(wt.minutes / 60)).padStart(2, "0");
  const mm = String(wt.minutes % 60).padStart(2, "0");
  return `${wt.date}T${hh}:${mm}`;
}

/** Letzter abgeschlossener oder laufender Handelstag ≤ heute (Ortszeit der Börse). */
function currentSession(symbol: string, now: Date): { day: string; prevIdx: number; idx: number } | null {
  const path = dailyPath(symbol);
  const s = sessionFor(symbol);
  const localDate = wallTime(now, s.tz).date;
  let idx = -1;
  for (let i = path.days.length - 1; i >= 0; i--) {
    if (path.days[i] <= localDate) {
      idx = i;
      break;
    }
  }
  if (idx <= 0) return null;
  // Vor Handelsbeginn zählt noch der Vortag als aktuelle Sitzung
  const openAt = zonedToUtc(path.days[idx], s.open[0], s.open[1], s.tz);
  if (path.days[idx] === localDate && now < openAt) idx -= 1;
  return { day: path.days[idx], prevIdx: idx - 1, idx };
}

/** Simuliert nur bekannte Werte – für unbekannte Symbole gibt es bewusst keine erfundenen Kurse. */
export function isSimulated(symbol: string): boolean {
  return symbol in LEVELS || !!catalogBySymbol(symbol);
}

export function mockQuote(symbol: string, now: Date = new Date()): ProviderQuote | null {
  if (!isSimulated(symbol)) return null;
  const session = currentSession(symbol, now);
  if (!session) return null;
  const path = dailyPath(symbol);
  const points = intradayPath(symbol, session.day).filter((p) => p.at <= now);
  const last = points.length ? points[points.length - 1] : { at: now, price: path.closes[session.idx] };
  const entry = catalogBySymbol(symbol);
  return {
    symbol,
    price: toPriceString(last.price),
    previousClose: toPriceString(path.closes[session.prevIdx]),
    currency: entry?.currency ?? (symbol.includes(".") ? "EUR" : "USD"),
    asOf: last.at.toISOString(),
    name: entry?.name,
  };
}

export class MockProvider implements MarketDataProvider {
  readonly id = "mock";
  readonly label = "Demo (simulierte Kurse)";
  readonly isDemo = true;
  readonly minIntervalMs = 0;

  async quotes(symbols: string[]): Promise<Map<string, ProviderQuote>> {
    const out = new Map<string, ProviderQuote>();
    const now = new Date();
    for (const symbol of symbols) {
      const q = mockQuote(symbol, now);
      if (q) out.set(symbol, q);
    }
    return out;
  }

  async dailyHistory(symbol: string, from: string, to: string): Promise<PricePoint[]> {
    if (!isSimulated(symbol)) return [];
    const path = dailyPath(symbol);
    const today = nowInBerlin().slice(0, 10);
    const session = currentSession(symbol, new Date());
    const out: PricePoint[] = [];
    for (let i = 0; i < path.days.length; i++) {
      const day = path.days[i];
      if (day < from || day > to || day > today) continue;
      // Die laufende Sitzung hat noch keinen Schlusskurs
      if (session && day === session.day && day === today && i === session.idx && !sessionClosed(symbol, day)) continue;
      out.push({ key: day, close: toPriceString(path.closes[i]) });
    }
    return out;
  }

  async intraday(symbol: string, days: 1 | 5): Promise<PricePoint[]> {
    if (!isSimulated(symbol)) return [];
    const now = new Date();
    const session = currentSession(symbol, now);
    if (!session) return [];
    const path = dailyPath(symbol);
    const sessionDays = path.days.slice(Math.max(1, session.idx - days + 1), session.idx + 1);
    const out: PricePoint[] = [];
    for (const day of sessionDays) {
      const pts = intradayPath(symbol, day).filter((p) => p.at <= now);
      const stepped = days === 5 ? pts.filter((_, i) => i % 6 === 0 || i === pts.length - 1) : pts;
      for (const p of stepped) out.push({ key: berlinKey(p.at), close: toPriceString(p.price) });
    }
    return out;
  }

  async search(query: string): Promise<SearchResult[]> {
    return searchCatalog(query, 10);
  }

  async fundamentals(symbol: string): Promise<Fundamentals | null> {
    if (!isSimulated(symbol)) return null;
    const history = await this.dailyHistory(symbol, oneYearAgo(), nowInBerlin().slice(0, 10));
    const closes = history.map((p) => Number(p.close));
    const entry = catalogBySymbol(symbol);
    return {
      symbol,
      currency: entry?.currency ?? null,
      marketCap: null,
      trailingPE: null,
      forwardPE: null,
      dividendYield: null,
      fiftyTwoWeekLow: closes.length ? toPriceString(Math.min(...closes)) : null,
      fiftyTwoWeekHigh: closes.length ? toPriceString(Math.max(...closes)) : null,
      sector: entry?.sector ?? null,
      industry: null,
      country: entry?.country ?? null,
      name: entry?.name ?? null,
      asOf: new Date().toISOString(),
      source: "Demo (simuliert)",
    };
  }
}

function sessionClosed(symbol: string, day: string): boolean {
  const s = sessionFor(symbol);
  return new Date() >= zonedToUtc(day, s.close[0], s.close[1], s.tz);
}

function oneYearAgo(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

export class MockFxProvider implements FxProvider {
  readonly id = "mock-fx";
  readonly label = "Demo-Wechselkurse (simuliert)";
  readonly isDemo = true;

  private rate(ccy: string, day: string): string | null {
    const cfg = FX_LEVELS[ccy];
    if (!cfg) return null;
    const path = dailyPath(`FX:${ccy}`, cfg.annualVol / Math.sqrt(252), cfg.level);
    const idx = path.index.get(day);
    if (idx === undefined) return null;
    return new Dec(path.closes[idx].toFixed(4)).toString();
  }

  async latest(): Promise<{ date: string; rates: Map<string, string> }> {
    const today = nowInBerlin().slice(0, 10);
    const days = businessDays("2015-01-02", today);
    const date = days[days.length - 1];
    const rates = new Map<string, string>();
    for (const ccy of Object.keys(FX_LEVELS)) {
      const r = this.rate(ccy, date);
      if (r) rates.set(ccy, r);
    }
    return { date, rates };
  }

  async history(from: string, to: string): Promise<Map<string, PricePoint[]>> {
    const out = new Map<string, PricePoint[]>();
    const days = businessDays(from, to);
    for (const ccy of Object.keys(FX_LEVELS)) {
      const pts: PricePoint[] = [];
      for (const day of days) {
        const r = this.rate(ccy, day);
        if (r) pts.push({ key: day, close: r });
      }
      out.set(ccy, pts);
    }
    return out;
  }
}
