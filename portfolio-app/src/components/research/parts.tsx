import { CheckIcon, CircleSlashIcon, MinusIcon, XIcon } from "lucide-react";
import { d } from "@/domain/decimal";
import { formatDate, formatPercent, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CriterionResult, CriterionStatus, ResearchCompany } from "@/research/types";

/** Bausteine der Rubrik „Solide Wachstumswerte“ (Server-Komponenten). */

export const STATUS_LABEL: Record<CriterionStatus, string> = {
  pass: "Erfüllt",
  fail: "Nicht erfüllt",
  nodata: "Keine Daten",
  na: "Nicht anwendbar",
};

export function StatusIcon({ status, className }: { status: CriterionStatus; className?: string }) {
  const base = "inline-flex size-5 shrink-0 items-center justify-center rounded-full";
  switch (status) {
    case "pass":
      return (
        <span className={cn(base, "bg-up-soft text-up", className)} role="img" aria-label={STATUS_LABEL.pass}>
          <CheckIcon className="size-3.5" strokeWidth={2.5} />
        </span>
      );
    case "fail":
      return (
        <span className={cn(base, "bg-down-soft text-down", className)} role="img" aria-label={STATUS_LABEL.fail}>
          <XIcon className="size-3.5" strokeWidth={2.5} />
        </span>
      );
    case "nodata":
      return (
        <span className={cn(base, "bg-surface-2 text-subtle", className)} role="img" aria-label={STATUS_LABEL.nodata}>
          <MinusIcon className="size-3.5" strokeWidth={2.5} />
        </span>
      );
    case "na":
      return (
        <span className={cn(base, "bg-surface-2 text-subtle", className)} role="img" aria-label={STATUS_LABEL.na}>
          <CircleSlashIcon className="size-3" strokeWidth={2.25} />
        </span>
      );
  }
}

/** Ein Segment je Kriterium – erfüllt, verfehlt, ohne Daten. */
export function CriteriaMeter({ results, className }: { results: CriterionResult[]; className?: string }) {
  const passed = results.filter((r) => r.status === "pass").length;
  const evaluable = results.filter((r) => r.status === "pass" || r.status === "fail").length;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <span className="tnum font-medium text-foreground">
          {passed} von {evaluable} Kriterien erfüllt
        </span>
        {results.length > evaluable && <span className="tnum text-subtle">{results.length - evaluable} ohne Bewertung</span>}
      </div>
      <div className="flex h-1.5 gap-0.5" aria-hidden>
        {results.map((r) => (
          <span
            key={r.id}
            className={cn(
              "flex-1 rounded-full",
              r.status === "pass" && "bg-up",
              r.status === "fail" && (r.required ? "bg-down" : "bg-warn"),
              (r.status === "nodata" || r.status === "na") && "bg-surface-3",
            )}
          />
        ))}
      </div>
    </div>
  );
}

/** Verteilung der Analystenurteile – mit Zahlen, damit nichts nur über Farbe lesbar ist. */
export function ConsensusBar({ analysts, compact = false }: { analysts: ResearchCompany["analysts"]; compact?: boolean }) {
  const buy = analysts.strongBuy + analysts.buy;
  const hold = analysts.hold;
  const sell = analysts.sell + analysts.strongSell;
  const total = buy + hold + sell;
  if (total === 0) return <p className="text-[13px] text-subtle">Keine Analystenurteile – keine Daten.</p>;
  const parts = [
    { label: "Kaufen", value: buy, className: "bg-up" },
    { label: "Halten", value: hold, className: "bg-border-strong" },
    { label: "Verkaufen", value: sell, className: "bg-down" },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex h-2 gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}
      >
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <span
              key={p.label}
              className={cn("h-full first:rounded-l-full last:rounded-r-full", p.className)}
              style={{ flexGrow: p.value }}
            />
          ))}
      </div>
      <div className={cn("flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted", compact && "gap-x-3")}>
        {parts.map((p) => (
          <span key={p.label} className="tnum inline-flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", p.className)} aria-hidden />
            {p.label} <span className="font-medium text-foreground">{p.value}</span>
            {!compact && (
              <span className="text-subtle">({formatPercent(d(p.value).div(total).toString(), { signed: false, digits: 0 })})</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Spanne der Analysten-Kursziele mit Konsens und aktuellem Kurs. */
export function TargetRange({
  analysts,
  price,
  currency,
  priceLabel,
}: {
  analysts: ResearchCompany["analysts"];
  price: string;
  currency: string;
  priceLabel: string;
}) {
  const low = Math.min(analysts.targetLow, Number(price));
  const high = Math.max(analysts.targetHigh, Number(price));
  const span = high - low || 1;
  const pos = (v: number) => `${((v - low) / span) * 100}%`;
  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative h-8"
        role="img"
        aria-label={`Kursziele von ${formatPrice(analysts.targetLow, currency)} bis ${formatPrice(analysts.targetHigh, currency)}, Durchschnitt ${formatPrice(analysts.targetConsensus, currency)}, ${priceLabel} ${formatPrice(price, currency)}`}
      >
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-3"
          style={{ left: pos(analysts.targetLow), right: `calc(100% - ${pos(analysts.targetHigh)})` }}
        />
        <div
          className="absolute top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
          style={{ left: pos(Number(price)) }}
        />
        <div
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface"
          style={{ left: pos(analysts.targetConsensus) }}
        />
      </div>
      <div className="tnum flex justify-between text-[12px] text-subtle">
        <span>Tief {formatPrice(analysts.targetLow, currency)}</span>
        <span>Hoch {formatPrice(analysts.targetHigh, currency)}</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
        <span className="tnum inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-accent" aria-hidden /> Ø Kursziel{" "}
          <span className="font-medium text-foreground">{formatPrice(analysts.targetConsensus, currency)}</span>
        </span>
        <span className="tnum inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 rounded-full bg-foreground" aria-hidden /> {priceLabel}{" "}
          <span className="font-medium text-foreground">{formatPrice(price, currency)}</span>
        </span>
      </div>
    </div>
  );
}

export function SourceLinks({ sources, className }: { sources: ResearchCompany["sources"]; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-1.5 text-[13px]", className)}>
      {sources.map((s) => (
        <li key={s.url} className="flex flex-wrap items-baseline gap-x-2">
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-4 hover:underline">
            {s.label}
          </a>
          <span className="tnum text-[12px] text-subtle">abgerufen {formatDate(s.retrieved)}</span>
        </li>
      ))}
    </ul>
  );
}
