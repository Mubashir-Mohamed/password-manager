import { useMemo, useState } from "react";
import { Button, Card, StrengthMeter } from "@password-manager/ui";
import {
  DEFAULT_PASSWORD_OPTIONS,
  estimatePasswordEntropyBits,
  generatePassphrase,
  generatePassword,
  scorePasswordStrength,
  type PasswordOptions,
} from "@password-manager/core-domain";
import { useAppStore } from "../state/store.js";

/** The generated result is the visual hero, not the controls (mobile design
 * plan §4.5 / base design skill "emphasize values over labels"). */
export function GeneratorScreen() {
  const showToast = useAppStore((s) => s.showToast);
  const [mode, setMode] = useState<"password" | "passphrase">("password");
  const [options, setOptions] = useState<PasswordOptions>(DEFAULT_PASSWORD_OPTIONS);
  const [value, setValue] = useState(() => generatePassword(DEFAULT_PASSWORD_OPTIONS));

  const strength = useMemo(() => scorePasswordStrength(value), [value]);

  function regenerate(nextOptions: PasswordOptions = options) {
    setValue(mode === "password" ? generatePassword(nextOptions) : generatePassphrase());
  }

  async function copy() {
    await navigator.clipboard.writeText(value);
    showToast({ message: "Copied — clears in 30s", tone: "default" });
    setTimeout(() => navigator.clipboard.writeText("").catch(() => {}), 30_000);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-5 py-6">
      <h1 className="text-lg font-semibold text-white/95">Generator</h1>

      <Card className="flex flex-col gap-4">
        <p className="break-all text-center font-mono font-mono-nums text-xl text-white/95">{value}</p>
        <StrengthMeter
          result={
            mode === "password"
              ? { ...strength, entropyBits: estimatePasswordEntropyBits(value, charsetSize(options)) }
              : strength
          }
        />
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => regenerate()}>
            Regenerate
          </Button>
          <Button className="flex-1" onClick={copy}>
            Copy
          </Button>
        </div>
      </Card>

      <div className="flex gap-2">
        <Button
          variant={mode === "password" ? "primary" : "ghost"}
          onClick={() => {
            setMode("password");
            setValue(generatePassword(options));
          }}
        >
          Password
        </Button>
        <Button
          variant={mode === "passphrase" ? "primary" : "ghost"}
          onClick={() => {
            setMode("passphrase");
            setValue(generatePassphrase());
          }}
        >
          Passphrase
        </Button>
      </div>

      {mode === "password" && (
        <Card className="flex flex-col gap-4">
          <label className="flex items-center justify-between text-sm text-white/85">
            Length: {options.length}
            <input
              type="range"
              min={8}
              max={64}
              value={options.length}
              onChange={(e) => {
                const next = { ...options, length: Number(e.target.value) };
                setOptions(next);
                regenerate(next);
              }}
              className="ml-4 flex-1 accent-accent"
            />
          </label>
          {(
            [
              ["useUpper", "Uppercase (A-Z)"],
              ["useLower", "Lowercase (a-z)"],
              ["useNumbers", "Numbers (0-9)"],
              ["useSymbols", "Symbols (!@#$…)"],
              ["avoidAmbiguous", "Avoid ambiguous characters"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between text-sm text-white/85">
              {label}
              <input
                type="checkbox"
                checked={options[key]}
                onChange={(e) => {
                  const next = { ...options, [key]: e.target.checked };
                  setOptions(next);
                  regenerate(next);
                }}
                className="h-4 w-4 rounded border-white/20 bg-base accent-accent"
              />
            </label>
          ))}
        </Card>
      )}
    </div>
  );
}

function charsetSize(options: PasswordOptions): number {
  let size = 0;
  if (options.useLower) size += 26;
  if (options.useUpper) size += 26;
  if (options.useNumbers) size += 10;
  if (options.useSymbols) size += 33;
  return size || 1;
}
