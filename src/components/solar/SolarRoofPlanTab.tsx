import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Camera,
  MapPin,
  Plus,
  Minus,
  Maximize2,
  MousePointer2,
  PenLine,
  SquarePlus,
  RotateCw,
  Trash2,
  Wand2,
  Ruler,
  AlertTriangle,
  Grid3x3,
  Compass,
  RefreshCw,
} from "lucide-react";
import {
  SolarDesignConfig,
  SolarCalculationResults,
  RoofPlanConfig,
  RoofPlanFace,
  RoofPlanModule,
  RoofPlanCapture,
} from "../../types/solar";
import {
  IMAGERY_ATTRIBUTION,
  MAX_ZOOM,
  NATIVE_MAX_ZOOM,
  tileUrl,
  lngLatToWorld,
  worldToLngLat,
  groundResolution,
  geocode,
  GeocodeResult,
  composeCaptureImage,
  emptyRoofPlan,
  metersPerPx,
  edgeLengthPx,
  longestEdgeAngle,
  moduleDims,
  moduleCorners,
  faceModuleRot,
  autoPlaceModules,
  assignStrings,
  roofPlanStats,
  pointInPolygon,
  newRoofId,
  Pt,
} from "../../utils/roofPlan";

interface Props {
  config: SolarDesignConfig;
  calc: SolarCalculationResults;
  onUpdateConfig: (updated: Partial<SolarDesignConfig>) => void;
}

const TILE = 256;
const DEFAULT_CENTER = { lat: 14.5995, lng: 120.9842 }; // Manila
const btn =
  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition disabled:opacity-40 disabled:cursor-not-allowed";
const btnGhost = `${btn} border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800`;
const btnPrimary = `${btn} border-amber-500 bg-amber-500 text-white hover:bg-amber-600`;
const input =
  "w-full px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100";

