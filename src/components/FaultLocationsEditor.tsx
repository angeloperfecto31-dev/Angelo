import React, { useMemo, useState } from "react";
import { MapPin, Pencil, Plus, RotateCcw, Trash2, X, Zap } from "lucide-react";
import type { Circuit, FaultPointSetting, PanelConfig, ShortCircuitParams } from "../types";
import type { PowerAnalysisResult } from "../utils/powerAnalysis";
import {
  busesInTreeOrder,
  calculateFaultPoint,
  faultableCircuits,
  faultPointEdits,
  newFaultPointId,
  removedBusPoints,
  resolveFaultPoints,
  type FaultPoint,
} from "../utils/faultPoints";

interface Props {
  result: PowerAnalysisResult;
  panel: PanelConfig;
  circuits: Circuit[];
  subPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[];
  iscParams: ShortCircuitParams;
  /** Saved fault locations (sldSettings.faultPoints) */
  value: FaultPointSetting[];
  onChange: (next: FaultPointSetting[]) => void;
}

type Draft = { editing?: FaultPoint; location: FaultPointSetting["location"]; busId: string; circuitId: string; distanceM: string; label: string };

const STATUS_STYLE: Record<FaultPoint["status"], string> = {
  pass: "text-emerald-600 dark:text-emerald-400",
  warning: "text-orange-600 dark:text-orange-400",
  fail: "text-red-600 dark:text-red-400 font-black",
  info: "text-slate-500",
};
const STATUS_TEXT: Record<FaultPoint["status"], string> = { pass: "OK", warning: "Check", fail: "Insufficient", info: "Utility" };
const LOCATION_TEXT: Record<FaultPointSetting["location"], string> = { bus: "Panel bus", feeder: "On a feeder", branch: "At a branch circuit" };
const inputCls = "w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100";

/**
 * Fault locations of the short-circuit study: change, add, delete and update the points. Every edit is saved
 * with the project, so the diagram, the calculation summary and the exports recalculate together.
 */
