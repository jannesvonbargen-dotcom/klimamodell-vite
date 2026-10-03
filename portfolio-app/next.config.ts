import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native SQLite-Bindung nicht bündeln
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  images: { unoptimized: true },
  devIndicators: false,
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
