import { jsPDF } from "jspdf";
import "./pdfSafeText";

/** Shared jsPDF layout helpers that keep text inside the space it is given. */

type Align = "left" | "center" | "right";

/**
 * Writes one line of text that never exceeds maxWidth (document units). The font is stepped down
 * to minFontSize first; only if it still does not fit is the text shortened with an ellipsis.
 * The document font size is restored afterwards.
 */
export function pdfFitText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  options: { align?: Align; minFontSize?: number } = {}
): void {
  const original = doc.getFontSize();
  const minSize = Math.min(options.minFontSize ?? 6, original);
  let size = original;
  while (size > minSize && doc.getTextWidth(text) > maxWidth) {
    size = Math.max(minSize, size - 0.25);
    doc.setFontSize(size);
  }
  let out = text;
  if (doc.getTextWidth(out) > maxWidth) {
    while (out.length > 1 && doc.getTextWidth(out + "...") > maxWidth) out = out.slice(0, -1);
    out = out.trimEnd() + "...";
  }
  doc.text(out, x, y, options.align ? { align: options.align } : undefined);
  doc.setFontSize(original);
}

/**
 * Writes text wrapped to maxWidth starting at baseline y and returns the height used
 * (line count x lineHeight), so the caller can move the next content down.
 */
export function pdfWrapText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  options: { align?: Align; maxLines?: number } = {}
): number {
  let lines: string[] = doc.splitTextToSize(text, maxWidth);
  if (options.maxLines && lines.length > options.maxLines) {
    lines = lines.slice(0, options.maxLines);
    let last = lines[lines.length - 1];
    while (last.length > 1 && doc.getTextWidth(last + "...") > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = last.trimEnd() + "...";
  }
  lines.forEach((line, i) => {
    const lx = options.align === "right" ? x : options.align === "center" ? x : x;
    doc.text(line, lx, y + i * lineHeight, options.align ? { align: options.align } : undefined);
  });
  return lines.length * lineHeight;
}

/** Number of lines text needs at the current font when wrapped to maxWidth. */
export function pdfLineCount(doc: jsPDF, text: string, maxWidth: number): number {
  return (doc.splitTextToSize(text, maxWidth) as string[]).length;
}
