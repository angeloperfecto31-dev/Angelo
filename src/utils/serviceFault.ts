import { LoadType, type Circuit, type ShortCircuitParams } from "../types";
import { calculateEquivalentFeederImpedance } from "./computeEngine";
import { R20_AL, R20_CU, cmag, cx, faultLevels, peakFactor, sourceImpedance } from "./faultMath";

/**
 * How the service feeder runs are combined. Runs taken from the Load Schedule are parallel sets of the
 * main feeder, so they are always in parallel; "Series" applies only to runs the user entered.
 */
export function feederConnection(params: ShortCircuitParams): "Series" | "Parallel" {
  if ((params.feederRuns || 1) > 1 && !params.isFeederRunsCustomized) return "Parallel";
  return params.connectionType || "Series";
}

/**
 * Service short-circuit study (utility -> transformer -> service feeder -> fault point), shared by the
 * Short Circuit page and the AutoCAD export so both show the same numbers.
 */
export function serviceFaultStudy(
  params: ShortCircuitParams,
  is3Phase: boolean,
  circuits: Circuit[] = [],
  subPanels: { circuits: Circuit[] }[] = [],
  panelVoltage?: number,
) {
  const isMotor = (c: Circuit) => c.loadType === LoadType.MOTOR || c.loadType === LoadType.AIR_CON;
  const motorLoadVA = [circuits, ...subPanels.map((sp) => sp.circuits || [])]
    .flat()
    .reduce((s, c) => (isMotor(c) ? s + (c.loadVA || 0) : s), 0);

  const condType = params.conductorType || "Copper";
  const connectionType = feederConnection(params);
  const eqFeeder = calculateEquivalentFeederImpedance(
    params.feederLength || 10,
    params.feederSize || "30",
    params.feederRuns || 1,
    condType,
    connectionType,
    params.parallelFeedersSizeMatch !== false,
    params.parallelFeedersLengthMatch !== false,
    params.parallelFeedersMaterialMatch !== false,
    params.parallelFeedersCustomSizes,
    params.parallelFeedersCustomLengths,
    params.parallelFeedersCustomMaterials,
  );

  const vSec = params.transformerVoltage || panelVoltage || 230;
  const src = sourceImpedance(params, vSec, is3Phase);
  // Feeder resistance at 20 °C for the maximum fault
  const zFeederOhm = cx(eqFeeder.r * (condType === "Aluminum" ? R20_AL : R20_CU), eqFeeder.x);
  const atTerminals = faultLevels(src);
  const atPoint = faultLevels(src, zFeederOhm, { groundReturn: is3Phase });
  const k = is3Phase ? Math.sqrt(3) : 1;
  const motorContribution = motorLoadVA > 0 ? (motorLoadVA / (k * vSec)) * 4 : 0;
  const iscTotal = atPoint.i3ph + motorContribution;

  return {
    connectionType,
    vSec,
    src,
    eqFeeder,
    zFeederOhm,
    atTerminals,
    atPoint,
    motorLoadVA,
    zUtilitypu: cmag(src.zUtility) / src.zBase,
    zTranspu: cmag(src.zTransformer) / src.zBase,
    zFeederpu: (cmag(zFeederOhm) * (is3Phase ? 1 : 2)) / src.zBase,
    totalZpu: cmag(atPoint.z1) / src.zBase,
    iFullLoad: (src.kva * 1000) / (k * vSec),
    /** Utility fault level on the primary, A */
    fault1Isc: ((params.utilityShortCircuitMVA || 500) * 1e6) / (Math.sqrt(3) * (params.primaryVoltage || 34500)),
    /** At the transformer secondary terminals, A */
    iscMainBreaker: atTerminals.i3ph,
    /** At the end of the service feeder, without motors, A */
    iscFaultPoint: atPoint.i3ph,
    motorContribution,
    /** At the end of the service feeder, with motors, A */
    iscTotal,
    iscPeak: peakFactor(atPoint.xr) * Math.SQRT2 * iscTotal,
  };
}
