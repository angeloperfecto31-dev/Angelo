/**
 * Power Analysis Suite engine: load flow, phase balance, voltage drop, short circuit, conductor withstand
 * and protection selectivity for the project's panel tree (utility -> transformer -> MDP -> sub-panels).
 *
 * Methods
 * - Loads, demand and feeders come from the Load Schedule engine (computePanelScheduleValues), so the
 *   suite agrees with the schedules. Line currents per phase are phasor sums of the circuits (line-to-
 *   neutral and line-to-line loads), neutral current is the phasor sum of the line-to-neutral currents.
 * - Voltage drop: VD = k·I·L·(R·cosφ + X·sinφ) / sets, k = √3 (3-phase) or 2 (1-phase), R/X per PEC 2017
 *   Chapter 9 Table 9 (75 °C, Cu in PVC; Al R × 1.64), accumulated from the transformer to each panel.
 * - Short circuit: complex impedances (ohms at the secondary voltage) of the utility (X/R 10), transformer
 *   (Z%, typical X/R per IEEE Std 141 by kVA) and every feeder on the path (R at 20 °C for maximum fault).
 *   Bolted 3-phase I = V_LN / |Z1|; line-to-line 0.866 × I3Φ; line-to-ground with Z0 = Z_T (Dyn transformer,
 *   utility blocked by the delta) plus phase + return conductor for each feeder. Peak i_p = κ·√2·I with
 *   κ = 1.02 + 0.98·e^(−3R/X) (IEC 60909); half-cycle asymmetrical RMS I·√(1 + 2·e^(−2π/(X/R))).
 *   Motor contribution 4 × motor FLA (all motors at and below the bus).
 *   Interrupting duty compares the bus fault (with the X/R multiplying factor against the device test X/R per
 *   UL 489 / IEC 60947-2 test power factors) with the lowest-rated device in the panel.
 * - Conductor short-time withstand: t = (k·S / I)², k = 115 (Cu PVC/THHN), 143 (Cu XLPE), 76 / 94 (Al).
 */
import type { Circuit, PanelConfig, ShortCircuitParams, VoltageDropCalculation } from "../types";
import { LoadType } from "../types";
import {
  type Cx, cadd as add, cscale as scale, cmag as mag, cpolar as polar, cx, UTILITY_XR, asymFactor, conductorImpedance, deviceTestXr,
  faultLevels, feederFaultImpedance, peakFactor, sourceImpedance, typicalTransformerXr,
} from "./faultMath";
import { computePanelScheduleValues, getActivePoles, isIdleSpareOrSpace, parseSystemVoltage } from "./computeEngine";
import { getConductorAmpacity, getTemperatureForInsulation } from "./pecAmpacityDatabase";

export type { Cx };
export { UTILITY_XR, conductorImpedance, deviceTestXr, typicalTransformerXr };
/** Breaker instantaneous clearing time used for conductor withstand (about 1.5 cycles at 60 Hz) */
export const CLEARING_TIME_S = 0.025;

/** Adiabatic constant k (A·√s/mm²) for the conductor */
export function adiabaticK(material: "Copper" | "Aluminum", insulation: string): number {
  const xlpe = /XHHW|XLPE|EPR|XHH|RHW/i.test(insulation || "");
  if (material === "Aluminum") return xlpe ? 94 : 76;
  return xlpe ? 143 : 115;
}

// ------------------------------------------------------------------------------------------ types
export type Status = "pass" | "warning" | "fail";
export const worst = (...s: Status[]): Status => (s.includes("fail") ? "fail" : s.includes("warning") ? "warning" : "pass");

export interface FeederInfo {
  label: string;
  size: string;
  sets: number;
  material: "Copper" | "Aluminum";
  insulation: string;
  lengthM: number;
  /** Length not set in the Voltage Drop / Short Circuit inputs (lengthM = 0: fault upper bound, VD not evaluated) */
  lengthAssumed: boolean;
  ampacityA: number;
  breakerAT: number;
  breakerAF: number;
  breakerPoles?: number;
  /** Interrupting rating of the feeder breaker (kA); 0 = not specified */
  breakerKaic?: number;
  /** Where the feeder data came from */
  source: string;
}

export interface BusResult {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  is3Phase: boolean;
  system: string;
  nominalV: number;
  // loads
  connectedVA: number;
  demandVA: number;
  basisVA: number;
  kva: number;
  kw: number;
  kvar: number;
  pf: number;
  /** Current used for loading and voltage drop (A) */
  current: number;
  /** Load Schedule maximum-demand (design) current, for reference (A) */
  demandCurrent: number;
  phaseCurrents: { R: number; Y: number; B: number };
  neutralCurrent: number;
  /** NEMA definition: max deviation from the average / average (%) */
  unbalancePct: number;
  // feeder
  feeder: FeederInfo;
  feederLoadingPct: number;
  breakerLoadingPct: number;
  vdFeederV: number;
  vdFeederPct: number;
  vdCumulativePct: number;
  busVoltage: number;
  /** Feeder voltage drop computed (length and size known) */
  vdEvaluated: boolean;
  /** Every feeder from the transformer to this bus has a voltage drop */
  vdComplete: boolean;
  loadStatus: Status;
  loadNotes: string[];
  // fault
  z1: Cx;
  /** This bus's own feeder, per phase, 20 °C (Ω) */
  zFeeder: Cx;
  xr: number;
  i3ph: number; // kA, bolted, without motors
  motorKA: number;
  iSym: number; // kA, with motor contribution (maximum available)
  iLL: number;
  iLG: number;
  /** Double line-to-ground: highest phase current and earth current (kA) */
  iLLG: number;
  iLLGEarth: number;
  /** A feeder length or size on the path is missing: values are upper bounds */
  faultUpperBound: boolean;
  iPeak: number;
  iAsym: number;
  faultMVA: number;
  mainKaic: number;
  lowestKaic: number;
  lowestDevice: string;
  /** Some interrupting rating is specified for this panel */
  kaicKnown: boolean;
  /** Branch breakers of this panel without an interrupting rating */
  missingBranchKaic: number;
  dutyPct: number;
  /** Duty with the X/R multiplying factor against the device test X/R */
  adjustedDutyPct: number;
  xrMultiplier: number;
  faultStatus: Status;
  /** Feeder conductor short-time withstand */
  withstand: { k: number; areaMm2: number; faultKA: number; maxTimeS: number; status: Status };
}

