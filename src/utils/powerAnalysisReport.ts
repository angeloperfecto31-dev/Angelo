/**
 * Power Analysis Suite report: one set of tables (shared by the PDF, Word and Excel exports), the
 * time-current coordination chart data and its image.
 */
import { jsPDF } from "jspdf";
import "./pdfSafeText"; // printable PDF text (², Ω, ≤ ...)
import autoTable from "jspdf-autotable";
import * as docx from "docx";
import * as XLSX from "xlsx-js-style";
import { saveAs } from "file-saver";
import {
  CLEARING_TIME_S, type CoordinationDevice, type PowerAnalysisResult, type SelectivityResult, type Status,
  breakerTripTime, cableDamagePoints, transformerDamagePoints,
} from "./powerAnalysis";

// ------------------------------------------------------------------------------------------ TCC chart data
export interface TccSeries { label: string; color: string; dash?: number[]; width?: number; points: Array<[number, number]> }
export interface TccMarker { label: string; amps: number; color: string }
export interface TccSpec { series: TccSeries[]; markers: TccMarker[]; iMin: number; iMax: number; tMin: number; tMax: number }

function breakerCurve(d: CoordinationDevice, iMax: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const inst = d.at * d.instMultiplier;
  for (let i = d.at * 1.06; i < inst; i *= 1.08) {
    const t = breakerTripTime(d.at, d.instMultiplier, i);
    if (t !== null) pts.push([i, t]);
  }
  const tBefore = breakerTripTime(d.at, d.instMultiplier, inst * 0.999) ?? 1;
  pts.push([inst, tBefore], [inst, 0.02], [iMax, 0.02]);
  return pts;
}

export function buildTcc(
  result: PowerAnalysisResult,
  up: CoordinationDevice,
  down: CoordinationDevice,
  opts: { cable?: boolean; transformer?: boolean; motor?: { name: string; fla: number; lra: number } | null } = {}
): TccSpec {
  const mdp = result.byId.mdp;
  const loadBus = down.loadBusId ? result.byId[down.loadBusId] : undefined;
  const maxFaultA = Math.max(result.source.terminalFaultKA, mdp?.iSym || 0) * 1000;
  const iMax = Math.pow(10, Math.ceil(Math.log10(Math.max(maxFaultA * 1.2, up.at * up.instMultiplier * 2, 1000))));
  const series: TccSeries[] = [
    { label: `Upstream ${up.label}`, color: "#10b981", width: 2.6, points: breakerCurve(up, iMax) },
    { label: `Downstream ${down.label}`, color: "#6366f1", width: 2.2, points: breakerCurve(down, iMax) },
  ];
  if (opts.cable && loadBus) {
    series.push({ label: `Cable damage ${loadBus.feeder.label}`, color: "#ef4444", dash: [5, 4], width: 1.6, points: cableDamagePoints(loadBus.withstand.k, loadBus.withstand.areaMm2) });
  } else if (opts.cable && mdp) {
    series.push({ label: `Cable damage ${mdp.feeder.label}`, color: "#ef4444", dash: [5, 4], width: 1.6, points: cableDamagePoints(mdp.withstand.k, mdp.withstand.areaMm2) });
  }
  if (opts.transformer) {
    series.push({ label: `Transformer damage (C57.109) ${result.source.kva} kVA`, color: "#3b82f6", dash: [2, 3], width: 1.8, points: transformerDamagePoints(result.source.ratedSecondaryA) });
  }
  if (opts.motor) {
    const m = opts.motor;
    series.push({ label: `Motor start ${m.name}`, color: "#f59e0b", width: 1.6, points: [[m.fla, 1000], [m.fla, 5], [m.lra, 5], [m.lra, 0.01]] });
  }
  // Damage curves beyond the chart are left out (not clamped onto its edge)
  series.slice(2).forEach((s) => (s.points = s.points.filter(([i]) => i <= iMax)));
  const markers: TccMarker[] = [];
  if (mdp) markers.push({ label: `Fault at ${mdp.name} ${mdp.iSym.toFixed(1)} kA`, amps: mdp.iSym * 1000, color: "#eab308" });
  if (loadBus && loadBus.id !== "mdp") markers.push({ label: `Fault at ${loadBus.name} ${loadBus.iSym.toFixed(1)} kA`, amps: loadBus.iSym * 1000, color: "#f97316" });
  return { series, markers, iMin: 1, iMax, tMin: 0.01, tMax: 1000 };
}

