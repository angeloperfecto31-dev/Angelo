import React from "react";
import { SolarDesignConfig, SolarCalculationResults } from "../../types/solar";
import { stringsPerInverter, type PictorialTheme } from "./SolarSLDPictorial";

/**
 * Solar PV BLOCK DIAGRAM: the power flow at a glance (PV array -> inverter -> protection ->
 * metering -> utility / loads). Drawn as plain SVG primitives so the same drawing is shown on
 * screen and converted for the PDF and AutoCAD (DXF) exports (see captureSolarBlockDiagram).
 *
 *   On-grid : PV -> GRID TIE INVERTER -> PROTECTION -> PRODUCTION (REC) METER -> BI-DIRECTIONAL
 *             METER <-> UTILITY GRID, and the bi-directional meter -> HOUSE LOADS
 *   Hybrid  : as on-grid, plus the BATTERY BANK and the ESSENTIAL LOADS (EPS) fed by the inverter
 *   Off-grid: UTILITY GRID -> kWh METER -> inverter AC INPUT (no export); the inverter output
 *             feeds the LOADS PANEL; the utility meter also feeds the existing loads
 *
 * With several inverters every inverter is drawn (as on the SLD): the PV array splits to each
 * inverter, and their outputs join on the AC COLLECTOR BUS. Battery and EPS sit on inverter 1.
 */

export const BLOCK_W = 980;
export const BLOCK_H = 700;

const FONT = "Arial, Helvetica, sans-serif";
const textWidth = (text: string, size: number) => text.length * size * 0.56;
const wrap = (text: string, maxWidth: number, size: number) => {
  const maxChars = Math.max(6, Math.floor(maxWidth / (size * 0.56)));
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  return out;
};

interface Props {
  config: SolarDesignConfig;
  calc: SolarCalculationResults;
  theme: PictorialTheme;
  /** Name of the panel board the house loads are fed from */
  panelDesignation?: string;
  onSelect?: (key: string) => void;
}

