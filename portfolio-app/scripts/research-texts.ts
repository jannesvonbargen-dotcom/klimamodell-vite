/**
 * Erstellt mit der Claude-API Entwürfe für die redaktionellen Texte der Rubrik
 * „Solide Wachstumswerte“ – auf Basis der Anbieterdaten in content/research/.
 *
 *   npm run research:texts               # alle Kandidaten ohne Text
 *   npm run research:texts -- MSFT V     # bestimmte Symbole (auch mit vorhandenem Text)
 *
 * Benötigt ANTHROPIC_API_KEY in .env.local (optional ANTHROPIC_MODEL).
 * Die Entwürfe landen als content/theses/<SYM>.draft.md und werden von der
 * App ignoriert, bis du sie geprüft und in <SYM>.md umbenannt hast. Das Skript
 * meldet fehlende Abschnitte und Zahlen, die nicht aus den Daten stammen.
 */
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "./env";

loadEnv();

const root = process.cwd();
const API_URL = "https://api.anthropic.com/v1/messages";

async function generate(system: string, user: string, apiKey: string, model: string): Promise<string> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 2000, system, messages: [{ role: "user", content: user }] }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Claude-API: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (body.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n")
    .trim();
  if (!text) throw new Error("Claude-API: leere Antwort");
  return text;
}

function todayInBerlin(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
}

async function main() {
  const { buildThesisPrompt, validateThesisDraft } = await import("../src/research/thesis-draft");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY fehlt. Lege ihn in .env.local an (siehe README, Abschnitt „Solide Wachstumswerte“).");
    process.exit(1);
  }
  const model = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";
  const config = JSON.parse(fs.readFileSync(path.join(root, "config", "growth-criteria.json"), "utf8")) as { candidates: string[] };
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const symbols = args.length
    ? args.map((s) => s.toUpperCase())
    : config.candidates.filter((s) => !fs.existsSync(path.join(root, "content", "theses", `${s}.md`)));
  if (symbols.length === 0) {
    console.log("Alle Kandidaten haben bereits einen Text. Für eine Neufassung Symbole angeben, z. B. npm run research:texts -- MSFT");
    return;
  }

  for (const symbol of symbols) {
    if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol)) {
      console.warn(`✗ ${symbol}: ungültiges Symbol`);
      continue;
    }
    const dataFile = path.join(root, "content", "research", `${symbol}.json`);
    if (!fs.existsSync(dataFile)) {
      console.warn(`✗ ${symbol}: keine Daten – zuerst npm run research:refresh -- ${symbol}`);
      continue;
    }
    try {
      const company = JSON.parse(fs.readFileSync(dataFile, "utf8"));
      const { system, user } = buildThesisPrompt(company);
      const markdown = await generate(system, user, apiKey, model);
      const check = validateThesisDraft(markdown, company);
      const frontmatter = [
        "---",
        `name: ${company.profile.name}`,
        `updated: ${todayInBerlin()}`,
        `author: Entwurf, KI-generiert (Claude, ${model}) auf Basis der Anbieterdaten vom ${company.asOf} – vor Übernahme prüfen`,
        "---",
        "",
      ].join("\n");
      const target = path.join(root, "content", "theses", `${symbol}.draft.md`);
      fs.writeFileSync(target, `${frontmatter}${markdown}\n`);
      const issues = [
        ...check.missingSections.map((s) => `fehlender Abschnitt „${s}“`),
        ...(check.unknownNumbers.length ? [`Zahlen ohne Beleg in den Daten: ${check.unknownNumbers.join(", ")}`] : []),
      ];
      console.log(
        `${issues.length ? "!" : "✓"} ${symbol} → ${path.relative(root, target)}${issues.length ? `\n    ${issues.join("\n    ")}` : ""}`,
      );
    } catch (error) {
      console.warn(`✗ ${symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log("\nEntwürfe prüfen, anpassen und dann in <SYM>.md umbenennen – erst dann zeigt die App sie an.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
