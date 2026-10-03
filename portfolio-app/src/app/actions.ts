"use server";

import { revalidatePath } from "next/cache";
import { removeDemoData, seedDemoData } from "@/db/seed";
import type { ImportCandidate } from "@/import/types";
import { backupDatabaseFile, restoreBackup, type RestoreResult, wipeAllData } from "@/server/backup";
import { clearMarketCache } from "@/server/settings";
import {
  confirmExecution,
  deleteSavingsPlan,
  saveSavingsPlan,
  type SavingsPlanInput,
  setSavingsPlanActive,
  skipExecution,
} from "@/server/savings";
import { addSplit, deleteSplit, updateInstrument } from "@/server/repo";
import {
  addToWatchlist,
  removeFromWatchlist,
  removeSymbolFromWatchlist,
  updateWatchlistItem,
  type WatchlistInput,
} from "@/server/watchlist";
import { commitImport, type CommitResult, type ImportPreview, previewImport, restoreImportBatch, undoImportBatch } from "@/server/import";
import {
  type ActionResult,
  createTransaction,
  deleteTransaction,
  type TransactionInput,
  undoDeleteTransaction,
  updateTransaction,
} from "@/server/transactions";

/**
 * Server Actions für Transaktionen. Die App läuft nur lokal (127.0.0.1);
 * Next.js prüft zusätzlich Origin/Host gegen CSRF, proxy.ts sperrt fremde Hosts.
 */

function refresh() {
  revalidatePath("/", "layout");
}

export async function createTransactionAction(input: TransactionInput): Promise<ActionResult<{ id: number }>> {
  const result = createTransaction(input);
  if (result.ok) refresh();
  return result;
}

export async function updateTransactionAction(id: number, input: TransactionInput): Promise<ActionResult<{ id: number }>> {
  const result = updateTransaction(id, input);
  if (result.ok) refresh();
  return result;
}

export async function deleteTransactionAction(id: number): Promise<ActionResult> {
  const result = deleteTransaction(id);
  if (result.ok) refresh();
  return result;
}

export async function restoreTransactionAction(id: number): Promise<ActionResult> {
  const result = undoDeleteTransaction(id);
  refresh();
  return result;
}

// Import -------------------------------------------------------------------

export async function previewImportAction(candidates: ImportCandidate[]): Promise<ImportPreview> {
  return previewImport(candidates.slice(0, 20_000));
}

export async function commitImportAction(candidates: ImportCandidate[], fileName: string, preset: string): Promise<CommitResult> {
  const result = await commitImport(candidates.slice(0, 20_000), fileName, preset);
  refresh();
  return result;
}

export async function undoImportAction(batchId: number): Promise<number> {
  const count = undoImportBatch(batchId);
  refresh();
  return count;
}

export async function restoreImportAction(batchId: number): Promise<void> {
  restoreImportBatch(batchId);
  refresh();
}

// Sparpläne ----------------------------------------------------------------

export async function saveSavingsPlanAction(id: number | null, input: SavingsPlanInput): Promise<ActionResult<{ id: number }>> {
  const result = saveSavingsPlan(id, input);
  if (result.ok) refresh();
  return result;
}

export async function setSavingsPlanActiveAction(id: number, active: boolean): Promise<void> {
  setSavingsPlanActive(id, active);
  refresh();
}

export async function deleteSavingsPlanAction(id: number): Promise<void> {
  deleteSavingsPlan(id);
  refresh();
}

export async function confirmExecutionAction(planId: number, dueDate: string, price?: string): Promise<ActionResult<{ id: number }>> {
  const result = await confirmExecution(planId, dueDate, price);
  if (result.ok) refresh();
  return result;
}

export async function skipExecutionAction(planId: number, dueDate: string): Promise<void> {
  skipExecution(planId, dueDate);
  refresh();
}

// Instrumente & Splits -------------------------------------------------------

export async function updateInstrumentAction(
  id: number,
  patch: { symbol?: string; name?: string; currency?: string; sector?: string | null; country?: string | null; kind?: "STOCK" | "ETF" },
): Promise<ActionResult> {
  const errors: Record<string, string> = {};
  if (patch.symbol !== undefined && !/^[A-Za-z0-9.\-=^]{1,20}$/.test(patch.symbol.trim())) errors.symbol = "Ungültiges Symbol.";
  if (patch.name !== undefined && patch.name.trim().length < 1) errors.name = "Name fehlt.";
  if (patch.currency !== undefined && !/^[A-Z]{3}$|^GBp$/.test(patch.currency.trim())) errors.currency = "Währung als Code, z. B. EUR.";
  if (Object.keys(errors).length) return { ok: false, errors };
  updateInstrument(id, {
    ...patch,
    symbol: patch.symbol?.trim(),
    name: patch.name?.trim(),
    currency: patch.currency?.trim(),
  });
  refresh();
  return { ok: true };
}

export async function addSplitAction(
  instrumentId: number,
  effectiveDate: string,
  ratioFrom: string,
  ratioTo: string,
): Promise<ActionResult> {
  const from = Number(ratioFrom.replace(",", "."));
  const to = Number(ratioTo.replace(",", "."));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return { ok: false, errors: { effectiveDate: "Datum fehlt." } };
  if (!(from > 0) || !(to > 0) || from === to) return { ok: false, errors: { ratio: "Verhältnis z. B. 1 : 4 angeben." } };
  addSplit(instrumentId, effectiveDate, String(from), String(to), `Aktiensplit ${from}:${to}`);
  refresh();
  return { ok: true };
}

export async function deleteSplitAction(id: number): Promise<void> {
  deleteSplit(id);
  refresh();
}

// Watchlist ------------------------------------------------------------------

export async function addToWatchlistAction(input: WatchlistInput): Promise<ActionResult<{ id: number }>> {
  const result = addToWatchlist(input);
  if (result.ok) refresh();
  return result;
}

export async function removeFromWatchlistAction(id: number): Promise<void> {
  removeFromWatchlist(id);
  refresh();
}

export async function removeSymbolFromWatchlistAction(symbol: string): Promise<void> {
  removeSymbolFromWatchlist(symbol);
  refresh();
}

export async function updateWatchlistItemAction(
  id: number,
  patch: { alertAbove?: string | null; alertBelow?: string | null; note?: string | null },
): Promise<ActionResult> {
  const result = updateWatchlistItem(id, patch);
  if (result.ok) refresh();
  return result;
}

// Einstellungen & Sicherung -------------------------------------------------------

export async function restoreBackupAction(json: string): Promise<RestoreResult> {
  const result = await restoreBackup(json);
  if (result.ok) refresh();
  return result;
}

export async function wipeAllDataAction(): Promise<{ backupFile: string | null }> {
  const result = await wipeAllData();
  refresh();
  return result;
}

export async function loadDemoDataAction(): Promise<{ transactions: number }> {
  const result = await seedDemoData();
  refresh();
  return result;
}

export async function removeDemoDataAction(): Promise<void> {
  await backupDatabaseFile("vor-demo-entfernen");
  removeDemoData();
  refresh();
}

export async function clearMarketCacheAction(): Promise<void> {
  clearMarketCache();
  refresh();
}
