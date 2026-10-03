import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

/**
 * Smoke-Tests der wichtigsten Abläufe gegen das Beispieldepot (Demo-Kurse).
 * Die Tests laufen nacheinander und bauen teilweise aufeinander auf.
 */

test.describe.configure({ mode: "serial" });

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/404 \(Not Found\)/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

async function openTransactionDialog(page: Page) {
  // Kurz warten, falls ein vorheriger Dialog noch ausblendet
  await expect(page.locator("[role=dialog][data-state=open]")).toHaveCount(0);
  await page.keyboard.press("n");
  await expect(page.getByRole("dialog", { name: /Transaktion/ })).toBeVisible();
}

test("Übersicht zeigt Vermögen, Verlauf, Positionen und Hinweis", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await expect(page.getByText("Gesamtvermögen")).toBeVisible();
  await expect(page.getByText(/^\d{1,3}(\.\d{3})*,\d{2}\s€$/).first()).toBeVisible();
  await expect(page.getByText("Demo-Kurse (simuliert)").first()).toBeVisible();

  // Zeitraum wechseln
  await page.getByRole("radio", { name: "1J" }).click();
  await expect(page.getByText("1 Jahr")).toBeVisible();

  // Positionen: Suche filtert
  const table = page.getByRole("table");
  await expect(table.getByRole("row")).not.toHaveCount(1);
  await page.getByPlaceholder("Suchen").fill("SAP");
  await expect(table.getByRole("link", { name: /SAP SE/ })).toBeVisible();
  await expect(table.getByRole("link", { name: /Allianz/ })).toHaveCount(0);

  await expect(page.getByText(/Keine Anlageberatung/).last()).toBeVisible();
  expect(errors).toEqual([]);
});

test("Positionsdetail mit Chart, Kennzahlen und Transaktionen", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("table").getByRole("link", { name: /Apple/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Apple Inc." })).toBeVisible();
  await expect(page.getByText("Kennzahlen")).toBeVisible();
  // Keine erfundenen Zahlen: Demo liefert kein KGV
  await expect(page.getByText("keine Daten").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Transaktionen/ })).toBeVisible();
  await page.getByRole("radio", { name: "5J" }).click();
  await expect(page.getByText(/5 Jahre/)).toBeVisible();
});

test("Transaktion erfassen, Überverkauf verhindern, löschen und rückgängig machen", async ({ page }) => {
  await page.goto("/transaktionen");
  const counter = page.getByText(/^\d+ von \d+$/);
  const before = Number((await counter.textContent())!.split(" ")[0]);

  // Einzahlung per Tastenkürzel N
  await openTransactionDialog(page);
  await page.getByRole("radio", { name: "Einzahlung" }).click();
  await page.locator("#tx-amount").fill("250,00");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Einzahlung gespeichert")).toBeVisible();
  await expect(counter).toHaveText(`${before + 1} von ${before + 1}`);

  // Verkauf von mehr Stücken als vorhanden → Validierung
  await openTransactionDialog(page);
  await page.getByRole("radio", { name: "Verkauf" }).click();
  await page.getByRole("combobox", { name: "Wertpapier" }).fill("Apple");
  await page.getByRole("option", { name: /Apple/ }).first().click();
  await page.locator("#tx-qty").fill("9999");
  await page.locator("#tx-price").fill("100");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText(/nur .* Stück gehalten/)).toBeVisible();
  await page.keyboard.press("Escape");

  // Löschen mit Rückgängig
  const row = page.getByRole("button", { name: /^Einzahlung vom .* bearbeiten$/ }).first();
  await row.hover();
  await page.getByRole("button", { name: "Aktionen" }).first().click();
  await page.getByRole("menuitem", { name: "Löschen" }).click();
  await expect(page.getByText("Transaktion gelöscht")).toBeVisible();
  await expect(counter).toHaveText(`${before} von ${before}`);
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(counter).toHaveText(`${before + 1} von ${before + 1}`);
});

