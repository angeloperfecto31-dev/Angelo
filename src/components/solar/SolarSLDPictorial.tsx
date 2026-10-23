import React from "react";
import { SolarDesignConfig, SolarCalculationResults } from "../../types/solar";

/**
 * Pictorial Solar PV Single Line Diagram (installation-style wiring diagram).
 *
 * Flow (left to right): PV strings -> DC isolator -> per-string DC breakers + DC SPD ->
 * inverter -> AC breaker + AC SPD -> AC isolator -> REC meter -> main service ->
 * bi-directional meter -> service entrance, with the existing panel board, EPS panel
 * and battery bank drawn when the design includes them.
 *
 * All ratings and labels come from the solar design; nothing is hard-coded per project.
 */

export interface PictorialTheme {
  line: string;
  groundLine: string;
  equipmentFill: string;
  equipmentBorder: string;
  moduleBorder: string;
  cellLines: string;
  text: string;
  textMuted: string;
  bg: string;
}

export interface PictorialOptions {
  showSolarMeter: boolean;
  showEpsLoad: boolean;
  showGrounding: boolean;
  showConductorSpecs: boolean;
}

export interface PictorialServiceInfo {
  mainBreakerAmps: number;
  mainBreakerPoles: number;
  feederLabel?: string;
  conduitLabel?: string;
  panelDesignation: string;
}

const MODULE_W = 40;
const MODULE_H = 100;
const MODULE_PITCH = 46;
const MAX_COLS = 9;
const ROW_H = 210;
const NOTE_ROW_H = 44;
const RISER_PITCH = 18;
const PAIR_GAP = 7;
const BREAKER_W = 30;
const BREAKER_H = 90;
const SPD_W = 16;
const PAIR_PITCH = 70;
const INV_W = 210;
const INV_H = 222;
const ISO_H = 90;

// Text metrics (diagram text is Arial). Widths are estimated generously so labels never collide.
const NOTE_X = 52;
const NOTE_FS = 13;
const TITLE_FS = 15;
const VAL_FS = 13;
const WARN_COLOR = "#b91c1c";
/** Wrap width for the panel board name under the panel. */
const PANEL_LABEL_W = 150;
const textWidth = (text: string, fontSize: number) => text.length * fontSize * 0.56;
/** Word-wraps text into lines that fit maxWidth at the given font size (nothing is cut off). */
const wrapLines = (text: string, maxWidth: number, fontSize: number) => {
  const maxChars = Math.max(6, Math.floor(maxWidth / (fontSize * 0.56)));
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
};

type ColSlot ={ kind: "module"; index: number } | { kind: "gap" };

/** Columns drawn for one string: all modules up to MAX_COLS, else first modules, a gap, and the last one. */
function stringColumns(modulesPerString: number): ColSlot[] {
  if (modulesPerString <= MAX_COLS) {
    return Array.from({ length: modulesPerString }, (_, i) => ({ kind: "module" as const, index: i + 1 }));
  }
  const head = MAX_COLS - 2;
  return [
    ...Array.from({ length: head }, (_, i) => ({ kind: "module" as const, index: i + 1 })),
    { kind: "gap" as const },
    { kind: "module" as const, index: modulesPerString },
  ];
}

/** Strings drawn top to bottom (highest number first); long arrays show the last, 2 and 1. */
function drawnStrings(numberOfStrings: number): number[] {
  const n = Math.max(1, numberOfStrings);
  if (n <= 3) return Array.from({ length: n }, (_, i) => n - i);
  return [n, 2, 1];
}

const STD_BREAKERS = [15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 125, 150, 175, 200, 225, 250, 300, 350, 400];

/**
 * EPS / backup output of a hybrid inverter. The output breaker is sized from the backup load used
 * for battery sizing (125% continuous); null when no battery (no backup load is defined).
 */
export function epsOutputInfo(config: SolarDesignConfig, calc: SolarCalculationResults) {
  if (config.systemType !== "hybrid" || !config.battery?.enabled) return null;
  const kw = config.battery.requiredBackupLoadKw || 25; // same fallback as the calculation engine
  const inv = calc.selectedInverter;
  const volts = inv.acVoltage || config.utilityVoltage || 230;
  const amps = (kw * 1000) / (inv.phase === "3PH" ? Math.sqrt(3) * volts : volts);
  const breakerA = STD_BREAKERS.find((a) => a >= amps * 1.25) ?? Math.ceil((amps * 1.25) / 50) * 50;
  const invKw = calc.totalInverterAcKw;
  return { kw, amps: Number(amps.toFixed(1)), breakerA, poles: calc.effective.acBreakerPoles, exceedsInverter: kw > invKw, invKw };
}

/** Design problems that the drawing must call out (engine warnings, without the DC/AC ratio notices). */
export function sldDesignIssues(config: SolarDesignConfig, calc: SolarCalculationResults): string[] {
  const issues = (calc.warnings || []).filter((w) => !/^NOTICE/i.test(w));
  const eps = epsOutputInfo(config, calc);
  if (eps?.exceedsInverter) {
    issues.push(
      `WARNING: Backup load (${eps.kw} kW) exceeds the inverter AC rating (${eps.invKw} kW); the EPS output cannot carry it. Reduce the essential loads or select a larger hybrid inverter.`
    );
  }
  return issues;
}

