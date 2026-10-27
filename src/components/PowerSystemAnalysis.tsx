import React, { useEffect, useMemo, useState } from "react";
import {
  Zap, Activity, ShieldAlert, Settings, AlertTriangle, CheckCircle2, Info, Download, Network, FileText, Gauge,
  FileSpreadsheet, FileType2, XCircle,
} from "lucide-react";
import { PanelConfig, Circuit, ShortCircuitParams, VoltageDropCalculation } from "../types";
import {
  type BusResult, type CoordinationDevice, type Status, CLEARING_TIME_S, analysePowerSystem, checkSelectivity,
  coordinationDevices, largestMotor,
} from "../utils/powerAnalysis";
import {
  type ReportMeta, buildReportTables, buildTcc, exportPowerAnalysisDocx, exportPowerAnalysisPdf, exportPowerAnalysisXlsx,
  renderTccPng,
} from "../utils/powerAnalysisReport";

interface PowerSystemAnalysisProps {
  panel: PanelConfig;
  circuits: Circuit[];
  subPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[];
  iscParams: ShortCircuitParams;
  setIscParams: React.Dispatch<React.SetStateAction<ShortCircuitParams>>;
  vdCalculations: VoltageDropCalculation[];
  isPremium: boolean;
  onRequestUpgrade: () => void;
  transformerPrimaryVoltage?: number;
  transformerPowerFactor?: number;
  transformerDemandFactor?: number;
  transformerLoadingFactor?: number;
  user?: any;
}

type Tab = "overview" | "coordination" | "loadflow" | "fault" | "reports";

const fx = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "-");
const STATUS_TEXT: Record<Status, string> = { pass: "Pass", warning: "Warning", fail: "Fail" };
const statusClass = (s: Status) =>
  s === "fail" ? "bg-red-500/15 border-red-500/30 text-red-400" : s === "warning" ? "bg-amber-500/15 border-amber-500/30 text-amber-400" : "bg-emerald-500/15 border-emerald-500/30 text-emerald-400";
const valueClass = (s: Status) => (s === "fail" ? "text-red-400" : s === "warning" ? "text-amber-400" : "text-emerald-400");
const pctStatus = (v: number, warn: number, fail: number): Status => (v > fail ? "fail" : v > warn ? "warning" : "pass");

function Badge({ s }: { s: Status }) {
  return <span className={`px-1.5 py-0.5 rounded border text-[9px] font-black uppercase tracking-wider ${statusClass(s)}`}>{STATUS_TEXT[s]}</span>;
}

function Metric({ label, value, sub, s }: { label: string; value: string; sub?: string; s?: Status }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3 min-w-0">
      <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block mb-1">{label}</span>
      <div className={`text-lg font-mono font-bold truncate ${s ? valueClass(s) : "text-white"}`}>{value}</div>
      {sub && <span className="text-[10px] font-mono text-slate-400 block truncate" title={sub}>{sub}</span>}
    </div>
  );
}

