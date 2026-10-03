/**
 * Laufzeit-Konfiguration aus Umgebungsvariablen (.env.local).
 * API-Keys werden nur serverseitig gelesen und nie an den Browser gegeben.
 */

export type ProviderId = "yahoo" | "finnhub" | "fmp" | "alphavantage" | "mock";

export interface AppConfig {
  provider: ProviderId;
  fxProvider: "ecb" | "mock";
  finnhubKey: string | null;
  fmpKey: string | null;
  alphaVantageKey: string | null;
}

function clean(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export function getConfig(): AppConfig {
  const raw = (process.env.MARKET_DATA_PROVIDER ?? "yahoo").trim().toLowerCase();
  const provider: ProviderId = (["yahoo", "finnhub", "fmp", "alphavantage", "mock"] as const).includes(raw as ProviderId)
    ? (raw as ProviderId)
    : "yahoo";
  const fxRaw = (process.env.FX_PROVIDER ?? (provider === "mock" ? "mock" : "ecb")).trim().toLowerCase();
  return {
    provider,
    fxProvider: fxRaw === "mock" ? "mock" : "ecb",
    finnhubKey: clean(process.env.FINNHUB_API_KEY),
    fmpKey: clean(process.env.FMP_API_KEY),
    alphaVantageKey: clean(process.env.ALPHAVANTAGE_API_KEY),
  };
}
