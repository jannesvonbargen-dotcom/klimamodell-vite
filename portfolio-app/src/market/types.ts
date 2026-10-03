/** Gemeinsame Typen der Kursanbieter-Adapter. Zahlen als Dezimal-Strings. */

export interface ProviderQuote {
  symbol: string;
  price: string;
  previousClose: string | null;
  currency: string;
  /** ISO-Zeitstempel (UTC) des Kurses. */
  asOf: string;
  name?: string;
}

/** Ein Kurspunkt; `key` ist "YYYY-MM-DD" (täglich) oder "YYYY-MM-DDTHH:mm" (Berliner Ortszeit). */
export interface PricePoint {
  key: string;
  close: string;
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string | null;
  kind: "STOCK" | "ETF" | "OTHER";
  currency: string | null;
  isin: string | null;
  wkn: string | null;
  sector: string | null;
  country: string | null;
  /** Woher der Treffer stammt (Katalog, Depot, Anbieter). */
  origin: "catalog" | "portfolio" | "provider";
}

export interface Fundamentals {
  symbol: string;
  currency: string | null;
  marketCap: string | null;
  trailingPE: string | null;
  forwardPE: string | null;
  /** Dividendenrendite als Bruch (0.012 = 1,2 %). */
  dividendYield: string | null;
  fiftyTwoWeekLow: string | null;
  fiftyTwoWeekHigh: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  name: string | null;
  asOf: string;
  source: string;
}

export interface MarketDataProvider {
  readonly id: string;
  readonly label: string;
  /** Demo-Anbieter liefert simulierte Kurse – die App weist sichtbar darauf hin. */
  readonly isDemo: boolean;
  /** Minimaler Abstand zwischen zwei Anfragen in Millisekunden. */
  readonly minIntervalMs: number;
  quotes?(symbols: string[]): Promise<Map<string, ProviderQuote>>;
  dailyHistory?(symbol: string, from: string, to: string): Promise<PricePoint[]>;
  intraday?(symbol: string, days: 1 | 5): Promise<PricePoint[]>;
  search?(query: string): Promise<SearchResult[]>;
  fundamentals?(symbol: string): Promise<Fundamentals | null>;
}

/** Wechselkurse: Einheiten Fremdwährung je 1 EUR. */
export interface FxProvider {
  readonly id: string;
  readonly label: string;
  readonly isDemo: boolean;
  latest(): Promise<{ date: string; rates: Map<string, string> }>;
  history(from: string, to: string): Promise<Map<string, PricePoint[]>>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
