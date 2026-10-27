/**
 * 3D model import for the Illumination module: loading, units/orientation, plan sections and room
 * detection.
 *
 * Supported directly in the browser: glTF (.glb / .gltf with its .bin and textures), Wavefront OBJ
 * (with .mtl and textures) and COLLADA (.dae). SketchUp .skp files cannot be parsed in the browser
 * (the SketchUp SDK is a licensed native desktop library), so they are rejected with export steps.
 *
 * World coordinates after import: metres, Y up, X east, Z south (the same plan axes as the
 * Illumination room: x = width, z = length). Imported dimensions are never treated as verified.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { ColladaLoader } from "three/examples/jsm/loaders/ColladaLoader.js";
import type { RoomPoint } from "./roomGeometry";

export type ModelFormat = "glb" | "gltf" | "obj" | "dae";
export type ModelUnit = "m" | "cm" | "mm" | "in" | "ft";
export type UpAxis = "y" | "z";

export const UNIT_SCALE: Record<ModelUnit, number> = { m: 1, cm: 0.01, mm: 0.001, in: 0.0254, ft: 0.3048 };
export const UNIT_LABEL: Record<ModelUnit, string> = { m: "Metres", cm: "Centimetres", mm: "Millimetres", in: "Inches", ft: "Feet" };

/** Largest total upload accepted (all files of one model) */
export const MAX_MODEL_BYTES = 100 * 1024 * 1024;
/** Above this many triangles the viewer warns that it may be slow */
export const LARGE_MODEL_TRIANGLES = 1_500_000;

export const MODEL_ACCEPT = ".glb,.gltf,.bin,.obj,.mtl,.dae,.skp,.png,.jpg,.jpeg,.webp,.bmp,.tga,.ktx2";

const MAIN_EXT: Record<string, ModelFormat> = { glb: "glb", gltf: "gltf", obj: "obj", dae: "dae" };
const extOf = (name: string) => (name.split(".").pop() || "").toLowerCase();

export class ModelImportError extends Error {}

/** How to get a SketchUp design into a format the browser can read */
export const SKP_HELP = [
  "SketchUp .skp files cannot be opened directly in the browser: reading them needs the SketchUp SDK, a licensed desktop library that does not run on the web.",
  "Export the model from SketchUp and import that file instead:",
  "• SketchUp Pro (desktop): File > Export > 3D Model... and choose COLLADA (.dae) or OBJ (.obj). For OBJ, also keep the .mtl file and texture images, and note the export units.",
  "• glTF (.glb): use a glTF exporter extension from the SketchUp Extension Warehouse. GLB keeps geometry, materials and textures in one file and is the preferred format.",
  "Tip: hide furniture, entourage and site context before exporting so the file stays small and the rooms are easy to detect.",
].join("\n");

export interface ModelFileSet {
  /** The model file (.glb/.gltf/.obj/.dae) */
  main: File;
  format: ModelFormat;
  /** Every file chosen (main + .bin/.mtl/textures) */
  all: File[];
  totalBytes: number;
}

/** Check the chosen files and find the model file; throws ModelImportError with a readable message */
export function validateModelFiles(files: File[]): ModelFileSet {
  if (!files.length) throw new ModelImportError("No file selected.");
  if (files.some((f) => extOf(f.name) === "skp")) throw new ModelImportError(SKP_HELP);
  const mains = files.filter((f) => MAIN_EXT[extOf(f.name)]);
  if (mains.length === 0) {
    throw new ModelImportError(
      "No 3D model file found. Choose a .glb, .gltf, .obj or .dae file (with its .bin, .mtl or texture files if it has them)."
    );
  }
  if (mains.length > 1) throw new ModelImportError(`Choose one model at a time (found ${mains.map((m) => m.name).join(", ")}).`);
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  if (totalBytes > MAX_MODEL_BYTES) {
    throw new ModelImportError(`The files total ${(totalBytes / 1048576).toFixed(1)} MB; the limit is ${MAX_MODEL_BYTES / 1048576} MB. Simplify the model or export without hidden/unused geometry.`);
  }
  const main = mains[0];
  if (main.size === 0) throw new ModelImportError(`${main.name} is empty.`);
  return { main, format: MAIN_EXT[extOf(main.name)], all: files, totalBytes };
}

