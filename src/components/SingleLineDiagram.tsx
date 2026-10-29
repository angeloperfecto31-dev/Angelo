// SingleLineDiagram.tsx
import React from 'react';
import { Circuit, PanelConfig, LoadType } from '../types';
import { parseSystemVoltage, getActivePoles, getTotalPoles, getConductorLabel } from '../utils/computeEngine';
import { computeSolarDesign } from '../utils/solarEngine';
import { groundingElectrode, fmtWireMm2 } from '../utils/groundingElectrode';
import type { SolarCalculationResults } from '../types/solar';

/** Standard breaker frame (AF) for a trip rating */
const frameFor = (at: number) => [100, 225, 400, 600, 800, 1200, 1600, 2000, 2500, 3000, 4000, 5000, 6300].find((f) => f >= at) || at;
const fmtKw = (v: number) => (Math.round(v * 100) / 100).toString();

/** Space below the board for the grounding system (ground wire, rod and their callouts) */
export const PANEL_SLD_EXTRA_BOTTOM = 135;

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

export const SingleLineDiagramContent: React.FC<SingleLineDiagramProps & { xOffset?: number; yOffset?: number }> = ({ panel, mainFeeder, panelRows, formatWireSize, isSubPanel, iscParams, parentDesignation, solarConfig, solarCalc, xOffset = 0, yOffset = 0 }) => {
  // SVG Dimensions Calculation
  const startY = 320;
  const rowHeight = 60;
  const numRows = panelRows.length;
  const boxTop = 260;
  const boxBottom = startY + numRows * rowHeight;
  
  const parsedSys = parseSystemVoltage(panel.system);
  const is3Phase = parsedSys.is3Phase;
  const voltage = panel.voltage;
  const connectionStr = !is3Phase && panel.connectionType === "Line-to-Neutral" ? "(L-N)" : (!is3Phase && panel.connectionType === "Line-to-Line" ? "(L-L)" : "");
  const phaseText = is3Phase ? `3-Φ` : `1-Φ ${connectionStr}`.trim();
  
  const wireNumber = parsedSys.wireCount; 

  // Solar PV feeder: the Solar Design's own sizing (inverters, array, back-feed device, cables, DC protection)
  const solarDetails = React.useMemo(() => {
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
  }, [solarConfig, solarCalc, panel]);

  // Helpers to describe sub-panel dynamic connection configurations
  const getFeederText = (c: Circuit) => {
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
    const conduit = c.conduitSize ? ` IN ${c.conduitSize}mmØ ${(c.conduitType || 'PVC').toUpperCase()}` : '';
    
    return `${phaseText}, ${c.voltage}V | ${pText}, ${conductorLabel}${conduit}`;
  };

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
  const polesText = (p: any) => {
    const s = String(p ?? "").toUpperCase();
    return s.endsWith("P") || s.includes("+N") ? s : `${s}P`;
  };
  const mainPoles = polesText(mainFeeder.poles);
  const mainKaic = mainFeeder.kaic || parseFloat(panel.icRating || "") || 10;
  const feederLabel = `${getConductorLabel(
    mainFeeder.wire.size,
    mainFeeder.groundSize,
    mainFeeder.poles,
    mainFeeder.wire.runs,
    panel.insulationType || "THHN"
  )} ${panel.conductorMaterial === 'Aluminum' ? '(AL)' : '(CU)'}`;
  const conduitLabel =
    panel.conduitArrangement === 'separate_per_set' && (mainFeeder.wire.runs || 1) > 1
      ? `IN ${mainFeeder.wire.runs} SEPARATE ${mainFeeder.conduitSize.toUpperCase()}Ø ${(mainFeeder.conduitType || "PVC").toUpperCase()} CONDUITS`
      : panel.conduitArrangement === 'custom' && panel.customConduitArrangements && panel.customConduitArrangements.length > 0
        ? `IN ${panel.customConduitArrangements.length} CUSTOM ${(mainFeeder.conduitType || "PVC").toUpperCase()} CONDUITS`
        : `IN ${mainFeeder.conduitSize.toUpperCase()}Ø ${(mainFeeder.conduitType || "PVC").toUpperCase()} CONDUIT`;
  const isParallelFeeder = iscParams?.connectionType === 'Parallel' && (mainFeeder.wire.runs || 1) > 1;
  const serviceLine1 = `${is3Phase ? "3" : "1"} PHASE, ${voltage}V, ${wireNumber}-WIRE`;
  const ground = groundingElectrode(mainFeeder.wire.size, mainFeeder.wire.runs || 1);
  // Grounding drawn at the right of the board, or at the left when the solar feeder takes the bottom centre
  const groundLeft = Boolean(solarDetails && !isSubPanel);
  const boxL = 250, boxR = 550;
  const gx = groundLeft ? boxL + 16 : boxR - 16; // ground wire / terminal block centre
  const out = groundLeft ? -1 : 1; // callouts point away from the board
  const calloutX = groundLeft ? boxL - 16 : boxR + 16; // text start (end, on the left)
  const lastRowY = startY + Math.max(0, numRows - 1) * rowHeight;

  /** Callout tick on a conductor, with a dashed leader to the text */
  const Callout = ({ x, y, toX }: { x: number; y: number; toX: number }) => {
    const d = toX > x ? 1 : -1;
    return (
      <g>
        <polyline points={`${x + 7 * d},${y - 6} ${x + 1 * d},${y} ${x + 7 * d},${y + 6}`} className="sld-line" strokeWidth="2" />
        <line x1={x + 8 * d} y1={y} x2={toX} y2={y} className="sld-line" strokeDasharray="4 3" strokeWidth="1" />
      </g>
    );
  };

  /** Circuit tag: circle with the circuit number and a pointer away from the board */
  const CircuitTag = ({ cx, y, dir, no }: { cx: number; y: number; dir: 1 | -1; no: number }) => (
    <g>
      <polygon points={`${cx + 13 * dir},${y - 7} ${cx + 30 * dir},${y} ${cx + 13 * dir},${y + 7}`} fill="white" className="sld-line" strokeLinejoin="round" />
      <circle cx={cx} cy={y} r="14" className="sld-line" fill="white" strokeWidth="2" />
      <text x={cx} y={y + 4} className="sld-text" style={{ fontSize: '11px' }} textAnchor="middle">C{no}</text>
    </g>
  );

  const transformerNote = (() => {
    if (isSubPanel) return null;
    const ptCount = iscParams?.parallelTransformersCount || 1;
    const baseKVA = iscParams?.transformerKVA || recommendedTransformerKVA || 500;
    if (ptCount <= 1) return `UTILITY TRANSFORMER: ${baseKVA} kVA`;
    const pt2Rating = iscParams?.parallelTransformersRating || 100;
    const matched = iscParams?.parallelTransformersZMatch !== false && iscParams?.parallelTransformerskVAMatch !== false;
    const total = matched ? baseKVA * ptCount : baseKVA + (ptCount - 1) * pt2Rating;
    return `${ptCount}x PARALLEL TRANSFORMERS: ${total} kVA`;
  })();

  return (
    <g transform={`translate(${xOffset}, ${yOffset})`}>
      {/* ===================== SOURCE ===================== */}
      {isSubPanel ? (
        <>
          <circle cx="270" cy="100" r="5" fill="#1e293b" />
          <text x="250" y="95" className="sld-text" textAnchor="end">{voltage}V {phaseText}</text>
          <text x="250" y="115" className="sld-text" textAnchor="end">60Hz</text>
          <text x="250" y="75" className="sld-text" textAnchor="end">CONNECTED TO {parentDesignation || 'MDP'}</text>
          <line x1="270" y1="100" x2="400" y2="100" className="sld-line" />
        </>
      ) : (
        <>
          {/* Service entrance: line terminals, service entrance symbol, conductor count, kWh meter */}
          <text x="190" y="95" className="sld-text" style={{ fontSize: '12px' }} textAnchor="end">{serviceLine1}</text>
          <text x="190" y="112" className="sld-text" style={{ fontSize: '12px' }} textAnchor="end">+ GROUND, 60 HZ</text>
          {transformerNote && (
            <text x="190" y="132" className="sld-text-small" style={{ fontSize: '10px', fill: '#64748b' }} textAnchor="end">{transformerNote}</text>
          )}
          <circle cx="200" cy="90" r="4" className="sld-line" fill="white" />
          <circle cx="200" cy="110" r="4" className="sld-line" fill="white" />
          <line x1="204" y1="90" x2="228" y2="90" className="sld-line" />
          <line x1="204" y1="110" x2="228" y2="110" className="sld-line" />
          <path d="M 228,80 L 262,100 L 228,120 Z" className="sld-line" fill="white" strokeWidth="2" />
          <text x="245" y="52" className="sld-text" style={{ fontSize: '13px' }} textAnchor="middle">SERVICE</text>
          <text x="245" y="67" className="sld-text" style={{ fontSize: '13px' }} textAnchor="middle">ENTRANCE</text>
          <line x1="262" y1="100" x2="321" y2="100" className="sld-line" />
          {/* One slash per service conductor */}
          {Array.from({ length: wireNumber }, (_, i) => {
            const hx = 283 + (i - (wireNumber - 1) / 2) * 7;
            return <line key={`tick-${i}`} x1={hx - 4} y1="107" x2={hx + 4} y2="93" className="sld-line" />;
          })}
          <circle cx="335" cy="100" r="14" className="sld-line" fill="white" strokeWidth="2" />
          <text x="335" y="105" className="sld-text" textAnchor="middle">M</text>
          <text x="335" y="80" className="sld-text" style={{ fontSize: '11px' }} textAnchor="middle">KILOWATT-HOUR METER</text>
          <line x1="349" y1="100" x2="400" y2="100" className="sld-line" />
        </>
      )}

      {/* ===================== FEEDER (drop to the board) ===================== */}
      {panel.transferSwitchType && panel.transferSwitchType !== "None" ? (
        <g>
          <line x1="400" y1="100" x2="400" y2="150" className="sld-line" />
          <rect x="385" y="150" width="30" height="20" rx="2" className="sld-line" fill="white" />
          <text x="400" y="163" className="sld-text" style={{fontSize: '10px'}} textAnchor="middle">{panel.transferSwitchType}</text>
          <line x1="400" y1="170" x2="400" y2="188" className="sld-line" />
          {/* Generator input */}
          <line x1="366" y1="160" x2="385" y2="160" className="sld-line" />
          <circle cx="355" cy="160" r="11" className="sld-line" fill="white" />
          <text x="355" y="164" className="sld-text" style={{ fontSize: '12px', fontWeight: 900, fontFamily: '"Arial Black", Arial, sans-serif' }} textAnchor="middle">G</text>
          <line x1="348" y1="168.5" x2="341" y2="177" className="sld-line" />
          <line x1="362" y1="168.5" x2="369" y2="177" className="sld-line" />
          <line x1="355" y1="171" x2="355" y2="177" className="sld-line" />
          <rect x="341" y="177" width="28" height="4.5" className="sld-line" fill="none" />
          <text x="425" y="158" className="sld-text" style={{fontSize: '10px'}} textAnchor="start">
            {panel.transferSwitchRating || (() => {
               const STANDARD_TS_RATINGS = [30, 40, 50, 60, 70, 80, 90, 100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000, 5000];
               return STANDARD_TS_RATINGS.find(r => r >= mainFeeder.cb) || mainFeeder.cb;
            })()} A, {panel.transferSwitchPoles || (panel.system.includes("3PH") ? 3 : 2)}P
          </text>
          <text x="425" y="169" className="sld-text" style={{fontSize: '9px'}} textAnchor="start">
            {panel.transferSwitchType === "ATS" ? "AUTOMATIC" : "MANUAL"} TRANSFER SW
          </text>
        </g>
      ) : (
        <line x1="400" y1="100" x2="400" y2="188" className="sld-line" />
      )}
      <Callout x={400} y={128} toX={452} />
      {isParallelFeeder && (
        <text x="458" y="108" className="fill-emerald-600" style={{ fontSize: '10px', fontWeight: 900, letterSpacing: '0.04em' }}>[PARALLEL FEEDER CONNECTION]</text>
      )}
      <text x="458" y="125" className="sld-text" style={{ fontSize: '12px' }}>{feederLabel}</text>
      <text x="458" y="141" className="sld-text" style={{ fontSize: '12px' }}>{conduitLabel}</text>

      {/* ===================== PANEL BOARD ===================== */}
      <text x="410" y="182" className="sld-text" style={{ fontSize: '13px' }}>
        PANEL BOARD{panel.designation ? ` (${panel.designation})` : ""}
      </text>
      <rect x={boxL} y="188" width={boxR - boxL} height={boxBottom - 188} className="sld-line" fill="none" />

      {/* Main breaker inside the board */}
      <line x1="400" y1="188" x2="400" y2="200" className="sld-line" />
      <circle cx="400" cy="200" r="3" fill="#1e293b" />
      <path d="M 400,200 A 15 15 0 0 1 400,230" className="sld-line" strokeWidth="2.5" fill="none" />
      <circle cx="400" cy="230" r="3" fill="#1e293b" />
      <text x="422" y="212" className="sld-text" style={{ fontSize: '13px' }}>
        {mainFeeder.cb}AT, {mainPoles}, {mainKaic}KAIC
      </text>
      <text x="422" y="228" className="sld-text-small" style={{ fontSize: '11px', fill: '#475569' }}>
        {mainFeeder.af}AF, {voltage}V, 60HZ
      </text>

      {/* Bus */}
      <line x1="400" y1="230" x2="400" y2={lastRowY} className="sld-line" strokeWidth="2" />

      {/* ===================== BRANCH CIRCUITS ===================== */}
      {panelRows.map((row, idx) => {
         const y = startY + idx * rowHeight;
         const side = (c: Circuit, dir: 1 | -1) => {
           const isSpace = (c.description || "").toUpperCase() === 'SPACE' || c.loadType === LoadType.SPACE;
           const isSub = c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL;
           const bIn = 400 + 25 * dir, bOut = 400 + 55 * dir; // breaker terminals
           const tagX = 400 + 178 * dir; // circuit tag centre (pointer tip at 400 + 208 * dir)
           const textX = 400 + 214 * dir;
           const anchor = dir === 1 ? "start" : "end";
           return (
             <g>
               <circle cx="400" cy={y} r="3" fill="#1e293b" />
               <line x1="400" y1={y} x2={bIn} y2={y} className="sld-line" />
               <circle cx={bIn} cy={y} r="3" fill="#1e293b" />
               <path d={`M ${bIn},${y} A 15 15 0 0 ${dir === 1 ? 1 : 0} ${bOut},${y}`} className="sld-line" strokeWidth="2.5" fill="none" />
               <circle cx={bOut} cy={y} r="3" fill="#1e293b" />
               {!isSpace && (
                 <text x={(bIn + bOut) / 2} y={y - 20} className="sld-text" style={{ fontSize: '12px' }} textAnchor="middle">
                   {c.mcbAT}AT, {polesText(c.mcbP || "1P")}
                 </text>
               )}
               <line x1={bOut} y1={y} x2={tagX - 14 * dir} y2={y} className="sld-line" />
               <CircuitTag cx={tagX} y={y} dir={dir} no={c.circuitNo} />
               <text x={textX} y={isSub ? y - 6 : y + 4} className="sld-text" style={{ fontSize: '12px' }} textAnchor={anchor}>{c.description}</text>
               {isSub && (
                 <text x={textX} y={y + 12} className="sld-text-small" textAnchor={anchor} style={{ fontSize: '10px', fill: '#64748b' }}>
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
      <g>
        <rect x={gx - 10} y={boxBottom - 28} width="20" height="14" className="sld-line" fill="white" strokeWidth="1.8" />
        <circle cx={gx - 4} cy={boxBottom - 21} r="1.8" fill="#1e293b" />
        <circle cx={gx + 4} cy={boxBottom - 21} r="1.8" fill="#1e293b" />
        <Callout x={gx + 10 * out} y={boxBottom - 21} toX={calloutX - 4 * out} />
        <text x={calloutX} y={boxBottom - 24} className="sld-text" style={{ fontSize: '11px' }} textAnchor={groundLeft ? "end" : "start"}>GROUND TERMINAL</text>
        <text x={calloutX} y={boxBottom - 11} className="sld-text" style={{ fontSize: '11px' }} textAnchor={groundLeft ? "end" : "start"}>BLOCK</text>
        {isSubPanel && (
          <text x={calloutX} y={boxBottom + 3} className="sld-text-small" style={{ fontSize: '10px', fill: '#64748b' }} textAnchor={groundLeft ? "end" : "start"}>
            (EGC FROM {parentDesignation || 'MDP'})
          </text>
        )}
      </g>
      {/* Service board only: grounding electrode conductor and ground rod */}
      {!isSubPanel && (
        <g>
          <line x1={gx} y1={boxBottom - 14} x2={gx} y2={boxBottom + 70} className="sld-line" strokeWidth="2" />
          <Callout x={gx} y={boxBottom + 21} toX={calloutX - 4 * out} />
          {[`${fmtWireMm2(ground.gecMm2)} mm² TW (G)`, "COPPER WIRE IN", ground.conduit].map((t, i) => (
            <text key={t} x={calloutX} y={boxBottom + 12 + i * 13} className="sld-text" style={{ fontSize: '10.5px' }} textAnchor={groundLeft ? "end" : "start"}>{t}</text>
          ))}
          {/* Ground rod electrode */}
          <line x1={gx - 14} y1={boxBottom + 70} x2={gx + 14} y2={boxBottom + 70} className="sld-line" strokeWidth="2" />
          <line x1={gx - 9} y1={boxBottom + 76} x2={gx + 9} y2={boxBottom + 76} className="sld-line" strokeWidth="2" />
          <line x1={gx - 4} y1={boxBottom + 82} x2={gx + 4} y2={boxBottom + 82} className="sld-line" strokeWidth="2" />
          <Callout x={gx + 15 * out} y={boxBottom + 74} toX={calloutX - 4 * out} />
          {["20mmØ x 3M", "COPPER WELD", "GROUND ROD WITH", "HEAVY DUTY CLAMP"].map((t, i) => (
            <text key={t} x={calloutX} y={boxBottom + 56 + i * 13} className="sld-text" style={{ fontSize: '10.5px' }} textAnchor={groundLeft ? "end" : "start"}>{t}</text>
          ))}
          <text x={gx} y={boxBottom + 110} className="sld-text" style={{ fontSize: '11px' }} textAnchor="middle">GROUNDING</text>
          <text x={gx} y={boxBottom + 123} className="sld-text" style={{ fontSize: '11px' }} textAnchor="middle">SYSTEM</text>
        </g>
      )}
    </g>
  );
};

export const SingleLineDiagram: React.FC<SingleLineDiagramProps> = (props) => {
  const numRows = props.panelRows.length;
  const startY = 320;
  const rowHeight = 60;
  const boxBottom = startY + numRows * rowHeight;
  const extraBottom = props.solarConfig && !props.isSubPanel ? 280 : PANEL_SLD_EXTRA_BOTTOM;
  const svgHeight = boxBottom + extraBottom;
  const svgWidth = 800;

  return (
    <div className="w-full flex items-center justify-center bg-white border-2 border-slate-800 p-8 overflow-x-auto">
      <div className="min-w-[800px]">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-[800px] h-auto font-sans text-slate-800"
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
