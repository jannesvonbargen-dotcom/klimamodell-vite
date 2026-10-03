import type { Instrument, Split, Transaction, TransactionType } from "./types";

let nextId = 1;

export function resetIds(): void {
  nextId = 1;
}

export function tx(type: TransactionType, executedAt: string, fields: Partial<Transaction> = {}): Transaction {
  return {
    id: nextId++,
    type,
    executedAt,
    instrumentId: null,
    quantity: null,
    price: null,
    amount: null,
    currency: "EUR",
    fxRate: "1",
    fee: "0",
    tax: "0",
    note: null,
    ...fields,
  };
}

export function buy(
  executedAt: string,
  instrumentId: number,
  quantity: string,
  price: string,
  fee = "1",
  extra: Partial<Transaction> = {},
): Transaction {
  return tx("BUY", executedAt, { instrumentId, quantity, price, fee, ...extra });
}

export function sell(
  executedAt: string,
  instrumentId: number,
  quantity: string,
  price: string,
  fee = "1",
  extra: Partial<Transaction> = {},
): Transaction {
  return tx("SELL", executedAt, { instrumentId, quantity, price, fee, ...extra });
}

export function deposit(executedAt: string, amount: string): Transaction {
  return tx("DEPOSIT", executedAt, { amount });
}

export function split(instrumentId: number, effectiveDate: string, ratioTo: string, ratioFrom = "1"): Split {
  return { id: nextId++, instrumentId, effectiveDate, ratioFrom, ratioTo };
}

export function instrument(id: number, symbol: string, currency = "EUR", extra: Partial<Instrument> = {}): Instrument {
  return {
    id,
    isin: `XX${String(id).padStart(10, "0")}`,
    wkn: null,
    symbol,
    name: symbol,
    kind: "STOCK",
    currency,
    sector: null,
    country: null,
    logoUrl: null,
    ...extra,
  };
}
