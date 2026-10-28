import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { SolarDesignConfig, SolarCalculationResults } from "../types/solar";
import {
  SolarSLDPictorial,
  computePictorialLayout,
  PictorialOptions,
  PictorialServiceInfo,
  PictorialTheme,
} from "../components/solar/SolarSLDPictorial";
import { SolarBlockDiagram, BLOCK_W, BLOCK_H } from "../components/solar/SolarBlockDiagram";
import { SolarShortCircuitDiagram, SolarVoltageDropDiagram, SC_W, SC_H, VD_W, VD_H } from "../components/solar/SolarStudyDiagrams";
import type { SolarStudies } from "./solarStudies";

/**
 * Captures the on-screen pictorial Solar SLD as plain geometry so the AutoCAD (DXF) export can
 * reproduce exactly the same drawing. The component is rendered off-screen with the white CAD
 * theme and its SVG elements are converted to lines, polylines, circles and text in SVG units
 * (y grows downward). Each primitive carries the CAD layer named by the nearest
 * `data-cad-layer` attribute in the drawing.
 */

/** Optional styling (stroke width, colour, bold) is used by the PDF output; the DXF uses layers instead. */
type Style = { sw?: number; color?: string };
export type SldPrimitive =
  | ({ kind: "line"; layer: string; x1: number; y1: number; x2: number; y2: number } & Style)
  | ({ kind: "poly"; layer: string; pts: Array<[number, number]>; closed: boolean; filled?: boolean } & Style)
  | ({ kind: "circle"; layer: string; cx: number; cy: number; r: number } & Style)
  | ({ kind: "text"; layer: string; x: number; y: number; size: number; anchor: "start" | "middle" | "end"; text: string; bold?: boolean } & Style);

export interface SldCapture {
  prims: SldPrimitive[];
  bbox: { x1: number; y1: number; x2: number; y2: number };
}

/** Same colours as the on-screen "CAD White" theme. */
export const CAD_WHITE_THEME: PictorialTheme = {
  bg: "#ffffff",
  line: "#1e293b",
  groundLine: "#15803d",
  equipmentFill: "#ffffff",
  equipmentBorder: "#0f172a",
  moduleBorder: "#0f172a",
  cellLines: "#64748b",
  text: "#0f172a",
  textMuted: "#475569",
};

const DEFAULT_LAYER = "EPH-CABLE";
/** Arial width per character as a fraction of the font size (generous, matches the SLD layout). */
const CHAR_W = 0.56;

const num = (el: Element, name: string) => parseFloat(el.getAttribute(name) || "0") || 0;

const parseTranslate = (t: string | null): [number, number] => {
  const m = t && /translate\(\s*([-\d.e]+)[\s,]+([-\d.e]+)?\s*\)/.exec(t);
  return m ? [parseFloat(m[1]) || 0, parseFloat(m[2] || "0") || 0] : [0, 0];
};

/** Samples an SVG elliptical-arc path segment (circular arcs only) into points. */
const sampleArc = (
  x1: number, y1: number, r: number, largeArc: boolean, sweep: boolean, x2: number, y2: number, steps = 12
): Array<[number, number]> => {
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const d2 = dx * dx + dy * dy;
  const rr = Math.max(r, Math.sqrt(d2));
  const f = Math.sqrt(Math.max(0, (rr * rr - d2) / d2)) * (largeArc === sweep ? -1 : 1);
  const cx = (x1 + x2) / 2 + f * dy, cy = (y1 + y2) / 2 - f * dx;
  let a1 = Math.atan2(y1 - cy, x1 - cx), a2 = Math.atan2(y2 - cy, x2 - cx);
  let da = a2 - a1;
  if (sweep && da < 0) da += 2 * Math.PI;
  if (!sweep && da > 0) da -= 2 * Math.PI;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = a1 + (da * i) / steps;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)] as [number, number];
  });
};

export function captureSolarSld(
  config: SolarDesignConfig,
  calc: SolarCalculationResults,
  options: PictorialOptions,
  service: PictorialServiceInfo
): SldCapture {
  const layout = computePictorialLayout(config, calc);
  return captureSvgDrawing(
    layout.width,
    layout.bottom,
    React.createElement(SolarSLDPictorial, {
      config,
      calc,
      theme: CAD_WHITE_THEME,
      options,
      service,
      sheetWidth: layout.width,
      onSelect: () => {},
    })
  );
}

/** The BLOCK DIAGRAM as plain geometry (same drawing as on screen), for the PDF and DXF exports. */
export function captureSolarBlockDiagram(
  config: SolarDesignConfig,
  calc: SolarCalculationResults,
  panelDesignation?: string
): SldCapture {
  return captureSvgDrawing(
    BLOCK_W,
    BLOCK_H,
    React.createElement(SolarBlockDiagram, { config, calc, theme: CAD_WHITE_THEME, panelDesignation })
  );
}

/** The POINT-TO-POINT SHORT CIRCUIT DIAGRAM (same drawing as on screen), for the PDF and DXF exports. */
export function captureSolarShortCircuitDiagram(studies: SolarStudies): SldCapture {
  return captureSvgDrawing(
    SC_W,
    SC_H,
    React.createElement(SolarShortCircuitDiagram, { study: studies.sc, theme: CAD_WHITE_THEME, panelName: studies.panelName })
  );
}

