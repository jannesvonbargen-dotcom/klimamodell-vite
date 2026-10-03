import { ArrowRightIcon, BriefcaseIcon, ClockAlertIcon, FileCogIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { InstrumentAvatar } from "@/components/numbers";
import { Notice } from "@/components/overview/parts";
import { PageHeader } from "@/components/page-header";
import { Disclaimer } from "@/components/research/disclaimer";
import { InlineView } from "@/components/research/markdown-view";
import { ConsensusBar, CriteriaMeter } from "@/components/research/parts";
import { WatchButton } from "@/components/research/watch-button";
import { Badge, Card } from "@/components/ui/misc";
import { formatDate, formatNumber, formatPercent, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { industryLabel } from "@/research/labels";
import { thesisSummary } from "@/research/markdown";
import type { CriteriaConfig, CriterionResult } from "@/research/types";
import { getResearchOverview, ResearchConfigError, type ResearchEntry } from "@/server/research";

export const metadata: Metadata = { title: "Solide Wachstumswerte" };

export default async function GrowthPage() {
  let data: Awaited<ReturnType<typeof getResearchOverview>>;
  try {
    data = await getResearchOverview();
  } catch (error) {
    if (!(error instanceof ResearchConfigError)) throw error;
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Solide Wachstumswerte" />
        <Notice>{error.message}</Notice>
        <Disclaimer />
      </div>
    );
  }
  const { recommended, others, config } = data;
  const all = [...recommended, ...others];
  const asOfDates = [...new Set(all.map((e) => e.company.asOf))].sort();
  const criteriaTemplate = (all.find((e) => !e.criteria.some((c) => c.status === "na")) ?? all[0])?.criteria ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Solide Wachstumswerte"
          description="Große, profitable Unternehmen mit stetigem Wachstum und vergleichsweise geringer Schwankung – geprüft nach transparenten, anpassbaren Kriterien. Jede Zahl mit Quelle und Stand."
        />
        <Disclaimer />
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-subtle">
          <span>
            Datenstand {asOfDates.map(formatDate).join(", ") || "—"} · {all[0]?.company.provider ?? "—"}
          </span>
          <span aria-hidden>·</span>
          <span>
            {!data.live
              ? "Kurse: Momentaufnahme zum Datenstand (Demo-Modus ohne Live-Kurse)"
              : data.liveCount === all.length
                ? `Kurse live von ${data.providerLabel}`
                : data.liveCount > 0
                  ? `Kurse live von ${data.providerLabel} für ${data.liveCount} von ${all.length} Werten, sonst Momentaufnahme`
                  : "Kurse: Momentaufnahme zum Datenstand (keine Live-Kurse erhalten)"}
          </span>
        </p>
        {data.errors.map((e) => (
          <Notice key={e}>{e}</Notice>
        ))}
        {data.providerIssue && (
          <Notice>
            <span title={data.providerIssue.detail}>{data.providerIssue.message}</span>
          </Notice>
        )}
      </div>

      <section aria-labelledby="rec-heading" className="flex flex-col gap-4">
        <h2 id="rec-heading" className="text-[17px] font-semibold tracking-[-0.01em]">
          Erfüllen deine Kriterien <span className="tnum ml-1 text-[14px] font-normal text-subtle">{recommended.length}</span>
        </h2>
        {recommended.length === 0 ? (
          <Card className="px-6 py-10 text-center text-[14px] text-muted">
            Kein Kandidat erfüllt die aktuellen Kriterien. Passe die Schwellen in{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[13px]">config/growth-criteria.json</code> an.
          </Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {recommended.map((e) => (
              <RecommendationCard key={e.symbol} entry={e} />
            ))}
          </div>
        )}
      </section>

      {others.length > 0 && (
        <section aria-labelledby="other-heading" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="other-heading" className="text-[17px] font-semibold tracking-[-0.01em]">
              Geprüft, aber nicht aufgenommen <span className="tnum ml-1 text-[14px] font-normal text-subtle">{others.length}</span>
            </h2>
            <p className="text-[13px] text-muted">
              Gute Unternehmen können hier landen – sie verfehlen nur einzelne Kriterien, meist bei der Schwankung.
            </p>
          </div>
          <Card className="divide-y divide-border">
            {others.map((e) => (
              <RejectedRow key={e.symbol} entry={e} />
            ))}
          </Card>
        </section>
      )}

      <section aria-labelledby="criteria-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="criteria-heading" className="text-[17px] font-semibold tracking-[-0.01em]">
            So wird ausgewählt
          </h2>
          <p className="text-[13px] text-muted">
            Pflichtkriterien müssen alle erfüllt sein, von den übrigen darf höchstens {config.maxFailedOptional} verfehlt werden. Fehlen
            Daten, zählt das Kriterium weder dafür noch dagegen. Daten älter als {config.staleAfterDays} Tage werden markiert.
          </p>
        </div>
        <Card className="overflow-hidden">
          <CriteriaList criteria={criteriaTemplate} config={config} />
          <div className="flex items-start gap-2.5 border-t border-border bg-surface-2/50 px-5 py-3 text-[13px] text-muted">
            <FileCogIcon className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
            <p>
              Schwellen, Pflicht/optional und Kandidaten änderst du in{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[12px]">config/growth-criteria.json</code>, die Texte in{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[12px]">content/theses/</code>. Alle Felder sind in{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[12px]">config/README.md</code> erklärt.
            </p>
          </div>
        </Card>
      </section>
    </div>
  );
}

function RecommendationCard({ entry: e }: { entry: ResearchEntry }) {
  const { company: c, metrics: m } = e;
  const summary = e.thesis ? thesisSummary(e.thesis.doc) : { reasoning: null, risks: [] };
  const href = `/wachstumswerte/${encodeURIComponent(e.symbol)}`;
  return (
    <Card className="flex flex-col">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <InstrumentAvatar name={c.profile.name} symbol={c.symbol} size={40} />
            <div className="min-w-0">
              <h3 className="truncate text-[16px] font-semibold tracking-[-0.01em]">
                <Link href={href} className="rounded-sm hover:underline hover:underline-offset-4">
                  {c.profile.name}
                </Link>
              </h3>
              <p className="truncate text-[12px] text-subtle">
                {c.symbol} · {industryLabel(c.profile.industry)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {e.held && (
              <Badge tone="accent">
                <BriefcaseIcon className="size-3" aria-hidden /> Im Depot
              </Badge>
            )}
            {e.stale && (
              <Badge tone="warn">
                <ClockAlertIcon className="size-3" aria-hidden /> Daten veraltet
              </Badge>
            )}
          </div>
        </div>

        {summary.reasoning && (
          <div className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-subtle">Warum solide</span>
            <p className="line-clamp-3 text-[14px] leading-relaxed text-muted">
              <InlineView nodes={summary.reasoning} />
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <MiniStat label="Umsatz" value={m.revenueCagr ? formatPercent(m.revenueCagr, { digits: 1 }) : null} />
            <MiniStat label="Gewinn/Aktie" value={m.epsCagr ? formatPercent(m.epsCagr, { digits: 1 }) : null} />
            <MiniStat label="KGV" value={m.peTTM ? formatNumber(m.peTTM, 1) : null} />
            <MiniStat label="Beta" value={formatNumber(c.profile.beta, 2)} />
          </dl>
          <p className="text-[11px] text-subtle">Umsatz und Gewinn/Aktie: Ø Wachstum pro Jahr über {m.cagrYears} Geschäftsjahre</p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2 text-[12px]">
            <span className="font-medium text-subtle">{m.analystsTotal} Analysten</span>
            <span className="tnum text-muted">
              Ø Kursziel {formatPrice(c.analysts.targetConsensus, c.profile.currency)}
              {m.targetUpside && <span className="text-foreground"> ({formatPercent(m.targetUpside, { digits: 1 })})</span>}
            </span>
          </div>
          <ConsensusBar analysts={c.analysts} compact />
        </div>

        {summary.risks.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-subtle">Risiken</span>
            <p className="text-[13px] text-muted">{summary.risks.join(" · ")}</p>
          </div>
        )}

        <CriteriaMeter results={e.criteria} />
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
        <span className="text-[12px] text-subtle">
          Quellen: {c.sources.length} · Stand {formatDate(c.asOf)}
        </span>
        <div className="flex items-center gap-2">
          <WatchButton symbol={c.symbol} name={c.profile.name} isin={c.isin} currency={c.profile.currency} watched={e.watched} />
          <Link
            href={href}
            className="pressable inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-accent hover:bg-surface-2"
          >
            Begründung <ArrowRightIcon className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[12px] text-subtle">{label}</dt>
      <dd className={cn("tnum text-[15px] font-semibold", !value && "text-[13px] font-normal text-subtle")}>{value ?? "keine Daten"}</dd>
    </div>
  );
}

function RejectedRow({ entry: e }: { entry: ResearchEntry }) {
  const misses = [...e.verdict.failedRequired, ...e.verdict.failedOptional];
  return (
    <Link
      href={`/wachstumswerte/${encodeURIComponent(e.symbol)}`}
      className="group flex flex-col gap-3 px-5 py-4 transition-colors duration-150 hover:bg-surface-2/60 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-center gap-3">
        <InstrumentAvatar name={e.company.profile.name} symbol={e.symbol} size={32} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-medium">{e.company.profile.name}</span>
            {e.held && <Badge tone="accent">Im Depot</Badge>}
          </div>
          <span className="text-[12px] text-subtle">
            {e.symbol} · {e.verdict.passed} von {e.verdict.evaluable} Kriterien erfüllt
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
        {misses.map((r) => (
          <span
            key={r.id}
            className={cn(
              "tnum inline-flex h-6 items-center gap-1 rounded-md px-2 text-[12px]",
              r.required ? "bg-down-soft text-down" : "bg-warn-soft text-warn",
            )}
          >
            {r.label}: {r.value ?? "—"} <span className="opacity-70">(Ziel {r.threshold})</span>
          </span>
        ))}
        <ArrowRightIcon
          className="ml-1 hidden size-4 text-subtle transition-transform duration-150 group-hover:translate-x-0.5 sm:block"
          aria-hidden
        />
      </div>
    </Link>
  );
}

const GROUPS: CriterionResult["group"][] = ["Größe & Bilanz", "Schwankung", "Wachstum", "Experten"];

function CriteriaList({ criteria, config }: { criteria: CriterionResult[]; config: CriteriaConfig }) {
  return (
    <div className="grid divide-border md:grid-cols-2 md:divide-x">
      {GROUPS.map((group) => {
        const items = criteria.filter((c) => c.group === group);
        if (!items.length) return null;
        return (
          <div key={group} className="flex flex-col gap-3 border-b border-border p-5 md:[&:nth-last-child(-n+2)]:border-b-0">
            <h3 className="text-[13px] font-semibold text-foreground">{group}</h3>
            <ul className="flex flex-col gap-3">
              {items.map((c) => (
                <li key={c.id} className="flex flex-col gap-0.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-[14px] text-foreground">
                      {c.label}
                      {c.required && <span className="ml-1.5 text-[11px] font-medium tracking-wide text-subtle uppercase">Pflicht</span>}
                    </span>
                    <span className="tnum text-[13px] font-medium text-muted">{c.threshold.replace(/^—$/, "")}</span>
                  </div>
                  <p className="text-[12px] text-subtle">
                    {c.explanation.replace(/ Für die Branche.*$/, "")}
                    {config.criteria[c.id]?.notApplicableIndustries?.length
                      ? ` Nicht bewertet für: ${config.criteria[c.id].notApplicableIndustries!.map(industryLabel).join(", ")}.`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
