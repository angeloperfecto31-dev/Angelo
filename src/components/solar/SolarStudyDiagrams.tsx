import React from "react";
import type { PictorialTheme } from "./SolarSLDPictorial";
import { kaText, shortPanelName, type SolarShortCircuitStudy, type SolarVoltageDropStudy } from "../../utils/solarStudies";

/**
 * Solar POINT-TO-POINT SHORT CIRCUIT DIAGRAM and VOLTAGE DROP DIAGRAM, each with its results table.
 * Plain SVG primitives on a fixed sheet (like the Block Diagram), so the same drawing is shown on the
 * SLD sheet and converted for the PDF and AutoCAD (DXF) exports (see solarSldCapture). Positions are
 * fixed and every table cell shrinks its text to fit, so nothing overlaps whatever the values are.
 */

export const SC_W = 980;
export const SC_H = 600;
export const VD_W = 980;
export const VD_H = 540;

const FONT = "Arial, Helvetica, sans-serif";
// Uppercase Arial advance as a fraction of the font size (used to shrink text to fit a width)
const CHAR_W = 0.66;

interface TProps {
  x: number;
  y: number;
  t: string;
  size?: number;
  anchor?: "start" | "middle" | "end";
  bold?: boolean;
  muted?: boolean;
  /** Shrinks the font so the text fits this width */
  maxW?: number;
  theme: PictorialTheme;
}
const T = ({ x, y, t, size = 13, anchor = "middle", bold, muted, maxW, theme }: TProps) => {
  const fs = maxW ? Math.max(7, Math.min(size, maxW / Math.max(1, t.length * CHAR_W))) : size;
  return (
    <text x={x} y={y} fontSize={`${Number(fs.toFixed(2))}px`} fontFamily={FONT} fontWeight={bold ? "bold" : "normal"} textAnchor={anchor} fill={muted ? theme.textMuted : theme.text}>
      {t}
    </text>
  );
};

interface Col {
  key: string;
  label: string;
  w: number;
  align?: "start" | "middle";
}

/** Ruled table: header row, body rows and an optional bold total row */
const Table = ({
  x,
  y,
  cols,
  rows,
  rowH = 26,
  theme,
  boldLast = false,
}: {
  x: number;
  y: number;
  cols: Col[];
  rows: Array<Record<string, string>>;
  rowH?: number;
  theme: PictorialTheme;
  boldLast?: boolean;
}) => {
  const width = cols.reduce((s, c) => s + c.w, 0);
  const n = rows.length + 1;
  const xs: number[] = [];
  cols.reduce((cx0, c) => (xs.push(cx0), cx0 + c.w), x);
  return (
    <g data-cad-layer="EPH-BORDER">
      <rect x={x} y={y} width={width} height={n * rowH} fill="none" stroke={theme.line} strokeWidth={1.4} />
      <rect x={x} y={y} width={width} height={rowH} fill="none" stroke={theme.line} strokeWidth={1.4} />
      {Array.from({ length: n - 1 }, (_, i) => (
        <line key={`r${i}`} x1={x} y1={y + (i + 1) * rowH} x2={x + width} y2={y + (i + 1) * rowH} stroke={theme.line} strokeWidth={0.8} />
      ))}
      {xs.slice(1).map((cx0, i) => (
        <line key={`c${i}`} x1={cx0} y1={y} x2={cx0} y2={y + n * rowH} stroke={theme.line} strokeWidth={0.8} />
      ))}
      {cols.map((c, ci) => (
        <T key={`h${c.key}`} x={c.align === "start" ? xs[ci] + 6 : xs[ci] + c.w / 2} y={y + rowH / 2 + 4} t={c.label} size={11} bold anchor={c.align === "start" ? "start" : "middle"} maxW={c.w - 10} theme={theme} />
      ))}
      {rows.map((r, ri) =>
        cols.map((c, ci) => (
          <T
            key={`${ri}-${c.key}`}
            x={c.align === "start" ? xs[ci] + 6 : xs[ci] + c.w / 2}
            y={y + (ri + 1) * rowH + rowH / 2 + 4}
            t={r[c.key] ?? ""}
            size={11}
            bold={boldLast && ri === rows.length - 1}
            anchor={c.align === "start" ? "start" : "middle"}
            maxW={c.w - 10}
            theme={theme}
          />
        ))
      )}
    </g>
  );
};

