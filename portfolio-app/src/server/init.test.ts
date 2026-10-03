import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

/** Einrichtung beim ersten Seitenaufruf (Mac-App ohne Setup-Skript) und Desktop-Hinweise. */

beforeAll(() => {
  process.env.DATABASE_PATH = ":memory:";
  process.env.MARKET_DATA_PROVIDER = "mock";
  process.env.SEED_ON_FIRST_RUN = "false";
});

afterAll(async () => {
  const { closeDb } = await import("@/db/client");
  closeDb();
  delete process.env.SEED_ON_FIRST_RUN;
});

afterEach(() => {
  delete process.env.DEPOT_DESKTOP;
  delete process.env.DEPOT_DATA_DIR;
});

describe("ensureInitialized", () => {
  it("richtet die Datenbank genau einmal ein, auch bei gleichzeitigen Aufrufen", async () => {
    const { ensureInitialized } = await import("./init");
    const { getSetting } = await import("./repo");
    expect(getSetting<boolean>("initialized", false)).toBe(false);
    const first = ensureInitialized();
    expect(ensureInitialized()).toBe(first);
    await first;
    expect(getSetting<boolean>("initialized", false)).toBe(true);
  });

  it("lässt die Datenbank bei weiteren Aufrufen unverändert (SEED_ON_FIRST_RUN=false)", async () => {
    const { ensureInitialized } = await import("./init");
    const { getSettingsOverview } = await import("./settings");
    await ensureInitialized();
    expect(getSettingsOverview().counts.transactions).toBe(0);
  });
});

describe("Desktop-Hinweise", () => {
  it("nennt im Browser .env.local und keinen Datenordner", async () => {
    const { configFileName, desktopDataDir } = await import("./config");
    expect(configFileName()).toBe(".env.local");
    expect(desktopDataDir()).toBeNull();
  });

  it("nennt in der Mac-App Konfiguration.env und den Datenordner", async () => {
    process.env.DEPOT_DESKTOP = "1";
    process.env.DEPOT_DATA_DIR = "/Users/test/Library/Application Support/Depot";
    const { configFileName, desktopDataDir } = await import("./config");
    const { getSettingsOverview } = await import("./settings");
    expect(configFileName()).toBe("Konfiguration.env");
    expect(desktopDataDir()).toBe("/Users/test/Library/Application Support/Depot");
    expect(getSettingsOverview()).toMatchObject({
      configFile: "Konfiguration.env",
      dataDir: "/Users/test/Library/Application Support/Depot",
    });
  });
});
