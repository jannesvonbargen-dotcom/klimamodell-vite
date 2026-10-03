import { beforeEach, describe, expect, it } from "vitest";
import { buildValueSeries, businessDays, rangeStart } from "./performance";
import { buy, deposit, instrument, resetIds, split } from "./test-helpers";

describe("buildValueSeries", () => {
  beforeEach(() => resetIds());

  it("berechnet Wertverlauf, Gewinn und zeitgewichtete Rendite ohne Einzahlungseffekt", () => {
    const points = buildValueSeries({
      transactions: [deposit("2026-01-05", "1000"), buy("2026-01-05", 1, "10", "100", "0"), deposit("2026-01-07", "1100")],
      instruments: new Map([[1, instrument(1, "ABC")]]),
      prices: new Map([
        [
          "ABC",
          [
            { key: "2026-01-05", value: "100" },
            { key: "2026-01-06", value: "110" },
          ],
        ],
      ]),
      fx: new Map(),
      keys: ["2026-01-05", "2026-01-06", "2026-01-07"],
    });
    expect(points.map((p) => p.totalEUR)).toEqual(["1000", "1100", "2200"]);
    expect(points.map((p) => p.gainEUR)).toEqual(["0", "100", "100"]);
    expect(Number(points[1].twr)).toBeCloseTo(0.1, 12);
    // Einzahlung am dritten Tag verändert die Rendite nicht
    expect(Number(points[2].twr)).toBeCloseTo(0.1, 12);
    expect(points[2].flowEUR).toBe("1100");
  });

  it("nutzt Wechselkurse je Zeitpunkt und den Live-Kurs für den letzten Punkt", () => {
    const points = buildValueSeries({
      transactions: [deposit("2026-01-05", "800"), buy("2026-01-05", 1, "4", "250", "0", { currency: "USD", fxRate: "1.25" })],
      instruments: new Map([[1, instrument(1, "MSFT", "USD")]]),
      prices: new Map([["MSFT", [{ key: "2026-01-05", value: "250" }]]]),
      fx: new Map([
        [
          "USD",
          [
            { key: "2026-01-05", value: "1.25" },
            { key: "2026-01-06", value: "1" },
          ],
        ],
      ]),
      keys: ["2026-01-05", "2026-01-06"],
      latestPrices: new Map([["MSFT", "300"]]),
    });
    expect(points[0].totalEUR).toBe("800");
    // 4 × 300 USD / 1,00 = 1.200 €
    expect(points[1].totalEUR).toBe("1200");
    expect(Number(points[1].twr)).toBeCloseTo(0.5, 12);
  });

  it("bewertet vor Beginn der Kurshistorie mit dem Kaufkurs", () => {
    const points = buildValueSeries({
      transactions: [deposit("2026-01-02", "500"), buy("2026-01-02", 1, "5", "100", "0")],
      instruments: new Map([[1, instrument(1, "NEW")]]),
      prices: new Map([["NEW", [{ key: "2026-01-06", value: "120" }]]]),
      fx: new Map(),
      keys: ["2026-01-02", "2026-01-05", "2026-01-06"],
    });
    expect(points.map((p) => p.totalEUR)).toEqual(["500", "500", "600"]);
  });

  it("bewertet split-bereinigte Kurse vor einem Split korrekt", () => {
    const points = buildValueSeries({
      transactions: [deposit("2024-03-01", "1800"), buy("2024-03-01", 1, "2", "900", "0")],
      splits: [split(1, "2024-06-10", "10")],
      instruments: new Map([[1, instrument(1, "NVDA")]]),
      prices: new Map([
        [
          "NVDA",
          [
            { key: "2024-03-01", value: "90" },
            { key: "2024-06-11", value: "100" },
          ],
        ],
      ]),
      fx: new Map(),
      keys: ["2024-03-01", "2024-06-11"],
    });
    expect(points.map((p) => p.totalEUR)).toEqual(["1800", "2000"]);
  });

  it("verarbeitet Intraday-Zeitpunkte", () => {
    const points = buildValueSeries({
      transactions: [deposit("2026-01-02", "1000"), buy("2026-01-05T10:00", 1, "10", "100", "0")],
      instruments: new Map([[1, instrument(1, "ABC")]]),
      prices: new Map([
        [
          "ABC",
          [
            { key: "2026-01-05T09:00", value: "99" },
            { key: "2026-01-05T11:00", value: "102" },
          ],
        ],
      ]),
      fx: new Map(),
      keys: ["2026-01-05T09:30", "2026-01-05T10:30", "2026-01-05T11:30"],
    });
    expect(points.map((p) => p.totalEUR)).toEqual(["1000", "990", "1020"]);
  });
});

describe("Zeiträume", () => {
  it("liefert Werktage ohne Wochenenden", () => {
    expect(businessDays("2026-10-02", "2026-10-06")).toEqual(["2026-10-02", "2026-10-05", "2026-10-06"]);
  });

  it("berechnet Startdaten der Zeiträume", () => {
    expect(rangeStart("1M", "2026-10-03", "2020-01-01")).toBe("2026-09-03");
    expect(rangeStart("YTD", "2026-10-03", "2020-01-01")).toBe("2025-12-31");
    expect(rangeStart("1Y", "2026-10-03", "2026-05-01")).toBe("2026-05-01");
    expect(rangeStart("MAX", "2026-10-03", "2021-03-15")).toBe("2021-03-15");
  });
});
