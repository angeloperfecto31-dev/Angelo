import {
  PanelConfig,
  Circuit,
  LoadType,
  ShortCircuitParams,
  VoltageDropCalculation,
} from "../types";
import {
  STANDARD_CB_RATINGS,
  WIRE_IMPEDANCE_TABLE,
  CONDUIT_LIBRARY,
} from "../constants";
import { getMotorFLC } from "./motorFLCHelper";
import {
  sizeConductor,
  getConductorAmpacity,
  getTemperatureForInsulation,
} from "./pecAmpacityDatabase";
import { findEgcSize } from "./exportEgcExports";

let globalSubPanels: Array<{
  id: string;
  panel: PanelConfig;
  circuits: Circuit[];
}> = [];

export const setGlobalSubPanels = (
  panels: Array<{ id: string; panel: PanelConfig; circuits: Circuit[] }>,
) => {
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


export const getValidPolesForSystem = (system: string): string[] => {
  if (!system) return ["1P", "1P+N", "2P", "2P+N", "3P", "3P+N", "4P"];
  const s = system.toUpperCase();
  if (s.includes("3PH, 4W") || s.includes("3PH, 5W") || s.includes("4W") || s.includes("5W")) {
    return ["1P", "1P+N", "2P", "2P+N", "3P", "3P+N", "4P"];
  } else if (s.includes("1PH, 2W") || s.includes("1PH, 3W") || s.includes("2W") || s.includes("3W")) {
    if (s.includes("3PH")) {
      return ["2P", "3P"];
    }
    return ["1P", "1P+N", "2P", "2P+N"];
  }
  return ["1P", "1P+N", "2P", "2P+N", "3P", "3P+N", "4P"];
};

export const getActivePoles = (poleStr: string | number): number => {
  if (typeof poleStr === "number") {
    if (poleStr === 4) return 3;
    return poleStr;
  }
  if (!poleStr) return 1;
  const s = poleStr.toString().trim().toUpperCase();
  if (s === "4P") return 3;
  if (s === "3P" || s === "3P+N") return 3;
  if (s === "2P" || s === "2P+N") return 2;
  if (s === "1P" || s === "1P+N") return 1;

  const match = s.match(/^(\d)P/);
  if (match) {
    const val = parseInt(match[1]);
    if (val === 4) return 3;
    return val;
  }
  return 1;
};

export const getTotalPoles = (poleStr: string | number): number => {
  if (typeof poleStr === "number") return poleStr;
  if (!poleStr) return 1;
  const s = poleStr.toString().trim().toUpperCase();
  if (s === "4P") return 4;
  const match = s.match(/^(\d)P/);
  const active = match ? parseInt(match[1]) : 1;
  const neutral = s.includes("+N") ? 1 : 0;
  return active + neutral;
};

export const getNeutralPoles = (poleStr: string | number): number => {
  if (typeof poleStr === "number") {
    if (poleStr === 4) return 1;
    return 0;
  }
  if (!poleStr) return 0;
  const s = poleStr.toString().trim().toUpperCase();
  if (s === "4P" || s.includes("+N")) return 1;
  return 0;
};

export const getActiveWireCount = (systemOrPoles?: string | number): number => {
  if (!systemOrPoles) return 2; // Default fallback to 2 active wires (standard 1PH 2W)

  const s = systemOrPoles.toString().trim().toUpperCase();

  // Check system string first
  if (s.includes("3PH")) {
    if (s.includes("3W")) return 3;
    if (s.includes("4W")) return 4;
    if (s.includes("5W")) return 4; // 3 phases + 1 neutral. The 5th is Ground.
    return 3; // Default 3PH to 3 wires
  }
  if (s.includes("1PH")) {
    if (s.includes("2W")) return 2;
    if (s.includes("3W")) return 3; // 2 phases + 1 neutral
    return 2; // Default 1PH to 2 wires
  }

  // Check poles
  if (s === "3P" || s === "3") {
    return 3;
  }
  if (s === "4P" || s === "4" || s.includes("4P") || s.includes("3P+N")) {
    return 4;
  }
  if (s === "2P" || s === "2") {
    return 2;
  }
  if (s === "1P" || s === "1") {
    return 2; // A 1P branch circuit has Phase + Neutral = 2 active wires
  }

  return 2; // Fallback
};

export const formatStandardCableDescription = (
  sets: number | string,
  wireSize: number | string,
  insulation: string,
  groundSize: number | string,
  conduitSize: number | string,
  conduitType: string,
  systemOrPoles?: string | number
): string => {
  const sNum = parseInt(sets?.toString() || "1", 10) || 1;

  let wStr = wireSize?.toString().trim() || "";
  wStr = wStr.replace(/(mm²|mm2|mm)/gi, "").trim();
  const wNum = parseFloat(wStr);
  if (!isNaN(wNum)) {
    if (wNum % 1 === 0) {
      wStr = wNum.toFixed(0);
    } else {
      wStr = wNum.toFixed(1);
    }
  }
  const phaseConductorSizeFormatted = `${wStr} mm²`;

  const ins = (insulation || "THHN").trim();

  let gStr = groundSize?.toString().trim() || "";
  gStr = gStr.replace(/(mm²|mm2|mm)/gi, "").trim();
  const gNum = parseFloat(gStr);
  if (!isNaN(gNum)) {
    if (gNum <= 8.0) {
      gStr = gNum.toFixed(1);
    } else if (gNum % 1 === 0) {
      gStr = gNum.toFixed(0);
    } else {
      gStr = gNum.toFixed(1);
    }
  }
  const groundConductorSizeFormatted = `1 x ${gStr} mm² G`;

  let cSizeStr = conduitSize?.toString().trim() || "";
  const match = cSizeStr.match(/^([\d.]+)/);
  if (match) {
    cSizeStr = `${match[1]} mm`;
  }

  const cType = (conduitType || "PVC").trim();

  const activeCount = getActiveWireCount(systemOrPoles);

  if (sNum > 1) {
    return `${sNum} Sets - ${activeCount} x ${phaseConductorSizeFormatted} ${ins} + ${groundConductorSizeFormatted} in ${cSizeStr} ${cType}`;
  }

  return `${activeCount} x ${phaseConductorSizeFormatted} ${ins} + ${groundConductorSizeFormatted} in ${cSizeStr} ${cType}`;
};

export const getConductorLabel = (
  wireSize: string | number,
  groundSize: string | number,
  poles: string | number,
  wireSets: number = 1,
  wireType: string = "THHN"
): string => {
  const sets = wireSets && wireSets > 1 ? wireSets : 1;
  const numPhases = getActivePoles(poles);
  const numNeutrals = getNeutralPoles(poles);

  const wSizeStr = typeof wireSize === "number" ? formatWireSizeLocal(wireSize) : wireSize;
  const gSizeStr = typeof groundSize === "number" ? formatWireSizeLocal(groundSize) : groundSize;

  let label = "";
  if (sets > 1) {
    label += `${sets} Sets of `;
  }

  label += `${numPhases} x ${wSizeStr} mm²`;

  if (numNeutrals > 0) {
    label += ` + ${numNeutrals} x ${wSizeStr} mm² N`;
  }

  const gSizeNum = parseFloat(gSizeStr.toString()) || 0;
  if (gSizeNum > 0) {
    label += ` + 1 x ${gSizeStr} mm² G`;
  }

  if (wireType) {
    label += ` ${wireType}`;
  }

  return label;
};

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

  const SIZES = [
    2.0, 3.5, 5.5, 8.0, 14, 22, 30, 38, 50, 60, 80, 100, 125, 150, 175, 200,
    250, 325, 375, 400, 500,
  ];

  let startIndex = SIZES.findIndex((s) => Math.abs(s - baseSize) < 0.01);
  if (startIndex === -1) {
    startIndex = SIZES.findIndex((s) => s >= baseSize);
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

    if (
      conduitType === "RSC" ||
      conduitType === "IMC" ||
      conduitType === "EMT"
    ) {
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
  isMotor?: boolean,
  isMultioutlet?: boolean,
  wireSets?: number
) => {
  // First, calculate the ideal baseline size without user forced runs
  const autoWire = sizeConductor(
    cbRating,
    designAmpacity,
    material,
    insulation,
    tempRating,
    isMotor,
    isMultioutlet
  );

  // If the user specifies a number of sets
  if (wireSets !== undefined && wireSets !== autoWire.runs) {
    if (wireSets >= autoWire.runs) {
      // User is specifying MORE sets than strictly required.
      // Do NOT recalculate or reduce the wire size. Preserve the conductor size and just distribute it.
      return { ...autoWire, runs: wireSets };
    } else {
      // User is specifying FEWER sets than auto-calculated.
      // We MUST recalculate to find a larger conductor size capable of carrying the load with fewer sets.
      return sizeConductor(
        cbRating,
        designAmpacity,
        material,
        insulation,
        tempRating,
        isMotor,
        isMultioutlet,
        wireSets
      );
    }
  }

  return autoWire;
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

export const getConductorArea = (size: number, insulation: string = "THHN"): number => {
  const normIns = (insulation || "THHN").toUpperCase();
  const baseArea = THHN_WIRE_AREAS[size] || THHN_AREAS_FALLBACK[size] || size * 2.5;

  if (normIns.includes("TW") || normIns === "THW" || normIns === "THW-2") {
    if (size <= 2.0) return 12.0;
    if (size <= 3.5) return 16.0;
    if (size <= 5.5) return 21.0;
    if (size <= 8.0) return 32.0;
    if (size <= 14) return 59.0;
    if (size <= 22) return 95.0;
    if (size <= 30) return 128.0;
    if (size <= 38) return 154.0;
    if (size <= 50) return 200.0;
    if (size <= 60) return 240.0;
    if (size <= 80) return 310.0;
    if (size <= 100) return 380.0;
    if (size <= 125) return 480.0;
    if (size <= 150) return 570.0;
    if (size <= 175) return 660.0;
    if (size <= 200) return 760.0;
    if (size <= 250) return 940.0;
    if (size <= 325) return 1220.0;
    if (size <= 375) return 1390.0;
    if (size <= 400) return 1460.0;
    if (size <= 500) return 1800.0;
    return baseArea * 1.30;
  }
  
  if (normIns.includes("XHHW") || normIns.includes("XHHW-2") || normIns.includes("XLPE")) {
    return baseArea * 0.95;
  }

  return baseArea;
};

const THHN_AREAS_FALLBACK: Record<number, number> = {
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
  375: 1300.0,
  400: 1380.0,
  500: 1700.0,
};

export interface ConduitFillDetails {
  conduitSize: string;
  minimumSize: string;
  recommendedSize: string;
  fillPercentage: number;
  allowableFillPercentage: number;
  utilizationStatus: "Safe" | "Warning" | "Exceeds Allowable Fill";
  totalConductorArea: number;
  allowableArea: number;
  internalArea: number;
  conductorCount: number;
  isUndersized: boolean;
  isOverrideUndersized: boolean;
}

export const getConduitFillDetails = (
  wireSize: number,
  groundSizeString: string,
  poles: number | string,
  systemName: string,
  conduitType: string = "PVC",
  wireSets: number = 1,
  wireType: string = "THHN",
  selectedSizeOverride?: string,
): ConduitFillDetails => {
  const activeType = conduitType && CONDUIT_LIBRARY[conduitType] ? conduitType : "PVC";
  const table = CONDUIT_LIBRARY[activeType];
  const finalWireType = wireType || "THHN";
  const activePoles = typeof poles === "string" ? getActivePoles(poles) : poles;

  let numPhases = 1;
  let numNeutrals = 0;

  if (typeof poles === "string") {
    numPhases = getActivePoles(poles);
    numNeutrals = getNeutralPoles(poles);
  } else {
    const activePoles = poles;
    numPhases = activePoles === 4 ? 3 : (activePoles === 1 ? 1 : activePoles);
    if (activePoles === 4) {
      numNeutrals = 1;
    } else if (activePoles === 1) {
      numNeutrals = 1;
    } else if (activePoles === 2) {
      if (systemName.includes("1PH, 3W") || systemName.includes("3W") || systemName.includes("3-Wire")) {
        numNeutrals = 1;
      }
    } else if (activePoles === 3) {
      if (systemName.includes("4W") || systemName.includes("5W") || systemName.includes("4-Wire") || systemName.includes("5-Wire")) {
        numNeutrals = 1;
      }
    }
  }
  const phaseArea = getConductorArea(wireSize, finalWireType);
  const neutralSize = wireSize;
  const neutralArea = getConductorArea(neutralSize, finalWireType);

  const groundSize = parseFloat(groundSizeString) || 0;
  const numGrounds = groundSize > 0 ? 1 : 0;
  const groundArea = groundSize > 0 ? getConductorArea(groundSize, finalWireType) : 0;

  // Number of parallel sets affects the calculation:
  // As requested, conduit sizing must be determined using the total number of conductors from all cable sets
  // (including phase conductors, neutral if applicable, and grounding conductors) in a single conduit.
  const totalConductorCount = (numPhases + numNeutrals + numGrounds) * wireSets;
  const totalConductorArea = ((numPhases * phaseArea) + (numNeutrals * neutralArea) + (numGrounds * groundArea)) * wireSets;

  // PEC Table 1 conduit fill limits: 1 wire = 53%, 2 wires = 31%, 3+ wires = 40%
  const allowablePercent = totalConductorCount === 1 ? 53 : (totalConductorCount === 2 ? 31 : 40);

  // Find recommended conduit size (smallest code-compliant)
  let minimumSize = table[table.length - 1].size; // default to largest
  for (const entry of table) {
    const internalArea = entry.limit / 0.40;
    const allowableArea = (allowablePercent / 100) * internalArea;
    if (allowableArea >= totalConductorArea) {
      minimumSize = entry.size;
      break;
    }
  }

  // Practical Engineering Floor Rules for Minimum Sizing to avoid tight mechanical squeezes
  // E.g., for thick stiff wires, we need a minimum physical size.
  const maxWireInConduit = Math.max(wireSize, groundSize);
  let minimumSizeIndex = table.findIndex(e => e.size === minimumSize);

  if (maxWireInConduit >= 8.0 && maxWireInConduit < 22) {
    if (totalConductorCount >= 3) {
      const floorIndex = table.findIndex(e => e.size === "20mm");
      if (minimumSizeIndex !== -1 && minimumSizeIndex < floorIndex) minimumSizeIndex = floorIndex;
    }
    if (totalConductorCount >= 5) {
      const floorIndex = table.findIndex(e => e.size === "25mm");
      if (minimumSizeIndex !== -1 && minimumSizeIndex < floorIndex) minimumSizeIndex = floorIndex;
    }
  } else if (maxWireInConduit >= 22 && maxWireInConduit < 50) {
    if (totalConductorCount >= 2) {
      const floorIndex = table.findIndex(e => e.size === "25mm");
      if (minimumSizeIndex !== -1 && minimumSizeIndex < floorIndex) minimumSizeIndex = floorIndex;
    }
  } else if (maxWireInConduit >= 50) {
    if (totalConductorCount >= 2) {
      const floorIndex = table.findIndex(e => e.size === "32mm");
      if (minimumSizeIndex !== -1 && minimumSizeIndex < floorIndex) minimumSizeIndex = floorIndex;
    }
  }

  if (minimumSizeIndex !== -1) {
    minimumSize = table[minimumSizeIndex].size;
  }

  // Derive recommended size
  let recommendedSize = minimumSize;
  const minSizeIndex = table.findIndex(e => e.size === minimumSize);

  if (minimumSize === "15mm") {
    if (totalConductorArea > 30 || maxWireInConduit >= 5.5) {
      const nextIndex = minSizeIndex + 1;
      if (nextIndex < table.length) {
        recommendedSize = table[nextIndex].size;
      }
    }
  } else {
    // General engineering recommendation: If the fill factor of the minimum size exceeds 30%, recommend the next standard size up.
    const minEntry = table[minSizeIndex] || table[table.length - 1];
    const minInternalArea = minEntry.limit / 0.40;
    const minFillPercentage = minInternalArea > 0 ? (totalConductorArea / minInternalArea) * 100 : 0;
    if (minFillPercentage > 30) {
      const nextIndex = minSizeIndex + 1;
      if (nextIndex < table.length) {
        recommendedSize = table[nextIndex].size;
      }
    }
  }

  // Manual Override processing:
  // If user provides a manual override, allow it as the active sizing.
  // We compare manual override against the calculated minimumSize to see if it is undersized.
  const activeSize = selectedSizeOverride || recommendedSize;
  const ovrIndex = selectedSizeOverride ? table.findIndex(e => e.size === selectedSizeOverride) : -1;
  const minIndex = table.findIndex(e => e.size === minimumSize);

  const isOverrideUndersized = selectedSizeOverride ? (ovrIndex < minIndex) : false;
  const isUndersized = isOverrideUndersized;

  const activeEntry = table.find(e => e.size === activeSize) || table[table.length - 1];
  const internalArea = activeEntry.limit / 0.40;
  const allowableArea = (allowablePercent / 100) * internalArea;
  const fillPercentage = internalArea > 0 ? Number(((totalConductorArea / internalArea) * 100).toFixed(1)) : 0;

  let utilizationStatus: "Safe" | "Warning" | "Exceeds Allowable Fill" = "Safe";
  if (isUndersized || fillPercentage > allowablePercent) {
    utilizationStatus = "Exceeds Allowable Fill";
  } else if (fillPercentage > allowablePercent * 0.9) {
    utilizationStatus = "Warning";
  }

  return {
    conduitSize: activeSize,
    minimumSize,
    recommendedSize,
    fillPercentage,
    allowableFillPercentage: allowablePercent,
    utilizationStatus,
    totalConductorArea: Number(totalConductorArea.toFixed(1)),
    allowableArea: Number(allowableArea.toFixed(1)),
    internalArea: Number(internalArea.toFixed(1)),
    conductorCount: totalConductorCount,
    isUndersized: isUndersized || fillPercentage > allowablePercent,
    isOverrideUndersized
  };
};

export const getConduitSizeForWiresLocal = (
  wireSize: number,
  groundSizeString: string,
  poles: number | string,
  systemName: string,
  conduitType: string = "PVC",
  wireSets: number = 1,
  wireType: string = "THHN",
  selectedSizeOverride?: string,
): string => {
  const details = getConduitFillDetails(wireSize, groundSizeString, poles, systemName, conduitType, wireSets, wireType, selectedSizeOverride);
  return details.conduitSize;
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
  vll: number; // Line-to-Line voltage (e.g. 380, 480, 230)
  vln: number | null; // Line-to-Neutral voltage (e.g. 225, 277, null)
  is3Phase: boolean; // boolean
  wireCount: number; // e.g. 2, 3, 4
}

export function parseSystemVoltage(
  sys: string | undefined | null,
): ParsedVoltageSystem {
  const defaultSystem: ParsedVoltageSystem = {
    vll: 230,
    vln: null,
    is3Phase: false,
    wireCount: 2,
  };
  if (!sys) return defaultSystem;

  // Normalize representations: replace Ø with PH (or support both)
  const normalized = sys
    .replace(/Ø/g, "PH")
    .replace(/ø/g, "PH")
    .replace(/\s+/g, "");

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
  childVoltage: number,
): {
  isValid: boolean;
  connectionType: "Line-to-Line" | "Line-to-Neutral" | "Three-Phase" | null;
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
        providedVoltage: undefined,
      };
    }
    if (parent.vll !== childVoltage) {
      return {
        isValid: false,
        connectionType: null,
        reason: `Voltage mismatch: Parent provides ${parent.vll}V Line-to-Line for three-phase, but sub-panel expects ${childVoltage}V.`,
        providedVoltage: parent.vll,
      };
    }
    return {
      isValid: true,
      connectionType: "Three-Phase",
      providedVoltage: parent.vll,
    };
  }

  // 2. Child is Single-Phase (1Ø)
  const canBeLN = parent.vln !== null && parent.vln === childVoltage;
  const canBeLL = parent.vll === childVoltage;

  if (canBeLN && canBeLL) {
    // If both are possible, dynamic fallback
    return {
      isValid: true,
      connectionType: "Line-to-Neutral",
      providedVoltage: parent.vln!,
    };
  }

  if (canBeLN) {
    return {
      isValid: true,
      connectionType: "Line-to-Neutral",
      providedVoltage: parent.vln!,
    };
  }

  if (canBeLL) {
    return {
      isValid: true,
      connectionType: "Line-to-Line",
      providedVoltage: parent.vll,
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
    providedVoltage: undefined,
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
  const is3PhaseLoad =
    c.is3PhaseMarker !== undefined
      ? c.is3PhaseMarker
      : c.phases && c.phases.length === 3;
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
        maxDemandDetails: subMaxDemandDetails,
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

      if (c.subPanelReflectionMode === "phase_loads") {
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
        // Mirror the exact calculated Highest Phase Current (I_line) from the Sub-Panel
        c.loadA = Number((subMaxDemandDetails?.totalAmpere || 0).toFixed(2));
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

      const connValidation = validateSubPanelConnection(
        panel.system,
        sp.panel.system,
        sp.panel.voltage || 230,
      );
      let calculatedPoles: string | number = subMainFeeder.poles || "1P";
      if (connValidation.isValid && connValidation.connectionType) {
        if (connValidation.connectionType === "Three-Phase") {
          calculatedPoles = panel.system.includes("3PH") ? "3P" : "2P";
        } else if (connValidation.connectionType === "Line-to-Line") {
          calculatedPoles = "2P";
        } else if (connValidation.connectionType === "Line-to-Neutral") {
          calculatedPoles = "1P";
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

  let mcbP = c.mcbP || "1P";
  if (typeof mcbP === 'number') { mcbP = mcbP + "P"; }

  if (c.mcbPOverride) {
    mcbP = c.mcbPOverride;
  } else {
    const validPoles = getValidPolesForSystem(panel.system);
    if (!validPoles.includes(mcbP.toString())) {
      mcbP = validPoles[0];
    }

    if (panel.system.includes("3PH") && is3PhaseLoadFinal) {
      if (mcbP !== "4P" && mcbP !== "3P+N") {
        mcbP = "3P";
      }
    } else if (
      c.loadType !== LoadType.SUB_PANEL &&
      c.loadType !== LoadType.SUB_SUB_PANEL &&
      !panel.system.includes("3PH")
    ) {
      if (panel.connectionType === "Line-to-Line") {
        if (!mcbP.toString().startsWith("2")) mcbP = "2P";
      } else if (panel.connectionType === "Line-to-Neutral") {
        if (!mcbP.toString().startsWith("1")) mcbP = "1P";
      }
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
    mcbP = "1P";
    if (c.loadType === LoadType.AIR_CON || c.loadType === LoadType.MOTOR) {
      mcbP = "2P";
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
    const rawW = c.subLoads.reduce(
      (sum, sl) => sum + sl.wattage * sl.quantity,
      0,
    );
    va = Math.round(rawW / (pf === 0 ? 1 : pf));
    qty = 1;
    w = rawW;
    c.wattage = w;
    c.quantity = qty;
    c.description =
      c.subLoads.map((sl) => sl.description).join(", ") || "Multiple Loads";
  }

  const isSubPanel =
    c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL;
  const defaultV =
    isSubPanel && c.voltage
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
    let fVal = 0;
    if (c.manualMotorFLC !== undefined && c.manualMotorFLC > 0) {
      fVal = c.manualMotorFLC;
    } else {
      fVal = getMotorFLC(effectiveHP, v, is3P);
    }
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
      STANDARD_CB_RATINGS.find((r) => r >= designLoadA) || 20,
    );
  } else if (c.loadType === LoadType.MOTOR) {
    const motorBranchProtection = loadA * 2.5;
    requiredMcbAT = Math.max(
      20,
      STANDARD_CB_RATINGS.find((r) => r >= motorBranchProtection) || 20,
    );
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
      nextHigherIndex !== -1 ? STANDARD_CB_RATINGS[nextHigherIndex] : 20;

    let calcedMcbAT = 20;
    if (nextHigherRating <= limit225) {
      calcedMcbAT = Math.max(20, nextHigherRating);
    } else {
      const under225 = STANDARD_CB_RATINGS.filter((r) => r <= limit225);
      calcedMcbAT =
        under225.length > 0 ? Math.max(20, under225[under225.length - 1]) : 20;
    }
    requiredMcbAT = calcedMcbAT;
  } else if (
    c.loadType === LoadType.SUB_PANEL ||
    c.loadType === LoadType.SUB_SUB_PANEL
  ) {
    requiredMcbAT = c.mcbAT || 30;
  } else {
    requiredMcbAT =
      STANDARD_CB_RATINGS.find((r) => r >= designLoadA) || 15;
  }

  const isSubPanelLink =
    (c.loadType === LoadType.SUB_PANEL ||
      c.loadType === LoadType.SUB_SUB_PANEL) &&
    c.linkedSubPanelId &&
    availableSubPanels &&
    availableSubPanels.some((s) => s.id === c.linkedSubPanelId);

  let mcbAT = isSubPanelLink
    ? c.mcbATOverride || c.mcbAT || 30
    : c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL
      ? c.mcbATOverride || c.mcbAT || 30
      : c.mcbATOverride || requiredMcbAT;

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
  const panelKaic = panel.icRating ? parseFloat(panel.icRating) || 10 : 10;
  const computedMcbKAIC = Math.max(baseCalculated, panelKaic);

  const mcbKAIC =
    c.kaicOverride !== undefined
      ? c.kaicOverride
      : isSubPanelLink && c.mcbKAIC
        ? c.mcbKAIC
        : computedMcbKAIC;

  const calculatedWireTypeStr = panel.insulationType || "THHN";
  const finalWireType = c.wireTypeOverride || calculatedWireTypeStr;

  const isMotor = c.loadType === LoadType.MOTOR || c.loadType === LoadType.AIR_CON;
  const isMultioutlet = c.loadType === LoadType.CONVENIENCE_OUTLET;

  const wire = getWireForBreakerLocal(
    mcbAT,
    designLoadA,
    panel.conductorMaterial || "Copper",
    finalWireType,
    c.wireTypeOverride ? undefined : (panel.temperatureRating as any),
    isMotor,
    isMultioutlet,
    c.wireSets
  );

  let baseWireSize = wire.size;

  if (vdCalculations && (c.id || c.linkedSubPanelId)) {
    const calc = vdCalculations.find(
      (v) =>
        v.source === c.id ||
        (c.linkedSubPanelId && v.source === c.linkedSubPanelId),
    );
    if (calc) {
      const isFeeder =
        c.loadType === LoadType.SUB_PANEL ||
        c.loadType === LoadType.SUB_SUB_PANEL;
      const limit = isFeeder ? 5.0 : 3.0;
      const currentA = calc.loadA || Number(loadA.toFixed(2));
      baseWireSize = getAdjustedWireForVoltageDrop(
        baseWireSize,
        currentA,
        calc.length || 30,
        c.voltage || panel.voltage || 230,
        is3PhaseLoad ? "3PH" : "1PH",
        limit,
        c.conduitType || "PVC",
      );
    }
  }

  const calcBaseWireSize = c.wireSizeOverride ? parseFloat(c.wireSizeOverride) || baseWireSize : baseWireSize;

  const calculatedWireSizeStr = isSubPanelLink && c.wireSize
    ? c.wireSize
    : formatWireSizeLocal(baseWireSize);

  const finalWireSize = c.wireSizeOverride || calculatedWireSizeStr;

  const calculatedGroundSizeStr = isSubPanelLink && c.groundSize
    ? c.groundSize
    : getGroundWireForWireSizeLocal(
        calcBaseWireSize,
        mcbAT,
        panel.conductorMaterial || "Copper",
      );

  // Auto-synchronize and sanitize grounding conductor manual override when wire size changes
  let finalGroundSizeOverride = c.groundSizeOverride;
  if (finalGroundSizeOverride) {
    const overrideVal = parseFloat(finalGroundSizeOverride) || 0;
    const minVal = parseFloat(calculatedGroundSizeStr) || 0;
    const maxVal = parseFloat(finalWireSize) || 0;
    if (overrideVal < minVal || overrideVal > maxVal) {
      finalGroundSizeOverride = undefined;
    }
  }

  const finalGroundSize = finalGroundSizeOverride || calculatedGroundSizeStr;

  const finalConduitType = c.conduitTypeOverride || c.conduitType || "PVC";
  
  // Calculate standard conduit details using the custom-built engine
  const conduitDetails = getConduitFillDetails(
    calcBaseWireSize,
    finalGroundSize,
    mcbP.toString(),
    panel.system,
    finalConduitType,
    wire.runs,
    finalWireType,
    c.conduitSizeOverride,
  );

  let finalConduitSizeOverride = c.conduitSizeOverride;
  // If user has a manual override and it is smaller than the PEC minimum, we allow it (meaning we don't force-clear it) 
  // but the UI will display a prominent warning since isUndersized / isOverrideUndersized will be set to true.
  
  const finalConduitSize = isSubPanelLink && c.conduitSize
    ? c.conduitSize
    : conduitDetails.conduitSize;

  const minimumConduitSizeStr = conduitDetails.minimumSize;
  const recommendedConduitSizeStr = conduitDetails.recommendedSize;

  return {
    ...c,
    pf: pf,
    loadVA: va,
    loadA: Number(loadA.toFixed(2)),
    mcbAT: mcbAT,
    mcbAF: mcbAF,
    mcbP: mcbP.toString(),
    mcbKAIC: mcbKAIC,
    mcbKAICCalculated: computedMcbKAIC,
    kaicOverride: c.kaicOverride,
    mcbType: c.mcbType || ("Bolt-on" as any),
    wireSize: finalWireSize,
    calculatedWireSize: calculatedWireSizeStr,
    calculatedWireSets: wire.runs,
    wireType: finalWireType,
    calculatedWireType: calculatedWireTypeStr,
    groundSize: finalGroundSize,
    groundSizeOverride: finalGroundSizeOverride,
    calculatedGroundSize: calculatedGroundSizeStr,
    conduitSize: finalConduitSize,
    conduitSizeOverride: finalConduitSizeOverride,
    calculatedConduitSize: recommendedConduitSizeStr,
    minimumConduitSize: minimumConduitSizeStr,
    recommendedConduitSize: recommendedConduitSizeStr,
    conduitType: finalConduitType,
  };
};

export const calculateEquivalentFeederImpedance = (
  length: number,
  size: string,
  runs: number,
  conductorType: 'Copper' | 'Aluminum',
  connectionType: 'Series' | 'Parallel' = 'Series',
  sizeMatch: boolean = true,
  lengthMatch: boolean = true,
  materialMatch: boolean = true,
  customSizes?: string[],
  customLengths?: number[],
  customMaterials?: string[],
) => {
  const numRuns = runs > 1 ? runs : 1;

  if (connectionType === 'Series') {
    let totalR = 0;
    let totalX = 0;
    for (let i = 0; i < numRuns; i++) {
      const currentSize = (!sizeMatch && customSizes?.[i]) ? customSizes[i] : size;
      const currentLength = (!lengthMatch && customLengths?.[i]) ? customLengths[i] : length;
      const currentMat = (!materialMatch && customMaterials?.[i]) ? customMaterials[i] : conductorType;

      const tableVal = WIRE_IMPEDANCE_TABLE[currentSize] || WIRE_IMPEDANCE_TABLE['30'] || { r: 0.587, x: 0.135 };
      let r = (tableVal.r * currentLength) / 1000;
      if (currentMat === 'Aluminum') {
        r *= 1.64;
      }
      const x = (tableVal.x * currentLength) / 1000;
      totalR += r;
      totalX += x;
    }
    return {
      r: totalR,
      x: totalX,
      z: Math.sqrt(totalR * totalR + totalX * totalX),
      paths: Array.from({ length: numRuns }).map((_, i) => ({
        r: totalR / numRuns,
        x: totalX / numRuns,
        z: Math.sqrt(totalR * totalR + totalX * totalX) / numRuns,
        share: 1 / numRuns
      }))
    };
  } else {
    let sumG = 0;
    let sumB = 0;
    const paths: Array<{ r: number; x: number; z: number; share: number }> = [];

    for (let i = 0; i < numRuns; i++) {
      const currentSize = (!sizeMatch && customSizes?.[i]) ? customSizes[i] : size;
      const currentLength = (!lengthMatch && customLengths?.[i]) ? customLengths[i] : length;
      const currentMat = (!materialMatch && customMaterials?.[i]) ? customMaterials[i] : conductorType;

      const tableVal = WIRE_IMPEDANCE_TABLE[currentSize] || WIRE_IMPEDANCE_TABLE['30'] || { r: 0.587, x: 0.135 };
      let r = (tableVal.r * currentLength) / 1000;
      if (currentMat === 'Aluminum') {
        r *= 1.64;
      }
      const x = (tableVal.x * currentLength) / 1000;
      const zSq = r * r + x * x;
      const z = Math.sqrt(zSq);

      const g = r / zSq;
      const b = -x / zSq;
      sumG += g;
      sumB += b;

      paths.push({ r, x, z, share: 0 });
    }

    const denom = sumG * sumG + sumB * sumB;
    const eqR = denom > 0 ? sumG / denom : 0.001;
    const eqX = denom > 0 ? -sumB / denom : 0.001;
    const eqZ = Math.sqrt(eqR * eqR + eqX * eqX);

    let totalAdmittance = 0;
    paths.forEach(p => {
      totalAdmittance += p.z > 0 ? 1 / p.z : 0;
    });

    paths.forEach(p => {
      p.share = totalAdmittance > 0 ? (p.z > 0 ? (1 / p.z) / totalAdmittance : 0) : (1 / numRuns);
    });

    return {
      r: eqR,
      x: eqX,
      z: eqZ,
      paths,
    };
  }
};

export const calculatePanelFault = (
  panel: PanelConfig,
  iscParams?: ShortCircuitParams,
  feederLength?: number,
  feederSize?: string,
  feederRuns?: number,
  motorLoadVA: number = 0,
  phaseType?: '1PH' | '3PH',
): number => {
  if (!iscParams) return 10000; // 10 kA default if no short circuit params

  const is3Phase = phaseType 
    ? (phaseType === '3PH') 
    : (iscParams.phaseTypeOverrideEnabled 
        ? (iscParams.phaseTypeOverride === '3PH') 
        : !(panel.system?.toLowerCase().includes("1ph") || panel.system?.toLowerCase().includes("1ø") || panel.system?.toLowerCase().includes("single-phase") || panel.system?.toLowerCase().includes("single phase")));
        
  const factor = is3Phase ? 1.732 : 2.0;

  let connectionMultiplier = 1.0;
  if (iscParams.transformerConnection?.includes("Open")) {
    connectionMultiplier = 0.866;
  }

  const baseKVA = iscParams.transformerKVA || 500;
  let baseKV = (iscParams.transformerVoltage || 230) / 1000;
  if (baseKV === 0) {
    baseKV = panel.voltage ? panel.voltage / 1000 : 0.23;
  }

  const zUtilitypu =
    baseKVA / ((iscParams.utilityShortCircuitMVA || 500) * 1000);
  
  let zTranspu = (iscParams.transformerZ || 5) / 100 / connectionMultiplier;

  // Support Parallel Transformers
  if (iscParams.parallelTransformersCount && iscParams.parallelTransformersCount > 1) {
    const ptCount = iscParams.parallelTransformersCount;
    const ptZMatch = iscParams.parallelTransformersZMatch !== false;
    const ptkVAMatch = iscParams.parallelTransformerskVAMatch !== false;

    if (ptZMatch && ptkVAMatch) {
      zTranspu = zTranspu / ptCount;
    } else {
      const z1pu = zTranspu;
      const t2Rating = iscParams.parallelTransformersRating || 100;
      const t2Z = iscParams.parallelTransformersZ || 5;
      const z2pu = ((t2Z / 100) / connectionMultiplier) * (baseKVA / t2Rating);
      
      const y1 = 1 / z1pu;
      const y2 = (ptCount - 1) / z2pu;
      zTranspu = 1 / (y1 + y2);
    }
  }

  let zFeederpu = 0;
  if (feederLength !== undefined && feederSize !== undefined) {
    const runs = feederRuns || iscParams.feederRuns || 1;
    const condType = iscParams.conductorType || 'Copper';
    const connType = iscParams.connectionType || 'Series';

    const eqFeeder = calculateEquivalentFeederImpedance(
      feederLength,
      feederSize,
      runs,
      condType,
      connType,
      iscParams.parallelFeedersSizeMatch !== false,
      iscParams.parallelFeedersLengthMatch !== false,
      iscParams.parallelFeedersMaterialMatch !== false,
      iscParams.parallelFeedersCustomSizes,
      iscParams.parallelFeedersCustomLengths,
      iscParams.parallelFeedersCustomMaterials,
    );

    zFeederpu = (eqFeeder.z * (baseKVA / 1000)) / (baseKV * baseKV);
  }

  const totalZpu = zUtilitypu + zTranspu + zFeederpu;
  const iFullLoad = baseKVA / (factor * baseKV);
  const iscFaultPoint = iFullLoad / totalZpu;

  const motorContribution =
    motorLoadVA > 0 ? (motorLoadVA / (factor * (baseKV * 1000))) * 4 : 0;
  return iscFaultPoint + motorContribution;
};

export const computePanelScheduleValues = (
  p: PanelConfig,
  c: Circuit[],
  options?: {
    faultCurrentA?: number;
    vdCalculations?: VoltageDropCalculation[];
    panelId?: string;
    availableSubPanels?: Array<{
      id: string;
      panel: PanelConfig;
      circuits: Circuit[];
    }>;
  },
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

      if (
        cir.loadType === LoadType.SUB_PANEL ||
        cir.loadType === LoadType.SUB_SUB_PANEL
      ) {
        effectiveConnType = getActivePoles(cir.mcbP) === 1 ? "Line-to-Neutral" : "Line-to-Line";
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

    if (
      cir.subPanelReflectionMode === "phase_loads" &&
      cir.reflectedPhaseLoads
    ) {
      explicitPhaseVAs.R += cir.reflectedPhaseLoads.R;
      explicitPhaseVAs.Y += cir.reflectedPhaseLoads.Y;
      explicitPhaseVAs.B += cir.reflectedPhaseLoads.B;
      explicitPhaseVAs.threePhase += cir.reflectedPhaseLoads.ThreePhase;

      phaseLoads.R +=
        cir.reflectedPhaseLoads.R + cir.reflectedPhaseLoads.ThreePhase / 3;
      phaseLoads.Y +=
        cir.reflectedPhaseLoads.Y + cir.reflectedPhaseLoads.ThreePhase / 3;
      phaseLoads.B +=
        cir.reflectedPhaseLoads.B + cir.reflectedPhaseLoads.ThreePhase / 3;

      phaseVAs.R +=
        cir.reflectedPhaseLoads.R + cir.reflectedPhaseLoads.ThreePhase / 3;
      phaseVAs.Y +=
        cir.reflectedPhaseLoads.Y + cir.reflectedPhaseLoads.ThreePhase / 3;
      phaseVAs.B +=
        cir.reflectedPhaseLoads.B + cir.reflectedPhaseLoads.ThreePhase / 3;

      lightingReceptacleVA += cir.loadVA; // Just group it as continuous lighting/receptacle
    } else {
      const isMotor =
        cir.loadType === LoadType.AIR_CON || cir.loadType === LoadType.MOTOR;
      const activeLines = getCircuitActiveLines(cir, p.connectionType);

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

    const activeLines = getCircuitActiveLines(cir, p.connectionType);
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

    if (
      cir.subPanelReflectionMode === "phase_loads" &&
      cir.reflectedPhaseAmps
    ) {
      const isSubL2L = getActivePoles(cir.mcbP) !== 1;
      const ir = cir.reflectedPhaseAmps.R;
      const iy = cir.reflectedPhaseAmps.Y;
      const ib = cir.reflectedPhaseAmps.B;
      const i3 = cir.reflectedPhaseAmps.ThreePhase;

      if (isSubL2L) {
        phaseBaseCurrents.R += (ir + ib) + i3;
        phaseBaseCurrents.Y += (ir + iy) + i3;
        phaseBaseCurrents.B += (iy + ib) + i3;

        phaseDesignCurrents.R += (ir + ib) + i3;
        phaseDesignCurrents.Y += (ir + iy) + i3;
        phaseDesignCurrents.B += (iy + ib) + i3;
      } else {
        phaseBaseCurrents.R += ir + i3;
        phaseBaseCurrents.Y += iy + i3;
        phaseBaseCurrents.B += ib + i3;

        phaseDesignCurrents.R += ir + i3;
        phaseDesignCurrents.Y += iy + i3;
        phaseDesignCurrents.B += ib + i3;
      }
    } else if (
      cir.subPanelReflectionMode === "phase_loads" &&
      cir.reflectedPhaseLoads
    ) {
      const is3PhaseMode = p.system.includes("3PH");
      const v3 = is3PhaseMode ? cirV * 1.732 : cirV;
      const v1 = cirV;

      let ir = cir.reflectedPhaseLoads.R / v1;
      let iy = cir.reflectedPhaseLoads.Y / v1;
      let ib = cir.reflectedPhaseLoads.B / v1;
      const i3 = cir.reflectedPhaseLoads.ThreePhase / v3;

      const isSubL2L = getActivePoles(cir.mcbP) !== 1;
      if (isSubL2L) {
        ir = ir * 2;
        iy = iy * 2;
        ib = ib * 2;
      }

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
          phaseDesignCurrents[ph as keyof typeof phaseDesignCurrents] +=
            designI;
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
      const mcIs3P =
        mc.is3PhaseMarker !== undefined
          ? mc.is3PhaseMarker
          : mc.phases && mc.phases.length === 3;
      const largestIs3P =
        largestMotorCir.is3PhaseMarker !== undefined
          ? largestMotorCir.is3PhaseMarker
          : largestMotorCir.phases && largestMotorCir.phases.length === 3;

      const mcV =
        mc.voltage ||
        getPanelSystemVoltageFallback(p.system, mcIs3P, p.connectionType);
      const largestV =
        largestMotorCir.voltage ||
        getPanelSystemVoltageFallback(p.system, largestIs3P, p.connectionType);

      const mcI = mcIs3P ? mc.loadVA / (mcV * 1.732) : mc.loadVA / mcV;
      const largestI = largestIs3P
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
    Object.keys(phaseBaseCurrents).forEach((ph) => {
      phaseBaseCurrents[ph as keyof typeof phaseBaseCurrents] = Math.max(
        0,
        phaseBaseCurrents[ph as keyof typeof phaseBaseCurrents] - demandReductionI
      );
    });
    Object.keys(phaseDesignCurrents).forEach((ph) => {
      phaseDesignCurrents[ph as keyof typeof phaseDesignCurrents] = Math.max(
        phaseBaseCurrents[ph as keyof typeof phaseBaseCurrents],
        phaseDesignCurrents[ph as keyof typeof phaseDesignCurrents] - demandReductionI
      );
    });
  }

  let maxBaseAmp = p.system.includes("3PH") 
    ? Math.max(phaseBaseCurrents.R, phaseBaseCurrents.Y, phaseBaseCurrents.B)
    : Math.max(phaseBaseCurrents.R, Math.max(phaseBaseCurrents.Y, phaseBaseCurrents.B));
  
  let maxDesignAmp = p.system.includes("3PH")
    ? Math.max(phaseDesignCurrents.R, phaseDesignCurrents.Y, phaseDesignCurrents.B)
    : Math.max(phaseDesignCurrents.R, Math.max(phaseDesignCurrents.Y, phaseDesignCurrents.B));

  let globalHML = motorCircuits.length > 0 ? Math.max(...motorCircuits.map(cir => {
      const is3Phase = cir.phases && cir.phases.length === 3;
      let cirV = cir.voltage || getPanelSystemVoltageFallback(p.system, is3Phase, p.connectionType);
      return is3Phase ? cir.loadVA / (cirV * 1.732) : cir.loadVA / cirV;
  })) : 0;

  // Track some metadata for display
  const phaseAmps = { R: 0, Y: 0, B: 0, threePhase: 0 };
  c.forEach((cir) => {
    if (isIdleSpareOrSpace(cir)) return;

    const is3P =
      cir.is3PhaseMarker !== undefined
        ? cir.is3PhaseMarker
        : cir.phases && cir.phases.length === 3;
    let cirV =
      cir.voltage ||
      getPanelSystemVoltageFallback(p.system, is3P, p.connectionType);

    if (
      cir.loadType === LoadType.SUB_PANEL ||
      cir.loadType === LoadType.SUB_SUB_PANEL
    ) {
      cirV = cir.voltage || cirV;
    }

    if (
      cir.subPanelReflectionMode === "phase_loads" &&
      cir.reflectedPhaseAmps
    ) {
      phaseAmps.R += cir.reflectedPhaseAmps.R;
      phaseAmps.Y += cir.reflectedPhaseAmps.Y;
      phaseAmps.B += cir.reflectedPhaseAmps.B;
      phaseAmps.threePhase += cir.reflectedPhaseAmps.ThreePhase;
    } else if (
      cir.subPanelReflectionMode === "phase_loads" &&
      cir.reflectedPhaseLoads
    ) {
      const is3PhaseMode = p.system.includes("3PH");
      const v3 = is3PhaseMode ? cirV * 1.732 : cirV;
      const v1 = cirV;

      let ir = cir.reflectedPhaseLoads.R / v1;
      let iy = cir.reflectedPhaseLoads.Y / v1;
      let ib = cir.reflectedPhaseLoads.B / v1;
      const i3 = cir.reflectedPhaseLoads.ThreePhase / v3;

      const isSubL2L = getActivePoles(cir.mcbP) !== 1;
      if (isSubL2L) {
        ir = ir * 2;
        iy = iy * 2;
        ib = ib * 2;
      }

      phaseAmps.R += ir;
      phaseAmps.Y += iy;
      phaseAmps.B += ib;
      phaseAmps.threePhase += i3;
    } else {
      let loadA = cir.loadA;
      if (loadA === undefined || loadA === null) {
        loadA = is3P ? cir.loadVA / (cirV * 1.732) : cir.loadVA / cirV;
      }
      if (is3P) {
        phaseAmps.threePhase += loadA;
      } else {
        const pArr = cir.phases || [];
        if (pArr.includes("R")) phaseAmps.R += loadA;
        if (pArr.includes("Y")) phaseAmps.Y += loadA;
        if (pArr.includes("B")) phaseAmps.B += loadA;
      }
    }
  });

  let internalConnectedVA = 0;
  let subPanelDemandAmps = 0;
  
  c.forEach(cir => {
      if (!isIdleSpareOrSpace(cir)) {
          internalConnectedVA += cir.loadVA || 0;
          if (cir.subPanelReflectionMode === "max_demand") {
              subPanelDemandAmps += cir.loadA || 0;
          }
      }
  });

  const is3PH = p.system.includes("3PH");
  let formulaDemandAmp = maxDesignAmp;
  if (is3PH) {
    const totalAmpere = Math.max(phaseAmps.R, phaseAmps.Y, phaseAmps.B);
    const total3Phase = phaseAmps.threePhase;
    formulaDemandAmp = ((totalAmpere * 1.732) * 0.8 + total3Phase + 0.25 * globalHML) * 1.25;
  } else {
    formulaDemandAmp = ((internalConnectedVA / systemVoltage) * 0.8 + 0.25 * globalHML) * 1.25;
  }

  maxDesignAmp = formulaDemandAmp;
  maxBaseAmp = formulaDemandAmp / 1.25;
  let internalDemandCurrent = formulaDemandAmp;

  const mainCurrent = { designAmp: maxDesignAmp, baseAmp: maxBaseAmp };

  // Calculate Main Feeder
  const designAmp = mainCurrent.designAmp;
  const maxBranchAT = Math.max(0, ...c.map((cir) => cir.mcbAT || 0));
  
  // PEC standard: overcurrent protection >= 125% continuous + 100% non-continuous.
  // maxDesignAmp includes this 125% factor from the first pass phaseDesignCurrents.
  // For the Main Breaker, the user specifically requested to implement the allowable 80% rule:
  // This means the Main Breaker must be sized so that it is loaded to a maximum of 80% of its rating.
  // 80% of Rating >= Maximum Demand Current
  let calculatedCb =
    STANDARD_CB_RATINGS.find((r) => r * 0.8 >= maxDesignAmp) || 100;

  if (calculatedCb < maxBranchAT) {
    calculatedCb =
      STANDARD_CB_RATINGS.find((r) => r >= maxBranchAT) || calculatedCb;
  }

  let cb = Math.max(calculatedCb, 30);

  let poles: string | number = p.system.includes("3PH") ? "3P" : "2P";
  if (!p.system.includes("3PH") && p.connectionType === "Line-to-Neutral") {
    poles = "1P";
  }
  const wire = getWireForBreakerLocal(
    cb,
    designAmp,
    p.conductorMaterial || "Copper",
    p.insulationType || "THHN",
    p.temperatureRating as any,
    false,
    false,
    p.mainOverrides?.isOverrideEnabled ? p.mainOverrides?.wireRuns : undefined
  );

  let baseWireSize = wire.size;

  const selectedMainConduitType =
    p.mainConduitType || p.mainOverrides?.conduitType || "PVC";

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
        selectedMainConduitType,
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
    wire.runs || 1,
    p.insulationType || "THHN",
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
    kaic = KAIC_RATINGS.find((k) => k >= faultKA) || 100;
  }
  const cbAF =
    cb <= 50 ? 50 : cb <= 100 ? 100 : cb <= 225 ? 225 : cb <= 400 ? 400 : 600;

  let finalCb = cb;
  let finalAf = cbAF;
  let finalType = type;
  let finalKaic = kaic;
  let finalPoles: string | number = poles;

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

    if (p.mainOverrides.wireSize)
      finalWireSize = Number(p.mainOverrides.wireSize);
    if (p.mainOverrides.wireRuns) finalWireRuns = p.mainOverrides.wireRuns;
    
    // Recalculate compliant main grounding conductor size
    const calculatedMainGroundSizeStr = getGroundWireForWireSizeLocal(
      finalWireSize,
      finalCb,
      p.conductorMaterial || "Copper"
    );

    let finalGroundSizeOverride = p.mainOverrides.groundSize;
    if (finalGroundSizeOverride) {
      const overrideVal = parseFloat(finalGroundSizeOverride) || 0;
      const minVal = parseFloat(calculatedMainGroundSizeStr) || 0;
      const maxVal = finalWireSize || 0;
      if (overrideVal < minVal || overrideVal > maxVal) {
        finalGroundSizeOverride = undefined;
      }
    }

    finalGroundSize = finalGroundSizeOverride || calculatedMainGroundSizeStr;

    if (p.mainOverrides.conduitType)
      finalConduitType = p.mainOverrides.conduitType;

    // Retrieve full conduit details to get the minimum size for safe validation
    const mainConduitDetails = getConduitFillDetails(
      finalWireSize,
      finalGroundSize,
      finalPoles,
      p.system,
      finalConduitType,
      finalWireRuns,
      p.insulationType || "THHN",
      p.mainOverrides.conduitSize
    );

    let finalConduitSizeOverride = p.mainOverrides.conduitSize;
    if (finalConduitSizeOverride) {
      const overrideVal = parseInt(finalConduitSizeOverride) || 0;
      const minVal = parseInt(mainConduitDetails.minimumSize) || 0;
      if (overrideVal < minVal) {
        finalConduitSizeOverride = undefined;
      }
    }

    // Recompute final conduit size with sanitized override
    const finalConduitDetails = getConduitFillDetails(
      finalWireSize,
      finalGroundSize,
      finalPoles,
      p.system,
      finalConduitType,
      finalWireRuns,
      p.insulationType || "THHN",
      finalConduitSizeOverride
    );
    finalConduitSize = finalConduitDetails.conduitSize;

    // Sync any auto-cleared overrides back to the panel's mainOverrides mutable config
    if (p.mainOverrides.groundSize !== finalGroundSizeOverride) {
      p.mainOverrides.groundSize = finalGroundSizeOverride;
    }
    if (p.mainOverrides.conduitSize !== finalConduitSizeOverride) {
      p.mainOverrides.conduitSize = finalConduitSizeOverride;
    }
  }

  const mat = p.conductorMaterial || "Copper";
  const ins = p.insulationType || "THHN";
  const temp = (p.temperatureRating as any) || getTemperatureForInsulation(ins);
  let finalWireAmpacity =
    getConductorAmpacity(finalWireSize, mat, temp) * finalWireRuns;

  const maxPhaseLoad = Math.max(phaseLoads.R, phaseLoads.Y, phaseLoads.B);
  const phaseImbalance =
    p.system.includes("3PH") && maxPhaseLoad > 0
      ? (1 -
          Math.min(phaseLoads.R, phaseLoads.Y, phaseLoads.B) / maxPhaseLoad) *
        100
      : 0;

  const isPanel3Phase = p.system.includes("3PH");
  const totalConnectedAmps = isPanel3Phase
    ? totalVA / (systemVoltage * 1.732)
    : totalVA / systemVoltage;

  const maxDemandDetails = {
    is3PH: isPanel3Phase,
    systemVoltage,
    phaseR: phaseAmps.R,
    phaseY: phaseAmps.Y,
    phaseB: phaseAmps.B,
    total3Phase: phaseAmps.threePhase,
    totalAmpere: Math.max(phaseAmps.R, phaseAmps.Y, phaseAmps.B),
    totalConnectedVA: totalVA,
    totalConnectedAmps,
    internalConnectedVA,
    HML: globalHML,
    baseAmp: maxBaseAmp,
    connectionType: p.connectionType || "Line-to-Line",
    internalDemandCurrent,
    subPanelDemandAmps,
  };

  return {
    totalVA,
    totalConnectedAmps,
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
        designAmp: designAmp,
        faultCurrentA: options?.faultCurrentA ?? 10000,
      },
    },
  };
};
