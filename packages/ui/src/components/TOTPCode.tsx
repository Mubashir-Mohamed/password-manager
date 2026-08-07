import { cn } from "../cn.js";

export interface TOTPCodeProps {
  code: string;
  remainingSeconds: number;
  period?: number;
  className?: string;
}

/** Large monospace code + circular countdown ring — the "peak moment" per
 * both design docs (mobile §5 / desktop §5): should read instantly, like a
 * boarding pass. */
export function TOTPCode({ code, remainingSeconds, period = 30, className }: TOTPCodeProps) {
  const fraction = Math.max(0, Math.min(1, remainingSeconds / period));
  const isLow = remainingSeconds <= 5;
  const radius = 16;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <span className="font-mono font-mono-nums text-2xl tracking-[0.2em] text-white/95">
        {code.replace(/(\d{3})(\d{3,4})/, "$1 $2")}
      </span>
      <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0" aria-hidden="true">
        <circle cx="18" cy="18" r={radius} fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth={3} />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke={isLow ? "var(--totp-low, #F5A524)" : "var(--totp-normal, #6C5CE7)"}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          transform="rotate(-90 18 18)"
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <span className="sr-only">{remainingSeconds} seconds remaining</span>
    </div>
  );
}
