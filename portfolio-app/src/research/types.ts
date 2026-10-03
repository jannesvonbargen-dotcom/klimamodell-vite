/** Typen der Rubrik „Solide Wachstumswerte“ (Format von content/research/*.json). */

export interface ResearchCompany {
  symbol: string;
  isin: string;
  /** Stichtag der Datenabfrage (YYYY-MM-DD). */
  asOf: string;
  provider: string;
  profile: {
    name: string;
    isin: string;
    sector: string;
    industry: string;
    country: string;
    exchange: string;
    marketCap: number;
    beta: number;
    /** Kurs zum Stichtag (Momentaufnahme). */
    price: number;
    currency: string;
    range: [number, number];
    website: string;
    lastDividend: number;
    employees: number;
    ceo: string;
  };
  income: {
    fiscalYearEnds: string[];
    revenue: number[];
    netIncome: number[];
    epsDiluted: number[];
    currency: string;
  };
  cashflow: { fiscalYearEnds: string[]; freeCashFlow: number[]; operatingCashFlow: number[] };
  ratios: {
    epsTTM: number;
    grossMargin: number;
    operatingMargin: number;
    netMargin: number;
    debtToEquity: number;
    dividendYield: number;
    payoutRatio: number;
  };
  metrics: { roe: number; netDebtToEbitda: number; fcfYield: number };
  lastFiscalYearEstimate: { fiscalYearEnd: string; revenueAvg: number; epsAvg: number };
  estimates: Array<{ fiscalYearEnd: string; revenueAvg: number; epsAvg: number; analystsRevenue: number; analystsEps: number }>;
  analysts: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
    consensus: string;
    targetHigh: number;
    targetLow: number;
    targetConsensus: number;
    targetMedian: number;
  };
  ratingChanges12m: RatingAction[];
  latestRatings: RatingAction[];
  ratingCounts12m: { upgrades: number; downgrades: number; total: number };
  sources: Array<{ label: string; url: string; retrieved: string }>;
}

export interface RatingAction {
  date: string;
  firm: string;
  action: string;
  previous: string | null;
  new: string | null;
}

export interface CriterionConfig {
  enabled: boolean;
  required: boolean;
  value?: number;
  years?: number;
  of?: number;
  notApplicableIndustries?: string[];
}

export interface CriteriaConfig {
  staleAfterDays: number;
  maxFailedOptional: number;
  candidates: string[];
  criteria: Record<CriterionId, CriterionConfig>;
}

export const CRITERION_IDS = [
  "minMarketCapUSD",
  "profitableYears",
  "positiveFreeCashFlow",
  "maxDebtToEquity",
  "maxBeta",
  "maxVolatility",
  "maxDrawdown",
  "minRevenueCagr",
  "minEpsCagr",
  "minGrowthYears",
  "minExpectedRevenueGrowth",
  "minBuyShare",
  "minTargetUpside",
] as const;
export type CriterionId = (typeof CRITERION_IDS)[number];

export type CriterionStatus = "pass" | "fail" | "nodata" | "na";

export interface CriterionResult {
  id: CriterionId;
  label: string;
  group: "Größe & Bilanz" | "Schwankung" | "Wachstum" | "Experten";
  required: boolean;
  status: CriterionStatus;
  /** Gemessener Wert, formatiert. */
  value: string | null;
  /** Schwelle, formatiert (z. B. "≤ 1,20"). */
  threshold: string;
  explanation: string;
}

export interface Verdict {
  recommended: boolean;
  passed: number;
  failed: number;
  evaluable: number;
  failedRequired: CriterionResult[];
  failedOptional: CriterionResult[];
}
