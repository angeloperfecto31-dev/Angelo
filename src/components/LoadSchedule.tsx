import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Printer, 
  Settings2, 
  Info, 
  Zap,
  Calculator,
  FileText,
  Copy,
  ShieldAlert,
  List,
  X
} from 'lucide-react';
import { 
  Circuit, 
  PanelConfig, 
  LoadType, 
  Phase,
  MCBType
} from '../types';
import { 
  WIRE_AMPACITY_TABLE, 
  STANDARD_CB_RATINGS, 
  SYSTEM_VOLTAGES, 
  DESCRIPTION_CODES,
  LOAD_PRESETS
} from '../constants';
import { SingleLineDiagram } from './SingleLineDiagram';

export const INITIAL_CIRCUITS: Circuit[] = [
  {
    id: crypto.randomUUID(),
    circuitNo: 1,
    description: 'LIGHTING OUTLETS - GROUND FLOOR',
    wattage: 100,
    quantity: 12,
    loadVA: 1200,
    pf: 1.0,
    voltage: 230,
    phases: ['R'],
    loadA: 5.22,
    mcbAT: 15,
    mcbAF: 50,
    mcbP: 1,
    mcbKAIC: 10,
    mcbType: MCBType.BOLT_ON,
    wireSize: '2.0',
    wireType: 'THHN',
    groundSize: '2.0',
    conduitSize: '15mm',
    conduitType: 'PVC',
    loadType: LoadType.LIGHTING
  },
  {
    id: crypto.randomUUID(),
    circuitNo: 2,
    description: 'CONVENIENCE OUTLETS - GROUND FLOOR',
    wattage: 180,
    quantity: 20,
    loadVA: 3600,
    pf: 1.0,
    voltage: 230,
    phases: ['R'],
    loadA: 15.65,
    mcbAT: 20,
    mcbAF: 50,
    mcbP: 2,
    mcbKAIC: 10,
    mcbType: MCBType.BOLT_ON,
    wireSize: '3.5',
    wireType: 'THHN',
    groundSize: '3.5',
    conduitSize: '15mm',
    conduitType: 'PVC',
    loadType: LoadType.CONVENIENCE_OUTLET
  }
];

export const INITIAL_PANEL: PanelConfig = {
  project: 'RESIDENTIAL BUILDING',
  location: 'MAIN PANEL - GARAGE',
  designation: 'MDP',
  type: 'MAIN DISTRIBUTION PANEL',
  system: '230V, 1PH, 2W',
  connectionType: 'Line-to-Line',
  mounting: 'FLUSH MOUNTED',
  enclosure: 'NEMA 1',
  mainBreakerAT: 60,
  mainBreakerAF: 100,
  icRating: '10kA',
  voltage: 230,
  frequency: 60
};

export interface LoadScheduleProps {
  panel: PanelConfig;
  setPanel: React.Dispatch<React.SetStateAction<PanelConfig>>;
  circuits: Circuit[];
  setCircuits: React.Dispatch<React.SetStateAction<Circuit[]>>;
  isSubPanel?: boolean;
  onAddSubPanel?: () => void;
  onRemoveSubPanel?: () => void;
  availableSubPanels?: { id: string, panel: PanelConfig, circuits: Circuit[] }[];
  readOnly?: boolean;
}

const WireBundle = ({ system, wireSize, groundSize, isBranch = false, phases = [], className = "", direction = "down" }: { system?: string, wireSize: string | number, groundSize: string | number, isBranch?: boolean, phases?: string[], className?: string, direction?: "down" | "up" | "left" | "right" }) => {
   const baseSize = parseFloat(wireSize.toString()) || 2;
   const gSize = parseFloat(groundSize.toString()) || 2;
   const getPx = (s: number) => Math.floor(Math.max(2, Math.pow(s, 0.6) * 1.5));
   const mainPx = getPx(baseSize);
   const gPx = getPx(gSize);

   const wires: { id: string, color: string, size: number }[] = [];
   const getWires = () => {
      if (isBranch) {
         phases.forEach(p => {
             if (p === 'R') wires.push({ id:'R', color: 'bg-red-500', size: mainPx });
             if (p === 'Y') wires.push({ id:'Y', color: 'bg-yellow-400', size: mainPx });
             if (p === 'B') wires.push({ id:'B', color: 'bg-blue-500', size: mainPx });
         });
         if (phases.length < 3 && (!system || system.includes('1PH'))) {
             wires.push({ id:'N', color: 'bg-slate-300', size: mainPx });
         }
         wires.push({ id:'G', color: 'bg-green-500', size: gPx });
      } else if (system) {
         if (system.includes('1PH')) {
            wires.push(
               { id:'L', color: 'bg-black', size: mainPx },
               { id:'N', color: 'bg-slate-300', size: mainPx },
               { id:'G', color: 'bg-green-500', size: gPx }
            );
         } else if (system.includes('4W')) {
            wires.push(
               { id:'L1', color: 'bg-red-500', size: mainPx },
               { id:'L2', color: 'bg-yellow-400', size: mainPx },
               { id:'L3', color: 'bg-blue-500', size: mainPx },
               { id:'N', color: 'bg-slate-300', size: mainPx },
               { id:'G', color: 'bg-green-500', size: gPx }
            );
         } else {
            wires.push(
               { id:'L1', color: 'bg-red-500', size: mainPx },
               { id:'L2', color: 'bg-yellow-400', size: mainPx },
               { id:'L3', color: 'bg-blue-500', size: mainPx },
               { id:'G', color: 'bg-green-500', size: gPx }
            );
         }
      }
   };
   getWires();

   const animClass = direction === 'down' ? 'animate-flow-down' : 
                     direction === 'up' ? 'animate-flow-up' : 
                     direction === 'right' ? 'animate-flow-right' : 'animate-flow-left';

   const flowPattern = direction === 'down' || direction === 'up' 
        ? 'linear-gradient(to bottom, transparent 40%, rgba(255,255,255,0.7) 50%, transparent 60%)'
        : 'linear-gradient(to right, transparent 40%, rgba(255,255,255,0.7) 50%, transparent 60%)';
   const flowSize = direction === 'down' || direction === 'up' ? '100% 16px' : '16px 100%';

   const isVertical = direction === 'down' || direction === 'up';

   return (
      <div className={`flex ${isVertical ? 'flex-row' : 'flex-col'} justify-center gap-[1px] items-center shrink-0 ${className}`}>
         {wires.map(w => (
            <div key={w.id} className={`${w.color} relative overflow-hidden`} style={{
               width: isVertical ? `${w.size}px` : '100%',
               height: isVertical ? '100%' : `${w.size}px`
            }}>
               <div className={`absolute inset-0 mix-blend-overlay opacity-60 ${animClass}`} style={{
                  backgroundImage: flowPattern,
                  backgroundSize: flowSize,
               }} />
            </div>
         ))}
      </div>
   );
};

const RealisticBreaker = ({ amps, poles, kaic, type, isMain = false }: { amps: string | number, poles: number, kaic: number, type: string, isMain?: boolean }) => {
   const isDinRail = type.includes('MCB') || type.includes('DIN');
   
   return (
      <div className={`relative flex rounded overflow-hidden z-20 shrink-0 shadow-md ${isMain ? 'h-32' : 'h-24'} ${isDinRail ? 'bg-white border border-slate-300' : 'bg-[#e2e3e5] border border-slate-400'}`}>
         {/* Rendering per pole for realism */}
         {Array.from({length: poles}).map((_, i) => (
             <div key={i} className={`flex flex-col items-center justify-between border-r last:border-r-0 ${isDinRail ? 'border-slate-200' : 'border-slate-400'} ${isMain ? 'w-10' : 'w-8'}`}>
                 {/* Top terminal */}
                 <div className={`w-full h-[15%] flex justify-center items-center shadow-inner border-b ${isDinRail ? 'bg-zinc-200 border-zinc-300' : 'bg-zinc-400 border-zinc-500'}`}>
                    <div className="w-2.5 h-2.5 rounded-full bg-zinc-300 border border-zinc-500 shadow-inner flex items-center justify-center">
                       <div className="w-1.5 h-[1px] bg-zinc-500 rounded" />
                    </div>
                 </div>
                 
                 {/* Center body for pole */}
                 <div className="flex-1 w-full flex flex-col justify-center items-center relative">
                     {/* Branding / Text only on the first pole or center */}
                     {i === 0 && !isMain && (
                        <div className="absolute top-1 left-1 flex flex-col justify-start items-start opacity-70">
                           <span className="text-[5px] font-bold text-blue-600 leading-none tracking-tighter">bonti</span>
                           <span className="text-[5px] font-black text-slate-500 leading-none mt-0.5">{type}</span>
                        </div>
                     )}
                     {isMain && i === Math.floor(poles/2) && (
                        <div className="absolute top-1 flex flex-col justify-center items-center w-full opacity-80">
                           <span className="text-[6px] font-bold text-blue-600 leading-none">bonti</span>
                           <span className="text-[5px] font-black text-slate-500 leading-none mt-0.5">{type}</span>
                        </div>
                     )}
                     
                     {/* Switch Toggle */}
                     <div className={`bg-zinc-800 rounded-sm shadow-inner relative flex justify-center items-center overflow-hidden border border-zinc-900 ${isDinRail ? (isMain ? 'w-5 h-8 mt-4' : 'w-4 h-6 mt-2') : (isMain ? 'w-6 h-10 mt-4' : 'w-5 h-8 mt-2')}`}>
                         <div className={`w-full h-1/2 flex justify-center items-center absolute top-0 shadow-inner border-b ${isMain ? 'bg-orange-500 border-orange-700' : 'bg-slate-700 border-slate-900'}`}>
                         </div>
                     </div>
                     
                     {i === 0 && (
                        <div className="absolute bottom-1 right-1/2 translate-x-1/2">
                           <span className={`font-bold leading-none block ${isDinRail ? 'text-teal-600' : 'text-slate-800'} ${isMain ? 'text-[10px]' : 'text-[8px]'}`}>C{amps}</span>
                        </div>
                     )}
                 </div>

                 {/* Bottom terminal */}
                 <div className={`w-full h-[15%] flex justify-center items-center shadow-inner border-t ${isDinRail ? 'bg-zinc-200 border-zinc-300' : 'bg-zinc-400 border-zinc-500'}`}>
                    <div className="w-2.5 h-2.5 rounded-full bg-zinc-300 border border-zinc-500 shadow-inner flex items-center justify-center">
                       <div className="w-1.5 h-[1px] bg-zinc-500 rounded" />
                    </div>
                 </div>
             </div>
         ))}
      </div>
   );
};

