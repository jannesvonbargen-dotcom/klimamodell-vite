import { Label as LabelPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "h-10 w-full min-w-0 rounded-lg border border-border-strong bg-surface px-3 text-[14px] text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-subtle focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--ring)] focus-visible:outline-none disabled:opacity-50 aria-invalid:border-down aria-invalid:focus-visible:shadow-[0_0_0_3px_var(--down-soft)]";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputClass, "h-auto min-h-20 py-2", className)} {...props} />;
}

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn("text-[13px] font-medium text-muted", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-[12px] text-down" role="alert" id={htmlFor ? `${htmlFor}-error` : undefined}>
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
