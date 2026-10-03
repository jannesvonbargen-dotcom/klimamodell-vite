import { BellRingIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/overview/parts";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/misc";
import { AddWatchButton, NotificationToggle, WatchlistTable, type WatchlistRowView } from "@/components/watchlist/watchlist-ui";
import { formatDateTimeBerlin, formatPrice } from "@/lib/format";
import { hasResearch, holdings } from "@/server/research";
import { getWatchlist } from "@/server/watchlist";

export const metadata: Metadata = { title: "Watchlist" };

export default async function WatchlistPage() {
  const { entries, errors, isDemo, lastFetchedAt } = await getWatchlist();
  const held = holdings();
  const rows: WatchlistRowView[] = entries.map((e) => ({
    ...e,
    researchSymbol: hasResearch(e.symbol) ? e.symbol : null,
    heldIsin: e.isin && held.has(e.isin) ? e.isin : null,
  }));
  const triggered = rows.filter((r) => r.alert);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Watchlist"
        description="Werte, die du im Blick behalten willst – mit Kursalarm, wenn eine Schwelle über- oder unterschritten wird."
        actions={
          rows.length > 0 ? (
            <>
              <NotificationToggle />
              <AddWatchButton />
            </>
          ) : undefined
        }
      />
      {triggered.map((r) => (
        <div key={r.id} role="status" className="flex items-center gap-2.5 rounded-xl bg-warn-soft px-4 py-3 text-[13px]">
          <BellRingIcon className="size-4 shrink-0 text-warn" aria-hidden />
          <span>
            <strong className="font-semibold">{r.name}</strong> notiert {r.alert === "above" ? "über" : "unter"} deiner Schwelle von{" "}
            {formatPrice((r.alert === "above" ? r.alertAbove : r.alertBelow)!, r.currency)} – aktuell{" "}
            {formatPrice(r.quote!.price, r.currency)}.
          </span>
        </div>
      ))}
      {errors.length > 0 && <Notice>Kursanbieter nicht erreichbar – angezeigt werden die zuletzt bekannten Kurse.</Notice>}
      {rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 px-6 py-16 text-center">
          <svg viewBox="0 0 120 48" className="h-12 w-28 text-subtle" aria-hidden>
            <circle cx="60" cy="24" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" />
            <path
              d="M8 24 C 30 2, 90 2, 112 24 C 90 46, 30 46, 8 24 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeDasharray="4 6"
              strokeLinecap="round"
            />
            <circle cx="60" cy="24" r="3.5" fill="var(--accent)" />
          </svg>
          <div className="flex max-w-md flex-col gap-2">
            <h2 className="text-[20px] font-semibold tracking-[-0.01em]">Noch nichts auf der Watchlist</h2>
            <p className="text-[14px] text-muted">
              Füge Aktien oder ETFs hinzu, die du beobachten möchtest – zum Beispiel aus den{" "}
              <Link href="/wachstumswerte" className="text-accent underline-offset-4 hover:underline">
                soliden Wachstumswerten
              </Link>
              .
            </p>
          </div>
          <AddWatchButton />
        </Card>
      ) : (
        <>
          <WatchlistTable entries={rows} />
          <p className="text-[12px] text-subtle">
            {isDemo ? "Demo-Kurse (simuliert)" : "Kurse vom Kursanbieter"}
            {lastFetchedAt ? ` · Stand ${formatDateTimeBerlin(lastFetchedAt)}` : ""} · Alarme werden beim Öffnen der App geprüft, es werden
            keine Benachrichtigungen verschickt.
          </p>
        </>
      )}
    </div>
  );
}
