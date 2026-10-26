import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Upload, Box, Eye, EyeOff, Maximize2, Layers, MousePointer2, Ruler, PlusCircle, Copy, RotateCw, RotateCcw,
  Trash2, AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter, Columns3, ShieldCheck, AlertTriangle,
  Loader2, Camera, Grid3x3, Info, X, CheckCircle2, Scan, Sun,
} from 'lucide-react';
import { IlluminationParams, ImportedModelInfo, ImportedModelRoom, PlacedFixtureDragPosition } from '../types';
import {
  MODEL_ACCEPT, ModelImportError, ModelUnit, PlanSegment, UNIT_LABEL, UNIT_SCALE, UpAxis,
  detectRoomAt, guessUnitAndAxis, heightsAt, loadModel, modelBounds, placeModel, sectionAt, validateModelFiles, visibleMeshes,
} from '../utils/modelImport';
import { downloadModelCloud, hashModelFiles, loadModelLocal, saveModelLocal, uploadModelCloud } from '../utils/modelStore';
import {
  RoomPoint, clampPointToPolygon, distanceToWalls, normalizePolygon, pointInPolygon, polygonArea, polygonBounds,
  toRoomPoints, toRoomVertices,
} from '../utils/roomGeometry';
import { createFixture3D, fixtureStyleOf, isCeilingStyle, resolveFixtureParams } from './Illumination3DModel';

export interface DesignSummary {
  area: number;
  roomIndex: number;
  utilizationFactor: number;
  maintenanceFactor: number;
  requiredFixtures: number;
  installedFixtures: number;
  requiredLumens: number;
  installedLumens: number;
  averageLux: number;
  pointAverageLux: number;
  connectedLoadW: number;
  lpd: number;
  lpdLimit: number;
  targetLux: number;
}

interface Props {
  params: IlluminationParams;
  setParams: React.Dispatch<React.SetStateAction<IlluminationParams>>;
  ceilingHeight: number;
  workingPlaneHeight: number;
  mountingHeight: number;
  /** Current design room outline (room coordinates, metres) */
  roomOutline: RoomPoint[];
  /** Estimated illuminance at a room point (simplified beam model) */
  luxAt: (x: number, z: number) => number;
  summary: DesignSummary;
  /** Image of the current view for the reports */
  onSnapshot: (dataUrl: string | null) => void;
}

type Mode = 'orbit' | 'room' | 'measure' | 'place' | 'select';
type View = 'persp' | 'top';

interface Candidate {
  polygon: RoomPoint[];
  area: number;
  floorElevation: number;
  ceilingHeight: number | null;
}

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const uid = () => Math.random().toString(36).slice(2, 10);
const btn = 'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors disabled:opacity-40';
const btnIdle = `${btn} bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400`;
const btnOn = `${btn} bg-indigo-600 border-indigo-600 text-white`;

/** Child index path of an object below the model root ("0/3/1") */
function pathOf(obj: THREE.Object3D, root: THREE.Object3D): string {
  const parts: number[] = [];
  let o: THREE.Object3D | null = obj;
  while (o && o !== root && o.parent) {
    parts.unshift(o.parent.children.indexOf(o));
    o = o.parent;
  }
  return parts.join('/');
}

function luxColor(lux: number, target: number): [number, number, number] {
  const v = Math.min(1, lux / Math.max(100, target * 1.8));
  if (v < 0.25) return [0, Math.round((v / 0.25) * 255), 255];
  if (v < 0.5) return [0, 255, Math.round((1 - (v - 0.25) / 0.25) * 255)];
  if (v < 0.75) return [Math.round(((v - 0.5) / 0.25) * 255), 255, 0];
  return [255, Math.round((1 - (v - 0.75) / 0.25) * 255), 0];
}

