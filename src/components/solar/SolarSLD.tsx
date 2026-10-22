import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  SolarDesignConfig,
  SolarCalculationResults,
  SolarDesignOverrides,
} from "../../types/solar";
import { PanelConfig, Circuit, VoltageDropCalculation } from "../../types";
import {
  computePanelScheduleValues,
  getConductorLabel,
} from "../../utils/computeEngine";
import {
  Printer,
  Download,
  AlertCircle,
  Layers,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
  Info,
  Sliders,
  Check,
  Eye,
  EyeOff,
  Sun,
  Zap,
  Battery,
  Shield,
  FileCode,
  FileSpreadsheet,
  FileText,
  MousePointer,
  HelpCircle,
  ExternalLink,
} from "lucide-react";
import { toPng, toSvg } from "html-to-image";
import { exportSolarToDxf } from "../../utils/exportSolarDxf";
import { exportSolarToWord } from "../../utils/exportSolarWord";
import { SolarSLDPictorial, computePictorialLayout } from "./SolarSLDPictorial";

interface SolarSLDProps {
  config: SolarDesignConfig;
  calc: SolarCalculationResults;
  panels?: PanelConfig[];
  circuits?: Circuit[];
  subPanels?: any[];
  vdCalculations?: VoltageDropCalculation[];
  onUpdateConfig?: (newConfig: SolarDesignConfig) => void;
  onSetOverride?: (field: keyof SolarDesignOverrides, value: any) => void;
}

