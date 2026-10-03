import { afterEach, describe, expect, it, vi } from "vitest";
import { AlphaVantageProvider } from "./alphavantage";
import { parseEcbXml } from "./ecb";
import { FinnhubProvider } from "./finnhub";
import { FmpProvider } from "./fmp";

/** Adapter der Kursanbieter mit nachgebildeten Antworten (ohne Netzwerk). */

type Route = (url: URL) => { status?: number; body: unknown } | undefined;

function stubFetch(route: Route) {
  const fn = vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    const res = route(url);
    if (!res) return new Response("not found", { status: 404 });
    return new Response(typeof res.body === "string" ? res.body : JSON.stringify(res.body), { status: res.status ?? 200 });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EZB", () => {
  it("liest Tageskurse aus dem XML", () => {
    const xml = `<?xml version="1.0"?><gesmes:Envelope><Cube>
      <Cube time='2026-10-02'><Cube currency='USD' rate='1.1712'/><Cube currency='GBP' rate='0.8701'/></Cube>
      <Cube time="2026-10-01"><Cube currency="USD" rate="1.1650"/></Cube>
    </Cube></gesmes:Envelope>`;
    const parsed = parseEcbXml(xml);
    expect([...parsed.keys()]).toEqual(["2026-10-02", "2026-10-01"]);
    expect(parsed.get("2026-10-02")?.get("USD")).toBe("1.1712");
    expect(parsed.get("2026-10-02")?.get("GBP")).toBe("0.8701");
    expect(parsed.get("2026-10-01")?.get("USD")).toBe("1.1650");
  });
});

describe("Finnhub", () => {
  it("liefert Kurse und lässt nicht unterstützte Symbole aus", async () => {
    const fetchMock = stubFetch((url) => {
      if (url.pathname.endsWith("/quote")) {
        expect(url.searchParams.get("token")).toBe("KEY");
        const symbol = url.searchParams.get("symbol");
        if (symbol === "AAPL") return { body: { c: 255.12, pc: 251.3, t: 1791000000 } };
        if (symbol === "SAP.DE") return { body: { c: 0, pc: 0, t: 0 } };
      }
      return undefined;
    });
    const quotes = await new FinnhubProvider("KEY").quotes(["AAPL", "SAP.DE"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect([...quotes.keys()]).toEqual(["AAPL"]);
    expect(quotes.get("AAPL")).toMatchObject({ price: "255.12", previousClose: "251.3", currency: "USD" });
  });

  it("wirft, wenn kein einziges Symbol abgefragt werden kann", async () => {
    stubFetch(() => ({ status: 403, body: { error: "You don't have access to this resource." } }));
    await expect(new FinnhubProvider("KEY").quotes(["SAP.DE"])).rejects.toThrow(/HTTP 403/);
  });

  it("rechnet Kennzahlen in die App-Einheiten um", async () => {
    stubFetch((url) => {
      if (url.pathname.endsWith("/stock/metric"))
        return { body: { metric: { peTTM: 31.2, dividendYieldIndicatedAnnual: 0.45, "52WeekLow": 169.2, "52WeekHigh": 260.1 } } };
      if (url.pathname.endsWith("/stock/profile2"))
        return {
          body: { currency: "USD", country: "US", finnhubIndustry: "Technology", name: "Apple Inc", marketCapitalization: 3800000 },
        };
      return undefined;
    });
    const f = await new FinnhubProvider("KEY").fundamentals("AAPL");
    expect(f).toMatchObject({ marketCap: "3800000000000", trailingPE: "31.2", dividendYield: "0.0045", fiftyTwoWeekLow: "169.2" });
  });
});

describe("Financial Modeling Prep", () => {
  it("liest Kurse aus der stable-API", async () => {
    stubFetch((url) => {
      if (url.pathname === "/stable/quote") {
        expect(url.searchParams.get("apikey")).toBe("KEY");
        return {
          body: [{ symbol: url.searchParams.get("symbol"), name: "Microsoft", price: 517.53, previousClose: 515.1, timestamp: 1791000000 }],
        };
      }
      return undefined;
    });
    const quotes = await new FmpProvider("KEY").quotes(["MSFT"]);
    expect(quotes.get("MSFT")).toMatchObject({ price: "517.53", previousClose: "515.1", currency: "USD", name: "Microsoft" });
  });
});

describe("Alpha Vantage", () => {
  it("liest GLOBAL_QUOTE und meldet Limits als Fehler", async () => {
    let calls = 0;
    stubFetch((url) => {
      calls++;
      if (calls === 1)
        return {
          body: {
            "Global Quote": {
              "01. symbol": url.searchParams.get("symbol"),
              "05. price": "230.4000",
              "07. latest trading day": "2026-10-02",
              "08. previous close": "228.9000",
            },
          },
        };
      return { body: { Note: "Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day." } };
    });
    // Erstes Symbol klappt, das zweite läuft ins Limit → Teilergebnis statt Totalausfall
    const quotes = await new AlphaVantageProvider("KEY").quotes(["IBM", "SAP.DE"]);
    expect([...quotes.keys()]).toEqual(["IBM"]);
    expect(quotes.get("IBM")).toMatchObject({ price: "230.4", previousClose: "228.9", asOf: "2026-10-02T21:00:00.000Z" });
  });
});
