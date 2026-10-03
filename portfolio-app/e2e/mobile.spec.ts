import { expect, test } from "@playwright/test";

/** Mobile Ansicht: Navigation über das Menü, keine horizontale Scrollleiste. */

test("mobile Navigation und Layout", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Gesamtvermögen" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Wachstumswerte" }).click();
  await expect(page).toHaveURL(/\/wachstumswerte$/);
  await expect(page.getByRole("heading", { level: 1, name: "Solide Wachstumswerte" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  // Neue Transaktion über den Plus-Knopf
  await page.getByRole("button", { name: "Transaktion erfassen" }).click();
  await expect(page.getByRole("dialog", { name: /Transaktion/ })).toBeVisible();
});
