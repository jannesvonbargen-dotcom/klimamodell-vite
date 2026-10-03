/**
 * Domain-Typen. Alle Zahlen sind Dezimal-Strings (z. B. "12.345678"), damit
 * sie verlustfrei zwischen Datenbank, Server und Client wandern.
 */

export const TRANSACTION_TYPES = [
  "BUY",
  "SELL",
  "DIVIDEND",
  "DEPOSIT",
  "WITHDRAWAL",
  "FEE",
  "TAX",
  "SAVINGS_PLAN",
  "INTEREST",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  BUY: "Kauf",
  SELL: "Verkauf",
  DIVIDEND: "Dividende",
  DEPOSIT: "Einzahlung",
  WITHDRAWAL: "Auszahlung",
  FEE: "Gebühr",
  TAX: "Steuer",
  SAVINGS_PLAN: "Sparplan-Ausführung",
  INTEREST: "Zinsen",
};

/** Typen, die Stücke bewegen. */
export const TRADE_TYPES: readonly TransactionType[] = ["BUY", "SELL", "SAVINGS_PLAN"];
/** Typen, die ein Instrument brauchen. */
export const INSTRUMENT_TYPES_REQUIRED: readonly TransactionType[] = [
  "BUY",
  "SELL",
  "SAVINGS_PLAN",
  "DIVIDEND",
];
/** Externe Geldflüsse (zählen nicht als Rendite). */
export const EXTERNAL_FLOW_TYPES: readonly TransactionType[] = ["DEPOSIT", "WITHDRAWAL"];

export function isBuyLike(type: TransactionType): boolean {
  return type === "BUY" || type === "SAVINGS_PLAN";
}

export type InstrumentKind = "STOCK" | "ETF";

export interface Instrument {
  id: number;
  isin: string;
  wkn: string | null;
  /** Ticker beim Kursanbieter, z. B. "AAPL" oder "SAP.DE". */
  symbol: string;
  name: string;
  kind: InstrumentKind;
  /** Währung, in der der Kursanbieter notiert. */
  currency: string;
  sector: string | null;
  country: string | null;
  logoUrl: string | null;
}

/**
 * Eine Transaktion. Alle Geldfelder (price, amount, fee, tax) sind in
 * `currency` angegeben. `fxRate` gibt an, wie viele Einheiten von `currency`
 * einem Euro entsprechen (EZB-Notation, z. B. 1.085 für USD). Für EUR ist
 * fxRate = 1.
 */
export interface Transaction {
  id: number;
  type: TransactionType;
  /** Lokaler Zeitpunkt "YYYY-MM-DDTHH:mm" (ohne Zeitzone). */
  executedAt: string;
  instrumentId: number | null;
  /** Stückzahl (bis 6 Nachkommastellen), bei Trades Pflicht. */
  quantity: string | null;
  /** Kurs je Stück in `currency`. */
  price: string | null;
  /**
   * Bruttobetrag in `currency`. Bei Trades: Kurswert (falls leer: Stück × Kurs).
   * Bei Dividende/Zinsen: Brutto vor Steuern. Bei Ein-/Auszahlung, Gebühr,
   * Steuer: der Betrag (Steuer darf negativ sein = Erstattung).
   */
  amount: string | null;
  currency: string;
  fxRate: string;
  fee: string;
  tax: string;
  note: string | null;
}

export interface Split {
  id: number;
  instrumentId: number;
  /** Wirksam ab diesem Tag (YYYY-MM-DD), vor allen Transaktionen dieses Tages. */
  effectiveDate: string;
  /** Verhältnis neu:alt, z. B. 4:1 → from=1, to=4. */
  ratioFrom: string;
  ratioTo: string;
}

export type SavingsInterval = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "BIMONTHLY" | "QUARTERLY";

export const SAVINGS_INTERVAL_LABELS: Record<SavingsInterval, string> = {
  WEEKLY: "Wöchentlich",
  BIWEEKLY: "Alle 2 Wochen",
  MONTHLY: "Monatlich",
  BIMONTHLY: "Alle 2 Monate",
  QUARTERLY: "Vierteljährlich",
};

export interface SavingsPlan {
  id: number;
  instrumentId: number;
  amount: string;
  interval: SavingsInterval;
  /** Ausführungstag im Monat (1–28) bzw. Wochentag (1=Mo … 5=Fr) bei wöchentlich. */
  executionDay: number;
  startDate: string;
  active: boolean;
  fee: string;
}

/** Kursreihe: Tagesschlusskurse je Datum (YYYY-MM-DD) in Notierungswährung. */
export type PriceSeries = ReadonlyArray<{ date: string; close: string }>;
