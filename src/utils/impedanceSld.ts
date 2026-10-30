/**
 * Single Line Impedance Diagram: an AutoCAD-style sheet built from the Power Analysis engine results
 * (utility -> transformer -> service entrance -> main breaker -> MDP -> distribution panels -> loads).
 *
 * The drawing is a list of primitives in millimetres on the sheet (y down). The same list is rendered
 * on screen (SVG), to PDF (jsPDF) and to DXF (dxf-writer), so the three always match.
 *
 * Layout: every panel owns a column; children sit side by side under their parent's bus. Inside a
 * column the bus annotation is on the left of the incoming line and the breaker / cable labels on the
 * right, each confined to its half-column, so text and symbols cannot overlap.
 */
import { jsPDF } from "jspdf";
import "./pdfSafeText";
import Drawing from "dxf-writer";
import type { Circuit, FaultPointSetting, PanelConfig, ShortCircuitParams } from "../types";
import { CLEARING_TIME_S, type BusResult, type PowerAnalysisResult, type Status } from "./powerAnalysis";
import { isIdleSpareOrSpace, parseSystemVoltage } from "./computeEngine";
import { resolveFaultPoints, type FaultPoint } from "./faultPoints";

// ------------------------------------------------------------------------------------------ primitives
export type Layer =
  | "BORDER" | "TITLE" | "BUS" | "LINE" | "EQUIP" | "TEXT" | "LABEL" | "FAULT" | "FLAG" | "MISSING" | "NOTE" | "GRID";
export type Prim =
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; layer: Layer; w?: number; dash?: boolean }
  | { t: "circle"; cx: number; cy: number; r: number; layer: Layer; w?: number }
  | { t: "arc"; cx: number; cy: number; r: number; a0: number; a1: number; layer: Layer; w?: number }
  | { t: "rect"; x: number; y: number; w: number; h: number; layer: Layer; lw?: number; fill?: string }
  | { t: "text"; x: number; y: number; s: number; text: string; anchor?: "start" | "middle" | "end"; layer: Layer; bold?: boolean };

/** Display colours per layer (SVG / PDF) and AutoCAD colour index (DXF) */
export const LAYER_STYLE: Record<Layer, { color: string; aci: number; w: number }> = {
  BORDER: { color: "#0f172a", aci: 7, w: 0.5 },
  TITLE: { color: "#0f172a", aci: 7, w: 0.35 },
  BUS: { color: "#0f172a", aci: 7, w: 1.2 },
  LINE: { color: "#0f172a", aci: 7, w: 0.35 },
  EQUIP: { color: "#0f172a", aci: 7, w: 0.35 },
  TEXT: { color: "#0f172a", aci: 7, w: 0.18 },
  LABEL: { color: "#334155", aci: 8, w: 0.18 },
  FAULT: { color: "#1d4ed8", aci: 5, w: 0.18 },
  FLAG: { color: "#dc2626", aci: 1, w: 0.25 },
  MISSING: { color: "#c2410c", aci: 30, w: 0.25 },
  NOTE: { color: "#334155", aci: 8, w: 0.18 },
  GRID: { color: "#94a3b8", aci: 9, w: 0.13 },
};

export interface SldOptions {
  faultTypes: { threePhase: boolean; lineLine: boolean; lineGround: boolean; doubleLineGround: boolean };
  showImpedance: boolean;
  title: { project: string; location: string; client: string; drawingNo: string; revision: string; preparedBy: string; checkedBy: string; date: string };
  /** Smallest sheet to use (the full project drawing uses A1 sheets) */
  minSize?: "A3" | "A2" | "A1" | "A0";
  /** Fault locations edited by the user (panel buses are fault points unless removed) */
  faultPoints?: FaultPointSetting[];
}

/**
 * Diagram options from the settings saved with the project (Short Circuit inputs), filled with the
 * project data. The Short Circuit page and "Export AutoCAD Drawing" both use this, so they match.
 */
export function sldOptionsFor(panel: PanelConfig, iscParams?: ShortCircuitParams): SldOptions {
  const saved = iscParams?.sldSettings;
  const p = panel as any;
  return {
    faultTypes: { threePhase: true, lineLine: true, lineGround: true, doubleLineGround: false, ...(saved?.faultTypes || {}) },
    showImpedance: saved?.showImpedance ?? true,
    faultPoints: saved?.faultPoints || [],
    title: {
      project: panel.project || "",
      location: panel.location || "",
      client: p.owner || "",
      drawingNo: "E-SC-01",
      revision: "0",
      preparedBy: p.engineer || "",
      checkedBy: "",
      date: new Date().toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" }),
      ...Object.fromEntries(Object.entries(saved?.title || {}).filter(([, v]) => typeof v === "string" && v !== "")),
    },
  };
}

export interface SldSheet {
  w: number;
  h: number;
  size: string;
  scale: number;
  prims: Prim[];
}

