import { PanelConfig, Circuit, LoadType, ShortCircuitParams, VoltageDropCalculation } from "../types";
import { STANDARD_CB_RATINGS, WIRE_IMPEDANCE_TABLE, CONDUIT_LIBRARY } from "../constants";
import { getMotorFLC } from "./motorFLCHelper";
import {
  sizeConductor,
  getConductorAmpacity,
  getTemperatureForInsulation,
} from "./pecAmpacityDatabase";
import { findEgcSize } from "./exportEgcExports";

let globalSubPanels: Array<{ id: string; panel: PanelConfig; circuits: Circuit[] }> = [];

export const setGlobalSubPanels = (panels: Array<{ id: string; panel: PanelConfig; circuits: Circuit[] }>) => {
  globalSubPanels = panels;
};

export const getGlobalSubPanels = () => {
  return globalSubPanels;
};


export const isIdleSpareOrSpace = (cir: {
  loadType: LoadType;
  wattage?: number;
  loadVA?: number;
  loadA?: number;
}) => {
  if (cir.loadType === LoadType.SPACE || cir.loadType === LoadType.SPARE) {
    const w = cir.wattage || 0;
    const va = cir.loadVA || 0;
    const a = cir.loadA || 0;
    return w === 0 && va === 0 && a === 0;
  }
  return false;
};

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

const CONDUIT_FILL_TABLE = CONDUIT_LIBRARY.PVC;

export const getAdjustedWireForVoltageDrop = (
  baseSize: number,
  loadA: number,
  length: number,
  voltage: number,
  systemType: "1PH" | "3PH",
  limit: number,
  conduitType: string = "PVC",
): number => {
  if (!length || length <= 0 || !loadA || loadA <= 0) return baseSize;

  const SIZES = [2.0, 3.5, 5.5, 8.0, 14, 22, 30, 38, 50, 60, 80, 100, 125, 150, 175, 200, 250, 325, 375, 400, 500];
  
  let startIndex = SIZES.findIndex(s => Math.abs(s - baseSize) < 0.01);
  if (startIndex === -1) {
    startIndex = SIZES.findIndex(s => s >= baseSize);
    if (startIndex === -1) {
      startIndex = 0;
    }
  }

  const factor = systemType === "3PH" ? 1.732 : 2;

  for (let i = startIndex; i < SIZES.length; i++) {
    const size = SIZES[i];
    const sizeStr = size.toString();
    const data = WIRE_IMPEDANCE_TABLE[sizeStr] || { r: 5.76, x: 0.157 };
    let R = data.r;
    
    if (conduitType === "RSC" || conduitType === "IMC" || conduitType === "EMT") {
      R = R * 1.02; // Symmetrical magnetic conduits increase resistance slightly
    }
    
    const vd = (factor * length * loadA * R) / 1000;
    const vdPercentage = (vd / voltage) * 100;
    
    if (vdPercentage <= limit) {
      return size;
    }
  }

  return SIZES[SIZES.length - 1];
};

export const getWireForBreakerLocal = (
  cbRating: number,
  designAmpacity: number,
  material: "Copper" | "Aluminum" = "Copper",
  insulation: string = "THHN",
  tempRating?: 60 | 75 | 90,
) => {
  return sizeConductor(
    cbRating,
    designAmpacity,
    material,
    insulation,
    tempRating,
  );
};

export const formatWireSizeLocal = (size: number): string =>
  size <= 8 ? size.toFixed(1) : size.toString();

export const getGroundWireForWireSizeLocal = (
  wireSize: number,
  cbRating: number,
  material: "Copper" | "Aluminum" | "Copper-Clad Aluminum" = "Copper",
): string => {
  const result = findEgcSize(cbRating, material);
  const actualSize = Math.min(result.sizeMm2, wireSize);
  return formatWireSizeLocal(actualSize);
};

export const getConduitSizeForWiresLocal = (
  wireSize: number,
  groundSizeString: string,
  poles: number,
  systemName: string,
  conduitType: string = "PVC",
): string => {
  let activePhaseCount = poles === 1 ? 2 : poles;
  if (poles === 3 && (systemName.includes("4W") || systemName.includes("5W"))) {
    activePhaseCount = 4;
  }

  const phaseArea = THHN_WIRE_AREAS[wireSize] || wireSize * 2.5;
  const groundSize = parseFloat(groundSizeString) || 2.0;
  const groundArea = THHN_WIRE_AREAS[groundSize] || groundSize * 2.5;

  const totalArea = phaseArea * activePhaseCount + groundArea;
  const selectedType = conduitType && CONDUIT_LIBRARY[conduitType] ? conduitType : "PVC";
  const table = CONDUIT_LIBRARY[selectedType];
  const conduit =
    table.find((c) => c.limit >= totalArea) ||
    table[table.length - 1];
  return conduit.size;
};

const getSystemVoltage = (system: string): number => {
  const match = system.match(/^(\d+)V/);
  if (match) return parseInt(match[1]);
  return 230;
};

export function extractHorsepowerFromDescription(desc: string): string | null {
  if (!desc) return null;
  const match = desc.match(
    /(\d+(?:\.\d+)?|\d+\s+1\/2|\d+\s+3\/4|\d+\/\d+)\s*HP/i,
  );
  if (match) {
    const hpVal = match[1].trim();
    if (hpVal === "0.5") return "1/2";
    if (hpVal === "0.75") return "3/4";
    if (hpVal === "1.0") return "1";
    if (hpVal === "1.5") return "1 1/2";
    if (hpVal === "2.0") return "2";
    if (hpVal === "3.0") return "3";
    if (hpVal === "5.0") return "5";
    return hpVal;
  }
  return null;
}

export interface ParsedVoltageSystem {
  vll: number;       // Line-to-Line voltage (e.g. 380, 480, 230)
  vln: number | null; // Line-to-Neutral voltage (e.g. 225, 277, null)
  is3Phase: boolean; // boolean
  wireCount: number; // e.g. 2, 3, 4
}

