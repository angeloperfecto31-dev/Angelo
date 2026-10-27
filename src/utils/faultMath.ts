/**
 * Shared short-circuit mathematics (complex impedances in ohms at the transformer secondary voltage).
 * Used by the Load Schedule / Short Circuit modules (calculatePanelFault), the Power Analysis Suite and the
 * Single Line Impedance Diagram so that every fault value in the project comes from one method:
 *
 * - Utility: Z = V² / S_sc at X/R 10 (no utility X/R input in the project).
 * - Transformer: Z = Z% · V² / S at the typical X/R for its kVA (IEEE Std 141); open delta Z / 0.866;
 *   parallel units combined as admittances. Single-phase: the same Z is the loop impedance.
 * - Feeders: PEC 2017 Ch. 9 Table 9 R and X (75 °C) with R corrected to 20 °C for maximum fault current.
 * - Faults by symmetrical components with Z2 = Z1. Zero sequence: the transformer (Dyn, the delta blocks the
 *   utility) plus 4 × the feeder phase impedance (phase + neutral return of equal size).
 */
import type { ShortCircuitParams } from "../types";
import { WIRE_IMPEDANCE_TABLE } from "../constants";

export interface Cx { r: number; x: number }
export const cx = (r: number, x: number): Cx => ({ r, x });
export const cadd = (...zs: Cx[]): Cx => zs.reduce((a, b) => ({ r: a.r + b.r, x: a.x + b.x }), cx(0, 0));
export const cscale = (z: Cx, k: number): Cx => cx(z.r * k, z.x * k);
export const cmag = (z: Cx) => Math.hypot(z.r, z.x);
export const cmul = (a: Cx, b: Cx): Cx => cx(a.r * b.r - a.x * b.x, a.r * b.x + a.x * b.r);
export const cdiv = (a: Cx, b: Cx): Cx => {
  const d = b.r * b.r + b.x * b.x || 1e-12;
  return cx((a.r * b.r + a.x * b.x) / d, (a.x * b.r - a.r * b.x) / d);
};
export const cpolar = (m: number, deg: number): Cx => cx(m * Math.cos((deg * Math.PI) / 180), m * Math.sin((deg * Math.PI) / 180));
/** Impedance of magnitude m at the given X/R */
export const withXr = (m: number, xr: number): Cx => {
  const d = Math.sqrt(1 + xr * xr);
  return cx(m / d, (m * xr) / d);
};

export const UTILITY_XR = 10;
/** 75 °C table resistance to 20 °C (copper / aluminium) */
export const R20_CU = (234.5 + 20) / (234.5 + 75);
export const R20_AL = (228 + 20) / (228 + 75);

/** Typical transformer X/R by kVA (IEEE Std 141 Red Book) */
const TX_XR: Array<[number, number]> = [
  [25, 1.1], [50, 1.4], [75, 1.6], [112.5, 2.0], [150, 2.4], [225, 3.0], [300, 3.6], [500, 4.7],
  [750, 5.7], [1000, 6.3], [1500, 7.5], [2000, 8.4], [2500, 9.0], [3000, 9.6], [5000, 11],
];
export function typicalTransformerXr(kva: number): number {
  if (kva <= TX_XR[0][0]) return TX_XR[0][1];
  for (let i = 1; i < TX_XR.length; i++) {
    const [k1, v1] = TX_XR[i - 1];
    const [k2, v2] = TX_XR[i];
    if (kva <= k2) return v1 + ((v2 - v1) * Math.log(kva / k1)) / Math.log(k2 / k1);
  }
  return TX_XR[TX_XR.length - 1][1];
}

/** R and X (Ω/km per conductor, 75 °C) for a size; the nearest table size when not listed */
export function conductorImpedance(size: string | number, material: "Copper" | "Aluminum" = "Copper"): Cx & { size: string } {
  const n = Number(size);
  const keys = Object.keys(WIRE_IMPEDANCE_TABLE);
  let key = keys.find((k) => Number(k) === n);
  if (!key && Number.isFinite(n) && n > 0) key = keys.reduce((best, k) => (Math.abs(Number(k) - n) < Math.abs(Number(best) - n) ? k : best), keys[0]);
  const t = WIRE_IMPEDANCE_TABLE[key || "14"];
  return { r: t.r * (material === "Aluminum" ? 1.64 : 1), x: t.x, size: key || "14" };
}

/** Per-phase feeder impedance for maximum fault (R at 20 °C), Ω */
export function feederFaultImpedance(lengthM: number, size: string | number, sets = 1, material: "Copper" | "Aluminum" = "Copper"): Cx {
  const z = conductorImpedance(size, material);
  const k = lengthM / 1000 / Math.max(1, sets);
  return cx(z.r * (material === "Aluminum" ? R20_AL : R20_CU) * k, z.x * k);
}

export interface SourceImpedance {
  /** Secondary voltage (line-to-line for 3-phase), V */
  v: number;
  is3Phase: boolean;
  zUtility: Cx;
  zTransformer: Cx;
  /** Total transformer capacity (kVA, all parallel units) */
  kva: number;
  txXr: number;
  /** Base impedance V² / S of the first transformer, Ω */
  zBase: number;
}

