import { Dec } from "@/domain/decimal";
import { catalogBySymbol } from "../catalog";
import { ProviderError } from "../types";

export async function fetchJson<T>(url: string, provider: string, timeoutMs = 10_000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: "application/json" }, cache: "no-store" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderError(`${provider}: Netzwerkfehler (${message})`, provider);
  }
  if (!res.ok) {
    throw new ProviderError(`${provider}: HTTP ${res.status}`, provider, res.status);
  }
  return (await res.json()) as T;
}

/** Float oder String vom Anbieter → Dezimal-String (oder null). */
export function dec(value: unknown, scale = 1): string | null {
  if (value === null || value === undefined || value === "" || value === "None" || value === "-") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const base = typeof value === "number" ? new Dec(value.toPrecision(12)) : new Dec(String(value));
  return base.times(scale).toString();
}

/** Notierungswährung, falls der Anbieter sie nicht mitliefert. */
export function inferCurrency(symbol: string): string {
  const entry = catalogBySymbol(symbol);
  if (entry) return entry.currency;
  const suffix = symbol.split(".")[1]?.toUpperCase();
  switch (suffix) {
    case undefined:
      return "USD";
    case "L":
      return "GBp";
    case "SW":
      return "CHF";
    case "CO":
      return "DKK";
    case "ST":
      return "SEK";
    case "OL":
      return "NOK";
    case "TO":
      return "CAD";
    case "T":
      return "JPY";
    default:
      return "EUR";
  }
}
