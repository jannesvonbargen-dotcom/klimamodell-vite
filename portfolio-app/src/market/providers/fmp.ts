import type { Fundamentals, MarketDataProvider, PricePoint, ProviderQuote, SearchResult } from "../types";
import { dec, fetchJson, inferCurrency, perSymbol } from "./http";

/**
 * Financial Modeling Prep (API-Key nötig). Der kostenlose Tarif deckt vor
 * allem US-Werte ab; fehlende Funktionen übernimmt Yahoo Finance.
 */
export class FmpProvider implements MarketDataProvider {
  readonly id = "fmp";
  readonly label = "Financial Modeling Prep";
  readonly isDemo = false;
  readonly minIntervalMs = 300;

  constructor(private readonly apiKey: string) {}

  private url(path: string, params: Record<string, string>): string {
    const qs = new URLSearchParams({ ...params, apikey: this.apiKey });
    return `https://financialmodelingprep.com/stable/${path}?${qs}`;
  }

  async quotes(symbols: string[]): Promise<Map<string, ProviderQuote>> {
    return perSymbol(symbols, async (symbol) => {
      const res = await fetchJson<Array<{ symbol: string; name?: string; price?: number; previousClose?: number; timestamp?: number }>>(
        this.url("quote", { symbol }),
        "FMP",
      );
      const q = res[0];
      if (!q?.price) return null;
      return {
        symbol,
        price: dec(q.price)!,
        previousClose: dec(q.previousClose),
        currency: inferCurrency(symbol),
        asOf: new Date((q.timestamp ?? Date.now() / 1000) * 1000).toISOString(),
        name: q.name,
      };
    });
  }

  async dailyHistory(symbol: string, from: string, to: string): Promise<PricePoint[]> {
    const res = await fetchJson<Array<{ date: string; close?: number; price?: number }>>(
      this.url("historical-price-eod/full", { symbol, from, to }),
      "FMP",
    );
    return res
      .map((r) => ({ key: r.date.slice(0, 10), close: dec(r.close ?? r.price) }))
      .filter((p): p is PricePoint => p.close !== null)
      .sort((a, b) => (a.key < b.key ? -1 : 1));
  }

  async search(query: string): Promise<SearchResult[]> {
    const res = await fetchJson<Array<{ symbol: string; name: string; currency?: string; exchange?: string }>>(
      this.url("search-name", { query, limit: "10" }),
      "FMP",
    );
    return res.map((r) => ({
      symbol: r.symbol,
      name: r.name,
      exchange: r.exchange ?? null,
      kind: "STOCK" as const,
      currency: r.currency ?? null,
      isin: null,
      wkn: null,
      sector: null,
      country: null,
      origin: "provider" as const,
    }));
  }

  async fundamentals(symbol: string): Promise<Fundamentals | null> {
    const [profiles, ratios] = await Promise.all([
      fetchJson<
        Array<{
          companyName?: string;
          currency?: string;
          sector?: string;
          industry?: string;
          country?: string;
          marketCap?: number;
          range?: string;
        }>
      >(this.url("profile", { symbol }), "FMP"),
      fetchJson<Array<{ priceToEarningsRatioTTM?: number; dividendYieldTTM?: number }>>(this.url("ratios-ttm", { symbol }), "FMP").catch(
        () => [],
      ),
    ]);
    const p = profiles[0];
    if (!p) return null;
    const r = ratios[0] ?? {};
    const [low, high] = (p.range ?? "").split("-").map((s) => s.trim());
    return {
      symbol,
      currency: p.currency ?? null,
      marketCap: dec(p.marketCap),
      trailingPE: dec(r.priceToEarningsRatioTTM),
      forwardPE: null,
      dividendYield: dec(r.dividendYieldTTM),
      fiftyTwoWeekLow: dec(low),
      fiftyTwoWeekHigh: dec(high),
      sector: p.sector ?? null,
      industry: p.industry ?? null,
      country: p.country ?? null,
      name: p.companyName ?? null,
      asOf: new Date().toISOString(),
      source: "Financial Modeling Prep",
    };
  }
}
