import { jsPDF } from "jspdf";
import "./pdfSafeText"; // printable PDF text (², ≥ ...)
import autoTable from "jspdf-autotable";
import { pdfFitText } from "./pdfLayout";
import {
  RoomPoint,
  RoomShapeId,
  ROOM_SHAPES,
  polygonArea,
  polygonBounds,
  polygonPerimeter,
  polygonRoomIndex,
  vertexLabel,
  wallsFromPolygon,
} from "./roomGeometry";

/** Everything the room layout sheet shows for one room */
export interface RoomLayoutData {
  roomName: string;
  shape?: RoomShapeId;
  /** Outline in metres (x east, z south, bounding box at 0, 0) */
  outline: RoomPoint[];
  /** Luminaire positions in metres */
  fixtures: { x: number; z: number }[];
  ceilingHeight: number;
  workingPlaneHeight: number;
  mountingHeight: number;
  targetLux: number;
  fixtureType: string;
  fixtureLumens: number;
  fixtureWattage: number;
  coefficientOfUtilization?: number;
  maintenanceFactor?: number;
  averageLux?: number;
  minLux?: number;
  maxLux?: number;
  uniformityU0?: number;
  /** 5 × 5 point grid at 10 %, 30 % … 90 % of the bounding box; null = outside the room */
  luxGrid?: (number | null)[][];
}

export const roomShapeLabel = (shape?: RoomShapeId) => ROOM_SHAPES.find((s) => s.id === (shape || "rectangle"))?.label || "Rectangle";

/** Area, perimeter, room index and wall schedule of an outline */
export function roomGeometrySummary(outline: RoomPoint[], ceilingHeight: number, workingPlaneHeight: number) {
  const hrc = Math.max(0.1, ceilingHeight - workingPlaneHeight);
  const b = polygonBounds(outline);
  return {
    area: polygonArea(outline),
    perimeter: polygonPerimeter(outline),
    roomIndex: polygonRoomIndex(outline, hrc),
    width: b.width,
    length: b.length,
    walls: wallsFromPolygon(outline).map((w, i) => ({
      name: `${vertexLabel(i)}-${vertexLabel((i + 1) % outline.length)}`,
      length: w.length,
      angle: w.angle,
      endVertex: vertexLabel((i + 1) % outline.length),
    })),
  };
}

/** Smallest standard drawing scale (1:n) at which the room fits the given paper size in mm */
function drawingScale(roomW: number, roomL: number, paperW: number, paperH: number) {
  const scales = [20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000];
  const needed = Math.max((roomW * 1000) / paperW, (roomL * 1000) / paperH);
  return scales.find((s) => s >= needed) || Math.ceil(needed / 500) * 500;
}

type RGB = [number, number, number];
const NAVY: RGB = [15, 23, 42];
const INDIGO: RGB = [67, 56, 202];
const MUTED: RGB = [100, 116, 139];
const AMBER: RGB = [217, 119, 6];

/**
 * Room plan drawn to a standard scale inside the box (x, y, w, h) in mm: outline, wall dimensions,
 * corner letters, luminaires (numbered), north arrow and scale bar. Returns the scale used (1:n).
 */