/** First bytes check so a renamed or corrupt file gives a clear message */
async function checkSignature(set: ModelFileSet) {
  const head = new Uint8Array(await set.main.slice(0, 64).arrayBuffer());
  const text = new TextDecoder().decode(head);
  if (set.format === "glb" && text.slice(0, 4) !== "glTF") throw new ModelImportError(`${set.main.name} is not a valid GLB file (missing glTF header).`);
  if (set.format === "gltf" && !text.trimStart().startsWith("{")) throw new ModelImportError(`${set.main.name} is not a valid glTF JSON file.`);
  if (set.format === "dae" && !/<\?xml|<COLLADA/i.test(text)) throw new ModelImportError(`${set.main.name} is not a valid COLLADA (.dae) file.`);
}

export interface LoadedModel {
  root: THREE.Object3D;
  format: ModelFormat;
  stats: { meshes: number; triangles: number; materials: number; textures: number };
  warnings: string[];
  /** COLLADA declares its own units; the others need the user's choice */
  unitKnown: boolean;
}

/** Load a validated file set into a three.js object */
export async function loadModel(set: ModelFileSet, onProgress?: (msg: string) => void): Promise<LoadedModel> {
  await checkSignature(set);
  const urls = new Map<string, string>();
  set.all.forEach((f) => urls.set(f.name.toLowerCase(), URL.createObjectURL(f)));
  const missing = new Set<string>();
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith("blob:") || url.startsWith("data:")) return url;
    const name = decodeURIComponent(url.split(/[\\/]/).pop() || "").toLowerCase();
    const hit = urls.get(name);
    if (hit) return hit;
    missing.add(name);
    return url;
  });

  const warnings: string[] = [];
  let root: THREE.Object3D;
  try {
    const mainUrl = urls.get(set.main.name.toLowerCase())!;
    onProgress?.(`Reading ${set.main.name}...`);
    if (set.format === "glb" || set.format === "gltf") {
      const loader = new GLTFLoader(manager);
      const draco = new DRACOLoader();
      draco.setDecoderPath("/draco/");
      loader.setDRACOLoader(draco);
      const gltf = await loader.loadAsync(mainUrl);
      draco.dispose();
      root = gltf.scene;
    } else if (set.format === "obj") {
      const objLoader = new OBJLoader(manager);
      const mtlFile = set.all.find((f) => extOf(f.name) === "mtl");
      if (mtlFile) {
        const materials = await new MTLLoader(manager).loadAsync(urls.get(mtlFile.name.toLowerCase())!);
        materials.preload();
        objLoader.setMaterials(materials);
      } else {
        warnings.push("No .mtl file was included, so the model is shown without its materials.");
      }
      root = await objLoader.loadAsync(mainUrl);
    } else {
      const collada = await new ColladaLoader(manager).loadAsync(mainUrl);
      if (!collada || !collada.scene) throw new ModelImportError(`${set.main.name} has no visual scene.`);
      root = collada.scene;
    }
  } catch (err: any) {
    urls.forEach((u) => URL.revokeObjectURL(u));
    if (err instanceof ModelImportError) throw err;
    throw new ModelImportError(`Could not read ${set.main.name}: ${err?.message || err}. The file may be damaged or use features this viewer does not support.`);
  }
  if (missing.size) {
    warnings.push(`Referenced files not included: ${[...missing].slice(0, 6).join(", ")}${missing.size > 6 ? "..." : ""}. Select them together with the model to show all textures.`);
  }

  // Statistics, and double-sided materials so section views and inside faces stay visible
  let meshes = 0;
  let triangles = 0;
  const mats = new Set<THREE.Material>();
  let textures = 0;
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry as THREE.BufferGeometry;
    const count = g.index ? g.index.count : g.attributes.position?.count || 0;
    triangles += Math.floor(count / 3);
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: any) => {
      if (!m) return;
      if (!mats.has(m) && m.map) textures++;
      mats.add(m);
      m.side = THREE.DoubleSide;
    });
  });
  if (meshes === 0) {
    urls.forEach((u) => URL.revokeObjectURL(u));
    throw new ModelImportError(`${set.main.name} contains no surfaces (meshes). Make sure the model was exported with its geometry.`);
  }
  if (triangles > LARGE_MODEL_TRIANGLES) {
    warnings.push(`Large model (${(triangles / 1e6).toFixed(1)} million triangles): viewing and room detection may be slow. Hiding furniture before export helps.`);
  }
  // Textures are decoded asynchronously, keep the blob URLs until then
  setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 60000);
  return { root, format: set.format, stats: { meshes, triangles, materials: mats.size, textures }, warnings, unitKnown: set.format === "dae" };
}

