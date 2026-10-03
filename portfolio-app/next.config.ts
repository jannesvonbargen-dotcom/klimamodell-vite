import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native SQLite-Bindung nicht bündeln
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  images: { unoptimized: true },
  devIndicators: false,
  turbopack: { root: path.resolve(__dirname) },
  // CSV-Importe und Backups können größer als das Standardlimit (1 MB) sein
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
};

export default nextConfig;