// ------------------------------------------------------------------------------------------ helpers
const CW = 96; // column width (mm)
const LH = 78; // level height (mm)
const TXT = 2.2; // value text height (mm)
const LINE = 3.1; // line pitch (mm)
/** Rendered font size = text height (cap height) × 1.35; Helvetica advance widths in em */
const EM = 1.35;
const charEm = (c: string) =>
  c === " " ? 0.28 : /[A-Z0-9%#@&]/.test(c) ? 0.68 : /[ilj.,:;'!|()[\]]/.test(c) ? 0.3 : /[mw]/.test(c) ? 0.83 : 0.56;
/** Estimated text width (mm) at text height s (bold about 6% wider) */
export const textWidth = (t: string, s = TXT, bold = false) => [...t].reduce((w, c) => w + charEm(c), 0) * s * EM * (bold ? 1.06 : 1);
const maxChars = (widthMm: number, s = TXT) => Math.floor(widthMm / (s * EM * 0.56));
const clip = (t: string, widthMm: number, s = TXT, bold = false) => {
  if (textWidth(t, s, bold) <= widthMm) return t;
  let out = t;
  while (out.length > 1 && textWidth(`${out}…`, s, bold) > widthMm) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
};
const kA = (v: number) => (Number.isFinite(v) ? `${v.toFixed(2)} kA` : "n/a");
const mOhm = (r: number, x: number) => `${(r * 1000).toFixed(2)} + j${(x * 1000).toFixed(2)} mΩ`;

interface Line { text: string; layer?: Layer; bold?: boolean }

function textBlock(p: Prim[], x: number, y: number, width: number, lines: Line[], anchor: "start" | "end" = "start", s = TXT) {
  lines.forEach((l, i) => p.push({ t: "text", x, y: y + i * LINE, s, text: clip(l.text, width, s, l.bold), anchor, layer: l.layer || "LABEL", bold: l.bold }));
  return y + lines.length * LINE;
}

// Symbols (centred on x, starting at y going down); return the y where the next element starts
function sourceSymbol(p: Prim[], x: number, y: number) {
  p.push({ t: "circle", cx: x, cy: y + 6, r: 6, layer: "EQUIP" });
  // sine wave
  p.push({ t: "arc", cx: x - 1.8, cy: y + 6, r: 1.8, a0: 180, a1: 360, layer: "EQUIP" });
  p.push({ t: "arc", cx: x + 1.8, cy: y + 6, r: 1.8, a0: 0, a1: 180, layer: "EQUIP" });
  return y + 12;
}
function transformerSymbol(p: Prim[], x: number, y: number) {
  p.push({ t: "circle", cx: x, cy: y + 5, r: 5, layer: "EQUIP" });
  p.push({ t: "circle", cx: x, cy: y + 12, r: 5, layer: "EQUIP" });
  return y + 17;
}
function breakerSymbol(p: Prim[], x: number, y: number, layer: Layer = "EQUIP") {
  // IEC/ANSI LV breaker: small box with the switching contact
  p.push({ t: "rect", x: x - 2.2, y, w: 4.4, h: 6, layer });
  p.push({ t: "line", x1: x - 2.2, y1: y + 6, x2: x + 2.2, y2: y, layer });
  return y + 6;
}
function loadSymbol(p: Prim[], x: number, y: number) {
  // arrowhead = load
  p.push({ t: "line", x1: x - 2.5, y1: y, x2: x, y2: y + 4, layer: "EQUIP" });
  p.push({ t: "line", x1: x + 2.5, y1: y, x2: x, y2: y + 4, layer: "EQUIP" });
  return y + 4;
}
function faultMark(p: Prim[], x: number, y: number, dir: 1 | -1 = 1) {
  // fault arrow (lightning) pointing at the bus / line (dir -1: drawn to the left)
  p.push({ t: "line", x1: x, y1: y, x2: x + 2 * dir, y2: y - 3, layer: "FLAG" });
  p.push({ t: "line", x1: x + 2 * dir, y1: y - 3, x2: x + 1 * dir, y2: y - 3, layer: "FLAG" });
  p.push({ t: "line", x1: x + 1 * dir, y1: y - 3, x2: x + 3 * dir, y2: y - 6, layer: "FLAG" });
}
const fpStatusText = (st: FaultPoint["status"]) => (st === "fail" ? "INSUFFICIENT" : st === "warning" ? "CHECK" : st === "info" ? "UTILITY" : "OK");
const fpLayer = (st: FaultPoint["status"]): Layer => (st === "fail" ? "FLAG" : st === "warning" ? "MISSING" : "TEXT");
/** Short value of a feeder fault point on the drawing ("F3 · 15 m · 12.34 kA") */
const fpShort = (fp: FaultPoint) =>
  `${fp.tag} · ${fp.distanceM} m · ${fp.iSym.toFixed(2)} kA${fp.upperBound ? " ↑" : ""}`;

// ------------------------------------------------------------------------------------------ tree
interface Leaf {
  kind: "bus" | "branch";
  bus?: BusResult;
  /** Branch-circuit group of a bus */
  group?: { busId: string; count: number; kva: number; minAT: number; maxAT: number; minKaic: number; missingKaic: number; motors: number };
  children: Leaf[];
  width: number;
  x: number;
  depth: number;
}

function branchGroup(bus: BusResult, circuits: Circuit[]) {
  const list = circuits.filter((c) => !isIdleSpareOrSpace(c) && !c.linkedSubPanelId);
  if (!list.length) return null;
  const ats = list.map((c) => Number(c.mcbATOverride || c.mcbAT) || 0).filter((v) => v > 0);
  const kaics = list.map((c) => Number(c.mcbKAIC) || 0);
  return {
    busId: bus.id,
    count: list.length,
    kva: list.reduce((s, c) => s + (Number(c.loadVA) || 0), 0) / 1000,
    minAT: ats.length ? Math.min(...ats) : 0,
    maxAT: ats.length ? Math.max(...ats) : 0,
    minKaic: kaics.filter((k) => k > 0).length ? Math.min(...kaics.filter((k) => k > 0)) : 0,
    missingKaic: kaics.filter((k) => !(k > 0)).length,
    motors: list.filter((c) => c.loadType === "M" || c.loadType === "AC" || /motor|pump|ahu|acu|compressor/i.test(String(c.description || ""))).length,
  };
}

// ------------------------------------------------------------------------------------------ build
export interface SldInput {
  result: PowerAnalysisResult;
  panel: PanelConfig;
  circuits: Circuit[];
  subPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[];
  iscParams: ShortCircuitParams;
}

const SHEETS: Array<[string, number, number]> = [["A3", 420, 297], ["A2", 594, 420], ["A1", 841, 594], ["A0", 1189, 841]];

export function buildImpedanceSld(input: SldInput, opt: SldOptions): SldSheet {
  const { result: R, panel, iscParams } = input;
  const circuitsOf = (id: string) => (id === "mdp" ? input.circuits : input.subPanels.find((s) => s.id === id)?.circuits || []);

  // ---- tree with widths
  const make = (bus: BusResult, depth: number): Leaf => {
    const kids: Leaf[] = R.buses.filter((b) => b.parentId === bus.id).map((b) => make(b, depth + 1));
    const g = branchGroup(bus, circuitsOf(bus.id));
    if (g) kids.push({ kind: "branch", group: g, children: [], width: CW, x: 0, depth: depth + 1 });
    const width = Math.max(CW, kids.reduce((s, k) => s + k.width, 0));
    return { kind: "bus", bus, children: kids, width, x: 0, depth };
  };
  const root = make(R.byId.mdp, 0);
  // Fault locations: panel buses (unless removed) and the user's feeder / branch points, F1, F2 ...
  const FP = resolveFaultPoints(R, input, opt.faultPoints || []);
  const fpAt = (busId: string, loc: FaultPoint["location"]) => FP.filter((p) => p.busId === busId && p.location === loc);
  let maxDepth = 0;
  const place = (n: Leaf, left: number) => {
    maxDepth = Math.max(maxDepth, n.depth);
    if (!n.children.length) { n.x = left + n.width / 2; return; }
    let l = left + (n.width - n.children.reduce((s, k) => s + k.width, 0)) / 2;
    n.children.forEach((k) => { place(k, l); l += k.width; });
    n.x = (n.children[0].x + n.children[n.children.length - 1].x) / 2;
  };

  // ---- natural size of the diagram (before placing on a sheet)
  const chainH = 118; // utility -> MDP bus
  place(root, 3);
  // Room for the source labels right of the root line, and for the deepest panel's branch group
  const diagW = Math.max(root.width + 6, root.x + 75);
  const diagH = chainH + maxDepth * LH + 8;
  const tableRows = Math.max(1, FP.length) + 1;
  const tableH = tableRows * 5 + 10;
  const colW = 130; // title column of the drawing-set template (frame margin included)
  const headH = 16;
  const margin = 10;
  const needW = diagW + colW + margin + 6;
  const needH = diagH + tableH + headH + margin * 2 + 4;
  const minIdx = Math.max(0, SHEETS.findIndex(([s]) => s === opt.minSize));
  const [size, W, H] = SHEETS.slice(minIdx).find(([, w, h]) => w >= needW && h >= needH) || SHEETS[SHEETS.length - 1];
  const availW = W - colW - margin - 6;
  const availH = H - tableH - headH - margin * 2 - 4;
  const scale = Math.min(1, availW / diagW, availH / diagH);

  const prims: Prim[] = [];
  const P = prims;

  // ---- diagram in local coordinates (later scaled into the sheet)
  const D: Prim[] = [];
  const rx = root.x;
  let y = 6;
  const src = R.source;
  const rightW = CW / 2 - 4;
  // Utility
  y = sourceSymbol(D, rx, y);
  const priFaultKA = (src.utilityMVA * 1e6) / (Math.sqrt(3) * src.primaryV) / 1000;
  textBlock(D, rx + 9, y - 9, rightW + 20, [
    { text: "UTILITY SOURCE", layer: "TEXT", bold: true },
    { text: `${src.primaryV.toLocaleString()} V, 3PH, 60 Hz` },
    { text: `Ssc ${src.utilityMVA} MVA, X/R ${src.utilityXr} (assumed)` },
    { text: `Isc at primary ${kA(priFaultKA)}`, layer: "FAULT" },
    ...(opt.showImpedance ? [{ text: `Zu ${mOhm(src.zUtility.r, src.zUtility.x)} @ ${src.secondaryV} V` }] : []),
  ]);
  D.push({ t: "line", x1: rx, y1: y, x2: rx, y2: y + 8, layer: "LINE" });
  y += 8;
  // Transformer
  y = transformerSymbol(D, rx, y);
  const conn = iscParams.transformerConnection || "Delta-Wye";
  textBlock(D, rx + 8, y - 15, rightW + 20, [
    { text: `TRANSFORMER ${src.kva} kVA${(iscParams.parallelTransformersCount || 1) > 1 ? ` (${iscParams.parallelTransformersCount} units)` : ""}`, layer: "TEXT", bold: true },
    { text: `${src.primaryV.toLocaleString()} V / ${src.secondaryV} V, ${conn}` },
    { text: `Z ${src.zPct}%, X/R ${src.txXr.toFixed(1)} (typical, IEEE 141)` },
    ...(opt.showImpedance ? [{ text: `Zt ${mOhm(src.zTransformer.r, src.zTransformer.x)}` }] : []),
    { text: `Secondary terminals ${kA(src.terminalFaultKA)}`, layer: "FAULT" },
  ]);
  D.push({ t: "line", x1: rx, y1: y, x2: rx, y2: y + 5, layer: "LINE" });
  y += 5;
  // Service entrance conductor = MDP feeder, then the main breaker
  const mdp = R.byId.mdp;
  const yCableTop = y;
  y += 30;
  D.push({ t: "line", x1: rx, y1: yCableTop, x2: rx, y2: y, layer: "LINE" });
  feederLabels(D, rx, yCableTop + 3, mdp, "SERVICE ENTRANCE", opt, rightW + 20);
  feederPoints(D, rx, yCableTop + 3, yCableTop + 27, mdp);
  breakerLabels(D, rx, y + 1, mdp, mdp.feeder.breakerAT, mdp.feeder.breakerAF, mdp.feeder.breakerPoles, mdp.feeder.breakerKaic, "MAIN BREAKER", mdp.iSym, rightW + 20);
  y = breakerSymbol(D, rx, y);
  D.push({ t: "line", x1: rx, y1: y, x2: rx, y2: chainH, layer: "LINE" });
  void LH;
  drawBus(D, root, chainH, opt, circuitsOf);

  // ---- place the diagram on the sheet, inside the drawing-set template (same frame and title block as
  // every other sheet of the AutoCAD drawing): content area left of the 130 mm title column
  const flags = R.buses.filter((b) => b.faultStatus === "fail").length;
  const missing = R.findings.filter((f) => f.area === "Missing Data").length;
  const tpl = drawingSetTemplate(W, H, {
    title: opt.title,
    title1: "SINGLE LINE IMPEDANCE DIAGRAM",
    title2: `SHORT-CIRCUIT STUDY · ${panel.designation || "MDP"} · ${R.buses.length} panel${R.buses.length === 1 ? "" : "s"}`,
    column: (C, sx, sy0, cw) => {
      // Legend and study notes in the column, above the drawing title
      let sy = sy0;
      C.push({ t: "text", x: sx + 4, y: sy, s: 3, text: "LEGEND", layer: "TITLE", bold: true });
      sy += 6;
      const legend: Array<[(p: Prim[], x: number, y: number) => void, string]> = [
        [(p, x, yy) => sourceSymbol(p, x, yy - 4), "Utility source"],
        [(p, x, yy) => transformerSymbol(p, x, yy - 6), "Transformer"],
        [(p, x, yy) => breakerSymbol(p, x, yy - 1), "Circuit breaker"],
        [(p, x, yy) => p.push({ t: "line", x1: x - 6, y1: yy + 2, x2: x + 6, y2: yy + 2, layer: "BUS" }), "Bus (panelboard)"],
        [(p, x, yy) => p.push({ t: "line", x1: x, y1: yy - 2, x2: x, y2: yy + 6, layer: "LINE" }), "Feeder / cable"],
        [(p, x, yy) => loadSymbol(p, x, yy), "Load (branch circuits)"],
        [(p, x, yy) => faultMark(p, x - 1, yy + 5), "Fault location F# (bus/feeder/branch)"],
      ];
      legend.forEach(([draw, label]) => {
        draw(C, sx + 12, sy);
        C.push({ t: "text", x: sx + 24, y: sy + 3.5, s: 2.4, text: label, layer: "LABEL" });
        sy += 12;
      });
      ([["FAULT", "Calculated fault current"], ["FLAG", "Rating insufficient / exceeded"], ["MISSING", "Missing data or upper bound"]] as Array<[Layer, string]>).forEach(([layer, label]) => {
        C.push({ t: "rect", x: sx + 8, y: sy, w: 8, h: 3, layer, fill: LAYER_STYLE[layer].color });
        C.push({ t: "text", x: sx + 24, y: sy + 2.6, s: 2.4, text: label, layer: "LABEL" });
        sy += 6;
      });
      sy += 4;
      C.push({ t: "text", x: sx + 4, y: sy, s: 3, text: "NOTES", layer: "TITLE", bold: true });
      sy += 5;
      [...sldNotes(R, opt), "Method: complex impedances, symmetrical components (IEC 60909 / IEEE Std 141, 242, 399); PEC 2017 Ch. 9 Table 9 conductors."].forEach((t, i) => {
        const wrapped = wrap(`${i + 1}. ${t}`, maxChars(cw - 8, 2.1));
        wrapped.forEach((l, k) => C.push({ t: "text", x: sx + 4 + (k ? 3 : 0), y: sy + k * 2.9, s: 2.1, text: l, layer: l.includes("NOT ") ? "MISSING" : "NOTE" }));
        sy += wrapped.length * 2.9 + 1.2;
      });
      return sy;
    },
  });
  P.push(...tpl.prims);
  const cR = tpl.contentRight;
  P.push({ t: "text", x: margin + 4, y: margin + 7, s: 4, text: "SINGLE LINE IMPEDANCE DIAGRAM AND SHORT-CIRCUIT STUDY", layer: "TITLE", bold: true });
  P.push({ t: "text", x: cR - 4, y: margin + 7, s: 2.6, text: `${R.source.secondaryV} V ${R.source.is3Phase ? "3PH" : "1PH"}, 60 Hz${scale < 1 ? ` · diagram scaled ${(scale * 100).toFixed(0)}%` : ""}`, anchor: "end", layer: "LABEL" });
  P.push({
    t: "text", x: margin + 4, y: margin + 12.5, s: 2.4, layer: flags ? "FLAG" : missing ? "MISSING" : "TEXT", bold: true,
    text: clip(`${flags} bus${flags === 1 ? "" : "es"} with insufficient interrupting rating · ${missing} missing-data item${missing === 1 ? "" : "s"} (see notes)`, cR - margin - 8, 2.4, true),
  });
  // Centred in the content area (the template's title column is on the right)
  const ox = margin + 3 + Math.max(0, (availW - diagW * scale) / 2);
  const oy = margin + headH;
  for (const d of D) P.push(transform(d, ox, oy, scale));

  // ---- calculation summary table at the foot of the content area
  const ty = H - margin - tableH;
  P.push({ t: "line", x1: margin, y1: ty, x2: cR, y2: ty, layer: "BORDER" });
  P.push({ t: "text", x: margin + 4, y: ty + 5, s: 3, text: "CALCULATION SUMMARY", layer: "TITLE", bold: true });
  const cols: Array<[string, number]> = [
    ["TAG", 10], ["FAULT LOCATION", 70], ["SYSTEM", 24], ["CONDUCTOR (SIZE, LENGTH)", 48], ["I 3PH/1PH kA", 22], ["I L-L kA", 16], ["I L-G kA", 16], ["I LLG kA", 16],
    ["X/R", 11], ["Ip kA", 15], ["MOTOR kA", 16], ["Isym kA", 16], ["INTERRUPTING DEVICE", 72], ["DUTY %", 14], ["BUS SCCR", 26], ["STATUS", 26],
  ];
  const tW = cols.reduce((s, c) => s + c[1], 0);
  const tScale = Math.min(1, (cR - margin - 8) / tW);
  let tx = margin + 4;
  const hy = ty + 8;
  cols.forEach(([h, w]) => {
    P.push({ t: "rect", x: tx, y: hy, w: w * tScale, h: 5, layer: "GRID", fill: "#e2e8f0" });
    P.push({ t: "text", x: tx + 1, y: hy + 3.5, s: 1.9 * Math.min(1, tScale + 0.1), text: clip(h, w * tScale - 2, 1.9, true), layer: "TEXT", bold: true });
    tx += w * tScale;
  });
  if (!FP.length) P.push({ t: "text", x: margin + 5, y: hy + 8.5, s: 1.9, text: "No fault locations: every bus point was removed (Fault locations editor).", layer: "MISSING" });
  FP.forEach((fp, i) => {
    const ry = hy + 5 + i * 5;
    const b = R.byId[fp.busId];
    const isBus = fp.location === "bus";
    const st: FaultPoint["status"] = isBus ? rowStatus(b) : fp.status;
    const ub = fp.upperBound ? " ↑" : "";
    const conductor = isBus
      ? `${b.feeder.label}, ${b.feeder.lengthAssumed ? "L NOT SET" : `${b.feeder.lengthM} m`}`
      : `${fp.conductor}, ${fp.distanceM} m`;
    const cells: Array<[string, Layer]> = [
      [fp.tag, "FLAG"],
      [`${"  ".repeat(b.level - 1)}${fp.where}`, "TEXT"],
      [`${b.nominalV} V ${fp.is3Phase ? "3PH" : "1PH"}`, "LABEL"],
      [conductor, (isBus ? b.feeder.lengthAssumed : fp.conductor === "Not set") ? "MISSING" : "LABEL"],
      [`${fp.i3ph.toFixed(2)}${ub}`, fp.upperBound ? "MISSING" : "FAULT"],
      [opt.faultTypes.lineLine ? fp.iLL.toFixed(2) : "-", "FAULT"],
      [opt.faultTypes.lineGround && Number.isFinite(fp.iLG) ? fp.iLG.toFixed(2) : "-", "FAULT"],
      [opt.faultTypes.doubleLineGround && Number.isFinite(fp.iLLG) ? fp.iLLG.toFixed(2) : "-", "FAULT"],
      [fp.xr.toFixed(1), "LABEL"],
      [fp.iPeak.toFixed(2), "LABEL"],
      [fp.motorKA.toFixed(2), "LABEL"],
      [`${fp.iSym.toFixed(2)}${ub}`, "FAULT"],
      [fp.deviceText, fp.deviceKaic > 0 || fp.status === "info" ? "LABEL" : "MISSING"],
      [Number.isFinite(fp.dutyPct) ? fp.dutyPct.toFixed(0) : "-", fp.status === "fail" ? "FLAG" : "LABEL"],
      [isBus ? "NOT SPECIFIED" : "-", isBus ? "MISSING" : "LABEL"],
      [fpStatusText(st), fpLayer(st)],
    ];
    let cxp = margin + 4;
    cells.forEach(([v, layer], k) => {
      const w = cols[k][1] * tScale;
      P.push({ t: "rect", x: cxp, y: ry, w, h: 5, layer: "GRID" });
      P.push({ t: "text", x: cxp + 1, y: ry + 3.5, s: 1.9 * Math.min(1, tScale + 0.1), text: clip(v, w - 2, 1.9), layer, bold: k === 0 || (k === cells.length - 1 && st !== "pass") });
      cxp += w;
    });
  });

  return { w: W, h: H, size, scale, prims };

  // ---------------------------------------------------------------- nested drawing helpers
  function drawBus(Dp: Prim[], node: Leaf, yb: number, o: SldOptions, ckts: (id: string) => Circuit[]) {
    const b = node.bus!;
    const kids = node.children;
    const x0 = Math.min(node.x - 14, ...kids.map((k) => k.x));
    const x1 = Math.max(node.x + 14, ...kids.map((k) => k.x));
    Dp.push({ t: "line", x1: x0, y1: yb, x2: x1, y2: yb, layer: "BUS", w: 1.2 });
    const busFp = fpAt(b.id, "bus")[0];
    if (busFp) {
      faultMark(Dp, node.x + 2, yb - 1);
      Dp.push({ t: "text", x: node.x + 6, y: yb - 3.2, s: 2.4, text: busFp.tag, layer: "FLAG", bold: true });
    }
    // bus annotation: left of the incoming line, above the bus
    const leftW = CW / 2 - 6;
    const lines: Line[] = busFp
      ? busLines(b, o, busFp.tag)
      : [
          { text: `${b.name}`, layer: "TEXT", bold: true },
          { text: `${b.nominalV} V ${b.is3Phase ? "3PH" : "1PH"} ${parseSystemVoltage(b.system).wireCount}W` },
          { text: "No fault point at this bus" },
        ];
    const top = yb - 3 - lines.length * LINE;
    textBlock(Dp, node.x - 5, top + 2, leftW, lines, "end");
    // children
    for (const k of kids) {
      const yTop = yb;
      Dp.push({ t: "line", x1: k.x, y1: yTop, x2: k.x, y2: yTop + 5, layer: "LINE" });
      if (k.kind === "bus") {
        const kb = k.bus!;
        const yCb = yTop + 5;
        breakerLabels(Dp, k.x, yCb + 1, kb, kb.feeder.breakerAT, kb.feeder.breakerAF, kb.feeder.breakerPoles, kb.feeder.breakerKaic, "FEEDER BREAKER", b.iSym, CW / 2 - 5);
        const yAfter = breakerSymbol(Dp, k.x, yCb);
        const yBus = yTop + LH;
        Dp.push({ t: "line", x1: k.x, y1: yAfter, x2: k.x, y2: yBus, layer: "LINE" });
        feederLabels(Dp, k.x, yAfter + 14, kb, "FEEDER", o, CW / 2 - 5);
        // Points along the feeder: left of the line, above the panel's bus annotation
        feederPoints(Dp, k.x, yAfter + 4, yBus - 36, kb);
        drawBus(Dp, k, yBus, o, ckts);
      } else {
        const g = k.group!;
        const yCb = yTop + 5;
        const flag = g.minKaic > 0 && g.minKaic < b.iSym;
        const yAfter = breakerSymbol(Dp, k.x, yCb, flag ? "FLAG" : "EQUIP");
        Dp.push({ t: "line", x1: k.x, y1: yAfter, x2: k.x, y2: yAfter + 14, layer: "LINE" });
        loadSymbol(Dp, k.x, yAfter + 14);
        // Fault points at branch circuits: one mark on the branch line, the points listed on the left
        const bps = fpAt(b.id, "branch");
        if (bps.length) {
          faultMark(Dp, k.x - 1, yAfter + 9, -1);
          textBlock(
            Dp, k.x - 6, yAfter + 4, CW / 2 - 7,
            bps.flatMap((fp): Line[] => [
              { text: `${fp.tag} CKT ${fp.circuitNo ?? ""}`, layer: fp.status === "fail" ? "FLAG" : "FAULT", bold: true },
              { text: `${fp.distanceM} m · ${fp.iSym.toFixed(2)} kA${fp.upperBound ? " ↑" : ""}`, layer: fp.status === "fail" ? "FLAG" : "FAULT" },
            ]),
            "end",
          );
        }
        textBlock(Dp, k.x + 4, yCb + 3, CW / 2 - 5, [
          { text: `BRANCH CIRCUITS (${g.count})`, layer: "TEXT", bold: true },
          { text: `${g.kva.toFixed(2)} kVA${g.motors ? `, ${g.motors} mtr/AC` : ""}` },
          { text: g.minAT ? `CB ${g.minAT}${g.maxAT !== g.minAT ? `-${g.maxAT}` : ""} AT` : "CB ratings not set", layer: g.minAT ? "LABEL" : "MISSING" },
          g.minKaic > 0
            ? { text: `min ${g.minKaic} kAIC${flag ? ` < ${b.iSym.toFixed(1)} kA ✗` : " ✓"}`, layer: flag ? "FLAG" : "LABEL", bold: flag }
            : { text: "kAIC NOT SPECIFIED", layer: "MISSING" },
          ...(g.missingKaic && g.minKaic > 0 ? [{ text: `${g.missingKaic} without kAIC`, layer: "MISSING" as Layer }] : []),
        ]);
      }
    }
  }

  function busLines(b: BusResult, o: SldOptions, tag: string): Line[] {
    const sys = parseSystemVoltage(b.system);
    const lines: Line[] = [
      { text: `${b.name} (${tag})`, layer: "TEXT", bold: true },
      { text: `${b.nominalV} V ${b.is3Phase ? "3PH" : "1PH"} ${sys.wireCount}W` },
    ];
    const ub = b.faultUpperBound ? " ↑" : "";
    if (o.faultTypes.threePhase) lines.push({ text: `${b.is3Phase ? "I 3PH" : "I 1PH"} ${b.i3ph.toFixed(2)} kA${ub}`, layer: b.faultUpperBound ? "MISSING" : "FAULT", bold: true });
    if (o.faultTypes.lineLine && b.is3Phase) lines.push({ text: `I L-L ${b.iLL.toFixed(2)} kA${ub}`, layer: "FAULT" });
    if (o.faultTypes.lineGround && Number.isFinite(b.iLG)) lines.push({ text: `I L-G ${b.iLG.toFixed(2)} kA${ub}`, layer: "FAULT" });
    if (o.faultTypes.doubleLineGround && Number.isFinite(b.iLLG)) lines.push({ text: `I LLG ${b.iLLG.toFixed(2)} kA${ub}`, layer: "FAULT" });
    lines.push({ text: `Ip ${b.iPeak.toFixed(2)} kA, X/R ${b.xr.toFixed(1)}` });
    if (b.motorKA > 0.0005) lines.push({ text: `incl. motors ${b.motorKA.toFixed(2)} kA` });
    if (o.showImpedance) lines.push({ text: `Z1 ${mOhm(b.z1.r, b.z1.x)}` });
    if (!b.kaicKnown) lines.push({ text: "kAIC NOT SPECIFIED", layer: "MISSING", bold: true });
    else if (b.faultStatus === "fail") lines.push({ text: `DUTY ${b.adjustedDutyPct.toFixed(0)}%, ${b.lowestKaic} kA ✗`, layer: "FLAG", bold: true });
    else lines.push({ text: `duty ${b.adjustedDutyPct.toFixed(0)}% of ${b.lowestKaic} kA ✓`, layer: b.faultStatus === "warning" ? "MISSING" : "LABEL" });
    return lines;
  }

  /** Fault points along the feeder of bus b, drawn on the line between y0 and y1 by their distance */
  function feederPoints(Dp: Prim[], x: number, y0: number, y1: number, b: BusResult) {
    const pts = fpAt(b.id, "feeder");
    if (!pts.length) return;
    const L = b.id === "mdp" && iscParams.feederLength > 0 ? iscParams.feederLength : b.feeder.lengthM || 0;
    let last = -Infinity;
    pts
      .map((fp) => ({ fp, y: y0 + (y1 - y0) * (L > 0 ? Math.min(1, fp.distanceM / L) : 0.5) }))
      .sort((a, c) => a.y - c.y)
      .forEach(({ fp, y }) => {
        const yy = Math.max(y, last + LINE); // keep the tags apart
        last = yy;
        Dp.push({ t: "line", x1: x - 1.2, y1: yy, x2: x + 1.2, y2: yy, layer: "FLAG" });
        faultMark(Dp, x - 1, yy, -1);
        Dp.push({ t: "text", x: x - 5, y: yy - 0.6, s: TXT, text: clip(fpShort(fp), CW / 2 - 6, TXT, true), anchor: "end", layer: fp.status === "fail" ? "FLAG" : "FAULT", bold: true });
      });
  }

  function breakerLabels(Dp: Prim[], x: number, y0: number, b: BusResult, at: number, af: number, poles: number | undefined, kaic: number | undefined, title: string, lineSideKA: number, width: number) {
    const flag = !!kaic && kaic > 0 && kaic < lineSideKA;
    textBlock(Dp, x + 4, y0 + 1, width, [
      { text: title, layer: "TEXT", bold: true },
      at ? { text: `${at} AT / ${af || "-"} AF, ${poles || "-"}P` } : { text: "Rating NOT SET", layer: "MISSING" },
      kaic && kaic > 0
        ? { text: `${kaic} kAIC${flag ? ` < ${lineSideKA.toFixed(1)} kA ✗` : ""}`, layer: flag ? "FLAG" : "LABEL", bold: flag }
        : { text: "kAIC NOT SPECIFIED", layer: "MISSING" },
    ]);
    void b;
  }

  function feederLabels(Dp: Prim[], x: number, y0: number, b: BusResult, title: string, o: SldOptions, width: number) {
    const f = b.feeder;
    const lines: Line[] = [
      { text: title, layer: "TEXT", bold: true },
      Number(f.size) > 0 ? { text: f.label } : { text: "CONDUCTOR NOT SET", layer: "MISSING" },
      f.lengthAssumed ? { text: "LENGTH NOT SET", layer: "MISSING", bold: true } : { text: `L = ${f.lengthM} m${b.vdEvaluated ? `, VD ${b.vdFeederPct.toFixed(2)}%` : ""}` },
      ...(f.lengthAssumed ? [{ text: "fault values ↑ upper bound", layer: "MISSING" as Layer }] : []),
    ];
    if (o.showImpedance && Number(f.size) > 0 && !f.lengthAssumed) lines.push({ text: `Zf ${mOhm(b.zFeeder.r, b.zFeeder.x)}` });
    if (b.withstand.status === "fail" && Number.isFinite(b.withstand.maxTimeS)) lines.push({ text: `I²t: ${(b.withstand.maxTimeS * 1000).toFixed(0)} ms < ${(CLEARING_TIME_S * 1000).toFixed(0)} ms ✗`, layer: "FLAG", bold: true });
    textBlock(Dp, x + 4, y0, width, lines);
  }
}

function rowStatus(b: BusResult): Status {
  if (b.faultStatus === "fail" || b.withstand.status === "fail") return "fail";
  if (!b.kaicKnown || b.faultUpperBound || b.faultStatus === "warning") return "warning";
  return "pass";
}

function transform(p: Prim, ox: number, oy: number, k: number): Prim {
  switch (p.t) {
    case "line": return { ...p, x1: ox + p.x1 * k, y1: oy + p.y1 * k, x2: ox + p.x2 * k, y2: oy + p.y2 * k };
    case "circle": return { ...p, cx: ox + p.cx * k, cy: oy + p.cy * k, r: p.r * k };
    case "arc": return { ...p, cx: ox + p.cx * k, cy: oy + p.cy * k, r: p.r * k };
    case "rect": return { ...p, x: ox + p.x * k, y: oy + p.y * k, w: p.w * k, h: p.h * k };
    case "text": return { ...p, x: ox + p.x * k, y: oy + p.y * k, s: p.s * k };
  }
}

function wrap(text: string, n: number): string[] {
  const words = text.split(" ");
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > n && cur) { out.push(cur); cur = w; } else cur = (cur + " " + w).trim();
  }
  if (cur) out.push(cur);
  return out;
}

