import React, { useMemo, useState, useRef, useEffect } from "react";
import { PanelConfig, Circuit, LoadType, VoltageDropCalculation } from "../types";
import { computePanelScheduleValues } from "../utils/computeEngine";
import { SingleLineDiagramContent } from "./SingleLineDiagram";
import { toPng } from "html-to-image";
import { Printer, Download, AlertCircle, Layers, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw, X, Info } from "lucide-react";
import { exportToCAD } from "../utils/exportDxf";

interface SubPanelData {
  id: string;
  panel: PanelConfig;
  circuits: Circuit[];
}

interface SystemSLDProps {
  panel: PanelConfig;
  circuits: Circuit[];
  subPanels: SubPanelData[];
  subSubPanels?: SubPanelData[];
  iscParams?: any;
  isPremium?: boolean;
  onRequestUpgrade?: () => void;
  vdCalculations?: VoltageDropCalculation[];
}

const getPanelRows = (panelCircuits: Circuit[], panelSystem: string) => {
  const maxCircuitNo = Math.max(...panelCircuits.map((c) => c.circuitNo), 0);
  const rows = [];
  const pLabels = panelSystem.includes("3PH")
    ? ["L1", "L2", "L3"]
    : ["L1", "L2"];

  for (let i = 1; i <= Math.max(maxCircuitNo, 2); i += 2) {
    rows.push({
      index: i,
      label: pLabels[((i - 1) / 2) % pLabels.length],
      left: panelCircuits.find((c) => c.circuitNo === i),
      right: panelCircuits.find((c) => c.circuitNo === i + 1),
    });
  }
  return rows;
};