/**
 * Units and up axis of a model without that information (OBJ), from its raw extents: the smallest
 * extent of a building is its height, and the unit is the one giving a believable building (2 m to
 * 400 m across), preferring a single storey (2.2 m to 5 m high). Always shown to the user to confirm.
 */
export function guessUnitAndAxis(raw: { x: number; y: number; z: number }, format: ModelFormat): { unit: ModelUnit; upAxis: UpAxis } {
  if (format !== "obj") return { unit: "m", upAxis: "y" };
  const upAxis: UpAxis = raw.z < raw.y && raw.z < raw.x ? "z" : "y";
  const height = upAxis === "z" ? raw.z : raw.y;
  const across = upAxis === "z" ? Math.max(raw.x, raw.y) : Math.max(raw.x, raw.z);
  const order: ModelUnit[] = ["m", "mm", "cm", "in", "ft"];
  const fits = (u: ModelUnit, hMin: number, hMax: number) => {
    const k = UNIT_SCALE[u];
    return across * k >= 2 && across * k <= 400 && height * k >= hMin && height * k <= hMax;
  };
  const unit = order.find((u) => fits(u, 2.2, 5)) || order.find((u) => fits(u, 2.2, 200)) || "m";
  return { unit, upAxis };
}

/** Wrapper that applies units and up-axis to the raw model; the floor (lowest point) ends at y = 0 */
export function placeModel(raw: THREE.Object3D, scale: number, upAxis: UpAxis): THREE.Group {
  const holder = new THREE.Group();
  holder.name = "imported-model";
  const inner = new THREE.Group();
  inner.add(raw);
  // Z-up models: rotate -90 deg about X so +Z becomes +Y (plan Y becomes -Z, i.e. north stays north)
  if (upAxis === "z") inner.rotation.x = -Math.PI / 2;
  inner.scale.setScalar(scale);
  holder.add(inner);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  inner.position.set(-box.min.x, -box.min.y, -box.min.z);
  holder.updateMatrixWorld(true);
  return holder;
}

export interface PlanSegment {
  a: RoomPoint;
  b: RoomPoint;
}

/** Visible meshes of the model (hidden parts are left out of sections and picking) */
export function visibleMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverseVisible((o: any) => {
    if (o.isMesh && !o.userData.isHelper) out.push(o);
  });
  return out;
}