export function parseSystemVoltage(sys: string | undefined | null): ParsedVoltageSystem {
  const defaultSystem: ParsedVoltageSystem = { vll: 230, vln: null, is3Phase: false, wireCount: 2 };
  if (!sys) return defaultSystem;

  // Normalize representations: replace Ø with PH (or support both)
  const normalized = sys.replace(/Ø/g, "PH").replace(/ø/g, "PH").replace(/\s+/g, "");

  // Extract wire count
  let wireCount = 2;
  const wireMatch = normalized.match(/(\d+)W/i);
  if (wireMatch) {
    wireCount = parseInt(wireMatch[1]);
  }

  // Extract phase
  const is3Phase = normalized.includes("3PH");

  // Now extract the voltage section (part before the first comma)
  const voltPartMatch = sys.split(",")[0].trim().replace(/[Vv]/g, ""); // e.g. "380/230" or "230"
  let vll = 230;
  let vln: number | null = null;

  if (voltPartMatch.includes("/")) {
    const parts = voltPartMatch.split("/");
    const v1 = parseInt(parts[0]);
    const v2 = parseInt(parts[1]);
    if (!isNaN(v1) && !isNaN(v2)) {
      vll = Math.max(v1, v2);
      vln = Math.min(v1, v2);
    } else if (!isNaN(v1)) {
      vll = v1;
    }
  } else {
    // Single number with no slash
    const num = parseInt(voltPartMatch);
    if (!isNaN(num)) {
      vll = num;
    }
    // Automatically determine VN if 4W, 5W or 3W split
    if (is3Phase && (wireCount === 4 || wireCount === 5)) {
      vln = Math.round(vll / 1.732);
    } else if (!is3Phase && wireCount === 3) {
      vln = Math.round(vll / 2);
    }
  }

  return { vll, vln, is3Phase, wireCount };
}

export function validateSubPanelConnection(
  parentSystem: string,
  childSystem: string,
  childVoltage: number
): {
  isValid: boolean;
  connectionType: 'Line-to-Line' | 'Line-to-Neutral' | 'Three-Phase' | null;
  reason?: string;
  providedVoltage?: number;
} {
  const parent = parseSystemVoltage(parentSystem);
  const child = parseSystemVoltage(childSystem);

  // 1. If child is Three-Phase (3Ø)
  if (child.is3Phase) {
    if (!parent.is3Phase) {
      return {
        isValid: false,
        connectionType: null,
        reason: `Cannot connect Three-Phase sub-panel to a Single-Phase parent system (${parentSystem}).`,
        providedVoltage: undefined
      };
    }
    if (parent.vll !== childVoltage) {
      return {
        isValid: false,
        connectionType: null,
        reason: `Voltage mismatch: Parent provides ${parent.vll}V Line-to-Line for three-phase, but sub-panel expects ${childVoltage}V.`,
        providedVoltage: parent.vll
      };
    }
    return {
      isValid: true,
      connectionType: 'Three-Phase',
      providedVoltage: parent.vll
    };
  }

  // 2. Child is Single-Phase (1Ø)
  const canBeLN = parent.vln !== null && parent.vln === childVoltage;
  const canBeLL = parent.vll === childVoltage;

  if (canBeLN && canBeLL) {
    // If both are possible, dynamic fallback
    return {
      isValid: true,
      connectionType: 'Line-to-Neutral',
      providedVoltage: parent.vln!
    };
  }

  if (canBeLN) {
    return {
      isValid: true,
      connectionType: 'Line-to-Neutral',
      providedVoltage: parent.vln!
    };
  }

  if (canBeLL) {
    return {
      isValid: true,
      connectionType: 'Line-to-Line',
      providedVoltage: parent.vll
    };
  }

  // Truly invalid connection
  let reason = "";
  if (parent.vln === null) {
    reason = `Parent system (${parentSystem}) has Line-to-Line voltage of ${parent.vll}V and does not support Line-to-Neutral connections. Sub-panel expects ${childVoltage}V.`;
  } else {
    reason = `Voltage mismatch: Parent provides ${parent.vll}V Line-to-Line or ${parent.vln}V Line-to-Neutral, but sub-panel expects ${childVoltage}V.`;
  }

  return {
    isValid: false,
    connectionType: null,
    reason,
    providedVoltage: undefined
  };
}

export const getPanelSystemVoltageFallback = (
  system: string,
  is3Phase: boolean,
  connectionType?: string,
): number => {
  const parsed = parseSystemVoltage(system);
  if (is3Phase) return parsed.vll;
  if (connectionType === "Line-to-Neutral" && parsed.vln !== null) {
    return parsed.vln;
  }
  return parsed.vll;
};