// =============================================================================
// Satellite map: search, pan / zoom and capture
// =============================================================================
const SatelliteMap: React.FC<{
  initial?: RoofPlanCapture;
  onCapture: (c: RoofPlanCapture) => void;
  onManual: () => void;
}> = ({ initial, onCapture, onManual }) => {
  const [center, setCenter] = useState({ lat: initial?.lat ?? DEFAULT_CENTER.lat, lng: initial?.lng ?? DEFAULT_CENTER.lng });
  const [zoom, setZoom] = useState(initial?.zoom ?? 18);
  const [size, setSize] = useState({ w: 900, h: 520 });
  const [query, setQuery] = useState(initial?.address || "");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [address, setAddress] = useState(initial?.address || "");
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Wheel zoom around the cursor (non-passive listener so the page does not scroll)
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dz = e.deltaY < 0 ? 1 : -1;
      setZoom((z) => {
        const nz = Math.max(3, Math.min(MAX_ZOOM, z + dz));
        if (nz === z) return z;
        const r = el.getBoundingClientRect();
        const mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
        setCenter((c) => {
          const w = lngLatToWorld(c.lng, c.lat, z);
          const f = Math.pow(2, nz - z);
          const p = worldToLngLat((w.x + mx) * f - mx, (w.y + my) * f - my, nz);
          return { lat: p.lat, lng: p.lng };
        });
        return nz;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const tz = Math.min(zoom, NATIVE_MAX_ZOOM);
  const span = TILE * Math.pow(2, zoom - tz);
  const c = lngLatToWorld(center.lng, center.lat, zoom);
  const left = c.x - size.w / 2, top = c.y - size.h / 2;
  // Two layers: a lower-zoom underlay shows through wherever a detailed tile is missing
  const tiles: Array<{ key: string; src: string; x: number; y: number; s: number }> = [];
  const layer = (lz: number) => {
    const sp = TILE * Math.pow(2, zoom - lz);
    const n = Math.pow(2, lz);
    for (let tx = Math.floor(left / sp); tx <= Math.floor((left + size.w) / sp); tx++)
      for (let ty = Math.floor(top / sp); ty <= Math.floor((top + size.h) / sp); ty++) {
        if (ty < 0 || ty >= n) continue;
        tiles.push({ key: `${lz}-${tx}-${ty}`, src: tileUrl(lz, ((tx % n) + n) % n, ty), x: tx * sp - left, y: ty * sp - top, s: sp });
      }
  };
  if (tz > 5) layer(tz - 2);
  layer(tz);

  const mpp = groundResolution(center.lat, zoom);
  const barM = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find((m) => m / mpp >= 80) || 5000;

  const doSearch = async () => {
    setSearching(true);
    setError("");
    try {
      const r = await geocode(query);
      setResults(r);
      if (r.length === 1) pick(r[0]);
      if (!r.length) setError("No match found. Try a fuller address or enter coordinates (lat, lng).");
    } catch (e: any) {
      setError(e?.message || "Search failed");
    } finally {
      setSearching(false);
    }
  };
  const pick = (r: GeocodeResult) => {
    setCenter({ lat: r.lat, lng: r.lng });
    setZoom(19);
    setAddress(r.label);
    setQuery(r.label);
    setResults([]);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-start">
        <div className="relative flex-1 min-w-[240px]">
          <div className="flex gap-2">
            <input
              className={`${input} py-2`}
              placeholder="Search address, place, or coordinates (e.g. 14.5995, 120.9842)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
            />
            <button className={btnGhost} onClick={doSearch} disabled={searching || !query.trim()}>
              <Search className="w-3.5 h-3.5" /> {searching ? "Searching..." : "Search"}
            </button>
          </div>
          {results.length > 1 && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg max-h-60 overflow-auto">
              {results.map((r, i) => (
                <button
                  key={i}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex gap-2 text-slate-700 dark:text-slate-200"
                  onClick={() => pick(r)}
                >
                  <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  {r.label}
                </button>
              ))}
            </div>
          )}
          {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
        </div>
        <button
          className={btnPrimary}
          onClick={() =>
            onCapture({
              kind: "satellite",
              lat: center.lat,
              lng: center.lng,
              zoom,
              widthPx: size.w,
              heightPx: size.h,
              baseMetersPerPx: groundResolution(center.lat, zoom),
              address: address || undefined,
              capturedAt: new Date().toISOString(),
            })
          }
        >
          <Camera className="w-3.5 h-3.5" /> Capture roof
        </button>
        <button className={btnGhost} onClick={onManual} title="Draw on a blank grid and enter measured lengths">
          <Grid3x3 className="w-3.5 h-3.5" /> Draw without imagery
        </button>
      </div>

      <div
        ref={box}
        className="relative h-[520px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-800 select-none touch-none cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const p = worldToLngLat(d.cx - (e.clientX - d.x), d.cy - (e.clientY - d.y), zoom);
          setCenter({ lat: p.lat, lng: p.lng });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {tiles.map((t) => (
          <img
            key={t.key}
            src={t.src}
            alt=""
            draggable={false}
            crossOrigin="anonymous"
            className="absolute max-w-none pointer-events-none"
            style={{ left: t.x, top: t.y, width: t.s, height: t.s }}
            onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
          />
        ))}
        {/* Centre crosshair */}
        <div className="absolute left-1/2 top-1/2 w-6 h-6 -ml-3 -mt-3 pointer-events-none">
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-amber-400/90" />
          <div className="absolute top-1/2 left-0 right-0 h-px bg-amber-400/90" />
        </div>
        <div className="absolute top-3 left-3 flex flex-col gap-1">
          <button className="w-8 h-8 rounded-lg bg-white/95 text-slate-800 shadow flex items-center justify-center" onPointerDown={(e) => e.stopPropagation()} onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 1))}>
            <Plus className="w-4 h-4" />
          </button>
          <button className="w-8 h-8 rounded-lg bg-white/95 text-slate-800 shadow flex items-center justify-center" onPointerDown={(e) => e.stopPropagation()} onClick={() => setZoom((z) => Math.max(3, z - 1))}>
            <Minus className="w-4 h-4" />
          </button>
        </div>
        <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-black/60 text-white text-[11px] pointer-events-none">
          Zoom {zoom}
          {zoom > NATIVE_MAX_ZOOM ? " (enlarged)" : ""} | {mpp.toFixed(3)} m/px
        </div>
        <div className="absolute bottom-6 left-3 pointer-events-none">
          <div className="h-1.5 border-x-2 border-b-2 border-white" style={{ width: barM / mpp }} />
          <div className="text-[11px] text-white font-bold drop-shadow">{barM >= 1000 ? `${barM / 1000} km` : `${barM} m`}</div>
        </div>
        <div className="absolute bottom-0 right-0 px-1.5 py-0.5 bg-white/80 text-[10px] text-slate-700 pointer-events-none">{IMAGERY_ATTRIBUTION}</div>
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Search for the property, drag to pan, and scroll or use +/- to zoom until the roof fills most of the view. Then press <b>Capture roof</b>. The
        visible area is captured with its satellite scale ({mpp.toFixed(3)} m per pixel here); you can calibrate it later with a measured roof edge.
      </p>
    </div>
  );
};

