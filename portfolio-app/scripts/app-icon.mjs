/**
 * Zeichnet das App-Icon der Mac-App (build/icon.png, 1024 × 1024) aus dem
 * Markenzeichen der Oberfläche. Nur nötig, wenn sich das Icon ändern soll:
 *   node scripts/app-icon.mjs
 * (nutzt den Chromium von Playwright; eigener Pfad über CHROMIUM_PATH)
 */
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "build/icon.png";
// macOS-Raster: 1024er Fläche, Körper 824×824 mit 100 px Rand, Radius ≈ 185
const s = 824 / 24;
const p = (x, y) => `${(100 + x * s).toFixed(1)} ${(100 + y * s).toFixed(1)}`;
const line = `M${p(6, 15.5)} L${p(9.5, 11.5)} L${p(12.5, 14)} L${p(18, 7.5)}`;
const area = `${line} L${p(18, 19)} L${p(6, 19)} Z`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
  <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26262a"/><stop offset="1" stop-color="#0b0b0c"/></linearGradient>
  <linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3dd68c" stop-opacity=".34"/><stop offset="1" stop-color="#3dd68c" stop-opacity="0"/></linearGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".5" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#fff" stop-opacity=".02"/></linearGradient>
  <clipPath id="clip"><rect x="100" y="100" width="824" height="824" rx="185"/></clipPath>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
</defs>
<rect x="100" y="112" width="824" height="824" rx="185" fill="#000" opacity=".35" filter="url(#shadow)"/>
<rect x="100" y="100" width="824" height="824" rx="185" fill="url(#body)"/>
<g clip-path="url(#clip)">
  <path d="${area}" fill="url(#area)"/>
  <path d="${line}" fill="none" stroke="#f4f4f2" stroke-width="54" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${100 + 18 * s}" cy="${100 + 7.5 * s}" r="44" fill="#3dd68c" stroke="#0e0e10" stroke-width="18"/>
</g>
<rect x="101" y="101" width="822" height="822" rx="184" fill="none" stroke="url(#rim)" stroke-width="2"/>
</svg>`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
await page.locator("svg").screenshot({ path: out, omitBackground: true });
await browser.close();