/** The chart as a PNG data URL (for the PDF and Word reports) */
export function renderTccPng(spec: TccSpec, w = 1400, h = 950): string | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return null;
  const pad = { l: 90, r: 30, t: 30, b: 70 };
  const lx = (i: number) => pad.l + ((Math.log10(i) - Math.log10(spec.iMin)) / (Math.log10(spec.iMax) - Math.log10(spec.iMin))) * (w - pad.l - pad.r);
  const ly = (t: number) => h - pad.b - ((Math.log10(t) - Math.log10(spec.tMin)) / (Math.log10(spec.tMax) - Math.log10(spec.tMin))) * (h - pad.t - pad.b);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, w, h);
  g.font = "20px Arial";
  g.textAlign = "center";
  for (let d = Math.log10(spec.iMin); d <= Math.log10(spec.iMax); d++) {
    for (let k = 1; k < 10; k++) {
      const i = Math.pow(10, d) * k;
      if (i > spec.iMax) break;
      g.strokeStyle = k === 1 ? "#94a3b8" : "#e2e8f0";
      g.lineWidth = k === 1 ? 1.4 : 0.8;
      g.beginPath(); g.moveTo(lx(i), pad.t); g.lineTo(lx(i), h - pad.b); g.stroke();
      if (k === 1) { g.fillStyle = "#334155"; g.fillText(i >= 1000 ? `${i / 1000}k` : `${i}`, lx(i), h - pad.b + 28); }
    }
  }
  g.textAlign = "right";
  for (let d = Math.log10(spec.tMin); d <= Math.log10(spec.tMax); d++) {
    for (let k = 1; k < 10; k++) {
      const t = Math.pow(10, d) * k;
      if (t > spec.tMax) break;
      g.strokeStyle = k === 1 ? "#94a3b8" : "#e2e8f0";
      g.lineWidth = k === 1 ? 1.4 : 0.8;
      g.beginPath(); g.moveTo(pad.l, ly(t)); g.lineTo(w - pad.r, ly(t)); g.stroke();
      if (k === 1) { g.fillStyle = "#334155"; g.fillText(`${t}`, pad.l - 10, ly(t) + 7); }
    }
  }
  g.textAlign = "center";
  g.fillStyle = "#0f172a";
  g.font = "bold 22px Arial";
  g.fillText("Current (A) at the secondary voltage", pad.l + (w - pad.l - pad.r) / 2, h - 18);
  g.save();
  g.translate(26, pad.t + (h - pad.t - pad.b) / 2);
  g.rotate(-Math.PI / 2);
  g.fillText("Time (s)", 0, 0);
  g.restore();
  const clipX = (i: number) => Math.min(Math.max(i, spec.iMin), spec.iMax);
  const clipT = (t: number) => Math.min(Math.max(t, spec.tMin), spec.tMax);
  for (const s of spec.series) {
    g.strokeStyle = s.color;
    g.lineWidth = (s.width || 2) * 1.5;
    g.setLineDash(s.dash || []);
    g.beginPath();
    s.points.forEach(([i, t], k) => (k ? g.lineTo(lx(clipX(i)), ly(clipT(t))) : g.moveTo(lx(clipX(i)), ly(clipT(t)))));
    g.stroke();
  }
  g.setLineDash([8, 6]);
  for (const m of spec.markers) {
    if (m.amps < spec.iMin || m.amps > spec.iMax) continue;
    g.strokeStyle = m.color;
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(lx(m.amps), pad.t); g.lineTo(lx(m.amps), h - pad.b); g.stroke();
  }
  g.setLineDash([]);
  // legend
  const items = [...spec.series.map((s) => ({ label: s.label, color: s.color, dash: s.dash })), ...spec.markers.map((m) => ({ label: m.label, color: m.color, dash: [8, 6] }))];
  g.font = "18px Arial";
  g.textAlign = "left";
  const lw = Math.min(620, Math.max(...items.map((it) => g.measureText(it.label).width)) + 70);
  const lh = items.length * 28 + 16;
  g.fillStyle = "rgba(255,255,255,0.94)";
  g.fillRect(w - pad.r - lw - 10, pad.t + 10, lw, lh);
  g.strokeStyle = "#cbd5e1";
  g.lineWidth = 1;
  g.strokeRect(w - pad.r - lw - 10, pad.t + 10, lw, lh);
  items.forEach((it, k) => {
    const y = pad.t + 34 + k * 28;
    g.strokeStyle = it.color;
    g.lineWidth = 4;
    g.setLineDash(it.dash || []);
    g.beginPath(); g.moveTo(w - pad.r - lw + 2, y - 6); g.lineTo(w - pad.r - lw + 42, y - 6); g.stroke();
    g.setLineDash([]);
    g.fillStyle = "#0f172a";
    g.fillText(it.label.length > 60 ? `${it.label.slice(0, 58)}…` : it.label, w - pad.r - lw + 52, y);
  });
  return c.toDataURL("image/png");
}

