"use client";

import { AlertTriangleIcon, RefreshCwIcon, RepeatIcon, UploadIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { formatDateTimeBerlin, formatMoney, formatPercent, formatTimeBerlin } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AnimatedText, Delta } from "../numbers";
import { useTransactionDialog } from "../transaction-dialog";
import { Button } from "../ui/button";
import { Card } from "../ui/misc";

export function StatTile({
  label,
  value,
  share,
  sub,
  className,
}: {
  label: string;
  value: string;
  share?: string | null;
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col gap-1.5 p-5", className)}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted">{label}</span>
        {share !== undefined && <span className="tnum text-[12px] text-subtle">{formatPercent(share, { signed: false, digits: 1 })}</span>}
      </div>
      <div className="text-[24px] font-semibold tracking-[-0.02em]">
        <AnimatedText value={formatMoney(value)} />
      </div>
      {share !== undefined && share !== null && (
        <div className="h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.min(100, Math.max(0, Number(share) * 100))}%` }} />
        </div>
      )}
      {sub && <div className="text-[12px] text-subtle">{sub}</div>}
    </Card>
  );
}

export function Kpi({
  label,
  value,
  percent,
  hint,
  neutral,
}: {
  label: string;
  value: string;
  percent?: string | null;
  hint?: string;
  neutral?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-4 py-4 sm:px-5">
      <span className="text-[12px] font-medium text-subtle">{label}</span>
      {neutral ? (
        <span className="tnum text-[16px] font-semibold">{formatMoney(value)}</span>
      ) : (
        <Delta value={value} percent={percent} className="flex-wrap gap-y-0 text-[15px]" />
      )}
      {hint && <span className="text-[11px] text-subtle">{hint}</span>}
    </div>
  );
}

/** Aktualisiert die Seite regelmäßig, solange eine Börse offen und der Tab sichtbar ist. */
export function AutoRefresh({ anyMarketOpen, intervalMs = 60_000 }: { anyMarketOpen: boolean; intervalMs?: number }) {
  const router = useRouter();
  React.useEffect(() => {
    if (!anyMarketOpen) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible" && !document.querySelector("[role=dialog]")) router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [anyMarketOpen, intervalMs, router]);
  return null;
}

export function QuoteStatus({
  lastQuoteAt,
  providerLabel,
  isDemo,
  errors,
  staleQuotes,
  missingQuotes,
}: {
  lastQuoteAt: string | null;
  providerLabel: string;
  isDemo: boolean;
  errors: string[];
  staleQuotes: number;
  missingQuotes: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const failing = errors.length > 0 || staleQuotes > 0;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-subtle">
      <span className="inline-flex items-center gap-1.5">
        <span className={cn("size-1.5 rounded-full", failing ? "bg-warn" : "bg-up")} aria-hidden />
        {lastQuoteAt ? <>Kurse von {formatTimeBerlin(lastQuoteAt)} Uhr</> : "Noch keine Kurse"}
        <span aria-hidden>·</span>
        {isDemo ? <span className="text-warn">Demo-Kurse (simuliert)</span> : providerLabel}
      </span>
      {failing && (
        <span className="inline-flex items-center gap-1 text-warn" role="status">
          <AlertTriangleIcon className="size-3.5" />
          {lastQuoteAt
            ? `Kursanbieter nicht erreichbar – letzte bekannte Kurse (${formatDateTimeBerlin(lastQuoteAt)})`
            : "Kursanbieter nicht erreichbar – bewertet mit den letzten Transaktionskursen"}
          {missingQuotes > 0 && lastQuoteAt ? ` · ${missingQuotes} ohne Kurs` : ""}
        </span>
      )}
      {missingQuotes > 0 && !failing && <span className="text-warn">{missingQuotes} ohne aktuellen Kurs</span>}
      <button
        type="button"
        onClick={() => startTransition(() => router.refresh())}
        className="pressable inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-surface-2 hover:text-foreground"
        aria-label="Kurse aktualisieren"
      >
        <RefreshCwIcon className={cn("size-3.5", pending && "animate-spin")} />
        Aktualisieren
      </button>
    </div>
  );
}

export function Notice({
  tone = "warn",
  children,
  action,
}: {
  tone?: "warn" | "info";
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-[13px]",
        tone === "warn" ? "bg-warn-soft text-foreground" : "border border-border bg-surface text-foreground",
      )}
    >
      <div className="flex items-center gap-2.5">
        {tone === "warn" ? (
          <AlertTriangleIcon className="size-4 shrink-0 text-warn" />
        ) : (
          <RepeatIcon className="size-4 shrink-0 text-accent" />
        )}
        <span>{children}</span>
      </div>
      {action}
    </div>
  );
}

export function EmptyPortfolio() {
  const { openCreate } = useTransactionDialog();
  return (
    <Card className="flex flex-col items-center gap-5 px-6 py-16 text-center">
      <svg viewBox="0 0 120 64" className="h-16 w-28 text-subtle" aria-hidden>
        <path
          d="M4 52 L28 40 L46 46 L70 24 L90 30 L116 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="4 6"
        />
        <circle cx="116" cy="8" r="4" fill="var(--up)" />
      </svg>
      <div className="flex max-w-md flex-col gap-2">
        <h2 className="text-[20px] font-semibold tracking-[-0.01em]">Noch keine Positionen</h2>
        <p className="text-[14px] text-muted">
          Erfasse deine erste Transaktion oder importiere den Transaktionsexport aus der Trade-Republic-App. Alle Daten bleiben auf diesem
          Rechner.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" size="lg" onClick={() => openCreate()}>
          Erste Transaktion erfassen
        </Button>
        <Button variant="outline" size="lg" asChild>
          <Link href="/import">
            <UploadIcon />
            CSV importieren
          </Link>
        </Button>
      </div>
      <p className="text-[12px] text-subtle">
        Tipp: Drücke <kbd className="rounded border border-border-strong px-1">N</kbd> für eine neue Transaktion oder{" "}
        <kbd className="rounded border border-border-strong px-1">⌘K</kbd> für alle Befehle.
      </p>
    </Card>
  );
}
