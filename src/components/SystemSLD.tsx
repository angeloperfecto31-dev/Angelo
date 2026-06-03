import React, { useMemo, useState } from 'react';
import { PanelConfig, Circuit } from '../types';
import { computePanelScheduleValues } from '../utils/computeEngine';
import { SingleLineDiagramContent } from './SingleLineDiagram';
import { toPng } from 'html-to-image';
import { Printer, Download, AlertCircle } from 'lucide-react';

interface SubPanelData {
  id: string;
  panel: PanelConfig;
  circuits: Circuit[];
}

interface SystemSLDProps {
  panel: PanelConfig;
  circuits: Circuit[];
  subPanels: SubPanelData[];
}

const getPanelRows = (panelCircuits: Circuit[], panelSystem: string) => {
  const maxCircuitNo = Math.max(...panelCircuits.map(c => c.circuitNo), 0);
  const rows = [];
  const pLabels = panelSystem.includes('3PH') ? ['L1', 'L2', 'L3'] : ['L1', 'L2'];

  for (let i = 1; i <= Math.max(maxCircuitNo, 2); i += 2) {
    rows.push({
      index: i,
      label: pLabels[((i - 1) / 2) % pLabels.length],
      left: panelCircuits.find(c => c.circuitNo === i),
      right: panelCircuits.find(c => c.circuitNo === i + 1)
    });
  }
  return rows;
};

