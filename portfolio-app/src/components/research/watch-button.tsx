"use client";

import { CheckIcon, EyeIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { addToWatchlistAction, removeSymbolFromWatchlistAction } from "@/app/actions";
import { Button } from "../ui/button";

/** „Zur Watchlist“ – optimistisch umgeschaltet, mit Rückgängig im Toast. */
export function WatchButton({
  symbol,
  name,
  isin,
  currency,
  watched,
  size = "sm",
}: {
  symbol: string;
  name: string;
  isin: string | null;
  currency: string;
  watched: boolean;
  size?: "sm" | "md";
}) {
  const [optimistic, setOptimistic] = React.useOptimistic(watched);
  const [, startTransition] = React.useTransition();

  const add = () =>
    startTransition(async () => {
      setOptimistic(true);
      const result = await addToWatchlistAction({ symbol, name, isin, currency });
      if (!result.ok) toast.error("Konnte nicht zur Watchlist hinzugefügt werden.");
      else toast.success(`${name} beobachtest du jetzt`, { action: { label: "Rückgängig", onClick: () => remove(false) } });
    });

  const remove = (notify = true) =>
    startTransition(async () => {
      setOptimistic(false);
      await removeSymbolFromWatchlistAction(symbol);
      if (notify) toast(`${name} von der Watchlist entfernt`, { action: { label: "Rückgängig", onClick: add } });
    });

  return optimistic ? (
    <Button variant="outline" size={size} onClick={() => remove()} aria-pressed="true" aria-label={`${name} von der Watchlist entfernen`}>
      <CheckIcon className="text-up" /> Auf der Watchlist
    </Button>
  ) : (
    <Button variant="secondary" size={size} onClick={add} aria-pressed="false" aria-label={`${name} zur Watchlist hinzufügen`}>
      <EyeIcon /> Zur Watchlist
    </Button>
  );
}
