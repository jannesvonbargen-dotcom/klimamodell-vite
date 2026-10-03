/** Deutsche Anzeigenamen für Sektor-/Branchenbezeichnungen des Anbieters (Originalwert bleibt für die Konfiguration maßgeblich). */

const SECTORS: Record<string, string> = {
  Technology: "Technologie",
  "Consumer Cyclical": "Zyklischer Konsum",
  "Consumer Defensive": "Basiskonsum",
  "Communication Services": "Kommunikation",
  "Financial Services": "Finanzen",
  Healthcare: "Gesundheit",
  Industrials: "Industrie",
  Energy: "Energie",
  Utilities: "Versorger",
  "Real Estate": "Immobilien",
  "Basic Materials": "Grundstoffe",
};

const INDUSTRIES: Record<string, string> = {
  "Consumer Electronics": "Unterhaltungselektronik",
  "Specialty Retail": "Einzelhandel",
  "Discount Stores": "Discount- und Großhandel",
  "Internet Content & Information": "Internetdienste",
  "Banks - Diversified": "Universalbank",
  "Banks - Regional": "Regionalbank",
  "Insurance - Diversified": "Versicherung",
  "Software - Infrastructure": "Software & Cloud",
  "Software - Application": "Anwendungssoftware",
  Semiconductors: "Halbleiter",
  "Financial - Credit Services": "Zahlungsverkehr",
  "Drug Manufacturers - General": "Pharma",
};

export const sectorLabel = (s: string) => SECTORS[s] ?? s;
export const industryLabel = (s: string) => INDUSTRIES[s] ?? s;
