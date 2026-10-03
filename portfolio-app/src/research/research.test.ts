import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateCriteria, isStale, verdict } from "./criteria";
import { annualizedVolatility, cagr, deriveMetrics, maxDrawdown } from "./metrics";
import type { CriteriaConfig, ResearchCompany } from "./types";

const root = path.resolve(__dirname, "../..");
const load = (symbol: string) =>
  JSON.parse(fs.readFileSync(path.join(root, "content/research", `${symbol}.json`), "utf8")) as ResearchCompany;
const config = JSON.parse(fs.readFileSync(path.join(root, "config/growth-criteria.json"), "utf8")) as CriteriaConfig;

describe("Kennzahlen", () => {
  it("berechnet die durchschnittliche Wachstumsrate", () => {
    expect(cagr(100, 121, 2)!.toDecimalPlaces(6).toString()).toBe("0.1");
    expect(cagr(-1, 5, 2)).toBeNull();
  });

  it("berechnet Volatilität und maximalen Rückgang", () => {
    const flat = Array.from({ length: 100 }, () => "100");
    expect(annualizedVolatility(flat)!.toString()).toBe("0");
    const zigzag = Array.from({ length: 100 }, (_, i) => (i % 2 ? "101" : "100"));
    expect(Number(annualizedVolatility(zigzag))).toBeGreaterThan(0.15);
    expect(maxDrawdown(["100", "120", "90", "130", "117"])!.toString()).toBe("0.25");
    expect(annualizedVolatility(["1", "2"])).toBeNull();
  });

  it("leitet Kennzahlen aus den gespeicherten Anbieterdaten ab", () => {
    const msft = load("MSFT");
    const m = deriveMetrics(msft);
    // Umsatz 198,27 Mrd. (GJ 2022) → 331,839 Mrd. (GJ 2026) über 4 Jahre
    expect(Number(m.revenueCagr)).toBeCloseTo(Math.pow(331839 / 198270, 1 / 4) - 1, 10);
    expect(m.growthYears).toBe(4);
    expect(m.priceSource).toBe("snapshot");
    // Kursziel 563,50 bei Kurs 517,53
    expect(Number(m.targetUpside)).toBeCloseTo(563.5 / 517.53 - 1, 10);
    expect(m.volatility).toBeNull();
  });

  it("nutzt Live-Kurs und Kurshistorie, wenn vorhanden", () => {
    const m = deriveMetrics(load("V"), {
      price: { value: "400", asOf: "2026-10-05T15:00:00Z" },
      history: Array.from({ length: 120 }, (_, i) => ({ key: `d${i}`, close: String(300 + (i % 5)) })),
    });
    expect(m.priceSource).toBe("live");
    expect(Number(m.targetUpside)).toBeCloseTo(422.24 / 400 - 1, 10);
    expect(m.volatility).not.toBeNull();
    expect(m.maxDrawdown).not.toBeNull();
  });
});