export function computePictorialLayout(config: SolarDesignConfig, calc: SolarCalculationResults, top = 110) {
  const eff = calc.effective;
  const strings = drawnStrings(eff.numberOfStrings);
  const hasHiddenStrings = eff.numberOfStrings > 3;
  const cols = stringColumns(Math.max(1, eff.modulesPerString));
  const hasBattery =
    (config.systemType === "hybrid" || config.systemType === "off-grid") && Boolean(config.battery?.enabled);
  const isOffGrid = config.systemType === "off-grid";

  // Array block. The string notes sit left of the modules, so the array starts after the widest note.
  const mod = calc.selectedModule;
  const tMin = config.minOperatingTempC ?? 18; // same default as the calculation engine
  const stringKwp = (eff.modulesPerString * mod.ratedPowerWp) / 1000;
  // String data from the calculation engine: Voc (STC and cold), Vmp (hot), Imp and the
  // PEC 6.90.8 maximum circuit current (1.25 x Isc) used for the string OCPD and conductors
  // Short lines keep the note column (and so the sheet) narrow
  const noteLines = (n: number) => [
    `STRING ${n}`,
    `${eff.modulesPerString} X ${mod.ratedPowerWp} W = ${stringKwp.toFixed(2)} kWp`,
    `${eff.modulesPerString} UNITS X ${mod.voc.toFixed(2)} V`,
    `= ${(eff.modulesPerString * mod.voc).toFixed(2)} V (Voc, STC)`,
    `Voc @ ${tMin}°C = ${calc.stringVoc} V`,
    `Vmp = ${calc.stringVmp} V`,
    `Imp = ${calc.stringImp} A`,
    `1.25 Isc = ${(calc.stringIsc * 1.25).toFixed(2)} A`,
  ];
  const noteWidth = Math.max(...noteLines(Math.max(1, eff.numberOfStrings)).map((t) => textWidth(t, NOTE_FS)));
  const arrayX = Math.max(175, NOTE_X + noteWidth + 34);
  const arrayRight = arrayX + cols.length * MODULE_PITCH - (MODULE_PITCH - MODULE_W);
  const isBifacial = /bi-?facial/i.test(`${mod.manufacturer} ${mod.model}`);
  const rowTitle = `${eff.modulesPerString} X ${mod.ratedPowerWp} Watts ${isBifacial ? "BI-FACIAL " : ""}Solar Panel in Series Connection`;
  const hidden = eff.numberOfStrings === 4 ? "STRING 3 IS" : `STRINGS 3 TO ${eff.numberOfStrings - 1} ARE`;
  const hiddenNote = `${hidden} IDENTICAL (NOT SHOWN) - ${eff.numberOfStrings} STRINGS TOTAL`;
  // Titles are centred over the modules but never start left of the sheet margin
  const titleW = Math.max(textWidth(rowTitle, TITLE_FS), hasHiddenStrings ? textWidth(hiddenNote, 14) : 0);
  const titleCx = Math.max((arrayX + arrayRight) / 2, NOTE_X + titleW / 2);
  const titleRight = titleCx + titleW / 2;
  const rows = strings.map((s, i) => ({
    stringNo: s,
    y: top + 10 + i * ROW_H + (hasHiddenStrings && i >= 1 ? NOTE_ROW_H : 0),
  }));
  const arrayBottom = rows[rows.length - 1].y + ROW_H - 10;
  const nD = strings.length;

  // Home-run risers (top row uses the rightmost riser so leads never cross).
  // They run down past the lower rows, so they must clear the widest row title.
  const riserBase = Math.max(arrayRight + 45, titleRight + 24);
  const riserX = (rowIdx: number) => riserBase + (nD - 1 - rowIdx) * RISER_PITCH;

  // Protection row
  // Minimum keeps the solar tap (and its callout) below the service feeder callout on short drawings
  const yBk = Math.max(arrayBottom + 95, top + 556);
  // DC isolator sits right of the risers; each string enters it from below (nested U-loops:
  // the rightmost riser takes the highest loop and the leftmost terminal, so no leads cross)
  const isoX = riserX(0) + PAIR_GAP + 40;
  const isoW = Math.max(64, 20 + nD * (PAIR_GAP + 14));
  const isoTermX = (k: number) => isoX + 10 + k * (PAIR_GAP + 14);
  const isoLoopY = (k: number) => yBk + ISO_H + 18 + k * 16;
  const isoLabelY = isoLoopY(nD - 1) + 6 + 22;
  const bkX0 = isoX + isoW + 50;
  const bkX = (k: number) => bkX0 + k * PAIR_PITCH;
  const groupRight = bkX(nD - 1) + BREAKER_W + 6 + SPD_W;

  // Inverter
  const invX = groupRight + 40;
  const invBottom = yBk - 60;
  const invY = invBottom - INV_H;
  const pvPortX = (k: number) => invX + 28 + (nD - 1 - k) * 12;
  const batPortX = invX + INV_W / 2 - 18;
  const epsPortX = invX + INV_W / 2 + 22;
  const gridPortX = invX + INV_W - 30;

  // AC side. Hybrid: EPS output breaker first (nearest the inverter), then the grid breaker + AC SPD,
  // so the EPS feed runs under the grid circuit instead of crossing it.
  const hasEpsCircuit = config.systemType === "hybrid";
  const epsBkX = invX + INV_W + 45;
  const acBkX = hasEpsCircuit ? epsBkX + BREAKER_W + 72 : invX + INV_W + 45;
  const acIsoCx = acBkX + BREAKER_W + SPD_W + 110;
  // CT comm cable enters the inverter right side through the gap before the AC breakers
  const comX = invX + INV_W + 20;
  const comEntryY = invBottom - 24;
  // Grid circuit route above the EPS route when both exist
  const gridRouteY = hasEpsCircuit ? yBk - 40 : yBk - 28;
  const acIsoY = invBottom - ISO_H + 25;
  const recCy = acIsoY - 70;
  const solarTapY = recCy - 75;
  const busX = acIsoCx + 260;
  const serviceY = top + 45;
  const mainSvcY = serviceY + 75;
  const panelTapY = mainSvcY + 85;
  const panelX = busX + 85;

  // Lower area
  const yUnder = (k: number) => yBk + BREAKER_H + 32 + (nD - 1 - k) * 12;
  const yUnderMax = yUnder(0);
  const yUnderAc = yBk + BREAKER_H + 32;
  const yEps = yUnderMax + 34;
  const epsX = acIsoCx + 70;
  const batBkY = yUnderMax + 60;
  const batBankY = batBkY + BREAKER_H + 30;
  const dcLabelY = yUnderMax + 34;
  const labelsBottom = dcLabelY + 4 * 17;

  // CT on the service conductor (load / export monitoring) wired back to the inverter: hybrid
  // inverters, or grid-tie systems with export limitation. The cable loops round the right side.
  // A hybrid inverter always needs its CT / meter (load monitoring), with or without net-metering
  const hasCt =
    !isOffGrid &&
    (hasEpsCircuit || (config.netMetering?.exportLimitation ?? "none") !== "none");
  const ctX = busX - 190;
  const ctLoopTop = serviceY - 30;
  const ctLoopX = panelX - 42 + PANEL_LABEL_W + 14;
  const ctLoopBottom = yEps + 84;

  const drawingBottom =
    Math.max(labelsBottom, hasBattery ? batBankY + 120 : 0, yBk + BREAKER_H + 150, hasCt ? ctLoopBottom + 10 : 0) + 20;

  // Includes the wrapped panel name, which starts at the panel board's left edge (and the CT loop)
  const width = (isOffGrid ? acIsoCx + 158 : panelX - 42) + PANEL_LABEL_W + 20 + (hasCt ? 24 : 0);

  // Design validation box under the drawing (only when the design has problems)
  const issues = sldDesignIssues(config, calc);
  const valX = NOTE_X - 10;
  const valW = Math.min(1400, width - valX - 10);
  const valLines = issues.flatMap((t, i) => wrapLines(`${i + 1}. ${t}`, valW - 28, VAL_FS));
  const valY = drawingBottom + 10;
  const valH = issues.length ? 40 + valLines.length * 17 + 8 : 0;
  const bottom = issues.length ? valY + valH + 20 : drawingBottom;

  return {
    noteLines,
    rowTitle,
    hiddenNote,
    titleCx,
    dcLabelY,
    strings,
    hasHiddenStrings,
    cols,
    arrayX,
    arrayRight,
    rows,
    arrayBottom,
    nD,
    riserX,
    yBk,
    isoX,
    isoW,
    isoTermX,
    isoLoopY,
    isoLabelY,
    hasEpsCircuit,
    epsBkX,
    comX,
    comEntryY,
    gridRouteY,
    hasCt,
    ctX,
    ctLoopTop,
    ctLoopX,
    ctLoopBottom,
    bkX,
    groupRight,
    invX,
    invY,
    invBottom,
    pvPortX,
    batPortX,
    epsPortX,
    gridPortX,
    acBkX,
    acIsoCx,
    acIsoY,
    recCy,
    solarTapY,
    busX,
    serviceY,
    mainSvcY,
    panelTapY,
    panelX,
    yUnder,
    yUnderMax,
    yUnderAc,
    yEps,
    epsX,
    batBkY,
    batBankY,
    bottom,
    width,
    hasBattery,
    isOffGrid,
    issues,
    valX,
    valY,
    valW,
    valH,
    valLines,
  };
}

interface Props {
  config: SolarDesignConfig;
  calc: SolarCalculationResults;
  theme: PictorialTheme;
  options: PictorialOptions;
  service: PictorialServiceInfo;
  sheetWidth: number;
  top?: number;
  onSelect: (key: string) => void;
}