function sldNotes(R: PowerAnalysisResult, o: SldOptions): string[] {
  const notes = [
    "Fault currents are bolted (zero fault impedance) symmetrical RMS values at each fault location F#, with 4 × FLA motor contribution included in Isym and the duty check.",
    "Fault locations: each panel bus unless removed, plus points on feeders (distance from the supply end) and at branch circuits (cable length from the panel). Duty uses the fault at the device's line terminals.",
    `Shown: ${[o.faultTypes.threePhase && "3-phase (1-phase loop for 1-phase systems)", o.faultTypes.lineLine && "line-to-line", o.faultTypes.lineGround && "line-to-ground", o.faultTypes.doubleLineGround && "double line-to-ground"].filter(Boolean).join(", ")}.`,
    "Zero sequence: Dyn transformer (utility blocked by the delta) plus phase and equal-size neutral return of each feeder.",
    "Utility X/R 10 and transformer X/R (IEEE Std 141 typical) are assumptions; the project has no X/R inputs.",
    "Duty = available current × X/R factor (device test X/R per UL 489 / IEC 60947-2) / lowest device rating on the bus.",
    "↑ = upper bound: a feeder length or size on the path is NOT SET, so its impedance was taken as zero.",
    "Panelboard bus short-circuit (bracing) ratings are NOT SPECIFIED in the project; verify each is at least the available fault current.",
  ];
  R.source.missing.forEach((m) => notes.push(`NOT ENTERED: ${m}`));
  return notes;
}

