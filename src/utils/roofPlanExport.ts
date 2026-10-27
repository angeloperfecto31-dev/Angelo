import { jsPDF } from "jspdf";
import { SolarDesignConfig, SolarCalculationResults, RoofPlanConfig } from "../types/solar";
import {
  IMAGERY_ATTRIBUTION,
  composeCaptureImage,
  metersPerPx,
  moduleDims,
  moduleCorners,
  assignStrings,
  roofPlanStats,
  planBounds,
  drawingScale,
  Pt,
} from "./roofPlan";

/**
 * Roof Plan output for the PDF and AutoCAD exports. The drawing is placed at a standard scale
 * (1:N) chosen so the roof and its modules fit the space given, with a north arrow, scale bar and
 * edge lengths; the PDF also carries the satellite image under the vector overlay.
 */

/** A roof plan is exported once a roof has been captured and outlined */
export const hasRoofPlan = (config: SolarDesignConfig) => Boolean(config.roofPlan?.capture && config.roofPlan.faces.length);

export interface RoofPlanLayout {
  bounds: { x1: number; y1: number; x2: number; y2: number };
  /** Drawing scale denominator (1:N) */
  N: number;
  /** Paper millimetres per image pixel */
  s: number;
  drawW: number;
  drawH: number;
}

export function roofPlanLayout(plan: RoofPlanConfig, calc: SolarCalculationResults, boxWmm: number, boxHmm: number): RoofPlanLayout {
  const bounds = planBounds(plan, calc, 3);
  const mpp = metersPerPx(plan);
  const wM = (bounds.x2 - bounds.x1) * mpp, hM = (bounds.y2 - bounds.y1) * mpp;
  const N = Math.max(drawingScale(wM, boxWmm), drawingScale(hM, boxHmm));
  const s = (mpp * 1000) / N;
  return { bounds, N, s, drawW: (bounds.x2 - bounds.x1) * s, drawH: (bounds.y2 - bounds.y1) * s };
}

/** Satellite (or grid) image cropped to the plan bounds, as a JPEG data URL */
export async function roofPlanImage(plan: RoofPlanConfig, bounds: RoofPlanLayout["bounds"], pxScale = 2): Promise<string | null> {
  if (!plan.capture) return null;
  const full = await composeCaptureImage(plan.capture, pxScale);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round((bounds.x2 - bounds.x1) * pxScale));
  c.height = Math.max(1, Math.round((bounds.y2 - bounds.y1) * pxScale));
  c.getContext("2d")!.drawImage(full, bounds.x1 * pxScale, bounds.y1 * pxScale, c.width, c.height, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.88);
}

/** Text rows describing the roof plan (shared by the PDF table and the DXF sheet) */
export function roofPlanInfo(config: SolarDesignConfig, calc: SolarCalculationResults, N: number, paper: string) {
  const plan = config.roofPlan!;
  const stats = roofPlanStats(plan, calc);
  const dims = moduleDims(calc, plan);
  const cap = plan.capture!;
  const rows: Array<[string, string]> = [
    ["PROJECT", (config.projectName || "Solar PV Installation").toUpperCase()],
    ...(cap.address ? ([["ADDRESS", cap.address.toUpperCase()]] as Array<[string, string]>) : []),
    ...(cap.kind === "satellite" ? ([["COORDINATES", `${cap.lat?.toFixed(6)}, ${cap.lng?.toFixed(6)}`]] as Array<[string, string]>) : []),
    ["DRAWING SCALE", `1:${N} ON ${paper}`],
    ["SCALE BASIS", stats.scaleSource.toUpperCase()],
    ["PV MODULE", `${calc.selectedModule.manufacturer} ${calc.selectedModule.model}`.toUpperCase()],
    ["MODULE SIZE", `${Math.round(dims.lengthM * 1000)} x ${Math.round(dims.widthM * 1000)} MM`],
    ["MODULES PLACED", `${stats.placed} OF ${stats.required} (${stats.placedKwp.toFixed(2)} kWp)`],
    ["STRINGS", `${calc.effective.numberOfStrings} x ${calc.effective.modulesPerString} MODULES (LABELS S#-#)`],
    ["ROOF AREA", `${stats.roofAreaM2.toFixed(1)} M² OUTLINED`],
  ];
  const faces = stats.faces.map(({ face, areaM2, edgesM, modules }) => ({
    title: `${face.name.toUpperCase()}: ${areaM2.toFixed(1)} M², ${modules} MODULES`,
    detail: `FACES ${Math.round(face.facingAzimuthDeg)}°, TILT ${face.tiltDeg}°, SETBACK ${face.setbackM.toFixed(2)} M, ${face.orientation.toUpperCase()}`,
    edges: `EDGES (M): ${edgesM.map((e) => e.toFixed(2)).join(" / ")}`,
  }));
  return { rows, faces, issues: stats.issues, stats };
}

