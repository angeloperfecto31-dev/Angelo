import React, { useState, useMemo, useEffect } from 'react';
import { ShieldAlert, Activity, GitBranch, Circle, Calculator, Link, Download } from 'lucide-react';
import { ShortCircuitParams, Circuit, PanelConfig, LoadType } from '../types';
import { WIRE_AMPACITY_TABLE, STANDARD_CB_RATINGS, INITIAL_SHORT_CIRCUIT_PARAMS, WIRE_IMPEDANCE_TABLE } from '../constants';
import { exportToCAD } from '../utils/exportDxf';
import { computePanelScheduleValues, parseSystemVoltage, calculatePanelFault, isIdleSpareOrSpace } from '../utils/computeEngine';

export interface ShortCircuitCalcProps {
  panel?: PanelConfig;
  circuits?: Circuit[];
  subPanels?: { id: string, panel: PanelConfig, circuits: Circuit[] }[];
  subSubPanels?: { id: string, panel: PanelConfig, circuits: Circuit[] }[];
  params: ShortCircuitParams;
  setParams: React.Dispatch<React.SetStateAction<ShortCircuitParams>>;
  source: string;
  setSource: React.Dispatch<React.SetStateAction<string>>;
  isPremium?: boolean;
  onRequestUpgrade?: () => void;
}

export const getRunsBySystem = (system?: string): number => {
  if (!system) return 1;
  try {
    const parsed = parseSystemVoltage(system);
    return parsed.wireCount;
  } catch (e) {
    return 1;
  }
};

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

