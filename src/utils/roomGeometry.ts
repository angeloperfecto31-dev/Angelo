/**
 * Room outline geometry for the Illumination module.
 *
 * A room is a simple polygon in metres on the floor plane: x runs west → east (0..roomWidth) and
 * z runs north → south (0..roomLength), the same axes the luminaire positions use. Every outline is
 * normalised so its bounding box starts at (0, 0); roomWidth / roomLength are that bounding box.
 *
 * Presets: rectangle, L, T and U shapes from two cut-out dimensions; "custom" is any polygon drawn on
 * the editor or built from wall lengths and interior angles.
 */

export type RoomShapeId = "rectangle" | "l-shape" | "t-shape" | "u-shape" | "custom";
export type RoomPoint = [number, number];
/** Stored form of a vertex (objects, since Firestore cannot hold nested arrays) */
export interface RoomVertex {
  x: number;
  z: number;
}

export const toRoomPoints = (v?: RoomVertex[]): RoomPoint[] | undefined => v?.map((p) => [p.x, p.z] as RoomPoint);
export const toRoomVertices = (p?: RoomPoint[]): RoomVertex[] | undefined => p?.map(([x, z]) => ({ x, z }));

/** Two extra dimensions of the L, T and U presets (labels per shape in ROOM_SHAPE_DIM_LABELS) */
export interface RoomShapeDims {
  a: number;
  b: number;
}

export interface RoomWall {
  /** Wall length (m) */
  length: number;
  /** Interior angle (degrees) at the wall's end vertex */
  angle: number;
}

export const ROOM_SHAPES: { id: RoomShapeId; label: string }[] = [
  { id: "rectangle", label: "Rectangle" },
  { id: "l-shape", label: "L-Shape" },
  { id: "t-shape", label: "T-Shape" },
  { id: "u-shape", label: "U-Shape" },
  { id: "custom", label: "Custom Polygon" },
];

export const ROOM_SHAPE_DIM_LABELS: Partial<Record<RoomShapeId, { a: string; b: string }>> = {
  "l-shape": { a: "Cut-out Width (m)", b: "Cut-out Length (m)" },
  "t-shape": { a: "Stem Width (m)", b: "Top Wing Depth (m)" },
  "u-shape": { a: "Opening Width (m)", b: "Opening Depth (m)" },
};

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const MIN_LEG = 0.3;

/** Default cut-out dimensions for a preset on a W × L bounding box */
export function defaultShapeDims(shape: RoomShapeId, width: number, length: number): RoomShapeDims {
  switch (shape) {
    case "t-shape":
      return { a: round3(width * 0.4), b: round3(length * 0.4) };
    case "u-shape":
      return { a: round3(width * 0.4), b: round3(length * 0.5) };
    default:
      return { a: round3(width * 0.5), b: round3(length * 0.5) };
  }
}

/** Outline of a preset; the cut-out dimensions are clamped so every leg keeps at least 0.3 m */
export function presetPolygon(shape: RoomShapeId, width: number, length: number, dims?: RoomShapeDims): RoomPoint[] {
  const W = Math.max(MIN_LEG * 3, width || 0);
  const L = Math.max(MIN_LEG * 3, length || 0);
  const d = dims || defaultShapeDims(shape, W, L);
  const clampA = (v: number) => Math.min(W - MIN_LEG * 2, Math.max(MIN_LEG, v || 0));
  const clampB = (v: number) => Math.min(L - MIN_LEG, Math.max(MIN_LEG, v || 0));

  switch (shape) {
    case "l-shape": {
      // Corner cut out at the north-east
      const a = Math.min(W - MIN_LEG, Math.max(MIN_LEG, d.a || 0));
      const b = clampB(d.b);
      return [[0, 0], [W - a, 0], [W - a, b], [W, b], [W, L], [0, L]];
    }
    case "t-shape": {
      // Full-width wing along the north wall, stem centred to the south
      const s = clampA(d.a);
      const b = clampB(d.b);
      const x1 = (W - s) / 2;
      const x2 = (W + s) / 2;
      return [[0, 0], [W, 0], [W, b], [x2, b], [x2, L], [x1, L], [x1, b], [0, b]];
    }
    case "u-shape": {
      // Opening on the south wall
      const o = clampA(d.a);
      const b = clampB(d.b);
      const x1 = (W - o) / 2;
      const x2 = (W + o) / 2;
      return [[0, 0], [W, 0], [W, L], [x2, L], [x2, L - b], [x1, L - b], [x1, L], [0, L]];
    }
    default:
      return [[0, 0], [W, 0], [W, L], [0, L]];
  }
}

