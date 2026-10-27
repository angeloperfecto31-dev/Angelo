/**
 * Floors (storeys) of an imported multi-floor model, and the floor grouping / totals used by the
 * Illumination screens and the reports.
 *
 * Elevations are in metres above the lowest point of the placed model (the same datum as
 * ImportedModelRoom.floorElevation and ImportedModelInfo.sectionElevation).
 */
import type { IlluminationParams, ImportedModelInfo, ModelFloor, SavedLightingDetail } from "../types";

/** "Ground Floor", "2nd Floor", "3rd Floor", "4th Floor", ... (index 0 = ground) */
export function ordinalFloorName(index: number): string {
  if (index <= 0) return "Ground Floor";
  const n = index + 1;
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : n % 10 === 1 ? "st" : "th";
  return `${n}${suffix} Floor`;
}

/** Order of a floor from its name when no elevation is known (Ground = 0, 2nd = 1, Basement = -1) */
export function floorOrderFromName(name: string): number {
  const s = name.trim().toLowerCase();
  if (/^(ground|gf|g\/f|1st|first)\b/.test(s)) return 0;
  if (/basement|^b\d?\b|lower ground/.test(s)) return -1;
  if (/roof/.test(s)) return 99;
  const m = /^(\d+)/.exec(s);
  return m ? Number(m[1]) - 1 : 50;
}

export const newFloorId = () => `fl-${Math.random().toString(36).slice(2, 9)}`;

/** Floors from detected levels, named Ground Floor, 2nd Floor, ... */
export function floorsFromLevels(levels: number[]): ModelFloor[] {
  return [...levels].sort((p, q) => p - q).map((elevation, i) => ({ id: newFloorId(), name: ordinalFloorName(i), elevation, visible: true }));
}

export const sortedFloors = (floors: ModelFloor[] = []) => [...floors].sort((p, q) => p.elevation - q.elevation);

/** The floor an elevation belongs to: the highest floor at or below it (30 cm tolerance) */
export function floorOf(floors: ModelFloor[] | undefined, elevation: number): ModelFloor | undefined {
  const list = sortedFloors(floors);
  if (!list.length) return undefined;
  let found = list[0];
  for (const f of list) if (f.elevation <= elevation + 0.3) found = f;
  return found;
}

/** Top of a floor: the next floor's level, or the top of the model */
export function floorTop(floors: ModelFloor[] | undefined, floor: ModelFloor, modelTop: number): number {
  const next = sortedFloors(floors).find((f) => f.elevation > floor.elevation + 1e-6);
  return next ? next.elevation : Math.max(modelTop, floor.elevation + 2.4);
}

/** Plan section level used to trace this floor's rooms: about 1.2 m above the floor, below the next */
export function floorSectionElevation(floors: ModelFloor[] | undefined, floor: ModelFloor, modelTop: number): number {
  const h = floorTop(floors, floor, modelTop) - floor.elevation;
  const cut = Math.min(Math.max(h * 0.45, 1.0), 1.5, Math.max(0.3, h - 0.3));
  return Math.round((floor.elevation + cut) * 100) / 100;
}

// ---------------------------------------------------------------------------------- project rooms

export interface FloorRef {
  id?: string;
  name: string;
  /** Floor level (m) for ordering; from the model, or estimated from the name */
  level: number;
}

/** Floor of a room in Rooms & Properties: from its imported-model room, else the floor set on it */
export function savedRoomFloor(params: Pick<IlluminationParams, "importedModel">, room: SavedLightingDetail): FloorRef | null {
  const info: ImportedModelInfo | undefined = params.importedModel;
  if (room.sourceModelRoomId && info?.floors?.length) {
    const mr = info.rooms.find((r) => r.id === room.sourceModelRoomId);
    const f = mr ? floorOf(info.floors, mr.floorElevation) : undefined;
    if (f) return { id: f.id, name: f.name, level: f.elevation };
  }
  if (room.floorName && room.floorName.trim()) {
    return { id: room.floorId, name: room.floorName.trim(), level: room.floorLevel ?? floorOrderFromName(room.floorName) * 3 };
  }
  return null;
}

