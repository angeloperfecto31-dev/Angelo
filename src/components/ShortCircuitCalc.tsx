import React, { useState, useMemo, useEffect } from 'react';
import { ShieldAlert, Activity, GitBranch, Circle, Calculator, Link, Maximize2, Minimize2 } from 'lucide-react';
import { ShortCircuitParams, Circuit, PanelConfig, LoadType } from '../types';
import { WIRE_AMPACITY_TABLE, STANDARD_CB_RATINGS } from '../constants';

export interface ShortCircuitCalcProps {
  panel?: PanelConfig;
  circuits?: Circuit[];
  subPanels?: { id: string, panel: PanelConfig, circuits: Circuit[] }[];
  params: ShortCircuitParams;
  setParams: React.Dispatch<React.SetStateAction<ShortCircuitParams>>;
  source: string;
  setSource: React.Dispatch<React.SetStateAction<string>>;
}

const DraggableBox = ({ 
  defaultPos, 
  lineStart,
  lineEndOffset,
  children, 
  className = "" 
}: { 
  defaultPos: { x: number, y: number }, 
  lineStart?: { x: number, y: number },
  lineEndOffset?: { x: number, y: number },
  children: React.ReactNode, 
  className?: string 
}) => {
  const [pos, setPos] = useState(defaultPos);
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    setStartPos({
      x: e.clientX - pos.x,
      y: e.clientY - pos.y
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setPos({
        x: e.clientX - startPos.x,
        y: e.clientY - startPos.y
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <>
      {lineStart && (
        <svg className="absolute top-0 left-0 pointer-events-none overflow-visible" style={{ width: 1, height: 1, zIndex: 0 }}>
          <path 
            d={`M ${lineStart.x} ${lineStart.y} L ${pos.x + (lineEndOffset?.x || 0)} ${pos.y + (lineEndOffset?.y || 0)}`} 
            stroke="#94a3b8" 
            strokeWidth="1.5" 
            strokeDasharray="3 3" 
            fill="none" 
          />
        </svg>
      )}
      <div
        className={`absolute cursor-move transition-transform ${isDragging ? 'scale-105 shadow-2xl' : ''} ${className}`}
        style={{ left: pos.x, top: pos.y, zIndex: isDragging ? 50 : 20, touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {children}
      </div>
    </>
  );
};

export default function ShortCircuitCalc({ panel, circuits, subPanels, params, setParams, source, setSource }: ShortCircuitCalcProps) {

  const [isDiagramExpanded, setIsDiagramExpanded] = useState(false);

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

      const phaseLoads = { R: 0, Y: 0, B: 0 };
      circuits.forEach(c => {
        c.phases.forEach(p => {
          const key = p as keyof typeof phaseLoads;
          phaseLoads[key] = (phaseLoads[key] || 0) + c.loadVA / c.phases.length;
        });
      });
      const maxPhaseLoad = Math.max(phaseLoads.R, phaseLoads.Y, phaseLoads.B);
      
      let mainCurrent = 0;
      if (panel.system.includes('3PH')) {
          mainCurrent = (maxPhaseLoad * 3) / (panel.voltage * Math.sqrt(3));
      } else {
          mainCurrent = (totalKVA * 1000) / panel.voltage;
      }
      
      const designAmp = mainCurrent * 1.25;
      const cb = panel.mainBreakerAT || STANDARD_CB_RATINGS.find(r => r >= designAmp) || 100;
      
      let minSize = 2.0;
      if (cb > 15 && cb <= 20) minSize = 3.5;
      else if (cb > 20 && cb <= 30) minSize = 5.5;

      const requiredAmpacity = Math.max(designAmp, cb);
      const wire = WIRE_AMPACITY_TABLE.find(w => w.ampacity >= requiredAmpacity && w.size >= minSize) || WIRE_AMPACITY_TABLE[WIRE_AMPACITY_TABLE.length - 1];
      const recommendedFeederSize = wire.size.toString();

      setParams(p => {
        if (p.transformerKVA === recommendedKVA && p.transformerVoltage === panel.voltage && p.feederSize === recommendedFeederSize) {
          return p;
        }
        return {
          ...p,
          transformerKVA: recommendedKVA,
          transformerVoltage: panel.voltage,
          feederSize: recommendedFeederSize
        };
      });
    }
  }, [source, circuits, panel]);

  const calculation = useMemo(() => {
    // 1. Utility Isc
    const baseKVA = params.transformerKVA;
    const baseKV = params.transformerVoltage / 1000;
    const zUtilitypu = baseKVA / (params.utilityShortCircuitMVA * 1000);
    
    // 2. Transformer Isc
    const zTranspu = params.transformerZ / 100;

    // 3. Feeder Impedance Estimate (Simplified pu)
    const feederR = 0.7 * (params.feederLength / 1000) / (params.feederRuns || 1);
    const feederX = 0.08 * (params.feederLength / 1000) / (params.feederRuns || 1);
    const feederZ = Math.sqrt(feederR*feederR + feederX*feederX);
    const zFeederpu = feederZ * (baseKVA / 1000) / (baseKV * baseKV);

    const totalZpu = zUtilitypu + zTranspu + zFeederpu;
    
    const iFullLoad = params.transformerKVA / (Math.sqrt(3) * (params.transformerVoltage / 1000));
    
    // Isc at different points
    const iscMainBreaker = iFullLoad / (zUtilitypu + zTranspu);
    const iscFaultPoint = iFullLoad / totalZpu;

    const motorContribution = motorLoadVA > 0 ? (motorLoadVA / (Math.sqrt(3) * params.transformerVoltage)) * 4 : 0;
    
    const multiplier = 1 / totalZpu;

    return {
      fla: iFullLoad.toFixed(2),
      iFullLoad: iFullLoad.toFixed(2),
      iscMainBreaker: iscMainBreaker.toFixed(2),
      iscSecondary: iscFaultPoint.toFixed(2),
      motorContribution: motorContribution.toFixed(2),
      totalFaultM: (iscFaultPoint + motorContribution).toFixed(2),
      feederR: feederR.toFixed(4),
      feederX: feederX.toFixed(4),
      zFeederpu: zFeederpu.toFixed(5),
      zUtilitypu: zUtilitypu.toFixed(5),
      zTranspu: zTranspu.toFixed(5),
      multiplier: multiplier.toFixed(2)
    };
  }, [params, motorLoadVA]);

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

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Utility MVAsc</label>
                  <input type="number" value={params.utilityShortCircuitMVA} onChange={e => setParams({...params, utilityShortCircuitMVA: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm transition-all focus:ring-2 focus:ring-red-500 outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Pri Voltage (V)</label>
                  <input type="number" value={params.primaryVoltage} onChange={e => setParams({...params, primaryVoltage: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm transition-all focus:ring-2 focus:ring-red-500 outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Sec Voltage (V)</label>
                  <input readOnly={source === 'auto'} type="number" value={params.transformerVoltage} onChange={e => setParams({...params, transformerVoltage: parseFloat(e.target.value)})} className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm transition-all outline-none ${source === 'auto' ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-slate-50 focus:ring-2 focus:ring-red-500'}`} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Connection</label>
                  <select value={params.transformerConnection} onChange={e => setParams({...params, transformerConnection: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm transition-all focus:ring-2 focus:ring-red-500 outline-none">
                     <option value="Delta-Wye">Delta-Wye</option>
                     <option value="Wye-Wye">Wye-Wye</option>
                     <option value="Delta-Delta">Delta-Delta</option>
                  </select>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Trans (kVA)</label>
                  <input readOnly={source === 'auto'} type="number" value={params.transformerKVA} onChange={e => setParams({...params, transformerKVA: parseFloat(e.target.value)})} className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm transition-all outline-none ${source === 'auto' ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-slate-50 focus:ring-2 focus:ring-red-500'}`} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Trans (%Z)</label>
                  <input type="number" value={params.transformerZ} onChange={e => setParams({...params, transformerZ: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm transition-all focus:ring-2 focus:ring-red-500 outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Length (m)</label>
                  <input type="number" value={params.feederLength} onChange={e => setParams({...params, feederLength: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm transition-all focus:ring-2 focus:ring-red-500 outline-none" />
                </div>
                <div className="space-y-1.5 flex gap-2">
                  <div className="flex-1">
                     <label className="text-xs font-bold text-slate-400 uppercase">Size(mm²)</label>
                     <select value={params.feederSize} onChange={e => setParams({...params, feederSize: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm transition-all focus:ring-2 focus:ring-red-500 outline-none">
                        {['2.0', '3.5', '5.5', '8.0', '14', '22', '30', '38', '50', '60', '80', '100', '125', '150', '200', '250', '325', '400', '500'].map(s => <option key={s} value={s}>{s}</option>)}
                     </select>
                  </div>
                  <div className="flex-1">
                     <label className="text-xs font-bold text-slate-400 uppercase">Type</label>
                     <select value={params.conductorType} onChange={e => setParams({...params, conductorType: e.target.value as 'Copper' | 'Aluminum'})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm transition-all focus:ring-2 focus:ring-red-500 outline-none">
                        <option value="Copper">Copper</option>
                        <option value="Aluminum">Aluminum</option>
                     </select>
                  </div>
                  <div className="w-16">
                     <label className="text-xs font-bold text-slate-400 uppercase">Runs</label>
                     <input type="number" value={params.feederRuns} onChange={e => setParams({...params, feederRuns: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm transition-all focus:ring-2 focus:ring-red-500 outline-none" />
                  </div>
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
      <div className={isDiagramExpanded ? "fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex p-4 pb-20 items-center justify-center overflow-auto" : ""}>
        <section id="short-circuit-diagram" className={`bg-white rounded-2xl shadow-sm panel-container print:mt-12 relative ${isDiagramExpanded ? 'w-full max-w-4xl max-h-full overflow-auto p-8' : 'border border-slate-200 p-8'}`}>
          <div className="flex items-center justify-between mb-12">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-4 h-4 text-red-500" />
              Single Line Impedance Diagram
            </h4>
            <button 
              onClick={() => setIsDiagramExpanded(!isDiagramExpanded)}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors no-print"
              title={isDiagramExpanded ? "Minimize Diagram" : "Maximize Diagram"}
            >
              {isDiagramExpanded ? <Minimize2 className="w-4 h-4 text-slate-500" /> : <Maximize2 className="w-4 h-4 text-slate-500" />}
            </button>
          </div>

          <div className="flex flex-col items-center py-12 font-sans overflow-x-auto min-w-[600px]">
            {/* Utility Box */}
            <div className="flex flex-col items-center">
              <div className="w-40 border-2 border-slate-900 p-2 bg-slate-50 relative flex flex-col items-center shadow-sm">
                 <span className="text-[9px] font-black absolute -top-2.5 bg-white px-2 uppercase tracking-widest text-slate-500">Utility</span>
                 <p className="text-[10px] font-mono font-bold mt-1 text-slate-800">{params.utilityShortCircuitMVA} MVAsc</p>
                 <Circle className="w-6 h-6 text-slate-800 my-1" />
              </div>
              
              <div className="w-0.5 h-12 bg-slate-900 relative">
                 <span className="absolute left-4 top-4 text-[9px] font-bold text-slate-500 whitespace-nowrap">{(params.primaryVoltage/1000).toFixed(1)} kV Primary</span>
              </div>
              
              {/* Transformer Symbol */}
              <div className="relative py-1 border-slate-500 mb-2">
                 <div className="w-12 h-12 rounded-full border-2 border-slate-900 absolute -top-5 left-1/2 -translate-x-1/2" />
                 <div className="w-12 h-12 rounded-full border-2 border-slate-900 bg-white flex items-center justify-center relative z-10 top-0">
                    <span className="text-[8px] font-black tracking-tighter">XFMR</span>
                 </div>
                 
                 {/* Transformer Data Box */}
                 <DraggableBox defaultPos={{ x: 80, y: -24 }} lineStart={{x: 48, y: 24}} lineEndOffset={{x: 0, y: 48}} className="w-48 border border-blue-200 p-3 text-[9px] bg-blue-50/80 backdrop-blur-sm text-slate-700 rounded-lg">
                    <p className="font-bold border-b border-blue-200 mb-2 pb-1 uppercase tracking-wider text-blue-800">TX-01 Details</p>
                    <p className="mb-0.5">Rating: <span className="font-mono font-black text-slate-900 float-right">{params.transformerKVA} kVA</span></p>
                    <p className="mb-0.5">Voltage: <span className="font-mono font-black text-slate-900 float-right">{(params.primaryVoltage/1000).toFixed(1)}kV / {params.transformerVoltage}V</span></p>
                    <p className="mb-0.5">Impedance: <span className="font-mono font-black text-slate-900 float-right">{params.transformerZ}% Z</span></p>
                    <p>Conn: <span className="font-bold float-right">{params.transformerConnection}</span></p>
                 </DraggableBox>
              </div>

              <div className="w-0.5 h-12 bg-slate-900 relative">
                 <div className="absolute left-[-12px] top-6 w-6 h-0.5 bg-slate-900" />
                 <span className="absolute left-4 top-4 text-[9px] font-bold text-slate-500 whitespace-nowrap">Sec {params.transformerVoltage}V Bus</span>
              </div>

              {/* Main Breaker */}
              <div className="relative py-1 flex flex-col items-center mb-2">
                 <div className="w-6 h-6 border-2 border-slate-900 rounded-md bg-white z-10 flex items-center justify-center relative shadow-sm">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-slate-800 rounded-sm"></div>
                 </div>
                 <div className="w-0.5 h-8 bg-slate-900 relative" />
                 
                 {/* Main Breaker Data Box */}
                 <DraggableBox defaultPos={{ x: 56, y: -8 }} lineStart={{x: 24, y: 28}} lineEndOffset={{x: 0, y: 36}} className="w-44 border border-slate-200 text-[9px] bg-white shadow-md z-20 rounded-lg overflow-hidden">
                    <div className="cursor-move bg-slate-100 px-3 py-1.5 border-b border-slate-200 font-bold uppercase tracking-wider text-slate-600 flex justify-between">
                      <span>Main Breaker</span>
                    </div>
                    <div className="px-3 py-2 space-y-1 text-slate-700">
                      <p className="flex justify-between">Rating: <span className="font-mono font-black text-slate-900">{panel ? `${panel.mainBreakerAT}AT / ${panel.mainBreakerAF}AF` : '100AT'}</span></p>
                      <p className="flex justify-between">kAIC: <span className="font-mono font-black text-slate-900">{panel?.icRating || '10kAIC'}</span></p>
                    </div>
                 </DraggableBox>
              </div>
              
              {/* MDP BUS */}
              <div 
                 className="h-2.5 bg-slate-800 relative shadow-sm rounded-full z-10 flex justify-center mt-2"
                 style={{ width: subPanels && subPanels.length > 2 ? Math.max(300, subPanels.length * 130) + 'px' : '256px' }}
              >
                 <span className="absolute -left-14 top-1/2 -translate-y-1/2 text-[11px] font-black text-slate-600 uppercase tracking-widest">MDP</span>
                 <div className="absolute left-1/2 -translate-x-1/2 top-2.5 w-0.5 h-10 bg-slate-800" />
                 
                 {(!subPanels || subPanels.length === 0) && (
                   <>
                     <div className="absolute left-10 top-2.5 w-0.5 h-8 bg-slate-800" />
                     <div className="absolute right-10 top-2.5 w-0.5 h-8 bg-slate-800" />
                   </>
                 )}

                 {subPanels && subPanels.length > 0 && subPanels.map((sp, idx) => {
                    const total = subPanels.length;
                    const half = Math.ceil(total / 2);
                    let leftPct = '50%';
                    if (total === 1) {
                      leftPct = '25%';
                    } else if (total === 2) {
                      leftPct = idx === 0 ? '25%' : '75%';
                    } else if (idx < half) {
                      leftPct = `${10 + (30 * idx / (half - 1))}%`;
                    } else {
                      leftPct = `${60 + (30 * (idx - half) / (total - half - 1))}%`;
                    }

                    return (
                    <div key={sp.id} className="absolute top-2.5 flex flex-col items-center" style={{ left: leftPct, transform: 'translateX(-50%)' }}>
                       <div className="w-0.5 h-16 bg-slate-800" />
                       <DraggableBox defaultPos={{ x: -48, y: 0 }} lineStart={{x: 1, y: 64}} lineEndOffset={{x: 48, y: 0}} className="w-24 border-2 border-slate-300 bg-white p-1.5 shadow-sm text-center rounded-sm">
                          <p className="cursor-move text-[8px] font-black uppercase text-slate-700 truncate w-full">{sp.panel.designation || 'SUB PANEL'}</p>
                          <p className="text-[7px] font-bold text-slate-500 mt-1">{sp.panel.mainBreakerAT}AT / {sp.panel.mainBreakerAF}AF</p>
                          <p className="text-[7px] font-mono text-slate-500">{sp.panel.icRating}</p>
                       </DraggableBox>
                    </div>
                 )})}
              </div>

              <div className="w-0.5 h-12 bg-transparent relative" />

              {/* FEEDER Section */}
              <div className="relative flex flex-col items-center mt-2 mb-2">
                 <div className="w-2 h-20 bg-orange-400 relative rounded-full border border-orange-500 shadow-sm z-10" />
                 
                 {/* Feeder Data Box */}
                 <DraggableBox defaultPos={{ x: 64, y: 4 }} lineStart={{x: 24, y: 48}} lineEndOffset={{x: 0, y: 44}} className="w-52 border border-orange-200 p-3 text-[9px] bg-orange-50/90 backdrop-blur-sm text-slate-700 shadow-md rounded-lg">
                    <p className="font-bold border-b border-orange-200 mb-2 pb-1 uppercase tracking-wider text-orange-800 flex items-center gap-1">Feeder Details</p>
                    <p className="mb-0.5">Wire: <span className="font-mono font-black float-right">{params.feederRuns}x {params.feederSize}mm² {params.conductorType}</span></p>
                    <p className="mb-0.5">Length: <span className="font-mono font-black float-right">{params.feederLength}m</span></p>
                    <p className="mb-0.5 text-[8px] mt-1 space-x-1"><span className="font-black text-slate-600">R:</span> <span>{parseFloat(calculation.feederR).toExponential(2)}</span> <span className="font-black text-slate-600 ml-1">X:</span> <span>{parseFloat(calculation.feederX).toExponential(2)}</span></p>
                    <p className="mt-1 pt-1 border-t border-orange-200 text-[10px]">Impedance: <span className="font-mono font-black text-orange-900 float-right">Z = {calculation.zFeederpu} pu</span></p>
                 </DraggableBox>
              </div>
              
              <div className="w-0.5 h-6 bg-slate-900 relative" />

              <div className="w-0.5 h-4 bg-transparent relative" />

              {/* Motor Contribution & Fault Point */}
              <div className="relative mt-8 flex flex-col items-center">
                 
                 {/* Motor Contribution Arrow (If applicable) */}
                 {motorLoadVA > 0 && (
                   <div className="absolute -left-28 -top-8 flex flex-col items-center">
                      <div className="w-10 h-10 rounded-full border-2 border-slate-700 flex items-center justify-center bg-slate-50 shadow-sm relative z-20">
                         <span className="text-[10px] font-black text-slate-700">M</span>
                      </div>
                      <div className="w-0.5 h-6 bg-slate-700" />
                      <svg className="absolute w-8 h-8 pointer-events-none left-4 top-10" viewBox="0 0 32 32">
                        <path d="M 0 0 L 16 16 M 16 16 L 24 8 M 16 16 L 8 24" stroke="#334155" strokeWidth="2" fill="none" />
                      </svg>
                      <DraggableBox defaultPos={{ x: -48, y: -16 }} lineStart={{x: 20, y: 20}} lineEndOffset={{x: 48, y: 16}} className="text-[8px] bg-white border border-slate-200 px-2 py-1 shadow-md rounded-md z-30">
                         <p className="cursor-move font-bold whitespace-nowrap text-slate-500">Motor Cont.</p>
                         <p className="font-mono font-black text-slate-800">{calculation.motorContribution}A</p>
                      </DraggableBox>
                   </div>
                 )}

                 {/* Arrow pointing down to fault */}
                 <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-red-600 animate-bounce mb-1" />
                 
                 <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center border-2 border-red-400 z-10 relative shadow-sm">
                    <ShieldAlert className="w-5 h-5 text-red-600 animate-pulse" />
                 </div>
                 
                 {/* Fault arrows pointing to center */}
                 <svg className="absolute w-16 h-16 pointer-events-none -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2 mt-1 z-0" viewBox="0 0 100 100">
                    <path d="M 5 50 L 30 50 M 95 50 L 70 50" stroke="#dc2626" strokeWidth="3" markerEnd="url(#fault-arrow)" strokeDasharray="3 2" className="animate-pulse" />
                    <defs>
                       <marker id="fault-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                          <path d="M 0 0 L 10 5 L 0 10 z" fill="#dc2626" />
                       </marker>
                    </defs>
                 </svg>

                 {/* Fault Point Results Box */}
                 <DraggableBox defaultPos={{ x: 80, y: -24 }} lineStart={{x: 40, y: 32}} lineEndOffset={{x: 0, y: 56}} className="w-52 border-2 border-red-200 p-3 bg-red-50/95 backdrop-blur-sm text-left shadow-xl rounded-xl z-20">
                    <div className="cursor-move flex items-center gap-1.5 mb-2 border-b border-red-200 pb-1">
                      <Activity className="w-4 h-4 text-red-600" />
                      <p className="text-[10px] font-black text-red-800 uppercase tracking-wider">Fault Output Summary</p>
                    </div>
                    <div className="grid grid-cols-2 gap-y-1.5 text-[9px] font-mono leading-tight">
                       <span className="text-slate-600">Isc Main CB:</span>
                       <span className="font-bold text-slate-800 text-right">{calculation.iscMainBreaker} A</span>
                       <span className="text-slate-600">Isc Feeder:</span>
                       <span className="font-bold text-slate-800 text-right">{calculation.iscSecondary} A</span>
                       
                       {motorLoadVA > 0 && (
                         <>
                           <span className="text-slate-600">Motor Cont:</span>
                           <span className="font-bold text-slate-800 text-right">+{calculation.motorContribution} A</span>
                         </>
                       )}
                       
                       <div className="col-span-2 my-1 border-t border-red-200" />
                       
                       <span className="text-red-800 font-bold text-[10px]">Total Sym:</span>
                       <span className="text-red-700 font-black text-[11px] text-right">{calculation.totalFaultM} A</span>
                       
                       <span className="text-slate-600 mt-1">Total Asym:</span>
                       <span className="font-bold text-slate-700 text-right mt-1">{(parseFloat(calculation.totalFaultM) * 1.6).toFixed(0)} A</span>
                    </div>
                 </DraggableBox>
              </div>
            </div>
          </div>
          
          <p className="text-[9px] text-slate-400 mt-8 italic text-center">Diagram generated per Philippine Electrical Code calculation methods.</p>
        </section>
      </div>



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