export interface SourceResult {
  utilityMVA: number;
  utilityXr: number;
  primaryV: number;
  secondaryV: number;
  is3Phase: boolean;
  kva: number;
  zPct: number;
  txXr: number;
  ratedSecondaryA: number;
  ratedPrimaryA: number;
  zUtility: Cx;
  zTransformer: Cx;
  /** Bolted fault at the transformer secondary terminals (kA) */
  terminalFaultKA: number;
  terminalXr: number;
  /** Line-to-ground at the terminals (kA; NaN without a neutral) */
  terminalLGKA: number;
  /** Source data not entered in the project (defaults of the Short Circuit module were used) */
  missing: string[];
  loadingPct: number;
  loadingStatus: Status;
  loadingLimitPct: number;
}

export interface CoordinationDevice {
  id: string;
  label: string;
  at: number;
  af: number;
  instMultiplier: number;
  /** Bus whose fault level applies to faults beyond this device (its load side) */
  loadBusId: string | null;
}

export interface SelectivityResult {
  upstream: CoordinationDevice;
  downstream: CoordinationDevice;
  overloadRatio: number;
  /** Highest fault current (kA) at which the pair stays selective (upstream instantaneous lower tolerance) */
  selectiveUpToKA: number;
  /** Fault at the downstream device load terminals (= upstream bus) */
  faultAtDeviceKA: number;
  faultAtLoadBusKA: number | null;
  status: Status;
  verdict: string;
  detail: string;
}

export interface Finding {
  status: Status;
  area: "Transformer" | "Load Flow" | "Voltage Drop" | "Phase Balance" | "Short Circuit" | "Conductor Withstand" | "Coordination" | "Missing Data";
  location: string;
  title: string;
  detail: string;
  action?: string;
}

export interface PowerAnalysisInput {
  panel: PanelConfig;
  circuits: Circuit[];
  subPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[];
  iscParams: ShortCircuitParams;
  vdCalculations?: VoltageDropCalculation[];
  powerFactor?: number;
  /** Transformer loading limit as a fraction (e.g. 0.8) */
  transformerLoadingLimit?: number;
  basis?: "demand" | "connected";
  /** Feeder length used when a feeder has no length in the project (m) */
  defaultFeederLengthM?: number;
}

export interface PowerAnalysisResult {
  source: SourceResult;
  buses: BusResult[];
  byId: Record<string, BusResult>;
  findings: Finding[];
  basis: "demand" | "connected";
  powerFactor: number;
  assumptions: string[];
  counts: Record<Status, number>;
}

// ------------------------------------------------------------------------------------------ helpers
const PH_ANGLE: Record<string, number> = { R: 0, Y: -120, B: 120 };
const NEXT: Record<string, string> = { R: "Y", Y: "B", B: "R" };

function motorVA(circuits: Circuit[]) {
  return circuits.reduce((s, c) => (!isIdleSpareOrSpace(c) && (c.loadType === LoadType.MOTOR || c.loadType === LoadType.AIR_CON) ? s + (Number(c.loadVA) || 0) : s), 0);
}

/**
 * Line currents (A) of a panel from its circuits as phasors: 3-phase loads balanced, line-to-neutral loads on
 * their phase, line-to-line loads between the two lines (V_ab leads V_a by 30°). Same power factor for all.
 */
function phaseCurrents(p: PanelConfig, circuits: Circuit[]) {
  const sys = parseSystemVoltage(p.system);
  const is3 = sys.is3Phase;
  const vLL = p.voltage || sys.vll || (is3 ? 400 : 230);
  const vLN = is3 ? (sys.vln && sys.vln < vLL ? sys.vln : vLL / Math.sqrt(3)) : vLL;
  const hasNeutral = is3 ? sys.wireCount >= 4 : true;
  const lines: Record<string, Cx> = { R: cx(0, 0), Y: cx(0, 0), B: cx(0, 0) };
  let neutral = cx(0, 0);
  let total1ph = 0;
  for (const c of circuits) {
    if (isIdleSpareOrSpace(c)) continue;
    const va = Number(c.loadVA) || 0;
    if (va <= 0) continue;
    if (!is3) {
      total1ph += va;
      continue;
    }
    const ph = (c.phases || []).filter((x) => x in PH_ANGLE);
    const poles = getActivePoles(c.mcbP);
    if (ph.length === 3 || poles >= 3) {
      const i = va / (Math.sqrt(3) * vLL);
      (["R", "Y", "B"] as const).forEach((l) => (lines[l] = add(lines[l], polar(i, PH_ANGLE[l]))));
      continue;
    }
    const a = ph[0] || "R";
    const lineToLine = poles === 2 || ph.length === 2 || !hasNeutral || (poles !== 1 && p.connectionType === "Line-to-Line");
    if (lineToLine) {
      const b = ph.length === 2 ? ph[1] : NEXT[a];
      const v = c.voltage && c.voltage > vLN * 1.2 ? c.voltage : vLL;
      // Current in phase with V_ab: angle of V_a - V_b
      const vab = add(polar(1, PH_ANGLE[a]), scale(polar(1, PH_ANGLE[b]), -1));
      const ang = (Math.atan2(vab.x, vab.r) * 180) / Math.PI;
      const i = polar(va / v, ang);
      lines[a] = add(lines[a], i);
      lines[b] = add(lines[b], scale(i, -1));
    } else {
      const v = c.voltage && c.voltage < vLL * 0.9 ? c.voltage : vLN;
      const i = polar(va / v, PH_ANGLE[a]);
      lines[a] = add(lines[a], i);
      neutral = add(neutral, i);
    }
  }
  if (!is3) {
    const i = total1ph / (p.voltage || 230);
    return { R: i, Y: 0, B: 0, neutral: i, unbalancePct: 0 };
  }
  const R = mag(lines.R), Y = mag(lines.Y), B = mag(lines.B);
  const avg = (R + Y + B) / 3;
  const unbalancePct = avg > 0 ? (Math.max(Math.abs(R - avg), Math.abs(Y - avg), Math.abs(B - avg)) / avg) * 100 : 0;
  return { R, Y, B, neutral: hasNeutral ? mag(neutral) : 0, unbalancePct };
}

