"use client";

import { AlertTriangleIcon, MoreHorizontalIcon, PencilIcon, SearchIcon, Trash2Icon } from "lucide-react";
import * as React from "react";
import { TRANSACTION_TYPE_LABELS, type TransactionType } from "@/domain/types";
import { formatDate, formatMoney, formatPrice, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PickedInstrument } from "../instrument-picker";
import { InstrumentAvatar } from "../numbers";
import { type EditableTransaction, useTransactionDialog } from "../transaction-dialog";
import { Input } from "../ui/input";
import { Card, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Tooltip } from "../ui/misc";
import { Select } from "../ui/select";

export interface TransactionRowView {
  id: number;
  type: TransactionType;
  executedAt: string;
  instrument: (PickedInstrument & { id: number }) | null;
  quantity: string | null;
  price: string | null;
  amount: string | null;
  currency: string;
  fxRate: string;
  fee: string;
  tax: string;
  note: string | null;
  source: string;
  cashEUR: string | null;
  problem: string | null;
}

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const TYPE_FILTERS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "Alle Typen" },
  { value: "TRADES", label: "Käufe & Verkäufe" },
  ...(["BUY", "SELL", "SAVINGS_PLAN", "DIVIDEND", "DEPOSIT", "WITHDRAWAL", "INTEREST", "FEE", "TAX"] as TransactionType[]).map((t) => ({
    value: t,
    label: TRANSACTION_TYPE_LABELS[t],
  })),
];

const TYPE_TONE: Partial<Record<TransactionType, string>> = {
  BUY: "text-foreground",
  SAVINGS_PLAN: "text-foreground",
  SELL: "text-foreground",
  DIVIDEND: "text-up",
  INTEREST: "text-up",
  DEPOSIT: "text-muted",
  WITHDRAWAL: "text-muted",
  FEE: "text-down",
  TAX: "text-down",
};

const BATCH = 200;