// ------------------------------------------------------------------------------------------ sheet template
/**
 * Title-block cells of the drawing set (project, drawing no., location, revision, client, date, prepared /
 * checked by), drawn in a box of width w and height h at (x, y). Every AutoCAD sheet and the impedance
 * diagram use this, so the whole set has one title block. Returns where the drawing number value sits.
 */
export function titleCells(P: Prim[], x: number, y: number, w: number, h: number, t: SldOptions["title"]) {
  const a = Math.round((w * 120) / 190);
  const half = w / 2;
  const cells: Array<[string, string, number, number, number]> = [
    ["PROJECT", t.project, 0, 0, a], ["DRAWING NO.", t.drawingNo, a, 0, w - a],
    ["LOCATION", t.location, 0, 1, a], ["REVISION", t.revision, a, 1, w - a],
    ["CLIENT", t.client, 0, 2, a], ["DATE", t.date, a, 2, w - a],
    ["PREPARED BY", t.preparedBy, 0, 3, half], ["CHECKED BY", t.checkedBy, half, 3, half],
  ];
  const rowH = h / 4;
  cells.forEach(([label, value, dx, row, cw]) => {
    const cxp = x + dx;
    const cyp = y + row * rowH;
    P.push({ t: "rect", x: cxp, y: cyp, w: cw, h: rowH, layer: "GRID" });
    P.push({ t: "text", x: cxp + 1.5, y: cyp + 3, s: 1.8, text: label, layer: "LABEL" });
    if (label !== "DRAWING NO." || value) P.push({ t: "text", x: cxp + 1.5, y: cyp + rowH - 2.2, s: 3, text: clip(value || "-", cw - 3, 3), layer: "TITLE", bold: true });
  });
  return { drawingNoX: x + a + 1.5, drawingNoY: y + rowH - 2.2 };
}

