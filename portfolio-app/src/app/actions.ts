"use server";

import { revalidatePath } from "next/cache";
import type { ImportCandidate } from "@/import/types";
import { confirmExecution, deleteSavingsPlan, saveSavingsPlan, type SavingsPlanInput, setSavingsPlanActive, skipExecution } from "@/server/savings";
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
