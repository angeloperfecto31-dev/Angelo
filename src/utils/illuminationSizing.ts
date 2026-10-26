/**
 * Lumen-method sizing for the Illumination module, shared by the calculator, saved rooms, the
 * dashboard and the reports so every place shows the same required quantity.
 *
 *   Φ_required = E × A / (UF × MF)          total lamp lumens needed on the working plane
 *   N          = ⌈Φ_required / Φ_luminaire⌉  luminaires required
 *   E_achieved = N × Φ_luminaire × UF × MF / A
 *
 * UF (utilization factor / CU) depends on the room index and the surface reflectances:
 *   RI = 2A / (hm × P), which for a rectangle is L × W / (hm × (L + W)),
 *   hm = luminaire height above the working plane.
 * The user's CU is the luminaire's value in a reference room (RI 2.0, reflectances 70/50/20 %);
 * it is scaled by a typical utilization table to the actual room index and reflectances.
 */

import { RoomShapeId, RoomVertex, getRoomOutline, polygonArea, polygonPerimeter } from "./roomGeometry";

/** Room-index columns of the utilization table */
const RI_STEPS = [0.6, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0];

/**
 * Typical utilization factors of a general-purpose (direct, wide-beam) luminaire for floor
 * reflectance 20 %, by ceiling reflectance → wall reflectance → room index (RI_STEPS).
 */
const UF_TABLE: Record<number, Record<number, number[]>> = {
  0.7: {
    0.5: [0.37, 0.43, 0.49, 0.55, 0.6, 0.66, 0.71, 0.74, 0.78, 0.81],
    0.3: [0.29, 0.35, 0.41, 0.47, 0.52, 0.59, 0.65, 0.69, 0.74, 0.77],
    0.1: [0.24, 0.29, 0.35, 0.41, 0.46, 0.54, 0.6, 0.64, 0.7, 0.74],
  },
  0.5: {
    0.5: [0.35, 0.4, 0.46, 0.51, 0.55, 0.61, 0.65, 0.68, 0.72, 0.74],
    0.3: [0.28, 0.33, 0.39, 0.44, 0.49, 0.55, 0.6, 0.63, 0.68, 0.71],
    0.1: [0.23, 0.28, 0.34, 0.39, 0.43, 0.5, 0.55, 0.59, 0.64, 0.67],
  },
  0.3: {
    0.5: [0.33, 0.38, 0.43, 0.48, 0.52, 0.57, 0.61, 0.64, 0.67, 0.7],
    0.3: [0.27, 0.32, 0.37, 0.42, 0.46, 0.52, 0.56, 0.6, 0.64, 0.66],
    0.1: [0.22, 0.27, 0.33, 0.37, 0.41, 0.48, 0.52, 0.56, 0.61, 0.64],
  },
};
const REFERENCE = { ri: 2.0, ceiling: 0.7, wall: 0.5, floor: 0.2 };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Linear interpolation along a sorted axis (values clamped to its ends) */
function interpAxis(axis: number[], values: number[], x: number) {
  const v = clamp(x, axis[0], axis[axis.length - 1]);
  let i = 0;
  while (i < axis.length - 2 && v > axis[i + 1]) i++;
  return lerp(values[i], values[i + 1], (v - axis[i]) / (axis[i + 1] - axis[i]));
}

/** Table utilization factor for a room index and reflectances (bilinear in ceiling and wall) */
export function tableUtilizationFactor(roomIndex: number, ceiling: number, wall: number, floor = 0.2): number {
  const ceilings = [0.3, 0.5, 0.7];
  const walls = [0.1, 0.3, 0.5];
  const atCeiling = (c: number) => interpAxis(walls, walls.map((w) => interpAxis(RI_STEPS, UF_TABLE[c][w], roomIndex)), wall);
  const uf = interpAxis(ceilings, ceilings.map(atCeiling), ceiling);
  // Floor reflectance: about ±1 % of UF per 0.1 change from the 20 % reference (inter-reflection)
  return uf * (1 + (clamp(floor, 0, 0.5) - REFERENCE.floor) * 0.1);
}

/** The luminaire's CU (given for the reference room) adjusted to this room */
export function effectiveUtilizationFactor(
  baseCU: number,
  roomIndex: number,
  ceiling = REFERENCE.ceiling,
  wall = REFERENCE.wall,
  floor = REFERENCE.floor
): number {
  const ratio = tableUtilizationFactor(roomIndex, ceiling, wall, floor) / tableUtilizationFactor(REFERENCE.ri, REFERENCE.ceiling, REFERENCE.wall, REFERENCE.floor);
  return clamp((baseCU || 0.6) * ratio, 0.1, 0.95);
}

/** Room index from area, perimeter and luminaire height above the working plane */
export const roomIndexOf = (area: number, perimeter: number, hm: number) => (area > 0 && perimeter > 0 && hm > 0 ? (2 * area) / (hm * perimeter) : 0);