export function drawRoomPlanPdf(doc: jsPDF, data: RoomLayoutData, x: number, y: number, w: number, h: number): number {
  const b = polygonBounds(data.outline);
  const margin = 18;
  const scale = drawingScale(b.width, b.length, w - margin * 2, h - margin * 2 - 10);
  const k = 1000 / scale; // mm on paper per metre
  const ox = x + (w - b.width * k) / 2;
  const oy = y + (h - 10 - b.length * k) / 2;
  const P = ([px, pz]: RoomPoint): [number, number] => [ox + (px - b.minX) * k, oy + (pz - b.minZ) * k];

  // Floor fill and walls
  const pts = data.outline.map(P);
  const segs = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.7);
  doc.lines(segs, pts[0][0], pts[0][1], [1, 1], "FD", true);

  // Wall dimensions outside each wall (outline is clockwise on paper, so the outward normal is (dy, -dx))
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setLineWidth(0.15);
  pts.forEach((a, i) => {
    const c = pts[(i + 1) % pts.length];
    const dx = c[0] - a[0];
    const dy = c[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 3) return;
    const nx = dy / len;
    const ny = -dx / len;
    const off = 5;
    const a2: [number, number] = [a[0] + nx * off, a[1] + ny * off];
    const c2: [number, number] = [c[0] + nx * off, c[1] + ny * off];
    doc.setDrawColor(...MUTED);
    doc.line(a2[0], a2[1], c2[0], c2[1]);
    // Extension lines and ticks
    doc.line(a[0] + nx * 1.5, a[1] + ny * 1.5, a[0] + nx * (off + 1.5), a[1] + ny * (off + 1.5));
    doc.line(c[0] + nx * 1.5, c[1] + ny * 1.5, c[0] + nx * (off + 1.5), c[1] + ny * (off + 1.5));
    for (const p of [a2, c2]) doc.line(p[0] - (dx / len - nx) * 0.9, p[1] - (dy / len - ny) * 0.9, p[0] + (dx / len - nx) * 0.9, p[1] + (dy / len - ny) * 0.9);
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (deg > 90) deg -= 180;
    if (deg <= -90) deg += 180;
    const realLen = Math.hypot(data.outline[(i + 1) % pts.length][0] - data.outline[i][0], data.outline[(i + 1) % pts.length][1] - data.outline[i][1]);
    const tx = (a2[0] + c2[0]) / 2 + nx * 2.4;
    const ty = (a2[1] + c2[1]) / 2 + ny * 2.4;
    doc.setTextColor(...INDIGO);
    doc.text(`${realLen.toFixed(2)} m`, tx, ty, { align: "center", angle: -deg, baseline: "middle" });
  });

  // Corner letters inside each corner
  doc.setFontSize(7.5);
  doc.setTextColor(...NAVY);
  pts.forEach((p, i) => {
    const prev = pts[(i - 1 + pts.length) % pts.length];
    const next = pts[(i + 1) % pts.length];
    const bx = (prev[0] - p[0]) / (Math.hypot(prev[0] - p[0], prev[1] - p[1]) || 1) + (next[0] - p[0]) / (Math.hypot(next[0] - p[0], next[1] - p[1]) || 1);
    const by = (prev[1] - p[1]) / (Math.hypot(prev[0] - p[0], prev[1] - p[1]) || 1) + (next[1] - p[1]) / (Math.hypot(next[0] - p[0], next[1] - p[1]) || 1);
    const bl = Math.hypot(bx, by) || 1;
    // Bisector points into the room at convex corners and out of it at re-entrant ones; letters go inside
    const cross = (p[0] - prev[0]) * (next[1] - p[1]) - (p[1] - prev[1]) * (next[0] - p[0]);
    const sgn = cross >= 0 ? 1 : -1;
    doc.text(vertexLabel(i), p[0] + (sgn * bx * 3.2) / bl, p[1] + (sgn * by * 3.2) / bl, { align: "center", baseline: "middle" });
  });

  // Luminaires
  doc.setFontSize(5.5);
  data.fixtures.forEach((f, i) => {
    const [fx, fy] = P([f.x, f.z]);
    const r = Math.max(1.2, Math.min(2.2, k * 0.25));
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(...AMBER);
    doc.setLineWidth(0.25);
    doc.circle(fx, fy, r, "FD");
    doc.line(fx - r * 0.7, fy - r * 0.7, fx + r * 0.7, fy + r * 0.7);
    doc.line(fx - r * 0.7, fy + r * 0.7, fx + r * 0.7, fy - r * 0.7);
    doc.setTextColor(...AMBER);
    doc.text(String(i + 1), fx + r + 0.6, fy - r * 0.4);
  });

  // North arrow (z = 0 is the north wall) and scale bar
  const nx0 = x + w - 10;
  const ny0 = y + 6;
  doc.setDrawColor(...NAVY);
  doc.setFillColor(...NAVY);
  doc.setLineWidth(0.3);
  doc.triangle(nx0, ny0, nx0 - 2.2, ny0 + 7, nx0 + 2.2, ny0 + 7, "F");
  doc.setFontSize(8);
  doc.setTextColor(...NAVY);
  doc.text("N", nx0, ny0 + 11, { align: "center" });

  const barM = [1, 2, 5, 10, 20, 50].reduce((best, m) => (m * k <= w * 0.3 ? m : best), 1);
  const sbx = x + 6;
  const sby = y + h - 6;
  for (let i = 0; i < barM; i++) {
    const seg = barM <= 5 ? 1 : barM / 5;
    if (i * seg >= barM) break;
    if (i % 2 === 0) doc.setFillColor(...NAVY);
    else doc.setFillColor(255, 255, 255);
    doc.rect(sbx + i * seg * k, sby - 1.5, seg * k, 1.5, "FD");
  }
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.text("0", sbx, sby + 3, { align: "center" });
  doc.text(`${barM} m`, sbx + barM * k, sby + 3, { align: "center" });
  doc.text(`SCALE 1:${scale}`, sbx + barM * k + 8, sby);
  return scale;
}