const Title = ({ title, sub, w, theme }: { title: string; sub: string; w: number; theme: PictorialTheme }) => (
  <g data-cad-layer="EPH-TITLE">
    <T x={w / 2} y={40} t={title} size={21} bold theme={theme} />
    <T x={w / 2} y={60} t={sub} size={12} muted maxW={w - 60} theme={theme} />
  </g>
);

/** Fault point marker: dot on the line, tag box and the available current below */
const FaultTag = ({ x, y, tag, amps, theme }: { x: number; y: number; tag: string; amps: number; theme: PictorialTheme }) => (
  <g data-cad-layer="EPH-ANNO">
    <circle cx={x} cy={y} r={5} fill={theme.line} stroke={theme.line} strokeWidth={1} />
    <line x1={x} y1={y + 5} x2={x} y2={y + 44} stroke={theme.line} strokeWidth={0.8} strokeDasharray="3 3" />
    <rect x={x - 17} y={y + 44} width={34} height={20} fill={theme.equipmentFill} stroke={theme.line} strokeWidth={1.4} />
    <T x={x} y={y + 59} t={tag} size={12} bold theme={theme} />
    <T x={x} y={y + 82} t={kaText(amps)} size={12} bold theme={theme} />
  </g>
);

const wire = (theme: PictorialTheme, layer = "EPH-CABLE") => ({ "data-cad-layer": layer, stroke: theme.line, strokeWidth: 2.4, fill: "none" });

