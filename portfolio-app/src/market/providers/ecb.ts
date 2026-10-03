import type { FxProvider, PricePoint } from "../types";
import { ProviderError } from "../types";

/**
 * Referenzkurse der Europäischen Zentralbank (kostenlos, ohne Key,
 * werktäglich gegen 16:00 MEZ). Notation: 1 EUR = x Fremdwährung.
 */
const DAILY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const HIST_90_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";
const HIST_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml";

async function fetchXml(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
  } catch (error) {
    throw new ProviderError(`EZB: Netzwerkfehler (${error instanceof Error ? error.message : String(error)})`, "ecb");
  }
  if (!res.ok) throw new ProviderError(`EZB: HTTP ${res.status}`, "ecb", res.status);
  return res.text();
}

/** Parst das EZB-XML in Tage → Währung → Kurs (ohne XML-Bibliothek). */
export function parseEcbXml(xml: string): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  const dayRe = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>/g;
  const rateRe = /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]\s*\/>/g;
  for (const day of xml.matchAll(dayRe)) {
    const rates = new Map<string, string>();
    for (const r of day[2].matchAll(rateRe)) rates.set(r[1], r[2]);
    out.set(day[1], rates);
  }
  return out;
}

export class EcbFxProvider implements FxProvider {
  readonly id = "ecb";
  readonly label = "EZB-Referenzkurse";
  readonly isDemo = false;

  async latest(): Promise<{ date: string; rates: Map<string, string> }> {
    const parsed = parseEcbXml(await fetchXml(DAILY_URL));
    const [date, rates] = [...parsed.entries()][0] ?? [];
    if (!date || !rates) throw new ProviderError("EZB: unerwartetes Format", "ecb");
    return { date, rates };
  }

  async history(from: string, to: string): Promise<Map<string, PricePoint[]>> {
    const ninetyDaysAgo = new Date(Date.now() - 85 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const parsed = parseEcbXml(await fetchXml(from >= ninetyDaysAgo ? HIST_90_URL : HIST_URL));
    const out = new Map<string, PricePoint[]>();
    for (const [date, rates] of parsed) {
      if (date < from || date > to) continue;
      for (const [ccy, rate] of rates) {
        let arr = out.get(ccy);
        if (!arr) out.set(ccy, (arr = []));
        arr.push({ key: date, close: rate });
      }
    }
    for (const arr of out.values()) arr.sort((a, b) => (a.key < b.key ? -1 : 1));
    return out;
  }
}
