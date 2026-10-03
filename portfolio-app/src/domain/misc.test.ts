import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, formatPercent, formatQuantity, signOf } from "../lib/format";
import { parseLocaleNumber } from "./decimal";
import { easterSunday, EXCHANGES, isTradingDay, marketStatus, zonedToUtc } from "./market-hours";
import { dueExecutionDates, nextExecutionDate, nextTradingDay } from "./savings-plan";
import { validateDeletion, validateFields, validateTimeline } from "./validation";
import { buy, deposit, sell, tx } from "./test-helpers";

const nbsp = (s: string) => s.replace(/ | /g, " ");

describe("parseLocaleNumber", () => {
  it.each([
    ["1.234,56", "1234.56"],
    ["1,234.56", "1234.56"],
    ["12,5", "12.5"],
    ["0.405022", "0.405022"],
    ["-7,50 €", "-7.5"],
    ["(12,00)", "-12"],
    ["+2.300", "2.3"],
    ["1.234.567", "1234567"],
    ["EUR 99,90", "99.9"],
    ["12-", "-12"],
  ])("%s → %s", (input, expected) => {
    expect(parseLocaleNumber(input)?.toString()).toBe(expected);
  });

  it("respektiert explizite Formate", () => {
    expect(parseLocaleNumber("1.234", "de")?.toString()).toBe("1234");
    expect(parseLocaleNumber("1,234", "en")?.toString()).toBe("1234");
  });

  it("lehnt Unsinn ab", () => {
    expect(parseLocaleNumber("abc")).toBeNull();
    expect(parseLocaleNumber("")).toBeNull();
    expect(parseLocaleNumber("1,2,3.4.5")).toBeNull();
  });
});

describe("Formatierung", () => {
  it("formatiert deutsch", () => {
    expect(nbsp(formatMoney("1234.5"))).toBe("1.234,50 €");
    expect(nbsp(formatMoney("12.3", "EUR", { signed: true }))).toBe("+12,30 €");
    expect(nbsp(formatPercent("0.0235"))).toBe("+2,35 %");
    expect(nbsp(formatPercent("-0.1"))).toBe("-10,00 %");
    expect(formatQuantity("0.4050220")).toBe("0,405022");
    expect(formatDate("2026-10-03")).toBe("03.10.2026");
  });

  it("erkennt Vorzeichen", () => {
    expect(signOf("-0.01")).toBe(-1);
    expect(signOf("0")).toBe(0);
    expect(signOf("-0")).toBe(0);
    expect(signOf("5")).toBe(1);
  });
});

describe("Börsenzeiten", () => {
  it("berechnet Ostern", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
  });

  it("kennt Feiertage", () => {
    expect(isTradingDay(EXCHANGES.XETRA, "2026-04-03")).toBe(false); // Karfreitag
    expect(isTradingDay(EXCHANGES.XETRA, "2026-12-24")).toBe(false);
    expect(isTradingDay(EXCHANGES.NYSE, "2026-07-03")).toBe(false); // 4. Juli ist Samstag
    expect(isTradingDay(EXCHANGES.NYSE, "2026-11-26")).toBe(false); // Thanksgiving
    expect(isTradingDay(EXCHANGES.NYSE, "2026-10-05")).toBe(true);
  });

  it("bestimmt den Status zu einem Zeitpunkt", () => {
    const mondayAfternoon = new Date("2026-10-05T14:00:00Z"); // 16:00 Berlin, 10:00 New York
    expect(marketStatus("XETRA", mondayAfternoon).open).toBe(true);
    expect(marketStatus("NYSE", mondayAfternoon).open).toBe(true);
    const saturday = new Date("2026-10-03T10:00:00Z");
    const s = marketStatus("XETRA", saturday);
    expect(s.open).toBe(false);
    expect(s.nextChange.toISOString()).toBe("2026-10-05T07:00:00.000Z");
  });

  it("wandelt Wanduhrzeiten korrekt um (Sommer-/Winterzeit)", () => {
    expect(zonedToUtc("2026-07-01", 9, 30, "America/New_York").toISOString()).toBe("2026-07-01T13:30:00.000Z");
    expect(zonedToUtc("2026-12-01", 9, 30, "America/New_York").toISOString()).toBe("2026-12-01T14:30:00.000Z");
    expect(zonedToUtc("2026-12-01", 9, 0, "Europe/Berlin").toISOString()).toBe("2026-12-01T08:00:00.000Z");
  });
});

describe("Sparpläne", () => {
  it("verschiebt Termine auf den nächsten Handelstag", () => {
    expect(nextTradingDay("2026-02-15")).toBe("2026-02-16");
    const dates = dueExecutionDates({ interval: "MONTHLY", executionDay: 15, startDate: "2026-01-01", active: true }, "2026-04-20");
    expect(dates).toEqual(["2026-01-15", "2026-02-16", "2026-03-16", "2026-04-15"]);
  });

  it("unterstützt vierteljährlich und wöchentlich", () => {
    expect(dueExecutionDates({ interval: "QUARTERLY", executionDay: 1, startDate: "2026-01-01", active: true }, "2026-12-31")).toEqual([
      "2026-01-01",
      "2026-04-01",
      "2026-07-01",
      "2026-10-01",
    ]);
    expect(dueExecutionDates({ interval: "WEEKLY", executionDay: 1, startDate: "2026-10-01", active: true }, "2026-10-20")).toEqual([
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
    ]);
  });

  it("liefert den nächsten Termin und ignoriert inaktive Pläne", () => {
    expect(nextExecutionDate({ interval: "MONTHLY", executionDay: 2, startDate: "2026-01-01", active: true }, "2026-10-03")).toBe("2026-11-02");
    expect(dueExecutionDates({ interval: "MONTHLY", executionDay: 2, startDate: "2026-01-01", active: false }, "2026-10-03")).toEqual([]);
  });
});

describe("Validierung", () => {
  it("prüft Pflichtfelder", () => {
    const errors = validateFields({ ...tx("BUY", "2026-01-01"), quantity: "0", price: null });
    expect(errors.instrumentId).toBeDefined();
    expect(errors.quantity).toBeDefined();
    expect(errors.price).toBeDefined();
    expect(validateFields({ ...tx("DEPOSIT", "2026-01-01"), amount: "100" })).toEqual({});
    expect(validateFields({ ...tx("BUY", "2026-01-01"), instrumentId: 1, quantity: "1.1234567", price: "5" }).quantity).toMatch(/6 Nachkommastellen/);
  });

  it("verhindert Verkäufe von mehr Stücken als gehalten – auch rückwirkend", () => {
    const existing = [deposit("2026-01-01", "1000"), buy("2026-01-02", 1, "5", "10"), sell("2026-03-01", 1, "5", "12")];
    const tooMuch = validateTimeline({ ...sell("2026-02-01", 1, "6", "11"), id: undefined }, existing);
    expect(tooMuch.quantity).toMatch(/nur 5 Stück/);
    const breaksLater = validateTimeline({ ...sell("2026-02-01", 1, "1", "11"), id: undefined }, existing);
    expect(breaksLater.quantity).toMatch(/späterer Verkauf/);
    expect(validateDeletion(existing[1].id, existing)).toMatch(/späteren Verkauf/);
    expect(validateDeletion(existing[2].id, existing)).toBeNull();
  });
});