export interface FloorTotals {
  rooms: number;
  area: number;
  fixtures: number;
  required: number;
  watts: number;
  lumens: number;
  /** W/m² */
  lpd: number;
  /** Area-weighted average maintained illuminance (lumen method), lx */
  avgLux: number;
  /** Area-weighted target illuminance, lx */
  avgTargetLux: number;
}

/** Maintained average illuminance of a saved room by the lumen method: E = Φ · UF · MF / A */
export function savedRoomAchievedLux(room: SavedLightingDetail): number {
  const area = room.area || 0;
  if (area <= 0) return 0;
  const uf = room.coefficientOfUtilization ?? 0.6;
  const mf = room.maintenanceFactor ?? 0.8;
  return (room.totalLumens || 0) * uf * mf / area;
}

export function floorTotals(rooms: SavedLightingDetail[]): FloorTotals {
  const area = rooms.reduce((s, r) => s + (r.area || 0), 0);
  const watts = rooms.reduce((s, r) => s + (r.totalWattage || 0), 0);
  return {
    rooms: rooms.length,
    area,
    fixtures: rooms.reduce((s, r) => s + (r.fixturesCount || 0), 0),
    required: rooms.reduce((s, r) => s + (r.requiredFixtures ?? r.fixturesCount ?? 0), 0),
    watts,
    lumens: rooms.reduce((s, r) => s + (r.totalLumens || 0), 0),
    lpd: area > 0 ? watts / area : 0,
    avgLux: area > 0 ? rooms.reduce((s, r) => s + savedRoomAchievedLux(r) * (r.area || 0), 0) / area : 0,
    avgTargetLux: area > 0 ? rooms.reduce((s, r) => s + (r.targetLux || 0) * (r.area || 0), 0) / area : 0,
  };
}

export interface FloorGroup {
  key: string;
  /** Floor name, or "No floor set" */
  name: string;
  level: number;
  rooms: SavedLightingDetail[];
  totals: FloorTotals;
}

/**
 * Rooms grouped by floor, lowest floor first (rooms without a floor last). Returns null when no room
 * has a floor, so single-storey projects keep their flat lists.
 */
export function groupSavedRoomsByFloor(params: Pick<IlluminationParams, "importedModel">, rooms: SavedLightingDetail[]): FloorGroup[] | null {
  const refs = rooms.map((r) => savedRoomFloor(params, r));
  if (!refs.some(Boolean)) return null;
  const map = new Map<string, { name: string; level: number; rooms: SavedLightingDetail[] }>();
  rooms.forEach((r, i) => {
    const f = refs[i];
    // Same floor name = same floor (rooms set by hand join the model's floor of that name)
    const key = f ? `name:${f.name.toLowerCase()}` : "none";
    if (!map.has(key)) map.set(key, { name: f ? f.name : "No floor set", level: f ? f.level : Number.MAX_SAFE_INTEGER, rooms: [] });
    const g = map.get(key)!;
    if (f) g.level = Math.min(g.level, f.level);
    g.rooms.push(r);
  });
  return [...map.entries()]
    .map(([key, g]) => ({ key, ...g, totals: floorTotals(g.rooms) }))
    .sort((p, q) => p.level - q.level || p.name.localeCompare(q.name));
}

/** One-line floor summary for report headings */
export function floorSummaryLine(g: FloorGroup): string {
  const t = g.totals;
  return `${g.name.toUpperCase()} - ${t.rooms} room${t.rooms === 1 ? "" : "s"}, ${t.area.toFixed(2)} m², ${t.fixtures} luminaires, ${Math.round(t.watts)} W, LPD ${t.lpd.toFixed(2)} W/m², Eavg ${Math.round(t.avgLux)} lx`;
}
