import { ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, BriefcaseIcon, ClockAlertIcon, EqualIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InstrumentAvatar } from "@/components/numbers";
import { Disclaimer } from "@/components/research/disclaimer";
import { FinancialsChart, type FinancialYear, PriceHistoryChart } from "@/components/research/financials-chart";
import { BlocksView } from "@/components/research/markdown-view";
import { ConsensusBar, CriteriaMeter, SourceLinks, STATUS_LABEL, StatusIcon, TargetRange } from "@/components/research/parts";
import { WatchButton } from "@/components/research/watch-button";
import { Badge, Card } from "@/components/ui/misc";
import { formatCompact, formatDate, formatDateTimeBerlin, formatNumber, formatPercent, formatPrice, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";
import { industryLabel, sectorLabel } from "@/research/labels";
import { findSection } from "@/research/markdown";
import type { CriterionResult, RatingAction } from "@/research/types";
import { getResearchDetail, loadCompany } from "@/server/research";

export async function generateMetadata(props: PageProps<"/wachstumswerte/[symbol]">): Promise<Metadata> {
  const { symbol } = await props.params;
  const company = loadCompany(decodeURIComponent(symbol).toUpperCase());
  return { title: company ? `${company.profile.name} – Solide Wachstumswerte` : "Solide Wachstumswerte" };
}

export default async function ResearchDetailPage(props: PageProps<"/wachstumswerte/[symbol]">) {
  const { symbol: raw } = await props.params;
  const detail = await getResearchDetail(decodeURIComponent(raw).toUpperCase());
  if (!detail) notFound();
  const { company: c, metrics: m, verdict: v, thesis } = detail;
  const doc = thesis?.doc;
  const financial = detail.criteria.some((r) => r.status === "na");
  const sections = doc
    ? {
        profile: findSection(doc, "kurzprofil"),
        thesis: findSection(doc, "investment-these"),
        risks: findSection(doc, "risiken"),
        note: findSection(doc, "hinweis"),
        falsify: findSection(doc, "was müsste"),
      }
    : null;
  const priceLabel = m.priceSource === "live" ? "Aktueller Kurs" : `Kurs am ${formatDate(m.priceAsOf)}`;

  const years: FinancialYear[] = [
    ...c.income.fiscalYearEnds.map((end, i) => ({
      label: `GJ ${end.slice(0, 4)}`,
      fiscalYearEnd: end,
      revenue: c.income.revenue[i],
      netIncome: c.income.netIncome[i],
      estimate: false,
    })),
    ...c.estimates.map((e) => ({
      label: `${e.fiscalYearEnd.slice(0, 4)}e`,
      fiscalYearEnd: e.fiscalYearEnd,
      revenue: e.revenueAvg,
      netIncome: null,
      estimate: true,
      analysts: e.analystsRevenue,
    })),
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5">
        <Link href="/wachstumswerte" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Solide Wachstumswerte
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <InstrumentAvatar name={c.profile.name} symbol={c.symbol} size={48} />
            <div className="min-w-0">
              <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.02em]">{c.profile.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-subtle">
                <span>{c.symbol}</span>
                <span>· {c.isin}</span>
                <span>· {c.profile.exchange}</span>
                <span>
                  · {sectorLabel(c.profile.sector)} / {industryLabel(c.profile.industry)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {v.recommended ? <Badge tone="up">Erfüllt die Kriterien</Badge> : <Badge>Nicht aufgenommen</Badge>}
                {detail.held && (
                  <Badge tone="accent">
                    <BriefcaseIcon className="size-3" aria-hidden /> Im Depot · {formatQuantity(detail.held.quantity)} Stk.
                  </Badge>
                )}
                {detail.stale && (
                  <Badge tone="warn">
                    <ClockAlertIcon className="size-3" aria-hidden /> Daten älter als {detail.config.staleAfterDays} Tage
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {detail.held && (
              <Link
                href={`/position/${encodeURIComponent(detail.held.isin)}`}
                className="pressable inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-accent hover:bg-surface-2"
              >
                Position ansehen <ArrowRightIcon className="size-4" aria-hidden />
              </Link>
            )}
            <WatchButton
              symbol={c.symbol}
              name={c.profile.name}
              isin={c.isin}
              currency={c.profile.currency}
              watched={detail.watched}
              size="md"
            />
          </div>
        </div>
      </div>

      <Disclaimer />

      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-8">
        <CriteriaMeter results={detail.criteria} className="sm:w-72 sm:shrink-0" />
        <p className="text-[14px] text-muted">
          {v.recommended ? (
            <>
              Erfüllt alle Pflichtkriterien
              {v.failedOptional.length > 0 ? (
                <>
                  {" "}
                  und verfehlt nur{" "}
                  {v.failedOptional.length === 1 ? "ein optionales Kriterium" : `${v.failedOptional.length} optionale Kriterien`}:{" "}
                  {v.failedOptional.map((r) => `${r.label} (${r.value ?? "—"}, Ziel ${r.threshold})`).join(", ")}.
                </>
              ) : (
                " und alle bewertbaren optionalen Kriterien."
              )}
            </>
          ) : (
            <>
              Nicht aufgenommen, weil{" "}
              {[...v.failedRequired, ...v.failedOptional].map((r, i, all) => (
                <span key={r.id}>
                  <span className="text-foreground">
                    {r.label} {r.value ?? "—"}
                  </span>{" "}
                  (Ziel {r.threshold}
                  {r.required ? ", Pflicht" : ""}){i < all.length - 1 ? ", " : ""}
                </span>
              ))}
              {v.failedRequired.length === 0 && ` – mehr als ${detail.config.maxFailedOptional} optionale Kriterien verfehlt`}.
            </>
          )}
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {sections ? (
            <Card className="flex flex-col divide-y divide-border">
              {sections.profile && <ThesisBlock title="Kurzprofil" blocks={sections.profile.blocks} />}
              {sections.thesis && <ThesisBlock title="Investment-These" blocks={sections.thesis.blocks} />}
              {sections.risks && <ThesisBlock title="Risiken" blocks={sections.risks.blocks} />}
              {sections.note && <ThesisBlock title={sections.note.title} blocks={sections.note.blocks} />}
              {sections.falsify && (
                <ThesisBlock title="Was müsste passieren, damit die These falsch ist?" blocks={sections.falsify.blocks} />
              )}
              <p className="px-5 py-3 text-[12px] text-subtle">
                Text: {thesis?.meta.author ?? "redaktionell"} · Stand {formatDate(thesis?.meta.updated ?? c.asOf)} · editierbar in{" "}
                <code className="rounded bg-surface-2 px-1 py-0.5">content/theses/{c.symbol}.md</code>
              </p>
            </Card>
          ) : (
            <Card className="flex flex-col gap-2 p-5 text-[14px]">
              <h2 className="text-[15px] font-semibold">Noch kein redaktioneller Text</h2>
              <p className="text-muted">
                Für {c.profile.name} gibt es noch keine These – Kennzahlen, Expertenurteile und Kriterien unten stammen direkt aus den
                Anbieterdaten.
              </p>
              <p className="text-[13px] text-subtle">
                Entwurf erstellen mit <code className="rounded bg-surface-2 px-1 py-0.5">npm run research:texts -- {c.symbol}</code>, prüfen
                und als <code className="rounded bg-surface-2 px-1 py-0.5">content/theses/{c.symbol}.md</code> speichern.
              </p>
            </Card>
          )}

          <Card className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-semibold">Umsatz & Gewinn je Geschäftsjahr</h2>
              <span className="text-[12px] text-subtle">
                {c.provider} · Stand {formatDate(c.asOf)}
              </span>
            </div>
            <FinancialsChart years={years} currency={c.income.currency} />
          </Card>

          <Card className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-semibold">Kursverlauf 12 Monate</h2>
              {detail.live && <span className="text-[12px] text-subtle">{detail.providerLabel}</span>}
            </div>
            {detail.live && detail.history.length > 1 ? (
              <PriceHistoryChart points={detail.history} currency={c.profile.currency} />
            ) : (
              <p className="rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-[13px] text-subtle">
                {detail.live
                  ? "Keine Kurshistorie vom Kursanbieter – keine Daten."
                  : "Im Demo-Modus werden hier keine simulierten Kurse gezeigt. Mit einem echten Kursanbieter (siehe README) erscheinen Verlauf, Volatilität und maximaler Rückgang."}
              </p>
            )}
          </Card>

          <Card className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-semibold">Änderungen der Analystenurteile (12 Monate)</h2>
              <span className="tnum text-[12px] text-subtle">
                {c.ratingCounts12m.upgrades} hochgestuft · {c.ratingCounts12m.downgrades} herabgestuft · {c.ratingCounts12m.total} Urteile
              </span>
            </div>
            {c.ratingChanges12m.length > 0 ? (
              <RatingTable rows={c.ratingChanges12m} />
            ) : (
              <p className="text-[13px] text-subtle">Keine Hoch- oder Herabstufungen in den letzten 12 Monaten.</p>
            )}
            {c.latestRatings.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer text-[13px] font-medium text-accent select-none">Neueste Urteile anzeigen</summary>
                <div className="mt-3">
                  <RatingTable rows={c.latestRatings} />
                </div>
              </details>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-[15px] font-semibold">Experten</h2>
              <span className="text-[12px] text-subtle">
                {m.analystsTotal} Analysten · Konsens „{c.analysts.consensus}“ · Stand {formatDate(c.asOf)}
              </span>
            </div>
            <ConsensusBar analysts={c.analysts} />
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-medium">Kursziele</span>
                {m.targetUpside && (
                  <span className="tnum text-[13px] text-muted">
                    Abstand <span className="font-medium text-foreground">{formatPercent(m.targetUpside, { digits: 1 })}</span>
                  </span>
                )}
              </div>
              <TargetRange analysts={c.analysts} price={m.price} currency={c.profile.currency} priceLabel={priceLabel} />
            </div>
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-[15px] font-semibold">Kennzahlen</h2>
              <span className="text-[12px] text-subtle">
                {c.provider} · Stand {formatDate(c.asOf)}
                {m.priceSource === "live" ? ` · Kurs ${formatDateTimeBerlin(m.priceAsOf)}` : ""}
              </span>
            </div>
            <dl className="flex flex-col text-[14px]">
              <KV label={priceLabel} value={formatPrice(m.price, c.profile.currency)} />
              <KV label="Marktkapitalisierung" value={formatCompact(c.profile.marketCap, c.profile.currency)} hint="Momentaufnahme" />
              <KV label="KGV (letzte 12 Monate)" value={m.peTTM ? formatNumber(m.peTTM, 1) : null} hint="Kurs ÷ Gewinn je Aktie" />
              <KV
                label="KGV (nächstes GJ)"
                value={m.forwardPE ? formatNumber(m.forwardPE, 1) : null}
                hint="Kurs ÷ geschätzter Gewinn je Aktie"
              />
              <KV label="PEG" value={m.peg ? formatNumber(m.peg, 2) : null} hint="KGV ÷ Gewinnwachstum" />
              <KV
                separated
                label={`Umsatz p. a. (${m.cagrYears} J.)`}
                value={m.revenueCagr ? formatPercent(m.revenueCagr, { digits: 1 }) : null}
              />
              <KV label={`Gewinn je Aktie p. a. (${m.cagrYears} J.)`} value={m.epsCagr ? formatPercent(m.epsCagr, { digits: 1 }) : null} />
              <KV
                label="Erwartetes Umsatzwachstum"
                value={m.expectedRevenueGrowth ? formatPercent(m.expectedRevenueGrowth, { digits: 1 }) : null}
                hint="nächstes GJ"
              />
              <KV
                label="Erwartetes Gewinnwachstum je Aktie"
                value={m.expectedEpsGrowth ? formatPercent(m.expectedEpsGrowth, { digits: 1 }) : null}
                hint="nächstes GJ"
              />
              <KV
                separated
                label="Bruttomarge"
                value={financial ? "nicht aussagekräftig" : formatPercent(String(c.ratios.grossMargin), { signed: false, digits: 1 })}
              />
              <KV label="Operative Marge" value={formatPercent(String(c.ratios.operatingMargin), { signed: false, digits: 1 })} />
              <KV label="Nettomarge" value={formatPercent(String(c.ratios.netMargin), { signed: false, digits: 1 })} />
              <KV label="Eigenkapitalrendite" value={formatPercent(String(c.metrics.roe), { signed: false, digits: 1 })} />
              <KV label="Verschuldungsgrad" value={financial ? "nicht aussagekräftig" : formatNumber(c.ratios.debtToEquity, 2)} />
              <KV
                label="Free Cashflow (letztes GJ)"
                value={financial ? "nicht aussagekräftig" : m.freeCashFlow ? formatCompact(m.freeCashFlow, c.income.currency) : null}
              />
              <KV
                separated
                label="Dividendenrendite"
                value={
                  c.ratios.dividendYield > 0
                    ? formatPercent(String(c.ratios.dividendYield), { signed: false, digits: 2 })
                    : "keine Dividende"
                }
              />
              <KV
                label="Ausschüttungsquote"
                value={c.ratios.payoutRatio > 0 ? formatPercent(String(c.ratios.payoutRatio), { signed: false, digits: 1 }) : null}
              />
              <KV label="Beta" value={formatNumber(c.profile.beta, 2)} />
              <KV
                label="52-Wochen-Spanne"
                value={`${formatPrice(c.profile.range[0], c.profile.currency)} – ${formatPrice(c.profile.range[1], c.profile.currency)}`}
                hint={`Stand ${formatDate(c.asOf)}`}
              />
              {m.volatility && <KV label="Volatilität (12 M.)" value={formatPercent(m.volatility, { signed: false, digits: 1 })} />}
              {m.maxDrawdown && (
                <KV label="Max. Rückgang (12 M.)" value={`−${formatPercent(m.maxDrawdown, { signed: false, digits: 1 })}`} />
              )}
              <KV separated label="Mitarbeitende" value={c.profile.employees ? formatNumber(c.profile.employees, 0) : null} />
              <KV label="CEO" value={c.profile.ceo || null} />
            </dl>
          </Card>
        </div>
      </div>

      <section aria-labelledby="criteria-heading" className="flex flex-col gap-3">
        <h2 id="criteria-heading" className="text-[17px] font-semibold tracking-[-0.01em]">
          Kriterien im Detail
        </h2>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <caption className="sr-only">Prüfung von {c.profile.name} gegen die Kriterien</caption>
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-subtle">
                  <th className="px-5 py-2.5 font-medium">Kriterium</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Wert</th>
                  <th className="px-5 py-2.5 text-right font-medium">Ziel</th>
                </tr>
              </thead>
              <tbody>
                {detail.criteria.map((r) => (
                  <CriterionRow key={r.id} r={r} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section aria-labelledby="sources-heading" className="flex flex-col gap-3">
        <h2 id="sources-heading" className="text-[17px] font-semibold tracking-[-0.01em]">
          Quellen
        </h2>
        <Card className="flex flex-col gap-3 p-5">
          <SourceLinks sources={c.sources} />
          <p className="text-[12px] text-subtle">
            Zahlen stammen aus den gespeicherten Anbieterdaten (
            <code className="rounded bg-surface-2 px-1 py-0.5">content/research/{c.symbol}.json</code>, Stichtag {formatDate(c.asOf)}).
            Abgeleitete Werte (Wachstumsraten, KGV, Abstand zum Kursziel) berechnet die App daraus. Aktualisieren mit{" "}
            <code className="rounded bg-surface-2 px-1 py-0.5">npm run research:refresh</code>.
          </p>
        </Card>
      </section>

      <Disclaimer />
    </div>
  );
}

function ThesisBlock({ title, blocks }: { title: string; blocks: Parameters<typeof BlocksView>[0]["blocks"] }) {
  return (
    <section className="flex flex-col gap-3 p-5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <BlocksView blocks={blocks} />
    </section>
  );
}

function KV({ label, value, hint, separated }: { label: string; value: string | null; hint?: string; separated?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5", separated && "mt-1.5 border-t border-border pt-3")}>
      <dt className="text-muted">
        {label}
        {hint && <span className="sr-only"> ({hint})</span>}
      </dt>
      <dd
        className={cn(
          "tnum text-right font-medium",
          !value && "font-normal text-subtle",
          value === "nicht aussagekräftig" && "font-normal text-subtle",
        )}
        title={hint}
      >
        {value ?? "keine Daten"}
      </dd>
    </div>
  );
}

function CriterionRow({ r }: { r: CriterionResult }) {
  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="px-5 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-foreground">
            {r.label}
            {r.required && <span className="ml-1.5 text-[11px] font-medium tracking-wide text-subtle uppercase">Pflicht</span>}
          </span>
          <span className="text-[12px] text-subtle">{r.explanation}</span>
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="inline-flex items-center gap-2 text-[13px] text-muted">
          <StatusIcon status={r.status} className={r.status === "fail" && !r.required ? "bg-warn-soft text-warn" : undefined} />
          {STATUS_LABEL[r.status]}
        </span>
      </td>
      <td className={cn("tnum px-4 py-3 text-right whitespace-nowrap", r.value ? "font-medium" : "text-subtle")}>
        {r.value ?? "keine Daten"}
      </td>
      <td className="tnum px-5 py-3 text-right whitespace-nowrap text-muted">{r.threshold}</td>
    </tr>
  );
}

const BUYISH = /buy|overweight|outperform|accumulate/i;
const SELLISH = /sell|underweight|underperform|reduce/i;

function gradeTone(grade: string | null): string {
  if (!grade) return "text-subtle";
  if (BUYISH.test(grade)) return "text-up";
  if (SELLISH.test(grade)) return "text-down";
  return "text-muted";
}

const ACTION: Record<string, { label: string; icon: typeof ArrowUpIcon }> = {
  upgrade: { label: "Hochgestuft", icon: ArrowUpIcon },
  downgrade: { label: "Herabgestuft", icon: ArrowDownIcon },
  maintain: { label: "Bestätigt", icon: EqualIcon },
};

function RatingTable({ rows }: { rows: RatingAction[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border text-left text-[12px] text-subtle">
            <th className="py-2 pr-4 font-medium">Datum</th>
            <th className="py-2 pr-4 font-medium">Analysehaus</th>
            <th className="py-2 pr-4 font-medium">Änderung</th>
            <th className="py-2 font-medium">Urteil</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const a = ACTION[r.action] ?? { label: r.action, icon: EqualIcon };
            const Icon = a.icon;
            return (
              <tr key={`${r.date}-${r.firm}-${i}`} className="border-b border-border last:border-0">
                <td className="tnum py-2 pr-4 whitespace-nowrap text-muted">{formatDate(r.date)}</td>
                <td className="py-2 pr-4">{r.firm}</td>
                <td className="py-2 pr-4 whitespace-nowrap">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      r.action === "upgrade" ? "text-up" : r.action === "downgrade" ? "text-down" : "text-muted",
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden /> {a.label}
                  </span>
                </td>
                <td className="py-2 whitespace-nowrap">
                  {r.previous && r.previous !== r.new && (
                    <>
                      <span className={gradeTone(r.previous)}>{r.previous}</span>
                      <span className="mx-1.5 text-subtle" aria-label="zu">
                        →
                      </span>
                    </>
                  )}
                  <span className={cn("font-medium", gradeTone(r.new))}>{r.new ?? "—"}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