const VerticalBusBarComponent: React.FC<{ label: string, is3Phase?: boolean }> = ({ label, is3Phase = true }) => {
   return (
       <div className="w-24 h-full min-h-[96px] bg-transparent flex flex-col items-center justify-center relative z-10 shrink-0 overflow-visible">
           {/* The vertical parallel lines spanning the row */}
           <div className="absolute inset-y-0 w-full flex justify-evenly z-0 pt-0 pb-0">
               {is3Phase ? (
                   <>
                       <div className="w-2 bg-red-500 shadow-sm"></div>
                       <div className="w-2 bg-yellow-400 shadow-sm"></div>
                       <div className="w-2 bg-blue-500 shadow-sm"></div>
                   </>
               ) : (
                   <>
                       <div className="w-2 bg-black shadow-sm"></div>
                       <div className="w-2 bg-slate-500 shadow-sm"></div>
                   </>
               )}
           </div>
           
           <div className="relative border-y-2 border-slate-300 bg-slate-50/90 text-slate-700 w-full flex items-center justify-center z-10 py-1 font-black text-xl shadow-sm backdrop-blur">
             PHASE {label}
           </div>
           
           {/* Left Phase Stub */}
           {/* Extend horizontal tap from the center to the edge */}
           <div className={`absolute left-0 right-1/2 top-1/2 -translate-y-1/2 h-2 ${label === 'L1' ? 'bg-red-500' : label === 'L2' ? 'bg-yellow-400' : label === 'L3' ? 'bg-blue-500' : 'bg-black'} z-0`} />
           
           {/* Right Phase Stub */}
           <div className={`absolute left-1/2 right-0 top-1/2 -translate-y-1/2 h-2 ${label === 'L1' ? 'bg-red-500' : label === 'L2' ? 'bg-yellow-400' : label === 'L3' ? 'bg-blue-500' : 'bg-black'} z-0`} />
       </div>
   );
};