// ------------------------------------------------------------------------------------------ report tables
export interface ReportMeta {
  title: string;
  project: string;
  client: string;
  projectNo: string;
  location: string;
  preparedBy: string;
  date: string;
}

export type Cell = string | number;
export interface ReportTable {
  key: string;
  title: string;
  note?: string;
  head: string[];
  rows: Cell[][];
  /** Column index holding a status word (coloured in the exports) */
  statusCol?: number;
  /** Key / value table (2 columns) */
  kv?: boolean;
}

const ST: Record<Status, string> = { pass: "PASS", warning: "WARNING", fail: "FAIL" };
const n = (v: number, d = 2) => (Number.isFinite(v) ? Number(v.toFixed(d)) : 0);

export function buildReportTables(meta: ReportMeta, r: PowerAnalysisResult, sel: SelectivityResult[]): ReportTable[] {
  const s = r.source;
  const mdp = r.byId.mdp;
  const overall: Status = r.counts.fail ? "fail" : r.counts.warning ? "warning" : "pass";
  const maxVd = Math.max(...r.buses.map((b) => b.vdCumulativePct));
  const maxDuty = Math.max(...r.buses.map((b) => b.adjustedDutyPct));
  const t: ReportTable[] = [];
  t.push({
    key: "project", title: "1. Project Information", kv: true, head: ["Item", "Value"],
    rows: [
      ["Report", meta.title], ["Project", meta.project], ["Client", meta.client], ["Project No.", meta.projectNo],
      ["Location", meta.location], ["Prepared by", meta.preparedBy], ["Date", meta.date],
      ["System", `${s.secondaryV} V ${s.is3Phase ? "3-phase" : "1-phase"}, 60 Hz; ${r.buses.length} panel${r.buses.length === 1 ? "" : "s"}`],
    ],
  });
  t.push({
    key: "summary", title: "2. Executive Summary", kv: true, head: ["Item", "Result"], statusCol: 1,
    rows: [
      ["Overall result", `${ST[overall]}: ${r.counts.fail} fail, ${r.counts.warning} warning finding${r.counts.warning === 1 ? "" : "s"}`],
      ["Transformer loading", `${n(s.loadingPct, 1)}% of ${s.kva} kVA: ${n(s.demandKva)} kVA max demand (limit ${n(s.loadingLimitPct, 0)}%)`],
      ["Main bus fault (with motors)", `${n(mdp.iSym)} kA sym, ${n(mdp.iPeak)} kA peak, X/R ${n(mdp.xr, 1)}`],
      ["Highest interrupting duty", `${n(maxDuty, 0)}% of the lowest-rated device`],
      ["Highest cumulative voltage drop", `${n(maxVd)}% (limit 5% incl. branch circuits)`],
      ["Protection selectivity", sel.length ? `${sel.filter((x) => x.status === "pass").length} of ${sel.length} device pairs fully selective` : "No downstream devices"],
    ],
  });
  t.push({
    key: "source", title: "3. Utility Source and Transformer", kv: true, head: ["Parameter", "Value"],
    rows: [
      ["Utility short-circuit capacity", `${s.utilityMVA} MVA (X/R ${s.utilityXr})`],
      ["Primary / secondary voltage", `${s.primaryV} V / ${s.secondaryV} V`],
      ["Transformer rating", `${s.kva} kVA, Z = ${s.zPct}%, X/R ${n(s.txXr, 1)}`],
      ["Rated current primary / secondary", `${n(s.ratedPrimaryA, 1)} A / ${n(s.ratedSecondaryA, 1)} A`],
      ["Utility impedance (secondary)", `${n(s.zUtility.r * 1000, 3)} + j${n(s.zUtility.x * 1000, 3)} mΩ`],
      ["Transformer impedance (secondary)", `${n(s.zTransformer.r * 1000, 3)} + j${n(s.zTransformer.x * 1000, 3)} mΩ`],
      ["Bolted fault at secondary terminals", `${n(s.terminalFaultKA)} kA (X/R ${n(s.terminalXr, 1)})`],
      ["Connected load / demand factor", `${n(s.connectedKva)} kVA × ${n(s.demandFactor)} (${s.demandFactorSource})`],
      ["Maximum demand on transformer", `${n(s.demandKva)} kVA (${n(s.loadingPct, 1)}%): ${ST[s.loadingStatus]}`],
    ],
  });
  t.push({
    key: "loadflow", title: "4. Load Flow Summary", statusCol: 10,
    note: r.basis === "demand"
      ? `Basis: Load Schedule demand at power factor ${r.powerFactor.toFixed(2)}. Max demand current = the Load Schedule's design current (125% of the continuous demand), so a breaker may carry 100% of its rating (PEC 2.10.2).`
      : `Basis: connected load at power factor ${r.powerFactor.toFixed(2)}. Current = highest line current; breaker loading limit 80% for continuous load (PEC 2.10.2).`,
    head: ["Panel", "System", "Connected kVA", "Demand kVA", "kW", "kVAR", r.basis === "demand" ? "Max demand A" : "Line current A", "Continuous A", "Breaker AT", "Breaker load %", "Status"],
    rows: r.buses.map((b) => [
      `${"  ".repeat(b.level - 1)}${b.name}`, `${b.nominalV} V ${b.is3Phase ? "3Φ" : "1Φ"}`, n(b.connectedVA / 1000), n(b.demandVA / 1000), n(b.kw), n(b.kvar),
      n(b.current, 1), n(b.demandCurrent, 1), b.feeder.breakerAT || "-", n(b.breakerLoadingPct, 1), ST[b.loadStatus],
    ]),
  });
  t.push({
    key: "vd", title: "5. Feeders and Voltage Drop", statusCol: 10,
    note: "Voltage drop as in the Voltage Drop section: VD = k·L·I·R / 1000 with R from PEC 2017 Ch. 9 Table 9 corrected for temperature, sets and conduit; I = the feeder's Load Schedule design current. Limits: main feeder 3%, sub-feeders 5%, total 5% (PEC 2.15.2 FPN No. 2). n/a: no length in Voltage Drop, not evaluated. * cumulative value excludes feeders without a length.",
    head: ["Panel", "Feeder", "Length m", "Ampacity A", "Conductor load %", "VD V", "VD %", "Cumulative %", "Bus V", "Feeder source", "Status"],
    rows: r.buses.map((b) => {
      const st: Status = b.vdCumulativePct > 5 || b.vdFeederPct > b.vdLimitPct || b.feederLoadingPct > 100
        ? "fail"
        : b.vdCumulativePct > 3 || b.vdFeederPct > b.vdLimitPct * 0.9 || b.feederLoadingPct > b.loadingWarnPct ? "warning" : "pass";
      return [
        b.name, b.feeder.label, b.feeder.lengthAssumed ? "not set" : b.feeder.lengthM, n(b.feeder.ampacityA, 0), n(b.feederLoadingPct, 1),
        b.vdEvaluated ? n(b.vdFeederV) : "n/a", b.vdEvaluated ? n(b.vdFeederPct) : "n/a", `${n(b.vdCumulativePct)}${b.vdComplete ? "" : "*"}`,
        n(b.busVoltage, 1), b.feeder.source, ST[st],
      ];
    }),
  });
  t.push({
    key: "balance", title: "6. Phase Balance", statusCol: 6,
    note: "Line currents are phasor sums of the connected circuits. Unbalance = largest deviation from the average / average (NEMA MG 1); target ≤ 10%.",
    head: ["Panel", "Phase R A", "Phase Y A", "Phase B A", "Neutral A", "Unbalance %", "Status"],
    rows: r.buses.map((b) => {
      const st: Status = !b.is3Phase ? "pass" : b.unbalancePct > 20 ? "fail" : b.unbalancePct > 10 ? "warning" : "pass";
      return b.is3Phase
        ? [b.name, n(b.phaseCurrents.R, 1), n(b.phaseCurrents.Y, 1), n(b.phaseCurrents.B, 1), n(b.neutralCurrent, 1), n(b.unbalancePct, 1), ST[st]]
        : [b.name, n(b.phaseCurrents.R, 1), "-", "-", n(b.neutralCurrent, 1), "single-phase", ST[st]];
    }),
  });
  t.push({
    key: "fault", title: "7. Short-Circuit Study", statusCol: 12,
    note: "Complex impedances from the utility to each panel. Peak per IEC 60909 (κ·√2·I); asymmetrical = half-cycle RMS. Duty is against the lowest-rated device in the panel, multiplied for X/R above the device test X/R (UL 489 / IEC 60947-2).",
    head: ["Panel", "I 3Φ kA", "I L-L kA", "I L-G kA", "Motor kA", "I sym kA", "X/R", "Peak kA", "Asym kA", "Lowest device", "Duty %", "Adj. duty %", "Status"],
    rows: r.buses.map((b) => [
      `${b.name}${b.faultUpperBound ? " (upper bound)" : ""}`, n(b.i3ph), n(b.iLL), Number.isFinite(b.iLG) ? n(b.iLG) : "n/a", n(b.motorKA), n(b.iSym), n(b.xr), n(b.iPeak), n(b.iAsym),
      b.lowestDevice, b.kaicKnown ? n(b.dutyPct, 0) : "-", b.kaicKnown ? n(b.adjustedDutyPct, 0) : "-", b.kaicKnown ? ST[b.faultStatus] : "WARNING: kAIC not specified",
    ]),
  });
  t.push({
    key: "withstand", title: "8. Feeder Conductor Short-Time Withstand", statusCol: 7,
    note: `t = (k·S / I)² for a fault at the feeder's supply end; breaker instantaneous clearing taken as ${(CLEARING_TIME_S * 1000).toFixed(0)} ms.`,
    head: ["Panel fed", "Feeder", "k", "S mm²", "Fault kA", "Withstand time", "Clearing ms", "Status"],
    rows: r.buses.map((b) => [b.name, b.feeder.label, b.withstand.k, b.withstand.areaMm2, n(b.withstand.faultKA), b.withstand.maxTimeS > 100 ? "> 100 s" : b.withstand.maxTimeS >= 1 ? `${n(b.withstand.maxTimeS, 1)} s` : `${n(b.withstand.maxTimeS * 1000, 0)} ms`, n(CLEARING_TIME_S * 1000, 0), ST[b.withstand.status]]),
  });
  t.push({
    key: "coordination", title: "9. Protection Coordination", statusCol: 6,
    note: "Thermal-magnetic breakers, instantaneous tolerance ±20%. Faults through a downstream breaker reach the fault level at its line terminals; the pair is selective up to the upstream instantaneous pickup. Confirm with the manufacturer's selectivity tables.",
    head: ["Upstream", "Downstream", "Rating ratio", "Selective up to kA", "Fault at device kA", "Fault at fed panel kA", "Status", "Assessment"],
    rows: sel.map((x) => [x.upstream.label, x.downstream.label, n(x.overloadRatio), n(x.selectiveUpToKA), n(x.faultAtDeviceKA), x.faultAtLoadBusKA === null ? "-" : n(x.faultAtLoadBusKA), ST[x.status], `${x.verdict}. ${x.detail}`]),
  });
  t.push({
    key: "findings", title: "10. Findings and Recommendations", statusCol: 1,
    head: ["#", "Status", "Area", "Location", "Finding", "Recommended action"],
    rows: r.findings.length
      ? r.findings.map((f, i) => [i + 1, ST[f.status], f.area, f.location, `${f.title}: ${f.detail}`, f.action || "-"])
      : [[1, "PASS", "All", "System", "All checked values are within limits.", "-"]],
  });
  t.push({
    key: "basis", title: "11. Basis, Assumptions and References", kv: true, head: ["Item", "Description"],
    rows: [
      ...r.assumptions.map((a, i) => [`Assumption ${i + 1}`, a] as Cell[]),
      ["Standards", "PEC 2017 (Part 1); IEEE Std 141 (Red Book), IEEE Std 242 (Buff Book), IEEE Std 399; IEC 60909-0; IEC 60947-2 / UL 489; IEEE C57.109; NEMA MG 1."],
      ["Limitations", "Thermal-magnetic curves are representative; manufacturer time-current curves and selectivity tables govern. Results depend on the feeder lengths and equipment ratings entered in the project."],
    ],
  });
  return t;
}

