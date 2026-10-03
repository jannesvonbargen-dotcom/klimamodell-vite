"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { createTransactionAction, deleteTransactionAction, restoreTransactionAction, updateTransactionAction } from "@/app/actions";
import { d, parseLocaleNumber, roundMoney, roundQty } from "@/domain/decimal";
import { TRANSACTION_TYPE_LABELS, type TransactionType } from "@/domain/types";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";
import { InstrumentPicker, type PickedInstrument } from "./instrument-picker";
import { Button } from "./ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Field, Input, Textarea } from "./ui/input";
import { Select } from "./ui/select";

export interface EditableTransaction {
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
}

export interface TransactionDefaults {
  type?: TransactionType;
  instrument?: (PickedInstrument & { id?: number }) | null;
}

type DialogState = { mode: "create"; defaults?: TransactionDefaults } | { mode: "edit"; tx: EditableTransaction };

interface TransactionDialogApi {
  openCreate: (defaults?: TransactionDefaults) => void;
  openEdit: (tx: EditableTransaction) => void;
  remove: (id: number) => Promise<void>;
}

const TransactionDialogContext = React.createContext<TransactionDialogApi | null>(null);

export function useTransactionDialog(): TransactionDialogApi {
  const ctx = React.useContext(TransactionDialogContext);
  if (!ctx) throw new Error("TransactionDialogProvider fehlt");
  return ctx;
}

export function TransactionDialogProvider({ children, today }: { children: React.ReactNode; today: string }) {
  const [state, setState] = React.useState<DialogState | null>(null);
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  const remove = React.useCallback(
    async (id: number) => {
      const result = await deleteTransactionAction(id);
      if (!result.ok) {
        toast.error(result.message ?? "Löschen nicht möglich.");
        return;
      }
      router.refresh();
      toast("Transaktion gelöscht", {
        action: {
          label: "Rückgängig",
          onClick: async () => {
            await restoreTransactionAction(id);
            router.refresh();
          },
        },
      });
    },
    [router],
  );

  const api = React.useMemo<TransactionDialogApi>(
    () => ({
      openCreate: (defaults) => {
        setState({ mode: "create", defaults });
        setOpen(true);
      },
      openEdit: (tx) => {
        setState({ mode: "edit", tx });
        setOpen(true);
      },
      remove,
    }),
    [remove],
  );

  return (
    <TransactionDialogContext.Provider value={api}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[560px]" aria-describedby={undefined}>
          {state && (
            <TransactionForm
              key={state.mode === "edit" ? `edit-${state.tx.id}` : `create-${JSON.stringify(state.defaults ?? {})}-${open}`}
              state={state}
              today={today}
              onDone={() => setOpen(false)}
              onDelete={state.mode === "edit" ? () => remove(state.tx.id).then(() => setOpen(false)) : undefined}
            />
          )}
        </DialogContent>
      </Dialog>
    </TransactionDialogContext.Provider>
  );
}

const PRIMARY_TYPES: TransactionType[] = ["BUY", "SELL", "DIVIDEND", "DEPOSIT", "WITHDRAWAL"];
const MORE_TYPES: TransactionType[] = ["SAVINGS_PLAN", "FEE", "TAX", "INTEREST"];
const NEEDS_INSTRUMENT: TransactionType[] = ["BUY", "SELL", "SAVINGS_PLAN", "DIVIDEND"];
const TRADE: TransactionType[] = ["BUY", "SELL", "SAVINGS_PLAN"];

/** "12.5" → "12,5" für Eingabefelder */
function toInput(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(".", ",");
}

function parse(value: string): ReturnType<typeof d> | null {
  return parseLocaleNumber(value, "auto");
}

function defaultFee(type: TransactionType): string {
  return type === "BUY" || type === "SELL" ? "1,00" : "0,00";
}

interface PriceInfo {
  close: string;
  priceDate: string | null;
  kind: "close" | "live";
  fx: { rate: string; date: string } | null;
  quoteCurrency: string;
}