export default function SystemSLD({ panel, circuits, subPanels }: SystemSLDProps) {
  const formatWireSize = (size: number | string) => size;

  const [isExporting, setIsExporting] = useState(false);
  const [showPrintWarning, setShowPrintWarning] = useState(false);

  const mdpData = useMemo(() => computePanelScheduleValues(panel, circuits), [panel, circuits]);
  const mdpRows = useMemo(() => getPanelRows(circuits, panel.system), [circuits, panel.system]);

  const mdpHeight = 320 + mdpRows.length * 60 + 100;
  
  const spLayouts = useMemo(() => {
    return subPanels.map((sp, idx) => {
      const spData = computePanelScheduleValues(sp.panel, sp.circuits);
      const spRows = getPanelRows(sp.circuits, sp.panel.system);
      const spHeight = 320 + spRows.length * 60 + 100;
      
      const feederIndex = circuits.findIndex(c => c.linkedSubPanelId === sp.id || c.description === sp.panel.designation);
      const feedingCircuit = feederIndex >= 0 ? circuits[feederIndex] : null;
      
      let rowIndex = 0;
      let isLeft = true;
      if (feedingCircuit) {
        rowIndex = mdpRows.findIndex(r => r.left?.id === feedingCircuit.id || r.right?.id === feedingCircuit.id);
        isLeft = mdpRows[rowIndex]?.left?.id === feedingCircuit.id;
      }

      return {
        sp,
        spData,
        spRows,
        spHeight,
        feedingCircuit,
        rowIndex: rowIndex >= 0 ? rowIndex : 0,
        isLeft,
        idx
      };
    });
  }, [subPanels, circuits, mdpRows]);

  const maxSpHeight = spLayouts.length > 0 ? Math.max(...spLayouts.map(s => s.spHeight)) : 0;
  
  const SpYOffset = mdpHeight + 150;
  const svgHeight = SpYOffset + maxSpHeight + 50;
  
  const spSpacing = 800;
  const svgWidth = Math.max(1000, 400 + Math.max(1, subPanels.length) * spSpacing);
  const MdpXOffset = (svgWidth - 800) / 2;

  let leftDrops = 0;
  let rightDrops = 0;

  const handlePrint = () => {
    const isIframe = window.self !== window.top;
    try {
      window.print();
    } catch (err) {
      console.error('Print trigger failed:', err);
    }
    if (isIframe) {
      setShowPrintWarning(true);
    }
  };

  const handleDownloadPNG = async () => {
    const el = document.getElementById('sld-system-wide');
    if (!el) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(el, {
        quality: 1.0,
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        width: svgWidth,
        height: svgHeight,
      });
      const link = document.createElement('a');
      link.download = `${panel.project ? panel.project.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Project'}_System_SLD.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('PNG Export failed:', err);
      // fallback warning in UI
      setShowPrintWarning(true);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadPDF = async () => {
    const el = document.getElementById('sld-system-wide');
    if (!el) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(el, {
        quality: 1.0,
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        width: svgWidth,
        height: svgHeight,
      });
      
      const { jsPDF } = await import('jspdf');
      const orientation = svgWidth > svgHeight ? 'l' : 'p';
      const pdf = new jsPDF({
        orientation,
        unit: 'px',
        format: [svgWidth + 40, svgHeight + 40]
      });
      pdf.addImage(dataUrl, 'PNG', 20, 20, svgWidth, svgHeight);
      pdf.save(`${panel.project ? panel.project.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Project'}_System_SLD.pdf`);
    } catch (err) {
      console.error('PDF Export failed:', err);
      setShowPrintWarning(true);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-8 panel-container overflow-hidden">
      <div className="flex flex-col xl:flex-row xl:justify-between items-start xl:items-center mb-10 gap-4">
         <div>
            <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-3 tracking-tight">
               SYSTEM SINGLE LINE DIAGRAM
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mt-1 max-w-2xl text-sm leading-relaxed">
               Complete system distribution showing MDP fully expanded, interconnected directly with detailed Sub-Panels.
            </p>
         </div>
         <div className="flex flex-wrap items-center gap-2 no-print w-full xl:w-auto">
            <button 
              onClick={handlePrint}
              disabled={isExporting}
              className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              <span>Print SLD</span>
            </button>
            <button 
              onClick={handleDownloadPDF}
              disabled={isExporting}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{isExporting ? 'Exporting...' : 'Download PDF'}</span>
            </button>
            <button 
              onClick={handleDownloadPNG}
              disabled={isExporting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>Download PNG</span>
            </button>
         </div>
      </div>

      {showPrintWarning && (
        <div className="mb-6 p-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-xs sm:text-sm font-medium flex gap-3 animate-fade-in no-print">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Did the print dialog not open?</p>
            <p>
              Browsers block print calls called inside sandboxed iframe previews. Please use the <span className="font-bold">Download PDF</span> or <span className="font-bold">Download PNG</span> buttons above for offline-ready high-res single-view assets, or click "Open in developmental tab" to use native browser menu printing.
            </p>
          </div>
        </div>
      )}

      <div className="w-full flex justify-center bg-white border-2 border-slate-800 p-8 overflow-x-auto print-scaling">
        <svg id={`sld-system-wide`} viewBox={`0 0 ${svgWidth} ${svgHeight}`} width={svgWidth} height={svgHeight} className="max-w-full font-sans text-slate-800 print-svg">
          <defs>
            <style>
               {`
                 .sld-line { fill: none; stroke: #1e293b; stroke-width: 1.5; }
                 .sld-thick { fill: none; stroke: #ea580c; stroke-width: 3; stroke-dasharray: 6 4; }
                 .sld-text { fill: #1e293b; font-size: 14px; font-weight: bold; }
                 .sld-text-small { fill: #1e293b; font-size: 12px; }
                 .sld-label-blue { fill: #0284c7; font-size: 11px; font-weight: bold; }
               `}
            </style>
          </defs>

          {/* MAIN DISTRIBUTION PANEL */}
          <g>
            <text x={MdpXOffset + 400} y={30} textAnchor="middle" className="sld-text" style={{ fontSize: '18px' }}>
               MAIN DISTRIBUTION PANEL ({panel.designation || 'MDP'})
            </text>
            <SingleLineDiagramContent
              panel={panel}
              mainFeeder={mdpData.mainFeeder}
              panelRows={mdpRows}
              formatWireSize={formatWireSize}
              isSubPanel={false}
              xOffset={MdpXOffset}
              yOffset={50}
            />
          </g>

          {/* SUB PANELS & ROUTING LINES */}
          {spLayouts.map((layout, i) => {
            const SpXOffset = (svgWidth - subPanels.length * spSpacing) / 2 + i * spSpacing;
            
            // Routing Math
            const y1 = 50 + 320 + layout.rowIndex * 60;
            const x1 = MdpXOffset + (layout.isLeft ? 180 : 620); // 180 is left arrow tip, 620 is right arrow tip
            
            let dropX;
            if (layout.isLeft) {
               leftDrops++;
               dropX = MdpXOffset + 150 - (leftDrops * 20); // stepping outward securely
            } else {
               rightDrops++;
               dropX = MdpXOffset + 650 + (rightDrops * 20);
            }
            
            const routingY = SpYOffset; // Enter SP from top
            
            // Sub panel top source connection point
            const spFeedX = SpXOffset + 270;
            const spFeedY = SpYOffset + 100;
            
            // Calculate turning points
            let path = `M ${x1},${y1}`; // start at branch tip
            
            if (layout.isLeft) {
              path += ` L ${dropX},${y1}`;
              path += ` L ${dropX},${routingY - 40}`; // drop down safely below MDP
              path += ` L ${spFeedX - 20},${routingY - 40}`; // traverse horizontally to align with SP input
              path += ` L ${spFeedX - 20},${spFeedY}`; // down to SP input
              path += ` L ${spFeedX},${spFeedY}`; // right into the SP input
            } else {
              path += ` L ${dropX},${y1}`;
              path += ` L ${dropX},${routingY - 60 + (i * 10)}`; // staggered horizontal routing Y
              path += ` L ${spFeedX - 20},${routingY - 60 + (i * 10)}`;
              path += ` L ${spFeedX - 20},${spFeedY}`;
              path += ` L ${spFeedX},${spFeedY}`;
            }

            return (
              <g key={layout.sp.id}>
                {/* Routing Line connects MDP branch to SP feed */}
                <path d={path} className="sld-thick" />
                
                {/* Sub Panel Feeder Details Text Box overlaid on routing line */}
                <rect x={spFeedX - 30} y={spFeedY - 65} width="60" height="20" fill="white" />
                <text x={spFeedX} y={spFeedY - 50} textAnchor="middle" className="sld-label-blue">
                   FEED TO {layout.sp.panel.designation || `SP-${i+1}`}
                </text>

                {/* Sub Panel Fully Expanded Rendering */}
                <text x={SpXOffset + 400} y={SpYOffset + 30} textAnchor="middle" className="sld-text" style={{ fontSize: '18px' }}>
                   SUB-PANEL: {layout.sp.panel.designation || `SP-${i+1}`}
                </text>
                <SingleLineDiagramContent
                  panel={layout.sp.panel}
                  mainFeeder={layout.spData.mainFeeder}
                  panelRows={layout.spRows}
                  formatWireSize={formatWireSize}
                  isSubPanel={true}
                  xOffset={SpXOffset}
                  yOffset={SpYOffset + 50}
                />
              </g>
            );
          })}

        </svg>
      </div>
    </div>
  );
}


