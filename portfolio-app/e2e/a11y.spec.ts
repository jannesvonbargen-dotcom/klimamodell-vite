import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** Barrierefreiheit (WCAG 2.1 AA, axe-core) auf allen Seiten – hell und dunkel. */

const PAGES = [
  "/",
  "/transaktionen",
  "/sparplaene",
  "/ertraege",
  "/import",
  "/wachstumswerte",
  "/wachstumswerte/MSFT",
  "/watchlist",
  "/einstellungen",
  "/position/US0378331005",
];

for (const theme of ["dark", "light"] as const) {
  test(`keine Verstöße gegen WCAG 2.1 AA (${theme})`, async ({ page }) => {
    if (theme === "light") await page.addInitScript(() => localStorage.setItem("theme", "light"));
    for (const url of PAGES) {
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const summary = result.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target.join(" ")}`);
      expect(summary, url).toEqual([]);
    }
  });
}
