import {
  RoofPlanConfig,
  RoofPlanFace,
  RoofPlanModule,
  RoofPlanCapture,
  SolarCalculationResults,
} from "../types/solar";

/**
 * Roof Plan engine: Esri World Imagery tiles and geocoding, image composition, scale and
 * measurements, and automatic PV module placement.
 *
 * Geometry is kept in pixels of the captured image (x right, y down). Real sizes use
 * metres-per-pixel = Web Mercator ground resolution at the capture latitude / zoom x the
 * calibration factor from a measured edge (when the user enters one).
 */

// ----------------------------------------------------------------------------------------------
// Imagery (Esri World Imagery) and geocoding
// ----------------------------------------------------------------------------------------------

/** ArcGIS Location Platform API key (Vercel env VITE_ARCGIS_API_KEY); without it the public endpoints are used */
const ARCGIS_KEY: string = ((import.meta as any).env?.VITE_ARCGIS_API_KEY as string) || "";

export const IMAGERY_ATTRIBUTION = "Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community";
/** Highest zoom fetched from the service; deeper zooms enlarge these tiles */
export const NATIVE_MAX_ZOOM = 19;
export const MAX_ZOOM = 22;
const TILE = 256;

export function tileUrl(z: number, x: number, y: number): string {
  return ARCGIS_KEY
    ? `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}?token=${encodeURIComponent(ARCGIS_KEY)}`
    : `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
}

/** Web Mercator world pixel coordinates at zoom z */
export function lngLatToWorld(lng: number, lat: number, z: number) {
  const size = TILE * Math.pow(2, z);
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size,
  };
}

export function worldToLngLat(x: number, y: number, z: number) {
  const size = TILE * Math.pow(2, z);
  const lng = (x / size) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / size;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lng, lat };
}

/** Ground metres per image pixel (Web Mercator) */
export function groundResolution(lat: number, z: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, z);
}

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

/** Address / place search (Esri World Geocoder). "lat, lng" text is accepted directly. */
export async function geocode(query: string): Promise<GeocodeResult[]> {
  const q = query.trim();
  const m = /^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/.exec(q);
  if (m) {
    const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
    if (Math.abs(lat) <= 85 && Math.abs(lng) <= 180) return [{ label: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, lat, lng }];
  }
  if (!q) return [];
  const base = ARCGIS_KEY
    ? "https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates"
    : "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates";
  const params = new URLSearchParams({ f: "json", singleLine: q, maxLocations: "6", outFields: "Match_addr" });
  if (ARCGIS_KEY) params.set("token", ARCGIS_KEY);
  const res = await fetch(`${base}?${params.toString()}`);
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const json = await res.json();
  return (json.candidates || []).map((c: any) => ({
    label: c.attributes?.Match_addr || c.address,
    lat: c.location.y,
    lng: c.location.x,
  }));
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

/**
 * Builds the background image of a capture: the satellite tiles around the capture centre, or a
 * 1 m grid for manual drawings. `scale` renders it larger (sharper exports).
 */
export async function composeCaptureImage(capture: RoofPlanCapture, scale = 1): Promise<HTMLCanvasElement> {
  const W = Math.round(capture.widthPx * scale), H = Math.round(capture.heightPx * scale);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  if (capture.kind === "manual" || capture.lat == null || capture.lng == null || capture.zoom == null) {
    // 1 m grid, every 5th line darker
    const step = (1 / capture.baseMetersPerPx) * scale;
    for (let i = 0; i * step <= Math.max(W, H); i++) {
      ctx.strokeStyle = i % 5 === 0 ? "#cbd5e1" : "#eef2f7";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(W, i * step); ctx.stroke();
    }
    return canvas;
  }

  const z = capture.zoom;
  const tz = Math.min(Math.floor(z), NATIVE_MAX_ZOOM);
  const k = Math.pow(2, z - tz); // capture pixels per tile pixel
  const c = lngLatToWorld(capture.lng, capture.lat, z);
  const left = c.x - capture.widthPx / 2, top = c.y - capture.heightPx / 2;
  const tileSpan = TILE * k;
  const x0 = Math.floor(left / tileSpan), x1 = Math.floor((left + capture.widthPx) / tileSpan);
  const y0 = Math.floor(top / tileSpan), y1 = Math.floor((top + capture.heightPx) / tileSpan);
  const jobs: Promise<void>[] = [];
  const n = Math.pow(2, tz);
  for (let tx = x0; tx <= x1; tx++) {
    for (let ty = y0; ty <= y1; ty++) {
      if (ty < 0 || ty >= n) continue;
      const wx = ((tx % n) + n) % n;
      const dx = (tx * tileSpan - left) * scale, dy = (ty * tileSpan - top) * scale, ds = tileSpan * scale + 0.5;
      jobs.push(
        (async () => {
          // Where a tile is missing, use the matching part of a lower-zoom tile (up to 3 levels up)
          for (let up = 0; up <= 3 && tz - up >= 0; up++) {
            const f = Math.pow(2, up);
            const img = await loadImage(tileUrl(tz - up, Math.floor(wx / f), Math.floor(ty / f)));
            if (!img) continue;
            const sub = TILE / f;
            ctx.drawImage(img, (wx % f) * sub, (ty % f) * sub, sub, sub, dx, dy, ds, ds);
            return;
          }
        })()
      );
    }
  }
  await Promise.all(jobs);
  return canvas;
}

// ----------------------------------------------------------------------------------------------
// Scale and measurements
// ----------------------------------------------------------------------------------------------

export const emptyRoofPlan = (): RoofPlanConfig => ({ scaleFactor: 1, faces: [], modules: [] });

export function metersPerPx(plan: RoofPlanConfig): number {
  return (plan.capture?.baseMetersPerPx || 0.05) * (plan.scaleFactor || 1);
}

export type Pt = [number, number];

export function polygonAreaPx(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export const edgeLengthPx = (pts: Pt[], i: number) => {
  const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
  return Math.hypot(x2 - x1, y2 - y1);
};

export function pointInPolygon([x, y]: Pt, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment([px, py]: Pt, [ax, ay]: Pt, [bx, by]: Pt): number {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** Angle (degrees, clockwise from the drawing x-axis) of the longest edge: the default row direction */
export function longestEdgeAngle(pts: Pt[]): number {
  let best = 0, ang = 0;
  for (let i = 0; i < pts.length; i++) {
    const L = edgeLengthPx(pts, i);
    if (L > best) {
      best = L;
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    }
  }
  // Normalise to (-90, 90]
  while (ang > 90) ang -= 180;
  while (ang <= -90) ang += 180;
  return Math.round(ang * 10) / 10;
}

// ----------------------------------------------------------------------------------------------
// Modules
// ----------------------------------------------------------------------------------------------

export interface ModuleDims {
  lengthM: number;
  widthM: number;
}

export function moduleDims(calc: SolarCalculationResults): ModuleDims {
  const m = calc.selectedModule;
  return { lengthM: (m?.lengthMm || 2278) / 1000, widthM: (m?.widthMm || 1134) / 1000 };
}

/** Module rotation (long side) for a face: landscape along the rows, portrait across them */
export const faceModuleRot = (face: RoofPlanFace) => face.rowAngleDeg + (face.orientation === "portrait" ? 90 : 0);

/** The four corners (image px) of a module rectangle */
export function moduleCorners(m: { x: number; y: number; rotDeg: number }, dims: ModuleDims, mpp: number): Pt[] {
  const a = (m.rotDeg * Math.PI) / 180;
  const hl = dims.lengthM / mpp / 2, hw = dims.widthM / mpp / 2;
  const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
  return [
    [m.x - ux * hl - vx * hw, m.y - uy * hl - vy * hw],
    [m.x + ux * hl - vx * hw, m.y + uy * hl - vy * hw],
    [m.x + ux * hl + vx * hw, m.y + uy * hl + vy * hw],
    [m.x - ux * hl + vx * hw, m.y - uy * hl + vy * hw],
  ];
}

/** True when the rectangle lies inside the polygon and keeps the clearance from every edge */
function rectFits(corners: Pt[], poly: Pt[], clearancePx: number): boolean {
  if (!corners.every((c) => pointInPolygon(c, poly))) return false;
  if (poly.some((p) => pointInPolygon(p, corners))) return false;
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    for (let j = 0; j < poly.length; j++) if (segmentsCross(a, b, poly[j], poly[(j + 1) % poly.length])) return false;
  }
  if (clearancePx > 0) {
    const probes: Pt[] = [...corners, ...corners.map((c, i) => [(c[0] + corners[(i + 1) % 4][0]) / 2, (c[1] + corners[(i + 1) % 4][1]) / 2] as Pt)];
    for (const p of probes)
      for (let j = 0; j < poly.length; j++) if (distToSegment(p, poly[j], poly[(j + 1) % poly.length]) < clearancePx) return false;
  }
  return true;
}

const newId = () => Math.random().toString(36).slice(2, 10);

/**
 * Fills a roof face with modules in rows along the face's row direction, keeping the setback.
 * Each row is packed greedily from one end, which also suits irregular outlines.
 * Returns at most maxCount modules, ordered row by row (used for string numbering).
 */
export function autoPlaceModules(face: RoofPlanFace, plan: RoofPlanConfig, dims: ModuleDims, maxCount: number): RoofPlanModule[] {
  if (face.points.length < 3 || maxCount <= 0) return [];
  const mpp = metersPerPx(plan);
  const th = (face.rowAngleDeg * Math.PI) / 180;
  const ux = Math.cos(th), uy = Math.sin(th), vx = -uy, vy = ux;
  const toUV = ([x, y]: Pt): Pt => [x * ux + y * uy, x * vx + y * vy];
  const fromUV = (u: number, v: number): Pt => [u * ux + v * vx, u * uy + v * vy];
  const uv = face.points.map(toUV);
  const umin = Math.min(...uv.map((p) => p[0])), umax = Math.max(...uv.map((p) => p[0]));
  const vmin = Math.min(...uv.map((p) => p[1])), vmax = Math.max(...uv.map((p) => p[1]));

  const portrait = face.orientation === "portrait";
  const along = (portrait ? dims.widthM : dims.lengthM) / mpp; // module size along the row
  const across = (portrait ? dims.lengthM : dims.widthM) / mpp;
  const gap = face.moduleGapM / mpp, rowGap = face.rowGapM / mpp;
  const clearance = face.setbackM / mpp;
  const step = Math.max(0.05 / mpp, 0.5); // search step ~5 cm
  const rot = faceModuleRot(face);

  const out: RoofPlanModule[] = [];
  let v = vmin + clearance + across / 2;
  while (v + across / 2 <= vmax - clearance + 1e-6 && out.length < maxCount) {
    const row: RoofPlanModule[] = [];
    let u = umin + clearance + along / 2;
    while (u + along / 2 <= umax - clearance + 1e-6 && out.length + row.length < maxCount) {
      const [x, y] = fromUV(u, v);
      const m = { id: newId(), faceId: face.id, x, y, rotDeg: rot };
      if (rectFits(moduleCorners(m, dims, mpp), face.points, clearance)) {
        row.push(m);
        u += along + gap;
      } else u += step;
    }
    if (row.length) {
      out.push(...row);
      v += across + rowGap;
    } else v += step;
  }
  return out;
}

/** String numbering: modules in face order then placement order, modulesPerString per string */
export function assignStrings(plan: RoofPlanConfig, calc: SolarCalculationResults) {
  const per = Math.max(1, calc.effective.modulesPerString);
  const required = calc.effective.modulesPerString * calc.effective.numberOfStrings;
  const order = plan.faces.flatMap((f) => plan.modules.filter((m) => m.faceId === f.id));
  const loose = plan.modules.filter((m) => !plan.faces.some((f) => f.id === m.faceId));
  const map = new Map<string, { stringNo: number; pos: number; extra: boolean }>();
  [...order, ...loose].forEach((m, i) =>
    map.set(m.id, { stringNo: Math.floor(i / per) + 1, pos: (i % per) + 1, extra: i >= required })
  );
  return map;
}

/** Rectangle overlap (separating axis test) */
function rectsOverlap(a: Pt[], b: Pt[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % 4];
      const nx = y2 - y1, ny = x1 - x2;
      const pa = a.map(([x, y]) => x * nx + y * ny), pb = b.map(([x, y]) => x * nx + y * ny);
      if (Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6) return false;
    }
  }
  return true;
}

export interface RoofPlanStats {
  mpp: number;
  scaleSource: string;
  faces: Array<{ face: RoofPlanFace; areaM2: number; edgesM: number[]; modules: number }>;
  placed: number;
  required: number;
  placedKwp: number;
  roofAreaM2: number;
  issues: string[];
  outsideIds: Set<string>;
  overlapIds: Set<string>;
}

export function roofPlanStats(plan: RoofPlanConfig, calc: SolarCalculationResults): RoofPlanStats {
  const mpp = metersPerPx(plan);
  const dims = moduleDims(calc);
  const faces = plan.faces.map((face) => ({
    face,
    areaM2: polygonAreaPx(face.points) * mpp * mpp,
    edgesM: face.points.map((_, i) => edgeLengthPx(face.points, i) * mpp),
    modules: plan.modules.filter((m) => m.faceId === face.id).length,
  }));
  const required = calc.totalModules;
  const placed = plan.modules.length;
  const outsideIds = new Set<string>(), overlapIds = new Set<string>();
  const corners = plan.modules.map((m) => moduleCorners(m, dims, mpp));
  plan.modules.forEach((m, i) => {
    const face = plan.faces.find((f) => f.id === m.faceId);
    if (!face || !corners[i].every((c) => pointInPolygon(c, face.points))) outsideIds.add(m.id);
    for (let j = i + 1; j < plan.modules.length; j++)
      if (rectsOverlap(corners[i], corners[j])) {
        overlapIds.add(m.id);
        overlapIds.add(plan.modules[j].id);
      }
  });
  const issues: string[] = [];
  if (plan.faces.length && placed < required)
    issues.push(`Only ${placed} of the ${required} designed modules are placed on the roof. Add roof area or reduce the system size.`);
  if (placed > required) issues.push(`${placed - required} module(s) more than the design (${required}) are placed; extras are marked and not counted in strings.`);
  if (outsideIds.size) issues.push(`${outsideIds.size} module(s) extend outside their roof outline.`);
  if (overlapIds.size) issues.push(`${overlapIds.size} module(s) overlap another module.`);
  const scaleSource =
    plan.capture?.kind === "manual"
      ? "Manual drawing scale"
      : plan.calibration
        ? `Calibrated from a measured edge (${plan.calibration.measuredM.toFixed(2)} m)`
        : "Satellite image scale (Web Mercator) - verify with a site measurement";
  return {
    mpp,
    scaleSource,
    faces,
    placed,
    required,
    placedKwp: (Math.min(placed, required) * calc.selectedModule.ratedPowerWp) / 1000,
    roofAreaM2: faces.reduce((s, f) => s + f.areaM2, 0),
    issues,
    outsideIds,
    overlapIds,
  };
}

/** Bounding box (image px) of the roof outlines and modules, with a margin; the full image when empty */
export function planBounds(plan: RoofPlanConfig, calc: SolarCalculationResults, marginM = 3) {
  const cap = plan.capture;
  const pts: Pt[] = plan.faces.flatMap((f) => f.points);
  const mpp = metersPerPx(plan);
  const dims = moduleDims(calc);
  plan.modules.forEach((m) => pts.push(...moduleCorners(m, dims, mpp)));
  if (!pts.length || !cap) return { x1: 0, y1: 0, x2: cap?.widthPx || 1000, y2: cap?.heightPx || 700 };
  const mg = marginM / mpp;
  return {
    x1: Math.max(0, Math.min(...pts.map((p) => p[0])) - mg),
    y1: Math.max(0, Math.min(...pts.map((p) => p[1])) - mg),
    x2: Math.min(cap.widthPx, Math.max(...pts.map((p) => p[0])) + mg),
    y2: Math.min(cap.heightPx, Math.max(...pts.map((p) => p[1])) + mg),
  };
}

/** Standard drawing scale (1:N) so a span of `meters` fits `paperMm` */
export function drawingScale(meters: number, paperMm: number): number {
  const need = (meters * 1000) / paperMm;
  return [20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000].find((s) => s >= need) || Math.ceil(need / 500) * 500;
}

export const newRoofId = newId;
