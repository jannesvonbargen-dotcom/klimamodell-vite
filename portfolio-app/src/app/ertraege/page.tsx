import { InfoIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DividendChart } from "@/components/income/dividend-chart";
import { Delta, InstrumentAvatar } from "@/components/numbers";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/misc";
import { formatDate, formatMoney, formatPercent, formatPrice, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getIncomeOverview } from "@/server/income";

export const metadata: Metadata = { title: "Erträge & Steuern" };

const MONTHS_LONG = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export default async function IncomePage() {
  const data = await getIncomeOverview();
  const { kpis } = data;
  const currentMonth = data.today.slice(0, 7);
  const upcomingByMonth = new Map<string, typeof data.upcoming>();
  for (const u of data.upcoming) {
    const key = u.date.slice(0, 7);
    upcomingByMonth.set(key, [...(upcomingByMonth.get(key) ?? []), u]);
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Erträge & Steuern"
        description="Dividenden der letzten zwölf Monate, eine Hochrechnung für die nächsten zwölf und die Jahresübersicht deiner Erträge, Gebühren und Steuern."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Dividenden 12 Monate (netto)"
          value={formatMoney(kpis.receivedNet12m)}
          sub={`${kpis.paymentsCount12m} Zahlungen von ${kpis.payers} Werten`}
        />
        <Tile label="Davon brutto" value={formatMoney(kpis.receivedGross12m)} sub="vor Steuern" />
        <Tile label="Erwartet nächste 12 Monate" value={formatMoney(kpis.expectedGross12m)} sub="Schätzung, brutto" />
        <Tile
          label="Rendite auf Einstand"
          value={kpis.yieldOnCost ? formatPercent(kpis.yieldOnCost, { signed: false, digits: 2 }) : "—"}
          sub="Bruttodividenden 12 M. ÷ Einstand"
        />
      </div>

      <Card className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 className="text-[15px] font-semibold">Dividenden je Monat</h2>
        <DividendChart months={data.months} currentMonth={currentMonth} />
        <p className="flex items-start gap-2 border-t border-border pt-3 text-[12px] text-subtle">
          <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden />
          Hochrechnung: Jede Zahlung der letzten zwölf Monate wiederholt sich ein Jahr später mit gleichem Betrag je Aktie für deinen
          heutigen Bestand (umgerechnet zum Wechselkurs vom {data.fxDate ? formatDate(data.fxDate) : "heute"}). Erhöhungen, Kürzungen und
          Sonderdividenden sind nicht berücksichtigt.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <section aria-labelledby="upcoming-heading" className="flex flex-col gap-3 lg:col-span-3">
          <h2 id="upcoming-heading" className="text-[17px] font-semibold tracking-[-0.01em]">
            Dividendenkalender <span className="ml-1 text-[14px] font-normal text-subtle">Schätzung</span>
          </h2>
          {data.upcoming.length === 0 ? (
            <Card className="px-5 py-10 text-center text-[13px] text-subtle">
              Keine erwarteten Zahlungen – es gab in den letzten zwölf Monaten keine Dividenden auf gehaltene Werte.
            </Card>
          ) : (
            <Card className="divide-y divide-border">
              {[...upcomingByMonth.entries()].map(([month, rows]) => (
                <div key={month} className="flex flex-col">
                  <div className="flex items-baseline justify-between px-5 pt-3 pb-1">
                    <span className="text-[12px] font-semibold tracking-wide text-subtle uppercase">
                      {MONTHS_LONG[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}
                    </span>
                    <span className="tnum text-[12px] text-subtle">
                      ≈ {formatMoney(rows.reduce((a, r) => a + Number(r.grossEUR ?? 0), 0).toFixed(2))}
                    </span>
                  </div>
                  {rows.map((r) => (
                    <Link
                      key={`${r.instrument.isin}-${r.date}`}
                      href={`/position/${encodeURIComponent(r.instrument.isin)}`}
                      className="flex items-center gap-3 px-5 py-2.5 transition-colors duration-150 hover:bg-surface-2/60"
                    >
                      <InstrumentAvatar name={r.instrument.name} symbol={r.instrument.symbol} size={30} />
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="truncate text-[14px]">{r.instrument.name}</div>
                        <div className="tnum truncate text-[12px] text-subtle">
                          um den {formatDate(r.date)} · {formatQuantity(r.shares)} × {formatPrice(r.perShare, r.currency)} · wie am{" "}
                          {formatDate(r.basedOnDate)}
                        </div>
                      </div>
                      <div className="text-right leading-tight">
                        <div className="tnum text-[14px] font-medium">{r.grossEUR ? formatMoney(r.grossEUR) : "—"}</div>
                        {r.currency !== "EUR" && (
                          <div className="tnum text-[11px] text-subtle">{formatMoney(r.grossLocal, r.currency)}</div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              ))}
            </Card>
          )}
        </section>

        <section aria-labelledby="payers-heading" className="flex flex-col gap-3 lg:col-span-2">
          <h2 id="payers-heading" className="text-[17px] font-semibold tracking-[-0.01em]">
            Nach Wertpapier
          </h2>
          <Card className="flex flex-col gap-3 p-5">
            {data.byInstrument.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-subtle">Noch keine Dividenden.</p>
            ) : (
              data.byInstrument.map((b) => (
                <div key={b.instrument.isin} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="truncate">{b.instrument.name}</span>
                    <span className="tnum shrink-0 font-medium">{formatMoney(b.netEUR12m)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                    <div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${Math.max(2, Number(b.share) * 100)}%` }} />
                  </div>
                  <span className="tnum text-[11px] text-subtle">
                    {formatPercent(b.share, { signed: false, digits: 0 })} der Nettodividenden · erwartet {formatMoney(b.expectedEUR)}
                  </span>
                </div>
              ))
            )}
          </Card>
        </section>
      </div>

      <section aria-labelledby="years-heading" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="years-heading" className="text-[17px] font-semibold tracking-[-0.01em]">
            Jahresübersicht
          </h2>
          <p className="text-[13px] text-muted">
            Steuern so, wie sie gebucht wurden (Abrechnungen, Import, manuelle Eingabe). Realisierte Gewinne nach Durchschnittskosten
            inklusive Gebühren – die Steuerbescheinigung rechnet nach FIFO und kann abweichen.
          </p>
        </div>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <caption className="sr-only">Erträge, Gebühren und Steuern je Jahr</caption>
              <thead>
                <tr className="border-b border-border text-right text-[12px] text-subtle">
                  <th className="px-5 py-2.5 text-left font-medium">Jahr</th>
                  <th className="px-4 py-2.5 font-medium">Dividenden brutto</th>
                  <th className="px-4 py-2.5 font-medium">Zinsen netto</th>
                  <th className="px-4 py-2.5 font-medium">Realisiert</th>
                  <th className="px-4 py-2.5 font-medium">Gebühren</th>
                  <th className="px-4 py-2.5 font-medium">Steuern</th>
                  <th className="px-5 py-2.5 font-medium">Ertrag netto</th>
                </tr>
              </thead>
              <tbody>
                {data.years.map((y) => (
                  <tr key={y.year} className="border-b border-border text-right last:border-0">
                    <th scope="row" className="tnum px-5 py-3 text-left font-medium">
                      {y.year}
                    </th>
                    <td className="tnum px-4 py-3">{formatMoney(y.dividendsGrossEUR)}</td>
                    <td className="tnum px-4 py-3">{formatMoney(y.interestEUR)}</td>
                    <td className="px-4 py-3">
                      <Delta value={y.realizedEUR} size="sm" showArrow={false} className="justify-end" />
                    </td>
                    <td className="tnum px-4 py-3 text-muted">{formatMoney(y.feesEUR)}</td>
                    <td className="tnum px-4 py-3 text-muted">{formatMoney(y.taxesEUR)}</td>
                    <td className={cn("tnum px-5 py-3 font-semibold")}>
                      <Delta value={y.totalEUR} size="sm" showArrow={false} className="justify-end" />
                    </td>
                  </tr>
                ))}
                {data.years.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-[13px] text-subtle">
                      Noch keine Buchungen.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="border-t border-border bg-surface-2/50 px-5 py-2.5 text-[12px] text-subtle">
            Ertrag netto = Dividenden netto + Zinsen netto + realisierte Gewinne/Verluste.
          </p>
        </Card>
      </section>

      {data.recent.length > 0 && (
        <section aria-labelledby="recent-heading" className="flex flex-col gap-3">
          <h2 id="recent-heading" className="text-[17px] font-semibold tracking-[-0.01em]">
            Letzte Dividenden
          </h2>
          <Card className="divide-y divide-border">
            {data.recent.map((r, i) => (
              <div key={`${r.date}-${i}`} className="flex items-center gap-3 px-5 py-2.5">
                <span className="tnum w-20 shrink-0 text-[12px] text-subtle">{formatDate(r.date)}</span>
                <span className="min-w-0 flex-1 truncate text-[14px]">{r.instrument.name}</span>
                <span className="tnum hidden text-[12px] text-subtle sm:inline">
                  brutto {formatMoney(r.grossEUR)} · Steuer {formatMoney(r.taxEUR)}
                </span>
                <span className="tnum w-24 text-right text-[14px] font-medium text-up">
                  {formatMoney(r.netEUR, "EUR", { signed: true })}
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-[12px] font-medium text-subtle">{label}</span>
      <span className="tnum text-[20px] font-semibold tracking-[-0.01em]">{value}</span>
      {sub && <span className="text-[12px] text-subtle">{sub}</span>}
    </Card>
  );
}