/** General notes printed on every sheet of the drawing set */
export const DRAWING_SET_NOTES = [
  "All work shall comply with the Philippine Electrical Code (PEC) 2017 Part 1 and the local utility's requirements.",
  "Conductor sizes, breaker ratings (AT / AF / poles / kAIC) and feeder lengths are as entered in the project Load Schedule, Voltage Drop and Short Circuit inputs.",
  "Short-circuit values: complex impedances from the utility, transformer and feeders (see the Single Line Impedance Diagram and Short Circuit study sheets).",
  "Verify all ratings against the equipment nameplates and the utility's available fault data before construction.",
];

/**
 * The sheet template of the AutoCAD drawing set, in the same design as the impedance diagram sheet: 10 mm
 * frame, a right-hand column with the notes and, at its foot, the drawing title and the title-block cells.
 * The column is the 130 mm the sheet layouts already keep free, so no drawing content moves.
 * Coordinates are millimetres, y down, for a sheet of w × h.
 */
export function drawingSetTemplate(
  w: number,
  h: number,
  o: {
    title: SldOptions["title"];
    title1: string;
    title2: string;
    notes?: string[];
    /** Draws the column content instead of the general notes (x, top y, column width); returns the lowest y */
    column?: (P: Prim[], x: number, y: number, w: number) => number;
  },
) {
  const P: Prim[] = [];
  const margin = 10;
  const colX = w - 130;
  const colW = 130 - margin;
  P.push({ t: "rect", x: 0, y: 0, w, h, layer: "BORDER", lw: 0.25 });
  P.push({ t: "rect", x: margin, y: margin, w: w - 2 * margin, h: h - 2 * margin, layer: "BORDER" });
  P.push({ t: "line", x1: colX, y1: margin, x2: colX, y2: h - margin, layer: "BORDER" });

  // Notes (or the sheet's own column content) at the top of the column
  if (o.column) o.column(P, colX, margin + 8, colW);
  else {
    let sy = margin + 8;
    P.push({ t: "text", x: colX + 4, y: sy, s: 3, text: "GENERAL NOTES", layer: "TITLE", bold: true });
    sy += 5;
    (o.notes || DRAWING_SET_NOTES).forEach((n, i) => {
      const lines = wrap(`${i + 1}. ${n}`, maxChars(colW - 8, 2.1));
      lines.forEach((l, k) => P.push({ t: "text", x: colX + 4 + (k ? 3 : 0), y: sy + k * 2.9, s: 2.1, text: l, layer: "NOTE" }));
      sy += lines.length * 2.9 + 1.2;
    });
  }

  // Title-block cells at the foot of the column, the drawing title above them
  const cellsH = 46;
  const cellsY = h - margin - cellsH;
  const titleH = 30;
  const ty = cellsY - titleH;
  P.push({ t: "line", x1: colX, y1: ty, x2: w - margin, y2: ty, layer: "BORDER" });
  P.push({ t: "text", x: colX + 4, y: ty + 5, s: 1.8, text: "DRAWING TITLE", layer: "LABEL" });
  P.push({ t: "text", x: colX + 4, y: ty + 12, s: 3.6, text: clip(o.title1, colW - 8, 3.6, true), layer: "TITLE", bold: true });
  P.push({ t: "text", x: colX + 4, y: ty + 18, s: 2.4, text: clip(o.title2, colW - 8, 2.4), layer: "LABEL" });
  P.push({ t: "text", x: colX + 4, y: ty + 25, s: 1.9, text: clip("SCALE: NOT TO SCALE · generated from the project data by ElectricalPH", colW - 8, 1.9), layer: "NOTE" });
  const pos = titleCells(P, colX, cellsY, colW, cellsH, o.title);
  return { prims: P, contentRight: colX, ...pos };
}

