import { type Fundamentals, type MarketDataProvider, ProviderError, type ProviderQuote, type SearchResult } from "../types";
import { dec, fetchJson, inferCurrency } from "./http";

/**
 * Finnhub (API-Key nötig, kostenloser Tarif: 60 Anfragen/Minute, US-Werte).
 * Historische Tageskurse sind bei Finnhub kostenpflichtig – dafür springt
 * automatisch Yahoo Finance ein.
 */
export class FinnhubProvider implements MarketDataProvider {
  readonly id = "finnhub";
  readonly label = "Finnhub";
  readonly isDemo = false;
  readonly minIntervalMs = 1100;

  constructor(private readonly apiKey: string) {}

  private url(path: string, params: Record<string, string>): string {
    const qs = new URLSearchParams({ ...params, token: this.apiKey });
    return `https://finnhub.io/api/v1/${path}?${qs}`;
  }

  async quotes(symbols: string[]): Promise<Map<string, ProviderQuote>> {
    const out = new Map<string, ProviderQuote>();
    for (const symbol of symbols) {
      const q = await fetchJson<{ c?: number; pc?: number; t?: number }>(this.url("quote", { symbol }), "Finnhub");
      if (!q.c || q.c === 0) continue;
      out.set(symbol, {
        symbol,
        price: dec(q.c)!,
        previousClose: dec(q.pc),
        currency: inferCurrency(symbol),
        asOf: new Date((q.t ?? Date.now() / 1000) * 1000).toISOString(),
      });
    }
    return out;
  }

  async search(query: string): Promise<SearchResult[]> {
    const res = await fetchJson<{ result?: Array<{ description: string; displaySymbol: string; symbol: string; type: string }> }>(
      this.url("search", { q: query }),
      "Finnhub",
    );
    return (res.result ?? [])
      .filter((r) => r.type === "Common Stock" || r.type === "ETP" || r.type === "ETF")
      .slice(0, 10)
      .map((r) => ({
        symbol: r.symbol,
        name: r.description,
        exchange: null,
        kind: r.type === "Common Stock" ? ("STOCK" as const) : ("ETF" as const),
        currency: null,
        isin: null,
        wkn: null,
        sector: null,
        country: null,
        origin: "provider" as const,
      }));
  }

  async fundamentals(symbol: string): Promise<Fundamentals | null> {
    const [metric, profile] = await Promise.all([
      fetchJson<{ metric?: Record<string, number | null> }>(this.url("stock/metric", { symbol, metric: "all" }), "Finnhub"),
      fetchJson<{ currency?: string; country?: string; finnhubIndustry?: string; name?: string; marketCapitalization?: number }>(
        this.url("stock/profile2", { symbol }),
        "Finnhub",
      ),
    ]);
    if (!metric.metric && !profile.name) throw new ProviderError("Finnhub: keine Daten", "finnhub");
    const m = metric.metric ?? {};
    return {
      symbol,
      currency: profile.currency ?? null,
      // Finnhub liefert die Marktkapitalisierung in Millionen
      marketCap: dec(profile.marketCapitalization ?? m.marketCapitalization, 1_000_000),
      trailingPE: dec(m.peTTM ?? m.peBasicExclExtraTTM),
      forwardPE: null,
      dividendYield: dec(m.dividendYieldIndicatedAnnual, 0.01),
      fiftyTwoWeekLow: dec(m["52WeekLow"]),
      fiftyTwoWeekHigh: dec(m["52WeekHigh"]),
      sector: profile.finnhubIndustry ?? null,
      industry: profile.finnhubIndustry ?? null,
      country: profile.country ?? null,
      name: profile.name ?? null,
      asOf: new Date().toISOString(),
      source: "Finnhub",
    };
  }
}
