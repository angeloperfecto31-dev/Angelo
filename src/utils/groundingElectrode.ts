/**
 * Grounding electrode system of a service panel, as drawn on the panel SLDs (screen and AutoCAD).
 *
 * Grounding electrode conductor (GEC) per PEC 2017 Table 2.50.3.66, from the size of the largest
 * service-entrance phase conductor (or the equivalent area of parallel sets). A GEC that only goes to
 * a rod electrode need not be larger than 6 AWG, i.e. 14 mm² (PEC 2.50.3.66(A)).
 * Rod: 20 mmØ x 3 m copper-weld (PEC 2.50.3.52(A)(5): at least 15.87 mmØ x 2.44 m).
 */
const GEC_TABLE: Array<[number, number]> = [
  [30, 8.0], // up to 30 mm² (2 AWG)
  [50, 14], // up to 50 mm² (1/0)
  [80, 22], // up to 80 mm² (3/0)
  [175, 30], // up to 175 mm² (350 kcmil)
  [300, 50], // up to 300 mm² (600 kcmil)
  [550, 60], // up to 550 mm² (1100 kcmil)
];

export interface GroundingElectrode {
  /** Grounding electrode conductor size, mm² copper */
  gecMm2: number;
  gecText: string;
  conduit: string;
  rod: string;
}

/** Philippine wire sizes: 8.0 mm² (one decimal below 10), then 14, 22, 30 ... */
export const fmtWireMm2 = (v: number) => (v < 10 ? v.toFixed(1) : `${v}`);

export function groundingElectrode(phaseSizeMm2: number | string, sets: number = 1): GroundingElectrode {
  const size = parseFloat(String(phaseSizeMm2)) || 0;
  const area = size * Math.max(1, sets || 1);
  const fromTable = (GEC_TABLE.find(([max]) => area <= max) || [0, 80])[1];
  // Rod electrode connection: never more than 14 mm²
  const gecMm2 = Math.min(fromTable, 14);
  return {
    gecMm2,
    gecText: `${fmtWireMm2(gecMm2)} mm² TW (G) COPPER WIRE`,
    conduit: "20mmØ uPVC PIPE",
    rod: "20mmØ x 3M COPPER WELD GROUND ROD WITH HEAVY DUTY CLAMP",
  };
}
