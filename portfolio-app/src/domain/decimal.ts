import DecimalBase from "decimal.js";

/**
 * Eigene Decimal-Instanz, damit die Konfiguration nicht mit anderen
 * Bibliotheken kollidiert. Alle Geldbeträge, Kurse und Stückzahlen laufen
 * hierüber – niemals über JavaScript-Floats.
 */
export const Dec = DecimalBase.clone({
  precision: 40,
  rounding: DecimalBase.ROUND_HALF_UP,
  toExpNeg: -30,
  toExpPos: 40,
});
export type Dec = InstanceType<typeof Dec>;

export type DecInput = Dec | string | number;

export const ZERO = new Dec(0);
export const ONE = new Dec(1);
export const HUNDRED = new Dec(100);

/** Stückzahlen werden auf 6 Nachkommastellen geführt. */
export const QTY_DP = 6;
/** Geldbeträge werden für Anzeige und Speicherung auf 2 Stellen gerundet. */
export const MONEY_DP = 2;

/** Alles unterhalb dieser Schwelle gilt als „keine Stücke mehr“. */
export const QTY_EPSILON = new Dec("0.0000005");

export function d(value: DecInput | null | undefined): Dec {
  if (value === null || value === undefined || value === "") return ZERO;
  if (value instanceof Dec) return value;
  return new Dec(value);
}

export function sum(values: Iterable<Dec>): Dec {
  let total = ZERO;
  for (const v of values) total = total.plus(v);
  return total;
}

export function isZeroQty(qty: Dec): boolean {
  return qty.abs().lt(QTY_EPSILON);
}

export function roundMoney(value: Dec): Dec {
  return value.toDecimalPlaces(MONEY_DP, Dec.ROUND_HALF_UP);
}

export function roundQty(value: Dec): Dec {
  return value.toDecimalPlaces(QTY_DP, Dec.ROUND_DOWN);
}

/** Prozentuale Veränderung (als Bruch, 0.05 = 5 %); null wenn Basis 0. */
export function ratio(part: Dec, base: Dec): Dec | null {
  if (base.isZero()) return null;
  return part.div(base);
}

/**
 * Parst eine Zahl aus Benutzereingabe oder CSV. Erkennt deutsches
 * (1.234,56) und englisches (1,234.56) Format sowie Vorzeichen,
 * Währungssymbole und Leerzeichen. Gibt null zurück, wenn nichts Sinnvolles
 * erkannt wird.
 */
export type NumberFormatHint = "auto" | "de" | "en";

export function parseLocaleNumber(
  raw: string | number | null | undefined,
  hint: NumberFormatHint = "auto",
): Dec | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? new Dec(raw) : null;
  let s = raw.trim();
  if (s === "" || s === "-" || s === "—") return null;
  // Klammern als negatives Vorzeichen (Buchhaltungsformat)
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[€$£¥%\s  ']/g, "").replace(/[A-Za-z]{3}$/g, "").replace(/^[A-Za-z]{3}/g, "");
  s = s.replace(/[−–]/g, "-");
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (hint === "de") {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (hint === "en") {
    normalized = s.replace(/,/g, "");
  } else if (lastComma >= 0 && lastDot >= 0) {
    // Beide vorhanden: das spätere Zeichen ist der Dezimaltrenner
    if (lastComma > lastDot) normalized = s.replace(/\./g, "").replace(",", ".");
    else normalized = s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const parts = s.split(",");
    // "1,234,567" → Tausender; "12,5" → Dezimal
    if (parts.length > 2) normalized = parts.join("");
    else normalized = s.replace(",", ".");
  } else if (lastDot >= 0) {
    const parts = s.split(".");
    // "1.234.567" → Tausender (deutsch); "1.234" bleibt mehrdeutig → als Dezimal
    if (parts.length > 2) normalized = parts.join("");
    else normalized = s;
  } else {
    normalized = s;
  }
  if (!/^\d*\.?\d+$|^\d+\.$/.test(normalized)) return null;
  try {
    const value = new Dec(normalized);
    return negative ? value.neg() : value;
  } catch {
    return null;
  }
}