// ------------------------------------------------------------------------------------------ main
export function analysePowerSystem(input: PowerAnalysisInput): PowerAnalysisResult {
  const { panel, circuits, subPanels, iscParams } = input;
  const vd = input.vdCalculations || [];
  const pf = Math.min(1, Math.max(0.5, input.powerFactor ?? 0.85));
  const sinPhi = Math.sqrt(1 - pf * pf);
  const basis = input.basis || "demand";
  const defaultLen = input.defaultFeederLengthM ?? 30;
  const assumptions: string[] = [];

  // ---- source (shared fault math, see faultMath.ts)
  const mdpSys = parseSystemVoltage(panel.system);
  const is3 = iscParams.phaseTypeOverrideEnabled ? iscParams.phaseTypeOverride === "3PH" : mdpSys.is3Phase;
  const secV = iscParams.transformerVoltage || panel.voltage || (is3 ? 400 : 230);
  const priV = iscParams.primaryVoltage || 13800;
  const kva = iscParams.transformerKVA || 500;
  const zPct = iscParams.transformerZ || 5;
  const utilityMVA = iscParams.utilityShortCircuitMVA || 500;
  const src = sourceImpedance(iscParams, secV, is3);
  const txXr = src.txXr;
  const nPar = iscParams.parallelTransformersCount || 1;
  const openDelta = /open/i.test(iscParams.transformerConnection || "");
  const zUtility = src.zUtility;
  const zT = src.zTransformer;
  const zSrc = add(zUtility, zT);
  const terminal = faultLevels(src);
  const ratedSecondaryA = (src.kva * 1000) / (is3 ? Math.sqrt(3) * secV : secV);
  const ratedPrimaryA = (src.kva * 1000) / (is3 ? Math.sqrt(3) * priV : priV);
  const missing: string[] = [];
  if (!iscParams.transformerKVA) missing.push("Transformer kVA not entered (500 kVA default of the Short Circuit module).");
  if (!iscParams.transformerZ) missing.push("Transformer %Z not entered (5% default of the Short Circuit module).");
  if (!iscParams.utilityShortCircuitMVA) missing.push("Utility short-circuit MVA not entered (500 MVA default of the Short Circuit module).");
  assumptions.push(
    `Utility source ${utilityMVA} MVA at X/R ${UTILITY_XR} (assumed; no utility X/R in the project); transformer ${kva} kVA${nPar > 1 ? ` × ${nPar} in parallel` : ""}, Z ${zPct}% at typical X/R ${txXr.toFixed(1)} (IEEE Std 141)${openDelta ? ", open-delta (Z / 0.866)" : ""}.`,
    `Power factor ${pf.toFixed(2)} for all loads. Line currents are phasor sums of the circuits; load flow basis: ${basis === "demand" ? "demand (connected line currents × the Load Schedule demand factor)" : "connected load"}.`,
    "Conductor R and X from PEC 2017 Chapter 9 Table 9 (75 °C, copper in PVC conduit; aluminium R × 1.64); short-circuit resistance corrected to 20 °C.",
    "Faults by symmetrical components with Z2 = Z1; zero sequence: transformer (Dyn) plus phase and equal-size neutral return of each feeder.",
    "Motor fault contribution 4 × motor full-load current (motors and air-conditioning compressors at and below each panel).",
    "Feeders without a length in the project: fault current computed with zero feeder impedance (upper bound) and voltage drop not evaluated.",
  );

  // ---- panels in tree order
  type Node = { id: string; name: string; panel: PanelConfig; circuits: Circuit[]; parentId: string | null; feederCircuit?: Circuit };
  const nodes: Node[] = [{ id: "mdp", name: panel.designation || "MDP", panel, circuits, parentId: null }];
  const seen = new Set<string>(["mdp"]);
  const queue: Node[] = [nodes[0]];
  while (queue.length) {
    const parent = queue.shift()!;
    for (const c of parent.circuits) {
      if (!c.linkedSubPanelId || seen.has(c.linkedSubPanelId)) continue;
      const sp = subPanels.find((s) => s.id === c.linkedSubPanelId);
      if (!sp) continue;
      seen.add(sp.id);
      const node: Node = { id: sp.id, name: sp.panel.designation || sp.id, panel: sp.panel, circuits: sp.circuits, parentId: parent.id, feederCircuit: c };
      nodes.push(node);
      queue.push(node);
    }
  }
  // Sub-panels not linked from any feeder circuit hang from the MDP (feeder data unknown)
  subPanels.forEach((sp) => {
    if (seen.has(sp.id)) return;
    seen.add(sp.id);
    nodes.push({ id: sp.id, name: sp.panel.designation || sp.id, panel: sp.panel, circuits: sp.circuits, parentId: "mdp" });
  });

  const childrenOf = (id: string) => nodes.filter((n) => n.parentId === id);
  const motorsBelow = (id: string): number => {
    const n = nodes.find((x) => x.id === id)!;
    return motorVA(n.circuits.filter((c) => !c.linkedSubPanelId)) + childrenOf(id).reduce((s, ch) => s + motorsBelow(ch.id), 0);
  };

  const buses: BusResult[] = [];
  const byId: Record<string, BusResult> = {};
  const levelOf = (id: string | null): number => (id ? 1 + levelOf(nodes.find((n) => n.id === id)?.parentId ?? null) : 0);

  for (const n of nodes) {
    const sys = parseSystemVoltage(n.panel.system);
    const bus3 = n.id === "mdp" ? is3 : sys.is3Phase;
    const nominalV = n.panel.voltage || (n.id === "mdp" ? secV : byId[n.parentId!]?.nominalV || secV);
    const sched = computePanelScheduleValues(n.panel, n.circuits, { availableSubPanels: subPanels, vdCalculations: vd, panelId: n.id === "mdp" ? undefined : n.id });
    const connectedVA = sched.totalVA || 0;
    const demandVA = sched.totalDemandVA || connectedVA;
    const demandCurrent = sched.mainCurrent?.baseAmp || 0;
    const ph = phaseCurrents(n.panel, n.circuits);
    const basisVA = basis === "demand" ? demandVA : connectedVA;
    // Highest line current (phasor sum of the circuits), scaled by the demand factor for the demand basis
    const maxLine = Math.max(ph.R, ph.Y, ph.B) || connectedVA / (bus3 ? Math.sqrt(3) * nominalV : nominalV);
    const current = basis === "demand" && connectedVA > 0 ? maxLine * (demandVA / connectedVA) : maxLine;
    const kvaB = basisVA / 1000;

    // ---- feeder into this bus
    let feeder: FeederInfo;
    const material = (n.panel.conductorMaterial || panel.conductorMaterial || iscParams.conductorType || "Copper") as "Copper" | "Aluminum";
    if (n.id === "mdp") {
      const mf = sched.mainFeeder;
      const size = iscParams.isFeederSizeCustomized && iscParams.feederSize ? String(iscParams.feederSize) : String(mf?.wire?.size ?? iscParams.feederSize ?? "38");
      const sets = iscParams.isFeederRunsCustomized && iscParams.feederRuns ? iscParams.feederRuns : mf?.wire?.runs || iscParams.feederRuns || 1;
      const ins = panel.insulationType || "THHN";
      const amp = getConductorAmpacity(Number(size), material, getTemperatureForInsulation(ins)) * sets;
      const mainVd = vd.find((v) => v.source === "main");
      const len = iscParams.feederLength || mainVd?.length || 0;
      feeder = {
        label: `${sets > 1 ? `${sets} sets × ` : ""}${size} mm² ${ins} ${material === "Aluminum" ? "Al" : "Cu"}`,
        size, sets, material, insulation: ins,
        lengthM: len, lengthAssumed: !len,
        ampacityA: amp || mf?.wire?.ampacity || 0,
        breakerAT: Number(mf?.cb) || panel.mainBreakerAT || 0,
        breakerAF: Number(mf?.af) || Number(panel.mainBreakerAF) || 0,
        source: "Load Schedule main feeder; length from Short Circuit / Voltage Drop",
      };
    } else if (n.feederCircuit) {
      const c = n.feederCircuit;
      const size = String(c.wireSizeOverride || c.wireSize || "");
      const sets = c.wireSets || (c as any).calculatedWireSets || 1;
      const ins = c.wireTypeOverride || c.wireType || "THHN";
      const amp = size ? getConductorAmpacity(Number(size), material, getTemperatureForInsulation(ins)) * sets : 0;
      const vdRow = vd.find((v) => v.source === n.id) || vd.find((v) => v.source === c.id) || vd.find((v) => v.id === n.id);
      const len = vdRow?.length || 0;
      feeder = {
        label: size ? `${sets > 1 ? `${sets} sets × ` : ""}${size} mm² ${ins} ${material === "Aluminum" ? "Al" : "Cu"}` : "Conductor size not set",
        size: size || "0", sets, material, insulation: ins,
        lengthM: len, lengthAssumed: !len,
        ampacityA: amp,
        breakerAT: Number(c.mcbATOverride || c.mcbAT) || 0,
        breakerAF: Number(c.mcbAF) || 0,
        breakerPoles: getActivePoles(c.mcbP),
        breakerKaic: Number(c.mcbKAIC) || 0,
        source: `Feeder circuit ${c.circuitNo ?? ""} in ${nodes.find((x) => x.id === n.parentId)?.name || "parent"}`.trim(),
      };
    } else {
      feeder = {
        label: "Feeder not linked to a circuit", size: "0", sets: 1, material: "Copper", insulation: "THHN",
        lengthM: 0, lengthAssumed: true, ampacityA: 0, breakerAT: 0, breakerAF: 0,
        source: "Sub-panel not linked from a feeder circuit",
      };
    }
    if (n.id === "mdp") {
      feeder.breakerPoles = getActivePoles((sched.mainFeeder as any)?.poles || (is3 ? 3 : 2)) || (is3 ? 3 : 2);
      feeder.breakerKaic = parseFloat(panel.icRating) || Number(sched.mainFeeder?.kaic) || 0;
    }

    // ---- voltage drop (75 °C table values); not evaluated without a length
    const sizeKnown = Number(feeder.size) > 0;
    const zc = sizeKnown ? conductorImpedance(feeder.size, feeder.material) : cx(0, 0);
    const k = bus3 ? Math.sqrt(3) : 2;
    const vdEvaluated = !feeder.lengthAssumed && sizeKnown;
    const vdFeederV = vdEvaluated ? (k * current * (feeder.lengthM / 1000) * (zc.r * pf + zc.x * sinPhi)) / feeder.sets : 0;
    const vdFeederPct = nominalV > 0 ? (vdFeederV / nominalV) * 100 : 0;
    const parent = n.parentId ? byId[n.parentId] : undefined;
    const vdCumulativePct = (parent?.vdCumulativePct || 0) + vdFeederPct;
    const vdComplete = vdEvaluated && (parent ? parent.vdComplete : true);
    const busVoltage = nominalV * (1 - vdCumulativePct / 100);
    const feederLoadingPct = feeder.ampacityA > 0 ? (current / feeder.ampacityA) * 100 : 0;
    const breakerLoadingPct = feeder.breakerAT > 0 ? (current / feeder.breakerAT) * 100 : 0;

    const loadNotes: string[] = [];
    const sFeeder: Status = !vdEvaluated ? "warning" : vdFeederPct > 3 ? "fail" : vdFeederPct > 2.5 ? "warning" : "pass";
    const sCum: Status = vdCumulativePct > 5 ? "fail" : vdCumulativePct > 3 ? "warning" : "pass";
    const sAmp: Status = feederLoadingPct > 100 ? "fail" : feederLoadingPct > 80 ? "warning" : "pass";
    const sBrk: Status = breakerLoadingPct > 100 ? "fail" : breakerLoadingPct > 80 ? "warning" : "pass";
    const sUnb: Status = bus3 && ph.unbalancePct > 20 ? "fail" : bus3 && ph.unbalancePct > 10 ? "warning" : "pass";
    if (feeder.lengthAssumed) loadNotes.push("Feeder length not set in the project: voltage drop not evaluated; fault current is the upper bound (zero feeder impedance).");
    if (!sizeKnown) loadNotes.push("Feeder conductor size not set.");

    // ---- short circuit (cumulative per-phase feeder impedance from the transformer)
    const zFeeder = sizeKnown && feeder.lengthM > 0 ? feederFaultImpedance(feeder.lengthM, feeder.size, feeder.sets, feeder.material) : cx(0, 0);
    const zPathFeeders = add(parent ? (parent as any)._zFeeders : cx(0, 0), zFeeder);
    const upperBound = feeder.lengthAssumed || !sizeKnown || (parent ? parent.faultUpperBound : false);
    const fl = faultLevels(src, zPathFeeders, { groundReturn: is3 && mdpSys.wireCount >= 4 });
    const zPath = fl.z1;
    let i3ph: number;
    let iLL: number;
    let iLG: number;
    if (!is3) {
      i3ph = fl.i3ph;
      iLL = fl.i3ph;
      iLG = NaN;
    } else if (bus3) {
      i3ph = fl.i3ph;
      iLL = fl.iLL;
      iLG = fl.iLG;
    } else {
      // Single-phase panel fed from a 3-phase system: its worst fault is line-to-line (or line-to-ground)
      i3ph = fl.iLL;
      iLL = fl.iLL;
      iLG = fl.iLG;
    }
    const xr = fl.xr;
    const mVA = motorsBelow(n.id);
    const motorFla = mVA / (bus3 ? Math.sqrt(3) * nominalV : nominalV);
    const motorA = 4 * motorFla;
    const iSymA = Math.max(i3ph, Number.isFinite(iLG) ? iLG : 0) + motorA;
    const iPeak = peakFactor(xr) * Math.SQRT2 * iSymA;
    const iAsym = asymFactor(xr) * iSymA;
    const faultMVA = (bus3 ? Math.sqrt(3) * nominalV : nominalV) * iSymA / 1e6;

    // devices on this bus: the panel's main rating as entered (else the schedule's), and every branch rating
    const mainKaic = parseFloat(n.panel.icRating) || Number(sched.mainFeeder?.kaic) || 0;
    let lowestKaic = mainKaic > 0 ? mainKaic : Infinity;
    let lowestDevice = mainKaic > 0 ? `Main breaker (${mainKaic} kA)` : "";
    let missingKaic = 0;
    n.circuits.forEach((c) => {
      if (isIdleSpareOrSpace(c)) return;
      const r = Number(c.mcbKAIC) || 0;
      if (r <= 0) { missingKaic++; return; }
      if (r < lowestKaic) {
        lowestKaic = r;
        lowestDevice = `Circuit ${c.circuitNo ?? ""} ${c.description ? `(${String(c.description).slice(0, 30)})` : ""} ${r} kA`.replace(/\s+/g, " ").trim();
      }
    });
    const kaicKnown = Number.isFinite(lowestKaic);
    if (!kaicKnown) { lowestKaic = 0; lowestDevice = "Not specified"; }
    if (mainKaic <= 0) loadNotes.push("Main device interrupting rating not specified.");
    if (missingKaic) loadNotes.push(`${missingKaic} branch breaker${missingKaic === 1 ? "" : "s"} without an interrupting rating.`);
    const iKA = iSymA / 1000;
    const dutyPct = kaicKnown ? (iKA / lowestKaic) * 100 : NaN;
    const xrMultiplier = kaicKnown ? Math.max(1, asymFactor(xr) / asymFactor(deviceTestXr(lowestKaic))) : 1;
    const adjustedDutyPct = dutyPct * xrMultiplier;
    const faultStatus: Status = !kaicKnown ? "warning" : adjustedDutyPct > 100 ? "fail" : adjustedDutyPct > 85 ? "warning" : "pass";

    // feeder conductor withstand for a fault at its supply end (parent bus or transformer terminals)
    const kAd = adiabaticK(feeder.material, feeder.insulation);
    const area = (Number(feeder.size) || 0) * feeder.sets;
    const lineEndKA = parent ? parent.iSym : terminal.i3ph / 1000;
    const maxTimeS = area > 0 ? Math.pow((kAd * area) / (lineEndKA * 1000), 2) : NaN;
    const wStatus: Status = !(area > 0) ? "warning" : maxTimeS < CLEARING_TIME_S ? "fail" : maxTimeS < CLEARING_TIME_S * 2 ? "warning" : "pass";

    const bus: BusResult = {
      id: n.id, name: n.name, parentId: n.parentId, level: levelOf(n.parentId) + 1, is3Phase: bus3, system: n.panel.system, nominalV,
      connectedVA, demandVA, basisVA, kva: kvaB, kw: kvaB * pf, kvar: kvaB * sinPhi, pf, current, demandCurrent,
      phaseCurrents: { R: ph.R, Y: ph.Y, B: ph.B }, neutralCurrent: ph.neutral, unbalancePct: bus3 ? ph.unbalancePct : 0,
      feeder, feederLoadingPct, breakerLoadingPct, vdFeederV, vdFeederPct, vdCumulativePct, busVoltage, vdEvaluated, vdComplete,
      loadStatus: worst(sFeeder, sCum, sAmp, sBrk, sUnb), loadNotes,
      z1: zPath, zFeeder, xr, i3ph: i3ph / 1000, motorKA: motorA / 1000, iSym: iKA, iLL: iLL / 1000, iLG: iLG / 1000,
      iLLG: fl.iLLG / 1000, iLLGEarth: fl.iLLGEarth / 1000, faultUpperBound: upperBound,
      iPeak: iPeak / 1000, iAsym: iAsym / 1000, faultMVA,
      mainKaic, lowestKaic, lowestDevice, kaicKnown, missingBranchKaic: missingKaic, dutyPct, adjustedDutyPct, xrMultiplier, faultStatus,
      withstand: { k: kAd, areaMm2: area, faultKA: lineEndKA, maxTimeS, status: wStatus },
      _zFeeders: zPathFeeders,
    } as any;
    buses.push(bus);
    byId[n.id] = bus;
  }

  // ---- transformer loading
  const mdp = byId.mdp;
  const loadLimit = (input.transformerLoadingLimit ?? 0.8) * 100;
  const capacityKva = src.kva;
  const loadingPct = capacityKva > 0 ? (mdp.kva / capacityKva) * 100 : 0;
  const source: SourceResult = {
    utilityMVA, utilityXr: UTILITY_XR, primaryV: priV, secondaryV: secV, is3Phase: is3, kva: capacityKva, zPct, txXr,
    ratedSecondaryA, ratedPrimaryA, zUtility, zTransformer: zT,
    terminalFaultKA: terminal.i3ph / 1000, terminalXr: terminal.xr, terminalLGKA: terminal.iLG / 1000, missing,
    loadingPct, loadingLimitPct: loadLimit,
    loadingStatus: loadingPct > 100 ? "fail" : loadingPct > loadLimit ? "warning" : "pass",
  };

  const findings = buildFindings(source, buses);
  const counts: Record<Status, number> = { pass: 0, warning: 0, fail: 0 };
  findings.forEach((f) => counts[f.status]++);
  buses.forEach((b) => delete (b as any)._zFeeders);
  return { source, buses, byId, findings, basis, powerFactor: pf, assumptions, counts };
}