export const SolarSLDPictorial: React.FC<Props> = ({
  config,
  calc,
  theme,
  options,
  service,
  sheetWidth,
  top = 110,
  onSelect,
}) => {
  const L = computePictorialLayout(config, calc, top);
  const eff = calc.effective;
  const mod = calc.selectedModule;
  const inv = calc.selectedInverter;
  const offsetX = Math.max(0, Math.round((sheetWidth - L.width) / 2));

  const isHybrid = config.systemType === "hybrid";
  const isGridTied = !L.isOffGrid;
  const hasNetMetering = isGridTied && config.netMetering?.enabled !== false;
  // EPS backup output exists on hybrid inverters; off-grid AC output already feeds the panel board
  const showEps = options.showEpsLoad && isHybrid;
  const eps = epsOutputInfo(config, calc);
  const showCt = L.hasCt;
  // A three-phase inverter on a single-phase service cannot be connected: the interconnection is drawn dashed
  const interconnectValid = calc.validations?.phaseCompatible !== false;
  const dcConduit = config.cabling?.dcCable?.conduitType || "RSC";
  const acConduit = config.cabling?.acCable?.conduitType || "RSC";
  const dcInsulation = config.cabling?.dcCable?.insulation || "PV1-F";
  const acInsulation = config.cabling?.acCable?.insulation || "THHN";
  const egcInsulation = config.dcProtection?.egcInsulation || "TW";
  const al = (m?: string) => (m === "Al" ? " AL" : "");
  const multiInverter = eff.inverterQuantity > 1;
  // Phase conductors (3 for 3PH, 2 for 1PH line-to-line, 1 for 1PH line-to-neutral), neutral, EGC
  const acSys = calc.acSystem;
  const acPhaseConductors = acSys ? acSys.phaseConductors : eff.acBreakerPoles;
  const acCalloutLines = [
    `${acPhaseConductors} - ${eff.acCableSizeMm2}mm²${al(config.cabling?.acCable?.material)} ${acInsulation}`,
    ...(acSys?.hasNeutral ? [`1 - ${eff.acCableSizeMm2}mm² (N)`] : []),
    `1 - ${eff.acEgcSizeMm2}mm² ${egcInsulation} (G)`,
    `IN ${eff.acConduitSizeMm}mm Ø ${acConduit}`,
    ...(multiInverter ? ["(EACH INVERTER OUTPUT)"] : []),
  ];
  const dcBreakerVolts = config.dcProtection?.fuseVoltageVolts ?? 1000;
  const acSpdVolts = config.acProtection?.spdRatingVolts ?? 440;
  const modelLines = wrapLines(inv.model, INV_W - 24, 12);
  const invLabel = L.isOffGrid ? "OFF-GRID" : isHybrid ? "HYBRID" : "GRID-TIE";

  const font = "Arial, Helvetica, sans-serif";
  const stroke = theme.line;
  const ground = theme.groundLine;
  const cellFill = theme.bg === "#ffffff" ? "#3d4f8c" : "#1e3a6e";

  // ---------- primitives ----------
  const Txt = (p: {
    x: number;
    y: number;
    children: React.ReactNode;
    size?: number;
    anchor?: "start" | "middle" | "end";
    weight?: string | number;
    muted?: boolean;
    color?: string;
  }) => (
    <text
      x={p.x}
      y={p.y}
      fontSize={`${p.size ?? 14}px`}
      fontFamily={font}
      fontWeight={p.weight ?? "normal"}
      textAnchor={p.anchor ?? "start"}
      fill={p.color ?? (p.muted ? theme.textMuted : theme.text)}
    >
      {p.children}
    </text>
  );

  // data-cad-layer tags are read by the AutoCAD (DXF) export, which converts this drawing;
  // a wire without its own layer takes the layer of the section it is drawn in
  const Wire = ({
    pts,
    color = stroke,
    w = 1.4,
    layer,
  }: {
    pts: Array<[number, number]>;
    color?: string;
    w?: number;
    layer?: string;
  }) => (
    <polyline data-cad-layer={layer || undefined} points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={color} strokeWidth={w} />
  );

  const Dot = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={3} fill={stroke} />;

  const GroundSym = ({ x, y }: { x: number; y: number }) =>
    options.showGrounding ? (
      <g data-cad-layer="EPH-GROUND" stroke={ground} strokeWidth={1.4}>
        <line x1={x} y1={y} x2={x} y2={y + 8} />
        <line x1={x - 7} y1={y + 8} x2={x + 7} y2={y + 8} />
        <line x1={x - 4.5} y1={y + 11.5} x2={x + 4.5} y2={y + 11.5} />
        <line x1={x - 2} y1={y + 15} x2={x + 2} y2={y + 15} />
      </g>
    ) : null;

  /**
   * Cable callout. On a vertical conductor (default) the underline crosses the wire at x with a tick;
   * on a horizontal conductor (`onHorizontalWire`) the text sits above the wire and only the tick is drawn.
   */
  const Callout = ({
    x,
    y,
    lines,
    side = "left",
    width = 300,
    onHorizontalWire = false,
  }: {
    x: number;
    y: number;
    lines: string[];
    side?: "left" | "right";
    width?: number;
    onHorizontalWire?: boolean;
  }) => {
    if (!options.showConductorSpecs) return null;
    const x2 = side === "left" ? x - width : x + width;
    const tx = (x + x2) / 2;
    return (
      <g data-cad-layer="EPH-ANNO">
        {!onHorizontalWire && (
          <line x1={Math.min(x, x2)} y1={y} x2={Math.max(x, x2)} y2={y} stroke={stroke} strokeWidth={1.6} />
        )}
        <line x1={x - 4} y1={y + 5} x2={x + 4} y2={y - 5} stroke={stroke} strokeWidth={1.4} />
        {lines.map((t, i) => (
          <Txt key={i} x={tx} y={y - 7 - (lines.length - 1 - i) * 14} size={13} anchor="middle">
            {t}
          </Txt>
        ))}
      </g>
    );
  };

  const PvModule = ({ x, y }: { x: number; y: number }) => {
    const pad = 3;
    const cw = (MODULE_W - pad * 2) / 2;
    const ch = (MODULE_H - pad * 2) / 10;
    return (
      <g data-cad-layer="EPH-PV">
        <rect x={x} y={y} width={MODULE_W} height={MODULE_H} fill={theme.equipmentFill} stroke={theme.moduleBorder} strokeWidth={1.3} />
        {Array.from({ length: 2 }).map((_, c) =>
          Array.from({ length: 10 }).map((__, r) => (
            <rect
              key={`${c}-${r}`}
              x={x + pad + c * cw + 0.6}
              y={y + pad + r * ch + 0.6}
              width={cw - 1.2}
              height={ch - 1.2}
              fill={cellFill}
              stroke={theme.cellLines}
              strokeWidth={0.4}
            />
          ))
        )}
        {/* Terminals (+ left, - right) */}
        <rect x={x + 6} y={y + MODULE_H} width={6} height={6} fill={theme.equipmentFill} stroke={stroke} strokeWidth={1} />
        <rect x={x + MODULE_W - 12} y={y + MODULE_H} width={6} height={6} fill={theme.equipmentFill} stroke={stroke} strokeWidth={1} />
      </g>
    );
  };

  const Isolator = ({ x, y, w, label, onClick }: { x: number; y: number; w: number; label: string; onClick: () => void }) => {
    const cx = x + w / 2;
    const cy = y + ISO_H / 2 + 12;
    return (
      <g data-cad-layer="EPH-BREAKER" className="cursor-pointer" onClick={onClick}>
        <rect x={x} y={y} width={w} height={ISO_H} rx={3} fill={theme.equipmentFill} stroke={theme.equipmentBorder} strokeWidth={1.6} />
        <Txt x={cx} y={y + 16} size={13} anchor="middle">
          {label}
        </Txt>
        <circle cx={cx} cy={cy} r={17} fill="none" stroke={stroke} strokeWidth={1.4} />
        <rect x={cx - 3} y={cy - 2} width={6} height={18} rx={1} fill={theme.equipmentFill} stroke={stroke} strokeWidth={1.2} />
        <circle cx={cx} cy={cy} r={3} fill={stroke} />
      </g>
    );
  };

  const Breaker2P = ({ x, y }: { x: number; y: number }) => (
    <g data-cad-layer="EPH-BREAKER">
      <rect x={x} y={y} width={BREAKER_W} height={BREAKER_H} fill={theme.equipmentFill} stroke={theme.equipmentBorder} strokeWidth={1.4} />
      {[y + 9, y + BREAKER_H - 9].map((ty, i) => (
        <g key={i}>
          {[x + 8, x + BREAKER_W - 8].map((tx) => (
            <g key={tx}>
              <circle cx={tx} cy={ty} r={4.5} fill="none" stroke={stroke} strokeWidth={1.1} />
              <line x1={tx - 3} y1={ty} x2={tx + 3} y2={ty} stroke={stroke} strokeWidth={1} />
              <line x1={tx} y1={ty - 3} x2={tx} y2={ty + 3} stroke={stroke} strokeWidth={1} />
            </g>
          ))}
        </g>
      ))}
      <line x1={x} y1={y + 18} x2={x + BREAKER_W} y2={y + 18} stroke={stroke} strokeWidth={1} />
      <line x1={x} y1={y + BREAKER_H - 18} x2={x + BREAKER_W} y2={y + BREAKER_H - 18} stroke={stroke} strokeWidth={1} />
      {[x + 5, x + 10, x + 15, x + 20, x + 25].map((gx) => (
        <line key={gx} x1={gx} y1={y + 24} x2={gx} y2={y + 34} stroke={stroke} strokeWidth={0.8} />
      ))}
      <rect x={x + 9} y={y + 40} width={12} height={12} fill={stroke} />
      <line x1={x + BREAKER_W / 2} y1={y + 56} x2={x + BREAKER_W / 2} y2={y + BREAKER_H - 22} stroke={stroke} strokeWidth={1} />
    </g>
  );

  const Spd = ({ x, y }: { x: number; y: number }) => (
    <g data-cad-layer="EPH-BREAKER">
      <rect x={x} y={y + 8} width={SPD_W} height={BREAKER_H - 16} fill={theme.equipmentFill} stroke={theme.equipmentBorder} strokeWidth={1.3} />
      <rect x={x + 3} y={y + 30} width={SPD_W - 6} height={14} fill="none" stroke={stroke} strokeWidth={1} />
      <line x1={x + SPD_W / 2} y1={y + BREAKER_H - 8} x2={x + SPD_W / 2} y2={y + BREAKER_H + 2} stroke={ground} strokeWidth={1.3} />
      <GroundSym x={x + SPD_W / 2} y={y + BREAKER_H + 2} />
    </g>
  );

  const Meter = ({ cx, cy, onClick }: { cx: number; cy: number; onClick?: () => void }) => (
    <g data-cad-layer="EPH-SLD" className={onClick ? "cursor-pointer" : undefined} onClick={onClick}>
      <circle cx={cx} cy={cy} r={16} fill={theme.equipmentFill} stroke={stroke} strokeWidth={1.6} />
      <Txt x={cx} y={cy + 5} size={16} anchor="middle">
        M
      </Txt>
    </g>
  );

  // ---------- drawing ----------

  return (
    <g id="sld-pictorial" transform={`translate(${offsetX}, 0)`} fontFamily={font}>
      {/* ===================== PV ARRAY (one row per string) ===================== */}
      <g id="sld-pv-array" data-cad-layer="EPH-DC" className="cursor-pointer" onClick={() => onSelect("pv_module")}>
        {L.rows.map((row, rowIdx) => {
          const y0 = row.y;
          const modY = y0 + 56;
          const modXs = L.cols.map((_, c) => L.arrayX + c * MODULE_PITCH);
          const firstX = modXs[0];
          const lastX = modXs[modXs.length - 1];
          const termY = modY + MODULE_H + 3;
          const posLeadY = modY + MODULE_H + 28;
          const negLeadY = modY + MODULE_H + 20;
          const rx = L.riserX(rowIdx);
          return (
            <g key={row.stringNo}>
              <Txt x={L.titleCx} y={y0 + 14} size={TITLE_FS} anchor="middle">
                {L.rowTitle}
              </Txt>
              <Txt x={L.titleCx} y={y0 + 32} size={TITLE_FS} anchor="middle">
                ( STRING {row.stringNo} )
              </Txt>

              {/* Left string note */}
              {L.noteLines(row.stringNo).map((t, i) => (
                <Txt key={i} x={NOTE_X} y={modY + 8 + i * 16} size={NOTE_FS} weight={i === 0 ? "bold" : "normal"}>
                  {t}
                </Txt>
              ))}

              {/* Frame bonding conductor along the top of the row */}
              {options.showGrounding && (
                <g>
                  <line x1={firstX - 22} y1={y0 + 46} x2={lastX + MODULE_W / 2} y2={y0 + 46} stroke={ground} strokeWidth={1.3} />
                  {L.cols.map((slot, c) =>
                    slot.kind === "module" ? (
                      <line key={c} x1={modXs[c] + MODULE_W / 2} y1={y0 + 46} x2={modXs[c] + MODULE_W / 2} y2={modY} stroke={ground} strokeWidth={1.1} />
                    ) : null
                  )}
                  <GroundSym x={firstX - 22} y={y0 + 46} />
                </g>
              )}

              {/* Modules, series jumpers and gap indicator */}
              {L.cols.map((slot, c) =>
                slot.kind === "module" ? (
                  <PvModule key={c} x={modXs[c]} y={modY} />
                ) : (
                  <g key={c}>
                    <Txt x={modXs[c] + MODULE_W / 2} y={modY + MODULE_H / 2} size={18} anchor="middle" weight="bold">
                      ...
                    </Txt>
                    {/* Two short lines so the count stays inside the gap column */}
                    {[`+${eff.modulesPerString - (L.cols.length - 1)}`, "MORE"].map((t, i) => (
                      <Txt key={t} x={modXs[c] + MODULE_W / 2} y={modY + MODULE_H / 2 + 16 + i * 13} size={11} anchor="middle" muted>
                        {t}
                      </Txt>
                    ))}
                  </g>
                )
              )}
              {L.cols.slice(0, -1).map((slot, c) => {
                const next = L.cols[c + 1];
                if (slot.kind !== "module" || next.kind !== "module") {
                  // Series path continues through the omitted modules
                  return (
                    <line
                      key={`j${c}`}
                      x1={modXs[c] + (slot.kind === "module" ? MODULE_W - 9 : 0)}
                      y1={termY + 9}
                      x2={modXs[c + 1] + (next.kind === "module" ? 9 : MODULE_W)}
                      y2={termY + 9}
                      stroke={stroke}
                      strokeWidth={1.2}
                      strokeDasharray="4 3"
                    />
                  );
                }
                return (
                  <Wire
                    key={`j${c}`}
                    w={1.2}
                    pts={[
                      [modXs[c] + MODULE_W - 9, termY + 3],
                      [modXs[c] + MODULE_W - 9, termY + 9],
                      [modXs[c + 1] + 9, termY + 9],
                      [modXs[c + 1] + 9, termY + 3],
                    ]}
                  />
                );
              })}

              {/* String home run: (+) from first module, (-) from last module, down past the DC isolator
                  and up into its bottom terminals ((-) takes the upper loop so the pair never crosses) */}
              <Wire
                layer="EPH-DC"
                pts={[
                  [firstX + 9, termY + 3],
                  [firstX + 9, posLeadY],
                  [rx, posLeadY],
                  [rx, L.isoLoopY(rowIdx) + 6],
                  [L.isoTermX(rowIdx) + PAIR_GAP, L.isoLoopY(rowIdx) + 6],
                  [L.isoTermX(rowIdx) + PAIR_GAP, L.yBk + ISO_H],
                ]}
              />
              <Wire
                layer="EPH-DC"
                pts={[
                  [lastX + MODULE_W - 9, termY + 3],
                  [lastX + MODULE_W - 9, negLeadY],
                  [rx + PAIR_GAP, negLeadY],
                  [rx + PAIR_GAP, L.isoLoopY(rowIdx)],
                  [L.isoTermX(rowIdx), L.isoLoopY(rowIdx)],
                  [L.isoTermX(rowIdx), L.yBk + ISO_H],
                ]}
              />
            </g>
          );
        })}
        {L.hasHiddenStrings && (
          <Txt x={L.titleCx} y={L.rows[1].y - 14} size={14} anchor="middle" muted>
            {L.hiddenNote}
          </Txt>
        )}
      </g>

      {/* DC home-run conductor callout */}
      <Callout
        x={L.riserX(0) + PAIR_GAP + 8}
        y={L.arrayBottom + 52}
        width={L.riserX(0) + PAIR_GAP + 8 - (L.riserX(L.nD - 1) - 340)}
        lines={[
          `2 - ${eff.dcCableSizeMm2}mm²${al(config.cabling?.dcCable?.material)} ${dcInsulation}`,
          `1 - ${eff.dcEgcSizeMm2}mm² ${egcInsulation} (G) IN ${eff.dcConduitSizeMm}mm Ø ${dcConduit}`,
        ]}
      />

      {/* ===================== DC ISOLATOR ===================== */}
      <Isolator x={L.isoX} y={L.yBk} w={L.isoW} label="DC ISO." onClick={() => onSelect("dc_disconnect")} />
      {/* Terminal stubs on the isolator bottom (string inputs) */}
      {L.strings.map((_, k) =>
        [L.isoTermX(k), L.isoTermX(k) + PAIR_GAP].map((tx) => (
          <rect key={`isot-${k}-${tx}`} x={tx - 2.5} y={L.yBk + ISO_H} width={5} height={4} fill={theme.equipmentFill} stroke={stroke} strokeWidth={1} />
        ))
      )}
      <Txt x={L.isoX + L.isoW / 2} y={L.isoLabelY} size={13} anchor="middle">
        {eff.dcIsolatorRatingAmps}A, {config.dcProtection?.isolatorVoltageVolts ?? 1000}V DC
      </Txt>
      {eff.numberOfStrings > 1 && (
        <Txt x={L.isoX + L.isoW / 2} y={L.isoLabelY + 16} size={12} anchor="middle" muted>
          (PER STRING)
        </Txt>
      )}

      {/* ISO outputs to each string breaker (farthest breaker uses the highest route) */}
      {L.strings.map((_, k) => {
        const gx = L.isoX + L.isoW - 10 - k * 10;
        const routeY = L.yBk - 24 - k * 12;
        const bx = L.bkX(k) + BREAKER_W / 2;
        return <Wire key={`iso-out-${k}`} layer="EPH-DC" pts={[[gx, L.yBk], [gx, routeY], [bx, routeY], [bx, L.yBk]]} />;
      })}

      {/* ===================== DC BREAKERS + DC SPD ===================== */}
      <g data-cad-layer="EPH-DC" className="cursor-pointer" onClick={() => onSelect("dc_disconnect")}>
        {L.strings.map((s, k) => {
          const bx = L.bkX(k);
          const sx = bx + BREAKER_W + 6;
          return (
            <g key={`dcbk-${s}`}>
              <Breaker2P x={bx} y={L.yBk} />
              <Spd x={sx} y={L.yBk} />
              <line x1={bx + BREAKER_W} y1={L.yBk + BREAKER_H - 9} x2={sx} y2={L.yBk + BREAKER_H - 9} stroke={stroke} strokeWidth={1.1} />
              <Dot x={bx + BREAKER_W} y={L.yBk + BREAKER_H - 9} />
              <Txt x={bx + BREAKER_W / 2 + 5} y={L.yBk - 5} size={12} muted>
                S{s}
              </Txt>
              {/* Breaker output to inverter PV input (nearest breaker uses the lowest route) */}
              <Wire
                pts={[
                  [bx + BREAKER_W / 2, L.yBk + BREAKER_H],
                  [bx + BREAKER_W / 2, L.yUnder(k)],
                  [L.pvPortX(k), L.yUnder(k)],
                  [L.pvPortX(k), L.invBottom + 14],
                ]}
              />
            </g>
          );
        })}
        {/* Short stacked lines under the breakers, kept left of the battery / EPS conductors */}
        {[
          `${eff.dcFuseRatingAmps} AT, 2P`,
          `${dcBreakerVolts}V DC BREAKER`,
          `DC SPD, Uc = ${eff.dcSpdUcVolts}V`,
          ...(L.nD > 1 ? ["(1 SET PER STRING)"] : []),
        ].map((t, i) => (
          <Txt key={i} x={L.bkX(0) - 8} y={L.dcLabelY + i * 17} size={13}>
            {t}
          </Txt>
        ))}
      </g>

      {/* ===================== INVERTER ===================== */}
      <g data-cad-layer="EPH-INVERTER" className="cursor-pointer" onClick={() => onSelect("inverter")}>
        <rect x={L.invX} y={L.invY} width={INV_W} height={INV_H} rx={6} fill={theme.equipmentFill} stroke={theme.equipmentBorder} strokeWidth={2} />
        {[
          [L.invX + 10, L.invY + 10],
          [L.invX + INV_W - 10, L.invY + 10],
          [L.invX + 10, L.invY + INV_H - 10],
          [L.invX + INV_W - 10, L.invY + INV_H - 10],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={3.5} fill={stroke} />
        ))}
        {/* Display & keypad */}
        <rect x={L.invX + INV_W / 2 - 26} y={L.invY + 26} width={52} height={60} rx={3} fill="none" stroke={stroke} strokeWidth={1.4} />
        <rect x={L.invX + INV_W / 2 - 18} y={L.invY + 34} width={36} height={24} rx={2} fill="none" stroke={stroke} strokeWidth={1.2} />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={L.invX + INV_W / 2 - 17 + i * 9} y={L.invY + 66} width={7} height={6} fill="none" stroke={stroke} strokeWidth={1} />
        ))}
        <Txt x={L.invX + INV_W / 2} y={L.invY + 122} size={18} anchor="middle">
          {invLabel}
        </Txt>
        <Txt x={L.invX + INV_W / 2} y={L.invY + 142} size={12} anchor="middle" muted>
          {eff.inverterQuantity}x {inv.manufacturer}
        </Txt>
        {/* Model name wraps (up to 3 lines) inside the enclosure instead of being squeezed */}
        {modelLines.map((ln, i) => (
          <Txt key={i} x={L.invX + INV_W / 2} y={L.invY + 158 + i * 14} size={12} anchor="middle" muted>
            {ln}
          </Txt>
        ))}
        <Txt x={L.invX + INV_W / 2} y={L.invY + 162 + modelLines.length * 14} size={12} anchor="middle" muted>
          {calc.totalInverterAcKw} kW AC, {inv.phase} {inv.acVoltage}V
        </Txt>
        {/* Side bracket */}
        <rect x={L.invX - 7} y={L.invY + 60} width={7} height={22} fill="none" stroke={stroke} strokeWidth={1.2} />
        {/* Bottom glands / ports */}
        {L.strings.map((_, k) => (
          <rect key={`pvport-${k}`} x={L.pvPortX(k) - 4} y={L.invBottom} width={8} height={14} fill="none" stroke={stroke} strokeWidth={1.1} />
        ))}
        {L.hasBattery && <rect x={L.batPortX - 8} y={L.invBottom} width={16} height={22} rx={3} fill="none" stroke={stroke} strokeWidth={1.2} />}
        {showEps && <rect x={L.epsPortX - 6} y={L.invBottom} width={12} height={16} fill="none" stroke={stroke} strokeWidth={1.2} />}
        <rect x={L.gridPortX - 10} y={L.invBottom} width={20} height={14} fill="none" stroke={stroke} strokeWidth={1.2} />
        {showCt && <rect x={L.invX + INV_W} y={L.comEntryY - 4} width={8} height={8} fill="none" stroke={stroke} strokeWidth={1.1} />}
        {eff.inverterQuantity > 1 && (
          <Txt x={L.invX + INV_W / 2} y={L.invY - 10} size={13} anchor="middle">
            TYP. OF {eff.inverterQuantity} INVERTERS
          </Txt>
        )}
        {acSys?.phaseDistribution && (
          <Txt x={L.invX + INV_W / 2} y={L.invY - (eff.inverterQuantity > 1 ? 27 : 10)} size={12} anchor="middle" muted>
            {acSys.inverterConnectionLabel}: {acSys.phaseDistribution.filter(([, n]) => n > 0).map(([p, n]) => `${p} x${n}`).join(", ")}
          </Txt>
        )}
        <Txt x={L.invX - 6} y={L.invBottom + 26} size={12} anchor="end" muted>
          PV IN
        </Txt>
        {/* Hybrid: the grid route runs higher, so the GRID label moves left of its port */}
        <Txt x={L.hasEpsCircuit ? L.gridPortX - 12 : L.gridPortX + 6} y={L.invBottom + 26} size={12} anchor={L.hasEpsCircuit ? "end" : "start"} muted>
          {L.isOffGrid ? "AC OUT" : "GRID"}
        </Txt>
      </g>

      {/* ===================== BATTERY (hybrid / off-grid) ===================== */}
      {L.hasBattery && (
        <g>
          <Wire layer="EPH-BATTERY" pts={[[L.batPortX, L.invBottom + 22], [L.batPortX, L.batBkY]]} />
          <g className="cursor-pointer" onClick={() => onSelect("battery_breaker")}>
            <Breaker2P x={L.batPortX - BREAKER_W / 2} y={L.batBkY} />
            <Txt x={L.batPortX + BREAKER_W / 2 + 8} y={L.batBkY + 40} size={13}>
              BATTERY OCPD
            </Txt>
          </g>
          <Wire layer="EPH-BATTERY" pts={[[L.batPortX, L.batBkY + BREAKER_H], [L.batPortX, L.batBankY]]} />
          <g data-cad-layer="EPH-BATTERY" className="cursor-pointer" onClick={() => onSelect("battery_bank")}>
            <rect x={L.batPortX - 70} y={L.batBankY} width={140} height={90} rx={4} fill={theme.equipmentFill} stroke={theme.equipmentBorder} strokeWidth={1.6} />
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <rect x={L.batPortX - 60} y={L.batBankY + 10 + i * 24} width={120} height={18} rx={2} fill="none" stroke={stroke} strokeWidth={1} />
                <circle cx={L.batPortX + 48} cy={L.batBankY + 19 + i * 24} r={2.5} fill={stroke} />
              </g>
            ))}
            <Txt x={L.batPortX} y={L.batBankY + 108} size={14} anchor="middle">
              BATTERY BANK - {calc.batteryUsableEnergyKwh} kWh USABLE
            </Txt>
            <Txt x={L.batPortX} y={L.batBankY + 123} size={12} anchor="middle" muted>
              {eff.batteryUnits}x {config.battery.manufacturer} {config.battery.model} ({config.battery.voltageV}V / {config.battery.capacityAh}Ah)
            </Txt>
          </g>
        </g>
      )}

      {/* ===================== EPS OUTPUT BREAKER (hybrid) ===================== */}
      {/* The EPS circuit is rated like the inverter output (its current cannot exceed the inverter's) */}
      {showEps && (
        <g className="cursor-pointer" onClick={() => onSelect("eps_panel")}>
          <Wire pts={[[L.epsPortX, L.invBottom + 16], [L.epsPortX, L.yBk - 24], [L.epsBkX + BREAKER_W / 2, L.yBk - 24], [L.epsBkX + BREAKER_W / 2, L.yBk]]} />
          <Breaker2P x={L.epsBkX} y={L.yBk} />
          {[`${eff.acBreakerAtAmps} AT`, `${eff.acBreakerPoles}P, AC`, "EPS OUT"].map((t, i) => (
            <Txt key={t} x={L.epsBkX + BREAKER_W + 8} y={L.yBk + 22 + i * 15} size={i < 2 ? 14 : 12} muted={i === 2}>
              {t}
            </Txt>
          ))}
        </g>
      )}

      {/* ===================== AC BREAKER + AC SPD ===================== */}
      <Wire pts={[[L.gridPortX, L.invBottom + 14], [L.gridPortX, L.gridRouteY], [L.acBkX + BREAKER_W / 2, L.gridRouteY], [L.acBkX + BREAKER_W / 2, L.yBk]]} />
      <g>
        <Breaker2P x={L.acBkX} y={L.yBk} />
        <Spd x={L.acBkX + BREAKER_W + 6} y={L.yBk} />
        <line x1={L.acBkX + BREAKER_W} y1={L.yBk + BREAKER_H - 9} x2={L.acBkX + BREAKER_W + 6} y2={L.yBk + BREAKER_H - 9} stroke={stroke} strokeWidth={1.1} />
        <Dot x={L.acBkX + BREAKER_W} y={L.yBk + BREAKER_H - 9} />
        <Txt x={L.acBkX + BREAKER_W + SPD_W + 14} y={L.yBk + 22} size={14}>
          {eff.acBreakerAtAmps} AT
        </Txt>
        <Txt x={L.acBkX + BREAKER_W + SPD_W + 14} y={L.yBk + 37} size={14}>
          {eff.acBreakerPoles}P, AC
        </Txt>
        <Txt x={L.acBkX + BREAKER_W + SPD_W + 14} y={L.yBk + 58} size={14}>
          {acSpdVolts}V
        </Txt>
        <Txt x={L.acBkX + BREAKER_W + SPD_W + 14} y={L.yBk + 73} size={14}>
          AC SPD
        </Txt>
        {multiInverter && (
          <Txt x={L.acBkX + BREAKER_W + SPD_W + 14} y={L.yBk + 92} size={12} muted>
            (EACH INV.)
          </Txt>
        )}
      </g>
      <Wire
        pts={[
          [L.acBkX + BREAKER_W / 2, L.yBk + BREAKER_H],
          [L.acBkX + BREAKER_W / 2, L.yUnderAc],
          [L.acIsoCx, L.yUnderAc],
          [L.acIsoCx, L.acIsoY + ISO_H],
        ]}
      />

      {/* ===================== AC ISOLATOR ===================== */}
      <Isolator x={L.acIsoCx - 26} y={L.acIsoY} w={52} label="AC ISO." onClick={() => onSelect("ac_disconnect")} />
      <Txt x={L.acIsoCx + 34} y={L.acIsoY + ISO_H - 8} size={13}>
        {eff.acIsolatorRatingAmps || eff.acBreakerAtAmps}A, {eff.acBreakerPoles}P{multiInverter ? " EACH" : ""}
      </Txt>

      {/* AC ISO -> (REC meter) -> interconnection */}
      {options.showSolarMeter ? (
        <g>
          <Wire pts={[[L.acIsoCx, L.acIsoY], [L.acIsoCx, L.recCy + 16]]} />
          <Meter cx={L.acIsoCx} cy={L.recCy} onClick={() => onSelect("solar_meter")} />
          <Txt x={L.acIsoCx - 26} y={L.recCy + 5} size={15} anchor="end">
            REC METER
          </Txt>
          <Wire pts={[[L.acIsoCx, L.recCy - 16], [L.acIsoCx, L.solarTapY]]} />
        </g>
      ) : (
        <Wire pts={[[L.acIsoCx, L.acIsoY], [L.acIsoCx, L.solarTapY]]} />
      )}

      {isGridTied ? (
        <g>
          {/* Solar interconnection to the service bus */}
          {interconnectValid ? (
            <>
              <Wire pts={[[L.acIsoCx, L.solarTapY], [L.busX, L.solarTapY]]} />
              <Dot x={L.busX} y={L.solarTapY} />
            </>
          ) : (
            <g>
              <line x1={L.acIsoCx} y1={L.solarTapY} x2={L.busX} y2={L.solarTapY} stroke={WARN_COLOR} strokeWidth={1.6} strokeDasharray="10 6" />
              {["NOT CONNECTABLE -", "SEE DESIGN VALIDATION"].map((t, i) => (
                <Txt key={t} x={L.busX - 8} y={L.solarTapY + 54 + i * 15} size={12} anchor="end" weight="bold" color={WARN_COLOR}>
                  {t}
                </Txt>
              ))}
            </g>
          )}
          {[
            ...(multiInverter
              ? [`SOLAR MAIN DISCONNECT: ${calc.acMainDisconnectAmps} AT, ${acSys?.mainDisconnectPoles ?? eff.acBreakerPoles}P`]
              : []),
            ...(config.transformer?.enabled
              ? [`VIA ${eff.transformerKva} kVA TRANSFORMER (${inv.acVoltage}V / ${config.utilityVoltage}V)`]
              : []),
          ].map((t, i) => (
            <Txt key={t} x={L.busX - 8} y={L.solarTapY + 20 + i * 16} size={12} anchor="end">
              {t}
            </Txt>
          ))}
          <Callout
            x={L.acIsoCx + 30}
            y={L.solarTapY}
            side="right"
            width={200}
            onHorizontalWire
            lines={acCalloutLines}
          />

          {/* Service entrance -> bi-directional meter -> main service */}
          <g>
            <line x1={L.busX - 420} y1={L.serviceY - 4} x2={L.busX - 380} y2={L.serviceY - 4} stroke={stroke} strokeWidth={1.4} />
            <line x1={L.busX - 420} y1={L.serviceY + 4} x2={L.busX - 380} y2={L.serviceY + 4} stroke={stroke} strokeWidth={1.4} />
            <polygon
              points={`${L.busX - 380},${L.serviceY - 14} ${L.busX - 352},${L.serviceY} ${L.busX - 380},${L.serviceY + 14}`}
              fill={theme.equipmentFill}
              stroke={stroke}
              strokeWidth={1.4}
            />
            <Txt x={L.busX - 428} y={L.serviceY + 5} size={15} anchor="end">
              SERVICE ENTRANCE
            </Txt>
            {acSys && (
              <Txt x={L.busX - 428} y={L.serviceY + 22} size={12} anchor="end" muted>
                {acSys.serviceLabel}
              </Txt>
            )}
            <Wire pts={[[L.busX - 352, L.serviceY], [L.busX - 276, L.serviceY]]} />
            <Meter cx={L.busX - 260} cy={L.serviceY} onClick={() => onSelect("utility_meter")} />
            <Txt x={L.busX - 260} y={L.serviceY + 34} size={14} anchor="middle">
              {hasNetMetering ? "BI-DIRECTIONAL METER" : "UTILITY kWh METER"}
            </Txt>
            <Wire pts={[[L.busX - 244, L.serviceY], [L.busX, L.serviceY], [L.busX, L.mainSvcY - 14]]} />
          </g>

          {/* Main service disconnect */}
          <g data-cad-layer="EPH-PANEL" className="cursor-pointer" onClick={() => onSelect("consumer_panel")}>
            <rect x={L.busX - 9} y={L.mainSvcY - 14} width={18} height={28} fill={theme.equipmentFill} stroke={stroke} strokeWidth={1.4} />
            <path d={`M ${L.busX - 4} ${L.mainSvcY - 8} A 8 8 0 0 1 ${L.busX - 4} ${L.mainSvcY + 8}`} fill="none" stroke={stroke} strokeWidth={1.2} />
            <Txt x={L.busX + 16} y={L.mainSvcY - 6} size={12}>
              MAIN SERVICE
            </Txt>
            <Txt x={L.busX + 16} y={L.mainSvcY + 7} size={12}>
              {service.mainBreakerAmps} AT, {service.mainBreakerPoles}P
            </Txt>
          </g>
          {service.feederLabel && (
            <Callout
              x={L.busX}
              y={L.mainSvcY + 62}
              side="left"
              width={250}
              lines={[service.feederLabel, service.conduitLabel || ""].filter(Boolean)}
            />
          )}

          {/* Service bus down to the solar interconnection */}
          <Wire pts={[[L.busX, L.mainSvcY + 14], [L.busX, L.solarTapY]]} />
          <Dot x={L.busX} y={L.panelTapY} />

          {/* Existing panel board */}
          <g data-cad-layer="EPH-PANEL" className="cursor-pointer" onClick={() => onSelect("consumer_panel")}>
            <Wire pts={[[L.busX, L.panelTapY], [L.panelX, L.panelTapY], [L.panelX, L.panelTapY + 60]]} />
            <rect x={L.panelX - 42} y={L.panelTapY + 60} width={84} height={120} fill={theme.equipmentFill} stroke={theme.equipmentBorder} strokeWidth={1.6} />
            <circle cx={L.panelX} cy={L.panelTapY + 70} r={2.5} fill={stroke} />
            <Txt x={L.panelX} y={L.panelTapY + 112} size={12} anchor="middle">
              EXISTING
            </Txt>
            <Txt x={L.panelX} y={L.panelTapY + 125} size={12} anchor="middle">
              PANEL
            </Txt>
            <Txt x={L.panelX} y={L.panelTapY + 138} size={12} anchor="middle">
              BOARD
            </Txt>
            {/* Left-aligned to the panel so it never reaches back over the service bus */}
            {wrapLines(service.panelDesignation, PANEL_LABEL_W, 12).map((ln, i) => (
              <Txt key={i} x={L.panelX - 42} y={L.panelTapY + 214 + i * 15} size={12} muted>
                {ln}
              </Txt>
            ))}
            <GroundSym x={L.panelX} y={L.panelTapY + 180} />
          </g>
        </g>
      ) : (
        <g data-cad-layer="EPH-PANEL" className="cursor-pointer" onClick={() => onSelect("consumer_panel")}>
          {/* Off-grid: inverter output feeds the panel board directly */}
          <Wire pts={[[L.acIsoCx, L.solarTapY], [L.acIsoCx + 200, L.solarTapY], [L.acIsoCx + 200, L.solarTapY + 40]]} />
          <rect x={L.acIsoCx + 158} y={L.solarTapY + 40} width={84} height={120} fill={theme.equipmentFill} stroke={theme.equipmentBorder} strokeWidth={1.6} />
          {["PANEL", "BOARD"].map((t, i) => (
            <Txt key={t} x={L.acIsoCx + 200} y={L.solarTapY + 92 + i * 14} size={12} anchor="middle">
              {t}
            </Txt>
          ))}
          {/* Left-aligned under the panel and wrapped, so a long name never reaches back over the AC wiring */}
          {[...wrapLines(service.panelDesignation, PANEL_LABEL_W, 12), "STAND-ALONE - NO UTILITY", "CONNECTION"].map((ln, i) => (
            <Txt key={i} x={L.acIsoCx + 158} y={L.solarTapY + 194 + i * 15} size={12} muted>
              {ln}
            </Txt>
          ))}
          <GroundSym x={L.acIsoCx + 200} y={L.solarTapY + 160} />
          <Callout
            x={L.acIsoCx + 30}
            y={L.solarTapY}
            side="right"
            width={200}
            onHorizontalWire
            lines={acCalloutLines}
          />
        </g>
      )}

      {/* ===================== EPS / ESSENTIAL LOADS PANEL (hybrid backup output) ===================== */}
      {/* Fed only from the inverter EPS port; it has no connection to the utility side, so it cannot back-feed */}
      {showEps && (
        <g data-cad-layer="EPH-PANEL" className="cursor-pointer" onClick={() => onSelect("eps_panel")}>
          {/* EPS breaker -> under the grid circuit -> essential loads panel */}
          <Wire
            pts={[
              [L.epsBkX + BREAKER_W / 2, L.yBk + BREAKER_H],
              [L.epsBkX + BREAKER_W / 2, L.yEps],
              [L.epsX, L.yEps],
              [L.epsX, L.yBk + BREAKER_H + 10],
            ]}
          />
          {/* EPS feeder: same conductors as the inverter output (text below the run) */}
          {options.showConductorSpecs && (
            <g data-cad-layer="EPH-ANNO">
              <line x1={L.epsX - 24} y1={L.yEps + 5} x2={L.epsX - 16} y2={L.yEps - 5} stroke={stroke} strokeWidth={1.4} />
              {acCalloutLines
                .filter((t) => !t.startsWith("("))
                .map((t, i) => (
                  <Txt key={t} x={L.epsX - 10} y={L.yEps + 18 + i * 14} size={12} anchor="end">
                    {t}
                  </Txt>
                ))}
            </g>
          )}
          <rect x={L.epsX - 55} y={L.yBk - 20} width={110} height={BREAKER_H + 30} fill={theme.equipmentFill} stroke={theme.equipmentBorder} strokeWidth={1.6} />
          {/* Panel main breaker (top) */}
          <rect x={L.epsX - 9} y={L.yBk - 15} width={18} height={18} fill="none" stroke={stroke} strokeWidth={1.2} />
          <path d={`M ${L.epsX - 4} ${L.yBk - 12} A 5 5 0 0 1 ${L.epsX - 4} ${L.yBk - 2}`} fill="none" stroke={stroke} strokeWidth={1.1} />
          {/* Branch circuit breakers */}
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <circle cx={L.epsX - 38} cy={L.yBk + 18 + i * 20} r={4} fill="none" stroke={stroke} strokeWidth={1} />
              <line x1={L.epsX - 34} y1={L.yBk + 18 + i * 20} x2={L.epsX - 8} y2={L.yBk + 12 + i * 20} stroke={stroke} strokeWidth={1.1} />
              <circle cx={L.epsX + 38} cy={L.yBk + 18 + i * 20} r={4} fill="none" stroke={stroke} strokeWidth={1} />
              <line x1={L.epsX + 34} y1={L.yBk + 18 + i * 20} x2={L.epsX + 8} y2={L.yBk + 12 + i * 20} stroke={stroke} strokeWidth={1.1} />
            </g>
          ))}
          <line x1={L.epsX} y1={L.yBk + 3} x2={L.epsX} y2={L.yBk + BREAKER_H + 10} stroke={stroke} strokeWidth={1.2} />
          {[
            { t: "ESSENTIAL LOADS", size: 13, muted: false },
            { t: "PANEL (EPS)", size: 13, muted: false },
            ...(eps
              ? [
                  { t: `MAIN ${eps.breakerA} AT, ${eps.poles}P`, size: 12, muted: true },
                  { t: `${eps.kw} kW BACKUP LOAD`, size: 12, muted: true },
                ]
              : [{ t: "RATING PER INVERTER EPS", size: 12, muted: true }]),
          ].map((ln, i) => (
            <Txt key={i} x={L.epsX + 64} y={L.yBk + 6 + i * 16} size={ln.size} muted={ln.muted} color={i >= 2 && eps?.exceedsInverter ? WARN_COLOR : undefined}>
              {ln.t}
            </Txt>
          ))}
          <Txt x={L.epsPortX + 6} y={L.invBottom + 52} size={12} muted>
            EPS
          </Txt>
          <GroundSym x={L.epsX + 40} y={L.yBk + BREAKER_H + 10} />
        </g>
      )}

      {/* ===================== CT + COMMUNICATION CABLE (load / export monitoring) ===================== */}
      {/* Signal cable only (dashed): it carries no power, so crossing a power conductor is not a connection */}
      {showCt && (
        <g data-cad-layer="EPH-COMM" className="cursor-pointer" onClick={() => onSelect("ct_sensor")}>
          <rect x={L.ctX - 4} y={L.serviceY - 8} width={8} height={16} fill={theme.equipmentFill} stroke={stroke} strokeWidth={1.3} />
          <Txt x={L.ctX - 8} y={L.serviceY - 13} size={12} anchor="end">
            CT
          </Txt>
          <polyline
            points={[
              [L.ctX, L.serviceY - 8],
              [L.ctX, L.ctLoopTop],
              [L.ctLoopX, L.ctLoopTop],
              [L.ctLoopX, L.ctLoopBottom],
              [L.comX, L.ctLoopBottom],
              [L.comX, L.comEntryY],
              [L.invX + INV_W + 8, L.comEntryY],
            ]
              .map((p) => p.join(","))
              .join(" ")}
            fill="none"
            stroke={stroke}
            strokeWidth={1}
            strokeDasharray="7 4"
          />
          <Txt x={L.ctLoopX - 10} y={L.ctLoopBottom - 7} size={12} anchor="end" muted>
            CT / SMART METER COMMUNICATION CABLE TO INVERTER
          </Txt>
        </g>
      )}

      {/* ===================== DESIGN VALIDATION (only when the design has problems) ===================== */}
      {L.issues.length > 0 && (
        <g data-cad-layer="EPH-ANNO" className="cursor-pointer" onClick={() => onSelect("design_validation")}>
          <rect x={L.valX} y={L.valY} width={L.valW} height={L.valH} fill="none" stroke={WARN_COLOR} strokeWidth={1.6} strokeDasharray="8 4" />
          <Txt x={L.valX + 14} y={L.valY + 24} size={14} weight="bold" color={WARN_COLOR}>
            DESIGN VALIDATION: {L.issues.length} {L.issues.length > 1 ? "ITEMS REQUIRE" : "ITEM REQUIRES"} ENGINEERING REVIEW - NOT FOR CONSTRUCTION UNTIL RESOLVED
          </Txt>
          {L.valLines.map((ln, i) => (
            <Txt key={i} x={L.valX + 14} y={L.valY + 46 + i * 17} size={VAL_FS} color={WARN_COLOR}>
              {ln}
            </Txt>
          ))}
        </g>
      )}
    </g>
  );
};
