"use client";

import { grossAmount } from "@/domain/ledger";
import { TRANSACTION_TYPE_LABELS, type Instrument, type TransactionType } from "@/domain/types";
import { formatDate, formatMoney, formatPrice, formatQuantity } from "@/lib/format";
import { useTransactionDialog } from "../transaction-dialog";
import { Card } from "../ui/misc";

interface Row {
  id: number;
  type: string;
  executedAt: string;
  quantity: string | null;
  price: string | null;
  amount: string | null;
  currency: string;
  fxRate: string;
  fee: string;
  tax: string;
  note: string | null;
  source: string;
}

export function PositionTransactions({ instrument, transactions }: { instrument: Instrument; transactions: Row[] }) {
  const { openEdit } = useTransactionDialog();
  if (transactions.length === 0) return null;
  return (
    <section aria-labelledby="pos-tx-heading" className="flex flex-col gap-3">
      <h2 id="pos-tx-heading" className="text-[17px] font-semibold tracking-[-0.01em]">
        Transaktionen <span className="tnum ml-1 text-[14px] font-normal text-subtle">{transactions.length}</span>
      </h2>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-subtle">
                <th className="px-5 py-2.5 font-medium">Datum</th>
                <th className="px-4 py-2.5 font-medium">Typ</th>
                <th className="px-4 py-2.5 text-right font-medium">Stück</th>
                <th className="px-4 py-2.5 text-right font-medium">Kurs</th>
                <th className="px-4 py-2.5 text-right font-medium">Gebühr</th>
                <th className="px-5 py-2.5 text-right font-medium">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const gross = t.amount ?? (t.quantity && t.price ? grossAmount(t).toString() : null);
                return (
                  <tr
                    key={t.id}
                    className="cursor-pointer border-b border-border transition-colors duration-150 last:border-0 hover:bg-surface-2/60"
                    onClick={() =>
                      openEdit({
                        id: t.id,
                        type: t.type as TransactionType,
                        executedAt: t.executedAt,
                        instrument: {
                          id: instrument.id,
                          symbol: instrument.symbol,
                          name: instrument.name,
                          isin: instrument.isin,
                          wkn: instrument.wkn,
                          kind: instrument.kind,
                          currency: instrument.currency,
                          sector: instrument.sector,
                          country: instrument.country,
                        },
                        quantity: t.quantity,
                        price: t.price,
                        amount: t.amount,
                        currency: t.currency,
                        fxRate: t.fxRate,
                        fee: t.fee,
                        tax: t.tax,
                        note: t.note,
                      })
                    }
                  >
                    <td className="tnum px-5 py-2.5 whitespace-nowrap">{formatDate(t.executedAt)}</td>
                    <td className="px-4 py-2.5">{TRANSACTION_TYPE_LABELS[t.type as TransactionType]}</td>
                    <td className="tnum px-4 py-2.5 text-right">{t.quantity ? formatQuantity(t.quantity) : "—"}</td>
                    <td className="tnum px-4 py-2.5 text-right">{t.price ? formatPrice(t.price, t.currency) : "—"}</td>
                    <td className="tnum px-4 py-2.5 text-right text-muted">{t.fee !== "0" ? formatMoney(t.fee, t.currency) : "—"}</td>
                    <td className="tnum px-5 py-2.5 text-right font-medium">{gross ? formatMoney(gross, t.currency) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