/** The VOLTAGE DROP DIAGRAM (same drawing as on screen), for the PDF and DXF exports. */
export function captureSolarVoltageDropDiagram(studies: SolarStudies): SldCapture {
  return captureSvgDrawing(
    VD_W,
    VD_H,
    React.createElement(SolarVoltageDropDiagram, { study: studies.vd, theme: CAD_WHITE_THEME, panelName: studies.panelName })
  );
}

/** Renders an SVG drawing component off-screen and converts it to primitives in SVG units. */
function captureSvgDrawing(width: number, height: number, content: React.ReactElement): SldCapture {
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-100000px;top:0;width:1px;height:1px;overflow:hidden;";
  document.body.appendChild(host);
  const root = createRoot(host);
  const prims: SldPrimitive[] = [];
  try {
    flushSync(() => {
      root.render(
        React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", width, height }, content)
      );
    });
    const svg = host.querySelector("svg");
    if (svg) walk(svg, 0, 0, DEFAULT_LAYER, prims);
  } finally {
    root.unmount();
    host.remove();
  }

  const bbox = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
  const grow = (x: number, y: number) => {
    bbox.x1 = Math.min(bbox.x1, x); bbox.y1 = Math.min(bbox.y1, y);
    bbox.x2 = Math.max(bbox.x2, x); bbox.y2 = Math.max(bbox.y2, y);
  };
  for (const p of prims) {
    if (p.kind === "line") { grow(p.x1, p.y1); grow(p.x2, p.y2); }
    else if (p.kind === "poly") p.pts.forEach(([x, y]) => grow(x, y));
    else if (p.kind === "circle") { grow(p.cx - p.r, p.cy - p.r); grow(p.cx + p.r, p.cy + p.r); }
    else {
      const w = p.text.length * p.size * CHAR_W;
      const left = p.anchor === "middle" ? p.x - w / 2 : p.anchor === "end" ? p.x - w : p.x;
      grow(left, p.y - p.size * 0.8); grow(left + w, p.y + p.size * 0.25);
    }
  }
  return { prims, bbox };
}

function walk(el: Element, tx: number, ty: number, inherited: string, out: SldPrimitive[]) {
  for (const child of Array.from(el.children)) {
    const tag = child.tagName.toLowerCase();
    const own = child.getAttribute("data-cad-layer");
    const layer = own || inherited;
    // Ground conductors keep the ground layer even inside equipment symbols
    const stroke = child.getAttribute("stroke");
    const lineLayer = stroke === CAD_WHITE_THEME.groundLine ? "EPH-GROUND" : layer;
    const P = (x: number, y: number): [number, number] => [x + tx, y + ty];
    const sw = parseFloat(child.getAttribute("stroke-width") || "") || undefined;
    const st: Style = { sw, color: stroke || undefined };

    if (tag === "g") {
      const [dx, dy] = parseTranslate(child.getAttribute("transform"));
      walk(child, tx + dx, ty + dy, layer, out);
    } else if (tag === "line") {
      const [x1, y1] = P(num(child, "x1"), num(child, "y1"));
      const [x2, y2] = P(num(child, "x2"), num(child, "y2"));
      out.push({ kind: "line", layer: lineLayer, x1, y1, x2, y2, ...st });
    } else if (tag === "polyline" || tag === "polygon") {
      const vals = (child.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number);
      const pts: Array<[number, number]> = [];
      for (let i = 0; i + 1 < vals.length; i += 2) pts.push(P(vals[i], vals[i + 1]));
      // Solid fills (arrow heads) are kept so the PDF can fill them; white "background" fills are not
      const fill = (child.getAttribute("fill") || "none").toLowerCase();
      const filled = tag === "polygon" && fill !== "none" && fill !== CAD_WHITE_THEME.equipmentFill;
      if (pts.length > 1) out.push({ kind: "poly", layer: lineLayer, pts, closed: tag === "polygon", filled, ...st });
    } else if (tag === "rect") {
      const x = num(child, "x"), y = num(child, "y"), w = num(child, "width"), h = num(child, "height");
      out.push({ kind: "poly", layer: lineLayer, pts: [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)], closed: true, ...st });
    } else if (tag === "circle") {
      const [cx, cy] = P(num(child, "cx"), num(child, "cy"));
      out.push({ kind: "circle", layer: lineLayer, cx, cy, r: num(child, "r"), ...st });
    } else if (tag === "path") {
      // The SLD only uses "M x y A r r rot large sweep x y" arcs
      const m = /M\s*([-\d.]+)[\s,]+([-\d.]+)\s*A\s*([-\d.]+)[\s,]+[-\d.]+[\s,]+[-\d.]+[\s,]+([01])[\s,]+([01])[\s,]+([-\d.]+)[\s,]+([-\d.]+)/.exec(
        child.getAttribute("d") || ""
      );
      if (m) {
        const pts = sampleArc(+m[1], +m[2], +m[3], m[4] === "1", m[5] === "1", +m[6], +m[7]).map(([x, y]) => P(x, y));
        out.push({ kind: "poly", layer: lineLayer, pts, closed: false, ...st });
      }
    } else if (tag === "text") {
      const text = (child.textContent || "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const [x, y] = P(num(child, "x"), num(child, "y"));
      const anchor = (child.getAttribute("text-anchor") || "start") as "start" | "middle" | "end";
      const size = parseFloat(child.getAttribute("font-size") || "14") || 14;
      const bold = (child.getAttribute("font-weight") || "") === "bold";
      out.push({ kind: "text", layer: layer === "EPH-ANNO" ? "EPH-ANNO" : "EPH-TEXT", x, y, size, anchor, text, bold, color: child.getAttribute("fill") || undefined });
    }
  }
}
