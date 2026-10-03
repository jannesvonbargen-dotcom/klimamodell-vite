/**
 * Deutsche Zahlen- und Datumsformatierung. Nimmt Dezimal-Strings entgegen,
 * damit beim Formatieren keine Float-Rundungsfehler entstehen
 * (Intl.NumberFormat formatiert Strings exakt).
 */

type Num = string | number | null | undefined;

const cache = new Map<string, Intl.NumberFormat>();
function nf(key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("de-DE", options);
    cache.set(key, f);
  }
  return f;
}

function asFormattable(value: string | number): number {
  // Intl.NumberFormat akzeptiert Dezimal-Strings exakt (ES2023); der Cast
  // beruhigt nur ältere TypeScript-Typdefinitionen.
  return value as unknown as number;
}

export const DASH = "—";

export function formatMoney(value: Num, currency = "EUR", options: { signed?: boolean; compact?: boolean } = {}): string {
  if (value === null || value === undefined || value === "") return DASH;
  if (options.compact && !options.signed) return formatCompact(value, currency);
  const key = `money:${currency}:${options.signed ? "s" : ""}:${options.compact ? "c" : ""}`;
  return nf(key, {
    style: "currency",
    currency,
    signDisplay: options.signed ? "exceptZero" : "auto",
    notation: options.compact ? "compact" : "standard",
    minimumFractionDigits: options.compact ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(asFormattable(value));
}

/** Kurse: 2 bis 4 Nachkommastellen (Pennystocks brauchen mehr). */
export function formatPrice(value: Num, currency = "EUR"): string {
  if (value === null || value === undefined || value === "") return DASH;
  const abs = Math.abs(Number(value));
  const digits = abs > 0 && abs < 1 ? 4 : 2;
  return nf(`price:${currency}:${digits}`, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  }).format(asFormattable(value));
}

/** Prozent aus einem Bruch (0.0235 → "+2,35 %"). */
export function formatPercent(fraction: Num, options: { signed?: boolean; digits?: number } = {}): string {
  if (fraction === null || fraction === undefined || fraction === "") return DASH;
  const digits = options.digits ?? 2;
  return nf(`pct:${options.signed ?? true}:${digits}`, {
    style: "percent",
    signDisplay: options.signed === false ? "auto" : "exceptZero",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(asFormattable(fraction));
}

/** Stückzahl mit bis zu 6 Nachkommastellen. */
export function formatQuantity(value: Num): string {
  if (value === null || value === undefined || value === "") return DASH;
  return nf("qty", { maximumFractionDigits: 6 }).format(asFormattable(value));
}

export function formatNumber(value: Num, digits = 2): string {
  if (value === null || value === undefined || value === "") return DASH;
  return nf(`num:${digits}`, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(asFormattable(value));
}

/**
 * Kompakte Darstellung großer Zahlen („3,8 Bio. $“, „57 Mrd. $“). Bewusst ohne
 * `notation: "compact"`: Dessen Rundung unterscheidet sich zwischen den ICU-Versionen
 * von Node und Browser („57,0“ vs. „57“) und führt sonst zu Hydration-Fehlern.
 */
const COMPACT_UNITS: Array<[number, string]> = [
  [1e12, "Bio."],
  [1e9, "Mrd."],
  [1e6, "Mio."],
];

function currencySymbol(currency: string): string {
  return (
    nf(`sym:${currency}`, { style: "currency", currency })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? currency
  );
}

export function formatCompact(value: Num, currency?: string): string {
  if (value === null || value === undefined || value === "") return DASH;
  const n = Number(value);
  if (!Number.isFinite(n)) return DASH;
  const unit = COMPACT_UNITS.find(([size]) => Math.abs(n) >= size);
  const number = unit
    ? nf("compact:1", { maximumFractionDigits: 1 }).format(n / unit[0])
    : nf("compact:0", { maximumFractionDigits: 0 }).format(n);
  return [number, unit?.[1], currency ? currencySymbol(currency) : null].filter(Boolean).join("\u00a0");
}

const MONTHS_SHORT = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];

/** "2026-10-03" → "03.10.2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/** "2026-10-03" → "3. Okt. 2026" */
export function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d}. ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** "2026-10-03T14:05" → "03.10.2026, 14:05" */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const date = formatDate(iso);
  const time = iso.length >= 16 ? iso.slice(11, 16) : null;
  return time ? `${date}, ${time}` : date;
}

/** Uhrzeit eines ISO-Zeitstempels in Europe/Berlin. */
export function formatTimeBerlin(isoOrDate: string | Date): string {
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatDateTimeBerlin(isoOrDate: string | Date): string {
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Vorzeichen eines Dezimal-Strings: 1, -1 oder 0. */
export function signOf(value: Num): -1 | 0 | 1 {
  if (value === null || value === undefined || value === "") return 0;
  const s = String(value).trim();
  const unsigned = s.replace(/^[+-]/, "");
  if (/^0*\.?0*$/.test(unsigned)) return 0;
  return s.startsWith("-") ? -1 : 1;
}
