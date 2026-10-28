import type { Circuit, ShortCircuitParams } from "../types";
import type { SolarCalculationResults, SolarDesignConfig } from "../types/solar";
import { INITIAL_SHORT_CIRCUIT_PARAMS } from "../constants";
import { cadd, cmag, conductorImpedance, faultLevels, feederFaultImpedance, type FaultLevels } from "./faultMath";
import { serviceFaultStudy } from "./serviceFault";
import { stringsPerInverter } from "../components/solar/SolarSLDPictorial";

/**
 * Solar short-circuit (point-to-point) and voltage-drop studies, built from the solar design and the
 * project's service data (Short Circuit module: utility, transformer and service feeder). Shared by the
 * Solar Design tabs, the SLD sheet diagrams and every Solar export so they all show the same numbers.
 *
 * Short circuit: the utility and transformer impedances and the service feeder use the same method as
 * the Short Circuit page (serviceFaultStudy / faultMath, PEC Ch. 9 Table 9 R and X with R at 20 °C).
 * Inverters add a limited fault current (INVERTER_FAULT_PU x max AC current, per unit). On the DC side
 * the PV array is current-limited: a string carries 1.25 x Isc (PEC 6.90.8(A)(1)) and a faulted string
 * can be back-fed by the other strings of the same inverter input.
 *
 * Voltage drop: the DC string and the inverter AC circuit use the engine values (PEC Ch. 9 Table 8 R at
 * 75 °C, unity power factor); the service feeder (panel -> service point) carries the solar export
 * current over the Short Circuit module feeder (length, size, sets, material).
 */

/** Inverter fault contribution, per unit of the maximum AC current (typical 1.1 - 1.5; confirm with the maker) */
export const INVERTER_FAULT_PU = 1.5;
/** Recommended total drop from the PV array to the service point (PEC 2017 2.15.2(A) FPN No. 2: 5 % total) */
export const TOTAL_DROP_LIMIT_PCT = 5;

export interface SolarFaultPoint {
  id: string;
  /** F1, F2... as drawn on the point-to-point diagram */
  tag: string;
  location: string;
  side: "AC" | "DC";
  /** Available fault current used for the device check, A */
  amps: number;
  /** Grid part and inverter / string part of `amps`, A */
  gridAmps: number;
  contributionAmps: number;
  /** Fault type the value is for (3PH, L-L, L-G, 1PH loop, DC) */
  faultType: string;
  xr: number | null;
  /** Total impedance to the fault, Ω (AC); null on the DC side */
  zOhm: number | null;
  device: string;
  /** Interrupting rating of the device, kA */
  ratingKa: number;
  ok: boolean;
  basis: string;
}

export interface SolarShortCircuitStudy {
  vService: number;
  is3Phase: boolean;
  serviceLabel: string;
  utilityMva: number;
  primaryKv: number;
  transformerKva: number;
  transformerZPct: number;
  transformerXr: number;
  feeder: { lengthM: number; size: string; runs: number; material: string };
  acCable: { lengthM: number; sizeMm2: number };
  dcCable: { lengthM: number; sizeMm2: number };
  inverterQty: number;
  inverterContributionEachA: number;
  stringsPerInverterMax: number;
  stringIscMaxA: number;
  points: SolarFaultPoint[];
  allOk: boolean;
  usesProjectData: boolean;
}

export interface SolarDropSegment {
  id: string;
  from: string;
  to: string;
  side: "DC" | "AC";
  cable: string;
  lengthM: number;
  sizeMm2: number;
  runs: number;
  currentA: number;
  basisV: number;
  formula: string;
  vdV: number;
  vdPct: number;
  limitPct: number;
  ok: boolean;
}

export interface SolarVoltageDropStudy {
  segments: SolarDropSegment[];
  /** Cumulative drop at the end of each segment (array -> service), % */
  cumulativePct: number[];
  dcPct: number;
  acPct: number;
  totalPct: number;
  totalLimitPct: number;
  totalOk: boolean;
  allOk: boolean;
}

const round = (v: number, d = 2) => Number(v.toFixed(d));

/** Short panel name for drawings: the abbreviation in brackets ("MAIN DISTRIBUTION PANEL (MDP)" -> "MDP") */
export function shortPanelName(name?: string): string {
  const n = (name || "MDP").trim();
  const m = /\(([^)]+)\)/.exec(n);
  return (m ? m[1] : n).trim().toUpperCase();
}

