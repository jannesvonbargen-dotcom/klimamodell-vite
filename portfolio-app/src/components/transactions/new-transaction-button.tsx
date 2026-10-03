"use client";

import { PlusIcon } from "lucide-react";
import type { TransactionDefaults } from "../transaction-dialog";
import { useTransactionDialog } from "../transaction-dialog";
import { Button } from "../ui/button";
import { Kbd } from "../ui/misc";

export function NewTransactionButton({ label = "Transaktion", defaults, variant = "primary" }: { label?: string; defaults?: TransactionDefaults; variant?: "primary" | "secondary" | "outline" }) {
  const { openCreate } = useTransactionDialog();
  return (
    <Button variant={variant} onClick={() => openCreate(defaults)}>
      <PlusIcon />
      {label}
      {!defaults && variant === "primary" && <Kbd className="ml-1 hidden border-transparent bg-primary-foreground/15 text-primary-foreground/80 sm:inline-flex">N</Kbd>}
    </Button>
  );
}
