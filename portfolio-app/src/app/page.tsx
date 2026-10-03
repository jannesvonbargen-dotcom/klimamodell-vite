import Link from "next/link";
import { Allocation } from "@/components/overview/allocation";
import { AutoRefresh, EmptyPortfolio, Kpi, Notice, QuoteStatus, StatTile } from "@/components/overview/parts";
import { PerformanceSection } from "@/components/overview/performance-section";
import { PositionsTable } from "@/components/overview/positions-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { formatDate, formatMoney } from "@/lib/format";
import { getOverview, getPerformance } from "@/server/portfolio";

export default async function OverviewPage() {
  const [overview, performance] = await Promise.all([getOverview(), getPerformance("1D")]);
  const { totals } = overview;

  if (overview.transactionCount === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Übersicht</h1>
        <EmptyPortfolio />
      </div>
    );
  }

  const year = Number(overview.today.slice(0, 4));
  const thisYear = overview.years.find((y) => y.year === year);
  const negativeCash = overview.issues.find((i) => i.kind === "NEGATIVE_CASH");
  const oversell = overview.issues.find((i) => i.kind === "OVERSELL");

  return (
    <div className="flex flex-col gap-8">
      <AutoRefresh anyMarketOpen={overview.markets.some((m) => m.open)} />
      <div className="flex flex-col gap-3">
        <QuoteStatus
          lastQuoteAt={overview.lastQuoteAt}
          providerLabel={overview.provider.label}
          isDemo={overview.provider.isDemo}
          errors={overview.quoteErrors}
          staleQuotes={overview.staleQuotes}
          missingQuotes={overview.missingQuotes}
        />
        <PerformanceSection initial={performance} totalEUR={totals.totalEUR} dayChangeEUR={totals.dayChangeEUR} dayChangePct={totals.dayChangePct} />
      </div>

      {(overview.pendingSavings > 0 || negativeCash || oversell) && (
        <div className="flex flex-col gap-2">
          {overview.pendingSavings > 0 && (
            <Notice
              tone="info"
              action={
                <Button size="sm" variant="secondary" asChild>
                  <Link href="/sparplaene">Prüfen</Link>
                </Button>
              }
            >
              {overview.pendingSavings === 1 ? "1 Sparplan-Ausführung wartet" : `${overview.pendingSavings} Sparplan-Ausführungen warten`} auf deine Bestätigung.
            </Notice>
          )}
          {oversell && oversell.kind === "OVERSELL" && (
            <Notice
              action={
                <Button size="sm" variant="secondary" asChild>
                  <Link href="/transaktionen">Ansehen</Link>
                </Button>
              }
            >
              Am {formatDate(oversell.executedAt)} wurden mehr Stücke verkauft als vorhanden – vermutlich fehlt ein Kauf.
            </Notice>
          )}
          {negativeCash && negativeCash.kind === "NEGATIVE_CASH" && (
            <Notice
              action={
                <Button size="sm" variant="secondary" asChild>
                  <Link href="/transaktionen">Ansehen</Link>
                </Button>
              }
            >
              Das Cash-Konto war am {formatDate(negativeCash.executedAt)} negativ ({formatMoney(negativeCash.cash)}). Fehlen Einzahlungen?
            </Notice>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile label="Investiert" value={totals.marketValueEUR} share={totals.investedShare} sub={<>Einstand {formatMoney(totals.costEUR)}</>} />
        <StatTile label="Cash (uninvestiert)" value={totals.cashEUR} share={totals.cashShare} sub={<>Einzahlungen gesamt {formatMoney(totals.depositsEUR)}</>} />
      </div>

      <Card className="grid grid-cols-2 divide-border md:grid-cols-4 md:divide-x [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-border md:[&>*:nth-child(-n+2)]:border-b-0">
        <Kpi label="Unrealisiert" value={totals.unrealizedEUR} percent={totals.unrealizedPct} />
        <Kpi label="Realisiert (gesamt)" value={totals.realizedEUR} hint={thisYear ? `${year}: ${formatMoney(thisYear.realizedEUR, "EUR", { signed: true })}` : undefined} />
        <Kpi label={`Dividenden ${year} (netto)`} value={thisYear?.dividendsNetEUR ?? "0"} hint={`Gesamt ${formatMoney(totals.dividendsNetEUR)}`} />
        <Kpi label="Gebühren gesamt" value={totals.feesEUR} neutral hint={`Steuern ${formatMoney(totals.taxesEUR)} · Zinsen ${formatMoney(totals.interestEUR)}`} />
      </Card>

      <PositionsTable positions={overview.positions} />

      <Allocation allocation={overview.allocation} />
    </div>
  );
}
