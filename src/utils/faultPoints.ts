import type { Circuit, FaultPointSetting, PanelConfig, ShortCircuitParams } from "../types";
import { isIdleSpareOrSpace, parseSystemVoltage } from "./computeEngine";
import { asymFactor, cadd, cscale, cx, deviceTestXr, faultLevels, feederFaultImpedance, peakFactor, type Cx, type SourceImpedance } from "./faultMath";
import type { BusResult, PowerAnalysisResult, Status } from "./powerAnalysis";

/**
 * Fault locations of the Single Line Impedance Diagram and Short-Circuit Study.
 *
 * Every panel bus is a fault point unless the user removed it; the user can add points on a feeder (a
 * distance from its supply breaker) or at a branch circuit (a cable length from the panel). Each point is
 * calculated like the bus faults (utility + transformer + cumulative feeder impedances, PEC Ch. 9 Table 9
 * with R at 20 °C, symmetrical components; IEEE 141 / IEC 60909 peak), so the values stay consistent.
 * The settings are saved with the project (ShortCircuitParams.sldSettings.faultPoints), so the diagram,
 * its PDF / DXF and the AutoCAD drawing set all use the same list.
 */

export type FaultPointStatus = Status | "info";

export interface FaultPoint {
  id: string;
  tag: string;
  setting: FaultPointSetting;
  location: FaultPointSetting["location"];
  busId: string;
  /** Short location text ("LP-1 bus", "LP-1 feeder, 15 m from its breaker", "MDP CKT 3 AHU, 25 m") */
  where: string;
  /** Conductor at the point (size, sets) or "-" at a bus */
  conductor: string;
  is3Phase: boolean;
  /** Fault type of the main value (3PH, 1PH, L-L or L-G) */
  faultType: string;
  i3ph: number; // kA, as the bus column "I 3PH/1PH": 3PH, or L-L for a single-phase point on a 3-phase system
  iLL: number;
  iLG: number;
  iLLG: number;
  motorKA: number;
  iSym: number; // kA, main value + motor contribution (maximum available)
  iPeak: number;
  iAsym: number;
  xr: number;
  z1: Cx;
  upperBound: boolean;
  /** Protective device that must interrupt this fault, its rating and the fault at its line terminals */
  device: string;
  /** Device with its rating, for tables ("CKT 3 breaker 20 AT, 10 kAIC") */
  deviceText: string;
  /** Branch point: the circuit number */
  circuitNo?: string;
  /** Feeder / branch: distance used (m), limited to the feeder length */
  distanceM: number;
  deviceKaic: number;
  lineSideKA: number;
  dutyPct: number;
  status: FaultPointStatus;
  notes: string[];
}