/** Utility and transformer impedances referred to the secondary */
export function sourceImpedance(p: ShortCircuitParams, v: number, is3Phase: boolean): SourceImpedance {
  const kva = p.transformerKVA || 500;
  const zPct = p.transformerZ || 5;
  const openDelta = /open/i.test(p.transformerConnection || "");
  const zBase = (v * v) / (kva * 1000);
  const zUtility = withXr((v * v) / ((p.utilityShortCircuitMVA || 500) * 1e6), UTILITY_XR);
  const txXr = typicalTransformerXr(kva);
  let zT = withXr(((zPct / 100) * zBase) / (openDelta ? 0.866 : 1), txXr);
  let total = kva;
  const n = p.parallelTransformersCount || 1;
  if (n > 1) {
    if (p.parallelTransformersZMatch !== false && p.parallelTransformerskVAMatch !== false) {
      zT = cscale(zT, 1 / n);
      total = kva * n;
    } else {
      const k2 = p.parallelTransformersRating || kva;
      const z2 = withXr((((p.parallelTransformersZ || zPct) / 100) * ((v * v) / (k2 * 1000))) / (openDelta ? 0.866 : 1), typicalTransformerXr(k2));
      const inv = (z: Cx) => cdiv(cx(1, 0), z);
      zT = inv(cadd(inv(zT), cscale(inv(z2), n - 1)));
      total = kva + (n - 1) * k2;
    }
  }
  return { v, is3Phase, zUtility, zTransformer: zT, kva: total, txXr, zBase };
}

export interface FaultLevels {
  /** Bolted 3-phase (3-phase systems) or line-to-line (single-phase systems), A */
  i3ph: number;
  iLL: number;
  /** Line-to-ground (3-phase 4-wire); NaN where not applicable */
  iLG: number;
  /** Double line-to-ground: highest phase current and the earth current 3·I0, A */
  iLLG: number;
  iLLGEarth: number;
  z1: Cx;
  z0: Cx;
  xr: number;
}

/**
 * Fault currents at a point downstream of the source through the given per-phase feeder impedance.
 * Single-phase systems: the loop through both conductors, one bolted value.
 */
export function faultLevels(src: SourceImpedance, feeder: Cx = cx(0, 0), opts: { groundReturn?: boolean } = {}): FaultLevels {
  if (!src.is3Phase) {
    const loop = cadd(src.zUtility, src.zTransformer, cscale(feeder, 2));
    const i = src.v / cmag(loop);
    return { i3ph: i, iLL: i, iLG: NaN, iLLG: NaN, iLLGEarth: NaN, z1: loop, z0: loop, xr: loop.r > 0 ? loop.x / loop.r : 10 };
  }
  const e = src.v / Math.sqrt(3);
  const z1 = cadd(src.zUtility, src.zTransformer, feeder);
  const z0 = cadd(src.zTransformer, cscale(feeder, 4));
  const i3ph = e / cmag(z1);
  const iLL = (Math.sqrt(3) / 2) * i3ph;
  const ground = opts.groundReturn !== false;
  const iLG = ground ? (3 * e) / cmag(cadd(cscale(z1, 2), z0)) : NaN;
  let iLLG = NaN;
  let iLLGEarth = NaN;
  if (ground) {
    // I1 = E / (Z1 + Z2‖Z0), I2 = −I1·Z0/(Z2+Z0), I0 = −I1·Z2/(Z2+Z0) with Z2 = Z1
    const par = cdiv(cmul(z1, z0), cadd(z1, z0));
    const i1 = cdiv(cx(e, 0), cadd(z1, par));
    const i2 = cscale(cdiv(cmul(i1, z0), cadd(z1, z0)), -1);
    const i0 = cscale(cdiv(cmul(i1, z1), cadd(z1, z0)), -1);
    const a = cpolar(1, 120);
    const a2 = cpolar(1, 240);
    const ib = cadd(i0, cmul(a2, i1), cmul(a, i2));
    const ic = cadd(i0, cmul(a, i1), cmul(a2, i2));
    iLLG = Math.max(cmag(ib), cmag(ic));
    iLLGEarth = 3 * cmag(i0);
  }
  return { i3ph, iLL, iLG, iLLG, iLLGEarth, z1, z0, xr: z1.r > 0 ? z1.x / z1.r : 10 };
}

/** IEC 60909 peak factor κ and the half-cycle asymmetrical RMS factor */
export const peakFactor = (xr: number) => 1.02 + 0.98 * Math.exp(-3 / Math.max(xr, 0.01));
export const asymFactor = (xr: number) => Math.sqrt(1 + 2 * Math.exp((-2 * Math.PI) / Math.max(xr, 0.01)));
/** Interrupting-rating test X/R (UL 489 / IEC 60947-2 test power factor) */
export function deviceTestXr(kaic: number): number {
  if (kaic <= 10) return 1.73;
  if (kaic <= 20) return 3.18;
  return 4.9;
}
