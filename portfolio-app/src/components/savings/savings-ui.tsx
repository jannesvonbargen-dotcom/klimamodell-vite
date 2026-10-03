"use client";

import { MoreHorizontalIcon, PauseIcon, PencilIcon, PlayIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { confirmExecutionAction, deleteSavingsPlanAction, saveSavingsPlanAction, setSavingsPlanActiveAction, skipExecutionAction } from "@/app/actions";
import { SAVINGS_INTERVAL_LABELS, type SavingsInterval, type SavingsPlan } from "@/domain/types";
import { formatDate, formatDateLong, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { InstrumentPicker, type PickedInstrument } from "../instrument-picker";
import { InstrumentAvatar } from "../numbers";
import { Button } from "../ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Field, Input } from "../ui/input";
import { Badge, Card, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../ui/misc";
import { Select } from "../ui/select";

export interface PlanView extends SavingsPlan {
  instrument: PickedInstrument & { id: number };
  nextDate: string | null;
  executions: number;
  investedEUR: string;
}

export interface PendingView {
  planId: number;
  instrumentId: number;
  dueDate: string;
  amount: string;
  fee: string;
  instrumentName: string;
  symbol: string;
}

const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];

function scheduleLabel(p: Pick<SavingsPlan, "interval" | "executionDay">): string {
  if (p.interval === "WEEKLY" || p.interval === "BIWEEKLY") return `${SAVINGS_INTERVAL_LABELS[p.interval]}, ${WEEKDAYS[p.executionDay - 1] ?? ""}`;
  return `${SAVINGS_INTERVAL_LABELS[p.interval]} zum ${p.executionDay}.`;
}

export function PendingExecutions({ pending }: { pending: PendingView[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function confirm(p: PendingView) {
    const key = `${p.planId}|${p.dueDate}`;
    setBusy(key);
    const result = await confirmExecutionAction(p.planId, p.dueDate);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.message ?? Object.values(result.errors)[0] ?? "Bestätigen fehlgeschlagen.");
      return;
    }
    router.refresh();
    toast.success(`Sparplan ${p.instrumentName} gebucht`);
  }

  async function confirmAll() {
    setBusy("all");
    let ok = 0;
    for (const p of pending) {
      const result = await confirmExecutionAction(p.planId, p.dueDate);
      if (result.ok) ok++;
    }
    setBusy(null);
    router.refresh();
    toast.success(`${ok} von ${pending.length} Ausführungen gebucht`);
  }

  return (
    <section aria-labelledby="pending-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="pending-heading" className="text-[17px] font-semibold tracking-[-0.01em]">
          Zu bestätigen <span className="ml-1 text-[14px] font-normal text-subtle tnum">{pending.length}</span>
        </h2>
        {pending.length > 1 && (
          <Button size="sm" variant="secondary" onClick={confirmAll} disabled={busy !== null}>
            Alle bestätigen
          </Button>
        )}
      </div>
      <Card className="divide-y divide-border">
        {pending.map((p) => {
          const key = `${p.planId}|${p.dueDate}`;
          return (
            <div key={key} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <InstrumentAvatar name={p.instrumentName} symbol={p.symbol} size={32} />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[14px] font-medium">{p.instrumentName}</div>
                <div className="text-[12px] text-subtle">Fällig am {formatDateLong(p.dueDate)} · Kurs vom Ausführungstag</div>
              </div>
              <span className="text-[14px] font-medium tnum">{formatMoney(p.amount)}</span>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={async () => {
                    await skipExecutionAction(p.planId, p.dueDate);
                    router.refresh();
                  }}
                >
                  Überspringen
                </Button>
                <Button size="sm" variant="primary" disabled={busy !== null} onClick={() => confirm(p)}>
                  {busy === key ? "Buche …" : "Bestätigen"}
                </Button>
              </div>
            </div>
          );
        })}
      </Card>
    </section>
  );
}

export function PlanList({ plans, today }: { plans: PlanView[]; today: string }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<PlanView | null>(null);

  if (plans.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <p className="text-[16px] font-semibold">Noch keine Sparpläne</p>
        <p className="max-w-sm text-[13px] text-muted">Lege einen Sparplan an, z. B. 100 € monatlich in einen MSCI-World-ETF. Ausführungen bestätigst du hier mit einem Klick.</p>
        <NewPlanButton today={today} variant="outline" />
      </Card>
    );
  }

  return (
    <section aria-labelledby="plans-heading" className="flex flex-col gap-3">
      <h2 id="plans-heading" className="text-[17px] font-semibold tracking-[-0.01em]">
        Pläne
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        {plans.map((p) => (
          <Card key={p.id} className={cn("flex flex-col gap-4 p-5", !p.active && "opacity-70")}>
            <div className="flex items-start gap-3">
              <InstrumentAvatar name={p.instrument.name} symbol={p.instrument.symbol} size={36} />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[15px] font-medium">{p.instrument.name}</div>
                <div className="text-[12px] text-subtle">{scheduleLabel(p)}</div>
              </div>
              {!p.active && <Badge>Pausiert</Badge>}
              <Menu>
                <MenuTrigger asChild>
                  <button type="button" className="pressable rounded-md p-1.5 text-subtle hover:bg-surface-2 hover:text-foreground" aria-label="Aktionen">
                    <MoreHorizontalIcon className="size-4" />
                  </button>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem onSelect={() => setEditing(p)}>
                    <PencilIcon /> Bearbeiten
                  </MenuItem>
                  <MenuItem
                    onSelect={async () => {
                      await setSavingsPlanActiveAction(p.id, !p.active);
                      router.refresh();
                    }}
                  >
                    {p.active ? <PauseIcon /> : <PlayIcon />} {p.active ? "Pausieren" : "Fortsetzen"}
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem
                    destructive
                    onSelect={async () => {
                      await deleteSavingsPlanAction(p.id);
                      router.refresh();
                      toast("Sparplan gelöscht – bisherige Ausführungen bleiben erhalten.");
                    }}
                  >
                    <Trash2Icon /> Löschen
                  </MenuItem>
                </MenuContent>
              </Menu>
            </div>
            <dl className="grid grid-cols-3 gap-3 text-[13px]">
              <div>
                <dt className="text-[12px] text-subtle">Rate</dt>
                <dd className="font-medium tnum">{formatMoney(p.amount)}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-subtle">Nächste Ausführung</dt>
                <dd className="font-medium tnum">{p.active && p.nextDate ? formatDate(p.nextDate) : "—"}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-subtle">Bisher investiert</dt>
                <dd className="font-medium tnum">{formatMoney(p.investedEUR)}</dd>
                <dd className="text-[11px] text-subtle">{p.executions} Ausführungen</dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>
      <PlanDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} plan={editing} today={today} />
    </section>
  );
}

export function NewPlanButton({ today, variant = "primary" }: { today: string; variant?: "primary" | "outline" }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <PlusIcon /> Sparplan
      </Button>
      <PlanDialog open={open} onOpenChange={setOpen} plan={null} today={today} />
    </>
  );
}

function PlanDialog({ open, onOpenChange, plan, today }: { open: boolean; onOpenChange: (o: boolean) => void; plan: PlanView | null; today: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        {open && <PlanForm key={plan?.id ?? "new"} plan={plan} today={today} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function PlanForm({ plan, today, onDone }: { plan: PlanView | null; today: string; onDone: () => void }) {
  const router = useRouter();
  const [instrument, setInstrument] = React.useState<PickedInstrument | null>(plan?.instrument ?? null);
  const [amount, setAmount] = React.useState(plan ? plan.amount.replace(".", ",") : "100");
  const [interval, setInterval] = React.useState<SavingsInterval>(plan?.interval ?? "MONTHLY");
  const [day, setDay] = React.useState(String(plan?.executionDay ?? 2));
  const [startDate, setStartDate] = React.useState(plan?.startDate ?? today);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();
  const weekly = interval === "WEEKLY" || interval === "BIWEEKLY";

  const dayOptions = weekly
    ? WEEKDAYS.map((w, i) => ({ value: String(i + 1), label: w }))
    : Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}.` }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveSavingsPlanAction(plan?.id ?? null, {
        instrumentId: instrument?.id ?? null,
        instrument: instrument && !instrument.id ? instrument : null,
        amount,
        interval,
        executionDay: Number(day),
        startDate,
      });
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      onDone();
      router.refresh();
      toast.success(plan ? "Sparplan aktualisiert" : "Sparplan angelegt");
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
      <DialogHeader>
        <DialogTitle>{plan ? "Sparplan bearbeiten" : "Sparplan anlegen"}</DialogTitle>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4 pb-4">
        <Field label="Wertpapier" htmlFor="plan-instrument" error={errors.instrumentId}>
          <InstrumentPicker id="plan-instrument" value={instrument} onChange={setInstrument} autoFocus={!plan} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Betrag (EUR)" htmlFor="plan-amount" error={errors.amount}>
            <Input id="plan-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Startdatum" htmlFor="plan-start" error={errors.startDate}>
            <Input id="plan-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rhythmus" htmlFor="plan-interval" error={errors.interval}>
            <Select
              id="plan-interval"
              value={interval}
              onValueChange={(v) => {
                const next = v as SavingsInterval;
                const nextWeekly = next === "WEEKLY" || next === "BIWEEKLY";
                if (nextWeekly !== weekly) setDay(nextWeekly ? "1" : "2");
                setInterval(next);
              }}
              options={Object.entries(SAVINGS_INTERVAL_LABELS).map(([value, label]) => ({ value, label }))}
              ariaLabel="Rhythmus"
            />
          </Field>
          <Field label={weekly ? "Wochentag" : "Ausführungstag"} htmlFor="plan-day" error={errors.executionDay}>
            <Select id="plan-day" value={day} onValueChange={setDay} options={dayOptions} ariaLabel="Ausführungstag" />
          </Field>
        </div>
        <p className="text-[12px] text-subtle">Fällt der Termin auf ein Wochenende oder einen Feiertag, wird am nächsten Handelstag ausgeführt.</p>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Abbrechen
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Speichern …" : "Speichern"}
        </Button>
      </DialogFooter>
    </form>
  );
}
