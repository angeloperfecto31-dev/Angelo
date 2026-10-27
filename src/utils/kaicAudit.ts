import type { Circuit, PanelConfig } from "../types";
import { isIdleSpareOrSpace } from "./computeEngine";
import { asymFactor, deviceTestXr } from "./faultMath";
import type { PowerAnalysisResult } from "./powerAnalysis";

export const STANDARD_KAIC = [5, 10, 14, 18, 22, 25, 30, 35, 42, 50, 65, 85, 100];

export interface KaicAuditRow {
  id: string;
  busId: string;
  location: string;
  type: string;
  /** Maximum available symmetrical fault at the device (bus value, motors included), A */
  faultCurrentA: number;
  /** Fault adjusted for the circuit X/R against the device's test X/R (UL 489 / IEC 60947-2), A */
  dutyCurrentA: number;
  xr: number;
  /** Installed rating, kA; 0 when not specified */
  selectedKAIC: number;
  status: "PASS" | "FAIL" | "NOT SPECIFIED";
  recommendation: string;
  /** Feeder length or size missing upstream: the fault is an upper bound */
  upperBound: boolean;
}

/**
 * Interrupting-rating audit of every protective device, from the per-bus fault levels of the power
 * analysis (cascaded feeder impedances). The Short Circuit page, the AutoCAD drawing, the Word report
 * and the Excel workbook all list these rows, so they always agree with the impedance diagram.
 * A rating that is not entered is reported as not specified, never assumed.
 */
export function kaicAudit(
  result: PowerAnalysisResult,
  panel: PanelConfig,
  circuits: Circuit[],
  subPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[],
): KaicAuditRow[] {
  const rows: KaicAuditRow[] = [];
  const circuitsOf = (id: string) => (id === "mdp" ? circuits : subPanels.find((s) => s.id === id)?.circuits || []);
  const panelOf = (id: string) => (id === "mdp" ? panel : subPanels.find((s) => s.id === id)?.panel);

  const row = (busId: string, id: string, location: string, type: string, kaic: number) => {
    const b = result.byId[busId];
    const faultA = b.iSym * 1000;
    const dutyA = kaic > 0 ? faultA * Math.max(1, asymFactor(b.xr) / asymFactor(deviceTestXr(kaic))) : faultA;
    const need = STANDARD_KAIC.find((k) => k * 1000 >= dutyA) ?? 100;
    const status: KaicAuditRow["status"] = kaic <= 0 ? "NOT SPECIFIED" : kaic * 1000 >= dutyA ? "PASS" : "FAIL";
    rows.push({
      id, busId, location, type, faultCurrentA: faultA, dutyCurrentA: dutyA, xr: b.xr, selectedKAIC: kaic, status,
      upperBound: b.faultUpperBound,
      recommendation:
        status === "NOT SPECIFIED"
          ? `Enter the installed kAIC; at least ${need} kAIC is required here.`
          : status === "PASS"
            ? "Interrupting rating is adequate for the available fault."
            : `INSUFFICIENT kAIC: use at least ${need} kAIC.`,
    });
  };

  for (const b of result.buses) {
    const p = panelOf(b.id);
    if (!p) continue;
    const name = b.name;
    row(b.id, `${b.id}-main`, `${name} Main Breaker`, b.id === "mdp" ? "Main Protective Device" : "Panel Main Device", b.mainKaic);
    circuitsOf(b.id).forEach((c) => {
      if (isIdleSpareOrSpace(c)) return;
      row(b.id, `${b.id}-branch-${c.id ?? c.circuitNo}`, `${name} - Circuit ${c.circuitNo} (${c.description})`,
        c.linkedSubPanelId ? "Feeder Breaker" : "Branch Circuit Breaker", Number(c.mcbKAIC) || 0);
    });
  }
  return rows;
}