// ------------------------------------------------------------------------------------------ findings
/** Standard interrupting ratings of LV breakers (kA) */
const STANDARD_KAIC = [10, 14, 18, 22, 25, 30, 35, 42, 50, 65, 85, 100, 150, 200];
function buildFindings(src: SourceResult, buses: BusResult[]): Finding[] {
  const f: Finding[] = [];
  src.missing.forEach((m) => f.push({ status: "warning", area: "Missing Data", location: "Source", title: "Source data not entered", detail: m, action: "Enter the utility and transformer data in Short Circuit." }));
  if (src.loadingStatus !== "pass") {
    f.push({
      status: src.loadingStatus, area: "Transformer", location: `Transformer ${src.kva} kVA`,
      title: src.loadingStatus === "fail" ? "Transformer overloaded" : "Transformer above its loading limit",
      detail: `Loading ${src.loadingPct.toFixed(1)}% of ${src.kva} kVA (limit ${src.loadingLimitPct.toFixed(0)}%).`,
      action: "Increase the transformer rating or reduce the connected demand.",
    });
  }
  for (const b of buses) {
    const loc = b.name;
    if (b.feederLoadingPct > 80) {
      f.push({
        status: b.feederLoadingPct > 100 ? "fail" : "warning", area: "Load Flow", location: loc,
        title: b.feederLoadingPct > 100 ? "Feeder conductor overloaded" : "Feeder conductor above 80% of ampacity",
        detail: `${b.current.toFixed(1)} A on ${b.feeder.label} rated ${b.feeder.ampacityA.toFixed(0)} A (${b.feederLoadingPct.toFixed(0)}%).`,
        action: "Upsize the feeder or add a parallel set.",
      });
    }
    if (b.breakerLoadingPct > 80) {
      f.push({
        status: b.breakerLoadingPct > 100 ? "fail" : "warning", area: "Load Flow", location: loc,
        title: b.breakerLoadingPct > 100 ? "Feeder breaker overloaded" : "Feeder breaker above 80% (continuous load)",
        detail: `${b.current.toFixed(1)} A through a ${b.feeder.breakerAT} AT breaker (${b.breakerLoadingPct.toFixed(0)}%). PEC 2.10.2: continuous load ≤ 80% of the rating.`,
        action: "Use the next breaker rating (with a matching conductor).",
      });
    }
    if (b.vdEvaluated && b.vdFeederPct > 2.5) {
      f.push({
        status: b.vdFeederPct > 3 ? "fail" : "warning", area: "Voltage Drop", location: loc,
        title: b.vdFeederPct > 3 ? "Feeder voltage drop above 3%" : "Feeder voltage drop near 3%",
        detail: `${b.vdFeederV.toFixed(2)} V (${b.vdFeederPct.toFixed(2)}%) over ${b.feeder.lengthM} m of ${b.feeder.label}${b.feeder.lengthAssumed ? " (length assumed)" : ""}.`,
        action: "Increase the conductor size or the number of sets (PEC 2.15.2 FPN No. 2).",
      });
    }
    if (b.vdCumulativePct > 3) {
      // (computed from the feeders that have a length; others add to it)
      f.push({
        status: b.vdCumulativePct > 5 ? "fail" : "warning", area: "Voltage Drop", location: loc,
        title: b.vdCumulativePct > 5 ? "Total voltage drop above 5%" : "Little voltage drop left for branch circuits",
        detail: `Cumulative feeder drop to this panel ${b.vdCumulativePct.toFixed(2)}% (bus ${b.busVoltage.toFixed(1)} V); feeders plus branch circuits should not exceed 5%.`,
        action: "Reduce the drop on the upstream feeders.",
      });
    }
    if (b.is3Phase && b.unbalancePct > 10) {
      f.push({
        status: b.unbalancePct > 20 ? "fail" : "warning", area: "Phase Balance", location: loc,
        title: "Phase currents unbalanced",
        detail: `R ${b.phaseCurrents.R.toFixed(1)} A, Y ${b.phaseCurrents.Y.toFixed(1)} A, B ${b.phaseCurrents.B.toFixed(1)} A: unbalance ${b.unbalancePct.toFixed(1)}%${b.neutralCurrent > 0 ? `, neutral ${b.neutralCurrent.toFixed(1)} A` : ""}.`,
        action: "Move single-phase circuits to the lighter phases (target ≤ 10%).",
      });
    }
    if (!b.kaicKnown) {
      f.push({
        status: "warning", area: "Missing Data", location: loc,
        title: "Interrupting ratings not specified",
        detail: `No kAIC for the main device or the branch breakers; available fault ${b.iSym.toFixed(2)} kA${b.faultUpperBound ? " (upper bound)" : ""} cannot be checked.`,
        action: "Enter the panel interrupting rating (IC rating) and the breaker kAIC in the Load Schedule.",
      });
    } else if (b.faultStatus !== "pass") {
      f.push({
        status: b.faultStatus, area: "Short Circuit", location: loc,
        title: b.faultStatus === "fail" ? "Interrupting rating exceeded" : "Interrupting duty above 85%",
        detail: `Available ${b.iSym.toFixed(2)} kA (X/R ${b.xr.toFixed(1)}, multiplier ${b.xrMultiplier.toFixed(2)}) against the lowest device ${b.lowestDevice}: duty ${b.adjustedDutyPct.toFixed(0)}%.`,
        action: `Use devices rated at least ${STANDARD_KAIC.find((k) => k >= b.iSym * b.xrMultiplier) ?? Math.ceil(b.iSym * b.xrMultiplier)} kA, or a tested series-rated combination.`,
      });
    }
    if (b.kaicKnown && b.missingBranchKaic > 0) {
      f.push({
        status: "warning", area: "Missing Data", location: loc,
        title: "Breakers without an interrupting rating",
        detail: `${b.missingBranchKaic} breaker${b.missingBranchKaic === 1 ? "" : "s"} in this panel have no kAIC; available fault ${b.iSym.toFixed(2)} kA.`,
        action: "Enter the kAIC of every breaker in the Load Schedule.",
      });
    }
    if (b.feeder.lengthAssumed || !(Number(b.feeder.size) > 0)) {
      f.push({
        status: "warning", area: "Missing Data", location: loc,
        title: !(Number(b.feeder.size) > 0) ? "Feeder conductor size not set" : "Feeder length not set",
        detail: `${b.feeder.label}: voltage drop not evaluated; fault currents at this panel and below are upper bounds (feeder impedance taken as zero).`,
        action: b.id === "mdp" ? "Enter the main feeder length in Short Circuit or Voltage Drop." : "Add this feeder to the Voltage Drop module with its length.",
      });
    }
    if (b.withstand.status !== "pass" && Number.isFinite(b.withstand.maxTimeS)) {
      f.push({
        status: b.withstand.status, area: "Conductor Withstand", location: loc,
        title: "Feeder conductor short-time withstand",
        detail: `${b.feeder.label}: withstands ${b.withstand.faultKA.toFixed(2)} kA for ${(b.withstand.maxTimeS * 1000).toFixed(0)} ms (k = ${b.withstand.k}); breaker clearing about ${(CLEARING_TIME_S * 1000).toFixed(0)} ms.`,
        action: "Increase the conductor size or use a current-limiting device.",
      });
    }
  }
  return f.sort((a, b) => (a.status === b.status ? 0 : a.status === "fail" ? -1 : b.status === "fail" ? 1 : a.status === "warning" ? -1 : 1));
}

