// SingleLineDiagram.tsx
import React from 'react';
import { Circuit, PanelConfig, LoadType } from '../types';
import { parseSystemVoltage, getActivePoles, getTotalPoles, getConductorLabel } from '../utils/computeEngine';

interface SingleLineDiagramProps {
  panel: PanelConfig;
  mainFeeder: any;
  panelRows: any[];
  formatWireSize: (size: number) => number | string;
  isSubPanel?: boolean;
  iscParams?: any;
  parentDesignation?: string;
}

export const SingleLineDiagramContent: React.FC<SingleLineDiagramProps & { xOffset?: number; yOffset?: number }> = ({ panel, mainFeeder, panelRows, formatWireSize, isSubPanel, iscParams, parentDesignation, xOffset = 0, yOffset = 0 }) => {
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

  // Helpers to describe sub-panel dynamic connection configurations
  const getFeederText = (c: Circuit) => {
    const isSub = c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL;
    if (!isSub) return "";
    
    let phaseText = "1-Φ L-N";
    if (getActivePoles(c.mcbP) === 3) {
      phaseText = "3-Φ";
    } else if (getActivePoles(c.mcbP) === 2) {
      phaseText = "1-Φ L-L";
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

  return (
    <g transform={`translate(${xOffset}, ${yOffset})`}>
      {/* Source Symbol */}
      {isSubPanel ? (
        <>
          <circle cx="270" cy="100" r="5" fill="#1e293b" />
          <text x="250" y="95" className="sld-text" textAnchor="end">{voltage}V {phaseText}</text>
          <text x="250" y="115" className="sld-text" textAnchor="end">60Hz</text>
          <text x="250" y="75" className="sld-text" textAnchor="end">CONNECTED TO {parentDesignation || 'MDP'}</text>
        </>
      ) : (() => {
        const ptCount = iscParams?.parallelTransformersCount || 1;
        const ptZMatch = iscParams?.parallelTransformersZMatch !== false;
        const ptkVAMatch = iscParams?.parallelTransformerskVAMatch !== false;
        const baseKVA = iscParams?.transformerKVA || recommendedTransformerKVA || 500;
        const pt2Rating = iscParams?.parallelTransformersRating || 100;
        const totalKVA = ptCount > 1 
          ? (ptZMatch && ptkVAMatch ? baseKVA * ptCount : baseKVA + (ptCount - 1) * pt2Rating)
          : baseKVA;

        return (
          <>
            {/* Draw parallel transformer triangles if count > 1 */}
            {ptCount > 1 ? (
              <>
                {/* Secondary offset triangle to represent parallel banks */}
                <path d="M 235,75 L 275,95 L 235,115 Z" className="sld-line stroke-sky-500" strokeWidth="2.5" fill="none" opacity="0.65" />
                <path d="M 225,85 L 265,105 L 225,125 Z" className="sld-line stroke-red-600" strokeWidth="2.5" fill="none" />
                <text x="210" y="70" className="sld-text font-bold text-red-600 fill-red-600" textAnchor="end">
                  {ptCount}x PARALLEL POWER TRANSFORMERS
                </text>
                <text x="210" y="88" className="sld-text font-semibold fill-slate-800 dark:fill-slate-100" textAnchor="end">
                  Total Capacity: {totalKVA} kVA
                </text>
                <text x="210" y="104" className="sld-text font-medium fill-slate-500" style={{ fontSize: '11px' }} textAnchor="end">
                  {ptZMatch && ptkVAMatch ? "Matched Impedance Sharing" : "Unbalanced Impedance Sharing"}
                </text>
                <text x="210" y="120" className="sld-text fill-slate-500" style={{ fontSize: '11px' }} textAnchor="end">
                  Tx1: {baseKVA} kVA ({iscParams?.transformerZ || 5}%) | Tx2+: {pt2Rating} kVA ({iscParams?.parallelTransformersZ || 5}%)
                </text>
              </>
            ) : (
              <>
                <path d="M 230,80 L 270,100 L 230,120 Z" className="sld-line" fill="none" strokeWidth="2" />
                <text x="215" y="75" className="sld-text font-bold" textAnchor="end">POWER TRANSFORMER</text>
                <text x="215" y="95" className="sld-text font-semibold" textAnchor="end">{baseKVA} kVA, {voltage}V, {phaseText}</text>
                <text x="215" y="115" className="sld-text text-slate-500" textAnchor="end">60Hz Utility Power</text>
              </>
            )}
          </>
        );
      })()}

      {/* Top Feed Wire */}
      <line x1="270" y1="100" x2="400" y2="100" className="sld-line" />
      {isSubPanel ? (
        panel.transferSwitchType && panel.transferSwitchType !== "None" ? (
          <g>
            <line x1="400" y1="100" x2="400" y2="150" className="sld-line" />
            <rect x="385" y="150" width="30" height="20" rx="2" className="sld-line" fill="none" />
            <text x="400" y="163" className="sld-text" style={{fontSize: '10px'}} textAnchor="middle">{panel.transferSwitchType}</text>
            <line x1="400" y1="170" x2="400" y2="180" className="sld-line" />
            
            {/* Gen input */}
            <line x1="365" y1="160" x2="385" y2="160" className="sld-line" />
            <circle cx="355" cy="160" r="10" className="sld-line" fill="none" />
            <text x="355" y="164" className="sld-text" style={{fontSize: '10px'}} textAnchor="middle">G</text>
            
            {/* ATS/MTS Label */}
            <text x="340" y="155" className="sld-text" style={{fontSize: '10px'}} textAnchor="end">
              {panel.transferSwitchRating || (() => {
                 const STANDARD_TS_RATINGS = [30, 40, 50, 60, 70, 80, 90, 100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000, 5000];
                 return STANDARD_TS_RATINGS.find(r => r >= mainFeeder.cb) || mainFeeder.cb;
              })()} A, {panel.transferSwitchPoles || (panel.system.includes("3PH") ? 3 : 2)}P
            </text>
            <text x="340" y="167" className="sld-text" style={{fontSize: '9px'}} textAnchor="end">
              {panel.transferSwitchType === "ATS" ? "AUTOMATIC" : "MANUAL"} TRANSFER SW
            </text>
          </g>
        ) : (
          <line x1="400" y1="100" x2="400" y2="180" className="sld-line" />
        )
      ) : (
         <line x1="400" y1="100" x2="400" y2="120" className="sld-line" />
      )}
      
      {/* Feed Text with Series/Parallel and runs details */}
      <text x="410" y="65" className="sld-text">
         {iscParams?.connectionType === 'Parallel' && (mainFeeder.wire.runs || 1) > 1 ? (
           <tspan x="410" dy="0" className="fill-emerald-600 font-black text-xxs tracking-wider">[PARALLEL FEEDER CONNECTION]</tspan>
         ) : (
           <tspan x="410" dy="0" className="fill-slate-400 font-bold text-xxs tracking-wider">[SERIES FEEDER CONNECTION]</tspan>
         )}
         <tspan x="410" dy="18">
           {getConductorLabel(
             mainFeeder.wire.size,
             mainFeeder.groundSize,
             mainFeeder.poles,
             mainFeeder.wire.runs,
             panel.insulationType || "THHN"
           )} {panel.conductorMaterial === 'Aluminum' ? '(AL)' : '(CU)'}
         </tspan>
         <tspan x="410" dy="20">
           IN {mainFeeder.conduitSize.toUpperCase()}Ø {(mainFeeder.conduitType || "PVC").toUpperCase()} CONDUIT
         </tspan>
      </text>

      {/* Meter */}
      {!isSubPanel && (
        <>
          <circle cx="400" cy="135" r="15" className="sld-line" />
          <text x="400" y="140" className="sld-text" textAnchor="middle">M</text>
          {panel.transferSwitchType && panel.transferSwitchType !== "None" ? (
             <g>
               <line x1="400" y1="150" x2="400" y2="153" className="sld-line" />
               <rect x="385" y="153" width="30" height="18" rx="2" className="sld-line" fill="none" />
               <text x="400" y="165" className="sld-text" style={{fontSize: '9px'}} textAnchor="middle">{panel.transferSwitchType}</text>
               <line x1="400" y1="171" x2="400" y2="180" className="sld-line" />
               
               {/* Gen input */}
               <line x1="365" y1="162" x2="385" y2="162" className="sld-line" />
               <circle cx="355" cy="162" r="10" className="sld-line" fill="none" />
               <text x="355" y="166" className="sld-text" style={{fontSize: '10px'}} textAnchor="middle">G</text>
               
               {/* ATS/MTS Label */}
               <text x="340" y="157" className="sld-text" style={{fontSize: '9px'}} textAnchor="end">
                 {panel.transferSwitchRating || (() => {
                    const STANDARD_TS_RATINGS = [30, 40, 50, 60, 70, 80, 90, 100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000, 5000];
                    return STANDARD_TS_RATINGS.find(r => r >= mainFeeder.cb) || mainFeeder.cb;
                 })()} A, {panel.transferSwitchPoles || (panel.system.includes("3PH") ? 3 : 2)}P
               </text>
               <text x="340" y="167" className="sld-text" style={{fontSize: '8px'}} textAnchor="end">
                 {panel.transferSwitchType === "ATS" ? "AUTOMATIC" : "MANUAL"} TRANSFER SW
               </text>
             </g>
          ) : (
             <line x1="400" y1="150" x2="400" y2="180" className="sld-line" />
          )}
        </>
      )}

      {/* Main Breaker form */}
      <line x1="400" y1="180" x2="400" y2="195" className="sld-line" />
      <circle cx="400" cy="195" r="3" fill="#1e293b" />
      <path d="M 400,195 A 15 15 0 0 1 400,225" className="sld-line" strokeWidth="2.5" fill="none" />
      <circle cx="400" cy="225" r="3" fill="#1e293b" />
      <line x1="400" y1="225" x2="400" y2="260" className="sld-line" />
      
      {/* Main Breaker Text */}
      <text x="420" y="202" className="sld-text">
         <tspan x="420" dy="0">{mainFeeder.cb} AT / {mainFeeder.af} AF</tspan>
         <tspan x="420" dy="16">{mainFeeder.poles}P, {voltage}V, 60HZ</tspan>
      </text>

      {/* Panel Box */}
      <rect x="250" y={boxTop} width="300" height={boxBottom - boxTop} className="sld-line" />
      
      {/* Central Line inside Box */}
      <line x1="400" y1={boxTop} x2="400" y2={boxBottom} className="sld-line" />

      {/* Branches */}
      {panelRows.map((row, idx) => {
         const y = startY + idx * rowHeight;
         
         return (
           <g key={idx}>
              {row.left && (
                 <g>
                    {/* Left side connection point */}
                    <circle cx="400" cy={y} r="2" fill="#1e293b" />
                    <line x1="400" y1={y} x2="375" y2={y} className="sld-line" />
                    
                    {/* Circuit Breaker: NECA 11.002 */}
                    <circle cx="375" cy={y} r="3" fill="#1e293b" />
                    <path d={`M 375,${y} A 15 15 0 0 0 345,${y}`} className="sld-line" strokeWidth="2.5" fill="none" />
                    <circle cx="345" cy={y} r="3" fill="#1e293b" />
                    {row.left.description.toUpperCase() !== 'SPACE' && (
                      <text x="360" y={y - 18} className="sld-text" textAnchor="middle">{row.left.mcbAT} AT</text>
                    )}
                    
                    <line x1="345" y1={y} x2="295" y2={y} className="sld-line" />
                    
                    {/* Circuit Number Circle */}
                    <circle cx="280" cy={y} r="15" className="sld-line" fill="white" />
                    <text x="280" y={y + 5} className="sld-text" textAnchor="middle">{row.left.circuitNo}</text>
                    
                    <line x1="265" y1={y} x2="250" y2={y} className="sld-line" />
                    
                    {/* Arrow going OUT. Pointing Left. Tip is 190, Base is 210 */}
                    <line x1="250" y1={y} x2="210" y2={y} className="sld-line" />
                    
                    <polygon points={`190,${y} 210,${y - 10} 210,${y + 10}`} fill="#94a3b8" stroke="#1e293b" />
                    
                    <text x="180" y={(row.left.loadType === 'SUB' || row.left.loadType === 'SUBSUB') ? y - 8 : y - 6} className="sld-text" textAnchor="end">{row.left.description}</text>
                    {(row.left.loadType === 'SUB' || row.left.loadType === 'SUBSUB') && (
                      <text x="180" y={y + 12} className="sld-text-small text-slate-500" textAnchor="end" style={{ fontSize: '10px', fill: '#64748b' }}>
                        {getFeederText(row.left)}
                      </text>
                    )}
                 </g>
              )}
              {row.right && (
                 <g>
                    {/* Right side connection point */}
                    <circle cx="400" cy={y} r="2" fill="#1e293b" />
                    <line x1="400" y1={y} x2="425" y2={y} className="sld-line" />
                    
                    {/* Circuit Breaker: NECA 11.002 */}
                    <circle cx="425" cy={y} r="3" fill="#1e293b" />
                    <path d={`M 425,${y} A 15 15 0 0 1 455,${y}`} className="sld-line" strokeWidth="2.5" fill="none" />
                    <circle cx="455" cy={y} r="3" fill="#1e293b" />
                    {row.right.description.toUpperCase() !== 'SPACE' && (
                      <text x="440" y={y - 18} className="sld-text" textAnchor="middle">{row.right.mcbAT} AT</text>
                    )}
                    
                    <line x1="455" y1={y} x2="505" y2={y} className="sld-line" />
                    
                    {/* Circuit Number Circle */}
                    <circle cx="520" cy={y} r="15" className="sld-line" fill="white" />
                    <text x="520" y={y + 5} className="sld-text" textAnchor="middle">{row.right.circuitNo}</text>
                    
                    <line x1="535" y1={y} x2="550" y2={y} className="sld-line" />
                    
                    {/* Arrow going OUT. Pointing Right. Tip is 610, Base is 590 */}
                    <line x1="550" y1={y} x2="590" y2={y} className="sld-line" />
                    <polygon points={`610,${y} 590,${y - 10} 590,${y + 10}`} fill="#94a3b8" stroke="#1e293b" />
                    
                    <text x="620" y={(row.right.loadType === 'SUB' || row.right.loadType === 'SUBSUB') ? y - 8 : y - 6} className="sld-text" textAnchor="start">{row.right.description}</text>
                    {(row.right.loadType === 'SUB' || row.right.loadType === 'SUBSUB') && (
                      <text x="620" y={y + 12} className="sld-text-small text-slate-500" textAnchor="start" style={{ fontSize: '10px', fill: '#64748b' }}>
                        {getFeederText(row.right)}
                      </text>
                    )}
                 </g>
              )}
           </g>
         );
      })}

      {/* Ground Symbol Bottom Center outside Box */}
      <line x1="400" y1={boxBottom} x2="400" y2={boxBottom + 20} className="sld-line" />
      <line x1="370" y1={boxBottom + 20} x2="430" y2={boxBottom + 20} className="sld-line" />
      <line x1="380" y1={boxBottom + 28} x2="420" y2={boxBottom + 28} className="sld-line" />
      <line x1="390" y1={boxBottom + 36} x2="410" y2={boxBottom + 36} className="sld-line" />

    </g>
  );
};

export const SingleLineDiagram: React.FC<SingleLineDiagramProps> = (props) => {
  const numRows = props.panelRows.length;
  const startY = 320;
  const rowHeight = 60;
  const boxBottom = startY + numRows * rowHeight;
  const svgHeight = boxBottom + 100;
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
