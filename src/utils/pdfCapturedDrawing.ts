import { jsPDF } from "jspdf";
import type { SldCapture } from "./solarSldCapture";

const MM_PER_PT = 25.4 / 72;

/** "#rrggbb" -> [r, g, b]; anything else -> dark slate */
const rgb = (c?: string): [number, number, number] => {
  const m = c && /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) return [30, 41, 59];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * Draws a captured SVG drawing (see solarSldCapture) into a PDF as vector lines, shapes and text,
 * scaled to fit the box (document units, y down) and centred in it. Returns the scale used.
 */
export function drawCaptureToPdf(
  doc: jsPDF,
  cap: SldCapture,
  box: { x: number; y: number; w: number; h: number }
): number {
  const { x1, y1, x2, y2 } = cap.bbox;
  const s = Math.min(box.w / (x2 - x1), box.h / (y2 - y1));
  const ox = box.x + (box.w - (x2 - x1) * s) / 2 - x1 * s;
  const oy = box.y + (box.h - (y2 - y1) * s) / 2 - y1 * s;
  const X = (x: number) => ox + x * s;
  const Y = (y: number) => oy + y * s;
  const lw = (sw?: number) => Math.max(0.12, (sw ?? 1.2) * s);

  for (const p of cap.prims) {
    const [r, g, b] = rgb(p.color);
    doc.setDrawColor(r, g, b);
    if (p.kind === "line") {
      doc.setLineWidth(lw(p.sw));
      doc.line(X(p.x1), Y(p.y1), X(p.x2), Y(p.y2));
    } else if (p.kind === "poly") {
      doc.setLineWidth(lw(p.sw));
      const pts = p.pts.map(([px, py]) => [X(px), Y(py)] as [number, number]);
      const segs = pts.slice(1).map(([px, py], i) => [px - pts[i][0], py - pts[i][1]]);
      if (p.filled) doc.setFillColor(r, g, b);
      doc.lines(segs, pts[0][0], pts[0][1], [1, 1], p.filled ? "FD" : "S", p.closed);
    } else if (p.kind === "circle") {
      doc.setLineWidth(lw(p.sw));
      doc.circle(X(p.cx), Y(p.cy), p.r * s, "S");
    } else {
      const [tr, tg, tb] = rgb(p.color);
      doc.setTextColor(tr, tg, tb);
      doc.setFont("Helvetica", p.bold ? "bold" : "normal");
      doc.setFontSize((p.size * s) / MM_PER_PT);
      const align = p.anchor === "middle" ? "center" : p.anchor === "end" ? "right" : "left";
      doc.text(p.text, X(p.x), Y(p.y), { align });
    }
  }
  return s;
}