/** Signed shoelace area; positive when the outline runs clockwise on screen (x right, z down) */
function signedArea(pts: RoomPoint[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    s += x1 * z2 - x2 * z1;
  }
  return s / 2;
}

export const polygonArea = (pts: RoomPoint[]) => (pts.length >= 3 ? Math.abs(signedArea(pts)) : 0);

export function polygonPerimeter(pts: RoomPoint[]): number {
  let p = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    p += Math.hypot(x2 - x1, z2 - z1);
  }
  return p;
}

export function polygonBounds(pts: RoomPoint[]) {
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minZ = Math.min(...zs);
  const maxX = Math.max(...xs);
  const maxZ = Math.max(...zs);
  return { minX, minZ, maxX, maxZ, width: maxX - minX, length: maxZ - minZ };
}

/**
 * Bounding box at (0, 0), clockwise on screen, millimetre rounding, and no repeated or collinear
 * vertices (so wall lists stay meaningful).
 */
export function normalizePolygon(pts: RoomPoint[]): RoomPoint[] {
  if (pts.length < 3) return pts;
  const { minX, minZ } = polygonBounds(pts);
  let out: RoomPoint[] = pts.map(([x, z]) => [round3(x - minX), round3(z - minZ)]);
  out = out.filter((p, i) => {
    const q = out[(i + 1) % out.length];
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.005;
  });
  out = out.filter((p, i) => {
    const prev = out[(i - 1 + out.length) % out.length];
    const next = out[(i + 1) % out.length];
    const cross = (p[0] - prev[0]) * (next[1] - p[1]) - (p[1] - prev[1]) * (next[0] - p[0]);
    const len = Math.hypot(p[0] - prev[0], p[1] - prev[1]) * Math.hypot(next[0] - p[0], next[1] - p[1]);
    return len === 0 || Math.abs(cross) / len > 1e-4;
  });
  if (out.length >= 3 && signedArea(out) < 0) out.reverse();
  return out;
}

/** Room index for any outline: RI = 2A / (hrc · P), which equals L·W / (hrc · (L + W)) for a rectangle */
export function polygonRoomIndex(pts: RoomPoint[], hrc: number): number {
  const p = polygonPerimeter(pts);
  if (p <= 0 || hrc <= 0) return 0;
  return (2 * polygonArea(pts)) / (hrc * p);
}

export function pointInPolygon(x: number, z: number, pts: RoomPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function closestOnSegment(x: number, z: number, a: RoomPoint, b: RoomPoint): RoomPoint {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len2)) : 0;
  return [a[0] + t * dx, a[1] + t * dz];
}

/** Shortest distance from a point to the outline */
export function distanceToWalls(x: number, z: number, pts: RoomPoint[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const c = closestOnSegment(x, z, pts[i], pts[(i + 1) % pts.length]);
    best = Math.min(best, Math.hypot(x - c[0], z - c[1]));
  }
  return best;
}

/** The point itself when it is inside with `inset` clearance, else the nearest point that is */
export function clampPointToPolygon(x: number, z: number, pts: RoomPoint[], inset = 0.05): RoomPoint {
  if (pts.length < 3) return [x, z];
  if (pointInPolygon(x, z, pts) && distanceToWalls(x, z, pts) >= inset) return [x, z];
  // Nearest boundary point, pushed inward along the wall normal (outline is clockwise on screen)
  let best: { p: RoomPoint; d: number; n: RoomPoint } | null = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const c = closestOnSegment(x, z, a, b);
    const d = Math.hypot(x - c[0], z - c[1]);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const n: RoomPoint = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    if (!best || d < best.d) best = { p: c, d, n };
  }
  for (const k of [1, 2, 4, 8]) {
    const cand: RoomPoint = [best!.p[0] + best!.n[0] * inset * k, best!.p[1] + best!.n[1] * inset * k];
    if (pointInPolygon(cand[0], cand[1], pts)) return cand;
  }
  return [x, z];
}

