import React, { useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Download, FileType2, Maximize2, Minimize2 } from "lucide-react";
import type { Circuit, PanelConfig, ShortCircuitParams, VoltageDropCalculation } from "../types";
import { analysePowerSystem } from "../utils/powerAnalysis";
import { LAYER_STYLE, type Prim, type SldOptions, buildImpedanceSld, exportSldDxf, exportSldPdf } from "../utils/impedanceSld";

interface Props {
  panel: PanelConfig;
  circuits: Circuit[];
  subPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[];
  iscParams: ShortCircuitParams;
  vdCalculations?: VoltageDropCalculation[];
  isPremium?: boolean;
  onRequestUpgrade?: () => void;
}

/** Single Line Impedance Diagram sheet, generated from the project data and the short-circuit results */
export default function ImpedanceSLD({ panel, circuits, subPanels, iscParams, vdCalculations, isPremium = true, onRequestUpgrade }: Props) {
  const result = useMemo(
    () => analysePowerSystem({ panel, circuits, subPanels, iscParams, vdCalculations, basis: "demand" }),
    [panel, circuits, subPanels, iscParams, vdCalculations]
  );
  const is3 = result.source.is3Phase;
  const hasNeutral = result.buses.some((b) => Number.isFinite(b.iLG));
  const [faultTypes, setFaultTypes] = useState<SldOptions["faultTypes"]>({ threePhase: true, lineLine: true, lineGround: true, doubleLineGround: false });
  const [showImpedance, setShowImpedance] = useState(true);
  const [big, setBig] = useState(false);
  const [title, setTitle] = useState<SldOptions["title"]>(() => ({
    project: panel.project || "",
    location: panel.location || "",
    client: (panel as any).owner || "",
    drawingNo: "E-SC-01",
    revision: "0",
    preparedBy: (panel as any).engineer || "",
    checkedBy: "",
    date: new Date().toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" }),
  }));
  const sheet = useMemo(() => buildImpedanceSld({ result, panel, circuits, subPanels, iscParams }, { faultTypes, showImpedance, title }), [result, panel, circuits, subPanels, iscParams, faultTypes, showImpedance, title]);
  const fileBase = `${(title.project || panel.designation || "Project").replace(/[^a-z0-9]+/gi, "_")}_Impedance_SLD`;
  const flagged = result.buses.filter((b) => b.faultStatus === "fail" || b.withstand.status === "fail");
  const missing = result.findings.filter((f) => f.area === "Missing Data");

  const guard = (fn: () => void) => () => (isPremium ? fn() : onRequestUpgrade?.());

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
        <div>
          <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Activity className="w-4 h-4 text-red-500" /> Single Line Impedance Diagram
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Generated from the Load Schedule, Voltage Drop and Short Circuit inputs: {result.buses.length} panel{result.buses.length === 1 ? "" : "s"}, sheet {sheet.size}{sheet.scale < 1 ? ` (diagram at ${(sheet.scale * 100).toFixed(0)}%)` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={guard(() => exportSldPdf(sheet, fileBase))} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold">
            <FileType2 className="w-3.5 h-3.5" /> PDF ({sheet.size}){!isPremium && " (Premium)"}
          </button>
          <button type="button" onClick={guard(() => exportSldDxf(sheet, fileBase))} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold" title="AutoCAD DXF (open in AutoCAD and save as DWG if needed)">
            <Download className="w-3.5 h-3.5" /> AutoCAD DXF{!isPremium && " (Premium)"}
          </button>
          <button type="button" onClick={() => setBig((v) => !v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300">
            {big ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />} {big ? "Fit" : "Zoom"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-3 text-xs">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Study scope</span>
          {([
            ["threePhase", is3 ? "Three-phase bolted fault" : "Single-phase bolted fault", true],
            ["lineLine", "Line-to-line", is3],
            ["lineGround", "Line-to-ground", is3 && hasNeutral],
            ["doubleLineGround", "Double line-to-ground", is3 && hasNeutral],
          ] as const).map(([k, label, ok]) => (
            <label key={k} className={`flex items-center gap-2 ${ok ? "text-slate-700 dark:text-slate-200" : "text-slate-400"}`} title={ok ? "" : "Not applicable to this system"}>
              <input type="checkbox" disabled={!ok} checked={ok && faultTypes[k]} onChange={(e) => setFaultTypes((f) => ({ ...f, [k]: e.target.checked }))} /> {label}{!ok && " (n/a)"}
            </label>
          ))}
          <label className="flex items-center gap-2 text-slate-700 dark:text-slate-200 pt-1 border-t border-slate-100 dark:border-slate-800">
            <input type="checkbox" checked={showImpedance} onChange={(e) => setShowImpedance(e.target.checked)} /> Show impedances (mΩ)
          </label>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 xl:col-span-2 grid grid-cols-2 gap-2">
          <span className="col-span-2 text-[10px] font-black uppercase tracking-wider text-slate-400">Title block</span>
          {([
            ["project", "Project"], ["drawingNo", "Drawing No."], ["location", "Location"], ["revision", "Revision"],
            ["client", "Client"], ["date", "Date"], ["preparedBy", "Prepared by"], ["checkedBy", "Checked by"],
          ] as const).map(([k, label]) => (
            <label key={k} className="block">
              <span className="text-[9px] font-black uppercase text-slate-400">{label}</span>
              <input value={title[k]} onChange={(e) => setTitle((t) => ({ ...t, [k]: e.target.value }))} className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" />
            </label>
          ))}
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Checks</span>
          {flagged.length === 0 ? (
            <p className="flex gap-1.5 text-emerald-600"><CheckCircle2 className="w-4 h-4 shrink-0" /> No interrupting or withstand rating below the available fault.</p>
          ) : flagged.map((b) => (
            <p key={b.id} className="flex gap-1.5 text-red-600"><AlertTriangle className="w-4 h-4 shrink-0" /> {b.name}: {b.faultStatus === "fail" ? `${b.iSym.toFixed(2)} kA exceeds ${b.lowestDevice}` : "feeder withstand below clearing time"}.</p>
          ))}
          {missing.length > 0 && (
            <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
              <p className="font-bold text-orange-600 mb-1">Missing data ({missing.length})</p>
              <ul className="space-y-0.5 text-orange-700 dark:text-orange-400 max-h-28 overflow-y-auto">
                {missing.map((m, i) => <li key={i}>{m.location}: {m.title}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className={`rounded-xl border border-slate-300 dark:border-slate-700 bg-white overflow-auto ${big ? "max-h-[85vh]" : ""}`}>
        <svg viewBox={`0 0 ${sheet.w} ${sheet.h}`} style={{ width: big ? `${sheet.w * 3}px` : "100%", height: "auto", display: "block" }} fontFamily="Helvetica, Arial, sans-serif">
          <rect x={0} y={0} width={sheet.w} height={sheet.h} fill="#ffffff" />
          {sheet.prims.map((p, i) => <SvgPrim key={i} p={p} />)}
        </svg>
      </div>
      <p className="text-[11px] text-slate-500">
        To change the diagram, edit the project: panels, breakers and kAIC in the Load Schedule, feeder lengths in Voltage Drop, utility and transformer data above. AutoCAD: the DXF opens directly (save as DWG if needed); every element is on its own SLD_* layer.
      </p>
    </div>
  );
}

function SvgPrim({ p }: { p: Prim }) {
  const st = LAYER_STYLE[p.layer];
  switch (p.t) {
    case "line":
      return <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={st.color} strokeWidth={p.w ?? st.w} strokeDasharray={p.dash ? "2 1.5" : undefined} />;
    case "circle":
      return <circle cx={p.cx} cy={p.cy} r={p.r} fill="none" stroke={st.color} strokeWidth={p.w ?? st.w} />;
    case "arc": {
      const a0 = (p.a0 * Math.PI) / 180;
      const a1 = (p.a1 * Math.PI) / 180;
      const x0 = p.cx + p.r * Math.cos(a0), y0 = p.cy - p.r * Math.sin(a0);
      const x1 = p.cx + p.r * Math.cos(a1), y1 = p.cy - p.r * Math.sin(a1);
      const large = p.a1 - p.a0 > 180 ? 1 : 0;
      return <path d={`M ${x0} ${y0} A ${p.r} ${p.r} 0 ${large} 0 ${x1} ${y1}`} fill="none" stroke={st.color} strokeWidth={p.w ?? st.w} />;
    }
    case "rect":
      return <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill || "none"} stroke={st.color} strokeWidth={p.lw ?? st.w} />;
    case "text":
      return (
        <text x={p.x} y={p.y} fontSize={p.s * 1.35} fill={st.color} fontWeight={p.bold ? 700 : 400} textAnchor={p.anchor || "start"}>
          {p.text}
        </text>
      );
  }
}