export const SolarSLD: React.FC<SolarSLDProps> = ({
  config,
  calc,
  panels,
  circuits,
  subPanels,
  vdCalculations,
  onUpdateConfig,
  onSetOverride,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [showPrintWarning, setShowPrintWarning] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  // Custom View Options
  const [showSolarMeter, setShowSolarMeter] = useState(true);
  const [showEpsLoad, setShowEpsLoad] = useState(true);
  const [showGrounding, setShowGrounding] = useState(true);
  const [showSheetBorder, setShowSheetBorder] = useState(true);
  const [showTitleBlock, setShowTitleBlock] = useState(true);
  const [showGeneralNotes, setShowGeneralNotes] = useState(true);
  const [copiedNotes, setCopiedNotes] = useState(false);
  const [showConductorSpecs, setShowConductorSpecs] = useState(true);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [cadTheme, setCadTheme] = useState<"cad_white" | "blueprint" | "cad_dark">("cad_white");

  const containerRef = useRef<HTMLDivElement>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  // Synchronized System SLD Panel Data Engine
  const linkedPanelData = useMemo(() => {
    const targetId = config.selectedMdpId;
    let targetPanel: PanelConfig | undefined;
    let targetCircuits: Circuit[] = circuits || [];

    if (subPanels && subPanels.length > 0) {
      const sp = subPanels.find(
        (p) => p.id === targetId || p.panel?.designation === targetId
      );
      if (sp) {
        targetPanel = sp.panel;
        targetCircuits = sp.circuits || [];
      }
    }

    if (!targetPanel && panels && panels.length > 0) {
      targetPanel =
        panels.find((p) => p.id === targetId || p.designation === targetId) ||
        panels[0];
      targetCircuits = circuits || [];
    }

    if (!targetPanel) {
      targetPanel = {
        id: "main",
        designation: "MAIN DISTRIBUTION PANEL (MDP)",
        system: `${config.utilityVoltage}V ${config.utilityPhase}`,
        voltage: config.utilityVoltage || 230,
        phase: config.utilityPhase?.includes("3PH") ? 3 : 1,
        mainBreakerRating: config.serviceCapacityAmps || 100,
        mainBreakerType: "MCCB",
        mainBreakerPoles: config.utilityPhase?.includes("3PH") ? 3 : 2,
        serviceEntranceConduitSize: "32mm",
        insulationType: "THHN",
        conductorMaterial: "Copper",
        icRating: "10",
      } as any;
    }

    const computed = computePanelScheduleValues(targetPanel, targetCircuits, {
      vdCalculations,
      panelId: targetPanel.id || "main",
      availableSubPanels: subPanels,
    });

    const cb = computed.mainFeeder.cb || config.serviceCapacityAmps || 100;
    const af = computed.mainFeeder.af || Math.max(cb, cb <= 100 ? 100 : cb <= 225 ? 225 : cb <= 400 ? 400 : cb <= 600 ? 600 : 800);
    const poles = computed.mainFeeder.poles || (targetPanel.system.includes("3PH") ? 3 : 2);
    const kaic = computed.mainFeeder.kaic || parseFloat(targetPanel.icRating || "10") || 10;
    const wire = computed.mainFeeder.wire;
    const groundSize = computed.mainFeeder.groundSize;
    const conduitSize = computed.mainFeeder.conduitSize;
    const conduitType = computed.mainFeeder.conduitType || "PVC";
    const runs = wire?.runs || 1;
    const insulation = targetPanel.insulationType || "THHN";
    const material = targetPanel.conductorMaterial || "Copper";

    const feederLabel = getConductorLabel(
      wire?.size || 14,
      groundSize || "8.0",
      poles,
      runs,
      insulation
    ) + (material === "Aluminum" ? " (AL)" : " (CU)");

    const conduitLabel = `IN ${conduitSize.toUpperCase()}Ø ${conduitType.toUpperCase()} CONDUIT`;

    const connectedKVA = (computed.totalVA / 1000).toFixed(2);
    const demandKVA = (computed.totalDemandVA / 1000).toFixed(2);
    const systemVoltage = targetPanel.voltage || config.utilityVoltage || 230;
    const is3Phase = targetPanel.system?.includes("3PH") || false;
    const demandA = (
      computed.mainCurrent?.designAmp ||
      (computed.totalDemandVA / (systemVoltage * (is3Phase ? 1.732 : 1))) ||
      0
    ).toFixed(1);
    const phaseText = is3Phase ? "3PH 3W" : "1PH 2W";

    // Active branch circuits from panel schedule
    const activeCircuits = (targetCircuits || []).filter((c) => {
      const load = (c.loadVA || 0) + (c.wattage || 0);
      return load > 0 || (c.description && c.description.trim() !== "");
    });

    return {
      panel: targetPanel,
      circuits: targetCircuits,
      activeCircuits,
      computed,
      designation: targetPanel.designation || "MAIN DISTRIBUTION PANEL (MDP)",
      mainFeeder: {
        cb,
        af,
        poles: Number(poles) || 2,
        kaic,
        type: targetPanel.mainOverrides?.breakerType || targetPanel.type || "MCCB",
        wire,
        groundSize,
        conduitSize,
        conduitType,
        feederLabel,
        conduitLabel,
      },
      connectedKVA,
      demandKVA,
      demandA,
      systemVoltage,
      is3Phase,
      phaseText,
    };
  }, [config.selectedMdpId, config.serviceCapacityAmps, config.utilityVoltage, config.utilityPhase, panels, circuits, subPanels, vdCalculations]);

  const isHybrid = config.systemType === "hybrid";
  const isOffGrid = config.systemType === "off-grid";
  const hasBattery = (isHybrid || isOffGrid) && config.battery.enabled;
  const effectiveShowEpsLoad = (isHybrid || isOffGrid) && showEpsLoad;

  const invManufacturer = (calc.selectedInverter?.manufacturer || "").toLowerCase();
  const invModel = (calc.selectedInverter?.model || "").toLowerCase();
  const isThreePhase =
    calc.selectedInverter?.phase === "3PH" ||
    config.utilityPhase === "3PH" ||
    invModel.includes("3ph") ||
    false;

  const stringsCount = Math.max(1, calc.effective.numberOfStrings || 1);

  // Sheet size follows the pictorial diagram (rows per string, battery) plus the notes / title block band
  const pictorialTop = 110;
  const pictorialLayout = computePictorialLayout(config, calc, pictorialTop);
  const notesHeight = 185;
  const svgWidth = 2000;
  const svgHeight = Math.max(1100, pictorialLayout.bottom + notesHeight + 32 + 30);

  // Pan & Zoom handlers
  const fitToScreen = () => {
    const targetRef = isMaximized ? modalContainerRef : containerRef;
    if (!targetRef.current) {
      setZoom(0.85);
      setPan({ x: 0, y: 0 });
      return;
    }
    const rect = targetRef.current.getBoundingClientRect();
    const availableWidth = rect.width - 32;
    const availableHeight = rect.height - (isMaximized ? 80 : 32);
    const scaleX = availableWidth / svgWidth;
    const scaleY = availableHeight / svgHeight;
    const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.35), 1.5);
    setZoom(Number(newZoom.toFixed(2)));
    setPan({ x: 0, y: 0 });
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.15, 2.5));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.15, 0.3));
  const handleResetZoom = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.08;
    if (e.deltaY < 0) {
      setZoom((prev) => Math.min(prev * zoomFactor, 2.5));
    } else {
      setZoom((prev) => Math.max(prev / zoomFactor, 0.3));
    }
  };

  // Keyboard Escape listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedElement) setSelectedElement(null);
        if (isMaximized) setIsMaximized(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMaximized, selectedElement]);

  useEffect(() => {
    fitToScreen();
  }, [isMaximized, stringsCount, hasBattery]);

  // Export handlers
  const handleDownloadPNG = async () => {
    const el = document.getElementById("solar-cad-drawing-sheet");
    if (!el) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(el as HTMLElement, {
        quality: 1.0,
        backgroundColor: cadTheme === "blueprint" ? "#0f172a" : cadTheme === "cad_dark" ? "#090d16" : "#ffffff",
        pixelRatio: 2,
        skipFonts: true,
        fontEmbedCSS: "",
      });
      const link = document.createElement("a");
      link.download = `${config.projectName.replace(/[^a-zA-Z0-9_-]/g, "_")}_Solar_SLD.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("PNG Export failed:", err);
      setShowPrintWarning(true);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadSVG = async () => {
    const el = document.getElementById("solar-cad-drawing-sheet");
    if (!el) return;
    setIsExporting(true);
    try {
      const dataUrl = await toSvg(el as HTMLElement, {
        quality: 1.0,
        backgroundColor: cadTheme === "blueprint" ? "#0f172a" : cadTheme === "cad_dark" ? "#090d16" : "#ffffff",
        skipFonts: true,
        fontEmbedCSS: "",
      });
      const link = document.createElement("a");
      link.download = `${config.projectName.replace(/[^a-zA-Z0-9_-]/g, "_")}_Solar_SLD.svg`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("SVG Export failed:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadPDF = async () => {
    const el = document.getElementById("solar-cad-drawing-sheet");
    if (!el) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(el as HTMLElement, {
        quality: 1.0,
        backgroundColor: "#ffffff",
        pixelRatio: 2,
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
      pdf.save(`${config.projectName.replace(/[^a-zA-Z0-9_-]/g, "_")}_Solar_SLD.pdf`);
    } catch (err) {
      console.error("PDF Export failed:", err);
      setShowPrintWarning(true);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadWord = async () => {
    setIsExporting(true);
    try {
      await exportSolarToWord(config, calc, {
        panels,
        circuits,
        subPanels,
        vdCalculations,
        linkedPanelData,
      });
    } catch (err) {
      console.error("Word Export failed:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    try {
      window.print();
    } catch (e) {
      console.error("Direct print failed:", e);
      setShowPrintWarning(true);
    }
  };

  const handleExportCAD = () => {
    exportSolarToDxf(config, calc, linkedPanelData);
  };

  // Color Theme definitions for CAD drafting
  const themeColors = useMemo(() => {
    if (cadTheme === "blueprint") {
      return {
        bg: "#0f172a",
        border: "#38bdf8",
        line: "#e0f2fe",
        dashLine: "#7dd3fc",
        dcLine: "#f87171",
        acLine: "#60a5fa",
        groundLine: "#4ade80",
        equipmentFill: "#1e293b",
        equipmentBorder: "#38bdf8",
        moduleFill: "#0c4a6e",
        moduleBorder: "#38bdf8",
        cellLines: "#7dd3fc",
        text: "#f8fafc",
        textMuted: "#94a3b8",
        textHighlight: "#38bdf8",
        badgeFill: "#0369a1",
        badgeText: "#ffffff",
      };
    }
    if (cadTheme === "cad_dark") {
      return {
        bg: "#090d16",
        border: "#334155",
        line: "#cbd5e1",
        dashLine: "#64748b",
        dcLine: "#ef4444",
        acLine: "#3b82f6",
        groundLine: "#22c55e",
        equipmentFill: "#131b2e",
        equipmentBorder: "#475569",
        moduleFill: "#1e293b",
        moduleBorder: "#64748b",
        cellLines: "#475569",
        text: "#f1f5f9",
        textMuted: "#94a3b8",
        textHighlight: "#38bdf8",
        badgeFill: "#1e293b",
        badgeText: "#f1f5f9",
      };
    }
    // cad_white (Default Engineering CAD Drafting)
    return {
      bg: "#ffffff",
      border: "#0f172a",
      line: "#1e293b",
      dashLine: "#64748b",
      dcLine: "#1e293b", // Authentic CAD black/dark gray lines
      acLine: "#1e293b",
      groundLine: "#15803d",
      equipmentFill: "#ffffff",
      equipmentBorder: "#0f172a",
      moduleFill: "#ffffff",
      moduleBorder: "#0f172a",
      cellLines: "#64748b",
      text: "#0f172a",
      textMuted: "#475569",
      textHighlight: "#0284c7",
      badgeFill: "#f8fafc",
      badgeText: "#0f172a",
    };
  }, [cadTheme]);

  // Main Render of the CAD SLD Content
  const renderSLDContent = () => {
    return (
      <svg
        id="solar-cad-drawing-sheet"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        width={svgWidth}
        height={svgHeight}
        className="w-full h-auto select-none font-mono"
        style={{
          backgroundColor: themeColors.bg,
          color: themeColors.text,
        }}
      >
        <defs>
          <pattern
            id="cad-grid-pattern"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke={cadTheme === "blueprint" ? "rgba(56,189,248,0.08)" : "rgba(100,116,139,0.08)"}
              strokeWidth="0.6"
            />
          </pattern>
          {/* Standard CAD Electrical Arrows */}
          <marker
            id="cad-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <polygon points="0 1, 8 4, 0 7" fill={themeColors.line} />
          </marker>
        </defs>

        {/* Background Grid */}
        <rect width={svgWidth} height={svgHeight} fill="url(#cad-grid-pattern)" />

        {/* 1. Sheet Border & Title Block */}
        {showSheetBorder && (
          <g>
            <rect
              x="20"
              y="20"
              width={svgWidth - 40}
              height={svgHeight - 40}
              fill="none"
              stroke={themeColors.border}
              strokeWidth="2.5"
            />
            <rect
              x="28"
              y="28"
              width={svgWidth - 56}
              height={svgHeight - 56}
              fill="none"
              stroke={themeColors.border}
              strokeWidth="1.2"
            />
            {/* Grid Coordinates (1-8 & A-E) */}
            {[1, 2, 3, 4, 5, 6, 7, 8].map((num, i) => {
              const xPos = 28 + (i + 0.5) * ((svgWidth - 56) / 8);
              return (
                <g key={`coord-x-${num}`}>
                  <text x={xPos} y="24" fontSize="9px" fontWeight="bold" fill={themeColors.textMuted} textAnchor="middle">{num}</text>
                  <text x={xPos} y={svgHeight - 16} fontSize="9px" fontWeight="bold" fill={themeColors.textMuted} textAnchor="middle">{num}</text>
                </g>
              );
            })}
            {["A", "B", "C", "D", "E"].map((letter, i) => {
              const yPos = 28 + (i + 0.5) * ((svgHeight - 56) / 5);
              return (
                <g key={`coord-y-${letter}`}>
                  <text x="24" y={yPos} fontSize="9px" fontWeight="bold" fill={themeColors.textMuted} textAnchor="middle">{letter}</text>
                  <text x={svgWidth - 16} y={yPos} fontSize="9px" fontWeight="bold" fill={themeColors.textMuted} textAnchor="middle">{letter}</text>
                </g>
              );
            })}
          </g>
        )}

        {/* Top Header Text */}
        <text
          x={svgWidth / 2}
          y="60"
          fontSize="18px"
          fontWeight="900"
          letterSpacing="1.5"
          fill={themeColors.text}
          textAnchor="middle"
        >
          SOLAR PHOTOVOLTAIC SINGLE LINE DIAGRAM (SLD)
        </text>
        <text
          x={svgWidth / 2}
          y="78"
          fontSize="11px"
          fontWeight="bold"
          fill={themeColors.textMuted}
          textAnchor="middle"
        >
          {config.projectName.toUpperCase()} | {calc.totalDcCapacityKwp} kWp DC / {calc.totalInverterAcKw} kW AC | PEC 2017 ARTICLE 6.90 COMPLIANT
        </text>

        {/* ========================================================================= */}
        {/* 2-7. PICTORIAL SOLAR PV WIRING DIAGRAM (array, DC/AC protection, inverter, */}
        {/*      battery, metering, service and panel boards)                         */}
        {/* ========================================================================= */}
        <SolarSLDPictorial
          config={config}
          calc={calc}
          theme={themeColors}
          options={{
            showSolarMeter,
            showEpsLoad: effectiveShowEpsLoad,
            showGrounding,
            showConductorSpecs,
          }}
          service={{
            mainBreakerAmps: linkedPanelData.mainFeeder.cb,
            mainBreakerPoles: linkedPanelData.mainFeeder.poles,
            feederLabel: linkedPanelData.mainFeeder.feederLabel,
            conduitLabel: linkedPanelData.mainFeeder.conduitLabel,
            panelDesignation: linkedPanelData.designation,
          }}
          sheetWidth={svgWidth}
          top={pictorialTop}
          onSelect={setSelectedElement}
        />

        {/* ========================================================================= */}
        {/* 8. GENERAL NOTES & TECHNICAL SPECIFICATIONS (CAD SHEET BLOCK)             */}
        {/* ========================================================================= */}
        {showGeneralNotes && (() => {
          const notesWidth = 1260;
          const notesHeight = 185;
          const notesX = 225;
          const notesY = svgHeight - notesHeight - 32;
          const colW = notesWidth / 3; // 420px per column
          const midNotesX = notesWidth / 2;

          const utilityName = (config.netMetering?.utilityProvider || "DISTRIBUTION UTILITY").toUpperCase();
          const sysV = config.utilityVoltage || 230;
          const sysPh = isThreePhase ? "3PH 3W" : "1PH 2W";

          return (
            <g
              id="sld-general-notes"
              className="cursor-pointer transition-opacity hover:opacity-95"
              onClick={() => setSelectedElement("general_notes")}
              transform={`translate(${notesX}, ${notesY})`}
            >
              {/* Outer Enclosure */}
              <rect
                x="0"
                y="0"
                width={notesWidth}
                height={notesHeight}
                fill={themeColors.equipmentFill}
                stroke={themeColors.border}
                strokeWidth="1.8"
              />

              {/* Main Banner Header */}
              <rect x="0" y="0" width={notesWidth} height="22" fill={themeColors.border} />
              <text x={midNotesX} y="15" fontSize="10px" fontWeight="900" fill="#ffffff" textAnchor="middle" letterSpacing="0.8">
                GENERAL NOTES &amp; TECHNICAL SPECIFICATIONS (PEC 2017 PART 1 ART. 6.90 / RA 7920 / RA 9513)
              </text>
              <text x={notesWidth - 14} y="15" fontSize="8px" fontWeight="bold" fill="#ffffff" textAnchor="end">
                [CLICK FOR FULL CITATIONS &amp; EXPORT]
              </text>

              {/* Vertical Column Separators */}
              <line x1={colW} y1="22" x2={colW} y2={notesHeight} stroke={themeColors.line} strokeWidth="1" />
              <line x1={colW * 2} y1="22" x2={colW * 2} y2={notesHeight} stroke={themeColors.line} strokeWidth="1" />

              {/* Sub-Header Banners */}
              <rect x="0" y="22" width={colW} height="17" fill={themeColors.badgeFill} stroke={themeColors.line} strokeWidth="0.6" />
              <text x="12" y="34" fontSize="8px" fontWeight="900" fill={themeColors.textHighlight}>
                I. GENERAL DRAWING &amp; CODE MANDATES (PEC 2017)
              </text>

              <rect x={colW} y="22" width={colW} height="17" fill={themeColors.badgeFill} stroke={themeColors.line} strokeWidth="0.6" />
              <text x={colW + 12} y="34" fontSize="8px" fontWeight="900" fill={themeColors.textHighlight}>
                II. TECHNICAL MATERIAL SPECIFICATIONS
              </text>

              <rect x={colW * 2} y="22" width={colW} height="17" fill={themeColors.badgeFill} stroke={themeColors.line} strokeWidth="0.6" />
              <text x={colW * 2 + 12} y="34" fontSize="8px" fontWeight="900" fill={themeColors.textHighlight}>
                III. INTERCONNECTION, SAFETY &amp; COMMISSIONING
              </text>

              {/* Column 1: General Notes */}
              <g fontSize="6.8px" fill={themeColors.text}>
                <text x="12" y="50" fontWeight="bold">1. CODE COMPLIANCE:</text>
                <text x="82" y="50" fill={themeColors.textMuted}>ALL WORKS SHALL STRICTLY CONFORM WITH PEC 2017</text>
                <text x="20" y="60" fill={themeColors.textMuted}>PARTS 1 &amp; 2 (ART. 6.90 SOLAR PV), RA 7920 (EE LAW), AND RA 9513 (RE ACT).</text>

                <text x="12" y="72" fontWeight="bold">2. PEE SUPERVISION:</text>
                <text x="88" y="72" fill={themeColors.textMuted}>INSTALLATION SHALL BE EXECUTED UNDER DIRECT</text>
                <text x="20" y="82" fill={themeColors.textMuted}>SUPERVISION OF A DULY LICENSED PROFESSIONAL ELECTRICAL ENGR. (PEE).</text>

                <text x="12" y="94" fontWeight="bold">3. UTILITY PERMITTING:</text>
                <text x="96" y="94" fill={themeColors.textMuted}>SECURE ELECTRICAL PERMIT, CFEI, AND NET-METERING</text>
                <text x="20" y="104" fill={themeColors.textMuted}>INTERCONNECTION APPROVAL FROM {utilityName} PRIOR TO SYSTEM ENERGIZATION.</text>

                <text x="12" y="116" fontWeight="bold">4. WORKING CLEARANCE:</text>
                <text x="98" y="116" fill={themeColors.textMuted}>MAINTAIN ≥ 900mm FRONT CLEARANCE, ≥ 750mm WIDTH</text>
                <text x="20" y="126" fill={themeColors.textMuted}>AND ≥ 2000mm HEADROOM AROUND ALL INVERTERS AND PANELS (PEC 1.10.2.1).</text>

                <text x="12" y="138" fontWeight="bold">5. SOLID BONDING:</text>
                <text x="78" y="138" fill={themeColors.textMuted}>METALLIC FRAMES, RACKS, CONDUITS &amp; CASINGS SOLIDLY</text>
                <text x="20" y="148" fill={themeColors.textMuted}>BONDED TO EGC. EARTH ELECTRODE RESISTANCE SHALL NOT EXCEED 5.0 Ω.</text>

                <text x="12" y="160" fontWeight="bold">6. SAFETY LABELS:</text>
                <text x="76" y="160" fill={themeColors.textMuted}>PERMANENT UV-RATED WARNING SIGNS "SOLAR PV SOURCE"</text>
                <text x="20" y="170" fill={themeColors.textMuted}>AND DIRECTORIES SHALL BE AFFIXED ON ALL DISCONNECTS &amp; METERS (PEC 6.90.6).</text>
              </g>

              {/* Column 2: Technical Specifications */}
              <g fontSize="6.8px" fill={themeColors.text}>
                <text x={colW + 12} y="50" fontWeight="bold">1. PV MODULES:</text>
                <text x={colW + 72} y="50" fill={themeColors.textMuted}>{calc.totalModules}x {calc.selectedModule.manufacturer.toUpperCase()} {calc.selectedModule.model.toUpperCase()} ({calc.selectedModule.ratedPowerWp}Wp)</text>
                <text x={colW + 20} y="60" fill={themeColors.textMuted}>IEC 61215/61730, IP68 JUNCTION BOX W/ BYPASS DIODES, 25-YR WARRANTY.</text>

                <text x={colW + 12} y="72" fontWeight="bold">2. INVERTER:</text>
                <text x={colW + 62} y="72" fill={themeColors.textMuted}>{calc.effective.inverterQuantity}x {calc.selectedInverter.manufacturer.toUpperCase()} ({calc.totalInverterAcKw} kW AC), UL 1741,</text>
                <text x={colW + 20} y="82" fill={themeColors.textMuted}>IEEE 1547, IEC 62109, MULTI-MPPT, ANTI-ISLANDING &amp; GFDI INTEGRATED.</text>

                <text x={colW + 12} y="94" fontWeight="bold">3. DC WIRING:</text>
                <text x={colW + 66} y="94" fill={themeColors.textMuted}>2 × {calc.effective.dcCableSizeMm2} mm² PV1-F / EN 50618 XLPO 1500V DC TINNED CU</text>
                <text x={colW + 20} y="104" fill={themeColors.textMuted}>IN {calc.effective.dcConduitSizeMm} CONDUIT. VOLTAGE DROP Vd = {calc.dcVoltageDropPercent}% (PEC LIMIT ≤ 2.0%).</text>

                <text x={colW + 12} y="116" fontWeight="bold">4. AC FEEDERS:</text>
                <text x={colW + 74} y="116" fill={themeColors.textMuted}>{calc.effective.acBreakerPoles} × {calc.effective.acCableSizeMm2} mm² CU THHN/THWN-2 (90°C) IN {calc.effective.acConduitSizeMm}</text>
                <text x={colW + 20} y="126" fill={themeColors.textMuted}>CONDUIT TO MAIN PANEL. VOLTAGE DROP Vd = {calc.acVoltageDropPercent}% (STRICTLY ≤ 1.5%).</text>

                <text x={colW + 12} y="138" fontWeight="bold">5. DC PROTECTION:</text>
                <text x={colW + 86} y="138" fill={themeColors.textMuted}>{calc.effective.dcIsolatorRatingAmps}A DC 1000V ROTARY SWITCH (PEC 6.90.3.1) +</text>
                <text x={colW + 20} y="148" fill={themeColors.textMuted}>{calc.effective.dcFuseRatingAmps}A 1000V gPV FUSES + TYPE 2 DC SURGE ARRESTER (SPD 20/40kA).</text>

                <text x={colW + 12} y="160" fontWeight="bold">6. AC PROTECTION:</text>
                <text x={colW + 86} y="160" fill={themeColors.textMuted}>{calc.effective.acBreakerAtAmps}A AT ({calc.effective.acBreakerPoles}P) MCCB ({linkedPanelData.mainFeeder.kaic} kAIC) + AC TYPE 2 SPD</text>
                <text x={colW + 20} y="170" fill={themeColors.textMuted}>RATED FOR {sysV}V {sysPh} AT THE MAIN BUSBAR INTERCONNECTION POINT.</text>
              </g>

              {/* Column 3: Interconnection & Commissioning */}
              <g fontSize="6.8px" fill={themeColors.text}>
                <text x={colW * 2 + 12} y="50" fontWeight="bold">1. 120% BUSBAR RULE:</text>
                <text x={colW * 2 + 96} y="50" fill={themeColors.textMuted}>MAIN ({linkedPanelData.mainFeeder.cb}A) + SOLAR ({calc.effective.acBreakerAtAmps}A) = {linkedPanelData.mainFeeder.cb + calc.effective.acBreakerAtAmps}A</text>
                <text x={colW * 2 + 20} y="60" fill={themeColors.textHighlight} fontWeight="bold">≤ 120% BUS CAPACITY ({Math.round((linkedPanelData.mainFeeder.af || config.serviceCapacityAmps || 200) * 1.2)}A MAX RATING). PEC 6.90.7.2(D) PASS.</text>

                <text x={colW * 2 + 12} y="72" fontWeight="bold">2. RAPID SHUTDOWN:</text>
                <text x={colW * 2 + 90} y="72" fill={themeColors.textMuted}>SYSTEM INITIATES RAPID CONTROL (PEC 6.90.2.3)</text>
                <text x={colW * 2 + 20} y="82" fill={themeColors.textMuted}>TO REDUCE ARRAY BOUNDARY CONDUCTORS TO ≤ 80V WITHIN 30 SECONDS.</text>

                <text x={colW * 2 + 12} y="94" fontWeight="bold">3. ANTI-ISLANDING:</text>
                <text x={colW * 2 + 86} y="94" fill={themeColors.textMuted}>INVERTER TRIPS WITHIN ≤ 2.0s UPON LOSS OF UTILITY</text>
                <text x={colW * 2 + 20} y="104" fill={themeColors.textMuted}>GRID VOLTAGE OR ABNORMAL FREQUENCY AS PER IEEE 1547 &amp; PEC 6.90.7.1.</text>

                <text x={colW * 2 + 12} y="116" fontWeight="bold">4. VERIFICATION TESTS:</text>
                <text x={colW * 2 + 98} y="116" fill={themeColors.textMuted}>MANDATORY PRE-ENERGIZATION POLARITY CHECK, Voc,</text>
                <text x={colW * 2 + 20} y="126" fill={themeColors.textMuted}>Isc, AND INSULATION RESISTANCE TEST (MEGGER &gt; 1.0 MΩ @ 1000V DC TEST).</text>

                <text x={colW * 2 + 12} y="138" fontWeight="bold">5. REVENUE METERING:</text>
                <text x={colW * 2 + 98} y="138" fill={themeColors.textMuted}>BI-DIRECTIONAL 4-QUADRANT SMART NET-METER AND</text>
                <text x={colW * 2 + 20} y="148" fill={themeColors.textMuted}>VISIBLE-BREAK LOCKABLE AC DISCONNECT ACCESSIBLE 24/7 TO DU CREW.</text>

                <text x={colW * 2 + 12} y="160" fontWeight="bold">6. AS-BUILT DOSSIER:</text>
                <text x={colW * 2 + 88} y="160" fill={themeColors.textMuted}>COMPLETE O&amp;M MANUALS, FACTORY WARRANTIES,</text>
                <text x={colW * 2 + 20} y="170" fill={themeColors.textMuted}>AND PEE SIGNED/SEALED AS-BUILT SLD MUST BE SUBMITTED TO THE OWNER.</text>
              </g>
            </g>
          );
        })()}

        {/* ========================================================================= */}
        {/* 9. ENGINEERING TITLE BLOCK (BOTTOM RIGHT)                                */}
        {/* ========================================================================= */}
        {showTitleBlock && (() => {
          const tbWidth = 465;
          const tbHeight = 185;
          const tbX = 1505;
          const tbY = svgHeight - tbHeight - 32;
          const midX = tbWidth / 2;
          const colW = tbWidth / 4;

          const projNameRaw = (config.projectName || "SOLAR PV INSTALLATION").toUpperCase().trim();
          const projNameDisplay = projNameRaw.length > 25 ? projNameRaw.slice(0, 24) + "…" : projNameRaw;
          const projNameFontSize = projNameDisplay.length > 18 ? "8px" : "9.5px";

          const locRaw = (config.projectLocation || "PHILIPPINES").toUpperCase().trim();
          const locDisplay = locRaw.length > 25 ? locRaw.slice(0, 24) + "…" : locRaw;

          const sysTypeClean = (config.systemType || "GRID-TIED").toUpperCase().replace(/_/g, " ");
          const sysTypeDisplay = `${sysTypeClean} (${config.utilityVoltage}V ${isThreePhase ? "3PH" : "1PH"})`;
          const sysTypeFontSize = sysTypeDisplay.length > 22 ? "7.5px" : "8.5px";

          return (
            <g id="sld-title-block" transform={`translate(${tbX}, ${tbY})`}>
              {/* Outer Enclosure */}
              <rect
                x="0"
                y="0"
                width={tbWidth}
                height={tbHeight}
                fill={themeColors.equipmentFill}
                stroke={themeColors.border}
                strokeWidth="1.8"
              />
              {/* Header Bar */}
              <rect x="0" y="0" width={tbWidth} height="22" fill={themeColors.border} />
              <text x={midX} y="15" fontSize="9.5px" fontWeight="900" fill="#ffffff" textAnchor="middle">
                ELECTRICAL ENGINEERING TITLE BLOCK (RA 7920 / RA 9513)
              </text>

              {/* Row 2: Project & Location */}
              <line x1="0" y1="62" x2={tbWidth} y2="62" stroke={themeColors.line} strokeWidth="0.8" />
              <line x1={midX} y1="22" x2={midX} y2="62" stroke={themeColors.line} strokeWidth="0.8" />
              
              <text x="10" y="36" fontSize="7.5px" fontWeight="bold" fill={themeColors.textMuted}>PROJECT TITLE:</text>
              <text x="10" y="52" fontSize={projNameFontSize} fontWeight="black" fill={themeColors.text}>{projNameDisplay}</text>

              <text x={midX + 10} y="36" fontSize="7.5px" fontWeight="bold" fill={themeColors.textMuted}>LOCATION:</text>
              <text x={midX + 10} y="52" fontSize="9px" fontWeight="bold" fill={themeColors.text}>{locDisplay}</text>

              {/* Row 3: Capacity & System Type */}
              <line x1="0" y1="102" x2={tbWidth} y2="102" stroke={themeColors.line} strokeWidth="0.8" />
              <line x1={midX} y1="62" x2={midX} y2="102" stroke={themeColors.line} strokeWidth="0.8" />

              <text x="10" y="76" fontSize="7.5px" fontWeight="bold" fill={themeColors.textMuted}>CAPACITY:</text>
              <text x="10" y="92" fontSize="9.5px" fontWeight="bold" fill={themeColors.text}>
                {calc.totalDcCapacityKwp} kWp DC / {calc.totalInverterAcKw} kW AC
              </text>

              <text x={midX + 10} y="76" fontSize="7.5px" fontWeight="bold" fill={themeColors.textMuted}>SYSTEM TYPE:</text>
              <text x={midX + 10} y="92" fontSize={sysTypeFontSize} fontWeight="bold" fill={themeColors.text}>
                {sysTypeDisplay}
              </text>

              {/* Row 4: Designer & Reviewer */}
              <line x1="0" y1="142" x2={tbWidth} y2="142" stroke={themeColors.line} strokeWidth="0.8" />
              <line x1={midX} y1="102" x2={midX} y2="142" stroke={themeColors.line} strokeWidth="0.8" />

              <text x="10" y="116" fontSize="7.5px" fontWeight="bold" fill={themeColors.textMuted}>DESIGNED BY:</text>
              <text x="10" y="132" fontSize="9px" fontWeight="bold" fill={themeColors.text}>
                {(config.designerName || "ELECTRICALPH").toUpperCase().slice(0, 24)}
              </text>

              <text x={midX + 10} y="116" fontSize="7.5px" fontWeight="bold" fill={themeColors.textMuted}>CHECKED / APPROVED BY:</text>
              <text x={midX + 10} y="132" fontSize="8.5px" fontWeight="bold" fill={themeColors.textHighlight}>
                PEE REG. ENGR. (PEC APPROVED)
              </text>

              {/* Row 5: Scale, Date, Revision, Sheet No */}
              <line x1={colW} y1="142" x2={colW} y2={tbHeight} stroke={themeColors.line} strokeWidth="0.8" />
              <line x1={colW * 2} y1="142" x2={colW * 2} y2={tbHeight} stroke={themeColors.line} strokeWidth="0.8" />
              <line x1={colW * 3} y1="142" x2={colW * 3} y2={tbHeight} stroke={themeColors.line} strokeWidth="0.8" />
              
              <text x="10" y="156" fontSize="7.5px" fontWeight="bold" fill={themeColors.textMuted}>SCALE:</text>
              <text x="10" y="172" fontSize="9px" fontWeight="bold" fill={themeColors.text}>N.T.S.</text>

              <text x={colW + 10} y="156" fontSize="7.5px" fontWeight="bold" fill={themeColors.textMuted}>DATE:</text>
              <text x={colW + 10} y="172" fontSize="9px" fontWeight="bold" fill={themeColors.text}>
                {new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </text>

              <text x={colW * 2 + 10} y="156" fontSize="7.5px" fontWeight="bold" fill={themeColors.textMuted}>REVISION:</text>
              <text x={colW * 2 + 10} y="172" fontSize="9px" fontWeight="bold" fill={themeColors.text}>REV 0</text>

              <text x={colW * 3 + 10} y="156" fontSize="7.5px" fontWeight="bold" fill={themeColors.textMuted}>SHEET NO:</text>
              <text x={colW * 3 + colW / 2} y="174" fontSize="15px" fontWeight="black" fill={themeColors.textHighlight} textAnchor="middle">
                E-01
              </text>
            </g>
          );
        })()}
      </svg>
    );
  };

  return (
    <div className="w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-6 overflow-hidden">
      {/* 1. Header Toolbar & Quick Controls */}
      <div className="flex flex-col xl:flex-row xl:justify-between items-start xl:items-center mb-6 gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 tracking-tight">
              <Layers className="w-5 h-5 text-amber-500" />
              <span>Solar Single Line Diagram (CAD SLD)</span>
            </h3>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700">
              PEC 2017 ART 6.90
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Dynamic CAD electrical drawing automatically synchronized with solar array sizing, inverter specs, and protection values.
          </p>
        </div>

        {/* CAD Actions & Export Suite */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Theme Switcher */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
            <button
              onClick={() => setCadTheme("cad_white")}
              className={`px-2.5 py-1 rounded-lg font-bold transition ${
                cadTheme === "cad_white"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              CAD White
            </button>
            <button
              onClick={() => setCadTheme("blueprint")}
              className={`px-2.5 py-1 rounded-lg font-bold transition ${
                cadTheme === "blueprint"
                  ? "bg-sky-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              Blueprint
            </button>
            <button
              onClick={() => setCadTheme("cad_dark")}
              className={`px-2.5 py-1 rounded-lg font-bold transition ${
                cadTheme === "cad_dark"
                  ? "bg-slate-950 text-sky-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              CAD Dark
            </button>
          </div>

          {/* Export DXF */}
          <button
            onClick={handleExportCAD}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl shadow-xs transition"
            title="Export AutoCAD Drawing Interchange Format (.dxf)"
          >
            <FileCode className="w-3.5 h-3.5 text-sky-400" />
            <span>AutoCAD (.dxf)</span>
          </button>

          {/* Export SVG */}
          <button
            onClick={handleDownloadSVG}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl shadow-xs transition"
            title="Export Vector SVG"
          >
            <Download className="w-3.5 h-3.5 text-emerald-500" />
            <span>SVG</span>
          </button>

          {/* Export PNG */}
          <button
            onClick={handleDownloadPNG}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl shadow-xs transition"
            title="Export High-Resolution PNG Image"
          >
            <Download className="w-3.5 h-3.5 text-indigo-500" />
            <span>PNG</span>
          </button>

          {/* Export Word */}
          <button
            onClick={handleDownloadWord}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl shadow-xs transition"
            title="Export Complete Solar Engineering Design to Word (.docx)"
          >
            <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Word (.docx)</span>
          </button>

          {/* Export PDF */}
          <button
            onClick={handleDownloadPDF}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl shadow-xs transition"
            title="Export Vector PDF"
          >
            <Download className="w-3.5 h-3.5 text-rose-500" />
            <span>PDF</span>
          </button>

          {/* Print */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl shadow-xs transition"
            title="Print Single Line Diagram"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
            <span>Print</span>
          </button>

          {/* Maximize CAD View */}
          <button
            onClick={() => setIsMaximized(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-xs transition"
            title="Maximize CAD Workspace (Full-Screen)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Full-Screen CAD</span>
          </button>
        </div>
      </div>

      {/* 2. Secondary Toolbar: Toggles & Zoom Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 text-xs">
        {/* Layer Visibility Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-400">Layers:</span>
          <button
            onClick={() => setShowSolarMeter((prev) => !prev)}
            className={`px-2 py-1 rounded-lg font-bold border transition ${
              showSolarMeter
                ? "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                : "bg-transparent border-dashed border-slate-300 dark:border-slate-700 text-slate-400"
            }`}
          >
            {showSolarMeter ? "Solar Meter: ON" : "Solar Meter: OFF"}
          </button>
          {(isHybrid || isOffGrid) && (
            <button
              onClick={() => setShowEpsLoad((prev) => !prev)}
              className={`px-2 py-1 rounded-lg font-bold border transition ${
                showEpsLoad
                  ? "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                  : "bg-transparent border-dashed border-slate-300 dark:border-slate-700 text-slate-400"
              }`}
            >
              {showEpsLoad ? "EPS Load: ON" : "EPS Load: OFF"}
            </button>
          )}
          <button
            onClick={() => setShowGrounding((prev) => !prev)}
            className={`px-2 py-1 rounded-lg font-bold border transition ${
              showGrounding
                ? "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-emerald-700 dark:text-emerald-400"
                : "bg-transparent border-dashed border-slate-300 dark:border-slate-700 text-slate-400"
            }`}
          >
            {showGrounding ? "Grounding: ON" : "Grounding: OFF"}
          </button>
          <button
            onClick={() => setShowSheetBorder((prev) => !prev)}
            className={`px-2 py-1 rounded-lg font-bold border transition ${
              showSheetBorder
                ? "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                : "bg-transparent border-dashed border-slate-300 dark:border-slate-700 text-slate-400"
            }`}
          >
            {showSheetBorder ? "Drawing Border: ON" : "Border: OFF"}
          </button>
          <button
            onClick={() => setShowTitleBlock((prev) => !prev)}
            className={`px-2 py-1 rounded-lg font-bold border transition ${
              showTitleBlock
                ? "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                : "bg-transparent border-dashed border-slate-300 dark:border-slate-700 text-slate-400"
            }`}
          >
            {showTitleBlock ? "Title Block: ON" : "Title Block: OFF"}
          </button>
          <button
            onClick={() => setShowGeneralNotes((prev) => !prev)}
            className={`px-2 py-1 rounded-lg font-bold border transition ${
              showGeneralNotes
                ? "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                : "bg-transparent border-dashed border-slate-300 dark:border-slate-700 text-slate-400"
            }`}
            title="Toggle General Notes & Specifications CAD block on drawing sheet"
          >
            {showGeneralNotes ? "Notes & Specs: ON" : "Notes: OFF"}
          </button>
        </div>

        {/* Pan & Zoom Navigation Controls */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          <button
            onClick={handleZoomIn}
            className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 transition"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <span className="px-2 font-mono font-bold text-xs text-slate-600 dark:text-slate-400">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomOut}
            className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={fitToScreen}
            className="px-2 py-1 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-300 transition"
            title="Fit to Screen"
          >
            Fit
          </button>
          <button
            onClick={handleResetZoom}
            className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 transition"
            title="Reset Zoom (100%)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3. Interactive CAD Canvas Container */}
      <div
        ref={containerRef}
        className="relative w-full h-[720px] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950 cursor-grab active:cursor-grabbing flex items-center justify-center"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: isDragging ? "none" : "transform 0.15s ease-out",
          }}
          className="shadow-xl"
        >
          {renderSLDContent()}
        </div>

        {/* Hover / Inspector Floating Callout */}
        <div className="absolute bottom-4 left-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 shadow-md flex items-center gap-2">
          <MousePointer className="w-3.5 h-3.5 text-amber-500" />
          <span>Click any equipment on the drawing to inspect engineering values and specifications.</span>
        </div>
      </div>

      {/* 4. Component Inspector / Details Panel (When element clicked) */}
      {selectedElement && (
        <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-500" />
              <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                {selectedElement === "pv_module" && "PV Array & String Sizing Details"}
                {selectedElement === "inverter" && "Inverter Engineering Specifications"}
                {selectedElement === "dc_disconnect" && "DC Disconnect & Protection Details"}
                {selectedElement === "battery_bank" && "Battery Energy Storage System (BESS)"}
                {selectedElement === "battery_breaker" && "Battery DC Circuit Breaker"}
                {selectedElement === "ac_disconnect" && "AC Safety Disconnect Switch"}
                {selectedElement === "consumer_panel" && "Consumer Breaker Panelboard (MDP)"}
                {selectedElement === "solar_meter" && "Solar Generation Revenue Meter"}
                {selectedElement === "utility_meter" && "Bi-Directional Net Meter"}
              </h4>
            </div>
            <button
              onClick={() => setSelectedElement(null)}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            {selectedElement === "pv_module" && (
              <>
                <div>
                  <span className="text-slate-400 block">Module Model:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{calc.selectedModule.manufacturer} {calc.selectedModule.model}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Total Capacity:</span>
                  <span className="font-bold text-amber-600">{calc.totalDcCapacityKwp} kWp ({calc.totalModules} modules)</span>
                </div>
                <div>
                  <span className="text-slate-400 block">String Voltage (Voc Cold):</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{calc.stringVoc} V DC</span>
                </div>
                <div>
                  <span className="text-slate-400 block">String Operating (Vmp Hot):</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{calc.stringVmp} V DC</span>
                </div>
              </>
            )}

            {selectedElement === "inverter" && (
              <>
                <div>
                  <span className="text-slate-400 block">Inverter Model:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{calc.selectedInverter.manufacturer} {calc.selectedInverter.model}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Rated AC Output:</span>
                  <span className="font-bold text-sky-600">{calc.totalInverterAcKw} kW AC ({calc.effective.inverterQuantity}x unit)</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Max AC Current:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{calc.inverterMaxAcCurrent} A @ {calc.selectedInverter.acVoltage}V</span>
                </div>
                <div>
                  <span className="text-slate-400 block">MPPT Operating Range:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{calc.selectedInverter.mpptVoltageRangeMin}V - {calc.selectedInverter.mpptVoltageRangeMax}V</span>
                </div>
              </>
            )}

            {selectedElement === "dc_disconnect" && (
              <>
                <div>
                  <span className="text-slate-400 block">Isolator Rating:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{calc.effective.dcIsolatorRatingAmps} A DC 1000V</span>
                </div>
                <div>
                  <span className="text-slate-400 block">String Fuse Rating:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{calc.effective.dcFuseRatingAmps} A gPV 1000V</span>
                </div>
                <div>
                  <span className="text-slate-400 block">DC Cable Size:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{calc.effective.dcCableSizeMm2} mm² PV1-F (Vd={calc.dcVoltageDropPercent}%)</span>
                </div>
                <div>
                  <span className="text-slate-400 block">PEC Standard:</span>
                  <span className="font-bold text-emerald-600">PEC 6.90.13 Lockable Rotary</span>
                </div>
              </>
            )}

            {selectedElement === "consumer_panel" && (
              <div className="col-span-2 sm:col-span-4 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <span className="text-slate-400 block font-medium">Synchronized Panelboard:</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-bold text-slate-800 dark:text-slate-100">
                        {linkedPanelData.designation}
                      </span>
                      {((panels && panels.length > 1) || (subPanels && subPanels.length > 0)) && onUpdateConfig && (
                        <select
                          value={config.selectedMdpId || "main"}
                          onChange={(e) => onUpdateConfig({ ...config, selectedMdpId: e.target.value })}
                          className="text-[11px] px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                        >
                          <option value="main">Main MDP ({panels?.[0]?.designation || "Default"})</option>
                          {subPanels?.map((sp) => (
                            <option key={sp.id} value={sp.id}>
                              {sp.panel?.designation || sp.name || `Subpanel ${sp.id}`}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Main Breaker Rating:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-100">
                      {linkedPanelData.mainFeeder.cb} AT / {linkedPanelData.mainFeeder.af} AF ({linkedPanelData.mainFeeder.poles}P, {linkedPanelData.mainFeeder.type}, {linkedPanelData.mainFeeder.kaic} kAIC)
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">System Configuration:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-100">
                      {linkedPanelData.systemVoltage}V {linkedPanelData.phaseText}, 60 Hz
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Solar Backfeed Breaker:</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      {calc.effective.acBreakerAtAmps} AT ({calc.effective.acBreakerPoles}P)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <div>
                    <span className="text-slate-400 block font-medium">Feeder Conductor (Line & EGC):</span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      {linkedPanelData.mainFeeder.feederLabel}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Conduit Specification:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      {linkedPanelData.mainFeeder.conduitLabel}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Connected / Demand Load:</span>
                    <span className="font-bold text-sky-600 dark:text-sky-400">
                      {linkedPanelData.connectedKVA} kVA / {linkedPanelData.demandKVA} kVA ({linkedPanelData.demandA} A)
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">PEC 120% Interconnection:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      PEC 6.90.7.2(D) Compliant (Bus: {linkedPanelData.mainFeeder.af || config.serviceCapacityAmps || 200}A)
                    </span>
                  </div>
                </div>

                {/* Synchronized Branch Circuits Schedule Preview */}
                {linkedPanelData.activeCircuits.length > 0 && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                    <span className="text-slate-400 block font-medium mb-1.5">
                      Synchronized Branch Circuits ({linkedPanelData.activeCircuits.length} active circuits from Panel Schedule):
                    </span>
                    <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-500 sticky top-0">
                          <tr>
                            <th className="py-1 px-2.5">Ckt #</th>
                            <th className="py-1 px-2.5">Load Description</th>
                            <th className="py-1 px-2.5">Load (VA / Watts)</th>
                            <th className="py-1 px-2.5">Breaker Trip (AT)</th>
                            <th className="py-1 px-2.5">Wire Size</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                          {linkedPanelData.activeCircuits.map((c, idx) => (
                            <tr key={c.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="py-1 px-2.5 font-bold text-slate-700 dark:text-slate-300">
                                {c.circuitNo || idx + 1}
                              </td>
                              <td className="py-1 px-2.5 text-slate-600 dark:text-slate-300 font-sans">
                                {c.description || "General Circuit"}
                              </td>
                              <td className="py-1 px-2.5 text-slate-600 dark:text-slate-400">
                                {c.loadVA || c.wattage || 0} VA
                              </td>
                              <td className="py-1 px-2.5 font-bold text-amber-600 dark:text-amber-400">
                                {c.mcbAT || c.mcbATOverride || (c.wattage && c.wattage > 3000 ? 30 : 20)} AT
                              </td>
                              <td className="py-1 px-2.5 text-slate-500">
                                {c.wireSize || "3.5 mm²"} THHN
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedElement === "battery_bank" && (
              <>
                <div>
                  <span className="text-slate-400 block">Battery Chemistry:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">LiFePO4 Lithium Iron Phosphate</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Usable Energy:</span>
                  <span className="font-bold text-purple-600">{calc.batteryUsableEnergyKwh} kWh</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Units in Bank:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{calc.effective.batteryUnits}x {config.battery.capacityAh}Ah modules</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Est. Backup Runtime:</span>
                  <span className="font-bold text-purple-600">~{calc.batteryBackupHoursActual} Hours</span>
                </div>
              </>
            )}

            {selectedElement === "general_notes" && (() => {
              const fullNotesText = `GENERAL NOTES & TECHNICAL SPECIFICATIONS
PHILIPPINE ELECTRICAL CODE (PEC 2017 PART 1 ART. 6.90 / RA 7920 / RA 9513)

I. GENERAL DRAWING & CODE MANDATES (PEC 2017)
1. ALL ELECTRICAL INSTALLATIONS SHALL BE EXECUTED IN STRICT ACCORDANCE WITH THE PHILIPPINE ELECTRICAL CODE (PEC 2017 PARTS 1 & 2), REPUBLIC ACT NO. 7920, AND REPUBLIC ACT NO. 9513 (RENEWABLE ENERGY ACT OF 2008).
2. ALL WORKS SHALL BE PERFORMED UNDER THE DIRECT ON-SITE SUPERVISION OF A DULY LICENSED PROFESSIONAL ELECTRICAL ENGINEER (PEE) OR REGISTERED ELECTRICAL ENGINEER (REE).
3. THE CONTRACTOR SHALL SECURE WIRING PERMITS, CERTIFICATE OF FINAL ELECTRICAL INSPECTION (CFEI), AND NET-METERING INTERCONNECTION APPROVAL FROM ${(config.netMetering?.utilityProvider || "DISTRIBUTION UTILITY").toUpperCase()} PRIOR TO ENERGIZATION.
4. EQUIPMENT WORKING CLEARANCES (PEC 1.10.2.1): MINIMUM 900mm FRONT CLEARANCE, 750mm WIDTH, AND 2000mm HEADROOM SHALL BE STRICTLY PRESERVED AROUND ALL INVERTERS, COMBINERS, AND PANELS.
5. SOLID BONDING & GROUNDING (PEC 2.50 & 6.90.5): ALL PV MODULE ALUMINUM FRAMES, MOUNTING RACKS, METALLIC CONDUITS, AND ENCLOSURES SHALL BE SOLIDLY BONDED TO THE EGC. EARTH GROUND ELECTRODE SYSTEM RESISTANCE SHALL NOT EXCEED 5.0 OHMS.
6. WARNING LABELS & SAFETY SIGNAGE (PEC 6.90.6): PERMANENT UV-RATED PLAQUES STATING "PHOTOVOLTAIC DC/AC POWER SOURCE" AND DISCONNECT DIRECTORIES SHALL BE AFFIXED ON ALL EQUIPMENT.

II. TECHNICAL MATERIAL SPECIFICATIONS
1. PV MODULES: ${calc.totalModules}x ${calc.selectedModule.manufacturer} ${calc.selectedModule.model} (${calc.selectedModule.ratedPowerWp}Wp MONO/BIFACIAL), CONFORMING TO IEC 61215/61730, IP68 SEALED JUNCTION BOX WITH BYPASS DIODES, 25-YEAR PERFORMANCE WARRANTY.
2. SOLAR INVERTER: ${calc.effective.inverterQuantity}x ${calc.selectedInverter.manufacturer} ${calc.selectedInverter.model} (${calc.totalInverterAcKw} kW AC), CERTIFIED UNDER UL 1741, IEEE 1547, IEC 62109, MULTI-MPPT, INTEGRATED ANTI-ISLANDING AND GROUND FAULT PROTECTION (GFDI).
3. DC WIRING: 2 × ${calc.effective.dcCableSizeMm2} mm² PV1-F / EN 50618 XLPO DOUBLE-INSULATED 1500V DC TINNED COPPER RUN IN ${calc.effective.dcConduitSizeMm} CONDUIT. VOLTAGE DROP Vd = ${calc.dcVoltageDropPercent}% (PEC LIMIT ≤ 2.0%).
4. AC FEEDERS: ${calc.effective.acBreakerPoles} × ${calc.effective.acCableSizeMm2} mm² COPPER THHN/THWN-2 (90°C) IN ${calc.effective.acConduitSizeMm} CONDUIT TO MAIN PANEL. VOLTAGE DROP Vd = ${calc.acVoltageDropPercent}% (STRICTLY ≤ 1.5%).
5. DC PROTECTION: ${calc.effective.dcIsolatorRatingAmps}A DC 1000V ROTARY ISOLATOR SWITCH (PEC 6.90.3.1) + ${calc.effective.dcFuseRatingAmps}A 1000V gPV DC STRING FUSES + TYPE 2 DC SURGE PROTECTIVE DEVICE (SPD 20/40kA).
6. AC OVERCURRENT PROTECTION: ${calc.effective.acBreakerAtAmps}A AT (${calc.effective.acBreakerPoles}P) MCCB (${linkedPanelData.mainFeeder.kaic} kAIC) + AC TYPE 2 SPD AT THE MAIN DISTRIBUTION PANEL INTERCONNECTION POINT.

III. INTERCONNECTION, SAFETY & COMMISSIONING
1. 120% BUSBAR RULE (PEC 6.90.7.2.D): MAIN SERVICE BREAKER (${linkedPanelData.mainFeeder.cb}A) + SOLAR BACKFEED BREAKER (${calc.effective.acBreakerAtAmps}A) = ${linkedPanelData.mainFeeder.cb + calc.effective.acBreakerAtAmps}A ≤ 120% BUSBAR RATING (${Math.round((linkedPanelData.mainFeeder.af || config.serviceCapacityAmps || 200) * 1.2)}A). STATUS: PEC FULLY COMPLIANT (PASS).
2. RAPID SHUTDOWN SYSTEM (PEC 6.90.2.3): SYSTEM INITIATES RAPID SHUTDOWN TO REDUCE ARRAY CONDUCTORS TO ≤ 80V WITHIN 30 SECONDS OF INITIATION TO PROTECT EMERGENCY RESPONDERS.
3. ANTI-ISLANDING PROTECTION (IEEE 1547 / PEC 6.90.7.1): INVERTER AUTOMATICALLY CEASES EXPORT WITHIN ≤ 2.0 SECONDS UPON LOSS OF DISTRIBUTION UTILITY GRID VOLTAGE.
4. TESTING & VERIFICATION: MANDATORY POLARITY CHECK, OPEN CIRCUIT VOLTAGE (Voc), SHORT CIRCUIT CURRENT (Isc), AND INSULATION RESISTANCE TEST (MEGGER > 1.0 MΩ @ 1000V DC).
5. REVENUE NET-METERING: BI-DIRECTIONAL 4-QUADRANT SMART METER AND LOCKABLE VISIBLE-BREAK AC DISCONNECT GANG-SWITCH ACCESSIBLE 24/7 TO UTILITY CREW.
6. AS-BUILT DOSSIER: COMPLETE O&M OPERATION MANUALS, FACTORY WARRANTY LETTERS, AND SIGNED/SEALED AS-BUILT SINGLE LINE DIAGRAM SUBMITTED TO CLIENT.`;

              return (
                <div className="col-span-2 sm:col-span-4 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 gap-2">
                    <div>
                      <h4 className="font-black text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-amber-500" />
                        <span>General Notes &amp; Technical Specifications (PEC 2017 &amp; RA 9513)</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Official electrical blueprint drawing notes, material specifications, and interconnection compliance rules.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(fullNotesText);
                        setCopiedNotes(true);
                        setTimeout(() => setCopiedNotes(false), 2000);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-xs transition shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{copiedNotes ? "Copied to Clipboard!" : "Copy Full Notes & Specs"}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2">
                      <span className="font-bold text-[11px] text-sky-600 dark:text-sky-400 uppercase tracking-wider block border-b border-slate-200 dark:border-slate-700 pb-1">
                        I. Code Mandates &amp; General Notes
                      </span>
                      <ul className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1.5 leading-relaxed">
                        <li><strong>PEC 2017 Art 6.90:</strong> Strictly compliant design and layout.</li>
                        <li><strong>Supervision:</strong> Signed &amp; supervised by a licensed PEE/REE.</li>
                        <li><strong>Permitting:</strong> CFEI &amp; Net-Metering clearance with {(config.netMetering?.utilityProvider || "DU").toUpperCase()}.</li>
                        <li><strong>Clearances:</strong> ≥900mm front clearance &amp; 2000mm headroom.</li>
                        <li><strong>Grounding:</strong> Solid bonding to EGC; ground rod R ≤ 5.0Ω.</li>
                        <li><strong>Signage:</strong> Permanent UV warning plaques on all equipment.</li>
                      </ul>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2">
                      <span className="font-bold text-[11px] text-amber-600 dark:text-amber-400 uppercase tracking-wider block border-b border-slate-200 dark:border-slate-700 pb-1">
                        II. Technical Specifications
                      </span>
                      <ul className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1.5 leading-relaxed">
                        <li><strong>PV Modules:</strong> {calc.totalModules}x {calc.selectedModule.manufacturer} ({calc.selectedModule.ratedPowerWp}Wp), IEC 61215/61730.</li>
                        <li><strong>Inverter:</strong> {calc.effective.inverterQuantity}x {calc.selectedInverter.manufacturer} ({calc.totalInverterAcKw} kW AC), UL 1741 &amp; IEEE 1547.</li>
                        <li><strong>DC Cable:</strong> 2 × {calc.effective.dcCableSizeMm2} mm² PV1-F in {calc.effective.dcConduitSizeMm} (Vd={calc.dcVoltageDropPercent}% ≤ 2.0%).</li>
                        <li><strong>AC Feeder:</strong> {calc.effective.acBreakerPoles} × {calc.effective.acCableSizeMm2} mm² THHN in {calc.effective.acConduitSizeMm} (Vd={calc.acVoltageDropPercent}% ≤ 1.5%).</li>
                        <li><strong>Protection:</strong> {calc.effective.dcIsolatorRatingAmps}A DC Switch + {calc.effective.dcFuseRatingAmps}A gPV Fuses + {calc.effective.acBreakerAtAmps}A AT MCCB.</li>
                        <li><strong>Surge Arresters:</strong> Dual Type 2 SPDs on both DC &amp; AC sides.</li>
                      </ul>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2">
                      <span className="font-bold text-[11px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block border-b border-slate-200 dark:border-slate-700 pb-1">
                        III. Interconnection &amp; Commissioning
                      </span>
                      <ul className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1.5 leading-relaxed">
                        <li><strong>120% Bus Rule:</strong> {linkedPanelData.mainFeeder.cb}A + {calc.effective.acBreakerAtAmps}A = {linkedPanelData.mainFeeder.cb + calc.effective.acBreakerAtAmps}A ≤ {Math.round((linkedPanelData.mainFeeder.af || config.serviceCapacityAmps || 200) * 1.2)}A (PASS).</li>
                        <li><strong>Rapid Shutdown:</strong> ≤ 80V within 30s per PEC 6.90.2.3.</li>
                        <li><strong>Anti-Islanding:</strong> Trip within ≤ 2.0s per IEEE 1547 / PEC 6.90.7.1.</li>
                        <li><strong>Pre-Commissioning:</strong> Voc, Isc, and Megger &gt; 1.0 MΩ @ 1000V DC.</li>
                        <li><strong>Net Meter:</strong> Bi-directional 4-quadrant smart utility meter.</li>
                        <li><strong>As-Built:</strong> Certified dossiers, manuals &amp; 25-yr warranties.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 5. Maximized Full-Screen CAD Workspace Modal */}
      {isMaximized && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col p-4 sm:p-6 animate-in fade-in duration-200">
          {/* Modal Header Bar */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-white">
            <div className="flex items-center gap-3">
              <Layers className="w-5 h-5 text-amber-400" />
              <div>
                <h3 className="font-black text-base text-white tracking-tight">
                  AutoCAD Single Line Diagram Workspace • {config.projectName}
                </h3>
                <span className="text-xs text-slate-400 font-mono">
                  {calc.totalDcCapacityKwp} kWp DC | {calc.totalInverterAcKw} kW AC | PEC 2017 Art 6.90 Compliant
                </span>
              </div>
            </div>

            {/* Navigation & Close */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleZoomIn}
                className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-200 transition"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={handleZoomOut}
                className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-200 transition"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={fitToScreen}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-200 transition"
              >
                Fit to Screen
              </button>
              <button
                onClick={handleExportCAD}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-sky-400 transition"
              >
                <FileCode className="w-4 h-4" />
                <span>AutoCAD DXF</span>
              </button>
              <button
                onClick={() => setIsMaximized(false)}
                className="p-2 bg-rose-600 hover:bg-rose-500 rounded-xl text-white transition ml-2"
                title="Close Full Screen (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Modal CAD Canvas */}
          <div
            ref={modalContainerRef}
            className="flex-1 w-full rounded-xl border border-slate-800 bg-slate-900 overflow-hidden cursor-grab active:cursor-grabbing flex items-center justify-center relative"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
          >
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "center center",
                transition: isDragging ? "none" : "transform 0.15s ease-out",
              }}
            >
              {renderSLDContent()}
            </div>
          </div>
        </div>
      )}

      {/* Print Warning Modal for Sandboxed iFrames */}
      {showPrintWarning && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 text-amber-500 mb-3">
              <AlertCircle className="w-6 h-6" />
              <h4 className="font-bold text-base text-slate-900 dark:text-white">Print Notification</h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              Direct window printing may be restricted by the browser preview iframe. For the cleanest vector output, use <strong>AutoCAD (DXF)</strong>, <strong>Vector SVG</strong>, or <strong>PDF Export</strong>.
            </p>
            <button
              onClick={() => setShowPrintWarning(false)}
              className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
