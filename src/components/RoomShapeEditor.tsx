import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MousePointer2, PenLine, Plus, RotateCcw, Trash2, Magnet, AlertTriangle, Check, X } from 'lucide-react';
import {
  RoomPoint,
  RoomShapeDims,
  RoomShapeId,
  ROOM_SHAPES,
  ROOM_SHAPE_DIM_LABELS,
  defaultShapeDims,
  firstWallHeading,
  isSelfIntersecting,
  normalizePolygon,
  polygonArea,
  polygonBounds,
  polygonFromWalls,
  polygonPerimeter,
  polygonRoomIndex,
  presetPolygon,
  vertexLabel,
  wallsFromPolygon,
} from '../utils/roomGeometry';

export interface RoomShapeChange {
  roomShape: RoomShapeId;
  roomShapeDims?: RoomShapeDims;
  roomPolygon?: RoomPoint[];
  roomWidth: number;
  roomLength: number;
}

interface RoomShapeEditorProps {
  shape: RoomShapeId;
  dims?: RoomShapeDims;
  polygon?: RoomPoint[];
  width: number;
  length: number;
  /** Luminaire height above the working plane (hm) for the room index readout */
  cavityHeight: number;
  onChange: (next: RoomShapeChange) => void;
}

const inputCls =
  'w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-lg text-sm transition-colors focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none';
const cellInputCls =
  'w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded text-xs font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none';
const labelCls = 'text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest';

/** Small outline icons for the shape buttons (24 × 24 box) */
const SHAPE_ICONS: Record<RoomShapeId, string> = {
  rectangle: 'M3 5h18v14H3z',
  'l-shape': 'M3 3h9v8h9v10H3z',
  't-shape': 'M3 3h18v7h-6v11H9V10H3z',
  'u-shape': 'M3 3h18v18h-6v-9H9v9H3z',
  custom: 'M4 6l8-3 8 5-2 11-9 2-5-7z',
};

const SVG_W = 560;
const SVG_H = 380;
const PAD = 46;

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');

/** Number input that keeps what is typed (empty, "4.") and applies each valid positive value */
function NumField({ value, onCommit, step = 0.1, min = 0.1 }: { value: number; onCommit: (v: number) => void; step?: number; min?: number }) {
  const shownValue = String(Number(value.toFixed(3)));
  const [text, setText] = useState(shownValue);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(shownValue);
  }, [shownValue]);
  return (
    <input
      type="number"
      step={step}
      min={min}
      value={text}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        setText(shownValue);
      }}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v) && v >= min) onCommit(v);
      }}
      className={inputCls}
    />
  );
}