// =============================================================================
// Roof editor
// =============================================================================
type Mode = "select" | "draw" | "add";

const SolarRoofPlanTab: React.FC<Props> = ({ config, calc, onUpdateConfig }) => {
  const saved = config.roofPlan || emptyRoofPlan();
  // Local working copy; committed to the project on every finished edit (not on every drag move)
  const [plan, setPlan] = useState<RoofPlanConfig>(saved);
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) setPlan(config.roofPlan || emptyRoofPlan());
  }, [config.roofPlan]);
  const commit = (next: RoofPlanConfig) => {
    setPlan(next);
    onUpdateConfig({ roofPlan: next });
  };

  const [recapturing, setRecapturing] = useState(false);
  const capture = plan.capture;

  if (!capture || recapturing) {
    return (
      <div className="space-y-4">
        <Header />
        <SatelliteMap
          initial={capture}
          onCapture={(c) => {
            setRecapturing(false);
            // A new capture uses a new image, so outlines and modules start fresh
            commit({ ...emptyRoofPlan(), capture: c });
          }}
          onManual={() => {
            setRecapturing(false);
            commit({ ...emptyRoofPlan(), capture: { kind: "manual", widthPx: 1200, heightPx: 800, baseMetersPerPx: 0.05, capturedAt: new Date().toISOString() } });
          }}
        />
        {recapturing && (
          <button className={btnGhost} onClick={() => setRecapturing(false)}>
            Cancel and keep the current roof plan
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Header />
      <RoofEditor
        plan={plan}
        setPlan={setPlan}
        commit={commit}
        dragging={dragging}
        calc={calc}
        onRecapture={() => {
          if (!plan.faces.length || window.confirm("Capture a new roof image? The current roof outlines and module layout will be cleared.")) setRecapturing(true);
        }}
      />
    </div>
  );
};

const Header = () => (
  <div className="flex items-start gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600">
      <Compass className="w-5 h-5" />
    </div>
    <div>
      <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">Roof Plan Design</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Capture the rooftop from satellite imagery, outline each roof face, and lay out the PV modules. The roof plan is included in the PDF
        and AutoCAD exports.
      </p>
    </div>
  </div>
);

const RoofEditor: React.FC<{
  plan: RoofPlanConfig;
  setPlan: React.Dispatch<React.SetStateAction<RoofPlanConfig>>;
  commit: (p: RoofPlanConfig) => void;
  dragging: React.MutableRefObject<boolean>;
  calc: SolarCalculationResults;
  onRecapture: () => void;
}> = ({ plan, setPlan, commit, dragging, calc, onRecapture }) => {
  const cap = plan.capture!;
  const W = cap.widthPx, H = cap.heightPx;
  // Latest plan, for saving at the end of a drag
  const latest = useRef(plan);
  latest.current = plan;
  const mpp = metersPerPx(plan);
  const dims = moduleDims(calc);
  const stats = useMemo(() => roofPlanStats(plan, calc), [plan, calc]);
  const strings = useMemo(() => assignStrings(plan, calc), [plan, calc]);

  const [mode, setMode] = useState<Mode>("select");
  const [draft, setDraft] = useState<Pt[]>([]);
  const [selFace, setSelFace] = useState<string | null>(plan.faces[0]?.id ?? null);
  const [selModule, setSelModule] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, w: W, h: H });
  const [image, setImage] = useState<string>("");
  const [hover, setHover] = useState<Pt | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const act = useRef<
    | { kind: "pan"; sx: number; sy: number; vx: number; vy: number }
    | { kind: "vertex"; faceId: string; index: number }
    | { kind: "module"; id: string; dx: number; dy: number }
    | null
  >(null);

  // Background image (satellite tiles or grid), rendered at 2x for sharp zooming
  useEffect(() => {
    let live = true;
    setImage("");
    composeCaptureImage(cap, 2).then((cv) => live && setImage(cv.toDataURL("image/jpeg", 0.9)));
    return () => {
      live = false;
    };
  }, [cap.kind, cap.lat, cap.lng, cap.zoom, cap.widthPx, cap.heightPx, cap.baseMetersPerPx]);

  useEffect(() => setView({ x: 0, y: 0, w: W, h: H }), [W, H]);

  const toImg = (e: { clientX: number; clientY: number }): Pt => {
    const svg = svgRef.current!;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    return [p.x, p.y];
  };
  // Screen pixels -> drawing units (for constant-size labels and handles)
  const svgW = svgRef.current?.clientWidth || 900;
  const u = view.w / svgW;

  // Wheel zoom on the drawing
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 0.8 : 1.25;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(el.getScreenCTM()!.inverse());
      setView((v) => {
        const w = Math.max(40, Math.min(W * 1.5, v.w * f)), h = (w * H) / W;
        return { x: p.x - ((p.x - v.x) * w) / v.w, y: p.y - ((p.y - v.y) * h) / v.h, w, h };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [W, H]);

  const face = plan.faces.find((f) => f.id === selFace) || null;
  const module = plan.modules.find((m) => m.id === selModule) || null;

  const updateFace = (id: string, patch: Partial<RoofPlanFace>) =>
    commit({ ...plan, faces: plan.faces.map((f) => (f.id === id ? { ...f, ...patch } : f)) });

  const finishDraft = (pts: Pt[]) => {
    if (pts.length < 3) return;
    const f: RoofPlanFace = {
      id: newRoofId(),
      name: `Roof ${plan.faces.length + 1}`,
      points: pts,
      rowAngleDeg: longestEdgeAngle(pts),
      facingAzimuthDeg: 180,
      tiltDeg: 10,
      setbackM: 0.5,
      orientation: "portrait",
      moduleGapM: 0.02,
      rowGapM: 0.02,
    };
    commit({ ...plan, faces: [...plan.faces, f] });
    setDraft([]);
    setSelFace(f.id);
    setMode("select");
  };

  const autoPlaceAll = () => {
    let remaining = calc.totalModules;
    const mods: RoofPlanModule[] = [];
    for (const f of plan.faces) {
      const placed = autoPlaceModules(f, plan, dims, remaining);
      mods.push(...placed);
      remaining -= placed.length;
    }
    commit({ ...plan, modules: mods });
    setSelModule(null);
  };
  const autoPlaceFace = (f: RoofPlanFace) => {
    const others = plan.modules.filter((m) => m.faceId !== f.id);
    const placed = autoPlaceModules(f, plan, dims, Math.max(0, calc.totalModules - others.length));
    commit({ ...plan, modules: [...others, ...placed] });
  };

  const rotateModule = (id: string, d: number) =>
    commit({ ...plan, modules: plan.modules.map((m) => (m.id === id ? { ...m, rotDeg: m.rotDeg + d } : m)) });
  const deleteModule = (id: string) => {
    commit({ ...plan, modules: plan.modules.filter((m) => m.id !== id) });
    setSelModule(null);
  };
  const deleteFace = (id: string) => {
    commit({ ...plan, faces: plan.faces.filter((f) => f.id !== id), modules: plan.modules.filter((m) => m.faceId !== id) });
    setSelFace(null);
  };

  // Keyboard: Delete, R (rotate 90), arrows (nudge 5 cm), Esc / Backspace while drawing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (mode === "draw") {
        if (e.key === "Escape") setDraft([]);
        if (e.key === "Backspace") setDraft((d) => d.slice(0, -1));
        if (e.key === "Enter") finishDraft(draft);
        return;
      }
      if (!module) return;
      const step = 0.05 / mpp;
      const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (e.key === "Delete") deleteModule(module.id);
      else if (e.key === "r" || e.key === "R") rotateModule(module.id, 90);
      else if (moves[e.key]) {
        e.preventDefault();
        const [dx, dy] = moves[e.key];
        commit({ ...plan, modules: plan.modules.map((m) => (m.id === module.id ? { ...m, x: m.x + dx, y: m.y + dy } : m)) });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onDown = (e: React.PointerEvent) => {
    const p = toImg(e);
    svgRef.current?.setPointerCapture(e.pointerId);
    if (mode === "draw") {
      // Close by clicking near the first vertex
      if (draft.length >= 3 && Math.hypot(p[0] - draft[0][0], p[1] - draft[0][1]) < 10 * u) finishDraft(draft);
      else setDraft((d) => [...d, p]);
      return;
    }
    if (mode === "add") {
      const f = plan.faces.find((ff) => pointInPolygon(p, ff.points));
      if (!f) return;
      const m: RoofPlanModule = { id: newRoofId(), faceId: f.id, x: p[0], y: p[1], rotDeg: faceModuleRot(f) };
      commit({ ...plan, modules: [...plan.modules, m] });
      setSelModule(m.id);
      return;
    }
    act.current = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    setSelModule(null);
  };
  const onMove = (e: React.PointerEvent) => {
    const p = toImg(e);
    if (mode === "draw") setHover(p);
    const a = act.current;
    if (!a) return;
    if (a.kind === "pan") {
      const k = view.w / (svgRef.current?.clientWidth || 900);
      setView((v) => ({ ...v, x: a.vx - (e.clientX - a.sx) * k, y: a.vy - (e.clientY - a.sy) * k }));
      return;
    }
    dragging.current = true;
    if (a.kind === "vertex")
      setPlan((pl) => ({
        ...pl,
        faces: pl.faces.map((f) => (f.id === a.faceId ? { ...f, points: f.points.map((q, i) => (i === a.index ? p : q)) } : f)),
      }));
    else setPlan((pl) => ({ ...pl, modules: pl.modules.map((m) => (m.id === a.id ? { ...m, x: p[0] - a.dx, y: p[1] - a.dy } : m)) }));
  };
  const onUp = () => {
    const a = act.current;
    act.current = null;
    if (a && a.kind !== "pan" && dragging.current) {
      dragging.current = false;
      commit(latest.current);
    }
  };

  const fontPx = 12 * u;
  const scaleBarM = [0.5, 1, 2, 5, 10, 20, 50, 100].find((m) => m / mpp / u >= 70) || 100;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
      {/* -------- Drawing -------- */}
      <div className="space-y-2 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            {(
              [
                ["select", MousePointer2, "Select / move"],
                ["draw", PenLine, "Draw roof"],
                ["add", SquarePlus, "Add module"],
              ] as const
            ).map(([m, Icon, label]) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setDraft([]);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold ${
                  mode === m ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
          {mode === "draw" && (
            <>
              <button className={btnPrimary} disabled={draft.length < 3} onClick={() => finishDraft(draft)}>
                Finish roof ({draft.length} pts)
              </button>
              <button className={btnGhost} disabled={!draft.length} onClick={() => setDraft((d) => d.slice(0, -1))}>
                Undo point
              </button>
            </>
          )}
          <button className={btnPrimary} disabled={!plan.faces.length} onClick={autoPlaceAll}>
            <Wand2 className="w-3.5 h-3.5" /> Auto-place {calc.totalModules} modules
          </button>
          <button className={btnGhost} onClick={() => setView({ x: 0, y: 0, w: W, h: H })}>
            <Maximize2 className="w-3.5 h-3.5" /> Fit
          </button>
          <button className={btnGhost} onClick={onRecapture}>
            <RefreshCw className="w-3.5 h-3.5" /> New capture
          </button>
        </div>

        <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950">
          <svg
            ref={svgRef}
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            className={`block w-full select-none touch-none ${mode === "select" ? "cursor-grab" : "cursor-crosshair"}`}
            style={{ aspectRatio: `${W} / ${H}` }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onDoubleClick={() => mode === "draw" && finishDraft(draft)}
          >
            {image ? <image href={image} x={0} y={0} width={W} height={H} preserveAspectRatio="none" /> : <rect width={W} height={H} fill="#e2e8f0" />}

            {/* Roof faces */}
            {plan.faces.map((f) => {
              const sel = f.id === selFace;
              return (
                <g key={f.id}>
                  <polygon
                    points={f.points.map((p) => p.join(",")).join(" ")}
                    fill={sel ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.12)"}
                    stroke={sel ? "#f59e0b" : "#ffffff"}
                    strokeWidth={2 * u}
                    onPointerDown={(e) => {
                      if (mode !== "select") return;
                      e.stopPropagation();
                      setSelFace(f.id);
                      setSelModule(null);
                      act.current = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
                    }}
                  />
                  {f.points.map((p, i) => {
                    const q = f.points[(i + 1) % f.points.length];
                    const L = edgeLengthPx(f.points, i) * mpp;
                    return (
                      <text
                        key={`e${i}`}
                        x={(p[0] + q[0]) / 2}
                        y={(p[1] + q[1]) / 2}
                        fontSize={fontPx}
                        fontWeight="bold"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#ffffff"
                        stroke="#0f172a"
                        strokeWidth={3 * u}
                        paintOrder="stroke"
                        pointerEvents="none"
                      >
                        {L.toFixed(2)} m
                      </text>
                    );
                  })}
                  {sel &&
                    mode === "select" &&
                    f.points.map((p, i) => (
                      <circle
                        key={`v${i}`}
                        cx={p[0]}
                        cy={p[1]}
                        r={6 * u}
                        fill="#ffffff"
                        stroke="#f59e0b"
                        strokeWidth={2 * u}
                        className="cursor-move"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          svgRef.current?.setPointerCapture(e.pointerId);
                          act.current = { kind: "vertex", faceId: f.id, index: i };
                        }}
                      />
                    ))}
                </g>
              );
            })}

            {/* Modules */}
            {plan.modules.map((m) => {
              const cs = moduleCorners(m, dims, mpp);
              const bad = stats.outsideIds.has(m.id) || stats.overlapIds.has(m.id);
              const s = strings.get(m.id);
              const sel = m.id === selModule;
              const shortSide = Math.min(dims.lengthM, dims.widthM) / mpp;
              return (
                <g key={m.id}>
                  <polygon
                    points={cs.map((p) => p.join(",")).join(" ")}
                    fill={bad ? "rgba(220,38,38,0.55)" : s?.extra ? "rgba(100,116,139,0.6)" : "rgba(30,64,175,0.72)"}
                    stroke={sel ? "#f59e0b" : "#dbeafe"}
                    strokeWidth={(sel ? 2.5 : 1) * u}
                    className={mode === "select" ? "cursor-move" : undefined}
                    onPointerDown={(e) => {
                      if (mode !== "select") return;
                      e.stopPropagation();
                      svgRef.current?.setPointerCapture(e.pointerId);
                      const p = toImg(e);
                      setSelModule(m.id);
                      setSelFace(m.faceId);
                      act.current = { kind: "module", id: m.id, dx: p[0] - m.x, dy: p[1] - m.y };
                    }}
                  />
                  {s && shortSide / u > 22 && (
                    <text x={m.x} y={m.y} fontSize={Math.min(fontPx, shortSide * 0.35)} textAnchor="middle" dominantBaseline="middle" fill="#ffffff" pointerEvents="none">
                      {s.extra ? "X" : `S${s.stringNo}-${s.pos}`}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Draft outline */}
            {mode === "draw" && draft.length > 0 && (
              <g pointerEvents="none">
                <polyline
                  points={[...draft, ...(hover ? [hover] : [])].map((p) => p.join(",")).join(" ")}
                  fill="rgba(245,158,11,0.12)"
                  stroke="#f59e0b"
                  strokeWidth={2 * u}
                  strokeDasharray={`${6 * u} ${4 * u}`}
                />
                {draft.map((p, i) => (
                  <circle key={i} cx={p[0]} cy={p[1]} r={(i === 0 ? 7 : 4) * u} fill={i === 0 ? "#f59e0b" : "#ffffff"} stroke="#f59e0b" strokeWidth={2 * u} />
                ))}
              </g>
            )}
          </svg>

          {/* North arrow (imagery is north-up), scale bar, attribution */}
          <div className="absolute top-3 right-3 w-10 h-12 rounded-lg bg-white/90 shadow flex flex-col items-center justify-center pointer-events-none">
            <svg viewBox="0 0 20 24" className="w-5 h-6">
              <polygon points="10,1 16,20 10,15 4,20" fill="#0f172a" />
            </svg>
            <span className="text-[10px] font-black text-slate-800 leading-none">N</span>
          </div>
          <div className="absolute bottom-6 left-3 pointer-events-none">
            <div className="h-1.5 border-x-2 border-b-2 border-white drop-shadow" style={{ width: `${(scaleBarM / mpp / view.w) * 100}%`, minWidth: 40 }} />
            <div className="text-[11px] text-white font-bold drop-shadow">{scaleBarM} m</div>
          </div>
          {cap.kind === "satellite" && (
            <div className="absolute bottom-0 right-0 px-1.5 py-0.5 bg-white/80 text-[10px] text-slate-700 pointer-events-none">{IMAGERY_ATTRIBUTION}</div>
          )}
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {mode === "draw"
            ? "Click each roof corner in turn; click the first point (or press Enter / double-click) to close. Backspace removes the last point, Esc cancels."
            : mode === "add"
              ? "Click inside a roof outline to add a module aligned with that roof."
              : "Drag to pan, scroll to zoom. Click a roof to edit it (drag its corners), click a module to move it. Keys: R rotates 90°, arrows nudge 5 cm, Delete removes."}
        </p>
      </div>

      {/* -------- Side panel -------- */}
      <div className="space-y-3 text-xs">
        <Panel title="Summary">
          <Row k="Modules placed" v={`${stats.placed} / ${stats.required}`} warn={stats.placed !== stats.required} />
          <Row k="Placed capacity" v={`${stats.placedKwp.toFixed(2)} kWp`} />
          <Row k="Roof area (outlined)" v={`${stats.roofAreaM2.toFixed(1)} m²`} />
          <Row k="Module size" v={`${(dims.lengthM * 1000).toFixed(0)} x ${(dims.widthM * 1000).toFixed(0)} mm`} />
          <Row k="Scale" v={`${mpp.toFixed(4)} m/px`} />
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{stats.scaleSource}</p>
          {stats.issues.length > 0 && (
            <div className="mt-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 space-y-1">
              {stats.issues.map((t, i) => (
                <div key={i} className="flex gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{t}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title={`Roof faces (${plan.faces.length})`}>
          {!plan.faces.length && <p className="text-slate-500">Use <b>Draw roof</b> to outline each roof face.</p>}
          <div className="space-y-1">
            {stats.faces.map(({ face: f, areaM2, modules }) => (
              <button
                key={f.id}
                onClick={() => {
                  setSelFace(f.id);
                  setMode("select");
                }}
                className={`w-full flex justify-between px-2 py-1.5 rounded-md border text-left ${
                  f.id === selFace ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "border-slate-200 dark:border-slate-700"
                }`}
              >
                <span className="font-bold text-slate-700 dark:text-slate-200">{f.name}</span>
                <span className="text-slate-500">
                  {areaM2.toFixed(1)} m² | {modules} mod.
                </span>
              </button>
            ))}
          </div>
        </Panel>

        {face && (
          <Panel title={`${face.name} settings`}>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Name">
                <input className={input} value={face.name} onChange={(e) => updateFace(face.id, { name: e.target.value })} />
              </Field>
              <Field label="Module layout">
                <select className={input} value={face.orientation} onChange={(e) => updateFace(face.id, { orientation: e.target.value as any })}>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </Field>
              <Field label="Row angle (°)">
                <input className={input} type="number" step="0.5" value={face.rowAngleDeg} onChange={(e) => updateFace(face.id, { rowAngleDeg: Number(e.target.value) })} />
              </Field>
              <Field label="Edge setback (m)">
                <input className={input} type="number" step="0.05" min="0" value={face.setbackM} onChange={(e) => updateFace(face.id, { setbackM: Math.max(0, Number(e.target.value)) })} />
              </Field>
              <Field label="Module gap (m)">
                <input className={input} type="number" step="0.01" min="0" value={face.moduleGapM} onChange={(e) => updateFace(face.id, { moduleGapM: Math.max(0, Number(e.target.value)) })} />
              </Field>
              <Field label="Row gap (m)">
                <input className={input} type="number" step="0.01" min="0" value={face.rowGapM} onChange={(e) => updateFace(face.id, { rowGapM: Math.max(0, Number(e.target.value)) })} />
              </Field>
              <Field label="Faces (azimuth °)">
                <input className={input} type="number" step="1" min="0" max="359" value={face.facingAzimuthDeg} onChange={(e) => updateFace(face.id, { facingAzimuthDeg: Number(e.target.value) })} />
              </Field>
              <Field label="Roof tilt (°)">
                <input className={input} type="number" step="1" min="0" max="60" value={face.tiltDeg} onChange={(e) => updateFace(face.id, { tiltDeg: Number(e.target.value) })} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <button className={btnGhost} onClick={() => updateFace(face.id, { rowAngleDeg: longestEdgeAngle(face.points) })}>
                <Ruler className="w-3.5 h-3.5" /> Align to longest edge
              </button>
              <button className={btnPrimary} onClick={() => autoPlaceFace(face)}>
                <Wand2 className="w-3.5 h-3.5" /> Fill this roof
              </button>
              <button className={btnGhost} onClick={() => commit({ ...plan, modules: plan.modules.filter((m) => m.faceId !== face.id) })}>
                Clear modules
              </button>
              <button className={`${btnGhost} text-red-600`} onClick={() => deleteFace(face.id)}>
                <Trash2 className="w-3.5 h-3.5" /> Delete roof
              </button>
            </div>
            <EdgeTable face={face} plan={plan} commit={commit} />
          </Panel>
        )}

        {module && (
          <Panel title="Selected module">
            <Row k="String" v={(() => { const s = strings.get(module.id); return s ? (s.extra ? "Extra (not in design)" : `String ${s.stringNo}, module ${s.pos}`) : "-"; })()} />
            <Field label="Rotation (°)">
              <input className={input} type="number" step="1" value={Math.round(module.rotDeg * 10) / 10} onChange={(e) => commit({ ...plan, modules: plan.modules.map((m) => (m.id === module.id ? { ...m, rotDeg: Number(e.target.value) } : m)) })} />
            </Field>
            <div className="flex gap-2 mt-2">
              <button className={btnGhost} onClick={() => rotateModule(module.id, 90)}>
                <RotateCw className="w-3.5 h-3.5" /> Rotate 90°
              </button>
              <button className={`${btnGhost} text-red-600`} onClick={() => deleteModule(module.id)}>
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          </Panel>
        )}

        <Panel title="Capture">
          {cap.kind === "satellite" ? (
            <>
              {cap.address && <Row k="Address" v={cap.address} />}
              <Row k="Location" v={`${cap.lat?.toFixed(6)}, ${cap.lng?.toFixed(6)}`} />
              <Row k="Zoom" v={`${cap.zoom}`} />
              <p className="text-[11px] text-slate-500 mt-1">{IMAGERY_ATTRIBUTION}</p>
            </>
          ) : (
            <p className="text-slate-500">Blank drawing grid (1 m squares). Enter measured edge lengths to set the scale.</p>
          )}
        </Panel>
      </div>
    </div>
  );
};

/** Edge lengths of a roof face, with calibration from a site-measured length */
const EdgeTable: React.FC<{ face: RoofPlanFace; plan: RoofPlanConfig; commit: (p: RoofPlanConfig) => void }> = ({ face, plan, commit }) => {
  const mpp = metersPerPx(plan);
  const [edge, setEdge] = useState(0);
  const [measured, setMeasured] = useState("");
  const current = edgeLengthPx(face.points, Math.min(edge, face.points.length - 1)) * mpp;
  return (
    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
      <div className="font-bold text-slate-700 dark:text-slate-200 mb-1">Edge lengths</div>
      <div className="grid grid-cols-3 gap-1 mb-2">
        {face.points.map((_, i) => (
          <span key={i} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            E{i + 1}: {(edgeLengthPx(face.points, i) * mpp).toFixed(2)} m
          </span>
        ))}
      </div>
      <div className="font-bold text-slate-700 dark:text-slate-200 mb-1">Calibrate scale from a measured edge</div>
      <div className="flex gap-2 items-center">
        <select className={`${input} w-20`} value={edge} onChange={(e) => setEdge(Number(e.target.value))}>
          {face.points.map((_, i) => (
            <option key={i} value={i}>
              E{i + 1}
            </option>
          ))}
        </select>
        <input className={input} type="number" step="0.01" min="0" placeholder={`${current.toFixed(2)} m`} value={measured} onChange={(e) => setMeasured(e.target.value)} />
        <button
          className={btnGhost}
          disabled={!(Number(measured) > 0)}
          onClick={() => {
            const m = Number(measured);
            const satLen = edgeLengthPx(face.points, edge) * (plan.capture?.baseMetersPerPx || 0.05);
            commit({ ...plan, scaleFactor: m / satLen, calibration: { faceId: face.id, edgeIndex: edge, measuredM: m } });
            setMeasured("");
          }}
        >
          Apply
        </button>
      </div>
      <p className="text-[11px] text-slate-500 mt-1">
        All lengths, areas and module sizes follow the calibrated scale. Re-run <b>Fill this roof</b> after calibrating.
      </p>
    </div>
  );
};

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
    <div className="font-bold text-slate-800 dark:text-slate-100 mb-2">{title}</div>
    {children}
  </div>
);
const Row: React.FC<{ k: string; v: string; warn?: boolean }> = ({ k, v, warn }) => (
  <div className="flex justify-between gap-3 py-0.5">
    <span className="text-slate-500 dark:text-slate-400">{k}</span>
    <span className={`font-bold text-right ${warn ? "text-amber-600" : "text-slate-700 dark:text-slate-200"}`}>{v}</span>
  </div>
);
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">{label}</span>
    {children}
  </label>
);

export default SolarRoofPlanTab;
export { SolarRoofPlanTab };
