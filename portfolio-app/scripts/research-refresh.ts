/**
 * Aktualisiert die Anbieterdaten der Rubrik „Solide Wachstumswerte“
 * (content/research/<SYM>.json) über die Financial-Modeling-Prep-API.
 *
 *   npm run research:refresh               # alle Kandidaten aus config/growth-criteria.json
 *   npm run research:refresh -- MSFT V     # nur bestimmte Symbole
 *   npm run research:refresh -- --dry-run  # nur abrufen und anzeigen, nichts schreiben
 *
 * Benötigt FMP_API_KEY in .env.local. Die redaktionellen Texte in
 * content/theses/ werden nicht verändert – nach größeren Zahlenänderungen
 * bitte die Texte gegenlesen.
 */
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "./env";

loadEnv();

const BASE = "https://financialmodelingprep.com/stable";
const root = process.cwd();

function todayInBerlin(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(endpoint: string, params: Record<string, string>, key: string): Promise<unknown> {
  const url = new URL(`${BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("apikey", key);
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (res.status === 429) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}`);
    const body = (await res.json()) as unknown;
    if (body && typeof body === "object" && !Array.isArray(body) && "Error Message" in body)
      throw new Error(`${endpoint}: ${String((body as Record<string, unknown>)["Error Message"])}`);
    await sleep(250); // Rate-Limit schonen
    return body;
  }
  throw new Error(`${endpoint}: Rate-Limit erreicht`);
}

const first = (v: unknown): Record<string, unknown> =>
  Array.isArray(v) ? ((v[0] as Record<string, unknown>) ?? {}) : ((v as Record<string, unknown>) ?? {});
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

async function main() {
  const { buildResearchCompany } = await import("../src/research/fmp-transform");
  const key = process.env.FMP_API_KEY;
  if (!key) {
    console.error("FMP_API_KEY fehlt. Lege ihn in .env.local an (siehe README, Abschnitt „API-Keys“).");
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const config = JSON.parse(fs.readFileSync(path.join(root, "config", "growth-criteria.json"), "utf8")) as { candidates: string[] };
  const symbols = args.filter((a) => !a.startsWith("--")).map((s) => s.toUpperCase());
  const targets = symbols.length ? symbols : config.candidates;
  const asOf = todayInBerlin();
  let ok = 0;

  for (const symbol of targets) {
    if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol)) {
      console.warn(`✗ ${symbol}: ungültiges Symbol`);
      continue;
    }
    try {
      const q = { symbol };
      const raw = {
        profile: first(await get("profile", q, key)),
        income: list(await get("income-statement", { ...q, period: "annual", limit: "5" }, key)),
        cashflow: list(await get("cash-flow-statement", { ...q, period: "annual", limit: "2" }, key)),
        ratiosTtm: first(await get("ratios-ttm", q, key)),
        keyMetricsTtm: first(await get("key-metrics-ttm", q, key)),
        estimates: list(await get("analyst-estimates", { ...q, period: "annual", page: "0", limit: "10" }, key)),
        gradesConsensus: first(await get("grades-consensus", q, key)),
        priceTarget: first(await get("price-target-consensus", q, key)),
        grades: list(await get("grades", q, key)),
      };
      const company = buildResearchCompany(symbol, raw, asOf);
      const file = path.join(root, "content", "research", `${symbol}.json`);
      if (dryRun) console.log(JSON.stringify(company, null, 2));
      else fs.writeFileSync(file, `${JSON.stringify(company, null, 2)}\n`);
      const thesis = path.join(root, "content", "theses", `${symbol}.md`);
      console.log(
        `✓ ${symbol} – ${company.profile.name}${fs.existsSync(thesis) ? "" : " (Hinweis: kein Text in content/theses/ – Karte zeigt dann „keine Daten“)"}`,
      );
      ok++;
    } catch (error) {
      console.warn(`✗ ${symbol}: ${error instanceof Error ? error.message : String(error)} – bisherige Datei bleibt unverändert.`);
    }
  }
  console.log(
    `\n${ok} von ${targets.length} aktualisiert (Stand ${asOf}).${ok ? " Texte in content/theses/ bitte gegenlesen, wenn sich Zahlen deutlich geändert haben." : ""}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