export function TransactionList({ rows }: { rows: TransactionRowView[] }) {
  const { openEdit, remove, openCreate } = useTransactionDialog();
  const [query, setQuery] = React.useState("");
  const [type, setType] = React.useState("ALL");
  const [limit, setLimit] = React.useState(BATCH);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (type === "TRADES" && !["BUY", "SELL", "SAVINGS_PLAN"].includes(r.type)) return false;
      if (type !== "ALL" && type !== "TRADES" && r.type !== type) return false;
      if (!q) return true;
      return (
        (r.instrument?.name.toLowerCase().includes(q) ?? false) ||
        (r.instrument?.symbol.toLowerCase().includes(q) ?? false) ||
        (r.instrument?.isin?.toLowerCase().includes(q) ?? false) ||
        (r.note?.toLowerCase().includes(q) ?? false) ||
        TRANSACTION_TYPE_LABELS[r.type].toLowerCase().includes(q)
      );
    });
  }, [rows, query, type]);

  const groups = React.useMemo(() => {
    const out: Array<{ key: string; label: string; rows: TransactionRowView[] }> = [];
    for (const r of filtered.slice(0, limit)) {
      const key = r.executedAt.slice(0, 7);
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        g = { key, label: `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`, rows: [] };
        out.push(g);
      }
      g.rows.push(r);
    }
    return out;
  }, [filtered, limit]);

  const toEditable = (r: TransactionRowView): EditableTransaction => ({
    id: r.id,
    type: r.type,
    executedAt: r.executedAt,
    instrument: r.instrument,
    quantity: r.quantity,
    price: r.price,
    amount: r.amount,
    currency: r.currency,
    fxRate: r.fxRate,
    fee: r.fee,
    tax: r.tax,
    note: r.note,
  });

  if (rows.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <p className="text-[16px] font-semibold">Noch keine Transaktionen</p>
        <p className="max-w-sm text-[13px] text-muted">Erfasse Käufe, Einzahlungen und Dividenden – oder importiere eine CSV-Datei.</p>
        <button type="button" onClick={() => openCreate()} className="pressable mt-2 text-[14px] font-medium text-accent hover:underline">
          Erste Transaktion erfassen
        </button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-80">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Wertpapier, ISIN oder Notiz"
            aria-label="Transaktionen durchsuchen"
            className="h-9 pl-9"
          />
        </div>
        <Select value={type} onValueChange={setType} options={TYPE_FILTERS} ariaLabel="Nach Typ filtern" className="h-9 w-48" />
        <span className="tnum ml-auto text-[12px] text-subtle">
          {filtered.length} von {rows.length}
        </span>
      </div>

      {groups.map((g) => (
        <section key={g.key} aria-label={g.label} className="flex flex-col gap-1.5">
          <h2 className="sticky top-14 z-10 bg-background/90 py-1.5 text-[12px] font-semibold tracking-wide text-subtle uppercase backdrop-blur lg:top-0">
            {g.label}
          </h2>
          <Card className="divide-y divide-border overflow-hidden">
            {g.rows.map((r) => (
              <div
                key={r.id}
                className="group relative flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-2/60 sm:px-5"
              >
                <button
                  type="button"
                  onClick={() => openEdit(toEditable(r))}
                  className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  aria-label={`${TRANSACTION_TYPE_LABELS[r.type]} vom ${formatDate(r.executedAt)} bearbeiten`}
                />
                <div className="tnum hidden w-12 shrink-0 text-[12px] leading-tight text-subtle sm:block">
                  <div className="text-[15px] font-semibold text-foreground">{r.executedAt.slice(8, 10)}.</div>
                  {r.executedAt.length > 10 ? r.executedAt.slice(11, 16) : ""}
                </div>
                {r.instrument ? (
                  <InstrumentAvatar name={r.instrument.name} symbol={r.instrument.symbol} size={32} />
                ) : (
                  <span
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[13px] font-semibold text-muted"
                    aria-hidden
                  >
                    €
                  </span>
                )}
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[13px] font-medium", TYPE_TONE[r.type])}>{TRANSACTION_TYPE_LABELS[r.type]}</span>
                    {r.source === "seed" && <span className="rounded bg-surface-2 px-1.5 text-[11px] text-subtle">Beispiel</span>}
                    {r.source === "csv" && <span className="rounded bg-surface-2 px-1.5 text-[11px] text-subtle">Import</span>}
                    {r.problem && (
                      <Tooltip content={r.problem}>
                        <AlertTriangleIcon className="relative z-10 size-3.5 text-warn" aria-label={r.problem} />
                      </Tooltip>
                    )}
                  </div>
                  <div className="truncate text-[14px]">{r.instrument?.name ?? r.note ?? "Verrechnungskonto"}</div>
                  <div className="tnum truncate text-[12px] text-subtle sm:hidden">{formatDate(r.executedAt)}</div>
                </div>
                <div className="tnum hidden text-right text-[12px] leading-tight text-subtle md:block">
                  {r.quantity && ["BUY", "SELL", "SAVINGS_PLAN"].includes(r.type) && (
                    <>
                      <div>{formatQuantity(r.quantity)} Stk.</div>
                      <div>à {formatPrice(r.price, r.currency)}</div>
                    </>
                  )}
                  {r.type === "DIVIDEND" && r.tax !== "0" && <div>Steuer {formatMoney(r.tax, r.currency)}</div>}
                </div>
                <div className="w-28 text-right">
                  <span
                    className={cn(
                      "tnum text-[14px] font-medium",
                      r.cashEUR && !r.cashEUR.startsWith("-") && r.cashEUR !== "0" ? "text-up" : "",
                    )}
                  >
                    {r.cashEUR ? formatMoney(r.cashEUR, "EUR", { signed: true }) : "—"}
                  </span>
                  {r.currency !== "EUR" && <div className="text-[11px] text-subtle">{r.currency}</div>}
                </div>
                <Menu>
                  <MenuTrigger asChild>
                    <button
                      type="button"
                      className="pressable relative z-10 rounded-md p-1.5 text-subtle opacity-100 hover:bg-surface-3 hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label="Aktionen"
                    >
                      <MoreHorizontalIcon className="size-4" />
                    </button>
                  </MenuTrigger>
                  <MenuContent>
                    <MenuItem onSelect={() => openEdit(toEditable(r))}>
                      <PencilIcon /> Bearbeiten
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem destructive onSelect={() => void remove(r.id)}>
                      <Trash2Icon /> Löschen
                    </MenuItem>
                  </MenuContent>
                </Menu>
              </div>
            ))}
          </Card>
        </section>
      ))}

      {filtered.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + BATCH)}
          className="pressable self-center rounded-lg px-4 py-2 text-[13px] font-medium text-accent hover:bg-surface-2"
        >
          Weitere {Math.min(BATCH, filtered.length - limit)} anzeigen
        </button>
      )}
      {filtered.length === 0 && <p className="py-10 text-center text-[13px] text-subtle">Keine Transaktion passt zum Filter.</p>}
    </div>
  );
}
