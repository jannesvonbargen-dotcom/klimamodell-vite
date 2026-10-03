import fs from "node:fs";
import path from "node:path";
import { computeLedger } from "@/domain/ledger";
import { todayInBerlin } from "@/domain/market-hours";
import type { PricePoint } from "@/market/types";
import { evaluateCriteria, isStale, verdict } from "@/research/criteria";
import { type MarkdownDoc, parseMarkdown } from "@/research/markdown";
import { deriveMetrics, type DerivedMetrics, type LiveData } from "@/research/metrics";
import { CRITERION_IDS, type CriteriaConfig, type CriterionResult, type ResearchCompany, type Verdict } from "@/research/types";
import { getDailyHistory, getQuotes, providerInfo } from "./market";
import { instrumentMap, listSplits, listTransactions, listWatchlist } from "./repo";

/**
 * Lädt die Rubrik „Solide Wachstumswerte“ aus editierbaren Dateien:
 *   config/growth-criteria.json   – Kriterien und Kandidaten
 *   content/research/<SYM>.json   – Anbieterdaten mit Stichtag und Quellen
 *   content/theses/<SYM>.md       – redaktionelle Texte
 * Live-Kurse werden nur mit einem echten Kursanbieter verwendet – im
 * Demo-Modus bleibt es bei den datierten Momentaufnahmen (keine erfundenen Zahlen).
 */

function contentRoot(): string {
  return process.env.RESEARCH_ROOT ? path.resolve(/*turbopackIgnore: true*/ process.env.RESEARCH_ROOT) : process.cwd();
}

const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;

export interface Thesis {
  meta: Record<string, string>;
  doc: MarkdownDoc;
}

export interface ResearchEntry {
  symbol: string;
  company: ResearchCompany;
  metrics: DerivedMetrics;
  criteria: CriterionResult[];
  verdict: Verdict;
  stale: boolean;
  thesis: Thesis | null;
  /** Im Depot gehalten (Stückzahl). */
  held: { quantity: string; isin: string } | null;
  watched: boolean;
}

export interface ResearchOverview {
  today: string;
  config: CriteriaConfig;
  live: boolean;
  providerLabel: string;
  recommended: ResearchEntry[];
  others: ResearchEntry[];
  errors: string[];
}

export class ResearchConfigError extends Error {}

