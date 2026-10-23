import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  SolarDesignConfig,
  SolarCalculationResults,
  SolarDesignOverrides,
} from "../../types/solar";
import { PanelConfig, Circuit, VoltageDropCalculation } from "../../types";
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
  AlertTriangle,
} from "lucide-react";
import { toPng, toSvg } from "html-to-image";
import { exportSolarToDxf } from "../../utils/exportSolarDxf";
import { exportSolarToWord } from "../../utils/exportSolarWord";
import { SolarSLDPictorial, computePictorialLayout, sldDesignIssues, epsOutputInfo } from "./SolarSLDPictorial";
import { computeLinkedPanelData, solarBackfeedAmps, acConductorParts } from "../../utils/solarLinkedPanel";

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
  const netMeteringOn = config.systemType !== "off-grid" && config.netMetering?.enabled !== false;
  const [showSolarMeter, setShowSolarMeter] = useState(netMeteringOn);
  useEffect(() => setShowSolarMeter(netMeteringOn), [netMeteringOn]);
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
  const [canvasWidth, setCanvasWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setCanvasWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  // Panel the solar system connects to (shared with the Solar exports so all show the same data)
  const linkedPanelData = useMemo(
    () => computeLinkedPanelData(config, panels, circuits, subPanels, vdCalculations),
    [config, panels, circuits, subPanels, vdCalculations]
  );

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
  const designIssues = useMemo(() => sldDesignIssues(config, calc), [config, calc]);
  const epsInfo = useMemo(() => epsOutputInfo(config, calc), [config, calc]);

  // Sheet size follows the pictorial diagram (rows per string, battery) plus the notes / title block band
  const pictorialTop = 116;
  const pictorialLayout = computePictorialLayout(config, calc, pictorialTop);
  const svgWidth = Math.max(2000, Math.ceil(pictorialLayout.width + 70));

  // ---------- Sheet notes & title block band (wrapped monospace text; the band grows to fit) ----------
  const SHEET_FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  const NOTE_FS = 12;
  const NOTE_LINE_H = 16;
  const NOTE_CHAR_W = NOTE_FS * 0.62; // monospace advance with margin
  const notesX = 44;
  const notesWidth = 1440;
  const notesColW = notesWidth / 3;
  const notesCharsPerLine = Math.floor((notesColW - 26) / NOTE_CHAR_W);
  const tbX = svgWidth - 504;
  const tbWidth = 460;

  const wrapText = (text: string, maxChars: number, firstLineIndent = 0) => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const limit = lines.length === 0 ? maxChars - firstLineIndent : maxChars;
      if (!cur) cur = w;
      else if ((cur + " " + w).length <= limit) cur += " " + w;
      else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  // 120% busbar rule (PEC 6.90.7.2(D)). The app has no busbar field, so the main breaker frame (AF)
  // is taken as the busbar rating; the solar side is the real back-feed device (see solarBackfeedAmps).
  const busCheck = useMemo(() => {
    const mainA = linkedPanelData.mainFeeder.cb;
    const backfeedA = solarBackfeedAmps(calc);
    const busA = linkedPanelData.mainFeeder.af || config.serviceCapacityAmps || 200;
    const infeed = mainA + backfeedA;
    const busMax = Math.round(busA * 1.2);
    return { mainA, backfeedA, busA, infeed, busMax, ok: infeed <= busMax };
  }, [linkedPanelData, calc, config.serviceCapacityAmps]);

  const sheetNotes = useMemo(() => {
    const eff = calc.effective;
    const utilityName = (config.netMetering?.utilityProvider || "DISTRIBUTION UTILITY").toUpperCase();
    const sysV = config.utilityVoltage || 230;
    const sysPh = calc.acSystem?.serviceLabel || (isThreePhase ? "3PH 3W" : "1PH 2W");
    const acParts = acConductorParts(calc);
    const acWires = `${acParts.phases} × ${acParts.size} mm²${acParts.neutral ? ` + 1 × ${acParts.size} mm² N` : ""}`;
    // Same fallbacks as the calculation engine
    const dcLimit = config.cabling?.dcMaxDropPercent || 1.5;
    const acLimit = config.cabling?.acMaxDropPercent || 1.5;
    const { mainA, backfeedA, infeed, busMax, ok: busOk } = busCheck;
    const columns: Array<{ title: string; items: Array<{ label: string; text: string; highlight?: boolean }> }> = [
      {
        title: "I. GENERAL DRAWING & CODE MANDATES (PEC 2017)",
        items: [
          { label: "CODE COMPLIANCE", text: "ALL WORKS SHALL STRICTLY CONFORM WITH PEC 2017 PARTS 1 & 2 (ART. 6.90 SOLAR PV), RA 7920 (EE LAW), AND RA 9513 (RE ACT)." },
          { label: "PEE SUPERVISION", text: "INSTALLATION SHALL BE EXECUTED UNDER DIRECT SUPERVISION OF A DULY LICENSED PROFESSIONAL ELECTRICAL ENGR. (PEE)." },
          { label: "UTILITY PERMITTING", text: `SECURE ELECTRICAL PERMIT, CFEI, AND NET-METERING INTERCONNECTION APPROVAL FROM ${utilityName} PRIOR TO SYSTEM ENERGIZATION.` },
          { label: "WORKING CLEARANCE", text: "MAINTAIN ≥ 900mm FRONT CLEARANCE, ≥ 750mm WIDTH AND ≥ 2000mm HEADROOM AROUND ALL INVERTERS AND PANELS (PEC 1.10.2.1)." },
          { label: "SOLID BONDING", text: "METALLIC FRAMES, RACKS, CONDUITS & CASINGS SOLIDLY BONDED TO EGC. EARTH ELECTRODE RESISTANCE SHALL NOT EXCEED 5.0 Ω." },
          { label: "SAFETY LABELS", text: 'PERMANENT UV-RATED WARNING SIGNS "SOLAR PV SOURCE" AND DIRECTORIES SHALL BE AFFIXED ON ALL DISCONNECTS & METERS (PEC 6.90.6).' },
        ],
      },
      {
        title: "II. TECHNICAL MATERIAL SPECIFICATIONS",
        items: [
          { label: "PV MODULES", text: `${calc.totalModules}x ${calc.selectedModule.manufacturer.toUpperCase()} ${calc.selectedModule.model.toUpperCase()} (${calc.selectedModule.ratedPowerWp}Wp), IEC 61215/61730, IP68 JUNCTION BOX W/ BYPASS DIODES.` },
          { label: "INVERTER", text: `${eff.inverterQuantity}x ${calc.selectedInverter.manufacturer.toUpperCase()} (${calc.totalInverterAcKw} kW AC), UL 1741, IEEE 1547, IEC 62109, MULTI-MPPT, ANTI-ISLANDING & GFDI INTEGRATED.` },
          { label: "DC WIRING", text: `2 × ${eff.dcCableSizeMm2} mm² PV1-F / EN 50618 XLPO DC TINNED CU IN ${eff.dcConduitSizeMm}mm CONDUIT. VOLTAGE DROP Vd = ${calc.dcVoltageDropPercent}% (LIMIT ≤ ${dcLimit}%).` },
          { label: "AC FEEDERS", text: `${acWires} CU THHN/THWN-2 (90°C) IN ${eff.acConduitSizeMm}mm CONDUIT TO MAIN PANEL. VOLTAGE DROP Vd = ${calc.acVoltageDropPercent}% (LIMIT ≤ ${acLimit}%).` },
          { label: "DC PROTECTION", text: `${eff.dcIsolatorRatingAmps}A DC ${config.dcProtection?.isolatorVoltageVolts ?? 1000}V ROTARY ISOLATOR (PEC 6.90.3.1) + ${eff.dcFuseRatingAmps}A ${config.dcProtection?.fuseVoltageVolts ?? 1000}V gPV PROTECTION + TYPE 2 DC SPD (${config.dcProtection?.spdInKa ?? 20}/${config.dcProtection?.spdImaxKa ?? 40}kA).` },
          { label: "AC PROTECTION", text: `${eff.acBreakerAtAmps}A AT (${eff.acBreakerPoles}P) BREAKER (${eff.acKaic} kAIC) + AC TYPE 2 SPD RATED FOR ${sysV}V ${sysPh} AT THE MAIN BUSBAR INTERCONNECTION POINT.` },
        ],
      },
      {
        title: "III. INTERCONNECTION, SAFETY & COMMISSIONING",
        items: [
          isOffGrid
            ? { label: "120% BUSBAR RULE", text: "NOT APPLICABLE: THE OFF-GRID INVERTER TAKES UTILITY POWER AT ITS AC INPUT ONLY AND NEVER EXPORTS (NO BACK-FEED)." }
            : {
                label: "120% BUSBAR RULE",
                text: `MAIN (${mainA}A) + SOLAR (${backfeedA}A) = ${infeed}A ${busOk ? "≤" : ">"} 120% BUS CAPACITY (${busMax}A). PEC 6.90.7.2(D) ${busOk ? "PASS" : "EXCEEDED - REVISE DESIGN"}.`,
                highlight: true,
              },
          { label: "RAPID SHUTDOWN", text: "PV CIRCUITS ON OR IN BUILDINGS SHALL REDUCE ARRAY BOUNDARY CONDUCTORS TO ≤ 80V WITHIN 30 SECONDS OF INITIATION (PEC 6.90.2.3)." },
          { label: "ANTI-ISLANDING", text: "INVERTER TRIPS WITHIN ≤ 2.0s UPON LOSS OF UTILITY GRID VOLTAGE OR ABNORMAL FREQUENCY AS PER IEEE 1547 & PEC 6.90.7.1." },
          { label: "VERIFICATION TESTS", text: "MANDATORY PRE-ENERGIZATION POLARITY CHECK, Voc, Isc, AND INSULATION RESISTANCE TEST (MEGGER > 1.0 MΩ @ 1000V DC TEST)." },
          isOffGrid
            ? { label: "OFF-GRID / UTILITY INPUT", text: "UTILITY SUPPLIES THE INVERTER AC INPUT (CHARGING / BYPASS) ONLY, NO EXPORT. THE INVERTER AC OUTPUT SHALL NOT BE TIED TO ANY UTILITY-FED CIRCUIT OR PANEL." }
            : config.netMetering?.enabled === false
              ? { label: "METERING", text: "NO NET-METERING. EXPORT TO THE GRID SHALL BE PREVENTED (ZERO-EXPORT CONTROL) UNLESS APPROVED BY THE DISTRIBUTION UTILITY." }
              : { label: "REVENUE METERING", text: "BI-DIRECTIONAL 4-QUADRANT SMART NET-METER AND VISIBLE-BREAK LOCKABLE AC DISCONNECT ACCESSIBLE 24/7 TO DU CREW." },
          { label: "AS-BUILT DOSSIER", text: "COMPLETE O&M MANUALS, FACTORY WARRANTIES, AND PEE SIGNED/SEALED AS-BUILT SLD MUST BE SUBMITTED TO THE OWNER." },
        ],
      },
    ];
    // Wrap each item; the bold "n. LABEL:" prefix shares the first line
    const wrapped = columns.map((col) => ({
      ...col,
      items: col.items.map((it, i) => {
        const prefix = `${i + 1}. ${it.label}: `;
        const lines = wrapText(`${prefix}${it.text}`, notesCharsPerLine);
        return { ...it, prefix, lines };
      }),
    }));
    const maxLines = Math.max(...wrapped.map((c) => c.items.reduce((n, it) => n + it.lines.length, 0)));
    const height = 30 + 26 + 12 + maxLines * NOTE_LINE_H + 6 * 7 + 12;
    return { columns: wrapped, height, busOk };
  }, [calc, config, linkedPanelData, isThreePhase, notesCharsPerLine, busCheck]);

  // Title block: long values wrap onto extra lines (rows grow) instead of being cut off
  const TB_VALUE_FS = 14;
  const TB_LINE_H = 18;
  const titleBlock = useMemo(() => {
    const sysTypeClean = (config.systemType || "GRID-TIED").toUpperCase().replace(/_/g, " ");
    const rows: Array<Array<{ label: string; value: string; highlight?: boolean; big?: boolean }>> = [
      [
        { label: "PROJECT TITLE:", value: (config.projectName || "SOLAR PV INSTALLATION").toUpperCase().trim() },
        { label: "LOCATION:", value: (config.projectLocation || "PHILIPPINES").toUpperCase().trim() },
      ],
      [
        { label: "CAPACITY:", value: `${calc.totalDcCapacityKwp} kWp DC / ${calc.totalInverterAcKw} kW AC` },
        { label: "SYSTEM TYPE:", value: `${sysTypeClean} (${config.utilityVoltage}V ${isThreePhase ? "3PH" : "1PH"})` },
      ],
      [
        { label: "DESIGNED BY:", value: (config.designerName || "ELECTRICALPH").toUpperCase() },
        { label: "CHECKED / APPROVED BY:", value: "PEE REG. ENGR.", highlight: true },
      ],
      [
        { label: "SCALE:", value: "N.T.S." },
        { label: "DATE:", value: new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" }) },
        { label: "REVISION:", value: "REV 0" },
        { label: "SHEET NO:", value: "E-01", highlight: true, big: true },
      ],
    ];
    let y = 30;
    const laidOut = rows.map((cells) => {
      const cellW = tbWidth / cells.length;
      const maxChars = Math.max(4, Math.floor((cellW - 20) / (TB_VALUE_FS * 0.62)));
      const wrapped = cells.map((c) => ({ ...c, lines: c.big ? [c.value] : wrapText(c.value, maxChars) }));
      const lineCount = Math.max(...wrapped.map((c) => c.lines.length));
      const h = 30 + lineCount * TB_LINE_H + 8;
      const row = { y, h, cellW, cells: wrapped };
      y += h;
      return row;
    });
    return { rows: laidOut, height: y };
  }, [calc, config, isThreePhase]);
  const tbHeight = titleBlock.height;

  const bandHeight = Math.max(showGeneralNotes ? sheetNotes.height : 0, showTitleBlock ? tbHeight : 0);
  const svgHeight = Math.max(1100, pictorialLayout.bottom + (bandHeight ? bandHeight + 40 : 0) + 50);
  // Canvas height follows the sheet proportions so "Fit" uses the full width (text stays legible)
  const canvasHeight = canvasWidth
    ? Math.round(Math.min(Math.max(520, ((canvasWidth - 32) * svgHeight) / svgWidth + 40), 1600))
    : 720;
  const bandTop = svgHeight - 44 - bandHeight;

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
  }, [isMaximized, stringsCount, hasBattery, canvasHeight, svgHeight]);

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
        pixelRatio: 2.5,
        skipFonts: true,
        fontEmbedCSS: "",
      });

      // Standard landscape drawing sheet: the smallest of A3 / A2 / A1 on which the smallest
      // drawing text (11 units) prints at 6 pt or more; the drawing keeps its proportions
      const { jsPDF } = await import("jspdf");
      const MIN_TEXT_UNITS = 11;
      const MM_PER_PT = 25.4 / 72;
      const papers: Array<[string, number, number]> = [["a3", 420, 297], ["a2", 594, 420], ["a1", 841, 594]];
      const margin = 10;
      const fitOn = ([, w, h]: [string, number, number]) => Math.min((w - 2 * margin) / svgWidth, (h - 2 * margin) / svgHeight);
      const paper = papers.find((p) => (MIN_TEXT_UNITS * fitOn(p)) / MM_PER_PT >= 6) || papers[papers.length - 1];
      const scale = fitOn(paper);
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: paper[0] });
      const drawW = svgWidth * scale;
      const drawH = svgHeight * scale;
      pdf.addImage(dataUrl, "PNG", (paper[1] - drawW) / 2, (paper[2] - drawH) / 2, drawW, drawH);
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
    // Pass the current layer toggles so the AutoCAD sheet matches what is on screen
    exportSolarToDxf(config, calc, linkedPanelData, {
      showSolarMeter,
      showEpsLoad: effectiveShowEpsLoad,
      showGrounding,
      showConductorSpecs,
    });
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
        className="select-none font-mono"
        style={{
          width: svgWidth,
          height: svgHeight,
          maxWidth: "none",
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
              x="12"
              y="12"
              width={svgWidth - 24}
              height={svgHeight - 24}
              fill="none"
              stroke={themeColors.border}
              strokeWidth="2.5"
            />
            <rect
              x="34"
              y="34"
              width={svgWidth - 68}
              height={svgHeight - 68}
              fill="none"
              stroke={themeColors.border}
              strokeWidth="1.2"
            />
            {/* Grid Coordinates (1-8 & A-E), centred in the margin between the two border lines */}
            {[1, 2, 3, 4, 5, 6, 7, 8].map((num, i) => {
              const xPos = 34 + (i + 0.5) * ((svgWidth - 68) / 8);
              return (
                <g key={`coord-x-${num}`}>
                  <text x={xPos} y="28" fontSize="13px" fontWeight="bold" fill={themeColors.textMuted} textAnchor="middle">{num}</text>
                  <text x={xPos} y={svgHeight - 18} fontSize="13px" fontWeight="bold" fill={themeColors.textMuted} textAnchor="middle">{num}</text>
                </g>
              );
            })}
            {["A", "B", "C", "D", "E"].map((letter, i) => {
              const yPos = 34 + (i + 0.5) * ((svgHeight - 68) / 5) + 5;
              return (
                <g key={`coord-y-${letter}`}>
                  <text x="23" y={yPos} fontSize="13px" fontWeight="bold" fill={themeColors.textMuted} textAnchor="middle">{letter}</text>
                  <text x={svgWidth - 23} y={yPos} fontSize="13px" fontWeight="bold" fill={themeColors.textMuted} textAnchor="middle">{letter}</text>
                </g>
              );
            })}
          </g>
        )}

        {/* Top Header Text */}
        <text
          x={svgWidth / 2}
          y="64"
          fontSize="22px"
          fontWeight="900"
          letterSpacing="1.5"
          fill={themeColors.text}
          textAnchor="middle"
        >
          SOLAR PHOTOVOLTAIC SINGLE LINE DIAGRAM (SLD)
        </text>
        <text
          x={svgWidth / 2}
          y="88"
          fontSize="14px"
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
        {showGeneralNotes && (
          <g
            id="sld-general-notes"
            className="cursor-pointer transition-opacity hover:opacity-95"
            onClick={() => setSelectedElement("general_notes")}
            transform={`translate(${notesX}, ${bandTop})`}
            fontFamily={SHEET_FONT}
          >
            <rect x="0" y="0" width={notesWidth} height={bandHeight} fill={themeColors.equipmentFill} stroke={themeColors.border} strokeWidth="1.8" />

            {/* Main Banner Header */}
            <rect x="0" y="0" width={notesWidth} height="30" fill={themeColors.border} />
            <text x="14" y="20" fontSize="13px" fontWeight="900" fill="#ffffff" letterSpacing="0.4">
              GENERAL NOTES &amp; TECHNICAL SPECIFICATIONS (PEC 2017 PART 1 ART. 6.90 / RA 7920 / RA 9513)
            </text>
            <text x={notesWidth - 14} y="20" fontSize="11px" fontWeight="bold" fill="#ffffff" textAnchor="end">
              [CLICK FOR FULL CITATIONS]
            </text>

            {sheetNotes.columns.map((col, ci) => {
              const cx = ci * notesColW;
              let lineNo = 0;
              return (
                <g key={col.title}>
                  {ci > 0 && <line x1={cx} y1="30" x2={cx} y2={bandHeight} stroke={themeColors.line} strokeWidth="1" />}
                  <rect x={cx} y="30" width={notesColW} height="26" fill={themeColors.badgeFill} stroke={themeColors.line} strokeWidth="0.6" />
                  <text x={cx + 12} y="48" fontSize="12px" fontWeight="900" fill={themeColors.textHighlight}>
                    {col.title}
                  </text>
                  {col.items.map((it, ii) => {
                    const y0 = 56 + 24 + lineNo * NOTE_LINE_H + ii * 7;
                    lineNo += it.lines.length;
                    const bodyFill = it.highlight ? (sheetNotes.busOk ? themeColors.textHighlight : "#dc2626") : themeColors.textMuted;
                    const bodyWeight = it.highlight ? "bold" : "normal";
                    return (
                      <g key={ii} fontSize={`${NOTE_FS}px`}>
                        {it.lines.map((ln, li) => {
                          const y = y0 + li * NOTE_LINE_H;
                          if (li === 0 && ln.startsWith(it.prefix.trim())) {
                            return (
                              <text key={li} x={cx + 12} y={y} fill={themeColors.text}>
                                <tspan fontWeight="bold">{it.prefix}</tspan>
                                <tspan fill={bodyFill} fontWeight={bodyWeight}>
                                  {ln.slice(it.prefix.length)}
                                </tspan>
                              </text>
                            );
                          }
                          return (
                            <text key={li} x={cx + 12} y={y} fill={bodyFill} fontWeight={bodyWeight}>
                              {ln}
                            </text>
                          );
                        })}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </g>
        )}

        {/* ========================================================================= */}
        {/* 9. ENGINEERING TITLE BLOCK (BOTTOM RIGHT)                                */}
        {/* ========================================================================= */}
        {showTitleBlock && (
          <g id="sld-title-block" transform={`translate(${tbX}, ${bandTop})`} fontFamily={SHEET_FONT}>
            <rect x="0" y="0" width={tbWidth} height={bandHeight} fill={themeColors.equipmentFill} stroke={themeColors.border} strokeWidth="1.8" />
            <rect x="0" y="0" width={tbWidth} height="30" fill={themeColors.border} />
            <text x={tbWidth / 2} y="20" fontSize="12px" fontWeight="900" fill="#ffffff" textAnchor="middle">
              ENGINEERING TITLE BLOCK (RA 7920 / RA 9513)
            </text>
            {titleBlock.rows.map((row, ri) => (
              <g key={ri}>
                {ri < titleBlock.rows.length - 1 && (
                  <line x1="0" y1={row.y + row.h} x2={tbWidth} y2={row.y + row.h} stroke={themeColors.line} strokeWidth="0.8" />
                )}
                {row.cells.map((c, ci) => (
                  <g key={ci}>
                    {ci > 0 && (
                      <line x1={ci * row.cellW} y1={row.y} x2={ci * row.cellW} y2={row.y + row.h} stroke={themeColors.line} strokeWidth="0.8" />
                    )}
                    <text x={ci * row.cellW + 10} y={row.y + 19} fontSize="11px" fontWeight="bold" fill={themeColors.textMuted}>
                      {c.label}
                    </text>
                    {c.lines.map((ln, li) => (
                      <text
                        key={li}
                        x={c.big ? ci * row.cellW + row.cellW / 2 : ci * row.cellW + 10}
                        y={row.y + 40 + li * TB_LINE_H}
                        fontSize={c.big ? "18px" : `${TB_VALUE_FS}px`}
                        fontWeight="bold"
                        textAnchor={c.big ? "middle" : "start"}
                        fill={c.highlight ? themeColors.textHighlight : themeColors.text}
                      >
                        {ln}
                      </text>
                    ))}
                  </g>
                ))}
              </g>
            ))}
          </g>
        )}
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

      {designIssues.length > 0 && (
        <div className="mb-3 p-3 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 text-xs">
          <div className="flex items-center gap-2 font-bold mb-1">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Design validation: {designIssues.length} item{designIssues.length > 1 ? "s" : ""} need engineering review. The drawing is marked
              NOT FOR CONSTRUCTION until they are resolved in the Solar Design inputs.
            </span>
          </div>
          <ul className="list-disc pl-6 space-y-0.5">
            {designIssues.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 3. Interactive CAD Canvas Container */}
      <div
        ref={containerRef}
        style={{ height: canvasHeight }}
        className="relative w-full rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950 cursor-grab active:cursor-grabbing flex items-center justify-center"
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
      </div>

      {/* Inspector hint (below the canvas so it never covers the drawing) */}
      <div className="mt-2 px-1 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
        <MousePointer className="w-3.5 h-3.5 text-amber-500" />
        <span>Click any equipment on the drawing to inspect engineering values and specifications.</span>
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
                {selectedElement === "eps_panel" && "Essential Loads Panel (EPS Backup Output)"}
                {selectedElement === "design_validation" && "Design Validation"}
                {selectedElement === "ct_sensor" && "CT / Smart Meter (Load & Export Monitoring)"}
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
                <div>
                  <span className="text-slate-400 block">String Current (Imp / Isc):</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{calc.stringImp} A / {calc.stringIsc} A</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Max Circuit Current (1.25 x Isc):</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{(calc.stringIsc * 1.25).toFixed(2)} A</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Configuration:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{calc.effective.numberOfStrings} strings x {calc.effective.modulesPerString} modules</span>
                </div>
              </>
            )}

            {selectedElement === "eps_panel" && (
              <>
                <div>
                  <span className="text-slate-400 block">Source:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">Inverter EPS / backup port only (no utility connection)</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Backup Load:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{epsInfo ? `${epsInfo.kw} kW (${epsInfo.amps} A)` : "Not defined - enable the battery"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">EPS Main Breaker:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{epsInfo ? `${epsInfo.breakerA} AT, ${epsInfo.poles}P (125% of load)` : "Per inverter EPS rating"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Inverter Rating Check:</span>
                  <span className={`font-bold ${epsInfo?.exceedsInverter ? "text-red-600" : "text-emerald-600"}`}>
                    {epsInfo ? (epsInfo.exceedsInverter ? `Exceeds ${epsInfo.invKw} kW AC` : `Within ${epsInfo.invKw} kW AC`) : "Verify with datasheet"}
                  </span>
                </div>
              </>
            )}

            {selectedElement === "ct_sensor" && (
              <>
                <div>
                  <span className="text-slate-400 block">Location:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">Service conductor, after the bi-directional meter</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Purpose:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">Measures grid import / export for the inverter</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Export Control:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{(config.netMetering?.exportLimitation || "none").replace(/_/g, " ").toUpperCase()}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Cable:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">Signal / communication only (per inverter manual)</span>
                </div>
              </>
            )}

            {selectedElement === "design_validation" && (
              <ul className="col-span-2 sm:col-span-4 list-disc pl-5 space-y-1 text-red-700 dark:text-red-300">
                {designIssues.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
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
4. AC FEEDERS: ${acConductorParts(calc).phases} × ${calc.effective.acCableSizeMm2} mm²${acConductorParts(calc).neutral ? ` + 1 × ${calc.effective.acCableSizeMm2} mm² N` : ""} COPPER THHN/THWN-2 (90°C) IN ${calc.effective.acConduitSizeMm} CONDUIT TO MAIN PANEL. VOLTAGE DROP Vd = ${calc.acVoltageDropPercent}% (STRICTLY ≤ 1.5%).
5. DC PROTECTION: ${calc.effective.dcIsolatorRatingAmps}A DC 1000V ROTARY ISOLATOR SWITCH (PEC 6.90.3.1) + ${calc.effective.dcFuseRatingAmps}A 1000V gPV DC STRING FUSES + TYPE 2 DC SURGE PROTECTIVE DEVICE (SPD 20/40kA).
6. AC OVERCURRENT PROTECTION: ${calc.effective.acBreakerAtAmps}A AT (${calc.effective.acBreakerPoles}P) MCCB (${calc.effective.acKaic} kAIC) + AC TYPE 2 SPD AT THE MAIN DISTRIBUTION PANEL INTERCONNECTION POINT.

III. INTERCONNECTION, SAFETY & COMMISSIONING
1. 120% BUSBAR RULE (PEC 6.90.7.2.D): MAIN SERVICE BREAKER (${linkedPanelData.mainFeeder.cb}A) + SOLAR BACKFEED BREAKER (${busCheck.backfeedA}A) = ${busCheck.infeed}A ${busCheck.ok ? "≤" : ">"} 120% BUSBAR RATING (${busCheck.busMax}A). STATUS: ${busCheck.ok ? "PEC FULLY COMPLIANT (PASS)" : "EXCEEDS 120% LIMIT - REVISE DESIGN"}.
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
                        <li><strong>AC Feeder:</strong> {acConductorParts(calc).phases} × {calc.effective.acCableSizeMm2} mm²{acConductorParts(calc).neutral ? ` + 1 × ${calc.effective.acCableSizeMm2} mm² N` : ""} THHN in {calc.effective.acConduitSizeMm} (Vd={calc.acVoltageDropPercent}% ≤ 1.5%).</li>
                        <li><strong>Protection:</strong> {calc.effective.dcIsolatorRatingAmps}A DC Switch + {calc.effective.dcFuseRatingAmps}A gPV Fuses + {calc.effective.acBreakerAtAmps}A AT MCCB.</li>
                        <li><strong>Surge Arresters:</strong> Dual Type 2 SPDs on both DC &amp; AC sides.</li>
                      </ul>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2">
                      <span className="font-bold text-[11px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block border-b border-slate-200 dark:border-slate-700 pb-1">
                        III. Interconnection &amp; Commissioning
                      </span>
                      <ul className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1.5 leading-relaxed">
                        <li><strong>120% Bus Rule:</strong> {busCheck.mainA}A + {busCheck.backfeedA}A = {busCheck.infeed}A {busCheck.ok ? "≤" : ">"} {busCheck.busMax}A ({busCheck.ok ? "PASS" : "EXCEEDED"}).</li>
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
