import React from "react";
import { RotateCcw, AlertTriangle, Sparkles, Sliders } from "lucide-react";

export interface SolarOverrideFieldProps {
  label: string;
  fieldKey: string;
  effectiveValue: number | string;
  autoValue: number | string;
  isOverridden: boolean;
  unit?: string;
  warning?: string;
  hint?: string;
  type?: "number" | "text" | "select";
  options?: { value: number | string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  onValueChange: (val: any) => void;
  onResetToAuto: () => void;
  disabled?: boolean;
}

export const SolarOverrideField: React.FC<SolarOverrideFieldProps> = ({
  label,
  fieldKey,
  effectiveValue,
  autoValue,
  isOverridden,
  unit,
  warning,
  hint,
  type = "number",
  options,
  min,
  max,
  step,
  onValueChange,
  onResetToAuto,
  disabled = false,
}) => {
  return (
    <div className="space-y-1.5" id={`override-field-${fieldKey}`}>
      <div className="flex items-center justify-between gap-1.5">
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 truncate">
          <span>{label}</span>
          {unit && <span className="text-[11px] font-normal text-slate-400">({unit})</span>}
        </label>

        <div className="flex items-center gap-1 shrink-0">
          {isOverridden ? (
            <>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300/80 dark:border-amber-800/80">
                <Sliders className="w-2.5 h-2.5" />
                <span>MANUAL</span>
              </span>
              <button
                type="button"
                onClick={onResetToAuto}
                title={`Reset to auto calculated default (${autoValue}${unit ? ` ${unit}` : ""})`}
                className="p-1 text-slate-400 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 rounded transition"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </>
          ) : (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 border border-sky-200/70 dark:border-sky-800/60">
              <Sparkles className="w-2.5 h-2.5 text-sky-500" />
              <span>AUTO</span>
            </span>
          )}
        </div>
      </div>

      <div className="relative">
        {type === "select" && options ? (
          <select
            value={effectiveValue}
            onChange={(e) => {
              const val = e.target.value;
              const parsed = typeof autoValue === "number" ? (val === "" ? "" : Number(val)) : val;
              onValueChange(parsed);
            }}
            disabled={disabled}
            className={`w-full px-3 py-2 text-xs font-bold rounded-xl border transition focus:ring-2 focus:outline-none ${
              isOverridden
                ? "border-amber-300 dark:border-amber-700/80 bg-amber-50/30 dark:bg-amber-950/20 text-slate-900 dark:text-slate-100 focus:ring-amber-500"
                : "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-sky-500"
            }`}
          >
            {options.map((opt) => (
              <option key={String(opt.value)} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={type}
            min={min}
            max={max}
            step={step}
            value={effectiveValue ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              if (type === "number") {
                const num = val === "" ? 0 : parseFloat(val);
                onValueChange(num);
              } else {
                onValueChange(val);
              }
            }}
            disabled={disabled}
            className={`w-full px-3 py-2 text-xs font-bold rounded-xl border transition focus:ring-2 focus:outline-none ${
              isOverridden
                ? "border-amber-300 dark:border-amber-700/80 bg-amber-50/30 dark:bg-amber-950/20 text-slate-900 dark:text-slate-100 focus:ring-amber-500"
                : "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-sky-500"
            }`}
          />
        )}
      </div>

      {/* Warning message if any */}
      {warning && (
        <div className="flex items-start gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-lg p-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-500" />
          <span className="leading-tight">{warning}</span>
        </div>
      )}

      {/* Sub-text: Overridden indicator or general hint */}
      {isOverridden ? (
        <div className="flex items-center justify-between text-[10px] text-amber-700 dark:text-amber-400">
          <span>Auto value: <strong>{autoValue}{unit ? ` ${unit}` : ""}</strong></span>
          <button
            type="button"
            onClick={onResetToAuto}
            className="underline hover:text-amber-900 dark:hover:text-amber-200 transition"
          >
            Reset to Auto
          </button>
        </div>
      ) : (
        hint && <div className="text-[10px] text-slate-400 dark:text-slate-500">{hint}</div>
      )}
    </div>
  );
};