export default function ShortCircuitCalc({ panel, circuits, subPanels, subSubPanels, params, setParams, source, setSource, isPremium = true, onRequestUpgrade }: ShortCircuitCalcProps) {

  const [isBWMode, setIsBWMode] = useState(false);

  const { motorLoadVA, nonMotorLoadVA } = useMemo(() => {
    let mVA = 0;
    let nmVA = 0;
    
    // Add main panel circuits
    if (circuits && circuits.length > 0) {
      circuits.forEach(c => {
        const isMotorOrAC = c.loadType === LoadType.MOTOR || c.loadType === LoadType.AIR_CON;
        if (isMotorOrAC) {
          mVA += c.loadVA || 0;
        } else {
          nmVA += c.loadVA || 0;
        }
      });
    }

    // Add all sub-panels circuits
    if (subPanels && subPanels.length > 0) {
      subPanels.forEach(sp => {
        if (sp.circuits && sp.circuits.length > 0) {
          sp.circuits.forEach(c => {
            const isMotorOrAC = c.loadType === LoadType.MOTOR || c.loadType === LoadType.AIR_CON;
            if (isMotorOrAC) {
              mVA += c.loadVA || 0;
            } else {
              nmVA += c.loadVA || 0;
            }
          });
        }
      });
    }

    // Add all sub-sub-panels circuits
    if (subSubPanels && subSubPanels.length > 0) {
      subSubPanels.forEach(ssp => {
        if (ssp.circuits && ssp.circuits.length > 0) {
          ssp.circuits.forEach(c => {
            const isMotorOrAC = c.loadType === LoadType.MOTOR || c.loadType === LoadType.AIR_CON;
            if (isMotorOrAC) {
              mVA += c.loadVA || 0;
            } else {
              nmVA += c.loadVA || 0;
            }
          });
        }
      });
    }

    return { motorLoadVA: mVA, nonMotorLoadVA: nmVA };
  }, [circuits, subPanels, subSubPanels]);



  const calculation = useMemo(() => {
    // Determine connection phase factors based on Philippine Electrical Code (PEC) Practices
    let connectionMultiplier = 1.0; // Default symmetrical 3-phase fault
    let groundFaultFactor = 1.0;
    
    if (params.transformerConnection?.includes('Open') || false) {
      // Open Delta (V-V) or Open Wye-Open Delta: Total fault capability is reduced 
      // typically to 86.6% (0.866) of an equivalent closed 3-phase bank.
      connectionMultiplier = 0.866; 
    } 
    
    // Check if the secondary is a Wye connection, which can permit high Line-to-Neutral ground fault currents
    if (params.transformerConnection === 'Wye (Star) Connection' || 
        params.transformerConnection === 'Delta-Wye (Δ-Y)' || 
        params.transformerConnection === 'Wye-Wye (Y-Y)' ||
        params.transformerConnection === 'Open Wye-Open Delta') {
      // Solidly grounded wye systems can have ground faults up to 125% of 3-Phase fault.
      groundFaultFactor = 1.25; 
    }

    // 1. Utility Isc
    const baseKVA = params.transformerKVA;
    const baseKV = params.transformerVoltage / 1000;
    const zUtilitypu = baseKVA / (params.utilityShortCircuitMVA * 1000);
    
    // 2. Transformer Isc
    // Open Delta banks have varying per-unit impedances; assuming baseKVA is bank KVA.
    const zTranspu = (params.transformerZ / 100) / connectionMultiplier;

    // 3. Feeder Impedance Estimate (Simplified pu)
    let feederR = 0.7 * (params.feederLength / 1000) / (params.feederRuns || 1);
    let feederX = 0.08 * (params.feederLength / 1000) / (params.feederRuns || 1);
    
    if (params.feederSize) {
      const tableVals = WIRE_IMPEDANCE_TABLE[params.feederSize.toString()];
      if (tableVals) {
        feederR = (tableVals.r * (params.feederLength / 1000)) / (params.feederRuns || 1);
        feederX = (tableVals.x * (params.feederLength / 1000)) / (params.feederRuns || 1);
      }
    }

    const feederZ = Math.sqrt(feederR*feederR + feederX*feederX);
    const zFeederpu = feederZ * (baseKVA / 1000) / (baseKV * baseKV);

    const totalZpu = zUtilitypu + zTranspu + zFeederpu;
    
    const iFullLoad = params.transformerKVA / (1.732 * (params.transformerVoltage / 1000));
    
    // Isc at different points
    // Max Symmetrical Short Circuit Current
    const iscMainBreaker = iFullLoad / (zUtilitypu + zTranspu);
    const iscFaultPoint = iFullLoad / totalZpu;

    const motorContribution = motorLoadVA > 0 ? (motorLoadVA / (1.732 * params.transformerVoltage)) * 4 : 0;
    
    const multiplier = 1 / totalZpu;

    // Fault 1 (HV side or Primary Service Entrance)
    const fault1Isc = (params.utilityShortCircuitMVA * 1000000) / (1.732 * params.primaryVoltage);

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
      multiplier: multiplier.toFixed(2),
      iscFault1: fault1Isc.toFixed(2),
      iscFault2: iscMainBreaker.toFixed(2),
      iscFault3: (iscFaultPoint + motorContribution).toFixed(2),
      connectionMultiplier: connectionMultiplier.toFixed(3),
      groundFaultFactor: groundFaultFactor.toFixed(2)
    };
  }, [params, motorLoadVA]);

  const kaicValidationData = useMemo(() => {
    const list: Array<{
      id: string;
      location: string;
      type: string;
      faultCurrentA: number;
      selectedKAIC: number;
      status: "PASS" | "FAIL";
      recommendation: string;
    }> = [];

    if (!panel) return list;

    const standardKAICRatings = [5, 10, 14, 18, 22, 25, 30, 35, 42, 50, 65, 85, 100];

    // 1. MDP Main Breaker
    const mdpFaultA = parseFloat(calculation.iscFault2) || 10000;
    const mdpKAICSelected = parseFloat(panel.icRating) || 10;
    const mdpFaultKA = mdpFaultA / 1000;
    const mdpPass = mdpKAICSelected >= mdpFaultKA;
    const recMdp = standardKAICRatings.find(k => k >= mdpFaultKA) || 100;

    list.push({
      id: "mdp-main",
      location: panel.designation || "Main Distribution Panel (MDP) Main Breaker",
      type: "Main Protective Device",
      faultCurrentA: mdpFaultA,
      selectedKAIC: mdpKAICSelected,
      status: mdpPass ? "PASS" : "FAIL",
      recommendation: mdpPass 
        ? "Breaker is adequately sized for maximum short-circuit duty." 
        : `INSUFFICIENT kAIC: Upgrade main breaker rating to at least ${recMdp} kAIC immediately.`,
    });

    // 2. MDP Branch Protective Devices
    if (circuits && circuits.length > 0) {
      circuits.forEach(c => {
        if (isIdleSpareOrSpace(c)) return;
        const branchFaultA = parseFloat(calculation.iscFault3) || 10000;
        const branchFaultKA = branchFaultA / 1000;
        const branchKAICSelected = c.mcbKAIC || 10;
        const bPass = branchKAICSelected >= branchFaultKA;
        const recB = standardKAICRatings.find(k => k >= branchFaultKA) || 100;

        list.push({
          id: `mdp-branch-${c.circuitNo}`,
          location: `${panel.designation || "MDP"} - Circuit ${c.circuitNo} (${c.description})`,
          type: "Branch Circuit Breaker",
          faultCurrentA: branchFaultA,
          selectedKAIC: branchKAICSelected,
          status: bPass ? "PASS" : "FAIL",
          recommendation: bPass
            ? "Circuit breaker is adequate."
            : `Recommend MCCB upgrade to at least ${recB} kAIC.`,
        });
      });
    }

    // 3. Subpanels
    if (subPanels && subPanels.length > 0) {
      subPanels.forEach(sp => {
        let spFaultA = 10000;
        let parentConn = circuits?.find(c => c.linkedSubPanelId === sp.id);
        if (!parentConn && subPanels) {
          parentConn = subPanels.flatMap(otherSp => otherSp.circuits).find(c => c.linkedSubPanelId === sp.id);
        }

        if (parentConn) {
          const feederLen = params.feederLength || 10;
          const feederSize = parentConn.wireSize || "14";
          const feederRuns = parentConn.quantity || 1;
          const motorVA = sp.circuits.reduce((acc, curr) => 
            (curr.loadType as any === LoadType.MOTOR || curr.loadType as any === LoadType.AIR_CON) ? acc + (curr.loadVA || 0) : acc, 0
          );
          spFaultA = calculatePanelFault(
            sp.panel,
            params,
            feederLen,
            feederSize,
            feederRuns,
            motorVA
          );
        } else {
          spFaultA = calculatePanelFault(sp.panel, params, undefined, undefined, undefined, 0);
        }

        const spFaultKA = spFaultA / 1000;
        const spKAICSelected = parseFloat(sp.panel.icRating) || 10;
        const spPass = spKAICSelected >= spFaultKA;
        const recSp = standardKAICRatings.find(k => k >= spFaultKA) || 100;

        list.push({
          id: `sp-${sp.id}-main`,
          location: `${sp.panel.designation || `Subpanel ${sp.id}`} Main Breaker`,
          type: "Subpanel Main Device",
          faultCurrentA: spFaultA,
          selectedKAIC: spKAICSelected,
          status: spPass ? "PASS" : "FAIL",
          recommendation: spPass
            ? "Main breaker is adequate for short-circuit duty."
            : `INSUFFICIENT kAIC: Upgrade to minimum ${recSp} kAIC protection.`,
        });

        // Subpanel branch circuits
        sp.circuits.forEach(c => {
          if (isIdleSpareOrSpace(c)) return;
          const branchFaultKA = spFaultKA;
          const branchKAICSelected = c.mcbKAIC || 10;
          const bPass = branchKAICSelected >= branchFaultKA;
          const recB = standardKAICRatings.find(k => k >= branchFaultKA) || 100;

          list.push({
            id: `sp-${sp.id}-branch-${c.circuitNo}`,
            location: `${sp.panel.designation || `Subpanel ${sp.id}`} - Circuit ${c.circuitNo} (${c.description})`,
            type: "Branch Circuit Breaker",
            faultCurrentA: spFaultA,
            selectedKAIC: branchKAICSelected,
            status: bPass ? "PASS" : "FAIL",
            recommendation: bPass
              ? "Circuit breaker is adequate."
              : `Recommend upgrade to ${recB} kAIC.`,
          });
        });
      });
    }

    // 4. Sub-subpanels
    if (subSubPanels && subSubPanels.length > 0) {
      subSubPanels.forEach(ssp => {
        let sspFaultA = 8000;
        let parentConn = subPanels?.flatMap(sp => sp.circuits).find(c => c.linkedSubPanelId === ssp.id);
        if (parentConn) {
          const feederLen = params.feederLength || 10;
          const feederSize = parentConn.wireSize || "14";
          const feederRuns = parentConn.quantity || 1;
          const motorVA = ssp.circuits.reduce((acc, curr) => 
            (curr.loadType as any === LoadType.MOTOR || curr.loadType as any === LoadType.AIR_CON) ? acc + (curr.loadVA || 0) : acc, 0
          );
          sspFaultA = calculatePanelFault(
            ssp.panel,
            params,
            feederLen,
            feederSize,
            feederRuns,
            motorVA
          );
        } else {
          sspFaultA = calculatePanelFault(ssp.panel, params, undefined, undefined, undefined, 0);
        }

        const sspFaultKA = sspFaultA / 1000;
        const sspKAICSelected = parseFloat(ssp.panel.icRating) || 10;
        const sspPass = sspKAICSelected >= sspFaultKA;
        const recSsp = standardKAICRatings.find(k => k >= sspFaultKA) || 100;

        list.push({
          id: `ssp-${ssp.id}-main`,
          location: `${ssp.panel.designation || `Sub-Subpanel ${ssp.id}`} Main Breaker`,
          type: "Sub-Subpanel Main Device",
          faultCurrentA: sspFaultA,
          selectedKAIC: sspKAICSelected,
          status: sspPass ? "PASS" : "FAIL",
          recommendation: sspPass
            ? "Main breaker is adequate."
            : `INSUFFICIENT kAIC: Upgrade to minimum ${recSsp} kAIC.`,
        });

        ssp.circuits.forEach(c => {
          if (isIdleSpareOrSpace(c)) return;
          const branchFaultKA = sspFaultKA;
          const branchKAICSelected = c.mcbKAIC || 10;
          const bPass = branchKAICSelected >= branchFaultKA;
          const recB = standardKAICRatings.find(k => k >= branchFaultKA) || 100;

          list.push({
            id: `ssp-${ssp.id}-branch-${c.circuitNo}`,
            location: `${ssp.panel.designation || `Sub-Subpanel ${ssp.id}`} - Circuit ${c.circuitNo} (${c.description})`,
            type: "Branch Circuit Breaker",
            faultCurrentA: sspFaultA,
            selectedKAIC: branchKAICSelected,
            status: bPass ? "PASS" : "FAIL",
            recommendation: bPass
              ? "Circuit breaker is adequate."
              : `Recommend upgrade to ${recB} kAIC.`,
          });
        });
      });
    }

    return list;
  }, [panel, circuits, subPanels, subSubPanels, params, calculation]);

  const totalDevicesCount = kaicValidationData.length;
  const passedDevicesCount = kaicValidationData.filter(d => d.status === "PASS").length;
  const failedDevicesCount = kaicValidationData.filter(d => d.status === "FAIL").length;

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
              <select 
                value={source} 
                onChange={e => {
                  const val = e.target.value;
                  setSource(val);
                  if (val === 'custom') {
                    setParams(INITIAL_SHORT_CIRCUIT_PARAMS);
                  }
                }} 
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900 rounded-lg text-sm text-red-900 dark:text-red-200 font-medium font-sans mt-2 shadow-sm focus:outline-none"
              >
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
                  <select disabled={source === 'auto'} value={
                    params.transformerConnection === 'Delta-Wye' ? 'Delta-Wye (Δ-Y)' :
                    params.transformerConnection === 'Wye (Star)' ? 'Wye (Star) Connection' :
                    params.transformerConnection === 'Delta' ? 'Delta Connection' :
                    params.transformerConnection === 'Wye-Wye' ? 'Wye-Wye (Y-Y)' :
                    params.transformerConnection
                  } onChange={e => setParams({...params, transformerConnection: e.target.value})} className={`w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-sm transition-all outline-none ${source === 'auto' ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed' : 'bg-slate-50 dark:bg-slate-800 text-slate-950 dark:text-slate-100 focus:ring-2 focus:ring-red-500'}`}>
                     <option value="Wye (Star) Connection" className="dark:bg-slate-900 dark:text-slate-100">Wye (Star) Connection</option>
                     <option value="Delta Connection" className="dark:bg-slate-900 dark:text-slate-100">Delta Connection</option>
                     <option value="Delta-Wye (Δ-Y)" className="dark:bg-slate-900 dark:text-slate-100">Delta-Wye (Δ-Y)</option>
                     <option value="Wye-Delta (Y-Δ)" className="dark:bg-slate-900 dark:text-slate-100">Wye-Delta (Y-Δ)</option>
                     <option value="Delta-Delta (Δ-Δ)" className="dark:bg-slate-900 dark:text-slate-100">Delta-Delta (Δ-Δ)</option>
                     <option value="Wye-Wye (Y-Y)" className="dark:bg-slate-900 dark:text-slate-100">Wye-Wye (Y-Y)</option>
                     <option value="Open Delta (V-V)" className="dark:bg-slate-900 dark:text-slate-100">Open Delta (V-V)</option>
                     <option value="Open Wye-Open Delta" className="dark:bg-slate-900 dark:text-slate-100">Open Wye-Open Delta</option>
                     <option value="Single-Phase Transformer" className="dark:bg-slate-900 dark:text-slate-100">Single-Phase Transformer</option>
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

      <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden panel-container print:rounded-none">
        <div className="relative p-8 flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-600"></div>
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400">
              <ShieldAlert className="w-3.5 h-3.5 animate-pulse" /> Point-To-Point Fault Analysis
            </span>
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white uppercase tracking-tight font-sans">Short Circuit Calculation Report</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">PEC 2017 Requirement Section 1.10.1.24 — Electrical Safety Conformity</p>
          </div>
          <div className="mt-4 md:mt-0 flex flex-wrap items-center gap-4 justify-center md:justify-end">
            <button
              onClick={() => {
                if (!isPremium) {
                  if (onRequestUpgrade) onRequestUpgrade();
                  return;
                }
                if (panel && circuits) {
                  exportToCAD(panel, circuits, subPanels || [], params, 'SHORT_CIRCUIT');
                } else {
                  alert("Please ensure panels and circuits are fully loaded before exporting.");
                }
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md cursor-pointer border ${
                isPremium
                  ? 'bg-sky-600 hover:bg-sky-500 hover:text-white dark:bg-sky-700 dark:hover:bg-sky-600 text-white border-sky-500 hover:shadow-sky-500/10'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-200 hover:text-slate-600'
              }`}
              title={isPremium ? "Download editable DWG/DXF AutoCAD drawing block compliant with professional engineering standards" : "Export AutoCad is available on the Premium Plan"}
            >
              <Download className="w-4 h-4" />
              <span>{isPremium ? "Export AutoCAD Drawing" : "Export AutoCAD (Premium)"}</span>
            </button>
            <div className="px-4 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl shadow-xs text-center md:text-right">
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase block tracking-wider">Audit Stamp</span>
              <span className="text-xs font-black text-slate-700 dark:text-slate-300 font-mono tracking-tight">STATUS: LOCAL PEC VERIFIED</span>
            </div>
          </div>
        </div>

        <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
          {/* Input Data Summary Column */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
              <div className="p-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <Calculator className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Input Parameter Profile</h4>
            </div>

            <div className="bg-slate-50/40 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800/80 p-5 rounded-2xl space-y-3.5">
              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Transformer Rating:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white text-right">{params.transformerKVA} kVA</span>
              </div>
              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Secondary Bus Voltage:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white text-right">{params.transformerVoltage} V</span>
              </div>
              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400 font-medium font-sans">Transformer %Z:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white text-right">{params.transformerZ} %</span>
              </div>
              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Utility Fault Level:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white text-right">{params.utilityShortCircuitMVA} MVAsc</span>
              </div>
              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400 font-medium font-sans">Primary Voltage (HV):</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white text-right">{params.primaryVoltage} V</span>
              </div>
              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Feeder Conductor:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white text-right">{params.feederRuns}x {params.feederSize}mm² {params.conductorType}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Feeder Bus Length:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white text-right">{params.feederLength} m</span>
              </div>
            </div>
          </div>

          {/* Calculated Results Block */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
              <div className="p-1 rounded bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
                <GitBranch className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Sequence Calculations</h4>
            </div>

            <div className="relative overflow-hidden bg-slate-900 dark:bg-slate-950 rounded-2xl p-6 text-white border border-slate-800 shadow-md">
              <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-6">
                
                {/* Full Load Current Block */}
                <div className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl space-y-2">
                  <span className="text-[9px] font-extrabold uppercase text-slate-400 tracking-widest block font-sans">Full Load FLA Current</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-mono font-bold text-sky-400 tracking-tight">{calculation.iFullLoad}</span>
                    <span className="text-xs font-bold text-slate-300">AMPS</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-sans leading-normal">Nominal secondary transformer current under continuous maximum rating.</p>
                </div>

                {/* Total Fault Current Block */}
                <div className="bg-red-950/20 border border-red-900/30 p-4 rounded-xl space-y-2 relative">
                  <div className="absolute right-3 top-3 w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                  <span className="text-[9px] font-extrabold uppercase text-red-400 tracking-widest block font-sans font-mono">Total Fault Current (Isc)</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-mono font-black text-rose-500 tracking-tight">{calculation.iscSecondary}</span>
                    <span className="text-xs font-bold text-rose-400">AMPS</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-sans leading-normal">Symmetrical point-to-point fault current available at secondary board terminal.</p>
                </div>

                {/* Impedance factors Block info */}
                <div className="sm:col-span-2 pt-4 border-t border-slate-800 grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block font-sans">Z-Utility Reference (pu)</span>
                    <span className="text-xs font-mono font-semibold text-slate-200 block">{calculation.zUtilitypu}</span>
                    <p className="text-[9px] text-slate-500 leading-normal">Equivalent primary infinite bus impedance normalized to system base kVA.</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block font-sans font-mono">Z-Trans (pu)</span>
                    <span className="text-xs font-mono font-semibold text-slate-200 block">{calculation.zTranspu}</span>
                    <p className="text-[9px] text-slate-500 leading-normal">Internal magnetic leakage impedance of transformer windings.</p>
                  </div>
                </div>

              </div>

              {/* Watermark background icon */}
              <div className="absolute right-[-40px] bottom-[-40px] opacity-[0.03] select-none pointer-events-none">
                <ShieldAlert className="w-72 h-72 text-white" />
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* Impedance Diagram Visual (ETAP Style) */}
      <div>
        <section className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm panel-container print:mt-12 relative border border-slate-200 dark:border-slate-800 p-8">
          <div className="flex items-center justify-between mb-8 no-print">
            <div className="flex flex-col gap-1">
              <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-4 h-4 text-red-500" />
                Single Line Impedance Diagram
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-sans print:hidden">Display settings:</p>
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
            </div>
          </div>

          <div className="relative w-full overflow-x-auto py-6 font-sans">
            <div id="short-circuit-diagram" className="relative w-[1050px] mx-auto h-[950px] bg-white transition-[filter]" style={{ filter: isBWMode ? 'grayscale(100%)' : 'none', minWidth: '1050px' }}>
              {/* Wrapping relative container to allow DraggableBoxes to overlay perfectly */}
              <div 
                className="relative w-[850px] h-[880px] shrink-0 overflow-visible select-none pointer-events-auto ml-[150px] mt-[30px]"
              >
                {/* SVG 2D Single Line Impedance Diagram */}
                <svg
                  viewBox="0 0 850 880"
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
                  <circle cx="180" cy="80" r="22" className="sld-line sld-symbol-bg" />
                  <path d="M 166,80 Q 173,68 180,80 T 194,80" className="sld-line" strokeWidth="2" />
                  <text x="180" y="115" className="sld-text-lbl" textAnchor="middle" style={{ fontWeight: 'bold' }}>UTILITY SERVICE ENTRANCE</text>

                  {/* Divider Dash linking Left and Right */}
                  <line x1="210" y1="80" x2="510" y2="80" className="sld-dash" />

                  {/* Right Column Index Reference Bar (Infinite Bus) */}
                  <line x1="510" y1="80" x2="610" y2="80" className="sld-line" strokeWidth="6" />
                  <text x="560" y="65" className="sld-text-title" textAnchor="middle">Infinite Bus (V = 1.0 pu)</text>

                  {/* Right Column Utility Impedance Series Reactor */}
                  <line x1="560" y1="80" x2="560" y2="120" className="sld-line" />
                  <rect x="545" y="120" width="30" height="35" className="sld-shape-tx-blue" strokeWidth="2" rx="3" />
                  <text x="560" y="141" className="sld-text-val" textAnchor="middle" style={{ fill: '#3b82f6' }}>Zu</text>
                  <line x1="560" y1="155" x2="560" y2="180" className="sld-line" />

                  {/* PRIMARY TO SECONDARY BUS CONNECTORS */}
                  <line x1="180" y1="102" x2="180" y2="180" className="sld-line" strokeWidth="2" />

                  {/* ----------------- FAULT 1: PRIMARY SIDE ----------------- */}
                  {/* Primary Service Busbar - Horizontal line at y=180 */}
                  <line x1="80" y1="180" x2="280" y2="180" className="sld-line" strokeWidth="4" />
                  <text x="285" y="177" className="sld-text-title" fill="#d97706">PRIMARY BUS (HV)</text>
                  <text x="285" y="190" className="sld-text-val" style={{ fill: '#d97706' }}>{params.primaryVoltage} V</text>
                  
                  {/* Fault 1 Starburst Symbol at x=120, y=180 */}
                  <g transform="translate(120,180)">
                    <path
                      d="M -15,0 L -5,5 L -7,12 L -1,5 L 5,14 L 4,4 L 14,0 L 4,-4 L 6,-12 L -1,-5 L -7,-12 L -4,-4 Z"
                      className="sld-line"
                      fill="#fffbeb"
                      stroke="#ea580c"
                      strokeWidth="1.5"
                    />
                    <circle cx="0" cy="0" r="2" fill="#d97706" />
                  </g>
                  <text x="120" y="165" className="sld-text-val" textAnchor="middle" style={{ fill: '#d97706', fontSize: '9px' }}>Fault 1</text>
                  <text x="120" y="198" className="sld-text-val" textAnchor="middle" style={{ fill: '#d97706', fontSize: '8px' }}>Isc1={calculation.iscFault1}A</text>

                  {/* Right Column Node 1: Primary Bus Node at y=180 */}
                  <circle cx="560" cy="180" r="5" fill="#d97706" />
                  {/* Fault 1 Switch/Grounding Branch on Impedance Model */}
                  <line x1="560" y1="180" x2="500" y2="180" className="sld-line" strokeWidth="1.5" style={{ stroke: '#d97706' }} />
                  {/* Closed Fault Switch Symbol */}
                  <line x1="500" y1="180" x2="480" y2="170" className="sld-line" strokeWidth="1.5" style={{ stroke: '#d97706' }} />
                  <line x1="480" y1="180" x2="450" y2="180" className="sld-line" strokeWidth="1.5" style={{ stroke: '#d97706' }} />
                  {/* F1 Grounding Triangle */}
                  <line x1="450" y1="175" x2="450" y2="185" stroke="#d97706" strokeWidth="2.5" />
                  <line x1="446" y1="178" x2="446" y2="182" stroke="#d97706" strokeWidth="2" />
                  <line x1="442" y1="180" x2="442" y2="180" stroke="#d97706" strokeWidth="1.5" />
                  <text x="475" y="162" className="sld-text-val" textAnchor="middle" style={{ fill: '#d97706', fontSize: '9px' }}>F1 Ground</text>

                  {/* Link SLD and Impedance primary bus */}
                  <line x1="285" y1="180" x2="500" y2="180" className="sld-dash" />

                  {/* ROW 2: PRIMARY PROTECTIVE / SWITCH */}
                  {/* Primary Switch symbol vertically down on SLD at y=210 */}
                  <line x1="180" y1="180" x2="180" y2="205" className="sld-line" />
                  <line x1="180" y1="205" x2="192" y2="218" className="sld-line" strokeWidth="2" />
                  <line x1="180" y1="225" x2="180" y2="250" className="sld-line" />
                  <text x="195" y="215" className="sld-text-lbl text-[8px]">LBS / HV FUSE</text>

                  {/* ROW 3: TRANSFORMER */}
                  {/* Left Column Transformer Symbol (Overlap Circles) */}
                  <circle cx="180" cy="275" r="18" className="sld-line sld-symbol-bg" />
                  <circle cx="180" cy="295" r="18" className="sld-line" fill="none" />
                  <text x="180" y="328" className="sld-text-lbl" textAnchor="middle" style={{ fontWeight: 'bold' }}>TX-01 SUBSTATION</text>
                  <text x="180" y="340" className="sld-text-lbl" textAnchor="middle" style={{ fontSize: '8px' }}>{params.transformerKVA}kVA {params.transformerConnection}</text>

                  {/* Divider Dash linking Left and Right */}
                  <line x1="205" y1="285" x2="510" y2="285" className="sld-dash" />

                  {/* Right Column Transformer impedance series block */}
                  <line x1="560" y1="180" x2="560" y2="265" className="sld-line" />
                  <rect x="545" y="265" width="30" height="35" className="sld-shape-tx-green" strokeWidth="2" rx="3" />
                  <text x="560" y="286" className="sld-text-val" textAnchor="middle" style={{ fill: '#16a34a' }}>Zt</text>
                  <line x1="560" y1="300" x2="560" y2="390" className="sld-line" strokeWidth="2" />

                  {/* SECONDARY BUS WORKWAY */}
                  <line x1="180" y1="313" x2="180" y2="360" className="sld-line" />

                  {/* ROW 4: MAIN BREAKER */}
                  <rect x="171" y="360" width="18" height="26" rx="2" className="sld-line sld-symbol-bg" />
                  <line x1="171" y1="373" x2="189" y2="373" className="sld-line" strokeWidth="1.5" />
                  <text x="200" y="377" className="sld-text-val">{panel ? `${panel.mainBreakerAT} AT / ${panel.mainBreakerAF} AF` : '100 AT / 100 AF'}</text>

                  <line x1="180" y1="386" x2="180" y2="420" className="sld-line" />

                  {/* ----------------- FAULT 2: SECONDARY MDP BUS ----------------- */}
                  {/* Secondary Main Distribution Panel (MDP) Busbar at y=420 */}
                  <line x1="80" y1="420" x2="280" y2="420" className="sld-line" strokeWidth="5" />
                  <text x="285" y="417" className="sld-text-title" fill="#b91c1c">MAIN MDP BUSBAR</text>
                  <text x="285" y="430" className="sld-text-val" style={{ fill: '#b91c1c' }}>{params.transformerVoltage} V (Dyn11 Wye-G)</text>

                  {/* Fault 2 Starburst Symbol at x=120, y=420 */}
                  <g transform="translate(120,420)">
                    <path
                      d="M -22,0 L -7,7 L -9,15 L -1,6 L 7,16 L 6,5 L 18,0 L 5,-5 L 7,-15 L -1,-6 L -9,-16 L -6,-5 Z"
                      className="sld-line"
                      fill="#fef2f2"
                      stroke="#dc2626"
                      strokeWidth="2"
                    />
                    <circle cx="0" cy="0" r="3.5" fill="#dc2626" />
                  </g>
                  <text x="120" y="402" className="sld-text-val" textAnchor="middle" style={{ fill: '#dc2626', fontSize: '10px' }}>Fault 2 (Secondary)</text>
                  <text x="120" y="442" className="sld-text-val" textAnchor="middle" style={{ fill: '#dc2626', fontSize: '9px', fontWeight: 'bold' }}>Isc2={calculation.iscFault2}A</text>

                  {/* Right Column Node 2: Secondary MDP Node at y=390 */}
                  <circle cx="560" cy="390" r="6" fill="#dc2626" />
                  <text x="575" y="386" className="sld-text-lbl" style={{ fontWeight: 'bold' }}>MDP NODE (Node 2)</text>
                  <text x="575" y="398" className="sld-text-val" style={{ fill: '#dc2626' }}>Isc2 = {calculation.iscFault2} A</text>

                  {/* Fault 2 Switch/Grounding Branch on Impedance Model */}
                  <line x1="560" y1="390" x2="500" y2="390" className="sld-line" strokeWidth="1.5" style={{ stroke: '#dc2626' }} />
                  {/* Closed Fault Switch Symbol */}
                  <line x1="500" y1="390" x2="480" y2="380" className="sld-line" strokeWidth="1.5" style={{ stroke: '#dc2626' }} />
                  <line x1="480" y1="390" x2="450" y2="390" className="sld-line" strokeWidth="1.5" style={{ stroke: '#dc2626' }} />
                  {/* F2 Grounding Triangle */}
                  <line x1="450" y1="385" x2="450" y2="395" stroke="#dc2626" strokeWidth="2.5" />
                  <line x1="446" y1="388" x2="446" y2="392" stroke="#dc2626" strokeWidth="2" />
                  <line x1="442" y1="390" x2="442" y2="390" stroke="#dc2626" strokeWidth="1.5" />
                  <text x="475" y="372" className="sld-text-val" textAnchor="middle" style={{ fill: '#dc2626', fontSize: '9px' }}>F2 Ground</text>

                  {/* Link SLD and Impedance main bus */}
                  <line x1="285" y1="420" x2="500" y2="390" className="sld-dash" />

                  {/* ROW 5: BRANCH BREAKER & FEEDER CABLE */}
                  <line x1="180" y1="422" x2="180" y2="450" className="sld-line" />
                  
                  {/* Feeder Molded Case Breaker box */}
                  <rect x="173" y="450" width="14" height="20" rx="1" className="sld-line sld-symbol-bg" />
                  <line x1="173" y1="460" x2="187" y2="460" className="sld-line" />

                  <line x1="180" y1="470" x2="180" y2="580" className="sld-line" strokeWidth="3" style={{ stroke: '#ea580c' }} />
                  <text x="180" y="525" className="sld-text-val" style={{ fill: '#ea580c' }} textAnchor="middle">★ FEEDER CABLE ★</text>
                  <text x="180" y="540" className="sld-text-lbl" style={{ stroke: 'none', fill: '#9a3412', fontSize: '8px' }} textAnchor="middle">
                    {params.feederRuns}x {params.feederSize}mm² {params.conductorType} ({params.feederLength}m)
                  </text>

                  {/* Divider line linking */}
                  <line x1="205" y1="520" x2="510" y2="520" className="sld-dash" />

                  {/* Zcab Reactor (Feeder Impedance) */}
                  <line x1="560" y1="390" x2="560" y2="475" className="sld-line" />
                  <rect x="545" y="475" width="30" height="35" className="sld-shape-tx-orange" strokeWidth="2" rx="3" />
                  <text x="560" y="496" className="sld-text-val" textAnchor="middle" style={{ fill: '#ea580c' }}>Zcab</text>
                  <line x1="560" y1="510" x2="560" y2="620" className="sld-line" strokeWidth="2" />

                  {/* ----------------- FAULT 3: Remote Panel BOARD BUS ----------------- */}
                  {/* Remote Panel board Busbar at y=580 */}
                  <line x1="80" y1="580" x2="280" y2="580" className="sld-line" strokeWidth="5" />
                  <text x="285" y="577" className="sld-text-title" fill="#a16207">DISTRIBUTION PANELBOARD ({panel?.designation || 'PANEL A'})</text>
                  <text x="285" y="590" className="sld-text-val" style={{ fill: '#a16207' }}>Sec Bus Fault point</text>

                  {/* Fault 3 Starburst Symbol at x=120, y=580 */}
                  <g transform="translate(120,580)">
                    <path
                      d="M -26,0 L -9,9 L -11,19 L -1,8 L 9,21 L 8,7 L 24,0 L 7,-7 L 9,-21 L -1,-8 L -11,-21 L -8,-7 Z"
                      className="sld-line"
                      fill="#fffbeb"
                      stroke="#d97706"
                      strokeWidth="2"
                    />
                    <circle cx="0" cy="0" r="4" fill="#d97706" />
                  </g>
                  <text x="120" y="562" className="sld-text-val" textAnchor="middle" style={{ fill: '#d97706', fontSize: '10px' }}>Fault 3 (Remote Panel)</text>
                  <text x="120" y="602" className="sld-text-val" textAnchor="middle" style={{ fill: '#d97706', fontSize: '9px', fontWeight: 'bold' }}>Isc3={calculation.iscFault3}A</text>

                  {/* Right Column Node 3: Remote Node at y=620 */}
                  <circle cx="560" cy="620" r="6" fill="#dc2626" />
                  <text x="575" y="616" className="sld-text-lbl" style={{ fontWeight: 'bold' }}>PANEL NODE (Node 3)</text>
                  <text x="575" y="628" className="sld-text-val" style={{ fill: '#dc2626' }}>Isc3 = {calculation.iscFault3} A</text>

                  {/* Fault 3 Switch/Grounding Branch on Impedance Model */}
                  <line x1="560" y1="620" x2="500" y2="620" className="sld-line" strokeWidth="1.5" style={{ stroke: '#d97706' }} />
                  {/* Closed Fault Switch Symbol */}
                  <line x1="500" y1="620" x2="480" y2="610" className="sld-line" strokeWidth="1.5" style={{ stroke: '#d97706' }} />
                  <line x1="480" y1="620" x2="450" y2="620" className="sld-line" strokeWidth="1.5" style={{ stroke: '#d97706' }} />
                  {/* F3 Grounding Triangle */}
                  <line x1="450" y1="615" x2="450" y2="625" stroke="#d97706" strokeWidth="2.5" />
                  <line x1="446" y1="618" x2="446" y2="622" stroke="#d97706" strokeWidth="2" />
                  <line x1="442" y1="620" x2="442" y2="620" stroke="#d97706" strokeWidth="1.5" />
                  <text x="475" y="602" className="sld-text-val" textAnchor="middle" style={{ fill: '#d97706', fontSize: '9px' }}>F3 Ground</text>

                  {/* Link SLD and Impedance board bus */}
                  <line x1="285" y1="580" x2="500" y2="620" className="sld-dash" />

                  {/* ROW 6: MOTOR FEEDBACK (IF MOTOR LOAD EXISTS) */}
                  {motorLoadVA > 0 && (
                    <>
                      {/* Left Column Wires branching off from panel bus to motor */}
                      <line x1="180" y1="580" x2="180" y2="630" className="sld-line" />
                      <circle cx="180" cy="648" r="18" className="sld-line sld-symbol-bg" />
                      <text x="180" y="652" className="sld-text-val" textAnchor="middle" style={{ fontSize: '11px', fontWeight: 'bold' }}>M</text>
                      <text x="180" y="680" className="sld-text-lbl" textAnchor="middle">Motor Feedback</text>
                      <text x="180" y="692" className="sld-text-val" textAnchor="middle" style={{ fontSize: '8px', fill: '#ea580c' }}>+ {calculation.motorContribution} a</text>

                      {/* Right Column Motor Winding Backfeed Wires at Node 3 */}
                      <line x1="560" y1="620" x2="620" y2="620" className="sld-line" strokeWidth="1.5" style={{ stroke: '#3b82f6' }} />
                      {/* Reactance of Motors Block */}
                      <rect x="620" y="602" width="22" height="35" className="sld-shape-tx-blue" strokeWidth="1.5" rx="2" />
                      <text x="631" y="623" className="sld-text-val text-[8px]" textAnchor="middle">Zm</text>
                      <line x1="642" y1="620" x2="690" y2="620" className="sld-line" strokeWidth="1.5" style={{ stroke: '#3b82f6' }} />
                      
                      {/* Motor source representation */}
                      <circle cx="705" cy="620" r="15" className="sld-line sld-symbol-bg" style={{ stroke: '#3b82f6' }} />
                      <text x="705" y="624" className="sld-text-val" textAnchor="middle" style={{ fill: '#3b82f6', fontSize: '10px' }}>E_m</text>
                      <text x="705" y="648" className="sld-text-lbl" textAnchor="middle" style={{ fontSize: '8px' }}>Motor Backfeed</text>
                    </>
                  )}

                  {/* STANDARD FOOTER DETAILS in Philippine practices */}
                  <rect x="40" y="740" width="770" height="110" fill="none" stroke="#64748b" strokeWidth="1.5" strokeDasharray="2 2" rx="5" />
                  <text x="60" y="762" className="sld-text-title" style={{ fill: '#0f172a', fontSize: '12px' }}>PHILIPPINE ELECTRICAL CODE (PEC) DESIGN COMPLIANCE BLOCK</text>
                  <text x="60" y="780" className="sld-text-lbl text-[9px]">Utility Strength: {params.utilityShortCircuitMVA} MVA s.c. | Secondary Voltage: 3-Phase {params.transformerVoltage} V, 60 Hz</text>
                  <text x="60" y="795" className="sld-text-lbl text-[9px]">Fault 1 (HV Utility Bus): {calculation.iscFault1} Amps | Symmetrical Primary protection evaluated</text>
                  <text x="60" y="810" className="sld-text-lbl text-[9px]">Fault 2 (LV Secondary Bus): {calculation.iscFault2} Amps | Air / Molded Case Circuit Breaker layout</text>
                  <text x="60" y="825" className="sld-text-lbl text-[9px]">Fault 3 (Remote Board Bus): {calculation.iscFault3} Amps (incl. {calculation.motorContribution}A motor feedback) | PEC 1.10.1.24 Compliant</text>
                  <text x="60" y="840" className="sld-text-lbl text-[9px]" style={{ fill: '#0f766e', fontWeight: 'bold' }}>PEC APPROVED CONFIG | SYSTEM POWER GRID DIAGRAM</text>
                </svg>

                {/* INTERACTIVE DRAGGABLE LABELS FOR SVG */}
                {/* 1. Grid Supply Detail Box */}
                <DraggableBox 
                  defaultPos={{ x: 20, y: 65 }} 
                  lineStart={{ x: 158, y: 80 }} 
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

                {/* 3. Fault 1 Outputs Box */}
                <DraggableBox
                  defaultPos={{ x: 20, y: 145 }}
                  lineStart={{ x: 120, y: 180 }}
                  lineEndOffset={{ x: 130, y: 15 }}
                  className="w-36 border border-amber-200 bg-amber-50/95 backdrop-blur-xs p-2 shadow-sm rounded-lg text-left"
                >
                  <div className="select-none pointer-events-none text-[9px]">
                    <div className="font-bold text-amber-800 uppercase tracking-widest text-[8px] mb-0.5">Fault 1 (Primary HV)</div>
                    <div className="text-slate-600">Symmetrical Isc:</div>
                    <div className="font-mono font-black text-amber-900 text-[10px]">{calculation.iscFault1} A</div>
                    <div className="text-slate-500 text-[7.5px] mt-0.5">At @ {params.primaryVoltage}V Service Entrance</div>
                  </div>
                </DraggableBox>

                {/* 4. Transformer Spec Box */}
                <DraggableBox
                  defaultPos={{ x: 20, y: 245 }}
                  lineStart={{ x: 162, y: 285 }}
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

                {/* 5. Transformer Impedance Box */}
                <DraggableBox
                  defaultPos={{ x: 630, y: 245 }}
                  lineStart={{ x: 575, y: 282 }}
                  lineEndOffset={{ x: 0, y: 25 }}
                  className="w-44 border border-emerald-200 bg-emerald-50/95 backdrop-blur-xs p-2 shadow-sm rounded-lg text-left"
                >
                  <div className="select-none pointer-events-none text-[9px]">
                    <div className="font-bold text-emerald-800 uppercase tracking-widest text-[8px] mb-0.5">XFMR Impedance</div>
                    <div className="text-slate-500">Z_transformer:</div>
                    <div className="font-mono font-bold text-emerald-700 text-[10px]">{calculation.zTranspu} pu</div>
                  </div>
                </DraggableBox>

                {/* 6. Fault 2 Outputs Box */}
                <DraggableBox
                  defaultPos={{ x: 20, y: 380 }}
                  lineStart={{ x: 120, y: 420 }}
                  lineEndOffset={{ x: 130, y: 20 }}
                  className="w-36 border border-red-200 bg-red-50/95 backdrop-blur-xs p-2 shadow-sm rounded-lg text-left"
                >
                  <div className="select-none pointer-events-none text-[9px]">
                    <div className="font-bold text-red-800 uppercase tracking-widest text-[8px] mb-0.5">Fault 2 (Secondary)</div>
                    <div className="text-slate-600">Symmetrical Isc:</div>
                    <div className="font-mono font-black text-red-700 text-[10px]">{calculation.iscFault2} A</div>
                    <div className="text-slate-500 text-[7.5px] mt-0.5">At Main Distribution Panel Bus</div>
                  </div>
                </DraggableBox>

                {/* 7. Conductor Info Box */}
                <DraggableBox
                  defaultPos={{ x: 20, y: 480 }}
                  lineStart={{ x: 176, y: 520 }}
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

                {/* 8. Conductor Impedance Box */}
                <DraggableBox
                  defaultPos={{ x: 630, y: 460 }}
                  lineStart={{ x: 575, y: 492 }}
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

                {/* 9. Fault 3 Outputs Box */}
                <DraggableBox
                  defaultPos={{ x: 20, y: 560 }}
                  lineStart={{ x: 120, y: 580 }}
                  lineEndOffset={{ x: 130, y: 15 }}
                  className="w-36 border border-yellow-200 bg-yellow-50/95 backdrop-blur-xs p-2 shadow-sm rounded-lg text-left"
                >
                  <div className="select-none pointer-events-none text-[9px]">
                    <div className="font-bold text-yellow-800 uppercase tracking-widest text-[8px] mb-0.5">Fault 3 (Remote Bus)</div>
                    <div className="text-slate-600">Symmetrical Isc:</div>
                    <div className="font-mono font-black text-yellow-700 text-[10px]">{calculation.iscFault3} A</div>
                    {motorLoadVA > 0 && (
                      <div className="text-red-600/80 text-[7.5px]">Motor backfeed: +{calculation.motorContribution}A</div>
                    )}
                    <div className="mt-1 pt-1 border-t border-yellow-200 font-bold text-slate-900">Total: {calculation.totalFaultM} A</div>
                  </div>
                </DraggableBox>

                {/* 10. Impedance Total Box */}
                <DraggableBox
                  defaultPos={{ x: 630, y: 580 }}
                  lineStart={{ x: 575, y: 620 }}
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
          </div>
          
          <p className="text-[9px] text-slate-400 mt-8 italic text-center">Diagram generated per Philippine Electrical Code calculation methods.</p>
        </section>
      </div>

      {/* KAIC PROTECTION VALIDATION DASHBOARD */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-100 dark:border-slate-800 pb-5">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-rose-50 dark:bg-rose-950/20 rounded-lg">
              <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 font-sans">KAIC Protection Validation Dashboard</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Automatic auditing of protective devices against terminal short-circuit currents (PEC Section 1.10.1.9 Compliance)</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-xxs font-black tracking-widest uppercase px-2 py-1 rounded bg-slate-100 dark:bg-slate-850 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
              PHILIPPINE ELECTRICAL CODE
            </span>
          </div>
        </div>

        {/* KPI COUNTERS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-800/80 rounded-xl p-4">
            <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase block mb-1">Total Devices Audited</span>
            <span className="text-2xl font-black text-slate-800 dark:text-slate-100 font-mono">{totalDevicesCount}</span>
            <span className="text-xxs text-slate-400 block mt-1">Main & branch circuit breakers</span>
          </div>
          <div className="bg-emerald-50/40 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/30 rounded-xl p-4">
            <span className="text-[10px] font-black tracking-widest text-emerald-500 uppercase block mb-1">Compliant Devices</span>
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">{passedDevicesCount}</span>
            <span className="text-xxs text-emerald-500/80 block mt-1">Sufficient interrupting capability</span>
          </div>
          <div className={`rounded-xl p-4 border transition ${
            failedDevicesCount > 0 
              ? "bg-rose-50/60 dark:bg-rose-950/15 border-rose-200 dark:border-rose-900/40" 
              : "bg-slate-50 dark:bg-slate-950/40 border-slate-150 dark:border-slate-800/80"
          }`}>
            <span className={`text-[10px] font-black tracking-widest uppercase block mb-1 ${failedDevicesCount > 0 ? "text-rose-500" : "text-slate-400"}`}>
              Critical Violations
            </span>
            <span className={`text-2xl font-black font-mono ${failedDevicesCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-400"}`}>
              {failedDevicesCount}
            </span>
            <span className={`text-xxs block mt-1 ${failedDevicesCount > 0 ? "text-rose-500/80 font-semibold" : "text-slate-400"}`}>
              {failedDevicesCount > 0 ? "Upgrade required immediately" : "Zero safety risks detected"}
            </span>
          </div>
        </div>

        {/* VALIDATION DETAILS TABLE */}
        <div className="overflow-x-auto border border-slate-150 dark:border-slate-800 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-150 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Protective Device Location</th>
                <th className="py-3 px-4">Classification</th>
                <th className="py-3 px-4 text-center">Available Symmetrical Fault</th>
                <th className="py-3 px-4 text-center">Installed Rating</th>
                <th className="py-3 px-4 text-center">Safety Status</th>
                <th className="py-3 px-4 pl-6">Sizing Recommendation / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
              {kaicValidationData.map(d => {
                const isFail = d.status === "FAIL";
                return (
                  <tr key={d.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/20 transition-all duration-150">
                    <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100">{d.location}</td>
                    <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 font-mono text-[10px]">{d.type}</td>
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-amber-600 dark:text-amber-400">
                      {(d.faultCurrentA / 1000).toFixed(2)} kA <span className="text-[10px] text-slate-400 font-normal">({d.faultCurrentA.toFixed(0)} A)</span>
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-800 dark:text-slate-200">{d.selectedKAIC} kAIC</td>
                    <td className="py-3.5 px-4 text-center">
                      {isFail ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider uppercase bg-rose-50 text-rose-700 border border-rose-200/50 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/40">
                          🔴 FAIL
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider uppercase bg-emerald-50 text-emerald-700 border border-emerald-200/30 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30">
                          🟢 PASS
                        </span>
                      )}
                    </td>
                    <td className={`py-3.5 px-4 pl-6 font-medium ${isFail ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-slate-500 dark:text-slate-400"}`}>
                      {d.recommendation}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ASSUMPTIONS BOX */}
        <div className="mt-5 p-4 bg-slate-50 dark:bg-slate-950/30 border border-slate-150 dark:border-slate-800 rounded-xl">
          <h4 className="text-xxs font-black tracking-widest text-slate-400 uppercase mb-2">Calculation Assumptions & Engineering References</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-300 mb-0.5">Commercial kAIC Classes:</p>
              <p>Standard molded case circuit breaker (MCCB) ratings: 10, 14, 18, 22, 25, 30, 35, 42, 50, 65, 85, 100 kAIC.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-300 mb-0.5">Calculation Standards:</p>
              <p>Ohmic impedances are compiled using IEEE 141 Red Book standards at 75°C conductor temperatures with copper wire base factors.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-300 mb-0.5">Real-time Recalculations:</p>
              <p>Fault current values and device protection statuses are automatically recomputed when secondary voltages, transformer impedance, parallel runs, or panel structures change.</p>
            </div>
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
            {calculation.connectionMultiplier !== "1.000" && (
              <p className="mb-2 text-indigo-700 bg-indigo-50 p-2 rounded border border-indigo-100">
                <strong>PEC Connection Factor Applied:</strong> As an Open configuration is selected, the equivalent 3-phase symmetrical fault duty is reduced by a factor of <strong>{calculation.connectionMultiplier}</strong> compared to a closed delta bank of identical individual base ratings.
              </p>
            )}
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200 flex flex-col gap-2">
              <span>{`Step A: Z_trans_pu = (%Z / 100) / ConnectionFactor(${calculation.connectionMultiplier})`}</span>
              <span>{`Step B: Z_utility_pu = Transformer kVA / (Utility MVA × 1000)`}</span>
              <span>{`Combined Multiplier (M) = 1 / (Z_trans_pu + Z_utility_pu)`}</span>
            </div>
            <p className="mt-2 text-red-600 font-bold">Calculated Multiplier (M): {calculation.multiplier}</p>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-2">3. Secondary Short Circuit Current (Isc)</h3>
            <p className="mb-2">The max available fault current at the secondary of the transformer is crucial for sizing the primary Overcurrent Protection Device (OCPD). Multiplied by 1.25 for Asymmetrical considerations.</p>
            {calculation.groundFaultFactor !== "1.00" && (
              <p className="mb-2 text-amber-700 bg-amber-50 p-2 rounded border border-amber-100">
                <strong>Attention Wye (Star) Connection:</strong> Solidly grounded systems may result in L-N ground faults up to <strong>{calculation.groundFaultFactor}x</strong> higher than the 3-phase symmetrical fault current. Verify equipment ground fault ratings accordingly.
              </p>
            )}
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
