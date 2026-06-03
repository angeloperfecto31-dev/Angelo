// SingleLineDiagram.tsx
import React from 'react';
import { Circuit, PanelConfig } from '../types';

interface SingleLineDiagramProps {
  panel: PanelConfig;
  mainFeeder: any;
  panelRows: any[];
  formatWireSize: (size: number) => number | string;
  isSubPanel?: boolean;
}

export const SingleLineDiagramContent: React.FC<SingleLineDiagramProps & { xOffset?: number; yOffset?: number }> = ({ panel, mainFeeder, panelRows, formatWireSize, isSubPanel, xOffset = 0, yOffset = 0 }) => {
  // SVG Dimensions Calculation
  const startY = 320;
  const rowHeight = 60;
  const numRows = panelRows.length;
  const boxTop = 260;
  const boxBottom = startY + numRows * rowHeight;
  
  const is3Phase = panel.system.includes('3PH');
  const voltage = panel.voltage;
  const phaseText = is3Phase ? `3-Φ` : `1-Φ`;
  
  const wireNumber = is3Phase ? (panel.system.includes('4W') ? 4 : 3) : 2; 

  return (
    <g transform={`translate(${xOffset}, ${yOffset})`}>
      {/* Source Symbol */}
      {isSubPanel ? (
        <>
          <circle cx="270" cy="100" r="5" fill="#1e293b" />
          <text x="250" y="95" className="sld-text" textAnchor="end">{voltage}V {phaseText}</text>
          <text x="250" y="115" className="sld-text" textAnchor="end">60Hz</text>
          <text x="250" y="75" className="sld-text" textAnchor="end">CONNECTED TO MDP</text>
        </>
      ) : (
        <>
          <path d="M 230,80 L 270,100 L 230,120 Z" className="sld-line" fill="none" />
          <text x="215" y="95" className="sld-text" textAnchor="end">{voltage}V {phaseText}</text>
          <text x="215" y="115" className="sld-text" textAnchor="end">60Hz</text>
        </>
      )}

      {/* Top Feed Wire */}
      <line x1="270" y1="100" x2="400" y2="100" className="sld-line" />
      {isSubPanel ? (
         <line x1="400" y1="100" x2="400" y2="180" className="sld-line" />
      ) : (
         <line x1="400" y1="100" x2="400" y2="120" className="sld-line" />
      )}
      
      {/* Feed Text */}
      <text x="410" y="70" className="sld-text">
         <tspan x="410" dy="0">{mainFeeder.wire.runs > 1 ? `${mainFeeder.wire.runs} SETS OF ` : ''}{wireNumber}-{formatWireSize(Number(mainFeeder.wire.size))}MM² THHN +</tspan>
         <tspan x="410" dy="20">1-{mainFeeder.groundSize}MM² THHN(G) IN</tspan>
         <tspan x="410" dy="20">{mainFeeder.wire.runs > 1 ? `${mainFeeder.wire.runs}-` : ''}{mainFeeder.conduitSize.toUpperCase()}Ø PVC CONDUIT</tspan>
      </text>

      {/* Meter */}
      {!isSubPanel && (
        <>
          <circle cx="400" cy="135" r="15" className="sld-line" />
          <text x="400" y="140" className="sld-text" textAnchor="middle">M</text>
          <line x1="400" y1="150" x2="400" y2="180" className="sld-line" />
        </>
      )}

      {/* Main Breaker form */}
      <path d="M 400,180 A 10 10 0 0 1 400 200" className="sld-line" />
      <line x1="400" y1="200" x2="400" y2="260" className="sld-line" />
      
      {/* Main Breaker Text */}
      <text x="420" y="195" className="sld-text">
         <tspan x="420" dy="0">{mainFeeder.cb}AT/{mainFeeder.af}AF</tspan>
         <tspan x="420" dy="20">{mainFeeder.poles}P, {voltage}V, 60HZ</tspan>
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
                    <line x1="400" y1={y} x2="360" y2={y} className="sld-line" />
                    
                    {/* Circuit Breaker */}
                    <path d={`M 360,${y} A 10 10 0 0 0 340 ${y}`} className="sld-line" />
                    {row.left.description.toUpperCase() !== 'SPACE' && (
                      <text x="350" y={y - 12} className="sld-text" textAnchor="middle">{row.left.mcbAT}AT</text>
                    )}
                    
                    <line x1="340" y1={y} x2="295" y2={y} className="sld-line" />
                    
                    {/* Circuit Number Circle */}
                    <circle cx="280" cy={y} r="15" className="sld-line" fill="white" />
                    <text x="280" y={y + 5} className="sld-text" textAnchor="middle">{row.left.circuitNo}</text>
                    
                    <line x1="265" y1={y} x2="250" y2={y} className="sld-line" />
                    
                    {/* Arrow going OUT. Pointing Left. Tip is 190, Base is 210 */}
                    <line x1="250" y1={y} x2="210" y2={y} className="sld-line" />
                    
                    <polygon points={`190,${y} 210,${y - 10} 210,${y + 10}`} fill="#94a3b8" stroke="#1e293b" />
                    <text x="180" y={y - 6} className="sld-text" textAnchor="end">{row.left.description}</text>
                 </g>
              )}
              {row.right && (
                 <g>
                    {/* Right side connection point */}
                    <circle cx="400" cy={y} r="2" fill="#1e293b" />
                    <line x1="400" y1={y} x2="440" y2={y} className="sld-line" />
                    
                    {/* Circuit Breaker */}
                    <path d={`M 440,${y} A 10 10 0 0 1 460 ${y}`} className="sld-line" />
                    {row.right.description.toUpperCase() !== 'SPACE' && (
                      <text x="450" y={y - 12} className="sld-text" textAnchor="middle">{row.right.mcbAT}AT</text>
                    )}
                    
                    <line x1="460" y1={y} x2="505" y2={y} className="sld-line" />
                    
                    {/* Circuit Number Circle */}
                    <circle cx="520" cy={y} r="15" className="sld-line" fill="white" />
                    <text x="520" y={y + 5} className="sld-text" textAnchor="middle">{row.right.circuitNo}</text>
                    
                    <line x1="535" y1={y} x2="550" y2={y} className="sld-line" />
                    
                    {/* Arrow going OUT. Pointing Right. Tip is 610, Base is 590 */}
                    <line x1="550" y1={y} x2="590" y2={y} className="sld-line" />
                    <polygon points={`610,${y} 590,${y - 10} 590,${y + 10}`} fill="#94a3b8" stroke="#1e293b" />
                    <text x="620" y={y - 6} className="sld-text" textAnchor="start">{row.right.description}</text>
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
    <div className="w-full flex justify-center bg-white border-2 border-slate-800 p-8">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="max-w-full font-sans text-slate-800"
        style={{ width: '100%', height: 'auto', maxWidth: '800px' }}
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
  );
};
