import type { HTMLAttributes } from "react";
import { cn } from "../cn.js";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // Dark theme: hairline border, no shadow (design plan §2 "Shadows &
        // Surfaces" — shadows read poorly on dark backgrounds).
        "rounded-md border border-white/[0.08] bg-surface p-6",
        "dark:border-white/[0.08] dark:bg-surface",
        className,
      )}
      {...props}
    />
  );
}