// ======================================================================================
// POINT-TO-POINT SHORT CIRCUIT DIAGRAM
// ======================================================================================
export const SolarShortCircuitDiagram: React.FC<{ study: SolarShortCircuitStudy; theme: PictorialTheme; panelName?: string }> = ({ study, theme, panelName }) => {
  const y = 190; // the one-line run
  const P = Object.fromEntries(study.points.map((p) => [p.id, p]));
  const xU = 60, xT1 = 152, xT2 = 178, xF1 = 250, xBus = 420, xF3 = 600, xBk = 628, xInv = 690, invW = 80;
  const xF4 = 800, xIso = 818, xF5 = 872, xPv = 892;
  const feederTxt = `${study.feeder.lengthM} m, ${study.feeder.size} mm² x${study.feeder.runs} ${study.feeder.material === "Aluminum" ? "AL" : "CU"}`;
  const bus = shortPanelName(panelName);

  const rows = study.points.map((p) => ({
    tag: p.tag,
    loc: p.location,
    type: p.faultType,
    amps: kaText(p.amps),
    xr: p.xr != null ? p.xr.toFixed(2) : "-",
    device: p.device,
    rating: `${p.ratingKa} kA`,
    check: p.ok ? "OK" : "INADEQUATE",
  }));

  return (
    <g id="solar-short-circuit-diagram" fontFamily={FONT}>
      <Title
        title="SHORT CIRCUIT ANALYSIS - POINT-TO-POINT DIAGRAM"
        sub={`${/\dV/.test(study.serviceLabel) ? study.serviceLabel : `${study.serviceLabel} ${study.vService}V`} SERVICE - UTILITY ${study.utilityMva} MVA @ ${study.primaryKv} kV - TRANSFORMER ${study.transformerKva} kVA, Z ${study.transformerZPct}%`}
        w={SC_W}
        theme={theme}
      />

      {/* Utility source */}
      <g data-cad-layer="EPH-SLD">
        <circle cx={xU} cy={y} r={22} fill={theme.equipmentFill} stroke={theme.line} strokeWidth={2} />
        <path d={`M ${xU - 12} ${y} A 6 6 0 0 1 ${xU} ${y}`} fill="none" stroke={theme.line} strokeWidth={1.6} />
        <path d={`M ${xU} ${y} A 6 6 0 0 0 ${xU + 12} ${y}`} fill="none" stroke={theme.line} strokeWidth={1.6} />
      </g>
      <T x={xU} y={y - 52} t="UTILITY" size={13} bold theme={theme} />
      <T x={xU} y={y - 36} t={`${study.utilityMva} MVA`} size={11} muted theme={theme} />
      <polyline points={`${xU + 22},${y} ${xT1 - 18},${y}`} {...wire(theme)} />

      {/* Transformer */}
      <g data-cad-layer="EPH-SLD">
        <circle cx={xT1} cy={y} r={18} fill="none" stroke={theme.line} strokeWidth={2} />
        <circle cx={xT2} cy={y} r={18} fill="none" stroke={theme.line} strokeWidth={2} />
      </g>
      <T x={(xT1 + xT2) / 2} y={y - 52} t="TRANSFORMER" size={13} bold theme={theme} />
      <T x={(xT1 + xT2) / 2} y={y - 36} t={`${study.transformerKva} kVA, Z ${study.transformerZPct}%`} size={11} muted theme={theme} />
      <polyline points={`${xT2 + 18},${y} ${xBus},${y}`} {...wire(theme)} />

      {/* Service feeder */}
      <T x={(xF1 + xBus) / 2} y={y - 36} t="SERVICE FEEDER" size={12} bold theme={theme} />
      <T x={(xF1 + xBus) / 2} y={y - 20} t={feederTxt} size={11} muted maxW={xBus - xF1 - 30} theme={theme} />

      {/* Panel bus (point of interconnection) */}
      <line data-cad-layer="EPH-PANEL" x1={xBus} y1={y - 44} x2={xBus} y2={y + 30} stroke={theme.line} strokeWidth={6} />
      <T x={xBus} y={y - 66} t={`${bus} BUS`} size={13} bold maxW={150} theme={theme} />
      <T x={xBus} y={y - 52} t="(POINT OF INTERCONNECTION)" size={10} muted theme={theme} />

      {/* Inverter AC circuit */}
      <polyline points={`${xBus},${y} ${xBk},${y}`} {...wire(theme)} />
      <T x={(xBus + xF3) / 2} y={y - 36} t="INVERTER AC CABLE" size={12} bold theme={theme} />
      <T x={(xBus + xF3) / 2} y={y - 20} t={`${study.acCable.lengthM} m, ${study.acCable.sizeMm2} mm² CU`} size={11} muted maxW={xF3 - xBus - 30} theme={theme} />
      <g data-cad-layer="EPH-BREAKER">
        <rect x={xBk} y={y - 10} width={28} height={20} fill={theme.equipmentFill} stroke={theme.line} strokeWidth={1.6} />
        <line x1={xBk + 6} y1={y + 5} x2={xBk + 22} y2={y - 5} stroke={theme.line} strokeWidth={1.4} />
      </g>
      <T x={xBk + 14} y={y - 20} t="AC BKR" size={10} muted theme={theme} />
      <polyline points={`${xBk + 28},${y} ${xInv},${y}`} {...wire(theme)} />

      {/* Inverter(s) */}
      <g data-cad-layer="EPH-INVERTER">
        <rect x={xInv} y={y - 34} width={invW} height={68} rx={4} fill={theme.equipmentFill} stroke={theme.line} strokeWidth={2} />
        <line x1={xInv} y1={y + 34} x2={xInv + invW} y2={y - 34} stroke={theme.line} strokeWidth={1} />
        <T x={xInv + 20} y={y - 8} t="~" size={18} bold theme={theme} />
        <T x={xInv + invW - 20} y={y + 22} t="=" size={18} bold theme={theme} />
      </g>
      <T x={xInv + invW / 2} y={y - 52} t={study.inverterQty > 1 ? `${study.inverterQty} INVERTERS` : "INVERTER"} size={13} bold theme={theme} />
      <T x={xInv + invW / 2} y={y - 38} t={`${study.inverterContributionEachA} A EACH`} size={10} muted theme={theme} />

      {/* DC side */}
      <polyline data-cad-layer="EPH-DC" points={`${xInv + invW},${y} ${xIso},${y}`} stroke={theme.line} strokeWidth={2.4} fill="none" />
      <g data-cad-layer="EPH-BREAKER">
        <rect x={xIso} y={y - 10} width={24} height={20} fill={theme.equipmentFill} stroke={theme.line} strokeWidth={1.6} />
        <circle cx={xIso + 12} cy={y} r={5} fill="none" stroke={theme.line} strokeWidth={1.2} />
      </g>
      <T x={xIso + 12} y={y - 20} t="DC ISO" size={10} muted theme={theme} />
      <polyline data-cad-layer="EPH-DC" points={`${xIso + 24},${y} ${xPv},${y}`} stroke={theme.line} strokeWidth={2.4} fill="none" />
      <g data-cad-layer="EPH-PV">
        <polygon points={`${xPv + 12},${y - 26} ${xPv + 70},${y - 26} ${xPv + 58},${y + 26} ${xPv},${y + 26}`} fill={theme.equipmentFill} stroke={theme.line} strokeWidth={2} />
        <line x1={xPv + 6} y1={y} x2={xPv + 64} y2={y} stroke={theme.line} strokeWidth={1} />
        <line x1={xPv + 35} y1={y - 26} x2={xPv + 29} y2={y + 26} stroke={theme.line} strokeWidth={1} />
      </g>
      <T x={xPv + 35} y={y - 52} t="PV ARRAY" size={13} bold theme={theme} />
      <T x={xPv + 35} y={y - 38} t={`${study.stringsPerInverterMax} STR./INV.`} size={10} muted theme={theme} />

      {/* Fault points */}
      {P.service && <FaultTag x={xF1} y={y} tag="F1" amps={P.service.amps} theme={theme} />}
      {P.poi && <FaultTag x={xBus} y={y + 30} tag="F2" amps={P.poi.amps} theme={theme} />}
      {P["inv-ac"] && <FaultTag x={xF3} y={y} tag="F3" amps={P["inv-ac"].amps} theme={theme} />}
      {P["dc-input"] && <FaultTag x={xF4} y={y} tag="F4" amps={P["dc-input"].amps} theme={theme} />}
      {P["dc-string"] && <FaultTag x={xF5} y={y} tag="F5" amps={P["dc-string"].amps} theme={theme} />}

      {/* Results */}
      <T x={20} y={322} t="AVAILABLE FAULT CURRENT AND INTERRUPTING RATING CHECK" size={13} bold anchor="start" theme={theme} />
      <Table
        x={20}
        y={332}
        theme={theme}
        cols={[
          { key: "tag", label: "PT.", w: 40 },
          { key: "loc", label: "FAULT LOCATION", w: 300, align: "start" },
          { key: "type", label: "FAULT", w: 80 },
          { key: "amps", label: "AVAILABLE", w: 90 },
          { key: "xr", label: "X/R", w: 60 },
          { key: "device", label: "PROTECTIVE DEVICE", w: 220, align: "start" },
          { key: "rating", label: "RATING", w: 70 },
          { key: "check", label: "CHECK", w: 80 },
        ]}
        rows={rows}
      />
      <g data-cad-layer="EPH-TEXT">
        {[
          `METHOD: POINT-TO-POINT (OHMIC) - UTILITY Z = V²/MVAsc, TRANSFORMER Z% WITH X/R ${study.transformerXr}, PEC 2017 CH. 9 TABLE 9 R & X (R AT 20°C FOR MAXIMUM FAULT).`,
          `INVERTER CONTRIBUTION: ${study.inverterContributionEachA} A EACH (1.5 x MAX. AC CURRENT, TYPICAL - CONFIRM WITH MANUFACTURER). DC: STRING Isc x 1.25 = ${study.stringIscMaxA} A (PEC 6.90.8).`,
          study.usesProjectData
            ? "SOURCE DATA: SHORT CIRCUIT MODULE (UTILITY, TRANSFORMER AND SERVICE FEEDER OF THIS PROJECT)."
            : "SOURCE DATA: DEFAULT UTILITY / TRANSFORMER VALUES - ENTER THE ACTUAL DATA IN THE SHORT CIRCUIT MODULE.",
        ].map((ln, i) => (
          <T key={ln} x={20} y={530 + i * 17} t={ln} size={11} muted anchor="start" maxW={SC_W - 40} theme={theme} />
        ))}
      </g>
    </g>
  );
};

