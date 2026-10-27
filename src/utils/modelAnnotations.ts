/**
 * Placement of DXF annotations (text, labels, dimensions) over an imported 3D model, and a simple
 * overlap resolver shared by the 3D viewer, the 2D plan and the exports.
 *
 * DXF point (X east, Y north, Z up, drawing units)
 *   -> rotate about Z by set.rotation -> metres (unitMetres x model calibration)
 *   -> scene axes (x = X, y = Z, z = -Y) -> + model placement shift -> + set.offset
 */
import type { AnnotationSet, ImportedModelInfo, ModelAnnotation } from "../types";
import { UNIT_SCALE } from "./modelImport";
import { distanceToWalls, pointInPolygon, toRoomPoints, type RoomPoint } from "./roomGeometry";

export interface ScenePoint {
  x: number;
  y: number;
  z: number;
}

/** Model calibration factor (1 unless the model scale was calibrated from a measurement) */
const calibration = (info: ImportedModelInfo) => info.scale / (UNIT_SCALE[info.unit] || 1);

export function dxfToScene(p: { x: number; y: number; z: number }, set: AnnotationSet, info: ImportedModelInfo): ScenePoint {
  const r = (set.rotation * Math.PI) / 180;
  const X = p.x * Math.cos(r) - p.y * Math.sin(r);
  const Y = p.x * Math.sin(r) + p.y * Math.cos(r);
  const k = set.unitMetres * calibration(info);
  const sh = info.placementShift || { x: 0, y: 0, z: 0 };
  return { x: X * k + sh.x + set.offset.x, y: p.z * k + sh.y + set.offset.y, z: -Y * k + sh.z + set.offset.z };
}

export function sceneToDxf(p: ScenePoint, set: AnnotationSet, info: ImportedModelInfo) {
  const k = set.unitMetres * calibration(info) || 1;
  const sh = info.placementShift || { x: 0, y: 0, z: 0 };
  const X = (p.x - sh.x - set.offset.x) / k;
  const Y = -(p.z - sh.z - set.offset.z) / k;
  const Z = (p.y - sh.y - set.offset.y) / k;
  const r = (-set.rotation * Math.PI) / 180;
  return { x: X * Math.cos(r) - Y * Math.sin(r), y: X * Math.sin(r) + Y * Math.cos(r), z: Z };
}

/** Height in metres and plan rotation (degrees CCW, scene plan) of an annotation */
export const annotationMetres = (a: ModelAnnotation, set: AnnotationSet, info: ImportedModelInfo) => ({
  height: a.height * set.unitMetres * calibration(info),
  rotation: a.rotation + set.rotation,
});

export const isShown = (a: ModelAnnotation, set: AnnotationSet) => a.visible && !(set.hiddenLayers || []).includes(a.layer);

/** Rough text width for layout (no font metrics outside the browser): 0.6 x height per character */
export const textWidth = (text: string, height: number) =>
  Math.max(...text.split("\n").map((l) => l.length), 1) * height * 0.6;

/** Annotation in room coordinates (metres from the design room's north-west corner) */
export interface RoomAnnotation {
  id: string;
  text: string;
  x: number;
  z: number;
  height: number;
  rotation: number;
  hAlign: ModelAnnotation["hAlign"];
  vAlign: ModelAnnotation["vAlign"];
  kind: ModelAnnotation["kind"];
  dim?: { x1: number; z1: number; x2: number; z2: number };
}

/**
 * Visible annotations of the design room's storey that lie inside (or within `margin` metres of) the
 * design room outline, in room coordinates.
 */