/** True when two non-adjacent walls cross each other */
export function isSelfIntersecting(pts: RoomPoint[]): boolean {
  const n = pts.length;
  const orient = (a: RoomPoint, b: RoomPoint, c: RoomPoint) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  for (let i = 0; i < n; i++) {
    const a1 = pts[i];
    const a2 = pts[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      const b1 = pts[j];
      const b2 = pts[(j + 1) % n];
      if (orient(a1, a2, b1) * orient(a1, a2, b2) < 0 && orient(b1, b2, a1) * orient(b1, b2, a2) < 0) return true;
    }
  }
  return false;
}

/** True when the outline is the plain W × L rectangle */
export function isRectangle(pts: RoomPoint[] | undefined): boolean {
  if (!pts || pts.length !== 4) return !pts || pts.length < 3;
  const { width, length } = polygonBounds(pts);
  return Math.abs(polygonArea(pts) - width * length) < 1e-6;
}

const headingDeg = (a: RoomPoint, b: RoomPoint) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;

/** Walls of a clockwise outline: wall i runs from vertex i to vertex i+1; angle = interior angle at its end */
export function wallsFromPolygon(pts: RoomPoint[]): RoomWall[] {
  const n = pts.length;
  return pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const r = pts[(i + 2) % n];
    let turn = headingDeg(q, r) - headingDeg(p, q);
    while (turn <= -180) turn += 360;
    while (turn > 180) turn -= 360;
    return { length: round3(Math.hypot(q[0] - p[0], q[1] - p[1])), angle: Math.round((180 - turn) * 100) / 100 };
  });
}

/**
 * Rebuild an outline from wall lengths and interior angles, starting at the first vertex in the given
 * heading. Walls 1..n-1 are taken as entered; the last wall closes the room back to the start, so its
 * length and the two angles beside it follow from the others.
 */
export function polygonFromWalls(walls: RoomWall[], startHeadingDeg = 0): RoomPoint[] {
  const pts: RoomPoint[] = [[0, 0]];
  let h = startHeadingDeg;
  for (let i = 0; i < walls.length - 1; i++) {
    const [x, z] = pts[pts.length - 1];
    const rad = (h * Math.PI) / 180;
    const len = Math.max(0.05, walls[i].length || 0);
    pts.push([x + len * Math.cos(rad), z + len * Math.sin(rad)]);
    h += 180 - (walls[i].angle || 180);
  }
  return pts;
}

/** Heading (degrees, clockwise from east) of the first wall, so table edits keep the room's rotation */
export const firstWallHeading = (pts: RoomPoint[]) => (pts.length >= 2 ? headingDeg(pts[0], pts[1]) : 0);

/**
 * Evenly spaced luminaire positions inside the outline. A square lattice is tried over a range of
 * spacings and phase offsets; points must sit inside the room with about a third of the spacing
 * clear of every wall. Layouts with exactly `count` points (or a few more, trimmed by dropping the
 * points closest to the walls) are compared by their worst-case distance from any floor point to the
 * nearest luminaire, and the most even one wins.
 */