const BAR_STEPS = [0.5, 1, 2, 5, 10, 20, 50, 100];

/** Offset (image px) that moves an edge label outward from the face, perpendicular to the edge */
export function edgeLabelOffset(pts: Pt[], i: number, dist: number): Pt {
  const p = pts[i], q = pts[(i + 1) % pts.length];
  const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
  let nx = -(q[1] - p[1]) / L, ny = (q[0] - p[0]) / L;
  const cx = pts.reduce((a, v) => a + v[0], 0) / pts.length, cy = pts.reduce((a, v) => a + v[1], 0) / pts.length;
  if (((p[0] + q[0]) / 2 - cx) * nx + ((p[1] + q[1]) / 2 - cy) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return [nx * dist, ny * dist];
}

/**
 * Draws the roof plan in a PDF box (mm): satellite crop, roof outlines with edge lengths,
 * modules with string labels, north arrow, scale bar and scale note.
 */
export function drawRoofPlanPdf(
  doc: jsPDF,
  config: SolarDesignConfig,
  calc: SolarCalculationResults,
  box: { x: number; y: number; w: number; h: number },
  layout: RoofPlanLayout,
  image: string | null
) {
  const plan = config.roofPlan!;
  const { bounds: b, s, drawW, drawH, N } = layout;
  const mpp = metersPerPx(plan);
  const ox = box.x + (box.w - drawW) / 2, oy = box.y + (box.h - drawH) / 2;
  const X = (px: number) => ox + (px - b.x1) * s;
  const Y = (py: number) => oy + (py - b.y1) * s;
  const poly = (pts: Pt[], style: "S" | "F" | "FD") => {
    const p = pts.map(([x, y]) => [X(x), Y(y)]);
    doc.lines(p.slice(1).map(([x, y], i) => [x - p[i][0], y - p[i][1]]), p[0][0], p[0][1], [1, 1], style, true);
  };

  if (image) doc.addImage(image, "JPEG", ox, oy, drawW, drawH);
  else {
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.rect(ox, oy, drawW, drawH);
  }

  const stats = roofPlanStats(plan, calc);
  const strings = assignStrings(plan, calc);
  const dims = moduleDims(calc, plan);

  // Modules
  plan.modules.forEach((m) => {
    const cs = moduleCorners(m, dims, mpp);
    const bad = stats.outsideIds.has(m.id) || stats.overlapIds.has(m.id);
    const st = strings.get(m.id);
    if (bad) doc.setFillColor(220, 38, 38);
    else if (st?.extra) doc.setFillColor(100, 116, 139);
    else doc.setFillColor(30, 64, 175);
    doc.setDrawColor(219, 234, 254);
    doc.setLineWidth(0.12);
    poly(cs, "FD");
    // String label only where it fits inside the module (5.5 pt minimum)
    const shortMm = Math.min(dims.lengthM, dims.widthM) * (1000 / N);
    if (st) {
      const label = st.extra ? "X" : `S${st.stringNo}-${st.pos}`;
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(5.5);
      if (doc.getTextWidth(label) <= shortMm - 0.8 && shortMm >= 2.8) {
        doc.setTextColor(255, 255, 255);
        doc.text(label, X(m.x), Y(m.y), { align: "center", baseline: "middle" });
      }
    }
  });

  // Roof outlines and edge lengths
  plan.faces.forEach((f) => {
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(0.5);
    poly(f.points, "S");
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(6.5);
    f.points.forEach((p, i) => {
      const q = f.points[(i + 1) % f.points.length];
      const t = `${(Math.hypot(q[0] - p[0], q[1] - p[1]) * mpp).toFixed(2)} m`;
      // Dimension text just outside the edge, clear of it whatever the edge direction
      const tw = doc.getTextWidth(t);
      const [nx, ny] = edgeLabelOffset(f.points, i, 1);
      const off = 1.2 + Math.abs(nx) * (tw / 2 + 0.8) + Math.abs(ny) * 1.6;
      const mx = X((p[0] + q[0]) / 2) + nx * off, my = Y((p[1] + q[1]) / 2) + ny * off;
      doc.setFillColor(255, 255, 255);
      doc.rect(mx - tw / 2 - 0.8, my - 1.6, tw + 1.6, 3.2, "F");
      doc.setTextColor(15, 23, 42);
      doc.text(t, mx, my, { align: "center", baseline: "middle" });
    });
    // Face name at its centroid
    const cx = f.points.reduce((a, p) => a + p[0], 0) / f.points.length;
    const cy = f.points.reduce((a, p) => a + p[1], 0) / f.points.length;
    doc.setFontSize(7);
    const nt = f.name.toUpperCase();
    const nw = doc.getTextWidth(nt);
    doc.setFillColor(245, 158, 11);
    doc.rect(X(cx) - nw / 2 - 1, Y(cy) - 1.8, nw + 2, 3.6, "F");
    doc.setTextColor(255, 255, 255);
    doc.text(nt, X(cx), Y(cy), { align: "center", baseline: "middle" });
  });

  // North arrow (imagery is north-up)
  const nx = ox + drawW - 7, ny = oy + 5;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.2);
  doc.roundedRect(nx - 4.5, ny - 1.5, 9, 12, 1, 1, "FD");
  doc.setFillColor(15, 23, 42);
  doc.triangle(nx, ny, nx + 2.6, ny + 7, nx - 2.6, ny + 7, "F");
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(15, 23, 42);
  doc.text("N", nx, ny + 9.6, { align: "center" });

  // Scale bar (bottom-left) and scale note
  const mmPerM = 1000 / N;
  const barM = [...BAR_STEPS].reverse().find((m) => m * mmPerM <= Math.min(45, drawW * 0.4)) || 0.5;
  const bx = ox + 4, by = oy + drawH - 6;
  doc.setFillColor(255, 255, 255);
  doc.rect(bx - 2, by - 4.5, barM * mmPerM + 18, 8, "F");
  for (let i = 0; i < 4; i++) {
    const seg = (barM * mmPerM) / 4;
    if (i % 2 === 0) doc.setFillColor(15, 23, 42);
    else doc.setFillColor(255, 255, 255);
    doc.setDrawColor(15, 23, 42);
    doc.rect(bx + i * seg, by, seg, 1.4, "FD");
  }
  doc.setFontSize(6);
  doc.setTextColor(15, 23, 42);
  doc.text("0", bx, by - 1);
  doc.text(`${barM} m`, bx + barM * mmPerM, by - 1, { align: "center" });
  doc.text(`SCALE 1:${N}`, bx + barM * mmPerM + 4, by + 1.4);

  if (plan.capture?.kind === "satellite") {
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(5.6);
    const aw = doc.getTextWidth(IMAGERY_ATTRIBUTION);
    doc.setFillColor(255, 255, 255);
    doc.rect(ox + drawW - aw - 2, oy + drawH - 3, aw + 2, 3, "F");
    doc.setTextColor(51, 65, 85);
    doc.text(IMAGERY_ATTRIBUTION, ox + drawW - 1, oy + drawH - 0.8, { align: "right" });
  }
}

