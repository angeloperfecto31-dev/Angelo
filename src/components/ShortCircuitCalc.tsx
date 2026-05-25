import React, { useState, useMemo, useEffect } from 'react';
import { ShieldAlert, Activity, GitBranch, Circle, Calculator, Link, Maximize2, Minimize2, Download } from 'lucide-react';
import { ShortCircuitParams, Circuit, PanelConfig, LoadType } from '../types';
import { WIRE_AMPACITY_TABLE, STANDARD_CB_RATINGS } from '../constants';
import { exportDiagramToDXF } from '../utils/exportDxf';

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
  const markerId = `arrow-${React.useId().replace(/:/g, '')}`;

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
          <defs>
            <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#94a3b8" />
            </marker>
          </defs>
          <path 
            d={`M ${pos.x + (lineEndOffset?.x || 0)} ${pos.y + (lineEndOffset?.y || 0)} L ${lineStart.x} ${lineStart.y}`} 
            stroke="#94a3b8" 
            strokeWidth="1.5" 
            strokeDasharray="4 4" 
            markerEnd={`url(#${markerId})`}
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
  const [diagramTab, setDiagramTab] = useState<'svg' | 'interactive'>('svg');
  const [isBWMode, setIsBWMode] = useState(false);

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
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 overflow-hidden no-print">
        <div className="flex items-center gap-2 mb-6">
          <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400" />
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 font-sans">Calculation Parameters</h2>
        </div>
        <div className="flex flex-col gap-6">
          {circuits && panel && (
            <div className="space-y-1.5 p-4 bg-red-50/50 dark:bg-red-950/25 rounded-xl border border-red-100 dark:border-red-900/40">
              <label className="text-xs font-bold text-red-600 dark:text-red-400 uppercase flex items-center gap-1"><Link className="w-3 h-3" /> Connect to Load Schedule</label>
              <select value={source} onChange={e => setSource(e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900 rounded-lg text-sm text-red-900 dark:text-red-200 font-medium font-sans mt-2 shadow-sm focus:outline-none">
                <option value="custom" className="dark:bg-slate-900 dark:text-slate-100">Custom Parameters (Disconnected)</option>
                <option value="auto" className="dark:bg-slate-900 dark:text-slate-100">Auto-Size from {panel.designation} connected load ({(circuits.reduce((sum, c) => sum + c.loadVA, 0) / 1000).toFixed(2)} kVA)</option>
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Utility MVAsc</label>
                  <input type="number" value={params.utilityShortCircuitMVA} onChange={e => setParams({...params, utilityShortCircuitMVA: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-950 dark:text-slate-100 transition-all focus:ring-2 focus:ring-red-500 outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Pri Voltage (V)</label>
                  <input type="number" value={params.primaryVoltage} onChange={e => setParams({...params, primaryVoltage: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 transition-all focus:ring-2 focus:ring-red-500 outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Sec Voltage (V)</label>
                  <input readOnly={source === 'auto'} type="number" value={params.transformerVoltage} onChange={e => setParams({...params, transformerVoltage: parseFloat(e.target.value)})} className={`w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-sm transition-all outline-none ${source === 'auto' ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed' : 'bg-slate-50 dark:bg-slate-800 text-slate-950 dark:text-slate-100 focus:ring-2 focus:ring-red-500'}`} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Connection</label>
                  <select value={params.transformerConnection} onChange={e => setParams({...params, transformerConnection: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-950 dark:text-slate-100 transition-all focus:ring-2 focus:ring-red-500 outline-none">
                     <option value="Delta-Wye" className="dark:bg-slate-900 dark:text-slate-100">Delta-Wye</option>
                     <option value="Wye-Wye" className="dark:bg-slate-900 dark:text-slate-100">Wye-Wye</option>
                     <option value="Delta-Delta" className="dark:bg-slate-900 dark:text-slate-100">Delta-Delta</option>
                  </select>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Trans (kVA)</label>
                  <input readOnly={source === 'auto'} type="number" value={params.transformerKVA} onChange={e => setParams({...params, transformerKVA: parseFloat(e.target.value)})} className={`w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-sm transition-all outline-none ${source === 'auto' ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed' : 'bg-slate-50 dark:bg-slate-800 text-slate-950 dark:text-slate-100 focus:ring-2 focus:ring-red-500'}`} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Trans (%Z)</label>
                  <input type="number" value={params.transformerZ} onChange={e => setParams({...params, transformerZ: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 transition-all focus:ring-2 focus:ring-red-500 outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Length (m)</label>
                  <input type="number" value={params.feederLength} onChange={e => setParams({...params, feederLength: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 transition-all focus:ring-2 focus:ring-red-500 outline-none" />
                </div>
                <div className="space-y-1.5 flex gap-2">
                  <div className="flex-1">
                     <label className="text-xs font-bold text-slate-400 uppercase">Size(mm²)</label>
                     <select value={params.feederSize} onChange={e => setParams({...params, feederSize: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 transition-all focus:ring-2 focus:ring-red-500 outline-none">
                        {['2.0', '3.5', '5.5', '8.0', '14', '22', '30', '38', '50', '60', '80', '100', '125', '150', '200', '250', '325', '400', '500'].map(s => <option key={s} value={s} className="dark:bg-slate-900 dark:text-slate-100">{s}</option>)}
                     </select>
                  </div>
                  <div className="flex-1">
                     <label className="text-xs font-bold text-slate-400 uppercase">Type</label>
                     <select value={params.conductorType} onChange={e => setParams({...params, conductorType: e.target.value as 'Copper' | 'Aluminum'})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 transition-all focus:ring-2 focus:ring-red-500 outline-none">
                        <option value="Copper" className="dark:bg-slate-900 dark:text-slate-100">Copper</option>
                        <option value="Aluminum" className="dark:bg-slate-900 dark:text-slate-100">Aluminum</option>
                     </select>
                  </div>
                  <div className="w-16">
                     <label className="text-xs font-bold text-slate-400 uppercase">Runs</label>
                     <input type="number" value={params.feederRuns} onChange={e => setParams({...params, feederRuns: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 transition-all focus:ring-2 focus:ring-red-500 outline-none" />
                  </div>
                </div>
          </div>
        </div>
      </section>

      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-8 flex flex-col items-center panel-container print:rounded-none">
        <div className="w-full border-b border-slate-100 dark:border-slate-800 pb-4 mb-8">
           <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter">Short Circuit Calculation Report</h3>
           <p className="text-[10px] text-slate-400 font-bold uppercase">PEC 2017 Requirement 1.10.1.24</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
          <div className="space-y-6">
            <div className="space-y-2">
               <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-50 dark:border-slate-800 pb-1">Input Data Summary</h4>
               <div className="grid grid-cols-2 gap-y-2 text-xs">
                 <span className="text-slate-500 dark:text-slate-400">Transformer Rating:</span>
                 <span className="font-bold text-slate-900 dark:text-slate-100 text-right">{params.transformerKVA} kVA</span>
                 <span className="text-slate-500 dark:text-slate-400">Secondary Voltage:</span>
                 <span className="font-bold text-slate-900 dark:text-slate-100 text-right">{params.transformerVoltage}V</span>
                 <span className="text-slate-500 dark:text-slate-400">Transformer %Z:</span>
                 <span className="font-bold text-slate-900 dark:text-slate-100 text-right">{params.transformerZ}%</span>
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
        <section id="short-circuit-diagram" className={`bg-white dark:bg-slate-900 rounded-2xl shadow-sm panel-container print:mt-12 relative ${isDiagramExpanded ? 'w-full max-w-4xl max-h-full overflow-auto p-8' : 'border border-slate-200 dark:border-slate-800 p-8'}`}>
          <div className="flex items-center justify-between mb-8">
            <div className="flex flex-col gap-1">
              <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-4 h-4 text-red-500" />
                Single Line Impedance Diagram
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-sans print:hidden">Select representation view:</p>
            </div>
            
            <div className="flex items-center gap-4 no-print">
              <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <button 
                  type="button"
                  onClick={() => setIsBWMode(false)} 
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${!isBWMode ? 'bg-white dark:bg-slate-700 shadow text-slate-800 dark:text-slate-200' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100'}`}
                >
                  Colored Mode
                </button>
                <button 
                  type="button"
                  onClick={() => setIsBWMode(true)} 
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${isBWMode ? 'bg-white dark:bg-slate-700 shadow text-slate-800 dark:text-slate-200' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100'}`}
                >
                  B&W Mode
                </button>
              </div>
              
              <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <button 
                  type="button"
                  onClick={() => setDiagramTab('svg')} 
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${diagramTab === 'svg' ? 'bg-white dark:bg-slate-700 shadow text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100'}`}
                >
                  2D Core Schematic
                </button>
                <button 
                  type="button"
                  onClick={() => setDiagramTab('interactive')} 
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${diagramTab === 'interactive' ? 'bg-white dark:bg-slate-700 shadow text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100'}`}
                >
                  Interactive (Blocks)
                </button>
              </div>

              <button
                type="button"
                onClick={() => exportDiagramToDXF(panel, params, calculation, motorLoadVA)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-800 dark:bg-slate-700 text-white rounded-md hover:bg-slate-900 dark:hover:bg-slate-600 transition-colors"
                title="Export AutoCAD 2D (DXF)"
              >
                <Download className="w-3.5 h-3.5" />
                DXF
              </button>

              <button 
                type="button"
                onClick={() => setIsDiagramExpanded(!isDiagramExpanded)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                title={isDiagramExpanded ? "Minimize Diagram" : "Maximize Diagram"}
              >
                {isDiagramExpanded ? <Minimize2 className="w-4 h-4 text-slate-500" /> : <Maximize2 className="w-4 h-4 text-slate-500" />}
              </button>
            </div>
          </div>

          <div className="relative">
            <div className={`w-full flex flex-col items-center py-6 font-sans overflow-x-auto ${diagramTab === 'svg' ? 'block' : 'hidden'}`}>
              {/* Wrapping relative container to allow DraggableBoxes to overlay perfectly */}
              <div 
                className="relative w-[850px] h-[720px] shrink-0 overflow-visible select-none pointer-events-auto transition-[filter]"
                style={{ filter: isBWMode ? 'grayscale(100%)' : 'none' }}
              >
                {/* SVG 2D Single Line Impedance Diagram */}
                <svg
                  viewBox="0 0 850 720"
                  className="absolute top-0 left-0 w-full h-full font-sans text-slate-800 dark:text-slate-100 pointer-events-none"
                >
                  <defs>
                    <style>
                      {`
                        .sld-line { fill: none; stroke: #334155; stroke-width: 2; }
                        .dark .sld-line { stroke: #94a3b8; }
                        .sld-dash { fill: none; stroke: #94a3b8; stroke-width: 1.5; stroke-dasharray: 4 4; }
                        .dark .sld-dash { stroke: #475569; }
                        .sld-text-title { fill: #1e3a8a; font-family: "Inter", sans-serif; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
                        .dark .sld-text-title { fill: #93c5fd; }
                        .sld-text-val { fill: #0f172a; font-family: "JetBrains Mono", "Fira Code", monospace; font-size: 10px; font-weight: bold; }
                        .dark .sld-text-val { fill: #e2e8f0; }
                        .sld-text-lbl { fill: #64748b; font-family: "Inter", sans-serif; font-size: 10px; font-weight: 500; }
                        .dark .sld-text-lbl { fill: #94a3b8; }
                        .sld-shape-tx-blue { fill: #eff6ff; stroke: #2563eb; }
                        .dark .sld-shape-tx-blue { fill: #1e3a8a/30; stroke: #3b82f6; }
                        .sld-shape-tx-green { fill: #f0fdf4; stroke: #16a34a; }
                        .dark .sld-shape-tx-green { fill: #14532d/30; stroke: #4ade80; }
                        .sld-shape-tx-orange { fill: #fff7ed; stroke: #ea580c; }
                        .dark .sld-shape-tx-orange { fill: #7c2d12/30; stroke: #f97316; }
                        .sld-symbol-bg { fill: #f8fafc; }
                        .dark .sld-symbol-bg { fill: #1e293b; }
                      `}
                    </style>
                  </defs>

                  {/* HEADER DIVIDERS / COHESIVE COLUMNS */}
                  {/* Left Head */}
                  <text x="180" y="30" className="sld-text-title" textAnchor="middle" style={{ fontSize: '13px', fontWeight: 'bold' }}>I. System Single Line Diagram</text>
                  <line x1="80" y1="40" x2="280" y2="40" className="sld-line" strokeWidth="2" />

                  {/* Equivalent Head */}
                  <text x="560" y="30" className="sld-text-title" textAnchor="middle" style={{ fontSize: '13px', fontWeight: 'bold' }}>II. Sequence Impedance Model</text>
                  <line x1="460" y1="40" x2="660" y2="40" className="sld-line" strokeWidth="2" />

                  {/* ROW 1: UTILITY */}
                  {/* Left Column Symbol (Utility generator circle) */}
                  <circle cx="180" cy="90" r="22" className="sld-line sld-symbol-bg" />
                  <path d="M 166,90 Q 173,78 180,90 T 194,90" className="sld-line" strokeWidth="2" />
                  <text x="180" y="125" className="sld-text-lbl" textAnchor="middle" style={{ fontWeight: 'bold' }}>UTILITY INF. BUS</text>

                  {/* Divider Dash linking Left and Right */}
                  <line x1="210" y1="90" x2="510" y2="90" className="sld-dash" />

                  {/* Right Column Index Reference Bar (Infinite Bus) */}
                  <line x1="510" y1="90" x2="610" y2="90" className="sld-line" strokeWidth="6" />
                  <text x="560" y="75" className="sld-text-title" textAnchor="middle">Infinite Bus (V = 1.0 pu)</text>

                  {/* Right Column Utility Impedance Series Reactor */}
                  <line x1="560" y1="90" x2="560" y2="120" className="sld-line" />
                  <rect x="545" y="120" width="30" height="35" className="sld-shape-tx-blue" strokeWidth="2" rx="3" />
                  <text x="560" y="141" className="sld-text-val" textAnchor="middle" style={{ fill: '#3b82f6' }}>Zu</text>
                  <line x1="560" y1="155" x2="560" y2="185" className="sld-line" />


                  {/* PRIMARY TO SECONDARY BUS CONNECTORS */}
                  <line x1="180" y1="112" x2="180" y2="190" className="sld-line" />


                  {/* ROW 2: TRANSFORMER */}
                  {/* Left Column Transformer Symbol (Overlap Circles) */}
                  <circle cx="180" cy="212" r="20" className="sld-line sld-symbol-bg" />
                  <circle cx="180" cy="232" r="20" className="sld-line" fill="none" />
                  <text x="180" y="270" className="sld-text-lbl" textAnchor="middle" style={{ fontWeight: 'bold' }}>TX-01 TRANSFORMER</text>

                  {/* Divider Dash linking Left and Right */}
                  <line x1="210" y1="212" x2="510" y2="212" className="sld-dash" />

                  {/* Right Column Transformer impedance series block */}
                  <rect x="545" y="185" width="30" height="35" className="sld-shape-tx-green" strokeWidth="2" rx="3" />
                  <text x="560" y="206" className="sld-text-val" textAnchor="middle" style={{ fill: '#4ade80' }}>Zt</text>
                  <line x1="560" y1="220" x2="560" y2="280" className="sld-line" strokeWidth="2" />


                  {/* SECONDARY BUS WORKWAY */}
                  <line x1="180" y1="252" x2="180" y2="300" className="sld-line" />


                  {/* ROW 3: MAIN BREAKER & MDP BUS */}
                  {/* Left Column Main Breaker Rectangle */}
                  <rect x="171" y="300" width="18" height="26" rx="2" className="sld-line sld-symbol-bg" />
                  <line x1="171" y1="313" x2="189" y2="313" className="sld-line" strokeWidth="1.5" />
                  <text x="200" y="317" className="sld-text-val">{panel ? `${panel.mainBreakerAT}A/${panel.mainBreakerAF}AF` : '100A'}</text>

                  <line x1="180" y1="326" x2="180" y2="350" className="sld-line" />

                  {/* MDP Horizontal Copper BUS BAR */}
                  <line x1="80" y1="350" x2="280" y2="350" className="sld-line" strokeWidth="5" />
                  <text x="285" y="347" className="sld-text-title">MAIN MDP BUS</text>
                  <text x="285" y="360" className="sld-text-val" style={{ fill: '#ef4444' }}>{calculation.iscMainBreaker} A (Isc Symmetrical)</text>

                  {/* Divider Dash linking Left and Right */}
                  <line x1="285" y1="350" x2="510" y2="350" className="sld-dash" />

                  {/* Right Column MDP node */}
                  <circle cx="560" cy="280" r="5" fill="#dc2626" />
                  <text x="575" y="284" className="sld-text-lbl" style={{ fontWeight: 'bold' }}>MDP MAIN BUS NODE</text>
                  <text x="575" y="296" className="sld-text-val" style={{ fill: '#dc2626' }}>Isc = {calculation.iscMainBreaker}A</text>


                  {/* FEEDER CONDUCTOR WORKWAY */}
                  <line x1="180" y1="352" x2="180" y2="400" className="sld-line" />


                  {/* ROW 4: FEEDER SEGMENT */}
                  {/* Left Column Segment Line representing conductor feeder */}
                  <line x1="180" y1="400" x2="180" y2="480" className="sld-line" strokeWidth="3" style={{ stroke: '#ea580c' }} />
                  <text x="180" y="445" className="sld-text-val" style={{ fill: '#ea580c' }} textAnchor="middle">★ FEEDER CABLE ★</text>

                  {/* Divider Dash linking Left and Right */}
                  <line x1="210" y1="440" x2="510" y2="440" className="sld-dash" />

                  {/* Right Column Feeder Line impedance series block */}
                  <line x1="560" y1="285" x2="560" y2="380" className="sld-line" />
                  <rect x="545" y="380" width="30" height="35" className="sld-shape-tx-orange" strokeWidth="2" rx="3" />
                  <text x="560" y="401" className="sld-text-val" textAnchor="middle" style={{ fill: '#ea580c' }}>Zcab</text>
                  <line x1="560" y1="415" x2="560" y2="520" className="sld-line" strokeWidth="2" />


                  {/* FEEDER TO FAULT POINT CONNECTORS */}
                  <line x1="180" y1="480" x2="180" y2="520" className="sld-line" strokeWidth="2" />


                  {/* ROW 5: FAULT POINT AND SYSTEM GROUND */}
                  {/* Left Column Starburst / Explosion Fault Symbol */}
                  <g transform="translate(180,540)">
                    <path
                      d="M -35,0 L -12,12 L -15,25 L -2,10 L 12,28 L 10,8 L 30,0 L 8,-8 L 12,-25 L -1,-10 L -15,-28 L -10,-8 Z"
                      className="sld-line"
                      fill="#fef2f2"
                      stroke="#dc2626"
                      strokeWidth="2.5"
                    />
                    <path
                      d="M -20,0 L -7,7 L -9,15 L -1,6 L 7,16 L 6,5 L 18,0 L 5,-5 L 7,-15 L -1,-6 L -9,-16 L -6,-5 Z"
                      fill="#ef4444"
                    />
                    <text x="0" y="3" className="sld-text-val" fill="white" textAnchor="middle" style={{ fontSize: '11px', fontWeight: 'bold' }}>Isc</text>
                  </g>
                  <text x="180" y="595" className="sld-text-title" textAnchor="middle" fill="#dc2626">LINE FAULT POINT B</text>

                  {/* Divider Dash linking Left and Right */}
                  <line x1="220" y1="540" x2="510" y2="530" className="sld-dash" />

                  {/* Right Column Impedance equivalents ground system */}
                  <line x1="560" y1="465" x2="560" y2="505" className="sld-line" />
                  
                  {/* Fault point grounding block */}
                  <g transform="translate(560,505)">
                    <line x1="-30" y1="0" x2="30" y2="0" stroke="#dc2626" strokeWidth="4" />
                    <line x1="-20" y1="8" x2="20" y2="8" stroke="#dc2626" strokeWidth="3" />
                    <line x1="-10" y1="16" x2="10" y2="16" stroke="#dc2626" strokeWidth="2" />
                    
                    {/* Lightning arrow pointing down into ground */}
                    <path d="M 0,-40 L -7,-15 L 2,-15 L -3,8 Z" fill="#ef4444" stroke="#dc2626" strokeWidth="1" />
                  </g>
                  <text x="560" y="540" className="sld-text-title" textAnchor="middle" fill="#dc2626">SYSTEM SHORT CIRCUITED NODE</text>
                  <text x="560" y="555" className="sld-text-val" textAnchor="middle" fill="#b91c1c">Total Equiv Sym Isc = {calculation.totalFaultM} A</text>

                </svg>

                {/* INTERACTIVE DRAGGABLE LABELS FOR SVG */}
                {/* 1. Grid Supply Detail Box */}
                <DraggableBox 
                  defaultPos={{ x: 20, y: 65 }} 
                  lineStart={{ x: 158, y: 90 }} 
                  lineEndOffset={{ x: 130, y: 25 }}
                  className="w-32 border border-slate-200 bg-slate-50/95 backdrop-blur-xs p-2 shadow-sm rounded-lg text-left"
                >
                  <div className="select-none pointer-events-none text-[9px]">
                    <div className="font-bold text-slate-500 uppercase tracking-widest text-[8px] mb-0.5">Grid Supply</div>
                    <div className="font-mono font-bold text-slate-800 text-[10px]">{params.utilityShortCircuitMVA} MVAsc</div>
                    <div className="text-slate-500 mt-0.5">{(params.primaryVoltage/1000).toFixed(1)} kV Pri</div>
                  </div>
                </DraggableBox>

                {/* 2. Utility Impedance Box */}
                <DraggableBox
                  defaultPos={{ x: 630, y: 112 }}
                  lineStart={{ x: 575, y: 137 }}
                  lineEndOffset={{ x: 0, y: 25 }}
                  className="w-44 border border-blue-200 bg-blue-50/95 backdrop-blur-xs p-2 shadow-sm rounded-lg text-left"
                >
                  <div className="select-none pointer-events-none text-[9px]">
                    <div className="font-bold text-blue-800 uppercase tracking-widest text-[8px] mb-0.5">Utility Impedance</div>
                    <div className="text-slate-500">Z_utility:</div>
                    <div className="font-mono font-bold text-blue-700 text-[10px]">{calculation.zUtilitypu} pu</div>
                  </div>
                </DraggableBox>

                {/* 3. Transformer Spec Box */}
                <DraggableBox
                  defaultPos={{ x: 20, y: 188 }}
                  lineStart={{ x: 160, y: 222 }}
                  lineEndOffset={{ x: 130, y: 32 }}
                  className="w-32 border border-emerald-200 bg-emerald-50/95 backdrop-blur-xs p-2 shadow-sm rounded-lg text-left"
                >
                  <div className="select-none pointer-events-none text-[9px]">
                    <div className="font-bold text-emerald-800 uppercase tracking-widest text-[8px] mb-0.5">TX-01 Spec</div>
                    <div className="font-mono font-bold text-emerald-900 text-[10px]">{params.transformerKVA} kVA</div>
                    <div className="text-slate-500 mt-0.5">%Z = {params.transformerZ}%</div>
                    <div className="text-slate-400 font-medium text-[8px]">{params.transformerConnection}</div>
                  </div>
                </DraggableBox>

                {/* 4. Transformer Impedance Box */}
                <DraggableBox
                  defaultPos={{ x: 630, y: 178 }}
                  lineStart={{ x: 575, y: 202 }}
                  lineEndOffset={{ x: 0, y: 25 }}
                  className="w-44 border border-emerald-200 bg-emerald-50/95 backdrop-blur-xs p-2 shadow-sm rounded-lg text-left"
                >
                  <div className="select-none pointer-events-none text-[9px]">
                    <div className="font-bold text-emerald-800 uppercase tracking-widest text-[8px] mb-0.5">XFMR Impedance</div>
                    <div className="text-slate-500">Z_transformer:</div>
                    <div className="font-mono font-bold text-emerald-700 text-[10px]">{calculation.zTranspu} pu</div>
                  </div>
                </DraggableBox>

                {/* 5. Conductor Conductor Info Box */}
                <DraggableBox
                  defaultPos={{ x: 20, y: 398 }}
                  lineStart={{ x: 176, y: 440 }}
                  lineEndOffset={{ x: 130, y: 32 }}
                  className="w-36 border border-orange-200 bg-orange-50/95 backdrop-blur-xs p-2 shadow-sm rounded-lg text-left"
                >
                  <div className="select-none pointer-events-none text-[9px]">
                    <div className="font-bold text-amber-800 uppercase tracking-widest text-[8px] mb-0.5">Conductor Spec</div>
                    <div className="font-mono font-bold text-amber-900 text-[10px]">{params.feederRuns} Runs x {params.feederSize} mm²</div>
                    <div className="text-slate-600 font-medium text-[8.5px]">{params.conductorType} Conductors</div>
                    <div className="text-slate-500 mt-0.5">Length: {params.feederLength} meters</div>
                  </div>
                </DraggableBox>

                {/* 6. Conductor Impedance Box */}
                <DraggableBox
                  defaultPos={{ x: 630, y: 372 }}
                  lineStart={{ x: 575, y: 397 }}
                  lineEndOffset={{ x: 0, y: 32 }}
                  className="w-44 border border-orange-200 bg-orange-50/95 backdrop-blur-xs p-2 shadow-sm rounded-lg text-left"
                >
                  <div className="select-none pointer-events-none text-[9px]">
                    <div className="font-bold text-amber-800 uppercase tracking-widest text-[8px] mb-0.5">Feeder Impedance</div>
                    <div className="text-slate-500 font-mono text-[8.5px]">R={calculation.feederR} Ω | X={calculation.feederX} Ω</div>
                    <div className="text-slate-500 mt-0.5">Z_feeder (pu):</div>
                    <div className="font-mono font-bold text-amber-800 text-[10px]">{calculation.zFeederpu} pu</div>
                  </div>
                </DraggableBox>

                {/* 7. Fault Outputs Box */}
                <DraggableBox
                  defaultPos={{ x: 20, y: 505 }}
                  lineStart={{ x: 155, y: 540 }}
                  lineEndOffset={{ x: 130, y: 32 }}
                  className="w-36 border border-red-200 bg-red-50/95 backdrop-blur-xs p-2 shadow-sm rounded-lg text-left"
                >
                  <div className="select-none pointer-events-none text-[9px]">
                    <div className="font-bold text-red-800 uppercase tracking-widest text-[8px] mb-0.5">Fault Outputs</div>
                    <div className="text-slate-500">Symmetrical Isc:</div>
                    <div className="font-mono font-bold text-red-700 text-[10px]">{calculation.iscSecondary} A</div>
                    {motorLoadVA > 0 && (
                      <div className="text-red-600/80 text-[8px]">Motor feedback: +{calculation.motorContribution}A</div>
                    )}
                    <div className="mt-1 pt-1 border-t border-red-200 font-bold text-slate-900">Total: {calculation.totalFaultM} A</div>
                  </div>
                </DraggableBox>

                {/* 8. Impedance Total Box */}
                <DraggableBox
                  defaultPos={{ x: 630, y: 475 }}
                  lineStart={{ x: 575, y: 520 }}
                  lineEndOffset={{ x: 0, y: 37 }}
                  className="w-44 border border-red-200 bg-red-50/95 backdrop-blur-xs p-2 shadow-sm rounded-lg text-left"
                >
                  <div className="select-none pointer-events-none text-[9px]">
                    <div className="font-bold text-red-800 uppercase tracking-widest text-[8px] mb-0.5">Impedance Total</div>
                    <div className="text-slate-500 text-[8px] leading-tight">Total Z = {(parseFloat(calculation.zUtilitypu) + parseFloat(calculation.zTranspu) + parseFloat(calculation.zFeederpu)).toFixed(5)} pu</div>
                    <div className="text-slate-500 text-[8px]">Multiplier M = {calculation.multiplier}</div>
                    <div className="mt-1 font-bold text-red-700 text-[10px]">Asym Isc (1.6x): {(parseFloat(calculation.totalFaultM) * 1.6).toFixed(0)} A</div>
                  </div>
                </DraggableBox>

              </div>
            </div>

            <div 
              className={`flex flex-col items-center py-12 font-sans overflow-x-auto min-w-[600px] transition-[filter] ${diagramTab === 'interactive' ? 'flex' : 'hidden'}`}
              style={{ filter: isBWMode ? 'grayscale(100%)' : 'none' }}
            >
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