describe("Kriterien", () => {
  it("empfiehlt Microsoft nach den Standard-Kriterien", () => {
    const msft = load("MSFT");
    const results = evaluateCriteria(msft, deriveMetrics(msft), config);
    const v = verdict(results, config);
    expect(v.failedRequired).toHaveLength(0);
    expect(v.recommended).toBe(true);
    expect(results.find((r) => r.id === "maxVolatility")?.status).toBe("nodata");
  });

  it("schließt NVIDIA wegen hoher Schwankung (Beta) aus", () => {
    const nvda = load("NVDA");
    const v = verdict(evaluateCriteria(nvda, deriveMetrics(nvda), config), config);
    expect(v.recommended).toBe(false);
    expect(v.failedRequired.map((r) => r.id)).toContain("maxBeta");
  });

  it("wertet Bilanzkriterien bei Banken als nicht anwendbar", () => {
    const jpm = load("JPM");
    const results = evaluateCriteria(jpm, deriveMetrics(jpm), config);
    expect(results.find((r) => r.id === "maxDebtToEquity")?.status).toBe("na");
    expect(results.find((r) => r.id === "positiveFreeCashFlow")?.status).toBe("na");
  });

  it("markiert veraltete Daten", () => {
    expect(isStale("2026-06-01", "2026-10-03", 90)).toBe(true);
    expect(isStale("2026-09-01", "2026-10-03", 90)).toBe(false);
  });

  it("hat für jeden Kandidaten eine Datendatei mit Quellen und Text", () => {
    for (const symbol of config.candidates) {
      const c = load(symbol);
      expect(c.sources.length, symbol).toBeGreaterThan(0);
      expect(c.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(fs.existsSync(path.join(root, "content/theses", `${symbol}.md`)), `${symbol}.md`).toBe(true);
    }
  });
});

describe("FMP-Umwandlung", () => {
  it("baut das Datenformat aus Rohantworten", async () => {
    const { buildResearchCompany } = await import("./fmp-transform");
    const years = ["2022-06-30", "2023-06-30", "2024-06-30", "2025-06-30", "2026-06-30"];
    const c = buildResearchCompany(
      "TEST",
      {
        profile: {
          companyName: "Test Corp",
          isin: "US0000000001",
          price: 100,
          marketCap: 5e11,
          beta: 0.91234,
          range: "80.5-120.25",
          currency: "USD",
          country: "US",
          cik: "0000123",
          website: "https://test.example",
        },
        income: years
          .map((date, i) => ({ date, revenue: 100 + i * 10, netIncome: 10 + i, epsDiluted: 1 + i / 10, reportedCurrency: "USD" }))
          .reverse(),
        cashflow: [
          { date: "2026-06-30", freeCashFlow: 5, operatingCashFlow: 8 },
          { date: "2025-06-30", freeCashFlow: 4, operatingCashFlow: 7 },
        ],
        ratiosTtm: { netIncomePerShareTTM: 1.45, grossProfitMarginTTM: 0.5, debtToEquityRatioTTM: 0.3 },
        keyMetricsTtm: { returnOnEquityTTM: 0.2 },
        estimates: [
          { date: "2028-06-30", revenueAvg: 170, epsAvg: 1.8, numAnalystsRevenue: 5, numAnalystsEps: 4 },
          { date: "2027-06-30", revenueAvg: 155, epsAvg: 1.6, numAnalystsRevenue: 6, numAnalystsEps: 5 },
          { date: "2026-06-30", revenueAvg: 139, epsAvg: 1.42 },
          { date: "2029-06-30", revenueAvg: 180, epsAvg: 2 },
        ],
        gradesConsensus: { strongBuy: 1, buy: 5, hold: 2, sell: 0, strongSell: 0, consensus: "Buy" },
        priceTarget: { targetHigh: 150, targetLow: 90, targetConsensus: 120, targetMedian: 118 },
        grades: [
          { date: "2026-09-01", gradingCompany: "A", action: "upgrade", previousGrade: "Hold", newGrade: "Buy" },
          { date: "2025-01-01", gradingCompany: "B", action: "downgrade", previousGrade: "Buy", newGrade: "Hold" },
          { date: "2026-09-20", gradingCompany: "C", action: "maintain", previousGrade: "Buy", newGrade: "Buy" },
        ],
      },
      "2026-10-03",
    );
    expect(c.income.fiscalYearEnds).toEqual(years);
    expect(c.income.revenue[4]).toBe(140);
    expect(c.profile.range).toEqual([80.5, 120.25]);
    expect(c.profile.beta).toBe(0.912);
    expect(c.lastFiscalYearEstimate).toEqual({ fiscalYearEnd: "2026-06-30", revenueAvg: 139, epsAvg: 1.42 });
    expect(c.estimates.map((e) => e.fiscalYearEnd)).toEqual(["2027-06-30", "2028-06-30"]);
    expect(c.ratingChanges12m.map((r) => r.firm)).toEqual(["A"]);
    expect(c.latestRatings[0].firm).toBe("C");
    expect(c.ratingCounts12m).toEqual({ upgrades: 1, downgrades: 0, total: 2 });
    expect(c.sources.map((s) => s.url)).toContain("https://www.sec.gov/edgar/browse/?CIK=123");
    // Das Ergebnis ist direkt auswertbar
    const m = deriveMetrics(c);
    expect(Number(m.expectedRevenueGrowth)).toBeCloseTo(155 / 139 - 1, 10);
    expect(evaluateCriteria(c, m, config).length).toBeGreaterThan(5);
  });
});

describe("KI-Entwürfe der Texte", () => {
  it("baut den Prompt mit Regeln und Daten", async () => {
    const { buildThesisPrompt } = await import("./thesis-draft");
    const { system, user } = buildThesisPrompt(load("MSFT"));
    expect(system).toMatch(/Erfinde keine Zahlen/);
    expect(system).toMatch(/## Was müsste passieren, damit die These falsch ist\?/);
    expect(user).toContain("Microsoft Corporation");
    expect(user).toContain("331839000000");
  });

  it("erkennt fehlende Abschnitte und erfundene Zahlen", async () => {
    const { validateThesisDraft } = await import("./thesis-draft");
    const msft = load("MSFT");
    const ok = validateThesisDraft(
      "## Kurzprofil\nUmsatz zuletzt 331,8 Mrd. $, Marge 46,8 %.\n## Investment-These\nText\n## Risiken\n- **A:** b\n## Was müsste passieren, damit die These falsch ist?\nText",
      msft,
    );
    expect(ok).toEqual({ missingSections: [], unknownNumbers: [] });
    const bad = validateThesisDraft("## Kurzprofil\nMarktanteil von 73,4 % und 412 Mrd. $ Umsatz im Jahr 2026.", msft);
    expect(bad.missingSections).toHaveLength(3);
    expect(bad.unknownNumbers).toEqual(["73,4", "412"]);
  });

  it("alle mitgelieferten Texte enthalten nur belegte Zahlen", async () => {
    const { validateThesisDraft } = await import("./thesis-draft");
    for (const symbol of config.candidates) {
      const md = fs.readFileSync(path.join(root, "content/theses", `${symbol}.md`), "utf8");
      expect(validateThesisDraft(md, load(symbol)), symbol).toEqual({ missingSections: [], unknownNumbers: [] });
    }
  });
});
