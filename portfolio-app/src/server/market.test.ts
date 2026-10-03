import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MarketDataProvider, PricePoint, ProviderQuote } from "@/market/types";

/** Cache und Ausfall-Fallback des Kursdienstes mit austauschbaren Test-Anbietern. */

beforeAll(() => {
  process.env.DATABASE_PATH = ":memory:";
});

afterAll(async () => {
  const { overrideProvidersForTest } = await import("./market");
  overrideProvidersForTest(null);
  const { closeDb } = await import("@/db/client");
  closeDb();
});

function provider(overrides: Partial<MarketDataProvider>): MarketDataProvider {
  return { id: "test", label: "Test", isDemo: false, minIntervalMs: 0, ...overrides };
}

describe("Kursdienst", () => {
  it("cacht Kurse und liefert bei Ausfall den letzten bekannten Kurs mit Hinweis", async () => {
    const { getQuotes, overrideProvidersForTest } = await import("./market");
    let calls = 0;
    const quote: ProviderQuote = { symbol: "ABC", price: "101.5", previousClose: "100", currency: "EUR", asOf: "2026-10-02T15:00:00.000Z" };
    overrideProvidersForTest({
      primary: provider({
        quotes: async () => {
          calls++;
          return new Map([["ABC", quote]]);
        },
      }),
    });
    const first = await getQuotes(["ABC"]);
    expect(first.quotes.get("ABC")?.price).toBe("101.5");
    expect(first.errors).toEqual([]);
    // Zweiter Abruf innerhalb der Cache-Zeit → kein neuer Anbieter-Aufruf
    await getQuotes(["ABC"]);
    expect(calls).toBe(1);

    overrideProvidersForTest({
      primary: provider({
        quotes: async () => {
          throw new Error("Netzwerk weg");
        },
      }),
    });
    const fallback = await getQuotes(["ABC"], { force: true });
    expect(fallback.quotes.get("ABC")?.price).toBe("101.5");
    expect(fallback.quotes.get("ABC")?.stale).toBe(true);
    expect(fallback.errors[0]).toMatch(/Netzwerk weg/);
    expect(fallback.lastFetchedAt).not.toBeNull();
  });

  it("nutzt den Ersatzanbieter, wenn der Hauptanbieter eine Funktion nicht kann oder ausfällt", async () => {
    const { getQuotes, overrideProvidersForTest } = await import("./market");
    overrideProvidersForTest({
      primary: provider({ id: "primary", quotes: async () => Promise.reject(new Error("429")) }),
      fallback: provider({
        id: "backup",
        quotes: async () => new Map([["XYZ", { symbol: "XYZ", price: "5", previousClose: null, currency: "USD", asOf: new Date().toISOString() }]]),
      }),
    });
    const result = await getQuotes(["XYZ"]);
    expect(result.quotes.get("XYZ")?.source).toBe("backup");
  });

  it("speichert Tageskurse als Snapshots und arbeitet bei Ausfall damit weiter", async () => {
    const { getDailyHistory, overrideProvidersForTest } = await import("./market");
    const points: PricePoint[] = [
      { key: "2026-09-28", close: "10" },
      { key: "2026-09-29", close: "11" },
      { key: "2026-09-30", close: "12" },
    ];
    overrideProvidersForTest({ primary: provider({ dailyHistory: async () => points }) });
    expect((await getDailyHistory("HIST", "2026-09-28", "2026-09-30")).map((p) => p.close)).toEqual(["10", "11", "12"]);
    overrideProvidersForTest({ primary: provider({ dailyHistory: async () => Promise.reject(new Error("offline")) }) });
    expect((await getDailyHistory("HIST", "2026-09-28", "2026-09-30")).map((p) => p.key)).toEqual(["2026-09-28", "2026-09-29", "2026-09-30"]);
  });

  it("trennt Demo- und Echtdaten im Cache", async () => {
    const { getQuotes, overrideProvidersForTest } = await import("./market");
    overrideProvidersForTest({
      primary: provider({ isDemo: true, quotes: async () => Promise.reject(new Error("aus")) }),
    });
    // Der echte Kurs von ABC darf im Demo-Modus nicht auftauchen (und umgekehrt)
    const result = await getQuotes(["ABC"]);
    expect(result.quotes.has("ABC")).toBe(false);
  });
});