// ------------------------------------------------------------------------------------------ PDF
const NAVY: [number, number, number] = [15, 23, 42];
const STATUS_RGB: Record<string, [number, number, number]> = { PASS: [22, 163, 74], WARNING: [217, 119, 6], FAIL: [220, 38, 38] };

export function exportPowerAnalysisPdf(meta: ReportMeta, tables: ReportTable[], tccPng: string | null, fileBase: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = 297, H = 210, M = 12;
  // One header per page (pages are drawn once each; tables call this from didDrawPage)
  const headed = new Set<number>();
  const header = () => {
    const p = doc.getCurrentPageInfo().pageNumber;
    if (headed.has(p)) return;
    headed.add(p);
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, W, 14, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const title = meta.title.toUpperCase();
    doc.text(title, M, 9);
    const room = W - 2 * M - doc.getTextWidth(title) - 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    let right = [meta.project, meta.projectNo, meta.date].filter(Boolean).join(" | ");
    while (right.length > 4 && doc.getTextWidth(right) > room) right = `${right.slice(0, -2).trimEnd()}…`;
    if (room > 20) doc.text(right, W - M, 9, { align: "right" });
  };
  // Cover
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 50, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(doc.splitTextToSize(meta.title, W - 2 * M).slice(0, 2), M, 22);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Load Flow, Voltage Drop, Short-Circuit and Protection Coordination Study", M, 40);
  doc.setTextColor(...NAVY);
  autoTable(doc, {
    startY: 58, margin: { left: M, right: M }, theme: "plain",
    body: [["Project", meta.project], ["Client", meta.client], ["Project No.", meta.projectNo], ["Location", meta.location], ["Prepared by", meta.preparedBy], ["Date", meta.date]],
    styles: { fontSize: 10, cellPadding: 1.4 }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } },
  });
  const sumTable = tables.find((t) => t.key === "summary");
  if (sumTable) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 6, margin: { left: M, right: M, bottom: 12 }, theme: "grid",
      head: [["Executive summary", ""]], body: sumTable.rows as any,
      headStyles: { fillColor: NAVY, fontSize: 10 }, styles: { fontSize: 9.5, cellPadding: 1.8 }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 75 } },
      didParseCell: (d) => {
        if (d.section === "body" && d.column.index === 1 && d.row.index === 0) {
          const k = String(d.cell.raw).split(":")[0];
          if (STATUS_RGB[k]) { d.cell.styles.textColor = STATUS_RGB[k]; d.cell.styles.fontStyle = "bold"; }
        }
      },
    });
  }

  for (const t of tables) {
    if (t.key === "project" || t.key === "summary") continue;
    doc.addPage("a4", "landscape");
    header();
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(t.title, M, 24);
    let y = 28;
    if (t.note) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      const lines = doc.splitTextToSize(t.note, W - 2 * M);
      doc.text(lines, M, y + 2);
      y += lines.length * 3.6 + 2;
    }
    autoTable(doc, {
      startY: y, margin: { left: M, right: M, top: 20, bottom: 14 }, theme: "grid",
      head: t.kv ? undefined : [t.head], body: t.rows as any,
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 7.5, halign: "center", valign: "middle" },
      styles: { fontSize: t.kv ? 9 : 7.5, cellPadding: 1.6, overflow: "linebreak", valign: "middle" },
      columnStyles: t.kv ? { 0: { fontStyle: "bold", cellWidth: 80 } } : {},
      didParseCell: (d) => {
        if (d.section !== "body") return;
        if (!t.kv && typeof d.cell.raw === "number") d.cell.styles.halign = "right";
        if (t.statusCol !== undefined && d.column.index === t.statusCol) {
          const k = String(d.cell.raw).split(":")[0];
          if (STATUS_RGB[k]) { d.cell.styles.textColor = STATUS_RGB[k]; d.cell.styles.fontStyle = "bold"; }
        }
      },
      didDrawPage: () => header(),
    });
    if (t.key === "coordination" && tccPng) {
      const imgW = W - 2 * M - 60;
      const imgH = imgW * (950 / 1400);
      let iy = (doc as any).lastAutoTable.finalY + 6;
      if (iy + imgH > H - 14) {
        doc.addPage("a4", "landscape");
        header();
        iy = 22;
      }
      const ih = Math.min(imgH, H - 14 - iy);
      const iw = ih * (1400 / 950);
      doc.addImage(tccPng, "PNG", (W - iw) / 2, iy, iw, ih);
    }
  }
  // Sign-off
  const yEnd = Math.min((doc as any).lastAutoTable?.finalY + 16 || 150, H - 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text("Prepared by: ______________________________", M, yEnd + 10);
  doc.text(meta.preparedBy, M + 22, yEnd + 15);
  doc.text("Checked by: ______________________________", W / 2, yEnd + 10);
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`ElectricalPH Power Analysis Suite | Page ${p} of ${pages}`, W - M, H - 6, { align: "right" });
  }
  doc.save(`${fileBase}.pdf`);
}