export const SolarBlockDiagram: React.FC<Props> = ({ config, calc, theme, panelDesignation, onSelect }) => {
  const eff = calc.effective;
  const isHybrid = config.systemType === "hybrid";
  const isOffGrid = config.systemType === "off-grid";
  const hasBattery = (isHybrid || isOffGrid) && Boolean(config.battery?.enabled);
  const netMetering = !isOffGrid && config.netMetering?.enabled !== false;
  const stroke = theme.line;
  const select = (k: string) => () => onSelect?.(k);

  const inv = calc.selectedInverter;
  const invQty = eff.inverterQuantity;
  const multi = invQty > 1;
  const invWord = multi ? "INVERTERS" : "INVERTER";
  const invTitle = isOffGrid ? ["OFF-GRID", invWord] : isHybrid ? ["HYBRID", invWord] : ["GRID TIE", invWord];
  const invRating = `${invQty > 1 ? `${invQty} x ` : ""}${inv.ratedAcPowerKw} kW, ${inv.phase} ${inv.acVoltage}V`;

  // ---------- layout (fixed sheet, positions chosen so labels never meet) ----------
  const invCx = 250, rowY = 330; // inverter centre and the main power row
  const meter1Cx = 490, meter2Cx = 730;
  const pvTop = 104;
  const utilCx = meter2Cx, utilTop = 104;
  const houseCx = meter2Cx, houseTop = 500;
  const loadsCx = 490; // essential / inverter-output loads (hybrid, off-grid)
  const batTop = 470;

  // Several inverters: one row, centred under the PV array, each drawn smaller as the count grows
  const rowL = 170, rowR = 430, rowCx = 300;
  const pitch = Math.min(120, (rowR - rowL) / invQty);
  const sc = Math.max(0.3, Math.min(0.8, (pitch - 16) / 84));
  const invXs = multi ? Array.from({ length: invQty }, (_, i) => rowCx + (i - (invQty - 1) / 2) * pitch) : [invCx];
  const invStrings = stringsPerInverter(eff.numberOfStrings, invQty);
  const invBottom = rowY + 58 * sc;
  const splitY = 232; // PV array -> every inverter
  const busY = invBottom + 28; // AC collector bus
  const dropX = (x: number) => x + 20 * sc; // inverter AC output drop
  const batX = invXs[0] - 20 * sc; // inverter 1 battery port
  const firstX = invXs[0], lastX = invXs[invXs.length - 1];
  const rowRightEdge = lastX + 42 * sc;
  const batCx = 90;

  // ---------- primitives ----------
  const T = (p: { x: number; y: number; t: string; size?: number; anchor?: "start" | "middle" | "end"; bold?: boolean; muted?: boolean }) => (
    <text
      x={p.x}
      y={p.y}
      fontSize={`${p.size ?? 15}px`}
      fontFamily={FONT}
      fontWeight={p.bold ? "bold" : "normal"}
      textAnchor={p.anchor ?? "middle"}
      fill={p.muted ? theme.textMuted : theme.text}
    >
      {p.t}
    </text>
  );

  /** Straight arrow from (x1,y1) to (x2,y2) with a filled head at the end (and at the start if `both`) */
  const Arrow = ({ x1, y1, x2, y2, both = false }: { x1: number; y1: number; x2: number; y2: number; both?: boolean }) => {
    const head = (hx: number, hy: number, fx: number, fy: number) => {
      const a = Math.atan2(hy - fy, hx - fx);
      const L = 16, Wd = 8;
      const bx = hx - Math.cos(a) * L, by = hy - Math.sin(a) * L;
      const px = -Math.sin(a) * Wd, py = Math.cos(a) * Wd;
      return `${hx},${hy} ${bx + px},${by + py} ${bx - px},${by - py}`;
    };
    const a = Math.atan2(y2 - y1, x2 - x1);
    const sx = both ? x1 + Math.cos(a) * 14 : x1, sy = both ? y1 + Math.sin(a) * 14 : y1;
    return (
      <g data-cad-layer="EPH-SLD">
        <line x1={sx} y1={sy} x2={x2 - Math.cos(a) * 14} y2={y2 - Math.sin(a) * 14} stroke={stroke} strokeWidth={3} />
        <polygon points={head(x2, y2, x1, y1)} fill={stroke} stroke={stroke} strokeWidth={1} />
        {both && <polygon points={head(x1, y1, x2, y2)} fill={stroke} stroke={stroke} strokeWidth={1} />}
      </g>
    );
  };

  /** Arrow along a right-angle path (last segment carries the head) */
  const PathArrow = ({ pts }: { pts: Array<[number, number]> }) => {
    const [x1, y1] = pts[pts.length - 2];
    const [x2, y2] = pts[pts.length - 1];
    return (
      <g data-cad-layer="EPH-SLD">
        <polyline points={pts.slice(0, -1).map((p) => p.join(",")).join(" ")} fill="none" stroke={stroke} strokeWidth={3} />
        <Arrow x1={x1} y1={y1} x2={x2} y2={y2} />
      </g>
    );
  };

  const PvArray = ({ cx, top }: { cx: number; top: number }) => {
    const w = 180, h = 84, skew = 40;
    const x0 = cx - w / 2;
    const tl = [x0 + skew, top], tr = [x0 + w, top], br = [x0 + w - skew, top + h], bl = [x0, top + h];
    const lerp = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    return (
      <g data-cad-layer="EPH-PV" className={onSelect ? "cursor-pointer" : undefined} onClick={select("pv_module")}>
        <polygon points={[tl, tr, br, bl].map((p) => p.join(",")).join(" ")} fill={theme.equipmentFill} stroke={stroke} strokeWidth={2} />
        {[1, 2, 3, 4, 5].map((i) => {
          const a = lerp(tl, tr, i / 6), b = lerp(bl, br, i / 6);
          return <line key={`c${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={stroke} strokeWidth={1.2} />;
        })}
        {[1, 2, 3].map((j) => {
          const a = lerp(tl, bl, j / 4), b = lerp(tr, br, j / 4);
          return <line key={`r${j}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={stroke} strokeWidth={1.2} />;
        })}
      </g>
    );
  };

  const Inverter = ({ cx, cy, s = 1, lines = [] }: { cx: number; cy: number; s?: number; lines?: string[] }) => {
    const fs = s >= 0.6 ? 11 : 10;
    return (
      <g data-cad-layer="EPH-INVERTER" className={onSelect ? "cursor-pointer" : undefined} onClick={select("inverter")}>
        <rect x={cx - 42 * s} y={cy - 58 * s} width={84 * s} height={116 * s} rx={6 * s} fill={theme.equipmentFill} stroke={stroke} strokeWidth={2} />
        <rect x={cx - 24 * s} y={cy - 44 * s} width={48 * s} height={32 * s} rx={3 * s} fill="none" stroke={stroke} strokeWidth={1.5} />
        <rect x={cx - 16 * s} y={cy - 37 * s} width={32 * s} height={12 * s} fill="none" stroke={stroke} strokeWidth={1.2} />
        <line x1={cx - 42 * s} y1={cy + 34 * s} x2={cx + 42 * s} y2={cy + 34 * s} stroke={stroke} strokeWidth={1.2} />
        {/* Inverter number (and its strings) in the body, between the display and the base line */}
        {lines.map((t, i) => (
          <T key={t} x={cx} y={cy + 11 * s + (i - (lines.length - 1) / 2) * (fs + 3) + fs * 0.36} t={t} size={fs} bold={i === 0} muted={i > 0} />
        ))}
      </g>
    );
  };

  const Meter = ({ cx, cy, k }: { cx: number; cy: number; k: string }) => (
    <g data-cad-layer="EPH-PANEL" className={onSelect ? "cursor-pointer" : undefined} onClick={select(k)}>
      <rect x={cx - 45} y={cy - 55} width={90} height={110} rx={14} fill={theme.equipmentFill} stroke={stroke} strokeWidth={2} />
      <rect x={cx - 34} y={cy - 44} width={68} height={88} rx={10} fill="none" stroke={stroke} strokeWidth={1.4} />
      <rect x={cx - 26} y={cy - 34} width={52} height={14} fill="none" stroke={stroke} strokeWidth={1.2} />
      {[-13, 0, 13].map((d) => (
        <line key={d} x1={cx + d} y1={cy - 34} x2={cx + d} y2={cy - 20} stroke={stroke} strokeWidth={1} />
      ))}
      <circle cx={cx} cy={cy + 10} r={22} fill="none" stroke={stroke} strokeWidth={1.4} />
      <polyline points={`${cx + 4},${cy - 3} ${cx - 5},${cy + 12} ${cx + 5},${cy + 8} ${cx - 4},${cy + 23}`} fill="none" stroke={stroke} strokeWidth={1.4} />
    </g>
  );

  const UtilityPole = ({ cx, top }: { cx: number; top: number }) => (
    <g data-cad-layer="EPH-PANEL" className={onSelect ? "cursor-pointer" : undefined} onClick={select("utility_meter")}>
      <line x1={cx} y1={top} x2={cx} y2={top + 92} stroke={stroke} strokeWidth={2.4} />
      <line x1={cx - 34} y1={top + 10} x2={cx + 34} y2={top + 10} stroke={stroke} strokeWidth={2} />
      <line x1={cx - 24} y1={top + 24} x2={cx + 24} y2={top + 24} stroke={stroke} strokeWidth={1.6} />
      {[-28, -12, 12, 28].map((d) => (
        <circle key={d} cx={cx + d} cy={top + 6} r={3.5} fill="none" stroke={stroke} strokeWidth={1.2} />
      ))}
      <rect x={cx - 22} y={top + 34} width={12} height={18} fill="none" stroke={stroke} strokeWidth={1.4} />
      <rect x={cx + 10} y={top + 34} width={12} height={18} fill="none" stroke={stroke} strokeWidth={1.4} />
      <line x1={cx - 16} y1={top + 24} x2={cx - 16} y2={top + 34} stroke={stroke} strokeWidth={1.2} />
      <line x1={cx + 16} y1={top + 24} x2={cx + 16} y2={top + 34} stroke={stroke} strokeWidth={1.2} />
    </g>
  );

  const House = ({ cx, top, k }: { cx: number; top: number; k: string }) => {
    const w = 120, wallTop = top + 46, h = 74;
    const x0 = cx - w / 2;
    return (
      <g data-cad-layer="EPH-PANEL" className={onSelect ? "cursor-pointer" : undefined} onClick={select(k)}>
        <polygon points={`${x0 - 12},${wallTop} ${cx},${top} ${x0 + w + 12},${wallTop}`} fill={theme.equipmentFill} stroke={stroke} strokeWidth={2} />
        <rect x={x0 + w - 30} y={top + 10} width={12} height={22} fill={theme.equipmentFill} stroke={stroke} strokeWidth={1.6} />
        <rect x={x0} y={wallTop} width={w} height={h} fill={theme.equipmentFill} stroke={stroke} strokeWidth={2} />
        <rect x={x0 + 16} y={wallTop + 26} width={24} height={h - 26} fill="none" stroke={stroke} strokeWidth={1.4} />
        <rect x={x0 + 62} y={wallTop + 18} width={38} height={28} fill="none" stroke={stroke} strokeWidth={1.4} />
        <line x1={x0 + 81} y1={wallTop + 18} x2={x0 + 81} y2={wallTop + 46} stroke={stroke} strokeWidth={1.2} />
        <line x1={x0 + 62} y1={wallTop + 32} x2={x0 + 100} y2={wallTop + 32} stroke={stroke} strokeWidth={1.2} />
      </g>
    );
  };

  const Battery = ({ cx, top }: { cx: number; top: number }) => (
    <g data-cad-layer="EPH-BATTERY" className={onSelect ? "cursor-pointer" : undefined} onClick={select("battery_bank")}>
      <rect x={cx - 50} y={top + 8} width={100} height={56} rx={4} fill={theme.equipmentFill} stroke={stroke} strokeWidth={2} />
      <rect x={cx - 34} y={top} width={14} height={8} fill="none" stroke={stroke} strokeWidth={1.4} />
      <rect x={cx + 20} y={top} width={14} height={8} fill="none" stroke={stroke} strokeWidth={1.4} />
      <line x1={cx - 33} y1={top + 36} x2={cx - 21} y2={top + 36} stroke={stroke} strokeWidth={2} />
      <line x1={cx + 21} y1={top + 36} x2={cx + 33} y2={top + 36} stroke={stroke} strokeWidth={2} />
      <line x1={cx + 27} y1={top + 30} x2={cx + 27} y2={top + 42} stroke={stroke} strokeWidth={2} />
    </g>
  );

  // ---------- labels ----------
  const loadsName = panelDesignation || "MAIN DISTRIBUTION PANEL";
  const meter2Label = netMetering ? ["BI-DIRECTIONAL", "METER"] : ["UTILITY", "kWh METER"];
  const protection = `${eff.acBreakerAtAmps} AT, ${eff.acBreakerPoles}P`;
  // Inverter title sits left of the inverter (row)
  const titleX = multi ? firstX - 42 * sc - 14 : invCx - 56;
  const titleW = Math.min(150, titleX - 16);
  const acInMidX = multi ? (rowRightEdge + 8 + meter2Cx - 54) / 2 : (invCx + meter2Cx) / 2;
  const noMeterJoinX = 470; // collector bus -> protection -> utility meter (no REC meter)
  const batPathY = busY + 36;
  const protY = Math.max(busY, rowY + 62) + 20; // below the REC meter, beside the riser into it
  const sysLabel = isOffGrid ? "OFF-GRID SYSTEM (UTILITY AS BACKUP INPUT)" : isHybrid ? "HYBRID SYSTEM (WITH BATTERY BACKUP)" : "ON-GRID (GRID-TIED) SYSTEM";

  return (
    <g id="solar-block-diagram" fontFamily={FONT}>
      {/* Title (the exported sheet is labelled BLOCK DIAGRAM) */}
      <g data-cad-layer="EPH-TITLE">
        <T x={BLOCK_W / 2} y={50} t="BLOCK DIAGRAM" size={22} bold />
        <T x={BLOCK_W / 2} y={70} t={`${sysLabel} - ${calc.totalDcCapacityKwp} kWp DC / ${calc.totalInverterAcKw} kW AC`} size={13} muted />
      </g>

      {/* PV array -> inverter */}
      <T x={invCx} y={pvTop - 12} t="PV ARRAY" bold />
      <PvArray cx={invCx} top={pvTop} />
      <T x={invCx + 112} y={pvTop + 34} t={`${calc.totalDcCapacityKwp} kWp`} size={13} anchor="start" muted />
      <T x={invCx + 112} y={pvTop + 51} t={`${calc.totalModules} x ${calc.selectedModule.ratedPowerWp} W`} size={13} anchor="start" muted />
      <T x={invCx + 112} y={pvTop + 68} t={`${eff.numberOfStrings} STRING${eff.numberOfStrings > 1 ? "S" : ""}`} size={13} anchor="start" muted />
      {multi ? (
        <>
          {/* PV array -> every inverter (each inverter takes its own strings) */}
          <g data-cad-layer="EPH-SLD">
            <line x1={invCx} y1={pvTop + 96} x2={invCx} y2={splitY} stroke={stroke} strokeWidth={3} />
            <line x1={firstX} y1={splitY} x2={lastX} y2={splitY} stroke={stroke} strokeWidth={3} />
          </g>
          {invXs.map((x, i) => (
            <g key={`inv-${i}`}>
              <Arrow x1={x} y1={splitY} x2={x} y2={rowY - 58 * sc - 2} />
              <Inverter cx={x} cy={rowY} s={sc} lines={sc >= 0.6 ? [`INV. ${i + 1}`, `${invStrings[i]} STR.`] : [`${i + 1}`]} />
            </g>
          ))}
          {/* Every inverter output drops to the AC collector bus */}
          <g data-cad-layer="EPH-SLD">
            {invXs.map((x, i) => (
              <g key={`drop-${i}`}>
                <line x1={dropX(x)} y1={invBottom} x2={dropX(x)} y2={busY} stroke={stroke} strokeWidth={3} />
                {i > 0 && <circle cx={dropX(x)} cy={busY} r={4.5} fill={stroke} />}
              </g>
            ))}
          </g>
          <T x={rowCx + 12} y={busY + 20} t="AC COLLECTOR BUS" size={12} bold />
          <T x={rowCx + 12} y={busY + 35} t={`${invQty} INVERTER OUTPUTS`} size={12} muted />
        </>
      ) : (
        <>
          <Arrow x1={invCx} y1={pvTop + 96} x2={invCx} y2={rowY - 66} />
          <Inverter cx={invCx} cy={rowY} />
        </>
      )}
      <T x={titleX} y={rowY - 8} t={invTitle[0]} anchor="end" bold />
      <T x={titleX} y={rowY + 10} t={invTitle[1]} anchor="end" bold />
      {wrap(invRating, titleW, 12).map((ln, i) => (
        <T key={ln} x={titleX} y={rowY + 30 + i * 15} t={ln} size={12} anchor="end" muted />
      ))}

      {isOffGrid ? (
        <>
          {/* Utility -> kWh meter -> inverter AC input (charging / bypass, never exports) */}
          <T x={utilCx} y={utilTop - 14} t="UTILITY GRID" bold />
          <UtilityPole cx={utilCx} top={utilTop} />
          <Arrow x1={utilCx} y1={utilTop + 104} x2={utilCx} y2={rowY - 64} />
          <Meter cx={meter2Cx} cy={rowY} k="utility_meter" />
          <T x={meter2Cx + 58} y={rowY - 4} t={meter2Label[0]} anchor="start" bold />
          <T x={meter2Cx + 58} y={rowY + 14} t={meter2Label[1]} anchor="start" bold />
          <Arrow x1={meter2Cx - 54} y1={rowY} x2={multi ? rowRightEdge + 8 : invCx + 50} y2={rowY} />
          <T x={acInMidX} y={rowY - 14} t="AC INPUT (CHARGING / BYPASS)" bold />
          <T x={acInMidX} y={rowY + 24} t="NO EXPORT TO UTILITY" size={12} muted />
          {/* Utility meter also serves the existing (non-solar) loads */}
          <Arrow x1={meter2Cx} y1={rowY + 62} x2={meter2Cx} y2={houseTop - 8} />
          <House cx={houseCx} top={houseTop} k="consumer_panel" />
          <T x={houseCx} y={houseTop + 142} t="EXISTING LOADS" bold />
        </>
      ) : (
        <>
          {/* Inverter(s) -> protection -> (production meter) -> bi-directional meter <-> utility */}
          {netMetering ? (
            <>
              {multi ? (
                <>
                  <PathArrow pts={[[dropX(firstX), busY], [meter1Cx, busY], [meter1Cx, rowY + 57]]} />
                  <T x={meter1Cx + 12} y={protY} t="PROTECTION" anchor="start" bold />
                  <T x={meter1Cx + 12} y={protY + 16} t={protection} size={12} anchor="start" muted />
                  <T x={meter1Cx} y={rowY - 66} t="REC METER" size={12} muted />
                </>
              ) : (
                <>
                  <Arrow x1={invCx + 50} y1={rowY} x2={meter1Cx - 54} y2={rowY} />
                  <T x={(invCx + meter1Cx) / 2} y={rowY - 14} t="PROTECTION" bold />
                  <T x={(invCx + meter1Cx) / 2} y={rowY + 24} t={protection} size={12} muted />
                  <T x={meter1Cx} y={rowY + 76} t="REC METER" size={12} muted />
                </>
              )}
              <Meter cx={meter1Cx} cy={rowY} k="solar_meter" />
              <Arrow x1={meter1Cx + 54} y1={rowY} x2={meter2Cx - 54} y2={rowY} />
              <T x={(meter1Cx + meter2Cx) / 2} y={rowY - 14} t="PRODUCTION" bold />
            </>
          ) : multi ? (
            <>
              <PathArrow pts={[[dropX(firstX), busY], [noMeterJoinX, busY], [noMeterJoinX, rowY], [meter2Cx - 54, rowY]]} />
              <T x={(noMeterJoinX + meter2Cx - 54) / 2} y={rowY - 14} t="PROTECTION" bold />
              <T x={(noMeterJoinX + meter2Cx - 54) / 2} y={rowY + 24} t={protection} size={12} muted />
            </>
          ) : (
            <>
              <Arrow x1={invCx + 50} y1={rowY} x2={meter2Cx - 54} y2={rowY} />
              <T x={(invCx + meter2Cx) / 2} y={rowY - 14} t="PROTECTION" bold />
              <T x={(invCx + meter2Cx) / 2} y={rowY + 24} t={protection} size={12} muted />
            </>
          )}
          <Meter cx={meter2Cx} cy={rowY} k="utility_meter" />
          <T x={meter2Cx + 58} y={rowY - 4} t={meter2Label[0]} anchor="start" bold />
          <T x={meter2Cx + 58} y={rowY + 14} t={meter2Label[1]} anchor="start" bold />
          <T x={utilCx} y={utilTop - 14} t="UTILITY GRID" bold />
          <UtilityPole cx={utilCx} top={utilTop} />
          <Arrow x1={utilCx} y1={utilTop + 104} x2={utilCx} y2={rowY - 64} both />
          <Arrow x1={meter2Cx} y1={rowY + 62} x2={meter2Cx} y2={houseTop - 8} />
          <House cx={houseCx} top={houseTop} k="consumer_panel" />
          <T x={houseCx} y={houseTop + 142} t="HOUSE LOADS" bold />
        </>
      )}
      {wrap(loadsName, 220, 12).map((ln, i) => (
        <T key={ln} x={houseCx} y={houseTop + 160 + i * 15} t={ln} size={12} muted />
      ))}

      {/* Hybrid / off-grid: battery bank and the loads fed by the inverter output */}
      {hasBattery &&
        (multi ? (
          <>
            {/* Battery on inverter 1, drawn to the left of the inverter row */}
            <Arrow x1={batX} y1={batPathY} x2={batX} y2={invBottom + 2} />
            <g data-cad-layer="EPH-SLD">
              <line x1={batX} y1={batPathY} x2={batCx} y2={batPathY} stroke={stroke} strokeWidth={3} />
            </g>
            <Arrow x1={batCx} y1={batPathY} x2={batCx} y2={batTop - 4} />
            <Battery cx={batCx} top={batTop} />
            <T x={batCx} y={batTop + 88} t="BATTERY BANK" bold />
            <T x={batCx} y={batTop + 106} t={`${calc.batteryUsableEnergyKwh} kWh USABLE`} size={12} muted />
            <T x={batCx} y={batTop + 121} t={`${calc.effective.batteryUnits} x ${config.battery.energyKwh} kWh UNITS`} size={12} muted />
          </>
        ) : (
          <>
            <Arrow x1={invCx} y1={rowY + 64} x2={invCx} y2={batTop - 4} both />
            <Battery cx={invCx} top={batTop} />
            <T x={invCx} y={batTop + 88} t="BATTERY BANK" bold />
            <T x={invCx} y={batTop + 106} t={`${calc.batteryUsableEnergyKwh} kWh USABLE`} size={12} muted />
            <T x={invCx} y={batTop + 121} t={`${calc.effective.batteryUnits} x ${config.battery.energyKwh} kWh UNITS`} size={12} muted />
          </>
        ))}
      {(isHybrid || isOffGrid) && (
        <>
          {!multi ? (
            <>
              <PathArrow
                pts={[
                  [invCx + 42, rowY + 44],
                  [invCx + 100, rowY + 44],
                  [invCx + 100, houseTop + 80],
                  [loadsCx - 72, houseTop + 80],
                ]}
              />
              <T x={invCx + 108} y={rowY + 80} t={isOffGrid ? "AC OUTPUT" : "EPS OUTPUT"} size={12} anchor="start" muted />
            </>
          ) : isOffGrid ? (
            <>
              {/* Off-grid: the paralleled outputs on the collector bus feed the loads panel */}
              <PathArrow pts={[[dropX(firstX), busY], [loadsCx, busY], [loadsCx, houseTop - 8]]} />
              <T x={loadsCx + 10} y={busY + 50} t="AC OUTPUT" size={12} anchor="start" muted />
            </>
          ) : (
            <>
              {/* Hybrid: the EPS (backup) port of inverter 1 */}
              <PathArrow pts={[[firstX, invBottom], [firstX, houseTop + 80], [loadsCx - 72, houseTop + 80]]} />
              <T x={firstX + 10} y={houseTop + 66} t="EPS OUTPUT (INV. 1)" size={12} anchor="start" muted />
            </>
          )}
          <House cx={loadsCx} top={houseTop} k="eps_panel" />
          <T x={loadsCx} y={houseTop + 142} t={isOffGrid ? "LOADS PANEL" : "ESSENTIAL LOADS"} bold />
          <T x={loadsCx} y={houseTop + 160} t={isOffGrid ? "(INVERTER OUTPUT)" : "(EPS BACKUP)"} size={12} muted />
        </>
      )}
    </g>
  );
};

/** Width a label needs (exported for layout checks) */
export const blockTextWidth = textWidth;
