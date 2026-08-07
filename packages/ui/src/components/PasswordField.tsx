import { useState } from "react";
import { cn } from "../cn.js";

export interface PasswordFieldProps {
  value: string;
  label?: string;
  /** Item Detail treats the whole field as tappable to reveal, not a corner
   * icon (mobile design plan §4.4). */
  onCopy?: () => void;
  className?: string;
}

/** Masked-by-default field with tap-to-reveal and copy — the shared pattern
 * behind vault item passwords and the Secret Key display. Monospace once
 * revealed (design plan §2 Typography — tabular numerals/mono for anything
 * that must be read character-by-character). */
export function PasswordField({ value, label, onCopy, className }: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && <span className="text-xs font-medium text-white/60">{label}</span>}
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        aria-pressed={revealed}
        aria-label={revealed ? `${label ?? "Password"}, visible. Double-tap to hide.` : `${label ?? "Password"}, hidden. Double-tap to reveal.`}
        className={cn(
          "flex items-center justify-between rounded-sm border border-white/[0.08] bg-base px-4 py-3 text-left",
          "hover:border-white/20 transition-colors",
        )}
      >
        <span className={cn("text-sm text-white/95", revealed && "font-mono font-mono-nums tracking-wide")}>
          {revealed ? value : "•".repeat(Math.min(value.length, 20) || 12)}
        </span>
        <span className="text-xs text-accent">{revealed ? "Hide" : "Reveal"}</span>
      </button>
      {onCopy && (
        <button
          type="button"
          onClick={onCopy}
          className="self-start text-xs font-semibold text-accent hover:brightness-110"
        >
          Copy — clears in 30s
        </button>
      )}
    </div>
  );
}