// ------------------------------------------------------------------------------------------ coordination
/** Typical instantaneous pickup multiple: MCB C-curve upper limit (≤ 63 A) or thermal-magnetic MCCB */
export const defaultInstMultiplier = (at: number) => (at <= 63 ? 10 : 10);

/** Protective devices for the coordination study: the MDP main and every MDP outgoing breaker */
export function coordinationDevices(input: PowerAnalysisInput, result: PowerAnalysisResult): { upstream: CoordinationDevice; downstream: CoordinationDevice[] } {
  const mdp = result.byId.mdp;
  const upstream: CoordinationDevice = {
    id: "mdp-main", label: `${mdp.name} main ${mdp.feeder.breakerAT} AT`, at: mdp.feeder.breakerAT || input.panel.mainBreakerAT || 100,
    af: mdp.feeder.breakerAF, instMultiplier: 10, loadBusId: "mdp",
  };
  const downstream = input.circuits
    .filter((c) => !isIdleSpareOrSpace(c) && Number(c.mcbAT) > 0)
    .map((c) => {
      const at = Number(c.mcbATOverride || c.mcbAT);
      return {
        id: c.id, label: `Ckt ${c.circuitNo ?? ""} ${c.description ? String(c.description).slice(0, 28) : ""} ${at} AT`.replace(/\s+/g, " ").trim(),
        at, af: Number(c.mcbAF) || 0, instMultiplier: defaultInstMultiplier(at), loadBusId: c.linkedSubPanelId || null,
      };
    })
    .sort((a, b) => b.at - a.at);
  return { upstream, downstream };
}