export const calculateCircuitValues = (
  cParam: Partial<Circuit>,
  panel: PanelConfig,
  availableSubPanels?: Array<{
    id: string;
    panel: PanelConfig;
    circuits: Circuit[];
  }>,
  vdCalculations?: VoltageDropCalculation[],
): Partial<Circuit> => {
  const c = { ...cParam };
  const is3PhaseLoad = c.is3PhaseMarker !== undefined ? c.is3PhaseMarker : (c.phases && c.phases.length === 3);
  let is3PhaseLoadFinal = is3PhaseLoad;
  
  // If it's a subpanel load, override fields with values dynamically computed from the subpanel!
  if (
    (c.loadType === LoadType.SUB_PANEL ||
      c.loadType === LoadType.SUB_SUB_PANEL) &&
    c.linkedSubPanelId &&
    availableSubPanels
  ) {
    const sp = availableSubPanels.find((s) => s.id === c.linkedSubPanelId);
    if (sp) {
      const {
        totalVA: subTotalVA,
        mainFeeder: subMainFeeder,
        mainCurrent: subMainCurrent,
        explicitPhaseVAs: subExplicitPhaseVAs,
        phaseAmps: subPhaseAmps,
      } = computePanelScheduleValues(sp.panel, sp.circuits, {
        vdCalculations,
        panelId: sp.id,
      });

      const subTotalWattage = sp.circuits.reduce(
        (sum, cc) =>
          sum +
          (isIdleSpareOrSpace(cc) ? 0 : (cc.wattage || 0) * (cc.quantity || 1)),
        0,
      );

      const is3PhaseSP = sp.panel.system.includes("3PH");
      c.is3PhaseMarker = is3PhaseSP;
      is3PhaseLoadFinal = is3PhaseSP;

      const subVoltage = sp.panel.voltage || 230;
      const computedDemandAmp = subMainCurrent.baseAmp || 0;

      if (c.subPanelReflectionMode === 'phase_loads') {
        c.reflectedPhaseLoads = {
          R: subExplicitPhaseVAs.R,
          Y: subExplicitPhaseVAs.Y,
          B: subExplicitPhaseVAs.B,
          ThreePhase: subExplicitPhaseVAs.threePhase,
        };
        c.reflectedPhaseAmps = {
          R: subPhaseAmps.R,
          Y: subPhaseAmps.Y,
          B: subPhaseAmps.B,
          ThreePhase: subPhaseAmps.threePhase,
        };
        // Mirror the exact calculated VA from the Sub-Panel
        c.loadVA = subTotalVA;
        // Mirror the exact calculated current (amperes) from the Sub-Panel
        c.loadA = Number(computedDemandAmp.toFixed(2));
      } else {
        c.reflectedPhaseLoads = undefined;
        c.reflectedPhaseAmps = undefined;
        // Calculate the demand-based VA for the subpanel reference row in parent
        const demandVA = is3PhaseLoadFinal
          ? Math.round(computedDemandAmp * subVoltage * 1.732)
          : Math.round(computedDemandAmp * subVoltage);
        c.loadVA = demandVA;
        c.loadA = Number(computedDemandAmp.toFixed(2));
      }

      c.wattage = subTotalWattage;
      c.quantity = 1;
      
      const connValidation = validateSubPanelConnection(panel.system, sp.panel.system, sp.panel.voltage || 230);
      let calculatedPoles = subMainFeeder.poles;
      if (connValidation.isValid && connValidation.connectionType) {
        if (connValidation.connectionType === "Three-Phase") {
          calculatedPoles = panel.system.includes("3PH") ? 3 : 2;
        } else if (connValidation.connectionType === "Line-to-Line") {
          calculatedPoles = 2;
        } else if (connValidation.connectionType === "Line-to-Neutral") {
          calculatedPoles = 1;
        }
      }
      c.mcbP = calculatedPoles;
      c.voltage = subVoltage;
      c.mcbAT = subMainFeeder.cb;
      c.mcbAF = subMainFeeder.af;
      // c.mcbKAIC = subMainFeeder.kaic; // Removed to prevent infinite update loop with MDP targetKaic
      c.mcbType = subMainFeeder.type as any;
      c.wireSize = formatWireSizeLocal(subMainFeeder.wire.size);
      c.wireSets = subMainFeeder.wire.runs;
      c.groundSize = subMainFeeder.groundSize;
      c.conduitSize = subMainFeeder.conduitSize;
      c.conduitType = subMainFeeder.conduitType || "PVC";
      c.description =
        sp.panel.designation ||
        (c.loadType === LoadType.SUB_SUB_PANEL ? "Sub-Sub Panel" : "Sub-Panel");
    }
  }

  let mcbP = c.mcbP || 1;

  // Auto-update poles for three-phase circuits when in a three-phase system
  if (panel.system.includes("3PH") && is3PhaseLoadFinal) {
    if (mcbP !== 4) {
      mcbP = 3;
    }
  } else if (
    c.loadType !== LoadType.SUB_PANEL &&
    c.loadType !== LoadType.SUB_SUB_PANEL &&
    !panel.system.includes("3PH")
  ) {
    // Auto-update poles based on global connection type for 1-phase systems
    if (panel.connectionType === "Line-to-Line") {
      mcbP = 2;
    } else if (panel.connectionType === "Line-to-Neutral") {
      mcbP = 1;
    }
  }

  // Auto-sanitize phases array if switching from a 3PH to a 1PH system
  if (!panel.system.includes("3PH")) {
    if (c.phases && c.phases.length > 1) {
      c.phases = ["R"];
    }
    if (c.is3PhaseMarker) {
      c.is3PhaseMarker = false;
    }
  }

  if (!c.mcbP) {
    mcbP = 1;
    if (c.loadType === LoadType.AIR_CON || c.loadType === LoadType.MOTOR) {
      mcbP = 2; // Default to 2-Pole for motors/AC regardless of panel type
    }
  }

  const isSpace =
    (c.description && c.description.toUpperCase() === "SPACE") ||
    c.loadType === LoadType.SPACE;

  const pf = c.pf !== undefined ? c.pf : 1.0;
  let qty = c.quantity || 1;
  let w = isSpace ? 0 : c.wattage || 0;
  let va =
    c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL
      ? (c.loadVA ?? qty * w)
      : Math.round((qty * w) / (pf === 0 ? 1 : pf));

  if (c.subLoads && c.subLoads.length > 0) {
    const rawW = c.subLoads.reduce((sum, sl) => sum + sl.wattage * sl.quantity, 0);
    va = Math.round(rawW / (pf === 0 ? 1 : pf));
    qty = 1;
    w = rawW;
    c.wattage = w;
    c.quantity = qty;
    c.description =
      c.subLoads.map((sl) => sl.description).join(", ") || "Multiple Loads";
  }

  const isSubPanel = c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL;
  const defaultV = isSubPanel && c.voltage
    ? c.voltage
    : getPanelSystemVoltageFallback(
        panel.system,
        is3PhaseLoadFinal,
        panel.connectionType,
      );

  const v = defaultV;
  c.voltage = v;

  let loadA = 0;
  const hpFromDesc = extractHorsepowerFromDescription(c.description || "");
  const effectiveHP = c.motorHP || hpFromDesc;

  if (
    (c.loadType === LoadType.MOTOR || c.loadType === LoadType.AIR_CON) &&
    effectiveHP
  ) {
    const is3P = panel.system.includes("3PH") && is3PhaseLoadFinal;
    const fVal = getMotorFLC(effectiveHP, v, is3P);
    c.motorHP = effectiveHP || undefined;
    c.motorFLC = fVal;
    loadA = fVal * qty;
    va = Math.round(is3P ? loadA * v * 1.732 : loadA * v);
    w = Math.round(va * (pf === 0 ? 1 : pf));
    c.wattage = w;
    c.loadVA = va;
  } else {
    if (
      c.loadType === LoadType.SUB_PANEL ||
      c.loadType === LoadType.SUB_SUB_PANEL
    ) {
      loadA = c.loadA || 0;
    } else if (panel.system.includes("3PH") && is3PhaseLoadFinal) {
      loadA = va / (v * 1.732);
    } else {
      loadA = va / v;
    }
  }

  const isContinuous =
    c.loadType === LoadType.LIGHTING ||
    c.loadType === LoadType.AIR_CON ||
    c.loadType === LoadType.MOTOR;
  // Use loadA as the base MDC for 80% validation
  const mdcForBranch = loadA;
  const designLoadA = isContinuous ? loadA * 1.25 : loadA;

  let requiredMcbAT = 15;
  if (c.loadType === LoadType.CONVENIENCE_OUTLET) {
    requiredMcbAT = Math.max(
      20,
      STANDARD_CB_RATINGS.find((r) => r * 0.8 >= mdcForBranch) || 20,
    );
  } else if (c.loadType === LoadType.MOTOR) {
    const motorBranchProtection = loadA * 2.5;
    requiredMcbAT =
      STANDARD_CB_RATINGS.find((r) => r >= motorBranchProtection) || 15;
  } else if (c.loadType === LoadType.AIR_CON) {
    const flc = loadA;
    const limit175 = flc * 1.75;
    const limit225 = flc * 2.25;
    const under175 = STANDARD_CB_RATINGS.filter((r) => r <= limit175);
    const baseRating = under175.length > 0 ? under175[under175.length - 1] : 0;
    const nextHigherIndex = STANDARD_CB_RATINGS.findIndex(
      (r) => r > baseRating,
    );
    const nextHigherRating =
      nextHigherIndex !== -1 ? STANDARD_CB_RATINGS[nextHigherIndex] : 15;

    if (nextHigherRating <= limit225) {
      requiredMcbAT = Math.max(15, nextHigherRating);
    } else {
      const under225 = STANDARD_CB_RATINGS.filter((r) => r <= limit225);
      requiredMcbAT =
        under225.length > 0 ? Math.max(15, under225[under225.length - 1]) : 15;
    }
  } else if (
    c.loadType === LoadType.SUB_PANEL ||
    c.loadType === LoadType.SUB_SUB_PANEL
  ) {
    requiredMcbAT = c.mcbAT || 30;
  } else {
    requiredMcbAT =
      STANDARD_CB_RATINGS.find((r) => r * 0.8 >= mdcForBranch) || 15;
  }

  const isSubPanelLink =
    (c.loadType === LoadType.SUB_PANEL ||
      c.loadType === LoadType.SUB_SUB_PANEL) &&
    c.linkedSubPanelId &&
    availableSubPanels &&
    availableSubPanels.some((s) => s.id === c.linkedSubPanelId);

  let mcbAT = isSubPanelLink
    ? c.mcbAT || 30
    : c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL
      ? c.mcbAT || 30
      : Math.max(requiredMcbAT, c.mcbAT || 0);

  // Enforce the 80% loading rule on all breakers uniformly (except sub-panel links and phase_loads mode which are synced directly)
  const skip80PercentRule =
    isSubPanelLink ||
    c.subPanelReflectionMode === 'phase_loads' ||
    c.loadType === LoadType.SUB_PANEL ||
    c.loadType === LoadType.SUB_SUB_PANEL;

  if (!skip80PercentRule) {
    while (mcbAT * 0.8 < mdcForBranch) {
      const nextSize = STANDARD_CB_RATINGS.find((r) => r > mcbAT);
      if (!nextSize) break;
      mcbAT = nextSize;
    }
  }

  const mcbAF =
    isSubPanelLink && c.mcbAF
      ? c.mcbAF
      : mcbAT <= 50
        ? 50
        : mcbAT <= 100
          ? 100
          : mcbAT <= 225
            ? 225
            : 400;

  const baseCalculated = mcbAT <= 50 ? 10 : mcbAT <= 100 ? 18 : 25;
  const panelKaic = panel.icRating ? (parseFloat(panel.icRating) || 10) : 10;
  const computedMcbKAIC = Math.max(baseCalculated, panelKaic);
  
  const mcbKAIC = c.kaicOverride !== undefined
    ? c.kaicOverride
    : isSubPanelLink && c.mcbKAIC
      ? c.mcbKAIC
      : computedMcbKAIC;

  const wire = getWireForBreakerLocal(
    mcbAT,
    designLoadA,
    panel.conductorMaterial || "Copper",
    panel.insulationType || "THHN",
    panel.temperatureRating as any,
  );

  let baseWireSize = wire.size;

  if (vdCalculations && (c.id || c.linkedSubPanelId)) {
    const calc = vdCalculations.find(
      (v) => v.source === c.id || (c.linkedSubPanelId && v.source === c.linkedSubPanelId)
    );
    if (calc) {
      const isFeeder = c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL;
      const limit = isFeeder ? 5.0 : 3.0;
      const currentA = calc.loadA || Number(loadA.toFixed(2));
      baseWireSize = getAdjustedWireForVoltageDrop(
        baseWireSize,
        currentA,
        calc.length || 30,
        c.voltage || panel.voltage || 230,
        is3PhaseLoad ? "3PH" : "1PH",
        limit,
        c.conduitType || "PVC"
      );
    }
  }

  const finalWireSize =
    isSubPanelLink && c.wireSize ? c.wireSize : formatWireSizeLocal(baseWireSize);

  const finalGroundSize =
    isSubPanelLink && c.groundSize
      ? c.groundSize
      : getGroundWireForWireSizeLocal(
          baseWireSize,
          mcbAT,
          panel.conductorMaterial || "Copper",
        );

  const finalConduitType = c.conduitType || "PVC";
  const finalConduitSize =
    isSubPanelLink && c.conduitSize
      ? c.conduitSize
      : getConduitSizeForWiresLocal(
          baseWireSize,
          getGroundWireForWireSizeLocal(
            baseWireSize,
            mcbAT,
            panel.conductorMaterial || "Copper",
          ),
          mcbP,
          panel.system,
          finalConduitType,
        );

  return {
    ...c,
    pf: pf,
    loadVA: va,
    loadA: Number(loadA.toFixed(2)),
    mcbAT: mcbAT,
    mcbAF: mcbAF,
    mcbP: mcbP,
    mcbKAIC: mcbKAIC,
    mcbKAICCalculated: computedMcbKAIC,
    kaicOverride: c.kaicOverride,
    mcbType: c.mcbType || ("Bolt-on" as any),
    wireSize: finalWireSize,
    groundSize: finalGroundSize,
    conduitSize: finalConduitSize,
    conduitType: finalConduitType,
  };
};

