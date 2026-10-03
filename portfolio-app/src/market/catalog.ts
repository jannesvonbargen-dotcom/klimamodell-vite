import type { SearchResult } from "./types";

/**
 * Kleiner Offline-Katalog verbreiteter Aktien und ETFs (Stammdaten:
 * ISIN, WKN, Yahoo-Symbol). Dient der Autovervollständigung auch ohne
 * Netz. Enthält keine Kurse oder Kennzahlen.
 */
export interface CatalogEntry {
  isin: string;
  wkn: string;
  symbol: string;
  name: string;
  kind: "STOCK" | "ETF";
  currency: string;
  sector: string | null;
  country: string;
  /** Domain für Logos (lokal per Initialen dargestellt, falls kein Logo). */
  domain?: string;
}

export const CATALOG: CatalogEntry[] = [
  // USA
  {
    isin: "US0378331005",
    wkn: "865985",
    symbol: "AAPL",
    name: "Apple Inc.",
    kind: "STOCK",
    currency: "USD",
    sector: "Technologie",
    country: "USA",
    domain: "apple.com",
  },
  {
    isin: "US5949181045",
    wkn: "870747",
    symbol: "MSFT",
    name: "Microsoft Corp.",
    kind: "STOCK",
    currency: "USD",
    sector: "Technologie",
    country: "USA",
    domain: "microsoft.com",
  },
  {
    isin: "US0231351067",
    wkn: "906866",
    symbol: "AMZN",
    name: "Amazon.com Inc.",
    kind: "STOCK",
    currency: "USD",
    sector: "Zyklischer Konsum",
    country: "USA",
    domain: "amazon.com",
  },
  {
    isin: "US02079K3059",
    wkn: "A14Y6F",
    symbol: "GOOGL",
    name: "Alphabet Inc. (A)",
    kind: "STOCK",
    currency: "USD",
    sector: "Kommunikation",
    country: "USA",
    domain: "abc.xyz",
  },
  {
    isin: "US67066G1040",
    wkn: "918422",
    symbol: "NVDA",
    name: "NVIDIA Corp.",
    kind: "STOCK",
    currency: "USD",
    sector: "Technologie",
    country: "USA",
    domain: "nvidia.com",
  },
  {
    isin: "US30303M1027",
    wkn: "A1JWVX",
    symbol: "META",
    name: "Meta Platforms Inc. (A)",
    kind: "STOCK",
    currency: "USD",
    sector: "Kommunikation",
    country: "USA",
    domain: "meta.com",
  },
  {
    isin: "US88160R1014",
    wkn: "A1CX3T",
    symbol: "TSLA",
    name: "Tesla Inc.",
    kind: "STOCK",
    currency: "USD",
    sector: "Zyklischer Konsum",
    country: "USA",
    domain: "tesla.com",
  },
  {
    isin: "US0846707026",
    wkn: "A0YJQ2",
    symbol: "BRK-B",
    name: "Berkshire Hathaway Inc. (B)",
    kind: "STOCK",
    currency: "USD",
    sector: "Finanzen",
    country: "USA",
    domain: "berkshirehathaway.com",
  },
  {
    isin: "US92826C8394",
    wkn: "A0NC7B",
    symbol: "V",
    name: "Visa Inc. (A)",
    kind: "STOCK",
    currency: "USD",
    sector: "Finanzen",
    country: "USA",
    domain: "visa.com",
  },
  {
    isin: "US57636Q1040",
    wkn: "A0F602",
    symbol: "MA",
    name: "Mastercard Inc. (A)",
    kind: "STOCK",
    currency: "USD",
    sector: "Finanzen",
    country: "USA",
    domain: "mastercard.com",
  },
  {
    isin: "US4781601046",
    wkn: "853260",
    symbol: "JNJ",
    name: "Johnson & Johnson",
    kind: "STOCK",
    currency: "USD",
    sector: "Gesundheit",
    country: "USA",
    domain: "jnj.com",
  },
  {
    isin: "US7427181091",
    wkn: "852062",
    symbol: "PG",
    name: "Procter & Gamble Co.",
    kind: "STOCK",
    currency: "USD",
    sector: "Basiskonsum",
    country: "USA",
    domain: "pg.com",
  },
  {
    isin: "US1912161007",
    wkn: "850663",
    symbol: "KO",
    name: "Coca-Cola Co.",
    kind: "STOCK",
    currency: "USD",
    sector: "Basiskonsum",
    country: "USA",
    domain: "coca-colacompany.com",
  },
  {
    isin: "US5801351017",
    wkn: "856958",
    symbol: "MCD",
    name: "McDonald's Corp.",
    kind: "STOCK",
    currency: "USD",
    sector: "Zyklischer Konsum",
    country: "USA",
    domain: "mcdonalds.com",
  },
  {
    isin: "US22160K1051",
    wkn: "888351",
    symbol: "COST",
    name: "Costco Wholesale Corp.",
    kind: "STOCK",
    currency: "USD",
    sector: "Basiskonsum",
    country: "USA",
    domain: "costco.com",
  },
  {
    isin: "US5324571083",
    wkn: "858560",
    symbol: "LLY",
    name: "Eli Lilly and Co.",
    kind: "STOCK",
    currency: "USD",
    sector: "Gesundheit",
    country: "USA",
    domain: "lilly.com",
  },
  {
    isin: "US91324P1021",
    wkn: "869561",
    symbol: "UNH",
    name: "UnitedHealth Group Inc.",
    kind: "STOCK",
    currency: "USD",
    sector: "Gesundheit",
    country: "USA",
    domain: "unitedhealthgroup.com",
  },
  {
    isin: "US46625H1005",
    wkn: "850628",
    symbol: "JPM",
    name: "JPMorgan Chase & Co.",
    kind: "STOCK",
    currency: "USD",
    sector: "Finanzen",
    country: "USA",
    domain: "jpmorganchase.com",
  },
  {
    isin: "US11135F1012",
    wkn: "A2JG9Z",
    symbol: "AVGO",
    name: "Broadcom Inc.",
    kind: "STOCK",
    currency: "USD",
    sector: "Technologie",
    country: "USA",
    domain: "broadcom.com",
  },
  {
    isin: "US7561091049",
    wkn: "899744",
    symbol: "O",
    name: "Realty Income Corp.",
    kind: "STOCK",
    currency: "USD",
    sector: "Immobilien",
    country: "USA",
    domain: "realtyincome.com",
  },
  {
    isin: "US64110L1061",
    wkn: "552484",
    symbol: "NFLX",
    name: "Netflix Inc.",
    kind: "STOCK",
    currency: "USD",
    sector: "Kommunikation",
    country: "USA",
    domain: "netflix.com",
  },
  {
    isin: "US0079031078",
    wkn: "863186",
    symbol: "AMD",
    name: "Advanced Micro Devices Inc.",
    kind: "STOCK",
    currency: "USD",
    sector: "Technologie",
    country: "USA",
    domain: "amd.com",
  },
  {
    isin: "US69608A1088",
    wkn: "A2QA4J",
    symbol: "PLTR",
    name: "Palantir Technologies Inc.",
    kind: "STOCK",
    currency: "USD",
    sector: "Technologie",
    country: "USA",
    domain: "palantir.com",
  },
  {
    isin: "US9311421039",
    wkn: "860853",
    symbol: "WMT",
    name: "Walmart Inc.",
    kind: "STOCK",
    currency: "USD",
    sector: "Basiskonsum",
    country: "USA",
    domain: "walmart.com",
  },
  {
    isin: "US7134481081",
    wkn: "851995",
    symbol: "PEP",
    name: "PepsiCo Inc.",
    kind: "STOCK",
    currency: "USD",
    sector: "Basiskonsum",
    country: "USA",
    domain: "pepsico.com",
  },
  // Deutschland
  {
    isin: "DE0007164600",
    wkn: "716460",
    symbol: "SAP.DE",
    name: "SAP SE",
    kind: "STOCK",
    currency: "EUR",
    sector: "Technologie",
    country: "Deutschland",
    domain: "sap.com",
  },
  {
    isin: "DE0007236101",
    wkn: "723610",
    symbol: "SIE.DE",
    name: "Siemens AG",
    kind: "STOCK",
    currency: "EUR",
    sector: "Industrie",
    country: "Deutschland",
    domain: "siemens.com",
  },
  {
    isin: "DE0008404005",
    wkn: "840400",
    symbol: "ALV.DE",
    name: "Allianz SE",
    kind: "STOCK",
    currency: "EUR",
    sector: "Finanzen",
    country: "Deutschland",
    domain: "allianz.com",
  },
  {
    isin: "DE0005557508",
    wkn: "555750",
    symbol: "DTE.DE",
    name: "Deutsche Telekom AG",
    kind: "STOCK",
    currency: "EUR",
    sector: "Kommunikation",
    country: "Deutschland",
    domain: "telekom.com",
  },
  {
    isin: "DE0007100000",
    wkn: "710000",
    symbol: "MBG.DE",
    name: "Mercedes-Benz Group AG",
    kind: "STOCK",
    currency: "EUR",
    sector: "Zyklischer Konsum",
    country: "Deutschland",
    domain: "mercedes-benz.com",
  },
  {
    isin: "DE000BASF111",
    wkn: "BASF11",
    symbol: "BAS.DE",
    name: "BASF SE",
    kind: "STOCK",
    currency: "EUR",
    sector: "Grundstoffe",
    country: "Deutschland",
    domain: "basf.com",
  },
  {
    isin: "DE0008430026",
    wkn: "843002",
    symbol: "MUV2.DE",
    name: "Münchener Rück AG",
    kind: "STOCK",
    currency: "EUR",
    sector: "Finanzen",
    country: "Deutschland",
    domain: "munichre.com",
  },
  {
    isin: "DE0007030009",
    wkn: "703000",
    symbol: "RHM.DE",
    name: "Rheinmetall AG",
    kind: "STOCK",
    currency: "EUR",
    sector: "Industrie",
    country: "Deutschland",
    domain: "rheinmetall.com",
  },
  {
    isin: "DE0006231004",
    wkn: "623100",
    symbol: "IFX.DE",
    name: "Infineon Technologies AG",
    kind: "STOCK",
    currency: "EUR",
    sector: "Technologie",
    country: "Deutschland",
    domain: "infineon.com",
  },
  {
    isin: "DE000A1EWWW0",
    wkn: "A1EWWW",
    symbol: "ADS.DE",
    name: "adidas AG",
    kind: "STOCK",
    currency: "EUR",
    sector: "Zyklischer Konsum",
    country: "Deutschland",
    domain: "adidas.com",
  },
  {
    isin: "DE0005552004",
    wkn: "555200",
    symbol: "DHL.DE",
    name: "DHL Group",
    kind: "STOCK",
    currency: "EUR",
    sector: "Industrie",
    country: "Deutschland",
    domain: "dhl.com",
  },
  {
    isin: "DE0005190003",
    wkn: "519000",
    symbol: "BMW.DE",
    name: "BMW AG",
    kind: "STOCK",
    currency: "EUR",
    sector: "Zyklischer Konsum",
    country: "Deutschland",
    domain: "bmw.com",
  },
  {
    isin: "DE0007664039",
    wkn: "766403",
    symbol: "VOW3.DE",
    name: "Volkswagen AG Vz.",
    kind: "STOCK",
    currency: "EUR",
    sector: "Zyklischer Konsum",
    country: "Deutschland",
    domain: "volkswagen.com",
  },
  {
    isin: "DE000BAY0017",
    wkn: "BAY001",
    symbol: "BAYN.DE",
    name: "Bayer AG",
    kind: "STOCK",
    currency: "EUR",
    sector: "Gesundheit",
    country: "Deutschland",
    domain: "bayer.com",
  },
  {
    isin: "DE0005140008",
    wkn: "514000",
    symbol: "DBK.DE",
    name: "Deutsche Bank AG",
    kind: "STOCK",
    currency: "EUR",
    sector: "Finanzen",
    country: "Deutschland",
    domain: "db.com",
  },
  // Europa
  {
    isin: "NL0010273215",
    wkn: "A1J4U4",
    symbol: "ASML.AS",
    name: "ASML Holding N.V.",
    kind: "STOCK",
    currency: "EUR",
    sector: "Technologie",
    country: "Niederlande",
    domain: "asml.com",
  },
  {
    isin: "FR0000121014",
    wkn: "853292",
    symbol: "MC.PA",
    name: "LVMH Moët Hennessy Louis Vuitton",
    kind: "STOCK",
    currency: "EUR",
    sector: "Zyklischer Konsum",
    country: "Frankreich",
    domain: "lvmh.com",
  },
  {
    isin: "DK0062498333",
    wkn: "A3EU6F",
    symbol: "NOVO-B.CO",
    name: "Novo Nordisk A/S (B)",
    kind: "STOCK",
    currency: "DKK",
    sector: "Gesundheit",
    country: "Dänemark",
    domain: "novonordisk.com",
  },
  {
    isin: "CH0038863350",
    wkn: "A0Q4DC",
    symbol: "NESN.SW",
    name: "Nestlé S.A.",
    kind: "STOCK",
    currency: "CHF",
    sector: "Basiskonsum",
    country: "Schweiz",
    domain: "nestle.com",
  },
  {
    isin: "FR0000120271",
    wkn: "850727",
    symbol: "TTE.PA",
    name: "TotalEnergies SE",
    kind: "STOCK",
    currency: "EUR",
    sector: "Energie",
    country: "Frankreich",
    domain: "totalenergies.com",
  },
  {
    isin: "NL0000235190",
    wkn: "938914",
    symbol: "AIR.PA",
    name: "Airbus SE",
    kind: "STOCK",
    currency: "EUR",
    sector: "Industrie",
    country: "Niederlande",
    domain: "airbus.com",
  },
  // ETFs
  {
    isin: "IE00B4L5Y983",
    wkn: "A0RPWH",
    symbol: "EUNL.DE",
    name: "iShares Core MSCI World UCITS ETF (Acc)",
    kind: "ETF",
    currency: "EUR",
    sector: null,
    country: "Welt",
  },
  {
    isin: "IE00B3RBWM25",
    wkn: "A1JX52",
    symbol: "VGWL.DE",
    name: "Vanguard FTSE All-World UCITS ETF (Dist)",
    kind: "ETF",
    currency: "EUR",
    sector: null,
    country: "Welt",
  },
  {
    isin: "IE00BK5BQT80",
    wkn: "A2PKXG",
    symbol: "VWCE.DE",
    name: "Vanguard FTSE All-World UCITS ETF (Acc)",
    kind: "ETF",
    currency: "EUR",
    sector: null,
    country: "Welt",
  },
  {
    isin: "IE00BKM4GZ66",
    wkn: "A111X9",
    symbol: "IS3N.DE",
    name: "iShares Core MSCI EM IMI UCITS ETF (Acc)",
    kind: "ETF",
    currency: "EUR",
    sector: null,
    country: "Schwellenländer",
  },
  {
    isin: "IE00BJ0KDQ92",
    wkn: "A1XB5U",
    symbol: "XDWD.DE",
    name: "Xtrackers MSCI World UCITS ETF 1C",
    kind: "ETF",
    currency: "EUR",
    sector: null,
    country: "Welt",
  },
  {
    isin: "IE00B5BMR087",
    wkn: "A0YEDG",
    symbol: "SXR8.DE",
    name: "iShares Core S&P 500 UCITS ETF (Acc)",
    kind: "ETF",
    currency: "EUR",
    sector: null,
    country: "USA",
  },
  {
    isin: "IE00B53SZB19",
    wkn: "A0YEDL",
    symbol: "SXRV.DE",
    name: "iShares NASDAQ 100 UCITS ETF (Acc)",
    kind: "ETF",
    currency: "EUR",
    sector: null,
    country: "USA",
  },
  {
    isin: "IE00B6R52259",
    wkn: "A1JMDF",
    symbol: "IUSQ.DE",
    name: "iShares MSCI ACWI UCITS ETF (Acc)",
    kind: "ETF",
    currency: "EUR",
    sector: null,
    country: "Welt",
  },
  {
    isin: "DE0005933931",
    wkn: "593393",
    symbol: "EXS1.DE",
    name: "iShares Core DAX UCITS ETF (DE)",
    kind: "ETF",
    currency: "EUR",
    sector: null,
    country: "Deutschland",
  },
  {
    isin: "IE00B3YLTY66",
    wkn: "A1JJTD",
    symbol: "SPYI.DE",
    name: "SPDR MSCI ACWI IMI UCITS ETF",
    kind: "ETF",
    currency: "EUR",
    sector: null,
    country: "Welt",
  },
  {
    isin: "IE00BTJRMP35",
    wkn: "A12GVR",
    symbol: "XMME.DE",
    name: "Xtrackers MSCI Emerging Markets UCITS ETF 1C",
    kind: "ETF",
    currency: "EUR",
    sector: null,
    country: "Schwellenländer",
  },
  {
    isin: "IE00B1XNHC34",
    wkn: "A0MW0M",
    symbol: "IQQH.DE",
    name: "iShares Global Clean Energy UCITS ETF",
    kind: "ETF",
    currency: "EUR",
    sector: null,
    country: "Welt",
  },
];

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const WKN_RE = /^[A-Z0-9]{6}$/;

