/**
 * Handelszeiten und Feiertage der wichtigsten Handelsplätze. Reine
 * Berechnung ohne Netz – Zeitzonen über Intl.
 */

export type ExchangeId = "LSX" | "XETRA" | "NYSE";

export interface ExchangeInfo {
  id: ExchangeId;
  name: string;
  timeZone: string;
  open: [number, number];
  close: [number, number];
  holidays: (year: number) => string[];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Ostersonntag (gregorianisch, Meeus/Jones/Butcher). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function germanHolidays(year: number): string[] {
  const easter = easterSunday(year);
  return [
    iso(year, 1, 1),
    addDays(easter, -2), // Karfreitag
    addDays(easter, 1), // Ostermontag
    iso(year, 5, 1),
    iso(year, 12, 24),
    iso(year, 12, 25),
    iso(year, 12, 26),
    iso(year, 12, 31),
  ];
}

/** n-ter Wochentag (0=So) im Monat; n = -1 für den letzten. */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const offset = (weekday - first.getUTCDay() + 7) % 7;
    return iso(year, month, 1 + offset + (n - 1) * 7);
  }
  const last = new Date(Date.UTC(year, month, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return iso(year, month, last.getUTCDate() - offset);
}

/** US-Feiertag mit Verschiebung: Sa → Fr, So → Mo. */
function observed(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (dow === 6) return addDays(date, -1);
  if (dow === 0) return addDays(date, 1);
  return date;
}

function nyseHolidays(year: number): string[] {
  const easter = easterSunday(year);
  const newYear = iso(year, 1, 1);
  const list = [
    // Neujahr an einem Samstag wird an der NYSE nicht nachgeholt
    new Date(Date.UTC(year, 0, 1)).getUTCDay() === 6 ? null : observed(newYear),
    nthWeekday(year, 1, 1, 3), // Martin Luther King Jr. Day
    nthWeekday(year, 2, 1, 3), // Presidents' Day
    addDays(easter, -2), // Good Friday
    nthWeekday(year, 5, 1, -1), // Memorial Day
    observed(iso(year, 6, 19)), // Juneteenth
    observed(iso(year, 7, 4)), // Independence Day
    nthWeekday(year, 9, 1, 1), // Labor Day
    nthWeekday(year, 11, 4, 4), // Thanksgiving
    observed(iso(year, 12, 25)), // Christmas
  ];
  return list.filter((d): d is string => d !== null);
}

export const EXCHANGES: Record<ExchangeId, ExchangeInfo> = {
  LSX: {
    id: "LSX",
    name: "LS Exchange",
    timeZone: "Europe/Berlin",
    open: [7, 30],
    close: [23, 0],
    holidays: germanHolidays,
  },
  XETRA: {
    id: "XETRA",
    name: "Xetra",
    timeZone: "Europe/Berlin",
    open: [9, 0],
    close: [17, 30],
    holidays: germanHolidays,
  },
  NYSE: {
    id: "NYSE",
    name: "NYSE",
    timeZone: "America/New_York",
    open: [9, 30],
    close: [16, 0],
    holidays: nyseHolidays,
  },
};

interface WallTime {
  date: string;
  weekday: number;
  minutes: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function wallTime(instant: Date, timeZone: string): WallTime {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS[parts.weekday as string] ?? 0,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** Wandelt eine Wanduhrzeit in einer Zeitzone in einen UTC-Zeitpunkt. */
export function zonedToUtc(date: string, hour: number, minute: number, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  let guess = Date.UTC(y, m - 1, d, hour, minute);
  for (let i = 0; i < 2; i++) {
    const wt = wallTime(new Date(guess), timeZone);
    const [wy, wm, wd] = wt.date.split("-").map(Number);
    const asUtc = Date.UTC(wy, wm - 1, wd, Math.floor(wt.minutes / 60), wt.minutes % 60);
    const target = Date.UTC(y, m - 1, d, hour, minute);
    guess += target - asUtc;
  }
  return new Date(guess);
}

export function isTradingDay(exchange: ExchangeInfo, date: string): boolean {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !exchange.holidays(y).includes(date);
}

export interface MarketStatus {
  exchange: ExchangeId;
  name: string;
  open: boolean;
  /** Nächster Wechsel (Öffnung bzw. Schließung) als UTC-Zeitpunkt. */
  nextChange: Date;
}

export function marketStatus(id: ExchangeId, now: Date = new Date()): MarketStatus {
  const ex = EXCHANGES[id];
  const wt = wallTime(now, ex.timeZone);
  const openMin = ex.open[0] * 60 + ex.open[1];
  const closeMin = ex.close[0] * 60 + ex.close[1];
  if (isTradingDay(ex, wt.date)) {
    if (wt.minutes < openMin) {
      return { exchange: id, name: ex.name, open: false, nextChange: zonedToUtc(wt.date, ex.open[0], ex.open[1], ex.timeZone) };
    }
    if (wt.minutes < closeMin) {
      return { exchange: id, name: ex.name, open: true, nextChange: zonedToUtc(wt.date, ex.close[0], ex.close[1], ex.timeZone) };
    }
  }
  let date = addDays(wt.date, 1);
  for (let i = 0; i < 14 && !isTradingDay(ex, date); i++) date = addDays(date, 1);
  return { exchange: id, name: ex.name, open: false, nextChange: zonedToUtc(date, ex.open[0], ex.open[1], ex.timeZone) };
}

/** Börsenplatz, der für ein Instrument maßgeblich ist (grob nach Symbol/Währung). */
export function exchangeForInstrument(symbol: string, currency: string): ExchangeId {
  if (/\.(DE|F|BE|MU|SG|HM|DU)$/i.test(symbol)) return "XETRA";
  if (currency === "USD" && !symbol.includes(".")) return "NYSE";
  return "XETRA";
}

/** Heutiges Datum (YYYY-MM-DD) in Europe/Berlin. */
export function todayInBerlin(now: Date = new Date()): string {
  return wallTime(now, "Europe/Berlin").date;
}

/** Aktuelle lokale Zeit "YYYY-MM-DDTHH:mm" in Europe/Berlin. */
export function nowInBerlin(now: Date = new Date()): string {
  const wt = wallTime(now, "Europe/Berlin");
  return `${wt.date}T${pad(Math.floor(wt.minutes / 60))}:${pad(wt.minutes % 60)}`;
}

/** Feiertage aller Börsen eines Jahresbereichs (für Sparplan-Termine: deutsche Börse). */
export function germanHolidaySet(fromYear: number, toYear: number): Set<string> {
  const set = new Set<string>();
  for (let y = fromYear; y <= toYear; y++) for (const h of germanHolidays(y)) set.add(h);
  return set;
}