export const calculatePanelFault = (
  panel: PanelConfig,
  iscParams?: ShortCircuitParams,
  feederLength?: number,
  feederSize?: string,
  feederRuns?: number,
  motorLoadVA: number = 0
): number => {
  if (!iscParams) return 10000; // 10 kA default if no short circuit params
  
  let connectionMultiplier = 1.0;
  if (iscParams.transformerConnection?.includes("Open")) {
    connectionMultiplier = 0.866;
  }
  
  const baseKVA = iscParams.transformerKVA || 500;
  let baseKV = (iscParams.transformerVoltage || 230) / 1000;
  if (baseKV === 0) {
    baseKV = panel.voltage ? panel.voltage / 1000 : 0.23;
  }
  
  const zUtilitypu = baseKVA / ((iscParams.utilityShortCircuitMVA || 500) * 1000);
  const zTranspu = ((iscParams.transformerZ || 5) / 100) / connectionMultiplier;
  
  let zFeederpu = 0;
  if (feederLength !== undefined && feederSize !== undefined) {
    const tableVals = WIRE_IMPEDANCE_TABLE[feederSize];
    const rPer1000m = tableVals?.r || 0.7; // default fallback if size not found
    const xPer1000m = tableVals?.x || 0.08;
    const runs = feederRuns || 1;
    
    // total R and X for feeder in Ohms
    const feederR = (rPer1000m * (feederLength / 1000)) / runs;
    const feederX = (xPer1000m * (feederLength / 1000)) / runs;
    const feederZ = Math.sqrt(feederR * feederR + feederX * feederX);
    zFeederpu = feederZ * (baseKVA / 1000) / (baseKV * baseKV);
  }
  
  const totalZpu = zUtilitypu + zTranspu + zFeederpu;
  const iFullLoad = baseKVA / (1.732 * baseKV);
  const iscFaultPoint = iFullLoad / totalZpu;
  
  const motorContribution = motorLoadVA > 0 ? (motorLoadVA / (1.732 * (baseKV * 1000))) * 4 : 0;
  return iscFaultPoint + motorContribution;
};