/** Plan section at a given elevation: where the model's surfaces cut the horizontal plane */
export function sectionAt(root: THREE.Object3D, elevation: number): PlanSegment[] {
  const segs: PlanSegment[] = [];
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  root.updateMatrixWorld(true);
  for (const mesh of visibleMeshes(root)) {
    const g = mesh.geometry as THREE.BufferGeometry;
    const pos = g.attributes.position;
    if (!pos) continue;
    const idx = g.index;
    const triCount = idx ? idx.count / 3 : pos.count / 3;
    const m = mesh.matrixWorld;
    for (let t = 0; t < triCount; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      va.fromBufferAttribute(pos, i0).applyMatrix4(m);
      vb.fromBufferAttribute(pos, i1).applyMatrix4(m);
      vc.fromBufferAttribute(pos, i2).applyMatrix4(m);
      const da = va.y - elevation;
      const db = vb.y - elevation;
      const dc = vc.y - elevation;
      if ((da > 0 && db > 0 && dc > 0) || (da < 0 && db < 0 && dc < 0)) continue;
      const pts: RoomPoint[] = [];
      const edge = (p: THREE.Vector3, q: THREE.Vector3, dp: number, dq: number) => {
        if ((dp <= 0 && dq > 0) || (dp > 0 && dq <= 0)) {
          const k = dp / (dp - dq);
          pts.push([p.x + (q.x - p.x) * k, p.z + (q.z - p.z) * k]);
        }
      };
      edge(va, vb, da, db);
      edge(vb, vc, db, dc);
      edge(vc, va, dc, da);
      if (pts.length >= 2) segs.push({ a: pts[0], b: pts[1] });
    }
  }
  return segs;
}

export interface DetectedRoom {
  /** Room outline in world plan coordinates (metres), clockwise on screen */
  polygon: RoomPoint[];
  area: number;
}

/**
 * Room around a plan point, found by flood-filling a raster of the section. Walls are thickened by
 * gapClose so doorways and small openings do not let the fill escape, and the filled area is then
 * grown back by the same amount, so the outline follows the inner faces of the walls (within about
 * one raster cell). Throws ModelImportError when the area is not enclosed.
 */
