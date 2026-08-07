import type { ReactNode } from "react";
import { cn } from "../cn.js";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** Turns a blank state into an invitation to act (design plan §4.10 / frontend
 * writing guidance "an empty screen is an invitation to act") — never a bare
 * "No items found." */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 py-16 text-center", className)}>
      {icon && <div className="text-white/40">{icon}</div>}
      <h3 className="text-md font-semibold text-white/95">{title}</h3>
      {description && <p className="max-w-xs text-sm text-white/60">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