/** Fault type that loads a single inverter output circuit (its connection on the service) */
function circuitFault(calc: SolarCalculationResults, levels: FaultLevels, is3Phase: boolean): { amps: number; type: string } {
  if (!is3Phase) return { amps: levels.i3ph, type: "1PH" };
  const conn = calc.acSystem?.inverterConnection;
  if (conn === "1PH-LN" && Number.isFinite(levels.iLG)) return { amps: levels.iLG, type: "L-G" };
  if (conn === "1PH-LL" || conn === "1PH-LN") return { amps: levels.iLL, type: "L-L" };
  return { amps: levels.i3ph, type: "3PH" };
}

export function solarShortCircuitStudy(
  config: SolarDesignConfig,
  calc: SolarCalculationResults,
  iscParams?: ShortCircuitParams | null,
  panel?: { kaic?: number; designation?: string; circuits?: Circuit[]; voltage?: number } | null
): SolarShortCircuitStudy {
  const eff = calc.effective;
  const params: ShortCircuitParams = { ...INITIAL_SHORT_CIRCUIT_PARAMS, ...(iscParams || {}) };
  const usesProjectData = Boolean(iscParams);
  const is3Phase = (calc.acSystem?.service || (config.utilityPhase?.includes("3PH") ? "3PH-3W" : "1PH-2W")) !== "1PH-2W";
  const vService = params.transformerVoltage || config.utilityVoltage || 230;
  const study = serviceFaultStudy(params, is3Phase, panel?.circuits || [], [], vService);
  const q = Math.max(1, eff.inverterQuantity);
  const invContribution = INVERTER_FAULT_PU * (calc.inverterMaxAcCurrent || calc.inverterRatedAcCurrent || 0);
  const kaic = (ka: number) => (ka > 0 ? ka : 10);
  const mdpKa = kaic(panel?.kaic || 10);
  const acKa = kaic(eff.acKaic);

  // F1: transformer secondary / service entrance (grid only)
  const f1 = study.atTerminals;
  // F2: panel bus at the point of interconnection: grid + motors + every inverter
  const f2Grid = study.iscTotal;
  const f2Inv = q * invContribution;
  // F3: inverter AC output breaker, at the far end of the inverter AC circuit (grid + the other inverters)
  const acLength = config.cabling.acCable.lengthM || 40;
  const acZ = feederFaultImpedance(acLength, eff.acCableSizeMm2, 1, "Copper");
  const f3Levels = faultLevels(study.src, cadd(study.zFeederOhm, acZ), { groundReturn: is3Phase });
  const f3 = circuitFault(calc, f3Levels, is3Phase);
  // A fault on the inverter side of its breaker: the breaker carries the grid and the other inverters
  const f3Inv = (q - 1) * invContribution;
  // DC side: worst inverter input
  const nMax = Math.max(...stringsPerInverter(eff.numberOfStrings, q));
  const iscMax = 1.25 * calc.stringIsc;
  const dcInput = nMax * iscMax;
  const backfeed = Math.max(0, nMax - 1) * iscMax;
  const fuseKa = kaic(config.dcProtection?.fuseKaic || 10);
  const isoKa = kaic(config.dcProtection?.isolatorKaic || 10);
  const panelName = shortPanelName(panel?.designation);
  const serviceLabel = calc.acSystem?.serviceLabel || (is3Phase ? "3PH" : "1PH 2W");

  const ac = (tag: string, id: string, location: string, grid: number, contrib: number, type: string, lv: FaultLevels, device: string, ka: number, basis: string): SolarFaultPoint => {
    const amps = grid + contrib;
    return { id, tag, location, side: "AC", amps: round(amps, 0), gridAmps: round(grid, 0), contributionAmps: round(contrib, 0), faultType: type, xr: round(lv.xr, 2), zOhm: round(cmag(lv.z1), 5), device, ratingKa: ka, ok: amps <= ka * 1000, basis };
  };

  const points: SolarFaultPoint[] = [
    ac("F1", "service", "SERVICE ENTRANCE (TRANSFORMER SECONDARY)", f1.i3ph, 0, is3Phase ? "3PH" : "1PH", f1, `${panelName} MAIN BREAKER`, mdpKa, "Utility + transformer (Short Circuit module)"),
    ac("F2", "poi", `${panelName} BUS - POINT OF INTERCONNECTION`, f2Grid, f2Inv, is3Phase ? "3PH" : "1PH", study.atPoint, `SOLAR MAIN / BACK-FEED BREAKER ${calc.acMainDisconnectAmps}A`, Math.min(mdpKa, acKa), `Grid via service feeder${study.motorContribution > 0 ? " + motors" : ""} + ${q} inverter(s) x ${INVERTER_FAULT_PU} x Imax`),
    ac("F3", "inv-ac", "INVERTER AC OUTPUT BREAKER", f3.amps, f3Inv, f3.type, f3Levels, `INVERTER AC BREAKER ${eff.acBreakerAtAmps}AT`, acKa, `Grid via feeder + ${acLength} m AC cable${q > 1 ? ` + ${q - 1} other inverter(s)` : ""}`),
    {
      id: "dc-input", tag: "F4", location: "INVERTER DC INPUT / DC ISOLATOR", side: "DC",
      amps: round(dcInput, 1), gridAmps: 0, contributionAmps: round(dcInput, 1), faultType: "DC", xr: null, zOhm: null,
      device: `DC ISOLATOR ${eff.dcIsolatorRatingAmps}A`, ratingKa: isoKa, ok: dcInput <= isoKa * 1000,
      basis: `${nMax} string(s) x 1.25 x Isc ${calc.stringIsc} A (PEC 6.90.8(A)(1))`,
    },
    {
      id: "dc-string", tag: "F5", location: "PV STRING (REVERSE FAULT CURRENT)", side: "DC",
      amps: round(backfeed, 1), gridAmps: 0, contributionAmps: round(backfeed, 1), faultType: "DC", xr: null, zOhm: null,
      device: `STRING DC BREAKER ${eff.dcFuseRatingAmps}A`, ratingKa: fuseKa, ok: backfeed <= fuseKa * 1000,
      basis: `Back-feed from ${Math.max(0, nMax - 1)} parallel string(s) x 1.25 x Isc (PEC 6.90.9)`,
    },
  ];

  return {
    vService,
    is3Phase,
    serviceLabel,
    utilityMva: params.utilityShortCircuitMVA || 500,
    primaryKv: round((params.primaryVoltage || 34500) / 1000, 2),
    transformerKva: study.src.kva,
    transformerZPct: params.transformerZ || 5,
    transformerXr: round(study.src.txXr, 2),
    feeder: { lengthM: params.feederLength || 10, size: String(params.feederSize || "30"), runs: params.feederRuns || 1, material: params.conductorType || "Copper" },
    acCable: { lengthM: acLength, sizeMm2: eff.acCableSizeMm2 },
    dcCable: { lengthM: config.cabling.dcCable.lengthM || 35, sizeMm2: eff.dcCableSizeMm2 },
    inverterQty: q,
    inverterContributionEachA: round(invContribution, 1),
    stringsPerInverterMax: nMax,
    stringIscMaxA: round(iscMax, 2),
    points,
    allOk: points.every((p) => p.ok),
    usesProjectData,
  };
}