export default function LoadSchedule({ panel, setPanel, circuits, setCircuits, isSubPanel = false, onRemoveSubPanel, availableSubPanels, readOnly = false }: LoadScheduleProps) {
  const [tableFontSize, setTableFontSize] = useState<number>(11);
  const [showPresetsModal, setShowPresetsModal] = useState<boolean>(false);
  const [showDemandMath, setShowDemandMath] = useState<boolean>(true);

  // Conductor cross-sectional area (including THHN/THWN insulation overlay) for PEC Chapter 9 conduit fill sizing
  const THHN_WIRE_AREAS: Record<number, number> = {
    2.0: 8.5,
    3.5: 11.5,
    5.5: 17.5,
    8.0: 28.3,
    14: 50.3,
    22: 85.0,
    30: 115.0,
    38: 140.0,
    50: 180.0,
    60: 220.0,
    80: 290.0,
    100: 350.0,
    125: 450.0,
    150: 530.0,
    175: 620.0,
    200: 710.0,
    250: 880.0,
    325: 1150.0,
    400: 1380.0,
    500: 1700.0,
  };

  const CONDUIT_FILL_TABLE = [
    { size: '15mm', limit: 78 },
    { size: '20mm', limit: 137 },
    { size: '25mm', limit: 220 },
    { size: '32mm', limit: 380 },
    { size: '40mm', limit: 518 },
    { size: '50mm', limit: 855 },
    { size: '65mm', limit: 1220 },
    { size: '80mm', limit: 1880 },
    { size: '90mm', limit: 2500 },
    { size: '100mm', limit: 3240 }
  ];

  const formatWireSize = (size: number): string => size <= 8 ? size.toFixed(1) : size.toString();

  // Enforce PEC Small Conductor Rule and standard matching (including support for parallel conductor runs)
  const getWireForBreaker = (cbRating: number, designAmpacity: number) => {
    const requiredAmpacity = Math.max(designAmpacity, cbRating);
    
    // For small branch circuits (<= 30A), enforce PEC Section 2.40.4(D) small conductor limit strictly
    if (cbRating <= 30) {
      let minSize = 2.0;
      if (cbRating > 15 && cbRating <= 20) minSize = 3.5;
      else if (cbRating > 20 && cbRating <= 30) minSize = 5.5;
      
      const wire = WIRE_AMPACITY_TABLE.find(w => w.ampacity >= requiredAmpacity && w.size >= minSize) || WIRE_AMPACITY_TABLE[0];
      return { size: wire.size, ampacity: wire.ampacity, runs: 1 };
    }

    // For larger feeders, support parallel runs per PEC Article 3.10.1.10 (sizes 50mm² and larger)
    // We choose to parallel for ratings above 250A to match practical building designs
    if (cbRating > 250) {
      let runs = 2;
      if (cbRating > 500) runs = 3;
      if (cbRating > 800) runs = 4;
      
      const targetAmpacityPerRun = requiredAmpacity / runs;
      const wire = WIRE_AMPACITY_TABLE.find(w => w.size >= 50 && w.ampacity >= targetAmpacityPerRun) 
                   || WIRE_AMPACITY_TABLE[WIRE_AMPACITY_TABLE.length - 1];
      
      return { size: wire.size, ampacity: wire.ampacity * runs, runs };
    }

    // Standard single run
    const wire = WIRE_AMPACITY_TABLE.find(w => w.ampacity >= requiredAmpacity) || WIRE_AMPACITY_TABLE[WIRE_AMPACITY_TABLE.length - 1];
    return { size: wire.size, ampacity: wire.ampacity, runs: 1 };
  };

  const getGroundWireForWireSize = (wireSize: number, cbRating: number): string => {
    // PEC Table 2.50.6.13 Equipment Grounding Conductor (EGC) size is determined by the breaker rating (AT)
    let egcSize = 2.0;
    if (cbRating <= 15) egcSize = 2.0;
    else if (cbRating <= 20) egcSize = 3.5;
    else if (cbRating <= 30) egcSize = 5.5;
    else if (cbRating <= 60) egcSize = 8.0;
    else if (cbRating <= 100) egcSize = 14;
    else if (cbRating <= 200) egcSize = 22;
    else if (cbRating <= 300) egcSize = 30;
    else if (cbRating <= 400) egcSize = 38;
    else if (cbRating <= 600) egcSize = 50;
    else if (cbRating <= 800) egcSize = 60;
    else if (cbRating <= 1000) egcSize = 80;
    else if (cbRating <= 1200) egcSize = 100;
    else egcSize = 125;

    // EGC is never required to be larger than the phase conductors
    const actualSize = Math.min(egcSize, wireSize);
    return formatWireSize(actualSize);
  };

  const getConduitSizeForWires = (wireSize: number, groundSizeString: string, poles: number, systemName: string): string => {
    // poles is 1, 2, or 3
    let activePhaseCount = poles === 1 ? 2 : poles; // 1P branch has Phase + Neutral (2 wires)
    if (poles === 3 && systemName.includes('4W')) {
      activePhaseCount = 4; // 3 phases + 1 neutral (4 wires)
    }
    
    const phaseArea = THHN_WIRE_AREAS[wireSize] || (wireSize * 2.5);
    const groundSize = parseFloat(groundSizeString) || 2.0;
    const groundArea = THHN_WIRE_AREAS[groundSize] || (groundSize * 2.5);
    
    const totalArea = (phaseArea * activePhaseCount) + groundArea;
    const conduit = CONDUIT_FILL_TABLE.find(c => c.limit >= totalArea) || CONDUIT_FILL_TABLE[CONDUIT_FILL_TABLE.length - 1];
    return conduit.size;
  };

  useEffect(() => {
    if (readOnly) return;
    setCircuits(prevCircuits => {
      let changed = false;
      let newCircuits = [...prevCircuits];

      if (availableSubPanels) {
        for (let i = 0; i < newCircuits.length; i++) {
          const c = newCircuits[i];
          if (c.loadType === LoadType.SUB_PANEL && c.linkedSubPanelId) {
            const sp = availableSubPanels.find(s => s.id === c.linkedSubPanelId);
            if (sp) {
               const subTotalVA = sp.circuits.reduce((sum, cc) => sum + (cc.loadType === LoadType.SPACE || cc.loadType === LoadType.SPARE ? 0 : cc.loadVA), 0);
               const subTotalWattage = sp.circuits.reduce((sum, cc) => sum + (cc.loadType === LoadType.SPACE || cc.loadType === LoadType.SPARE ? 0 : cc.wattage * cc.quantity), 0);
               
               const subPoles = sp.panel.system.includes('3PH') ? 3 : (sp.panel.connectionType === 'Line-to-Neutral' ? 1 : 2);
               const subVoltage = sp.panel.system.includes('3PH') ? (sp.panel.system.includes('400V') ? 400 : 230) : 230;
               const subCB = sp.panel.mainBreakerAT || 30;

               if (
                 c.loadVA !== subTotalVA || 
                 c.wattage !== subTotalWattage || 
                 c.description !== sp.panel.designation ||
                 c.mcbP !== subPoles ||
                 c.voltage !== subVoltage ||
                 c.mcbAT !== subCB
               ) {
                  newCircuits[i] = { 
                    ...c, 
                    quantity: 1,
                    wattage: subTotalWattage, 
                    loadVA: subTotalVA, 
                    description: sp.panel.designation || 'Sub-Panel',
                    mcbP: subPoles,
                    voltage: subVoltage,
                    mcbAT: subCB
                  };
                  newCircuits[i] = { ...newCircuits[i], ...calculateCircuit(newCircuits[i]) } as Circuit;
                  changed = true;
               }
            }
          }
        }
      }

      const recalculated = newCircuits.map(c => {
         const rec = { ...c, ...calculateCircuit(c) } as Circuit;
         if (JSON.stringify(rec) !== JSON.stringify(c)) changed = true;
         return rec;
      });

      if (changed) {
         return recalculated;
      }
      return prevCircuits;
    });
  }, [panel.system, panel.connectionType, panel.voltage, availableSubPanels, setCircuits]);

  const calculateCircuit = (c: Partial<Circuit>): Partial<Circuit> => {
    // If it's a subpanel load, override fields with values dynamically computed from the subpanel!
    if (c.loadType === LoadType.SUB_PANEL && c.linkedSubPanelId && availableSubPanels) {
      const sp = availableSubPanels.find(s => s.id === c.linkedSubPanelId);
      if (sp) {
         const subTotalVA = sp.circuits.reduce((sum, cc) => sum + (cc.loadType === LoadType.SPACE || cc.loadType === LoadType.SPARE ? 0 : cc.loadVA), 0);
         const subTotalWattage = sp.circuits.reduce((sum, cc) => sum + (cc.loadType === LoadType.SPACE || cc.loadType === LoadType.SPARE ? 0 : cc.wattage * cc.quantity), 0);
         
         const subPoles = sp.panel.system.includes('3PH') ? 3 : (sp.panel.connectionType === 'Line-to-Neutral' ? 1 : 2);
         const subVoltage = sp.panel.system.includes('3PH') ? (sp.panel.system.includes('400V') ? 400 : 230) : 230;
         const subCB = sp.panel.mainBreakerAT || 30;

         c.wattage = subTotalWattage;
         c.loadVA = subTotalVA;
         c.quantity = 1;
         c.mcbP = subPoles;
         c.voltage = subVoltage;
         c.mcbAT = subCB;
         c.description = sp.panel.designation || 'Sub-Panel';
      }
    }

    let mcbP = c.mcbP;
    
    // Auto-update poles based on global connection type for 1-phase systems
    if (c.loadType !== LoadType.SUB_PANEL && !panel.system.includes('3PH')) {
      if (panel.connectionType === 'Line-to-Line') {
        mcbP = 2;
      } else if (panel.connectionType === 'Line-to-Neutral') {
        mcbP = 1;
      }
    }

    if (!mcbP) {
      mcbP = 1;
      if (c.loadType === LoadType.AIR_CON || c.loadType === LoadType.MOTOR) {
        mcbP = 2; // Default to 2-Pole for motors/AC regardless of panel type, user can override to 3
      }
    }

    const isSpace = (c.description && c.description.toUpperCase() === 'SPACE') || c.loadType === LoadType.SPACE;
    
    const qty = c.quantity || 1;
    const w = isSpace ? 0 : (c.wattage || 0);
    const pf = c.pf !== undefined ? c.pf : (c.loadType === LoadType.MOTOR || c.loadType === LoadType.AIR_CON ? 0.85 : 1.0);
    const va = c.loadType === LoadType.SUB_PANEL ? (c.loadVA ?? (qty * w)) : Math.round((qty * w) / (pf || 1));
    
    let defaultV = 230;
    const is3PhaseLoad = c.phases && c.phases.length === 3;

    if (panel.system === '230V, 1PH, 2W') {
      defaultV = 230;
    } else if (panel.system === '230V, 3PH, 3W') {
      defaultV = 230;
    } else if (panel.system === '400V/230V, 3PH, 4W') {
      if (is3PhaseLoad) {
        defaultV = 400;
      } else {
        defaultV = panel.connectionType === 'Line-to-Line' ? 400 : 230;
      }
    }
    const v = defaultV;
    c.voltage = v;
    
    let loadA = 0;
    if ((panel.system === '230V, 3PH, 3W' || panel.system === '400V/230V, 3PH, 4W') && is3PhaseLoad) {
      loadA = va / (v * 1.732);
    } else {
      loadA = va / v;
    }
    
    // PDF Rule: Apply 125% for continuous loads (Lighting, AC, Motors for wire ampacity)
    const isContinuous = c.loadType === LoadType.LIGHTING || c.loadType === LoadType.AIR_CON || c.loadType === LoadType.MOTOR;
    const designLoadA = isContinuous ? loadA * 1.25 : loadA;
    
    // Calculate the minimum required CB rating based on the load
    let requiredMcbAT = 15;
    if (c.loadType === LoadType.CONVENIENCE_OUTLET) {
       requiredMcbAT = Math.max(20, STANDARD_CB_RATINGS.find(r => r >= designLoadA) || 20);
    } else if (c.loadType === LoadType.MOTOR) {
       // PDF Rule: 250% of FLC for AC polyphase motors (Branch Circuit Protection)
       const motorBranchProtection = loadA * 2.50;
       requiredMcbAT = STANDARD_CB_RATINGS.find(r => r >= motorBranchProtection) || 15;
    } else if (c.loadType === LoadType.AIR_CON) {
       const flc = loadA;
       const limit175 = flc * 1.75;
       const limit225 = flc * 2.25;
       
       // Sizing for ACU specifically (omitting 25A according to modern PEC application)
       const ACU_STANDARD_RATINGS = [15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250, 300, 400];
       const under175 = ACU_STANDARD_RATINGS.filter(r => r <= limit175);
       const baseRating = under175.length > 0 ? under175[under175.length - 1] : 0;
       const nextHigherIndex = ACU_STANDARD_RATINGS.findIndex(r => r > baseRating);
       const nextHigherRating = nextHigherIndex !== -1 ? ACU_STANDARD_RATINGS[nextHigherIndex] : 15;
       
       if (nextHigherRating <= limit225) {
          requiredMcbAT = Math.max(15, nextHigherRating);
       } else {
          const under225 = ACU_STANDARD_RATINGS.filter(r => r <= limit225);
          requiredMcbAT = under225.length > 0 ? Math.max(15, under225[under225.length - 1]) : 15;
       }
    } else {
       requiredMcbAT = STANDARD_CB_RATINGS.find(r => r >= designLoadA) || 15;
    }
    
    // Use the higher of either the calculated minimum or the manually selected CB rating
    const mcbAT = Math.max(requiredMcbAT, c.mcbAT || 0);

    // Automatic selection logic
    const mcbAF = mcbAT <= 50 ? 50 : mcbAT <= 100 ? 100 : mcbAT <= 225 ? 225 : 400;
    const mcbKAIC = mcbAT <= 50 ? 10 : mcbAT <= 100 ? 18 : 25;
    
    // PEC requirement: Wire ampacity must be >= breaker rating and >= 125% of load
    const wire = getWireForBreaker(mcbAT, designLoadA);
    
    return {
      ...c,
      pf: pf,
      loadVA: va,
      loadA: Number(loadA.toFixed(2)),
      mcbAT: mcbAT,
      mcbAF: mcbAF,
      mcbP: mcbP,
      mcbKAIC: mcbKAIC,
      mcbType: c.mcbType || MCBType.BOLT_ON,
      wireSize: formatWireSize(wire.size),
      groundSize: getGroundWireForWireSize(wire.size, mcbAT),
      conduitSize: getConduitSizeForWires(wire.size, getGroundWireForWireSize(wire.size, mcbAT), mcbP, panel.system)
    };
  };

  const addCircuit = () => {
    const newNo = circuits.length > 0 ? Math.max(...circuits.map(c => c.circuitNo)) + 1 : 1;
    const base: Partial<Circuit> = {
      id: crypto.randomUUID(),
      circuitNo: newNo,
      description: 'NEW CIRCUIT',
      wattage: 180,
      quantity: 1,
      voltage: panel.voltage,
      phases: ['R'],
      loadType: LoadType.POWER,
      mcbType: MCBType.BOLT_ON,
      wireType: 'THHN',
      conduitType: 'PVC'
    };
    const newCircuit = { ...base, ...calculateCircuit(base) } as Circuit;
    setCircuits([...circuits, newCircuit]);
  };

  const addCircuitFromPreset = (item: {description: string, wattage: number, loadType: string}) => {
    const newNo = circuits.length > 0 ? Math.max(...circuits.map(c => c.circuitNo)) + 1 : 1;
    const base: Partial<Circuit> = {
      id: crypto.randomUUID(),
      circuitNo: newNo,
      description: item.description,
      wattage: item.wattage,
      quantity: 1,
      voltage: panel.voltage,
      phases: ['R'],
      loadType: item.loadType as LoadType,
      mcbType: MCBType.BOLT_ON,
      wireType: 'THHN',
      conduitType: 'PVC'
    };
    const newCircuit = { ...base, ...calculateCircuit(base) } as Circuit;
    setCircuits([...circuits, newCircuit]);
    setShowPresetsModal(false);
  };

  const updateCircuit = (id: string, updates: Partial<Circuit>) => {
    setCircuits(prev => prev.map(c => {
      if (c.id === id) {
        const merged = { ...c, ...updates };
        // Trigger recalculation if load parameters OR the circuit breaker itself changes
        if ('phases' in updates || 'wattage' in updates || 'quantity' in updates || 'voltage' in updates || 'mcbAT' in updates || 'loadType' in updates || 'pf' in updates) {
          return { ...merged, ...calculateCircuit(merged) } as Circuit;
        }
        return merged;
      }
      return c;
    }));
  };

  const removeCircuit = (id: string) => {
    setCircuits(prev => {
      const filtered = prev.filter(c => c.id !== id);
      return filtered.map((c, index) => ({ ...c, circuitNo: index + 1 }));
    });
  };
  const duplicateCircuit = (circuit: Circuit) => {
    const newNo = Math.max(...circuits.map(c => c.circuitNo)) + 1;
    setCircuits([...circuits, { ...circuit, id: crypto.randomUUID(), circuitNo: newNo }]);
  };

  const totalVA = useMemo(() => circuits.reduce((sum, c) => sum + c.loadVA, 0), [circuits]);

  const phaseLoads = useMemo(() => {
    const loads = { R: 0, Y: 0, B: 0 };
    circuits.forEach(c => {
      c.phases.forEach(p => {
        loads[p as keyof typeof loads] += c.loadVA / c.phases.length;
      });
    });
    return loads;
  }, [circuits]);

  const maxPhaseLoad = Math.max(phaseLoads.R, phaseLoads.Y, phaseLoads.B);
  const phaseImbalance = maxPhaseLoad > 0 ? (1 - (Math.min(phaseLoads.R, phaseLoads.Y, phaseLoads.B) / maxPhaseLoad)) * 100 : 0;

  const phaseAmps = useMemo(() => {
    const amps = { R: 0, Y: 0, B: 0, threePhase: 0 };
    circuits.forEach(c => {
      if (c.phases.length === 3) {
        amps.threePhase += c.loadA;
      } else {
        if (c.phases.includes('R')) amps.R += c.loadA;
        if (c.phases.includes('Y')) amps.Y += c.loadA;
        if (c.phases.includes('B')) amps.B += c.loadA;
      }
    });
    return amps;
  }, [circuits]);
  
  const maxDemandDetails = useMemo(() => {
    const is3PH = panel.system.includes("3PH");
    const systemVoltage = panel.voltage || 230;
    
    if (is3PH) {
      const localPhaseAmps = { R: 0, Y: 0, B: 0, threePhase: 0 };
      circuits.forEach((cir) => {
        if (cir.loadType === LoadType.SPACE || cir.loadType === LoadType.SPARE) return;
        
        const is3Phase = cir.phases && cir.phases.length === 3;
        let cirV = cir.voltage || (panel.system === '400V/230V, 3PH, 4W' ? (is3Phase ? 400 : (panel.connectionType === 'Line-to-Line' ? 400 : 230)) : 230);
        if (cir.loadType === LoadType.SUB_PANEL) {
          cirV = cir.voltage || cirV;
        }
        const loadI = is3Phase ? cir.loadVA / (cirV * 1.732) : cir.loadVA / cirV;

        if (is3Phase) {
          localPhaseAmps.threePhase += loadI;
        } else {
          if (cir.phases.includes("R")) localPhaseAmps.R += loadI;
          if (cir.phases.includes("Y")) localPhaseAmps.Y += loadI;
          if (cir.phases.includes("B")) localPhaseAmps.B += loadI;
        }
      });

      const motorCircuits = circuits.filter(cir => cir.loadType === LoadType.MOTOR || cir.loadType === LoadType.AIR_CON);
      let HML = 0;
      motorCircuits.forEach((cir) => {
        const is3Phase = cir.phases && cir.phases.length === 3;
        let cirV = cir.voltage || (panel.system === '400V/230V, 3PH, 4W' ? (is3Phase ? 400 : (panel.connectionType === 'Line-to-Line' ? 400 : 230)) : 230);
        const loadI = is3Phase ? cir.loadVA / (cirV * 1.732) : cir.loadVA / cirV;
        if (loadI > HML) {
          HML = loadI;
        }
      });

      const totalAmpere = Math.max(localPhaseAmps.R, localPhaseAmps.Y, localPhaseAmps.B);
      const baseAmp = (totalAmpere * 1.732) * 0.80 + localPhaseAmps.threePhase + (0.25 * HML);

      return {
        is3PH,
        systemVoltage,
        phaseR: localPhaseAmps.R,
        phaseY: localPhaseAmps.Y,
        phaseB: localPhaseAmps.B,
        total3Phase: localPhaseAmps.threePhase,
        totalAmpere,
        HML,
        baseAmp,
        connectionType: panel.connectionType || 'Line-to-Line'
      };
    } else {
      const totalConnectedVA = circuits.reduce((sum, curr) => curr.loadType === LoadType.SPACE || curr.loadType === LoadType.SPARE ? sum : sum + curr.loadVA, 0);
      const highestAmps = circuits.length > 0 ? Math.max(...circuits.map(cir => cir.loadType === LoadType.SPACE || cir.loadType === LoadType.SPARE ? 0 : (cir.loadA || (cir.loadVA / (cir.voltage || 230))))) : 0;
      const baseAmp = (totalConnectedVA / 230) * 0.80 + (0.25 * highestAmps);

      return {
        is3PH,
        systemVoltage,
        totalConnectedVA,
        highestAmps,
        baseAmp
      };
    }
  }, [circuits, panel]);

  const mainCurrent = useMemo(() => {
    let maxBaseAmp = 0;
    let maxDesignAmp = 0;

    if (panel.system.includes("3PH")) {
      const localPhaseAmps = { R: 0, Y: 0, B: 0, threePhase: 0 };
      circuits.forEach((cir) => {
        if (cir.loadType === LoadType.SPACE || cir.loadType === LoadType.SPARE) return;
        
        const is3Phase = cir.phases && cir.phases.length === 3;
        let cirV = cir.voltage || (panel.system === '400V/230V, 3PH, 4W' ? (is3Phase ? 400 : (panel.connectionType === 'Line-to-Line' ? 400 : 230)) : 230);
        if (cir.loadType === LoadType.SUB_PANEL) {
          cirV = cir.voltage || cirV;
        }
        const loadI = is3Phase ? cir.loadVA / (cirV * 1.732) : cir.loadVA / cirV;

        if (is3Phase) {
          localPhaseAmps.threePhase += loadI;
        } else {
          if (cir.phases.includes("R")) localPhaseAmps.R += loadI;
          if (cir.phases.includes("Y")) localPhaseAmps.Y += loadI;
          if (cir.phases.includes("B")) localPhaseAmps.B += loadI;
        }
      });

      const motorCircuits = circuits.filter(cir => cir.loadType === LoadType.MOTOR || cir.loadType === LoadType.AIR_CON);
      let HML = 0;
      motorCircuits.forEach((cir) => {
        const is3Phase = cir.phases && cir.phases.length === 3;
        let cirV = cir.voltage || (panel.system === '400V/230V, 3PH, 4W' ? (is3Phase ? 400 : (panel.connectionType === 'Line-to-Line' ? 400 : 230)) : 230);
        const loadI = is3Phase ? cir.loadVA / (cirV * 1.732) : cir.loadVA / cirV;
        if (loadI > HML) {
          HML = loadI;
        }
      });

      const totalAmpere = Math.max(localPhaseAmps.R, localPhaseAmps.Y, localPhaseAmps.B);
      const maxDemandCurrent = (totalAmpere * 1.732) * 0.80 + localPhaseAmps.threePhase + (0.25 * HML);
      
      maxBaseAmp = maxDemandCurrent;
      maxDesignAmp = maxDemandCurrent;
    } else {
      const totalConnectedVA = circuits.reduce((sum, curr) => curr.loadType === LoadType.SPACE || curr.loadType === LoadType.SPARE ? sum : sum + curr.loadVA, 0);
      const highestAmps = circuits.length > 0 ? Math.max(...circuits.map(cir => cir.loadType === LoadType.SPACE || cir.loadType === LoadType.SPARE ? 0 : (cir.loadA || (cir.loadVA / (cir.voltage || 230))))) : 0;
      const maxDemandCurrent = (totalConnectedVA / 230) * 0.80 + (0.25 * highestAmps);
      
      maxBaseAmp = maxDemandCurrent;
      maxDesignAmp = maxDemandCurrent;
    }

    return { designAmp: maxDesignAmp, baseAmp: maxBaseAmp };
  }, [circuits, panel]);

  const mainFeeder = useMemo(() => {
    // The design ampacity correctly incorporates Continuous (125%) + Non-Continuous (100%) + Largest Motor (25%)
    const designAmp = mainCurrent.designAmp; 
    
    // Minimum main breaker sizes are standard, and it must not be less than the maximum branch breaker
    const maxBranchAT = Math.max(0, ...circuits.map(c => c.mcbAT));
    const calculatedCb = STANDARD_CB_RATINGS.find(r => r >= Math.max(designAmp, mainCurrent.baseAmp)) || 100;
    const cb = Math.max(calculatedCb, STANDARD_CB_RATINGS.find(r => r >= maxBranchAT) || calculatedCb, 30);
    
    const poles = panel.system.includes('3PH') ? 3 : 2;
    // Main feeder wire must be rated for the breaker or the load, whichever is higher
    const wire = getWireForBreaker(cb, designAmp);
    const groundSize = getGroundWireForWireSize(wire.size, cb);
    const conduitSize = getConduitSizeForWires(wire.size, groundSize, poles, panel.system);
    
    const branchTypeCounts = circuits.reduce((acc, c) => {
      acc[c.mcbType] = (acc[c.mcbType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const sortedBranchTypes = Object.entries(branchTypeCounts).sort((a, b) => Number(b[1]) - Number(a[1]));
    const predominantBranchType = (sortedBranchTypes[0]?.[0] || MCBType.MCB) as MCBType;
    let type = predominantBranchType;
    if (cb > 100 && (type === MCBType.PLUG_IN || type === MCBType.BOLT_ON || type === MCBType.MCB)) {
      type = MCBType.MCCB;
    }
    const kaic = cb > 100 ? 18 : 10;
    const af = cb <= 50 ? 50 : cb <= 100 ? 100 : cb <= 225 ? 225 : cb <= 400 ? 400 : 600;

    return { wire, groundSize, cb, conduitSize, poles, type, kaic, af };
  }, [mainCurrent, panel.system, circuits]);

  const panelRows = useMemo(() => {
    const maxCircuitNo = Math.max(...circuits.map(c => c.circuitNo), 0);
    const rows = [];
    const pLabels = panel.system.includes('3PH') ? ['L1', 'L2', 'L3'] : ['L1', 'L2'];

    for (let i = 1; i <= Math.max(maxCircuitNo, 2); i += 2) {
      rows.push({
        index: i,
        label: pLabels[((i - 1) / 2) % pLabels.length],
        left: circuits.find(c => c.circuitNo === i),
        right: circuits.find(c => c.circuitNo === i + 1)
      });
    }
    return rows;
  }, [circuits, panel.system]);

  React.useEffect(() => {
    if (readOnly) return;
    if (
      panel.mainBreakerAT !== mainFeeder.cb || 
      panel.mainBreakerAF !== mainFeeder.af || 
      panel.icRating !== `${mainFeeder.kaic}kAIC`
    ) {
      setPanel(prev => ({
        ...prev,
        mainBreakerAT: mainFeeder.cb,
        mainBreakerAF: mainFeeder.af,
        icRating: `${mainFeeder.kaic}kAIC`
      }));
    }
  }, [mainFeeder.cb, mainFeeder.af, mainFeeder.kaic, panel.mainBreakerAT, panel.mainBreakerAF, panel.icRating, setPanel]);

  return (
    <div className="w-full max-w-full space-y-6">
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 overflow-hidden no-print">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{isSubPanel ? 'Sub-Panel Configuration' : 'Panel Board Configuration'}</h2>
          </div>
          {isSubPanel && onRemoveSubPanel && (
            <button 
              onClick={onRemoveSubPanel}
              className="px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Remove Sub-Panel
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Project Name</label>
            <input value={panel.project} onChange={e => setPanel({...panel, project: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Location</label>
            <input value={panel.location || ''} onChange={e => setPanel({...panel, location: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" placeholder="e.g. Electrical Room" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Designation</label>
            <input value={panel.designation || ''} onChange={e => setPanel({...panel, designation: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" placeholder="e.g. MDP" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Panel Type</label>
            <input value={panel.type || ''} onChange={e => setPanel({...panel, type: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" placeholder="e.g. Main Distribution Panel" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Mounting</label>
            <input value={panel.mounting || ''} onChange={e => setPanel({...panel, mounting: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" placeholder="e.g. Flush Mounted" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Enclosure</label>
            <input value={panel.enclosure || ''} onChange={e => setPanel({...panel, enclosure: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" placeholder="e.g. NEMA 1" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">System Voltage</label>
            <select 
              value={panel.system} 
              onChange={e => {
                const newSystem = e.target.value as any;
                setPanel({...panel, system: newSystem, voltage: SYSTEM_VOLTAGES[newSystem as keyof typeof SYSTEM_VOLTAGES]});
              }} 
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
            >
              {Object.keys(SYSTEM_VOLTAGES).map(s => <option key={s} value={s} className="dark:bg-slate-900 dark:text-slate-100">{s}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Connection</label>
            <select value={panel.connectionType || 'Line-to-Line'} onChange={e => setPanel({...panel, connectionType: e.target.value as any})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none">
              <option value="Line-to-Line" className="dark:bg-slate-900 dark:text-slate-100">Line-to-Line</option>
              <option value="Line-to-Neutral" className="dark:bg-slate-900 dark:text-slate-100">Line-to-Neutral</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Table Font Size ({tableFontSize}px)</label>
            <div className="flex items-center h-10 px-2 mt-1">
              <input 
                type="range" 
                min="8" 
                max="16" 
                step="0.5"
                value={tableFontSize} 
                onChange={(e) => setTableFontSize(parseFloat(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden panel-container print:rounded-none">
        <div className="p-8 border-b-2 border-slate-100 dark:border-slate-800 flex flex-col md:flex-row justify-between gap-8 bg-slate-50/50 dark:bg-slate-900/50 print:bg-white print:py-4">
          <div className="flex items-start gap-4">
            <div className="no-print p-3 bg-indigo-600 rounded-lg"><FileText className="w-6 h-6 text-white" /></div>
            <div className="space-y-1">
              <h3 className="text-3xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter print:text-xl">Panel Board Schedule</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-2 text-sm font-medium mt-3">
                <div className="flex flex-col"><span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-wider">PROJECT</span><span className="text-slate-900 dark:text-slate-200 uppercase font-bold">{panel.project}</span></div>
                <div className="flex flex-col"><span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-wider">LOCATION</span><span className="text-slate-900 dark:text-slate-200 uppercase font-bold">{panel.location}</span></div>
                <div className="flex flex-col"><span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-wider">DESIGNATION</span><span className="text-slate-900 dark:text-slate-200 uppercase font-bold">{panel.designation}</span></div>
                <div className="flex flex-col"><span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-wider">SYSTEM VOLTAGE</span><span className="text-slate-900 dark:text-slate-200 uppercase font-bold">{panel.system}</span></div>
                <div className="flex flex-col"><span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-wider">PANEL TYPE</span><span className="text-slate-900 dark:text-slate-200 uppercase font-bold">{panel.type}</span></div>
                <div className="flex flex-col"><span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-wider">MOUNTING</span><span className="text-slate-900 dark:text-slate-200 uppercase font-bold">{panel.mounting}</span></div>
                <div className="flex flex-col"><span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-wider">ENCLOSURE</span><span className="text-slate-900 dark:text-slate-200 uppercase font-bold">{panel.enclosure}</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto print:overflow-visible bg-slate-50/30 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
          <table 
            className="w-full border-collapse text-sm table-auto print:!w-full whitespace-nowrap" 
          >
            <thead className="bg-slate-900 text-white print:bg-slate-200 print:text-slate-900">
              <tr>
                {[
                  'NO.', 'DESCRIPTION', 'W', 'QTY', 'PF', 'VA', 'PHASE'
                ].map((header) => (
                  <th 
                    key={header} 
                    rowSpan={panel.system.includes('3PH') ? 2 : 1}
                    style={{ fontSize: tableFontSize - 1 }}
                    className={`px-2 py-3 border border-slate-700 transition-colors ${header === 'DESCRIPTION' ? 'text-left w-full max-w-[300px]' : 'text-center'}`}
                  >
                    {header}
                  </th>
                ))}
                
                {panel.system.includes('3PH') ? (
                  <th colSpan={4} className="px-2 border border-slate-700 text-center transition-colors" style={{ fontSize: tableFontSize - 1 }}>AMPS</th>
                ) : (
                  <th className="px-2 py-3 border border-slate-700 text-center transition-colors" style={{ fontSize: tableFontSize - 1 }}>AMPS</th>
                )}

                {[
                  'AT', 'AF', 'P', 'KAIC', 'TYPE', 'WIRE / GND / CONDUIT', 'ACTIONS'
                ].map((header) => (
                  <th 
                    key={header} 
                    rowSpan={panel.system.includes('3PH') ? 2 : 1}
                    style={{ fontSize: tableFontSize - 1 }}
                    className={`px-2 py-3 border border-slate-700 transition-colors text-center ${header === 'ACTIONS' ? 'no-print border-slate-400' : ''}`}
                  >
                    {header}
                  </th>
                ))}
              </tr>
              {panel.system.includes('3PH') && (
                <tr>
                  {panel.connectionType === 'Line-to-Neutral' ? (
                    <>
                      <th className="px-1 py-1 border border-slate-700 text-center text-red-500 print:text-slate-900" style={{ fontSize: tableFontSize - 2 }}>AN</th>
                      <th className="px-1 py-1 border border-slate-700 text-center text-yellow-500 print:text-slate-900" style={{ fontSize: tableFontSize - 2 }}>BN</th>
                      <th className="px-1 py-1 border border-slate-700 text-center text-blue-500 print:text-slate-900" style={{ fontSize: tableFontSize - 2 }}>CN</th>
                    </>
                  ) : (
                    <>
                      <th className="px-1 py-1 border border-slate-700 text-center text-red-500 print:text-slate-900" style={{ fontSize: tableFontSize - 2 }}>AB</th>
                      <th className="px-1 py-1 border border-slate-700 text-center text-yellow-500 print:text-slate-900" style={{ fontSize: tableFontSize - 2 }}>BC</th>
                      <th className="px-1 py-1 border border-slate-700 text-center text-blue-500 print:text-slate-900" style={{ fontSize: tableFontSize - 2 }}>CA</th>
                    </>
                  )}
                  <th className="px-1 py-1 border border-slate-700 text-center text-indigo-500 print:text-slate-900" style={{ fontSize: tableFontSize - 2 }}>3Ø</th>
                </tr>
              )}
            </thead>
            <tbody>
              {circuits.map((c, idx) => {
                const isSpace = (c.description?.toUpperCase() === 'SPACE') || c.loadType === LoadType.SPACE;
                
                return (
                <tr key={c.id} style={{ fontSize: tableFontSize }} className={`${idx % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/50' : 'bg-white dark:bg-slate-900'} hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 group print:bg-white border-b border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-100`}>
                  <td className="px-1 py-3 text-center font-bold text-indigo-600 truncate">{c.circuitNo}</td>
                  <td className="px-2 py-3 overflow-hidden">
                    <div className="flex items-center gap-1 min-w-0">
                      <select value={c.loadType} onChange={e => {
                        const nextType = e.target.value as LoadType;
                        let fallbackSubId = c.linkedSubPanelId;
                        if (nextType === LoadType.SUB_PANEL && !fallbackSubId && availableSubPanels?.length) {
                          fallbackSubId = availableSubPanels[0].id;
                        }
                        updateCircuit(c.id, { loadType: nextType, linkedSubPanelId: fallbackSubId });
                      }} className="p-0.5 bg-slate-100 dark:bg-slate-800 border-0 rounded uppercase font-black no-print shrink-0 text-slate-800 dark:text-slate-100" style={{ fontSize: tableFontSize - 3 }}>
                        {Object.keys(DESCRIPTION_CODES).map(code => <option key={code} value={code} className="dark:bg-slate-900 dark:text-slate-100">{code}</option>)}
                      </select>
                      {c.loadType === 'SUB' ? (
                        <select 
                          value={c.linkedSubPanelId || ''} 
                          onChange={e => updateCircuit(c.id, { linkedSubPanelId: e.target.value })}
                          className="flex-1 bg-transparent dark:bg-slate-900 font-medium min-w-0 truncate text-slate-800 dark:text-slate-100" 
                        >
                          <option value="" disabled className="dark:bg-slate-900 dark:text-slate-100">Select Sub-Panel</option>
                          {availableSubPanels?.map(sp => (
                            <option key={sp.id} value={sp.id} className="dark:bg-slate-900 dark:text-slate-100">{sp.panel.designation || 'Unnamed Sub-Panel'}</option>
                          ))}
                        </select>
                      ) : (
                        <input className="flex-1 bg-transparent font-medium min-w-0 text-slate-800 dark:text-slate-100 focus:outline-none" value={c.description} onChange={e => updateCircuit(c.id, { description: e.target.value })} />
                      )}
                    </div>
                  </td>
                  <td className="px-1 py-3 text-center">
                    {isSpace ? '-' : <input type="number" readOnly={c.loadType === 'SUB'} className={`w-16 max-w-full mx-auto bg-transparent text-center font-mono text-slate-800 dark:text-slate-100 ${c.loadType === 'SUB' ? 'text-slate-400 dark:text-slate-500 font-bold' : ''}`} value={c.wattage} onChange={e => updateCircuit(c.id, { wattage: parseInt(e.target.value) || 0 })} />}
                  </td>
                  <td className="px-1 py-3 text-center">
                    {isSpace ? '-' : <input type="number" readOnly={c.loadType === 'SUB'} className={`w-12 max-w-full mx-auto bg-transparent text-center font-mono text-slate-800 dark:text-slate-100 ${c.loadType === 'SUB' ? 'text-slate-400 dark:text-slate-500 font-bold' : ''}`} value={c.quantity} onChange={e => updateCircuit(c.id, { quantity: parseInt(e.target.value) || 0 })} />}
                  </td>
                  <td className="px-1 py-3 text-center">
                    {isSpace ? '-' : <input type="number" step="0.01" min="0.1" max="1.0" readOnly={c.loadType === 'SUB'} className={`w-12 max-w-full mx-auto bg-transparent text-center font-mono text-slate-800 dark:text-slate-100 ${c.loadType === 'SUB' ? 'text-slate-400 dark:text-slate-500 font-bold' : ''}`} value={c.pf !== undefined ? c.pf : (c.loadType === LoadType.MOTOR || c.loadType === LoadType.AIR_CON ? 0.85 : 1.0)} onChange={e => {
                      const val = parseFloat(e.target.value);
                      updateCircuit(c.id, { pf: isNaN(val) ? undefined : val });
                    }} />}
                  </td>
                  <td className="px-1 py-3 text-center font-mono font-bold text-slate-400 dark:text-slate-500 truncate">
                    {isSpace ? '-' : c.loadVA}
                  </td>
                  <td className="px-1 py-3 text-center">
                    {isSpace ? '-' : (
                    <div className="flex gap-0.5 justify-center flex-wrap">
                      {['R', 'Y', 'B', '3Ø'].map(p => (
                        <button key={p} onClick={() => {
                          if (p === '3Ø') {
                            updateCircuit(c.id, { phases: ['R', 'Y', 'B'] });
                          } else {
                            // Single phase selection replaces other phases to ensure it's reflected correctly
                            updateCircuit(c.id, { phases: [p as Phase] });
                          }
                        }} className={`px-1 h-5 min-w-[16px] rounded-sm font-bold shrink-0 flex items-center justify-center ${
                          (p === '3Ø' && c.phases.length === 3)
                            ? 'bg-indigo-600 text-white'
                            : (p !== '3Ø' && c.phases.includes(p as Phase) && c.phases.length === 1)
                              ? p === 'R' ? 'bg-red-600 text-white' : p === 'Y' ? 'bg-yellow-400 text-black' : 'bg-blue-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                        } ${!panel.system.includes('3PH') && p !== 'R' ? 'hidden' : ''}`} style={{ fontSize: tableFontSize - 4 }}>{p}</button>
                      ))}
                    </div>
                    )}
                  </td>
                  {panel.system.includes('3PH') ? (
                    <>
                      <td className="px-1 py-3 text-center font-mono font-bold truncate text-red-600 print:text-slate-900">{isSpace ? '-' : (c.phases.includes('R') && c.phases.length < 3 ? c.loadA.toFixed(2) : '-')}</td>
                      <td className="px-1 py-3 text-center font-mono font-bold truncate text-yellow-600 print:text-slate-900">{isSpace ? '-' : (c.phases.includes('Y') && c.phases.length < 3 ? c.loadA.toFixed(2) : '-')}</td>
                      <td className="px-1 py-3 text-center font-mono font-bold truncate text-blue-600 print:text-slate-900">{isSpace ? '-' : (c.phases.includes('B') && c.phases.length < 3 ? c.loadA.toFixed(2) : '-')}</td>
                      <td className="px-1 py-3 text-center font-mono font-bold truncate text-indigo-600 print:text-slate-900">{isSpace ? '-' : (c.phases.length === 3 ? c.loadA.toFixed(2) : '-')}</td>
                    </>
                  ) : (
                    <td className="px-1 py-3 text-center font-mono font-bold truncate">{isSpace ? '-' : c.loadA.toFixed(2)}</td>
                  )}
                  <td className="px-1 py-3 text-center">
                    {isSpace ? '-' : (
                    <select value={c.mcbAT} disabled={c.loadType === 'SUB'} onChange={e => updateCircuit(c.id, { mcbAT: parseInt(e.target.value) })} className={`bg-transparent text-center text-slate-800 dark:text-slate-100 font-bold appearance-none w-14 max-w-full mx-auto dark:bg-slate-900 ${c.loadType === 'SUB' ? 'text-slate-400 dark:text-slate-500' : ''}`}>
                      {STANDARD_CB_RATINGS.map(r => <option key={r} value={r} className="dark:bg-slate-900 dark:text-slate-100">{r}</option>)}
                    </select>
                    )}
                  </td>
                  <td className="px-1 py-3 text-center font-bold text-slate-400 dark:text-slate-500 truncate">{isSpace ? '-' : c.mcbAF}</td>
                  <td className="px-1 py-3 text-center">
                    {isSpace ? '-' : (
                    <select value={c.mcbP} disabled={c.loadType === 'SUB'} onChange={e => updateCircuit(c.id, { mcbP: parseInt(e.target.value) })} className={`bg-transparent text-center text-slate-800 dark:text-slate-100 appearance-none w-12 max-w-full mx-auto dark:bg-slate-900 ${c.loadType === 'SUB' ? 'text-slate-400 dark:text-slate-500' : ''}`}>
                      {[1, 2, 3].map(p => <option key={p} value={p} className="dark:bg-slate-900 dark:text-slate-100">{p}P</option>)}
                    </select>
                    )}
                  </td>
                  <td className="px-1 py-3 text-center text-slate-400 dark:text-slate-500 font-bold truncate">{isSpace ? '-' : c.mcbKAIC}</td>
                  <td className="px-1 py-3 text-center">
                    {isSpace ? '-' : (
                    <select value={c.mcbType} onChange={e => updateCircuit(c.id, { mcbType: e.target.value as MCBType })} className="bg-transparent text-center text-slate-800 dark:text-slate-100 appearance-none cursor-pointer w-24 max-w-full mx-auto truncate dark:bg-slate-900" style={{ fontSize: tableFontSize - 2 }}>
                      {Object.values(MCBType).map(t => <option key={t} value={t} className="dark:bg-slate-900 dark:text-slate-100">{t}</option>)}
                    </select>
                    )}
                  </td>
                  <td className="px-1 py-3 text-center font-medium leading-tight truncate">
                    {isSpace ? '-' : (
                      <>
                        {c.wireSize}mm² {c.wireType} <br className="hidden print:block" /> {c.groundSize}mm² GND in {c.conduitSize} {c.conduitType}
                      </>
                    )}
                  </td>
                  <td className="px-1 py-3 text-center no-print overflow-hidden">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 justify-center">
                      <button onClick={() => duplicateCircuit(c)} className="p-1 hover:text-indigo-600 shrink-0"><Copy className="w-3 h-3" /></button>
                      <button onClick={() => removeCircuit(c.id)} className="p-1 hover:text-red-600 shrink-0"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </td>
                </tr>
              )})}
              <tr style={{ fontSize: tableFontSize }} className="bg-slate-900 text-white font-bold border-t-2 border-slate-900 print:text-slate-900 print:bg-white transition-all">
                <td colSpan={5} className="px-4 py-6 text-right uppercase opacity-70">Total Connected Load</td>
                <td className="px-1 py-6 text-center truncate">{totalVA.toFixed(0)} VA</td>
                <td className="px-1 py-6 text-center opacity-70 truncate">({(totalVA/1000).toFixed(2)} kVA)</td>
                {panel.system.includes('3PH') ? (
                  <>
                    <td className="px-1 py-6 text-center text-red-500 print:text-slate-900 truncate">{phaseAmps.R.toFixed(2)} A</td>
                    <td className="px-1 py-6 text-center text-yellow-500 print:text-slate-900 truncate">{phaseAmps.Y.toFixed(2)} A</td>
                    <td className="px-1 py-6 text-center text-blue-500 print:text-slate-900 truncate">{phaseAmps.B.toFixed(2)} A</td>
                    <td className="px-1 py-6 text-center text-indigo-500 print:text-slate-900 truncate">{phaseAmps.threePhase > 0 ? `${phaseAmps.threePhase.toFixed(2)} A` : '-'}</td>
                  </>
                ) : (
                  <td className="px-1 py-6 text-center text-yellow-400 print:text-slate-900 truncate">{mainCurrent.baseAmp.toFixed(2)} A</td>
                )}
                <td colSpan={7} className="px-4 py-6">
                  <div className="uppercase opacity-70 flex flex-col gap-1 items-end" style={{ fontSize: tableFontSize - 2 }}>
                    <span>Main Feeder: {mainFeeder.wire.runs > 1 ? `${mainFeeder.wire.runs} sets of ` : ''}{formatWireSize(mainFeeder.wire.size)}mm² THHN, {mainFeeder.groundSize}mm² GND in {mainFeeder.conduitSize} PVC</span>
                    <span>Main Breaker: {mainFeeder.cb}A AT / {mainFeeder.af}AF, {mainFeeder.poles}P, {mainFeeder.kaic}kAIC, {mainFeeder.type}</span>
                    <span className={phaseImbalance > 15 ? 'text-red-400' : 'text-green-400'}>Phase Imbalance: {phaseImbalance.toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="no-print p-6 bg-slate-50 border-t border-slate-100 flex justify-center gap-4">
          <button onClick={addCircuit} className="flex items-center gap-2 px-6 py-2 bg-white border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-indigo-600 hover:text-indigo-600 transition-all font-bold">
            <Plus className="w-4 h-4" /> Add Circuit
          </button>
          <button onClick={() => setShowPresetsModal(true)} className="flex items-center gap-2 px-6 py-2 bg-indigo-50 border-2 border-dashed border-indigo-200 rounded-lg text-indigo-600 hover:border-indigo-600 hover:bg-indigo-100 transition-all font-bold">
            <List className="w-4 h-4" /> Load Schedule Library
          </button>
        </div>
      </section>

      <section className="bg-slate-900 p-8 rounded-2xl text-white flex justify-between items-center print:bg-white print:text-slate-900 print:border-2 print:border-slate-800 sm:p-6">
        <div>
          <h4 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1 print:text-slate-500">Max Demand Current</h4>
          <p className="text-5xl font-black text-yellow-400 print:text-slate-900 md:text-3xl">{mainCurrent.baseAmp.toFixed(1)}<span className="text-lg ml-2">AMPS</span></p>
        </div>
        <div className="p-4 bg-white/10 rounded-2xl print:border print:border-slate-200"><Calculator className="w-8 h-8" /></div>
      </section>

      {/* Maximum Demand Current Solver Section */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 sm:p-4 no-print">
        <div className="flex items-center justify-between cursor-pointer border-b border-slate-100 dark:border-slate-800 pb-4" onClick={() => setShowDemandMath(!showDemandMath)}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl">
              <Calculator className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 dark:text-white uppercase tracking-wider text-sm">PEC Maximum Demand Math Solver</h3>
              <p className="text-xs text-slate-400">Step-by-step mathematical substitution in LaTeX format</p>
            </div>
          </div>
          <button className="text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 px-3 py-1.5 rounded-lg transition-all">
            {showDemandMath ? 'Hide Math' : 'Show Math'}
          </button>
        </div>

        {showDemandMath && (
          <div className="mt-6 space-y-6">
            {!maxDemandDetails.is3PH ? (
              <div className="space-y-4">
                <div className="bg-slate-50 dark:bg-slate-950/20 p-4 rounded-xl border border-slate-100 dark:border-slate-850">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Mathematical Formula (LaTeX)</h4>
                  <div className="font-mono text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-950 p-3 rounded border border-slate-200 dark:border-zinc-800 text-xs overflow-x-auto">
                    {`\\text{Max Demand Current (1\\Phi)} = \\left( \\frac{\\text{Total Connected VA}}{V_{\\text{sys}}} \\right) \\times 0.80 + 0.25 \\times I_{\\text{highest}}`}
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950/20 p-4 rounded-xl border border-slate-100 dark:border-slate-850">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 font-semibold">Step-by-Step Substations & Values</h4>
                  <div className="space-y-3 text-sm text-slate-600 dark:text-slate-350">
                    <p className="flex justify-between border-b border-dashed border-slate-200 dark:border-slate-800 pb-1">
                      <span>Total Connected Load (<span className="font-mono">Total VA</span>):</span>
                      <span className="font-bold text-slate-800 dark:text-white">{(maxDemandDetails.totalConnectedVA || 0).toFixed(1)} VA</span>
                    </p>
                    <p className="flex justify-between border-b border-dashed border-slate-200 dark:border-slate-800 pb-1">
                      <span>System Voltage (<span className="font-mono">V_sys</span>):</span>
                      <span className="font-bold text-slate-800 dark:text-white">{maxDemandDetails.systemVoltage} V</span>
                    </p>
                    <p className="flex justify-between border-b border-dashed border-slate-200 dark:border-slate-800 pb-1">
                      <span>Highest Active Circuit Current (<span className="font-mono">I_highest</span>):</span>
                      <span className="font-bold text-slate-800 dark:text-white">{(maxDemandDetails.highestAmps || 0).toFixed(2)} A</span>
                    </p>
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl text-white">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">LaTex Solution Details</h4>
                  <div className="bg-zinc-950 p-4 rounded-xl font-mono text-xs text-emerald-400 overflow-x-auto space-y-2">
                    <p>{`\\begin{aligned}`}</p>
                    <p className="pl-4">{`I_{\\text{demand}} &= \\left( \\frac{${(maxDemandDetails.totalConnectedVA || 0).toFixed(1)}}{230} \\right) \\times 0.80 + 0.25 \\times ${(maxDemandDetails.highestAmps || 0).toFixed(2)} \\\\`}</p>
                    <p className="pl-4">{`&= \\left( ${((maxDemandDetails.totalConnectedVA || 0) / 230).toFixed(3)} \\right) \\times 0.80 + ${(0.25 * (maxDemandDetails.highestAmps || 0)).toFixed(3)} \\\\`}</p>
                    <p className="pl-4">{`&= ${(((maxDemandDetails.totalConnectedVA || 0) / 230) * 0.80).toFixed(3)} + ${(0.25 * (maxDemandDetails.highestAmps || 0)).toFixed(3)} \\\\`}</p>
                    <p className="pl-4">{`&= \\mathbf{${(maxDemandDetails.baseAmp || 0).toFixed(2)}\\text{ A}}`}</p>
                    <p>{`\\end{aligned}`}</p>
                  </div>
                  <div className="mt-4 flex justify-between items-center">
                    <span className="text-[10px] text-zinc-500">Perfect for technical paper publications and PEE submittals.</span>
                    <button 
                      onClick={() => {
                        const code = `\\text{Max Demand Current (1\\Phi)} = \\left( \\frac{${(maxDemandDetails.totalConnectedVA || 0).toFixed(1)}}{230} \\right) \\times 0.80 + 0.25 \\times ${(maxDemandDetails.highestAmps || 0).toFixed(2)} = ${(maxDemandDetails.baseAmp || 0).toFixed(2)}\\text{ A}`;
                        navigator.clipboard.writeText(code);
                      }}
                      className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy LaTeX
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-50 dark:bg-slate-950/20 p-4 rounded-xl border border-slate-100 dark:border-slate-850">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Mathematical Formula (3-Phase LaTeX)</h4>
                  <div className="font-mono text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-950 p-3 rounded border border-slate-200 dark:border-zinc-800 text-xs overflow-x-auto">
                    {`\\text{Max Demand Current (3\\Phi)} = (I_{\\text{line}} \\times 1.732) \\times 0.80 + I_{3\\Phi} + 0.25 \\times \\text{HML}`}
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950/20 p-4 rounded-xl border border-slate-100 dark:border-slate-850">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 font-semibold">Step-by-Step Substations & Values ({maxDemandDetails.connectionType})</h4>
                  <div className="space-y-3 text-sm text-slate-600 dark:text-slate-350">
                    <p className="flex justify-between border-b border-dashed border-slate-200 dark:border-slate-800 pb-1">
                      <span>Phase currents (Line values):</span>
                      <span className="font-mono text-xs">
                        {maxDemandDetails.connectionType === 'Line-to-Line' ? 'AB' : 'AN'} = {(maxDemandDetails.phaseR || 0).toFixed(2)} A,{' '}
                        {maxDemandDetails.connectionType === 'Line-to-Line' ? 'BC' : 'BN'} = {(maxDemandDetails.phaseY || 0).toFixed(2)} A,{' '}
                        {maxDemandDetails.connectionType === 'Line-to-Line' ? 'CA' : 'CN'} = {(maxDemandDetails.phaseB || 0).toFixed(2)} A
                      </span>
                    </p>
                    <p className="flex justify-between border-b border-dashed border-slate-200 dark:border-slate-800 pb-1 font-bold text-slate-800 dark:text-white">
                      <span>Highest Phase Current (<span className="font-mono">I_line</span>):</span>
                      <span>{(maxDemandDetails.totalAmpere || 0).toFixed(2)} A</span>
                    </p>
                    <p className="flex justify-between border-b border-dashed border-slate-200 dark:border-slate-800 pb-1">
                      <span>Total 3-Phase loads current (<span className="font-mono">I_3ph</span>):</span>
                      <span className="font-bold text-slate-800 dark:text-white">{(maxDemandDetails.total3Phase || 0).toFixed(2)} A</span>
                    </p>
                    <p className="flex justify-between border-b border-dashed border-slate-200 dark:border-slate-800 pb-1">
                      <span>Highest Motor Load (<span className="font-mono">HML</span>):</span>
                      <span className="font-bold text-slate-800 dark:text-white">{(maxDemandDetails.HML || 0).toFixed(2)} A</span>
                    </p>
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl text-white">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">LaTex Solution Details</h4>
                  <div className="bg-zinc-950 p-4 rounded-xl font-mono text-xs text-emerald-400 overflow-x-auto space-y-2">
                    <p>{`\\begin{aligned}`}</p>
                    <p className="pl-4">{`I_{\\text{demand}} &= (${(maxDemandDetails.totalAmpere || 0).toFixed(2)} \\times 1.732) \\times 0.80 + ${(maxDemandDetails.total3Phase || 0).toFixed(2)} + 0.25 \\times ${(maxDemandDetails.HML || 0).toFixed(2)} \\\\`}</p>
                    <p className="pl-4">{`&= (${((maxDemandDetails.totalAmpere || 0) * 1.732).toFixed(3)}) \\times 0.80 + ${(maxDemandDetails.total3Phase || 0).toFixed(2)} + ${(0.25 * (maxDemandDetails.HML || 0)).toFixed(3)} \\\\`}</p>
                    <p className="pl-4">{`&= ${(((maxDemandDetails.totalAmpere || 0) * 1.732) * 0.80).toFixed(3)} + ${(maxDemandDetails.total3Phase || 0).toFixed(2)} + ${(0.25 * (maxDemandDetails.HML || 0)).toFixed(3)} \\\\`}</p>
                    <p className="pl-4">{`&= \\mathbf{${(maxDemandDetails.baseAmp || 0).toFixed(2)}\\text{ A}}`}</p>
                    <p>{`\\end{aligned}`}</p>
                  </div>
                  <div className="mt-4 flex justify-between items-center">
                    <span className="text-[10px] text-zinc-500">Includes 80% demand factor on line currents + separate 3-phase and 25% HML.</span>
                    <button 
                      onClick={() => {
                        const code = `\\text{Max Demand Current (3\\Phi)} = (${(maxDemandDetails.totalAmpere || 0).toFixed(2)} \\times 1.732) \\times 0.80 + ${(maxDemandDetails.total3Phase || 0).toFixed(2)} + 0.25 \\times ${(maxDemandDetails.HML || 0).toFixed(2)} = ${(maxDemandDetails.baseAmp || 0).toFixed(2)}\\text{ A}`;
                        navigator.clipboard.writeText(code);
                      }}
                      className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy LaTeX
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Single Line Diagram / Panel Layout */}
      <section id={`sld-${panel.designation || 'main'}`} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-2xl shadow-sm print:shadow-none print:border-2 print:border-slate-800 overflow-x-auto">
        <h4 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-12 flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-500" />
          Single Line Diagram - {panel.designation}
        </h4>
        
        <SingleLineDiagram panel={panel} mainFeeder={mainFeeder} panelRows={panelRows} formatWireSize={formatWireSize} isSubPanel={isSubPanel} />
      </section>

      {/* Legend & Disclaimer */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12 print:mt-8">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 print:border-2 print:border-slate-800">
          <h4 className="flex items-center gap-2 text-sm font-bold text-slate-400 dark:text-slate-500 uppercase mb-4 print:text-slate-900">
            <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 no-print" />
            Legend & Technical Notes
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-6 text-xs font-medium text-slate-600 dark:text-slate-400 print:text-slate-900">
            <div className="space-y-1.5">
              <p><span className="text-indigo-600 dark:text-indigo-400 font-bold print:text-slate-900">L</span> — Lighting Outlets (100VA/outlet)</p>
              <p><span className="text-indigo-600 dark:text-indigo-400 font-bold print:text-slate-900">S / CO</span> — Socket / Convenience Outlets (180VA/outlet)</p>
              <p><span className="text-indigo-600 dark:text-indigo-400 font-bold print:text-slate-900">AC / ACU</span> — Air Conditioning Unit</p>
              <p><span className="text-indigo-600 dark:text-indigo-400 font-bold print:text-slate-900">FCU / CU</span> — Fan Coil / Condensing Unit</p>
              <p><span className="text-indigo-600 dark:text-indigo-400 font-bold print:text-slate-900">WH</span> — Water Heater</p>
              <p><span className="text-indigo-600 dark:text-indigo-400 font-bold print:text-slate-900">M / WP</span> — Motor / Water Pump</p>
              <p><span className="text-indigo-600 dark:text-indigo-400 font-bold print:text-slate-900">RE</span> — Range Equipment / Electric Stove</p>
              <p><span className="text-indigo-600 dark:text-indigo-400 font-bold print:text-slate-900">SP</span> — Spare / Future Circuit</p>
            </div>
            <div className="space-y-1.5 leading-relaxed">
              <p>• <strong>Wiring:</strong> Copper THHN/THWN as per PEC</p>
              <p>• <strong>Min Wire Size:</strong> 2.0mm² (Lighting), 3.5mm² (Power)</p>
              <p>• <strong>Conduit:</strong> Schedule 40 PVC, EMT, or RSC</p>
              <p>• <strong>Grounding:</strong> Equipment grounded per PEC Table 2.50.6.13</p>
              <p>• <strong>Voltage Drop:</strong> Max 3% (Branch), Max 5% (Feeder)</p>
              <p>• <strong>Protection (CB):</strong> Rated ≥125% continuous load</p>
              <p>• <strong>Installation:</strong> Conform to local utility & PEC guidelines</p>
            </div>
          </div>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/20 p-6 rounded-2xl border border-amber-200 dark:border-amber-900/50 flex flex-col justify-center print:bg-white print:border-2 print:border-slate-800">
          <div className="flex items-center gap-2 mb-2 text-amber-800 dark:text-amber-400 font-bold text-sm uppercase print:text-slate-900">
            <ShieldAlert className="w-4 h-4 no-print" />
            Safety Disclaimer
          </div>
          <p className="text-[10px] text-amber-700 dark:text-amber-300 leading-relaxed font-medium print:text-slate-700">
            This document is generated for preliminary design and estimation purposes based on Philippine Electrical Code (PEC) guidelines. 
            Calculations must be reviewed and certified by a <span className="font-bold underline text-amber-900 dark:text-amber-300 print:text-slate-900">Professional Electrical Engineer (PEE)</span> before implementation. 
            The developers are not liable for errors in manual data entry or misinterpretations.
          </p>
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
            <h3 className="font-bold text-slate-900 mb-2">1. Total Load Calculation</h3>
            <p className="mb-2">The total connected load is the sum of the Volt-Ampere (VA) rating of all circuits.</p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200">
              Total VA = Σ (Quantity × Wattage)
            </div>
            <p className="mt-2 text-indigo-600 font-bold">Calculated Total: {totalVA.toFixed(2)} VA</p>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-2">2. Single-Phase vs Three-Phase Current (Ampacity)</h3>
            <p className="mb-2">The total design current depends on the system type (1-Phase vs 3-Phase). Based on PEC 2017 Part 1.</p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200 flex flex-col gap-2">
              <span>{`For 1-Phase: I = Total Connected VA / Voltage`}</span>
              <span>{`For 3-Phase: I = Total Connected VA / (1.732 × Voltage)`}</span>
            </div>
            <p className="mt-2 text-indigo-600 font-bold">
              Calculated Main Current: {mainCurrent.baseAmp.toFixed(2)} Amperes 
              ({panel.system.includes('3PH') ? 'Three-Phase' : 'Single-Phase'}, {panel.voltage}V)
            </p>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-2">3. Main Breaker Ampacity (AT) & Wire Sizing</h3>
            <p className="mb-2">According to PEC Article 2.10 and Article 2.40, the overcurrent protection (Circuit Breaker) rating and wire ampacity must follow continuous load multiplier rules.</p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200 flex flex-col gap-2">
              <span>Design Current incorporates Demand Factors (125% for Continuous Loads, 100% for Non-Continuous) + 25% for the largest Motor.</span>
              <span>Circuit Breaker Rating (AT) ≥ Design Current (Next Standard Size)</span>
              <span>Wire Ampacity ≥ Max(Design Current, Circuit Breaker Rating)</span>
            </div>
            <div className="mt-2 text-indigo-600 font-bold flex flex-col gap-1">
              <span>Design Current: {mainCurrent.designAmp.toFixed(2)} Amperes</span>
              <span>Selected Main Breaker: {mainFeeder.cb} AT</span>
              <span>Selected Main Wire: {mainFeeder.wire.runs > 1 ? `${mainFeeder.wire.runs} sets of ` : ''}{formatWireSize(mainFeeder.wire.size)} mm² THHN (Ampacity: {mainFeeder.wire.ampacity} A)</span>
              <span>Selected Main Conduit: {mainFeeder.conduitSize} PVC</span>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-2">4. Phase Balancing Check</h3>
            <p className="mb-2">For a well-designed electrical panel, the loads across the phases (R, Y, B) should be evenly distributed to prevent neutral current overload.</p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200 flex flex-col gap-2">
              <span>Max Phase Load = Max(Load_R, Load_Y, Load_B)</span>
              <span>Min Phase Load = Min(Load_R, Load_Y, Load_B)</span>
              <span>Imbalance % = (1 - (Min Phase Load / Max Phase Load)) × 100</span>
            </div>
            <div className="mt-2 flex flex-col gap-1 text-sm font-bold">
              <span className="text-slate-600">Phase R: {phaseLoads.R.toFixed(2)} VA</span>
              <span className="text-slate-600">Phase Y: {phaseLoads.Y.toFixed(2)} VA</span>
              <span className="text-slate-600">Phase B: {phaseLoads.B.toFixed(2)} VA</span>
              <span className={phaseImbalance > 15 ? 'text-red-500' : 'text-green-600'}>
                Phase Imbalance: {phaseImbalance.toFixed(2)}% {phaseImbalance > 15 ? '(Warning: >15%)' : '(Acceptable)'}
              </span>
            </div>
          </div>
        </div>
      </section>
      {/* Presets Modal */}
      {showPresetsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 no-print">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowPresetsModal(false)}></div>
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-slate-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 shrink-0">
              <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                <List className="w-6 h-6 text-indigo-600" />
                Load Schedule Reference Guide
              </h2>
              <button 
                onClick={() => setShowPresetsModal(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto w-full grid grid-cols-1 md:grid-cols-2 gap-8">
              {LOAD_PRESETS.map((category, catIdx) => (
                <div key={catIdx} className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                  <h3 className="font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2 flex justify-between items-end">
                    {category.category}
                  </h3>
                  <div className="flex flex-col gap-2">
                    {category.items.map((item, itemIdx) => (
                      <button 
                        key={itemIdx}
                        onClick={() => addCircuitFromPreset(item)}
                        className="group flex justify-between items-center p-3 bg-white rounded-lg border border-slate-200 hover:border-indigo-500 hover:shadow-md transition-all text-left"
                      >
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-700 group-hover:text-indigo-700">{item.description}</span>
                          <span className="text-xs text-slate-500 font-mono mt-1">{item.label}</span>
                        </div>
                        <div className="flex items-center gap-3">
                           <span className="bg-slate-100 text-slate-600 text-xs font-black px-2 py-1 rounded">
                             {item.loadType}
                           </span>
                           <span className="bg-indigo-50 text-indigo-700 text-sm font-black px-3 py-1 rounded w-16 text-center">
                             {item.wattage}W
                           </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-slate-100 shrink-0 flex justify-end text-sm text-slate-400 font-medium">
              Click any load to instantly add it to your schedule.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