export const computePanelScheduleValues = (
  p: PanelConfig,
  c: Circuit[],
  options?: {
    faultCurrentA?: number;
    vdCalculations?: VoltageDropCalculation[];
    panelId?: string;
    availableSubPanels?: Array<{ id: string; panel: PanelConfig; circuits: Circuit[] }>;
  }
) => {
  const systemVoltage = getSystemVoltage(p.system);
  const totalVA = c.reduce((sum, curr) => sum + curr.loadVA, 0);

  let lightingReceptacleVA = 0;
  let motorVAs: number[] = [];

  const phaseLoads = { R: 0, Y: 0, B: 0 };
  const phaseVAs = { R: 0, Y: 0, B: 0 };
  const motorPhaseVAs = { R: 0, Y: 0, B: 0 };

  const getCircuitActiveLines = (
    cir: Circuit,
    connectionType: string | undefined,
  ): string[] => {
    const phases = cir.phases || [];
    if (phases.length === 3) {
      return ["R", "Y", "B"];
    }
    if (phases.length === 1) {
      const ph = phases[0];
      let effectiveConnType = connectionType;
      
      if (cir.loadType === LoadType.SUB_PANEL || cir.loadType === LoadType.SUB_SUB_PANEL) {
        effectiveConnType = cir.mcbP === 1 ? "Line-to-Neutral" : "Line-to-Line";
      }

      if (effectiveConnType === "Line-to-Line") {
        if (ph === "R") return ["R", "Y"];
        if (ph === "Y") return ["Y", "B"];
        if (ph === "B") return ["B", "R"];
      }
      return [ph];
    }
    return phases;
  };

  const explicitPhaseVAs = { R: 0, Y: 0, B: 0, threePhase: 0 };

  c.forEach((cir) => {
    if (isIdleSpareOrSpace(cir)) return;

    if (cir.subPanelReflectionMode === 'phase_loads' && cir.reflectedPhaseLoads) {
      explicitPhaseVAs.R += cir.reflectedPhaseLoads.R;
      explicitPhaseVAs.Y += cir.reflectedPhaseLoads.Y;
      explicitPhaseVAs.B += cir.reflectedPhaseLoads.B;
      explicitPhaseVAs.threePhase += cir.reflectedPhaseLoads.ThreePhase;
      
      phaseLoads.R += cir.reflectedPhaseLoads.R + cir.reflectedPhaseLoads.ThreePhase / 3;
      phaseLoads.Y += cir.reflectedPhaseLoads.Y + cir.reflectedPhaseLoads.ThreePhase / 3;
      phaseLoads.B += cir.reflectedPhaseLoads.B + cir.reflectedPhaseLoads.ThreePhase / 3;
      
      phaseVAs.R += cir.reflectedPhaseLoads.R + cir.reflectedPhaseLoads.ThreePhase / 3;
      phaseVAs.Y += cir.reflectedPhaseLoads.Y + cir.reflectedPhaseLoads.ThreePhase / 3;
      phaseVAs.B += cir.reflectedPhaseLoads.B + cir.reflectedPhaseLoads.ThreePhase / 3;
      
      lightingReceptacleVA += cir.loadVA; // Just group it as continuous lighting/receptacle
    } else {
      const isMotor =
        cir.loadType === LoadType.AIR_CON || cir.loadType === LoadType.MOTOR;
      const activeLines = getCircuitActiveLines(
        cir,
        p.connectionType,
      );

      const perPhaseVA = cir.loadVA / (activeLines.length || 1);

      if (activeLines.length === 3) {
        explicitPhaseVAs.threePhase += cir.loadVA;
      } else {
        activeLines.forEach((ph) => {
          explicitPhaseVAs[ph as keyof typeof explicitPhaseVAs] += perPhaseVA;
        });
      }

      activeLines.forEach((ph) => {
        phaseLoads[ph as keyof typeof phaseLoads] += perPhaseVA;

        if (ph === "R") {
          phaseVAs.R += perPhaseVA;
          if (isMotor) motorPhaseVAs.R += perPhaseVA;
        }
        if (ph === "Y") {
          phaseVAs.Y += perPhaseVA;
          if (isMotor) motorPhaseVAs.Y += perPhaseVA;
        }
        if (ph === "B") {
          phaseVAs.B += perPhaseVA;
          if (isMotor) motorPhaseVAs.B += perPhaseVA;
        }
      });

      if (isMotor) {
        motorVAs.push(cir.loadVA);
      } else {
        lightingReceptacleVA += cir.loadVA;
      }
    }
  });

  let lightingReceptacleDemand = lightingReceptacleVA;
  if (lightingReceptacleVA > 120000) {
    lightingReceptacleDemand =
      3000 * 1.0 +
      (120000 - 3000) * 0.35 +
      (lightingReceptacleVA - 120000) * 0.25;
  } else if (lightingReceptacleVA > 3000) {
    lightingReceptacleDemand =
      3000 * 1.0 + (lightingReceptacleVA - 3000) * 0.35;
  }

  const largestMotor = motorVAs.length > 0 ? Math.max(...motorVAs) : 0;

  const phaseBaseCurrents = { R: 0, Y: 0, B: 0 };
  const phaseDesignCurrents = { R: 0, Y: 0, B: 0 };

  c.forEach((cir) => {
    if (isIdleSpareOrSpace(cir)) return;

    const activeLines = getCircuitActiveLines(
      cir,
      p.connectionType,
    );
    const is3Phase = cir.phases && cir.phases.length === 3;
    let cirV =
      cir.voltage ||
      getPanelSystemVoltageFallback(p.system, is3Phase, p.connectionType);

    if (
      cir.loadType === LoadType.SUB_PANEL ||
      cir.loadType === LoadType.SUB_SUB_PANEL
    ) {
      cirV = cir.voltage || cirV;
    }

    if (cir.subPanelReflectionMode === 'phase_loads' && cir.reflectedPhaseLoads) {
      const is3PhaseMode = p.system.includes("3PH");
      const v3 = is3PhaseMode ? cirV * 1.732 : cirV;
      const v1 = cirV;
      
      const ir = cir.reflectedPhaseLoads.R / v1;
      const iy = cir.reflectedPhaseLoads.Y / v1;
      const ib = cir.reflectedPhaseLoads.B / v1;
      const i3 = cir.reflectedPhaseLoads.ThreePhase / v3;

      phaseBaseCurrents.R += ir + i3;
      phaseBaseCurrents.Y += iy + i3;
      phaseBaseCurrents.B += ib + i3;

      phaseDesignCurrents.R += ir + i3;
      phaseDesignCurrents.Y += iy + i3;
      phaseDesignCurrents.B += ib + i3;
    } else {
      const loadI = is3Phase ? cir.loadVA / (cirV * 1.732) : cir.loadVA / cirV;
      const isContinuous =
        cir.loadType === LoadType.LIGHTING ||
        cir.loadType === LoadType.AIR_CON ||
        cir.loadType === LoadType.MOTOR;
      const designI = isContinuous ? loadI * 1.25 : loadI;

      if (is3Phase) {
        phaseBaseCurrents.R += loadI;
        phaseBaseCurrents.Y += loadI;
        phaseBaseCurrents.B += loadI;

        phaseDesignCurrents.R += designI;
        phaseDesignCurrents.Y += designI;
        phaseDesignCurrents.B += designI;
      } else {
        activeLines.forEach((ph) => {
          phaseBaseCurrents[ph as keyof typeof phaseBaseCurrents] += loadI;
          phaseDesignCurrents[ph as keyof typeof phaseDesignCurrents] += designI;
        });
      }
    }
  });

  const motorCircuits = c.filter(
    (cir) =>
      cir.loadType === LoadType.MOTOR || cir.loadType === LoadType.AIR_CON,
  );
  if (motorCircuits.length > 0) {
    let largestMotorCir = motorCircuits[0];
    motorCircuits.forEach((mc) => {
      const mcIs3P = mc.is3PhaseMarker !== undefined ? mc.is3PhaseMarker : (mc.phases && mc.phases.length === 3);
      const largestIs3P = largestMotorCir.is3PhaseMarker !== undefined ? largestMotorCir.is3PhaseMarker : (largestMotorCir.phases && largestMotorCir.phases.length === 3);

      const mcV =
        mc.voltage ||
        getPanelSystemVoltageFallback(
          p.system,
          mcIs3P,
          p.connectionType,
        );
      const largestV =
        largestMotorCir.voltage ||
        getPanelSystemVoltageFallback(
          p.system,
          largestIs3P,
          p.connectionType,
        );

      const mcI =
        mcIs3P ? mc.loadVA / (mcV * 1.732) : mc.loadVA / mcV;
      const largestI =
        largestIs3P
          ? largestMotorCir.loadVA / (largestV * 1.732)
          : largestMotorCir.loadVA / largestV;

      if (mcI > largestI) {
        largestMotorCir = mc;
      }
    });

    const isLargest3Phase = largestMotorCir.phases.length === 3;
    const largestMotorV =
      largestMotorCir.voltage ||
      getPanelSystemVoltageFallback(
        p.system,
        isLargest3Phase,
        p.connectionType,
      );
    const largestMotorI = isLargest3Phase
      ? largestMotorCir.loadVA / (largestMotorV * 1.732)
      : largestMotorCir.loadVA / largestMotorV;

    const extraI = largestMotorI * 0.25;
    const activeLines = getCircuitActiveLines(
      largestMotorCir,
      p.connectionType,
    );
    activeLines.forEach((ph) => {
      phaseDesignCurrents[ph as keyof typeof phaseDesignCurrents] += extraI;
    });
  }

  if (
    lightingReceptacleVA > 0 &&
    lightingReceptacleDemand < lightingReceptacleVA
  ) {
    const demandReductionI =
      (lightingReceptacleVA - lightingReceptacleDemand) /
      (systemVoltage * (p.system.includes("3PH") ? 1.732 : 1));
    Object.keys(phaseDesignCurrents).forEach((ph) => {
      phaseDesignCurrents[ph as keyof typeof phaseDesignCurrents] = Math.max(
        phaseBaseCurrents[ph as keyof typeof phaseBaseCurrents],
        phaseDesignCurrents[ph as keyof typeof phaseDesignCurrents] -
          demandReductionI,
      );
    });
  }

  let maxBaseAmp = 0;
  let maxDesignAmp = 0;

  let subPanelDemandAmps = 0;
  let internalDemandCurrent = 0;
  let globalHML = 0;
  let internalConnectedVA = 0;

  const phaseAmps = { R: 0, Y: 0, B: 0, threePhase: 0 };
  c.forEach((cir) => {
    if (isIdleSpareOrSpace(cir)) return;
    
    if (cir.subPanelReflectionMode === 'max_demand') {
      subPanelDemandAmps += cir.loadA;
    } else {
      internalConnectedVA += cir.loadVA;
      
      if (cir.subPanelReflectionMode === 'phase_loads' && cir.reflectedPhaseAmps) {
        phaseAmps.R += cir.reflectedPhaseAmps.R;
        phaseAmps.Y += cir.reflectedPhaseAmps.Y;
        phaseAmps.B += cir.reflectedPhaseAmps.B;
        phaseAmps.threePhase += cir.reflectedPhaseAmps.ThreePhase;
      } else if (cir.phases && cir.phases.length === 3) {
        phaseAmps.threePhase += cir.loadA;
      } else if (cir.phases) {
        if (cir.phases.includes("R")) phaseAmps.R += cir.loadA;
        if (cir.phases.includes("Y")) phaseAmps.Y += cir.loadA;
        if (cir.phases.includes("B")) phaseAmps.B += cir.loadA;
      }
    }
  });

  if (p.system.includes("3PH")) {
    const motorCircuits = c.filter(
      (cir) =>
        cir.loadType === LoadType.MOTOR || cir.loadType === LoadType.AIR_CON,
    );
    let HML = 0;
    motorCircuits.forEach((cir) => {
      const is3Phase = cir.phases && cir.phases.length === 3;
      let cirV =
        cir.voltage ||
        getPanelSystemVoltageFallback(p.system, is3Phase, p.connectionType);
      const loadI = is3Phase ? cir.loadVA / (cirV * 1.732) : cir.loadVA / cirV;
      if (loadI > HML) {
        HML = loadI;
      }
    });
    globalHML = HML;

    const totalAmpere = Math.max(
      phaseAmps.R,
      phaseAmps.Y,
      phaseAmps.B,
    );
    internalDemandCurrent =
      (totalAmpere * 1.732 * 0.8 + phaseAmps.threePhase + 0.25 * HML) *
      1.25;

    maxBaseAmp = internalDemandCurrent + subPanelDemandAmps;
    maxDesignAmp = maxBaseAmp;
  } else {
    const motorCircuits = c.filter(
      (cir) =>
        cir.loadType === LoadType.MOTOR || cir.loadType === LoadType.AIR_CON,
    );
    let HML = 0;
    motorCircuits.forEach((cir) => {
      const loadI = cir.loadA || cir.loadVA / (cir.voltage || 230);
      if (loadI > HML) {
        HML = loadI;
      }
    });
    globalHML = HML;
    internalDemandCurrent =
      ((internalConnectedVA / 230) * 0.8 + 0.25 * HML) * 1.25;

    maxBaseAmp = internalDemandCurrent + subPanelDemandAmps;
    maxDesignAmp = maxBaseAmp;
  }

  const mainCurrent = { designAmp: maxDesignAmp, baseAmp: maxBaseAmp };

  // Calculate Main Feeder
  const designAmp = mainCurrent.designAmp;
  const maxBranchAT = Math.max(0, ...c.map((cir) => cir.mcbAT));
  let calculatedCb =
    STANDARD_CB_RATINGS.find(
      (r) =>
        r * 0.8 >= mainCurrent.baseAmp &&
        r >= Math.max(designAmp, mainCurrent.baseAmp),
    ) || 100;

  if (calculatedCb < maxBranchAT) {
    calculatedCb =
      STANDARD_CB_RATINGS.find((r) => r >= maxBranchAT) || calculatedCb;
  }

  // Guarantee 80% rule loop just in case
  while (calculatedCb * 0.8 < mainCurrent.baseAmp) {
    const nextSize = STANDARD_CB_RATINGS.find((r) => r > calculatedCb);
    if (!nextSize) break;
    calculatedCb = nextSize;
  }
  let cb = Math.max(
    calculatedCb,
    STANDARD_CB_RATINGS.find((r) => r >= maxBranchAT) || calculatedCb,
    30,
  );

  // Guarantee 80% rule loop on final cb
  while (cb * 0.8 < mainCurrent.baseAmp) {
    const nextSize = STANDARD_CB_RATINGS.find((r) => r > cb);
    if (!nextSize) break;
    cb = nextSize;
  }

  let poles = p.system.includes("3PH") ? 3 : 2;
  if (!p.system.includes("3PH") && p.connectionType === "Line-to-Neutral") {
    poles = 1;
  }
  const wire = getWireForBreakerLocal(
    cb,
    designAmp,
    p.conductorMaterial || "Copper",
    p.insulationType || "THHN",
    p.temperatureRating as any,
  );

  let baseWireSize = wire.size;

  const selectedMainConduitType = p.mainConduitType || p.mainOverrides?.conduitType || "PVC";

  if (options?.vdCalculations) {
    const pId = options.panelId || "main";
    const calc = options.vdCalculations.find((v) => v.source === pId);
    if (calc) {
      const currentA = calc.loadA || designAmp || mainCurrent.baseAmp;
      baseWireSize = getAdjustedWireForVoltageDrop(
        baseWireSize,
        currentA,
        calc.length || 30,
        p.voltage || 230,
        p.system.includes("3PH") ? "3PH" : "1PH",
        5.0, // Feeder/Main limit is 5%
        selectedMainConduitType
      );
    }
  }

  const groundSize = getGroundWireForWireSizeLocal(
    baseWireSize,
    cb,
    p.conductorMaterial || "Copper",
  );
  const conduitSize = getConduitSizeForWiresLocal(
    baseWireSize,
    groundSize,
    poles,
    p.system,
    selectedMainConduitType,
  );

  const branchTypeCounts = c.reduce(
    (acc, cir) => {
      acc[cir.mcbType] = (acc[cir.mcbType] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const sortedBranchTypes = Object.entries(branchTypeCounts).sort(
    (a, b) => Number(b[1]) - Number(a[1]),
  );
  const predominantBranchType = sortedBranchTypes[0]?.[0] || "MCB";
  let type = predominantBranchType;
  if (
    cb > 100 &&
    (type === "Plug-in" || type === "Bolt-on" || type === "MCB")
  ) {
    type = "MCCB";
  }
  const defaultKaic = cb > 100 ? 18 : 10;
  let kaic = defaultKaic;
  if (options?.faultCurrentA) {
    const faultKA = options.faultCurrentA / 1000;
    const KAIC_RATINGS = [10, 14, 18, 22, 25, 30, 35, 42, 50, 65, 85, 100];
    kaic = KAIC_RATINGS.find(k => k >= faultKA) || 100;
  }
  const cbAF =
    cb <= 50 ? 50 : cb <= 100 ? 100 : cb <= 225 ? 225 : cb <= 400 ? 400 : 600;

  let finalCb = cb;
  let finalAf = cbAF;
  let finalType = type;
  let finalKaic = kaic;
  let finalPoles = poles;

  let finalWireSize = baseWireSize;
  let finalWireRuns = wire.runs;
  let finalGroundSize = groundSize;
  let finalConduitSize = conduitSize;
  let finalConduitType = selectedMainConduitType;

  if (p.mainOverrides?.isOverrideEnabled) {
    if (p.mainOverrides.breakerAT) finalCb = p.mainOverrides.breakerAT;
    if (p.mainOverrides.breakerAF) finalAf = p.mainOverrides.breakerAF;
    if (p.mainOverrides.breakerType) finalType = p.mainOverrides.breakerType;
    if (p.mainOverrides.kaic) finalKaic = p.mainOverrides.kaic;
    if (p.mainOverrides.poles) finalPoles = p.mainOverrides.poles;

    if (p.mainOverrides.wireSize) finalWireSize = Number(p.mainOverrides.wireSize);
    if (p.mainOverrides.wireRuns) finalWireRuns = p.mainOverrides.wireRuns;
    if (p.mainOverrides.groundSize) finalGroundSize = p.mainOverrides.groundSize;
    if (p.mainOverrides.conduitSize) finalConduitSize = p.mainOverrides.conduitSize;
    if (p.mainOverrides.conduitType) finalConduitType = p.mainOverrides.conduitType;
  }

  const mat = p.conductorMaterial || "Copper";
  const ins = p.insulationType || "THHN";
  const temp = (p.temperatureRating as any) || getTemperatureForInsulation(ins);
  let finalWireAmpacity = getConductorAmpacity(finalWireSize, mat, temp) * finalWireRuns;

  const maxPhaseLoad = Math.max(phaseLoads.R, phaseLoads.Y, phaseLoads.B);
  const phaseImbalance =
    p.system.includes("3PH") && maxPhaseLoad > 0
      ? (1 -
          Math.min(phaseLoads.R, phaseLoads.Y, phaseLoads.B) / maxPhaseLoad) *
        100
      : 0;

  const maxDemandDetails = {
    is3PH: p.system.includes("3PH"),
    systemVoltage,
    phaseR: phaseAmps.R,
    phaseY: phaseAmps.Y,
    phaseB: phaseAmps.B,
    total3Phase: phaseAmps.threePhase,
    totalAmpere: Math.max(phaseAmps.R, phaseAmps.Y, phaseAmps.B),
    totalConnectedVA: totalVA,
    internalConnectedVA,
    HML: globalHML,
    baseAmp: maxBaseAmp,
    connectionType: p.connectionType || "Line-to-Line",
    internalDemandCurrent,
    subPanelDemandAmps
  };

  return {
    totalVA,
    phaseLoads,
    explicitPhaseVAs,
    maxPhaseLoad,
    phaseImbalance,
    phaseAmps,
    mainCurrent,
    maxDemandDetails,
    lightingReceptacleDemand,
    totalMotorDemandVA:
      motorVAs.reduce((a, b) => a + b, 0) + largestMotor * 0.25,
    lightingReceptacleVA,
    motorVAs,
    largestMotor,
    effectiveTotalBaseVA: p.system.includes("3PH")
      ? Math.max(phaseVAs.R, phaseVAs.Y, phaseVAs.B) * 3
      : lightingReceptacleVA + motorVAs.reduce((a, b) => a + b, 0),
    mainFeeder: {
      wire: {
        size: finalWireSize,
        ampacity: finalWireAmpacity,
        runs: finalWireRuns,
      },
      groundSize: finalGroundSize,
      cb: finalCb,
      conduitSize: finalConduitSize,
      conduitType: finalConduitType,
      poles: finalPoles,
      type: finalType,
      kaic: finalKaic,
      af: finalAf,
      raw: {
        wireSize: baseWireSize,
        cb: cb,
        type: type,
        kaic: kaic,
      },
    },
  };
};
