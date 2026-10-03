import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Rubrik „Solide Wachstumswerte“ und Watchlist gegen In-Memory-DB und Demo-Anbieter. */

beforeAll(() => {
  process.env.DATABASE_PATH = ":memory:";
  process.env.MARKET_DATA_PROVIDER = "mock";
  delete process.env.RESEARCH_ROOT;
});

afterAll(async () => {
  const { closeDb } = await import("@/db/client");
  closeDb();
  delete process.env.RESEARCH_ROOT;
});

describe("Solide Wachstumswerte (Loader)", () => {
  it("bewertet alle Kandidaten mit Datenstand statt Demo-Kursen", async () => {
    const { getResearchOverview } = await import("./research");
    const data = await getResearchOverview();
    expect(data.live).toBe(false);
    expect(data.errors).toEqual([]);
    expect(data.recommended.map((e) => e.symbol).sort()).toEqual(["COST", "JPM", "MSFT", "V", "WMT"]);
    expect(data.others.map((e) => e.symbol)).toContain("NVDA");
    for (const e of [...data.recommended, ...data.others]) {
      // Im Demo-Modus nie simulierte Kurse: Kurs = Momentaufnahme mit Stichtag
      expect(e.metrics.priceSource).toBe("snapshot");
      expect(e.metrics.price).toBe(String(e.company.profile.price));
      expect(e.thesis?.doc.sections.length).toBeGreaterThan(3);
      expect(e.company.sources.length).toBeGreaterThan(0);
    }
  });

  it("erkennt gehaltene Werte und Watchlist-Einträge", async () => {
    const { createTransaction } = await import("./transactions");
    const { addToWatchlist } = await import("./watchlist");
    const { getResearchDetail } = await import("./research");
    createTransaction({ type: "DEPOSIT", date: "2025-01-02", amount: "5000" });
    createTransaction({
      type: "BUY",
      date: "2025-01-06",
      instrument: { isin: "US22160K1051", symbol: "COST", name: "Costco Wholesale Corp.", kind: "STOCK", currency: "USD" },
      quantity: "1,5",
      price: "900",
      currency: "USD",
      fxRate: "1,05",
    });
    expect(addToWatchlist({ symbol: "V", name: "Visa Inc. (A)", isin: "US92826C8394", currency: "USD" }).ok).toBe(true);
    const cost = await getResearchDetail("COST");
    expect(cost?.held?.quantity).toBe("1.5");
    expect(cost?.watched).toBe(false);
    const visa = await getResearchDetail("V");
    expect(visa?.watched).toBe(true);
    expect(visa?.held).toBeNull();
    expect(await getResearchDetail("../etc/passwd")).toBeNull();
    expect(await getResearchDetail("UNKNOWN")).toBeNull();
  });

  it("meldet eine kaputte Konfiguration verständlich", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "research-"));
    fs.mkdirSync(path.join(dir, "config"));
    fs.writeFileSync(
      path.join(dir, "config", "growth-criteria.json"),
      '{ "candidates": ["MSFT"], "criteria": { "minFoo": { "enabled": true, "required": true } } }',
    );
    process.env.RESEARCH_ROOT = dir;
    const { getResearchOverview, ResearchConfigError } = await import("./research");
    await expect(getResearchOverview()).rejects.toBeInstanceOf(ResearchConfigError);
    fs.writeFileSync(path.join(dir, "config", "growth-criteria.json"), "{ kaputt");
    await expect(getResearchOverview()).rejects.toThrow(/konnte nicht gelesen werden/);
    // Gültige Konfiguration, aber fehlende Datendatei → Hinweis statt Absturz
    fs.writeFileSync(
      path.join(dir, "config", "growth-criteria.json"),
      '{ "candidates": ["MSFT"], "criteria": { "maxBeta": { "enabled": true, "required": true, "value": 1.2 } } }',
    );
    const data = await getResearchOverview();
    expect(data.errors[0]).toMatch(/content\/research\/MSFT\.json/);
    delete process.env.RESEARCH_ROOT;
  });
});

describe("Watchlist", () => {
  it("prüft Kursalarme", async () => {
    const { alertState } = await import("./watchlist");
    expect(alertState("105", "100", null)).toBe("above");
    expect(alertState("95", "100", "96")).toBe("below");
    expect(alertState("98", "100", "96")).toBeNull();
    expect(alertState(null, "100", "96")).toBeNull();
  });

  it("validiert Schwellen und liefert Kurse", async () => {
    const { addToWatchlist, getWatchlist, updateWatchlistItem, removeFromWatchlist, triggeredAlertCount } = await import("./watchlist");
    const added = addToWatchlist({ symbol: "SAP.DE", name: "SAP SE" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    // Doppelt hinzufügen ist harmlos
    const again = addToWatchlist({ symbol: "SAP.DE", name: "SAP SE" });
    expect(again.ok && again.id).toBe(added.id);
    expect(addToWatchlist({ symbol: "x y", name: "Ungültig" }).ok).toBe(false);

    const bad = updateWatchlistItem(added.id, { alertAbove: "100", alertBelow: "200" });
    expect(bad.ok).toBe(false);
    expect(updateWatchlistItem(added.id, { alertAbove: "-5" }).ok).toBe(false);
    expect(updateWatchlistItem(added.id, { alertAbove: "1.000,50", alertBelow: "", note: " Notiz " }).ok).toBe(true);

    const { entries } = await getWatchlist();
    const sap = entries.find((e) => e.symbol === "SAP.DE")!;
    expect(sap.currency).toBe("EUR");
    expect(sap.alertAbove).toBe("1000.5");
    expect(sap.alertBelow).toBeNull();
    expect(sap.note).toBe("Notiz");
    expect(sap.quote).not.toBeNull();
    expect(sap.spark.length).toBeGreaterThan(5);

    // Schwelle weit unter dem Kurs → Alarm „über“
    updateWatchlistItem(added.id, { alertAbove: "1" });
    expect(await triggeredAlertCount()).toBeGreaterThanOrEqual(1);
    removeFromWatchlist(added.id);
    expect((await getWatchlist()).entries.some((e) => e.symbol === "SAP.DE")).toBe(false);
  });
});