export function detectRoomAt(
  segments: PlanSegment[],
  point: RoomPoint,
  opts: { resolution?: number; gapClose?: number } = {}
): DetectedRoom {
  if (segments.length === 0) throw new ModelImportError("Nothing is cut at this section height. Move the section level so it passes through the walls.");
  const gap = Math.max(0, opts.gapClose ?? 1.0);
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  segments.forEach(({ a, b }) => {
    minX = Math.min(minX, a[0], b[0]); maxX = Math.max(maxX, a[0], b[0]);
    minZ = Math.min(minZ, a[1], b[1]); maxZ = Math.max(maxZ, a[1], b[1]);
  });
  // Raster cell: 2 cm for a house, coarser for big buildings (about 2 million cells at most)
  let res = opts.resolution ?? Math.min(0.1, Math.max(0.02, Math.sqrt(((maxX - minX + 2 * gap) * (maxZ - minZ + 2 * gap)) / 2e6)));
  const margin = gap + res * 3;
  minX -= margin; minZ -= margin; maxX += margin; maxZ += margin;
  while (((maxX - minX) / res) * ((maxZ - minZ) / res) > 4e6) res *= 1.5;
  const nx = Math.ceil((maxX - minX) / res) + 1;
  const nz = Math.ceil((maxZ - minZ) / res) + 1;
  const cell = (x: number, z: number) => [Math.floor((x - minX) / res), Math.floor((z - minZ) / res)] as const;
  if (point[0] < minX || point[0] > maxX || point[1] < minZ || point[1] > maxZ) {
    throw new ModelImportError("That point is outside the model. Click inside a room.");
  }

  // 1. Rasterise wall lines
  const wall = new Uint8Array(nx * nz);
  segments.forEach(({ a, b }) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(len / (res * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const [cx, cz] = cell(a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps);
      if (cx >= 0 && cz >= 0 && cx < nx && cz < nz) wall[cz * nx + cx] = 1;
    }
  });

  // 2. Thicken walls by the gap-closing radius (square approximation of a disc via two passes)
  const k = Math.round(gap / 2 / res);
  const dilate = (src: Uint8Array, r: number, blockedBy?: Uint8Array) => {
    if (r <= 0) return src;
    const tmp = new Uint8Array(src.length);
    for (let z = 0; z < nz; z++) {
      let run = -1e9;
      for (let x = 0; x < nx; x++) if (src[z * nx + x]) run = x, tmp[z * nx + x] = 1; else if (x - run <= r) tmp[z * nx + x] = 1;
      run = 1e9;
      for (let x = nx - 1; x >= 0; x--) if (src[z * nx + x]) run = x; else if (run - x <= r) tmp[z * nx + x] = 1;
    }
    const out = new Uint8Array(src.length);
    for (let x = 0; x < nx; x++) {
      let run = -1e9;
      for (let z = 0; z < nz; z++) if (tmp[z * nx + x]) run = z, out[z * nx + x] = 1; else if (z - run <= r) out[z * nx + x] = 1;
      run = 1e9;
      for (let z = nz - 1; z >= 0; z--) if (tmp[z * nx + x]) run = z; else if (run - z <= r) out[z * nx + x] = 1;
    }
    if (blockedBy) for (let i = 0; i < out.length; i++) if (blockedBy[i]) out[i] = 0;
    return out;
  };
  const thick = dilate(wall, k);

  // 3. Flood fill from the clicked cell (or the nearest open cell)
  let [sx, sz] = cell(point[0], point[1]);
  if (thick[sz * nx + sx]) {
    let found = false;
    for (let r = 1; r < 40 && !found; r++) {
      for (let dz = -r; dz <= r && !found; dz++) for (let dx = -r; dx <= r && !found; dx++) {
        const x = sx + dx, z = sz + dz;
        if (x > 0 && z > 0 && x < nx - 1 && z < nz - 1 && !thick[z * nx + x]) { sx = x; sz = z; found = true; }
      }
    }
    if (!found) throw new ModelImportError("That point is inside a wall. Click in the middle of a room.");
  }
  const fill = new Uint8Array(nx * nz);
  const stack = [sz * nx + sx];
  fill[stack[0]] = 1;
  let count = 0;
  while (stack.length) {
    const i = stack.pop()!;
    count++;
    const x = i % nx;
    const z = (i - x) / nx;
    if (x === 0 || z === 0 || x === nx - 1 || z === nz - 1) {
      throw new ModelImportError("The area is not enclosed at this section height (the fill escaped the walls). Raise the gap closing for wide openings, or move the section level.");
    }
    for (const j of [i - 1, i + 1, i - nx, i + nx]) {
      if (!fill[j] && !thick[j]) { fill[j] = 1; stack.push(j); }
    }
  }
  if (count * res * res < 0.5) throw new ModelImportError("The enclosed area is smaller than 0.5 m². Click inside a room, not in a wall cavity.");

  // 4. Grow back to the walls (not into them)
  const room = dilate(fill, k, wall);

  // 5. Outline: boundary edges of the filled cells, chained into loops (clockwise on screen)
  const edges = new Map<string, [number, number]>();
  const key = (x: number, z: number) => `${x},${z}`;
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    if (!room[z * nx + x]) continue;
    const filled = (xx: number, zz: number) => xx >= 0 && zz >= 0 && xx < nx && zz < nz && room[zz * nx + xx] === 1;
    if (!filled(x, z - 1)) edges.set(key(x, z), [x + 1, z]);          // north edge, west -> east
    if (!filled(x + 1, z)) edges.set(key(x + 1, z) + "e", [x + 1, z + 1]); // east edge, north -> south
    if (!filled(x, z + 1)) edges.set(key(x + 1, z + 1) + "s", [x, z + 1]); // south edge, east -> west
    if (!filled(x - 1, z)) edges.set(key(x, z + 1) + "w", [x, z]);      // west edge, south -> north
  }
  // Index edges by start point
  const byStart = new Map<string, [number, number][]>();
  edges.forEach((end, k2) => {
    const start = k2.replace(/[esw]$/, "");
    if (!byStart.has(start)) byStart.set(start, []);
    byStart.get(start)!.push(end);
  });
  let best: [number, number][] = [];
  const used = new Set<string>();
  byStart.forEach((_, startKey) => {
    if (used.has(startKey)) return;
    const loop: [number, number][] = [];
    let cur = startKey;
    let guard = 0;
    while (guard++ < 1e6) {
      const list = byStart.get(cur);
      if (!list || list.length === 0) break;
      const next = list.shift()!;
      used.add(cur);
      const [cx, cz] = cur.split(",").map(Number);
      loop.push([cx, cz]);
      cur = key(next[0], next[1]);
      if (cur === startKey) break;
    }
    if (loop.length > best.length) best = loop;
  });
  if (best.length < 4) throw new ModelImportError("Could not trace the room outline. Try another section level.");

  // 6. Simplify the staircase outline (Douglas-Peucker), then to world coordinates
  const ptsWorld: RoomPoint[] = best.map(([x, z]) => [minX + x * res, minZ + z * res]);
  // Cell edges sit 0 to 1 cell inside the wall faces: move the outline out by half a cell
  const simplified = offsetPolygon(simplifyClosed(ptsWorld, Math.max(res * 1.6, 0.04)), res / 2);
  const area = Math.abs(simplified.reduce((s, p, i) => {
    const q = simplified[(i + 1) % simplified.length];
    return s + p[0] * q[1] - q[0] * p[1];
  }, 0)) / 2;
  return { polygon: simplified.map(([x, z]) => [Math.round(x * 1000) / 1000, Math.round(z * 1000) / 1000] as RoomPoint), area };
}

