import type { StrengthResult } from "@password-manager/core-domain";
import { cn } from "../cn.js";

export interface StrengthMeterProps {
  result: StrengthResult;
  className?: string;
}

const SEGMENT_COLOR: Record<StrengthResult["score"], string> = {
  0: "bg-danger",
  1: "bg-danger",
  2: "bg-warning",
  3: "bg-success",
  4: "bg-success",
};

const LABEL_TEXT: Record<StrengthResult["label"], string> = {
  "very-weak": "Very weak",
  weak: "Weak",
  fair: "Fair",
  strong: "Strong",
  "very-strong": "Very strong",
};

/** Color is never the sole signal (design plan §7 Accessibility) — always
 * paired with the text label and the numeric entropy readout. */
export function StrengthMeter({ result, className }: StrengthMeterProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex gap-1" role="img" aria-label={`Password strength: ${LABEL_TEXT[result.label]}`}>
        {[0, 1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              segment <= result.score ? SEGMENT_COLOR[result.score] : "bg-white/10",
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-white/85">{LABEL_TEXT[result.label]}</span>
        <span className="font-mono font-mono-nums text-white/60">{result.entropyBits} bits</span>
      </div>
    </div>
  );
}
