// SingleLineDiagram.tsx
import React from 'react';
import { Circuit, PanelConfig, LoadType } from '../types';
import { parseSystemVoltage, getActivePoles, getNeutralPoles, getTotalPoles, getConductorLabel } from '../utils/computeEngine';
import { computeSolarDesign } from '../utils/solarEngine';
import { groundingElectrode, fmtWireMm2 } from '../utils/groundingElectrode';
import type { SolarCalculationResults } from '../types/solar';

/** Standard breaker frame (AF) for a trip rating */
const frameFor = (at: number) => [100, 225, 400, 600, 800, 1200, 1600, 2000, 2500, 3000, 4000, 5000, 6300].find((f) => f >= at) || at;
const fmtKw = (v: number) => (Math.round(v * 100) / 100).toString();

/**
 * Panel-board SLD geometry (drawing units), proportioned on the standard residential panel SLD:
 * service entrance and kWh meter on the feed line, drop to the main breaker inside the PANEL BOARD,
 * breaker rows 47 apart, circuit tags (circle over a triangle), ground terminal block and grounding system.
 * The System SLD routes sub-panel feeders from the tag tips (TIP_LEFT / TIP_RIGHT) to a sub-panel's
 * feed point (SUB_FEED_X, FEED_Y).
 */
export const SLD_GEOM = {
  BUS_X: 400,
  FEED_Y: 85,
  SUB_FEED_X: 270,
  ROW1_Y: 290,
  ROW_H: 47,
  TIP_LEFT: 400 - 110 - 17,
  TIP_RIGHT: 400 + 110 + 17,
  /** Service text left of x = 0 on a service board */
  LEFT_OVERFLOW: 90,
  /** Callout text right of x = 800 (long feeder descriptions) */
  WIDTH: 880,
};

/** Circuit tag (drawing units, from the tag centre): circle radius, triangle back edge, half height and point */
export const TAG = { R: 13, BACK_X: -2.2, HALF_H: 20.4, TIP_X: 17 };

/** Height of a panel SLD: rows, the board box and (service board) the grounding system or the solar feeder */
export const panelSldHeight = (rows: number, opts: { solar?: boolean } = {}) =>
  SLD_GEOM.ROW1_Y + Math.max(0, rows - 1) * SLD_GEOM.ROW_H + (opts.solar ? 79 + 285 : 210);

interface SingleLineDiagramProps {
  panel: PanelConfig;
  mainFeeder: any;
  panelRows: any[];
  formatWireSize: (size: number) => number | string;
  isSubPanel?: boolean;
  iscParams?: any;
  parentDesignation?: string;
  solarConfig?: any;
  /** Solar Design results for solarConfig (computed here from solarConfig when not given) */
  solarCalc?: SolarCalculationResults | null;
}

/** Solar PV feeder drawn under a service panel: the Solar Design's own sizing */
export function solarFeederDetails(solarConfig: any, solarCalc: SolarCalculationResults | null | undefined, panel: PanelConfig) {
  if (!solarConfig) return null;
  let calc = solarCalc || null;
  if (!calc) {
    try {
      calc = computeSolarDesign(solarConfig, panel);
    } catch {
      return null;
    }
  }
  const eff = calc.effective;
  const inv = calc.selectedInverter;
  const mod = calc.selectedModule;
  const qty = calc.inverterQuantity || eff.inverterQuantity || 1;
  const source = calc.interconnectionBackfeedSource;
  // Back-feed device at this panel (PEC 6.90.7.2(D)): the inverter breaker for one inverter, else the
  // solar main disconnect combining all inverters, or the transformer secondary breaker
  const at = calc.interconnectionBackfeedAmps || eff.acBreakerAtAmps;
  const single = source === "inverter-breaker";
  const af = single ? eff.acBreakerAfAmps : frameFor(at);
  const poles = single ? eff.acBreakerPoles : calc.acSystem?.mainDisconnectPoles || eff.acBreakerPoles;
  const ocpdNote = source === "solar-main-disconnect"
    ? `SOLAR MAIN DISCONNECT, PEC 6.90.7.2(D) (${qty} × ${eff.acBreakerAtAmps} AT inverter breakers)`
    : source === "transformer-secondary"
      ? "TRANSFORMER SECONDARY BREAKER, PEC 6.90.7.2(D) BACKFEED"
      : "PEC 6.90.7.2(D) BACKFEED OCPD";
  const ac = solarConfig.cabling?.acCable || {};
  const conductors = calc.acSystem?.currentCarryingConductors || (poles >= 3 ? 4 : 2);
  const acCable = `${qty > 1 ? 'Each inverter: ' : ''}${conductors}-${eff.acCableSizeMm2} mm² ${ac.insulation || 'THHN'} + 1-${eff.acEgcSizeMm2} mm² EGC, ${eff.acConduitSizeMm} mmØ ${ac.conduitType || 'PVC'}`;
  const dcVolts = (calc.stringVoc || 0) > 1000 ? 1500 : 1000;
  const dcProtection = `${dcVolts}V DC Isolator ${eff.dcIsolatorRatingAmps} A + ${eff.dcFuseRatingAmps} A gPV Fuses + Type II SPD (Uc ≥ ${eff.dcSpdUcVolts} V)`;
  return {
    // Short label inside the inverter symbol; make, model and total beside it
    inverterLabel: qty > 1 ? `${qty} × ${fmtKw(inv.ratedAcPowerKw)} kW` : `${fmtKw(inv.ratedAcPowerKw)} kW INV`,
    inverterModel: `${qty > 1 ? `${qty} inverters: ` : ''}${inv.manufacturer} ${inv.model}${qty > 1 ? ` · ${fmtKw(calc.totalInverterAcKw)} kW AC total` : ''}`,
    pvKwp: fmtKw(calc.totalDcCapacityKwp),
    arrayDetail: `${calc.totalModules} × ${mod.ratedPowerWp} Wp (${calc.numberOfStrings} strings × ${calc.modulesPerString}) · DC/AC ${calc.dcAcRatio.toFixed(2)}`,
    at, af, poles, ocpdNote,
    acIsolator: `${eff.acIsolatorRatingAmps} A`,
    acCable,
    dcProtection,
  };
}

