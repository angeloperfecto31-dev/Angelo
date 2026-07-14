import React, { useState, useEffect } from 'react';
import { Calculator, ShieldAlert, Zap, Layers, RefreshCw } from 'lucide-react';
import LatexRenderer from './LatexRenderer';
import { PanelConfig } from '../types';

interface Props {
  panel: PanelConfig;
  setPanel: (p: PanelConfig) => void;
}

export default function PECCurrentCalculator({ panel, setPanel }: Props) {
  const [inputType, setInputType] = useState<'VA' | 'P'>('VA');
  const [inputValue, setInputValue] = useState<string>('5000');
  const [powerFactor, setPowerFactor] = useState<string>('0.85');

  // Load selected connection globally from panel, default to Delta-Wye
  const connection = panel.transformerConnection || 'Delta-Wye (Δ-Y)';

  // Helper updates global connection
  const handleConnectionChange = (val: string) => {
    setPanel({ ...panel, transformerConnection: val });
  };

  const getSystemMath = () => {
    const isWye = connection.includes('Wye') || connection.includes('Star');
    const isOpen = connection.includes('Open');
    
    // We assume the user inputs S (VA) or P (Watts). We convert generic values to calculate metrics correctly.
    const S = inputType === 'VA' ? parseFloat(inputValue) || 0 : (parseFloat(inputValue) || 0) / (parseFloat(powerFactor) || 1);
    const P = inputType === 'P' ? parseFloat(inputValue) || 0 : S * (parseFloat(powerFactor) || 1);
    const PF = parseFloat(powerFactor) || 1;
    const Q = Math.sqrt(Math.max(0, S * S - P * P));

    // Assume secondary nominal lines based on Panel properties, or standard default 230/400.
    let VL = panel.voltage || 230;
    
    // Calculate based on specific connection
    let VPH = VL;
    let IPH = 0;
    let IL = 0;
    let bankCapacity = S;

    const isSinglePhase = !panel.system || panel.system.includes('1PH');

    if (isSinglePhase) {
      VPH = VL;
      IL = S / VL;
      IPH = IL;
    } else if (connection === 'Wye (Star) Connection' || connection === 'Delta-Wye (Δ-Y)' || connection === 'Wye-Wye (Y-Y)' || connection === 'Open Wye-Open Delta') {
      VPH = VL / 1.732;
      IL = S / (1.732 * VL);
      IPH = IL;
      if (connection === 'Open Wye-Open Delta') {
        bankCapacity = S * 0.866; // 86.6% utilization factor
      }
    } else if (connection === 'Delta Connection' || connection === 'Wye-Delta (Y-Δ)' || connection === 'Delta-Delta (Δ-Δ)' || connection === 'Open Delta (V-V)') {
      VPH = VL;
      IL = S / (1.732 * VL);
      IPH = IL / 1.732;
      if (connection === 'Open Delta (V-V)') {
        // Open delta provides only 57.7% of closed delta capacity
        bankCapacity = S * 0.577;
      }
    } else {
      // Single-phase generic fallback if applicable, though dropdown is full 3PH setups
      VPH = VL;
      IL = S / VL;
      IPH = IL;
    }

    return { S, P, PF, Q, VL, VPH, IL, IPH, bankCapacity };
  };

  const math = getSystemMath();

  return (
    <div id="electrical-calculation-module" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-6">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h3 className="font-extrabold text-slate-800 dark:text-slate-100 uppercase text-sm tracking-wider">
            Electrical Calculation Module (Tx/System Connection)
          </h3>
        </div>
        <span className="text-[10px] font-black text-slate-400 bg-slate-50 dark:bg-slate-800 border px-2 py-0.5 rounded-md uppercase">
          PEC 2017 Part 1
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="space-y-4">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">System & Transformer Parameter Selection</span>
            
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500">Transformer / System Connection</label>
              <select 
                value={connection} 
                onChange={(e) => handleConnectionChange(e.target.value)} 
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-lg text-sm text-slate-800 dark:text-slate-100 focus:border-indigo-500 transition outline-none"
              >
                <option value="Wye (Star) Connection">Wye (Star) Connection</option>
                <option value="Delta Connection">Delta Connection</option>
                <option value="Delta-Wye (Δ-Y)">Delta-Wye (Δ-Y)</option>
                <option value="Wye-Delta (Y-Δ)">Wye-Delta (Y-Δ)</option>
                <option value="Delta-Delta (Δ-Δ)">Delta-Delta (Δ-Δ)</option>
                <option value="Wye-Wye (Y-Y)">Wye-Wye (Y-Y)</option>
                <option value="Open Delta (V-V)">Open Delta (V-V)</option>
                <option value="Open Wye-Open Delta">Open Wye–Open Delta</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500">Load or System Value Type:</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                  <input type="radio" checked={inputType === 'VA'} onChange={() => setInputType('VA')} className="accent-indigo-600" />
                  Apparent Power (S) in VA
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                  <input type="radio" checked={inputType === 'P'} onChange={() => setInputType('P')} className="accent-indigo-600" />
                  Real Power (P) in Watts
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500">Value</label>
                <input 
                  type="number" 
                  value={inputValue} 
                  onChange={(e) => setInputValue(e.target.value)} 
                  className="w-full px-3 py-2 bg-slate-50 border rounded-lg font-mono text-sm dark:bg-slate-800 dark:text-white outline-none focus:border-indigo-500"
                />
              </div>

              {(inputType === 'P' || true) && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">Power Factor (PF)</label>
                  <input 
                    type="number" step="0.01" min="0.1" max="1.0" 
                    value={powerFactor} 
                    onChange={(e) => setPowerFactor(e.target.value)} 
                    className="w-full px-3 py-2 bg-slate-50 border rounded-lg font-mono text-sm dark:bg-slate-800 dark:text-white outline-none focus:border-indigo-500"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-3">
            <h4 className="text-[11px] font-black text-indigo-600 uppercase flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" /> Formula Guidelines Evaluated
            </h4>
            <div className="space-y-2 relative text-xs text-slate-700 dark:text-slate-300">
              {(!panel.system || panel.system.includes('1PH')) ? (
                <>
                  <div className="flex flex-col gap-1">
                    <LatexRenderer tex="S = V \times I" displayMode={false} />
                    <LatexRenderer tex="P = V \times I \times \text{PF}" displayMode={false} />
                    <LatexRenderer tex="Q = V \times I \times \sin\theta" displayMode={false} />
                  </div>
                </>
              ) : (connection === 'Wye (Star) Connection' || connection === 'Delta-Wye (Δ-Y)' || connection === 'Wye-Wye (Y-Y)' || connection === 'Open Wye-Open Delta') ? (
                <>
                  <div className="flex flex-col gap-1">
                    <LatexRenderer tex="V_L = \sqrt{3} \times V_{PH}" displayMode={false} />
                    <LatexRenderer tex="V_{PH} = \frac{V_L}{\sqrt{3}}" displayMode={false} />
                    <LatexRenderer tex="I_L = I_{PH}" displayMode={false} />
                    <LatexRenderer tex="S = \sqrt{3} \times V_L \times I_L" displayMode={false} />
                    <LatexRenderer tex="P = \sqrt{3} \times V_L \times I_L \times \text{PF}" displayMode={false} />
                    <LatexRenderer tex="Q = \sqrt{3} \times V_L \times I_L \times \sin\theta" displayMode={false} />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1">
                    <LatexRenderer tex="V_L = V_{PH}" displayMode={false} />
                    <LatexRenderer tex="I_L = \sqrt{3} \times I_{PH}" displayMode={false} />
                    <LatexRenderer tex="I_{PH} = \frac{I_L}{\sqrt{3}}" displayMode={false} />
                    <LatexRenderer tex="S = \sqrt{3} \times V_L \times I_L" displayMode={false} />
                    <LatexRenderer tex="P = \sqrt{3} \times V_L \times I_L \times \text{PF}" displayMode={false} />
                    <LatexRenderer tex="Q = \sqrt{3} \times V_L \times I_L \times \sin\theta" displayMode={false} />
                  </div>
                </>
              )}
              {connection === 'Open Delta (V-V)' && (
                <div className="mt-3 text-amber-600 border-t border-amber-200/50 pt-2">
                  <span className="font-bold block mb-1">Open Delta Capacity Limitation:</span>
                  <LatexRenderer tex="\text{Bank Capacity}_\text{Open} = 0.577 \times \text{Bank Capacity}_\text{Closed}" displayMode={false} />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 border rounded-2xl p-5 shadow-inner">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">Calculation Results Matrix</span>
          
          <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm">
             <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 p-3 rounded-xl flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Line Voltage ($V_L$)</span>
                <span className="font-mono font-bold">{math.VL.toFixed(2)} V</span>
             </div>
             <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 p-3 rounded-xl flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Phase Voltage ($V_PH$)</span>
                <span className="font-mono font-bold">{math.VPH.toFixed(2)} V</span>
             </div>
             <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 p-3 rounded-xl flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Line Current ($I_L$)</span>
                <span className="font-mono font-bold text-indigo-600">{math.IL.toFixed(2)} A</span>
             </div>
             <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 p-3 rounded-xl flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Phase Current ($I_PH$)</span>
                <span className="font-mono font-bold text-indigo-600">{math.IPH.toFixed(2)} A</span>
             </div>
             <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 p-3 rounded-xl flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Real Power ($P$) kW</span>
                <span className="font-mono font-bold">{(math.P / 1000).toFixed(2)} kW</span>
             </div>
             <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 p-3 rounded-xl flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Reactive Power ($Q$) kVAR</span>
                <span className="font-mono font-bold">{(math.Q / 1000).toFixed(2)} kVAR</span>
             </div>
          </div>

          <div className="mt-4 p-4 border border-emerald-500/20 bg-emerald-50 dark:bg-emerald-900/10 rounded-xl space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-emerald-800">Total Connection Apparent Power (S):</span>
              <span className="font-mono font-bold text-emerald-700">{(math.S / 1000).toFixed(2)} kVA</span>
            </div>
            {math.bankCapacity !== math.S && (
              <div className="flex justify-between items-center text-xs text-amber-600 border-t border-amber-200 pt-2">
                <span className="font-bold">Effective Open Bank Utilization:</span>
                <span className="font-mono font-bold">{(math.bankCapacity / 1000).toFixed(2)} kVA</span>
              </div>
            )}
            <div className="flex justify-between items-center text-xs text-slate-600 border-t border-slate-200 pt-2">
              <span className="font-bold">Maximum Demand Current (Phase):</span>
              <span className="font-mono font-bold">{math.IL.toFixed(2)} A</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
