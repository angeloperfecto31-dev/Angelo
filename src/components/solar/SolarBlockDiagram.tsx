import React from "react";
import { SolarDesignConfig, SolarCalculationResults } from "../../types/solar";
import type { PictorialTheme } from "./SolarSLDPictorial";

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
  const invTitle = isOffGrid ? ["OFF-GRID", "INVERTER"] : isHybrid ? ["HYBRID", "INVERTER"] : ["GRID TIE", "INVERTER"];
  const invRating = `${invQty > 1 ? `${invQty} x ` : ""}${inv.ratedAcPowerKw} kW, ${inv.phase} ${inv.acVoltage}V`;

  // ---------- layout (fixed sheet, positions chosen so labels never meet) ----------
  const invCx = 250, rowY = 330; // inverter centre and the main power row
  const meter1Cx = 490, meter2Cx = 730;
  const pvTop = 104;
  const utilCx = meter2Cx, utilTop = 104;
  const houseCx = meter2Cx, houseTop = 500;
  const loadsCx = 490; // essential / inverter-output loads (hybrid, off-grid)
  const batTop = 470;

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

  const Inverter = ({ cx, cy }: { cx: number; cy: number }) => (
    <g data-cad-layer="EPH-INVERTER" className={onSelect ? "cursor-pointer" : undefined} onClick={select("inverter")}>
      <rect x={cx - 42} y={cy - 58} width={84} height={116} rx={6} fill={theme.equipmentFill} stroke={stroke} strokeWidth={2} />
      <rect x={cx - 24} y={cy - 44} width={48} height={32} rx={3} fill="none" stroke={stroke} strokeWidth={1.5} />
      <rect x={cx - 16} y={cy - 37} width={32} height={12} fill="none" stroke={stroke} strokeWidth={1.2} />
      <line x1={cx - 42} y1={cy + 34} x2={cx + 42} y2={cy + 34} stroke={stroke} strokeWidth={1.2} />
    </g>
  );

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
      <Arrow x1={invCx} y1={pvTop + 96} x2={invCx} y2={rowY - 66} />

      <Inverter cx={invCx} cy={rowY} />
      <T x={invCx - 56} y={rowY - 8} t={invTitle[0]} anchor="end" bold />
      <T x={invCx - 56} y={rowY + 10} t={invTitle[1]} anchor="end" bold />
      {wrap(invRating, 150, 12).map((ln, i) => (
        <T key={ln} x={invCx - 56} y={rowY + 30 + i * 15} t={ln} size={12} anchor="end" muted />
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
          <Arrow x1={meter2Cx - 54} y1={rowY} x2={invCx + 50} y2={rowY} />
          <T x={(invCx + meter2Cx) / 2} y={rowY - 14} t="AC INPUT (CHARGING / BYPASS)" bold />
          <T x={(invCx + meter2Cx) / 2} y={rowY + 24} t="NO EXPORT TO UTILITY" size={12} muted />
          {/* Utility meter also serves the existing (non-solar) loads */}
          <Arrow x1={meter2Cx} y1={rowY + 62} x2={meter2Cx} y2={houseTop - 8} />
          <House cx={houseCx} top={houseTop} k="consumer_panel" />
          <T x={houseCx} y={houseTop + 142} t="EXISTING LOADS" bold />
        </>
      ) : (
        <>
          {/* Inverter -> protection -> (production meter) -> bi-directional meter <-> utility */}
          {netMetering ? (
            <>
              <Arrow x1={invCx + 50} y1={rowY} x2={meter1Cx - 54} y2={rowY} />
              <T x={(invCx + meter1Cx) / 2} y={rowY - 14} t="PROTECTION" bold />
              <T x={(invCx + meter1Cx) / 2} y={rowY + 24} t={protection} size={12} muted />
              <Meter cx={meter1Cx} cy={rowY} k="solar_meter" />
              <T x={meter1Cx} y={rowY + 76} t="REC METER" size={12} muted />
              <Arrow x1={meter1Cx + 54} y1={rowY} x2={meter2Cx - 54} y2={rowY} />
              <T x={(meter1Cx + meter2Cx) / 2} y={rowY - 14} t="PRODUCTION" bold />
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
      {hasBattery && (
        <>
          <Arrow x1={invCx} y1={rowY + 64} x2={invCx} y2={batTop - 4} both />
          <Battery cx={invCx} top={batTop} />
          <T x={invCx} y={batTop + 88} t="BATTERY BANK" bold />
          <T x={invCx} y={batTop + 106} t={`${calc.batteryUsableEnergyKwh} kWh USABLE`} size={12} muted />
        </>
      )}
      {(isHybrid || isOffGrid) && (
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
