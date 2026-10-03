import {
  type Fundamentals,
  type MarketDataProvider,
  type PricePoint,
  ProviderError,
  type ProviderQuote,
  type SearchResult,
} from "../types";
import { dec, fetchJson, inferCurrency, perSymbol } from "./http";

/**
 * Alpha Vantage (API-Key nötig, kostenloser Tarif: 25 Anfragen pro Tag).
 * Deshalb cacht die App hier besonders aggressiv.
 */
export class AlphaVantageProvider implements MarketDataProvider {
  readonly id = "alphavantage";
  readonly label = "Alpha Vantage";
  readonly isDemo = false;
  readonly minIntervalMs = 12_500;

  constructor(private readonly apiKey: string) {}

  private async call<T extends Record<string, unknown>>(params: Record<string, string>): Promise<T> {
    const qs = new URLSearchParams({ ...params, apikey: this.apiKey });
    const res = await fetchJson<T>(`https://www.alphavantage.co/query?${qs}`, "Alpha Vantage");
    const note = (res.Note ?? res.Information ?? res["Error Message"]) as string | undefined;
    if (note) throw new ProviderError(`Alpha Vantage: ${note}`, "alphavantage", 429);
    return res;
  }

  async quotes(symbols: string[]): Promise<Map<string, ProviderQuote>> {
    return perSymbol(symbols, async (symbol) => {
      const res = await this.call<{ "Global Quote"?: Record<string, string> }>({ function: "GLOBAL_QUOTE", symbol });
      const q = res["Global Quote"];
      if (!q?.["05. price"]) return null;
      return {
        symbol,
        price: dec(q["05. price"])!,
        previousClose: dec(q["08. previous close"]),
        currency: inferCurrency(symbol),
        asOf: new Date(`${q["07. latest trading day"]}T21:00:00Z`).toISOString(),
      };
    });
  }

  async dailyHistory(symbol: string, from: string, to: string): Promise<PricePoint[]> {
    const res = await this.call<{ "Time Series (Daily)"?: Record<string, Record<string, string>> }>({
      function: "TIME_SERIES_DAILY",
      symbol,
      outputsize: "compact",
    });
    const series = res["Time Series (Daily)"] ?? {};
    return Object.entries(series)
      .filter(([date]) => date >= from && date <= to)
      .map(([date, v]) => ({ key: date, close: dec(v["4. close"]) }))
      .filter((p): p is PricePoint => p.close !== null)
      .sort((a, b) => (a.key < b.key ? -1 : 1));
  }

  async search(query: string): Promise<SearchResult[]> {
    const res = await this.call<{ bestMatches?: Array<Record<string, string>> }>({ function: "SYMBOL_SEARCH", keywords: query });
    return (res.bestMatches ?? []).slice(0, 10).map((m) => ({
      symbol: m["1. symbol"],
      name: m["2. name"],
      exchange: m["4. region"] ?? null,
      kind: m["3. type"] === "ETF" ? ("ETF" as const) : ("STOCK" as const),
      currency: m["8. currency"] ?? null,
      isin: null,
      wkn: null,
      sector: null,
      country: null,
      origin: "provider" as const,
    }));
  }

  async fundamentals(symbol: string): Promise<Fundamentals | null> {
    const o = await this.call<Record<string, string>>({ function: "OVERVIEW", symbol });
    if (!o.Symbol) return null;
    return {
      symbol,
      currency: o.Currency ?? null,
      marketCap: dec(o.MarketCapitalization),
      trailingPE: dec(o.PERatio),
      forwardPE: dec(o.ForwardPE),
      dividendYield: dec(o.DividendYield),
      fiftyTwoWeekLow: dec(o["52WeekLow"]),
      fiftyTwoWeekHigh: dec(o["52WeekHigh"]),
      sector: o.Sector ?? null,
      industry: o.Industry ?? null,
      country: o.Country ?? null,
      name: o.Name ?? null,
      asOf: new Date().toISOString(),
      source: "Alpha Vantage",
    };
  }
}
