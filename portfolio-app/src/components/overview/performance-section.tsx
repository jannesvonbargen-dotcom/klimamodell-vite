"use client";

import * as React from "react";
import { Area, AreaChart, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RangeKey } from "@/domain/performance";
import { formatDateLong, formatMoney, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ChartPoint, PerformanceData } from "@/server/portfolio";
import { ChartTable, sampleRows } from "../chart-table";
import { AnimatedText, Delta } from "../numbers";
import { Segmented } from "../transaction-dialog";

const MINE_COLOR = "var(--series-1)";
const BENCH_COLOR = "var(--series-2)";

const RANGES: Array<{ value: RangeKey; label: string; long: string }> = [
  { value: "1D", label: "1T", long: "Heute" },
  { value: "1W", label: "1W", long: "1 Woche" },
  { value: "1M", label: "1M", long: "1 Monat" },
  { value: "YTD", label: "YTD", long: "Seit Jahresbeginn" },
  { value: "1Y", label: "1J", long: "1 Jahr" },
  { value: "MAX", label: "Max", long: "Gesamt" },
];

const WEEKDAYS = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];

function weekdayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${formatDateLong(day)}`;
}

/** Beschriftung des Zeitraums – am Wochenende/Feiertag zeigt „1T“ den letzten Handelstag. */
function rangeCaption(data: PerformanceData, first: ChartPoint, last: ChartPoint): string {
  if (data.intraday && data.session) {
    if (data.range === "1D") return `${weekdayLabel(data.session.to)} · verglichen mit dem Vortagesschluss`;
    return `${formatDateLong(data.session.from)} – ${formatDateLong(data.session.to)}`;
  }
  return `${formatDateLong(first.key)} – ${formatDateLong(last.key)}`;
}

function pointLabel(key: string, intraday: boolean): string {
  // In Intraday-Reihen ist ein reiner Datumspunkt der Vortagesschluss
  if (intraday && key.length === 10) return `Schluss ${formatDateLong(key)}`;
  if (key.length > 10) {
    const time = key.slice(11, 16);
    return intraday ? `${formatDateLong(key)}, ${time} Uhr` : formatDateLong(key);
  }
  return formatDateLong(key);
}

export function PerformanceSection({
  initial,
  totalEUR,
  dayChangeEUR,
  dayChangePct,
  benchmarkLabel = "MSCI World",
}: {
  initial: PerformanceData;
  totalEUR: string;
  dayChangeEUR: string;
  dayChangePct: string | null;
  benchmarkLabel?: string;
}) {
  const [range, setRange] = React.useState<RangeKey>(initial.range);
  const [cache, setCache] = React.useState<Partial<Record<RangeKey, PerformanceData>>>({});
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState<number | null>(null);
  const [compare, setCompare] = React.useState(false);
  // Die Startreihe kommt bei jedem Server-Refresh frisch vom Server
  const data = range === initial.range ? initial : (cache[range] ?? initial);

  async function selectRange(next: RangeKey) {
    setRange(next);
    setActive(null);
    if (next === initial.range || cache[next]) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/performance?range=${next}`);
      const json = (await res.json()) as PerformanceData;
      setCache((c) => ({ ...c, [next]: json }));
    } finally {
      setLoading(false);
    }
  }

  const points = data.points;
  const shown = points.length > 0;
  const last = points[points.length - 1];
  const first = points[0];
  const scrubbing = active !== null && points[active] !== undefined;
  const activePoint: ChartPoint | undefined = scrubbing ? points[active!] : undefined;
  const rangeInfo = RANGES.find((r) => r.value === range)!;
  const longLabel =
    range === "1D" && data.session && data.today && data.session.to !== data.today
      ? `Letzter Handelstag (${weekdayLabel(data.session.to)})`
      : rangeInfo.long;

  // Kopfzahl: beim Scrubben Wert am Punkt, sonst aktuelles Gesamtvermögen
  const headline = activePoint ? String(activePoint.value) : totalEUR;
  let deltaValue: string | null;
  let deltaPct: string | null;
  if (activePoint) {
    deltaValue = String(activePoint.gain);
    deltaPct = String(activePoint.twr);
  } else if (range === "1D") {
    deltaValue = dayChangeEUR;
    deltaPct = dayChangePct;
  } else {
    deltaValue = last ? String(last.gain) : null;
    deltaPct = last ? String(last.twr) : null;
  }
  const trendUp = (last?.gain ?? 0) >= 0;
  const color = trendUp ? "var(--up)" : "var(--down)";

  function handleMove(state: { activeTooltipIndex?: unknown } | undefined) {
    const idx = state?.activeTooltipIndex;
    if (idx !== undefined && idx !== null && !Number.isNaN(Number(idx))) setActive(Number(idx));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!shown) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      setActive((cur) => {
        const base = cur ?? points.length - 1;
        return Math.max(0, Math.min(points.length - 1, base + (e.key === "ArrowLeft" ? -step : step)));
      });
    } else if (e.key === "Escape" || e.key === "Home" || e.key === "End") {
      if (e.key === "Home") setActive(0);
      else if (e.key === "End") setActive(points.length - 1);
      else setActive(null);
    }
  }

  const values = points.map((p) => p.value);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const pad = (max - min) * 0.08 || max * 0.01 || 1;

  // Vergleichsmodus: beide Reihen als Veränderung seit Beginn des Zeitraums (eine gemeinsame Achse)
  const bench = data.benchmark;
  const comparing = compare && !!bench && !data.intraday;
  const compareData = comparing
    ? points.map((p, i) => ({ key: p.key, mine: p.twr * 100, bench: bench.values[i] === null ? null : bench.values[i]! * 100 }))
    : [];
  const legendIndex = active ?? points.length - 1;
  const mineAt = points[legendIndex]?.twr ?? null;
  const benchAt = comparing ? (bench.values[legendIndex] ?? null) : null;

  return (
    <section aria-labelledby="total-heading" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 id="total-heading" className="text-[13px] font-medium text-muted">
          Gesamtvermögen
        </h1>
        <div className="text-[40px] leading-[1.05] font-semibold tracking-[-0.025em] sm:text-[48px]" aria-live="polite">
          <AnimatedText value={formatMoney(headline)} animate={!scrubbing} />
        </div>
        <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1">
          <Delta value={deltaValue} percent={deltaPct} size="lg" />
          <span className="text-[14px] text-subtle">{activePoint ? pointLabel(activePoint.key, data.intraday) : longLabel}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {comparing && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]" aria-live="polite">
            <span className="inline-flex items-center gap-1.5 text-muted">
              <span className="h-0.5 w-3.5 rounded-full" style={{ background: MINE_COLOR }} aria-hidden />
              Dein Depot{" "}
              <span className="tnum font-medium text-foreground">
                {mineAt !== null ? formatPercent(String(mineAt), { digits: 1 }) : "—"}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted">
              <span className="h-0.5 w-3.5 rounded-full" style={{ background: BENCH_COLOR }} aria-hidden />
              {bench!.label}{" "}
              <span className="tnum font-medium text-foreground">
                {benchAt !== null ? formatPercent(String(benchAt), { digits: 1 }) : "—"}
              </span>
            </span>
            <span className="text-[12px] text-subtle">zeitgewichtet, seit Beginn des Zeitraums</span>
          </div>
        )}
        <div
          className={cn(
            "relative h-[220px] rounded-xl transition-opacity duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-[260px]",
            loading && "opacity-50",
          )}
          tabIndex={shown ? 0 : -1}
          role="img"
          aria-label={
            shown
              ? `Wertverlauf ${longLabel}: von ${formatMoney(String(first.value))} auf ${formatMoney(String(last.value))}. Mit den Pfeiltasten durch die Werte gehen.`
              : "Noch kein Wertverlauf"
          }
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
        >
          {shown && comparing ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={compareData}
                margin={{ top: 8, right: 0, bottom: 4, left: 4 }}
                onMouseMove={handleMove}
                onTouchMove={handleMove}
                onMouseLeave={() => setActive(null)}
                onTouchEnd={() => setActive(null)}
              >
                <XAxis dataKey="key" hide />
                <YAxis
                  orientation="right"
                  width={52}
                  axisLine={false}
                  tickLine={false}
                  tickCount={5}
                  tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                  tickFormatter={(v: number) => formatPercent(String(v / 100), { digits: 0 })}
                />
                <Tooltip content={() => null} cursor={false} isAnimationActive={false} />
                <ReferenceLine y={0} stroke="var(--chart-grid)" strokeWidth={1} />
                <Line
                  type="monotone"
                  dataKey="bench"
                  stroke={BENCH_COLOR}
                  strokeWidth={2}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="mine"
                  stroke={MINE_COLOR}
                  strokeWidth={2}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
                {activePoint && compareData[active!] && (
                  <>
                    <ReferenceLine x={activePoint.key} stroke="var(--subtle-foreground)" strokeWidth={1} />
                    <ReferenceDot
                      x={activePoint.key}
                      y={compareData[active!].mine}
                      r={4}
                      fill={MINE_COLOR}
                      stroke="var(--background)"
                      strokeWidth={2}
                    />
                    {compareData[active!].bench !== null && (
                      <ReferenceDot
                        x={activePoint.key}
                        y={compareData[active!].bench!}
                        r={4}
                        fill={BENCH_COLOR}
                        stroke="var(--background)"
                        strokeWidth={2}
                      />
                    )}
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          ) : shown ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={points}
                margin={{ top: 8, right: 4, bottom: 4, left: 4 }}
                onMouseMove={handleMove}
                onTouchMove={handleMove}
                onMouseLeave={() => setActive(null)}
                onTouchEnd={() => setActive(null)}
              >
                <defs>
                  <linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.16} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="key" hide />
                <YAxis domain={[min - pad, max + pad]} hide />
                <Tooltip content={() => null} cursor={false} isAnimationActive={false} />
                {first && <ReferenceLine y={first.value} stroke="var(--chart-grid)" strokeWidth={1} />}
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2}
                  fill="url(#perfFill)"
                  isAnimationActive={false}
                  dot={false}
                  activeDot={false}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {activePoint && (
                  <>
                    <ReferenceLine x={activePoint.key} stroke="var(--subtle-foreground)" strokeWidth={1} />
                    <ReferenceDot
                      x={activePoint.key}
                      y={activePoint.value}
                      r={4.5}
                      fill={color}
                      stroke="var(--background)"
                      strokeWidth={2}
                    />
                  </>
                )}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border-strong text-[13px] text-subtle">
              Noch kein Wertverlauf
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          <Segmented
            value={range}
            onChange={selectRange}
            options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
            ariaLabel="Zeitraum"
          />
          <div className="flex items-center gap-3">
            {shown && <span className="hidden text-[12px] text-subtle md:inline">{rangeCaption(data, first, last)}</span>}
            <button
              type="button"
              aria-pressed={comparing}
              disabled={!bench || data.intraday}
              aria-label={`Mit ${benchmarkLabel} vergleichen`}
              title={
                data.intraday
                  ? "Vergleich ab 1M verfügbar"
                  : bench
                    ? `Wertentwicklung mit ${benchmarkLabel} vergleichen`
                    : "Keine Kurse für den Vergleichsindex"
              }
              onClick={() => {
                setCompare((c) => !c);
                setActive(null);
              }}
              className={cn(
                "pressable inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors duration-150 disabled:opacity-40",
                comparing ? "border-transparent bg-foreground text-background" : "border-border-strong text-muted hover:text-foreground",
              )}
            >
              <span className="size-2 rounded-full" style={{ background: BENCH_COLOR }} aria-hidden />
              {benchmarkLabel}
            </button>
          </div>
        </div>
        {shown && (
          <ChartTable
            caption={`Wertverlauf ${longLabel}`}
            columns={[
              { label: "Zeitpunkt" },
              { label: "Gesamtvermögen", align: "right" },
              { label: "Gewinn/Verlust", align: "right" },
              { label: "Rendite (zeitgew.)", align: "right" },
              ...(comparing ? [{ label: bench!.label, align: "right" as const }] : []),
            ]}
            rows={sampleRows(points.map((p, i) => ({ p, i }))).map(({ p, i }) => [
              pointLabel(p.key, data.intraday),
              formatMoney(String(p.value)),
              formatMoney(String(p.gain), "EUR", { signed: true }),
              formatPercent(String(p.twr), { digits: 2 }),
              ...(comparing ? [bench!.values[i] === null ? "—" : formatPercent(String(bench!.values[i]), { digits: 2 })] : []),
            ])}
          />
        )}
      </div>
    </section>
  );
}
