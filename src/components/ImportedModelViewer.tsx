import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Upload, Box, Eye, EyeOff, Maximize2, Layers, MousePointer2, Ruler, PlusCircle, Copy, RotateCw, RotateCcw,
  Trash2, AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter, Columns3, ShieldCheck, AlertTriangle,
  Loader2, Camera, Grid3x3, Info, X, CheckCircle2, Scan, Sun, Type, FileText, Crosshair,
} from 'lucide-react';
import { AnnotationSet, IlluminationParams, ImportedModelInfo, ImportedModelRoom, ModelAnnotation, ModelFloor, PlacedFixtureDragPosition, SavedLightingDetail } from '../types';
import { floorOf, floorSectionElevation, floorTop, floorTotals, floorsFromLevels, newFloorId, ordinalFloorName, sortedFloors } from '../utils/modelFloors';
import { DxfAnnotationError, parseDxfAnnotations } from '../utils/dxfAnnotations';
import { annotationMetres, dxfToScene, isShown, needsLeader, resolveOverlaps, sceneToDxf } from '../utils/modelAnnotations';
import {
  MODEL_ACCEPT, ModelImportError, ModelUnit, PlanSegment, UNIT_LABEL, UNIT_SCALE, UpAxis,
  detectFloorLevels, detectRoomAt, guessUnitAndAxis, heightsAt, loadModel, modelBounds, placeModel, sectionAt, validateModelFiles, visibleMeshes,
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
  /** Add (or update) model rooms in Rooms & Properties, each sized by the lumen method; returns how many */
  onAddRoomsToProject: (rooms: ImportedModelRoom[]) => number;
  /** Model room ids already in Rooms & Properties */
  roomsInProject: string[];
  /** Rooms in Rooms & Properties (their fixtures are shown on their floors) */
  projectRooms?: SavedLightingDetail[];
  /** Make a room from Rooms & Properties the design room, with its own fixtures and settings */
  onLoadProjectRoom?: (savedRoomId: string) => void;
}

