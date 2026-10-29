import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  PanelConfig,
  Circuit,
  LoadType,
  VoltageDropCalculation,
} from "../types";
import { computePanelScheduleValues } from "../utils/computeEngine";
import { SingleLineDiagramContent, SLD_GEOM, panelSldHeight, panelSldExtents } from "./SingleLineDiagram";
import { computeSolarDesign } from "../utils/solarEngine";
import { toPng } from "html-to-image";
import {
  Printer,
  Download,
  AlertCircle,
  Layers,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
  Info,
  Sun,
} from "lucide-react";
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
  iscParams?: any;
  isPremium?: boolean;
  onRequestUpgrade?: () => void;
  vdCalculations?: VoltageDropCalculation[];
  solarConfig?: any;
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
  iscParams,
  isPremium = true,
  onRequestUpgrade,
  vdCalculations,
  solarConfig,
}: SystemSLDProps) {
  const formatWireSize = (size: number | string) => size;

  const [isExporting, setIsExporting] = useState(false);
  const [showPrintWarning, setShowPrintWarning] = useState(false);
  const [showSolar, setShowSolar] = useState<boolean>(true);
  // Same sizing as the Solar Design module (with the load schedule for load-based sizing)
  const solarCalc = useMemo(() => {
    if (!solarConfig) return null;
    try {
      return computeSolarDesign(solarConfig, panel, circuits, subPanels as any[]);
    } catch {
      return null;
    }
  }, [solarConfig, panel, circuits, subPanels]);

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
    if (
      (e.target as HTMLElement).closest("button") ||
      (e.target as HTMLElement).closest("select")
    ) {
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
    if (
      (e.target as HTMLElement).closest("button") ||
      (e.target as HTMLElement).closest("select")
    ) {
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

  const allSubPanels = useMemo(() => {
    const rawAllSubPanels = [...subPanels];
    const seen = new Set();
    return rawAllSubPanels.filter((sp) => {
      if (!sp || !sp.id) return false;
      if (seen.has(sp.id)) return false;
      seen.add(sp.id);
      return true;
    });
  }, [subPanels]);

  const mdpData = useMemo(
    () =>
      computePanelScheduleValues(panel, circuits, {
        vdCalculations,
        panelId: "main",
        availableSubPanels: allSubPanels,
      }),
    [panel, circuits, vdCalculations, allSubPanels],
  );
  const mdpRows = useMemo(
    () => getPanelRows(circuits, panel.system),
    [circuits, panel.system],
  );

  const mdpHeight = panelSldHeight(mdpRows.length);

  const spLayouts = useMemo(() => {
    return allSubPanels.map((sp, idx) => {
      const spData = computePanelScheduleValues(sp.panel, sp.circuits, {
        vdCalculations,
        panelId: sp.id,
        availableSubPanels: allSubPanels,
      });
      const spRows = getPanelRows(sp.circuits, sp.panel.system);
      const spHeight = panelSldHeight(spRows.length);

      let parentId: "mdp" | string = "mdp";
      let feedingCircuit: Circuit | null = null;
      let rowIndex = 0;
      let isLeft = true;
      let foundFeeder = false;

      // 1. Check for explicit link by ID across all panels (MDP and subpanels)
      const mdpExplicitIndex = circuits.findIndex(c => c.linkedSubPanelId === sp.id);
      if (mdpExplicitIndex >= 0) {
        feedingCircuit = circuits[mdpExplicitIndex];
        parentId = "mdp";
        foundFeeder = true;
      } else {
        // Check other subpanels
        for (const otherSp of allSubPanels) {
          const spExplicitIndex = otherSp.circuits.findIndex(c => c.linkedSubPanelId === sp.id);
          if (spExplicitIndex >= 0) {
            feedingCircuit = otherSp.circuits[spExplicitIndex];
            parentId = otherSp.id;
            foundFeeder = true;
            break;
          }
        }
      }

      // 2. If no explicit ID link, check for designation description match
      if (!foundFeeder && sp.panel.designation) {
        const mdpDescIndex = circuits.findIndex(
          (c) => c.description === sp.panel.designation
        );
        if (mdpDescIndex >= 0) {
          feedingCircuit = circuits[mdpDescIndex];
          parentId = "mdp";
          foundFeeder = true;
        } else {
          for (const otherSp of allSubPanels) {
            const spDescIndex = otherSp.circuits.findIndex(
              (c) => c.description === sp.panel.designation
            );
            if (spDescIndex >= 0) {
              feedingCircuit = otherSp.circuits[spDescIndex];
              parentId = otherSp.id;
              foundFeeder = true;
              break;
            }
          }
        }
      }

      // 3. Positional fallback if still not found
      if (!foundFeeder) {
        let mdpFeederIndex = circuits.findIndex(
          (c) =>
            c.loadType === LoadType.SUB_PANEL ||
            c.loadType === LoadType.SUB_SUB_PANEL,
        );
        const mdpSubCircuits = circuits.filter(
          (c) =>
            c.loadType === LoadType.SUB_PANEL ||
            c.loadType === LoadType.SUB_SUB_PANEL,
        );
        if (mdpSubCircuits.length > idx) {
          const matchingCircuit = mdpSubCircuits[idx];
          mdpFeederIndex = circuits.findIndex(
            (c) => c.id === matchingCircuit.id,
          );
        }
        if (mdpFeederIndex >= 0) {
          feedingCircuit = circuits[mdpFeederIndex];
          parentId = "mdp";
        }
      }

      // Now determine rowIndex and isLeft based on the resolved parent
      if (feedingCircuit) {
        if (parentId === "mdp") {
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
          const parentSp = allSubPanels.find(p => p.id === parentId);
          if (parentSp) {
            const pRows = getPanelRows(parentSp.circuits, parentSp.panel.system);
            rowIndex = pRows.findIndex(
              (r) =>
                r.left?.id === feedingCircuit!.id ||
                r.right?.id === feedingCircuit!.id,
            );
            isLeft =
              rowIndex >= 0
                ? pRows[rowIndex]?.left?.id === feedingCircuit!.id
                : true;
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
  }, [subPanels, circuits, mdpRows, vdCalculations]);

  const resolvedLayouts = useMemo(() => {
    const layoutMap = new Map(spLayouts.map((l) => [l.sp.id, l]));

    const resolveIsLeft = (
      id: string,
      seen: Set<string> = new Set(),
    ): boolean => {
      if (seen.has(id)) return true;
      seen.add(id);

      const layout = layoutMap.get(id);
      if (!layout) return true;
      if (layout.parentId === "mdp") {
        return layout.tempIsLeft;
      }
      return resolveIsLeft(layout.parentId, seen);
    };

    return spLayouts.map((layout) => {
      const isLeft = resolveIsLeft(layout.sp.id);
      return {
        ...layout,
        isLeft,
      };
    });
  }, [spLayouts]);

  // Width of a panel's horizontal slot space to avoid overlaps
  const W_COLUMN = 950;
  const borderSpace = 50;

  // 1. Compute depths, required widths, and vertical offsets
  const { depths, widths, maxDepth, yOffsets, depthMaxHeights } =
    useMemo(() => {
      const dMap = new Map<string, number>();
      const wMap = new Map<string, number>();
      const getChildren = (pid: string) =>
        resolvedLayouts.filter((l) => l.parentId === pid);

      const getDepth = (id: string, seen: Set<string> = new Set()): number => {
        if (seen.has(id)) return 2;
        seen.add(id);
        const layout = resolvedLayouts.find((l) => l.sp.id === id);
        if (!layout) return 2;
        if (layout.parentId === "mdp") return 2;
        return getDepth(layout.parentId, seen) + 1;
      };

      resolvedLayouts.forEach((l) => {
        dMap.set(l.sp.id, getDepth(l.sp.id));
      });

      let md = 1;
      dMap.forEach((d) => {
        if (d > md) md = d;
      });

      const getWidth = (id: string, seen: Set<string> = new Set()): number => {
        if (seen.has(id)) return W_COLUMN;
        seen.add(id);
        const children = getChildren(id);
        if (children.length === 0) return W_COLUMN;
        return children.reduce((sum, c) => sum + getWidth(c.sp.id, seen), 0);
      };

      resolvedLayouts.forEach((l) => {
        wMap.set(l.sp.id, getWidth(l.sp.id));
      });

      // Y Offsets per depth
      const dMH = new Map<number, number>();
      dMH.set(1, mdpHeight);
      for (let d = 2; d <= md; d++) {
        const layouts = resolvedLayouts.filter((l) => dMap.get(l.sp.id) === d);
        dMH.set(
          d,
          layouts.length > 0 ? Math.max(...layouts.map((l) => l.spHeight)) : 0,
        );
      }

      const yOff = new Map<number, number>();
      yOff.set(1, 50); // mdp is at 50
      // The MDP's solar feeder hangs about 155 units below its grounding system
      let currY = 50 + mdpHeight + (solarConfig && showSolar ? 160 : 0) + 200;
      for (let d = 2; d <= md; d++) {
        yOff.set(d, currY);
        currY += (dMH.get(d) || 0) + 200;
      }

      return {
        depths: dMap,
        widths: wMap,
        maxDepth: md,
        yOffsets: yOff,
        depthMaxHeights: dMH,
      };
    }, [resolvedLayouts, mdpHeight, solarConfig, showSolar]);

  /** Side of the parent board the feeding circuit leaves from */
  const branchSide = (layout: (typeof resolvedLayouts)[number]): "left" | "right" => {
    if (layout.parentId === "mdp") return layout.tempIsLeft ? "left" : "right";
    const pLayout = resolvedLayouts.find((l) => l.sp.id === layout.parentId);
    return pLayout?.spRows[layout.rowIndex]?.left?.id === layout.feedingCircuit?.id ? "left" : "right";
  };

  // 2. Compute horizontal positions (recursive tree placement)
  const { layoutPositions, svgWidth, MdpXOffset } = useMemo(() => {
    const positions = new Map<string, { x: number }>();
    const getChildren = (pid: string) =>
      resolvedLayouts.filter((l) => l.parentId === pid);

    const placeChildren = (parentId: string, startX: number) => {
      let currentX = startX;
      // Left-side feeders first (top circuit leftmost), then right-side feeders (top circuit rightmost),
      // so the feeder routes do not cross
      const children = [...getChildren(parentId)].sort((a, b) => {
        const sa = branchSide(a), sb = branchSide(b);
        if (sa !== sb) return sa === "left" ? -1 : 1;
        return sa === "left" ? a.rowIndex - b.rowIndex : b.rowIndex - a.rowIndex;
      });
      children.forEach((c) => {
        const w = widths.get(c.sp.id) || W_COLUMN;
        const cx = currentX + w / 2 - 400; // Center 800px width inside W
        positions.set(c.sp.id, { x: cx });
        placeChildren(c.sp.id, currentX);
        currentX += w;
      });
    };

    // Left side roots
    // Farthest panel first on the left (fed from the top circuit); nearest first on the right
    const leftRoots = resolvedLayouts
      .filter((l) => l.parentId === "mdp" && l.isLeft)
      .sort((a, b) => a.rowIndex - b.rowIndex);
    const rightRoots = resolvedLayouts
      .filter((l) => l.parentId === "mdp" && !l.isLeft)
      .sort((a, b) => b.rowIndex - a.rowIndex);

    let currentLeftX = 50;
    leftRoots.forEach((r) => {
      const w = widths.get(r.sp.id) || W_COLUMN;
      const x = currentLeftX + w / 2 - 400;
      positions.set(r.sp.id, { x });
      placeChildren(r.sp.id, currentLeftX);
      currentLeftX += w + borderSpace;
    });

    const endLeftX =
      leftRoots.length > 0 ? currentLeftX - borderSpace : currentLeftX;
    // The service-entrance text extends left of the MDP drawing
    const mdpX = leftRoots.length > 0 ? endLeftX + 100 : 50 + SLD_GEOM.LEFT_OVERFLOW;

    let currentRightX = mdpX + SLD_GEOM.WIDTH + (rightRoots.length > 0 ? 100 : 0);
    rightRoots.forEach((r) => {
      const w = widths.get(r.sp.id) || W_COLUMN;
      const x = currentRightX + w / 2 - 400;
      positions.set(r.sp.id, { x });
      placeChildren(r.sp.id, currentRightX);
      currentRightX += w + borderSpace;
    });

    const endRightX =
      rightRoots.length > 0 ? currentRightX - borderSpace : currentRightX;

    return {
      layoutPositions: positions,
      svgWidth: endRightX + 50,
      MdpXOffset: mdpX,
    };
  }, [resolvedLayouts, widths]);

  const svgHeight = useMemo(() => {
    const extraSolar = solarConfig && showSolar ? 280 : 0;
    return (
      (yOffsets.get(maxDepth) || 0) + (depthMaxHeights.get(maxDepth) || 0) + 100 + extraSolar
    );
  }, [maxDepth, yOffsets, depthMaxHeights, solarConfig, showSolar]);

  // 3. Feeder routes (sub-panel feeders): each leaves its circuit tag straight out to its own vertical lane
  // beyond the parent board's labels and callouts, runs down to its own channel above the fed panel and
  // across to that panel's feed point. Lanes: on each side the top circuit takes the outermost lane.
  // Channels: left-going routes from the outermost lane run highest, right-going ones likewise mirrored.
  // With the panels placed in the same order (see placeChildren / roots) no two routes cross.
  const feederRoutes = useMemo(() => {
    const LANE = 14;
    const GAP = 18;
    const routes = new Map<string, string>();
    const mdpExt = panelSldExtents({
      panel,
      panelRows: mdpRows,
      solarConfig: showSolar ? solarConfig : undefined,
      solarCalc: showSolar ? solarCalc : undefined,
    });
    const extOf = (pid: string) => {
      if (pid === "mdp") return mdpExt;
      const l = resolvedLayouts.find((x) => x.sp.id === pid);
      return l ? panelSldExtents({ panel: l.sp.panel, panelRows: l.spRows, isSubPanel: true }) : mdpExt;
    };
    const originOf = (pid: string) =>
      pid === "mdp"
        ? { x: MdpXOffset, y: 50 }
        : { x: layoutPositions.get(pid)?.x ?? MdpXOffset, y: (yOffsets.get(depths.get(pid) || 2) || 0) + 50 };

    const feeders = resolvedLayouts.map((l) => {
      const side = branchSide(l);
      const o = originOf(l.parentId);
      const ext = extOf(l.parentId);
      const depth = depths.get(l.sp.id) || 2;
      const yOff = yOffsets.get(depth) || 0;
      return {
        id: l.sp.id,
        parentId: l.parentId,
        side,
        row: l.rowIndex,
        depth,
        yOff,
        tipX: o.x + (side === "left" ? SLD_GEOM.TIP_LEFT : SLD_GEOM.TIP_RIGHT),
        rowY: o.y + SLD_GEOM.ROW1_Y + l.rowIndex * SLD_GEOM.ROW_H,
        laneBase: o.x + (side === "left" ? ext.left - GAP : ext.right + GAP),
        targetX: (layoutPositions.get(l.sp.id)?.x ?? 0) + SLD_GEOM.SUB_FEED_X,
        targetY: yOff + 50 + SLD_GEOM.FEED_Y,
        laneX: 0,
        chanY: 0,
      };
    });

    // Lanes per parent side, top circuit outermost
    const groups = new Map<string, typeof feeders>();
    feeders.forEach((f) => {
      const k = `${f.parentId}|${f.side}`;
      groups.set(k, [...(groups.get(k) || []), f]);
    });
    groups.forEach((list) => {
      list.sort((a, b) => a.row - b.row);
      list.forEach((f, rank) => {
        const out = (list.length - 1 - rank) * LANE;
        f.laneX = f.side === "left" ? f.laneBase - out : f.laneBase + out;
      });
    });

    // Channels per fed depth, in the gap above the fed panels
    const byDepth = new Map<number, typeof feeders>();
    feeders.forEach((f) => byDepth.set(f.depth, [...(byDepth.get(f.depth) || []), f]));
    byDepth.forEach((list) => {
      const leftGoing = list.filter((f) => f.targetX <= f.laneX).sort((a, b) => a.laneX - b.laneX);
      const rightGoing = list.filter((f) => f.targetX > f.laneX).sort((a, b) => b.laneX - a.laneX);
      const ordered = [...leftGoing, ...rightGoing];
      const top = list[0].yOff - 180;
      const step = Math.min(LANE, 175 / Math.max(1, ordered.length));
      ordered.forEach((f, i) => {
        f.chanY = top + step * (i + 0.5);
      });
    });

    feeders.forEach((f) => {
      routes.set(f.id, `M ${f.tipX},${f.rowY} H ${f.laneX} V ${f.chanY} H ${f.targetX} V ${f.targetY}`);
    });
    return routes;
  }, [resolvedLayouts, layoutPositions, yOffsets, depths, MdpXOffset, panel, mdpRows, solarConfig, solarCalc, showSolar]);

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
        skipFonts: true,
        fontEmbedCSS: "",
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
        skipFonts: true,
        fontEmbedCSS: "",
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
    <div className="w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-8 panel-container overflow-hidden">
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
                [], // vdCalculations empty fallback
                undefined, // illumParams empty fallback
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
          {solarConfig && (
            <button
              onClick={() => setShowSolar((prev) => !prev)}
              className={`px-3.5 py-2 rounded-lg text-sm font-bold shadow-md transition-all flex items-center gap-2 cursor-pointer border ${
                showSolar
                  ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-600"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700"
              }`}
              title="Toggle Solar PV Interconnection branch on SLD"
            >
              <Sun className="w-4 h-4" />
              <span>Solar PV: {showSolar ? "Visible" : "Hidden"}</span>
            </button>
          )}
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
        <div
          style={{ minWidth: `${svgWidth}px` }}
          className="mx-auto flex justify-center"
        >
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
                iscParams={iscParams}
                solarConfig={showSolar ? solarConfig : undefined}
                solarCalc={showSolar ? solarCalc : undefined}
                xOffset={MdpXOffset}
                yOffset={50}
              />
            </g>

            {/* ALL SUB PANELS & ROUTING LINES */}
            {resolvedLayouts.map((layout, i) => {
              const isLeft = layout.isLeft;
              const id = layout.sp.id;
              const parentId = layout.parentId;

              const depth = depths.get(id) || 2;
              const yOffset = yOffsets.get(depth) || 0;
              const pos = layoutPositions.get(id);
              const spXOffset = pos ? pos.x : 0;

              let parentXOffset = MdpXOffset;
              let parentYOffset = 50; // MDP yOffset
              let isLeftBranchInParent = isLeft;

              if (parentId !== "mdp") {
                const pPos = layoutPositions.get(parentId);
                parentXOffset = pPos ? pPos.x : MdpXOffset;
                const pDepth = depths.get(parentId) || 2;
                parentYOffset = yOffsets.get(pDepth) || 50;
                const pLayout = resolvedLayouts.find(
                  (l) => l.sp.id === parentId,
                );
                if (pLayout) {
                  isLeftBranchInParent =
                    pLayout.spRows[layout.rowIndex]?.left?.id ===
                    layout.feedingCircuit?.id;
                }
              } else {
                isLeftBranchInParent = layout.tempIsLeft;
              }

              // Feeder route: own lane outside the parent board's labels, own channel above this panel
              const spFeedX = spXOffset + SLD_GEOM.SUB_FEED_X;
              const spFeedY = yOffset + 50 + SLD_GEOM.FEED_Y;
              const path = feederRoutes.get(id) || "";
              void isLeftBranchInParent;

              const label =
                depth === 2 ? `SP` : depth === 3 ? `SSP` : `L${depth}`;

              const parentDesignation = parentId === "mdp"
                ? (panel.designation || "MDP")
                : (subPanels.find((p) => p.id === parentId)?.panel.designation || "SUB-PANEL");

              return (
                <g key={`page-l${depth}-${id}`}>
                  {/* Routing Line connects branch to feed */}
                  <path d={path} className="sld-thick" />

                  {/* Feeder Details Text Box overlaid on routing line */}
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
                    FEED TO {layout.sp.panel.designation || `${label}-${i + 1}`}
                  </text>

                  {/* Sub Panel Fully Expanded Rendering */}
                  <text
                    x={spXOffset + 400}
                    y={yOffset + 30}
                    textAnchor="middle"
                    className="sld-text"
                    style={{ fontSize: "18px" }}
                  >
                    {depth === 2
                      ? "SUB-PANEL"
                      : depth === 3
                        ? "SUB-SUB PANEL"
                        : `LEVEL ${depth} PANEL`}
                    : {layout.sp.panel.designation || `${label}-${i + 1}`}
                  </text>
                  <SingleLineDiagramContent
                    panel={layout.sp.panel}
                    mainFeeder={layout.spData.mainFeeder}
                    panelRows={layout.spRows}
                    formatWireSize={formatWireSize}
                    isSubPanel={true}
                    parentDesignation={parentDesignation}
                    xOffset={spXOffset}
                    yOffset={yOffset + 50}
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
                  Project: {panel.project || "Unnamed Project"} • Panel Board:{" "}
                  {panel.designation || "MDP"} • Design Standard: PEC 2017
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
              backgroundImage:
                "radial-gradient(#1e293b 1.5px, transparent 1.5px)",
              backgroundSize: "28px 28px",
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
                transition: isDragging.current
                  ? "none"
                  : "transform 0.15s ease-out",
                backgroundColor: "#ffffff",
                padding: "48px",
                borderRadius: "12px",
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)",
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
                    iscParams={iscParams}
                    solarConfig={showSolar ? solarConfig : undefined}
                solarCalc={showSolar ? solarCalc : undefined}
                    xOffset={MdpXOffset}
                    yOffset={50}
                  />
                </g>

                {/* ALL SUB PANELS & ROUTING LINES */}
                {resolvedLayouts.map((layout, i) => {
                  const isLeft = layout.isLeft;
                  const id = layout.sp.id;
                  const parentId = layout.parentId;

                  const depth = depths.get(id) || 2;
                  const yOffset = yOffsets.get(depth) || 0;
                  const pos = layoutPositions.get(id);
                  const spXOffset = pos ? pos.x : 0;

                  let parentXOffset = MdpXOffset;
                  let parentYOffset = 50; // MDP yOffset
                  let isLeftBranchInParent = isLeft;

                  if (parentId !== "mdp") {
                    const pPos = layoutPositions.get(parentId);
                    parentXOffset = pPos ? pPos.x : MdpXOffset;
                    const pDepth = depths.get(parentId) || 2;
                    parentYOffset = yOffsets.get(pDepth) || 50;
                    const pLayout = resolvedLayouts.find(
                      (l) => l.sp.id === parentId,
                    );
                    if (pLayout) {
                      isLeftBranchInParent =
                        pLayout.spRows[layout.rowIndex]?.left?.id ===
                        layout.feedingCircuit?.id;
                    }
                  } else {
                    isLeftBranchInParent = layout.tempIsLeft;
                  }

                  // Feeder route: own lane outside the parent board's labels, own channel above this panel
                  const spFeedX = spXOffset + SLD_GEOM.SUB_FEED_X;
                  const spFeedY = yOffset + 50 + SLD_GEOM.FEED_Y;
                  const path = feederRoutes.get(id) || "";
                  void isLeftBranchInParent;

                  const label =
                    depth === 2 ? `SP` : depth === 3 ? `SSP` : `L${depth}`;

                  const parentDesignation = parentId === "mdp"
                    ? (panel.designation || "MDP")
                    : (subPanels.find((p) => p.id === parentId)?.panel.designation || "SUB-PANEL");

                  return (
                    <g key={`max-l${depth}-${id}`}>
                      {/* Routing Line connects branch to feed */}
                      <path d={path} className="sld-thick" />

                      {/* Feeder Details Text Box overlaid on routing line */}
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
                        FEED TO{" "}
                        {layout.sp.panel.designation || `${label}-${i + 1}`}
                      </text>

                      {/* Sub Panel Fully Expanded Rendering */}
                      <text
                        x={spXOffset + 400}
                        y={yOffset + 30}
                        textAnchor="middle"
                        className="sld-text"
                        style={{ fontSize: "18px" }}
                      >
                        {depth === 2
                          ? "SUB-PANEL"
                          : depth === 3
                            ? "SUB-SUB PANEL"
                            : `LEVEL ${depth} PANEL`}
                        : {layout.sp.panel.designation || `${label}-${i + 1}`}
                      </text>
                      <SingleLineDiagramContent
                        panel={layout.sp.panel}
                        mainFeeder={layout.spData.mainFeeder}
                        panelRows={layout.spRows}
                        formatWireSize={formatWireSize}
                        isSubPanel={true}
                        parentDesignation={parentDesignation}
                        xOffset={spXOffset}
                        yOffset={yOffset + 50}
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
                <strong>CAD Panel Navigation:</strong> Scroll wheel zoom • Left
                click &amp; drag or touch to pan.
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
      <EscListener
        isMaximized={isMaximized}
        onClose={() => setIsMaximized(false)}
      />
    </div>
  );
}

// Inline Helper Keyboard listener
function EscListener({
  isMaximized,
  onClose,
}: {
  isMaximized: boolean;
  onClose: () => void;
}) {
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
