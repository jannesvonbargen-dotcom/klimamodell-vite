"use client";

import * as React from "react";
import { Area, AreaChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RangeKey } from "@/domain/performance";
import { formatDateLong, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ChartPoint, PerformanceData } from "@/server/portfolio";
import { AnimatedText, Delta } from "../numbers";
import { Segmented } from "../transaction-dialog";

const RANGES: Array<{ value: RangeKey; label: string; long: string }> = [
  { value: "1D", label: "1T", long: "Heute" },
  { value: "1W", label: "1W", long: "1 Woche" },
  { value: "1M", label: "1M", long: "1 Monat" },
  { value: "YTD", label: "YTD", long: "Seit Jahresbeginn" },
  { value: "1Y", label: "1J", long: "1 Jahr" },
  { value: "MAX", label: "Max", long: "Gesamt" },
];

function pointLabel(key: string, intraday: boolean): string {
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
}: {
  initial: PerformanceData;
  totalEUR: string;
  dayChangeEUR: string;
  dayChangePct: string | null;
}) {
  const [range, setRange] = React.useState<RangeKey>(initial.range);
  const [cache, setCache] = React.useState<Partial<Record<RangeKey, PerformanceData>>>({});
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState<number | null>(null);
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
          <span className="text-[14px] text-subtle">{activePoint ? pointLabel(activePoint.key, data.intraday) : rangeInfo.long}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div
          className={cn(
            "relative h-[220px] rounded-xl outline-none transition-opacity duration-200 focus-visible:ring-2 focus-visible:ring-ring sm:h-[260px]",
            loading && "opacity-50",
          )}
          tabIndex={shown ? 0 : -1}
          role="img"
          aria-label={
            shown
              ? `Wertverlauf ${rangeInfo.long}: von ${formatMoney(String(first.value))} auf ${formatMoney(String(last.value))}. Mit den Pfeiltasten durch die Werte gehen.`
              : "Noch kein Wertverlauf"
          }
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
        >
          {shown ? (
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
                    <ReferenceDot x={activePoint.key} y={activePoint.value} r={4.5} fill={color} stroke="var(--background)" strokeWidth={2} />
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
          <Segmented value={range} onChange={selectRange} options={RANGES.map((r) => ({ value: r.value, label: r.label }))} ariaLabel="Zeitraum" />
          {shown && (
            <span className="hidden text-[12px] text-subtle sm:inline">
              {pointLabel(first.key, data.intraday)} – {pointLabel(last.key, data.intraday)}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