export default function FaultLocationsEditor({ result: R, panel, circuits, subPanels, iscParams, value, onChange }: Props) {
  const input = { panel, circuits, subPanels, iscParams };
  const points = useMemo(() => resolveFaultPoints(R, input, value), [R, panel, circuits, subPanels, iscParams, value]); // eslint-disable-line react-hooks/exhaustive-deps
  const removed = removedBusPoints(R, value);
  const [draft, setDraft] = useState<Draft | null>(null);

  const feederLength = (busId: string) => {
    const b = R.byId[busId];
    if (!b) return 0;
    if (busId === "mdp" && iscParams.feederLength > 0) return iscParams.feederLength;
    return b.zFeeder.r > 0 || b.zFeeder.x > 0 ? b.feeder.lengthM : 0;
  };
  const supplyName = (busId: string) => {
    const b = R.byId[busId];
    return b?.parentId ? R.byId[b.parentId]?.name : "the transformer";
  };

  const draftSetting = (d: Draft): FaultPointSetting | null => {
    if (!R.byId[d.busId]) return null;
    if (d.location === "branch" && !d.circuitId) return null;
    const distanceM = Math.max(0, Number(d.distanceM) || 0);
    const label = d.label.trim() || undefined;
    if (d.location === "bus") return { id: `bus-${d.busId}`, location: "bus", busId: d.busId, label };
    const keepId = d.editing && d.editing.location !== "bus" ? d.editing.id : newFaultPointId();
    return { id: keepId, location: d.location, busId: d.busId, circuitId: d.location === "branch" ? d.circuitId : undefined, distanceM, label };
  };
  const preview = useMemo(() => {
    if (!draft) return null;
    const s = draftSetting(draft);
    return s ? calculateFaultPoint(R, input, s) : null;
  }, [draft, R, panel, circuits, subPanels, iscParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const startAdd = () => setDraft({ location: "feeder", busId: R.buses.find((b) => b.id !== "mdp")?.id || "mdp", circuitId: "", distanceM: "0", label: "" });
  const startEdit = (fp: FaultPoint) =>
    setDraft({ editing: fp, location: fp.location, busId: fp.busId, circuitId: fp.setting.circuitId || "", distanceM: String(fp.setting.distanceM ?? 0), label: fp.setting.label || "" });

  const commit = () => {
    if (!draft) return;
    const s = draftSetting(draft);
    if (!s) return;
    let list = value;
    const ed = draft.editing;
    // Moving a point: take it off its old place first (a bus point is marked removed, a custom point deleted)
    if (ed && (ed.location !== s.location || ed.busId !== s.busId || (ed.location === "bus") !== (s.location === "bus"))) list = faultPointEdits.remove(list, ed);
    // A bus point brought back by an edit or an add is no longer removed
    if (s.location === "bus") list = faultPointEdits.restore(list, s.busId);
    list = faultPointEdits.upsert(list, s);
    // A bus point without a tag is the default point: nothing to save for it
    list = list.filter((x) => !(x.location === "bus" && !x.removed && !x.label));
    onChange(list);
    setDraft(null);
  };

  const remove = (fp: FaultPoint) => {
    onChange(faultPointEdits.remove(value, fp));
    if (draft?.editing?.id === fp.id) setDraft(null);
  };

  const ckts = draft ? faultableCircuits(draft.busId, circuits, subPanels) : [];
  const fl = draft ? feederLength(draft.busId) : 0;
  const draftValid = draft ? Boolean(draftSetting(draft)) : false;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-red-500" /> Fault locations ({points.length})
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {removed.map((b) => (
            <button key={b.id} type="button" onClick={() => onChange(faultPointEdits.restore(value, b.id))} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800" title="Put this panel bus back in the study">
              <RotateCcw className="w-3 h-3" /> Restore {b.name} bus
            </button>
          ))}
          <button type="button" onClick={startAdd} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold">
            <Plus className="w-3.5 h-3.5" /> Add fault point
          </button>
        </div>
      </div>

      {draft && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-black text-slate-700 dark:text-slate-200">{draft.editing ? `Change ${draft.editing.tag}` : "New fault point"}</span>
            <button type="button" onClick={() => setDraft(null)} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <label className="block">
              <span className="text-[9px] font-black uppercase text-slate-400">Location</span>
              <select value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value as Draft["location"], circuitId: "" })} className={inputCls}>
                {(["bus", "feeder", "branch"] as const).map((l) => <option key={l} value={l}>{LOCATION_TEXT[l]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[9px] font-black uppercase text-slate-400">{draft.location === "feeder" ? "Feeder of panel" : "Panel"}</span>
              <select value={draft.busId} onChange={(e) => setDraft({ ...draft, busId: e.target.value, circuitId: "" })} className={inputCls}>
                {busesInTreeOrder(R).map((b) => <option key={b.id} value={b.id}>{"  ".repeat(b.level - 1)}{b.name}{draft.location === "feeder" && b.id === "mdp" ? " (service)" : ""}</option>)}
              </select>
            </label>
            {draft.location === "branch" && (
              <label className="block">
                <span className="text-[9px] font-black uppercase text-slate-400">Circuit</span>
                <select value={draft.circuitId} onChange={(e) => setDraft({ ...draft, circuitId: e.target.value })} className={inputCls}>
                  <option value="">Select a circuit…</option>
                  {ckts.map((c) => <option key={c.id} value={c.id}>CKT {c.circuitNo} {String(c.description || "").slice(0, 30)} ({c.mcbAT || "-"} AT, {c.wireSize || "-"} mm²)</option>)}
                </select>
              </label>
            )}
            {draft.location !== "bus" && (
              <label className="block">
                <span className="text-[9px] font-black uppercase text-slate-400">
                  {draft.location === "feeder" ? `Distance from ${supplyName(draft.busId)} (m)` : "Cable length from panel (m)"}
                </span>
                <input type="number" min={0} max={draft.location === "feeder" && fl > 0 ? fl : undefined} step="any" value={draft.distanceM} onChange={(e) => setDraft({ ...draft, distanceM: e.target.value })} className={inputCls} />
                {draft.location === "feeder" && <span className="text-[10px] text-slate-400">{fl > 0 ? `Feeder length ${fl} m` : "Feeder length not set"}</span>}
              </label>
            )}
            <label className="block">
              <span className="text-[9px] font-black uppercase text-slate-400">Tag (optional)</span>
              <input value={draft.label} maxLength={8} placeholder="F#" onChange={(e) => setDraft({ ...draft, label: e.target.value })} className={inputCls} />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-600 dark:text-slate-300">
              {preview ? (
                <>
                  <MapPin className="inline w-3.5 h-3.5 text-red-500" /> {preview.where}: <b>{preview.iSym.toFixed(2)} kA</b> ({preview.faultType}{preview.motorKA > 0.0005 ? `, incl. ${preview.motorKA.toFixed(2)} kA motors` : ""}), Ip {preview.iPeak.toFixed(2)} kA, X/R {preview.xr.toFixed(1)}
                  {preview.upperBound ? " ↑ upper bound" : ""}
                </>
              ) : draft.location === "branch" ? "Select the circuit." : ""}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDraft(null)} className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-300">Cancel</button>
              <button type="button" disabled={!draftValid} onClick={commit} className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold">
                {draft.editing ? "Update" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead className="text-[9px] font-black uppercase text-slate-400 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="py-1 pr-2">Tag</th>
              <th className="py-1 pr-2">Location</th>
              <th className="py-1 pr-2">Conductor</th>
              <th className="py-1 pr-2 text-right">Isym kA</th>
              <th className="py-1 pr-2 text-right">Ip kA</th>
              <th className="py-1 pr-2 text-right">X/R</th>
              <th className="py-1 pr-2">Interrupting device</th>
              <th className="py-1 pr-2 text-right">Duty</th>
              <th className="py-1 pr-2">Status</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {points.length === 0 && (
              <tr><td colSpan={10} className="py-2 text-orange-600">No fault locations. Add a point or restore a panel bus.</td></tr>
            )}
            {points.map((fp) => (
              <tr key={fp.id} className="border-b border-slate-100 dark:border-slate-800 align-top">
                <td className="py-1 pr-2 font-black text-red-600">{fp.tag}</td>
                <td className="py-1 pr-2 text-slate-700 dark:text-slate-200">
                  {fp.where}
                  {fp.notes.length > 0 && <div className="text-[10px] text-orange-600 dark:text-orange-400">{fp.notes.join(" ")}</div>}
                </td>
                <td className="py-1 pr-2 text-slate-500">{fp.location === "bus" ? "-" : `${fp.conductor}, ${fp.distanceM} m`}</td>
                <td className="py-1 pr-2 text-right font-bold text-blue-700 dark:text-blue-400">{fp.iSym.toFixed(2)}{fp.upperBound ? " ↑" : ""}</td>
                <td className="py-1 pr-2 text-right">{fp.iPeak.toFixed(2)}</td>
                <td className="py-1 pr-2 text-right">{fp.xr.toFixed(1)}</td>
                <td className="py-1 pr-2 text-slate-500">{fp.deviceText}</td>
                <td className="py-1 pr-2 text-right">{Number.isFinite(fp.dutyPct) ? `${fp.dutyPct.toFixed(0)}%` : "-"}</td>
                <td className={`py-1 pr-2 ${STATUS_STYLE[fp.status]}`}>{STATUS_TEXT[fp.status]}</td>
                <td className="py-1 whitespace-nowrap text-right">
                  <button type="button" onClick={() => startEdit(fp)} className="p-1 text-slate-400 hover:text-blue-600" title="Change this fault point" aria-label={`Change ${fp.tag}`}><Pencil className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => remove(fp)} className="p-1 text-slate-400 hover:text-red-600" title={fp.location === "bus" ? "Remove this bus from the study (can be restored)" : "Delete this fault point"} aria-label={`Delete ${fp.tag}`}><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-400">
        Each point is calculated from the utility, transformer and every feeder impedance up to it, with motor contribution. Changes are saved with the project and update the diagram, the calculation summary and the PDF / AutoCAD exports.
      </p>
    </div>
  );
}