export function placePointsInPolygon(pts: RoomPoint[], count: number): RoomPoint[] {
  if (count <= 0 || pts.length < 3) return [];
  const { width, length } = polygonBounds(pts);
  const area = polygonArea(pts);
  const ideal = Math.sqrt(area / count);

  /** Lattice points (spacing sx × sz, first point at ox, oz) inside the room with clearance from the walls */
  const lattice = (sx: number, sz: number, ox: number, oz: number) => {
    const out: { p: RoomPoint; d: number }[] = [];
    const clear = Math.min(sx, sz) * 0.3;
    for (let z = oz; z < length; z += sz) {
      for (let x = ox; x < width; x += sx) {
        if (x <= 0 || z <= 0 || !pointInPolygon(x, z, pts)) continue;
        const d = distanceToWalls(x, z, pts);
        if (d >= clear) out.push({ p: [x, z], d });
      }
    }
    return out;
  };
  const axisOffsets = (span: number, step: number) => {
    const centred = (span - Math.floor(span / step) * step) / 2;
    return centred > step * 0.2 ? [centred, step / 2] : [centred + step / 2, step / 2];
  };

  // Coverage check points: the worst distance from any of them to its nearest luminaire
  const probes: RoomPoint[] = [];
  const pstep = Math.max(width, length) / 24;
  for (let x = pstep / 2; x < width; x += pstep) {
    for (let z = pstep / 2; z < length; z += pstep) {
      if (pointInPolygon(x, z, pts)) probes.push([x, z]);
    }
  }
  const coverage = (list: { p: RoomPoint }[]) => {
    let worst = 0;
    for (const [x, z] of probes) {
      let near = Infinity;
      for (const c of list) near = Math.min(near, Math.hypot(c.p[0] - x, c.p[1] - z));
      worst = Math.max(worst, near);
    }
    return worst;
  };

  let best: { list: { p: RoomPoint; d: number }[]; score: number } | null = null;
  const consider = (list: { p: RoomPoint; d: number }[], sx: number, sz: number, extra: number) => {
    const minWall = Math.min(...list.map((t) => t.d));
    // Smallest worst-case distance from the floor to a luminaire wins. Luminaires closer to a wall than
    // half the spacing leave the centre short, uneven row and column spacing reads untidy, and trimmed
    // extras cost a little.
    const score =
      coverage(list) +
      Math.max(0, Math.min(sx, sz) * 0.5 - minWall) * 1.5 +
      Math.abs(sx - sz) * 0.1 +
      extra * ideal * 0.15;
    if (!best || score < best.score) best = { list, score };
  };

  // 1. Lattices that give exactly the requested count (row and column spacing tried independently)
  for (let i = 0; i <= 28; i++) {
    const sx = ideal * (0.6 + i * 0.035);
    for (let j = 0; j <= 28; j++) {
      const sz = ideal * (0.6 + j * 0.035);
      for (const ox of axisOffsets(width, sx)) {
        for (const oz of axisOffsets(length, sz)) {
          const list = lattice(sx, sz, ox, oz);
          if (list.length === count) consider(list, sx, sz, 0);
        }
      }
    }
  }
  // 2. Otherwise a square lattice with a few extras, dropping the ones closest to the walls
  if (!best) {
    for (let k = 0; k <= 60; k++) {
      const sp = ideal * (0.55 + k * 0.015);
      for (const ox of axisOffsets(width, sp)) {
        for (const oz of axisOffsets(length, sp)) {
          const list = lattice(sp, sp, ox, oz);
          const extra = list.length - count;
          if (extra < 0 || extra > Math.max(2, count * 0.25)) continue;
          consider(list.slice().sort((p, q) => q.d - p.d).slice(0, count), sp, sp, extra);
        }
      }
    }
  }

  let chosen = best ? best.list.slice() : [];
  if (chosen.length > count) {
    chosen.sort((a, b) => b.d - a.d);
    chosen = chosen.slice(0, count);
  }
  // Very small rooms or many fixtures: fill any shortfall at the most open spots
  while (chosen.length < count) {
    let spot: RoomPoint | null = null;
    let spotScore = -1;
    const step = Math.max(0.05, Math.min(width, length) / 40);
    for (let x = step / 2; x < width; x += step) {
      for (let z = step / 2; z < length; z += step) {
        if (!pointInPolygon(x, z, pts)) continue;
        let near = distanceToWalls(x, z, pts) * 2;
        for (const c of chosen) near = Math.min(near, Math.hypot(c.p[0] - x, c.p[1] - z));
        if (near > spotScore) {
          spotScore = near;
          spot = [x, z];
        }
      }
    }
    if (!spot) break;
    chosen.push({ p: spot, d: spotScore });
  }
  // Row-major order (north to south, west to east) for stable numbering
  return chosen
    .map((c) => [round3(c.p[0]), round3(c.p[1])] as RoomPoint)
    .sort((a, b) => (Math.abs(a[1] - b[1]) > 1e-3 ? a[1] - b[1] : a[0] - b[0]));
}

/** Outline used for calculations: the stored polygon for non-rectangular rooms, else the W × L rectangle */
export function getRoomOutline(params: {
  roomShape?: RoomShapeId;
  roomPolygon?: RoomVertex[];
  roomWidth?: number;
  roomLength?: number;
}): RoomPoint[] {
  if (hasIrregularOutline(params)) return toRoomPoints(params.roomPolygon)!;
  const w = params.roomWidth || 4;
  const l = params.roomLength || 5;
  return [[0, 0], [w, 0], [w, l], [0, l]];
}

/** True when the room uses a non-rectangular outline */
export const hasIrregularOutline = (params: { roomShape?: RoomShapeId; roomPolygon?: RoomVertex[] }) =>
  !!params.roomShape && params.roomShape !== "rectangle" && !!params.roomPolygon && params.roomPolygon.length >= 3;

/** Vertex letters A, B, … Z, A1, B1, … */
export const vertexLabel = (i: number) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : "");
