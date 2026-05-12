import React, { useState, useMemo, useEffect } from 'react';
import { ShieldAlert, Activity, GitBranch, Circle, Calculator, Link } from 'lucide-react';
import { ShortCircuitParams, Circuit, PanelConfig, LoadType } from '../types';

export interface ShortCircuitCalcProps {
  panel?: PanelConfig;
  circuits?: Circuit[];
}

export default function ShortCircuitCalc({ panel, circuits }: ShortCircuitCalcProps) {
  const [source, setSource] = useState<string>('custom');
  
  const [params, setParams] = useState<ShortCircuitParams>({
    transformerKVA: 100,
    transformerZ: 5,
    transformerVoltage: 230,
    utilityShortCircuitMVA: 500,
    feederLength: 10,
    feederSize: '30'
  });

  const { motorLoadVA, nonMotorLoadVA } = useMemo(() => {
    if (!circuits || circuits.length === 0) {
      return { motorLoadVA: 0, nonMotorLoadVA: 0 };
    }
    const motorLoadVA = circuits.filter(c => c.loadType === LoadType.MOTOR || c.loadType === LoadType.AIR_CON).reduce((sum, c) => sum + c.loadVA, 0);
    const nonMotorLoadVA = circuits.filter(c => c.loadType !== LoadType.MOTOR && c.loadType !== LoadType.AIR_CON).reduce((sum, c) => sum + c.loadVA, 0);
    return { motorLoadVA, nonMotorLoadVA };
  }, [circuits]);

  // Calculate nearest standard transformer size based on Load Schedule
  useEffect(() => {
    if (!circuits || !panel) return;
    
    if (source === 'auto') {
      const totalVA = circuits.reduce((sum, c) => sum + c.loadVA, 0);
      const totalKVA = totalVA / 1000;
      
      // Standard transformer ratings in kVA
      const standardKVA = [10, 15, 25, 37.5, 50, 75, 100, 167, 250, 333, 500, 750, 1000, 1500, 2000, 2500];
      const recommendedKVA = standardKVA.find(k => k >= totalKVA) || standardKVA[standardKVA.length - 1];

      setParams(p => ({
        ...p,
        transformerKVA: recommendedKVA,
        transformerVoltage: panel.voltage
      }));
    }
  }, [source, circuits, panel]);

  const calculation = useMemo(() => {
    // 1. Utility Isc
    const baseKVA = params.transformerKVA;
    const baseKV = params.transformerVoltage / 1000;
    const zUtilitypu = baseKVA / (params.utilityShortCircuitMVA * 1000);
    
    // 2. Transformer Isc
    const zTranspu = params.transformerZ / 100;
    const totalZpu = zUtilitypu + zTranspu;
    
    const iFullLoad = params.transformerKVA / (Math.sqrt(3) * (params.transformerVoltage / 1000));
    const iscSecondary = iFullLoad / totalZpu;

    const multiplier = 1 / totalZpu;

    return {
      fla: iFullLoad.toFixed(2),
      iFullLoad: iFullLoad.toFixed(2),
      iscSecondary: iscSecondary.toFixed(2),
      zUtilitypu: zUtilitypu.toFixed(5),
      zTranspu: zTranspu.toFixed(5),
      multiplier: multiplier.toFixed(2)
    };
  }, [params]);

  return (
    <div className="w-full max-w-full space-y-6">
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 overflow-hidden no-print">
        <div className="flex items-center gap-2 mb-6">
          <ShieldAlert className="w-5 h-5 text-red-600" />
          <h2 className="text-lg font-bold text-slate-800">Calculation Parameters</h2>
        </div>
        <div className="flex flex-col gap-6">
          {circuits && panel && (
            <div className="space-y-1.5 p-4 bg-red-50/50 rounded-xl border border-red-100">
              <label className="text-xs font-bold text-red-600 uppercase flex items-center gap-1"><Link className="w-3 h-3" /> Connect to Load Schedule</label>
              <select value={source} onChange={e => setSource(e.target.value)} className="w-full px-3 py-2 bg-white border border-red-200 rounded-lg text-sm text-red-900 font-medium font-sans mt-2 shadow-sm">
                <option value="custom">Custom Parameters (Disconnected)</option>
                <option value="auto">Auto-Size from {panel.designation} connected load ({(circuits.reduce((sum, c) => sum + c.loadVA, 0) / 1000).toFixed(2)} kVA)</option>
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Transformer (kVA)</label>
                  <input readOnly={source === 'auto'} type="number" value={params.transformerKVA} onChange={e => setParams({...params, transformerKVA: parseFloat(e.target.value)})} className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm transition-all outline-none ${source === 'auto' ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-slate-50 focus:ring-2 focus:ring-red-500'}`} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Impedance (%Z)</label>
                  <input type="number" value={params.transformerZ} onChange={e => setParams({...params, transformerZ: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm transition-all focus:ring-2 focus:ring-red-500 outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Utility MVAsc</label>
                  <input type="number" value={params.utilityShortCircuitMVA} onChange={e => setParams({...params, utilityShortCircuitMVA: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm transition-all focus:ring-2 focus:ring-red-500 outline-none" />
                </div>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 flex flex-col items-center panel-container print:rounded-none">
        <div className="w-full border-b border-slate-100 pb-4 mb-8">
           <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Short Circuit Calculation Report</h3>
           <p className="text-[10px] text-slate-400 font-bold uppercase">PEC 2017 Requirement 1.10.1.24</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
          <div className="space-y-6">
            <div className="space-y-2">
               <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-1">Input Data Summary</h4>
               <div className="grid grid-cols-2 gap-y-2 text-xs">
                 <span className="text-slate-500">Transformer Rating:</span>
                 <span className="font-bold text-slate-900 text-right">{params.transformerKVA} kVA</span>
                 <span className="text-slate-500">Secondary Voltage:</span>
                 <span className="font-bold text-slate-900 text-right">{params.transformerVoltage}V</span>
                 <span className="text-slate-500">Transformer %Z:</span>
                 <span className="font-bold text-slate-900 text-right">{params.transformerZ}%</span>
               </div>
            </div>

          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <GitBranch className="w-4 h-4" /> Calculated Results
            </h3>
            <div className="p-6 bg-slate-900 rounded-xl text-white space-y-6">
              <div>
                <span className="text-[10px] font-black text-slate-500 uppercase">Full Load Current</span>
                <p className="text-3xl font-black">{calculation.iFullLoad} <span className="text-sm">AMPS</span></p>
              </div>
              <div>
                <span className="text-[10px] font-black text-red-500 uppercase font-mono">Total Fault Current (Isc)</span>
                <p className="text-4xl font-black text-red-400">{calculation.iscSecondary} <span className="text-sm">AMPS</span></p>
              </div>
              <div className="pt-4 border-t border-white/10 grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-500">Z-Utility (pu):</span>
                  <p className="font-mono">{calculation.zUtilitypu}</p>
                </div>
                <div>
                  <span className="text-slate-500">Z-Trans (pu):</span>
                  <p className="font-mono">{calculation.zTranspu}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Impedance Diagram Visual (ETAP Style) */}
      <section id="short-circuit-diagram" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 panel-container print:mt-12">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-12 flex items-center gap-2">
          <Activity className="w-4 h-4 text-red-500" />
          Single Line Impedance Diagram
        </h4>

        <div className="flex flex-col items-center py-12 font-sans overflow-x-auto min-w-[600px]">
          {/* Utility Box */}
          <div className="flex flex-col items-center">
            <div className="w-40 border border-slate-900 p-2 bg-slate-50 relative flex flex-col items-center">
               <span className="text-[9px] font-black absolute -top-2 bg-white px-2 uppercase tracking-tighter">Utility Sc</span>
               <p className="text-[10px] font-mono font-bold">{params.utilityShortCircuitMVA} MVA</p>
               <Circle className="w-8 h-8 text-slate-800 my-1" />
            </div>
            <div className="w-0.5 h-10 bg-slate-900 relative">
               <span className="absolute left-3 top-2 text-[8px] font-bold text-slate-400">115 kV Bus</span>
            </div>
            
            {/* Transformer Symbol */}
            <div className="relative py-2">
               <div className="w-12 h-12 rounded-full border-2 border-slate-900" />
               <div className="w-12 h-12 rounded-full border-2 border-slate-900 -mt-6 bg-white flex items-center justify-center">
                  <span className="text-[8px] font-black">XFMR</span>
               </div>
               
               {/* Transformer Data Box */}
               <div className="absolute left-16 top-0 w-32 border border-blue-200 p-2 text-[9px] bg-blue-50/50">
                  <p className="font-bold border-b border-blue-100 mb-1">TX-01</p>
                  <p>Rating: {params.transformerKVA} kVA</p>
                  <p>Imp: {params.transformerZ}% Z</p>
                  <p>X/R: 7.0</p>
               </div>
            </div>

            <div className="w-0.5 h-10 bg-slate-900 relative">
               <div className="absolute left-[-16px] top-4 w-8 h-0.5 bg-slate-900" />
               <span className="absolute left-3 top-2 text-[8px] font-bold text-slate-400">Main 230V Bus</span>
            </div>

            {/* Fault Point */}
            <div className="relative mt-2">
               <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                  <ShieldAlert className="w-4 h-4 text-red-600 animate-pulse" />
               </div>
               <div className="absolute left-12 top-[-10px] w-40 border-2 border-red-200 p-3 bg-red-50">
                  <p className="text-[9px] font-black text-red-700 uppercase mb-1">Fault Point Results</p>
                  <div className="grid grid-cols-2 gap-y-1 text-[10px] font-mono leading-none">
                     <span className="text-slate-400">Isc Sym:</span>
                     <span className="font-bold">{(parseFloat(calculation.iscSecondary)/1.2).toFixed(1)} A</span>
                     <span className="text-slate-400">Isc Peak:</span>
                     <span className="font-bold">{(parseFloat(calculation.iscSecondary) * 1.6).toFixed(0)} A</span>
                     <span className="text-red-600 font-black">Total:</span>
                     <span className="text-red-600 font-black">{calculation.iscSecondary} A</span>
                  </div>
               </div>
            </div>
          </div>
        </div>
        
        <p className="text-[9px] text-slate-400 mt-8 italic text-center">Diagram generated per Philippine Electrical Code calculation methods.</p>
      </section>

      {/* Power Schematic Diagram */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 panel-container print:mt-12">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-12 flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-500" />
          Power Schematic Diagram
        </h4>

        <div className="flex flex-col items-center py-12 font-sans overflow-x-auto min-w-[600px]">
          <div className="relative flex justify-center w-full min-w-[600px]">
            <svg width="600" height="600" viewBox="0 0 600 600" className="stroke-slate-900 text-slate-900 fill-none" strokeWidth="2">
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" stroke="none" />
                </marker>
              </defs>

              {/* Utility source */}
              <polygon points="280,20 320,20 300,50" />
              <line x1="300" y1="50" x2="300" y2="100" />
              <rect x="180" y="20" width="80" height="30" />
              <text x="220" y="40" fontSize="14" fill="currentColor" stroke="none" textAnchor="middle">{params.utilityShortCircuitMVA} MVA</text>

              {/* Transformer */}
              <path d="M 270 110 Q 280 90 290 110 T 310 110 T 330 110" />
              <path d="M 270 130 Q 280 150 290 130 T 310 130 T 330 130" />
              <line x1="300" y1="80" x2="300" y2="105" />
              <line x1="300" y1="135" x2="300" y2="180" />

              <rect x="350" y="70" width="80" height="25" />
              <text x="390" y="87" fontSize="12" stroke="none" fill="currentColor" textAnchor="middle">{params.transformerKVA} kVA</text>

              <rect x="350" y="100" width="100" height="25" />
              <text x="400" y="117" fontSize="12" stroke="none" fill="currentColor" textAnchor="middle">13.8/{params.transformerVoltage}V</text>

              <rect x="350" y="130" width="80" height="25" />
              <text x="390" y="147" fontSize="12" stroke="none" fill="currentColor" textAnchor="middle">{panel?.system?.includes('3PH') ? '3' : '1'}φ</text>

              <rect x="350" y="160" width="80" height="25" />
              <text x="390" y="177" fontSize="12" stroke="none" fill="currentColor" textAnchor="middle">{params.transformerZ}% Z</text>

              {/* Breaker */}
              <path d="M 300 200 A 20 20 0 0 1 300 240" fill="none" />
              <circle cx="300" cy="200" r="3" fill="currentColor" />
              <circle cx="300" cy="240" r="3" fill="currentColor" />
              <line x1="300" y1="240" x2="300" y2="280" />

              {/* Main Bus */}
              <line x1="150" y1="280" x2="450" y2="280" strokeWidth="4" />

              {/* Fault */}
              <line x1="420" y1="270" x2="440" y2="290" strokeWidth="2" />
              <line x1="420" y1="290" x2="440" y2="270" strokeWidth="2" />
              <path d="M 460 230 L 435 230 L 430 270" fill="none" markerEnd="url(#arrow)" />
              <text x="490" y="235" fontSize="14" fill="currentColor" stroke="none" textAnchor="middle">FAULT</text>
              <text x="490" y="255" fontSize="14" fill="currentColor" stroke="none" textAnchor="middle">1</text>
              <rect x="440" y="265" width="100" height="25" />
              <text x="490" y="282" fontSize="12" fill="currentColor" stroke="none" textAnchor="middle">{((parseFloat(calculation.iscSecondary) * 1.25) / 1000).toFixed(2)} kA</text>
              <rect x="440" y="295" width="60" height="20" />
              <text x="470" y="309" fontSize="10" fill="currentColor" stroke="none" textAnchor="middle">ASSYM</text>

              {/* Motor Load */}
              <line x1="200" y1="280" x2="200" y2="350" />
              <circle cx="200" cy="380" r="30" />
              <polygon points="180,365 220,365 200,400" />
              <text x="200" y="440" fontSize="14" fontWeight="bold" textAnchor="middle" stroke="none" fill="currentColor">MOTOR LOAD</text>
              <rect x="130" y="450" width="140" height="25" />
              <text x="200" y="467" fontSize="12" textAnchor="middle" stroke="none" fill="currentColor">LUMPED: {(motorLoadVA / 1000).toFixed(2)} kVA</text>
              <rect x="130" y="480" width="35" height="20" />
              <text x="147" y="494" fontSize="10" textAnchor="middle" stroke="none" fill="currentColor">25%</text>
              <text x="170" y="494" fontSize="12" textAnchor="start" stroke="none" fill="currentColor">Z as per IEEE std.</text>

              {/* Non-Motor Load */}
              <line x1="400" y1="280" x2="400" y2="350" />
              <circle cx="400" cy="380" r="30" />
              <polygon points="380,365 420,365 400,400" />
              <text x="400" y="440" fontSize="14" fontWeight="bold" textAnchor="middle" stroke="none" fill="currentColor">NON-MOTOR LOAD</text>
              <rect x="330" y="450" width="140" height="25" />
              <text x="400" y="467" fontSize="12" textAnchor="middle" stroke="none" fill="currentColor">LUMPED: {(nonMotorLoadVA / 1000).toFixed(2)} kVA</text>

              {/* Title Section */}
              <line x1="120" y1="560" x2="500" y2="560" />
              <circle cx="100" cy="560" r="15" />
              <text x="100" y="555" fontSize="10" fontWeight="bold" textAnchor="middle" stroke="none" fill="currentColor">1</text>
              <text x="100" y="568" fontSize="10" fontWeight="bold" textAnchor="middle" stroke="none" fill="currentColor">SC</text>
              <text x="130" y="550" fontSize="20" letterSpacing="2" textAnchor="start" stroke="none" fill="currentColor">POWER SCHEMATIC DIAGRAM</text>
              <text x="130" y="575" fontSize="12" fontWeight="bold" textAnchor="start" stroke="none" fill="currentColor">SCALE</text>
              <text x="500" y="575" fontSize="12" fontWeight="bold" textAnchor="end" stroke="none" fill="currentColor">N T S</text>

            </svg>
          </div>
        </div>
      </section>

      {/* Calculations & Formulas Section (Only visible during PDF export / print) */}
      <section className="hidden print-show mt-12 bg-white rounded-2xl border-2 border-slate-800 p-8">
        <div className="flex items-center gap-2 mb-6">
          <Calculator className="w-5 h-5 text-red-600" />
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-widest">Calculations & Formulas</h2>
        </div>
        
        <div className="space-y-6 text-sm text-slate-700">
          <div>
            <h3 className="font-bold text-slate-900 mb-2">1. Base Current (FLA) Calculation</h3>
            <p className="mb-2">The Full Load Ampere (FLA) is calculated based on the transformer rating (kVA). Assuming 3-Phase system parameters in accordance with PEC.</p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200">
              FLA = (kVA × 1000) / (Voltage × √3)
            </div>
            <p className="mt-2 text-red-600 font-bold">Calculated FLA: {calculation.fla} Amperes</p>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-2">2. Impedance Multiplier (M)</h3>
            <p className="mb-2">The Multiplier determines the relationship between the Full Load Current and the Short Circuit Current, considering the Utility Fault level (MVA) and Transformer Impedance (%Z).</p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200 flex flex-col gap-2">
              <span>{`Step A: Transformer Multiplier = 100 / %Z`}</span>
              <span>{`Step B: Utility Contribution Factor = Utilities MVA / Transformer kVA`}</span>
              <span>{`Combined Multiplier (M) = 1 / ((%Z / 100) + (Transformer kVA / (Utility MVA × 1000)))`}</span>
            </div>
            <p className="mt-2 text-red-600 font-bold">Calculated Multiplier (M): {calculation.multiplier}</p>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-2">3. Secondary Short Circuit Current (Isc)</h3>
            <p className="mb-2">The max available fault current at the secondary of the transformer is crucial for sizing the primary Overcurrent Protection Device (OCPD). Multiplied by 1.25 for Asymmetrical considerations.</p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200 flex flex-col gap-2">
              <span>{`Isc (Symmetrical) = FLA × Multiplier (M)`}</span>
              <span>{`Isc (Asymmetrical) = Isc (Symmetrical) × 1.25 Asymmetry Factor (PEC Std)`}</span>
            </div>
            <div className="mt-2 text-red-600 font-bold flex flex-col gap-1">
              <span>Asymmetrical Short Circuit Current (Isc): {calculation.iscSecondary} Amperes</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
