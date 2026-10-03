import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { PendingExecutions, type PendingView, PlanList, type PlanView, NewPlanButton } from "@/components/savings/savings-ui";
import { d, roundMoney, sum } from "@/domain/decimal";
import { germanHolidaySet, todayInBerlin } from "@/domain/market-hours";
import { nextExecutionDate } from "@/domain/savings-plan";
import { formatMoney } from "@/lib/format";
import { pendingSavingsSuggestions } from "@/server/portfolio";
import { instrumentMap, listSavingsPlans, listTransactionRows } from "@/server/repo";

export const metadata: Metadata = { title: "Sparpläne" };

export default function SavingsPage() {
  const today = todayInBerlin();
  const instruments = instrumentMap();
  const plans = listSavingsPlans();
  const txs = listTransactionRows();
  const holidays = germanHolidaySet(2015, Number(today.slice(0, 4)) + 1);

  const planViews: PlanView[] = plans.map((p) => {
    const instrument = instruments.get(p.instrumentId)!;
    const executions = txs.filter(
      (t) => t.savingsPlanId === p.id || (t.type === "SAVINGS_PLAN" && t.instrumentId === p.instrumentId && !t.savingsPlanId),
    );
    return {
      ...p,
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
      nextDate: nextExecutionDate(p, today, holidays),
      executions: executions.length,
      investedEUR: roundMoney(sum(executions.map((t) => d(t.amount ?? "0")))).toString(),
    };
  });

  const pending: PendingView[] = pendingSavingsSuggestions(today).map((s) => {
    const instrument = instruments.get(s.instrumentId)!;
    return { ...s, instrumentName: instrument.name, symbol: instrument.symbol };
  });

  const monthly = sum(
    plans
      .filter((p) => p.active)
      .map((p) => {
        const a = d(p.amount);
        switch (p.interval) {
          case "WEEKLY":
            return a.times(52).div(12);
          case "BIWEEKLY":
            return a.times(26).div(12);
          case "BIMONTHLY":
            return a.div(2);
          case "QUARTERLY":
            return a.div(3);
          default:
            return a;
        }
      }),
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Sparpläne"
        description={
          plans.length > 0 ? (
            <>
              Aktive Pläne entsprechen rund <strong className="tnum text-foreground">{formatMoney(roundMoney(monthly).toString())}</strong>{" "}
              pro Monat. Fällige Ausführungen erscheinen als Vorschlag zum Bestätigen.
            </>
          ) : (
            "Regelmäßige Käufe anlegen. Fällige Ausführungen erscheinen als Vorschlag, den du bestätigst."
          )
        }
        actions={<NewPlanButton today={today} />}
      />
      {pending.length > 0 && <PendingExecutions pending={pending} />}
      <PlanList plans={planViews} today={today} />
    </div>
  );
}