export default function RoomShapeEditor({ shape, dims, polygon, width, length, cavityHeight, onChange }: RoomShapeEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [snap, setSnap] = useState(true);
  const [mode, setMode] = useState<'edit' | 'draw'>('edit');
  const [selected, setSelected] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  // Working outline while a vertex is dragged (not re-normalised, so the vertex stays under the pointer)
  const [work, setWork] = useState<RoomPoint[] | null>(null);
  const [draft, setDraft] = useState<RoomPoint[]>([]);
  const [cursor, setCursor] = useState<RoomPoint | null>(null);
  // View extent frozen during a drag or a drawing so the grid does not move under the pointer
  const [frozenView, setFrozenView] = useState<{ minX: number; minZ: number; span: number } | null>(null);

  const outline: RoomPoint[] = useMemo(() => {
    if (shape !== 'rectangle' && polygon && polygon.length >= 3) return polygon;
    return presetPolygon('rectangle', width, length);
  }, [shape, polygon, width, length]);

  const shown = work || outline;
  const area = polygonArea(outline);
  const perimeter = polygonPerimeter(outline);
  const ri = polygonRoomIndex(outline, cavityHeight);
  const selfCross = isSelfIntersecting(outline);
  const walls = useMemo(() => wallsFromPolygon(outline), [outline]);
  const isEditable = shape === 'custom';

  // Leave the drawing mode with Escape
  useEffect(() => {
    if (mode !== 'draw') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelDraw();
      if (e.key === 'Enter') finishDraw();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- view mapping (metres ↔ SVG units) ----
  const view = useMemo(() => {
    if (frozenView) return frozenView;
    const b = polygonBounds(shown);
    const span = Math.max(b.width, b.length * (SVG_W - PAD * 2) / (SVG_H - PAD * 2), 2);
    return { minX: b.minX - (span - b.width) / 2, minZ: b.minZ - (span * (SVG_H - PAD * 2) / (SVG_W - PAD * 2) - b.length) / 2, span };
  }, [frozenView, shown]);
  const k = (SVG_W - PAD * 2) / view.span;
  const toSvg = ([x, z]: RoomPoint): [number, number] => [PAD + (x - view.minX) * k, PAD + (z - view.minZ) * k];
  const toMetres = (clientX: number, clientY: number): RoomPoint => {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const r = svg.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * SVG_W;
    const sy = ((clientY - r.top) / r.height) * SVG_H;
    return [view.minX + (sx - PAD) / k, view.minZ + (sy - PAD) / k];
  };
  const snapPt = ([x, z]: RoomPoint): RoomPoint => (snap ? [Math.round(x / 0.1) * 0.1, Math.round(z / 0.1) * 0.1] : [x, z]);

  // ---- emit changes ----
  const emitPolygon = (pts: RoomPoint[], nextShape: RoomShapeId = 'custom') => {
    const norm = normalizePolygon(pts);
    if (norm.length < 3 || polygonArea(norm) < 0.05) return;
    const b = polygonBounds(norm);
    onChange({ roomShape: nextShape, roomShapeDims: dims, roomPolygon: norm, roomWidth: b.width, roomLength: b.length });
  };

  const selectShape = (next: RoomShapeId) => {
    setMode('edit');
    setSelected(null);
    if (next === 'rectangle') {
      onChange({ roomShape: 'rectangle', roomShapeDims: dims, roomPolygon: undefined, roomWidth: width, roomLength: length });
      return;
    }
    if (next === 'custom') {
      // Start from the current outline so a preset can be fine-tuned wall by wall
      emitPolygon(outline, 'custom');
      return;
    }
    const d = shape === next && dims ? dims : defaultShapeDims(next, width, length);
    const pts = normalizePolygon(presetPolygon(next, width, length, d));
    onChange({ roomShape: next, roomShapeDims: d, roomPolygon: pts, roomWidth: width, roomLength: length });
  };

  const setOverall = (field: 'width' | 'length', value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    const w = field === 'width' ? value : width;
    const l = field === 'length' ? value : length;
    if (shape === 'rectangle') {
      onChange({ roomShape: 'rectangle', roomShapeDims: dims, roomPolygon: undefined, roomWidth: w, roomLength: l });
    } else if (shape === 'custom') {
      // Scale the drawn outline to the new overall size
      const b = polygonBounds(outline);
      const sx = b.width > 0 ? w / b.width : 1;
      const sz = b.length > 0 ? l / b.length : 1;
      emitPolygon(outline.map(([x, z]) => [x * sx, z * sz] as RoomPoint));
    } else {
      const d = dims || defaultShapeDims(shape, w, l);
      onChange({ roomShape: shape, roomShapeDims: d, roomPolygon: normalizePolygon(presetPolygon(shape, w, l, d)), roomWidth: w, roomLength: l });
    }
  };

  const setDim = (key: 'a' | 'b', value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    const d = { ...(dims || defaultShapeDims(shape, width, length)), [key]: value };
    onChange({ roomShape: shape, roomShapeDims: d, roomPolygon: normalizePolygon(presetPolygon(shape, width, length, d)), roomWidth: width, roomLength: length });
  };

  const editWall = (i: number, field: 'length' | 'angle', value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    if (field === 'angle' && (value <= 0 || value >= 360)) return;
    const next = walls.map((w, j) => (j === i ? { ...w, [field]: value } : w));
    emitPolygon(polygonFromWalls(next, firstWallHeading(outline)));
  };

  // ---- vertex editing ----
  const startDrag = (i: number, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setSelected(i);
    setDragIdx(i);
    setWork(outline.map((p) => [p[0], p[1]] as RoomPoint));
    setFrozenView(view);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = snapPt(toMetres(e.clientX, e.clientY));
    if (mode === 'draw') {
      setCursor(draft.length > 0 ? snapAngle(draft[draft.length - 1], p) : p);
      return;
    }
    if (dragIdx === null || !work) return;
    const next = work.map((q, j) => (j === dragIdx ? p : q));
    setWork(next);
    emitPolygon(next);
  };

  const endDrag = () => {
    if (dragIdx !== null) {
      setDragIdx(null);
      setWork(null);
      setFrozenView(null);
    }
  };

  const insertVertex = (i: number) => {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const mid: RoomPoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const next = [...outline.slice(0, i + 1), mid, ...outline.slice(i + 1)];
    emitPolygon(next);
    setSelected(i + 1);
  };

  const deleteVertex = (i: number) => {
    if (outline.length <= 3) return;
    emitPolygon(outline.filter((_, j) => j !== i));
    setSelected(null);
  };

  // ---- drawing a new outline ----
  /** With snapping on, keep the new wall at a multiple of 15° from the previous point */
  const snapAngle = (from: RoomPoint, p: RoomPoint): RoomPoint => {
    if (!snap) return p;
    const dx = p[0] - from[0];
    const dz = p[1] - from[1];
    const len = Math.round(Math.hypot(dx, dz) / 0.05) * 0.05;
    const ang = Math.round(Math.atan2(dz, dx) / (Math.PI / 12)) * (Math.PI / 12);
    return [from[0] + len * Math.cos(ang), from[1] + len * Math.sin(ang)];
  };

  const startDraw = () => {
    setMode('draw');
    setDraft([]);
    setCursor(null);
    setSelected(null);
    const b = polygonBounds(outline);
    const span = Math.max(b.width, b.length, 8) * 1.6;
    setFrozenView({ minX: -span * 0.15, minZ: -span * 0.12, span });
  };

  const cancelDraw = () => {
    setMode('edit');
    setDraft([]);
    setCursor(null);
    setFrozenView(null);
  };

  const finishDraw = () => {
    if (draft.length >= 3) emitPolygon(draft);
    cancelDraw();
  };

  const onCanvasClick = (e: React.MouseEvent) => {
    if (mode !== 'draw') {
      setSelected(null);
      return;
    }
    let p = snapPt(toMetres(e.clientX, e.clientY));
    if (draft.length > 0) p = snapAngle(draft[draft.length - 1], p);
    // Clicking near the first point closes the outline
    if (draft.length >= 3) {
      const [fx, fz] = toSvg(draft[0]);
      const [px, pz] = toSvg(p);
      if (Math.hypot(fx - px, fz - pz) < 12) {
        finishDraw();
        return;
      }
    }
    setDraft([...draft, p]);
  };

  // ---- rendering helpers ----
  const gridStep = view.span > 30 ? 5 : view.span > 12 ? 2 : view.span > 5 ? 1 : 0.5;
  const gridLines: React.ReactNode[] = [];
  {
    const x0 = Math.floor(view.minX / gridStep) * gridStep;
    const z0 = Math.floor(view.minZ / gridStep) * gridStep;
    const zSpan = view.span * (SVG_H / SVG_W) + 2;
    for (let x = x0; x <= view.minX + view.span + gridStep * 2; x += gridStep) {
      const [sx] = toSvg([x, 0]);
      gridLines.push(<line key={`gx${x.toFixed(2)}`} x1={sx} y1={0} x2={sx} y2={SVG_H} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth={Math.abs(x % (gridStep * 5)) < 1e-6 ? 1 : 0.5} />);
    }
    for (let z = z0; z <= view.minZ + zSpan + gridStep * 2; z += gridStep) {
      const [, sz] = toSvg([0, z]);
      gridLines.push(<line key={`gz${z.toFixed(2)}`} x1={0} y1={sz} x2={SVG_W} y2={sz} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth={Math.abs(z % (gridStep * 5)) < 1e-6 ? 1 : 0.5} />);
    }
  }

  const pathOf = (pts: RoomPoint[], close = true) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${toSvg(p)[0].toFixed(1)},${toSvg(p)[1].toFixed(1)}`).join(' ') + (close ? ' Z' : '');

  // Wall labels sit outside the room: offset along the outward normal (outline is clockwise on screen)
  const wallLabels = shown.map((a, i) => {
    const b = shown[(i + 1) % shown.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.01) return null;
    const [ax, az] = toSvg(a);
    const [bx, bz] = toSvg(b);
    const nx = (bz - az) / (len * k);
    const nz = -(bx - ax) / (len * k);
    const mx = (ax + bx) / 2 + nx * 14;
    const mz = (az + bz) / 2 + nz * 14;
    let deg = (Math.atan2(bz - az, bx - ax) * 180) / Math.PI;
    if (deg > 90) deg -= 180;
    if (deg < -90) deg += 180;
    return (
      <text key={`wl${i}`} x={mx} y={mz} transform={`rotate(${deg} ${mx} ${mz})`} textAnchor="middle" dominantBaseline="middle" className="fill-indigo-700 dark:fill-indigo-300" style={{ fontSize: 10, fontWeight: 800, fontFamily: 'ui-monospace, monospace' }}>
        {len.toFixed(2)} m
      </text>
    );
  });

  const dimLabels = ROOM_SHAPE_DIM_LABELS[shape];
  const curDims = dims || defaultShapeDims(shape, width, length);

  return (
    <div className="md:col-span-4 space-y-4 rounded-xl border border-indigo-100 dark:border-indigo-500/20 bg-indigo-50/30 dark:bg-indigo-500/5 p-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <span className={labelCls}>Room Shape / Geometry</span>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Rectangular, L, T, U or any polygon. Area, room index, luminaire layout, 2D/3D views and exports follow the outline.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ROOM_SHAPES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectShape(s.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-all ${shape === s.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400'}`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round"><path d={SHAPE_ICONS[s.id]} /></svg>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overall and cut-out dimensions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <label className={labelCls}>{shape === 'rectangle' ? 'Width (m)' : 'Overall Width (m)'}</label>
          <NumField value={width} min={0.5} onCommit={(v) => setOverall('width', v)} />
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>{shape === 'rectangle' ? 'Length (m)' : 'Overall Length (m)'}</label>
          <NumField value={length} min={0.5} onCommit={(v) => setOverall('length', v)} />
        </div>
        {dimLabels && (
          <>
            <div className="space-y-1.5">
              <label className={labelCls}>{dimLabels.a}</label>
              <NumField value={curDims.a} min={0.3} onCommit={(v) => setDim('a', v)} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>{dimLabels.b}</label>
              <NumField value={curDims.b} min={0.3} onCommit={(v) => setDim('b', v)} />
            </div>
          </>
        )}
        {shape === 'custom' && (
          <div className="col-span-2 flex items-end">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">Overall width/length scale the drawn outline. Drag corners, add a corner on any wall with <b>+</b>, or edit each wall's length and angle below.</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {/* Drawing canvas */}
        <div className="xl:col-span-3 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {mode === 'edit' ? (
              <>
                <button type="button" onClick={startDraw} className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold">
                  <PenLine className="w-3.5 h-3.5" /> Draw New Outline
                </button>
                {selected !== null && isEditable && outline.length > 3 && (
                  <button type="button" onClick={() => deleteVertex(selected)} className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-300 text-[11px] font-bold">
                    <Trash2 className="w-3.5 h-3.5" /> Delete Corner {vertexLabel(selected)}
                  </button>
                )}
                {shape !== 'rectangle' && (
                  <button type="button" onClick={() => selectShape('rectangle')} className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-bold">
                    <RotateCcw className="w-3.5 h-3.5" /> Reset to Rectangle
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                  <MousePointer2 className="w-3.5 h-3.5" /> Click each corner in turn; click the first corner (or Finish) to close. {draft.length} corner{draft.length === 1 ? '' : 's'}
                </span>
                <button type="button" disabled={draft.length < 3} onClick={finishDraw} className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 disabled:opacity-40 text-white text-[11px] font-bold">
                  <Check className="w-3.5 h-3.5" /> Finish
                </button>
                <button type="button" disabled={draft.length === 0} onClick={() => setDraft(draft.slice(0, -1))} className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 disabled:opacity-40 text-slate-600 dark:text-slate-300 text-[11px] font-bold">
                  <RotateCcw className="w-3.5 h-3.5" /> Undo Corner
                </button>
                <button type="button" onClick={cancelDraw} className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-bold">
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
              </>
            )}
            <button type="button" onClick={() => setSnap(!snap)} title="Snap to 0.1 m grid and 15° wall angles" className={`ml-auto flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-bold ${snap ? 'bg-sky-50 dark:bg-sky-500/10 border-sky-200 dark:border-sky-500/30 text-sky-700 dark:text-sky-300' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500'}`}>
              <Magnet className="w-3.5 h-3.5" /> Snap {snap ? 'On' : 'Off'}
            </button>
          </div>

          <svg
            ref={svgRef}
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className={`w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 touch-none select-none ${mode === 'draw' ? 'cursor-crosshair' : ''}`}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerLeave={() => setCursor(null)}
            onClick={onCanvasClick}
            onDoubleClick={() => mode === 'draw' && finishDraw()}
          >
            {gridLines}
            <text x={8} y={SVG_H - 8} className="fill-slate-400" style={{ fontSize: 9, fontWeight: 700 }}>Grid {gridStep} m · N ↑</text>

            {mode === 'edit' && (
              <>
                <path d={pathOf(shown)} className={selfCross ? 'fill-rose-500/15 stroke-rose-500' : 'fill-indigo-500/10 stroke-indigo-600 dark:stroke-indigo-400'} strokeWidth={3} strokeLinejoin="round" />
                {wallLabels}
                {/* Insert-corner handles at wall midpoints (custom outlines) */}
                {isEditable && dragIdx === null &&
                  shown.map((a, i) => {
                    const b = shown[(i + 1) % shown.length];
                    const [mx, mz] = toSvg([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
                    return (
                      <g key={`ins${i}`} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); insertVertex(i); }}>
                        <circle cx={mx} cy={mz} r={7} className="fill-white dark:fill-slate-900 stroke-emerald-500" strokeWidth={1.5} />
                        <path d={`M${mx - 3.5},${mz}h7M${mx},${mz - 3.5}v7`} className="stroke-emerald-600" strokeWidth={1.6} />
                        <title>Add a corner on wall {vertexLabel(i)}–{vertexLabel((i + 1) % shown.length)}</title>
                      </g>
                    );
                  })}
                {/* Corner handles */}
                {shown.map((p, i) => {
                  const [sx, sz] = toSvg(p);
                  const isSel = selected === i;
                  return (
                    <g key={`v${i}`}>
                      <circle
                        cx={sx}
                        cy={sz}
                        r={isSel ? 8 : 6.5}
                        className={`${isSel ? 'fill-amber-400 stroke-amber-700' : 'fill-white dark:fill-slate-900 stroke-indigo-600 dark:stroke-indigo-400'} cursor-move`}
                        strokeWidth={2}
                        onPointerDown={(e) => startDrag(i, e)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <title>Corner {vertexLabel(i)} ({p[0].toFixed(2)}, {p[1].toFixed(2)}) m — drag to move</title>
                      </circle>
                      <text x={sx - 10} y={sz - 10} textAnchor="middle" className="fill-slate-700 dark:fill-slate-200" style={{ fontSize: 10, fontWeight: 900 }}>{vertexLabel(i)}</text>
                    </g>
                  );
                })}
              </>
            )}

            {mode === 'draw' && (
              <>
                {outline.length >= 3 && <path d={pathOf(outline)} className="fill-none stroke-slate-300 dark:stroke-slate-700" strokeWidth={1.5} strokeDasharray="5 4" />}
                {draft.length > 0 && <path d={pathOf(cursor ? [...draft, cursor] : draft, false)} className="fill-indigo-500/10 stroke-indigo-600 dark:stroke-indigo-400" strokeWidth={3} strokeLinejoin="round" />}
                {draft.map((p, i) => {
                  const [sx, sz] = toSvg(p);
                  return <circle key={`d${i}`} cx={sx} cy={sz} r={i === 0 && draft.length >= 3 ? 9 : 5} className={i === 0 ? 'fill-emerald-400 stroke-emerald-700' : 'fill-white stroke-indigo-600'} strokeWidth={2} />;
                })}
                {cursor && draft.length > 0 && (() => {
                  const last = draft[draft.length - 1];
                  const len = Math.hypot(cursor[0] - last[0], cursor[1] - last[1]);
                  let ang = (Math.atan2(-(cursor[1] - last[1]), cursor[0] - last[0]) * 180) / Math.PI;
                  if (ang < 0) ang += 360;
                  const [cx, cz] = toSvg(cursor);
                  return (
                    <text x={cx + 10} y={cz - 10} className="fill-indigo-700 dark:fill-indigo-300" style={{ fontSize: 11, fontWeight: 800, fontFamily: 'ui-monospace, monospace' }}>
                      {len.toFixed(2)} m ∠ {ang.toFixed(0)}°
                    </text>
                  );
                })()}
              </>
            )}
          </svg>
          {shape !== 'custom' && mode === 'edit' && (
            <p className="text-[10px] text-slate-500 dark:text-slate-400">Dragging a corner turns this outline into a custom polygon you can edit freely.</p>
          )}
        </div>

        {/* Wall table and results */}
        <div className="xl:col-span-2 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Floor Area</span>
              <p className="text-base font-extrabold text-slate-800 dark:text-slate-100 font-mono">{fmt(area)} m²</p>
            </div>
            <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Perimeter</span>
              <p className="text-base font-extrabold text-slate-800 dark:text-slate-100 font-mono">{fmt(perimeter)} m</p>
            </div>
            <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Room Index (2A / hm·P)</span>
              <p className="text-base font-extrabold text-slate-800 dark:text-slate-100 font-mono">{fmt(ri)}</p>
            </div>
            <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Bounding Box</span>
              <p className="text-base font-extrabold text-slate-800 dark:text-slate-100 font-mono">{fmt(width)} × {fmt(length)}</p>
            </div>
          </div>

          {selfCross && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 px-3 py-2 text-[11px] text-rose-700 dark:text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0" /> Walls cross each other. Move a corner or adjust a wall so the outline does not overlap itself; the area is not reliable until then.
            </div>
          )}

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Walls ({walls.length})</span>
              {!isEditable && (
                <button type="button" onClick={() => selectShape('custom')} className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5">
                  <Plus className="w-3 h-3" /> Edit walls individually
                </button>
              )}
            </div>
            <div className="max-h-[260px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white dark:bg-slate-950 text-[9px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="text-left px-3 py-1.5">Wall</th>
                    <th className="text-left px-2 py-1.5">Length (m)</th>
                    <th className="text-left px-2 py-1.5">Interior ∠ at end</th>
                  </tr>
                </thead>
                <tbody>
                  {walls.map((w, i) => {
                    const n = walls.length;
                    const endV = vertexLabel((i + 1) % n);
                    // The last wall closes the room; it and the two angles beside it follow from the rest
                    const lenEditable = isEditable && i < n - 1;
                    const angEditable = isEditable && i < n - 2;
                    return (
                      <tr key={`w${i}-${n}`} className={`border-t border-slate-100 dark:border-slate-800 ${selected === i || selected === (i + 1) % n ? 'bg-amber-50/60 dark:bg-amber-500/5' : ''}`}>
                        <td className="px-3 py-1 font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">{vertexLabel(i)}–{endV}</td>
                        <td className="px-2 py-1">
                          {lenEditable ? (
                            <input key={`l${i}-${w.length}`} type="number" step="0.05" min="0.05" defaultValue={w.length} onBlur={(e) => editWall(i, 'length', parseFloat(e.target.value))} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={cellInputCls} />
                          ) : (
                            <span className="font-mono text-slate-700 dark:text-slate-200">{w.length.toFixed(2)}{isEditable ? ' (closing)' : ''}</span>
                          )}
                        </td>
                        <td className="px-2 py-1">
                          {angEditable ? (
                            <input key={`a${i}-${w.angle}`} type="number" step="1" min="1" max="359" defaultValue={w.angle} onBlur={(e) => editWall(i, 'angle', parseFloat(e.target.value))} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={cellInputCls} />
                          ) : (
                            <span className="font-mono text-slate-700 dark:text-slate-200">{w.angle.toFixed(1)}° at {endV}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {isEditable && (
              <p className="px-3 py-1.5 text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
                90° = square corner, 270° = inside (re-entrant) corner. The last wall closes the room automatically. Press Enter or leave the field to apply.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
