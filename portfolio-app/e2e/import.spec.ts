import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Import eines Trade-Republic-Kontoauszugs (nur Vorschau, ohne zu speichern).
 * Läuft vor smoke.spec.ts auf der frischen Test-Datenbank mit Beispieldepot.
 */

test("Kontoauszug: Vorschau mit Depot nach dem Import und Saldo-Gegenprobe", async ({ page }) => {
  await page.goto("/import");
  await page.locator("#csv-file").setInputFiles(path.join(__dirname, "fixtures", "trade-republic-kontoauszug.csv"));
  await expect(page.getByText("Trade Republic – Kontoauszug")).toBeVisible();
  // Standard: Beispieldepot wird ersetzt → Cash entspricht genau dem Endsaldo des Auszugs
  await expect(page.getByText("Gegenprobe bestanden:")).toBeVisible();
  const outcome = page.getByRole("region", { name: "Dein Depot nach dem Import" });
  await expect(outcome.getByText(/^1\.540,16\s€$/)).toBeVisible();
  await expect(outcome.getByRole("cell", { name: /Apple Inc\./ })).toBeVisible();
  await expect(page.getByRole("button", { name: "11 Buchungen importieren" })).toBeEnabled();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
  // Mit Beispieldepot passt der Saldo nicht mehr – die App sagt es
  await page.getByRole("switch", { name: "Beispieldepot vorher entfernen" }).click();
  await expect(page.getByText("Saldo weicht ab:")).toBeVisible();
  // Nicht importieren: die übrigen Tests brauchen das Beispieldepot
  await page.getByRole("button", { name: "Abbrechen" }).click();
  await expect(page.getByText("Trade-Republic-Datei hierher ziehen")).toBeVisible();
});
