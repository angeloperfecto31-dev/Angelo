import React, { useState, useMemo, useEffect } from "react";
import {
  Ruler,
  Zap,
  AlertTriangle,
  Calculator,
  Link,
  Plus,
  Trash2,
  CheckCircle2,
  Layers,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  VoltageDropCalculation,
  Circuit,
  PanelConfig,
  LoadType,
} from "../types";
import {
  WIRE_IMPEDANCE_TABLE,
  WIRE_AMPACITY_TABLE,
  STANDARD_CB_RATINGS,
} from "../constants";
import { exportToCAD } from "../utils/exportDxf";
import { computePanelScheduleValues } from "../utils/computeEngine";

export interface VoltageDropCalcProps {
  panel?: PanelConfig;
  circuits?: Circuit[];
  subPanels?: { id: string; panel: PanelConfig; circuits: Circuit[] }[];
  subSubPanels?: { id: string; panel: PanelConfig; circuits: Circuit[] }[];
  calculations: VoltageDropCalculation[];
  setCalculations: React.Dispatch<
    React.SetStateAction<VoltageDropCalculation[]>
  >;
  isPremium?: boolean;
  onRequestUpgrade?: () => void;
}

export default function VoltageDropCalc({
  panel,
  circuits,
  subPanels,
  subSubPanels,
  calculations,
  setCalculations,
  isPremium = true,
  onRequestUpgrade,
}: VoltageDropCalcProps) {
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({ main: true });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const allSubPanels = useMemo(() => {
    const rawAllSubPanels = [...(subPanels || []), ...(subSubPanels || [])];
    const seen = new Set();
    return rawAllSubPanels.filter((sp) => {
      if (!sp || !sp.id) return false;
      if (seen.has(sp.id)) return false;
      seen.add(sp.id);
      return true;
    });
  }, [subPanels, subSubPanels]);

  // Auto-sync calculations with the hierarchy
  useEffect(() => {
    const newCalcs: VoltageDropCalculation[] = [];
    
    const getLength = (sourceId: string) => {
      const existing = calculations.find(c => c.source === sourceId);
      return existing ? existing.length : 30; // default 30m
    };

    if (panel && circuits) {
      const { mainCurrent, mainFeeder } = computePanelScheduleValues(panel, circuits, { availableSubPanels: allSubPanels });
      const is3PH = panel.system.includes("3PH");
      newCalcs.push({
        id: calculations.find(c => c.source === "main")?.id || crypto.randomUUID(),
        source: "main",
        name: "Main Feeder",
        loadA: Number(mainCurrent.baseAmp.toFixed(2)),
        length: getLength("main"),
        wireSize: mainFeeder.wire.size.toString(),
        wireSets: mainFeeder.wire.runs,
        voltage: panel.voltage,
        systemType: is3PH ? "3PH" : "1PH",
      });
      
      circuits.forEach(c => {
         if (c.loadType === LoadType.SPACE || c.loadType === LoadType.SPARE) return;
         newCalcs.push({
            id: calculations.find(x => x.source === c.id)?.id || crypto.randomUUID(),
            source: c.id,
            name: c.description ? `Circuit ${c.circuitNo}: ${c.description}` : `Circuit ${c.circuitNo}`,
            loadA: c.loadA,
            length: getLength(c.id),
            wireSize: c.wireSize,
            wireSets: c.wireSets,
            voltage: c.voltage,
            systemType: (c.is3PhaseMarker !== undefined ? c.is3PhaseMarker : (c.phases && c.phases.length > 2)) ? "3PH" : "1PH",
         });
      });
    }

    allSubPanels.forEach(sp => {
      const { mainCurrent, mainFeeder } = computePanelScheduleValues(sp.panel, sp.circuits, { availableSubPanels: allSubPanels });
      const is3PH = sp.panel.system.includes("3PH");
      newCalcs.push({
        id: calculations.find(c => c.source === sp.id)?.id || crypto.randomUUID(),
        source: sp.id,
        name: `${sp.panel.designation || "Sub-Panel"} Feeder`,
        loadA: Number(mainCurrent.baseAmp.toFixed(2)),
        length: getLength(sp.id),
        wireSize: mainFeeder.wire.size.toString(),
        wireSets: mainFeeder.wire.runs,
        voltage: sp.panel.voltage,
        systemType: is3PH ? "3PH" : "1PH",
      });

      sp.circuits.forEach(c => {
         if (c.loadType === LoadType.SPACE || c.loadType === LoadType.SPARE) return;
         newCalcs.push({
            id: calculations.find(x => x.source === c.id)?.id || crypto.randomUUID(),
            source: c.id,
            name: c.description ? `Circuit ${c.circuitNo}: ${c.description}` : `Circuit ${c.circuitNo}`,
            loadA: c.loadA,
            length: getLength(c.id),
            wireSize: c.wireSize,
            wireSets: c.wireSets,
            voltage: c.voltage,
            systemType: (c.is3PhaseMarker !== undefined ? c.is3PhaseMarker : (c.phases && c.phases.length > 2)) ? "3PH" : "1PH",
         });
      });
    });

    // Check for changes
    let changed = false;
    if (newCalcs.length !== calculations.length) {
      changed = true;
    } else {
       for(let i=0; i<newCalcs.length; i++) {
          if (newCalcs[i].source !== calculations[i].source ||
              newCalcs[i].loadA !== calculations[i].loadA ||
              newCalcs[i].wireSize !== calculations[i].wireSize ||
              newCalcs[i].length !== calculations[i].length ||
              newCalcs[i].name !== calculations[i].name) {
             changed = true; break;
          }
       }
    }
    
    if (changed) {
       setCalculations(newCalcs);
    }
  }, [panel, circuits, allSubPanels]);

  const calculateVDAndCompliance = (calc: VoltageDropCalculation) => {
    const data =
      WIRE_IMPEDANCE_TABLE[calc.wireSize] || WIRE_IMPEDANCE_TABLE["3.5"];
    let R = data ? data.r : 5.76;
    
    const sets = calc.wireSets && calc.wireSets > 1 ? calc.wireSets : 1;
    R = R / sets;

    const factor = calc.systemType === "3PH" ? 1.732 : 2;
    const vd = (factor * calc.length * calc.loadA * R) / 1000;
    const vdPercentage = (vd / calc.voltage) * 100;

    const isMainFeeder = calc.source === "main";
    const isSubPanelFeeder = allSubPanels.some(sp => sp.id === calc.source);
    const isFeeder = isMainFeeder || isSubPanelFeeder || calc.name.toLowerCase().includes("feeder");
    const limit = isFeeder ? 5.0 : 3.0;

    return {
      vd: vd.toFixed(2),
      vdPercentage: vdPercentage.toFixed(2),
      isCompliant: vdPercentage <= limit,
      isWarning: vdPercentage > limit * 0.9 && vdPercentage <= limit,
      limit: limit,
    };
  };

  const activeCalculations = useMemo(() => {
    return calculations.map((c) => ({
      ...c,
      result: calculateVDAndCompliance(c),
    }));
  }, [calculations]);

  const handleUpdateCalculation = (
    id: string,
    updates: Partial<VoltageDropCalculation>,
  ) => {
    setCalculations(
      calculations.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    );
  };

  const togglePanel = (panelId: string) => {
    setExpandedPanels(prev => ({ ...prev, [panelId]: !prev[panelId] }));
  };

  // Group calculations by panel
  const panelGroups = useMemo(() => {
    const groups: {
      id: string;
      name: string;
      parentName?: string;
      type: string;
      feederCalc?: typeof activeCalculations[0];
      circuitCalcs: typeof activeCalculations;
      totalLoadA: number;
      totalLoadKVA: number;
    }[] = [];

    if (panel && circuits) {
      const { mainCurrent, totalVA } = computePanelScheduleValues(panel, circuits, { availableSubPanels: allSubPanels });
      const mainFeederCalc = activeCalculations.find(c => c.source === "main");
      const mainCircuits = activeCalculations.filter(c => circuits.some(circuit => circuit.id === c.source));
      
      groups.push({
        id: "main",
        name: panel.designation || "Main Distribution Panel",
        parentName: panel.utilityProvider || "Utility",
        type: panel.type || "MDP",
        feederCalc: mainFeederCalc,
        circuitCalcs: mainCircuits,
        totalLoadA: mainCurrent.baseAmp,
        totalLoadKVA: totalVA / 1000,
      });
    }

    allSubPanels.forEach(sp => {
      const { mainCurrent, totalVA } = computePanelScheduleValues(sp.panel, sp.circuits, { availableSubPanels: allSubPanels });
      const feederCalc = activeCalculations.find(c => c.source === sp.id);
      const circuitCalcs = activeCalculations.filter(c => sp.circuits.some(circuit => circuit.id === c.source));
      
      // Find parent by checking if any circuit in MDP or other subpanels links to this
      let parentName = panel?.designation || "MDP";
      if (circuits) {
         const linkingCircuit = circuits.find(c => c.linkedSubPanelId === sp.id);
         if (!linkingCircuit) {
            for (const otherSp of allSubPanels) {
               if (otherSp.circuits.some(c => c.linkedSubPanelId === sp.id)) {
                  parentName = otherSp.panel.designation || "Sub-Panel";
                  break;
               }
            }
         }
      }

      groups.push({
        id: sp.id,
        name: sp.panel.designation || "Sub-Panel",
        parentName,
        type: sp.panel.type || "DP",
        feederCalc,
        circuitCalcs,
        totalLoadA: mainCurrent.baseAmp,
        totalLoadKVA: totalVA / 1000,
      });
    });

    return groups;
  }, [panel, circuits, allSubPanels, activeCalculations]);

  const filteredGroups = useMemo(() => {
    return panelGroups.map(group => {
      const filterMatch = (calc: typeof activeCalculations[0]) => {
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          if (!calc.name.toLowerCase().includes(query) && !group.name.toLowerCase().includes(query)) {
            return false;
          }
        }
        if (statusFilter === "compliant" && !calc.result.isCompliant) return false;
        if (statusFilter === "critical" && calc.result.isCompliant) return false;
        if (statusFilter === "warning" && !calc.result.isWarning) return false;
        return true;
      };

      const matchedFeeder = group.feederCalc && filterMatch(group.feederCalc) ? group.feederCalc : undefined;
      const matchedCircuits = group.circuitCalcs.filter(filterMatch);

      return {
        ...group,
        feederCalc: matchedFeeder,
        circuitCalcs: matchedCircuits,
        visible: !!matchedFeeder || matchedCircuits.length > 0 || group.name.toLowerCase().includes(searchQuery.toLowerCase())
      };
    }).filter(g => g.visible);
  }, [panelGroups, searchQuery, statusFilter]);

  const getStatusColor = (isCompliant: boolean, isWarning?: boolean) => {
    if (!isCompliant) return "text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/30 dark:border-red-900/50";
    if (isWarning) return "text-yellow-600 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-950/30 dark:border-yellow-900/50";
    return "text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/30 dark:border-green-900/50";
  };

  const getStatusIcon = (isCompliant: boolean, isWarning?: boolean) => {
    if (!isCompliant) return <AlertTriangle className="w-3.5 h-3.5" />;
    if (isWarning) return <AlertTriangle className="w-3.5 h-3.5" />;
    return <Zap className="w-3.5 h-3.5" />;
  };

  const getStatusText = (isCompliant: boolean, isWarning?: boolean) => {
    if (!isCompliant) return "Critical";
    if (isWarning) return "Warning";
    return "Compliant";
  };

  const renderCalculationRow = (c: typeof activeCalculations[0], isFeeder = false) => (
    <tr
      key={c.id}
      className={`border-b border-slate-100 dark:border-slate-800 transition-colors last:border-0 font-medium ${isFeeder ? "bg-indigo-50/30 dark:bg-indigo-900/10 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}
    >
      <td className="p-3 text-slate-900 dark:text-slate-100 border-r border-slate-50 dark:border-slate-800 flex items-center gap-2">
        {isFeeder && <Layers className="w-4 h-4 text-indigo-500" />}
        <span className={isFeeder ? "font-bold text-indigo-900 dark:text-indigo-200" : ""}>{c.name}</span>
      </td>
      <td className="p-3 border-r border-slate-50 dark:border-slate-800">
        <input
          type="number"
          value={c.length}
          onChange={(e) => handleUpdateCalculation(c.id, { length: parseFloat(e.target.value) || 0 })}
          className="w-full bg-transparent outline-none font-bold text-indigo-700 dark:text-indigo-400 bg-white dark:bg-slate-950 px-2 py-1 border border-slate-200 dark:border-slate-700 rounded focus:border-indigo-500"
        />
      </td>
      <td className="p-3 text-slate-700 dark:text-slate-300">
        {c.loadA}
      </td>
      <td className="p-3 text-slate-700 dark:text-slate-300">
        {c.wireSets && c.wireSets > 1 ? `${c.wireSets}x ` : ""}{c.wireSize}
      </td>
      <td className="p-3 text-slate-700 dark:text-slate-300">
        {c.systemType}
      </td>
      <td className="p-3 text-slate-600 dark:text-slate-400">
        {c.result.vd}V
      </td>
      <td
        className={`p-3 font-bold ${!c.result.isCompliant ? "text-red-600 dark:text-red-400" : (c.result.isWarning ? "text-yellow-600 dark:text-yellow-400" : "text-green-600 dark:text-green-400")}`}
      >
        {c.result.vdPercentage}%
      </td>
      <td className="p-3 text-center font-bold text-slate-500 dark:text-slate-400">
        {c.result.limit}%
      </td>
      <td className="p-3 text-center">
        <span className="inline-flex justify-center">
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${getStatusColor(c.result.isCompliant, c.result.isWarning)}`}>
            {getStatusIcon(c.result.isCompliant, c.result.isWarning)} {getStatusText(c.result.isCompliant, c.result.isWarning)}
          </span>
        </span>
      </td>
    </tr>
  );

  return (
    <div className="w-full max-w-full space-y-6">
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-8 panel-container">
        <div className="w-full border-b-2 border-slate-100 dark:border-slate-800 pb-6 mb-8 flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4">
          <div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter">
              Voltage Drop Analysis
            </h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase">
              Categorized by Panel Hierarchy
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Search panels or circuits..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="px-3 py-1.5 bg-transparent border-none outline-none text-sm w-full sm:w-48 text-slate-700 dark:text-slate-200"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 w-full sm:w-auto"
            >
              <option value="all">All Status</option>
              <option value="compliant">Compliant</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
            <button
              onClick={() => {
                if (!isPremium) {
                  if (onRequestUpgrade) onRequestUpgrade();
                  return;
                }
                exportToCAD(
                  panel!,
                  circuits || [],
                  allSubPanels,
                  {} as any,
                  "VOLTAGE_DROP",
                  calculations,
                );
              }}
              className={`flex items-center justify-center gap-2 px-4 py-2 font-bold rounded-lg text-xs transition border w-full sm:w-auto ${
                isPremium
                  ? "bg-slate-800 text-white hover:bg-slate-700 hover:text-white border-slate-700/50 cursor-pointer"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 cursor-pointer"
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>{isPremium ? "Export AutoCAD Drawing" : "Export AutoCAD (Premium)"}</span>
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {filteredGroups.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
              No matching calculations found.
            </div>
          ) : (
            filteredGroups.map(group => {
              const allGroupCalcs = [...(group.feederCalc ? [group.feederCalc] : []), ...group.circuitCalcs];
              const maxVd = allGroupCalcs.length > 0 ? Math.max(...allGroupCalcs.map(c => parseFloat(c.result.vdPercentage))) : 0;
              const hasCritical = allGroupCalcs.some(c => !c.result.isCompliant);
              const hasWarning = allGroupCalcs.some(c => c.result.isWarning);
              const isExpanded = expandedPanels[group.id];

              return (
                <div key={group.id} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                  {/* Panel Header (Collapsible) */}
                  <div 
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/80 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    onClick={() => togglePanel(group.id)}
                  >
                    <div className="flex items-center gap-3">
                      <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-900 dark:text-slate-100 text-lg uppercase tracking-tight">{group.name}</h4>
                          <span className="text-xs px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded font-semibold">{group.type}</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Fed from: <span className="text-slate-700 dark:text-slate-300">{group.parentName}</span></p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6 mt-3 sm:mt-0 ml-8 sm:ml-0">
                      <div className="text-right hidden sm:block">
                        <p className="text-[10px] uppercase font-bold text-slate-400">Total Load</p>
                        <p className="font-mono font-bold text-slate-700 dark:text-slate-200">{group.totalLoadA.toFixed(1)} A</p>
                      </div>
                      <div className="text-right hidden md:block">
                        <p className="text-[10px] uppercase font-bold text-slate-400">Connected</p>
                        <p className="font-mono font-bold text-slate-700 dark:text-slate-200">{group.totalLoadKVA.toFixed(2)} kVA</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase font-bold text-slate-400">Max VD</p>
                        <p className={`font-mono font-bold ${hasCritical ? "text-red-600 dark:text-red-400" : (hasWarning ? "text-yellow-600 dark:text-yellow-400" : "text-green-600 dark:text-green-400")}`}>{maxVd.toFixed(2)}%</p>
                      </div>
                      <div className="min-w-[100px] text-right">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${getStatusColor(!hasCritical, hasWarning)}`}>
                          {getStatusIcon(!hasCritical, hasWarning)} {getStatusText(!hasCritical, hasWarning)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t border-slate-200 dark:border-slate-700 overflow-x-auto">
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead>
                          <tr className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wider">
                            <th className="p-3">Circuit / Designation</th>
                            <th className="p-3 w-24">Length (m)</th>
                            <th className="p-3 w-20">Load (A)</th>
                            <th className="p-3 w-24">Wire (mm²)</th>
                            <th className="p-3 w-20">System</th>
                            <th className="p-3 w-20">VD (V)</th>
                            <th className="p-3 w-20">VD (%)</th>
                            <th className="p-3 w-20 text-center">Limit (%)</th>
                            <th className="p-3 w-24 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.feederCalc && renderCalculationRow(group.feederCalc, true)}
                          {group.circuitCalcs.map(c => renderCalculationRow(c, false))}
                          {!group.feederCalc && group.circuitCalcs.length === 0 && (
                            <tr>
                              <td colSpan={9} className="p-6 text-center text-slate-400 italic font-medium">No circuits to display for this panel.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Calculations & Formulas Section */}
      <section className="hidden print-show mt-12 bg-white rounded-2xl border-2 border-slate-800 p-8">
        <div className="flex items-center gap-2 mb-6">
          <Calculator className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-widest">
            Calculations & Formulas
          </h2>
        </div>

        <div className="space-y-6 text-sm text-slate-700">
          <div>
            <h3 className="font-bold text-slate-900 mb-2">1. Resistance of Wire (R)</h3>
            <p className="mb-2">
              The resistance depends on the conductor material (Copper = 1.724 × 10^-8 Ω·m) and length, converted for standard NEC/PEC calculations using specific resistance K (K = 3.56 for Copper in ohms per km/mm²).
            </p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200">
              R = K / Area (mm²)
            </div>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-2">2. Single-Phase vs Three-Phase Voltage Drop</h3>
            <p className="mb-2">
              The voltage drop equation compensates for single-phase (2 wires) or three-phase (√3) system parameters in accordance with PEC.
            </p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200 flex flex-col gap-2">
              <span>{`VD (1-Phase) = (2 × K × I × L) / Area`}</span>
              <span>{`VD (3-Phase) = (√3 × K × I × L) / Area`}</span>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-2">3. Voltage Drop Percentage</h3>
            <p className="mb-2">
              Article 2.10.2.1(A) FPN No. 4 of the Philippine Electrical Code (PEC) 2017 recommends that the maximum voltage drop for branch circuits does not exceed 3%, and the total voltage drop for feeders and branch circuits does not exceed 5%.
            </p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200 flex flex-col gap-2">
              <span>{`VD (%) = (Actual Voltage Drop / Source Voltage) × 100`}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