// ======================================================================================
// VOLTAGE DROP DIAGRAM
// ======================================================================================
export const SolarVoltageDropDiagram: React.FC<{ study: SolarVoltageDropStudy; theme: PictorialTheme; panelName?: string }> = ({ study, theme, panelName }) => {
  const y = 190;
  const nodes = [
    { x: 80, name: "PV STRING", sub: "SOURCE" },
    { x: 360, name: "INVERTER", sub: "DC IN / AC OUT" },
    { x: 640, name: shortPanelName(panelName), sub: "POINT OF INTERCONNECTION" },
    { x: 900, name: "SERVICE ENTRANCE", sub: "UTILITY METER" },
  ];
  const segs = study.segments;
  const fmtPct = (v: number) => `${v.toFixed(2)}%`;

  const rows = [
    ...segs.map((s, i) => ({
      seg: `${s.from} - ${s.to}`,
      cable: `${s.sizeMm2} mm²${s.runs > 1 ? ` x${s.runs}` : ""}`,
      len: `${s.lengthM}`,
      cur: `${s.currentA}`,
      v: `${s.basisV}`,
      vd: `${s.vdV.toFixed(2)}`,
      pct: fmtPct(s.vdPct),
      lim: fmtPct(s.limitPct),
      cum: fmtPct(study.cumulativePct[i]),
      check: s.ok ? "OK" : "EXCEEDS",
    })),
    {
      seg: "TOTAL: PV ARRAY TO SERVICE ENTRANCE",
      cable: "",
      len: `${segs.reduce((a, s) => a + s.lengthM, 0)}`,
      cur: "",
      v: "",
      vd: "",
      pct: fmtPct(study.totalPct),
      lim: fmtPct(study.totalLimitPct),
      cum: fmtPct(study.totalPct),
      check: study.totalOk ? "OK" : "EXCEEDS",
    },
  ];

  return (
    <g id="solar-voltage-drop-diagram" fontFamily={FONT}>
      <Title
        title="VOLTAGE DROP CALCULATION - VOLTAGE DROP DIAGRAM"
        sub={`DC ${fmtPct(study.dcPct)} + AC ${fmtPct(study.acPct)} = ${fmtPct(study.totalPct)} TOTAL (LIMIT ${fmtPct(study.totalLimitPct)}) - ${study.allOk ? "ALL SEGMENTS WITHIN LIMITS" : "REVIEW: A SEGMENT EXCEEDS ITS LIMIT"}`}
        w={VD_W}
        theme={theme}
      />

      {/* Run: node - cable - node ... */}
      {segs.map((s, i) => {
        const a = nodes[i].x, b = nodes[i + 1].x, mid = (a + b) / 2;
        const gap = b - a - 60;
        return (
          <g key={s.id}>
            <polyline points={`${a + 30},${y} ${b - 30},${y}`} {...wire(theme, s.side === "DC" ? "EPH-DC" : "EPH-CABLE")} strokeDasharray={s.side === "DC" ? "10 5" : undefined} />
            <T x={mid} y={y - 38} t={`${s.side} - ${s.lengthM} m, ${s.sizeMm2} mm²${s.runs > 1 ? ` x${s.runs}` : ""}`} size={12} bold maxW={gap} theme={theme} />
            <T x={mid} y={y - 22} t={`I = ${s.currentA} A @ ${s.basisV} V`} size={11} muted maxW={gap} theme={theme} />
            <T x={mid} y={y + 22} t={`VD = ${s.vdV.toFixed(2)} V (${fmtPct(s.vdPct)})`} size={12} bold maxW={gap} theme={theme} />
            <T x={mid} y={y + 38} t={`LIMIT ${fmtPct(s.limitPct)} - ${s.ok ? "OK" : "EXCEEDS"}`} size={11} muted maxW={gap} theme={theme} />
          </g>
        );
      })}

      {/* Nodes with the cumulative drop */}
      {nodes.map((n, i) => (
        <g key={n.name + i}>
          <g data-cad-layer="EPH-SLD">
            <rect x={n.x - 30} y={y - 22} width={60} height={44} rx={4} fill={theme.equipmentFill} stroke={theme.line} strokeWidth={2} />
            <T x={n.x} y={y + 5} t={i === 0 ? "PV" : i === 1 ? "INV" : i === 2 ? "PNL" : "SVC"} size={12} bold theme={theme} />
          </g>
          <T x={n.x} y={y - 70} t={n.name} size={13} bold maxW={150} theme={theme} />
          <T x={n.x} y={y - 56} t={n.sub} size={10} muted maxW={150} theme={theme} />
          <T x={n.x} y={y + 74} t={i === 0 ? "0.00%" : fmtPct(study.cumulativePct[i - 1])} size={12} bold theme={theme} />
          <T x={n.x} y={y + 89} t="CUMULATIVE" size={10} muted theme={theme} />
        </g>
      ))}

      {/* Results */}
      <T x={20} y={322} t="VOLTAGE DROP SCHEDULE" size={13} bold anchor="start" theme={theme} />
      <Table
        x={20}
        y={332}
        theme={theme}
        boldLast
        cols={[
          { key: "seg", label: "SEGMENT", w: 290, align: "start" },
          { key: "cable", label: "SIZE", w: 80 },
          { key: "len", label: "L (m)", w: 55 },
          { key: "cur", label: "I (A)", w: 65 },
          { key: "v", label: "V BASE", w: 65 },
          { key: "vd", label: "VD (V)", w: 65 },
          { key: "pct", label: "VD (%)", w: 70 },
          { key: "lim", label: "LIMIT", w: 70 },
          { key: "cum", label: "CUMUL.", w: 75 },
          { key: "check", label: "CHECK", w: 105 },
        ]}
        rows={rows}
      />
      <g data-cad-layer="EPH-TEXT">
        {[
          "VD = k x I x R x L / 1000 (k = 2 SINGLE-PHASE AND DC, 1.732 THREE-PHASE), UNITY POWER FACTOR AT THE INVERTER; R PER PEC 2017 CH. 9 (75°C).",
          `LIMITS: DC ${fmtPct(segs[0]?.limitPct ?? 0)}, AC ${fmtPct(segs[1]?.limitPct ?? 0)} PER SEGMENT (DESIGN SETTINGS); TOTAL ${fmtPct(study.totalLimitPct)} (PEC 2017 2.15.2(A) FPN NO. 2).`,
          "ON A GRID-TIED SYSTEM THE DROP IS A VOLTAGE RISE AT THE INVERTER TERMINALS WHILE EXPORTING; KEEP IT WITHIN THE INVERTER GRID-VOLTAGE WINDOW.",
        ].map((ln, i) => (
          <T key={ln} x={20} y={480 + i * 17} t={ln} size={11} muted anchor="start" maxW={VD_W - 40} theme={theme} />
        ))}
      </g>
    </g>
  );
};
