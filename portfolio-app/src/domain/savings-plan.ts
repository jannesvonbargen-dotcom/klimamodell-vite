import type { SavingsInterval, SavingsPlan } from "./types";

/**
 * Berechnet die fälligen Ausführungstermine eines Sparplans. Fällt ein
 * Termin auf ein Wochenende oder einen Börsenfeiertag, wird er auf den
 * nächsten Handelstag verschoben (wie bei Trade Republic).
 */

const MONTH_STEP: Partial<Record<SavingsInterval, number>> = {
  MONTHLY: 1,
  BIMONTHLY: 2,
  QUARTERLY: 3,
};

function parse(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmt(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function nextTradingDay(date: string, holidays: ReadonlySet<string> = new Set()): string {
  const dt = parse(date);
  while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6 || holidays.has(fmt(dt))) {
    dt.setUTCDate(dt.getUTCDate() + 1);
  }
  return fmt(dt);
}

/** Nominelle (unverschobene) Termine von startDate bis einschließlich until. */
export function nominalDates(plan: Pick<SavingsPlan, "interval" | "executionDay" | "startDate">, until: string): string[] {
  const out: string[] = [];
  const start = parse(plan.startDate);
  const end = parse(until);
  const step = MONTH_STEP[plan.interval];
  if (step) {
    const day = Math.min(Math.max(plan.executionDay, 1), 28);
    const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day));
    if (cur < start) cur.setUTCMonth(cur.getUTCMonth() + 1);
    while (cur <= end) {
      out.push(fmt(cur));
      cur.setUTCMonth(cur.getUTCMonth() + step);
    }
    return out;
  }
  // Wöchentlich / zweiwöchentlich: executionDay = Wochentag 1 (Mo) … 5 (Fr)
  const weekday = Math.min(Math.max(plan.executionDay, 1), 5);
  const cur = new Date(start);
  while (cur.getUTCDay() !== weekday) cur.setUTCDate(cur.getUTCDate() + 1);
  const stepDays = plan.interval === "BIWEEKLY" ? 14 : 7;
  while (cur <= end) {
    out.push(fmt(cur));
    cur.setUTCDate(cur.getUTCDate() + stepDays);
  }
  return out;
}

/** Fällige, auf Handelstage verschobene Termine bis einschließlich today. */
export function dueExecutionDates(
  plan: Pick<SavingsPlan, "interval" | "executionDay" | "startDate" | "active">,
  today: string,
  holidays: ReadonlySet<string> = new Set(),
): string[] {
  if (!plan.active) return [];
  return nominalDates(plan, today)
    .map((date) => nextTradingDay(date, holidays))
    .filter((date) => date <= today && date >= plan.startDate);
}

/** Nächster anstehender Termin nach today. */
export function nextExecutionDate(
  plan: Pick<SavingsPlan, "interval" | "executionDay" | "startDate" | "active">,
  today: string,
  holidays: ReadonlySet<string> = new Set(),
): string | null {
  if (!plan.active) return null;
  const horizon = parse(today);
  horizon.setUTCMonth(horizon.getUTCMonth() + 4);
  const candidates = nominalDates(plan, fmt(horizon)).map((date) => nextTradingDay(date, holidays));
  return candidates.find((date) => date > today) ?? null;
}