// ------------------------------------------------------------------------------------------ Word
export async function exportPowerAnalysisDocx(meta: ReportMeta, tables: ReportTable[], tccPng: string | null, fileBase: string) {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, AlignmentType, ShadingType, ImageRun, PageOrientation, Footer, PageNumber, BorderStyle } = docx;
  const statusColor = (v: string) => ({ PASS: "16A34A", WARNING: "D97706", FAIL: "DC2626" } as Record<string, string>)[v.split(":")[0]];
  const cell = (text: string, opts: { bold?: boolean; header?: boolean; color?: string; align?: any; size?: number } = {}) =>
    new TableCell({
      children: [new Paragraph({ alignment: opts.align, children: [new TextRun({ text, bold: opts.bold || opts.header, color: opts.header ? "FFFFFF" : opts.color, size: opts.size ?? 16, font: "Arial" })] })],
      shading: opts.header ? { type: ShadingType.CLEAR, color: "auto", fill: "0F172A" } : undefined,
      margins: { top: 40, bottom: 40, left: 70, right: 70 },
    });
  const border = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" };
  const children: any[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: meta.title, bold: true, font: "Arial" })] }),
    new Paragraph({ children: [new TextRun({ text: "Load Flow, Voltage Drop, Short-Circuit and Protection Coordination Study", italics: true, font: "Arial", size: 22 })] }),
    new Paragraph({ text: "" }),
  ];
  for (const t of tables) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 80 }, children: [new TextRun({ text: t.title, font: "Arial" })] }));
    if (t.note) children.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: t.note, size: 16, color: "475569", font: "Arial" })] }));
    const rows: any[] = [];
    if (!t.kv) rows.push(new TableRow({ tableHeader: true, children: t.head.map((h) => cell(h, { header: true, align: AlignmentType.CENTER })) }));
    t.rows.forEach((r) => rows.push(new TableRow({
      cantSplit: true,
      children: r.map((v, ci) => {
        const s = String(v);
        const isStatus = t.statusCol === ci;
        return cell(s, {
          bold: (t.kv && ci === 0) || (isStatus && !!statusColor(s)),
          color: isStatus ? statusColor(s) : undefined,
          align: !t.kv && typeof v === "number" ? AlignmentType.RIGHT : undefined,
          size: t.kv ? 18 : 15,
        });
      }),
    })));
    children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border } }));
    if (t.key === "coordination" && tccPng) {
      const data = Uint8Array.from(atob(tccPng.split(",")[1]), (ch) => ch.charCodeAt(0));
      children.push(new Paragraph({ spacing: { before: 160 }, alignment: AlignmentType.CENTER, children: [new ImageRun({ data, transformation: { width: 760, height: 516 }, type: "png" } as any)] }));
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Time-current coordination curves (representative thermal-magnetic characteristics).", size: 16, italics: true, font: "Arial" })] }));
    }
  }
  children.push(new Paragraph({ spacing: { before: 480 }, children: [new TextRun({ text: `Prepared by: ${meta.preparedBy}          Date: ${meta.date}`, font: "Arial", size: 20 })] }));
  children.push(new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: "Signature: ____________________________          Checked by: ____________________________", font: "Arial", size: 20 })] }));
  const d = new Document({
    creator: "ElectricalPH",
    title: meta.title,
    sections: [{
      properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [`${meta.project} | Page `, PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 16, color: "64748B", font: "Arial" })] })] }) },
      children,
    }],
  });
  saveAs(await Packer.toBlob(d), `${fileBase}.docx`);
}

