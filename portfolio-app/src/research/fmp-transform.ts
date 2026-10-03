import type { RatingAction, ResearchCompany } from "./types";

/**
 * Übersetzt Rohantworten der Financial-Modeling-Prep-API („stable“-Endpunkte)
 * in das Format von content/research/<SYM>.json. Reine Funktion – das
 * Abrufen übernimmt scripts/research-refresh.ts.
 */

type Num = number | null | undefined;
type Obj = Record<string, unknown>;

export interface FmpRaw {
  profile: Obj;
  income: Obj[];
  cashflow: Obj[];
  ratiosTtm: Obj;
  keyMetricsTtm: Obj;
  estimates: Obj[];
  gradesConsensus: Obj;
  priceTarget: Obj;
  grades: Obj[];
}

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : (v as Num);
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const round = (v: number, digits: number) => Number(v.toFixed(digits));

function parseRange(range: unknown): [number, number] {
  const parts = str(range)
    .split("-")
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n));
  return parts.length >= 2 ? [parts[0], parts[parts.length - 1]] : [0, 0];
}

function daysBetween(a: string, b: string): number {
  return (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
}

export function buildResearchCompany(symbol: string, raw: FmpRaw, asOf: string): ResearchCompany {
  const p = raw.profile;
  const income = [...raw.income].sort((a, b) => str(a.date).localeCompare(str(b.date))).slice(-5);
  const cashflow = [...raw.cashflow].sort((a, b) => str(a.date).localeCompare(str(b.date))).slice(-2);
  if (income.length < 2) throw new Error(`${symbol}: zu wenige Geschäftsjahre in der Gewinn- und Verlustrechnung`);
  const lastFy = str(income[income.length - 1].date);

  const estimates = [...raw.estimates].sort((a, b) => str(a.date).localeCompare(str(b.date)));
  const lastEstimate = estimates.find((e) => str(e.date) === lastFy) ?? estimates.filter((e) => str(e.date) <= lastFy).at(-1);
  const future = estimates.filter((e) => str(e.date) > lastFy).slice(0, 2);

  const grades = [...raw.grades]
    .map((g): RatingAction => ({
      date: str(g.date).slice(0, 10),
      firm: str(g.gradingCompany),
      action: str(g.action).toLowerCase(),
      previous: g.previousGrade ? str(g.previousGrade) : null,
      new: g.newGrade ? str(g.newGrade) : null,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const last12m = grades.filter((g) => daysBetween(g.date, asOf) <= 365);
  const changes = last12m.filter((g) => g.action === "upgrade" || g.action === "downgrade");

  const website = str(p.website);
  const cik = str(p.cik).replace(/^0+/, "");
  const name = str(p.companyName) || symbol;
  const sources: ResearchCompany["sources"] = [
    {
      label:
        "Financial Modeling Prep – Profil, Kennzahlen (TTM), Gewinn- und Cashflow-Rechnung, Analystenschätzungen, Kursziele, Analystenurteile",
      url: "https://financialmodelingprep.com/",
      retrieved: asOf,
    },
  ];
  if (cik && str(p.country) === "US")
    sources.push({
      label: `SEC EDGAR – Geschäftsberichte von ${name}`,
      url: `https://www.sec.gov/edgar/browse/?CIK=${cik}`,
      retrieved: asOf,
    });
  sources.push({
    label: "Yahoo Finance – Kurs und Analystenübersicht",
    url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/analysis`,
    retrieved: asOf,
  });
  if (/^https?:\/\//.test(website)) sources.push({ label: "Unternehmenswebsite", url: website, retrieved: asOf });

  const r = raw.ratiosTtm;
  const k = raw.keyMetricsTtm;
  const g = raw.gradesConsensus;
  const t = raw.priceTarget;

  return {
    symbol,
    isin: str(p.isin),
    asOf,
    provider: "Financial Modeling Prep",
    profile: {
      name,
      isin: str(p.isin),
      sector: str(p.sector),
      industry: str(p.industry),
      country: str(p.country),
      exchange: str(p.exchange) || str(p.exchangeShortName),
      marketCap: num(p.marketCap),
      beta: round(num(p.beta), 3),
      price: num(p.price),
      currency: str(p.currency) || "USD",
      range: parseRange(p.range),
      website,
      lastDividend: num(p.lastDividend),
      employees: num(p.fullTimeEmployees),
      ceo: str(p.ceo),
    },
    income: {
      fiscalYearEnds: income.map((i) => str(i.date)),
      revenue: income.map((i) => num(i.revenue)),
      netIncome: income.map((i) => num(i.netIncome)),
      epsDiluted: income.map((i) => num(i.epsDiluted ?? i.epsdiluted)),
      currency: str(income[income.length - 1].reportedCurrency) || "USD",
    },
    cashflow: {
      fiscalYearEnds: cashflow.map((c) => str(c.date)),
      freeCashFlow: cashflow.map((c) => num(c.freeCashFlow)),
      operatingCashFlow: cashflow.map((c) => num(c.operatingCashFlow)),
    },
    ratios: {
      epsTTM: round(num(r.netIncomePerShareTTM), 4),
      grossMargin: round(num(r.grossProfitMarginTTM), 4),
      operatingMargin: round(num(r.operatingProfitMarginTTM), 4),
      netMargin: round(num(r.netProfitMarginTTM), 4),
      debtToEquity: round(num(r.debtToEquityRatioTTM), 4),
      dividendYield: round(num(r.dividendYieldTTM), 6),
      payoutRatio: round(num(r.dividendPayoutRatioTTM), 4),
    },
    metrics: {
      roe: round(num(k.returnOnEquityTTM), 4),
      netDebtToEbitda: round(num(k.netDebtToEBITDATTM), 4),
      fcfYield: round(num(k.freeCashFlowYieldTTM), 5),
    },
    lastFiscalYearEstimate: {
      fiscalYearEnd: lastEstimate ? str(lastEstimate.date) : lastFy,
      revenueAvg: lastEstimate ? num(lastEstimate.revenueAvg) : 0,
      epsAvg: lastEstimate ? round(num(lastEstimate.epsAvg), 5) : 0,
    },
    estimates: future.map((e) => ({
      fiscalYearEnd: str(e.date),
      revenueAvg: num(e.revenueAvg),
      epsAvg: round(num(e.epsAvg), 5),
      analystsRevenue: num(e.numAnalystsRevenue),
      analystsEps: num(e.numAnalystsEps),
    })),
    analysts: {
      strongBuy: num(g.strongBuy),
      buy: num(g.buy),
      hold: num(g.hold),
      sell: num(g.sell),
      strongSell: num(g.strongSell),
      consensus: str(g.consensus) || "—",
      targetHigh: num(t.targetHigh),
      targetLow: num(t.targetLow),
      targetConsensus: num(t.targetConsensus),
      targetMedian: num(t.targetMedian),
    },
    ratingChanges12m: changes.slice(0, 8),
    latestRatings: grades.slice(0, 6),
    ratingCounts12m: {
      upgrades: last12m.filter((x) => x.action === "upgrade").length,
      downgrades: last12m.filter((x) => x.action === "downgrade").length,
      total: last12m.length,
    },
    sources,
  };
}