export function loadCriteriaConfig(): CriteriaConfig {
  const file = path.join(contentRoot(), "config", "growth-criteria.json");
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new ResearchConfigError(
      `config/growth-criteria.json konnte nicht gelesen werden: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const c = raw as Partial<CriteriaConfig>;
  if (!c || typeof c !== "object" || !Array.isArray(c.candidates) || typeof c.criteria !== "object" || c.criteria === null) {
    throw new ResearchConfigError("config/growth-criteria.json: Felder „candidates“ (Liste) und „criteria“ (Objekt) werden benötigt.");
  }
  const unknown = Object.keys(c.criteria).filter((k) => !(CRITERION_IDS as readonly string[]).includes(k));
  if (unknown.length) throw new ResearchConfigError(`config/growth-criteria.json: Unbekannte Kriterien ${unknown.join(", ")}.`);
  for (const [id, cfg] of Object.entries(c.criteria)) {
    if (typeof cfg?.enabled !== "boolean" || typeof cfg.required !== "boolean") {
      throw new ResearchConfigError(`config/growth-criteria.json: Kriterium „${id}“ braucht „enabled“ und „required“ (true/false).`);
    }
    if (cfg.value !== undefined && (typeof cfg.value !== "number" || !Number.isFinite(cfg.value))) {
      throw new ResearchConfigError(`config/growth-criteria.json: „${id}.value“ muss eine Zahl sein.`);
    }
  }
  return {
    staleAfterDays: typeof c.staleAfterDays === "number" ? c.staleAfterDays : 90,
    maxFailedOptional: typeof c.maxFailedOptional === "number" ? c.maxFailedOptional : 1,
    candidates: c.candidates.map(String).filter((s) => SYMBOL_RE.test(s)),
    criteria: c.criteria as CriteriaConfig["criteria"],
  };
}

export function loadCompany(symbol: string): ResearchCompany | null {
  if (!SYMBOL_RE.test(symbol)) return null;
  const file = path.join(contentRoot(), "content", "research", `${symbol}.json`);
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as ResearchCompany;
  if (!data?.profile || !data.income || !data.asOf) return null;
  return data;
}

/** Gibt es eine Analyse (Datendatei) für das Symbol? */
export function hasResearch(symbol: string): boolean {
  return SYMBOL_RE.test(symbol) && fs.existsSync(path.join(contentRoot(), "content", "research", `${symbol}.json`));
}

export function loadThesis(symbol: string): Thesis | null {
  if (!SYMBOL_RE.test(symbol)) return null;
  const file = path.join(contentRoot(), "content", "theses", `${symbol}.md`);
  if (!fs.existsSync(file)) return null;
  const doc = parseMarkdown(fs.readFileSync(file, "utf8"));
  return { meta: doc.meta, doc };
}

function oneYearAgo(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

/** Live-Kurse und 12-Monats-Historie – nur mit echtem Kursanbieter. */
async function loadLive(
  companies: ResearchCompany[],
  today: string,
): Promise<{ live: Map<string, LiveData>; errors: string[]; history: Map<string, PricePoint[]> }> {
  const live = new Map<string, LiveData>();
  const history = new Map<string, PricePoint[]>();
  const errors: string[] = [];
  if (providerInfo().isDemo || companies.length === 0) return { live, errors, history };
  const { quotes, errors: quoteErrors } = await getQuotes(companies.map((c) => c.symbol));
  errors.push(...quoteErrors);
  const from = oneYearAgo(today);
  await Promise.all(
    companies.map(async (c) => {
      const q = quotes.get(c.symbol);
      // Nur übernehmen, wenn die Notierungswährung zu den Kurszielen passt
      const priceOk = q && q.currency === c.profile.currency;
      let points: PricePoint[] = [];
      try {
        points = await getDailyHistory(c.symbol, from, today);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
      history.set(c.symbol, points);
      live.set(c.symbol, {
        price: priceOk ? { value: q.price, asOf: q.asOf } : null,
        history: priceOk && points.length >= 60 ? points : null,
      });
    }),
  );
  return { live, errors, history };
}

export function holdings(): Map<string, { quantity: string; isin: string }> {
  const instruments = instrumentMap();
  const ledger = computeLedger(listTransactions(), listSplits());
  const out = new Map<string, { quantity: string; isin: string }>();
  for (const p of ledger.openPositions()) {
    const inst = instruments.get(p.instrumentId);
    if (!inst) continue;
    const value = { quantity: p.quantity.toString(), isin: inst.isin };
    out.set(inst.isin, value);
  }
  return out;
}

function buildEntry(
  company: ResearchCompany,
  config: CriteriaConfig,
  today: string,
  liveData: LiveData | undefined,
  held: Map<string, { quantity: string; isin: string }>,
  watched: Set<string>,
): ResearchEntry {
  const years = config.criteria.minRevenueCagr?.years ?? 4;
  const metrics = deriveMetrics(company, liveData ?? {}, years);
  const criteria = evaluateCriteria(company, metrics, config);
  return {
    symbol: company.symbol,
    company,
    metrics,
    criteria,
    verdict: verdict(criteria, config),
    stale: isStale(company.asOf, today, config.staleAfterDays),
    thesis: loadThesis(company.symbol),
    held: held.get(company.isin) ?? null,
    watched: watched.has(company.symbol) || watched.has(company.isin),
  };
}

function watchedKeys(): Set<string> {
  const keys = new Set<string>();
  for (const w of listWatchlist()) {
    keys.add(w.symbol);
    if (w.isin) keys.add(w.isin);
  }
  return keys;
}

export async function getResearchOverview(): Promise<ResearchOverview> {
  const today = todayInBerlin();
  const config = loadCriteriaConfig();
  const errors: string[] = [];
  const companies: ResearchCompany[] = [];
  for (const symbol of config.candidates) {
    try {
      const c = loadCompany(symbol);
      if (c) companies.push(c);
      else errors.push(`Keine Datendatei content/research/${symbol}.json – Kandidat übersprungen.`);
    } catch (error) {
      errors.push(`content/research/${symbol}.json ist fehlerhaft: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const { live, errors: liveErrors } = await loadLive(companies, today);
  errors.push(...liveErrors);
  const held = holdings();
  const watched = watchedKeys();
  const entries = companies.map((c) => buildEntry(c, config, today, live.get(c.symbol), held, watched));
  const order = new Map(config.candidates.map((s, i) => [s, i]));
  const byScore = (a: ResearchEntry, b: ResearchEntry) =>
    a.verdict.failed - b.verdict.failed || b.verdict.passed - a.verdict.passed || (order.get(a.symbol) ?? 0) - (order.get(b.symbol) ?? 0);
  return {
    today,
    config,
    live: !providerInfo().isDemo,
    providerLabel: providerInfo().label,
    recommended: entries.filter((e) => e.verdict.recommended).sort(byScore),
    others: entries.filter((e) => !e.verdict.recommended).sort(byScore),
    errors: [...new Set(errors)],
  };
}

export interface ResearchDetail extends ResearchEntry {
  today: string;
  config: CriteriaConfig;
  live: boolean;
  providerLabel: string;
  /** 12-Monats-Kursverlauf (nur mit echtem Kursanbieter). */
  history: PricePoint[];
  isCandidate: boolean;
}

export async function getResearchDetail(symbol: string): Promise<ResearchDetail | null> {
  const today = todayInBerlin();
  const config = loadCriteriaConfig();
  const company = loadCompany(symbol);
  if (!company) return null;
  const { live, history } = await loadLive([company], today);
  const entry = buildEntry(company, config, today, live.get(symbol), holdings(), watchedKeys());
  return {
    ...entry,
    today,
    config,
    live: !providerInfo().isDemo,
    providerLabel: providerInfo().label,
    history: history.get(symbol) ?? [],
    isCandidate: config.candidates.includes(symbol),
  };
}
