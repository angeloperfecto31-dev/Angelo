import React from "react";
import { Zap, Activity, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import type { SolarDesignConfig } from "../../types/solar";
import { CAD_WHITE_THEME } from "../../utils/solarSldCapture";
import { kaText, type SolarStudies } from "../../utils/solarStudies";
import { SolarShortCircuitDiagram, SolarVoltageDropDiagram, SC_W, SC_H, VD_W, VD_H } from "./SolarStudyDiagrams";

interface Props {
  mode: "sc" | "vd";
  config: SolarDesignConfig;
  studies: SolarStudies;
  onChange: (updated: Partial<SolarDesignConfig>) => void;
}

const Card = ({ label, value, sub, ok }: { label: string; value: string; sub: string; ok?: boolean }) => (
  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">{label}</span>
    <span className={`text-base font-black block mt-0.5 ${ok === false ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white"}`}>{value}</span>
    <span className="text-[10px] text-slate-500 dark:text-slate-400">{sub}</span>
  </div>
);

const NumberField = ({ label, value, unit, onCommit, min = 0, step = 1 }: { label: string; value: number; unit: string; onCommit: (v: number) => void; min?: number; step?: number }) => (
  <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
    {label}
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v) && v > min) onCommit(v);
        }}
        className="w-24 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-900 dark:text-white"
      />
      <span className="text-[11px] font-semibold text-slate-500">{unit}</span>
    </div>
  </label>
);

/** Solar Design tab: SHORT CIRCUIT ANALYSIS (point-to-point) or VOLTAGE DROP CALCULATION, with its diagram */
export const SolarStudiesTab: React.FC<Props> = ({ mode, config, studies, onChange }) => {
  const { sc, vd } = studies;
  const ok = mode === "sc" ? sc.allOk : vd.allOk;
  const setCable = (key: "dcCable" | "acCable", lengthM: number) =>
    onChange({ cabling: { ...config.cabling, [key]: { ...config.cabling[key], lengthM } } });
  const setLimit = (key: "dcMaxDropPercent" | "acMaxDropPercent", v: number) => onChange({ cabling: { ...config.cabling, [key]: v } });
  const P = Object.fromEntries(sc.points.map((p) => [p.id, p]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${mode === "sc" ? "bg-rose-600" : "bg-indigo-600"}`}>
            {mode === "sc" ? <Zap className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              {mode === "sc" ? "Short Circuit Analysis - Point-to-Point Diagram" : "Voltage Drop Calculation - Voltage Drop Diagram"}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-3xl">
              {mode === "sc"
                ? "Generated from the solar design and the project service data (utility, transformer and service feeder from the Short Circuit module). Each fault point is checked against the interrupting rating of its protective device."
                : "Generated from the string, inverter and service feeder currents and the cable runs of this design. Each segment is checked against its limit and the total from the PV array to the service entrance."}
            </p>
          </div>
        </div>
        <span
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
            ok
              ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
              : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
          }`}
        >
          {ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {ok ? "All checks pass" : "Review required"}
        </span>
      </div>

      {mode === "sc" ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="Service entrance (F1)" value={kaText(P.service?.amps ?? 0)} sub={`${P.service?.faultType} - X/R ${P.service?.xr ?? "-"}`} ok={P.service?.ok} />
          <Card label="Point of interconnection (F2)" value={kaText(P.poi?.amps ?? 0)} sub={`Device rated ${P.poi?.ratingKa} kA`} ok={P.poi?.ok} />
          <Card label="Inverter AC breaker (F3)" value={kaText(P["inv-ac"]?.amps ?? 0)} sub={`Device rated ${P["inv-ac"]?.ratingKa} kA`} ok={P["inv-ac"]?.ok} />
          <Card label="Inverter DC input (F4)" value={kaText(P["dc-input"]?.amps ?? 0)} sub={`${sc.stringsPerInverterMax} string(s) x ${sc.stringIscMaxA} A`} ok={P["dc-input"]?.ok} />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="DC (string to inverter)" value={`${vd.dcPct.toFixed(2)}%`} sub={`Limit ${vd.segments[0].limitPct}%`} ok={vd.segments[0].ok} />
          <Card label="AC (inverter to panel)" value={`${vd.segments[1].vdPct.toFixed(2)}%`} sub={`Limit ${vd.segments[1].limitPct}%`} ok={vd.segments[1].ok} />
          <Card label="Service feeder" value={`${vd.segments[2].vdPct.toFixed(2)}%`} sub={`Limit ${vd.segments[2].limitPct}%`} ok={vd.segments[2].ok} />
          <Card label="Total (array to service)" value={`${vd.totalPct.toFixed(2)}%`} sub={`Limit ${vd.totalLimitPct}%`} ok={vd.totalOk} />
        </div>
      )}

      {mode === "vd" && (
        <div className="flex flex-wrap items-end gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <NumberField label="DC cable run (string to inverter)" value={config.cabling.dcCable.lengthM} unit="m" onCommit={(v) => setCable("dcCable", v)} />
          <NumberField label="AC cable run (inverter to panel)" value={config.cabling.acCable.lengthM} unit="m" onCommit={(v) => setCable("acCable", v)} />
          <NumberField label="DC drop limit" value={config.cabling.dcMaxDropPercent} unit="%" step={0.1} onCommit={(v) => setLimit("dcMaxDropPercent", v)} />
          <NumberField label="AC drop limit" value={config.cabling.acMaxDropPercent} unit="%" step={0.1} onCommit={(v) => setLimit("acMaxDropPercent", v)} />
          <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm">
            Cable sizes follow the Protection &amp; Cables tab (auto-sized to these limits). The service feeder length and size come from the Short Circuit module.
          </p>
        </div>
      )}

      {mode === "sc" && !sc.usesProjectData && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          Default utility and transformer data are in use. Enter the actual utility fault level, transformer and service feeder in the Short Circuit module; this study updates automatically.
        </div>
      )}

      <p className="sm:hidden text-[11px] text-slate-500 dark:text-slate-400">Swipe the diagram sideways to see all of it.</p>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white p-3 overflow-x-auto">
        <svg viewBox={`0 0 ${mode === "sc" ? SC_W : VD_W} ${mode === "sc" ? SC_H : VD_H}`} className="w-full min-w-[720px] h-auto" style={{ background: "#ffffff" }}>
          {mode === "sc" ? (
            <SolarShortCircuitDiagram study={sc} theme={CAD_WHITE_THEME} panelName={studies.panelName} />
          ) : (
            <SolarVoltageDropDiagram study={vd} theme={CAD_WHITE_THEME} panelName={studies.panelName} />
          )}
        </svg>
      </div>

      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        The same diagram is drawn on the Single Line Diagram sheet and included in the PDF, AutoCAD (DXF), Word and Excel exports.
      </p>
    </div>
  );
};
