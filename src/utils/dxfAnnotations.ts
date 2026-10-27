/**
 * Text, labels and dimensions from a DXF exported alongside an imported 3D model.
 *
 * SketchUp's 3D exports (DAE, OBJ, glTF) carry geometry only, so their text, labels and dimensions are
 * lost. SketchUp Pro's DXF export keeps them, in the same model coordinates, so they can be laid over
 * the imported model. Read here: TEXT, MTEXT, ATTRIB (block attributes), DIMENSION, MULTILEADER, and
 * TEXT/MTEXT inside inserted blocks. Coordinates stay in DXF units (Z up); placement into the 3D scene
 * is done by the viewer.
 */
import type { ModelAnnotation } from "../types";

/** DXF $INSUNITS code -> metres per drawing unit (0 = unitless) */
const INSUNITS_M: Record<number, number> = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1, 8: 0.0000254, 9: 0.0000254 * 1000, 10: 0.9144, 14: 0.1 };

export class DxfAnnotationError extends Error {}

/** Group code / value pairs of an ASCII DXF */
function pairs(text: string): [number, string][] {
  const lines = text.split(/\r?\n/);
  const out: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) {
      // Tolerate a stray blank line by realigning on the next numeric line
      i -= 1;
      continue;
    }
    out.push([code, lines[i + 1]]);
  }
  return out;
}