/** Move every edge of a clockwise (on screen) outline outward by d (mitred corners) */
function offsetPolygon(pts: RoomPoint[], d: number): RoomPoint[] {
  const n = pts.length;
  const lines = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = (b[1] - a[1]) / len;
    const nz = -(b[0] - a[0]) / len;
    return { a: [a[0] + nx * d, a[1] + nz * d] as RoomPoint, dir: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] as RoomPoint };
  });
  return pts.map((p, i) => {
    const l1 = lines[(i - 1 + n) % n];
    const l2 = lines[i];
    const den = l1.dir[0] * l2.dir[1] - l1.dir[1] * l2.dir[0];
    if (Math.abs(den) < 1e-9) return l2.a;
    const t = ((l2.a[0] - l1.a[0]) * l2.dir[1] - (l2.a[1] - l1.a[1]) * l2.dir[0]) / den;
    return [l1.a[0] + l1.dir[0] * t, l1.a[1] + l1.dir[1] * t] as RoomPoint;
  });
}

function perpDist(p: RoomPoint, a: RoomPoint, b: RoomPoint) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1e-9;
  return Math.abs(dx * (a[1] - p[1]) - (a[0] - p[0]) * dz) / len;
}

function dp(points: RoomPoint[], tol: number): RoomPoint[] {
  if (points.length < 3) return points;
  let maxD = 0;
  let idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], points[0], points[points.length - 1]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= tol) return [points[0], points[points.length - 1]];
  const left = dp(points.slice(0, idx + 1), tol);
  const right = dp(points.slice(idx), tol);
  return [...left.slice(0, -1), ...right];
}

/** Douglas-Peucker on a closed loop, split at the two farthest-apart points */
function simplifyClosed(points: RoomPoint[], tol: number): RoomPoint[] {
  let i0 = 0;
  let far = 0;
  points.forEach((p, i) => {
    const d = Math.hypot(p[0] - points[0][0], p[1] - points[0][1]);
    if (d > far) { far = d; i0 = i; }
  });
  const a = dp(points.slice(0, i0 + 1), tol);
  const b = dp([...points.slice(i0), points[0]], tol);
  const out = [...a.slice(0, -1), ...b.slice(0, -1)];
  // Drop near-collinear points left at the joins
  return out.filter((p, i) => {
    const prev = out[(i - 1 + out.length) % out.length];
    const next = out[(i + 1) % out.length];
    return perpDist(p, prev, next) > tol * 0.5;
  });
}