// ------------------------------------------------------------------------------------------ exports
const PT = 72 / 25.4;

export function exportSldPdf(sheet: SldSheet, fileBase: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [sheet.w, sheet.h] });
  for (const p of sheet.prims) {
    const st = LAYER_STYLE[p.layer];
    const rgb = hexRgb(st.color);
    doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
    if (p.t === "line") {
      doc.setLineWidth(p.w ?? st.w);
      doc.line(p.x1, p.y1, p.x2, p.y2);
    } else if (p.t === "circle") {
      doc.setLineWidth(p.w ?? st.w);
      doc.circle(p.cx, p.cy, p.r, "S");
    } else if (p.t === "arc") {
      doc.setLineWidth(p.w ?? st.w);
      const pts: number[][] = [];
      for (let a = p.a0; a <= p.a1 + 0.01; a += 10) pts.push([p.cx + p.r * Math.cos((a * Math.PI) / 180), p.cy - p.r * Math.sin((a * Math.PI) / 180)]);
      for (let i = 1; i < pts.length; i++) doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    } else if (p.t === "rect") {
      doc.setLineWidth(p.lw ?? st.w);
      if (p.fill) {
        const f = hexRgb(p.fill);
        doc.setFillColor(f[0], f[1], f[2]);
        doc.rect(p.x, p.y, p.w, p.h, "FD");
      } else doc.rect(p.x, p.y, p.w, p.h, "S");
    } else if (p.t === "text") {
      doc.setTextColor(rgb[0], rgb[1], rgb[2]);
      doc.setFont("helvetica", p.bold ? "bold" : "normal");
      doc.setFontSize(p.s * PT * 1.35);
      doc.text(pdfText(p.text), p.x, p.y, { align: p.anchor === "middle" ? "center" : p.anchor === "end" ? "right" : "left" });
    }
  }
  doc.save(`${fileBase}.pdf`);
}