export default function SystemSLD({
  panel,
  circuits,
  subPanels,
  subSubPanels,
  iscParams,
  isPremium = true,
  onRequestUpgrade,
  vdCalculations,
}: SystemSLDProps) {
  const formatWireSize = (size: number | string) => size;

  const [isExporting, setIsExporting] = useState(false);
  const [showPrintWarning, setShowPrintWarning] = useState(false);

  // Panning and Zooming State for Maximize/Full-Screen Feature
  const [isMaximized, setIsMaximized] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);

  const fitToScreen = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = (rect.width - 64) / svgWidth;
    const scaleY = (rect.height - 64) / svgHeight;
    const newZoom = Math.min(scaleX, scaleY, 1.2);
    setZoom(Math.max(0.15, newZoom));
    setPan({ x: 0, y: 0 });
  };

  useEffect(() => {
    if (isMaximized) {
      const timer = setTimeout(() => {
        fitToScreen();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isMaximized]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("select")) {
      return;
    }
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleMouseLeave = () => {
    isDragging.current = false;
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("select")) {
      return;
    }
    if (e.touches.length === 1) {
      isDragging.current = true;
      dragStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging.current || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - dragStart.current.x;
    const dy = e.touches[0].clientY - dragStart.current.y;
    setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    dragStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = () => {
    isDragging.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const zoomFactor = 0.05;
    const delta = -e.deltaY;
    setZoom((z) => {
      let raw = z + (delta > 0 ? zoomFactor : -zoomFactor);
      return Math.min(10, Math.max(0.1, raw));
    });
  };

  const zoomIn = () => {
    setZoom((z) => Math.min(10, z + 0.1));
  };

  const zoomOut = () => {
    setZoom((z) => Math.max(0.1, z - 0.1));
  };

  const mdpData = useMemo(
    () => computePanelScheduleValues(panel, circuits, { vdCalculations, panelId: "main" }),
    [panel, circuits, vdCalculations],
  );
  const mdpRows = useMemo(
    () => getPanelRows(circuits, panel.system),
    [circuits, panel.system],
  );

  const mdpHeight = 320 + mdpRows.length * 60 + 100;

  const spLayouts = useMemo(() => {
    const rawAllSubPanels = [...subPanels, ...(subSubPanels || [])];
    const seen = new Set();
    const allSubPanels = rawAllSubPanels.filter((sp) => {
      if (!sp || !sp.id) return false;
      if (seen.has(sp.id)) return false;
      seen.add(sp.id);
      return true;
    });
    return allSubPanels.map((sp, idx) => {
      const spData = computePanelScheduleValues(sp.panel, sp.circuits, { vdCalculations, panelId: sp.id });
      const spRows = getPanelRows(sp.circuits, sp.panel.system);
      const spHeight = 320 + spRows.length * 60 + 100;

      let parentId: "mdp" | string = "mdp";
      let feedingCircuit: Circuit | null = null;
      let rowIndex = 0;
      let isLeft = true;

      // Check if fed from MDP
      let mdpFeederIndex = circuits.findIndex(
        (c) =>
          c.linkedSubPanelId === sp.id ||
          (sp.panel.designation && c.description === sp.panel.designation),
      );

      // Positional fallback: map idx-th subpanel to idx-th circuit of type SUB_PANEL
      if (mdpFeederIndex < 0) {
        const mdpSubCircuits = circuits.filter(
          (c) => c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL,
        );
        if (mdpSubCircuits.length > idx) {
          const matchingCircuit = mdpSubCircuits[idx];
          mdpFeederIndex = circuits.findIndex(
            (c) => c.id === matchingCircuit.id,
          );
        }
      }

      if (mdpFeederIndex >= 0) {
        feedingCircuit = circuits[mdpFeederIndex];
        parentId = "mdp";
        rowIndex = mdpRows.findIndex(
          (r) =>
            r.left?.id === feedingCircuit!.id ||
            r.right?.id === feedingCircuit!.id,
        );
        isLeft =
          rowIndex >= 0
            ? mdpRows[rowIndex]?.left?.id === feedingCircuit!.id
            : true;
      } else {
        // Check if fed from another subpanel (or sub-sub panel)
        for (const otherSp of allSubPanels) {
          const spFeederIndex = otherSp.circuits.findIndex(
            (c) =>
              c.linkedSubPanelId === sp.id ||
              (sp.panel.designation && c.description === sp.panel.designation),
          );
          if (spFeederIndex >= 0) {
            feedingCircuit = otherSp.circuits[spFeederIndex];
            parentId = otherSp.id;

            const pRows = getPanelRows(otherSp.circuits, otherSp.panel.system);
            rowIndex = pRows.findIndex(
              (r) =>
                r.left?.id === feedingCircuit!.id ||
                r.right?.id === feedingCircuit!.id,
            );
            break;
          }
        }
      }

      return {
        sp,
        spData,
        spRows,
        spHeight,
        parentId,
        feedingCircuit,
        rowIndex: rowIndex >= 0 ? rowIndex : 0,
        tempIsLeft: isLeft,
        idx,
      };
    });
  }, [subPanels, subSubPanels, circuits, mdpRows, vdCalculations]);

  const resolvedLayouts = useMemo(() => {
    const layoutMap = new Map(spLayouts.map((l) => [l.sp.id, l]));

    const resolveIsLeft = (id: string): boolean => {
      const layout = layoutMap.get(id);
      if (!layout) return true;
      if (layout.parentId === "mdp") {
        return layout.tempIsLeft;
      }
      return resolveIsLeft(layout.parentId);
    };

    return spLayouts.map((layout) => {
      const isLeft = resolveIsLeft(layout.sp.id);
      return {
        ...layout,
        isLeft,
      };
    });
  }, [spLayouts]);

  // Separate Sub-Panels (Level 2) vs Sub-Sub Panels (Level 3)
  const level2Layouts = useMemo(() => {
    return resolvedLayouts.filter(
      (l) => l.parentId === "mdp" || !resolvedLayouts.some((other) => other.sp.id === l.parentId)
    );
  }, [resolvedLayouts]);

  const level3Layouts = useMemo(() => {
    return resolvedLayouts.filter(
      (l) => l.parentId !== "mdp" && resolvedLayouts.some((other) => other.sp.id === l.parentId)
    );
  }, [resolvedLayouts]);

  const leftLevel2 = useMemo(() => level2Layouts.filter((l) => l.isLeft), [level2Layouts]);
  const rightLevel2 = useMemo(() => level2Layouts.filter((l) => !l.isLeft), [level2Layouts]);

  // Width of a panel's horizontal slot space to avoid overlaps
  const W_COLUMN = 950;
  const borderSpace = 50;

  const leftPositions = useMemo(() => {
    const positions = new Map<string, { x: number; childrenX: Map<string, number> }>();
    let currentLeftX = 50;

    leftLevel2.forEach((l2) => {
      const children = level3Layouts.filter((l3) => l3.parentId === l2.sp.id);
      const numChildren = children.length;
      const colWidth = Math.max(1, numChildren) * W_COLUMN;

      // Center the Level 2 panel in its allocated column range
      const l2X = currentLeftX + colWidth / 2 - 400;

      const childMap = new Map<string, number>();
      children.forEach((l3, childIdx) => {
        const l3X = currentLeftX + childIdx * W_COLUMN + W_COLUMN / 2 - 400;
        childMap.set(l3.sp.id, l3X);
      });

      positions.set(l2.sp.id, { x: l2X, childrenX: childMap });
      currentLeftX += colWidth + borderSpace;
    });

    return {
      positions,
      endX: currentLeftX,
    };
  }, [leftLevel2, level3Layouts]);

  const MdpXOffset = useMemo(() => {
    return leftPositions.endX + 100;
  }, [leftPositions]);

  const rightPositions = useMemo(() => {
    const positions = new Map<string, { x: number; childrenX: Map<string, number> }>();
    let currentRightX = MdpXOffset + 800 + 100;

    rightLevel2.forEach((l2) => {
      const children = level3Layouts.filter((l3) => l3.parentId === l2.sp.id);
      const numChildren = children.length;
      const colWidth = Math.max(1, numChildren) * W_COLUMN;

      // Center the Level 2 panel in its allocated column range
      const l2X = currentRightX + colWidth / 2 - 400;

      const childMap = new Map<string, number>();
      children.forEach((l3, childIdx) => {
        const l3X = currentRightX + childIdx * W_COLUMN + W_COLUMN / 2 - 400;
        childMap.set(l3.sp.id, l3X);
      });

      positions.set(l2.sp.id, { x: l2X, childrenX: childMap });
      currentRightX += colWidth + borderSpace;
    });

    return {
      positions,
      endX: currentRightX,
    };
  }, [rightLevel2, level3Layouts, MdpXOffset]);

  const svgWidth = useMemo(() => {
    if (leftLevel2.length === 0 && rightLevel2.length === 0) {
      return 1200;
    }
    return rightPositions.endX + 50;
  }, [leftLevel2, rightLevel2, rightPositions]);

  const maxLevel2Height = useMemo(() => {
    return level2Layouts.length > 0 ? Math.max(...level2Layouts.map((l) => l.spHeight)) : 0;
  }, [level2Layouts]);

  const maxLevel3Height = useMemo(() => {
    return level3Layouts.length > 0 ? Math.max(...level3Layouts.map((l) => l.spHeight)) : 0;
  }, [level3Layouts]);

  // SpYOffset is where Level 2 Sub-Panels start vertically
  const SpYOffset = mdpHeight + 200;
  // SspYOffset is where Level 3 Sub-Sub Panels start vertically
  const SspYOffset = SpYOffset + maxLevel2Height + 200;

  const svgHeight = useMemo(() => {
    if (level3Layouts.length > 0) {
      return SspYOffset + maxLevel3Height + 100;
    }
    if (level2Layouts.length > 0) {
      return SpYOffset + maxLevel2Height + 100;
    }
    return mdpHeight + 100;
  }, [level2Layouts, level3Layouts, mdpHeight, maxLevel2Height, maxLevel3Height, SpYOffset, SspYOffset]);

  const handlePrint = () => {
    const isIframe = window.self !== window.top;
    try {
      window.print();
    } catch (err) {
      console.error("Print trigger failed:", err);
    }
    if (isIframe) {
      setShowPrintWarning(true);
    }
  };

  const handleDownloadPNG = async () => {
    const el = document.getElementById("sld-system-wide");
    if (!el) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(el, {
        quality: 1.0,
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        width: svgWidth,
        height: svgHeight,
      });
      const link = document.createElement("a");
      link.download = `${panel.project ? panel.project.replace(/[^a-zA-Z0-9_-]/g, "_") : "Project"}_System_SLD.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("PNG Export failed:", err);
      setShowPrintWarning(true);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadPDF = async () => {
    const el = document.getElementById("sld-system-wide");
    if (!el) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(el, {
        quality: 1.0,
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        width: svgWidth,
        height: svgHeight,
      });

      const { jsPDF } = await import("jspdf");
      const orientation = svgWidth > svgHeight ? "l" : "p";
      const pdf = new jsPDF({
        orientation,
        unit: "px",
        format: [svgWidth + 40, svgHeight + 40],
      });
      pdf.addImage(dataUrl, "PNG", 20, 20, svgWidth, svgHeight);
      pdf.save(
        `${panel.project ? panel.project.replace(/[^a-zA-Z0-9_-]/g, "_") : "Project"}_System_SLD.pdf`,
      );
    } catch (err) {
      console.error("PDF Export failed:", err);
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
            Complete system distribution showing MDP fully expanded,
            interconnected directly with detailed Sub-Panels and Sub-Sub Panels.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 no-print w-full xl:w-auto">
          <button
            onClick={() => {
              if (!isPremium) {
                if (onRequestUpgrade) onRequestUpgrade();
                return;
              }
              exportToCAD(
                panel,
                circuits,
                subPanels,
                iscParams || {
                  transformerKVA: 100,
                  transformerZ: 5,
                  transformerVoltage: panel.voltage || 230,
                  primaryVoltage: 34500,
                  transformerConnection: "Delta-Wye (Δ-Y)",
                  utilityShortCircuitMVA: 500,
                  feederLength: 10,
                  feederSize: "30",
                  feederRuns: 1,
                  conductorType: "Copper",
                },
                "ALL",
                [],                 // vdCalculations empty fallback
                undefined,          // illumParams empty fallback
                subSubPanels || []  // Sub-Sub Panels properly loaded!
              );
            }}
            disabled={isExporting}
            className={`px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 border ${
              isPremium
                ? "bg-sky-600 hover:bg-sky-700 text-white border-sky-600/50"
                : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700"
            }`}
            title={
              isPremium
                ? "Download editable DWG/DXF AutoCAD drawing block compliant with professional engineering standards"
                : "Export AutoCAD is available on the Premium Plan"
            }
          >
            <Layers className="w-4 h-4" />
            <span>
              {isPremium ? "Export CAD Drawing" : "Export AutoCAD (Premium)"}
            </span>
          </button>
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
            <span>{isExporting ? "Exporting..." : "Download PDF"}</span>
          </button>
          <button
            onClick={handleDownloadPNG}
            disabled={isExporting}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>Download PNG</span>
          </button>
          <button
            onClick={() => setIsMaximized(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-all flex items-center gap-2 cursor-pointer shrink-0"
            title="Open fully interactive maximized view with smooth panning, multi-level zoom, and visual auto-layout"
          >
            <Maximize2 className="w-4 h-4" />
            <span>Maximize View</span>
          </button>
        </div>
      </div>

      {showPrintWarning && (
        <div className="mb-6 p-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-xs sm:text-sm font-medium flex gap-3 animate-fade-in no-print">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Did the print dialog not open?</p>
            <p>
              Browsers block print calls called inside sandboxed iframe
              previews. Please use the{" "}
              <span className="font-bold">Download PDF</span> or{" "}
              <span className="font-bold">Download PNG</span> buttons above for
              offline-ready high-res single-view assets, or click "Open in
              developmental tab" to use native browser menu printing.
            </p>
          </div>
        </div>
      )}

      <div className="w-full bg-white border-2 border-slate-800 p-4 sm:p-8 overflow-x-auto print-scaling">
        <div style={{ minWidth: `${svgWidth}px` }} className="mx-auto flex justify-center">
        <svg
          id="sld-system-wide"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          width={svgWidth}
          height={svgHeight}
          className="font-sans text-slate-800 print-svg"
        >
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

          {/* LEVEL 1: MAIN DISTRIBUTION PANEL */}
          <g>
            <text
              x={MdpXOffset + 400}
              y={30}
              textAnchor="middle"
              className="sld-text"
              style={{ fontSize: "18px" }}
            >
              MAIN DISTRIBUTION PANEL ({panel.designation || "MDP"})
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

          {/* LEVEL 2: SUB PANELS & ROUTING LINES */}
          {level2Layouts.map((layout, i) => {
            const isLeft = layout.isLeft;
            const id = layout.sp.id;
            
            // Resolve custom bento visual xOffset to avoid any overlaps
            const pos = isLeft
              ? leftPositions.positions.get(id)
              : rightPositions.positions.get(id);
            const spXOffset = pos ? pos.x : 0;

            const y1 = 50 + 320 + layout.rowIndex * 60; // relative to MDP yOffset = 50
            const x1 = MdpXOffset + (isLeft ? 190 : 610);

            // Staggered non-overlapping vertical drop gutter
            let dropX = 0;
            if (isLeft) {
              dropX = MdpXOffset + 150 - (i + 1) * 20;
            } else {
              dropX = MdpXOffset + 650 + (i + 1) * 20;
            }

            // Staggered horizontal channels to prevent overlap
            const yChannel = SpYOffset - 75 + i * 12;
            const spFeedX = spXOffset + 270;
            const spFeedY = SpYOffset + 100;

            // Beautiful clean orthogonal layout line paths
            const pathY = y1 + 25;
            let path = `M ${x1},${y1}`;
            path += ` L ${x1},${pathY}`;
            path += ` L ${dropX},${pathY}`;
            path += ` L ${dropX},${yChannel}`;
            path += ` L ${spFeedX},${yChannel}`;
            path += ` L ${spFeedX},${spFeedY}`;

            return (
              <g key={id}>
                {/* Routing Line connects MDP branch to SP feed */}
                <path d={path} className="sld-thick" />

                {/* Sub Panel Feeder Details Text Box overlaid on routing line */}
                <rect
                  x={spFeedX - 62.5}
                  y={spFeedY - 90}
                  width="125"
                  height="20"
                  fill="white"
                  stroke="#0284c7"
                  strokeWidth="0.5"
                  rx="3"
                />
                <text
                  x={spFeedX}
                  y={spFeedY - 76}
                  textAnchor="middle"
                  className="sld-label-blue"
                >
                  FEED TO {layout.sp.panel.designation || `SP-${i + 1}`}
                </text>

                {/* Sub Panel Fully Expanded Rendering */}
                <text
                  x={spXOffset + 400}
                  y={SpYOffset + 30}
                  textAnchor="middle"
                  className="sld-text"
                  style={{ fontSize: "18px" }}
                >
                  SUB-PANEL: {layout.sp.panel.designation || `SP-${i + 1}`}
                </text>
                <SingleLineDiagramContent
                  panel={layout.sp.panel}
                  mainFeeder={layout.spData.mainFeeder}
                  panelRows={layout.spRows}
                  formatWireSize={formatWireSize}
                  isSubPanel={true}
                  xOffset={spXOffset}
                  yOffset={SpYOffset + 50}
                />
              </g>
            );
          })}

          {/* LEVEL 3: SUB-SUB PANELS & ROUTING LINES */}
          {level3Layouts.map((layout, i) => {
            const isLeft = layout.isLeft;
            const id = layout.sp.id;
            const parentId = layout.parentId;

            // Find parent panel details
            const parentLayout = level2Layouts.find((l) => l.sp.id === parentId);
            if (!parentLayout) return null;

            const parentPos = isLeft
              ? leftPositions.positions.get(parentId)
              : rightPositions.positions.get(parentId);
            if (!parentPos) return null;

            // Align child SSP directly underneath the parent SP's column space
            const sspXOffset = parentPos.childrenX.get(id) || 0;
            const parentXOffset = parentPos.x;

            const y1 = SpYOffset + 50 + 320 + layout.rowIndex * 60; // relative to parent yOffset = SpYOffset + 50
            const x1 = parentXOffset + (isLeft ? 190 : 610);

            // Staggered drop column for Sub-Sub Panels
            let dropX = 0;
            if (isLeft) {
              dropX = parentXOffset + 150 - (i + 1) * 20;
            } else {
              dropX = parentXOffset + 650 + (i + 1) * 20;
            }

            // Staggered horizontal channels
            const yChannel = SspYOffset - 75 + i * 12;
            const sspFeedX = sspXOffset + 270;
            const sspFeedY = SspYOffset + 100;

            const pathY = y1 + 25;
            let path = `M ${x1},${y1}`;
            path += ` L ${x1},${pathY}`;
            path += ` L ${dropX},${pathY}`;
            path += ` L ${dropX},${yChannel}`;
            path += ` L ${sspFeedX},${yChannel}`;
            path += ` L ${sspFeedX},${sspFeedY}`;

            return (
              <g key={id}>
                {/* Routing Line connects SP branch to SSP feed */}
                <path d={path} className="sld-thick" />

                {/* Sub-Sub Panel Feeder Details Text Box overlaid on routing line */}
                <rect
                  x={sspFeedX - 62.5}
                  y={sspFeedY - 90}
                  width="125"
                  height="20"
                  fill="white"
                  stroke="#0284c7"
                  strokeWidth="0.5"
                  rx="3"
                />
                <text
                  x={sspFeedX}
                  y={sspFeedY - 76}
                  textAnchor="middle"
                  className="sld-label-blue"
                >
                  FEED TO {layout.sp.panel.designation || `SSP-${i + 1}`}
                </text>

                {/* Sub-Sub Panel Fully Expanded Rendering */}
                <text
                  x={sspXOffset + 400}
                  y={SspYOffset + 30}
                  textAnchor="middle"
                  className="sld-text"
                  style={{ fontSize: "18px" }}
                >
                  SUB-SUB PANEL: {layout.sp.panel.designation || `SSP-${i + 1}`}
                </text>
                <SingleLineDiagramContent
                  panel={layout.sp.panel}
                  mainFeeder={layout.spData.mainFeeder}
                  panelRows={layout.spRows}
                  formatWireSize={formatWireSize}
                  isSubPanel={true}
                  xOffset={sspXOffset}
                  yOffset={SspYOffset + 50}
                />
              </g>
            );
          })}
        </svg>
        </div>
      </div>

      {/* INTERACTIVE FULL-SCREEN CAD WORKSPACE / MODAL VIEW */}
      {isMaximized && (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col select-none animate-fade-in no-print">
          {/* Top Panel Brand & Engineering Metadata Info Bar */}
          <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-500/10 text-emerald-400 p-2 rounded-lg border border-emerald-500/20">
                <Layers className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h4 className="text-sm sm:text-base font-black text-slate-100 tracking-tight flex items-center gap-2">
                  <span>SYSTEM SINGLE LINE DIAGRAM</span>
                  <span className="text-xxs uppercase tracking-widest px-2 py-0.5 bg-slate-800 text-slate-400 rounded-md border border-slate-700 font-normal animate-pulse">
                    Interactive Workspace
                  </span>
                </h4>
                <p className="text-xxs sm:text-xs text-slate-400">
                  Project: {panel.project || "Unnamed Project"} • Panel Board: {panel.designation || "MDP"} • Design Standard: PEC 2017
                </p>
              </div>
            </div>
            
            {/* Quick Export Actions, Zoom Stats & Exit controls */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  if (!isPremium) {
                    if (onRequestUpgrade) onRequestUpgrade();
                    return;
                  }
                  exportToCAD(
                    panel,
                    circuits,
                    subPanels,
                    iscParams || {
                      transformerKVA: 100,
                      transformerZ: 5,
                      transformerVoltage: panel.voltage || 230,
                      primaryVoltage: 34500,
                      transformerConnection: "Delta-Wye (Δ-Y)",
                      utilityShortCircuitMVA: 500,
                      feederLength: 10,
                      feederSize: "30",
                      feederRuns: 1,
                      conductorType: "Copper",
                    },
                    "ALL",
                    [],
                    undefined,
                    subSubPanels || []
                  );
                }}
                disabled={isExporting}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 border ${
                  isPremium
                    ? "bg-sky-600 hover:bg-sky-700 text-white border-sky-600/50"
                    : "bg-slate-850 text-slate-400 hover:bg-slate-750 border-slate-750"
                }`}
                title="Export complete DWG/DXF AutoCAD block matching PEC limits"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Export CAD</span>
              </button>
              
              <button
                onClick={handlePrint}
                disabled={isExporting}
                className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer border border-slate-700/50"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>
              
              <button
                onClick={handleDownloadPDF}
                disabled={isExporting}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>
              
              <button
                onClick={handleDownloadPNG}
                disabled={isExporting}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>PNG</span>
              </button>
              
              <div className="h-6 w-[1px] bg-slate-800 mx-1"></div>
              
              <button
                onClick={() => setIsMaximized(false)}
                className="bg-slate-850 hover:bg-rose-900/40 hover:text-rose-400 text-rose-300 border border-slate-700/80 p-1.5 rounded-lg shadow-md transition-all flex items-center justify-center cursor-pointer"
                title="Exit Full-Screen Workspace (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          {/* Infinite-Canvas Grid Viewport */}
          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="flex-1 relative overflow-hidden select-none cursor-grab active:cursor-grabbing outline-none"
            style={{
              backgroundColor: "#080c14",
              backgroundImage: "radial-gradient(#1e293b 1.5px, transparent 1.5px)",
              backgroundSize: "28px 28px"
            }}
          >
            {/* Ambient Lighting Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 via-transparent to-slate-950/20 pointer-events-none"></div>
            
            {/* Smooth-Pannable Schematic Sheet */}
            <div
              style={{
                width: `${svgWidth}px`,
                height: `${svgHeight}px`,
                marginLeft: `-${svgWidth / 2}px`,
                marginTop: `-${svgHeight / 2}px`,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "center center",
                transition: isDragging.current ? "none" : "transform 0.15s ease-out",
                backgroundColor: "#ffffff",
                padding: "48px",
                borderRadius: "12px",
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)"
              }}
              className="absolute top-1/2 left-1/2 select-none border border-slate-800/80"
            >
              <svg
                id="sld-system-wide"
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                width={svgWidth}
                height={svgHeight}
                className="font-sans text-slate-800"
              >
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
      
                {/* LEVEL 1: MAIN DISTRIBUTION PANEL */}
                <g>
                  <text
                    x={MdpXOffset + 400}
                    y={30}
                    textAnchor="middle"
                    className="sld-text"
                    style={{ fontSize: "18px" }}
                  >
                    MAIN DISTRIBUTION PANEL ({panel.designation || "MDP"})
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
      
                {/* LEVEL 2: SUB PANELS & ROUTING LINES */}
                {level2Layouts.map((layout, i) => {
                  const isLeft = layout.isLeft;
                  const id = layout.sp.id;
                  
                  const pos = isLeft
                    ? leftPositions.positions.get(id)
                    : rightPositions.positions.get(id);
                  const spXOffset = pos ? pos.x : 0;
      
                  const y1 = 50 + 320 + layout.rowIndex * 60;
                  const x1 = MdpXOffset + (isLeft ? 190 : 610);
      
                  let dropX = 0;
                  if (isLeft) {
                    dropX = MdpXOffset + 150 - (i + 1) * 20;
                  } else {
                    dropX = MdpXOffset + 650 + (i + 1) * 20;
                  }
      
                  const yChannel = SpYOffset - 75 + i * 12;
                  const spFeedX = spXOffset + 270;
                  const spFeedY = SpYOffset + 100;
      
                  const pathY = y1 + 25;
                  let path = `M ${x1},${y1}`;
                  path += ` L ${x1},${pathY}`;
                  path += ` L ${dropX},${pathY}`;
                  path += ` L ${dropX},${yChannel}`;
                  path += ` L ${spFeedX},${yChannel}`;
                  path += ` L ${spFeedX},${spFeedY}`;
      
                  return (
                    <g key={id}>
                      <path d={path} className="sld-thick" />
                      <rect
                        x={spFeedX - 62.5}
                        y={spFeedY - 90}
                        width="125"
                        height="20"
                        fill="white"
                        stroke="#0284c7"
                        strokeWidth="0.5"
                        rx="3"
                      />
                      <text
                        x={spFeedX}
                        y={spFeedY - 76}
                        textAnchor="middle"
                        className="sld-label-blue"
                      >
                        FEED TO {layout.sp.panel.designation || `SP-${i + 1}`}
                      </text>
      
                      <text
                        x={spXOffset + 400}
                        y={SpYOffset + 30}
                        textAnchor="middle"
                        className="sld-text"
                        style={{ fontSize: "18px" }}
                      >
                        SUB-PANEL: {layout.sp.panel.designation || `SP-${i + 1}`}
                      </text>
                      <SingleLineDiagramContent
                        panel={layout.sp.panel}
                        mainFeeder={layout.spData.mainFeeder}
                        panelRows={layout.spRows}
                        formatWireSize={formatWireSize}
                        isSubPanel={true}
                        xOffset={spXOffset}
                        yOffset={SpYOffset + 50}
                      />
                    </g>
                  );
                })}
      
                {/* LEVEL 3: SUB-SUB PANELS & ROUTING LINES */}
                {level3Layouts.map((layout, i) => {
                  const isLeft = layout.isLeft;
                  const id = layout.sp.id;
                  const parentId = layout.parentId;
      
                  const parentLayout = level2Layouts.find((l) => l.sp.id === parentId);
                  if (!parentLayout) return null;
      
                  const parentPos = isLeft
                    ? leftPositions.positions.get(parentId)
                    : rightPositions.positions.get(parentId);
                  if (!parentPos) return null;
      
                  const sspXOffset = parentPos.childrenX.get(id) || 0;
                  const parentXOffset = parentPos.x;
      
                  const y1 = SpYOffset + 50 + 320 + layout.rowIndex * 60;
                  const x1 = parentXOffset + (isLeft ? 190 : 610);
      
                  let dropX = 0;
                  if (isLeft) {
                    dropX = parentXOffset + 150 - (i + 1) * 20;
                  } else {
                    dropX = parentXOffset + 650 + (i + 1) * 20;
                  }
      
                  const yChannel = SspYOffset - 75 + i * 12;
                  const sspFeedX = sspXOffset + 270;
                  const sspFeedY = SspYOffset + 100;
      
                  const pathY = y1 + 25;
                  let path = `M ${x1},${y1}`;
                  path += ` L ${x1},${pathY}`;
                  path += ` L ${dropX},${pathY}`;
                  path += ` L ${dropX},${yChannel}`;
                  path += ` L ${sspFeedX},${yChannel}`;
                  path += ` L ${sspFeedX},${sspFeedY}`;
      
                  return (
                    <g key={id}>
                      <path d={path} className="sld-thick" />
                      <rect
                        x={sspFeedX - 62.5}
                        y={sspFeedY - 90}
                        width="125"
                        height="20"
                        fill="white"
                        stroke="#0284c7"
                        strokeWidth="0.5"
                        rx="3"
                      />
                      <text
                        x={sspFeedX}
                        y={sspFeedY - 76}
                        textAnchor="middle"
                        className="sld-label-blue"
                      >
                        FEED TO {layout.sp.panel.designation || `SSP-${i + 1}`}
                      </text>
      
                      <text
                        x={sspXOffset + 400}
                        y={SspYOffset + 30}
                        textAnchor="middle"
                        className="sld-text"
                        style={{ fontSize: "18px" }}
                      >
                        SUB-SUB PANEL: {layout.sp.panel.designation || `SSP-${i + 1}`}
                      </text>
                      <SingleLineDiagramContent
                        panel={layout.sp.panel}
                        mainFeeder={layout.spData.mainFeeder}
                        panelRows={layout.spRows}
                        formatWireSize={formatWireSize}
                        isSubPanel={true}
                        xOffset={sspXOffset}
                        yOffset={SspYOffset + 50}
                      />
                    </g>
                  );
                })}
              </svg>
            </div>
            
            {/* Navigation Hint HUD Display (Bottom Left) */}
            <div className="absolute bottom-6 left-6 flex items-center bg-slate-900/90 backdrop-blur-md px-4 py-3 rounded-xl border border-slate-800 text-slate-300 text-xs shadow-2xl pointer-events-auto">
              <Info className="w-4 h-4 text-emerald-400 mr-2 shrink-0 animate-pulse" />
              <span>
                <strong>CAD Panel Navigation:</strong> Scroll wheel zoom • Left click &amp; drag or touch to pan.
              </span>
            </div>

            {/* Floating Interactive Toolbar (Bottom Right) */}
            <div className="absolute bottom-6 right-6 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-800 shadow-2xl pointer-events-auto">
              <button
                onClick={zoomOut}
                className="p-2 border border-slate-800 text-slate-300 hover:text-white dark:hover:bg-slate-800/80 rounded-lg cursor-pointer transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              
              <span className="text-xs font-mono font-bold text-slate-300 px-3 min-w-[50px] text-center bg-slate-950/50 py-1.5 rounded-md">
                {Math.round(zoom * 100)}%
              </span>
              
              <button
                onClick={zoomIn}
                className="p-2 border border-slate-800 text-slate-300 hover:text-white dark:hover:bg-slate-800/80 rounded-lg cursor-pointer transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              
              <div className="w-[1px] h-6 bg-slate-800"></div>
              
              <button
                onClick={fitToScreen}
                className="p-2 border border-slate-800 text-slate-300 hover:text-white dark:hover:bg-slate-800/80 rounded-lg cursor-pointer transition-colors"
                title="Fit blueprint to workspace width"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Esc shortcut registration when maximized */}
      <EscListener isMaximized={isMaximized} onClose={() => setIsMaximized(false)} />
    </div>
  );
}

// Inline Helper Keyboard listener
function EscListener({ isMaximized, onClose }: { isMaximized: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!isMaximized) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMaximized, onClose]);
  return null;
}