/** A3 landscape room layout sheet: scaled plan, geometry and wall schedule, lighting results */
export function exportIlluminationLayoutPdf(data: RoomLayoutData) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
  const W = 420;
  const H = 297;
  const m = 10;
  const geo = roomGeometrySummary(data.outline, data.ceilingHeight, data.workingPlaneHeight);

  // Sheet border and header
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.6);
  doc.rect(m, m, W - m * 2, H - m * 2);
  doc.setFillColor(...NAVY);
  doc.rect(m, m, W - m * 2, 14, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("ILLUMINATION ROOM LAYOUT", m + 5, m + 9.2);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  pdfFitText(doc, `${data.roomName} | ${roomShapeLabel(data.shape)} | ${geo.area.toFixed(2)} m²`, W - m - 5, m + 9, 200, { align: "right" });

  // Plan (left)
  const planX = m + 4;
  const planY = m + 18;
  const planW = 255;
  const planH = H - m * 2 - 18 - 30;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.rect(planX, planY, planW, planH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("LUMINAIRE LAYOUT PLAN", planX + 3, planY + 5);
  const scale = drawRoomPlanPdf(doc, data, planX, planY + 6, planW, planH - 6);

  // Tables (right)
  const tx = planX + planW + 6;
  const tw = W - m - 4 - tx;
  const head = { fillColor: NAVY, textColor: 255, fontStyle: "bold" as const, fontSize: 7.5 };
  const body = { fontSize: 7.5, cellPadding: 1.3, textColor: NAVY };
  const hrc = Math.max(0.1, data.ceilingHeight - data.workingPlaneHeight);
  let y = planY;

  autoTable(doc, {
    startY: y,
    margin: { left: tx, right: m + 4 },
    tableWidth: tw,
    head: [["ROOM GEOMETRY", "VALUE"]],
    body: [
      ["Room shape", `${roomShapeLabel(data.shape)} (${data.outline.length} walls)`],
      ["Floor area A (shoelace)", `${geo.area.toFixed(2)} m²`],
      ["Perimeter P", `${geo.perimeter.toFixed(2)} m`],
      ["Bounding box", `${geo.width.toFixed(2)} × ${geo.length.toFixed(2)} m`],
      ["Ceiling / working plane / mounting", `${data.ceilingHeight.toFixed(2)} / ${data.workingPlaneHeight.toFixed(2)} / ${data.mountingHeight.toFixed(2)} m`],
      ["Room index RI = 2A / (hrc·P)", `${geo.roomIndex.toFixed(2)} (hrc = ${hrc.toFixed(2)} m)`],
    ],
    theme: "grid",
    headStyles: head,
    bodyStyles: body,
    columnStyles: { 0: { cellWidth: tw * 0.52 } },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  autoTable(doc, {
    startY: y,
    margin: { left: tx, right: m + 4 },
    tableWidth: tw,
    head: [["WALL", "LENGTH (m)", "INTERIOR ANGLE"]],
    body: geo.walls.map((wl) => [wl.name, wl.length.toFixed(2), `${wl.angle.toFixed(1)}° at ${wl.endVertex}`]),
    theme: "grid",
    headStyles: head,
    bodyStyles: body,
    pageBreak: "avoid",
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  const count = data.fixtures.length;
  const totalW = count * data.fixtureWattage;
  autoTable(doc, {
    startY: y,
    margin: { left: tx, right: m + 4 },
    tableWidth: tw,
    head: [["LIGHTING RESULTS", "VALUE"]],
    body: [
      ["Target illuminance", `${data.targetLux} lx`],
      ["Luminaire", data.fixtureType],
      ["Quantity", `${count} units × ${data.fixtureLumens.toLocaleString()} lm × ${data.fixtureWattage} W`],
      ...(data.coefficientOfUtilization ? [["CU / MF", `${data.coefficientOfUtilization.toFixed(2)} / ${(data.maintenanceFactor || 0.8).toFixed(2)}`]] : []),
      ...(data.averageLux !== undefined ? [["Average (point grid)", `${data.averageLux} lx`]] : []),
      ...(data.minLux !== undefined && data.maxLux !== undefined ? [["Emin / Emax", `${data.minLux} / ${data.maxLux} lx`]] : []),
      ...(data.uniformityU0 !== undefined ? [["Uniformity U0 = Emin/Eavg", data.uniformityU0.toFixed(2)]] : []),
      ["Lighting power density", `${geo.area > 0 ? (totalW / geo.area).toFixed(2) : "0"} W/m² (${totalW} W)`],
    ],
    theme: "grid",
    headStyles: head,
    bodyStyles: body,
    columnStyles: { 0: { cellWidth: tw * 0.52 } },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  if (data.luxGrid && data.luxGrid.length > 0 && y < H - m - 60) {
    autoTable(doc, {
      startY: y,
      margin: { left: tx, right: m + 4 },
      tableWidth: tw,
      head: [["POINT GRID (lx)", "10%", "30%", "50%", "70%", "90%"]],
      body: data.luxGrid.map((row, r) => [`${10 + r * 20}% L`, ...row.map((v) => (v === null ? "-" : String(v)))]),
      theme: "grid",
      headStyles: head,
      bodyStyles: { ...body, halign: "center" },
    });
  }

  // Title block
  const tbY = H - m - 26;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.4);
  doc.line(m, tbY, W - m, tbY);
  const cells = [
    ["PROJECT", "ElectricalPH Lighting Design"],
    ["ROOM", data.roomName],
    ["DRAWING", "Luminaire layout plan"],
    ["SCALE", `1:${scale} (A3)`],
    ["DATE", new Date().toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" })],
    ["SHEET", "IL-1"],
  ];
  const cw = (W - m * 2) / cells.length;
  cells.forEach(([label, value], i) => {
    const cx = m + i * cw;
    if (i > 0) doc.line(cx, tbY, cx, H - m);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(label, cx + 3, tbY + 6);
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    pdfFitText(doc, value, cx + 3, tbY + 15, cw - 6, { minFontSize: 6 });
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text("Dimensions in metres. Luminaire positions measured from the north-west corner of the bounding box.", m + 4, tbY - 1.2);

  const safeName = (data.roomName || "Room").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
  doc.save(`Illumination_Room_Layout_${safeName || "Room"}.pdf`);
}

/** Room plan as a PNG data URL (for the Word report), drawn on a canvas */
export function renderRoomLayoutPng(data: RoomLayoutData, widthPx = 1400): string | null {
  if (typeof document === "undefined" || data.outline.length < 3) return null;
  const b = polygonBounds(data.outline);
  const pad = 90;
  const k = (widthPx - pad * 2) / Math.max(b.width, 0.1);
  const heightPx = Math.round(Math.min(widthPx * 1.1, b.length * k + pad * 2));
  const kk = Math.min(k, (heightPx - pad * 2) / Math.max(b.length, 0.1));
  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const ox = (widthPx - b.width * kk) / 2;
  const oy = (heightPx - b.length * kk) / 2;
  const P = ([x, z]: RoomPoint): [number, number] => [ox + (x - b.minX) * kk, oy + (z - b.minZ) * kk];

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, widthPx, heightPx);
  const pts = data.outline.map(P);
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
  ctx.closePath();
  ctx.fillStyle = "#f1f5f9";
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.lineJoin = "miter";
  ctx.strokeStyle = "#0f172a";
  ctx.stroke();

  ctx.font = "bold 26px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  pts.forEach((a, i) => {
    const c = pts[(i + 1) % pts.length];
    const dx = c[0] - a[0];
    const dy = c[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 40) return;
    const nx = dy / len;
    const ny = -dx / len;
    const real = len / kk;
    let ang = Math.atan2(dy, dx);
    if (ang > Math.PI / 2) ang -= Math.PI;
    if (ang <= -Math.PI / 2) ang += Math.PI;
    ctx.save();
    ctx.translate((a[0] + c[0]) / 2 + nx * 34, (a[1] + c[1]) / 2 + ny * 34);
    ctx.rotate(ang);
    ctx.fillStyle = "#4338ca";
    ctx.fillText(`${real.toFixed(2)} m`, 0, 0);
    ctx.restore();
  });

  ctx.font = "bold 22px Arial";
  data.fixtures.forEach((f, i) => {
    const [x, y] = P([f.x, f.z]);
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fillStyle = "#fef3c7";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#d97706";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 11, y - 11);
    ctx.lineTo(x + 11, y + 11);
    ctx.moveTo(x - 11, y + 11);
    ctx.lineTo(x + 11, y - 11);
    ctx.stroke();
    ctx.fillStyle = "#b45309";
    ctx.fillText(String(i + 1), x + 30, y - 18);
  });

  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 28px Arial";
  pts.forEach((p, i) => {
    const prev = pts[(i - 1 + pts.length) % pts.length];
    const next = pts[(i + 1) % pts.length];
    const u1 = Math.hypot(prev[0] - p[0], prev[1] - p[1]) || 1;
    const u2 = Math.hypot(next[0] - p[0], next[1] - p[1]) || 1;
    const bx = (prev[0] - p[0]) / u1 + (next[0] - p[0]) / u2;
    const by = (prev[1] - p[1]) / u1 + (next[1] - p[1]) / u2;
    const bl = Math.hypot(bx, by) || 1;
    const cross = (p[0] - prev[0]) * (next[1] - p[1]) - (p[1] - prev[1]) * (next[0] - p[0]);
    const sgn = cross >= 0 ? 1 : -1;
    ctx.fillText(vertexLabel(i), p[0] + (sgn * bx * 34) / bl, p[1] + (sgn * by * 34) / bl);
  });
  ctx.textAlign = "left";
  ctx.font = "bold 24px Arial";
  ctx.fillText(`${data.roomName} | ${roomShapeLabel(data.shape)} | ${polygonArea(data.outline).toFixed(2)} m² | ${data.fixtures.length} luminaires | N ↑`, 24, 36);
  return canvas.toDataURL("image/png");
}
