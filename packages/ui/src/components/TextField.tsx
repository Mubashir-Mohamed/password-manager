import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../cn.js";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, className, id, ...props },
  ref,
) {
  const inputId = id ?? props.name;
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-white/85">
          {label}
        </label>
      )}
      <input
        id={inputId}
        ref={ref}
        className={cn(
          "rounded-sm border border-white/[0.08] bg-base px-4 py-3 text-sm text-white/95",
          "placeholder:text-white/35 outline-none transition-colors",
          "focus:border-accent focus:ring-1 focus:ring-accent",
          error && "border-danger focus:border-danger focus:ring-danger",
          className,
        )}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-white/60">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
