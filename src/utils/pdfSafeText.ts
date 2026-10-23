import { jsPDF } from "jspdf";

/**
 * The standard PDF fonts (Helvetica, Times, Courier) only cover WinAnsiEncoding. When a string
 * contains any other character (₱, ≤, Ω, √ ...), jsPDF switches the whole string to an encoding
 * those fonts cannot show, and the line prints as spaced-out garbage. Importing this module makes
 * every jsPDF text, width and wrapping call use PDF-safe equivalents (₱ -> "PHP", ≤ -> "<=" ...),
 * so alignment and wrapping are measured on exactly the text that is printed
 * (jspdf-autotable goes through the same calls).
 */

const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

const REPLACEMENTS: Array<[RegExp, string]> = [
  [/₱\s*/g, "PHP "],
  [/≤/g, "<="],
  [/≥/g, ">="],
  [/≠/g, "<>"],
  [/≈/g, "~"],
  [/[Ω]/g, " Ohm"],
  [/[Δ∆]/g, "Delta "],
  [/π/g, "pi"],
  [/√/g, "sqrt"],
  [/[→⟶]/g, "->"],
  [/[←⟵]/g, "<-"],
  [/↑/g, "^"],
  [/↓/g, "v"],
  [/[✓✔☑]/g, "OK"],
  [/[✗✘✕]/g, "X"],
  [/⚠/g, "!"],
  [/∞/g, "inf"],
  [/∑/g, "Sum"],
  [/[−‐‑]/g, "-"],
  [/[    ]/g, " "],
  [/[​‌‍️]/g, ""],
  [/₀/g, "0"], [/₁/g, "1"], [/₂/g, "2"], [/₃/g, "3"],
  [/[Φφ]/g, "phi"],
  [/θ/g, "theta"],
  [/η/g, "eta"],
  [/λ/g, "lambda"],
  [/ρ/g, "rho"],
];

const isWinAnsi = (ch: string) => {
  const c = ch.charCodeAt(0);
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || c === 0x0a || c === 0x0d || c === 0x09 || WIN_ANSI_EXTRA.includes(ch);
};

/** Returns text that the standard PDF fonts can print unchanged. */
export function toPdfSafeText(text: string): string {
  let s = text;
  for (const [re, rep] of REPLACEMENTS) s = s.replace(re, rep);
  let out = "";
  for (const ch of s) out += isWinAnsi(ch) ? ch : "?";
  return out;
}

const safeArg = (v: any): any => {
  if (typeof v === "string") return toPdfSafeText(v);
  if (Array.isArray(v)) return v.map(safeArg);
  return v;
};

const api: any = (jsPDF as any).API;
if (!api.__pdfSafeTextInstalled) {
  api.__pdfSafeTextInstalled = true;
  // doc.text() is created per document, so it is reached through jsPDF's preProcessText hook,
  // which runs before the text is measured, aligned and encoded.
  api.events.push([
    "preProcessText",
    (payload: any) => {
      if (payload && typeof payload === "object" && "text" in payload) payload.text = safeArg(payload.text);
    },
  ]);
  // Width and wrapping helpers are plugin methods and are wrapped directly
  for (const name of ["getTextWidth", "splitTextToSize", "getStringUnitWidth", "getTextDimensions"]) {
    const original = api[name];
    if (typeof original !== "function") continue;
    api[name] = function (this: any, value: any, ...rest: any[]) {
      return original.call(this, safeArg(value), ...rest);
    };
  }
}
