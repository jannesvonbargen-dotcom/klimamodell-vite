import { d } from "@/domain/decimal";
import { formatCompact, formatNumber, formatPercent } from "@/lib/format";
import { industryLabel } from "./labels";
import type { DerivedMetrics } from "./metrics";
import type { CriteriaConfig, CriterionId, CriterionResult, CriterionStatus, ResearchCompany, Verdict } from "./types";

/** Prüft ein Unternehmen gegen die konfigurierten Kriterien – transparent und nachvollziehbar. */

const pct = (v: string | number | null | undefined, digits = 1) =>
  v === null || v === undefined ? null : formatPercent(String(v), { signed: false, digits });

export function evaluateCriteria(company: ResearchCompany, m: DerivedMetrics, config: CriteriaConfig): CriterionResult[] {
  const out: CriterionResult[] = [];
  const add = (
    id: CriterionId,
    group: CriterionResult["group"],
    label: string,
    compute: (value: number) => { status: CriterionStatus; value: string | null; threshold: string },
    explanation: string,
  ) => {
    const cfg = config.criteria[id];
    if (!cfg?.enabled) return;
    if (cfg.notApplicableIndustries?.includes(company.profile.industry)) {
      out.push({
        id,
        group,
        label,
        required: cfg.required,
        status: "na",
        value: null,
        threshold: "—",
        explanation: `${explanation} Für die Branche „${industryLabel(company.profile.industry)}“ nicht aussagekräftig.`,
      });
      return;
    }
    const r = compute(cfg.value ?? 0);
    out.push({ id, group, label, required: cfg.required, explanation, ...r });
  };
  const cmp = (value: string | null, threshold: number, op: "min" | "max") => {
    if (value === null) return "nodata" as const;
    const v = d(value);
    return (op === "min" ? v.gte(threshold) : v.lte(threshold)) ? ("pass" as const) : ("fail" as const);
  };

  add(
    "minMarketCapUSD",
    "Größe & Bilanz",
    "Großes, etabliertes Unternehmen",
    (t) => ({
      status: cmp(String(company.profile.marketCap), t, "min"),
      value: formatCompact(company.profile.marketCap, "USD"),
      threshold: `≥ ${formatCompact(t, "USD")}`,
    }),
    "Marktkapitalisierung laut Anbieter.",
  );
  const profitableCfg = config.criteria.profitableYears;
  add(
    "profitableYears",
    "Größe & Bilanz",
    "Profitabel",
    (t) => ({
      status: m.profitableYears >= t ? "pass" : "fail",
      value: `${Math.min(m.profitableYears, company.income.netIncome.length)} Jahre in Folge`,
      threshold: `≥ ${t} Jahre`,
    }),
    `Jahresüberschuss in den letzten ${profitableCfg?.value ?? 3} Geschäftsjahren positiv.`,
  );
  add(
    "positiveFreeCashFlow",
    "Größe & Bilanz",
    "Positiver Free Cashflow",
    () => ({
      status: m.freeCashFlow === null ? "nodata" : d(m.freeCashFlow).gt(0) ? "pass" : "fail",
      value: m.freeCashFlow === null ? null : formatCompact(m.freeCashFlow, company.income.currency),
      threshold: "> 0",
    }),
    "Operativer Cashflow abzüglich Investitionen im letzten Geschäftsjahr.",
  );
  add(
    "maxDebtToEquity",
    "Größe & Bilanz",
    "Moderate Verschuldung",
    (t) => ({
      status: cmp(String(company.ratios.debtToEquity), t, "max"),
      value: formatNumber(company.ratios.debtToEquity, 2),
      threshold: `≤ ${formatNumber(t, 2)}`,
    }),
    "Verschuldungsgrad: Finanzschulden im Verhältnis zum Eigenkapital (TTM).",
  );
  add(
    "maxBeta",
    "Schwankung",
    "Beta",
    (t) => ({
      status: cmp(String(company.profile.beta), t, "max"),
      value: formatNumber(company.profile.beta, 2),
      threshold: `≤ ${formatNumber(t, 2)}`,
    }),
    "Schwankung relativ zum Gesamtmarkt (1,0 = wie der Markt).",
  );
  add(
    "maxVolatility",
    "Schwankung",
    "Volatilität (12 Monate)",
    (t) => ({ status: cmp(m.volatility, t, "max"), value: pct(m.volatility), threshold: `≤ ${pct(t, 0)}` }),
    "Annualisierte Schwankung der Tagesrenditen, berechnet aus Kursen des Kursanbieters.",
  );
  add(
    "maxDrawdown",
    "Schwankung",
    "Maximaler Rückgang (12 Monate)",
    (t) => ({ status: cmp(m.maxDrawdown, t, "max"), value: m.maxDrawdown ? `−${pct(m.maxDrawdown)}` : null, threshold: `≤ −${pct(t, 0)}` }),
    "Größter Verlust vom Hoch innerhalb der letzten 12 Monate.",
  );
  const years = config.criteria.minRevenueCagr?.years ?? 4;
  add(
    "minRevenueCagr",
    "Wachstum",
    `Umsatzwachstum p. a. (${m.cagrYears} J.)`,
    (t) => ({ status: cmp(m.revenueCagr, t, "min"), value: pct(m.revenueCagr), threshold: `≥ ${pct(t, 0)}` }),
    `Durchschnittliches jährliches Umsatzwachstum über die letzten ${years} Geschäftsjahre.`,
  );
  add(
    "minEpsCagr",
    "Wachstum",
    `Gewinnwachstum je Aktie p. a. (${m.cagrYears} J.)`,
    (t) => ({ status: cmp(m.epsCagr, t, "min"), value: pct(m.epsCagr), threshold: `≥ ${pct(t, 0)}` }),
    "Durchschnittliches jährliches Wachstum des verwässerten Gewinns je Aktie.",
  );
  add(
    "minGrowthYears",
    "Wachstum",
    "Stetiges Wachstum",
    (t) => ({
      status: m.growthYears >= t ? "pass" : "fail",
      value: `${m.growthYears} von ${m.growthYearsOf} Jahren`,
      threshold: `≥ ${t} von ${config.criteria.minGrowthYears?.of ?? 4}`,
    }),
    "Anzahl der Jahre mit steigendem Umsatz.",
  );
  add(
    "minExpectedRevenueGrowth",
    "Wachstum",
    "Erwartetes Umsatzwachstum",
    (t) => ({ status: cmp(m.expectedRevenueGrowth, t, "min"), value: pct(m.expectedRevenueGrowth), threshold: `≥ ${pct(t, 0)}` }),
    "Analystenschätzung für das nächste Geschäftsjahr gegenüber der Schätzung für das letzte (gleiche Abgrenzung).",
  );
  add(
    "minBuyShare",
    "Experten",
    "Positiver Analystenkonsens",
    (t) => ({ status: cmp(m.buyShare, t, "min"), value: pct(m.buyShare, 0), threshold: `≥ ${pct(t, 0)} Kauf` }),
    "Anteil der Kaufempfehlungen an allen aktuellen Analystenurteilen.",
  );
  add(
    "minTargetUpside",
    "Experten",
    "Kursziel über aktuellem Kurs",
    (t) => ({
      status: cmp(m.targetUpside, t, "min"),
      value: m.targetUpside === null ? null : formatPercent(m.targetUpside, { digits: 1 }),
      threshold: `≥ +${pct(t, 0)}`,
    }),
    "Abstand des durchschnittlichen Analysten-Kursziels zum Kurs.",
  );
  return out;
}

export function verdict(results: readonly CriterionResult[], config: CriteriaConfig): Verdict {
  const failedRequired = results.filter((r) => r.required && r.status === "fail");
  const failedOptional = results.filter((r) => !r.required && r.status === "fail");
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = failedRequired.length + failedOptional.length;
  return {
    recommended: failedRequired.length === 0 && failedOptional.length <= config.maxFailedOptional,
    passed,
    failed,
    evaluable: passed + failed,
    failedRequired,
    failedOptional,
  };
}

/** Ist die Datenbasis älter als erlaubt? */
export function isStale(asOf: string, today: string, staleAfterDays: number): boolean {
  const a = Date.UTC(+asOf.slice(0, 4), +asOf.slice(5, 7) - 1, +asOf.slice(8, 10));
  const b = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  return (b - a) / 86_400_000 > staleAfterDays;
}
