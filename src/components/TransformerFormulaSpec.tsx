import React from "react";
import { Cpu, Zap, Activity } from "lucide-react";

interface TransformerFormulaSpecProps {
  demandLoadKVA: number;
  loadingFactor: number;
  requiredKVA: number;
  secondaryCurrent: number;
  numTransformers: number;
  activeSpecs: {
    zPercent: number;
    xrRatio: number;
  };
  secondaryFaultCurrentKA: number;
  is3Phase: boolean;
  primaryVoltage: number;
  secondaryVoltage: number;
  primaryCurrent: number;
}

export const TransformerFormulaSpec: React.FC<TransformerFormulaSpecProps> = ({
  demandLoadKVA,
  loadingFactor,
  requiredKVA,
  secondaryCurrent,
  numTransformers,
  activeSpecs,
  secondaryFaultCurrentKA,
  is3Phase,
  primaryVoltage,
  secondaryVoltage,
  primaryCurrent,
}) => {
  return (
    <div id="tx-formula-spec-section" className="space-y-6">
      <h4 className="text-sm font-black text-slate-700 dark:text-slate-350 uppercase tracking-wider flex items-center gap-2">
        <Activity className="w-4 h-4 text-slate-400" />
        Sizing & Fault Current Engineering Formulas
      </h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Required Capacity Formula */}
        <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-800 rounded-3xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-150 dark:border-slate-800">
            <Cpu className="w-4 h-4 text-indigo-500" />
            <span className="text-xs font-black uppercase text-slate-700 dark:text-slate-300">
              1. Minimum Required Sizing Capacity
            </span>
          </div>
          <div className="flex flex-col gap-4 font-mono text-xs">
            <div className="space-y-1">
              <span className="font-extrabold text-slate-400 uppercase text-[9px]">Mathematical Model</span>
              <div className="bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-150 dark:border-slate-850">
                <div className="flex items-center gap-3 text-indigo-600 dark:text-indigo-400 font-bold">
                  <span>S<sub>req</sub> =</span>
                  <div className="flex flex-col items-center">
                    <span className="border-b border-indigo-200 dark:border-indigo-800 pb-0.5 px-2">
                      S<sub>demand</sub>
                    </span>
                    <span className="pt-0.5 px-2">
                      η<sub>loading</sub>
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <span className="font-extrabold text-slate-400 uppercase text-[9px]">Values Substituted</span>
              <div className="bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-150 dark:border-slate-850 text-slate-700 dark:text-slate-300">
                S<sub>req</sub> = {demandLoadKVA.toFixed(2)} kVA ÷ {loadingFactor.toFixed(2)} = <strong className="text-indigo-600 dark:text-indigo-400">{requiredKVA.toFixed(2)} kVA</strong>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-slate-450 leading-relaxed font-sans">
            Where <strong>S<sub>req</sub></strong> represents calculated minimum bank target capacity, <strong>S<sub>demand</sub></strong> is the maximum computed demand load, and <strong>η<sub>loading</sub></strong> is the allowable continuous design sizing coefficient.
          </p>
        </div>

        {/* Symmetrical Fault Current Formula */}
        <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-800 rounded-3xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-150 dark:border-slate-800">
            <Zap className="w-4 h-4 text-indigo-500" />
            <span className="text-xs font-black uppercase text-slate-700 dark:text-slate-300">
              2. Symmetrical Secondary Fault Current
            </span>
          </div>
          <div className="flex flex-col gap-4 font-mono text-xs">
            <div className="space-y-1">
              <span className="font-extrabold text-slate-400 uppercase text-[9px]">Mathematical Model</span>
              <div className="bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-150 dark:border-slate-850">
                <div className="flex items-center gap-3 text-red-600 dark:text-red-400 font-bold">
                  <span>I<sub>sc</sub> =</span>
                  <div className="flex flex-col items-center">
                    <span className="border-b border-red-200 dark:border-red-800 pb-0.5 px-2">
                      I<sub>s_fla</sub> × N<sub>tx</sub>
                    </span>
                    <span className="pt-0.5 px-2">
                      Z% ÷ 100
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <span className="font-extrabold text-slate-400 uppercase text-[9px]">Values Substituted</span>
              <div className="bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-150 dark:border-slate-850 text-slate-700 dark:text-slate-300">
                I<sub>sc</sub> = ({secondaryCurrent.toFixed(1)} A × {numTransformers}) ÷ ({activeSpecs.zPercent.toFixed(2)}% ÷ 100) = <strong className="text-red-600 dark:text-red-400">{(secondaryFaultCurrentKA * 1000).toFixed(0)} A ({(secondaryFaultCurrentKA).toFixed(2)} kA)</strong>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-slate-450 leading-relaxed font-sans">
            Where <strong>I<sub>sc</sub></strong> is prospective short-circuit current at the secondary bus, <strong>I<sub>s_fla</sub></strong> is the unit secondary full-load current, and <strong>Z%</strong> is percentage impedance.
          </p>
        </div>

        {/* Primary Line Current Formula */}
        <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-800 rounded-3xl p-5 space-y-4 shadow-sm md:col-span-1">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-150 dark:border-slate-800">
            <Activity className="w-4 h-4 text-indigo-500" />
            <span className="text-xs font-black uppercase text-slate-700 dark:text-slate-300">
              3. Nom. Primary Line Current (I<sub>p</sub>)
            </span>
          </div>
          <div className="flex flex-col gap-4 font-mono text-xs">
            <div className="space-y-1">
              <span className="font-extrabold text-slate-400 uppercase text-[9px]">Mathematical Model</span>
              <div className="bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-150 dark:border-slate-850">
                <div className="flex items-center gap-3 text-indigo-600 dark:text-indigo-400 font-bold">
                  <span>I<sub>p</sub> =</span>
                  {is3Phase ? (
                    <div className="flex flex-col items-center">
                      <span className="border-b border-indigo-200 dark:border-indigo-800 pb-0.5 px-2">S<sub>base</sub> × 1000</span>
                      <span className="pt-0.5 px-2">√3 × V<sub>p</sub></span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <span className="border-b border-indigo-200 dark:border-indigo-800 pb-0.5 px-2">S<sub>base</sub> × 1000</span>
                      <span className="pt-0.5 px-2">V<sub>p</sub></span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <span className="font-extrabold text-slate-400 uppercase text-[9px]">Values Substituted</span>
              <div className="bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-150 dark:border-slate-850 text-slate-700 dark:text-slate-300">
                I<sub>p</sub> = {is3Phase 
                  ? `(${requiredKVA.toFixed(1)} × 1000) ÷ (1.732 × ${primaryVoltage}) = ` 
                  : `(${requiredKVA.toFixed(1)} × 1000) ÷ ${primaryVoltage} = `}
                <strong className="text-indigo-600 dark:text-indigo-400">{primaryCurrent.toFixed(2)} A</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Secondary Line Current Formula */}
        <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-800 rounded-3xl p-5 space-y-4 shadow-sm md:col-span-1">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-150 dark:border-slate-800">
            <Activity className="w-4 h-4 text-indigo-500" />
            <span className="text-xs font-black uppercase text-slate-700 dark:text-slate-300">
              4. Nom. Secondary Line Current (I<sub>s</sub>)
            </span>
          </div>
          <div className="flex flex-col gap-4 font-mono text-xs">
            <div className="space-y-1">
              <span className="font-extrabold text-slate-400 uppercase text-[9px]">Mathematical Model</span>
              <div className="bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-150 dark:border-slate-850">
                <div className="flex items-center gap-3 text-indigo-600 dark:text-indigo-400 font-bold">
                  <span>I<sub>s</sub> =</span>
                  {is3Phase ? (
                    <div className="flex flex-col items-center">
                      <span className="border-b border-indigo-200 dark:border-indigo-800 pb-0.5 px-2">S<sub>base</sub> × 1000</span>
                      <span className="pt-0.5 px-2">√3 × V<sub>s</sub></span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <span className="border-b border-indigo-200 dark:border-indigo-800 pb-0.5 px-2">S<sub>base</sub> × 1000</span>
                      <span className="pt-0.5 px-2">V<sub>s</sub></span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <span className="font-extrabold text-slate-400 uppercase text-[9px]">Values Substituted</span>
              <div className="bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-150 dark:border-slate-850 text-slate-700 dark:text-slate-300">
                I<sub>s</sub> = {is3Phase 
                  ? `(${requiredKVA.toFixed(1)} × 1000) ÷ (1.732 × ${secondaryVoltage}) = ` 
                  : `(${requiredKVA.toFixed(1)} × 1000) ÷ ${secondaryVoltage} = `}
                <strong className="text-indigo-600 dark:text-indigo-400">{secondaryCurrent.toFixed(2)} A</strong>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