/** Floor below and ceiling above a plan point (first surfaces hit by vertical rays) */
export function heightsAt(root: THREE.Object3D, point: RoomPoint, sectionElevation: number) {
  const meshes = visibleMeshes(root);
  const ray = new THREE.Raycaster();
  ray.set(new THREE.Vector3(point[0], sectionElevation, point[1]), new THREE.Vector3(0, -1, 0));
  const down = ray.intersectObjects(meshes, false)[0];
  const floorY = down ? down.point.y : 0;
  ray.set(new THREE.Vector3(point[0], floorY + 0.05, point[1]), new THREE.Vector3(0, 1, 0));
  const ups = ray.intersectObjects(meshes, false).filter((h) => h.point.y > floorY + 1.8);
  const ceilingY = ups[0] ? ups[0].point.y : null;
  return { floorY, ceilingHeight: ceilingY !== null ? ceilingY - floorY : null };
}

/** Bounding box of the placed model */
export function modelBounds(root: THREE.Object3D) {
  return new THREE.Box3().setFromObject(root);
}

/**
 * Floor levels of a placed model: elevations of large upward-facing horizontal surfaces (slabs and
 * floor finishes), at least 2.1 m apart. A top slab with less than 1.8 m of model above it is the roof
 * and is left out. Always returns at least one level.
 */
export function detectFloorLevels(root: THREE.Object3D): number[] {
  root.updateMatrixWorld(true);
  const bins = new Map<number, number>(); // 5 cm bins -> upward area (m²)
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
  let top = -Infinity;
  for (const mesh of visibleMeshes(root)) {
    const g = mesh.geometry as THREE.BufferGeometry;
    const pos = g.attributes.position;
    if (!pos) continue;
    const idx = g.index;
    const tris = idx ? idx.count / 3 : pos.count / 3;
    const m = mesh.matrixWorld;
    for (let t = 0; t < tris; t++) {
      a.fromBufferAttribute(pos, idx ? idx.getX(t * 3) : t * 3).applyMatrix4(m);
      b.fromBufferAttribute(pos, idx ? idx.getX(t * 3 + 1) : t * 3 + 1).applyMatrix4(m);
      c.fromBufferAttribute(pos, idx ? idx.getX(t * 3 + 2) : t * 3 + 2).applyMatrix4(m);
      top = Math.max(top, a.y, b.y, c.y);
      n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
      const len = n.length();
      if (len < 1e-9 || n.y / len < 0.95) continue; // upward-facing only
      const y = (a.y + b.y + c.y) / 3;
      const key = Math.round(y / 0.05);
      bins.set(key, (bins.get(key) || 0) + len / 2);
    }
  }
  if (!bins.size) return [0];
  // Neighbouring bins (within 25 cm) form one level, at the height of its largest surface (the slab top)
  const sorted = [...bins.entries()].sort((p, q) => p[0] - q[0]);
  const clusters: { y: number; area: number }[] = [];
  let cur: { peakK: number; peakA: number; area: number; last: number } | null = null;
  for (const [k, area] of sorted) {
    if (cur && k - cur.last <= 5) {
      if (area > cur.peakA) { cur.peakA = area; cur.peakK = k; }
      cur.area += area;
      cur.last = k;
    } else {
      if (cur) clusters.push({ y: cur.peakK * 0.05, area: cur.area });
      cur = { peakK: k, peakA: area, area, last: k };
    }
  }
  if (cur) clusters.push({ y: cur.peakK * 0.05, area: cur.area });
  const biggest = Math.max(...clusters.map((cl) => cl.area));
  const accepted: { y: number; area: number }[] = [];
  clusters
    .filter((cl) => cl.area >= Math.max(3, biggest * 0.12))
    .sort((p, q) => q.area - p.area)
    .forEach((cl) => {
      if (accepted.every((ac2) => Math.abs(ac2.y - cl.y) >= 2.1)) accepted.push(cl);
    });
  accepted.sort((p, q) => p.y - q.y);
  if (accepted.length > 1 && top - accepted[accepted.length - 1].y < 1.8) accepted.pop();
  const levels = accepted.map((cl) => Math.round(cl.y * 100) / 100);
  return levels.length ? levels : [0];
}
