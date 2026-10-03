"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/format";
import type { TriggeredAlert } from "@/server/watchlist";

/**
 * Prüft bei geöffneter App alle zwei Minuten die Kursalarme und meldet neu
 * ausgelöste Alarme einmalig – als Hinweis in der App und, falls erlaubt,
 * als Systembenachrichtigung. Es verlässt nichts den Rechner.
 */

const SEEN_KEY = "depot.alerts.seen";
const INTERVAL_MS = 120_000;

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function writeSeen(keys: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...keys]));
  } catch {
    // privater Modus o. Ä. – dann eben ohne Gedächtnis
  }
}

export function alertKey(a: Pick<TriggeredAlert, "id" | "state" | "threshold">): string {
  return `${a.id}:${a.state}:${a.threshold}`;
}

export function AlertNotifier({ enabled }: { enabled: boolean }) {
  const router = useRouter();

  React.useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    async function check() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/alerts", { cache: "no-store" });
        const { alerts } = (await res.json()) as { alerts: TriggeredAlert[] };
        if (stopped) return;
        const seen = readSeen();
        const current = new Set(alerts.map(alertKey));
        const fresh = alerts.filter((a) => !seen.has(alertKey(a)));
        for (const a of fresh) {
          const text = `${a.name} ${a.state === "above" ? "über" : "unter"} ${formatPrice(a.threshold, a.currency)} – aktuell ${formatPrice(a.price, a.currency)}`;
          toast(`Kursalarm: ${text}`, { action: { label: "Watchlist", onClick: () => router.push("/watchlist") } });
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Kursalarm", { body: text, tag: alertKey(a) });
          }
        }
        // Nur aktuell ausgelöste merken: fällt ein Alarm zurück und löst erneut aus, wird wieder gemeldet
        writeSeen(current);
        if (fresh.length) router.refresh();
      } catch {
        // offline – beim nächsten Mal
      }
    }
    void check();
    const timer = setInterval(check, INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [enabled, router]);

  return null;
}