test("Trade-Republic-CSV importieren und Duplikate beim zweiten Mal erkennen", async ({ page }) => {
  const file = path.join(__dirname, "fixtures", "trade-republic.csv");
  await page.goto("/import");
  await page.locator("#csv-file").setInputFiles(file);
  await expect(page.getByText(/Trade Republic/).first()).toBeVisible();
  const importButton = page.getByRole("button", { name: /\d+ Transaktionen importieren/ });
  await expect(importButton).toBeVisible();
  await importButton.click();
  await expect(page.getByText(/Transaktionen importiert/).first()).toBeVisible();

  await page.getByRole("button", { name: "Weitere Datei" }).click();
  await page.locator("#csv-file").setInputFiles(file);
  await expect(page.getByRole("button", { name: "Nichts zu importieren" })).toBeVisible();
});

test("Solide Wachstumswerte: Hinweis, Begründung, Quellen und Watchlist", async ({ page }) => {
  await page.goto("/wachstumswerte");
  await expect(page.getByRole("note").getByText("Keine Anlageberatung.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Erfüllen deine Kriterien/ })).toContainText("5");
  await expect(page.getByText("So wird ausgewählt")).toBeVisible();

  await page.getByRole("link", { name: "Microsoft Corporation" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Microsoft Corporation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Risiken" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /damit die These falsch ist/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Quellen" })).toBeVisible();
  await expect(page.getByRole("link", { name: /SEC EDGAR/ })).toHaveAttribute("href", /sec\.gov/);

  await page.getByRole("button", { name: /Microsoft Corporation zur Watchlist hinzufügen/ }).click();
  await expect(page.getByRole("button", { name: /von der Watchlist entfernen/ })).toBeVisible();
  await page.goto("/watchlist");
  await expect(page.getByText("Microsoft Corporation")).toBeVisible();
});

test("Kursalarm setzen löst Hinweis aus", async ({ page }) => {
  await page.goto("/watchlist");
  await page.getByRole("button", { name: /Kursalarm für Microsoft Corporation bearbeiten/ }).click();
  await page.getByLabel(/Kurs steigt über/).fill("1");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("status").filter({ hasText: /notiert über deiner Schwelle/ })).toBeVisible();
  await expect(page.getByLabel(/ausgelöste Kursalarme/).first()).toBeVisible();
});

test("Sicherung herunterladen und Farbschema wechseln", async ({ page }) => {
  await page.goto("/einstellungen");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: /Vollständige Sicherung/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^depot-sicherung-\d{4}-\d{2}-\d{2}\.json$/);

  const html = page.locator("html");
  await expect(html).toHaveClass(/dark/);
  await page.getByRole("radiogroup", { name: "Farbschema" }).first().getByRole("radio", { name: "Hell" }).click();
  await expect(html).not.toHaveClass(/dark/);
});

test("Befehlspalette öffnet Seiten und Positionen", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("nvid");
  await expect(page.getByRole("option", { name: /NVIDIA/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/position\/US67066G1040/);

  await page.keyboard.press("Control+k");
  await page.keyboard.type("spar");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/sparplaene$/);
});

test("Jede Seite hat eine Überschrift und lädt ohne Fehler", async ({ page }) => {
  const errors = collectErrors(page);
  for (const url of [
    "/",
    "/transaktionen",
    "/sparplaene",
    "/import",
    "/wachstumswerte",
    "/wachstumswerte/JPM",
    "/watchlist",
    "/einstellungen",
  ]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  }
  // Mit Lade-Skelett wird gestreamt – der Status ist dann 200, die Seite zeigt aber „nicht gefunden“
  await page.goto("/position/XX0000000000");
  await expect(page.getByRole("heading", { name: "Seite nicht gefunden" })).toBeVisible();
  expect(errors).toEqual([]);
});
