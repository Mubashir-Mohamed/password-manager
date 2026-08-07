import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../cn.js";

export type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

// 60/30/10 rule (mobile design plan §2): accent fill reserved for the primary
// action only. Secondary uses a 5%-opacity accent tint per the base design
// skill's "secondary buttons at 5% accent opacity" rule. Destructive stays
// text/border-only until confirmed — a solid danger-fill button reads as
// alarming for routine use (mobile plan §1 "never make security feel scary").
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] hover:brightness-110 active:brightness-95",
  secondary: "bg-accent/10 text-accent hover:bg-accent/[0.15]",
  destructive: "bg-transparent text-danger border border-danger/40 hover:bg-danger/10",
  ghost: "bg-transparent text-current hover:bg-white/5",
};

export function Button({ variant = "primary", className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-sm px-6 py-3 text-sm font-semibold",
        "transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
