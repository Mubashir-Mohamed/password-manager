import { useState } from "react";
import { cn } from "../cn.js";

export interface PasswordFieldProps {
  value: string;
  label?: string;
  /** Presence switches the field into editable mode (item add/edit forms) —
   * absence keeps the original read-only "whole field is a reveal button"
   * behavior (e.g. viewing a field nothing on screen should let you edit). */
  onChange?: (value: string) => void;
  placeholder?: string;
  /** Item Detail treats the whole field as tappable to reveal in read-only
   * mode, not a corner icon (mobile design plan §4.4). In editable mode the
   * field itself must stay focusable/typeable, so reveal is a clearly
   * labeled "Show/Hide" button instead — same masked-by-default intent,
   * adapted for the one case where "the whole field is the button" isn't
   * possible. */
  onCopy?: () => void;
  className?: string;
}

/** Masked-by-default field with tap-to-reveal and copy — the shared pattern
 * behind vault item passwords. Monospace once revealed (design plan §2
 * Typography — tabular numerals/mono for anything that must be read
 * character-by-character). */
export function PasswordField({ value, label, onChange, placeholder, onCopy, className }: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);

  if (onChange) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        {label && <span className="text-xs font-medium text-white/60">{label}</span>}
        <div className="flex items-center gap-2">
          <input
            type={revealed ? "text" : "password"}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className={cn(
              "flex-1 rounded-sm border border-white/[0.08] bg-base px-4 py-3 text-sm text-white/95",
              "placeholder:text-white/35 focus:border-accent/50 focus:outline-none",
              revealed && "font-mono font-mono-nums tracking-wide",
            )}
          />
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            aria-pressed={revealed}
            aria-label={revealed ? `${label ?? "Password"}, visible. Tap to hide.` : `${label ?? "Password"}, hidden. Tap to reveal.`}
            className="shrink-0 rounded-sm border border-white/[0.08] px-3 py-3 text-xs font-semibold text-white/70 hover:border-white/20 hover:text-white/95"
          >
            {revealed ? "Hide" : "Show"}
          </button>
        </div>
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