export default function ImportedModelViewer({
  params, setParams, ceilingHeight, workingPlaneHeight, mountingHeight, roomOutline, luxAt, summary, onSnapshot,
}: Props) {
  const info = params.importedModel;
  const mountRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // three.js objects live in refs; React state only drives the UI
  const three = useRef<{
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    persp: THREE.PerspectiveCamera;
    ortho: THREE.OrthographicCamera;
    controls: OrbitControls;
    modelHolder: THREE.Group;
    overlay: THREE.Group;
    fixtures: THREE.Group;
    clip: THREE.Plane;
  } | null>(null);
  const rawModel = useRef<THREE.Object3D | null>(null);
  const placedModel = useRef<THREE.Group | null>(null);
  const sectionCache = useRef<{ key: string; segs: PlanSegment[] } | null>(null);

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [stats, setStats] = useState<{ meshes: number; triangles: number; materials: number; textures: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>('orbit');
  const [view, setView] = useState<View>('persp');
  // With a design room the model is cut at the section level so its ceiling does not hide the fixtures
  const [sectionView, setSectionView] = useState(() => !!params.importedModel?.activeRoomId);
  const [showLux, setShowLux] = useState(false);
  const [snap, setSnap] = useState(true);
  const [placeTypeId, setPlaceTypeId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [measure, setMeasure] = useState<THREE.Vector3[]>([]);
  const [calibrateTo, setCalibrateTo] = useState('');
  const [parts, setParts] = useState<{ path: string; name: string; visible: boolean }[]>([]);
  const [modelSize, setModelSize] = useState<THREE.Vector3 | null>(null);
  const [needsReattach, setNeedsReattach] = useState(false);

  const updateInfo = useCallback((patch: Partial<ImportedModelInfo>) => {
    setParams(prev => (prev.importedModel ? { ...prev, importedModel: { ...prev.importedModel, ...patch } } : prev));
  }, [setParams]);

  const activeRoom: ImportedModelRoom | undefined = info?.rooms.find(r => r.id === info.activeRoomId);
  const floorElev = activeRoom?.floorElevation ?? 0;
  const offset = info?.roomOffset ?? { x: 0, z: 0 };
  const roomCeiling = ceilingHeight;

  // ------------------------------------------------------------------ scene setup
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch (err: any) {
      setError(`3D viewer unavailable: ${err?.message || 'WebGL could not start in this browser.'}`);
      return;
    }
    const w = el.clientWidth || 800;
    const h = el.clientHeight || 520;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.localClippingEnabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0b1220');
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(30, 60, 20);
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));

    const persp = new THREE.PerspectiveCamera(50, w / h, 0.05, 5000);
    persp.position.set(15, 12, 18);
    const ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.05, 5000);
    ortho.position.set(0, 200, 0);
    ortho.up.set(0, 0, -1);
    ortho.lookAt(0, 0, 0);
    const controls = new OrbitControls(persp, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    const modelHolder = new THREE.Group();
    const overlay = new THREE.Group();
    const fixtures = new THREE.Group();
    scene.add(modelHolder, overlay, fixtures);
    const grid = new THREE.GridHelper(200, 200, 0x1e293b, 0x172033);
    grid.userData.isHelper = true;
    scene.add(grid);

    const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
    three.current = { scene, renderer, persp, ortho, controls, modelHolder, overlay, fixtures, clip };

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      // The controls are replaced when switching between 3D and top view
      const active = three.current?.controls ?? controls;
      active.update();
      renderer.render(scene, active.object as THREE.Camera);
    };
    loop();
    const ro = new ResizeObserver(() => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (!cw || !ch) return;
      renderer.setSize(cw, ch);
      persp.aspect = cw / ch;
      persp.updateProjectionMatrix();
      fitOrtho();
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      (three.current?.controls ?? controls).dispose();
      renderer.dispose();
      el.innerHTML = '';
      three.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Orthographic (top) camera framing the whole model */
  const fitOrtho = useCallback(() => {
    const t = three.current;
    const el = mountRef.current;
    if (!t || !el) return;
    const box = placedModel.current ? modelBounds(placedModel.current) : new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 3, 10));
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const aspect = (el.clientWidth || 800) / (el.clientHeight || 520);
    const half = Math.max(size.x / aspect, size.z) * 0.6 + 1;
    t.ortho.left = -half * aspect;
    t.ortho.right = half * aspect;
    t.ortho.top = half;
    t.ortho.bottom = -half;
    t.ortho.position.set(c.x, box.max.y + 50, c.z);
    t.ortho.lookAt(c.x, 0, c.z);
    t.ortho.updateProjectionMatrix();
    if (t.controls.object === t.ortho) {
      t.controls.target.set(c.x, 0, c.z);
      t.controls.update();
    }
  }, []);

  /** Perspective camera looking at the whole model */
  const fitPersp = useCallback(() => {
    const t = three.current;
    if (!t || !placedModel.current) return;
    const box = modelBounds(placedModel.current);
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2 || 10;
    t.persp.position.set(c.x + r * 0.9, c.y + r * 0.9, c.z + r * 1.1);
    t.persp.near = Math.max(0.01, r / 1000);
    t.persp.far = r * 50;
    t.persp.updateProjectionMatrix();
    t.controls.target.copy(c);
    t.controls.update();
  }, []);

  // Switch between perspective and top view
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    const target = t.controls.target.clone();
    t.controls.dispose();
    const cam = view === 'top' ? t.ortho : t.persp;
    const controls = new OrbitControls(cam, t.renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    if (view === 'top') {
      controls.enableRotate = false;
      controls.screenSpacePanning = true;
      fitOrtho();
      controls.target.set(t.ortho.position.x, 0, t.ortho.position.z);
    } else {
      controls.target.copy(target);
    }
    controls.update();
    t.controls = controls;
  }, [view, fitOrtho]);

  // ------------------------------------------------------------------ model placement
  /** Put the raw model in the scene with the given units / up axis; returns the plan size */
  const applyTransform = useCallback((scale: number, upAxis: UpAxis, hidden: string[] = []) => {
    const t = three.current;
    const raw = rawModel.current;
    if (!t || !raw) return;
    t.modelHolder.clear();
    raw.parent?.remove(raw);
    const placed = placeModel(raw, scale, upAxis);
    placedModel.current = placed;
    t.modelHolder.add(placed);
    // Visibility of parts
    const list: { path: string; name: string; visible: boolean }[] = [];
    const top = raw.children.length === 1 && raw.children[0].children.length > 1 ? raw.children[0] : raw;
    top.children.forEach((child, i) => {
      const path = pathOf(child, raw);
      const visible = !hidden.includes(path);
      child.visible = visible;
      list.push({ path, name: child.name || `${child.type} ${i + 1}`, visible });
    });
    setParts(list);
    const size = modelBounds(placed).getSize(new THREE.Vector3());
    setModelSize(size);
    sectionCache.current = null;
    fitPersp();
    fitOrtho();
  }, [fitOrtho, fitPersp]);

  // Section clipping on the model's materials
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    const elev = info?.sectionElevation ?? 1.2;
    t.clip.constant = sectionView ? elev : 1e6;
    placedModel.current?.traverse((o: any) => {
      if (!o.isMesh) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: THREE.Material) => {
        if (!m) return;
        m.clippingPlanes = sectionView ? [t.clip] : [];
        m.needsUpdate = true;
      });
    });
  }, [sectionView, info?.sectionElevation, loaded]);

  // ------------------------------------------------------------------ import
  const importFiles = async (files: File[]) => {
    setError(null);
    setWarnings([]);
    setCandidate(null);
    let set;
    try {
      set = validateModelFiles(files);
    } catch (err: any) {
      setError(err.message);
      return;
    }
    setBusy(true);
    try {
      setStatus('Checking the files...');
      const hash = await hashModelFiles(set.all);
      const model = await loadModel(set, setStatus);
      rawModel.current = model.root;
      setStats(model.stats);
      setWarnings(model.warnings);
      // Units: COLLADA carries its own; for the others guess from the raw size (to be confirmed)
      const rawSize = new THREE.Box3().setFromObject(model.root).getSize(new THREE.Vector3());
      const { unit, upAxis } = model.unitKnown ? { unit: 'm' as ModelUnit, upAxis: 'y' as UpAxis } : guessUnitAndAxis(rawSize, model.format);
      const scale = UNIT_SCALE[unit];
      applyTransform(scale, upAxis);
      const height = placedModel.current ? modelBounds(placedModel.current).getSize(new THREE.Vector3()).y : 3;
      const sectionElevation = Math.round(Math.min(Math.max(height * 0.45, 1.0), 2.3) * 100) / 100;
      const next: ImportedModelInfo = {
        fileName: set.main.name,
        format: set.format,
        fileNames: set.all.map(f => f.name),
        sizeBytes: set.totalBytes,
        hash,
        unit,
        scale,
        upAxis,
        sectionElevation,
        gapClose: 1.0,
        rooms: [],
        hiddenNodes: [],
        verified: false,
        importedAt: new Date().toISOString(),
        storageNote: 'Saving the model...',
      };
      setParams(prev => ({ ...prev, importedModel: next }));
      setLoaded(true);
      setNeedsReattach(false);
      setMode('room');
      setView('top');
      setStatus(null);
      // Keep the files: this browser first, then the cloud
      const local = await saveModelLocal(hash, set.all);
      const cloud = await uploadModelCloud(hash, set.all);
      setParams(prev => prev.importedModel?.hash === hash
        ? {
            ...prev,
            importedModel: {
              ...prev.importedModel,
              cloudPaths: 'paths' in cloud ? cloud.paths : undefined,
              storageNote: 'paths' in cloud
                ? 'Saved to your cloud storage and this device.'
                : `${cloud.error}${local ? '' : ' This browser could not cache it either; keep the original file.'}`,
            },
          }
        : prev);
    } catch (err: any) {
      setError(err instanceof ModelImportError ? err.message : `Import failed: ${err?.message || err}`);
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  // Reopen a project: reload the saved model files (this device, then the cloud)
  useEffect(() => {
    if (!info || loaded || busy) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setStatus(`Opening ${info.fileName}...`);
      let files = await loadModelLocal(info.hash);
      if (!files && info.cloudPaths?.length) {
        setStatus(`Downloading ${info.fileName}...`);
        files = await downloadModelCloud(info.cloudPaths);
        if (files) saveModelLocal(info.hash, files);
      }
      if (cancelled) return;
      if (!files) {
        setNeedsReattach(true);
        setStatus(null);
        setBusy(false);
        return;
      }
      try {
        const set = validateModelFiles(files);
        const model = await loadModel(set);
        if (cancelled) return;
        rawModel.current = model.root;
        setStats(model.stats);
        setWarnings(model.warnings);
        applyTransform(info.scale, info.upAxis, info.hiddenNodes || []);
        setLoaded(true);
      } catch (err: any) {
        setError(err?.message || String(err));
      }
      setStatus(null);
      setBusy(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.hash]);

  /** Re-attach the original file when it is neither cached nor in the cloud */
  const reattach = async (files: File[]) => {
    if (!info) return;
    try {
      const set = validateModelFiles(files);
      const hash = await hashModelFiles(set.all);
      if (hash !== info.hash) setWarnings(w => [...w, 'This file differs from the one originally imported; detected rooms may no longer match the geometry.']);
      const model = await loadModel(set);
      rawModel.current = model.root;
      setStats(model.stats);
      applyTransform(info.scale, info.upAxis, info.hiddenNodes || []);
      await saveModelLocal(info.hash, set.all);
      setLoaded(true);
      setNeedsReattach(false);
    } catch (err: any) {
      setError(err?.message || String(err));
    }
  };

  // ------------------------------------------------------------------ settings changes
  const changeTransform = (patch: { unit?: ModelUnit; scale?: number; upAxis?: UpAxis }) => {
    if (!info) return;
    if (info.rooms.length && !window.confirm('Changing the units, scale or orientation clears the rooms detected from this model (your design room and fixtures stay). Continue?')) return;
    const unit = patch.unit ?? info.unit;
    const scale = patch.scale ?? (patch.unit ? UNIT_SCALE[patch.unit] : info.scale);
    const upAxis = patch.upAxis ?? info.upAxis;
    applyTransform(scale, upAxis, info.hiddenNodes || []);
    updateInfo({ unit, scale, upAxis, rooms: [], activeRoomId: undefined, verified: false });
    setCandidate(null);
  };

  const togglePart = (path: string) => {
    const raw = rawModel.current;
    if (!raw || !info) return;
    const obj = path.split('/').reduce<THREE.Object3D | undefined>((o, i) => o?.children[Number(i)], raw);
    if (!obj) return;
    obj.visible = !obj.visible;
    sectionCache.current = null;
    const hidden = new Set(info.hiddenNodes || []);
    if (obj.visible) hidden.delete(path); else hidden.add(path);
    updateInfo({ hiddenNodes: [...hidden] });
    setParts(ps => ps.map(p => (p.path === path ? { ...p, visible: obj.visible } : p)));
  };

  const getSection = useCallback((): PlanSegment[] => {
    if (!placedModel.current || !info) return [];
    const key = `${info.sectionElevation}|${(info.hiddenNodes || []).join(',')}|${info.scale}|${info.upAxis}`;
    if (sectionCache.current?.key === key) return sectionCache.current.segs;
    const segs = sectionAt(placedModel.current, info.sectionElevation);
    sectionCache.current = { key, segs };
    return segs;
  }, [info]);

  // ------------------------------------------------------------------ overlays (section, rooms, measure)
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    t.overlay.clear();
    if (!loaded || !info) return;
    const lineAt = (pts: RoomPoint[], y: number, color: number, closed = true) => {
      const v = pts.map(([x, z]) => new THREE.Vector3(x, y, z));
      if (closed && v.length) v.push(v[0].clone());
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(v), new THREE.LineBasicMaterial({ color, depthTest: false }));
      line.renderOrder = 10;
      line.userData.isHelper = true;
      t.overlay.add(line);
    };
    // Section lines (what room detection sees)
    if (mode === 'room' || sectionView) {
      const segs = getSection();
      const arr: number[] = [];
      segs.forEach(({ a, b }) => arr.push(a[0], info.sectionElevation, a[1], b[0], info.sectionElevation, b[1]));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xf43f5e, depthTest: false }));
      ls.renderOrder = 9;
      ls.userData.isHelper = true;
      t.overlay.add(ls);
    }
    // Detected rooms
    info.rooms.forEach(r => {
      const pts = toRoomPoints(r.polygon) || [];
      lineAt(pts, r.floorElevation + 0.02, r.id === info.activeRoomId ? 0x22c55e : 0x94a3b8);
    });
    // Current design outline (it may have been edited after import)
    if (activeRoom) lineAt(roomOutline.map(([x, z]) => [x + offset.x, z + offset.z] as RoomPoint), floorElev + 0.03, 0x38bdf8);
    if (candidate) lineAt(candidate.polygon, candidate.floorElevation + 0.04, 0xf59e0b);
    if (measure.length) {
      const g = new THREE.BufferGeometry().setFromPoints(measure);
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xfacc15, depthTest: false }));
      l.renderOrder = 11;
      t.overlay.add(l);
      measure.forEach(p => {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfacc15, depthTest: false }));
        dot.position.copy(p);
        dot.renderOrder = 11;
        t.overlay.add(dot);
      });
    }
    // Lux estimate on the design room floor
    if (showLux && activeRoom && roomOutline.length >= 3) {
      const b = polygonBounds(roomOutline);
      const N = 48;
      const canvas = document.createElement('canvas');
      canvas.width = N;
      canvas.height = N;
      const ctx = canvas.getContext('2d')!;
      const img = ctx.createImageData(N, N);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = b.minX + ((i + 0.5) / N) * b.width;
        const z = b.minZ + ((j + 0.5) / N) * b.length;
        const [r, g, bl] = luxColor(luxAt(x, z), params.targetLux);
        const k = (j * N + i) * 4;
        img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = bl; img.data[k + 3] = 200;
      }
      ctx.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(canvas);
      const shape = new THREE.Shape(roomOutline.map(([x, z]) => new THREE.Vector2(x + offset.x, -(z + offset.z))));
      const geo = new THREE.ShapeGeometry(shape);
      const pos = geo.getAttribute('position');
      const uv = geo.getAttribute('uv');
      for (let i = 0; i < pos.count; i++) {
        uv.setXY(i, (pos.getX(i) - offset.x - b.minX) / b.width, 1 - (-pos.getY(i) - offset.z - b.minZ) / b.length);
      }
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = floorElev + 0.015;
      mesh.userData.isHelper = true;
      t.overlay.add(mesh);
    }
  }, [loaded, info, mode, sectionView, candidate, measure, activeRoom, roomOutline, offset.x, offset.z, floorElev, showLux, luxAt, params.targetLux, getSection]);

  // ------------------------------------------------------------------ fixtures in the model
  const positions = params.customPositions || [];
  const fixtureMountY = useCallback((cp: PlacedFixtureDragPosition) => {
    const af = params.activeFixtures?.find(f => f.id === cp.activeFixtureId) || params.activeFixtures?.find(f => f.fixtureId === cp.fixtureId);
    const resolved = resolveFixtureParams(af?.fixtureShape ?? params.fixtureShape, af?.fixtureWidth ?? params.fixtureWidth, af?.fixtureLength ?? params.fixtureLength, af?.fixtureDiameter ?? params.fixtureDiameter, af?.fixtureThickness ?? params.fixtureThickness, af?.fixtureBeamAngle ?? params.fixtureBeamAngle, af?.fixtureDistributionType ?? params.fixtureDistributionType);
    const style = fixtureStyleOf(cp.lightType || af?.lightType, resolved.shape);
    const hung = Math.min(roomCeiling - 0.05, Math.max(0.3, workingPlaneHeight + mountingHeight));
    return { resolved, y: isCeilingStyle(style) ? roomCeiling - 0.001 : hung, lightType: cp.lightType || af?.lightType };
  }, [params.activeFixtures, params.fixtureShape, params.fixtureWidth, params.fixtureLength, params.fixtureDiameter, params.fixtureThickness, params.fixtureBeamAngle, params.fixtureDistributionType, roomCeiling, workingPlaneHeight, mountingHeight]);

  useEffect(() => {
    const t = three.current;
    if (!t) return;
    t.fixtures.clear();
    if (!loaded || !activeRoom) return;
    positions.forEach(cp => {
      const { resolved, y, lightType } = fixtureMountY(cp);
      const { group } = createFixture3D(resolved, lightType, { dropToCeiling: roomCeiling - y, dropToFloor: y, showBeam: false, beamOpacity: 0 });
      group.position.set(offset.x + cp.x, floorElev + y, offset.z + cp.z);
      group.rotation.y = -((cp.rotationDegrees || 0) * Math.PI) / 180;
      group.userData.cpId = cp.id;
      if (selected.includes(cp.id)) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.42, 0.5, 32),
          new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide, depthTest: false })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -y + 0.03;
        ring.renderOrder = 12;
        group.add(ring);
      }
      t.fixtures.add(group);
    });
    // Spacing helpers for one selected fixture: nearest neighbour and nearest wall
    if (selected.length === 1) {
      const cp = positions.find(p => p.id === selected[0]);
      if (cp) {
        const y = floorElev + 0.05;
        const from = new THREE.Vector3(offset.x + cp.x, y, offset.z + cp.z);
        const others = positions.filter(p => p.id !== cp.id);
        let near: PlacedFixtureDragPosition | null = null;
        others.forEach(o => { if (!near || Math.hypot(o.x - cp.x, o.z - cp.z) < Math.hypot(near.x - cp.x, near.z - cp.z)) near = o; });
        const mat = new THREE.LineDashedMaterial({ color: 0xfacc15, dashSize: 0.15, gapSize: 0.08, depthTest: false });
        if (near) {
          const n = near as PlacedFixtureDragPosition;
          const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, new THREE.Vector3(offset.x + n.x, y, offset.z + n.z)]), mat);
          l.computeLineDistances();
          l.renderOrder = 12;
          t.fixtures.add(l);
        }
      }
    }
  }, [loaded, positions, activeRoom, offset.x, offset.z, floorElev, roomCeiling, selected, fixtureMountY]);

  // ------------------------------------------------------------------ picking
  const ndc = (e: React.PointerEvent | PointerEvent) => {
    const rect = (three.current!.renderer.domElement).getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  };
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pickModel = (e: React.PointerEvent): THREE.Vector3 | null => {
    const t = three.current;
    if (!t || !placedModel.current) return null;
    raycaster.setFromCamera(ndc(e), t.controls.object as THREE.Camera);
    const hits = raycaster.intersectObjects(visibleMeshes(placedModel.current), false)
      .filter(h => !sectionView || h.point.y <= (info?.sectionElevation ?? 1e6) + 1e-3);
    return hits[0]?.point.clone() ?? null;
  };
  const pickPlane = (e: React.PointerEvent, y: number): THREE.Vector3 | null => {
    const t = three.current;
    if (!t) return null;
    raycaster.setFromCamera(ndc(e), t.controls.object as THREE.Camera);
    const hit = new THREE.Vector3();
    return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), hit) ? hit : null;
  };
  const pickFixture = (e: React.PointerEvent): string | null => {
    const t = three.current;
    if (!t) return null;
    raycaster.setFromCamera(ndc(e), t.controls.object as THREE.Camera);
    const hit = raycaster.intersectObjects(t.fixtures.children, true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && !o.userData.cpId) o = o.parent;
    return o?.userData.cpId ?? null;
  };

  const toRoom = (p: THREE.Vector3): RoomPoint => [p.x - offset.x, p.z - offset.z];
  const snapPt = ([x, z]: RoomPoint): RoomPoint => (snap ? [Math.round(x / 0.05) * 0.05, Math.round(z / 0.05) * 0.05] : [x, z]);

  /** Write fixture edits back to the design (manual layout: quantities follow the positions) */
  const commitPositions = useCallback((list: PlacedFixtureDragPosition[]) => {
    setParams(prev => {
      const counts = new Map<string, number>();
      list.forEach(p => {
        const af = prev.activeFixtures?.find(f => f.id === p.activeFixtureId) || prev.activeFixtures?.find(f => f.fixtureId === p.fixtureId);
        if (af) counts.set(af.id, (counts.get(af.id) || 0) + 1);
      });
      return {
        ...prev,
        isManualQuantity: true,
        manualQuantity: list.length,
        activeFixtures: prev.activeFixtures?.map(af => ({ ...af, quantity: counts.get(af.id) || 0 })),
        customPositions: list,
      };
    });
  }, [setParams]);

  const drag = useRef<{ id: string; dx: number; dz: number; moved: boolean } | null>(null);
  const downAt = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    downAt.current = { x: e.clientX, y: e.clientY };
    if (!loaded || mode !== 'select' || !activeRoom) return;
    const id = pickFixture(e);
    if (!id) return;
    const cp = positions.find(p => p.id === id);
    const hit = pickPlane(e, floorElev);
    if (!cp || !hit) return;
    setSelected(sel => (e.shiftKey ? (sel.includes(id) ? sel.filter(s => s !== id) : [...sel, id]) : [id]));
    drag.current = { id, dx: offset.x + cp.x - hit.x, dz: offset.z + cp.z - hit.z, moved: false };
    three.current!.controls.enabled = false;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const t = three.current;
    if (!d || !t) return;
    const hit = pickPlane(e, floorElev);
    if (!hit) return;
    d.moved = true;
    const obj = t.fixtures.children.find(c => c.userData.cpId === d.id);
    if (obj) obj.position.set(hit.x + d.dx, obj.position.y, hit.z + d.dz);
  };

  const onPointerUp = async (e: React.PointerEvent) => {
    const t = three.current;
    const d = drag.current;
    if (t) t.controls.enabled = true;
    if (d) {
      drag.current = null;
      if (d.moved) {
        const obj = t?.fixtures.children.find(c => c.userData.cpId === d.id);
        if (obj) {
          let [x, z] = snapPt(toRoom(obj.position));
          [x, z] = clampPointToPolygon(x, z, roomOutline, 0.05);
          commitPositions(positions.map(p => (p.id === d.id ? { ...p, x: Number(x.toFixed(3)), z: Number(z.toFixed(3)) } : p)));
        }
      }
      return;
    }
    // A click (not an orbit drag)
    const start = downAt.current;
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5 || !loaded || !info) return;

    if (mode === 'select') {
      if (!pickFixture(e)) setSelected([]);
    } else if (mode === 'room') {
      const p = pickModel(e) || pickPlane(e, info.sectionElevation);
      if (!p) return;
      setBusy(true);
      setStatus('Detecting the room...');
      await new Promise(r => setTimeout(r, 20));
      try {
        const room = detectRoomAt(getSection(), [p.x, p.z], { gapClose: info.gapClose });
        const inside = room.polygon.reduce((a, q) => [a[0] + q[0] / room.polygon.length, a[1] + q[1] / room.polygon.length], [0, 0]) as RoomPoint;
        const probe = pointInPolygon(inside[0], inside[1], room.polygon) ? inside : ([p.x, p.z] as RoomPoint);
        const h = heightsAt(placedModel.current!, probe, info.sectionElevation);
        setCandidate({ polygon: room.polygon, area: room.area, floorElevation: h.floorY, ceilingHeight: h.ceilingHeight });
        setError(null);
      } catch (err: any) {
        setCandidate(null);
        setError(err?.message || String(err));
      }
      setStatus(null);
      setBusy(false);
    } else if (mode === 'measure') {
      const p = pickModel(e);
      if (!p) return;
      setMeasure(m => (m.length >= 2 ? [p] : [...m, p]));
    } else if (mode === 'place') {
      if (!activeRoom) return;
      const p = pickPlane(e, floorElev);
      if (!p) return;
      const [x, z] = snapPt(toRoom(p));
      if (!pointInPolygon(x, z, roomOutline)) {
        setError('Place fixtures inside the design room (blue outline).');
        return;
      }
      const af = params.activeFixtures?.find(f => f.id === placeTypeId) || params.activeFixtures?.[0];
      if (!af) {
        setError('Add a fixture type to the design first (Selected Fixtures).');
        return;
      }
      const [cx, cz] = clampPointToPolygon(x, z, roomOutline, 0.05);
      const np: PlacedFixtureDragPosition = {
        id: `fixture-${af.fixtureId}-m${uid()}`,
        fixtureId: af.fixtureId,
        lightType: af.lightType,
        x: Number(cx.toFixed(3)),
        z: Number(cz.toFixed(3)),
        lumens: af.lumens,
        wattage: af.wattage,
        activeFixtureId: af.id,
      };
      setError(null);
      commitPositions([...positions, np]);
      setSelected([np.id]);
    }
  };

  // ------------------------------------------------------------------ fixture tools
  const selectedPositions = positions.filter(p => selected.includes(p.id));
  const editSelected = (fn: (p: PlacedFixtureDragPosition, i: number, all: PlacedFixtureDragPosition[]) => PlacedFixtureDragPosition) => {
    if (!selectedPositions.length) return;
    const sel = selectedPositions;
    commitPositions(positions.map(p => {
      const i = sel.findIndex(s => s.id === p.id);
      if (i < 0) return p;
      const next = fn(p, i, sel);
      const [x, z] = clampPointToPolygon(next.x, next.z, roomOutline, 0.05);
      return { ...next, x: Number(x.toFixed(3)), z: Number(z.toFixed(3)) };
    }));
  };
  const rotate = (deg: number) => editSelected(p => ({ ...p, rotationDegrees: (((p.rotationDegrees || 0) + deg) % 360 + 360) % 360 }));
  const alignX = () => editSelected((p, _i, all) => ({ ...p, x: all[0].x }));
  const alignZ = () => editSelected((p, _i, all) => ({ ...p, z: all[0].z }));
  const distribute = () => {
    if (selectedPositions.length < 3) return;
    const xs = selectedPositions.map(p => p.x);
    const zs = selectedPositions.map(p => p.z);
    const alongX = Math.max(...xs) - Math.min(...xs) >= Math.max(...zs) - Math.min(...zs);
    const sorted = [...selectedPositions].sort((a, b) => (alongX ? a.x - b.x : a.z - b.z));
    const lo = alongX ? sorted[0].x : sorted[0].z;
    const hi = alongX ? sorted[sorted.length - 1].x : sorted[sorted.length - 1].z;
    const step = (hi - lo) / (sorted.length - 1);
    const target = new Map(sorted.map((p, i) => [p.id, lo + i * step]));
    editSelected(p => (alongX ? { ...p, x: target.get(p.id)! } : { ...p, z: target.get(p.id)! }));
  };
  const duplicate = () => {
    if (!selectedPositions.length) return;
    const copies = selectedPositions.map(p => {
      const [x, z] = clampPointToPolygon(p.x + 1.0, p.z, roomOutline, 0.05);
      return { ...p, id: `fixture-${p.fixtureId}-m${uid()}`, x: Number(x.toFixed(3)), z: Number(z.toFixed(3)) };
    });
    commitPositions([...positions, ...copies]);
    setSelected(copies.map(c => c.id));
  };
  const remove = () => {
    if (!selectedPositions.length) return;
    commitPositions(positions.filter(p => !selected.includes(p.id)));
    setSelected([]);
  };

  // Keyboard: Delete removes, Escape clears
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (mode === 'select' && (e.key === 'Delete' || e.key === 'Backspace') && selected.length) { e.preventDefault(); remove(); }
      if (e.key === 'Escape') { setSelected([]); setCandidate(null); setMeasure([]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ------------------------------------------------------------------ rooms
  const acceptCandidate = () => {
    if (!candidate || !info) return;
    const room: ImportedModelRoom = {
      id: uid(),
      name: `Room ${info.rooms.length + 1}`,
      polygon: toRoomVertices(candidate.polygon)!,
      floorElevation: Number(candidate.floorElevation.toFixed(3)),
      ceilingHeight: candidate.ceilingHeight !== null ? Number(candidate.ceilingHeight.toFixed(2)) : null,
      area: Number(candidate.area.toFixed(2)),
    };
    updateInfo({ rooms: [...info.rooms, room] });
    setCandidate(null);
    applyRoom(room);
  };

  /** Make a detected room the design room (outline, size and ceiling go to the Illumination design) */
  const applyRoom = (room: ImportedModelRoom) => {
    const world = toRoomPoints(room.polygon) || [];
    const norm = normalizePolygon(world);
    const b = polygonBounds(world);
    setParams(prev => ({
      ...prev,
      inputMode: 'dimensions',
      roomShape: 'custom',
      roomPolygon: toRoomVertices(norm),
      roomWidth: Number(b.width.toFixed(3)),
      roomLength: Number(b.length.toFixed(3)),
      ...(room.ceilingHeight && room.ceilingHeight > 1.8 ? { ceilingHeight: room.ceilingHeight } : {}),
      roomName: prev.roomName && !prev.roomName.startsWith('Room ') ? prev.roomName : room.name,
      importedModel: prev.importedModel
        ? { ...prev.importedModel, activeRoomId: room.id, roomOffset: { x: b.minX, z: b.minZ }, verified: false }
        : prev.importedModel,
    }));
    setSelected([]);
    setMode('select');
    // Cut the model at the section level so the ceiling does not hide the fixtures
    setSectionView(true);
  };

  const removeRoom = (id: string) => {
    if (!info) return;
    updateInfo({ rooms: info.rooms.filter(r => r.id !== id), ...(info.activeRoomId === id ? { activeRoomId: undefined } : {}) });
  };
  const renameRoom = (id: string, name: string) => {
    if (!info) return;
    updateInfo({ rooms: info.rooms.map(r => (r.id === id ? { ...r, name } : r)) });
  };

  const measured = measure.length === 2 ? measure[0].distanceTo(measure[1]) : null;
  const calibrate = () => {
    const actual = parseFloat(calibrateTo);
    if (!info || !measured || !(actual > 0)) return;
    const factor = actual / measured;
    if (factor < 0.001 || factor > 1000) return;
    changeTransform({ scale: info.scale * factor });
    setMeasure([]);
    setCalibrateTo('');
  };

  const snapshot = () => {
    const t = three.current;
    if (!t) return;
    t.renderer.render(t.scene, t.controls.object as THREE.Camera);
    onSnapshot(t.renderer.domElement.toDataURL('image/png'));
    setStatus('View saved for the Room Layout PDF.');
    setTimeout(() => setStatus(null), 2500);
  };

  const removeModel = () => {
    if (!window.confirm('Remove the imported model from this design? The room and fixtures you designed stay.')) return;
    rawModel.current = null;
    placedModel.current = null;
    three.current?.modelHolder.clear();
    setLoaded(false);
    setParts([]);
    setStats(null);
    onSnapshot(null);
    setParams(prev => ({ ...prev, importedModel: undefined }));
  };

  // Selected fixture details
  const selInfo = useMemo(() => {
    if (selectedPositions.length !== 1) return null;
    const p = selectedPositions[0];
    const others = positions.filter(o => o.id !== p.id);
    const nearest = others.reduce((m, o) => Math.min(m, Math.hypot(o.x - p.x, o.z - p.z)), Infinity);
    return { p, nearest, wall: distanceToWalls(p.x, p.z, roomOutline) };
  }, [selectedPositions, positions, roomOutline]);

  const typeOptions = params.activeFixtures || [];
  useEffect(() => {
    if (!placeTypeId && typeOptions[0]) setPlaceTypeId(typeOptions[0].id);
  }, [placeTypeId, typeOptions]);

  const below = summary.installedLumens + 0.5 < summary.requiredLumens;
  const lpdOver = summary.lpd > summary.lpdLimit;

  // ------------------------------------------------------------------ UI
  return (
    <div className="space-y-3">
      {/* Import bar */}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" multiple accept={MODEL_ACCEPT} className="hidden" onChange={e => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          if (files.length) (needsReattach ? reattach(files) : importFiles(files));
        }} />
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={`${btn} bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700`}>
          <Upload className="w-3.5 h-3.5" /> {info ? (needsReattach ? 'Re-attach Model File' : 'Import Another Model') : 'Import 3D Model'}
        </button>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">GLB / glTF (preferred), OBJ + MTL, COLLADA DAE. SketchUp: export to DAE or GLB first.</span>
        {info && (
          <button type="button" onClick={removeModel} className={`${btnIdle} ml-auto`}><X className="w-3.5 h-3.5" /> Remove Model</button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-[11px] text-rose-700 dark:text-rose-300 whitespace-pre-line">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button type="button" onClick={() => setError(null)} className="shrink-0"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-800 dark:text-amber-300">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {w}
        </div>
      ))}
      {needsReattach && info && (
        <div className="rounded-lg border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 px-3 py-2 text-[11px] text-sky-800 dark:text-sky-300">
          The model <b>{info.fileName}</b> is not stored on this device{info.cloudPaths?.length ? ' and could not be downloaded' : ' or in the cloud'}. Re-attach the same file(s) ({info.fileNames.join(', ')}) to view it. Your room and fixtures are kept.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
        {/* Viewer */}
        <div className="xl:col-span-3 space-y-2">
          {info && loaded && (
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex gap-1">
                <button type="button" onClick={() => setView('persp')} className={view === 'persp' ? btnOn : btnIdle}><Box className="w-3.5 h-3.5" /> 3D</button>
                <button type="button" onClick={() => setView('top')} className={view === 'top' ? btnOn : btnIdle}><Grid3x3 className="w-3.5 h-3.5" /> Top</button>
                <button type="button" onClick={() => (view === 'top' ? fitOrtho() : fitPersp())} className={btnIdle} title="Fit the model in view"><Maximize2 className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => setSectionView(!sectionView)} className={sectionView ? btnOn : btnIdle} title="Cut the model at the section level to see inside"><Scan className="w-3.5 h-3.5" /> Section</button>
              </div>
              <span className="hidden sm:block w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
              <div className="flex flex-wrap gap-1">
                <button type="button" onClick={() => setMode('orbit')} className={mode === 'orbit' ? btnOn : btnIdle}><Box className="w-3.5 h-3.5" /> Navigate</button>
                <button type="button" onClick={() => { setMode('room'); setCandidate(null); }} className={mode === 'room' ? btnOn : btnIdle}><Layers className="w-3.5 h-3.5" /> Pick Room</button>
                <button type="button" onClick={() => { setMode('measure'); setMeasure([]); }} className={mode === 'measure' ? btnOn : btnIdle}><Ruler className="w-3.5 h-3.5" /> Measure</button>
                <button type="button" disabled={!activeRoom} onClick={() => setMode('select')} className={mode === 'select' ? btnOn : btnIdle}><MousePointer2 className="w-3.5 h-3.5" /> Select / Move</button>
                <button type="button" disabled={!activeRoom} onClick={() => setMode('place')} className={mode === 'place' ? btnOn : btnIdle}><PlusCircle className="w-3.5 h-3.5" /> Add Fixture</button>
              </div>
              <div className="flex gap-1 ml-auto">
                <button type="button" disabled={!activeRoom} onClick={() => setShowLux(!showLux)} className={showLux ? btnOn : btnIdle} title="Estimated illuminance on the floor"><Sun className="w-3.5 h-3.5" /> Lux</button>
                <button type="button" onClick={snapshot} className={btnIdle} title="Use this view in the Room Layout PDF"><Camera className="w-3.5 h-3.5" /> Report View</button>
              </div>
            </div>
          )}

          <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950" style={{ height: 'min(70vh, 560px)', minHeight: 360 }}>
            <div
              ref={mountRef}
              className={`absolute inset-0 ${mode === 'orbit' || mode === 'select' ? '' : 'cursor-crosshair'}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
            {!info && !busy && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 pointer-events-none">
                <Upload className="w-10 h-10 text-slate-600 mb-3" />
                <p className="text-sm font-bold text-slate-200">Import an architectural 3D model</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-md">Pick rooms from the model, place and arrange luminaires inside it, and the Illumination calculation, 2D layout, 3D view and exports update together.</p>
              </div>
            )}
            {(busy || status) && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-slate-900/90 border border-slate-700 px-3 py-1.5 text-[11px] text-slate-200">
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {status || 'Working...'}
              </div>
            )}
            {loaded && (
              <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-2 pointer-events-none">
                <span className="rounded bg-slate-900/85 px-2 py-1 text-[10px] text-slate-300">
                  {mode === 'orbit' && 'Drag to orbit, right-drag to pan, scroll to zoom.'}
                  {mode === 'room' && 'Click inside a room (Top view is easiest). Red lines show the plan section used for detection.'}
                  {mode === 'measure' && (measure.length < 2 ? `Click ${measure.length === 0 ? 'the first' : 'the second'} point on the model.` : `Distance: ${fmt(measured || 0, 3)} m`)}
                  {mode === 'select' && 'Click a fixture to select (Shift for several), drag to move. Delete removes.'}
                  {mode === 'place' && 'Click on the floor of the design room to add a fixture.'}
                </span>
                <span className="rounded bg-slate-900/85 px-2 py-1 text-[10px] text-slate-400">
                  <span className="text-emerald-400">green</span> design room, <span className="text-sky-400">blue</span> current outline, <span className="text-amber-400">amber</span> detected, grey other rooms
                </span>
              </div>
            )}
          </div>

          {/* Fixture tools */}
          {loaded && activeRoom && (mode === 'select' || mode === 'place') && (
            <div className="flex flex-wrap items-center gap-1.5">
              {mode === 'place' && (
                <select value={placeTypeId || ''} onChange={e => setPlaceTypeId(e.target.value)} className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-bold text-slate-700 dark:text-slate-200">
                  {typeOptions.map(t => <option key={t.id} value={t.id}>{t.lightType} ({t.lumens} lm, {t.wattage} W)</option>)}
                </select>
              )}
              <button type="button" disabled={!selected.length} onClick={duplicate} className={btnIdle}><Copy className="w-3.5 h-3.5" /> Duplicate</button>
              <button type="button" disabled={!selected.length} onClick={() => rotate(-15)} className={btnIdle}><RotateCcw className="w-3.5 h-3.5" /> 15°</button>
              <button type="button" disabled={!selected.length} onClick={() => rotate(15)} className={btnIdle}><RotateCw className="w-3.5 h-3.5" /> 15°</button>
              <button type="button" disabled={selected.length < 2} onClick={alignZ} className={btnIdle} title="Same row (z) as the first selected"><AlignVerticalJustifyCenter className="w-3.5 h-3.5" /> Align Row</button>
              <button type="button" disabled={selected.length < 2} onClick={alignX} className={btnIdle} title="Same column (x) as the first selected"><AlignHorizontalJustifyCenter className="w-3.5 h-3.5" /> Align Column</button>
              <button type="button" disabled={selected.length < 3} onClick={distribute} className={btnIdle} title="Equal spacing between the outer two"><Columns3 className="w-3.5 h-3.5" /> Distribute</button>
              <button type="button" disabled={!selected.length} onClick={remove} className={`${btnIdle} hover:border-rose-400`}><Trash2 className="w-3.5 h-3.5" /> Delete</button>
              <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 ml-2">
                <input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} /> Snap 0.05 m
              </label>
              {selInfo && (
                <span className="ml-auto text-[11px] font-mono text-slate-600 dark:text-slate-300">
                  x {fmt(selInfo.p.x)} m, z {fmt(selInfo.p.z)} m · nearest fixture {Number.isFinite(selInfo.nearest) ? `${fmt(selInfo.nearest)} m` : '—'} · wall {fmt(selInfo.wall)} m · {selInfo.p.rotationDegrees || 0}°
                </span>
              )}
            </div>
          )}

          {/* Detected room awaiting confirmation */}
          {candidate && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-200">
              <span><b>Detected room:</b> {fmt(candidate.area)} m², {candidate.polygon.length} walls, {fmt(polygonBounds(candidate.polygon).width)} × {fmt(polygonBounds(candidate.polygon).length)} m, ceiling {candidate.ceilingHeight !== null ? `${fmt(candidate.ceilingHeight)} m` : 'not found (keeps the current value)'}</span>
              <button type="button" onClick={acceptCandidate} className={`${btn} bg-emerald-600 border-emerald-600 text-white ml-auto`}><CheckCircle2 className="w-3.5 h-3.5" /> Use for Design</button>
              <button type="button" onClick={() => setCandidate(null)} className={btnIdle}>Discard</button>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="space-y-3 text-[11px]">
          {info && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
              <div className="font-black uppercase tracking-widest text-[10px] text-slate-400">Model</div>
              <div className="text-slate-700 dark:text-slate-200 font-bold break-all">{info.fileName}</div>
              <div className="text-slate-500">{info.format.toUpperCase()} · {(info.sizeBytes / 1048576).toFixed(1)} MB{stats ? ` · ${stats.meshes} meshes · ${(stats.triangles / 1000).toFixed(0)}k triangles` : ''}</div>
              {info.storageNote && <div className="text-slate-500">{info.storageNote}</div>}
              {modelSize && <div className="text-slate-600 dark:text-slate-300 font-mono">Size: {fmt(modelSize.x)} × {fmt(modelSize.z)} m plan, {fmt(modelSize.y)} m high</div>}
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-0.5">
                  <span className="text-[9px] font-black uppercase text-slate-400">Model units</span>
                  <select value={info.unit} disabled={info.format === 'dae'} onChange={e => changeTransform({ unit: e.target.value as ModelUnit })} className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    {(Object.keys(UNIT_LABEL) as ModelUnit[]).map(u => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="text-[9px] font-black uppercase text-slate-400">Up axis</span>
                  <select value={info.upAxis} disabled={info.format === 'dae'} onChange={e => changeTransform({ upAxis: e.target.value as UpAxis })} className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    <option value="y">Y up (glTF, most OBJ)</option>
                    <option value="z">Z up (CAD / SketchUp)</option>
                  </select>
                </label>
              </div>
              {info.format === 'dae' && <div className="text-slate-500">COLLADA declares its own units and up axis.</div>}
              {Math.abs(info.scale / UNIT_SCALE[info.unit] - 1) > 1e-6 && <div className="text-slate-500">Calibrated scale × {(info.scale / UNIT_SCALE[info.unit]).toFixed(4)}</div>}
              {mode === 'measure' && measured !== null && (
                <div className="flex items-center gap-1">
                  <span>Measured {fmt(measured, 3)} m. Actual</span>
                  <input value={calibrateTo} onChange={e => setCalibrateTo(e.target.value)} placeholder="m" className="w-16 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
                  <button type="button" onClick={calibrate} className={btnIdle}>Scale</button>
                </div>
              )}
            </div>
          )}

          {info && loaded && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
              <div className="font-black uppercase tracking-widest text-[10px] text-slate-400">Room Detection</div>
              <label className="block space-y-0.5">
                <span className="text-slate-500">Section level: {fmt(info.sectionElevation)} m above the lowest point</span>
                <input type="range" min={0.2} max={Math.max(0.5, (modelSize?.y ?? 3) - 0.1)} step={0.05} value={info.sectionElevation} onChange={e => updateInfo({ sectionElevation: Number(e.target.value) })} className="w-full" />
              </label>
              <label className="block space-y-0.5">
                <span className="text-slate-500">Close openings up to {fmt(info.gapClose)} m (doorways)</span>
                <input type="range" min={0} max={2} step={0.05} value={info.gapClose} onChange={e => updateInfo({ gapClose: Number(e.target.value) })} className="w-full" />
              </label>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {info.rooms.length === 0 && <div className="text-slate-500">No rooms yet. Choose Pick Room and click inside a room.</div>}
                {info.rooms.map(r => (
                  <div key={r.id} className={`flex items-center gap-1 rounded border px-1.5 py-1 ${r.id === info.activeRoomId ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' : 'border-slate-200 dark:border-slate-700'}`}>
                    <input value={r.name} onChange={e => renameRoom(r.id, e.target.value)} className="flex-1 min-w-0 bg-transparent font-bold text-slate-700 dark:text-slate-200" />
                    <span className="text-slate-500 font-mono">{fmt(r.area, 1)} m²</span>
                    <button type="button" title="Use as the design room" onClick={() => applyRoom(r)} className="text-emerald-600 font-bold px-1">Use</button>
                    <button type="button" title="Remove" onClick={() => removeRoom(r.id)} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {parts.length > 1 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-1">
              <div className="font-black uppercase tracking-widest text-[10px] text-slate-400">Visibility ({parts.length} parts)</div>
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {parts.map(p => (
                  <button key={p.path} type="button" onClick={() => togglePart(p.path)} className="w-full flex items-center gap-1.5 text-left text-slate-600 dark:text-slate-300 hover:text-indigo-600">
                    {p.visible ? <Eye className="w-3 h-3 shrink-0" /> : <EyeOff className="w-3 h-3 shrink-0 text-slate-400" />}
                    <span className={`truncate ${p.visible ? '' : 'line-through text-slate-400'}`}>{p.name}</span>
                  </button>
                ))}
              </div>
              <div className="text-slate-500">Hidden parts are left out of room detection (e.g. roof, furniture).</div>
            </div>
          )}

          {activeRoom && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-1.5">
              <div className="font-black uppercase tracking-widest text-[10px] text-slate-400">Design Check: {activeRoom.name}</div>
              {!info?.verified ? (
                <div className="rounded border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-2 text-amber-900 dark:text-amber-200 space-y-1.5">
                  <div className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Room size and ceiling height come from the imported model and are not verified. Check them against the drawings (use Measure) before relying on the results.</div>
                  <button type="button" onClick={() => updateInfo({ verified: true })} className={`${btn} bg-amber-600 border-amber-600 text-white`}><ShieldCheck className="w-3.5 h-3.5" /> I have verified the dimensions</button>
                </div>
              ) : (
                <div className="flex gap-1.5 text-emerald-700 dark:text-emerald-300"><ShieldCheck className="w-3.5 h-3.5" /> Dimensions verified by the designer.</div>
              )}
              <table className="w-full font-mono text-[10.5px]">
                <tbody className="text-slate-600 dark:text-slate-300">
                  <tr><td>Floor area</td><td className="text-right">{fmt(summary.area)} m²</td></tr>
                  <tr><td>Ceiling / working plane</td><td className="text-right">{fmt(ceilingHeight)} / {fmt(workingPlaneHeight)} m</td></tr>
                  <tr><td>Room index</td><td className="text-right">{fmt(summary.roomIndex)}</td></tr>
                  <tr><td>UF / MF</td><td className="text-right">{fmt(summary.utilizationFactor)} / {fmt(summary.maintenanceFactor)}</td></tr>
                  <tr><td>Required / installed</td><td className="text-right">{summary.requiredFixtures} / {summary.installedFixtures}</td></tr>
                  <tr><td>Average (lumen method)</td><td className={`text-right font-bold ${below ? 'text-rose-600' : 'text-emerald-600'}`}>{Math.round(summary.averageLux)} lx</td></tr>
                  <tr><td>Target</td><td className="text-right">{summary.targetLux} lx</td></tr>
                  <tr><td>Point grid (estimate)</td><td className="text-right">{Math.round(summary.pointAverageLux)} lx</td></tr>
                  <tr><td>Connected load</td><td className="text-right">{Math.round(summary.connectedLoadW)} W</td></tr>
                  <tr><td>LPD / limit</td><td className={`text-right ${lpdOver ? 'text-rose-600 font-bold' : ''}`}>{fmt(summary.lpd)} / {fmt(summary.lpdLimit)} W/m²</td></tr>
                </tbody>
              </table>
              {below && <div className="text-rose-600">Installed lumens are below the requirement for the target illuminance.</div>}
              {lpdOver && <div className="text-rose-600">Lighting power density exceeds the limit for this space.</div>}
              <details className="text-slate-500">
                <summary className="cursor-pointer font-bold">Assumptions</summary>
                <ul className="list-disc pl-4 space-y-0.5 mt-1">
                  <li>Average illuminance by the lumen method (E = N·Φ·UF·MF / A) with the design's utilization and maintenance factors.</li>
                  <li>Lux overlay and point grid use a simplified beam model of each luminaire, not manufacturer photometric (IES/LDT) files; treat them as indicative only.</li>
                  <li>Model geometry is used as drawn; units: {info ? UNIT_LABEL[info.unit] : '—'}{info && Math.abs(info.scale / UNIT_SCALE[info.unit] - 1) > 1e-6 ? ' (calibrated)' : ''}.</li>
                  <li>Room outline traced from a plan section at {fmt(info?.sectionElevation ?? 0)} m (about ±5 cm).</li>
                </ul>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
