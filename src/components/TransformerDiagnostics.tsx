import React, { useMemo } from "react";
import { AlertTriangle, ShieldAlert, CheckCircle2 } from "lucide-react";

interface TransformerDiagnosticsProps {
  primaryVoltage: number;
  secondaryVoltage: number;
  numTransformers: number;
  activeRating: number;
  isOverloaded: boolean;
  demandLoadKVA: number;
  totalInstalledCapacity: number;
  loadingFactor: number;
  txDemandKVA: number[];
}

export const TransformerDiagnostics: React.FC<TransformerDiagnosticsProps> = ({
  primaryVoltage,
  secondaryVoltage,
  numTransformers,
  activeRating,
  isOverloaded,
  demandLoadKVA,
  totalInstalledCapacity,
  loadingFactor,
  txDemandKVA,
}) => {
  const validationAlerts = useMemo(() => {
    const alerts: { type: "error" | "warning"; message: string; description: string }[] = [];

    // 1. Missing / Invalid Inputs
    if (primaryVoltage <= 0 || isNaN(primaryVoltage)) {
      alerts.push({
        type: "error",
        message: "Invalid Primary Voltage Configuration",
        description: "The primary voltage must be configured with a positive voltage level (e.g. 13.8 kV / 13800 V) to calculate currents and impedances correctly."
      });
    }
    if (numTransformers < 1 || isNaN(numTransformers)) {
      alerts.push({
        type: "error",
        message: "Invalid Transformer Configuration Count",
        description: "The number of parallel units cannot be less than 1. Please specify a valid quantity."
      });
    }
    if (activeRating <= 0 || isNaN(activeRating)) {
      alerts.push({
        type: "error",
        message: "Invalid Transformer Capacity Rating",
        description: "No standard rating selected. Please choose or select a standard unit capacity rating to proceed."
      });
    }

    // 2. Voltage Combinations
    if (primaryVoltage > 0 && primaryVoltage <= secondaryVoltage) {
      alerts.push({
        type: "warning",
        message: "Step-Up Voltage Configuration Warning",
        description: `Primary voltage (${primaryVoltage} V) is less than or equal to Secondary voltage (${secondaryVoltage} V). Standard sizing expects step-down distribution transformer configuration.`
      });
    }

    // 3. Combined Insufficient Capacity
    if (isOverloaded) {
      alerts.push({
        type: "warning",
        message: "Insufficient Bank Sizing Capacity",
        description: `The actual demand load of ${demandLoadKVA.toFixed(1)} kVA exceeds the continuous-duty continuous loading limit of the sized ${numTransformers === 1 ? `transformer (${activeRating} kVA)` : `transformer bank (${totalInstalledCapacity} kVA total)`}.`
      });
    }

    // 4. Individual Unit Overloading check
    if (numTransformers > 1) {
      const overloadedTxUnits: number[] = [];
      txDemandKVA.forEach((demandK, idx) => {
        const txLoadingPct = activeRating > 0 ? (demandK / activeRating) * 100 : 0;
        if (txLoadingPct > loadingFactor * 100) {
          overloadedTxUnits.push(idx + 1);
        }
      });
      if (overloadedTxUnits.length > 0) {
        alerts.push({
          type: "warning",
          message: "Unbalanced Individual Unit Overloading",
          description: `Transformer unit(s) [${overloadedTxUnits.map(n => `#${n}`).join(", ")}] exceed the safe continuous limit due to load assignment imbalance. Please use the Balancing Board below to redistribute loads round-robin.`
        });
      }
    }

    return alerts;
  }, [primaryVoltage, secondaryVoltage, numTransformers, activeRating, isOverloaded, demandLoadKVA, totalInstalledCapacity, loadingFactor, txDemandKVA]);

  if (validationAlerts.length === 0) {
    return (
      <div id="diag-success-card" className="bg-emerald-50/40 dark:bg-emerald-950/10 border border-emerald-100/60 dark:border-emerald-950/20 rounded-2xl p-4 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <h5 className="text-xs font-black text-emerald-800 dark:text-emerald-400">All System Checks Compliant</h5>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
            The configured transformer configuration is fully compliant with the maximum computed demand of the MDP and PEC safe loading rules.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div id="diag-warning-card" className="space-y-3 bg-slate-50 dark:bg-slate-900/65 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm">
      <div className="flex items-center gap-2 pb-2.5 border-b border-slate-150 dark:border-slate-800/80">
        <ShieldAlert className="w-4 h-4 text-amber-500" />
        <h5 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300">System Sizing & Compliance Diagnostics</h5>
      </div>
      <div className="space-y-3">
        {validationAlerts.map((alert, idx) => (
          <div key={idx} className={`p-3.5 rounded-xl border flex gap-3 text-xs ${
            alert.type === "error" 
              ? "bg-red-50/45 dark:bg-red-950/10 border-red-100 dark:border-red-950/40 text-red-700 dark:text-red-400" 
              : "bg-amber-50/45 dark:bg-amber-950/10 border-amber-100 dark:border-amber-950/40 text-amber-700 dark:text-amber-400"
          }`}>
            <AlertTriangle className={`w-5 h-5 shrink-0 ${alert.type === "error" ? "text-red-500" : "text-amber-500"}`} />
            <div className="space-y-1">
              <span className="font-extrabold block leading-none">{alert.message}</span>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal font-medium">{alert.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
