import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Delta, InstrumentAvatar } from "@/components/numbers";
import { InstrumentChartView } from "@/components/position/instrument-chart";
import { PositionActions } from "@/components/position/position-actions";
import { PositionTransactions } from "@/components/position/position-transactions";
import { Badge, Card } from "@/components/ui/misc";
import { d } from "@/domain/decimal";
import {
  formatCompact,
  formatDate,
  formatDateTimeBerlin,
  formatMoney,
  formatNumber,
  formatPercent,
  formatPrice,
  formatQuantity,
} from "@/lib/format";
import { getInstrumentChart, getPositionDetail } from "@/server/position";

export async function generateMetadata(props: PageProps<"/position/[isin]">): Promise<Metadata> {
  const { isin } = await props.params;
  const detail = await getPositionDetail(decodeURIComponent(isin));
  return { title: detail?.instrument.name ?? "Position" };
}

export default async function PositionPage(props: PageProps<"/position/[isin]">) {
  const { isin: rawIsin } = await props.params;
  const isin = decodeURIComponent(rawIsin);
  const [detail, chart] = await Promise.all([getPositionDetail(isin), getInstrumentChart(isin, "1Y")]);
  if (!detail || !chart) notFound();
  const { instrument, position, quote, fundamentals: f } = detail;
  const placeholderIsin = instrument.isin.startsWith("X-");
  const dayPct =
    quote?.previousClose && d(quote.previousClose).gt(0)
      ? d(quote.price).minus(quote.previousClose).div(quote.previousClose).toString()
      : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5">
        <Link href="/" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Übersicht
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <InstrumentAvatar name={instrument.name} symbol={instrument.symbol} logoUrl={instrument.logoUrl} size={48} />
            <div className="min-w-0">
              <h1 className="truncate text-[24px] leading-tight font-semibold tracking-[-0.02em]">{instrument.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-subtle">
                <span>{instrument.symbol}</span>
                {!placeholderIsin && <span>· {instrument.isin}</span>}
                {instrument.wkn && <span>· WKN {instrument.wkn}</span>}
                <Badge className="ml-1">{instrument.kind === "ETF" ? "ETF" : "Aktie"}</Badge>
                {!position && detail.transactions.length > 0 && <Badge tone="neutral">Position geschlossen</Badge>}
              </div>
            </div>
          </div>
          <PositionActions instrument={instrument} holds={!!position} splits={detail.splits} />
        </div>
      </div>

      <Card className="p-5 sm:p-6">
        <InstrumentChartView isin={instrument.isin} initial={chart} />
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-[12px] text-subtle">
          {quote ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={
                    quote.stale
                      ? "size-1.5 rounded-full bg-warn"
                      : detail.marketOpen
                        ? "size-1.5 rounded-full bg-up"
                        : "size-1.5 rounded-full bg-subtle"
                  }
                  aria-hidden
                />
                {detail.marketOpen ? "Börse geöffnet" : "Börse geschlossen"}
              </span>
              <span>· Kurs von {formatDateTimeBerlin(quote.asOf)}</span>
              <span>· Heute {dayPct ? formatPercent(dayPct) : "—"}</span>
              {quote.stale && <span className="text-warn">· Anbieter nicht erreichbar, letzter bekannter Kurs</span>}
            </>
          ) : (
            <span className="text-warn">Keine Kursdaten – Kurssymbol prüfen (Menü „Stammdaten & Kurssymbol“).</span>
          )}
        </div>
      </Card>

      {position ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Wert"
            value={formatMoney(position.marketValueEUR)}
            sub={`${formatQuantity(position.quantity)} Stück · ${formatPercent(position.weight, { signed: false, digits: 1 })} vom Depot`}
          />
          <Stat
            label="Einstand"
            value={formatMoney(position.costEUR)}
            sub={`Ø ${position.avgCostLocal ? formatPrice(position.avgCostLocal, position.costCurrency ?? "EUR") : formatPrice(position.avgCostEUR)} je Stück`}
          />
          <Stat
            label="Gewinn/Verlust"
            value={<Delta value={position.unrealizedEUR} percent={position.unrealizedPct} className="text-[16px]" />}
            sub="unrealisiert"
          />
          <Stat
            label="Heute"
            value={<Delta value={position.dayChangeEUR} percent={position.dayChangePct} className="text-[16px]" />}
            sub={position.priceSource !== "quote" ? "ohne aktuellen Kurs" : undefined}
          />
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="flex flex-col gap-4 p-5 lg:col-span-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold">Kennzahlen</h2>
            <span className="text-[12px] text-subtle">
              {f ? `Quelle: ${f.source} · Stand ${formatDate(f.asOf)}${f.stale ? " (veraltet)" : ""}` : "Keine Daten vom Kursanbieter"}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Metric label="KGV" value={f?.trailingPE ? formatNumber(f.trailingPE, 1) : null} />
            <Metric label="KGV (erwartet)" value={f?.forwardPE ? formatNumber(f.forwardPE, 1) : null} />
            <Metric label="Marktkapitalisierung" value={f?.marketCap ? formatCompact(f.marketCap, f.currency ?? undefined) : null} />
            <Metric label="Dividendenrendite" value={f?.dividendYield ? formatPercent(f.dividendYield, { signed: false }) : null} />
            <Metric label="Sektor" value={f?.sector ?? instrument.sector} />
            <Metric label="Land" value={f?.country ?? instrument.country} />
          </dl>
          {f?.fiftyTwoWeekLow && f.fiftyTwoWeekHigh && (
            <FiftyTwoWeek
              low={f.fiftyTwoWeekLow}
              high={f.fiftyTwoWeekHigh}
              current={quote?.price ?? null}
              currency={quote?.currency ?? instrument.currency}
            />
          )}
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-[15px] font-semibold">Erträge & Kosten</h2>
          <dl className="flex flex-col gap-3 text-[14px]">
            <Row label="Realisiert" value={<Delta value={detail.realizedEUR} size="sm" />} />
            <Row label="Dividenden netto" value={<span className="tnum">{formatMoney(detail.dividendsNetEUR)}</span>} />
            <Row label="Dividenden brutto" value={<span className="tnum text-muted">{formatMoney(detail.dividendsGrossEUR)}</span>} />
            <Row label="Gebühren" value={<span className="tnum text-muted">{formatMoney(detail.feesEUR)}</span>} />
            <Row label="Erster Kauf" value={<span className="tnum text-muted">{formatDate(detail.firstBuyAt)}</span>} />
          </dl>
          {detail.dividendsByYear.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t border-border pt-3">
              <span className="text-[12px] font-medium text-subtle">Dividenden je Jahr (netto)</span>
              {detail.dividendsByYear.map((y) => (
                <div key={y.year} className="flex justify-between text-[13px]">
                  <span className="tnum text-muted">
                    {y.year} <span className="text-subtle">· {y.count}×</span>
                  </span>
                  <span className="tnum">{formatMoney(y.netEUR)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <PositionTransactions instrument={instrument} transactions={detail.transactions} />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-[12px] font-medium text-subtle">{label}</span>
      <span className="tnum text-[18px] font-semibold tracking-[-0.01em]">{value}</span>
      {sub && <span className="text-[12px] text-subtle">{sub}</span>}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[12px] text-subtle">{label}</dt>
      <dd className={value ? "tnum text-[15px] font-medium" : "text-[14px] text-subtle"}>{value ?? "keine Daten"}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function FiftyTwoWeek({ low, high, current, currency }: { low: string; high: string; current: string | null; currency: string }) {
  const l = Number(low);
  const h = Number(high);
  const c = current ? Number(current) : null;
  const pos = c !== null && h > l ? Math.min(100, Math.max(0, ((c - l) / (h - l)) * 100)) : null;
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <div className="flex justify-between text-[12px] text-subtle">
        <span>52-Wochen-Spanne</span>
        {pos !== null && <span className="tnum">{Math.round(pos)} % der Spanne</span>}
      </div>
      <div
        className="relative h-1.5 rounded-full bg-surface-3"
        role="img"
        aria-label={`52 Wochen: Tief ${formatPrice(low, currency)}, Hoch ${formatPrice(high, currency)}`}
      >
        {pos !== null && (
          <span
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-foreground"
            style={{ left: `${pos}%` }}
          />
        )}
      </div>
      <div className="tnum flex justify-between text-[13px]">
        <span>{formatPrice(low, currency)}</span>
        <span>{formatPrice(high, currency)}</span>
      </div>
    </div>
  );
}