/** Characters outside the standard PDF fonts */
const pdfText = (t: string) => t.replace(/↑/g, "(UB)").replace(/✗/g, "X").replace(/✓/g, "OK").replace(/…/g, "...").replace(/Ω/g, "ohm");
/** Text for AutoCAD: no carets (control codes) or braces, and every non-ASCII symbol as a \U+ escape */
const dxfText = (t: string) =>
  t
    .replace(/↑/g, "(UB)").replace(/✗/g, "X").replace(/✓/g, "OK").replace(/…/g, "...")
    .replace(/\^2(?![0-9])/g, "²").replace(/\^3(?![0-9])/g, "³").replace(/\^/g, "^ ")
    .replace(/\\/g, "/").replace(/[{}]/g, "").replace(/[\uD800-\uDFFF]/g, "")
    .replace(/[^\x20-\x7e]/g, (c) => `\\U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`);

/** CAD layer name of a drawing layer (E- prefix); the same names on every sheet of the drawing set and in the standalone DXF */
export const sldCadLayer = (l: Layer) => `E-${l}`;

/**
 * Draws the sheet into a dxf-writer drawing with its lower-left corner at (dx, dy), y up, in millimetres.
 * Used by the standalone DXF and by "Export AutoCAD Drawing" (utils/exportDxf.ts), so both are identical.
 */
