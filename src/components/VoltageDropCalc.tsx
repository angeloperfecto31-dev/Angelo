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
  GitFork,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Info,
  Sliders,
  Move,
  X,
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
  isExporting?: boolean;
  transformerPrimaryVoltage?: number;
  iscParams?: any;
  setIscParams?: React.Dispatch<React.SetStateAction<any>>;
  setTransformerPrimaryVoltage?: (v: number) => void;
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
  isExporting = false,
  transformerPrimaryVoltage = 34500,
  iscParams,
  setIscParams,
  setTransformerPrimaryVoltage,
}: VoltageDropCalcProps) {
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({ main: true });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<"table" | "sld">("table");
  const [selectedEndpointId, setSelectedEndpointId] = useState<string>("main");
  const [zoom, setZoom] = useState<number>(0.85);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 50, y: 30 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [nodeOffsets, setNodeOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const [selectedElement, setSelectedElement] = useState<any>(null);
  const [hoveredElement, setHoveredElement] = useState<any>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);

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

    const getWireSize = (sourceId: string, defaultSize: string) => {
      const existing = calculations.find(c => c.source === sourceId);
      return existing && existing.wireSize ? existing.wireSize : defaultSize;
    };

    const getWireSets = (sourceId: string, defaultSets: number) => {
      const existing = calculations.find(c => c.source === sourceId);
      return existing && existing.wireSets !== undefined ? existing.wireSets : defaultSets;
    };

    const getVoltage = (sourceId: string, defaultVolt: number) => {
      const existing = calculations.find(c => c.source === sourceId);
      return existing && existing.voltage !== undefined ? existing.voltage : defaultVolt;
    };

    const getSystemType = (sourceId: string, defaultSys: "1PH" | "3PH") => {
      const existing = calculations.find(c => c.source === sourceId);
      return existing && existing.systemType ? existing.systemType : defaultSys;
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
        wireSize: getWireSize("main", mainFeeder.wire.size.toString()),
        wireSets: getWireSets("main", mainFeeder.wire.runs),
        voltage: getVoltage("main", panel.voltage || 230),
        systemType: getSystemType("main", is3PH ? "3PH" : "1PH"),
      });
      
      circuits.forEach(c => {
         if (c.loadType === LoadType.SPACE || c.loadType === LoadType.SPARE) return;
         newCalcs.push({
            id: calculations.find(x => x.source === c.id)?.id || crypto.randomUUID(),
            source: c.id,
            name: c.description ? `Circuit ${c.circuitNo}: ${c.description}` : `Circuit ${c.circuitNo}`,
            loadA: c.loadA,
            length: getLength(c.id),
            wireSize: getWireSize(c.id, c.wireSize),
            wireSets: getWireSets(c.id, c.wireSets || c.calculatedWireSets || 1),
            voltage: getVoltage(c.id, c.voltage || panel.voltage || 230),
            systemType: getSystemType(c.id, (c.is3PhaseMarker !== undefined ? c.is3PhaseMarker : (c.phases && c.phases.length > 2)) ? "3PH" : "1PH"),
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
        wireSize: getWireSize(sp.id, mainFeeder.wire.size.toString()),
        wireSets: getWireSets(sp.id, mainFeeder.wire.runs),
        voltage: getVoltage(sp.id, sp.panel.voltage || panel.voltage || 230),
        systemType: getSystemType(sp.id, is3PH ? "3PH" : "1PH"),
      });

      sp.circuits.forEach(c => {
         if (c.loadType === LoadType.SPACE || c.loadType === LoadType.SPARE) return;
         newCalcs.push({
            id: calculations.find(x => x.source === c.id)?.id || crypto.randomUUID(),
            source: c.id,
            name: c.description ? `Circuit ${c.circuitNo}: ${c.description}` : `Circuit ${c.circuitNo}`,
            loadA: c.loadA,
            length: getLength(c.id),
            wireSize: getWireSize(c.id, c.wireSize),
            wireSets: getWireSets(c.id, c.wireSets || c.calculatedWireSets || 1),
            voltage: getVoltage(c.id, c.voltage || sp.panel.voltage || panel.voltage || 230),
            systemType: getSystemType(c.id, (c.is3PhaseMarker !== undefined ? c.is3PhaseMarker : (c.phases && c.phases.length > 2)) ? "3PH" : "1PH"),
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
              newCalcs[i].wireSets !== calculations[i].wireSets ||
              newCalcs[i].voltage !== calculations[i].voltage ||
              newCalcs[i].systemType !== calculations[i].systemType ||
              newCalcs[i].length !== calculations[i].length ||
              newCalcs[i].name !== calculations[i].name) {
             changed = true; break;
          }
       }
    }
    
    if (changed) {
       setCalculations(newCalcs);
    }
  }, [panel, circuits, allSubPanels, transformerPrimaryVoltage]);

  const getConductorMaterialForCalculation = (calc: VoltageDropCalculation) => {
    if (calc.source === "main") {
      return panel?.conductorMaterial || "Copper";
    }
    const subPanel = allSubPanels.find(sp => sp.id === calc.source);
    if (subPanel) {
      return subPanel.panel?.conductorMaterial || "Copper";
    }
    if (circuits?.some(c => c.id === calc.source)) {
      return panel?.conductorMaterial || "Copper";
    }
    const spWithCircuit = allSubPanels.find(sp => sp.circuits.some(c => c.id === calc.source));
    if (spWithCircuit) {
      return spWithCircuit.panel?.conductorMaterial || "Copper";
    }
    return "Copper";
  };

  const getInsulationTypeForCalculation = (calc: VoltageDropCalculation) => {
    if (calc.source === "main") {
      return panel?.insulationType || "THHN";
    }
    const subPanel = allSubPanels.find(sp => sp.id === calc.source);
    if (subPanel) {
      return subPanel.panel?.insulationType || "THHN";
    }
    if (circuits?.some(c => c.id === calc.source)) {
      return panel?.insulationType || "THHN";
    }
    const spWithCircuit = allSubPanels.find(sp => sp.circuits.some(c => c.id === calc.source));
    if (spWithCircuit) {
      return spWithCircuit.panel?.insulationType || "THHN";
    }
    return "THHN";
  };

  const calculateVDAndCompliance = (calc: VoltageDropCalculation) => {
    const data =
      WIRE_IMPEDANCE_TABLE[calc.wireSize] || WIRE_IMPEDANCE_TABLE["3.5"];
    let R = data ? data.r : 5.76;
    
    // Apply Aluminum 1.64 resistivity factor in accordance with PEC/NEC
    const material = getConductorMaterialForCalculation(calc);
    if (material === "Aluminum") {
      R = R * 1.64;
    }

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
  }, [calculations, panel, circuits, allSubPanels]);

  const handleUpdateCalculation = (
    id: string,
    updates: Partial<VoltageDropCalculation>,
  ) => {
    setCalculations(
      calculations.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    );
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

  const togglePanel = (panelId: string) => {
    setExpandedPanels(prev => ({ ...prev, [panelId]: !prev[panelId] }));
  };

  // Helper to find parent panel ID
  const getParentPanelId = (panelId: string): string | null => {
    if (panelId === "main") return null;
    if (circuits && circuits.some(c => c.linkedSubPanelId === panelId)) {
      return "main";
    }
    if (subPanels) {
      for (const sp of subPanels) {
        if (sp.circuits.some(c => c.linkedSubPanelId === panelId)) {
          return sp.id;
        }
      }
    }
    if (subSubPanels) {
      for (const ssp of subSubPanels) {
        if (ssp.circuits.some(c => c.linkedSubPanelId === panelId)) {
          return ssp.id;
        }
      }
    }
    return "main";
  };

  // Helper to find a panel's hierarchical level (MDP is 1, subpanel is 2, etc.)
  const getPanelLevel = (panelId: string): number => {
    if (panelId === "main") return 1;
    let currentId = panelId;
    let level = 1;
    const visited = new Set<string>();
    while (currentId !== "main") {
      if (visited.has(currentId)) break;
      visited.add(currentId);
      const parent = getParentPanelId(currentId);
      if (!parent) break;
      currentId = parent;
      level++;
    }
    return level;
  };

  // Helper to trace path calculations from root to a specific source circuit
  const getPathCalculations = (sourceId: string): typeof activeCalculations => {
    const pathCalcs: typeof activeCalculations = [];
    let currentSource: string | null = sourceId;
    const visited = new Set<string>();

    while (currentSource) {
      if (visited.has(currentSource)) break;
      visited.add(currentSource);

      const calc = activeCalculations.find(c => c.source === currentSource);
      if (calc) {
        pathCalcs.unshift(calc);
      }

      if (currentSource === "main") {
        currentSource = null;
      } else {
        const inMdpCircuit = circuits?.find(c => c.id === currentSource);
        if (inMdpCircuit) {
          currentSource = "main";
        } else {
          let foundParent: string | null = null;
          if (subPanels) {
            for (const sp of subPanels) {
              if (sp.circuits.some(c => c.id === currentSource)) {
                foundParent = sp.id;
                break;
              }
            }
          }
          if (!foundParent && subSubPanels) {
            for (const ssp of subSubPanels) {
              if (ssp.circuits.some(c => c.id === currentSource)) {
                foundParent = ssp.id;
                break;
              }
            }
          }

          if (foundParent) {
            currentSource = foundParent;
          } else {
            currentSource = getParentPanelId(currentSource);
          }
        }
      }
    }

    return pathCalcs;
  };

  // Calculate cumulative voltage drop from utility to any node
  const getCumulativeVD = (sourceId: string) => {
    const pathCalcs = getPathCalculations(sourceId);
    const totalVd = pathCalcs.reduce((sum, c) => sum + parseFloat(c.result.vd), 0);
    const totalVdPercent = pathCalcs.reduce((sum, c) => sum + parseFloat(c.result.vdPercentage), 0);
    return {
      vd: totalVd.toFixed(2),
      vdPercentage: totalVdPercent.toFixed(2),
      path: pathCalcs
    };
  };

  // Dynamic layout generator for SVG diagram nodes
  const diagramNodes = useMemo(() => {
    if (!panel) return [];

    const nodes: Array<{
      id: string;
      type: "utility" | "transformer" | "panel" | "circuit";
      label: string;
      initialX: number;
      initialY: number;
      data?: any;
      calc?: any;
      cumResult?: any;
    }> = [];

    // 1. Utility Grid
    nodes.push({
      id: "utility",
      type: "utility",
      label: "Utility Grid Connection",
      initialX: 250,
      initialY: 60,
      data: {
        voltage: panel.voltage,
        system: panel.system,
        provider: panel.utilityProvider || "Utility Grid"
      }
    });

    // 2. Transformer
    nodes.push({
      id: "transformer",
      type: "transformer",
      label: "Main Transformer",
      initialX: 250,
      initialY: 180,
      data: {
        voltage: panel.voltage,
        system: panel.system,
        primaryVoltage: iscParams?.primaryVoltage ?? transformerPrimaryVoltage ?? 13800,
        transformerZ: iscParams?.transformerZ ?? 5.0,
      }
    });

    // 3. MDP Node (Level 1)
    const mainFeederCalc = activeCalculations.find(c => c.source === "main");
    const mainCum = getCumulativeVD("main");
    const mdpGroup = panelGroups.find(g => g.id === "main");
    nodes.push({
      id: "panel-main",
      type: "panel",
      label: panel.designation || "Main Panel (MDP)",
      initialX: 250,
      initialY: 340,
      calc: mainFeederCalc,
      cumResult: mainCum,
      data: {
        id: "main",
        panelConfig: panel,
        type: panel.type || "MDP",
        totalLoadA: mdpGroup?.totalLoadA || 0,
        totalLoadKVA: mdpGroup?.totalLoadKVA || 0,
      }
    });

    // 4. Subpanels
    allSubPanels.forEach((sp, idx) => {
      const level = getPanelLevel(sp.id);
      const spFeederCalc = activeCalculations.find(c => c.source === sp.id);
      const spCum = getCumulativeVD(sp.id);
      const spGroup = panelGroups.find(g => g.id === sp.id);
      
      nodes.push({
        id: `panel-${sp.id}`,
        type: "panel",
        label: sp.panel.designation || "Sub-Panel",
        initialX: 750 + idx * 520,
        initialY: 340 + (level - 1) * 360,
        calc: spFeederCalc,
        cumResult: spCum,
        data: {
          id: sp.id,
          panelConfig: sp.panel,
          type: sp.panel.type || "DP",
          totalLoadA: spGroup?.totalLoadA || 0,
          totalLoadKVA: spGroup?.totalLoadKVA || 0,
        }
      });
    });

    // 5. Branch Circuits of MDP (excluding subpanels)
    const mdpRegCircuits = circuits ? circuits.filter(c => !c.linkedSubPanelId && c.loadType !== LoadType.SPACE && c.loadType !== LoadType.SPARE) : [];
    const mdpNum = mdpRegCircuits.length;
    mdpRegCircuits.forEach((c, i) => {
      const cCalc = activeCalculations.find(x => x.source === c.id);
      const cCum = getCumulativeVD(c.id);
      const offsetLeft = -((mdpNum - 1) * 180) / 2;
      
      nodes.push({
        id: `circuit-${c.id}`,
        type: "circuit",
        label: c.description || `Circuit ${c.circuitNo}`,
        initialX: 250 + offsetLeft + i * 180,
        initialY: 550,
        calc: cCalc,
        cumResult: cCum,
        data: {
          id: c.id,
          circuit: c,
          panelId: "main"
        }
      });
    });

    // 6. Branch Circuits of Subpanels (excluding subpanels)
    allSubPanels.forEach((sp, idx) => {
      const level = getPanelLevel(sp.id);
      const spRegCircuits = sp.circuits.filter(c => !c.linkedSubPanelId && c.loadType !== LoadType.SPACE && c.loadType !== LoadType.SPARE);
      const spNum = spRegCircuits.length;
      
      const panelX = 750 + idx * 520;
      const panelY = 340 + (level - 1) * 360;
      
      spRegCircuits.forEach((c, i) => {
        const cCalc = activeCalculations.find(x => x.source === c.id);
        const cCum = getCumulativeVD(c.id);
        const offsetLeft = -((spNum - 1) * 180) / 2;
        
        nodes.push({
          id: `circuit-${c.id}`,
          type: "circuit",
          label: c.description || `Circuit ${c.circuitNo}`,
          initialX: panelX + offsetLeft + i * 180,
          initialY: panelY + 220,
          calc: cCalc,
          cumResult: cCum,
          data: {
            id: c.id,
            circuit: c,
            panelId: sp.id
          }
        });
      });
    });

    return nodes;
  }, [panel, circuits, allSubPanels, activeCalculations, panelGroups, transformerPrimaryVoltage, iscParams]);

  const positionsMap = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {};
    diagramNodes.forEach(n => {
      const ox = nodeOffsets[n.id]?.x || 0;
      const oy = nodeOffsets[n.id]?.y || 0;
      map[n.id] = {
        x: n.initialX + ox,
        y: n.initialY + oy
      };
    });
    return map;
  }, [diagramNodes, nodeOffsets]);

  const diagramConnections = useMemo(() => {
    const connections: Array<{
      id: string;
      from: { x: number; y: number };
      to: { x: number; y: number };
      calc?: any;
      cumResult?: any;
      name: string;
      cableInfo: string;
      current: number;
      length: number;
      vdVal: string;
      vdPct: string;
      isFeeder: boolean;
    }> = [];

    if (diagramNodes.length === 0) return [];

    const getPos = (nodeId: string) => positionsMap[nodeId] || { x: 0, y: 0 };

    // Utility -> Transformer
    const uPos = getPos("utility");
    const tPos = getPos("transformer");
    const mdpGroup = panelGroups.find(g => g.id === "main");
    connections.push({
      id: "util-trans",
      from: { x: uPos.x, y: uPos.y + 50 },
      to: { x: tPos.x, y: tPos.y - 50 },
      name: "Primary Grid Feeder",
      cableInfo: "Utility Standard Line",
      current: mdpGroup?.totalLoadA || 0,
      length: 0,
      vdVal: "0.00",
      vdPct: "0.00",
      isFeeder: true
    });

    // Transformer -> MDP
    const mdpPos = getPos("panel-main");
    const mdpFeederCalc = activeCalculations.find(c => c.source === "main");
    connections.push({
      id: "trans-mdp",
      from: { x: tPos.x, y: tPos.y + 50 },
      to: { x: mdpPos.x, y: mdpPos.y - 65 },
      calc: mdpFeederCalc,
      cumResult: getCumulativeVD("main"),
      name: "Main Feeder Cable",
      cableInfo: mdpFeederCalc ? `${mdpFeederCalc.wireSets && mdpFeederCalc.wireSets > 1 ? mdpFeederCalc.wireSets + "x " : ""}${mdpFeederCalc.wireSize} mm²` : "Unknown",
      current: mdpFeederCalc?.loadA || 0,
      length: mdpFeederCalc?.length || 0,
      vdVal: mdpFeederCalc?.result.vd || "0.00",
      vdPct: mdpFeederCalc?.result.vdPercentage || "0.00",
      isFeeder: true
    });

    // MDP -> Subpanels
    allSubPanels.forEach(sp => {
      const spPos = getPos(`panel-${sp.id}`);
      const parentId = getParentPanelId(sp.id);
      const parentKey = parentId === "main" ? "panel-main" : `panel-${parentId}`;
      const parentPos = getPos(parentKey);
      const spFeederCalc = activeCalculations.find(c => c.source === sp.id);

      connections.push({
        id: `link-${sp.id}`,
        from: { x: parentPos.x, y: parentPos.y + 65 },
        to: { x: spPos.x, y: spPos.y - 65 },
        calc: spFeederCalc,
        cumResult: getCumulativeVD(sp.id),
        name: `${sp.panel.designation || "Sub-Panel"} Feeder`,
        cableInfo: spFeederCalc ? `${spFeederCalc.wireSets && spFeederCalc.wireSets > 1 ? spFeederCalc.wireSets + "x " : ""}${spFeederCalc.wireSize} mm²` : "Unknown",
        current: spFeederCalc?.loadA || 0,
        length: spFeederCalc?.length || 0,
        vdVal: spFeederCalc?.result.vd || "0.00",
        vdPct: spFeederCalc?.result.vdPercentage || "0.00",
        isFeeder: true
      });
    });

    // MDP branch circuits
    const mdpRegCircuits = circuits ? circuits.filter(c => !c.linkedSubPanelId && c.loadType !== LoadType.SPACE && c.loadType !== LoadType.SPARE) : [];
    mdpRegCircuits.forEach(c => {
      const cPos = getPos(`circuit-${c.id}`);
      const cCalc = activeCalculations.find(x => x.source === c.id);

      connections.push({
        id: `link-circuit-${c.id}`,
        from: { x: mdpPos.x, y: mdpPos.y + 65 },
        to: { x: cPos.x, y: cPos.y - 50 },
        calc: cCalc,
        cumResult: getCumulativeVD(c.id),
        name: c.description || `Circuit ${c.circuitNo}`,
        cableInfo: cCalc ? `${cCalc.wireSets && cCalc.wireSets > 1 ? cCalc.wireSets + "x " : ""}${cCalc.wireSize} mm²` : "Unknown",
        current: c.loadA || 0,
        length: cCalc?.length || 0,
        vdVal: cCalc?.result.vd || "0.00",
        vdPct: cCalc?.result.vdPercentage || "0.00",
        isFeeder: false
      });
    });

    // Subpanel branch circuits
    allSubPanels.forEach(sp => {
      const spPos = getPos(`panel-${sp.id}`);
      const spRegCircuits = sp.circuits.filter(c => !c.linkedSubPanelId && c.loadType !== LoadType.SPACE && c.loadType !== LoadType.SPARE);

      spRegCircuits.forEach(c => {
        const cPos = getPos(`circuit-${c.id}`);
        const cCalc = activeCalculations.find(x => x.source === c.id);

        connections.push({
          id: `link-circuit-${c.id}`,
          from: { x: spPos.x, y: spPos.y + 65 },
          to: { x: cPos.x, y: cPos.y - 50 },
          calc: cCalc,
          cumResult: getCumulativeVD(c.id),
          name: c.description || `Circuit ${c.circuitNo}`,
          cableInfo: cCalc ? `${cCalc.wireSets && cCalc.wireSets > 1 ? cCalc.wireSets + "x " : ""}${cCalc.wireSize} mm²` : "Unknown",
          current: c.loadA || 0,
          length: cCalc?.length || 0,
          vdVal: cCalc?.result.vd || "0.00",
          vdPct: cCalc?.result.vdPercentage || "0.00",
          isFeeder: false
        });
      });
    });

    return connections;
  }, [positionsMap, activeCalculations, allSubPanels, circuits, panelGroups]);

  // Handle Drag Pointer Down
  const handleNodePointerDown = (nodeId: string, e: React.PointerEvent) => {
    e.stopPropagation();
    setDraggingNode(nodeId);
    setDragStart({ x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  // Handle Drag Pointer Move
  const handleNodePointerMove = (nodeId: string, e: React.PointerEvent) => {
    if (draggingNode !== nodeId) return;
    e.stopPropagation();
    const dx = (e.clientX - dragStart.x) / zoom;
    const dy = (e.clientY - dragStart.y) / zoom;
    if (dx !== 0 || dy !== 0) {
      setNodeOffsets(prev => ({
        ...prev,
        [nodeId]: {
          x: (prev[nodeId]?.x || 0) + dx,
          y: (prev[nodeId]?.y || 0) + dy
        }
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  // Handle Drag Pointer Up
  const handleNodePointerUp = (nodeId: string, e: React.PointerEvent) => {
    if (draggingNode === nodeId) {
      e.stopPropagation();
      setDraggingNode(null);
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  // Background Canvas Pointer down for panning
  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // Left click only
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent) => {
    if (isPanning) {
      setIsPanning(false);
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.08;
    let newZoom = zoom;
    if (e.deltaY < 0) {
      newZoom = Math.min(2.0, zoom * zoomFactor);
    } else {
      newZoom = Math.max(0.3, zoom / zoomFactor);
    }
    setZoom(newZoom);
  };

  const getCircuitForSource = (sourceId: string) => {
    if (circuits) {
      const c = circuits.find(x => x.id === sourceId);
      if (c) return c;
    }
    for (const sp of allSubPanels) {
      const c = sp.circuits.find(x => x.id === sourceId);
      if (c) return c;
    }
    return null;
  };

  const resetView = () => {
    setZoom(0.85);
    setPan({ x: 50, y: 30 });
    setNodeOffsets({});
  };

  // Path Tracing & Endpoints for the Automatic Feeder Cascade Diagram
  const pathEndpoints = useMemo(() => {
    const list: Array<{ id: string; name: string; type: string }> = [];

    // 1. Main Panel (MDP)
    list.push({
      id: "main",
      name: `${panel?.designation || "Main Distribution Panel"} (MDP) Feeder`,
      type: "panel",
    });

    // 2. MDP Branch Circuits (that are not subpanels themselves)
    if (circuits) {
      circuits.forEach(c => {
        if (c.loadType === LoadType.SPACE || c.loadType === LoadType.SPARE) return;
        if (c.linkedSubPanelId) return; // covered by subpanel option
        list.push({
          id: c.id,
          name: `MDP Circuit ${c.circuitNo}: ${c.description || "Branch Load"}`,
          type: "circuit",
        });
      });
    }

    // 3. Subpanels and their branch circuits
    allSubPanels.forEach(sp => {
      list.push({
        id: sp.id,
        name: `${sp.panel.designation || "Subpanel"} Feeder`,
        type: "panel",
      });

      sp.circuits.forEach(c => {
        if (c.loadType === LoadType.SPACE || c.loadType === LoadType.SPARE) return;
        list.push({
          id: c.id,
          name: `${sp.panel.designation || "Subpanel"} Circuit ${c.circuitNo}: ${c.description || "Branch Load"}`,
          type: "circuit",
        });
      });
    });

    return list;
  }, [panel, circuits, allSubPanels]);

  const selectedPathSegments = useMemo(() => {
    const path: Array<{
      id: string;
      fromName: string;
      toName: string;
      calc: typeof activeCalculations[0];
      type: "feeder" | "branch";
    }> = [];

    if (!selectedEndpointId) return path;

    // Helper to find a calculation
    const getCalc = (sourceId: string) => activeCalculations.find(c => c.source === sourceId);

    // If "main" is selected, the path is just Utility -> MDP
    if (selectedEndpointId === "main") {
      const mainCalc = getCalc("main");
      if (mainCalc) {
        path.push({
          id: "segment-main",
          fromName: "SERVICE ENTRANCE",
          toName: panel?.designation || "MDP",
          calc: mainCalc,
          type: "feeder",
        });
      }
      return path;
    }

    // Check if selectedEndpointId is a subpanel
    const matchedSp = allSubPanels.find(sp => sp.id === selectedEndpointId);
    if (matchedSp) {
      // Path is Service Entrance -> MDP -> Subpanel
      const mainCalc = getCalc("main");
      if (mainCalc) {
        path.push({
          id: "segment-main",
          fromName: "SERVICE ENTRANCE",
          toName: panel?.designation || "MDP",
          calc: mainCalc,
          type: "feeder",
        });
      }

      const spCalc = getCalc(matchedSp.id);
      if (spCalc) {
        // Find parent panel name
        let parentName = panel?.designation || "MDP";
        if (circuits) {
          const linkingCircuit = circuits.find(c => c.linkedSubPanelId === matchedSp.id);
          if (linkingCircuit) {
            parentName = panel?.designation || "MDP";
          } else {
            for (const otherSp of allSubPanels) {
              if (otherSp.circuits.some(c => c.linkedSubPanelId === matchedSp.id)) {
                parentName = otherSp.panel.designation || "Subpanel";
                break;
              }
            }
          }
        }
        path.push({
          id: `segment-${matchedSp.id}`,
          fromName: parentName,
          toName: matchedSp.panel.designation || "Subpanel",
          calc: spCalc,
          type: "feeder",
        });
      }
      return path;
    }

    // Check if selectedEndpointId is a branch circuit on MDP
    const mdpCircuit = circuits?.find(c => c.id === selectedEndpointId);
    if (mdpCircuit) {
      const mainCalc = getCalc("main");
      if (mainCalc) {
        path.push({
          id: "segment-main",
          fromName: "SERVICE ENTRANCE",
          toName: panel?.designation || "MDP",
          calc: mainCalc,
          type: "feeder",
        });
      }

      const circuitCalc = getCalc(mdpCircuit.id);
      if (circuitCalc) {
        path.push({
          id: `segment-${mdpCircuit.id}`,
          fromName: panel?.designation || "MDP",
          toName: mdpCircuit.description ? `${mdpCircuit.description}` : `Circuit ${mdpCircuit.circuitNo} Endpoint`,
          calc: circuitCalc,
          type: "branch",
        });
      }
      return path;
    }

    // Check if selectedEndpointId is a branch circuit on a subpanel
    for (const sp of allSubPanels) {
      const spCircuit = sp.circuits.find(c => c.id === selectedEndpointId);
      if (spCircuit) {
        // Path is Service Entrance -> MDP -> Subpanel Feeder -> Subpanel -> Branch Circuit
        const mainCalc = getCalc("main");
        if (mainCalc) {
          path.push({
            id: "segment-main",
            fromName: "SERVICE ENTRANCE",
            toName: panel?.designation || "MDP",
            calc: mainCalc,
            type: "feeder",
          });
        }

        const spCalc = getCalc(sp.id);
        if (spCalc) {
          let parentName = panel?.designation || "MDP";
          path.push({
            id: `segment-${sp.id}`,
            fromName: parentName,
            toName: sp.panel.designation || "Subpanel",
            calc: spCalc,
            type: "feeder",
          });
        }

        const circuitCalc = getCalc(spCircuit.id);
        if (circuitCalc) {
          path.push({
            id: `segment-${spCircuit.id}`,
            fromName: sp.panel.designation || "Subpanel",
            toName: spCircuit.description ? `${spCircuit.description}` : `Circuit ${spCircuit.circuitNo} Endpoint`,
            calc: circuitCalc,
            type: "branch",
          });
        }
        return path;
      }
    }

    return path;
  }, [selectedEndpointId, activeCalculations, panel, circuits, allSubPanels]);

  const cumulativeVdVolts = useMemo(() => {
    return selectedPathSegments.reduce((sum, s) => sum + parseFloat(s.calc.result.vd), 0);
  }, [selectedPathSegments]);

  const cumulativeVdPercent = useMemo(() => {
    return selectedPathSegments.reduce((sum, s) => sum + parseFloat(s.calc.result.vdPercentage), 0);
  }, [selectedPathSegments]);

  const isPathCompliant = useMemo(() => {
    const hasFeederViolation = selectedPathSegments
      .filter(s => s.type === "feeder")
      .some(s => parseFloat(s.calc.result.vdPercentage) > 3.0);
    const hasCumulativeViolation = cumulativeVdPercent > 5.0;
    return !hasFeederViolation && !hasCumulativeViolation;
  }, [selectedPathSegments, cumulativeVdPercent]);

  const serviceEntranceLabel = useMemo(() => {
    const systemVoltage = panel?.voltage || 230;
    const systemPhase = panel?.system?.includes("3PH") ? "3Ø" : "1Ø";
    return `${systemVoltage}V, ${systemPhase}, 60Hz`;
  }, [panel]);

  const nodePositions = useMemo(() => {
    const numNodes = selectedPathSegments.length + 1;
    const startX = 120;
    const endX = 800;
    const stepX = (endX - startX) / (numNodes - 1 || 1);
    return Array.from({ length: numNodes }, (_, i) => startX + i * stepX);
  }, [selectedPathSegments]);

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
        {c.wireSets && c.wireSets > 1 ? `${c.wireSets}x ` : ""}{c.wireSize} mm² {getConductorMaterialForCalculation(c) === "Copper" ? "CU" : "AL"} {getInsulationTypeForCalculation(c)}
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
              Categorized by Panel Hierarchy & Diagrams
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
                  undefined,
                  selectedEndpointId
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

        {/* View Switcher Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6 font-semibold text-sm">
          <button
            onClick={() => setActiveTab("table")}
            className={`px-5 py-2.5 border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "table"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            }`}
          >
            <Calculator className="w-4 h-4" />
            <span>Calculation Tables</span>
          </button>
          <button
            onClick={() => setActiveTab("sld")}
            className={`px-5 py-2.5 border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "sld"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            }`}
          >
            <GitFork className="w-4 h-4 rotate-90" />
            <span>Feeder Cascade Diagram (SLD)</span>
            <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.5 rounded text-[9px] uppercase font-black tracking-wider">
              New
            </span>
          </button>
        </div>

        <div className={activeTab === "table" || isExporting ? "space-y-6 block" : "hidden"}>
          {/* ========================================================
             1. TABULAR SUMMARY VIEW (Original table rendering)
             ======================================================== */}
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
        </div>

        <div className="hidden">
          {/* ========================================================
             2. INTERACTIVE VOLTAGE DROP DIAGRAM (NEW VIEW)
             ======================================================== */}
          <div className={`relative flex flex-col lg:flex-row gap-6 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-950/40 p-4 transition-all ${
            isFullScreen ? "fixed inset-0 z-50 bg-white dark:bg-slate-950 !p-6" : ""
          }`}>
            {/* Canvas Area */}
            <div className="relative flex-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-inner h-[650px] flex flex-col">
              {/* Diagram Action Overlay Toolbar */}
              <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2 items-center bg-white/90 dark:bg-slate-900/90 backdrop-blur px-3 py-2 rounded-lg border border-slate-200/80 dark:border-slate-700/80 shadow-md">
                <button
                  onClick={() => setZoom(prev => Math.min(2.0, prev + 0.15))}
                  title="Zoom In"
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded transition cursor-pointer"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setZoom(prev => Math.max(0.3, prev - 0.15))}
                  title="Zoom Out"
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded transition cursor-pointer"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={resetView}
                  title="Reset Coordinates & Zoom"
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded transition cursor-pointer flex items-center gap-1 text-xs font-bold"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Fit</span>
                </button>
                <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
                <button
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  title={isFullScreen ? "Exit Fullscreen" : "Fullscreen Viewer"}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded transition cursor-pointer flex items-center gap-1 text-xs font-bold"
                >
                  {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  <span>{isFullScreen ? "Minimize" : "Fullscreen"}</span>
                </button>

                <div className="hidden md:flex items-center gap-3 ml-4 text-[10px] font-bold text-slate-400">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Compliant (&lt;3/5%)</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Warning (90%+)</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Critical (Exceeds)</span>
                </div>
              </div>

              {/* Instructions Overlay Banner */}
              <div className="absolute bottom-4 left-4 z-10 pointer-events-none bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-md text-[10px] font-bold text-slate-300 flex items-center gap-2">
                <Move className="w-3.5 h-3.5 text-indigo-400" />
                <span>Drag background to Pan • Drag cards to manually Reposition elements</span>
              </div>

              {/* Interactive SVG Workspace */}
              <svg
                id="voltage-drop-interactive-canvas"
                className="w-full h-full cursor-grab active:cursor-grabbing select-none bg-slate-50 dark:bg-slate-950/80"
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onWheel={handleWheel}
              >
                {/* Visual Grid Definition */}
                <defs>
                  <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path
                      d="M 40 0 L 0 0 0 40"
                      fill="none"
                      stroke="#e2e8f0"
                      strokeWidth="0.5"
                    />
                  </pattern>
                </defs>

                {/* Grid Background */}
                <rect width="100%" height="100%" fill="url(#grid-pattern)" />

                {/* Inner Zoomable & Pannable Group Container */}
                <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                  
                  {/* I. Render Dynamic Bezier Cable Connections */}
                  {diagramConnections.map(conn => {
                    const dx = conn.to.x - conn.from.x;
                    const dy = conn.to.y - conn.from.y;
                    
                    // Bezier Cubic control points
                    const cx1 = conn.from.x;
                    const cy1 = conn.from.y + dy * 0.45;
                    const cx2 = conn.to.x;
                    const cy2 = conn.to.y - dy * 0.45;
                    
                    const dPath = `M ${conn.from.x} ${conn.from.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${conn.to.x} ${conn.to.y}`;
                    
                    // Compute compliance color
                    const pct = parseFloat(conn.vdPct);
                    const limit = conn.isFeeder ? 5.0 : 3.0;
                    const isSelected = selectedElement?.type === "connection" && selectedElement.data.id === conn.id;
                    
                    const connColor = pct > limit ? "#EF4444" : pct > limit * 0.9 ? "#F59E0B" : "#10B981";
                    const pillBg = pct > limit ? "#FEF2F2" : pct > limit * 0.9 ? "#FFFBEB" : "#F0FDF4";
                    const pillBorder = pct > limit ? "#FCA5A5" : pct > limit * 0.9 ? "#FCD34D" : "#86EFAC";
                    const pillText = pct > limit ? "#DC2626" : pct > limit * 0.9 ? "#D97706" : "#16A34A";

                    // Calculate curve midpoint (Cubic Bezier t = 0.5)
                    const mx = 0.125 * conn.from.x + 0.375 * cx1 + 0.375 * cx2 + 0.125 * conn.to.x;
                    const my = 0.125 * conn.from.y + 0.375 * cy1 + 0.375 * cy2 + 0.125 * conn.to.y;

                    return (
                      <g key={conn.id}>
                        {/* Interactive glow backing path */}
                        <path
                          d={dPath}
                          fill="none"
                          stroke="transparent"
                          strokeWidth="12"
                          className="hover:stroke-slate-300/40 dark:hover:stroke-slate-700/30 transition-all cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedElement({ type: "connection", data: conn });
                          }}
                          onMouseEnter={() => setHoveredElement(conn)}
                          onMouseLeave={() => setHoveredElement(null)}
                        />
                        {/* Physical rendered connector path */}
                        <path
                          d={dPath}
                          fill="none"
                          stroke={connColor}
                          strokeWidth={isSelected ? 4 : 2}
                          className="transition-all cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedElement({ type: "connection", data: conn });
                          }}
                          onMouseEnter={() => setHoveredElement(conn)}
                          onMouseLeave={() => setHoveredElement(null)}
                        />

                        {/* Midway Sizing / Compliance Pill */}
                        {conn.length > 0 && (
                          <foreignObject
                            x={mx - 37}
                            y={my - 12}
                            width={74}
                            height={24}
                          >
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedElement({ type: "connection", data: conn });
                              }}
                              onMouseEnter={() => setHoveredElement(conn)}
                              onMouseLeave={() => setHoveredElement(null)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: "74px",
                                height: "24px",
                                borderRadius: "9999px",
                                border: `1px solid ${pillBorder}`,
                                backgroundColor: pillBg,
                                color: pillText,
                                fontSize: "10px",
                                fontWeight: "900",
                                textAlign: "center",
                                cursor: "pointer",
                                userSelect: "none",
                                boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
                                fontFamily: "sans-serif"
                              }}
                            >
                              {conn.vdPct}% VD
                            </div>
                          </foreignObject>
                        )}
                      </g>
                    );
                  })}

                  {/* II. Render Draggable Structural Card Nodes */}
                  {diagramNodes.map(node => {
                    const pos = positionsMap[node.id] || { x: 0, y: 0 };
                    const isSelected = selectedElement?.type === "node" && selectedElement.node.id === node.id;

                    if (node.type === "utility") {
                      return (
                        <foreignObject
                          key={node.id}
                          x={pos.x - 90}
                          y={pos.y - 50}
                          width={180}
                          height={100}
                          className="overflow-visible"
                        >
                          <div
                            onPointerDown={(e) => handleNodePointerDown(node.id, e)}
                            onPointerMove={(e) => handleNodePointerMove(node.id, e)}
                            onPointerUp={(e) => handleNodePointerUp(node.id, e)}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedElement({ type: "node", node });
                            }}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              height: "100%",
                              boxSizing: "border-box",
                              borderRadius: "12px",
                              border: isSelected ? "2px solid #4F46E5" : "2px solid #CBD5E1",
                              background: "linear-gradient(135deg, #EEF2FF 0%, #FFFFFF 100%)",
                              padding: "12px",
                              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                              cursor: "grab",
                              fontFamily: "sans-serif"
                            }}
                          >
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              borderBottom: "1px solid #E2E8F0",
                              paddingBottom: "4px",
                              marginBottom: "6px"
                            }}>
                              <Zap className="w-4 h-4 text-indigo-500 fill-indigo-100" />
                              <h5 style={{
                                margin: 0,
                                fontWeight: "800",
                                fontSize: "11px",
                                color: "#1E1B4B",
                                textTransform: "uppercase",
                                letterSpacing: "-0.025em",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                width: "130px"
                              }}>{node.label}</h5>
                            </div>
                            <div style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "2px",
                              fontSize: "10px",
                              color: "#475569",
                              fontWeight: "700"
                            }}>
                              <p style={{ margin: 0 }}>Provider: <span style={{ color: "#1E293B" }}>{node.data.provider}</span></p>
                              <p style={{ margin: 0 }}>Grid Voltage: <span style={{ color: "#1E293B" }}>{node.data.voltage} V</span></p>
                              <p style={{ margin: 0 }}>Phasing: <span style={{ color: "#1E293B" }}>{node.data.system}</span></p>
                            </div>
                          </div>
                        </foreignObject>
                      );
                    }

                    if (node.type === "transformer") {
                      return (
                        <foreignObject
                          key={node.id}
                          x={pos.x - 90}
                          y={pos.y - 50}
                          width={180}
                          height={100}
                          className="overflow-visible"
                        >
                          <div
                            onPointerDown={(e) => handleNodePointerDown(node.id, e)}
                            onPointerMove={(e) => handleNodePointerMove(node.id, e)}
                            onPointerUp={(e) => handleNodePointerUp(node.id, e)}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedElement({ type: "node", node });
                            }}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              height: "100%",
                              boxSizing: "border-box",
                              borderRadius: "12px",
                              border: isSelected ? "2px solid #4F46E5" : "2px solid #CBD5E1",
                              background: "linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 100%)",
                              padding: "12px",
                              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                              cursor: "grab",
                              fontFamily: "sans-serif"
                            }}
                          >
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              borderBottom: "1px solid #E2E8F0",
                              paddingBottom: "4px",
                              marginBottom: "6px"
                            }}>
                              <Sliders className="w-4 h-4 text-slate-500" />
                              <h5 style={{
                                margin: 0,
                                fontWeight: "800",
                                fontSize: "11px",
                                color: "#0F172A",
                                textTransform: "uppercase",
                                letterSpacing: "-0.025em",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                width: "130px"
                              }}>{node.label}</h5>
                            </div>
                            <div style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "2px",
                              fontSize: "10px",
                              color: "#475569",
                              fontWeight: "700"
                            }}>
                              <p style={{ margin: 0 }}>Primary: <span style={{ color: "#1E293B" }}>{node.data.primaryVoltage >= 1000 ? `${(node.data.primaryVoltage / 1000).toFixed(1)} kV` : `${node.data.primaryVoltage} V`}</span></p>
                              <p style={{ margin: 0 }}>Secondary: <span style={{ color: "#1E293B" }}>{node.data.voltage} V</span></p>
                              <p style={{ margin: 0 }}>Impedance: <span style={{ color: "#1E293B" }}>{node.data.transformerZ}% Z</span></p>
                            </div>
                          </div>
                        </foreignObject>
                      );
                    }

                    if (node.type === "panel") {
                      const calc = node.calc;
                      const cum = node.cumResult;
                      const pct = calc ? parseFloat(calc.result.vdPercentage) : 0;
                      const limit = 5.0; // feeder limit

                      const pBorderColor = isSelected ? "#4F46E5" : pct > limit ? "#EF4444" : pct > limit * 0.9 ? "#F59E0B" : "#10B981";
                      const pctColor = pct > limit ? "#EF4444" : pct > limit * 0.9 ? "#F59E0B" : "#10B981";

                      return (
                        <foreignObject
                          key={node.id}
                          x={pos.x - 120}
                          y={pos.y - 65}
                          width={240}
                          height={130}
                          className="overflow-visible"
                        >
                          <div
                            onPointerDown={(e) => handleNodePointerDown(node.id, e)}
                            onPointerMove={(e) => handleNodePointerMove(node.id, e)}
                            onPointerUp={(e) => handleNodePointerUp(node.id, e)}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedElement({ type: "node", node });
                            }}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              height: "100%",
                              boxSizing: "border-box",
                              borderRadius: "12px",
                              border: `2px solid ${pBorderColor}`,
                              backgroundColor: "#FFFFFF",
                              padding: "14px",
                              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                              cursor: "grab",
                              fontFamily: "sans-serif"
                            }}
                          >
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              borderBottom: "1px solid #E2E8F0",
                              paddingBottom: "6px",
                              marginBottom: "8px"
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, overflow: "hidden" }}>
                                <Layers className="w-4 h-4 text-indigo-500 shrink-0" />
                                <h5 style={{
                                  margin: 0,
                                  fontWeight: "900",
                                  fontSize: "11px",
                                  color: "#0F172A",
                                  textTransform: "uppercase",
                                  letterSpacing: "-0.025em",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  width: "120px"
                                }}>{node.label}</h5>
                              </div>
                              <span style={{
                                fontSize: "9px",
                                padding: "2px 6px",
                                backgroundColor: "#EEF2FF",
                                color: "#4338CA",
                                borderRadius: "4px",
                                fontWeight: "900",
                                letterSpacing: "0.05em",
                                textTransform: "uppercase"
                              }}>
                                {node.data.type}
                              </span>
                            </div>

                            <div style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: "8px 6px",
                              fontSize: "10px",
                              color: "#475569",
                              fontWeight: "700"
                            }}>
                              <div>
                                <p style={{ fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#94A3B8", margin: 0 }}>Main Bus Rating</p>
                                <p style={{ color: "#1E293B", margin: 0 }}>{node.data.panelConfig?.mainBreakerAT || 100}A AT</p>
                              </div>
                              <div>
                                <p style={{ fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#94A3B8", margin: 0 }}>Total Loading</p>
                                <p style={{ color: "#1E293B", margin: 0, fontFamily: "monospace" }}>{node.data.totalLoadA?.toFixed(1)} A</p>
                              </div>
                              <div>
                                <p style={{ fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#94A3B8", margin: 0 }}>Feeder VD (%)</p>
                                <p style={{ color: pctColor, margin: 0, fontFamily: "monospace", fontWeight: "900" }}>
                                  {pct.toFixed(2)}%
                                </p>
                              </div>
                              <div>
                                <p style={{ fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#94A3B8", margin: 0 }}>Cumulative VD</p>
                                <p style={{ color: "#1E293B", margin: 0, fontFamily: "monospace", fontWeight: "800" }}>{cum?.vdPercentage}%</p>
                              </div>
                            </div>
                          </div>
                        </foreignObject>
                      );
                    }

                    if (node.type === "circuit") {
                      const calc = node.calc;
                      const cum = node.cumResult;
                      const cPct = calc ? parseFloat(calc.result.vdPercentage) : 0;
                      const cumPct = cum ? parseFloat(cum.vdPercentage) : 0;
                      const limit = 3.0; // branch limit
                      const isVdFailure = cumPct > 5.0 || cPct > limit;

                      const cBorderColor = isSelected ? "#4F46E5" : isVdFailure ? "#EF4444" : (cPct > limit * 0.9 || cumPct > 5.0 * 0.9) ? "#F59E0B" : "#10B981";
                      const segmentColor = cPct > limit ? "#EF4444" : cPct > limit * 0.9 ? "#F59E0B" : "#10B981";
                      const cumulativeColor = cumPct > 5.0 ? "#EF4444" : cumPct > 4.5 ? "#F59E0B" : "#10B981";

                      return (
                        <foreignObject
                          key={node.id}
                          x={pos.x - 80}
                          y={pos.y - 50}
                          width={160}
                          height={100}
                          className="overflow-visible"
                        >
                          <div
                            onPointerDown={(e) => handleNodePointerDown(node.id, e)}
                            onPointerMove={(e) => handleNodePointerMove(node.id, e)}
                            onPointerUp={(e) => handleNodePointerUp(node.id, e)}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedElement({ type: "node", node });
                            }}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              height: "100%",
                              boxSizing: "border-box",
                              borderRadius: "12px",
                              border: `2px solid ${cBorderColor}`,
                              backgroundColor: "#F8FAFC",
                              padding: "12px",
                              boxShadow: "0 1px 3px 0 rgba(0,0,0,0.1)",
                              cursor: "grab",
                              fontFamily: "sans-serif"
                            }}
                          >
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              borderBottom: "1px solid #E2E8F0",
                              paddingBottom: "4px",
                              marginBottom: "6px"
                            }}>
                              <h5 style={{
                                margin: 0,
                                fontWeight: "800",
                                fontSize: "10px",
                                color: "#0F172A",
                                textTransform: "uppercase",
                                letterSpacing: "-0.025em",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                width: "95px"
                              }}>{node.label}</h5>
                              <span style={{ fontSize: "8px", fontWeight: "900", color: "#94A3B8" }}>
                                NO. {node.data?.circuit?.circuitNo}
                              </span>
                            </div>

                            <div style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "4px",
                              fontSize: "9px",
                              color: "#475569",
                              fontWeight: "700"
                            }}>
                              <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span>Load Amp:</span>
                                <span style={{ color: "#1E293B", fontFamily: "monospace" }}>{node.data?.circuit?.loadA} A</span>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span>Segment VD:</span>
                                <span style={{ color: segmentColor, fontFamily: "monospace" }}>
                                  {cPct.toFixed(2)}%
                                </span>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #E2E8F0", paddingTop: "3px" }}>
                                <span>Cumulative:</span>
                                <span style={{ color: cumulativeColor, fontWeight: "900", fontFamily: "monospace" }}>
                                  {cumPct.toFixed(2)}%
                                </span>
                              </div>
                            </div>
                          </div>
                        </foreignObject>
                      );
                    }

                    return null;
                  })}

                </g>
              </svg>

              {/* Bottom HUD - Active Element Quick Info Inspector */}
              {hoveredElement && (
                <div className="absolute bottom-4 right-4 z-10 bg-slate-900/95 backdrop-blur-md px-4 py-3 rounded-xl border border-slate-700/60 shadow-xl max-w-sm text-white">
                  <h6 className="font-black text-xs text-indigo-300 uppercase tracking-wide border-b border-slate-700/50 pb-1 mb-2">
                    {hoveredElement.name}
                  </h6>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] font-bold">
                    <p className="text-slate-400">Conductor Sizing:</p>
                    <p className="text-slate-200 text-right">{hoveredElement.cableInfo}</p>
                    <p className="text-slate-400">Cable Length:</p>
                    <p className="text-slate-200 text-right font-mono">{hoveredElement.length} m</p>
                    <p className="text-slate-400">Current Load:</p>
                    <p className="text-slate-200 text-right font-mono">{hoveredElement.current} A</p>
                    <p className="text-slate-400">Voltage Drop:</p>
                    <p className="text-slate-200 text-right font-mono font-extrabold text-green-400">{hoveredElement.vdVal} V ({hoveredElement.vdPct}%)</p>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Inspector Area */}
            <div className="w-full lg:w-[340px] shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm flex flex-col justify-between min-h-[500px]">
              <div>
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Info className="w-4.5 h-4.5 text-indigo-500" />
                    <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm uppercase tracking-tight">Engineering HUD</h4>
                  </div>
                  {selectedElement && (
                    <button
                      onClick={() => setSelectedElement(null)}
                      className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-600 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {!selectedElement ? (
                  /* Initial State Instructions */
                  <div className="text-center py-10 px-4">
                    <GitFork className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                    <h5 className="font-extrabold text-slate-800 dark:text-slate-200 text-xs uppercase mb-1">Inspect Sizing Calculations</h5>
                    <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                      Click on any distribution panel, grid connection, or branch circuit card in the diagram to inspect exact formulas, conductor specifications, and PEC code compliance.
                    </p>
                  </div>
                ) : selectedElement.type === "connection" ? (
                  /* Connection / Cable Inspector */
                  <div className="space-y-4 text-xs font-bold">
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-indigo-500 font-extrabold">Circuit Segment</span>
                      <h4 className="font-black text-slate-900 dark:text-slate-100 text-base">{selectedElement.data.name}</h4>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl space-y-2 border border-slate-100 dark:border-slate-800 font-semibold text-slate-500 dark:text-slate-400">
                      <div className="flex justify-between">
                        <span>Conductor Size:</span>
                        <span className="text-slate-900 dark:text-slate-100 font-mono font-bold">{selectedElement.data.cableInfo}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cable Length:</span>
                        <span className="text-slate-900 dark:text-slate-100 font-mono font-bold">{selectedElement.data.length} meters</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Load Current:</span>
                        <span className="text-slate-900 dark:text-slate-100 font-mono font-bold">{selectedElement.data.current} A</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Segment Voltage:</span>
                        <span className="text-slate-900 dark:text-slate-100 font-mono font-bold">{selectedElement.data.calc?.voltage || panel?.voltage} V</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Phasing:</span>
                        <span className="text-slate-900 dark:text-slate-100 font-mono font-bold">{selectedElement.data.calc?.systemType === "3PH" ? "Three-Phase" : "Single-Phase"}</span>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2.5">
                      <h5 className="text-[10px] uppercase tracking-wider text-slate-400">Voltage Drop Audit</h5>
                      
                      <div className="flex items-center justify-between">
                        <span>Individual Segment VD:</span>
                        <span className="font-mono text-slate-900 dark:text-slate-100 font-black">{selectedElement.data.vdVal} V ({selectedElement.data.vdPct}%)</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/50 pb-2">
                        <span>Cumulative VD:</span>
                        <span className="font-mono text-slate-900 dark:text-slate-100 font-black">{selectedElement.data.cumResult?.vdPercentage}%</span>
                      </div>

                      <div className="mt-4">
                        <span className="text-[10px] text-slate-400">PEC Code Recommendation:</span>
                        <div className={`p-3 rounded-lg border text-[11px] font-medium leading-relaxed mt-1.5 ${
                          parseFloat(selectedElement.data.vdPct) <= (selectedElement.data.isFeeder ? 5.0 : 3.0)
                            ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/20 dark:border-green-900 dark:text-green-300"
                            : "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-900 dark:text-red-300"
                        }`}>
                          {parseFloat(selectedElement.data.vdPct) <= (selectedElement.data.isFeeder ? 5.0 : 3.0) ? (
                            <p>
                              <strong>Compliant!</strong> Segment drop of {selectedElement.data.vdPct}% is within the recommended limit of {selectedElement.data.isFeeder ? "5.0%" : "3.0%"} for electrical {selectedElement.data.isFeeder ? "feeders" : "branch circuits"} (PEC Article 2.10.2.1(A) FPN No. 4).
                            </p>
                          ) : (
                            <p>
                              <strong>Action Required!</strong> Segment drop of {selectedElement.data.vdPct}% exceeds the limit of {selectedElement.data.isFeeder ? "5.0%" : "3.0%"} for electrical {selectedElement.data.isFeeder ? "feeders" : "branch circuits"}. Recommend increasing conductor cross-sectional area to decrease wire impedance.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Node Card Inspector */
                  <div className="space-y-4 text-xs font-bold">
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-indigo-500 font-extrabold">{selectedElement.node.type} node</span>
                      <h4 className="font-black text-slate-900 dark:text-slate-100 text-base">{selectedElement.node.label}</h4>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl space-y-2 border border-slate-100 dark:border-slate-800 font-semibold text-slate-500 dark:text-slate-400">
                      {selectedElement.node.type === "utility" && (
                        <>
                          <div className="flex justify-between">
                            <span>Utility Provider:</span>
                            <span className="text-slate-900 dark:text-slate-100 font-mono font-bold">{selectedElement.node.data.provider}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Operating Voltage:</span>
                            <span className="text-slate-900 dark:text-slate-100 font-mono font-bold">{selectedElement.node.data.voltage} V</span>
                          </div>
                          <div className="flex justify-between">
                            <span>System Connection:</span>
                            <span className="text-slate-900 dark:text-slate-100 font-mono font-bold">{selectedElement.node.data.system}</span>
                          </div>
                        </>
                      )}

                      {selectedElement.node.type === "transformer" && (
                        <>
                          <div className="space-y-3 pt-1">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Utility Primary (Volts)</label>
                              <div className="relative">
                                <input
                                  type="number"
                                  value={selectedElement.node.data.primaryVoltage !== undefined ? selectedElement.node.data.primaryVoltage : (transformerPrimaryVoltage || 13800)}
                                  onChange={(e) => {
                                    const newVal = Math.max(1, Number(e.target.value));
                                    if (setTransformerPrimaryVoltage) {
                                      setTransformerPrimaryVoltage(newVal);
                                    }
                                    if (setIscParams) {
                                      setIscParams((prev: any) => ({ ...prev, primaryVoltage: newVal }));
                                    }
                                    setSelectedElement((prev: any) => ({
                                      ...prev,
                                      node: {
                                        ...prev.node,
                                        data: {
                                          ...prev.node.data,
                                          primaryVoltage: newVal
                                        }
                                      }
                                    }));
                                  }}
                                  className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                                <span className="absolute right-3 top-2.5 text-[9px] uppercase tracking-wider text-slate-400 font-bold pointer-events-none">
                                  V
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Transformer Impedance (%Z)</label>
                              <div className="relative">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={selectedElement.node.data.transformerZ !== undefined ? selectedElement.node.data.transformerZ : (iscParams?.transformerZ ?? 5.0)}
                                  onChange={(e) => {
                                    const newVal = Math.max(0.01, Number(e.target.value));
                                    if (setIscParams) {
                                      setIscParams((prev: any) => ({ ...prev, transformerZ: newVal }));
                                    }
                                    setSelectedElement((prev: any) => ({
                                      ...prev,
                                      node: {
                                        ...prev.node,
                                        data: {
                                          ...prev.node.data,
                                          transformerZ: newVal
                                        }
                                      }
                                    }));
                                  }}
                                  className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                                <span className="absolute right-3 top-2.5 text-[9px] uppercase tracking-wider text-slate-400 font-bold pointer-events-none">
                                  % Z
                                </span>
                              </div>
                            </div>

                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 space-y-2">
                              <div className="flex justify-between">
                                <span>Secondary Output:</span>
                                <span className="text-slate-900 dark:text-slate-100 font-mono font-bold">{selectedElement.node.data.voltage} V</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Transformer Phasing:</span>
                                <span className="text-slate-900 dark:text-slate-100 font-mono font-bold">{selectedElement.node.data.system}</span>
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      {selectedElement.node.type === "panel" && (
                        <>
                          <div className="flex justify-between">
                            <span>Panel Category:</span>
                            <span className="text-slate-900 dark:text-slate-100 font-mono font-bold">{selectedElement.node.data.type}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Calculated Load:</span>
                            <span className="text-slate-900 dark:text-slate-100 font-mono font-bold">{selectedElement.node.data.totalLoadA?.toFixed(1)} A</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Load kVA:</span>
                            <span className="text-slate-900 dark:text-slate-100 font-mono font-bold">{selectedElement.node.data.totalLoadKVA?.toFixed(2)} kVA</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Busbars Voltage:</span>
                            <span className="text-slate-900 dark:text-slate-100 font-mono font-bold">{selectedElement.node.data.panelConfig?.voltage || panel?.voltage} V</span>
                          </div>
                        </>
                      )}

                      {selectedElement.node.type === "circuit" && (
                        <>
                          <div className="flex justify-between">
                            <span>Circuit Number:</span>
                            <span className="text-slate-900 dark:text-slate-100 font-mono font-bold">{selectedElement.node.data?.circuit?.circuitNo}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Load Type:</span>
                            <span className="text-slate-900 dark:text-slate-100 font-mono font-bold">{selectedElement.node.data?.circuit?.loadType}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Amperage Load:</span>
                            <span className="text-slate-900 dark:text-slate-100 font-mono font-bold">{selectedElement.node.data?.circuit?.loadA} A</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Wire Spec:</span>
                            <span className="text-slate-900 dark:text-slate-100 font-mono font-bold">{selectedElement.node.data?.circuit?.wireSize} mm²</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Conduit:</span>
                            <span className="text-slate-900 dark:text-slate-100 font-mono font-bold">{selectedElement.node.data?.circuit?.conduitSize}mm {selectedElement.node.data?.circuit?.conduitType}</span>
                          </div>
                        </>
                      )}
                    </div>

                    {selectedElement.node.cumResult && (
                      <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2.5">
                        <h5 className="text-[10px] uppercase tracking-wider text-slate-400">Calculated Drop Metrics</h5>
                        <div className="flex justify-between font-mono text-slate-700 dark:text-slate-300">
                          <span>Segment Drop:</span>
                          <span className="text-slate-900 dark:text-slate-100 font-bold">{selectedElement.node.calc?.result?.vdPercentage || "0.00"}%</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 dark:border-slate-800/50 pb-2 font-mono text-slate-700 dark:text-slate-300">
                          <span>Cumulative Drop:</span>
                          <span className="text-slate-900 dark:text-slate-100 font-black">{selectedElement.node.cumResult?.vdPercentage}%</span>
                        </div>

                        <div className="mt-4">
                          <span className="text-[10px] text-slate-400">Hierarchy Path Sizing Compliance:</span>
                          <div className={`p-3 rounded-lg border text-[11px] font-medium leading-relaxed mt-1.5 ${
                            parseFloat(selectedElement.node.cumResult?.vdPercentage) <= 5.0
                              ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/20 dark:border-green-900 dark:text-green-300"
                              : "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-900 dark:text-red-300"
                          }`}>
                            {parseFloat(selectedElement.node.cumResult?.vdPercentage) <= 5.0 ? (
                              <p>
                                <strong>Compliant Path!</strong> The cumulative drop of {selectedElement.node.cumResult?.vdPercentage}% is within the global 5.0% maximum allowable drop from primary service connection down to final end loads.
                              </p>
                            ) : (
                              <p>
                                <strong>High Voltage Drop!</strong> Path drop of {selectedElement.node.cumResult?.vdPercentage}% exceeds the global 5.0% budget. To resolve, increase feeder conductors sizes at earlier segments or lower branch circuit lengths.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Mathematical Equation Legend */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3 mt-4 text-[9px] font-medium text-slate-400">
                <p className="font-extrabold uppercase text-slate-400 tracking-wider mb-1">PEC Math Reference</p>
                <code className="block bg-slate-50 dark:bg-slate-950 p-1.5 rounded text-center border border-slate-100 dark:border-slate-800/80 font-mono text-slate-500 text-[8.5px]">
                  VD = (factor * L * I * R) / 1000
                </code>
                <p className="mt-1 leading-normal text-[8.5px]">
                  factor: 1.732 for 3PH, 2 for 1PH.<br />
                  R: impedance from WIRE_IMPEDANCE_TABLE / sets.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className={activeTab === "sld" || isExporting ? "block" : "hidden"}>
          {/* Path selector & cumulative stats */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800 mb-6">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-black tracking-wider text-slate-400">Select Feeder / Branch Cascade Path:</label>
              <div className="relative">
                <select
                  value={selectedEndpointId}
                  onChange={(e) => setSelectedEndpointId(e.target.value)}
                  className="w-full md:w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  {pathEndpoints.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-right">
              <div className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
                <p className="text-[9px] uppercase font-black text-slate-400">Total Path VD</p>
                <p className="font-mono text-base font-black text-indigo-600 dark:text-indigo-400 mt-0.5">
                  {cumulativeVdVolts.toFixed(2)}V
                </p>
              </div>
              <div className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
                <p className="text-[9px] uppercase font-black text-slate-400">VD Percentage</p>
                <p className={`font-mono text-base font-black mt-0.5 ${
                  isPathCompliant ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                }`}>
                  {cumulativeVdPercent.toFixed(2)}%
                </p>
              </div>
              <div className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-center min-w-[150px]">
                <span className={`inline-flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-full border ${
                  isPathCompliant
                    ? "text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/30 dark:border-green-900/50"
                    : "text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/30 dark:border-red-900/50"
                }`}>
                  {isPathCompliant ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <AlertTriangle className="w-4 h-4 text-red-500" />}
                  {isPathCompliant ? "✓ PEC Compliant" : "⚠ Exceeds Limit"}
                </span>
              </div>
            </div>
          </div>

          {/* SVG Diagram Canvas */}
          <div className="relative border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-950 p-4 shadow-sm mb-6">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Voltage Drop Single-Line Diagram</span>
              <div className="flex gap-2">
                <span className="text-[10px] font-bold text-slate-400">Format: Standard Horizontal CAD Feeder Layout</span>
              </div>
            </div>

            <div className="relative w-full overflow-x-auto border border-slate-100 dark:border-slate-900 rounded-xl bg-slate-50 dark:bg-slate-950/30 p-2 select-none">
              <svg
                id="voltage-drop-cascade-diagram"
                viewBox="0 0 920 300"
                className="w-full min-w-[850px] h-[300px]"
              >
                {/* Visual Grid Background */}
                <defs>
                  <pattern id="cascade-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" className="text-slate-100 dark:text-slate-900" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#cascade-grid)" rx="8" />

                {/* 1. Draw feeder/branch lines */}
                {selectedPathSegments.map((segment, idx) => {
                  const x1 = nodePositions[idx];
                  const x2 = nodePositions[idx + 1];
                  const y = 150;
                  const vdPct = parseFloat(segment.calc.result.vdPercentage);
                  const isSegCompliant = vdPct <= 3.0;
                  const material = getConductorMaterialForCalculation(segment.calc);
                  const strokeColor = isSegCompliant 
                    ? (material === "Copper" ? "#EA580C" : "#64748B") 
                    : "#EF4444";

                  return (
                    <g key={segment.id}>
                      {/* Main Segment Feeder line */}
                      <line
                        x1={x1 + 25}
                        y1={y}
                        x2={x2 - 25}
                        y2={y}
                        stroke={strokeColor}
                        strokeWidth="2.5"
                        strokeDasharray={segment.type === "branch" ? "4 4" : "0"}
                      />

                      {/* Top Dimension Bracket: e.g. |<-------- 65.62 m -------->| */}
                      <path
                        d={`M ${x1 + 30} 100 L ${x1 + 30} 110 M ${x1 + 30} 105 L ${x2 - 30} 105 M ${x2 - 30} 100 L ${x2 - 30} 110`}
                        stroke="#94A3B8"
                        strokeWidth="1.5"
                      />
                      
                      {/* Dimension Text Above line */}
                      <text
                        x={(x1 + x2) / 2}
                        y="95"
                        textAnchor="middle"
                        className="fill-slate-600 dark:fill-slate-300 font-bold text-xs font-mono"
                      >
                        {segment.calc.length.toFixed(2)} m
                      </text>

                      {/* Voltage Drop text in the middle of line (e.g. Vd = 0.78V) */}
                      <rect
                        x={(x1 + x2) / 2 - 45}
                        y="125"
                        width="90"
                        height="18"
                        rx="4"
                        fill="#F8FAFC"
                        className="dark:fill-slate-900 border border-slate-200 dark:border-slate-800"
                        stroke="#CBD5E1"
                        strokeWidth="0.5"
                      />
                      <text
                        x={(x1 + x2) / 2}
                        y="138"
                        textAnchor="middle"
                        className={`font-black text-[10px] font-mono ${
                          isSegCompliant ? "fill-indigo-600 dark:fill-indigo-400" : "fill-red-600 dark:fill-red-400"
                        }`}
                      >
                        Vd = {segment.calc.result.vd}V ({vdPct.toFixed(2)}%)
                      </text>

                      {/* Cable size under line (e.g. 250mm² THHN Wire) */}
                      <text
                        x={(x1 + x2) / 2}
                        y="180"
                        textAnchor="middle"
                        className="fill-slate-500 dark:fill-slate-400 text-[10px] font-extrabold uppercase font-sans tracking-wide"
                      >
                        {segment.calc.wireSets && segment.calc.wireSets > 1 ? `${segment.calc.wireSets}x ` : ""}{segment.calc.wireSize} mm² {getConductorMaterialForCalculation(segment.calc) === "Copper" ? "CU" : "AL"} {getInsulationTypeForCalculation(segment.calc)}
                      </text>
                    </g>
                  );
                })}

                {/* 2. Draw Nodes */}
                {/* Node 0: SERVICE ENTRANCE */}
                <g transform={`translate(${nodePositions[0]}, 150)`}>
                  {/* Service Entrance incoming triangle and ground */}
                  <path
                    d="M -25 -15 L -25 15 L -5 0 Z"
                    fill="#1E293B"
                    className="dark:fill-slate-100"
                  />
                  {/* Three phase lines leading to triangle */}
                  <line x1="-40" y1="-10" x2="-25" y2="-10" stroke="#475569" className="dark:stroke-slate-300" strokeWidth="1.5" />
                  <line x1="-40" y1="0" x2="-25" y2="0" stroke="#475569" className="dark:stroke-slate-300" strokeWidth="1.5" />
                  <line x1="-40" y1="10" x2="-25" y2="10" stroke="#475569" className="dark:stroke-slate-300" strokeWidth="1.5" />
                  
                  {/* Ground symbol */}
                  <line x1="-25" y1="15" x2="-25" y2="25" stroke="#475569" strokeWidth="1.5" />
                  <line x1="-30" y1="25" x2="-20" y2="25" stroke="#475569" strokeWidth="1.5" />
                  <line x1="-28" y1="28" x2="-22" y2="28" stroke="#475569" strokeWidth="1.5" />
                  <line x1="-26" y1="31" x2="-24" y2="31" stroke="#475569" strokeWidth="1.5" />

                  <text
                    x="0"
                    y="50"
                    textAnchor="middle"
                    className="fill-slate-900 dark:fill-slate-100 font-black text-[10px] uppercase tracking-tight"
                  >
                    SERVICE ENTRANCE
                  </text>
                  <text
                    x="0"
                    y="65"
                    textAnchor="middle"
                    className="fill-slate-500 dark:fill-slate-400 text-[9px] font-mono"
                  >
                    {serviceEntranceLabel}
                  </text>
                </g>

                {/* Other Nodes (MDP, Subpanels, Circuit Endpoint) */}
                {selectedPathSegments.map((segment, idx) => {
                  const nodeX = nodePositions[idx + 1];
                  const nodeY = 150;
                  const isLastNode = idx === selectedPathSegments.length - 1;
                  const isLastBranch = isLastNode && segment.type === "branch";

                   if (isLastBranch) {
                    const circuit = getCircuitForSource(segment.calc.source);
                    const loadType = circuit ? circuit.loadType : LoadType.CONVENIENCE_OUTLET;

                    let symbolElement = null;
                    let loadTypeLabel = "FINAL LOAD ENDPOINT";

                    switch (loadType) {
                      case LoadType.LIGHTING:
                        loadTypeLabel = "LIGHT FIXTURE";
                        symbolElement = (
                          <g>
                            <circle cx="0" cy="0" r="14" fill="#FFFFFF" stroke="#1E293B" strokeWidth="2" className="dark:fill-slate-900 dark:stroke-slate-100" />
                            <line x1="-10" y1="-10" x2="10" y2="10" stroke="#1E293B" className="dark:stroke-slate-100" strokeWidth="2" />
                            <line x1="-10" y1="10" x2="10" y2="-10" stroke="#1E293B" className="dark:stroke-slate-100" strokeWidth="2" />
                          </g>
                        );
                        break;
                      case LoadType.MOTOR:
                        loadTypeLabel = "MOTOR INDUCTION";
                        symbolElement = (
                          <g>
                            <circle cx="0" cy="0" r="14" fill="#FFFFFF" stroke="#1E293B" strokeWidth="2" className="dark:fill-slate-900 dark:stroke-slate-100" />
                            <circle cx="0" cy="0" r="11" fill="none" stroke="#1E293B" strokeWidth="1" className="dark:stroke-slate-100/30" strokeDasharray="2 1" />
                            <text
                              x="0"
                              y="4.5"
                              textAnchor="middle"
                              className="fill-slate-900 dark:fill-slate-100 font-sans font-black"
                              style={{ fontSize: "12px", letterSpacing: "-0.5px" }}
                            >
                              M
                            </text>
                          </g>
                        );
                        break;
                      case LoadType.AIR_CON:
                        loadTypeLabel = "AIR CONDITIONER";
                        symbolElement = (
                          <g>
                            <rect x="-14" y="-14" width="28" height="28" rx="4" fill="#FFFFFF" stroke="#1E293B" strokeWidth="2" className="dark:fill-slate-900 dark:stroke-slate-100" />
                            <text
                              x="0"
                              y="3.5"
                              textAnchor="middle"
                              className="fill-slate-900 dark:fill-slate-100 font-sans font-black"
                              style={{ fontSize: "10px" }}
                            >
                              AC
                            </text>
                          </g>
                        );
                        break;
                      case LoadType.POWER:
                        loadTypeLabel = "POWER OUTLET / RANGE";
                        symbolElement = (
                          <g>
                            <circle cx="0" cy="0" r="14" fill="#FFFFFF" stroke="#1E293B" strokeWidth="2" className="dark:fill-slate-900 dark:stroke-slate-100" />
                            <text
                              x="0"
                              y="4.5"
                              textAnchor="middle"
                              className="fill-slate-900 dark:fill-slate-100 font-sans font-black"
                              style={{ fontSize: "11px" }}
                            >
                              P
                            </text>
                          </g>
                        );
                        break;
                      case LoadType.CONVENIENCE_OUTLET:
                      default:
                        loadTypeLabel = "CONVENIENCE RECEPTACLE";
                        symbolElement = (
                          <g>
                            {/* Circle outline with ground connection */}
                            <circle cx="0" cy="0" r="14" fill="#FFFFFF" stroke="#1E293B" strokeWidth="2" className="dark:fill-slate-900 dark:stroke-slate-100" />
                            <line x1="-4" y1="-18" x2="-4" y2="18" stroke="#1E293B" className="dark:stroke-slate-100" strokeWidth="1.5" />
                            <line x1="4" y1="-18" x2="4" y2="18" stroke="#1E293B" className="dark:stroke-slate-100" strokeWidth="1.5" />
                            
                            {/* Ground line below */}
                            <line x1="0" y1="14" x2="0" y2="22" stroke="#475569" className="dark:stroke-slate-400" strokeWidth="1.5" />
                            <line x1="-5" y1="22" x2="5" y2="22" stroke="#475569" className="dark:stroke-slate-400" strokeWidth="1.5" />
                            <line x1="-3" y1="25" x2="3" y2="25" stroke="#475569" className="dark:stroke-slate-400" strokeWidth="1.5" />
                            <line x1="-1" y1="28" x2="1" y2="28" stroke="#475569" className="dark:stroke-slate-400" strokeWidth="1.5" />
                          </g>
                        );
                        break;
                    }

                    return (
                      <g key={`node-${idx}`} transform={`translate(${nodeX}, ${nodeY})`}>
                        {symbolElement}

                        <text
                          x="0"
                          y="42"
                          textAnchor="middle"
                          className="fill-slate-900 dark:fill-slate-100 font-black text-[10px] uppercase tracking-tight"
                        >
                          {segment.toName}
                        </text>
                        <text
                          x="0"
                          y="55"
                          textAnchor="middle"
                          className="fill-indigo-500 text-[8px] font-mono font-bold"
                        >
                          {loadTypeLabel}
                        </text>
                      </g>
                    );
                  } else {
                    return (
                      <g key={`node-${idx}`} transform={`translate(${nodeX}, ${nodeY})`}>
                        <rect
                          x="-13"
                          y="-20"
                          width="26"
                          height="40"
                          fill="#FFFFFF"
                          stroke="#1E293B"
                          className="dark:fill-slate-900 stroke-slate-900 dark:stroke-slate-100"
                          strokeWidth="2"
                        />
                        <line
                          x1="-13"
                          y1="20"
                          x2="13"
                          y2="-20"
                          stroke="#1E293B"
                          className="stroke-slate-900 dark:stroke-slate-100"
                          strokeWidth="1.5"
                        />
                        <text
                          x="0"
                          y="35"
                          textAnchor="middle"
                          className="fill-slate-900 dark:fill-slate-100 font-black text-[10px] uppercase tracking-tight"
                        >
                          {segment.toName}
                        </text>
                        <text
                          x="0"
                          y="48"
                          textAnchor="middle"
                          className="fill-slate-500 dark:fill-slate-400 text-[8px] font-mono font-bold"
                        >
                          {segment.type === "feeder" ? "DIST. BOARD" : "SUB-PANEL"}
                        </text>
                      </g>
                    );
                  }
                })}
              </svg>
            </div>
          </div>

          {/* Interactive segment editors */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-500" />
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Interactive Segment Calculator
              </h3>
            </div>
            
            <div className="grid grid-cols-1 gap-6">
              {selectedPathSegments.map((segment, idx) => (
                <div key={segment.id} className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
                  <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-200/60 dark:border-slate-800/60">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-400 flex items-center justify-center text-[10px] font-black">
                        {idx + 1}
                      </span>
                      <h4 className="font-black text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        {segment.fromName} ➔ {segment.toName}
                      </h4>
                    </div>
                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                      parseFloat(segment.calc.result.vdPercentage) <= 3.0
                        ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-900 dark:text-green-400"
                        : "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-400"
                    }`}>
                      Segment Drop: {segment.calc.result.vdPercentage}%
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {/* 1. Wire length (Distance) */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-wide">
                        Length / Distance (meters)
                      </label>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={segment.calc.length}
                        onChange={(e) => handleUpdateCalculation(segment.calc.id, { length: Math.max(0.1, parseFloat(e.target.value) || 0) })}
                        className="w-full bg-white dark:bg-slate-950 px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg font-mono font-bold text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* 2. Conductor Size (mm²) */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-wide">
                        Wire Size (mm²)
                      </label>
                      <select
                        value={segment.calc.wireSize}
                        onChange={(e) => handleUpdateCalculation(segment.calc.id, { wireSize: e.target.value })}
                        className="w-full bg-white dark:bg-slate-950 px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg font-mono font-bold text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        {Object.keys(WIRE_IMPEDANCE_TABLE).map((size) => (
                          <option key={size} value={size}>
                            {size} mm² ({getInsulationTypeForCalculation(segment.calc)})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 3. Number of sets/runs */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-wide">
                        Conductor Sets (Runs)
                      </label>
                      <select
                        value={segment.calc.wireSets || 1}
                        onChange={(e) => handleUpdateCalculation(segment.calc.id, { wireSets: Number(e.target.value) })}
                        className="w-full bg-white dark:bg-slate-950 px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg font-sans font-bold text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                          <option key={n} value={n} className="dark:bg-slate-900 dark:text-slate-100">
                            {n > 1 ? `${n} Sets of` : "1 Set of"}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 4. Voltage (V) */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-wide">
                        Operating Voltage (Volts)
                      </label>
                      <select
                        value={segment.calc.voltage}
                        onChange={(e) => handleUpdateCalculation(segment.calc.id, { voltage: parseInt(e.target.value) || 230 })}
                        className="w-full bg-white dark:bg-slate-950 px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg font-mono font-bold text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        <option value="115">115 V</option>
                        <option value="230">230 V</option>
                        <option value="400">400 V</option>
                        <option value="440">440 V</option>
                        <option value="460">460 V</option>
                        <option value="480">480 V</option>
                      </select>
                    </div>

                    {/* 5. Phase System */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-wide">
                        System Phase
                      </label>
                      <select
                        value={segment.calc.systemType}
                        onChange={(e) => handleUpdateCalculation(segment.calc.id, { systemType: e.target.value as "1PH" | "3PH" })}
                        className="w-full bg-white dark:bg-slate-950 px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg font-mono font-bold text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        <option value="1PH">Single-Phase (1Ø)</option>
                        <option value="3PH">Three-Phase (3Ø)</option>
                      </select>
                    </div>

                    {/* 6. Current Load (A) - readonly */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-wide">
                        Amperage Load (A) - Dynamic
                      </label>
                      <input
                        type="text"
                        disabled
                        value={`${segment.calc.loadA} Amps`}
                        className="w-full bg-slate-100 dark:bg-slate-800 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg font-mono font-bold text-sm text-slate-400 dark:text-slate-500 cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
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
