import { deriveMetrics } from "./metrics";
import { parseMarkdown } from "./markdown";
import type { ResearchCompany } from "./types";

/**
 * KI-Entwürfe für die redaktionellen Texte (content/theses/<SYM>.md).
 * Der Entwurf wird nie automatisch übernommen: Er landet als
 * <SYM>.draft.md neben dem Original und muss von Hand geprüft werden.
 * Dazu gibt es eine Prüfung auf Pflichtabschnitte und auf Zahlen, die
 * nicht aus den Anbieterdaten stammen („keine erfundenen Zahlen“).
 */

export const REQUIRED_SECTIONS = [
  "Kurzprofil",
  "Investment-These",
  "Risiken",
  "Was müsste passieren, damit die These falsch ist?",
] as const;

export function buildThesisPrompt(company: ResearchCompany): { system: string; user: string } {
  const m = deriveMetrics(company);
  const system = [
    "Du schreibst kurze, sachliche Unternehmensporträts auf Deutsch für eine private Depot-App.",
    "Regeln:",
    "- Keine Anlageberatung, keine Kauf- oder Verkaufsempfehlung, keine Kursprognosen.",
    "- Verwende ausschließlich Zahlen, die in den gelieferten Daten stehen. Erfinde keine Zahlen, Marktanteile, Ranglisten oder Superlative.",
    "  Wenn du eine Zahl nicht belegen kannst, formuliere qualitativ oder verweise auf „siehe Kennzahlen“.",
    "- Schreibe klar und verständlich für Privatanleger, ohne Fachjargon; kurze Absätze.",
    "- Gib nur Markdown mit genau diesen Überschriften aus:",
    "  ## Kurzprofil",
    "  ## Investment-These (mit den Unterüberschriften ### Wachstumstreiber, ### Wettbewerbsvorteil (Burggraben), ### Marktposition)",
    "  ## Risiken (3–5 Aufzählungspunkte, jeweils mit **fettem Stichwort:** am Anfang)",
    "  ## Was müsste passieren, damit die These falsch ist?",
    "- Kein Frontmatter, keine Einleitung, kein Schlusswort.",
  ].join("\n");
  const user = [
    `Unternehmen: ${company.profile.name} (${company.symbol}), ${company.profile.sector} / ${company.profile.industry}, ${company.profile.country}`,
    `Datenstand: ${company.asOf}, Quelle: ${company.provider}`,
    "",
    "Anbieterdaten (JSON):",
    JSON.stringify(
      {
        profile: company.profile,
        income: company.income,
        cashflow: company.cashflow,
        ratios: company.ratios,
        metrics: company.metrics,
        estimates: company.estimates,
        lastFiscalYearEstimate: company.lastFiscalYearEstimate,
        analysts: company.analysts,
        ratingCounts12m: company.ratingCounts12m,
      },
      null,
      1,
    ),
    "",
    "Daraus berechnet (Bruchzahlen, 0,1 = 10 %):",
    JSON.stringify(
      {
        umsatzwachstumProJahr: m.revenueCagr,
        gewinnwachstumJeAktieProJahr: m.epsCagr,
        jahre: m.cagrYears,
        jahreMitUmsatzwachstum: `${m.growthYears} von ${m.growthYearsOf}`,
        erwartetesUmsatzwachstum: m.expectedRevenueGrowth,
        kgv: m.peTTM,
        kgvErwartet: m.forwardPE,
        anteilKaufempfehlungen: m.buyShare,
        abstandKursziel: m.targetUpside,
      },
      null,
      1,
    ),
  ].join("\n");
  return { system, user };
}

/** Alle Zahlen der Quelldaten – inklusive üblicher Umrechnungen (Prozent, Mrd., Mio.). */
function knownNumbers(company: ResearchCompany): number[] {
  const out: number[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
    else if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)) out.push(Number(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(company);
  walk(deriveMetrics(company));
  const scaled: number[] = [];
  for (const n of out) scaled.push(n, n * 100, n / 1e9, n / 1e12, n / 1e6, n / 1e3);
  return scaled.map(Math.abs);
}

/** Zahl aus deutschem Text („12,5“, „1.234“, „3,8“) → number. */
function parseGermanNumber(raw: string): number {
  return Number(raw.replace(/\./g, "").replace(",", "."));
}

export interface DraftCheck {
  missingSections: string[];
  /** Zahlen im Text, die sich keiner Quelldatenzahl zuordnen lassen. */
  unknownNumbers: string[];
}

export function validateThesisDraft(markdown: string, company: ResearchCompany): DraftCheck {
  const doc = parseMarkdown(markdown);
  const titles = doc.sections.map((s) => s.title.toLowerCase());
  const missingSections = REQUIRED_SECTIONS.filter((t) => !titles.some((x) => x.startsWith(t.toLowerCase().slice(0, 12))));
  const known = knownNumbers(company);
  const unknownNumbers: string[] = [];
  for (const match of markdown.matchAll(/(?<![\w-])(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?(?![\w-])/g)) {
    const text = match[0];
    const value = parseGermanNumber(text);
    // Jahreszahlen und kleine Zählwörter („3 Säulen“, „5 Jahre“) sind keine Kennzahlen
    if (!Number.isFinite(value) || (value >= 1990 && value <= 2100 && !text.includes(",")) || (value <= 12 && !text.includes(",")))
      continue;
    const decimals = match[2]?.length ?? 0;
    const tolerance = Math.max(0.5 * 10 ** -decimals, value * 0.005);
    if (!known.some((k) => Math.abs(k - value) <= tolerance)) unknownNumbers.push(text);
  }
  return { missingSections: [...missingSections], unknownNumbers: [...new Set(unknownNumbers)] };
}