type Mode = 'orbit' | 'room' | 'measure' | 'place' | 'select' | 'text';
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
  onAddRoomsToProject, roomsInProject, projectRooms = [], onLoadProjectRoom,
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
    labels: THREE.Group;
    fixtures: THREE.Group;
    /** Luminaires of the other Rooms & Properties rooms, on their floors */
    projectFixtures: THREE.Group;
    clip: THREE.Plane;
    /** Lower cut: hides floors below the lowest visible floor */
    clipLow: THREE.Plane;
  } | null>(null);
  const rawModel = useRef<THREE.Object3D | null>(null);
  const placedModel = useRef<THREE.Group | null>(null);
  const sectionCache = useRef<{ key: string; segs: PlanSegment[] } | null>(null);
  const shiftRef = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const dxfRef = useRef<HTMLInputElement>(null);
  const [annSearch, setAnnSearch] = useState('');
  const [annSelected, setAnnSelected] = useState<string | null>(null);

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
  /** Rooms ticked in the list (for adding several to Rooms & Properties at once) */
  const [checkedRooms, setCheckedRooms] = useState<string[]>([]);
  /** Room most recently picked or clicked, highlighted in the model */
  const [focusRoomId, setFocusRoomId] = useState<string | null>(null);
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

  // ------------------------------------------------------------------ floors (design layers)
  const floors = useMemo(() => sortedFloors(info?.floors), [info?.floors]);
  const activeFloor: ModelFloor | undefined =
    floors.find(f => f.id === info?.activeFloorId) || (activeRoom ? floorOf(floors, activeRoom.floorElevation) : undefined) || floors[0];
  const roomFloor = useCallback((r: { floorElevation: number }) => floorOf(floors, r.floorElevation), [floors]);
  /** A floor's layer is shown (rooms, fixtures, model storey) */
  const floorShown = useCallback((elevation: number) => {
    const f = floorOf(floors, elevation);
    return !f || f.visible !== false;
  }, [floors]);
  /** Rooms listed and picked on the active floor (all rooms when no floors are set) */
  const [allFloorsList, setAllFloorsList] = useState(false);
  const floorRooms = useMemo(
    () => (info?.rooms || []).filter(r => allFloorsList || !activeFloor || roomFloor(r)?.id === activeFloor.id),
    [info?.rooms, allFloorsList, activeFloor, roomFloor]
  );
  const modelTop = modelSize?.y ?? 3;

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
    const labels = new THREE.Group();
    const fixtures = new THREE.Group();
    const projectFixtures = new THREE.Group();
    scene.add(modelHolder, overlay, fixtures, projectFixtures, labels);
    const grid = new THREE.GridHelper(200, 200, 0x1e293b, 0x172033);
    grid.userData.isHelper = true;
    scene.add(grid);

    const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
    const clipLow = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6);
    three.current = { scene, renderer, persp, ortho, controls, modelHolder, overlay, labels, fixtures, projectFixtures, clip, clipLow };

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
    const sp = placed.children[0].position;
    shiftRef.current = { x: Number(sp.x.toFixed(4)), y: Number(sp.y.toFixed(4)), z: Number(sp.z.toFixed(4)) };
    const shift = shiftRef.current;
    setParams(prev => {
      const old = prev.importedModel?.placementShift;
      if (!prev.importedModel || (old && old.x === shift.x && old.y === shift.y && old.z === shift.z)) return prev;
      return { ...prev, importedModel: { ...prev.importedModel, placementShift: shift } };
    });
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
  }, [fitOrtho, fitPersp, setParams]);

  // Section clipping on the model's materials; hidden floor layers above / below the visible ones are cut off
  const visibleRange = useMemo(() => {
    const shown = floors.filter(f => f.visible !== false);
    if (!floors.length || !shown.length || shown.length === floors.length) return null;
    const lowest = shown[0];
    const highest = shown[shown.length - 1];
    return {
      low: lowest === floors[0] ? -1e6 : lowest.elevation - 0.05,
      high: highest === floors[floors.length - 1] ? 1e6 : floorTop(floors, highest, modelTop) - 0.05,
    };
  }, [floors, modelTop]);
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    const elev = info?.sectionElevation ?? 1.2;
    const high = Math.min(sectionView ? elev : 1e6, visibleRange?.high ?? 1e6);
    const low = visibleRange?.low ?? -1e6;
    t.clip.constant = high;
    t.clipLow.constant = -low;
    const planes = [...(high < 1e6 ? [t.clip] : []), ...(low > -1e6 ? [t.clipLow] : [])];
    placedModel.current?.traverse((o: any) => {
      // Surfaces and also edges / points / sprites (SketchUp exports carry edges as lines); otherwise
      // those of cut-away floors stay floating above the section
      if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite) || !o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: THREE.Material) => {
        if (!m) return;
        m.clippingPlanes = planes;
        m.needsUpdate = true;
      });
    });
  }, [sectionView, info?.sectionElevation, loaded, visibleRange]);

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
      // Storeys from the model's floor slabs: each one is a design layer
      setStatus('Finding the floors...');
      const detectedFloors = floorsFromLevels(placedModel.current ? detectFloorLevels(placedModel.current) : [0]);
      const sectionElevation = detectedFloors.length > 1
        ? floorSectionElevation(detectedFloors, detectedFloors[0], height)
        : Math.round(Math.min(Math.max(height * 0.45, 1.0), 2.3) * 100) / 100;
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
        placementShift: { ...shiftRef.current },
        floors: detectedFloors,
        activeFloorId: detectedFloors[0].id,
      };
      if (detectedFloors.length > 1) setWarnings(w => [...w, `${detectedFloors.length} floors found (${detectedFloors.map(f => `${f.name} +${f.elevation.toFixed(2)} m`).join(', ')}). Check them under Floors; rename, add or adjust levels as needed.`]);
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
    const nextFloors = floorsFromLevels(placedModel.current ? detectFloorLevels(placedModel.current) : [0]);
    const top = placedModel.current ? modelBounds(placedModel.current).getSize(new THREE.Vector3()).y : modelTop;
    updateInfo({
      unit, scale, upAxis, rooms: [], activeRoomId: undefined, verified: false, floors: nextFloors, activeFloorId: nextFloors[0].id,
      sectionElevation: floorSectionElevation(nextFloors, nextFloors[0], top),
    });
    sectionCache.current = null;
    setCandidate(null);
  };

  // Projects saved before floors existed: find them once the model is open
  useEffect(() => {
    if (!loaded || !info || info.floors || !placedModel.current) return;
    const found = floorsFromLevels(detectFloorLevels(placedModel.current));
    const current = info.activeRoomId ? info.rooms.find(r => r.id === info.activeRoomId) : undefined;
    updateInfo({ floors: found, activeFloorId: (current ? floorOf(found, current.floorElevation) : found[0])?.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, info?.floors]);

  /** Work on a floor: its section is used for room picking, its rooms are listed */
  const selectFloor = (f: ModelFloor) => {
    if (!info) return;
    updateInfo({ activeFloorId: f.id, sectionElevation: floorSectionElevation(floors, f, modelTop), floors: floors.map(x => (x.id === f.id ? { ...x, visible: true } : x)) });
    sectionCache.current = null;
    setSectionView(true);
    setCandidate(null);
    setCheckedRooms([]);
  };
  const updateFloor = (id: string, patch: Partial<ModelFloor>) => {
    if (!info) return;
    const next = floors.map(f => (f.id === id ? { ...f, ...patch } : f));
    const active = next.find(f => f.id === (activeFloor?.id ?? id));
    updateInfo({
      floors: next,
      // A changed level moves the active floor's section with it
      ...(patch.elevation !== undefined && active && active.id === id ? { sectionElevation: floorSectionElevation(next, active, modelTop) } : {}),
    });
  };
  const detectFloors = () => {
    if (!info || !placedModel.current) return;
    if (floors.length > 1 && !window.confirm('Detect the floors again? Floor names and levels you changed are replaced (rooms and fixtures stay; each room goes to the floor at its level).')) return;
    const found = floorsFromLevels(detectFloorLevels(placedModel.current));
    updateInfo({ floors: found, activeFloorId: found[0].id, sectionElevation: floorSectionElevation(found, found[0], modelTop) });
    sectionCache.current = null;
    setStatus(`${found.length} floor${found.length === 1 ? '' : 's'} found.`);
    setTimeout(() => setStatus(null), 2500);
  };
  const addFloor = () => {
    if (!info) return;
    const top = floors[floors.length - 1];
    // Default: one storey (3.0 m) above the top floor, or a typical floor height when there is none yet
    const elevation = top ? Math.round((top.elevation + 3.0) * 100) / 100 : 0;
    const f: ModelFloor = { id: newFloorId(), name: ordinalFloorName(floors.length), elevation, visible: true };
    updateInfo({ floors: [...floors, f] });
  };
  const removeFloor = (id: string) => {
    if (!info || floors.length <= 1) return;
    const f = floors.find(x => x.id === id);
    const n = info.rooms.filter(r => roomFloor(r)?.id === id).length;
    if (!window.confirm(`Remove ${f?.name || 'this floor'}?${n ? ` Its ${n} room${n === 1 ? '' : 's'} move to the floor below.` : ''}`)) return;
    const rest = floors.filter(x => x.id !== id);
    updateInfo({ floors: rest, ...(info.activeFloorId === id ? { activeFloorId: rest[0].id, sectionElevation: floorSectionElevation(rest, rest[0], modelTop) } : {}) });
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
    // Picked rooms: outline and name label (design room green, last picked amber, others grey)
    const labelSize = Math.max(0.8, Math.min(4, (modelSize ? Math.max(modelSize.x, modelSize.z) : 10) / 11));
    info.rooms.forEach(r => {
      // Hidden floor layers, and floors above the section cut (cut away with the model)
      if (!floorShown(r.floorElevation) || (sectionView && r.floorElevation > info.sectionElevation)) return;
      const pts = toRoomPoints(r.polygon) || [];
      const onActiveFloor = !activeFloor || roomFloor(r)?.id === activeFloor.id;
      const color = r.id === info.activeRoomId ? 0x22c55e : r.id === focusRoomId ? 0xf59e0b : onActiveFloor ? 0x94a3b8 : 0x475569;
      lineAt(pts, r.floorElevation + 0.02, color);
      // In section view, rooms of other floors stay as dim outlines (no labels over the floor being worked on)
      if (!pts.length || (sectionView && !onActiveFloor && r.id !== info.activeRoomId)) return;
      // Label at a point inside the room (centroid, or the first vertex nudged inward)
      let cx = pts.reduce((s, q) => s + q[0], 0) / pts.length;
      let cz = pts.reduce((s, q) => s + q[1], 0) / pts.length;
      if (!pointInPolygon(cx, cz, pts)) [cx, cz] = clampPointToPolygon(cx, cz, pts, 0.5);
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'rgba(15,23,42,0.82)';
      ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
      ctx.font = 'bold 26px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.name.slice(0, 18), 128, 22);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '20px Arial';
      ctx.fillText(`${r.area.toFixed(1)} m²`, 128, 48);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true }));
      sprite.scale.set(labelSize * 2, labelSize * 0.5, 1);
      // On the active floor the label sits just above the section cut; other floors keep theirs at floor level
      sprite.position.set(cx, onActiveFloor && (sectionView || mode === 'room') ? Math.max(r.floorElevation + 0.1, info.sectionElevation + 0.05) : r.floorElevation + 0.1, cz);
      sprite.renderOrder = 13;
      sprite.userData.isHelper = true;
      t.overlay.add(sprite);
    });
    // Current design outline (it may have been edited after import)
    if (activeRoom && floorShown(activeRoom.floorElevation) && !(sectionView && activeRoom.floorElevation > info.sectionElevation)) lineAt(roomOutline.map(([x, z]) => [x + offset.x, z + offset.z] as RoomPoint), floorElev + 0.03, 0x38bdf8);
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
  }, [loaded, info, mode, sectionView, candidate, measure, activeRoom, roomOutline, offset.x, offset.z, floorElev, showLux, luxAt, params.targetLux, getSection, focusRoomId, modelSize, floorShown, activeFloor, roomFloor]);

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
    if (!loaded || !activeRoom || !floorShown(activeRoom.floorElevation)) return;
    // The design room is on a floor above the section cut (another floor is being worked on)
    if (sectionView && info && activeRoom.floorElevation > info.sectionElevation) return;
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
  }, [loaded, positions, activeRoom, offset.x, offset.z, floorElev, roomCeiling, selected, fixtureMountY, floorShown, sectionView, info?.sectionElevation]);

  // Luminaires of the other rooms in Rooms & Properties, each on its own floor (read-only here; Use a room to edit it)
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    t.projectFixtures.clear();
    if (!loaded || !info) return;
    const geo = new THREE.BoxGeometry(0.5, 0.04, 0.5);
    const mat = new THREE.MeshBasicMaterial({ color: 0xfde68a });
    projectRooms.forEach(sr => {
      if (!sr.sourceModelRoomId || sr.sourceModelRoomId === info.activeRoomId) return;
      const mr = info.rooms.find(r => r.id === sr.sourceModelRoomId);
      if (!mr || !floorShown(mr.floorElevation)) return;
      // Floors above the section cut are cut away, so are their luminaires
      if (sectionView && mr.floorElevation > info.sectionElevation) return;
      const b = polygonBounds(toRoomPoints(mr.polygon) || []);
      const y = mr.floorElevation + Math.max(0.5, (sr.ceilingHeight || mr.ceilingHeight || ceilingHeight) - 0.03);
      (sr.customPositions || []).forEach(cp => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(b.minX + cp.x, y, b.minZ + cp.z);
        m.userData.isHelper = true;
        t.projectFixtures.add(m);
      });
    });
  }, [loaded, info, projectRooms, floorShown, ceilingHeight, sectionView]);

  // ------------------------------------------------------------------ annotations (DXF text, labels, dimensions)
  const annSet = info?.annotations;
  const updateAnn = useCallback((patch: Partial<AnnotationSet>) => {
    setParams(prev => (prev.importedModel?.annotations
      ? { ...prev, importedModel: { ...prev.importedModel, annotations: { ...prev.importedModel.annotations, ...patch } } }
      : prev));
  }, [setParams]);
  const updateItem = (id: string, patch: Partial<ModelAnnotation>) => {
    if (!annSet) return;
    updateAnn({ items: annSet.items.map(a => (a.id === id ? { ...a, ...patch } : a)) });
  };

  const importDxf = async (file: File) => {
    setError(null);
    if (!info) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'dwg') {
      setError('DWG is a closed binary format. In SketchUp Pro (or AutoCAD) save or export the same drawing as AutoCAD DXF and import that file.');
      return;
    }
    if (ext !== 'dxf') {
      setError('Choose the DXF exported from the same SketchUp model (File > Export > 3D Model > AutoCAD DXF).');
      return;
    }
    if (file.size > 60 * 1024 * 1024) {
      setError('The DXF is larger than 60 MB. Export only the visible layers, or the plan view, from SketchUp.');
      return;
    }
    setBusy(true);
    setStatus(`Reading text from ${file.name}...`);
    try {
      const res = parseDxfAnnotations(await file.text());
      if (!res.annotations.length) {
        setError('No text, labels or dimensions were found in this DXF. In SketchUp, make sure the Text and Dimensions are visible (not on hidden tags) when exporting.');
      } else {
        // Units: the DXF's own setting, else the model's unit (SketchUp exports both in the same units)
        const unitMetres = res.unitMetres ?? UNIT_SCALE[info.unit];
        const items = res.annotations.slice(0, 3000);
        const next: AnnotationSet = {
          fileName: file.name,
          unitMetres,
          rotation: 0,
          offset: { x: 0, y: 0, z: 0 },
          items,
          hiddenLayers: [],
          resolveOverlaps: true,
          displayScale: 1,
        };
        updateInfo({ annotations: next });
        if (res.annotations.length > 3000) setWarnings(w => [...w, `The DXF has ${res.annotations.length} text entities; the first 3,000 were imported.`]);
        if (res.unitMetres === null) setWarnings(w => [...w, `The DXF does not state its units; ${UNIT_LABEL[info.unit].toLowerCase()} (the model's units) were assumed. Change them under Text & Dimensions if the text is out of place.`]);
        setStatus(`${items.length} text item${items.length === 1 ? '' : 's'} imported${res.skipped ? ` (${res.skipped} empty skipped)` : ''}.`);
        setTimeout(() => setStatus(null), 3000);
      }
    } catch (err: any) {
      setError(err instanceof DxfAnnotationError ? err.message : `Could not read the DXF: ${err?.message || err}`);
      setStatus(null);
    }
    setBusy(false);
  };

  /** Move the annotations so their centre matches the model's (for DXFs exported with another origin) */
  const centreAnnotations = () => {
    if (!annSet || !info || !placedModel.current) return;
    const pts = annSet.items.filter(a => isShown(a, annSet)).map(a => dxfToScene(a, { ...annSet, offset: { x: 0, y: 0, z: 0 } }, info));
    if (!pts.length) return;
    const box = modelBounds(placedModel.current);
    const cx = (Math.min(...pts.map(p => p.x)) + Math.max(...pts.map(p => p.x))) / 2;
    const cz = (Math.min(...pts.map(p => p.z)) + Math.max(...pts.map(p => p.z))) / 2;
    updateAnn({ offset: { x: Number(((box.min.x + box.max.x) / 2 - cx).toFixed(3)), y: annSet.offset.y, z: Number(((box.min.z + box.max.z) / 2 - cz).toFixed(3)) } });
  };

  // Draw the annotations: flat and rotated as in the plan (Top view), facing the viewer in 3D
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    t.labels.children.forEach((c: any) => { c.material?.map?.dispose?.(); c.material?.dispose?.(); c.geometry?.dispose?.(); });
    t.labels.clear();
    if (!loaded || !info || !annSet) return;
    const ds = annSet.displayScale || 1;
    const shown = annSet.items.filter(a => isShown(a, annSet));
    const flat = view === 'top';
    // Overlaps are resolved in plan, per storey band
    const placedItems = shown.map(a => {
      const p = dxfToScene(a, annSet, info);
      const m = annotationMetres(a, annSet, info);
      const h = Math.max(m.height * ds, 0.02);
      const lines = a.text.split('\n');
      return { a, p, rot: m.rotation, h, lines };
    }).filter(({ p }) => {
      // Text of hidden floors, and of floors cut away above the section, is not shown
      if (!floorShown(p.y)) return false;
      const fl = floorOf(floors, p.y);
      return !(sectionView && fl && floors.length > 1 && fl.elevation > info.sectionElevation);
    });
    const moves = annSet.resolveOverlaps
      ? resolveOverlaps(placedItems.map(it => ({
          id: it.a.id, x: it.p.x, z: it.p.z + Math.round(it.p.y / 2.5) * 10000, // separate storeys
          width: Math.max(...it.lines.map(l => l.length), 1) * it.h * 0.62, height: it.h * 1.3 * it.lines.length,
          rotation: it.rot, hAlign: it.a.hAlign, vAlign: it.a.vAlign,
        })))
      : new Map();
    const sectionTop = sectionView ? info.sectionElevation + 0.02 : Infinity;
    placedItems.forEach(({ a, p, rot, h, lines }) => {
      // Text above the section cut is shown at the cut level in Top view so it stays readable
      const y = flat ? Math.min(p.y, sectionTop) + 0.03 : p.y;
      const mv = moves.get(a.id) || { dx: 0, dz: 0 };
      const font = 48;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      ctx.font = `${font}px Arial`;
      const w = Math.ceil(Math.max(...lines.map(l => ctx.measureText(l).width), 8)) + 12;
      canvas.width = w;
      canvas.height = Math.ceil(lines.length * font * 1.25) + 8;
      const c2 = canvas.getContext('2d')!;
      const selectedNow = a.id === annSelected;
      c2.fillStyle = selectedNow ? 'rgba(250,204,21,0.35)' : 'rgba(255,255,255,0.0)';
      c2.fillRect(0, 0, canvas.width, canvas.height);
      c2.font = `${font}px Arial`;
      c2.textBaseline = 'top';
      c2.textAlign = a.hAlign === 'center' ? 'center' : a.hAlign === 'right' ? 'right' : 'left';
      c2.lineWidth = 6;
      c2.strokeStyle = 'rgba(15,23,42,0.85)';
      c2.fillStyle = a.kind === 'dimension' ? '#7dd3fc' : a.kind === 'user' ? '#fde68a' : '#f8fafc';
      const tx = a.hAlign === 'center' ? canvas.width / 2 : a.hAlign === 'right' ? canvas.width - 6 : 6;
      lines.forEach((l, i) => { c2.strokeText(l, tx, 4 + i * font * 1.25); c2.fillText(l, tx, 4 + i * font * 1.25); });
      const tex = new THREE.CanvasTexture(canvas);
      tex.anisotropy = 4;
      // Text height h (cap height) -> one line of the canvas is about 1.25 x font size
      const planeH = h * 1.25 * lines.length * 1.35;
      const planeW = planeH * (canvas.width / canvas.height);
      const ax = a.hAlign === 'left' ? 0.5 : a.hAlign === 'right' ? -0.5 : 0;
      const ay = a.vAlign === 'bottom' ? 0.5 : a.vAlign === 'top' ? -0.5 : 0;
      if (flat) {
        const geo = new THREE.PlaneGeometry(planeW, planeH);
        geo.translate(ax * planeW, ay * planeH, 0);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, side: THREE.DoubleSide }));
        mesh.rotation.order = 'YXZ';
        mesh.rotation.y = (rot * Math.PI) / 180;
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(p.x + mv.dx, y, p.z + mv.dz);
        mesh.renderOrder = 20;
        mesh.userData.annId = a.id;
        t.labels.add(mesh);
      } else {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
        sprite.center.set(0.5 - ax, 0.5 - ay);
        sprite.scale.set(planeW, planeH, 1);
        sprite.position.set(p.x + mv.dx, y, p.z + mv.dz);
        sprite.renderOrder = 20;
        sprite.userData.annId = a.id;
        t.labels.add(sprite);
      }
      // Leader back to the original point when the text was moved off an overlap
      if (needsLeader(mv, h * 1.25)) {
        const l = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p.x, y, p.z), new THREE.Vector3(p.x + mv.dx, y, p.z + mv.dz)]),
          new THREE.LineBasicMaterial({ color: 0x94a3b8, depthTest: false })
        );
        l.renderOrder = 19;
        t.labels.add(l);
      }
      // Dimension line between its measuring points
      if (a.dim) {
        const p1 = dxfToScene({ x: a.dim.x1, y: a.dim.y1, z: a.dim.z1 }, annSet, info);
        const p2 = dxfToScene({ x: a.dim.x2, y: a.dim.y2, z: a.dim.z2 }, annSet, info);
        const dy = flat ? y : p1.y;
        const l = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p1.x, dy, p1.z), new THREE.Vector3(p2.x, flat ? y : p2.y, p2.z)]),
          new THREE.LineBasicMaterial({ color: 0x7dd3fc, depthTest: false })
        );
        l.renderOrder = 19;
        t.labels.add(l);
      }
    });
  }, [loaded, info, annSet, view, sectionView, annSelected, floors, floorShown]);

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
      if (!pickFixture(e)) {
        setSelected([]);
        // A click on a text selects it in the Text & Dimensions list
        const t3 = three.current;
        if (t3 && annSet) {
          raycaster.setFromCamera(ndc(e), t3.controls.object as THREE.Camera);
          const hit = raycaster.intersectObjects(t3.labels.children, false).find(h => h.object.userData.annId);
          setAnnSelected(hit ? hit.object.userData.annId : null);
        }
      }
    } else if (mode === 'text') {
      const p = pickModel(e) || pickPlane(e, sectionView ? info.sectionElevation : floorElev);
      if (!p) return;
      const value = window.prompt('Text to add at this point:', '');
      if (!value || !value.trim()) return;
      const base: AnnotationSet = annSet || { fileName: '(added in ElectricalPH)', unitMetres: 1, rotation: 0, offset: { x: 0, y: 0, z: 0 }, items: [], hiddenLayers: [], resolveOverlaps: true, displayScale: 1 };
      const d = sceneToDxf({ x: p.x, y: p.y, z: p.z }, base, info);
      const item: ModelAnnotation = {
        id: `u${uid()}`, kind: 'user', text: value.trim(), x: d.x, y: d.y, z: d.z,
        height: 0.15 / (base.unitMetres * (info.scale / (UNIT_SCALE[info.unit] || 1))), rotation: 0, layer: 'ElectricalPH',
        hAlign: 'center', vAlign: 'middle', visible: true, edited: true,
      };
      updateInfo({ annotations: { ...base, items: [...base.items, item] } });
      setAnnSelected(item.id);
    } else if (mode === 'room') {
      const p = pickModel(e) || pickPlane(e, info.sectionElevation);
      if (!p) return;
      // A room already picked on this floor: select it instead of detecting it again (floors overlap in plan)
      const existing = info.rooms.find(r =>
        (!activeFloor || roomFloor(r)?.id === activeFloor.id) && pointInPolygon(p.x, p.z, toRoomPoints(r.polygon) || []));
      if (existing) {
        setFocusRoomId(existing.id);
        setCheckedRooms(c => (c.includes(existing.id) ? c : [...c, existing.id]));
        setStatus(`${existing.name} is already picked.`);
        setTimeout(() => setStatus(null), 1800);
        return;
      }
      setBusy(true);
      setStatus('Detecting the room...');
      await new Promise(r => setTimeout(r, 20));
      try {
        const room = detectRoomAt(getSection(), [p.x, p.z], { gapClose: info.gapClose });
        const inside = room.polygon.reduce((a, q) => [a[0] + q[0] / room.polygon.length, a[1] + q[1] / room.polygon.length], [0, 0]) as RoomPoint;
        const probe = pointInPolygon(inside[0], inside[1], room.polygon) ? inside : ([p.x, p.z] as RoomPoint);
        const h = heightsAt(placedModel.current!, probe, info.sectionElevation);
        addPickedRoom({ polygon: room.polygon, area: room.area, floorElevation: h.floorY, ceilingHeight: h.ceilingHeight });
        setError(null);
        setStatus(null);
      } catch (err: any) {
        setError(err?.message || String(err));
        setStatus(null);
      }
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
  /** Next free "Room n" name */
  const nextRoomName = (rooms: ImportedModelRoom[]) => {
    const used = rooms.map(r => Number((/^Room (\d+)$/.exec(r.name) || [])[1] || 0));
    return `Room ${Math.max(0, ...used) + 1}`;
  };

  /** Add a detected room to the list (picking continues); the first room becomes the design room */
  const addPickedRoom = (c: Candidate) => {
    if (!info) return;
    const room: ImportedModelRoom = {
      id: uid(),
      name: nextRoomName(info.rooms),
      polygon: toRoomVertices(c.polygon)!,
      floorElevation: Number(c.floorElevation.toFixed(3)),
      ceilingHeight: c.ceilingHeight !== null ? Number(c.ceilingHeight.toFixed(2)) : null,
      area: Number(c.area.toFixed(2)),
    };
    updateInfo({ rooms: [...info.rooms, room] });
    setFocusRoomId(room.id);
    setCheckedRooms(cr => [...cr, room.id]);
    if (!info.activeRoomId) applyRoom(room, true);
  };

  /** Make a detected room the design room (outline, size and ceiling go to the Illumination design) */
  const applyRoom = (room: ImportedModelRoom, keepPicking = false) => {
    // Work on the room's floor
    const rf = roomFloor(room);
    if (rf && rf.id !== activeFloor?.id) {
      updateInfo({ activeFloorId: rf.id, sectionElevation: floorSectionElevation(floors, rf, modelTop), floors: floors.map(x => (x.id === rf.id ? { ...x, visible: true } : x)) });
      sectionCache.current = null;
    }
    // A room already in Rooms & Properties keeps its own fixtures and settings
    const saved = projectRooms.find(s => s.sourceModelRoomId === room.id);
    if (saved && onLoadProjectRoom) {
      onLoadProjectRoom(saved.id);
      setSelected([]);
      setFocusRoomId(room.id);
      if (!keepPicking) setMode('select');
      setSectionView(true);
      return;
    }
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
    setFocusRoomId(room.id);
    if (!keepPicking) setMode('select');
    // Cut the model at the section level so the ceiling does not hide the fixtures
    setSectionView(true);
  };

  const removeRooms = (ids: string[]) => {
    if (!info || !ids.length) return;
    updateInfo({ rooms: info.rooms.filter(r => !ids.includes(r.id)), ...(info.activeRoomId && ids.includes(info.activeRoomId) ? { activeRoomId: undefined } : {}) });
    setCheckedRooms(c => c.filter(id => !ids.includes(id)));
  };
  const removeRoom = (id: string) => removeRooms([id]);
  const addCheckedToProject = () => {
    if (!info) return;
    const rooms = info.rooms.filter(r => checkedRooms.includes(r.id));
    if (!rooms.length) return;
    const n = onAddRoomsToProject(rooms);
    setStatus(`${n} room${n === 1 ? '' : 's'} added to Rooms & Properties (sized by the lumen method).`);
    setTimeout(() => setStatus(null), 3000);
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
                {floors.length > 0 && (
                  <select
                    value={activeFloor?.id || ''}
                    onChange={e => { const f = floors.find(x => x.id === e.target.value); if (f) selectFloor(f); }}
                    title="Floor to work on: its plan section, rooms and fixtures"
                    className="px-2 py-1.5 rounded-lg border border-indigo-300 dark:border-indigo-500/50 bg-indigo-50 dark:bg-indigo-500/10 text-[11px] font-bold text-indigo-700 dark:text-indigo-300"
                  >
                    {[...floors].reverse().map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                )}
              </div>
              <span className="hidden sm:block w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
              <div className="flex flex-wrap gap-1">
                <button type="button" onClick={() => setMode('orbit')} className={mode === 'orbit' ? btnOn : btnIdle}><Box className="w-3.5 h-3.5" /> Navigate</button>
                <button type="button" onClick={() => { setMode('room'); setCandidate(null); }} className={mode === 'room' ? btnOn : btnIdle}><Layers className="w-3.5 h-3.5" /> Pick Room</button>
                <button type="button" onClick={() => { setMode('measure'); setMeasure([]); }} className={mode === 'measure' ? btnOn : btnIdle}><Ruler className="w-3.5 h-3.5" /> Measure</button>
                <button type="button" disabled={!activeRoom} onClick={() => setMode('select')} className={mode === 'select' ? btnOn : btnIdle}><MousePointer2 className="w-3.5 h-3.5" /> Select / Move</button>
                <button type="button" disabled={!activeRoom} onClick={() => setMode('place')} className={mode === 'place' ? btnOn : btnIdle}><PlusCircle className="w-3.5 h-3.5" /> Add Fixture</button>
                <button type="button" onClick={() => setMode('text')} className={mode === 'text' ? btnOn : btnIdle} title="Click in the model to place a new text"><Type className="w-3.5 h-3.5" /> Add Text</button>
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
                  {mode === 'room' && 'Click inside each room to pick it; keep clicking to add more rooms (Top view is easiest). Red lines show the plan section used for detection.'}
                  {mode === 'measure' && (measure.length < 2 ? `Click ${measure.length === 0 ? 'the first' : 'the second'} point on the model.` : `Distance: ${fmt(measured || 0, 3)} m`)}
                  {mode === 'select' && 'Click a fixture to select (Shift for several), drag to move. Delete removes.'}
                  {mode === 'place' && 'Click on the floor of the design room to add a fixture.'}
                  {mode === 'text' && 'Click where the new text should go.'}
                </span>
                <span className="rounded bg-slate-900/85 px-2 py-1 text-[10px] text-slate-400">
                  <span className="text-emerald-400">green</span> design room, <span className="text-sky-400">blue</span> current outline, <span className="text-amber-400">amber</span> detected, grey other rooms (darker on other floors), <span className="text-yellow-200">pale squares</span> luminaires of other project rooms
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

        </div>

        {/* Side panel */}
        <div className="space-y-3 text-[11px]">
          {info && loaded && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-black uppercase tracking-widest text-[10px] text-slate-400">Text & Dimensions</div>
                <input ref={dxfRef} type="file" accept=".dxf,.dwg" className="hidden" onChange={e => { const fl = e.target.files?.[0]; e.target.value = ''; if (fl) importDxf(fl); }} />
                <button type="button" disabled={busy} onClick={() => dxfRef.current?.click()} className={btnIdle} title="DXF exported from the same SketchUp model"><FileText className="w-3.5 h-3.5" /> {annSet ? 'Replace DXF' : 'Import DXF'}</button>
              </div>
              {!annSet && (
                <div className="text-slate-500 leading-snug">
                  SketchUp's 3D exports leave out text, labels and dimensions. To bring them in, export the same model from SketchUp Pro as <b>AutoCAD DXF</b> (File &gt; Export &gt; 3D Model) and import it here; the text is placed over the model in its original positions.
                </div>
              )}
              {annSet && (() => {
                const layers = [...new Set(annSet.items.map(a => a.layer))].sort();
                const shownCount = annSet.items.filter(a => isShown(a, annSet)).length;
                const q = annSearch.trim().toLowerCase();
                const listed = annSet.items.filter(a => !q || a.text.toLowerCase().includes(q) || a.layer.toLowerCase().includes(q)).slice(0, 300);
                return (
                  <>
                    <div className="text-slate-500 break-all">{annSet.fileName} · {annSet.items.length} items, {shownCount} shown</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="space-y-0.5">
                        <span className="text-[9px] font-black uppercase text-slate-400">DXF units</span>
                        <select value={String(annSet.unitMetres)} onChange={e => updateAnn({ unitMetres: Number(e.target.value) })} className="w-full px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                          {(Object.keys(UNIT_SCALE) as ModelUnit[]).map(u => <option key={u} value={String(UNIT_SCALE[u])}>{UNIT_LABEL[u]}</option>)}
                          {!Object.values(UNIT_SCALE).includes(annSet.unitMetres) && <option value={String(annSet.unitMetres)}>{annSet.unitMetres} m/unit</option>}
                        </select>
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[9px] font-black uppercase text-slate-400">Rotate (°)</span>
                        <input type="number" step={90} value={annSet.rotation} onChange={e => updateAnn({ rotation: Number(e.target.value) || 0 })} className="w-full px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
                      </label>
                      {(['x', 'z', 'y'] as const).map(axis => (
                        <label key={axis} className="space-y-0.5">
                          <span className="text-[9px] font-black uppercase text-slate-400">Shift {axis === 'x' ? 'east' : axis === 'z' ? 'south' : 'up'} (m)</span>
                          <input type="number" step={0.05} value={annSet.offset[axis]} onChange={e => updateAnn({ offset: { ...annSet.offset, [axis]: Number(e.target.value) || 0 } })} className="w-full px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
                        </label>
                      ))}
                      <button type="button" onClick={centreAnnotations} className={btnIdle} title="Only for a DXF exported with a different origin (e.g. a 2D export)"><Crosshair className="w-3.5 h-3.5" /> Centre on model</button>
                    </div>
                    <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                      <input type="checkbox" checked={annSet.resolveOverlaps} onChange={e => updateAnn({ resolveOverlaps: e.target.checked })} /> Move overlapping text apart (leader to its original point)
                    </label>
                    <label className="block space-y-0.5">
                      <span className="text-slate-500">On-screen text size × {(annSet.displayScale || 1).toFixed(1)} (exports use the true size)</span>
                      <input type="range" min={0.5} max={5} step={0.1} value={annSet.displayScale || 1} onChange={e => updateAnn({ displayScale: Number(e.target.value) })} className="w-full" />
                    </label>
                    {layers.length > 1 && (
                      <div className="flex flex-wrap gap-1">
                        {layers.map(l => {
                          const hidden = (annSet.hiddenLayers || []).includes(l);
                          return (
                            <button key={l} type="button" onClick={() => updateAnn({ hiddenLayers: hidden ? (annSet.hiddenLayers || []).filter(x => x !== l) : [...(annSet.hiddenLayers || []), l] })} className={`px-1.5 py-0.5 rounded border text-[10px] ${hidden ? 'border-slate-200 text-slate-400 line-through' : 'border-indigo-300 text-indigo-700 dark:text-indigo-300'}`}>
                              {l}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <input value={annSearch} onChange={e => setAnnSearch(e.target.value)} placeholder="Search text or layer" className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
                    <div className="max-h-56 overflow-y-auto space-y-0.5">
                      {listed.map(a => (
                        <div key={a.id} onClick={() => setAnnSelected(a.id)} className={`flex items-center gap-1 rounded px-1 py-0.5 ${a.id === annSelected ? 'bg-amber-50 dark:bg-amber-500/10 ring-1 ring-amber-300' : ''}`}>
                          <input type="checkbox" checked={a.visible} onChange={e => updateItem(a.id, { visible: e.target.checked })} title="Show" />
                          <span className={`text-[9px] font-black uppercase w-8 shrink-0 ${a.kind === 'dimension' ? 'text-sky-600' : a.kind === 'user' ? 'text-amber-600' : 'text-slate-400'}`}>{a.kind === 'dimension' ? 'DIM' : a.kind === 'user' ? 'NEW' : a.kind === 'attrib' ? 'ATT' : 'TXT'}</span>
                          <input value={a.text.replace(/\n/g, ' ⏎ ')} onChange={e => updateItem(a.id, { text: e.target.value.replace(/ ⏎ /g, '\n'), edited: true })} className="flex-1 min-w-0 bg-transparent text-slate-700 dark:text-slate-200" />
                          <button type="button" title="Delete" onClick={() => updateAnn({ items: annSet.items.filter(x => x.id !== a.id) })} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      ))}
                      {annSet.items.length > listed.length && <div className="text-slate-400">Showing {listed.length} of {annSet.items.length}; search to narrow the list.</div>}
                    </div>
                    <button type="button" onClick={() => { if (window.confirm('Remove all imported text from this model?')) updateInfo({ annotations: undefined }); }} className={btnIdle}><Trash2 className="w-3.5 h-3.5" /> Remove text</button>
                  </>
                );
              })()}
            </div>
          )}
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
              <div className="flex items-center justify-between">
                <div className="font-black uppercase tracking-widest text-[10px] text-slate-400">Floors ({floors.length})</div>
                <div className="flex gap-1">
                  <button type="button" onClick={detectFloors} className={btnIdle} title="Find the floor levels from the model's slabs"><Scan className="w-3.5 h-3.5" /> Detect</button>
                  <button type="button" onClick={addFloor} className={btnIdle} title="Add a floor above the top one"><PlusCircle className="w-3.5 h-3.5" /> Add</button>
                </div>
              </div>
              <div className="space-y-1">
                {[...floors].reverse().map(f => {
                  const picked = info.rooms.filter(r => roomFloor(r)?.id === f.id);
                  const inProject = projectRooms.filter(sr => {
                    const mr = sr.sourceModelRoomId ? info.rooms.find(r => r.id === sr.sourceModelRoomId) : undefined;
                    return mr && roomFloor(mr)?.id === f.id;
                  });
                  const tot = floorTotals(inProject);
                  const isActive = f.id === activeFloor?.id;
                  return (
                    <div key={f.id} className={`rounded border px-1.5 py-1 space-y-0.5 ${isActive ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-500/10' : 'border-slate-200 dark:border-slate-700'}`}>
                      <div className="flex items-center gap-1">
                        <input type="radio" name="active-floor" checked={isActive} onChange={() => selectFloor(f)} title="Work on this floor" />
                        <button type="button" onClick={() => updateFloor(f.id, { visible: f.visible === false })} title={f.visible === false ? 'Show this floor' : 'Hide this floor'} className="text-slate-500 hover:text-indigo-600">
                          {f.visible === false ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <input value={f.name} onChange={e => updateFloor(f.id, { name: e.target.value })} className="flex-1 min-w-0 bg-transparent font-bold text-slate-700 dark:text-slate-200" />
                        <input
                          type="number"
                          step={0.05}
                          value={f.elevation}
                          onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) updateFloor(f.id, { elevation: Math.round(v * 100) / 100 }); }}
                          title="Floor level (m above the lowest point of the model)"
                          className="w-16 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-right"
                        />
                        <span className="text-slate-400">m</span>
                        <button type="button" disabled={floors.length <= 1} onClick={() => removeFloor(f.id)} title="Remove floor" className="text-slate-400 hover:text-rose-500 disabled:opacity-30"><Trash2 className="w-3 h-3" /></button>
                      </div>
                      <div className="text-[10px] text-slate-500 pl-9">
                        {picked.length} room{picked.length === 1 ? '' : 's'} picked
                        {tot.rooms > 0 && <> · {tot.rooms} in project · {fmt(tot.area, 1)} m² · {tot.fixtures} luminaires · {Math.round(tot.watts)} W · LPD {fmt(tot.lpd)} W/m² · E<sub>avg</sub> {Math.round(tot.avgLux)} lx</>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] text-slate-500">
                Each floor is a design layer: choose one to pick and edit its rooms; the eye shows or hides it. Levels are finished floor heights above the model's lowest point.
              </div>
            </div>
          )}

          {info && loaded && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
              <div className="font-black uppercase tracking-widest text-[10px] text-slate-400">Room Detection{activeFloor && floors.length > 1 ? ` · ${activeFloor.name}` : ''}</div>
              <label className="block space-y-0.5">
                <span className="text-slate-500">Section level: {fmt(info.sectionElevation)} m above the lowest point</span>
                <input type="range" min={0.2} max={Math.max(0.5, (modelSize?.y ?? 3) - 0.1)} step={0.05} value={info.sectionElevation} onChange={e => updateInfo({ sectionElevation: Number(e.target.value) })} className="w-full" />
              </label>
              <label className="block space-y-0.5">
                <span className="text-slate-500">Close openings up to {fmt(info.gapClose)} m (doorways)</span>
                <input type="range" min={0} max={2} step={0.05} value={info.gapClose} onChange={e => updateInfo({ gapClose: Number(e.target.value) })} className="w-full" />
              </label>
              {info.rooms.length > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1 font-bold text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={checkedRooms.length > 0 && floorRooms.every(r => checkedRooms.includes(r.id))}
                      onChange={e => setCheckedRooms(e.target.checked ? floorRooms.map(r => r.id) : [])}
                    />
                    {floorRooms.length} room{floorRooms.length === 1 ? '' : 's'}{floors.length > 1 && !allFloorsList ? ` on ${activeFloor?.name}` : ''} · {fmt(floorRooms.reduce((s, r) => s + r.area, 0), 1)} m²
                  </label>
                  {floors.length > 1 && (
                    <label className="flex items-center gap-1 text-slate-500 whitespace-nowrap">
                      <input type="checkbox" checked={allFloorsList} onChange={e => setAllFloorsList(e.target.checked)} /> All floors
                    </label>
                  )}
                </div>
              )}
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {info.rooms.length === 0 && <div className="text-slate-500">No rooms yet. Choose Pick Room and click inside each room you want.</div>}
                {info.rooms.length > 0 && floorRooms.length === 0 && <div className="text-slate-500">No rooms picked on {activeFloor?.name || 'this floor'} yet.</div>}
                {floorRooms.map(r => (
                  <div
                    key={r.id}
                    onMouseEnter={() => setFocusRoomId(r.id)}
                    className={`flex items-center gap-1 rounded border px-1.5 py-1 ${r.id === info.activeRoomId ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' : r.id === focusRoomId ? 'border-amber-300 bg-amber-50/60 dark:bg-amber-500/10' : 'border-slate-200 dark:border-slate-700'}`}
                  >
                    <input type="checkbox" checked={checkedRooms.includes(r.id)} onChange={e => setCheckedRooms(c => (e.target.checked ? [...c, r.id] : c.filter(id => id !== r.id)))} />
                    <input value={r.name} onChange={e => renameRoom(r.id, e.target.value)} className="flex-1 min-w-0 bg-transparent font-bold text-slate-700 dark:text-slate-200" />
                    {allFloorsList && floors.length > 1 && <span className="text-[9px] font-bold text-indigo-500 whitespace-nowrap">{roomFloor(r)?.name}</span>}
                    <span className="text-slate-500 font-mono whitespace-nowrap">{fmt(r.area, 1)} m²{r.ceilingHeight ? ` · ${fmt(r.ceilingHeight, 2)} m` : ''}</span>
                    {roomsInProject.includes(r.id) && <span title="In Rooms & Properties" className="text-indigo-500"><CheckCircle2 className="w-3 h-3" /></span>}
                    {r.id === info.activeRoomId
                      ? <span className="text-emerald-600 font-bold px-1">Design</span>
                      : <button type="button" title="Use as the design room" onClick={() => applyRoom(r)} className="text-emerald-600 font-bold px-1">Use</button>}
                    <button type="button" title="Remove" onClick={() => removeRoom(r.id)} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
              {info.rooms.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" disabled={!checkedRooms.length} onClick={addCheckedToProject} className={`${btn} bg-indigo-600 border-indigo-600 text-white`} title="Each ticked room is sized by the lumen method with the current fixture and target lux">
                    <PlusCircle className="w-3.5 h-3.5" /> Add {checkedRooms.length || ''} to Rooms & Properties
                  </button>
                  <button type="button" disabled={!checkedRooms.length} onClick={() => removeRooms(checkedRooms)} className={btnIdle}><Trash2 className="w-3.5 h-3.5" /> Remove</button>
                </div>
              )}
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