/** MTEXT/TEXT formatting codes removed, DXF escapes decoded; lines split on \P */
export function cleanDxfText(raw: string): string {
  let s = raw;
  s = s.replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  s = s.replace(/%%[cC]/g, "Ø").replace(/%%[dD]/g, "°").replace(/%%[pP]/g, "±").replace(/%%%/g, "%");
  s = s.replace(/%%[uUoO]/g, "");
  s = s.replace(/\\[Pp]/g, "\n");
  s = s.replace(/\\S([^;^/#]*)[\^/#]([^;]*);/g, "$1/$2"); // stacked fractions
  s = s.replace(/\\[ACcFfHhQqTtWwp][^;]*;/g, ""); // colour, font, height, oblique, tracking, width, paragraph
  s = s.replace(/\\[LlOoKkNn]/g, "");
  s = s.replace(/\\~/g, " ");
  s = s.replace(/\\([\\{}])/g, "$1");
  s = s.replace(/[{}]/g, "");
  return s.replace(/[ \t]+\n/g, "\n").trim();
}

type Ent = { type: string; g: Map<number, string[]> };

function readEntities(list: [number, string][], start: number, stopAt: (code: number, val: string) => boolean) {
  const ents: Ent[] = [];
  let cur: Ent | null = null;
  let i = start;
  for (; i < list.length; i++) {
    const [code, raw] = list[i];
    const val = raw.trim();
    if (stopAt(code, val)) break;
    if (code === 0) {
      cur = { type: val, g: new Map() };
      ents.push(cur);
      continue;
    }
    if (!cur) continue;
    const arr = cur.g.get(code);
    // Keep untrimmed text for 1/3 (leading spaces can matter); trimmed for the rest
    const v = code === 1 || code === 3 ? raw : val;
    if (arr) arr.push(v); else cur.g.set(code, [v]);
  }
  return { ents, end: i };
}

const num = (e: Ent, code: number, def = 0, idx = 0) => {
  const v = e.g.get(code)?.[idx];
  const n = v !== undefined ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : def;
};
const str = (e: Ent, code: number) => e.g.get(code)?.[0];

/**
 * Measured dimension value as text. With known units it is shown in metres (the Illumination module's
 * unit, e.g. "10.00 m"); unitless files keep the drawing value (up to 2 decimals).
 */
function fmtMeasure(v: number, unitMetres: number | null) {
  if (unitMetres) return `${(v * unitMetres).toFixed(2)} m`;
  return String(Math.round(v * 100) / 100);
}

export interface DxfAnnotationResult {
  annotations: ModelAnnotation[];
  /** Metres per DXF unit from $INSUNITS, or null when the file does not say */
  unitMetres: number | null;
  skipped: number;
}

let seq = 0;
const nid = () => `a${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Parse an ASCII DXF and return its text-like entities (DXF coordinates, Z up) */
export function parseDxfAnnotations(text: string): DxfAnnotationResult {
  if (!/\bSECTION\b/.test(text.slice(0, 4000)) || text.startsWith("AutoCAD Binary DXF")) {
    throw new DxfAnnotationError("This does not look like an ASCII DXF file. In SketchUp Pro use File > Export > 3D Model (or 2D Graphic) and choose AutoCAD DXF; binary DXF and DWG are not supported.");
  }
  const list = pairs(text);

  // Header: drawing units
  let unitMetres: number | null = null;
  for (let i = 0; i < list.length - 1; i++) {
    if (list[i][0] === 9 && list[i][1].trim() === "$INSUNITS") {
      const code = parseInt(list[i + 1][1], 10);
      unitMetres = INSUNITS_M[code] ?? null;
      break;
    }
  }

  // Blocks (for text inside inserted blocks)
  const blocks = new Map<string, { base: [number, number, number]; ents: Ent[] }>();
  const sectionStart = (name: string) => {
    for (let i = 0; i < list.length - 1; i++) {
      if (list[i][0] === 0 && list[i][1].trim() === "SECTION" && list[i + 1][0] === 2 && list[i + 1][1].trim() === name) return i + 2;
    }
    return -1;
  };
  const bs = sectionStart("BLOCKS");
  if (bs >= 0) {
    const { ents } = readEntities(list, bs, (c, v) => c === 0 && v === "ENDSEC");
    let cur: { name: string; base: [number, number, number]; ents: Ent[] } | null = null;
    for (const e of ents) {
      if (e.type === "BLOCK") {
        cur = { name: str(e, 2) || "", base: [num(e, 10), num(e, 20), num(e, 30)], ents: [] };
      } else if (e.type === "ENDBLK") {
        if (cur) blocks.set(cur.name, { base: cur.base, ents: cur.ents });
        cur = null;
      } else if (cur) {
        cur.ents.push(e);
      }
    }
  }

  const es = sectionStart("ENTITIES");
  if (es < 0) throw new DxfAnnotationError("The DXF has no ENTITIES section.");
  const { ents } = readEntities(list, es, (c, v) => c === 0 && v === "ENDSEC");

  const out: ModelAnnotation[] = [];
  let skipped = 0;

  type Xf = { ox: number; oy: number; oz: number; sx: number; sy: number; rot: number; bx: number; by: number; bz: number };
  const ident: Xf = { ox: 0, oy: 0, oz: 0, sx: 1, sy: 1, rot: 0, bx: 0, by: 0, bz: 0 };
  /** Point through an INSERT transform (block base, scale, rotation, insertion point) */
  const apply = (xf: Xf, x: number, y: number, z: number): [number, number, number] => {
    const lx = (x - xf.bx) * xf.sx;
    const ly = (y - xf.by) * xf.sy;
    const r = (xf.rot * Math.PI) / 180;
    return [xf.ox + lx * Math.cos(r) - ly * Math.sin(r), xf.oy + lx * Math.sin(r) + ly * Math.cos(r), xf.oz + (z - xf.bz)];
  };
  const scaleOf = (xf: Xf) => Math.abs(xf.sy || 1);

  const textOf = (e: Ent, kind: ModelAnnotation["kind"], xf: Xf, layerOverride?: string) => {
    const layer = layerOverride || str(e, 8) || "0";
    if (kind === "mtext") {
      const raw = [...(e.g.get(3) || []), ...(e.g.get(1) || [])].join("");
      const content = cleanDxfText(raw);
      if (!content) { skipped++; return; }
      const [x, y, z] = apply(xf, num(e, 10), num(e, 20), num(e, 30));
      // Rotation: X-axis direction (11/21) when present, else 50 (radians in MTEXT)
      let rot = e.g.has(11) ? (Math.atan2(num(e, 21), num(e, 11)) * 180) / Math.PI : (num(e, 50) * 180) / Math.PI;
      rot += xf.rot;
      const att = num(e, 71, 1);
      out.push({
        id: nid(), kind, text: content, x, y, z, height: num(e, 40, 1) * scaleOf(xf), rotation: rot, layer,
        hAlign: [1, 4, 7].includes(att) ? "left" : [2, 5, 8].includes(att) ? "center" : "right",
        vAlign: att <= 3 ? "top" : att <= 6 ? "middle" : "bottom",
        visible: true,
      });
      return;
    }
    const content = cleanDxfText(str(e, 1) || "");
    if (!content) { skipped++; return; }
    const h72 = num(e, 72, 0);
    const v73 = num(e, kind === "attrib" ? 74 : 73, 0);
    // With any justification other than left/baseline the alignment point (11/21/31) is the anchor
    const useAlign = (h72 !== 0 || v73 !== 0) && e.g.has(11);
    const [x, y, z] = apply(xf, useAlign ? num(e, 11) : num(e, 10), useAlign ? num(e, 21) : num(e, 20), useAlign ? num(e, 31) : num(e, 30));
    out.push({
      id: nid(), kind, text: content, x, y, z, height: num(e, 40, 1) * scaleOf(xf), rotation: num(e, 50) + xf.rot, layer,
      hAlign: h72 === 1 || h72 === 4 ? "center" : h72 === 2 ? "right" : "left",
      vAlign: v73 === 3 ? "top" : v73 === 2 || h72 === 4 ? "middle" : "bottom",
      visible: true,
    });
  };

  const walk = (list2: Ent[], xf: Xf, depth: number) => {
    for (let i = 0; i < list2.length; i++) {
      const e = list2[i];
      switch (e.type) {
        case "TEXT":
          textOf(e, "text", xf);
          break;
        case "MTEXT":
          textOf(e, "mtext", xf);
          break;
        case "ATTRIB":
          if ((num(e, 70) & 1) === 0) textOf(e, "attrib", xf);
          break;
        case "DIMENSION": {
          const measured = num(e, 42, NaN);
          const override = (str(e, 1) || "").trim();
          let content = override && override !== "<>" ? cleanDxfText(override.replace("<>", Number.isFinite(measured) ? fmtMeasure(measured, unitMetres) : "")) : Number.isFinite(measured) ? fmtMeasure(measured, unitMetres) : "";
          if (!content) { skipped++; break; }
          const [x, y, z] = apply(xf, num(e, 11), num(e, 21), num(e, 31));
          const p1 = apply(xf, num(e, 13), num(e, 23), num(e, 33));
          const p2 = apply(xf, num(e, 14), num(e, 24), num(e, 34));
          // Text height: from the dimension's block text when available, else 2.5 % of the measured length
          let h = 0;
          const blk = blocks.get(str(e, 2) || "");
          const bt = blk?.ents.find((b) => b.type === "MTEXT" || b.type === "TEXT");
          if (bt) h = num(bt, 40, 0);
          if (!h) h = Math.max(Number.isFinite(measured) ? Math.abs(measured) * 0.025 : 0, 0.0001);
          const rot = e.g.has(53) ? num(e, 53) : (Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180) / Math.PI;
          const upright = ((rot % 360) + 360) % 360;
          out.push({
            id: nid(), kind: "dimension", text: content, x, y, z, height: h * scaleOf(xf),
            rotation: upright > 90 && upright <= 270 ? rot - 180 : rot, layer: str(e, 8) || "0",
            hAlign: "center", vAlign: "middle", visible: true,
            dim: { x1: p1[0], y1: p1[1], z1: p1[2], x2: p2[0], y2: p2[1], z2: p2[2] },
          });
          break;
        }
        case "MULTILEADER":
        case "MLEADER": {
          const content = cleanDxfText((e.g.get(304) || []).join(""));
          if (!content) { skipped++; break; }
          const [x, y, z] = apply(xf, num(e, 12), num(e, 22), num(e, 32));
          out.push({ id: nid(), kind: "leader", text: content, x, y, z, height: num(e, 41, 0) || num(e, 140, 1), rotation: xf.rot, layer: str(e, 8) || "0", hAlign: "left", vAlign: "middle", visible: true });
          break;
        }
        case "INSERT": {
          const name = str(e, 2) || "";
          const blk = blocks.get(name);
          // Dimension blocks (*D...) are covered by their DIMENSION entity
          if (blk && depth < 6 && !/^\*D/i.test(name)) {
            const child: Xf = {
              ox: 0, oy: 0, oz: 0, sx: num(e, 41, 1), sy: num(e, 42, 1), rot: num(e, 50), bx: blk.base[0], by: blk.base[1], bz: blk.base[2],
            };
            const [ix, iy, iz] = apply(xf, num(e, 10), num(e, 20), num(e, 30));
            child.ox = ix; child.oy = iy; child.oz = iz;
            child.rot += xf.rot;
            child.sx *= xf.sx; child.sy *= xf.sy;
            walk(blk.ents.filter((b) => b.type !== "ATTDEF"), child, depth + 1);
          }
          break;
        }
        default:
          break;
      }
    }
  };
  walk(ents, ident, 0);
  return { annotations: out, unitMetres, skipped };
}