const uid = () => `fp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const newFaultPointId = uid;

/** Circuits of a bus ("mdp" = the main panel) */
export function busCircuits(busId: string, circuits: Circuit[], subPanels: { id: string; circuits: Circuit[] }[]) {
  return busId === "mdp" ? circuits : subPanels.find((s) => s.id === busId)?.circuits || [];
}
function busPanel(busId: string, panel: PanelConfig, subPanels: { id: string; panel: PanelConfig }[]) {
  return busId === "mdp" ? panel : subPanels.find((s) => s.id === busId)?.panel || panel;
}

/** Branch circuits that can carry a fault point (not spare / space, not a sub-panel feeder) */
export function faultableCircuits(busId: string, circuits: Circuit[], subPanels: { id: string; circuits: Circuit[] }[]) {
  return busCircuits(busId, circuits, subPanels).filter((c) => !isIdleSpareOrSpace(c) && !c.linkedSubPanelId);
}

/** Buses in tree order (each panel followed by the panels it feeds) */
export function busesInTreeOrder(R: PowerAnalysisResult): BusResult[] {
  const out: BusResult[] = [];
  const walk = (b: BusResult) => {
    out.push(b);
    R.buses.filter((c) => c.parentId === b.id).forEach(walk);
  };
  if (R.byId.mdp) walk(R.byId.mdp);
  R.buses.filter((b) => !out.includes(b)).forEach((b) => out.push(b));
  return out;
}

const sizeText = (size: string | number, sets: number) => `${sets > 1 ? `${sets} × ` : ""}${size} mm²`;

/**
 * The study's fault points: the saved list merged with one point per panel bus (unless removed), in tree
 * order (feeder points just above their panel, branch points below it), tagged F1, F2 ... unless labelled.
 */
export function resolveFaultPoints(
  R: PowerAnalysisResult,
  input: { panel: PanelConfig; circuits: Circuit[]; subPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[]; iscParams: ShortCircuitParams },
  saved: FaultPointSetting[] = input.iscParams.sldSettings?.faultPoints || []
): FaultPoint[] {
  const out: FaultPoint[] = [];
  const valid = saved.filter((s) => R.byId[s.busId]);
  for (const b of busesInTreeOrder(R)) {
    const busSetting = valid.find((s) => s.location === "bus" && s.busId === b.id);
    const ordered: FaultPointSetting[] = [
      ...valid.filter((s) => s.location === "feeder" && s.busId === b.id),
      ...(busSetting?.removed ? [] : [busSetting || { id: `bus-${b.id}`, location: "bus" as const, busId: b.id }]),
      ...valid.filter((s) => s.location === "branch" && s.busId === b.id),
    ];
    for (const s of ordered) {
      const fp = calculateFaultPoint(R, input, s);
      if (fp) out.push(fp);
    }
  }
  out.forEach((fp, i) => (fp.tag = (fp.setting.label || "").trim() || `F${i + 1}`));
  return out;
}

/** Source impedance of the study (as the bus faults use) */
function sourceOf(R: PowerAnalysisResult): SourceImpedance {
  const s = R.source;
  return { v: s.secondaryV, is3Phase: s.is3Phase, zUtility: s.zUtility, zTransformer: s.zTransformer, kva: s.kva, txXr: s.txXr, zBase: (s.secondaryV * s.secondaryV) / (s.kva * 1000) };
}

/**
 * Fault levels (A) at feeder impedance z, formed exactly like the bus faults of the Power Analysis engine:
 * three-phase point: 3PH (and L-G, the larger governs); single-phase point on a 3-phase system: L-L (and
 * L-G); single-phase system: the 1-phase loop. A line-to-neutral branch circuit is governed by L-G.
 */
function levelsAt(R: PowerAnalysisResult, z: Cx, pointIs3: boolean, lineToNeutral = false) {
  const mdpSys = parseSystemVoltage(R.byId.mdp.system);
  const fl = faultLevels(sourceOf(R), z, { groundReturn: R.source.is3Phase && mdpSys.wireCount >= 4 });
  const lg = Number.isFinite(fl.iLG) ? fl.iLG : NaN;
  if (!R.source.is3Phase) return { fl, i3: fl.i3ph, iLL: fl.i3ph, iLG: NaN, main: fl.i3ph, type: "1PH" };
  if (pointIs3) {
    const main = Math.max(fl.i3ph, lg || 0);
    return { fl, i3: fl.i3ph, iLL: fl.iLL, iLG: lg, main, type: main > fl.i3ph ? "L-G" : "3PH" };
  }
  if (lineToNeutral && lg > 0) return { fl, i3: fl.iLL, iLL: fl.iLL, iLG: lg, main: lg, type: "L-G" };
  const main = Math.max(fl.iLL, lg || 0);
  return { fl, i3: fl.iLL, iLL: fl.iLL, iLG: lg, main, type: main > fl.iLL ? "L-G" : "L-L" };
}

export function calculateFaultPoint(
  R: PowerAnalysisResult,
  input: { panel: PanelConfig; circuits: Circuit[]; subPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[]; iscParams: ShortCircuitParams },
  s: FaultPointSetting
): FaultPoint | null {
  const b = R.byId[s.busId];
  if (!b) return null;
  const base = { id: s.id, tag: "", setting: s, location: s.location, busId: b.id };

  if (s.location === "bus") {
    return {
      ...base,
      where: `${b.name} bus`,
      conductor: "-",
      is3Phase: b.is3Phase,
      faultType: !R.source.is3Phase ? "1PH" : Number.isFinite(b.iLG) && b.iLG > b.i3ph ? "L-G" : b.is3Phase ? "3PH" : "L-L",
      i3ph: b.i3ph, iLL: b.iLL, iLG: b.iLG, iLLG: b.iLLG, motorKA: b.motorKA, iSym: b.iSym, iPeak: b.iPeak, iAsym: b.iAsym, xr: b.xr, z1: b.z1,
      upperBound: b.faultUpperBound,
      device: b.kaicKnown ? b.lowestDevice : "Not specified",
      deviceText: b.kaicKnown ? b.lowestDevice : "NOT SPECIFIED",
      deviceKaic: b.lowestKaic,
      lineSideKA: b.iSym,
      dutyPct: b.kaicKnown ? b.adjustedDutyPct : NaN,
      status: b.faultStatus,
      distanceM: 0,
      notes: [],
    };
  }

  const parent = b.parentId ? R.byId[b.parentId] : undefined;
  const notes: string[] = [];
  let z: Cx;
  let lineToNeutral = false;
  let where: string;
  let conductor: string;
  let is3: boolean;
  let motorKA: number;
  let device: string;
  let deviceKaic: number;
  let lineSideKA: number;
  let lineSideXr: number;
  let upperBound: boolean;
  let circuitNo: string | undefined;
  let distanceM = 0;

  if (s.location === "feeder") {
    // Along the feeder that supplies bus b: from its supply end (parent bus, or the transformer for the MDP)
    const f = b.feeder;
    const zStart = parent ? parent.zFeeders : cx(0, 0);
    const scService = b.id === "mdp" && (input.iscParams.feederLength || 0) > 0;
    // The engine's feeder impedance (service conductor of the Short Circuit inputs for the MDP)
    const fullLen = scService ? input.iscParams.feederLength : b.zFeeder.r > 0 || b.zFeeder.x > 0 ? f.lengthM : 0;
    let d = Math.max(0, Number(s.distanceM) || 0);
    if (fullLen > 0 && d > fullLen) {
      notes.push(`Distance limited to the feeder length (${fullLen} m).`);
      d = fullLen;
    }
    z = fullLen > 0
      ? cadd(zStart, cscale(b.zFeeder, d / fullLen))
      : Number(f.size) > 0 ? cadd(zStart, feederFaultImpedance(d, f.size, f.sets, f.material)) : zStart;
    if (!(fullLen > 0)) notes.push("Feeder length not set: the point is placed by its own distance on the feeder conductor.");
    is3 = b.is3Phase;
    distanceM = d;
    where = parent ? `${b.name} feeder, ${d} m from ${parent.name}` : `${b.name} service conductor, ${d} m from transformer`;
    conductor = Number(f.size) > 0 ? sizeText(f.size, f.sets) : "Not set";
    // Motors anywhere below the supply end feed the fault
    motorKA = parent ? parent.motorKA : b.motorKA;
    upperBound = (parent ? parent.faultUpperBound : false) || !(Number(f.size) > 0);
    if (parent) {
      device = `${b.name} feeder breaker${f.breakerAT ? ` ${f.breakerAT} AT` : ""}`;
      deviceKaic = Number(f.breakerKaic) || 0;
      lineSideKA = parent.iSym;
      lineSideXr = parent.xr;
    } else {
      device = "Utility transformer protection";
      deviceKaic = 0;
      lineSideKA = R.source.terminalFaultKA;
      lineSideXr = R.source.terminalXr;
      notes.push("A fault on the service conductor is cleared by the utility's transformer protection.");
    }
  } else {
    // At a branch circuit of bus b, a cable length from the panel
    const ckts = faultableCircuits(b.id, input.circuits, input.subPanels);
    const c = ckts.find((x) => x.id === s.circuitId) || null;
    if (!c) return null;
    const pnl = busPanel(b.id, input.panel, input.subPanels);
    const size = String(c.wireSize || "");
    const sets = Number(c.wireSets || c.calculatedWireSets) || 1;
    const material = (pnl.conductorMaterial === "Aluminum" ? "Aluminum" : "Copper") as "Copper" | "Aluminum";
    const d = Math.max(0, Number(s.distanceM) || 0);
    distanceM = d;
    z = Number(size) > 0 ? cadd(b.zFeeders, feederFaultImpedance(d, size, sets, material)) : b.zFeeders;
    if (!(Number(size) > 0)) notes.push("Circuit conductor size not set: the fault is taken at the panel (upper bound).");
    // Fault type of the circuit: three-pole on a three-phase system, else line-to-neutral or line-to-line
    const poles = parseInt(String(c.mcbP || "1"), 10) || 1;
    const sys = parseSystemVoltage(b.system);
    const vLL = b.nominalV;
    const vLN = sys.vln && sys.vln < vLL ? sys.vln : vLL / Math.sqrt(3);
    const cv = Number(c.voltage) || 0;
    is3 = b.is3Phase && poles >= 3;
    lineToNeutral = !is3 && poles === 1 && sys.wireCount >= 4 && cv > 0 && Math.abs(cv - vLN) < Math.abs(cv - vLL);
    where = `${b.name} CKT ${c.circuitNo ?? ""}${c.description ? ` ${String(c.description).slice(0, 28)}` : ""}, ${d} m`.replace(/\s+/g, " ");
    conductor = Number(size) > 0 ? sizeText(size, sets) : "Not set";
    motorKA = b.motorKA;
    upperBound = b.faultUpperBound || !(Number(size) > 0);
    circuitNo = String(c.circuitNo ?? "");
    device = `CKT ${c.circuitNo ?? ""} breaker${c.mcbAT ? ` ${c.mcbAT} AT` : ""}`.replace(/\s+/g, " ");
    deviceKaic = Number(c.mcbKAIC) || 0;
    lineSideKA = b.iSym;
    lineSideXr = b.xr;
    if (d === 0) notes.push("Cable length 0 m: the fault is at the breaker's load terminals.");
  }

  const lv = levelsAt(R, z, is3, lineToNeutral);
  const { fl, main } = lv;
  const iSymA = main + motorKA * 1000;
  const xr = fl.xr;
  // The protective device must interrupt the fault at its line terminals (the upstream bus), X/R adjusted
  const kaicKnown = deviceKaic > 0;
  const mult = kaicKnown ? Math.max(1, asymFactor(lineSideXr) / asymFactor(deviceTestXr(deviceKaic))) : 1;
  const dutyPct = kaicKnown ? ((lineSideKA * mult) / deviceKaic) * 100 : NaN;
  const status: FaultPointStatus = deviceKaic === 0 && s.location === "feeder" && !parent
    ? "info"
    : !kaicKnown ? "warning" : dutyPct > 100 ? "fail" : dutyPct > 85 ? "warning" : "pass";
  if (!kaicKnown && status !== "info") notes.push("Interrupting rating of the protective device not specified.");
  if (upperBound) notes.push("Upstream data missing: the value is an upper bound.");

  return {
    ...base,
    circuitNo,
    distanceM,
    deviceText: deviceKaic > 0 ? `${device}, ${deviceKaic} kAIC` : status === "info" ? device : `${device}, kAIC NOT SPECIFIED`,
    where,
    conductor,
    is3Phase: is3,
    faultType: lv.type,
    i3ph: lv.i3 / 1000,
    iLL: lv.iLL / 1000,
    iLG: lv.iLG / 1000,
    iLLG: fl.iLLG / 1000,
    motorKA,
    iSym: iSymA / 1000,
    iPeak: (peakFactor(xr) * Math.SQRT2 * iSymA) / 1000,
    iAsym: (asymFactor(xr) * iSymA) / 1000,
    xr,
    z1: fl.z1,
    upperBound,
    device,
    deviceKaic,
    lineSideKA,
    dutyPct,
    status,
    notes,
  };
}

/** Saved fault-point list after an edit (helpers for the editor) */
export const faultPointEdits = {
  /** Removes a point: a custom point is deleted, a panel-bus point is marked removed */
  remove(list: FaultPointSetting[], fp: FaultPoint): FaultPointSetting[] {
    if (fp.location !== "bus") return list.filter((s) => s.id !== fp.id);
    const rest = list.filter((s) => !(s.location === "bus" && s.busId === fp.busId));
    return [...rest, { id: `bus-${fp.busId}`, location: "bus", busId: fp.busId, removed: true, label: fp.setting.label }];
  },
  /** Puts back a removed panel-bus point */
  restore(list: FaultPointSetting[], busId: string): FaultPointSetting[] {
    return list.filter((s) => !(s.location === "bus" && s.busId === busId && s.removed));
  },
  /** Adds or replaces a point */
  upsert(list: FaultPointSetting[], s: FaultPointSetting): FaultPointSetting[] {
    const i = list.findIndex((x) => x.id === s.id || (s.location === "bus" && x.location === "bus" && x.busId === s.busId));
    if (i < 0) return [...list, s];
    const next = [...list];
    next[i] = s;
    return next;
  },
};

/** Panel buses whose fault point was removed */
export function removedBusPoints(R: PowerAnalysisResult, saved: FaultPointSetting[] = []): BusResult[] {
  return R.buses.filter((b) => saved.some((s) => s.location === "bus" && s.busId === b.id && s.removed));
}