/**
 * Selectivity of an upstream / downstream thermal-magnetic pair. Faults through the downstream device are as
 * high as the fault at its line terminals (the upstream bus); the pair is selective up to the upstream
 * instantaneous pickup at its lower tolerance (−20%).
 */
export function checkSelectivity(up: CoordinationDevice, down: CoordinationDevice, result: PowerAnalysisResult): SelectivityResult {
  const upBus = result.byId[up.loadBusId || "mdp"];
  const loadBus = down.loadBusId ? result.byId[down.loadBusId] : undefined;
  const overloadRatio = down.at > 0 ? up.at / down.at : 0;
  const selectiveUpToKA = (0.8 * up.at * up.instMultiplier) / 1000;
  const faultAtDeviceKA = upBus?.iSym || 0;
  const faultAtLoadBusKA = loadBus ? loadBus.iSym : null;
  const downInst = down.at * down.instMultiplier;
  let status: Status = "pass";
  let verdict = "Selective";
  let detail = "";
  if (up.at <= down.at) {
    status = "fail";
    verdict = "Not selective (ratings)";
    detail = `The upstream rating ${up.at} AT is not above the downstream ${down.at} AT.`;
  } else if (downInst * 1.2 >= up.at * up.instMultiplier * 0.8) {
    status = "fail";
    verdict = "Instantaneous bands overlap";
    detail = `Downstream instantaneous pickup ${downInst.toFixed(0)} A (+20%) reaches the upstream pickup ${(up.at * up.instMultiplier).toFixed(0)} A (−20%).`;
  } else if (faultAtDeviceKA > selectiveUpToKA) {
    status = "warning";
    verdict = `Selective up to ${selectiveUpToKA.toFixed(2)} kA only`;
    detail = `Faults just downstream of the ${down.at} AT breaker can reach ${faultAtDeviceKA.toFixed(2)} kA, above the upstream instantaneous pickup (${(up.at * up.instMultiplier).toFixed(0)} A, −20%): both may trip. ${faultAtLoadBusKA !== null ? `Faults at the fed panel (${faultAtLoadBusKA.toFixed(2)} kA) are ${faultAtLoadBusKA > selectiveUpToKA ? "also above" : "below"} this limit. ` : ""}Total selectivity needs manufacturer selectivity tables or an upstream breaker with short-time delay.`;
  } else {
    detail = `Highest fault through the downstream breaker ${faultAtDeviceKA.toFixed(2)} kA is below the upstream instantaneous pickup (${selectiveUpToKA.toFixed(2)} kA at −20%).`;
  }
  if (status === "pass" && overloadRatio < 2) {
    status = "warning";
    verdict = "Selective, narrow overload margin";
    detail += ` Rating ratio ${overloadRatio.toFixed(2)} (< 2): the thermal bands may touch under sustained overloads.`;
  }
  return { upstream: up, downstream: down, overloadRatio, selectiveUpToKA, faultAtDeviceKA, faultAtLoadBusKA, status, verdict, detail };
}

