import { CheckCircle2Icon, CircleDashedIcon, ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type * as React from "react";
import { PageHeader } from "@/components/page-header";
import {
  ClearCacheButton,
  DemoDataButton,
  ExportButtons,
  RestoreBackup,
  ThemeSetting,
  WipeDataButton,
} from "@/components/settings/settings-ui";
import { Badge, Card } from "@/components/ui/misc";
import { formatDateTime, formatNumber } from "@/lib/format";
import { getSettingsOverview } from "@/server/settings";

export const metadata: Metadata = { title: "Einstellungen" };

function fileSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, 0)} KB`;
  return `${formatNumber(bytes / 1024 / 1024, 1)} MB`;
}

export default function SettingsPage() {
  const s = getSettingsOverview();
  const userTransactions = s.counts.transactions - s.counts.seedTransactions;
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Einstellungen"
        description="Darstellung, Kursdaten, Sicherung und Beispieldaten. Alles bleibt auf diesem Rechner."
      />

      <Section title="Darstellung">
        <Row label="Farbschema" description="Dunkel ist voreingestellt. „Wie System“ folgt der Einstellung deines Betriebssystems.">
          <ThemeSetting />
        </Row>
      </Section>

      <Section title="Kursdaten">
        <Row
          label="Kursanbieter"
          description={
            <>
              Festgelegt in <Code>.env.local</Code> über <Code>MARKET_DATA_PROVIDER</Code> (yahoo, finnhub, fmp, alphavantage oder mock).
              Nach einer Änderung die App neu starten.
            </>
          }
        >
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <span className="text-[14px] font-medium">{s.provider.label}</span>
            {s.provider.isDemo ? <Badge tone="warn">Demo-Modus</Badge> : <Badge tone="up">Echte Kurse</Badge>}
          </div>
        </Row>
        <Row
          label="Ersatzanbieter & Wechselkurse"
          description="Liefert der Hauptanbieter nichts, springt Yahoo ein. Fehlt beides, gilt der letzte bekannte Kurs mit Zeitstempel."
        >
          <div className="flex flex-col items-start gap-0.5 text-[13px] text-muted sm:items-end">
            <span>{s.provider.fallback ?? "kein Ersatzanbieter"}</span>
            <span>{s.provider.fxLabel}</span>
          </div>
        </Row>
        <Row
          label="API-Keys"
          description={<>Nur in .env.local, nie im Browser. Für die Kursdaten optional, für npm run research:refresh wird FMP benötigt.</>}
        >
          <div className="flex flex-col items-start gap-1 text-[13px] sm:items-end">
            <KeyStatus label="Finnhub" ok={s.keys.finnhub} />
            <KeyStatus label="Financial Modeling Prep" ok={s.keys.fmp} />
            <KeyStatus label="Alpha Vantage" ok={s.keys.alphavantage} />
          </div>
        </Row>
        {s.provider.warnings.map((w) => (
          <p key={w} className="rounded-lg bg-warn-soft px-3 py-2 text-[13px]">
            {w}
          </p>
        ))}
        <Row
          label="Zwischenspeicher"
          description={`${formatNumber(s.counts.cache, 0)} Einträge im Kurs-Cache · ${formatNumber(s.counts.snapshots, 0)} gespeicherte Tageskurse. Kurse gelten während der Handelszeit 60 Sekunden.`}
        >
          <ClearCacheButton />
        </Row>
      </Section>

      <Section title="Sicherung">
        <Row
          label="Exportieren"
          description="Die JSON-Sicherung enthält alle Daten und lässt sich hier wiederherstellen. Die CSV-Datei enthält alle Transaktionen und wird beim Import automatisch erkannt."
        >
          <ExportButtons />
        </Row>
        <Row
          label="Wiederherstellen"
          description="Ersetzt alle aktuellen Daten durch eine JSON-Sicherung. Der jetzige Stand wird vorher automatisch gesichert."
        >
          <RestoreBackup />
        </Row>
        <Row
          label="Automatische Sicherungen"
          description={
            <>
              Vor dem Zurücksetzen, Wiederherstellen und Löschen legt die App eine Kopie der Datenbank unter <Code>data/backups/</Code> an.
            </>
          }
        >
          {s.backups.length === 0 ? (
            <span className="text-[13px] text-subtle">Noch keine</span>
          ) : (
            <ul className="flex flex-col items-start gap-0.5 text-[12px] text-muted sm:items-end">
              {s.backups.map((b) => (
                <li key={b.name} className="tnum">
                  {formatDateTime(b.createdAt)} · {fileSize(b.size)}
                </li>
              ))}
            </ul>
          )}
        </Row>
      </Section>

      <Section title="Beispieldaten">
        <Row
          label={s.counts.seedTransactions > 0 ? `${s.counts.seedTransactions} Beispiel-Transaktionen geladen` : "Keine Beispieldaten"}
          description={
            s.counts.seedTransactions > 0
              ? `Das Beispieldepot (seit 2023, inkl. Sparplänen, Dividenden und einem Aktiensplit) lässt sich mit einem Klick entfernen${userTransactions > 0 ? ` – deine eigenen ${userTransactions} Transaktionen bleiben erhalten` : ""}.`
              : "Lädt ein Beispieldepot zum Ausprobieren. Es lässt sich jederzeit wieder entfernen."
          }
        >
          <DemoDataButton hasDemo={s.counts.seedTransactions > 0} hasOther={userTransactions > 0} />
        </Row>
      </Section>

      <Section title="Daten & Datenschutz">
        <div className="flex items-start gap-3 py-1 text-[14px] text-muted">
          <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-up" aria-hidden />
          <p>
            Alle Daten liegen in einer SQLite-Datei auf diesem Rechner. Die App läuft nur unter 127.0.0.1, sendet keine Telemetrie und lädt
            keine externen Schriften. Nach außen gehen nur Kursabfragen an den gewählten Anbieter (Symbole, keine Depotdaten).
          </p>
        </div>
        <Row label="Datenbank" description={s.databasePath}>
          <span className="tnum text-[13px] text-muted">{fileSize(s.databaseSize)}</span>
        </Row>
        <Row label="Inhalt" description="Positionen und Cash werden immer aus den Transaktionen berechnet.">
          <span className="tnum text-right text-[13px] text-muted">
            {s.counts.transactions} Transaktionen · {s.counts.instruments} Wertpapiere · {s.counts.savingsPlans} Sparpläne ·{" "}
            {s.counts.watchlist} beobachtet
          </span>
        </Row>
        <Row
          label="Trade Republic"
          description={
            <>
              Transaktionsexport aus der App als CSV über{" "}
              <Link href="/import" className="text-accent underline-offset-4 hover:underline">
                Import
              </Link>{" "}
              einlesen. Es gibt keine automatische Verbindung zum Konto, Zugangsdaten werden nie gespeichert.
            </>
          }
        />
      </Section>

      <Section title="Gefahrenzone" tone="danger">
        <Row
          label="Alle Daten löschen"
          description="Setzt die App auf einen leeren Stand zurück. Kurs-Cache und Tageskurse bleiben erhalten."
        >
          <WipeDataButton />
        </Row>
      </Section>
    </div>
  );
}

function Section({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "danger" }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className={tone === "danger" ? "text-[15px] font-semibold text-down" : "text-[15px] font-semibold"}>{title}</h2>
      <Card
        className={
          tone === "danger" ? "flex flex-col divide-y divide-border border-down/30 px-5" : "flex flex-col divide-y divide-border px-5"
        }
      >
        {children}
      </Card>
    </section>
  );
}

function Row({ label, description, children }: { label: string; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[14px] font-medium">{label}</span>
        {description && <p className="text-[13px] break-words text-muted">{description}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

function KeyStatus({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {ok ? (
        <CheckCircle2Icon className="size-3.5 text-up" aria-hidden />
      ) : (
        <CircleDashedIcon className="size-3.5 text-subtle" aria-hidden />
      )}
      <span className={ok ? "text-foreground" : "text-subtle"}>
        {label}: {ok ? "hinterlegt" : "nicht hinterlegt"}
      </span>
    </span>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-surface-2 px-1 py-0.5 text-[12px]">{children}</code>;
}