/** Feeder description of a sub-panel circuit (phase, voltage, poles, conductors, conduit) */
export function feederTextFor(c: Circuit, panel: PanelConfig): string {
  const isSub = c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL;
  if (!isSub) return "";
  
  let phaseText = "1-Φ L-N";
  const parsedParent = parseSystemVoltage(panel.system);
  if (getActivePoles(c.mcbP) === 3) {
    phaseText = "3-Φ";
  } else {
    if (parsedParent.is3Phase) {
      if (parsedParent.vln !== null && c.voltage === parsedParent.vln) {
        phaseText = "1-Φ L-N";
      } else {
        phaseText = "1-Φ L-L";
      }
    } else {
      if (panel.connectionType === "Line-to-Neutral") {
        phaseText = "1-Φ L-N";
      } else {
        phaseText = "1-Φ L-L";
      }
    }
  }

  const pText = typeof c.mcbP === "string" && c.mcbP.endsWith("P") ? c.mcbP : typeof c.mcbP === "string" && c.mcbP.includes("+N") ? c.mcbP : `${c.mcbP}P`;
  const conductorLabel = getConductorLabel(c.wireSize || "2.0", c.groundSize || "2.0", c.mcbP, c.wireSets || c.calculatedWireSets || 1, c.wireType || "THHN");
  // The size may already carry its unit ("32mm"): write it once
const conduit = c.conduitSize ? ` IN ${String(c.conduitSize).replace(/s*mm$/i, '')}mmØ ${(c.conduitType || 'PVC').toUpperCase()}` : '';
  
  return `${phaseText}, ${c.voltage}V | ${pText}, ${conductorLabel}${conduit}`;
}

/**
 * Horizontal reach of a panel drawing from its first breaker row down (local units, the bus at
 * SLD_GEOM.BUS_X): the leftmost and rightmost points of its circuit labels, grounding callouts and solar
 * notes. The System SLD runs sub-panel feeders outside this span, so a feeder never crosses the board's
 * own labels. Text widths are estimated generously from the font size.
 */
export function panelSldExtents(args: {
  panel: PanelConfig;
  panelRows: any[];
  isSubPanel?: boolean;
  solarConfig?: any;
  solarCalc?: SolarCalculationResults | null;
  parentDesignation?: string;
}): { left: number; right: number } {
  const { panel, panelRows, isSubPanel } = args;
  const w = (text: string | undefined, size: number, bold = true) => (text || "").length * size * (bold ? 0.64 : 0.56);
  let left = SLD_GEOM.SUB_FEED_X - 10;
  let right = 560;
  const rowText = (c: Circuit | undefined, dir: 1 | -1) => {
    if (!c) return;
    const isSub = c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL;
    const reach = Math.max(w(c.description, 11), isSub ? w(feederTextFor(c, panel), 10, false) : 0);
    if (dir === -1) left = Math.min(left, SLD_GEOM.BUS_X - 135 - reach);
    else right = Math.max(right, SLD_GEOM.BUS_X + 135 + reach);
  };
  panelRows.forEach((r) => {
    rowText(r.left, -1);
    rowText(r.right, 1);
  });
  // (The service text and the feeder callout sit above the first breaker row; feeders run below it.)
  if (isSubPanel) {
    left = Math.min(left, 250 - w(`CONNECTED TO ${args.parentDesignation || "MDP"}`, 13));
    right = Math.max(right, 540 + w("GROUND TERMINAL BLOCK", 12));
    return { left: left - 6, right: right + 6 };
  }
  const solar = args.solarConfig ? solarFeederDetails(args.solarConfig, args.solarCalc, panel) : null;
  if (solar) {
    // Grounding is mirrored to the left of the board; the solar notes run to the right of its stack
    left = Math.min(left, 209 - w("20mmø x 3M COPPER WELD GROUND ROD", 12));
    right = Math.max(
      right,
      458 + w(solar.inverterModel, 9, false),
      420 + Math.max(w(solar.ocpdNote, 9, false), w(solar.dcProtection, 9, false), w(solar.acCable, 8, false)),
    );
  } else {
    right = Math.max(right, 544 + w("20mmø x 3M COPPER WELD GROUND ROD", 12));
  }
  return { left: left - 6, right: right + 6 };
}