export function annotationsForRoom(info: ImportedModelInfo | undefined, roomOutline: RoomPoint[], margin = 0.6): RoomAnnotation[] {
  const set = info?.annotations;
  const room = info?.rooms.find((r) => r.id === info.activeRoomId);
  if (!info || !set || !room || !info.roomOffset) return [];
  const off = info.roomOffset;
  const floor = room.floorElevation;
  const top = floor + (room.ceilingHeight || 3) + 0.6;
  const world = toRoomPoints(room.polygon) || [];
  // Inside the room, or within the margin of its walls (dimensions and wall notes sit on the walls);
  // text in a neighbouring room is left out, even inside the outline's bounding box (L / U rooms)
  const near = (x: number, z: number) => pointInPolygon(x, z, world) || distanceToWalls(x, z, world) <= margin;
  void roomOutline;
  const out: RoomAnnotation[] = [];
  for (const a of set.items) {
    if (!isShown(a, set)) continue;
    const p = dxfToScene(a, set, info);
    if (p.y < floor - 0.6 || p.y > top) continue;
    if (!near(p.x, p.z)) continue;
    const m = annotationMetres(a, set, info);
    const ra: RoomAnnotation = { id: a.id, text: a.text, x: p.x - off.x, z: p.z - off.z, height: m.height, rotation: m.rotation, hAlign: a.hAlign, vAlign: a.vAlign, kind: a.kind };
    if (a.dim) {
      const p1 = dxfToScene({ x: a.dim.x1, y: a.dim.y1, z: a.dim.z1 }, set, info);
      const p2 = dxfToScene({ x: a.dim.x2, y: a.dim.y2, z: a.dim.z2 }, set, info);
      ra.dim = { x1: p1.x - off.x, z1: p1.z - off.z, x2: p2.x - off.x, z2: p2.z - off.z };
    }
    out.push(ra);
  }
  return out;
}

/** A leader back to the original point only when the text moved more than about one line away */
export const needsLeader = (mv: { dx: number; dz: number }, lineHeight: number) => Math.hypot(mv.dx, mv.dz) > lineHeight * 1.6;

export interface LayoutBox {
  id: string;
  /** Anchor point (plan, any units with z increasing southward / downward) */
  x: number;
  z: number;
  width: number;
  height: number;
  /** Degrees CCW in plan (north up) */
  rotation: number;
  hAlign: ModelAnnotation["hAlign"];
  vAlign: ModelAnnotation["vAlign"];
}

/** Axis-aligned extent of a rotated text box anchored at (x, z) */
function extent(b: LayoutBox, dx = 0, dz = 0) {
  const ax = b.hAlign === "left" ? 0 : b.hAlign === "center" ? -b.width / 2 : -b.width;
  const ay = b.vAlign === "bottom" ? 0 : b.vAlign === "middle" ? -b.height / 2 : -b.height; // local up
  const r = (b.rotation * Math.PI) / 180;
  const ux = [Math.cos(r), -Math.sin(r)]; // text direction in plan (z down)
  const uy = [-Math.sin(r), -Math.cos(r)]; // text "up" in plan
  const corners = [
    [ax, ay], [ax + b.width, ay], [ax, ay + b.height], [ax + b.width, ay + b.height],
  ].map(([lx, ly]) => [b.x + dx + lx * ux[0] + ly * uy[0], b.z + dz + lx * ux[1] + ly * uy[1]]);
  const xs = corners.map((c) => c[0]);
  const zs = corners.map((c) => c[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}

/**
 * Keep texts at their original points; when two overlap, the later (smaller) one is moved along its
 * own "up" direction in steps of its height until it is clear (up to 8 steps each way).
 * Returns the displacement of every box (0 when not moved).
 */
export function resolveOverlaps(boxes: LayoutBox[]): Map<string, { dx: number; dz: number }> {
  const result = new Map<string, { dx: number; dz: number }>();
  const placed: { x0: number; x1: number; z0: number; z1: number }[] = [];
  const hit = (e: { x0: number; x1: number; z0: number; z1: number }) =>
    placed.some((p) => e.x0 < p.x1 && e.x1 > p.x0 && e.z0 < p.z1 && e.z1 > p.z0);
  const order = [...boxes].sort((a, b) => b.height * b.width - a.height * a.width);
  for (const b of order) {
    let best = { dx: 0, dz: 0 };
    let e = extent(b);
    if (hit(e)) {
      const r = (b.rotation * Math.PI) / 180;
      const up = [-Math.sin(r), -Math.cos(r)];
      let found = false;
      for (let k = 1; k <= 8 && !found; k++) {
        for (const s of [1, -1]) {
          const step = s * k * b.height * 1.25;
          const cand = { dx: up[0] * step, dz: up[1] * step };
          const ce = extent(b, cand.dx, cand.dz);
          if (!hit(ce)) { best = cand; e = ce; found = true; break; }
        }
      }
    }
    placed.push(e);
    result.set(b.id, best);
  }
  return result;
}