function TransactionForm({ state, today, onDone, onDelete }: { state: DialogState; today: string; onDone: () => void; onDelete?: () => void }) {
  const router = useRouter();
  const editing = state.mode === "edit" ? state.tx : null;
  const defaults = state.mode === "create" ? state.defaults : undefined;

  const [type, setType] = React.useState<TransactionType>(editing?.type ?? defaults?.type ?? "BUY");
  const [instrument, setInstrument] = React.useState<PickedInstrument | null>(editing?.instrument ?? defaults?.instrument ?? null);
  const [date, setDate] = React.useState(editing?.executedAt.slice(0, 10) ?? today);
  const [time, setTime] = React.useState(editing && editing.executedAt.length >= 16 ? editing.executedAt.slice(11, 16) : "");
  const [entryMode, setEntryMode] = React.useState<"quantity" | "amount">("quantity");
  const [quantity, setQuantity] = React.useState(toInput(editing?.quantity));
  const [amount, setAmount] = React.useState(editing && !TRADE.includes(editing.type) ? toInput(editing.amount) : "");
  const [price, setPrice] = React.useState(toInput(editing?.price));
  const [currency, setCurrency] = React.useState(editing?.currency ?? "EUR");
  const [fxRate, setFxRate] = React.useState(editing && editing.currency !== "EUR" ? toInput(editing.fxRate) : "");
  const [fee, setFee] = React.useState(editing ? toInput(editing.fee) : defaultFee(defaults?.type ?? "BUY"));
  const [tax, setTax] = React.useState(editing && editing.tax !== "0" ? toInput(editing.tax) : "");
  const [note, setNote] = React.useState(editing?.note ?? "");
  const [showMore, setShowMore] = React.useState(Boolean(editing && (editing.tax !== "0" || editing.note)));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();
  const [priceInfo, setPriceInfo] = React.useState<PriceInfo | null>(null);
  const priceTouched = React.useRef(Boolean(editing));
  const feeTouched = React.useRef(Boolean(editing));

  const needsInstrument = NEEDS_INSTRUMENT.includes(type);
  const isTrade = TRADE.includes(type);
  const quoteCurrency = instrument?.currency ?? "EUR";
  const currencyOptions = [...new Set(["EUR", quoteCurrency, currency])].map((c) => ({ value: c, label: c }));

  // Kurs zum Datum vorausfüllen (Schlusskurs bzw. aktueller Kurs)
  React.useEffect(() => {
    if (!instrument || !isTrade) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ symbol: instrument.symbol, date, currency: quoteCurrency });
    fetch(`/api/price?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { close: string | null; priceDate: string | null; kind: "close" | "live"; fx: PriceInfo["fx"] }) => {
        if (!data.close) {
          setPriceInfo(null);
          return;
        }
        const info: PriceInfo = { close: data.close, priceDate: data.priceDate, kind: data.kind, fx: data.fx, quoteCurrency };
        setPriceInfo(info);
        if (!priceTouched.current) applyPrice(info, currency);
      })
      .catch(() => undefined);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrument?.symbol, date, isTrade]);

  function applyPrice(info: PriceInfo, targetCurrency: string) {
    if (targetCurrency === info.quoteCurrency) {
      setPrice(toInput(d(info.close).toDecimalPlaces(4).toString()));
      if (targetCurrency !== "EUR" && info.fx) setFxRate(toInput(info.fx.rate));
    } else if (targetCurrency === "EUR" && info.fx) {
      setPrice(toInput(d(info.close).div(info.fx.rate).toDecimalPlaces(2).toString()));
    }
  }

  function changeCurrency(next: string) {
    setCurrency(next);
    if (next !== "EUR" && priceInfo?.fx && !fxRate) setFxRate(toInput(priceInfo.fx.rate));
    if (priceInfo && !priceTouched.current) applyPrice(priceInfo, next);
  }

  function changeType(next: TransactionType) {
    setType(next);
    setErrors({});
    if (!feeTouched.current) setFee(defaultFee(next));
  }

  function changeInstrument(next: PickedInstrument | null) {
    setInstrument(next);
    priceTouched.current = false;
    // Währung des Wertpapiers vorschlagen (Trade Republic handelt in EUR)
    if (next && !editing) setCurrency(next.currency && next.currency !== "EUR" && type === "DIVIDEND" ? next.currency : "EUR");
  }

  // Vorschau: Stücke (bei Betrag) und Gesamtbetrag – mit Decimal, nicht mit Floats
  const preview = React.useMemo(() => {
    const p = parse(price);
    const q = parse(quantity);
    const a = parse(amount);
    const f = parse(fee) ?? d(0);
    const t = parse(tax) ?? d(0);
    const fx = currency === "EUR" ? d(1) : parse(fxRate);
    if (!fx || fx.lte(0)) return null;
    let qty = q;
    let gross: ReturnType<typeof d> | null = null;
    if (isTrade) {
      if (entryMode === "amount") {
        if (a && p && p.gt(0)) {
          qty = roundQty(a.div(p));
          gross = a;
        }
      } else if (q && p) gross = roundMoney(q.times(p));
      if (!gross) return null;
      const sign = type === "SELL" ? 1 : -1;
      const total = type === "SELL" ? gross.minus(f).minus(t) : gross.plus(f).plus(t);
      return { qty, cashEUR: roundMoney(total.div(fx)).times(sign), label: type === "SELL" ? "Gutschrift" : "Belastung" };
    }
    if (!a) return null;
    switch (type) {
      case "DIVIDEND":
      case "INTEREST":
        return { qty: null, cashEUR: roundMoney(a.minus(t).minus(f).div(fx)), label: "Gutschrift (netto)" };
      case "DEPOSIT":
        return { qty: null, cashEUR: roundMoney(a.div(fx)), label: "Gutschrift" };
      case "TAX":
        return { qty: null, cashEUR: roundMoney(a.div(fx)).neg(), label: a.lt(0) ? "Erstattung" : "Belastung" };
      default:
        return { qty: null, cashEUR: roundMoney(a.div(fx)).neg(), label: "Belastung" };
    }
  }, [price, quantity, amount, fee, tax, fxRate, currency, isTrade, entryMode, type]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clientErrors: Record<string, string> = {};
    if (needsInstrument && !instrument) clientErrors.instrumentId = "Bitte ein Wertpapier auswählen.";
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      return;
    }
    const input = {
      type,
      date,
      time,
      instrumentId: instrument?.id ?? null,
      instrument: instrument && !instrument.id ? instrument : null,
      quantity,
      price,
      amount: isTrade ? (entryMode === "amount" ? amount : "") : amount,
      entryMode,
      currency,
      fxRate,
      fee,
      tax,
      note,
    };
    startTransition(async () => {
      const result = editing ? await updateTransactionAction(editing.id, input) : await createTransactionAction(input);
      if (!result.ok) {
        setErrors(result.errors);
        if (result.message) toast.error(result.message);
        return;
      }
      onDone();
      router.refresh();
      const label = TRANSACTION_TYPE_LABELS[type];
      if (editing) toast.success(`${label} aktualisiert`);
      else {
        const id = result.id;
        toast.success(`${label} gespeichert`, {
          action: {
            label: "Rückgängig",
            onClick: async () => {
              await deleteTransactionAction(id);
              router.refresh();
            },
          },
        });
      }
    });
  }

  const err = (key: string) => errors[key];

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-col" noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? "Transaktion bearbeiten" : "Transaktion erfassen"}</DialogTitle>
        <DialogDescription className="sr-only">Typ, Wertpapier, Datum und Beträge angeben.</DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4 pb-4">
        <div role="radiogroup" aria-label="Transaktionstyp" className="flex flex-wrap gap-1.5">
          {PRIMARY_TYPES.map((t) => (
            <TypeChip key={t} active={type === t} onClick={() => changeType(t)}>
              {TRANSACTION_TYPE_LABELS[t]}
            </TypeChip>
          ))}
          <Select
            value={MORE_TYPES.includes(type) ? type : ""}
            onValueChange={(v) => changeType(v as TransactionType)}
            options={MORE_TYPES.map((t) => ({ value: t, label: TRANSACTION_TYPE_LABELS[t] }))}
            placeholder="Weitere …"
            ariaLabel="Weitere Transaktionstypen"
            className={cn("h-8 w-auto gap-1.5 rounded-full px-3 text-[13px]", MORE_TYPES.includes(type) && "border-foreground bg-foreground text-background")}
          />
        </div>

        {needsInstrument && (
          <Field label="Wertpapier" htmlFor="tx-instrument" error={err("instrumentId")}>
            <InstrumentPicker id="tx-instrument" value={instrument} onChange={changeInstrument} autoFocus={!instrument} invalid={!!err("instrumentId")} />
          </Field>
        )}

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Datum" htmlFor="tx-date" error={err("executedAt")}>
            <Input id="tx-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Uhrzeit" htmlFor="tx-time">
            <Input id="tx-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-28" />
          </Field>
        </div>

        {isTrade && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-muted">Erfassen nach</span>
              <Segmented
                value={entryMode}
                onChange={(v) => setEntryMode(v as "quantity" | "amount")}
                options={[
                  { value: "quantity", label: "Stück" },
                  { value: "amount", label: "Betrag" },
                ]}
                ariaLabel="Erfassen nach Stück oder Betrag"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {entryMode === "quantity" ? (
                <Field label="Stückzahl" htmlFor="tx-qty" error={err("quantity")} hint="Bis 6 Nachkommastellen">
                  <Input id="tx-qty" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" aria-invalid={!!err("quantity")} />
                </Field>
              ) : (
                <Field
                  label={`Betrag (${currency})`}
                  htmlFor="tx-amount"
                  error={err("amount") ?? err("quantity")}
                  hint={preview?.qty ? `≈ ${formatQuantity(preview.qty.toString())} Stück` : "Kurswert ohne Gebühr"}
                >
                  <Input id="tx-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" aria-invalid={!!err("amount")} />
                </Field>
              )}
              <Field
                label={`Kurs (${currency})`}
                htmlFor="tx-price"
                error={err("price")}
                hint={
                  priceInfo
                    ? priceInfo.kind === "live"
                      ? "Aktueller Kurs"
                      : `Schlusskurs ${formatDate(priceInfo.priceDate)}`
                    : undefined
                }
              >
                <Input
                  id="tx-price"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => {
                    priceTouched.current = true;
                    setPrice(e.target.value);
                  }}
                  placeholder="0,00"
                  aria-invalid={!!err("price")}
                />
              </Field>
            </div>
          </>
        )}

        {!isTrade && (
          <Field
            label={type === "DIVIDEND" || type === "INTEREST" ? `Bruttobetrag (${currency})` : type === "TAX" ? `Betrag (${currency}, negativ = Erstattung)` : `Betrag (${currency})`}
            htmlFor="tx-amount"
            error={err("amount")}
          >
            <Input id="tx-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" aria-invalid={!!err("amount")} />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Währung" htmlFor="tx-currency">
            <Select id="tx-currency" value={currency} onValueChange={changeCurrency} options={currencyOptions} ariaLabel="Währung" />
          </Field>
          {currency !== "EUR" ? (
            <Field label={`Wechselkurs (1 € = x ${currency})`} htmlFor="tx-fx" error={err("fxRate")} hint={priceInfo?.fx ? `EZB ${formatDate(priceInfo.fx.date)}` : undefined}>
              <Input id="tx-fx" inputMode="decimal" value={fxRate} onChange={(e) => setFxRate(e.target.value)} placeholder="1,0000" aria-invalid={!!err("fxRate")} />
            </Field>
          ) : (
            type !== "FEE" &&
            type !== "TAX" && (
              <Field label={`Gebühr (${currency})`} htmlFor="tx-fee" error={err("fee")}>
                <Input
                  id="tx-fee"
                  inputMode="decimal"
                  value={fee}
                  onChange={(e) => {
                    feeTouched.current = true;
                    setFee(e.target.value);
                  }}
                />
              </Field>
            )
          )}
        </div>
        {currency !== "EUR" && type !== "FEE" && type !== "TAX" && (
          <Field label={`Gebühr (${currency})`} htmlFor="tx-fee" error={err("fee")}>
            <Input
              id="tx-fee"
              inputMode="decimal"
              value={fee}
              onChange={(e) => {
                feeTouched.current = true;
                setFee(e.target.value);
              }}
            />
          </Field>
        )}

        {showMore ? (
          <div className="grid gap-3">
            {type !== "TAX" && type !== "FEE" && (
              <Field label={`Steuern (${currency})`} htmlFor="tx-tax" error={err("tax")} hint={type === "DIVIDEND" ? "Einbehaltene Quellen-/Kapitalertragsteuer" : undefined}>
                <Input id="tx-tax" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="0,00" />
              </Field>
            )}
            <Field label="Notiz" htmlFor="tx-note">
              <Textarea id="tx-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </Field>
          </div>
        ) : (
          <button type="button" onClick={() => setShowMore(true)} className="pressable self-start text-[13px] font-medium text-accent hover:underline">
            Steuern und Notiz hinzufügen
          </button>
        )}
      </DialogBody>
      <DialogFooter className="justify-between">
        <div className="min-w-0 text-[13px] leading-tight">
          {preview ? (
            <>
              <div className="text-subtle">{preview.label}</div>
              <div className={cn("tnum text-[15px] font-semibold", preview.cashEUR.isNeg() ? "text-foreground" : "text-up")}>
                {formatMoney(preview.cashEUR.toString(), "EUR", { signed: true })}
              </div>
            </>
          ) : null}
        </div>
        <div className="flex gap-2">
          {onDelete && (
            <Button variant="ghost" size="md" className="text-down hover:bg-down-soft hover:text-down" onClick={onDelete}>
              Löschen
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={pending} className="min-w-28">
            {pending ? "Speichern …" : "Speichern"}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

function TypeChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "pressable h-8 rounded-full border px-3 text-[13px] font-medium",
        active ? "border-foreground bg-foreground text-background" : "border-border-strong text-muted hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = "sm",
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  ariaLabel: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex rounded-lg bg-surface-2 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 font-medium transition-[background-color,color,box-shadow] duration-150",
            size === "sm" ? "h-7 text-[13px]" : "h-8 text-[13px]",
            value === o.value ? "bg-surface text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.12)]" : "text-muted hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