export const SingleLineDiagramContent: React.FC<SingleLineDiagramProps & { xOffset?: number; yOffset?: number }> = ({ panel, mainFeeder, panelRows, formatWireSize, isSubPanel, iscParams, parentDesignation, solarConfig, solarCalc, xOffset = 0, yOffset = 0 }) => {
  // SVG Dimensions Calculation
  const numRows = panelRows.length;
  // Board box bottom (the solar feeder starts here)
  const boxBottom = SLD_GEOM.ROW1_Y + Math.max(0, numRows - 1) * SLD_GEOM.ROW_H + 79;
  
  const parsedSys = parseSystemVoltage(panel.system);
  const is3Phase = parsedSys.is3Phase;
  const voltage = panel.voltage;
  const connectionStr = !is3Phase && panel.connectionType === "Line-to-Neutral" ? "(L-N)" : (!is3Phase && panel.connectionType === "Line-to-Line" ? "(L-L)" : "");
  const phaseText = is3Phase ? `3-Φ` : `1-Φ ${connectionStr}`.trim();
  
  const wireNumber = parsedSys.wireCount; 

  // Solar PV feeder: the Solar Design's own sizing (inverters, array, back-feed device, cables, DC protection)
  const solarDetails = React.useMemo(() => solarFeederDetails(solarConfig, solarCalc, panel), [solarConfig, solarCalc, panel]);
  const getFeederText = (c: Circuit) => feederTextFor(c, panel);

  // Dynamically calculate recommended transformer size for Main panel
  const recommendedTransformerKVA = React.useMemo(() => {
    if (isSubPanel) return null;
    let totalVA = 0;
    panelRows.forEach(row => {
      if (row.left) totalVA += row.left.loadVA || 0;
      if (row.right) totalVA += row.right.loadVA || 0;
    });
    const connectedLoadKVA = totalVA / 1000;
    // default 80% demand factor and 80% loading factor as baseline
    const demandLoadKVA = connectedLoadKVA * 0.80;
    const requiredKVA = demandLoadKVA / 0.80;
    const STANDARD_SIZES = [15, 30, 45, 75, 112.5, 150, 225, 300, 500, 750, 1000, 1500, 2000, 2500];
    const size = STANDARD_SIZES.find((s) => s >= requiredKVA);
    return size || 1000;
  }, [panelRows, isSubPanel]);

  // ---------- drawing data ----------
  const G = SLD_GEOM;
  const BUS = G.BUS_X;
  const polesText = (p: any) => {
    const s = String(p ?? "").toUpperCase().replace(/\s+/g, "");
    return s.endsWith("P") || s.includes("+N") ? s : `${s}P`;
  };
  const mainPoles = polesText(mainFeeder.poles);
  const mainKaic = mainFeeder.kaic || parseFloat(panel.icRating || "") || 10;
  const ins = (panel.insulationType || "THHN").toUpperCase();
  const runs = mainFeeder.wire.runs || 1;
  const wireMm2 = fmtWireMm2(parseFloat(String(mainFeeder.wire.size)) || 0);
  const gndMm2 = fmtWireMm2(parseFloat(String(mainFeeder.groundSize)) || 0);
  const nPhase = getActivePoles(mainFeeder.poles);
  const nNeutral = getNeutralPoles(mainFeeder.poles);
  // "2 - 14mm² THHN + 8.0mm² THHN (G)" / "COPPER WIRE IN 25mmø RSC PIPE"
  const feederLine1 = `${runs > 1 ? `${runs} SETS OF ` : ""}${nPhase} - ${wireMm2}mm² ${ins}${nNeutral ? ` + ${nNeutral} - ${wireMm2}mm² ${ins} (N)` : ""} + ${gndMm2}mm² ${ins} (G)`;
  const conduitSize = String(mainFeeder.conduitSize || "").replace(/mm/i, "mm");
  const conduitType = (mainFeeder.conduitType || "PVC").toUpperCase();
  const material = panel.conductorMaterial === 'Aluminum' ? 'ALUMINUM' : 'COPPER';
  const feederLine2 =
    panel.conduitArrangement === 'separate_per_set' && runs > 1
      ? `${material} WIRE IN ${runs} - ${conduitSize}ø ${conduitType} PIPES`
      : panel.conduitArrangement === 'custom' && panel.customConduitArrangements && panel.customConduitArrangements.length > 0
        ? `${material} WIRE IN ${panel.customConduitArrangements.length} ${conduitType} PIPES`
        : `${material} WIRE IN ${conduitSize}ø ${conduitType} PIPE`;
  const isParallelFeeder = iscParams?.connectionType === 'Parallel' && runs > 1;
  const ground = groundingElectrode(mainFeeder.wire.size, runs);
  const firstRowY = G.ROW1_Y;
  const lastRowY = G.ROW1_Y + Math.max(0, numRows - 1) * G.ROW_H;
  const boxTop = firstRowY - 101;
  // Grounding drawn at the right of the board, or mirrored to the left when the solar feeder takes the bottom centre
  const groundLeft = Boolean(solarDetails && !isSubPanel);
  const mx = (x: number) => (groundLeft ? 2 * BUS - x : x);
  const anchorOut = groundLeft ? "end" : "start";
  const wireX = groundLeft ? 300 : 453;
  /** Electrode-side positions, measured from the ground wire (mirrored on the left) */
  const gw = (x: number) => (groundLeft ? wireX - (x - 453) : x);
  // Ground-wire callout height (lower on the left, below the wire's jog out of the board)
  const gecY = groundLeft ? 104 : 95;
  const L = lastRowY;

  /** Callout: tick on the conductor, dashed leader and a dashed bracket in front of the text */
  const Callout = ({ x, y, toX, y0, y1 }: { x: number; y: number; toX: number; y0: number; y1: number }) => {
    const d = toX > x ? 1 : -1;
    return (
      <g>
        <polyline points={`${x + 7 * d},${y - 6} ${x + 1 * d},${y} ${x + 7 * d},${y + 6}`} className="sld-line" strokeWidth="2.2" />
        <line x1={x + 9 * d} y1={y} x2={toX} y2={y} className="sld-line" strokeDasharray="4 3" strokeWidth="1" />
        <line x1={toX} y1={y0} x2={toX} y2={y1} className="sld-line" strokeDasharray="4 3" strokeWidth="1" />
      </g>
    );
  };

  /**
   * Circuit tag: the circuit number in a circle drawn over a triangle that points away from the board.
   * The triangle's back edge is just inside the circle and reaches past its top and bottom; its point
   * lies a little beyond the circle (TAG geometry, shared with the AutoCAD export).
   */
  const CircuitTag = ({ cx, y, dir, no }: { cx: number; y: number; dir: 1 | -1; no: number }) => (
    <g>
      <polygon points={`${cx + TAG.BACK_X * dir},${y - TAG.HALF_H} ${cx + TAG.TIP_X * dir},${y} ${cx + TAG.BACK_X * dir},${y + TAG.HALF_H}`} className="sld-line" style={{ fill: 'white' }} strokeLinejoin="miter" strokeWidth="2" />
      {/* Filled with a style (it beats the .sld-line "fill: none") so it hides the triangle's back edge */}
      <circle cx={cx} cy={y} r={TAG.R} className="sld-line" style={{ fill: 'white' }} strokeWidth="2" />
      <text x={cx} y={y + 4} className="sld-text" style={{ fontSize: '11px' }} textAnchor="middle">C{no}</text>
    </g>
  );

  const T = (p: { x: number; y: number; t: React.ReactNode; size?: number; anchor?: "start" | "middle" | "end"; weight?: string; fill?: string; halo?: boolean }) => (
    <text
      x={p.x}
      y={p.y}
      className="sld-text"
      style={{
        fontSize: `${p.size ?? 12}px`,
        fontWeight: p.weight ?? 'bold',
        ...(p.fill ? { fill: p.fill } : {}),
        // White outline so a line running behind the text does not strike through it
        ...(p.halo ? { stroke: 'white', strokeWidth: 3, paintOrder: 'stroke', strokeLinejoin: 'round' } : {}),
      }}
      textAnchor={p.anchor ?? "start"}
    >
      {p.t}
    </text>
  );

  return (
    <g transform={`translate(${xOffset}, ${yOffset})`}>
      {/* ===================== SOURCE ===================== */}
      {isSubPanel ? (
        <>
          <circle cx={G.SUB_FEED_X} cy={G.FEED_Y} r="5" fill="#1e293b" />
          <T x={250} y={G.FEED_Y - 15} t={`CONNECTED TO ${parentDesignation || 'MDP'}`} size={13} anchor="end" />
          <T x={250} y={G.FEED_Y + 5} t={`${voltage}V ${phaseText}`} size={13} anchor="end" />
          <T x={250} y={G.FEED_Y + 23} t="60Hz" size={13} anchor="end" />
          <line x1={G.SUB_FEED_X} y1={G.FEED_Y} x2={BUS} y2={G.FEED_Y} className="sld-line" strokeWidth="1.8" />
        </>
      ) : (
        <>
          {/* Line terminals, service entrance, one slash per service conductor, kilowatt-hour meter */}
          <T x={74} y={88} t={`${is3Phase ? "3" : "1"} PHASE, ${voltage}V, ${wireNumber}-WIRE`} size={12} anchor="end" />
          <T x={74} y={104} t="+ GROUND, 60 HZ" size={12} anchor="end" />
          <circle cx="84" cy="84" r="5" className="sld-line" fill="white" strokeWidth="1.8" />
          <circle cx="84" cy="99" r="5" className="sld-line" fill="white" strokeWidth="1.8" />
          <line x1="89" y1="84" x2="170" y2="84" className="sld-line" strokeWidth="1.8" />
          <line x1="89" y1="99" x2="170" y2="99" className="sld-line" strokeWidth="1.8" />
          <path d="M 170,57 L 214,85 L 170,114 Z" className="sld-line" fill="white" strokeWidth="1.8" />
          <T x={129} y={47} t="SERVICE" size={13} anchor="middle" />
          <T x={129} y={64} t="ENTRANCE" size={13} anchor="middle" />
          <line x1="214" y1={G.FEED_Y} x2="322" y2={G.FEED_Y} className="sld-line" strokeWidth="1.8" />
          {Array.from({ length: wireNumber }, (_, i) => {
            const hx = 259 + (i - (wireNumber - 1) / 2) * 8;
            return <line key={`tick-${i}`} x1={hx - 5} y1={G.FEED_Y + 7} x2={hx + 5} y2={G.FEED_Y - 7} className="sld-line" strokeWidth="1.5" />;
          })}
          <circle cx="342" cy={G.FEED_Y} r="20" className="sld-line" fill="white" strokeWidth="2.5" />
          <T x={342} y={G.FEED_Y + 6} t="M" size={17} anchor="middle" />
          <T x={347} y={61} t="KILOWATT - HOUR METER" size={11} anchor="middle" weight="normal" />
          <line x1="362" y1={G.FEED_Y} x2={BUS} y2={G.FEED_Y} className="sld-line" strokeWidth="1.8" />
        </>
      )}

      {/* ===================== FEEDER (drop to the main breaker) ===================== */}
      {panel.transferSwitchType && panel.transferSwitchType !== "None" ? (
        <g>
          <line x1={BUS} y1={G.FEED_Y} x2={BUS} y2="143" className="sld-line" strokeWidth="1.8" />
          <rect x="385" y="143" width="30" height="20" rx="2" className="sld-line" fill="white" />
          <text x={BUS} y="156" className="sld-text" style={{fontSize: '10px'}} textAnchor="middle">{panel.transferSwitchType}</text>
          <line x1={BUS} y1="163" x2={BUS} y2="215" className="sld-line" strokeWidth="1.8" />
          <line x1="366" y1="153" x2="385" y2="153" className="sld-line" />
          <circle cx="355" cy="153" r="11" className="sld-line" fill="white" />
          <text x="355" y="157" className="sld-text" style={{ fontSize: '12px', fontWeight: 900, fontFamily: '"Arial Black", Arial, sans-serif' }} textAnchor="middle">G</text>
          <line x1="348" y1="161.5" x2="341" y2="170" className="sld-line" />
          <line x1="362" y1="161.5" x2="369" y2="170" className="sld-line" />
          <line x1="355" y1="164" x2="355" y2="170" className="sld-line" />
          <rect x="341" y="170" width="28" height="4.5" className="sld-line" fill="none" />
          <text x="425" y="151" className="sld-text" style={{fontSize: '10px'}} textAnchor="start">
            {panel.transferSwitchRating || (() => {
               const STANDARD_TS_RATINGS = [30, 40, 50, 60, 70, 80, 90, 100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000, 5000];
               return STANDARD_TS_RATINGS.find(r => r >= mainFeeder.cb) || mainFeeder.cb;
            })()} A, {panel.transferSwitchPoles || (panel.system.includes("3PH") ? 3 : 2)}P
          </text>
          <text x="425" y="162" className="sld-text" style={{fontSize: '9px'}} textAnchor="start">
            {panel.transferSwitchType === "ATS" ? "AUTOMATIC" : "MANUAL"} TRANSFER SW
          </text>
        </g>
      ) : (
        <line x1={BUS} y1={G.FEED_Y} x2={BUS} y2="215" className="sld-line" strokeWidth="1.8" />
      )}
      <Callout x={BUS} y={117} toX={470} y0={107} y1={145} />
      {isParallelFeeder && <T x={482} y={105} t="[PARALLEL FEEDER CONNECTION]" size={10} fill="#059669" />}
      <T x={482} y={124} t={feederLine1} size={12} />
      <T x={482} y={140} t={feederLine2} size={12} />

      {/* ===================== PANEL BOARD ===================== */}
      <T x={467} y={181} t="PANEL BOARD" size={13} anchor="middle" />
      <rect x={BUS - 75} y={boxTop} width="147" height={L + 79 - boxTop} className="sld-line" fill="none" strokeWidth="1.5" />
      {/* Main breaker inside the board */}
      <circle cx={BUS} cy="215" r="3.5" fill="#1e293b" />
      <path d={`M ${BUS},215 A 15 15 0 0 1 ${BUS},245`} className="sld-line" strokeWidth="2" fill="none" />
      <circle cx={BUS} cy="245" r="3.5" fill="#1e293b" />
      <T x={424} y={236} t={`${mainFeeder.cb}AT,${mainPoles},${mainKaic}KAIC`} size={13} halo />
      {/* Bus */}
      <line x1={BUS} y1="245" x2={BUS} y2={L} className="sld-line" strokeWidth="1.8" />

      {/* ===================== BRANCH CIRCUITS ===================== */}
      {panelRows.map((row, idx) => {
         const y = firstRowY + idx * G.ROW_H;
         const side = (c: Circuit, dir: 1 | -1) => {
           const isSpace = (c.description || "").toUpperCase() === 'SPACE' || c.loadType === LoadType.SPACE;
           const isSub = c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL;
           const bIn = BUS + 20 * dir, bOut = BUS + 55 * dir; // breaker terminals
           const tagX = BUS + 110 * dir; // circuit tag centre (point at BUS + 127 * dir)
           const textX = BUS + 135 * dir;
           const anchor = dir === 1 ? "start" : "end";
           return (
             <g>
               <circle cx={BUS} cy={y} r="3.5" fill="#1e293b" />
               <line x1={BUS} y1={y} x2={bIn} y2={y} className="sld-line" strokeWidth="1.8" />
               <circle cx={bIn} cy={y} r="3.5" fill="#1e293b" />
               <path d={`M ${bIn},${y} A 17.5 17.5 0 0 ${dir === 1 ? 1 : 0} ${bOut},${y}`} className="sld-line" strokeWidth="2" fill="none" />
               <circle cx={bOut} cy={y} r="3.5" fill="#1e293b" />
               {!isSpace && <T x={(bIn + bOut) / 2} y={y - 21} t={`${c.mcbAT}AT,${polesText(c.mcbP || "1P")}`} size={13} anchor="middle" />}
               <line x1={bOut} y1={y} x2={tagX - 13 * dir} y2={y} className="sld-line" strokeWidth="1.8" />
               <CircuitTag cx={tagX} y={y} dir={dir} no={c.circuitNo} />
               {/* A sub-panel feeder leaves the tag point along the row: its name above, its cable below */}
               <T x={textX} y={isSub ? y - 7 : y + 4} t={c.description} size={11} anchor={anchor} />
               {isSub && (
                 <text x={textX} y={y + 16} className="sld-text-small" textAnchor={anchor} style={{ fontSize: '10px', fill: '#64748b' }}>
                   {getFeederText(c)}
                 </text>
               )}
             </g>
           );
         };
         return (
           <g key={idx}>
             {row.left && side(row.left, -1)}
             {row.right && side(row.right, 1)}
           </g>
         );
      })}

      {/* Solar PV Generation Feeder (PEC 6.90.7.2(D) Opposite-End Interconnection) */}
      {solarDetails && !isSubPanel && (
        <g>
          {/* Opposite End Solar Interconnection Breaker */}
          <line x1="400" y1={boxBottom} x2="400" y2={boxBottom + 25} className="sld-line stroke-amber-600" strokeWidth="2" />
          <circle cx="400" cy={boxBottom + 25} r="3" fill="#d97706" />
          <path d={`M 400,${boxBottom + 25} A 12 12 0 0 1 400,${boxBottom + 49}`} className="sld-line stroke-amber-600" strokeWidth="2.5" fill="none" />
          <circle cx="400" cy={boxBottom + 49} r="3" fill="#d97706" />

          <text x="420" y={boxBottom + 35} className="sld-text fill-amber-700 font-bold" style={{ fontSize: '11px' }}>
            {solarDetails.at} AT / {solarDetails.af} AF ({solarDetails.poles}P)
          </text>
          <text x="420" y={boxBottom + 48} className="sld-text-small fill-slate-500" style={{ fontSize: '9px' }}>
            {solarDetails.ocpdNote}
          </text>

          {/* Line to AC Disconnect */}
          <line x1="400" y1={boxBottom + 49} x2="400" y2={boxBottom + 75} className="sld-line stroke-amber-600" strokeWidth="2" />

          {/* AC Isolator */}
          <rect x="388" y={boxBottom + 75} width="24" height="16" rx="2" className="sld-line stroke-amber-600" fill="#fffbeb" />
          <text x="400" y={boxBottom + 86} className="sld-text fill-amber-800" style={{ fontSize: '8px', fontWeight: 'bold' }} textAnchor="middle">AC ISO</text>
          <text x="420" y={boxBottom + 86} className="sld-text-small fill-slate-600" style={{ fontSize: '9px' }}>
            {solarDetails.acIsolator} AC Isolator
          </text>
          <text x="420" y={boxBottom + 98} className="sld-text-small fill-slate-600" style={{ fontSize: '8px' }}>
            {solarDetails.acCable}
          </text>

          {/* Line to Inverter */}
          <line x1="400" y1={boxBottom + 91} x2="400" y2={boxBottom + 110} className="sld-line stroke-amber-600" strokeWidth="2" />

          {/* Grid-Tie Inverter Block */}
          <rect x="350" y={boxBottom + 110} width="100" height="38" rx="4" className="sld-line stroke-amber-600" fill="#fef3c7" />
          <line x1="350" y1={boxBottom + 148} x2="450" y2={boxBottom + 110} className="sld-line stroke-amber-400" strokeWidth="1" strokeDasharray="3 2" />
          <text x="366" y={boxBottom + 125} className="sld-text fill-amber-900" style={{ fontSize: '9px', fontWeight: 'bold' }}>DC</text>
          <text x="424" y={boxBottom + 140} className="sld-text fill-amber-900" style={{ fontSize: '9px', fontWeight: 'bold' }}>AC</text>
          <text x="400" y={boxBottom + 133} className="sld-text fill-amber-950 font-black" style={{ fontSize: '10px' }} textAnchor="middle">
            {solarDetails.inverterLabel}
          </text>
          <text x="458" y={boxBottom + 133} className="sld-text-small fill-slate-600" style={{ fontSize: '9px' }}>
            {solarDetails.inverterModel}
          </text>

          {/* Line to DC Isolator */}
          <line x1="400" y1={boxBottom + 148} x2="400" y2={boxBottom + 168} className="sld-line stroke-amber-600" strokeWidth="2" />

          {/* DC Isolator / Combiner Box */}
          <rect x="388" y={boxBottom + 168} width="24" height="16" rx="2" className="sld-line stroke-amber-600" fill="#fffbeb" />
          <text x="400" y={boxBottom + 179} className="sld-text fill-amber-800" style={{ fontSize: '8px', fontWeight: 'bold' }} textAnchor="middle">DC ISO</text>
          <text x="420" y={boxBottom + 179} className="sld-text-small fill-slate-600" style={{ fontSize: '9px' }}>
            {solarDetails.dcProtection}
          </text>

          {/* Line to Solar PV Array */}
          <line x1="400" y1={boxBottom + 184} x2="400" y2={boxBottom + 200} className="sld-line stroke-amber-600" strokeWidth="2" />

          {/* Solar PV Array Symbol */}
          <rect x="330" y={boxBottom + 200} width="140" height="36" rx="4" className="sld-line stroke-amber-600" fill="#f59e0b" fillOpacity="0.2" />
          <line x1="365" y1={boxBottom + 200} x2="365" y2={boxBottom + 236} className="sld-line stroke-amber-500" strokeWidth="1" />
          <line x1="400" y1={boxBottom + 200} x2="400" y2={boxBottom + 236} className="sld-line stroke-amber-500" strokeWidth="1" />
          <line x1="435" y1={boxBottom + 200} x2="435" y2={boxBottom + 236} className="sld-line stroke-amber-500" strokeWidth="1" />
          <line x1="330" y1={boxBottom + 218} x2="470" y2={boxBottom + 218} className="sld-line stroke-amber-500" strokeWidth="1" />
          <text x="400" y={boxBottom + 248} className="sld-text fill-amber-900 font-bold" style={{ fontSize: '10px' }} textAnchor="middle">
            SOLAR PV ARRAY: {solarDetails.pvKwp} kWp DC
          </text>
          <text x="400" y={boxBottom + 260} className="sld-text-small fill-slate-600" style={{ fontSize: '9px' }} textAnchor="middle">
            {solarDetails.arrayDetail}
          </text>
          <text x="400" y={boxBottom + 272} className="sld-text-small fill-slate-500" style={{ fontSize: '8px' }} textAnchor="middle">
            Grid-Tied Solar Interconnection (PEC 2017 Article 6.90)
          </text>
        </g>
      )}

      {/* ===================== GROUNDING ===================== */}
      {/* Ground terminal block inside the board */}
      <rect x={Math.min(mx(442), mx(465))} y={L + 47} width="23" height="20" className="sld-line" fill="white" strokeWidth="1.8" />
      <circle cx={mx(453)} cy={L + 57} r="3" fill="#1e293b" />
      <Callout x={mx(465)} y={L + 55} toX={mx(532)} y0={L + 46} y1={L + 64} />
      <T x={mx(540)} y={L + 60} t="GROUND TERMINAL BLOCK" size={12} anchor={anchorOut} />
      {isSubPanel && (
        <text x={mx(540)} y={L + 75} className="sld-text-small" style={{ fontSize: '10px', fill: '#64748b' }} textAnchor={anchorOut}>
          (EGC FROM {parentDesignation || 'MDP'})
        </text>
      )}
      {/* Service board only: grounding electrode conductor and ground rod */}
      {!isSubPanel && (
        <g>
          {groundLeft ? (
            <polyline points={`${mx(453)},${L + 57} ${mx(453)},${L + 88} ${wireX},${L + 88} ${wireX},${L + 144}`} className="sld-line" strokeWidth="1.8" />
          ) : (
            <line x1={wireX} y1={L + 57} x2={wireX} y2={L + 144} className="sld-line" strokeWidth="1.8" />
          )}
          <Callout x={wireX} y={L + gecY} toX={gw(535)} y0={L + gecY - 10} y1={L + gecY + 22} />
          <T x={gw(544)} y={L + gecY + 4} t={`${fmtWireMm2(ground.gecMm2)} mm² TW (G) COPPER WIRE`} size={12} anchor={anchorOut} />
          <T x={gw(544)} y={L + gecY + 20} t={`IN ${ground.conduit}`} size={12} anchor={anchorOut} />
          {/* Ground rod electrode */}
          <polygon points={`${gw(441)},${L + 144} ${gw(465)},${L + 144} ${wireX},${L + 167}`} fill="#94a3b8" className="sld-line" strokeWidth="1.5" />
          <line x1={gw(444)} y1={L + 151} x2={gw(462)} y2={L + 151} className="sld-line" strokeWidth="1.2" />
          <line x1={gw(447.5)} y1={L + 158} x2={gw(458.5)} y2={L + 158} className="sld-line" strokeWidth="1.2" />
          <Callout x={gw(461)} y={L + 154} toX={gw(535)} y0={L + 144} y1={L + 176} />
          <T x={gw(544)} y={L + 158} t="20mmø x 3M COPPER WELD GROUND ROD" size={12} anchor={anchorOut} />
          <T x={gw(544)} y={L + 174} t="WITH HEAVY DUTY CLAMP" size={12} anchor={anchorOut} />
          <T x={wireX} y={L + 184} t="GROUNDING" size={11} anchor="middle" />
          <T x={wireX} y={L + 199} t="SYSTEM" size={11} anchor="middle" />
        </g>
      )}
    </g>
  );
};

export const SingleLineDiagram: React.FC<SingleLineDiagramProps> = (props) => {
  const svgHeight = panelSldHeight(props.panelRows.length, { solar: Boolean(props.solarConfig && !props.isSubPanel) });
  const x0 = props.isSubPanel ? 0 : -SLD_GEOM.LEFT_OVERFLOW;
  const svgWidth = SLD_GEOM.WIDTH - x0;

  return (
    <div className="w-full flex items-center justify-center bg-white border-2 border-slate-800 p-8 overflow-x-auto">
      <div style={{ minWidth: svgWidth }}>
      <svg
        viewBox={`${x0} 0 ${svgWidth} ${svgHeight}`}
        width={svgWidth}
        className="h-auto font-sans text-slate-800"
      >
        <defs>
          <style>
             {`
               .sld-line { fill: none; stroke: #1e293b; stroke-width: 1.5; }
               .sld-text { fill: #1e293b; font-size: 14px; font-weight: bold; }
               .sld-text-small { fill: #1e293b; font-size: 12px; }
             `}
          </style>
        </defs>
        <SingleLineDiagramContent {...props} />
      </svg>
      </div>
    </div>
  );
};
