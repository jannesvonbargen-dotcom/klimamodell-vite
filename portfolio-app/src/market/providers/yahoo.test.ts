import { describe, expect, it, vi } from "vitest";

/** Yahoo-Adapter gegen nachgebildete Antworten von yahoo-finance2 (ohne Netz). */

vi.mock("yahoo-finance2", () => {
  class FakeYahoo {
    async quote() {
      return [
        {
          symbol: "AAPL",
          regularMarketPrice: 255.46,
          regularMarketPreviousClose: 252.1,
          currency: "USD",
          regularMarketTime: new Date("2026-10-02T20:00:00Z"),
          longName: "Apple Inc.",
          marketCap: 3790000000000,
          trailingPE: 38.7,
          forwardPE: 31.2,
          trailingAnnualDividendYield: 0.0041,
          fiftyTwoWeekLow: 169.21,
          fiftyTwoWeekHigh: 260.1,
        },
        { symbol: "BROKEN", regularMarketPrice: undefined, currency: "USD" },
      ];
    }
    async chart(_symbol: string, opts: { interval: string }) {
      if (opts.interval === "1d") {
        return {
          meta: { exchangeTimezoneName: "America/New_York" },
          quotes: [
            { date: new Date("2026-09-30T13:30:00Z"), close: 250.12 },
            { date: new Date("2026-10-01T13:30:00Z"), close: null },
            { date: new Date("2026-10-02T13:30:00Z"), close: 255.46 },
          ],
        };
      }
      return {
        meta: { exchangeTimezoneName: "America/New_York" },
        quotes: [
          { date: new Date("2026-10-01T19:55:00Z"), close: 251 },
          { date: new Date("2026-10-02T13:30:00Z"), close: 253 },
          { date: new Date("2026-10-02T13:35:00Z"), close: 254.5 },
        ],
      };
    }
    async search() {
      return {
        quotes: [
          { isYahooFinance: true, symbol: "APC.DE", shortname: "APPLE INC", exchDisp: "XETRA", quoteType: "EQUITY", score: 1 },
          {
            isYahooFinance: true,
            symbol: "AAPL",
            longname: "Apple Inc.",
            exchDisp: "NASDAQ",
            quoteType: "EQUITY",
            sector: "Technology",
            score: 1,
          },
          { isYahooFinance: true, symbol: "AAPL250117C00100000", quoteType: "OPTION", score: 1 },
          { isYahooFinance: false, index: "x" },
        ],
      };
    }
    async quoteSummary() {
      return { assetProfile: { sector: "Technology", industry: "Consumer Electronics", country: "United States" } };
    }
  }
  return { default: FakeYahoo };
});

describe("YahooProvider", () => {
  it("wandelt Kurse in Dezimal-Strings um und überspringt unvollständige", async () => {
    const { YahooProvider } = await import("./yahoo");
    const quotes = await new YahooProvider().quotes(["AAPL", "BROKEN"]);
    expect([...quotes.keys()]).toEqual(["AAPL"]);
    expect(quotes.get("AAPL")).toMatchObject({
      price: "255.46",
      previousClose: "252.1",
      currency: "USD",
      asOf: "2026-10-02T20:00:00.000Z",
    });
  });

  it("liefert Tageskurse mit Börsendatum und ohne Lücken", async () => {
    const { YahooProvider } = await import("./yahoo");
    const history = await new YahooProvider().dailyHistory("AAPL", "2026-09-30", "2026-10-02");
    expect(history).toEqual([
      { key: "2026-09-30", close: "250.12" },
      { key: "2026-10-02", close: "255.46" },
    ]);
  });

  it("liefert Intraday-Kurse der letzten Sitzung in Berliner Zeit", async () => {
    const { YahooProvider } = await import("./yahoo");
    const points = await new YahooProvider().intraday("AAPL", 1);
    expect(points).toEqual([
      { key: "2026-10-02T15:30", close: "253" },
      { key: "2026-10-02T15:35", close: "254.5" },
    ]);
  });

  it("filtert die Suche auf Aktien und ETFs", async () => {
    const { YahooProvider } = await import("./yahoo");
    const results = await new YahooProvider().search("US0378331005");
    expect(results.map((r) => r.symbol)).toEqual(["APC.DE", "AAPL"]);
    expect(results[0].isin).toBe("US0378331005");
  });

  it("liefert Kennzahlen inklusive Sektor und Dividendenrendite", async () => {
    const { YahooProvider } = await import("./yahoo");
    const f = await new YahooProvider().fundamentals("AAPL");
    expect(f).toMatchObject({
      marketCap: "3790000000000",
      trailingPE: "38.7",
      dividendYield: "0.0041",
      fiftyTwoWeekHigh: "260.1",
      sector: "Technology",
      country: "United States",
    });
  });
});
