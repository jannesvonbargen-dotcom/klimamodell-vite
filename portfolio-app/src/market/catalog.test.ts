import { describe, expect, it } from "vitest";
import { CATALOG, isValidIsin, looksLikeIsin, looksLikeWkn, searchCatalog } from "./catalog";

describe("Katalog", () => {
  it("enthält nur ISINs mit gültiger Prüfziffer und eindeutige Einträge", () => {
    for (const e of CATALOG) expect(isValidIsin(e.isin), e.isin).toBe(true);
    expect(new Set(CATALOG.map((e) => e.isin)).size).toBe(CATALOG.length);
    expect(new Set(CATALOG.map((e) => e.symbol)).size).toBe(CATALOG.length);
  });

  it("erkennt ungültige ISINs", () => {
    expect(isValidIsin("US0378331006")).toBe(false);
    expect(isValidIsin("DE0007164600")).toBe(true);
  });

  it("findet nach Name, Ticker, ISIN und WKN", () => {
    expect(searchCatalog("apple")[0].symbol).toBe("AAPL");
    expect(searchCatalog("SAP")[0].isin).toBe("DE0007164600");
    expect(searchCatalog("IE00B4L5Y983")[0].symbol).toBe("EUNL.DE");
    expect(searchCatalog("A0RPWH")[0].symbol).toBe("EUNL.DE");
    expect(searchCatalog("munchener")[0].symbol).toBe("MUV2.DE");
  });

  it("erkennt ISIN- und WKN-Muster", () => {
    expect(looksLikeIsin("de0007164600")).toBe(true);
    expect(looksLikeWkn("716460")).toBe(true);
    expect(looksLikeWkn("APPLE")).toBe(false);
  });
});