/** Info column (rows, roof faces, issues) in a PDF; returns the y reached */
export function drawRoofPlanInfoPdf(
  doc: jsPDF,
  info: ReturnType<typeof roofPlanInfo>,
  x: number,
  y: number,
  w: number
): number {
  const line = (t: string, size: number, bold: boolean, color: [number, number, number], gap = 1.2) => {
    doc.setFont("Helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(t, w) as string[];
    lines.forEach((ln) => {
      doc.text(ln, x, y);
      y += size * 0.3528 * 1.25;
    });
    y += gap;
  };
  info.rows.forEach(([k, v]) => {
    line(k, 6, true, [100, 116, 139], 0);
    line(v, 7, false, [15, 23, 42], 1.4);
  });
  y += 1;
  line("ROOF FACES", 7.5, true, [15, 23, 42], 1);
  info.faces.forEach((f) => {
    line(f.title, 6.8, true, [15, 23, 42], 0.2);
    line(f.detail, 6.2, false, [51, 65, 85], 0.2);
    line(f.edges, 6.2, false, [51, 65, 85], 1.4);
  });
  if (info.issues.length) {
    y += 1;
    line("CHECKS", 7.5, true, [180, 83, 9], 1);
    info.issues.forEach((t) => line(`- ${t}`, 6.2, false, [180, 83, 9], 0.8));
  }
  return y;
}
