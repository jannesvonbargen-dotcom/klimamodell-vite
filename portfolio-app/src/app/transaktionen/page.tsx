import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { NewTransactionButton } from "@/components/transactions/new-transaction-button";
import { TransactionList, type TransactionRowView } from "@/components/transactions/transaction-list";
import { roundMoney } from "@/domain/decimal";
import { computeLedger } from "@/domain/ledger";
import { instrumentMap, listSplits, listTransactionRows, toTransaction } from "@/server/repo";

export const metadata: Metadata = { title: "Transaktionen" };

export default function TransactionsPage() {
  const rows = listTransactionRows();
  const instruments = instrumentMap();
  const ledger = computeLedger(rows.map(toTransaction), listSplits());
  const cash = new Map(ledger.cashEffects.map((c) => [c.transactionId, roundMoney(c.deltaEUR).toString()]));
  const problems = new Map<number, string>();
  for (const issue of ledger.issues) {
    if (issue.kind === "OVERSELL") problems.set(issue.transactionId, "Mehr Stücke verkauft als gehalten");
    if (issue.kind === "NEGATIVE_CASH") problems.set(issue.transactionId, "Cash danach negativ");
  }

  const view: TransactionRowView[] = rows.map((r) => {
    const instrument = r.instrumentId ? instruments.get(r.instrumentId) : undefined;
    return {
      id: r.id,
      type: r.type,
      executedAt: r.executedAt,
      instrument: instrument
        ? {
            id: instrument.id,
            symbol: instrument.symbol,
            name: instrument.name,
            isin: instrument.isin,
            wkn: instrument.wkn,
            kind: instrument.kind,
            currency: instrument.currency,
            sector: instrument.sector,
            country: instrument.country,
          }
        : null,
      quantity: r.quantity,
      price: r.price,
      amount: r.amount,
      currency: r.currency,
      fxRate: r.fxRate,
      fee: r.fee,
      tax: r.tax,
      note: r.note,
      source: r.source,
      cashEUR: cash.get(r.id) ?? null,
      problem: problems.get(r.id) ?? null,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Transaktionen"
        description="Alle Buchungen – die Grundlage für Positionen und Cash. Klicke auf eine Zeile zum Bearbeiten."
        actions={<NewTransactionButton />}
      />
      <TransactionList rows={view} />
    </div>
  );
}