export default function PowerSystemAnalysis({
  panel, circuits, subPanels, iscParams, vdCalculations, isPremium, onRequestUpgrade,
  transformerPrimaryVoltage, transformerPowerFactor, transformerLoadingFactor, user,
}: PowerSystemAnalysisProps) {
  const [tab, setTab] = useState<Tab>("overview");
  const [basis, setBasis] = useState<"demand" | "connected">("demand");
  const [selectedBus, setSelectedBus] = useState("mdp");

  // ------------------------------------------------------------------ analysis
  const input = useMemo(() => ({
    panel, circuits, subPanels, vdCalculations,
    iscParams: { ...iscParams, primaryVoltage: transformerPrimaryVoltage || iscParams.primaryVoltage },
    powerFactor: transformerPowerFactor ?? 0.85,
    transformerLoadingLimit: transformerLoadingFactor ?? 0.8,
    basis,
  }), [panel, circuits, subPanels, vdCalculations, iscParams, transformerPrimaryVoltage, transformerPowerFactor, transformerLoadingFactor, basis]);
  const result = useMemo(() => analysePowerSystem(input), [input]);
  const bus: BusResult = result.byId[selectedBus] || result.byId.mdp;

  // ------------------------------------------------------------------ coordination
  const devices = useMemo(() => coordinationDevices(input, result), [input, result]);
  const [downId, setDownId] = useState<string | null>(null);
  const [upMult, setUpMult] = useState(10);
  const [downMult, setDownMult] = useState<number | null>(null);
  const [showCable, setShowCable] = useState(true);
  const [showTx, setShowTx] = useState(true);
  const [showMotor, setShowMotor] = useState(true);
  useEffect(() => {
    if (!downId || !devices.downstream.some((d) => d.id === downId)) setDownId(devices.downstream[0]?.id ?? null);
  }, [devices, downId]);
  const upDev: CoordinationDevice = { ...devices.upstream, instMultiplier: upMult };
  const baseDown = devices.downstream.find((d) => d.id === downId) || devices.downstream[0];
  const downDev: CoordinationDevice | undefined = baseDown ? { ...baseDown, instMultiplier: downMult ?? baseDown.instMultiplier } : undefined;
  const pairResult = downDev ? checkSelectivity(upDev, downDev, result) : null;
  const allPairs = useMemo(
    () => devices.downstream.map((d) => checkSelectivity({ ...devices.upstream, instMultiplier: upMult }, d.id === downDev?.id ? downDev : d, result)),
    [devices, upMult, downDev, result]
  );
  const motor = useMemo(() => largestMotor(panel, circuits), [panel, circuits]);
  const tcc = useMemo(
    () => (downDev ? buildTcc(result, upDev, downDev, { cable: showCable, transformer: showTx, motor: showMotor ? motor : null }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result, upDev.at, upDev.instMultiplier, downDev?.id, downDev?.instMultiplier, showCable, showTx, showMotor, motor]
  );

  // ------------------------------------------------------------------ report
  const [meta, setMeta] = useState<ReportMeta>(() => ({
    title: "Electrical Power System Analysis Report",
    project: panel.project || "Electrical Project",
    client: (panel as any).owner || "",
    projectNo: "",
    location: panel.location || "",
    preparedBy: (panel as any).engineer || user?.displayName || "",
    date: new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }),
  }));
  const tables = useMemo(() => buildReportTables(meta, result, allPairs), [meta, result, allPairs]);
  const fileBase = `${(meta.project || "Project").replace(/[^a-z0-9]+/gi, "_")}_Power_Analysis_${panel.designation || "MDP"}`;
  const [exporting, setExporting] = useState<string | null>(null);
  const runExport = async (kind: "pdf" | "docx" | "xlsx") => {
    if (!isPremium) {
      onRequestUpgrade();
      return;
    }
    setExporting(kind);
    try {
      const png = kind !== "xlsx" && tcc ? renderTccPng(tcc) : null;
      if (kind === "pdf") exportPowerAnalysisPdf(meta, tables, png, fileBase);
      else if (kind === "docx") await exportPowerAnalysisDocx(meta, tables, png, fileBase);
      else exportPowerAnalysisXlsx(meta, tables, fileBase);
    } finally {
      setExporting(null);
    }
  };

  const overall: Status = result.counts.fail ? "fail" : result.counts.warning ? "warning" : "pass";
  const src = result.source;
  const mdp = result.byId.mdp;

  // ------------------------------------------------------------------ TCC plot geometry
  const plot = useMemo(() => {
    if (!tcc) return null;
    const w = 640, h = 470, pl = 56, pr = 16, pt = 16, pb = 44;
    const x = (i: number) => pl + ((Math.log10(Math.max(i, tcc.iMin)) - Math.log10(tcc.iMin)) / (Math.log10(tcc.iMax) - Math.log10(tcc.iMin))) * (w - pl - pr);
    const y = (t: number) => h - pb - ((Math.log10(Math.min(Math.max(t, tcc.tMin), tcc.tMax)) - Math.log10(tcc.tMin)) / (Math.log10(tcc.tMax) - Math.log10(tcc.tMin))) * (h - pt - pb);
    const decadesI: number[] = [];
    for (let d = Math.log10(tcc.iMin); d <= Math.log10(tcc.iMax); d++) decadesI.push(Math.pow(10, d));
    return { w, h, pl, pr, pt, pb, x, y, decadesI, decadesT: [0.01, 0.1, 1, 10, 100, 1000] };
  }, [tcc]);

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-4 sm:p-6 text-slate-100 flex flex-col gap-5" id="power-system-analysis-suite">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20"><Zap className="w-5 h-5" /></div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Power System Analysis Suite</h1>
            <p className="text-slate-400 text-xs">
              {panel.designation || "MDP"} · {src.secondaryV} V {src.is3Phase ? "3-phase" : "1-phase"} · {result.buses.length} panel{result.buses.length === 1 ? "" : "s"} · Transformer {src.kva} kVA
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-1 rounded border text-[10px] font-black uppercase tracking-wider ${statusClass(overall)}`}>
            {overall === "pass" ? "All checks pass" : `${result.counts.fail} fail · ${result.counts.warning} warning`}
          </span>
          <select value={basis} onChange={(e) => setBasis(e.target.value as any)} className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px] font-bold text-emerald-300" title="Load used for loading and voltage drop">
            <option value="demand">Demand load</option>
            <option value="connected">Connected load</option>
          </select>
          <button onClick={() => runExport("pdf")} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold">
            <Download className="w-3.5 h-3.5" /> PDF{!isPremium && " (Premium)"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800/80 gap-1 overflow-x-auto">
        {([
          { id: "overview", label: "Overview", icon: Gauge },
          { id: "coordination", label: "Protection Coordination", icon: Activity },
          { id: "loadflow", label: "Load Flow & Voltage Drop", icon: Network },
          { id: "fault", label: "Short Circuit", icon: ShieldAlert },
          { id: "reports", label: "Report & Export", icon: FileText },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-black tracking-wider uppercase border-b-2 shrink-0 ${tab === t.id ? "border-emerald-500 text-emerald-400 bg-emerald-500/5" : "border-transparent text-slate-400 hover:text-slate-200"}`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {!isPremium && (
        <div className="w-full bg-slate-950/80 border border-amber-500/20 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-slate-300 text-xs">Preview mode: results use your project data. Upgrade to the Premium Plan to download the PDF, Word and Excel reports.</p>
          <button onClick={onRequestUpgrade} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase rounded">Unlock Suite</button>
        </div>
      )}

      {/* ================================================================ OVERVIEW */}
      {tab === "overview" && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Metric label="Transformer loading" value={`${fx(src.loadingPct, 1)}%`} sub={`${fx(mdp.kva)} kVA of ${src.kva} kVA (limit ${fx(src.loadingLimitPct, 0)}%)`} s={src.loadingStatus} />
            <Metric label="Main bus fault" value={`${fx(mdp.iSym)} kA`} sub={`peak ${fx(mdp.iPeak)} kA · X/R ${fx(mdp.xr, 1)}`} s={mdp.faultStatus} />
            <Metric label="Highest duty" value={`${fx(Math.max(...result.buses.map((b) => b.adjustedDutyPct)), 0)}%`} sub="of the lowest-rated device (X/R adjusted)" s={worstOf(result.buses.map((b) => b.faultStatus))} />
            <Metric label="Highest voltage drop" value={`${fx(Math.max(...result.buses.map((b) => b.vdCumulativePct)))}%`} sub="cumulative feeders (limit 5% incl. branch)" s={pctStatus(Math.max(...result.buses.map((b) => b.vdCumulativePct)), 3, 5)} />
          </div>

          <div className="bg-slate-950/50 border border-slate-800 rounded-lg overflow-x-auto">
            <table className="w-full text-[11px] min-w-[860px]">
              <thead>
                <tr className="text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                  <th className="text-left p-2.5">Panel</th>
                  <th className="p-2.5 text-right">Demand kVA</th>
                  <th className="p-2.5 text-right">Current A</th>
                  <th className="p-2.5 text-right">Breaker load</th>
                  <th className="p-2.5 text-right">VD cumulative</th>
                  <th className="p-2.5 text-right">Unbalance</th>
                  <th className="p-2.5 text-right">Fault kA</th>
                  <th className="p-2.5 text-right">Duty</th>
                  <th className="p-2.5 text-center">Load flow</th>
                  <th className="p-2.5 text-center">Short circuit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {result.buses.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-900/40 cursor-pointer" onClick={() => { setSelectedBus(b.id); setTab("loadflow"); }}>
                    <td className="p-2.5 font-bold text-white" style={{ paddingLeft: 10 + (b.level - 1) * 16 }}>{b.name}</td>
                    <td className="p-2.5 text-right font-mono">{fx(b.demandVA / 1000)}</td>
                    <td className="p-2.5 text-right font-mono">{fx(b.current, 1)}</td>
                    <td className={`p-2.5 text-right font-mono ${valueClass(pctStatus(b.breakerLoadingPct, 80, 100))}`}>{b.feeder.breakerAT ? `${fx(b.breakerLoadingPct, 0)}%` : "-"}</td>
                    <td className={`p-2.5 text-right font-mono ${valueClass(pctStatus(b.vdCumulativePct, 3, 5))}`}>{fx(b.vdCumulativePct)}%</td>
                    <td className={`p-2.5 text-right font-mono ${valueClass(b.is3Phase ? pctStatus(b.unbalancePct, 10, 20) : "pass")}`}>{b.is3Phase ? `${fx(b.unbalancePct, 1)}%` : "1Φ"}</td>
                    <td className="p-2.5 text-right font-mono text-yellow-300">{fx(b.iSym)}</td>
                    <td className={`p-2.5 text-right font-mono ${valueClass(b.faultStatus)}`}>{fx(b.adjustedDutyPct, 0)}%</td>
                    <td className="p-2.5 text-center"><Badge s={b.loadStatus} /></td>
                    <td className="p-2.5 text-center"><Badge s={worstOf([b.faultStatus, b.withstand.status])} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-white mb-3 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-400" /> Findings and recommendations ({result.findings.length})</h3>
            {result.findings.length === 0 ? (
              <p className="text-xs text-emerald-400 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> All checked values are within limits.</p>
            ) : (
              <ul className="space-y-2">
                {result.findings.map((f, i) => (
                  <li key={i} className="flex gap-2.5 text-xs">
                    {f.status === "fail" ? <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
                    <div>
                      <span className="font-bold text-white">{f.location}: {f.title}.</span> <span className="text-slate-300">{f.detail}</span>
                      {f.action && <span className="block text-slate-400 mt-0.5">Action: {f.action}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Assumptions items={result.assumptions} />
        </div>
      )}

      {/* ================================================================ COORDINATION */}
      {tab === "coordination" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-4 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-1.5"><Settings className="w-4 h-4 text-emerald-400" /> Devices</h2>
              <div className="border-b border-slate-800 pb-3">
                <span className="text-[10px] font-black uppercase text-emerald-400 block mb-1">Upstream: {upDev.label}</span>
                <p className="text-[11px] text-slate-400 mb-2">{upDev.at} AT{upDev.af ? ` / ${upDev.af} AF` : ""} from the Load Schedule</p>
                <label className="text-xs text-slate-300 block mb-1">Instantaneous pickup: <strong className="text-white">{upMult}×</strong> ({(upDev.at * upMult).toFixed(0)} A)</label>
                <input type="range" min={5} max={15} step={1} value={upMult} onChange={(e) => setUpMult(Number(e.target.value))} className="w-full accent-emerald-500" />
              </div>
              {downDev ? (
                <div className="border-b border-slate-800 pb-3">
                  <span className="text-[10px] font-black uppercase text-indigo-400 block mb-1">Downstream device</span>
                  <select value={downDev.id} onChange={(e) => { setDownId(e.target.value); setDownMult(null); }} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white mb-2">
                    {devices.downstream.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                  <label className="text-xs text-slate-300 block mb-1">Instantaneous pickup: <strong className="text-white">{downDev.instMultiplier}×</strong> ({(downDev.at * downDev.instMultiplier).toFixed(0)} A)</label>
                  <input type="range" min={3} max={15} step={1} value={downDev.instMultiplier} onChange={(e) => setDownMult(Number(e.target.value))} className="w-full accent-indigo-500" />
                </div>
              ) : (
                <p className="text-xs text-slate-400">The main panel has no outgoing breakers to coordinate with.</p>
              )}
              <div className="space-y-1.5">
                <span className="text-[10px] font-black uppercase text-slate-400 block">Overlays</span>
                {[
                  [showCable, setShowCable, `Cable damage (${(downDev?.loadBusId ? result.byId[downDev.loadBusId]?.feeder.label : mdp.feeder.label) || "feeder"})`],
                  [showTx, setShowTx, `Transformer damage, ANSI C57.109 (${src.kva} kVA)`],
                  [showMotor, setShowMotor, motor ? `Motor starting: ${motor.name} (${fx(motor.fla, 1)} A FLA)` : "Motor starting (no motor on the MDP)"],
                ].map(([v, set, label], i) => (
                  <label key={i} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={v as boolean} onChange={(e) => (set as any)(e.target.checked)} /> {label as string}
                  </label>
                ))}
              </div>
            </div>
            {pairResult && (
              <div className={`p-4 rounded-lg border flex gap-3 ${statusClass(pairResult.status)}`}>
                {pairResult.status === "pass" ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-white">{pairResult.verdict}</h4>
                  <p className="text-slate-300 text-[11px] mt-1 leading-relaxed">{pairResult.detail}</p>
                </div>
              </div>
            )}
          </div>
          <div className="lg:col-span-8 flex flex-col gap-4">
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <span className="text-[10px] font-black tracking-widest uppercase text-slate-400 block mb-2 text-center">Time-current coordination curves (log-log, current at {src.secondaryV} V)</span>
              {tcc && plot ? (
                <svg viewBox={`0 0 ${plot.w} ${plot.h}`} className="w-full h-auto">
                  {plot.decadesI.map((d) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => d * k <= tcc.iMax && (
                    <line key={`i${d}-${k}`} x1={plot.x(d * k)} x2={plot.x(d * k)} y1={plot.pt} y2={plot.h - plot.pb} stroke={k === 1 ? "#334155" : "#1e293b"} strokeWidth={k === 1 ? 1 : 0.5} />
                  )))}
                  {plot.decadesI.map((d) => <text key={`il${d}`} x={plot.x(d)} y={plot.h - plot.pb + 14} textAnchor="middle" className="fill-slate-500" fontSize="9">{d >= 1000 ? `${d / 1000}k` : d}A</text>)}
                  {plot.decadesT.map((t) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => t * k <= tcc.tMax && (
                    <line key={`t${t}-${k}`} x1={plot.pl} x2={plot.w - plot.pr} y1={plot.y(t * k)} y2={plot.y(t * k)} stroke={k === 1 ? "#334155" : "#1e293b"} strokeWidth={k === 1 ? 1 : 0.5} />
                  )))}
                  {plot.decadesT.map((t) => <text key={`tl${t}`} x={plot.pl - 6} y={plot.y(t) + 3} textAnchor="end" className="fill-slate-500" fontSize="9">{t}s</text>)}
                  {tcc.series.map((s, i) => (
                    <polyline key={i} fill="none" stroke={s.color} strokeWidth={s.width || 2} strokeDasharray={s.dash?.join(",")} points={s.points.map(([a, t]) => `${plot.x(Math.min(a, tcc.iMax)).toFixed(1)},${plot.y(t).toFixed(1)}`).join(" ")} />
                  ))}
                  {tcc.markers.map((m, i) => m.amps <= tcc.iMax && (
                    <line key={`m${i}`} x1={plot.x(m.amps)} x2={plot.x(m.amps)} y1={plot.pt} y2={plot.h - plot.pb} stroke={m.color} strokeDasharray="5,4" strokeWidth={1.4} />
                  ))}
                </svg>
              ) : (
                <p className="text-xs text-slate-400 p-6 text-center">No downstream device.</p>
              )}
              {tcc && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] text-slate-300 justify-center">
                  {[...tcc.series.map((s) => ({ label: s.label, color: s.color, dash: !!s.dash })), ...tcc.markers.map((m) => ({ label: m.label, color: m.color, dash: true }))].map((it, i) => (
                    <span key={i} className="flex items-center gap-1.5"><span className="inline-block w-4 border-t-2" style={{ borderColor: it.color, borderStyle: it.dash ? "dashed" : "solid" }} />{it.label}</span>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-slate-500 mt-2 text-center">Representative thermal-magnetic characteristics; the manufacturer's curves and selectivity tables govern.</p>
            </div>
            <div className="bg-slate-950/50 border border-slate-800 rounded-lg overflow-x-auto">
              <table className="w-full text-[11px] min-w-[640px]">
                <thead><tr className="text-slate-400 uppercase text-[10px] border-b border-slate-800">
                  <th className="text-left p-2">Downstream device</th><th className="p-2 text-right">Ratio</th><th className="p-2 text-right">Selective to</th><th className="p-2 text-right">Fault at device</th><th className="p-2 text-left">Assessment</th><th className="p-2 text-center">Status</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-800/60">
                  {allPairs.map((p) => (
                    <tr key={p.downstream.id} className={`cursor-pointer ${p.downstream.id === downDev?.id ? "bg-slate-800/40" : "hover:bg-slate-900/40"}`} onClick={() => { setDownId(p.downstream.id); setDownMult(null); }}>
                      <td className="p-2 text-white font-bold">{p.downstream.label}</td>
                      <td className="p-2 text-right font-mono">{fx(p.overloadRatio)}</td>
                      <td className="p-2 text-right font-mono">{fx(p.selectiveUpToKA)} kA</td>
                      <td className="p-2 text-right font-mono">{fx(p.faultAtDeviceKA)} kA</td>
                      <td className="p-2 text-slate-300">{p.verdict}</td>
                      <td className="p-2 text-center"><Badge s={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ LOAD FLOW */}
      {tab === "loadflow" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-4 bg-slate-950/50 border border-slate-800 rounded-lg p-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white mb-3">Panels</h3>
            <div className="space-y-1.5">
              <div className="w-full p-2.5 rounded-lg border border-slate-800/80 bg-slate-900/40 text-xs text-slate-300 flex justify-between">
                <span className="font-bold">Transformer {src.kva} kVA</span>
                <span className={`font-mono ${valueClass(src.loadingStatus)}`}>{fx(src.loadingPct, 1)}%</span>
              </div>
              {result.buses.map((b) => (
                <button key={b.id} onClick={() => setSelectedBus(b.id)}
                  className={`w-full text-left p-2.5 rounded-lg border flex items-center justify-between text-xs ${b.id === bus.id ? "bg-slate-800 border-emerald-500 text-white" : "bg-slate-900/40 border-slate-800/80 text-slate-300 hover:bg-slate-800/50"}`}
                  style={{ paddingLeft: 10 + b.level * 12 }}>
                  <span className="flex items-center gap-2 min-w-0"><span className={`w-1.5 h-1.5 rounded-full shrink-0 ${b.loadStatus === "fail" ? "bg-red-500" : b.loadStatus === "warning" ? "bg-amber-500" : "bg-emerald-500"}`} /><span className="font-bold truncate">{b.name}</span></span>
                  <span className="font-mono text-[10px] text-slate-400 shrink-0">{fx(b.busVoltage, 1)} V · {fx(b.current, 1)} A</span>
                </button>
              ))}
            </div>
          </div>
          <div className="lg:col-span-8 bg-slate-950/60 border border-slate-800 rounded-lg p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white uppercase tracking-wider">{bus.name}</h3>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest">{bus.nominalV} V {bus.is3Phase ? "3-phase" : "1-phase"} · {basis === "demand" ? "demand" : "connected"} load · PF {result.powerFactor.toFixed(2)}</p>
              </div>
              <Badge s={bus.loadStatus} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric label="Bus voltage" value={`${fx(bus.busVoltage, 1)} V`} sub={`cumulative drop ${fx(bus.vdCumulativePct)}%`} s={pctStatus(bus.vdCumulativePct, 3, 5)} />
              <Metric label="Current" value={`${fx(bus.current, 1)} A`} sub={`Load Schedule design ${fx(bus.demandCurrent, 1)} A`} />
              <Metric label="Power" value={`${fx(bus.kva)} kVA`} sub={`${fx(bus.kw)} kW · ${fx(bus.kvar)} kVAR`} />
              <Metric label="Connected" value={`${fx(bus.connectedVA / 1000)} kVA`} sub={`demand ${fx(bus.demandVA / 1000)} kVA`} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3 text-xs space-y-1.5">
                <span className="text-[10px] font-black uppercase text-slate-400 block">Feeder</span>
                <Row k="Conductor" v={bus.feeder.label} />
                <Row k="Length" v={`${bus.feeder.lengthM} m${bus.feeder.lengthAssumed ? " (assumed: set it in Voltage Drop)" : ""}`} warn={bus.feeder.lengthAssumed} />
                <Row k="Ampacity / loading" v={`${fx(bus.feeder.ampacityA, 0)} A · ${fx(bus.feederLoadingPct, 1)}%`} s={pctStatus(bus.feederLoadingPct, 80, 100)} />
                <Row k="Breaker / loading" v={bus.feeder.breakerAT ? `${bus.feeder.breakerAT} AT · ${fx(bus.breakerLoadingPct, 1)}%` : "-"} s={pctStatus(bus.breakerLoadingPct, 80, 100)} />
                <Row k="Voltage drop" v={`${fx(bus.vdFeederV)} V · ${fx(bus.vdFeederPct)}% (limit 3%)`} s={pctStatus(bus.vdFeederPct, 2.5, 3)} />
                <p className="text-[10px] text-slate-500 pt-1">{bus.feeder.source}</p>
              </div>
              <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3 text-xs">
                <span className="text-[10px] font-black uppercase text-slate-400 block mb-2">Phase currents (connected, phasor sum)</span>
                {bus.is3Phase ? (
                  <div className="space-y-2">
                    {([["R", "bg-red-500"], ["Y", "bg-amber-400"], ["B", "bg-blue-400"]] as const).map(([p, c]) => {
                      const v = bus.phaseCurrents[p];
                      const max = Math.max(bus.phaseCurrents.R, bus.phaseCurrents.Y, bus.phaseCurrents.B, 1);
                      return (
                        <div key={p}>
                          <div className="flex justify-between text-[11px] mb-0.5"><span className="font-bold">Phase {p}</span><span className="font-mono">{fx(v, 1)} A</span></div>
                          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className={`h-full ${c}`} style={{ width: `${(v / max) * 100}%` }} /></div>
                        </div>
                      );
                    })}
                    <Row k="Neutral" v={`${fx(bus.neutralCurrent, 1)} A`} />
                    <Row k="Unbalance" v={`${fx(bus.unbalancePct, 1)}% (target ≤ 10%)`} s={pctStatus(bus.unbalancePct, 10, 20)} />
                  </div>
                ) : (
                  <p className="text-slate-300">Single-phase panel: {fx(bus.phaseCurrents.R, 1)} A line current.</p>
                )}
              </div>
            </div>
            {bus.loadNotes.length > 0 && <p className="text-[11px] text-amber-300 flex gap-1.5"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />{bus.loadNotes.join(" ")}</p>}
            <p className="text-[10px] text-slate-500">VD = k·I·L·(R cosφ + X sinφ) / sets with R, X from PEC 2017 Ch. 9 Table 9; limits per PEC 2.15.2 FPN No. 2 (feeder 3%, feeder + branch 5%). Breaker continuous loading ≤ 80% (PEC 2.10.2).</p>
          </div>
        </div>
      )}

      {/* ================================================================ SHORT CIRCUIT */}
      {tab === "fault" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Metric label="Utility" value={`${src.utilityMVA} MVA`} sub={`X/R ${src.utilityXr} · ${src.primaryV} V`} />
            <Metric label="Transformer" value={`${src.kva} kVA`} sub={`Z ${src.zPct}% · X/R ${fx(src.txXr, 1)}`} />
            <Metric label="Secondary terminals" value={`${fx(src.terminalFaultKA)} kA`} sub={`X/R ${fx(src.terminalXr, 1)}`} />
            <Metric label="Rated secondary" value={`${fx(src.ratedSecondaryA, 0)} A`} sub={`primary ${fx(src.ratedPrimaryA, 1)} A`} />
          </div>
          <div className="bg-slate-950/60 border border-slate-800 rounded-lg overflow-x-auto">
            <table className="w-full text-[11px] min-w-[980px]">
              <thead><tr className="text-slate-400 uppercase text-[10px] border-b border-slate-800">
                <th className="text-left p-2">Panel</th><th className="p-2 text-right">3Φ kA</th><th className="p-2 text-right">L-L kA</th><th className="p-2 text-right">L-G kA</th>
                <th className="p-2 text-right">Motor kA</th><th className="p-2 text-right">Available kA</th><th className="p-2 text-right">X/R</th><th className="p-2 text-right">Peak kA</th>
                <th className="p-2 text-right">Asym kA</th><th className="p-2 text-left">Lowest device</th><th className="p-2 text-right">Duty</th><th className="p-2 text-center">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-800/60">
                {result.buses.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-900/40">
                    <td className="p-2 font-bold text-white" style={{ paddingLeft: 8 + (b.level - 1) * 14 }}>{b.name}</td>
                    <td className="p-2 text-right font-mono">{b.is3Phase ? fx(b.i3ph) : "-"}</td>
                    <td className="p-2 text-right font-mono">{fx(b.iLL)}</td>
                    <td className="p-2 text-right font-mono">{fx(b.iLG)}</td>
                    <td className="p-2 text-right font-mono">{fx(b.motorKA)}</td>
                    <td className="p-2 text-right font-mono font-bold text-yellow-300">{fx(b.iSym)}</td>
                    <td className="p-2 text-right font-mono">{fx(b.xr, 1)}</td>
                    <td className="p-2 text-right font-mono">{fx(b.iPeak)}</td>
                    <td className="p-2 text-right font-mono">{fx(b.iAsym)}</td>
                    <td className="p-2 text-slate-300">{b.lowestDevice}</td>
                    <td className={`p-2 text-right font-mono font-bold ${valueClass(b.faultStatus)}`} title={`Symmetrical ${fx(b.dutyPct, 0)}% × X/R factor ${fx(b.xrMultiplier)}`}>{fx(b.adjustedDutyPct, 0)}%</td>
                    <td className="p-2 text-center"><Badge s={b.faultStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-slate-950/60 border border-slate-800 rounded-lg overflow-x-auto">
            <span className="text-[10px] font-black uppercase text-slate-400 block px-3 pt-3">Feeder conductor short-time withstand (fault at the supply end, clearing {(CLEARING_TIME_S * 1000).toFixed(0)} ms)</span>
            <table className="w-full text-[11px] min-w-[640px]">
              <thead><tr className="text-slate-400 uppercase text-[10px] border-b border-slate-800">
                <th className="text-left p-2">Panel fed</th><th className="text-left p-2">Feeder</th><th className="p-2 text-right">k</th><th className="p-2 text-right">S mm²</th><th className="p-2 text-right">Fault kA</th><th className="p-2 text-right">Withstand</th><th className="p-2 text-center">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-800/60">
                {result.buses.map((b) => (
                  <tr key={b.id}>
                    <td className="p-2 font-bold text-white">{b.name}</td>
                    <td className="p-2 text-slate-300">{b.feeder.label}</td>
                    <td className="p-2 text-right font-mono">{b.withstand.k}</td>
                    <td className="p-2 text-right font-mono">{b.withstand.areaMm2}</td>
                    <td className="p-2 text-right font-mono">{fx(b.withstand.faultKA)}</td>
                    <td className="p-2 text-right font-mono">{b.withstand.maxTimeS > 100 ? "> 100 s" : b.withstand.maxTimeS >= 1 ? `${fx(b.withstand.maxTimeS, 1)} s` : `${fx(b.withstand.maxTimeS * 1000, 0)} ms`}</td>
                    <td className="p-2 text-center"><Badge s={b.withstand.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-500">
            Complex impedances from the utility to each panel (feeder R at 20 °C). L-G uses Z0 = Z_T (Dyn) plus phase and return conductor. Peak per IEC 60909, κ = 1.02 + 0.98·e^(−3R/X); asymmetrical = half-cycle RMS. Duty is the available current (with 4 × motor FLA) against the lowest-rated device in the panel, multiplied where X/R exceeds the device test X/R (UL 489 / IEC 60947-2).
          </p>
        </div>
      )}

      {/* ================================================================ REPORTS */}
      {tab === "reports" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-4 bg-slate-950/50 border border-slate-800 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Report details</h3>
            {([
              ["title", "Report title"], ["project", "Project"], ["client", "Client"], ["projectNo", "Project No."],
              ["location", "Location"], ["preparedBy", "Prepared by"], ["date", "Date"],
            ] as const).map(([k, label]) => (
              <label key={k} className="block">
                <span className="text-[10px] font-black uppercase text-slate-400">{label}</span>
                <input value={meta[k]} onChange={(e) => setMeta((m) => ({ ...m, [k]: e.target.value }))} className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white mt-0.5" />
              </label>
            ))}
            <div className="grid grid-cols-1 gap-2 pt-2">
              <button disabled={!!exporting} onClick={() => runExport("pdf")} className="flex items-center justify-center gap-2 px-3 py-2 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold disabled:opacity-50"><FileType2 className="w-4 h-4" /> {exporting === "pdf" ? "Preparing…" : "Download PDF"}</button>
              <button disabled={!!exporting} onClick={() => runExport("docx")} className="flex items-center justify-center gap-2 px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold disabled:opacity-50"><FileText className="w-4 h-4" /> {exporting === "docx" ? "Preparing…" : "Download Word (.docx)"}</button>
              <button disabled={!!exporting} onClick={() => runExport("xlsx")} className="flex items-center justify-center gap-2 px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50"><FileSpreadsheet className="w-4 h-4" /> {exporting === "xlsx" ? "Preparing…" : "Download Excel (.xlsx)"}</button>
            </div>
            <p className="text-[10px] text-slate-500">All three files contain the same sections and values shown here. The coordination chart uses the device pair selected in Protection Coordination.</p>
          </div>
          <div className="lg:col-span-8 bg-white text-slate-900 rounded-lg p-5 max-h-[78vh] overflow-y-auto space-y-5">
            <div className="border-b-2 border-slate-900 pb-2">
              <h2 className="text-lg font-black">{meta.title}</h2>
              <p className="text-xs text-slate-600">{meta.project}{meta.projectNo ? ` · ${meta.projectNo}` : ""} · {meta.date}</p>
            </div>
            {tables.map((t) => (
              <section key={t.key}>
                <h3 className="text-sm font-black text-slate-900 mb-1">{t.title}</h3>
                {t.note && <p className="text-[10px] text-slate-500 mb-1.5">{t.note}</p>}
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px] border border-slate-300">
                    {!t.kv && <thead><tr className="bg-slate-900 text-white">{t.head.map((h) => <th key={h} className="p-1.5 text-left font-bold">{h}</th>)}</tr></thead>}
                    <tbody>
                      {t.rows.map((r, i) => (
                        <tr key={i} className="border-t border-slate-200 align-top">
                          {r.map((v, ci) => {
                            const st = t.statusCol === ci ? String(v).split(":")[0] : "";
                            return (
                              <td key={ci} className={`p-1.5 ${t.kv && ci === 0 ? "font-bold w-56" : ""} ${typeof v === "number" ? "text-right font-mono" : ""} ${st === "FAIL" ? "text-red-600 font-bold" : st === "WARNING" ? "text-amber-600 font-bold" : st === "PASS" ? "text-green-700 font-bold" : ""}`}>{String(v)}</td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function worstOf(list: Status[]): Status {
  return list.includes("fail") ? "fail" : list.includes("warning") ? "warning" : "pass";
}

function Row({ k, v, s, warn }: { k: string; v: string; s?: Status; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-400">{k}</span>
      <span className={`font-mono text-right ${s ? valueClass(s) : warn ? "text-amber-300" : "text-slate-100"}`}>{v}</span>
    </div>
  );
}

function Assumptions({ items }: { items: string[] }) {
  return (
    <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-4">
      <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> Basis and assumptions</h3>
      <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-400">
        {items.map((a, i) => <li key={i}>{a}</li>)}
        <li>Standards: PEC 2017; IEEE Std 141, 242, 399; IEC 60909-0; IEC 60947-2 / UL 489; IEEE C57.109; NEMA MG 1.</li>
      </ul>
    </div>
  );
}