export function drawSldOnDrawing(d: Drawing, sheet: SldSheet, dx = 0, dy = 0) {
  // Register each layer once: adding a layer again replaces it and drops what is already drawn on it
  (Object.keys(LAYER_STYLE) as Layer[]).forEach((l) => { if (!(d as any).layers?.[sldCadLayer(l)]) d.addLayer(sldCadLayer(l), LAYER_STYLE[l].aci, "CONTINUOUS"); });
  const X = (x: number) => x + dx;
  const Y = (y: number) => sheet.h - y + dy;
  for (const p of sheet.prims) {
    d.setActiveLayer(sldCadLayer(p.layer));
    if (p.t === "line") {
      const w = p.w ?? LAYER_STYLE[p.layer].w;
      const seg = (x1: number, y1: number, x2: number, y2: number) =>
        w >= 1 ? d.drawPolyline([[X(x1), Y(y1)], [X(x2), Y(y2)]], false, w, w) : d.drawLine(X(x1), Y(y1), X(x2), Y(y2));
      if (!p.dash) seg(p.x1, p.y1, p.x2, p.y2);
      else {
        // Dashes drawn as segments so they look the same at any LTSCALE
        const len = Math.hypot(p.x2 - p.x1, p.y2 - p.y1);
        const ux = (p.x2 - p.x1) / (len || 1), uy = (p.y2 - p.y1) / (len || 1);
        for (let t = 0; t < len; t += 3.5) {
          const e = Math.min(len, t + 2);
          seg(p.x1 + ux * t, p.y1 + uy * t, p.x1 + ux * e, p.y1 + uy * e);
        }
      }
    } else if (p.t === "circle") d.drawCircle(X(p.cx), Y(p.cy), p.r);
    else if (p.t === "arc") d.drawArc(X(p.cx), Y(p.cy), p.r, p.a0, p.a1);
    else if (p.t === "rect") {
      if (p.fill && p.fill === LAYER_STYLE[p.layer].color) {
        // Solid colour swatch (legend): a wide polyline through the middle
        d.drawPolyline([[X(p.x), Y(p.y + p.h / 2)], [X(p.x + p.w), Y(p.y + p.h / 2)]], false, p.h, p.h);
      }
      d.drawRect(X(p.x), Y(p.y + p.h), X(p.x + p.w), Y(p.y));
    } else if (p.t === "text") {
      d.drawText(X(p.x), Y(p.y), p.s, 0, dxfText(p.text), p.anchor === "middle" ? "center" : p.anchor === "end" ? "right" : "left", "baseline");
    }
  }
}

export function buildSldDxf(sheet: SldSheet): string {
  const d = new Drawing();
  d.setUnits("Millimeters");
  drawSldOnDrawing(d, sheet);
  // Arial for every text style, as in the full project drawing
  ((d as any).tables?.STYLE?.elements || []).forEach((e: any) => (e.fontFileName = "arial.ttf"));
  return d.toDxfString();
}

export function exportSldDxf(sheet: SldSheet, fileBase: string) {
  const blob = new Blob([buildSldDxf(sheet)], { type: "application/dxf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileBase}.dxf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The sheet as a standalone SVG document (same drawing as the page preview) */
export function sldSvgString(sheet: SldSheet): string {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheet.w} ${sheet.h}" width="${sheet.w}mm" height="${sheet.h}mm" font-family="Helvetica, Arial, sans-serif"><rect width="100%" height="100%" fill="#ffffff"/>`];
  for (const p of sheet.prims) {
    const st = LAYER_STYLE[p.layer];
    if (p.t === "line") out.push(`<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" stroke="${st.color}" stroke-width="${p.w ?? st.w}"${p.dash ? ' stroke-dasharray="2 1.5"' : ""}/>`);
    else if (p.t === "circle") out.push(`<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="none" stroke="${st.color}" stroke-width="${p.w ?? st.w}"/>`);
    else if (p.t === "arc") {
      const a0 = (p.a0 * Math.PI) / 180, a1 = (p.a1 * Math.PI) / 180;
      out.push(`<path d="M ${p.cx + p.r * Math.cos(a0)} ${p.cy - p.r * Math.sin(a0)} A ${p.r} ${p.r} 0 ${p.a1 - p.a0 > 180 ? 1 : 0} 0 ${p.cx + p.r * Math.cos(a1)} ${p.cy - p.r * Math.sin(a1)}" fill="none" stroke="${st.color}" stroke-width="${p.w ?? st.w}"/>`);
    } else if (p.t === "rect") out.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${p.fill || "none"}" stroke="${st.color}" stroke-width="${p.lw ?? st.w}"/>`);
    else out.push(`<text x="${p.x}" y="${p.y}" font-size="${p.s * 1.35}" fill="${st.color}" font-weight="${p.bold ? 700 : 400}" text-anchor="${p.anchor || "start"}">${esc(p.text)}</text>`);
  }
  out.push("</svg>");
  return out.join("");
}

/** PNG data URL of the sheet (browser only), for the Word report */
export async function sldToPngDataUrl(sheet: SldSheet, pxPerMm = 5): Promise<string | null> {
  try {
    const url = URL.createObjectURL(new Blob([sldSvgString(sheet)], { type: "image/svg+xml" }));
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sheet.w * pxPerMm);
    canvas.height = Math.round(sheet.h * pxPerMm);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