// ------------------------------------------------------------------------------------------ Excel
export function exportPowerAnalysisXlsx(meta: ReportMeta, tables: ReportTable[], fileBase: string) {
  const wb = XLSX.utils.book_new();
  const headStyle = { font: { bold: true, color: { rgb: "FFFFFF" }, name: "Arial", sz: 10 }, fill: { fgColor: { rgb: "0F172A" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: { top: { style: "thin", color: { rgb: "CBD5E1" } }, bottom: { style: "thin", color: { rgb: "CBD5E1" } }, left: { style: "thin", color: { rgb: "CBD5E1" } }, right: { style: "thin", color: { rgb: "CBD5E1" } } } };
  const bodyBorder = { top: { style: "thin", color: { rgb: "E2E8F0" } }, bottom: { style: "thin", color: { rgb: "E2E8F0" } }, left: { style: "thin", color: { rgb: "E2E8F0" } }, right: { style: "thin", color: { rgb: "E2E8F0" } } };
  const sheetName = (t: ReportTable) => t.title.replace(/^\d+\.\s*/, "").replace(/[\\/?*[\]:]/g, "").slice(0, 31);
  // Summary sheet: project + summary + source
  const first = tables.filter((t) => t.kv && t.key !== "basis");
  const addSheet = (name: string, parts: ReportTable[]) => {
    const aoa: Cell[][] = [[meta.title], [`${meta.project} | ${meta.projectNo} | ${meta.date}`], []];
    const styles: Array<{ r: number; c: number; s: any }> = [{ r: 0, c: 0, s: { font: { bold: true, sz: 14, name: "Arial", color: { rgb: "0F172A" } } } }];
    const merges: any[] = [];
    let width = 2;
    parts.forEach((t) => {
      const r0 = aoa.length;
      aoa.push([t.title]);
      styles.push({ r: r0, c: 0, s: { font: { bold: true, sz: 12, name: "Arial", color: { rgb: "1E3A8A" } } } });
      if (t.note) {
        aoa.push([t.note]);
        styles.push({ r: aoa.length - 1, c: 0, s: { font: { italic: true, sz: 9, name: "Arial", color: { rgb: "475569" } }, alignment: { wrapText: true, vertical: "top" } } });
        merges.push({ s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: Math.max(1, t.head.length - 1) } });
      }
      const hr = aoa.length;
      aoa.push(t.head);
      t.head.forEach((_, c) => styles.push({ r: hr, c, s: headStyle }));
      t.rows.forEach((row) => {
        const rr = aoa.length;
        aoa.push(row);
        row.forEach((v, c) => {
          const s: any = { font: { name: "Arial", sz: 10, bold: t.kv && c === 0 }, border: bodyBorder, alignment: { vertical: "top", wrapText: typeof v === "string" && v.length > 30 } };
          if (typeof v === "number") s.numFmt = Number.isInteger(v) ? "0" : "0.00";
          if (t.statusCol === c) {
            const k = String(v).split(":")[0];
            const col = { PASS: "16A34A", WARNING: "D97706", FAIL: "DC2626" }[k];
            if (col) s.font = { ...s.font, bold: true, color: { rgb: col } };
          }
          styles.push({ r: rr, c, s });
        });
      });
      aoa.push([]);
      width = Math.max(width, t.head.length);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    styles.forEach(({ r, c, s }) => {
      const a = XLSX.utils.encode_cell({ r, c });
      if (!ws[a]) ws[a] = { t: "s", v: "" };
      ws[a].s = s;
    });
    ws["!merges"] = merges;
    // Column widths from content
    const cols: number[] = Array(width).fill(10);
    aoa.forEach((row, ri) => {
      if (ri < 3) return;
      row.forEach((v, c) => { if (c < width) cols[c] = Math.min(60, Math.max(cols[c], String(v ?? "").length + 2)); });
    });
    ws["!cols"] = cols.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  addSheet("Summary", first);
  tables.filter((t) => !t.kv).forEach((t) => addSheet(sheetName(t), [t]));
  const basis = tables.find((t) => t.key === "basis");
  if (basis) addSheet("Basis & References", [basis]);
  XLSX.writeFile(wb, `${fileBase}.xlsx`);
}
