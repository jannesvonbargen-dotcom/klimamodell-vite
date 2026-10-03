"use client";

import { AlertTriangleIcon, RotateCcwIcon } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";

/** Fehlerseite für unerwartete Fehler einer Seite – Navigation bleibt nutzbar. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    // Nur lokal in der Konsole – es wird nichts an Dritte gesendet
    console.error(error);
  }, [error]);
  return (
    <Card className="mx-auto flex max-w-lg flex-col items-center gap-4 px-6 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-down-soft text-down">
        <AlertTriangleIcon className="size-5" aria-hidden />
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[18px] font-semibold">Diese Seite konnte nicht geladen werden</h1>
        <p className="text-[14px] text-muted">
          {error.message || "Unbekannter Fehler."} Deine Daten sind davon nicht betroffen – sie liegen unverändert in der lokalen Datenbank.
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => retry()}>
          <RotateCcwIcon /> Erneut versuchen
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/">Zur Übersicht</Link>
        </Button>
      </div>
    </Card>
  );
}
