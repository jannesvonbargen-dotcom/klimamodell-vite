"use server";

import { revalidatePath } from "next/cache";
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
