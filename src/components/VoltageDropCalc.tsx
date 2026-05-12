import React, { useState, useMemo, useEffect } from 'react';
import { Ruler, Zap, AlertTriangle, Calculator, Link } from 'lucide-react';
import { VoltageDropParams, Circuit, PanelConfig } from '../types';
import { WIRE_IMPEDANCE_TABLE, WIRE_AMPACITY_TABLE, STANDARD_CB_RATINGS } from '../constants';

export interface VoltageDropCalcProps {
  panel?: PanelConfig;
  circuits?: Circuit[];
}

export default function VoltageDropCalc({ panel, circuits }: VoltageDropCalcProps) {
  const [source, setSource] = useState<string>('custom');
  
  const [params, setParams] = useState<VoltageDropParams>({
    loadA: 20,
    length: 30,
    wireSize: '3.5',
    voltage: 230,
    systemType: '1PH'
  });

  // Automatically update params if a source from the load schedule is selected
  useEffect(() => {
    if (!circuits || !panel) return;
    
    if (source === 'main') {
      const totalVA = circuits.reduce((sum, c) => sum + c.loadVA, 0);
      const is3PH = panel.system.includes('3PH');
      const mainCurrent = is3PH ? (totalVA) / (panel.voltage * Math.sqrt(3)) : (totalVA) / panel.voltage;
      const designAmp = mainCurrent * 1.25;
      const cb = STANDARD_CB_RATINGS.find(r => r >= designAmp) || 100;
      
      let minSize = 2.0;
      if (cb > 15 && cb <= 20) minSize = 3.5;
      else if (cb > 20 && cb <= 30) minSize = 5.5;
      const requiredAmpacity = Math.max(designAmp, cb);
      const wire = WIRE_AMPACITY_TABLE.find(w => w.ampacity >= requiredAmpacity && w.size >= minSize) || WIRE_AMPACITY_TABLE[WIRE_AMPACITY_TABLE.length - 1];
      
      setParams(p => ({
        ...p,
        loadA: Number(mainCurrent.toFixed(2)),
        wireSize: wire.size.toString(),
        voltage: panel.voltage,
        systemType: is3PH ? '3PH' : '1PH'
      }));
    } else if (source !== 'custom') {
      const c = circuits.find(c => c.id === source);
      if (c) {
        setParams(p => ({
          ...p,
          loadA: c.loadA,
          wireSize: c.wireSize,
          voltage: c.voltage,
          systemType: c.phases.length > 2 ? '3PH' : '1PH'
        }));
      }
    }
  }, [source, circuits, panel]);

  const calculation = useMemo(() => {
    const data = WIRE_IMPEDANCE_TABLE[params.wireSize] || WIRE_IMPEDANCE_TABLE['3.5'];
    // Full impedance Z = sqrt(R^2 + X^2) or just use Resistance for simple residential/branch
    // PEC formula: VD = 2 * L * I * (R*cosPhi + X*sinPhi) / 1000 for 1PH
    // PEC formula: VD = sqrt(3) * L * I * (R*cosPhi + X*sinPhi) / 1000 for 3PH
    
    const R = data.r;
    const factor = params.systemType === '3PH' ? Math.sqrt(3) : 2;
    const vd = (factor * params.length * params.loadA * R) / 1000;
    const vdPercentage = (vd / params.voltage) * 100;

    return {
      vd: vd.toFixed(2),
      vdPercentage: vdPercentage.toFixed(2),
      isCompliant: vdPercentage <= 3.0 // PEC recommendation 3% for branch, 5% total
    };
  }, [params]);

  return (
    <div className="w-full max-w-full space-y-6">
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 no-print">
        <div className="flex items-center gap-2 mb-6">
          <Ruler className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-slate-800">Voltage Drop Parameters</h2>
        </div>
        <p className="text-xs text-slate-400 mb-6 font-medium">Input circuit length and load to calculate PEC compliance.</p>
        
        <div className="flex flex-col gap-6">
          {circuits && circuits.length > 0 && (
            <div className="space-y-1.5 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
              <label className="text-xs font-bold text-indigo-600 uppercase flex items-center gap-1"><Link className="w-3 h-3" /> Connect to Load Schedule</label>
              <select value={source} onChange={e => setSource(e.target.value)} className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm text-indigo-900 font-medium font-sans mt-2 shadow-sm">
                <option value="custom">Custom Parameters (Disconnected)</option>
                <option value="main">Main Feeder</option>
                <optgroup label="Branch Circuits">
                  {circuits.map(c => (
                    <option key={c.id} value={c.id}>Circuit {c.circuitNo}: {c.description}</option>
                  ))}
                </optgroup>
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Load (Amps)</label>
                  <input type="number" readOnly={source !== 'custom'} value={params.loadA} onChange={e => setParams({...params, loadA: parseFloat(e.target.value)})} className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm ${source !== 'custom' ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-slate-50'}`} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Length (m)</label>
                  <input type="number" value={params.length} onChange={e => setParams({...params, length: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-white border border-slate-300 shadow-sm shadow-slate-100 rounded-lg text-sm font-bold text-slate-900" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Wire (mm²)</label>
                  <select disabled={source !== 'custom'} value={params.wireSize} onChange={e => setParams({...params, wireSize: e.target.value})} className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm ${source !== 'custom' ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-slate-50'}`}>
                    {Object.keys(WIRE_IMPEDANCE_TABLE).map(s => <option key={s} value={s}>{s} mm²</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">System</label>
                  <select disabled={source !== 'custom'} value={params.systemType} onChange={e => setParams({...params, systemType: e.target.value as any})} className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm ${source !== 'custom' ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-slate-50'}`}>
                    <option value="1PH">1Ф</option>
                    <option value="3PH">3Ф</option>
                  </select>
                </div>
          </div>
        </div>
      </section>

      <section id="voltage-drop-diagram" className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8 panel-container">
        <div className="w-full border-b-2 border-slate-100 pb-6 mb-8 flex justify-between items-end">
           <div>
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Voltage Drop Analysis</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Engineering Verification</p>
           </div>
           <p className="text-xs text-slate-400 font-mono">Ver: 1.0.2</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase">Load Current (Amperes)</label>
                <input readOnly={source !== 'custom'} type="number" value={params.loadA} onChange={e => setParams({...params, loadA: parseFloat(e.target.value)})} className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm ${source !== 'custom' ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'bg-slate-50'}`} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase">One-way Length (Meters)</label>
                <input type="number" value={params.length} onChange={e => setParams({...params, length: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-400 rounded-lg text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase">Wire Size (mm²)</label>
                <select disabled={source !== 'custom'} value={params.wireSize} onChange={e => setParams({...params, wireSize: e.target.value})} className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm ${source !== 'custom' ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'bg-slate-50'}`}>
                  {Object.keys(WIRE_IMPEDANCE_TABLE).map(s => <option key={s} value={s}>{s} mm²</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase">System Type</label>
                <select disabled={source !== 'custom'} value={params.systemType} onChange={e => setParams({...params, systemType: e.target.value as any})} className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm ${source !== 'custom' ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'bg-slate-50'}`}>
                  <option value="1PH">Single Phase (1Ф)</option>
                  <option value="3PH">Three Phase (3Ф)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-center gap-6">
            <div className={`p-8 rounded-2xl border-2 flex flex-col items-center transition-colors ${calculation.isCompliant ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <span className={`text-[10px] font-black uppercase mb-1 ${calculation.isCompliant ? 'text-green-600' : 'text-red-600'}`}>Voltage Drop (%)</span>
              <p className={`text-6xl font-black ${calculation.isCompliant ? 'text-green-700' : 'text-red-700'}`}>{calculation.vdPercentage}%</p>
              <div className="mt-4 flex items-center gap-2 font-bold text-sm">
                {calculation.isCompliant ? (
                  <><Zap className="w-4 h-4 text-green-500" /> <span className="text-green-700 uppercase">Compliant with PEC</span></>
                ) : (
                  <><AlertTriangle className="w-4 h-4 text-red-500" /> <span className="text-red-700 uppercase">Exceeds PEC 3% Limit</span></>
                )}
              </div>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400 uppercase font-black">Actual Voltage Drop</p>
              <p className="text-2xl font-bold text-slate-700">{calculation.vd} Volts</p>
            </div>
          </div>
        </div>
      </section>

      {/* Calculations & Formulas Section (Only visible during PDF export / print) */}
      <section className="hidden print-show mt-12 bg-white rounded-2xl border-2 border-slate-800 p-8">
        <div className="flex items-center gap-2 mb-6">
          <Calculator className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-widest">Calculations & Formulas</h2>
        </div>
        
        <div className="space-y-6 text-sm text-slate-700">
          <div>
            <h3 className="font-bold text-slate-900 mb-2">1. Resistance of Wire (R)</h3>
            <p className="mb-2">The resistance depends on the conductor material (Copper = 1.724 × 10^-8 Ω·m) and length, converted for standard NEC/PEC calculations using specific resistance K (K = 3.56 for Copper in ohms per km/mm²).</p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200">
              R = K / Area (mm²)
            </div>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-2">2. Single-Phase vs Three-Phase Voltage Drop</h3>
            <p className="mb-2">The voltage drop equation compensates for single-phase (2 wires) or three-phase (√3) system parameters in accordance with PEC.</p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200 flex flex-col gap-2">
              <span>{`VD (1-Phase) = (2 × K × I × L) / Area`}</span>
              <span>{`VD (3-Phase) = (√3 × K × I × L) / Area`}</span>
            </div>
            <p className="mt-2 text-indigo-600 font-bold">Calculated Actual Voltage Drop: {calculation.vd} Volts</p>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-2">3. Voltage Drop Percentage</h3>
            <p className="mb-2">Article 2.10.2.1(A) FPN No. 4 of the Philippine Electrical Code (PEC) 2017 recommends that the maximum voltage drop for branch circuits does not exceed 3%, and the total voltage drop for feeders and branch circuits does not exceed 5%.</p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200 flex flex-col gap-2">
              <span>{`VD (%) = (Actual Voltage Drop / Source Voltage) × 100`}</span>
            </div>
            <div className="mt-2 text-indigo-600 font-bold flex flex-col gap-1">
              <span>Calculated VD Percentage: {calculation.vdPercentage}%</span>
              <span className={calculation.isCompliant ? "text-green-600" : "text-red-500"}>
                Compliance: {calculation.isCompliant ? "Compliant (≤ 3%)" : "Exceeds limits (> 3%)"}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
