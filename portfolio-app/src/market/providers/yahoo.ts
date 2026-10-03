import YahooFinance from "yahoo-finance2";
import { Dec } from "@/domain/decimal";
import { wallTime } from "@/domain/market-hours";
import {
  type Fundamentals,
  type MarketDataProvider,
  type PricePoint,
  ProviderError,
  type ProviderQuote,
  type SearchResult,
} from "../types";

/**
 * Yahoo Finance über yahoo-finance2 (inoffiziell, ohne API-Key).
 * Kurse sind je nach Börse verzögert (meist 15 Minuten).
 */

let client: InstanceType<typeof YahooFinance> | null = null;
function yf(): InstanceType<typeof YahooFinance> {
  if (!client) {
    client = new YahooFinance({
      suppressNotices: ["yahooSurvey", "ripHistorical"],
      versionCheck: false,
      validation: { logErrors: false, logOptionsErrors: false },
    });
  }
  return client;
}

function num(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  // Yahoo liefert Floats; wir übernehmen sie mit begrenzter Stellenzahl als Dezimal-String
  return new Dec(value.toPrecision(12)).toString();
}

function berlinKey(at: Date): string {
  const wt = wallTime(at, "Europe/Berlin");
  const hh = String(Math.floor(wt.minutes / 60)).padStart(2, "0");
  const mm = String(wt.minutes % 60).padStart(2, "0");
  return `${wt.date}T${hh}:${mm}`;
}

function wrap(error: unknown): ProviderError {
  const message = error instanceof Error ? error.message : String(error);
  return new ProviderError(`Yahoo Finance: ${message}`, "yahoo");
}

export class YahooProvider implements MarketDataProvider {
  readonly id = "yahoo";
  readonly label = "Yahoo Finance";
  readonly isDemo = false;
  readonly minIntervalMs = 250;

  async quotes(symbols: string[]): Promise<Map<string, ProviderQuote>> {
    const out = new Map<string, ProviderQuote>();
    if (symbols.length === 0) return out;
    try {
      const results = await yf().quote(symbols, { return: "array" });
      for (const q of results) {
        const price = num(q.regularMarketPrice);
        if (!price || !q.currency) continue;
        out.set(q.symbol, {
          symbol: q.symbol,
          price,
          previousClose: num(q.regularMarketPreviousClose),
          currency: q.currency,
          asOf: (q.regularMarketTime instanceof Date ? q.regularMarketTime : new Date()).toISOString(),
          name: q.longName ?? q.shortName ?? undefined,
        });
      }
      return out;
    } catch (error) {
      throw wrap(error);
    }
  }

  async dailyHistory(symbol: string, from: string, to: string): Promise<PricePoint[]> {
    try {
      const end = new Date(`${to}T23:59:59Z`);
      const result = await yf().chart(symbol, { period1: `${from}`, period2: end, interval: "1d" });
      const tz = typeof result.meta.exchangeTimezoneName === "string" ? result.meta.exchangeTimezoneName : "Europe/Berlin";
      const out: PricePoint[] = [];
      for (const q of result.quotes) {
        const close = num(q.close);
        if (!close) continue;
        out.push({ key: wallTime(q.date, tz).date, close });
      }
      return dedupeByKey(out);
    } catch (error) {
      throw wrap(error);
    }
  }

  async intraday(symbol: string, days: 1 | 5): Promise<PricePoint[]> {
    try {
      const period1 = new Date(Date.now() - (days === 1 ? 4 : 9) * 24 * 3600 * 1000);
      const result = await yf().chart(symbol, { period1, interval: days === 1 ? "5m" : "30m" });
      const points = result.quotes
        .map((q) => ({ at: q.date, close: num(q.close) }))
        .filter((p): p is { at: Date; close: string } => p.close !== null);
      if (points.length === 0) return [];
      // Nur die letzten `days` Handelstage
      const tz = typeof result.meta.exchangeTimezoneName === "string" ? result.meta.exchangeTimezoneName : "Europe/Berlin";
      const sessionDays = [...new Set(points.map((p) => wallTime(p.at, tz).date))].slice(-days);
      return points.filter((p) => sessionDays.includes(wallTime(p.at, tz).date)).map((p) => ({ key: berlinKey(p.at), close: p.close }));
    } catch (error) {
      throw wrap(error);
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const result = await yf().search(query, { quotesCount: 10, newsCount: 0, lang: "de-DE", region: "DE" });
      const out: SearchResult[] = [];
      for (const q of result.quotes) {
        if (!("isYahooFinance" in q) || !q.isYahooFinance) continue;
        const type = (q as { quoteType?: string }).quoteType;
        if (type !== "EQUITY" && type !== "ETF") continue;
        out.push({
          symbol: q.symbol,
          name: q.longname ?? q.shortname ?? q.symbol,
          exchange: q.exchDisp ?? q.exchange ?? null,
          kind: type === "ETF" ? "ETF" : "STOCK",
          currency: null,
          isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(query.trim().toUpperCase()) ? query.trim().toUpperCase() : null,
          wkn: null,
          sector: typeof q.sector === "string" ? q.sector : null,
          country: null,
          origin: "provider",
        });
      }
      return out;
    } catch (error) {
      throw wrap(error);
    }
  }

  async fundamentals(symbol: string): Promise<Fundamentals | null> {
    try {
      const [q] = await yf().quote([symbol], { return: "array" });
      if (!q) return null;
      let sector: string | null = null;
      let industry: string | null = null;
      let country: string | null = null;
      try {
        const summary = await yf().quoteSummary(symbol, { modules: ["assetProfile"] });
        sector = summary.assetProfile?.sector ?? null;
        industry = summary.assetProfile?.industry ?? null;
        country = summary.assetProfile?.country ?? null;
      } catch {
        // ETFs haben kein assetProfile – kein Fehler
      }
      const record = q as unknown as Record<string, unknown>;
      return {
        symbol,
        currency: q.currency ?? null,
        marketCap: num(record.marketCap),
        trailingPE: num(record.trailingPE),
        forwardPE: num(record.forwardPE),
        dividendYield:
          num(record.trailingAnnualDividendYield) ??
          (typeof record.dividendYield === "number" ? num((record.dividendYield as number) / 100) : null),
        fiftyTwoWeekLow: num(record.fiftyTwoWeekLow),
        fiftyTwoWeekHigh: num(record.fiftyTwoWeekHigh),
        sector,
        industry,
        country,
        name: q.longName ?? q.shortName ?? null,
        asOf: new Date().toISOString(),
        source: "Yahoo Finance",
      };
    } catch (error) {
      throw wrap(error);
    }
  }
}

function dedupeByKey(points: PricePoint[]): PricePoint[] {
  const map = new Map<string, PricePoint>();
  for (const p of points) map.set(p.key, p);
  return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}