export function looksLikeIsin(q: string): boolean {
  return ISIN_RE.test(q.trim().toUpperCase());
}

export function looksLikeWkn(q: string): boolean {
  const s = q.trim().toUpperCase();
  return WKN_RE.test(s) && /\d/.test(s);
}

/** Prüft die ISIN-Prüfziffer (Luhn über die in Ziffern umgewandelten Zeichen). */
export function isValidIsin(isin: string): boolean {
  const s = isin.trim().toUpperCase();
  if (!ISIN_RE.test(s)) return false;
  const digits = s
    .split("")
    .map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c))
    .join("");
  let total = 0;
  let double = true;
  for (let i = digits.length - 2; i >= 0; i--) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    total += n;
    double = !double;
  }
  const check = (10 - (total % 10)) % 10;
  return check === Number(digits[digits.length - 1]);
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function catalogEntryToResult(e: CatalogEntry): SearchResult {
  return {
    symbol: e.symbol,
    name: e.name,
    exchange: null,
    kind: e.kind,
    currency: e.currency,
    isin: e.isin,
    wkn: e.wkn,
    sector: e.sector,
    country: e.country,
    origin: "catalog",
  };
}

/** Durchsucht den Katalog nach Name, Ticker, ISIN oder WKN. */
export function searchCatalog(query: string, limit = 8): SearchResult[] {
  const q = query.trim();
  if (!q) return [];
  const upper = q.toUpperCase();
  const nq = normalize(q);
  const scored: Array<{ e: CatalogEntry; score: number }> = [];
  for (const e of CATALOG) {
    let score = 0;
    if (e.isin === upper || e.wkn === upper) score = 100;
    else if (e.symbol.toUpperCase() === upper || e.symbol.split(".")[0].toUpperCase() === upper) score = 90;
    else if (normalize(e.name).startsWith(nq)) score = 70;
    else if (normalize(e.name).includes(nq)) score = 50;
    else if (e.symbol.toUpperCase().startsWith(upper)) score = 40;
    else if (e.isin.startsWith(upper) && upper.length >= 4) score = 30;
    if (score > 0) scored.push({ e, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name, "de"))
    .slice(0, limit)
    .map(({ e }) => catalogEntryToResult(e));
}

export function catalogByIsin(isin: string): CatalogEntry | undefined {
  const s = isin.trim().toUpperCase();
  return CATALOG.find((e) => e.isin === s);
}

export function catalogBySymbol(symbol: string): CatalogEntry | undefined {
  return CATALOG.find((e) => e.symbol === symbol);
}