// ------------------------------------------------------------------------------------------ TCC curves
/** Representative thermal-magnetic curve: time (s) at a current (A); manufacturer curves govern */
export function breakerTripTime(at: number, instMultiplier: number, i: number): number | null {
  if (i < at * 1.05) return null;
  if (i >= at * instMultiplier) return 0.02;
  const m = i / at;
  // IEC 60947-2 style inverse-time band, ~1 h at 1.05×, ~4–10 s at 6×
  return Math.min(3600, 80 / (m * m - 1) + 0.05);
}

/** ANSI/IEEE C57.109 through-fault curve (category II) referred to the secondary (current A, time s) */
export function transformerDamagePoints(ratedA: number): Array<[number, number]> {
  return [[2, 1800], [3, 300], [4.75, 60], [6.3, 30], [11.3, 10], [25, 2]].map(([m, t]) => [m * ratedA, t]);
}

/** Conductor adiabatic damage curve I = k·S / √t */
export function cableDamagePoints(k: number, areaMm2: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let t = 0.01; t <= 10.0001; t *= 1.5) pts.push([(k * areaMm2) / Math.sqrt(t), t]);
  return pts;
}

/** Largest motor fed from the MDP: full-load and locked-rotor current (6 × FLA, 5 s acceleration) */
export function largestMotor(panel: PanelConfig, circuits: Circuit[]) {
  const sys = parseSystemVoltage(panel.system);
  let best: { name: string; fla: number; lra: number } | null = null;
  for (const c of circuits) {
    if (isIdleSpareOrSpace(c) || (c.loadType !== LoadType.MOTOR && c.loadType !== LoadType.AIR_CON)) continue;
    const three = (c.phases || []).length === 3 || getActivePoles(c.mcbP) >= 3;
    const v = c.voltage || panel.voltage || 230;
    const fla = (Number(c.loadVA) || 0) / (three && sys.is3Phase ? Math.sqrt(3) * v : v);
    if (!best || fla > best.fla) best = { name: String(c.description || `Ckt ${c.circuitNo}`), fla, lra: fla * 6 };
  }
  return best;
}
