import React, { useMemo } from "react";
import { PanelConfig, Circuit } from "../types";
import { Zap, AlertTriangle, CheckCircle2, RefreshCw, Cpu, ShieldCheck } from "lucide-react";
import { computePanelScheduleValues } from "../utils/computeEngine";

interface TransformerCalcProps {
  panel: PanelConfig;
  circuits: Circuit[];
  primaryVoltage: number;
  setPrimaryVoltage: (v: number) => void;
  powerFactor: number;
  setPowerFactor: (pf: number) => void;
  demandFactor: number;
  setDemandFactor: (df: number) => void;
  loadingFactor: number;
  setLoadingFactor: (lf: number) => void;
}

export const STANDARD_TRANSFORMER_SIZES = [
  15, 30, 45, 75, 112.5, 150, 225, 300, 500, 750, 1000, 1500, 2000, 2500
];

export default function TransformerCalc({
  panel,
  circuits,
  primaryVoltage,
  setPrimaryVoltage,
  powerFactor,
  setPowerFactor,
  demandFactor,
  setDemandFactor,
  loadingFactor,
  setLoadingFactor,
}: TransformerCalcProps) {
  // Deriving system properties from MDP Panel
  const is3Phase = panel.system.includes("3PH");
  const secondaryVoltage = panel.voltage || 230;

  // Compute MDP panel values
  const panelValues = useMemo(() => {
    return computePanelScheduleValues(panel, circuits);
  }, [panel, circuits]);

  // Connected load from MDP
  const connectedLoadVA = panelValues.totalVA;
  const connectedLoadKVA = connectedLoadVA / 1000;
  const connectedLoadkW = connectedLoadKVA * powerFactor;

  // Demand Load calculation
  // Maximum Demand Load is Connected Load * Demand Factor
  const demandLoadKVA = connectedLoadKVA * demandFactor;
  const demandLoadkW = demandLoadKVA * powerFactor;

  // Required transformer size based on loading factor
  // Required kVA = Maximum Demand Load (kVA) / Loading Factor
  const requiredKVA = loadingFactor > 0 ? demandLoadKVA / loadingFactor : 0;

  // Find nearest recommended standard transformer size
  const recommendedRating = useMemo(() => {
    if (requiredKVA <= 0) return STANDARD_TRANSFORMER_SIZES[0];
    const size = STANDARD_TRANSFORMER_SIZES.find((s) => s >= requiredKVA);
    return size || STANDARD_TRANSFORMER_SIZES[STANDARD_TRANSFORMER_SIZES.length - 1];
  }, [requiredKVA]);

  // Primary Current calculations
  // I = kVA * 1000 / (V * factor) where factor is sqrt(3) for 3PH, 1 for 1PH
  const primaryCurrent = useMemo(() => {
    if (primaryVoltage <= 0) return 0;
    const factor = is3Phase ? Math.sqrt(3) : 1;
    return (recommendedRating * 1000) / (primaryVoltage * factor);
  }, [recommendedRating, primaryVoltage, is3Phase]);

  // Secondary Current calculations
  const secondaryCurrent = useMemo(() => {
    if (secondaryVoltage <= 0) return 0;
    const factor = is3Phase ? Math.sqrt(3) : 1;
    return (recommendedRating * 1000) / (secondaryVoltage * factor);
  }, [recommendedRating, secondaryVoltage, is3Phase]);

  // Transformer actual loading percentage
  const actualLoadingPct = useMemo(() => {
    if (recommendedRating <= 0) return 0;
    return (demandLoadKVA / recommendedRating) * 100;
  }, [demandLoadKVA, recommendedRating]);

  // Spare Capacity
  const spareCapacityKVA = useMemo(() => {
    return Math.max(0, recommendedRating - demandLoadKVA);
  }, [recommendedRating, demandLoadKVA]);

  const isOverloaded = actualLoadingPct > (loadingFactor * 100);

  return (
    <div className="space-y-6">
      {/* Overview Block */}
      <div className="bg-gradient-to-r from-teal-600 to-indigo-700 rounded-3xl p-6 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="bg-white/20 text-white text-xs font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
              Automatic Integration
            </span>
            <h3 className="text-2xl font-black mt-2 tracking-tight">
              Transformer Capacity & Verification Suite
            </h3>
            <p className="text-slate-100 text-sm mt-1 max-w-2xl leading-relaxed">
              This module dynamically reads parameters from the **MDP Load Schedule** to size and evaluate the high-voltage/low-voltage distribution transformer.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-slate-900/30 p-3 rounded-2xl border border-white/10 self-start md:self-auto shrink-0 font-mono text-xs text-indigo-100">
            <RefreshCw className="w-4 h-4 text-emerald-300 animate-spin" style={{ animationDuration: "6s" }} />
            <span>Synchronized with MDP Load Schedule</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Parameters on Left, Calculations/Stats on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Adjustable Parameters Panel */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/60 dark:border-slate-800/80 shadow-md space-y-6">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-100 dark:border-slate-800/80">
            <Cpu className="w-5 h-5 text-indigo-500" />
            <h4 className="text-base font-bold text-slate-800 dark:text-white">
              Sizing Parameters
            </h4>
          </div>

          {/* Primary Voltage Input */}
          <div className="space-y-2">
            <label className="block text-xs font-black uppercase text-slate-500 dark:text-slate-400">
              Primary Voltage (V)
            </label>
            <div className="relative">
              <input
                type="number"
                value={primaryVoltage}
                onChange={(e) => setPrimaryVoltage(Math.max(1, Number(e.target.value)))}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-600 transition-all text-slate-800 dark:text-slate-100"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                kV: {(primaryVoltage / 1000).toFixed(2)}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {[13800, 4160, 480, 230].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPrimaryVoltage(v)}
                  className={`text-[10px] font-bold px-2 py-1 rounded-md transition-all ${
                    primaryVoltage === v
                      ? "bg-indigo-500 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {v >= 1000 ? `${v / 1000}kV` : `${v}V`}
                </button>
              ))}
            </div>
          </div>

          {/* Power Factor */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-black uppercase text-slate-500 dark:text-slate-400">
              <span>Power Factor</span>
              <span className="font-mono text-indigo-505 dark:text-indigo-400">
                {powerFactor.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="1.0"
              step="0.01"
              value={powerFactor}
              onChange={(e) => setPowerFactor(Number(e.target.value))}
              className="w-full accent-indigo-505"
            />
          </div>

          {/* Load Diversity/Demand Factor */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-black uppercase text-slate-500 dark:text-slate-400">
              <span>Demand Factor</span>
              <span className="font-mono text-indigo-505 dark:text-indigo-400">
                {(demandFactor * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={demandFactor}
              onChange={(e) => setDemandFactor(Number(e.target.value))}
              className="w-full accent-indigo-505"
            />
            <p className="text-[10px] text-slate-400 leading-tight">
              Default factor based on the electrical category of connected load groups.
            </p>
          </div>

          {/* Allowable Loading Factor */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-black uppercase text-slate-500 dark:text-slate-400">
              <span>Allowable Loading Limit</span>
              <span className="font-mono text-indigo-505 dark:text-indigo-400">
                {(loadingFactor * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min="0.4"
              max="1.0"
              step="0.05"
              value={loadingFactor}
              onChange={(e) => setLoadingFactor(Number(e.target.value))}
              className="w-full accent-indigo-505"
            />
            <p className="text-[10px] text-slate-400 leading-tight">
              Standard design practices suggest keeping utility transformers under 80% continuous rating.
            </p>
          </div>
        </div>

        {/* Outputs and stats panel */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Sizing Status */}
          <div className={`p-6 rounded-3xl border-2 flex flex-col md:flex-row items-center justify-between gap-4 transition-all shadow-sm ${
            isOverloaded
              ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40 text-red-800 dark:text-red-300"
              : "bg-green-50/70 dark:bg-green-950/20 border-green-200 dark:border-green-900/40 text-green-800 dark:text-green-300"
          }`}>
            <div className="flex items-center gap-4 text-center md:text-left flex-col md:flex-row">
              {isOverloaded ? (
                <div className="p-3 bg-red-100 dark:bg-red-900/50 rounded-2xl">
                  <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400 animate-pulse" />
                </div>
              ) : (
                <div className="p-3 bg-green-100 dark:bg-green-900/55 rounded-2xl">
                  <ShieldCheck className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
              )}
              <div>
                <span className={`text-[10px] font-black uppercase mb-1 tracking-wider block ${
                  isOverloaded ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                }`}>
                  Transformer Sizing Status
                </span>
                <h4 className="text-lg font-black tracking-tight text-slate-800 dark:text-slate-100">
                  {isOverloaded 
                    ? `Warning: Loading Exceeds Allowable ${(loadingFactor * 100).toFixed(0)}% Limit!` 
                    : `Transformer Capacity Sized Safely!`}
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  {isOverloaded
                    ? `The actual demand of ${demandLoadKVA.toFixed(1)} kVA exceeds the specified maximum continuous limit for a ${recommendedRating} kVA transformer.`
                    : `The calculated load requires at least ${requiredKVA.toFixed(1)} kVA. Standard rating ${recommendedRating} kVA is compliant.`}
                </p>
              </div>
            </div>
            
            <div className="flex flex-col items-center justify-center bg-white dark:bg-slate-900 px-6 py-4 rounded-2xl shadow-sm border border-slate-150 dark:border-slate-800 shrink-0 self-stretch md:self-auto min-w-[150px]">
              <span className="text-[10px] font-bold uppercase text-slate-400">Actual Loading</span>
              <span className={`text-3xl font-black font-mono tracking-tighter ${
                isOverloaded ? "text-red-650 dark:text-red-400" : "text-green-655 dark:text-green-400"
              }`}>
                {actualLoadingPct.toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-400 mt-1 font-bold">Limit: {(loadingFactor * 100).toFixed(0)}%</span>
            </div>
          </div>

          {/* Summary Details Cards */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/60 dark:border-slate-800/80 shadow-md">
            <h4 className="text-base font-bold text-slate-805 dark:text-white mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-500" />
              Transformer Capacity Summary
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* MDP Reference Info */}
              <div className="bg-slate-50 dark:bg-slate-950/45 p-4 rounded-2xl space-y-3 border border-slate-100 dark:border-slate-900">
                <span className="text-[10px] font-black uppercase text-indigo-500">MDP Load Reference</span>
                <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex justify-between">
                    <span>System:</span>
                    <strong className="text-slate-800 dark:text-slate-100 font-mono">{panel.system.includes("3PH") ? "3-Phase (3Φ)" : "1-Phase (1Φ)"}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Voltage:</span>
                    <strong className="text-slate-800 dark:text-slate-100 font-mono">{secondaryVoltage} V</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Connected Load:</span>
                    <strong className="text-slate-810 dark:text-slate-100 font-mono">{(connectedLoadKVA).toFixed(1)} kVA / {connectedLoadkW.toFixed(1)} kW</strong>
                  </div>
                </div>
              </div>

              {/* Demand Calculator results */}
              <div className="bg-slate-50 dark:bg-slate-950/45 p-4 rounded-2xl space-y-3 border border-slate-100 dark:border-slate-900">
                <span className="text-[10px] font-black uppercase text-indigo-500">Demand Calculations</span>
                <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex justify-between grayscale-0">
                    <span>Demand Load:</span>
                    <strong className="text-slate-800 dark:text-slate-100 font-mono">{demandLoadKVA.toFixed(1)} kVA / {demandLoadkW.toFixed(1)} kW</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Power Factor:</span>
                    <strong className="text-slate-800 dark:text-slate-100 font-mono">{powerFactor.toFixed(2)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Required Min Size:</span>
                    <strong className="text-slate-800 dark:text-slate-100 font-mono">{requiredKVA.toFixed(1)} kVA</strong>
                  </div>
                </div>
              </div>

              {/* Recommended Size & Current Panel */}
              <div className="bg-slate-50 dark:bg-slate-950/45 p-4 rounded-2xl space-y-3 border border-slate-100 dark:border-slate-900">
                <span className="text-[10px] font-black uppercase text-indigo-500">Calculated Output</span>
                <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex justify-between">
                    <span>Primary Voltage:</span>
                    <strong className="text-slate-800 dark:text-slate-100 font-mono">{primaryVoltage >= 1000 ? `${primaryVoltage / 1000} kV` : `${primaryVoltage} V`}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Primary Amps:</span>
                    <strong className="text-indigo-600 dark:text-indigo-400 font-mono font-bold">{primaryCurrent.toFixed(2)} A</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Secondary Amps:</span>
                    <strong className="text-indigo-600 dark:text-indigo-400 font-mono font-bold">{secondaryCurrent.toFixed(2)} A</strong>
                  </div>
                </div>
              </div>

            </div>

            {/* Recommendation Display */}
            <div className="mt-6 flex flex-col md:flex-row items-center gap-4 bg-indigo-50/40 dark:bg-indigo-950/10 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-950/30">
              <div className="text-center md:text-left flex-1">
                <span className="text-[10px] font-black uppercase text-indigo-500 tracking-wider">Recommended Rating</span>
                <h5 className="text-3xl font-black font-mono text-indigo-600 dark:text-indigo-400 mt-1">
                  {recommendedRating} <span className="text-lg">kVA</span>
                </h5>
                <p className="text-xs text-slate-400 mt-1">
                  Nearest standard transformer rating chosen automatically to prevent operation past {loadingFactor * 100}% load capacity.
                </p>
              </div>
              <div className="flex flex-wrap gap-1 justify-center max-w-sm">
                {STANDARD_TRANSFORMER_SIZES.slice(0, 11).map((sz) => (
                  <span
                    key={sz}
                    className={`px-2 py-1 text-[10px] font-mono font-bold rounded-lg ${
                      recommendedRating === sz
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                        : sz < requiredKVA
                        ? "bg-red-50 text-red-550 dark:bg-red-950/20 dark:text-red-400/60 font-medium cursor-not-allowed border border-red-200/30 line-through"
                        : "bg-slate-150/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {sz}
                  </span>
                ))}
                {STANDARD_TRANSFORMER_SIZES.length > 11 && (
                  <span className="text-[10px] text-slate-400 font-bold self-center ml-1">...</span>
                )}
              </div>
            </div>

          </div>

          {/* Technical Loading Verification Details */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/60 dark:border-slate-800/80 shadow-md">
            <h4 className="text-base font-bold text-slate-805 dark:text-white mb-4">
              Detailed Loading Verification
            </h4>

            {/* Visualization Loading bar */}
            <div className="space-y-2 mb-6">
              <div className="flex justify-between text-xs font-bold text-slate-400">
                <span>0 kVA</span>
                <span className="text-slate-800 dark:text-slate-200 font-mono">
                  Demand: {demandLoadKVA.toFixed(1)} kVA / Rated: {recommendedRating} kVA
                </span>
                <span>{recommendedRating} kVA</span>
              </div>
              <div className="h-4 bg-slate-100 dark:bg-slate-950 rounded-full overflow-hidden flex relative border dark:border-slate-800">
                {/* Safe limit mark line */}
                <div
                  className="absolute top-0 bottom-0 border-r-2 border-red-500/80 z-20"
                  style={{ left: `${loadingFactor * 100}%` }}
                  title={`Sizing Limit: ${(loadingFactor * 100).toFixed(0)}%`}
                >
                  <span className="absolute -top-1.5 right-1 bg-red-500 text-[8px] font-black leading-none text-white px-1 py-0.5 rounded shadow">
                    LIMIT
                  </span>
                </div>
                {/* Demand Fill */}
                <div
                  className={`transition-all duration-500 h-full ${
                    isOverloaded
                      ? "bg-gradient-to-r from-red-500 to-rose-600"
                      : "bg-gradient-to-r from-teal-500 to-indigo-505"
                  }`}
                  style={{ width: `${Math.min(100, actualLoadingPct)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-450 mt-1 leading-none font-medium">
                <span>Total Connect kVA: {connectedLoadKVA.toFixed(1)} (Unfactored)</span>
                <span className={isOverloaded ? "text-red-500 font-bold" : "text-slate-400"}>
                  Loading Peak: {actualLoadingPct.toFixed(1)}% {isOverloaded ? "(LIMIT EXCEEDED)" : "(SAFE)"}
                </span>
              </div>
            </div>

            {/* Structured Table Rows */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex justify-between items-center py-2 border-b border-dashed border-slate-100 dark:border-slate-800/80">
                <span className="text-xs font-bold text-slate-500">Selected Transformer Rating</span>
                <span className="text-sm font-black font-mono text-slate-800 dark:text-slate-200">{recommendedRating} kVA</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-dashed border-slate-100 dark:border-slate-800/80">
                <span className="text-xs font-bold text-slate-500">Actual Connected Load</span>
                <span className="text-sm font-black font-mono text-slate-800 dark:text-slate-200">{connectedLoadKVA.toFixed(1)} kVA</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-dashed border-slate-100 dark:border-slate-800/80">
                <span className="text-xs font-bold text-slate-500">Maximum Demand Load</span>
                <span className="text-sm font-black font-mono text-slate-800 dark:text-slate-200">{demandLoadKVA.toFixed(1)} kVA</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-dashed border-slate-100 dark:border-slate-800/80">
                <span className="text-xs font-bold text-slate-500">Transformer Loading Percentage</span>
                <span className={`text-sm font-black font-mono ${isOverloaded ? "text-red-600" : "text-green-655"}`}>{actualLoadingPct.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-dashed border-slate-100 dark:border-slate-800/80 md:col-span-2">
                <span className="text-xs font-bold text-slate-500">Available Spare Capacity</span>
                <span className="text-sm font-black font-mono text-green-655 block">
                  {spareCapacityKVA.toFixed(1)} kVA ({Math.max(0, 100 - actualLoadingPct).toFixed(1)}%)
                </span>
              </div>
            </div>

          </div>

          {/* Math & Formulas Section */}
          <div className="bg-slate-55 dark:bg-slate-900/30 rounded-3xl p-6 border border-slate-200/40 dark:border-slate-800/50 space-y-4">
            <h4 className="text-sm font-black text-slate-700 dark:text-slate-350 uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-slate-400" />
              Formula & Equation Breakdown
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono text-slate-600 dark:text-slate-400 bg-white/70 dark:bg-slate-950/40 p-5 rounded-2xl shadow-inner border border-slate-100 dark:border-slate-900">
              <div className="space-y-1">
                <div className="font-bold text-slate-800 dark:text-slate-300">1. Required Capacity Formula:</div>
                <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/50 text-indigo-600 dark:text-indigo-400 font-bold overflow-x-auto whitespace-nowrap">
                  Required kVA = Demand Load (kVA) &divide; Loading Limit
                </div>
                <div className="text-[10px] text-slate-450 pt-1">
                  Demand Load ({demandLoadKVA.toFixed(1)} kVA) &divide; {(loadingFactor).toFixed(2)} = {requiredKVA.toFixed(2)} kVA
                </div>
              </div>

              <div className="space-y-1">
                <div className="font-bold text-slate-800 dark:text-slate-300">2. Demand Load Formula:</div>
                <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/50 text-indigo-600 dark:text-indigo-400 font-bold overflow-x-auto whitespace-nowrap">
                  Demand Load = Connected kVA &times; Demand Factor
                </div>
                <div className="text-[10px] text-slate-450 pt-1">
                  Connected Load ({connectedLoadKVA.toFixed(1)} kVA) &times; {(demandFactor).toFixed(2)} = {demandLoadKVA.toFixed(2)} kVA
                </div>
              </div>

              <div className="space-y-1 md:col-span-2 pt-2 border-t border-slate-100 dark:border-slate-900">
                <div className="font-bold text-slate-800 dark:text-slate-300">3. Current Equations:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                  <div>
                    <span className="text-[10px] block text-slate-400 uppercase">Primary Ampere ({is3Phase ? "3-Phase" : "Single Phase"})</span>
                    <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/50 font-bold text-indigo-600 dark:text-indigo-400 overflow-x-auto">
                      {is3Phase 
                        ? `I_p = kVA × 1000 ÷ (√3 × V_p) = ${RecommendedRatingEquation(recommendedRating, primaryVoltage, true)} = ${primaryCurrent.toFixed(2)} A`
                        : `I_p = kVA × 1000 ÷ V_p = ${RecommendedRatingEquation(recommendedRating, primaryVoltage, false)} = ${primaryCurrent.toFixed(2)} A`
                      }
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] block text-slate-400 uppercase">Secondary Ampere ({is3Phase ? "3-Phase" : "Single Phase"})</span>
                    <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/50 font-bold text-indigo-600 dark:text-indigo-400 overflow-x-auto">
                      {is3Phase 
                        ? `I_s = kVA × 1000 ÷ (√3 × V_s) = ${RecommendedRatingEquation(recommendedRating, secondaryVoltage, true)} = ${secondaryCurrent.toFixed(2)} A`
                        : `I_s = kVA × 1000 ÷ V_s = ${RecommendedRatingEquation(recommendedRating, secondaryVoltage, false)} = ${secondaryCurrent.toFixed(2)} A`
                      }
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

function RecommendedRatingEquation(kva: number, volts: number, is3ph: boolean) {
  if (is3ph) {
    return `(${kva} × 1000) ÷ (1.732 × ${volts})`;
  }
  return `(${kva} × 1000) ÷ ${volts}`;
}
