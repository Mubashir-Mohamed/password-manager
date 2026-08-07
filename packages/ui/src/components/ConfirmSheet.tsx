import type { ReactNode } from "react";
import { Button } from "./Button.js";

export interface ConfirmSheetProps {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

/** Explicit confirmation step for irreversible-feeling actions (sharing an
 * item, revoking access) — design plan §4.8 "irreversible-feeling actions get
 * a confirm screen, not just a toast." */
export function ConfirmSheet({
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
  onCancel,
  children,
}: ConfirmSheetProps) {
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-sheet-title" className="rounded-lg bg-surface p-6">
      <h2 id="confirm-sheet-title" className="text-md font-semibold text-white/95">
        {title}
      </h2>
      {description && <p className="mt-2 text-sm text-white/60">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={destructive ? "destructive" : "primary"} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