export function solarVoltageDropStudy(
  config: SolarDesignConfig,
  calc: SolarCalculationResults,
  iscParams?: ShortCircuitParams | null
): SolarVoltageDropStudy {
  const eff = calc.effective;
  const params: ShortCircuitParams = { ...INITIAL_SHORT_CIRCUIT_PARAMS, ...(iscParams || {}) };
  const dcLimit = config.cabling.dcMaxDropPercent || 1.5;
  const acLimit = config.cabling.acMaxDropPercent || 1.5;
  const inv = calc.selectedInverter;
  const invAcV = inv?.acVoltage || config.utilityVoltage || 230;
  const is3Inv = Boolean(calc.acSystem?.inverterIs3Phase);
  const isService3 = (calc.acSystem?.service || "1PH-2W") !== "1PH-2W";
  const vService = params.transformerVoltage || config.utilityVoltage || 230;

  // Service feeder: panel -> service point, all inverters exporting (highest line current)
  const fLen = params.feederLength || 10;
  const fRuns = Math.max(1, params.feederRuns || 1);
  const fMat = params.conductorType || "Copper";
  const fz = conductorImpedance(params.feederSize || "30", fMat);
  const fI = calc.acSystem?.interconnectionLineCurrent || calc.totalSystemAcCurrent || 0;
  const fK = isService3 ? Math.sqrt(3) : 2;
  const fVd = (fK * fI * fz.r * fLen) / 1000 / fRuns;
  const fPct = vService > 0 ? (fVd / vService) * 100 : 0;

  const segments: SolarDropSegment[] = [
    {
      id: "dc", from: "PV STRING", to: "INVERTER DC INPUT", side: "DC",
      cable: config.cabling.dcCable.insulation || "PV1-F Solar Cable",
      lengthM: config.cabling.dcCable.lengthM || 35, sizeMm2: eff.dcCableSizeMm2, runs: 1,
      currentA: round(calc.stringImp, 2), basisV: round(calc.stringVmp, 1), formula: "VD = 2 x I x R x L",
      vdV: calc.dcVoltageDropV, vdPct: calc.dcVoltageDropPercent, limitPct: dcLimit, ok: calc.dcVoltageDropPercent <= dcLimit,
    },
    {
      id: "ac", from: "INVERTER AC OUTPUT", to: "POINT OF INTERCONNECTION", side: "AC",
      cable: config.cabling.acCable.insulation || "THHN / THWN-2",
      lengthM: config.cabling.acCable.lengthM || 40, sizeMm2: eff.acCableSizeMm2, runs: 1,
      currentA: round(calc.inverterMaxAcCurrent, 1), basisV: invAcV, formula: is3Inv ? "VD = 1.732 x I x R x L" : "VD = 2 x I x R x L",
      vdV: calc.acVoltageDropV, vdPct: calc.acVoltageDropPercent, limitPct: acLimit, ok: calc.acVoltageDropPercent <= acLimit,
    },
    {
      id: "service", from: "POINT OF INTERCONNECTION", to: "SERVICE ENTRANCE", side: "AC",
      cable: `SERVICE FEEDER (${fMat === "Aluminum" ? "AL" : "CU"})`,
      lengthM: fLen, sizeMm2: Number(fz.size), runs: fRuns,
      currentA: round(fI, 1), basisV: vService, formula: `${isService3 ? "VD = 1.732" : "VD = 2"} x I x R x L${fRuns > 1 ? ` / ${fRuns}` : ""}`,
      vdV: round(fVd, 2), vdPct: round(fPct, 2), limitPct: acLimit, ok: fPct <= acLimit,
    },
  ];
  const cumulativePct: number[] = [];
  segments.reduce((s, seg) => {
    const v = round(s + seg.vdPct, 2);
    cumulativePct.push(v);
    return v;
  }, 0);
  const dcPct = segments[0].vdPct;
  const acPct = round(segments[1].vdPct + segments[2].vdPct, 2);
  const totalPct = cumulativePct[cumulativePct.length - 1];
  const totalOk = totalPct <= TOTAL_DROP_LIMIT_PCT;
  return { segments, cumulativePct, dcPct, acPct, totalPct, totalLimitPct: TOTAL_DROP_LIMIT_PCT, totalOk, allOk: totalOk && segments.every((s) => s.ok) };
}

/** kA text for drawings */
export const kaText = (amps: number) => (amps >= 1000 ? `${(amps / 1000).toFixed(2)} kA` : `${amps.toFixed(amps < 100 ? 1 : 0)} A`);

export interface SolarStudies {
  sc: SolarShortCircuitStudy;
  vd: SolarVoltageDropStudy;
  /** Panel the system connects to, as named on the drawings */
  panelName: string;
}

/** Both studies for a design. Without the project data the Short Circuit module defaults are used. */
export function computeSolarStudies(
  config: SolarDesignConfig,
  calc: SolarCalculationResults,
  iscParams?: ShortCircuitParams | null,
  panelData?: { designation?: string; mainFeeder?: { kaic?: number }; circuits?: Circuit[] } | null
): SolarStudies {
  const panelName = panelData?.designation || "MAIN DISTRIBUTION PANEL (MDP)";
  return {
    sc: solarShortCircuitStudy(config, calc, iscParams, { kaic: panelData?.mainFeeder?.kaic, designation: panelName, circuits: panelData?.circuits }),
    vd: solarVoltageDropStudy(config, calc, iscParams),
    panelName,
  };
}
