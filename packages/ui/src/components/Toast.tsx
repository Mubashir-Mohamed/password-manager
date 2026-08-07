import { cn } from "../cn.js";

export type ToastTone = "default" | "success" | "warning" | "danger";

export interface ToastProps {
  message: string;
  tone?: ToastTone;
  className?: string;
}

const TONE_ACCENT: Record<ToastTone, string> = {
  default: "border-l-accent",
  success: "border-l-success",
  warning: "border-l-warning",
  danger: "border-l-danger",
};

/** Bottom-anchored, understated — confirms without demanding attention (design
 * plan §1 "consistency over flourish"). Render inside a fixed-position portal
 * at the app shell level; this component is just the visual. */
export function Toast({ message, tone = "default", className }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-3 rounded-sm border-l-2 bg-surface px-4 py-3 text-sm text-white/95 shadow-lg",
        TONE_ACCENT[tone],
        className,
      )}
    >
      {message}
    </div>
  );
}