/** Lumens per luminaire of the installed mix (quantity-weighted when several types are combined) */
export function designLumensPerUnit(
  activeFixtures: { lumens: number; quantity: number }[] | undefined,
  fallbackLumens: number
): number {
  const list = (activeFixtures || []).filter((f) => (f.lumens || 0) > 0);
  if (list.length === 1) return list[0].lumens;
  const qty = list.reduce((s, f) => s + Math.max(0, f.quantity || 0), 0);
  if (list.length > 1 && qty > 0) return list.reduce((s, f) => s + f.lumens * Math.max(0, f.quantity || 0), 0) / qty;
  if (list.length > 1) return list.reduce((s, f) => s + f.lumens, 0) / list.length;
  return fallbackLumens || 1;
}

export interface LumenSizing {
  utilizationFactor: number;
  totalLumensRequired: number;
  fixturesRequired: number;
}

/** Lumen-method sizing for one room */
export function sizeLumenMethod(opts: {
  targetLux: number;
  area: number;
  utilizationFactor: number;
  maintenanceFactor: number;
  lumensPerUnit: number;
}): LumenSizing {
  const uf = clamp(opts.utilizationFactor || 0.6, 0.05, 1);
  const mf = clamp(opts.maintenanceFactor || 0.8, 0.05, 1);
  const total = opts.area > 0 && opts.targetLux > 0 ? (opts.targetLux * opts.area) / (uf * mf) : 0;
  const per = opts.lumensPerUnit > 0 ? opts.lumensPerUnit : 1;
  // Round to 6 decimals first so an exact fit (e.g. 20.000000001) does not add a luminaire
  const n = total > 0 ? Math.ceil(Math.round((total / per) * 1e6) / 1e6) : 0;
  return { utilizationFactor: uf, totalLumensRequired: total, fixturesRequired: n };
}

/** Average maintained illuminance from installed lamp lumens (lumen method) */
export const achievedLux = (installedLumens: number, area: number, utilizationFactor: number, maintenanceFactor: number) =>
  area > 0 ? (installedLumens * utilizationFactor * maintenanceFactor) / area : 0;

/**
 * Required and installed quantities for stored Illumination parameters (dashboard and reports),
 * using the same lumen method as the calculator.
 */
export function illuminationDesignSummary(p: {
  inputMode?: "dimensions" | "area";
  userArea?: number;
  roomWidth?: number;
  roomLength?: number;
  roomShape?: RoomShapeId;
  roomPolygon?: RoomVertex[];
  ceilingHeight?: number;
  workingPlaneHeight?: number;
  mountingHeight?: number;
  targetLux: number;
  lumensPerFixture?: number;
  coefficientOfUtilization?: number;
  maintenanceFactor?: number;
  ceilingReflectance?: number;
  wallReflectance?: number;
  floorReflectance?: number;
  activeFixtures?: { lumens: number; wattage: number; quantity: number }[];
  isManualQuantity?: boolean;
  manualQuantity?: number;
}) {
  const ceiling = p.ceilingHeight || 2.7;
  const wp = p.workingPlaneHeight || 0.75;
  const hm = p.mountingHeight !== undefined && Number.isFinite(p.mountingHeight) && p.mountingHeight > 0 ? p.mountingHeight : Math.max(0.1, ceiling - wp);
  const isDims = p.inputMode !== "area" && (p.roomWidth || 0) > 0 && (p.roomLength || 0) > 0;
  const outline = getRoomOutline({ roomShape: p.roomShape, roomPolygon: p.roomPolygon, roomWidth: p.roomWidth, roomLength: p.roomLength });
  const area = p.inputMode === "area" ? p.userArea || 0 : polygonArea(outline);
  const roomIndex = isDims ? roomIndexOf(area, polygonPerimeter(outline), hm) : 2.0;
  const uf = effectiveUtilizationFactor(p.coefficientOfUtilization || 0.6, roomIndex, p.ceilingReflectance ?? 0.7, p.wallReflectance ?? 0.5, p.floorReflectance ?? 0.2);
  const mf = p.maintenanceFactor || 0.8;
  const lumensPerUnit = designLumensPerUnit(p.activeFixtures, p.lumensPerFixture || 3600);
  const sizing = sizeLumenMethod({ targetLux: p.targetLux, area, utilizationFactor: uf, maintenanceFactor: mf, lumensPerUnit });

  const list = p.activeFixtures || [];
  let installedCount = list.reduce((s, f) => s + (f.quantity || 0), 0);
  if (p.isManualQuantity && p.manualQuantity !== undefined && list.length <= 1) installedCount = p.manualQuantity;
  if (list.length === 0 && !p.isManualQuantity) installedCount = sizing.fixturesRequired;
  const installedLumens = list.length > 1 ? list.reduce((s, f) => s + (f.quantity || 0) * (f.lumens || 0), 0) : installedCount * lumensPerUnit;
  const installedWatts = list.length > 1 ? list.reduce((s, f) => s + (f.quantity || 0) * (f.wattage || 0), 0) : installedCount * (list[0]?.wattage || 0);

  return {
    area,
    roomIndex,
    hm,
    utilizationFactor: uf,
    maintenanceFactor: mf,
    lumensPerUnit,
    totalLumensRequired: sizing.totalLumensRequired,
    fixturesRequired: sizing.fixturesRequired,
    installedCount,
    installedLumens,
    installedWatts,
    achievedLux: achievedLux(installedLumens, area, uf, mf),
  };
}
