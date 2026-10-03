import { d, Dec, ZERO } from "@/domain/decimal";
import type { ResearchCompany } from "./types";

/**
 * Abgeleitete Kennzahlen – berechnet ausschließlich aus den gespeicherten
 * Anbieterdaten (und optional aus Kursen des Kursanbieters).
 * Ergebnisse als Dezimal-Strings; null = nicht berechenbar.
 */

export interface DerivedMetrics {
  /** Verwendeter Kurs und seine Herkunft. */
  price: string;
  priceSource: "live" | "snapshot";
  priceAsOf: string;
  revenueCagr: string | null;
  epsCagr: string | null;
  cagrYears: number;
  growthYears: number;
  growthYearsOf: number;
  expectedRevenueGrowth: string | null;
  expectedEpsGrowth: string | null;
  peTTM: string | null;
  forwardPE: string | null;
  peg: string | null;
  buyShare: string | null;
  analystsTotal: number;
  targetUpside: string | null;
  freeCashFlow: string | null;
  profitableYears: number;
  volatility: string | null;
  maxDrawdown: string | null;
  riskWindow: { from: string; to: string } | null;
}

/** Durchschnittliche jährliche Wachstumsrate; null bei nicht-positiven Werten. */
export function cagr(first: number, last: number, years: number): Dec | null {
  if (years <= 0 || first <= 0 || last <= 0) return null;
  return d(last).div(first).pow(d(1).div(years)).minus(1);
}

/** Annualisierte Volatilität aus Tagesschlusskursen (Standardabweichung der Log-Renditen × √252). */
export function annualizedVolatility(closes: readonly string[]): Dec | null {
  const values = closes.map((c) => d(c)).filter((v) => v.gt(0));
  if (values.length < 60) return null;
  const returns: Dec[] = [];
  for (let i = 1; i < values.length; i++) returns.push(values[i].div(values[i - 1]).ln());
  const mean = returns.reduce((a, r) => a.plus(r), ZERO).div(returns.length);
  const variance = returns.reduce((a, r) => a.plus(r.minus(mean).pow(2)), ZERO).div(returns.length - 1);
  return variance.sqrt().times(d(252).sqrt());
}

/** Größter prozentualer Rückgang vom bisherigen Hoch (positiver Bruch, 0.25 = −25 %). */
export function maxDrawdown(closes: readonly string[]): Dec | null {
  if (closes.length < 2) return null;
  let peak = d(closes[0]);
  let worst = ZERO;
  for (const c of closes) {
    const v = d(c);
    if (v.gt(peak)) peak = v;
    if (peak.gt(0)) {
      const dd = peak.minus(v).div(peak);
      if (dd.gt(worst)) worst = dd;
    }
  }
  return worst;
}

export interface LiveData {
  price?: { value: string; asOf: string } | null;
  /** Tagesschlusskurse der letzten 12 Monate (aufsteigend). */
  history?: Array<{ key: string; close: string }> | null;
}

export function deriveMetrics(company: ResearchCompany, live: LiveData = {}, years = 4): DerivedMetrics {
  const { income, analysts } = company;
  const n = income.revenue.length;
  const span = Math.min(years, n - 1);
  const price = live.price ? d(live.price.value) : d(company.profile.price);
  const rev = cagr(income.revenue[n - 1 - span], income.revenue[n - 1], span);
  const eps = cagr(income.epsDiluted[n - 1 - span], income.epsDiluted[n - 1], span);
  let growthYears = 0;
  for (let i = n - span; i < n; i++) if (income.revenue[i] > income.revenue[i - 1]) growthYears++;
  let profitableYears = 0;
  for (let i = n - 1; i >= 0 && income.netIncome[i] > 0; i--) profitableYears++;

  const next = company.estimates[0];
  const last = company.lastFiscalYearEstimate;
  const expectedRevenueGrowth = next && last?.revenueAvg > 0 ? d(next.revenueAvg).div(last.revenueAvg).minus(1) : null;
  const expectedEpsGrowth = next && last?.epsAvg > 0 ? d(next.epsAvg).div(last.epsAvg).minus(1) : null;
  const peTTM = company.ratios.epsTTM > 0 ? price.div(company.ratios.epsTTM) : null;
  const forwardPE = next && next.epsAvg > 0 ? price.div(next.epsAvg) : null;
  const peg = peTTM && eps && eps.gt(0) ? peTTM.div(eps.times(100)) : null;
  const total = analysts.strongBuy + analysts.buy + analysts.hold + analysts.sell + analysts.strongSell;
  const buyShare = total > 0 ? d(analysts.strongBuy + analysts.buy).div(total) : null;
  const upside = price.gt(0) ? d(analysts.targetConsensus).div(price).minus(1) : null;
  const fcf = company.cashflow.freeCashFlow.at(-1);

  const closes = live.history?.map((p) => p.close) ?? [];
  const volatility = closes.length ? annualizedVolatility(closes) : null;
  const drawdown = closes.length >= 60 ? maxDrawdown(closes) : null;

  return {
    price: price.toString(),
    priceSource: live.price ? "live" : "snapshot",
    priceAsOf: live.price?.asOf ?? company.asOf,
    revenueCagr: rev?.toString() ?? null,
    epsCagr: eps?.toString() ?? null,
    cagrYears: span,
    growthYears,
    growthYearsOf: span,
    expectedRevenueGrowth: expectedRevenueGrowth?.toString() ?? null,
    expectedEpsGrowth: expectedEpsGrowth?.toString() ?? null,
    peTTM: peTTM?.toString() ?? null,
    forwardPE: forwardPE?.toString() ?? null,
    peg: peg?.toString() ?? null,
    buyShare: buyShare?.toString() ?? null,
    analystsTotal: total,
    targetUpside: upside?.toString() ?? null,
    freeCashFlow: fcf !== undefined ? String(fcf) : null,
    profitableYears,
    volatility: volatility?.toString() ?? null,
    maxDrawdown: drawdown?.toString() ?? null,
    riskWindow: live.history && live.history.length ? { from: live.history[0].key, to: live.history[live.history.length - 1].key } : null,
  };
}
