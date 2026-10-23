import Drawing from "dxf-writer";
// @ts-ignore
import DatabaseObject from "dxf-writer/src/DatabaseObject.js";
// @ts-ignore
import TextStyle from "dxf-writer/src/TextStyle.js";
import { saveAs } from "file-saver";
import { SolarDesignConfig, SolarCalculationResults } from "../types/solar";
import { sanitizeStringForDxf, MText } from "./exportDxf";
import { captureSolarSld, captureSolarBlockDiagram, SldCapture } from "./solarSldCapture";
import { hasRoofPlan, roofPlanLayout, roofPlanInfo, edgeLabelOffset } from "./roofPlanExport";
import { metersPerPx, moduleDims, moduleCorners, assignStrings, roofPlanStats } from "./roofPlan";
import { solarBackfeedAmps, backfeedLabel, acConductorParts } from "./solarLinkedPanel";
import type { PictorialOptions } from "../components/solar/SolarSLDPictorial";

// Configure default text style to use TrueType Arial font, identical to System SLD
try {
  let ts = TextStyle;
  if (ts && (ts as any).default) {
    ts = (ts as any).default;
  }
  ts.prototype.fontFileName = "arial.ttf";
} catch (e) {
  // silent fallback
}

/**
 * Enhanced AutoCAD (.DWG / .DXF) Exporter for Solar Photovoltaic Design
 * Strictly matched with System SLD AutoCAD export font standards, typography,
 * text styles, and PEC 2017 Article 6.90 / RA 9513 engineering standards.
 *
 * Implements disciplined automated CAD layout spacing:
 * - Prevents all text overlapping, colliding equipment annotations, or line cut-throughs
 * - Guarantees 100% border containment: zero elements bleed outside sheet margins
 * - Structured 4-Sheet Engineering Drawing Package (ISO A3):
 *   - SHEET 1 OF 4: Solar PV Single Line Diagram & Block Diagram - the same combined template as the
 *     on-screen SLD (captured from the components and scaled to fit) - with a symbols legend
 *   - SHEET 2 OF 4: Solar Design Data, Sizing Calculations & Equipment Schedule
 *   - SHEET 3 OF 4: General Notes, PEC Mandates, Safety Warning Placards & Checklist
 *   - SHEET 4 OF 4: PV Module, Inverter & Battery Datasheet Tables
 *   - SHEET 5 OF 5 (when a roof plan exists): Roof Plan - roof outlines and the module layout at a
 *     true drawing scale (1:N); the satellite photo is not embedded (DXF links images as external files)
 *
 * The drawing reflects the actual design: off-grid systems omit utility interconnection,
 * the 120% busbar status follows the calculation, and commissioning tests are left blank.
 */
export interface SolarDxfPanelData {
  designation?: string;
  mainFeeder?: {
    cb?: number;
    af?: number;
    poles?: number;
    feederLabel?: string;
    conduitLabel?: string;
  };
  systemVoltage?: number;
  phaseText?: string;
  connectedKVA?: string;
  demandKVA?: string;
}

/** Builds the DXF package and downloads it. `sldView` mirrors the on-screen SLD layer toggles. */
export function exportSolarToDxf(
  config: SolarDesignConfig,
  calc: SolarCalculationResults,
  panelData?: SolarDxfPanelData,
  sldView?: Partial<PictorialOptions>
) {
  const dxfString = buildSolarDxf(config, calc, panelData, sldView);
  const blob = new Blob([dxfString], { type: "application/dxf;charset=utf-8" });
  const safeProjectName = sanitizeStringForDxf(config.projectName || "Solar_PV_Design")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_");
  saveAs(blob, `${safeProjectName}_Solar_SLD_Package.dxf`);
}

/** Builds the 4-sheet DXF package and returns it as a string. */
export function buildSolarDxf(
  config: SolarDesignConfig,
  calc: SolarCalculationResults,
  panelData?: SolarDxfPanelData,
  sldView?: Partial<PictorialOptions>
): string {
  const d = new Drawing();
  // Set Millimeters units (INSUNITS = 4), identical to System SLD
  d.setUnits("Millimeters");

  // 1. Standard CAD Layers per ElectricalPH Specification & System SLD conventions
  d.addLayer("EPH-BORDER", 2, "CONTINUOUS");   // Yellow
  d.addLayer("EPH-TITLE", 4, "CONTINUOUS");    // Cyan
  d.addLayer("EPH-SLD", 7, "CONTINUOUS");      // White
  d.addLayer("EPH-PV", 5, "CONTINUOUS");       // Blue (module cells, as on screen)
  d.addLayer("EPH-INVERTER", 4, "CONTINUOUS"); // Cyan
  d.addLayer("EPH-PANEL", 7, "CONTINUOUS");    // White
  d.addLayer("EPH-BREAKER", 1, "CONTINUOUS");  // Red
  d.addLayer("EPH-CABLE", 5, "CONTINUOUS");    // Blue
  d.addLayer("EPH-GROUND", 3, "CONTINUOUS");   // Green
  d.addLayer("EPH-BATTERY", 6, "CONTINUOUS");  // Magenta
  d.addLayer("EPH-LEGEND", 4, "CONTINUOUS");   // Cyan
  d.addLayer("EPH-NOTES", 7, "CONTINUOUS");    // White
  d.addLayer("EPH-TEXT", 7, "CONTINUOUS");     // White
  d.addLayer("EPH-DIM", 3, "CONTINUOUS");      // Green
  d.addLayer("EPH-ANNO", 2, "CONTINUOUS");     // Yellow

  // DC conductor runs: solid like the on-screen SLD, red to tell them apart from AC runs
  d.addLayer("EPH-DC", 1, "CONTINUOUS");       // Red
  // Roof plan outlines
  d.addLayer("EPH-ROOF", 30, "CONTINUOUS");     // Orange
  // CT / smart-meter signal cable (dashed, as on screen)
  d.addLayer("EPH-COMM", 30, "DASHED");        // Orange

  // Cross-compatibility layer aliases with System SLD
  d.addLayer("BORDER", 2, "CONTINUOUS");
  d.addLayer("TEXT_TITLE", 4, "CONTINUOUS");
  d.addLayer("TEXT_HEADER", 5, "CONTINUOUS");
  d.addLayer("TEXT_DATA", 7, "CONTINUOUS");
  d.addLayer("TABLE_GRID", 8, "CONTINUOUS");

  // Layer lineweights (DXF group 370, hundredths of a mm). dxf-writer's Layer does not
  // emit 370, so the record is written here with the lineweight before the plot-style handle.
  const setLayerLineweight = (name: string, lineweight: number) => {
    const layer = (d as any).layers?.[name];
    if (!layer) return;
    layer.tags = function (manager: any) {
      manager.push(0, "LAYER");
      DatabaseObject.prototype.tags.call(this, manager);
      manager.push(2, this.name);
      if (this.trueColor !== -1) manager.push(420, this.trueColor);
      else manager.push(62, this.colorNumber);
      manager.push(70, 0);
      if (this.lineTypeName) manager.push(6, this.lineTypeName);
      manager.push(370, lineweight);
      manager.push(390, 1);
    };
  };
  const layerLineweights: Record<string, number> = {
    "EPH-BORDER": 50,
    "EPH-TITLE": 25,
    "EPH-SLD": 35,
    "EPH-PV": 35,
    "EPH-INVERTER": 35,
    "EPH-PANEL": 35,
    "EPH-BREAKER": 35,
    "EPH-CABLE": 50,
    "EPH-DC": 50,
    "EPH-ROOF": 50,
    "EPH-COMM": 18,
    "EPH-GROUND": 35,
    "EPH-BATTERY": 35,
    "EPH-LEGEND": 18,
    "EPH-NOTES": 18,
    "EPH-TEXT": 18,
    "EPH-DIM": 13,
    "EPH-ANNO": 18,
  };
  Object.entries(layerLineweights).forEach(([name, lw]) => setLayerLineweight(name, lw));
  // Lineweights are kept for plotting, but not shown on screen (LWDISPLAY off) so lines stay thin
  d.header("LWDISPLAY", [[290, 0]]);

  // Paper scaling: Sheet 1 can be enlarged (A3 -> A2 -> A1) so its SLD text stays legible when
  // plotted. Every sheet is laid out in A3 millimetres; lines, circles and text pass through here.
  const paper = { originX: 0, k: 1 };
  const px = (x: number) => paper.originX + (x - paper.originX) * paper.k;
  const py = (y: number) => y * paper.k;
  const rawDrawLine = d.drawLine.bind(d);
  const rawDrawCircle = d.drawCircle.bind(d);
  (d as any).drawLine = (x1: number, y1: number, x2: number, y2: number) => rawDrawLine(px(x1), py(y1), px(x2), py(y2));
  (d as any).drawCircle = (x: number, y: number, r: number) => rawDrawCircle(px(x), py(y), r * paper.k);

  // Geometric CAD primitive drawing helpers
  const drawBox = (layer: string, x: number, y: number, w: number, h: number) => {
    d.setActiveLayer(layer);
    d.drawLine(x, y, x + w, y);
    d.drawLine(x + w, y, x + w, y + h);
    d.drawLine(x + w, y + h, x, y + h);
    d.drawLine(x, y + h, x, y);
  };

  const drawCircle = (layer: string, x: number, y: number, r: number) => {
    d.setActiveLayer(layer);
    d.drawCircle(x, y, r);
  };

  /**
   * Unified Professional CAD Text Renderer
   * Directly uses System SLD MText entity, TrueType Arial font, and standard typography hierarchy.
   */
  const drawText = (
    layer: string,
    x: number,
    y: number,
    height: number,
    text: any,
    align: "left" | "center" | "right" = "left",
    wrapWidth: number = 0.0,
    rotation: number = 0,
    vAlign: "middle" | "top" | "bottom" = "middle"
  ) => {
    if (text === null || text === undefined) return;
    const textStr = String(text).trim();
    if (textStr === "") return;

    let adjustedHeight = height;
    if (wrapWidth > 0.0) {
      // Average character width factor for Arial TrueType is approx 0.55 of height
      const charWidthFactor = 0.55;
      const estimatedWidth = textStr.length * height * charWidthFactor;
      if (estimatedWidth > wrapWidth) {
        // Mildly scale down up to 85% to preserve aesthetics, otherwise wrap cleanly
        const idealHeight = wrapWidth / (textStr.length * charWidthFactor);
        adjustedHeight = Math.max(height * 0.85, Math.min(height, idealHeight));
      }
    }

    const cleanedText = sanitizeStringForDxf(textStr).slice(0, 300);
    d.setActiveLayer(layer);

    // Compute insertion point based on requested vertical alignment
    let adjustedY = y;
    if (vAlign === "middle") {
      adjustedY = y + height / 2.0;
    } else if (vAlign === "top") {
      adjustedY = y + height;
    }

    // Add custom MText entity directly to active layer shapes list
    const mtext = new MText(
      px(x),
      py(adjustedY),
      adjustedHeight * paper.k,
      rotation,
      cleanedText,
      align,
      vAlign,
      wrapWidth * paper.k
    );
    d.activeLayer!.addShape(mtext as any);
  };

  // Resolved parameters
  const hasBattery =
    (config.systemType === "hybrid" || config.systemType === "off-grid") &&
    Boolean(config.battery?.enabled);
  const isOffGrid = config.systemType === "off-grid";
  const isGridTied = !isOffGrid;
  const hasNetMetering = isGridTied && config.netMetering?.enabled !== false;
  // The 120% busbar rule governs load-side interconnections only
  const applies120Rule = isGridTied && config.netMetering?.interconnectionType !== "supply_side";
  const eff = calc.effective;
  const inverterTitle = isOffGrid
    ? "OFF-GRID INVERTER / CHARGER"
    : config.systemType === "hybrid"
      ? "HYBRID STORAGE INVERTER"
      : "SOLAR GRID-TIE INVERTER";
  const inverterQty = Math.max(1, eff.inverterQuantity || 1);
  const stringsPerInverter = Math.ceil((eff.numberOfStrings || 0) / inverterQty);
  const mpptsTotal = calc.selectedInverter.numMppts;
  // Derived from the design (one string per MPPT, capped at the inverter's MPPT count);
  // config.mpptsUsedPerInverter is not maintained by the calculation engine.
  const mpptsUsed = Math.min(mpptsTotal, Math.max(1, stringsPerInverter));
  const dcIsolatorVolts = config.dcProtection?.isolatorVoltageVolts ?? 1000;
  const dcFuseVolts = config.dcProtection?.fuseVoltageVolts ?? 1000;
  const dcSpdInKa = config.dcProtection?.spdInKa ?? 20;
  const dcSpdImaxKa = config.dcProtection?.spdImaxKa ?? 40;
  const acSpdVolts = config.acProtection?.spdRatingVolts ?? 440;
  const dcMaxDropPct = config.cabling?.dcMaxDropPercent || 1.5;
  const acMaxDropPct = config.cabling?.acMaxDropPercent || 1.5;
  const utilityName = sanitizeStringForDxf(config.netMetering?.utilityProvider || "DISTRIBUTION UTILITY");
  // Drawing date in Philippine Standard Time (YYYY-MM-DD)
  const issueDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const withRoofPlan = hasRoofPlan(config);
  const TOTAL_SHEETS = withRoofPlan ? 5 : 4;
  const pName = sanitizeStringForDxf(panelData?.designation || "MAIN DISTRIBUTION PANEL (MDP)");
  const pMain = panelData?.mainFeeder?.cb || config.serviceCapacityAmps || 100;
  const pAf =
    panelData?.mainFeeder?.af ||
    (pMain <= 100 ? 100 : pMain <= 225 ? 225 : pMain <= 400 ? 400 : 800);
  const pPoles =
    panelData?.mainFeeder?.poles || (config.utilityPhase?.includes("3PH") ? 3 : 2);
  const pVolt = panelData?.systemVoltage || config.utilityVoltage || 230;
  const pPhase = sanitizeStringForDxf(
    panelData?.phaseText || (config.utilityPhase?.includes("3PH") ? "3PH 4W" : "1PH 2W")
  );
  // The app has no busbar field: the main breaker frame (AF) is taken as the busbar rating
  const busRating = pAf;
  const maxBus120 = Math.round(busRating * 1.2);
  const backfeedAmps = solarBackfeedAmps(calc);
  const totalInfeed = pMain + backfeedAmps;
  const multiInverter = calc.effective.inverterQuantity > 1;
  const tMinC = config.minOperatingTempC ?? 18; // engine defaults
  const tMaxC = config.maxOperatingTempC ?? 65;
  const is120Pass = totalInfeed <= maxBus120;

  // Formatted Cable Strings matching System SLD standards with mm² and mmØ
  const egcInsulation = config.dcProtection?.egcInsulation || "TW";
  const dcCableStr = `2 x ${calc.effective.dcCableSizeMm2} mm² ${config.cabling?.dcCable?.insulation || "PV1-F"} + 1 x ${calc.effective.dcEgcSizeMm2} mm² ${egcInsulation} (G), ${calc.effective.dcConduitSizeMm} mmØ ${config.cabling?.dcCable?.conduitType || "RSC"}`;
  const acParts = acConductorParts(calc);
  const acCableStr = `${acParts.phases} x ${calc.effective.acCableSizeMm2} mm² ${config.cabling?.acCable?.insulation || "THHN"}${acParts.neutral ? ` + 1 x ${calc.effective.acCableSizeMm2} mm² N` : ""} + 1 x ${calc.effective.acEgcSizeMm2} mm² ${egcInsulation} (G), ${calc.effective.acConduitSizeMm} mmØ ${config.cabling?.acCable?.conduitType || "PVC"}`;
  const dropSign = (pct: number, limit: number) => (pct <= limit ? "<=" : "> LIMIT");

  // Standard Sheet Border & Reference Grid Generator
  const drawStandardSheet = (originX: number, sheetNum: number, sheetTitle: string) => {
    // Outer & Inner Borders (ISO A3: 400mm x 277mm)
    drawBox("EPH-BORDER", originX + 10, 10, 400, 277);
    drawBox("EPH-BORDER", originX + 14, 14, 392, 269);

    // Reference Coordinate Grid (A-D, 1-6)
    d.setActiveLayer("EPH-BORDER");
    const gridX = [
      originX + 14,
      originX + 79.3,
      originX + 144.6,
      originX + 210,
      originX + 275.3,
      originX + 340.6,
      originX + 406,
    ];
    for (let i = 0; i < gridX.length - 1; i++) {
      const mid = (gridX[i] + gridX[i + 1]) / 2;
      drawText("EPH-BORDER", mid, 11, 2.0, String(i + 1), "center");
      drawText("EPH-BORDER", mid, 284, 2.0, String(i + 1), "center");
      d.drawLine(gridX[i], 10, gridX[i], 14);
      d.drawLine(gridX[i], 283, gridX[i], 287);
    }
    const gridY = [14, 81.25, 148.5, 215.75, 283];
    const gridLetters = ["D", "C", "B", "A"];
    for (let i = 0; i < gridY.length - 1; i++) {
      const mid = (gridY[i] + gridY[i + 1]) / 2;
      drawText("EPH-BORDER", originX + 12, mid - 1, 2.0, gridLetters[i], "center");
      drawText("EPH-BORDER", originX + 408, mid - 1, 2.0, gridLetters[i], "center");
      d.drawLine(originX + 10, gridY[i], originX + 14, gridY[i]);
      d.drawLine(originX + 406, gridY[i], originX + 410, gridY[i]);
    }

    // Top Header Banner
    drawBox("EPH-BORDER", originX + 14, 266, 392, 17);
    drawText(
      "EPH-TITLE",
      originX + 20,
      276.5,
      3.5,
      "ELECTRICALPH SOLAR PHOTOVOLTAIC ENGINEERING SYSTEM"
    );
    drawText(
      "EPH-TEXT",
      originX + 20,
      269.5,
      2.0,
      // Location is in the title block; keeping this line short stops it wrapping into the code reference
      `PROJECT: ${config.projectName.toUpperCase()} | SYSTEM: ${config.systemType.toUpperCase()}`,
      "left",
      220
    );

    drawText("EPH-TITLE", originX + 252, 276.5, 3.2, sheetTitle);
    drawText(
      "EPH-TEXT",
      originX + 252,
      269.5,
      1.8,
      "PHILIPPINE ELECTRICAL CODE (PEC) 2017 ARTICLE 6.90 / RA 9513 COMPLIANT",
      "left",
      150
    );
  };

  // Standard Engineering Title Block Generator (Bottom Right - aligned with top schedules)
  const drawStandardTitleBlock = (
    originX: number,
    sheetIndex: number,
    sheetTitle: string
  ) => {
    const tbX = originX + 276;
    const tbY = 14;
    const tbW = 126;
    const tbH = 74;

    drawBox("EPH-BORDER", tbX, tbY, tbW, tbH);

    // Branding & Project Box
    drawBox("EPH-TITLE", tbX, tbY + tbH - 12, tbW, 12);
    drawText("EPH-TITLE", tbX + 3, tbY + tbH - 5.5, 2.5, "ELECTRICALPH ENGINEERING", "left", tbW - 6);
    drawText(
      "EPH-TEXT",
      tbX + 3,
      tbY + tbH - 10,
      1.8,
      "PROJECT: " + sanitizeStringForDxf(config.projectName.toUpperCase()),
      "left",
      tbW - 6
    );

    drawBox("EPH-BORDER", tbX, tbY + tbH - 24, tbW, 12);
    drawText(
      "EPH-TEXT",
      tbX + 3,
      tbY + tbH - 17.5,
      1.8,
      "LOCATION: " + sanitizeStringForDxf(config.projectLocation),
      "left",
      tbW - 6
    );
    drawText(
      "EPH-TEXT",
      tbX + 3,
      tbY + tbH - 22,
      1.8,
      "CLIENT: " + sanitizeStringForDxf(config.clientName),
      "left",
      tbW - 6
    );

    // Drawing Title Box
    drawBox("EPH-TITLE", tbX, tbY + tbH - 38, tbW, 14);
    drawText("EPH-TITLE", tbX + 3, tbY + tbH - 30, 2.5, sheetTitle, "left", tbW - 6);
    drawText(
      "EPH-TEXT",
      tbX + 3,
      tbY + tbH - 36,
      1.9,
      `CAPACITY: ${calc.totalDcCapacityKwp} kWp DC / ${calc.totalInverterAcKw} kW AC`,
      "left",
      tbW - 6
    );

    // Revision Table (Y: tbY+24 to tbY+36, between drawing title and sign-off)
    const revTop = tbY + tbH - 38;
    const revRowH = 4;
    const revCols = [0, 12, 34, 106, tbW]; // REV | DATE | DESCRIPTION | BY
    d.setActiveLayer("EPH-BORDER");
    for (let r = 1; r <= 3; r++) {
      d.drawLine(tbX, revTop - r * revRowH, tbX + tbW, revTop - r * revRowH);
    }
    revCols.slice(1, -1).forEach((cx) => {
      d.drawLine(tbX + cx, revTop, tbX + cx, revTop - 3 * revRowH);
    });
    const revHeaders = ["REV", "DATE", "DESCRIPTION", "BY"];
    const designerInitials = sanitizeStringForDxf(config.designerName || "")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase())
      .join("")
      .slice(0, 4);
    const revRow0 = ["0", issueDate, "INITIAL ISSUE FOR REVIEW", designerInitials];
    revHeaders.forEach((h, i) => {
      drawText("EPH-TITLE", tbX + revCols[i] + 1.5, revTop - revRowH + 1.4, 1.3, h);
      drawText("EPH-TEXT", tbX + revCols[i] + 1.5, revTop - 2 * revRowH + 1.4, 1.2, revRow0[i], "left", revCols[i + 1] - revCols[i] - 3);
    });

    // Sign-off Matrix
    d.setActiveLayer("EPH-BORDER");
    d.drawLine(tbX + 63, tbY, tbX + 63, revTop - 3 * revRowH);

    drawText("EPH-TEXT", tbX + 3, tbY + 20, 1.6, "DESIGNED BY:");
    drawText("EPH-TITLE", tbX + 3, tbY + 14, 1.8, sanitizeStringForDxf(config.designerName), "left", 58);
    drawText("EPH-TEXT", tbX + 3, tbY + 8, 1.4, "REGISTERED ELECTRICAL ENGR");

    drawText("EPH-TEXT", tbX + 66, tbY + 20, 1.6, "CHECKED & APPROVED BY:");
    drawText("EPH-TITLE", tbX + 66, tbY + 14, 1.8, "PROFESSIONAL ELEC. ENGR.", "left", 56);
    drawText("EPH-TEXT", tbX + 66, tbY + 8, 1.4, "PEE SEAL & REGISTRATION");

    // Bottom Status Bar
    drawBox("EPH-BORDER", tbX, tbY, tbW, 6);
    drawText("EPH-TEXT", tbX + 3, tbY + 2, 1.5, "SCALE: N.T.S.");
    drawText("EPH-TEXT", tbX + 43, tbY + 2, 1.5, `DATE: ${issueDate}`);
    drawText("EPH-TITLE", tbX + 83, tbY + 2, 1.8, `SHEET: E-0${sheetIndex} OF 0${TOTAL_SHEETS}`);
  };

  // ==========================================
  // SHEET 1 OF 4: SOLAR PV SINGLE LINE DIAGRAM (same drawing as the on-screen SLD) & LEGEND
  // Origin X: 0
  // ==========================================
  // The diagram on this sheet is the same drawing as the on-screen Solar SLD: it is captured from
  // the SLD component and scaled to fit, so both always match.
  const sldOptions: PictorialOptions = {
    showSolarMeter: sldView?.showSolarMeter ?? (config.systemType !== "off-grid" && config.netMetering?.enabled !== false),
    showEpsLoad: sldView?.showEpsLoad ?? config.systemType === "hybrid",
    showGrounding: sldView?.showGrounding ?? true,
    showConductorSpecs: sldView?.showConductorSpecs ?? true,
  };
  const sld = captureSolarSld(config, calc, sldOptions, {
    mainBreakerAmps: pMain,
    mainBreakerPoles: pPoles,
    feederLabel: panelData?.mainFeeder?.feederLabel,
    conduitLabel: panelData?.mainFeeder?.conduitLabel,
    panelDesignation: panelData?.designation || "MAIN DISTRIBUTION PANEL (MDP)",
  });

  // Arial cap height as a fraction of the font size (DXF text height is the cap height)
  const CAP_HEIGHT = 0.716;
  const sheet1TitleBlock = { x1: 276 - 2, y1: 14, x2: 402 + 2, y2: 88 + 2 };
  const legendBox = { x1: 14, y1: 14, x2: 272, y2: 34 };

  // Combined template: the Block Diagram panel takes the right-hand column above the title block,
  // so the SLD is fitted in the zone to its left (between the header banner and zoneBottom)
  const blockPanel = { x1: 276, x2: 402, y2: 262 };
  const placeSld = (zoneBottom: number) => {
    const zx1 = 18, zx2 = blockPanel.x1 - 6, zy2 = 262;
    const bw = sld.bbox.x2 - sld.bbox.x1;
    const bh = sld.bbox.y2 - sld.bbox.y1;
    const s = Math.min((zx2 - zx1) / bw, (zy2 - zoneBottom) / bh);
    const ox = zx1 + (zx2 - zx1 - bw * s) / 2;
    return {
      s,
      X: (x: number) => ox + (x - sld.bbox.x1) * s,
      Y: (y: number) => zy2 - (y - sld.bbox.y1) * s,
    };
  };

  // The SLD zone ends left of the title block / block diagram column, so it uses the full height
  const sldPlacement = placeSld(legendBox.y2 + 3);
  const { X: sx, Y: sy, s: sldScale } = sldPlacement;

  // The SLD sheet is always the A3 template (420 x 297 mm), like the other sheets
  const sheet1Paper = { name: "A3", k: 1, size: "420 x 297" };
  paper.originX = 0;
  paper.k = sheet1Paper.k;

  drawStandardSheet(0, 1, "SOLAR PV SINGLE LINE DIAGRAM (SLD) & BLOCK DIAGRAM");
  drawStandardTitleBlock(0, 1, "SOLAR PV MASTER SLD");

  const useLayer = (layer: string) => ((d as any).layers?.[layer] ? layer : "EPH-SLD");
  /** Draws a captured drawing (SVG units, y down) with the given placement functions */
  const drawCaptured = (cap: SldCapture, sx: (x: number) => number, sy: (y: number) => number, scale: number) => {
  for (const p of cap.prims) {
    if (p.kind === "line") {
      d.setActiveLayer(useLayer(p.layer));
      d.drawLine(sx(p.x1), sy(p.y1), sx(p.x2), sy(p.y2));
    } else if (p.kind === "poly") {
      d.setActiveLayer(useLayer(p.layer));
      for (let i = 0; i + 1 < p.pts.length; i++) {
        d.drawLine(sx(p.pts[i][0]), sy(p.pts[i][1]), sx(p.pts[i + 1][0]), sy(p.pts[i + 1][1]));
      }
      if (p.closed) {
        const a = p.pts[p.pts.length - 1], b = p.pts[0];
        d.drawLine(sx(a[0]), sy(a[1]), sx(b[0]), sy(b[1]));
      }
    } else if (p.kind === "circle") {
      drawCircle(useLayer(p.layer), sx(p.cx), sy(p.cy), p.r * scale);
    } else {
      // SVG text y is the baseline; drawText centres a cap-height box on y + height / 2
      drawText(
        useLayer(p.layer),
        sx(p.x),
        sy(p.y),
        p.size * scale * CAP_HEIGHT,
        p.text,
        p.anchor === "middle" ? "center" : p.anchor === "end" ? "right" : "left"
      );
    }
  }
  };
  drawCaptured(sld, sx, sy, sldScale);

  // BLOCK DIAGRAM panel: framed, top of the right-hand column (above the title block)
  {
    const block = captureSolarBlockDiagram(config, calc, panelData?.designation);
    const b = block.bbox;
    const pad = 3;
    const k = (blockPanel.x2 - blockPanel.x1 - 2 * pad) / (b.x2 - b.x1);
    const panelH = (b.y2 - b.y1) * k + 2 * pad;
    const panelY1 = Math.max(sheet1TitleBlock.y2 + 3, blockPanel.y2 - panelH);
    drawBox("EPH-BORDER", blockPanel.x1, panelY1, blockPanel.x2 - blockPanel.x1, blockPanel.y2 - panelY1);
    const left = blockPanel.x1 + pad;
    const top = blockPanel.y2 - pad;
    drawCaptured(block, (x) => left + (x - b.x1) * k, (y) => top - (y - b.y1) * k, k);
  }

  // Legend strip (bottom left), drawn with the same symbols as the SLD
  drawBox("EPH-BORDER", legendBox.x1, legendBox.y1, legendBox.x2 - legendBox.x1, legendBox.y2 - legendBox.y1);
  drawText("EPH-TITLE", legendBox.x1 + 3, legendBox.y2 - 5, 1.8, "LEGEND");
  const legendItems: Array<{ label: string; draw: (x: number, y: number) => void }> = [
    {
      label: "PV MODULE",
      draw: (x, y) => {
        drawBox("EPH-PV", x, y - 4, 4, 8);
        d.setActiveLayer("EPH-PV");
        d.drawLine(x + 2, y - 4, x + 2, y + 4);
        [-2, 0, 2].forEach((dy) => d.drawLine(x, y + dy, x + 4, y + dy));
      },
    },
    {
      label: "2P BREAKER",
      draw: (x, y) => {
        drawBox("EPH-BREAKER", x, y - 4, 3.5, 8);
        drawCircle("EPH-BREAKER", x + 1.75, y + 3, 0.6);
        drawCircle("EPH-BREAKER", x + 1.75, y - 3, 0.6);
      },
    },
    {
      label: "SPD",
      draw: (x, y) => {
        drawBox("EPH-BREAKER", x, y - 2, 2, 6);
        d.setActiveLayer("EPH-GROUND");
        d.drawLine(x + 1, y - 2, x + 1, y - 3.5);
        d.drawLine(x - 0.2, y - 3.5, x + 2.2, y - 3.5);
      },
    },
    {
      label: "ISOLATOR",
      draw: (x, y) => {
        drawBox("EPH-BREAKER", x, y - 4, 5, 8);
        drawCircle("EPH-BREAKER", x + 2.5, y - 0.5, 1.6);
      },
    },
    {
      label: "kWh METER",
      draw: (x, y) => {
        drawCircle("EPH-SLD", x + 2.2, y, 2.2);
        drawText("EPH-TEXT", x + 2.2, y - 0.8, 1.6, "M", "center");
      },
    },
    {
      label: "GROUND",
      draw: (x, y) => {
        d.setActiveLayer("EPH-GROUND");
        d.drawLine(x + 2, y + 3, x + 2, y);
        d.drawLine(x, y, x + 4, y);
        d.drawLine(x + 0.7, y - 1, x + 3.3, y - 1);
        d.drawLine(x + 1.4, y - 2, x + 2.6, y - 2);
      },
    },
    {
      label: "DC CONDUCTOR",
      draw: (x, y) => {
        d.setActiveLayer("EPH-DC");
        d.drawLine(x, y, x + 6, y);
      },
    },
    {
      label: "AC CONDUCTOR",
      draw: (x, y) => {
        d.setActiveLayer("EPH-CABLE");
        d.drawLine(x, y, x + 6, y);
      },
    },
  ];
  const legendSlotW = (legendBox.x2 - legendBox.x1 - 6) / legendItems.length;
  legendItems.forEach((item, i) => {
    const x = legendBox.x1 + 3 + i * legendSlotW;
    const y = legendBox.y1 + 8;
    item.draw(x, y);
    drawText("EPH-TEXT", x + 7.5, y - 0.8, 1.6, item.label, "left", legendSlotW - 8.5);
  });
  // Scale note so readers know the SLD is not to scale
  drawText(
    "EPH-TEXT",
    legendBox.x2 - 3,
    legendBox.y2 - 5,
    1.5,
    `SLD SCALE: N.T.S. | SHEET SIZE: ${sheet1Paper.name} (${sheet1Paper.size} mm)`,
    "right"
  );

  // Back to A3 for the remaining sheets, placed to the right of (a possibly enlarged) Sheet 1
  paper.k = 1;
  const sheet1Right = 410 * sheet1Paper.k;

  // ==========================================
  // SHEET 2 OF 3: SOLAR DESIGN CALCULATION & EQUIPMENT SCHEDULES
  // Origin X: right of Sheet 1 (445 when Sheet 1 is A3)
  // ==========================================
  const s2OriginX = Math.ceil(sheet1Right + 35);
  drawStandardSheet(s2OriginX, 2, "SOLAR DESIGN CALCULATION & EQUIPMENT SCHEDULES");
  drawStandardTitleBlock(s2OriginX, 2, "CALCULATIONS & SCHEDULES");

  // Left Section: SOLAR DESIGN DATA & CALCULATION SUMMARY (X: 463 to 713, Y: 14 to 264)
  const calcTblX = s2OriginX + 18;
  const calcTblY = 14;
  const calcTblW = 250;
  const calcTblH = 250;

  drawBox("EPH-BORDER", calcTblX, calcTblY, calcTblW, calcTblH);
  drawBox("EPH-BORDER", calcTblX + 1, calcTblY + calcTblH - 12, calcTblW - 2, 11);
  drawText("EPH-TITLE", calcTblX + 4, calcTblY + calcTblH - 8, 2.5, "SOLAR PHOTOVOLTAIC DESIGN & CALCULATION SUMMARY");

  // Divider lines inside calculation table
  d.setActiveLayer("EPH-BORDER");
  d.drawLine(calcTblX + 120, calcTblY, calcTblX + 120, calcTblY + calcTblH - 12);
  d.drawLine(calcTblX + 195, calcTblY, calcTblX + 195, calcTblY + calcTblH - 12);

  // Table Subheaders
  let calcRowH = 14.5;
  const calcHeadY = calcTblY + calcTblH - 22;
  drawBox("EPH-BORDER", calcTblX + 1, calcHeadY - 2, calcTblW - 2, 10);
  drawText("EPH-TITLE", calcTblX + 4, calcHeadY + 2, 1.9, "ENGINEERING PARAMETER");
  drawText("EPH-TITLE", calcTblX + 124, calcHeadY + 2, 1.9, "CALCULATED VALUE");
  drawText("EPH-TITLE", calcTblX + 199, calcHeadY + 2, 1.9, "DESIGN BASIS / CODE REF");

  const calcSummaryData = [
    {
      param: "Total PV Array DC Capacity",
      val: `${calc.totalDcCapacityKwp} kWp (${calc.totalDcCapacityW} W)`,
      ref: "STC @ 1000 W/m², 25°C",
    },
    {
      param: "Total Inverter AC Power",
      val: `${calc.totalInverterAcKw} kW AC (${calc.effective.inverterQuantity} Units)`,
      ref: "Nominal Grid Injection",
    },
    {
      param: "System DC/AC Sizing Ratio",
      val: `${calc.dcAcRatio}`,
      ref: "Target: 1.15 - 1.25 (Optimal)",
    },
    {
      param: "Total PV Modules Installed",
      val: `${calc.totalModules} Units`,
      ref: `${calc.selectedModule.manufacturer} ${calc.selectedModule.model}`,
    },
    {
      param: "AC System / Inverter Connection",
      val: calc.acSystem
        ? `${calc.acSystem.serviceLabel} / ${calc.acSystem.inverterConnectionLabel}${calc.acSystem.phaseDistribution ? ` (${calc.acSystem.phaseDistribution.filter(([, n]) => n > 0).map(([p, n]) => `${p} x${n}`).join(", ")})` : ""}`
        : `${config.utilityVoltage}V ${config.utilityPhase}`,
      ref: calc.validations.phaseCompatible === false ? "PHASE / VOLTAGE MISMATCH [WARNING]" : "Phase & voltage matched",
    },
    {
      param: "PV Array String Configuration",
      val: `${calc.effective.numberOfStrings} Strings x ${calc.effective.modulesPerString} Modules`,
      ref: "Series / Parallel Config",
    },
    {
      param: `Array String Voc (Cold @ ${tMinC}°C)`,
      val: `${calc.stringVoc} V DC`,
      ref: "PEC 6.90.7 Temp Corrected",
    },
    {
      param: `Array String Vmp (Hot @ ${tMaxC}°C)`,
      val: `${calc.stringVmp} V DC`,
      ref: "Inverter MPPT Voltage Match",
    },
    {
      param: `String Current (Imp / Isc @ ${tMaxC}°C)`,
      val: `Imp=${calc.stringImp}A / Isc=${calc.stringIsc}A`,
      ref: "PEC 6.90.8 1.25x Factor",
    },
    {
      param: "Total DC Array Current (Strings x Imp)",
      val: `${calc.totalDcCurrent} A DC`,
      ref: "Combined Inverter DC Input",
    },
    {
      param: multiInverter ? "Inverter Max AC Output Current (each)" : "Inverter Max AC Output Current",
      val: `${calc.inverterMaxAcCurrent} A AC`,
      ref: `${calc.selectedInverter.phase} ${calc.selectedInverter.acVoltage || pVolt}V ${calc.selectedInverter.frequencyHz || config.utilityFrequency || 60}Hz`,
    },
    {
      param: multiInverter ? "Solar AC Breaker (each inverter)" : "Solar AC Breaker",
      val: `${calc.effective.acBreakerAtAmps}A AT / ${calc.effective.acBreakerAfAmps}A AF`,
      ref: "125% Inverter Continuous Duty",
    },
    ...(multiInverter
      ? [
          {
            param: "Solar Main Disconnect (all inverters)",
            val: `${calc.acMainDisconnectAmps}A AT, ${calc.acSystem?.mainDisconnectPoles ?? calc.effective.acBreakerPoles}P`,
            ref: `125% of ${calc.acSystem?.interconnectionLineCurrent ?? calc.totalSystemAcCurrent}A max line current`,
          },
        ]
      : []),
    {
      param: "DC Cable & Conduit Specification",
      val: dcCableStr,
      ref: `Vd=${calc.dcVoltageDropV}V (${calc.dcVoltageDropPercent}% ${dropSign(calc.dcVoltageDropPercent, dcMaxDropPct)} ${dcMaxDropPct}%)`,
    },
    {
      param: "AC Cable & Conduit Specification",
      val: acCableStr,
      ref: `Vd=${calc.acVoltageDropV}V (${calc.acVoltageDropPercent}% ${dropSign(calc.acVoltageDropPercent, acMaxDropPct)} ${acMaxDropPct}%)`,
    },
    {
      param: "Equipment Grounding Conductor",
      val: `${calc.effective.dcEgcSizeMm2} mm² ${config.dcProtection?.egcMaterial || "Cu"} (DC) / ${calc.effective.acEgcSizeMm2} mm² ${config.dcProtection?.egcMaterial || "Cu"} (AC)`,
      ref: "PEC Table 2.50.6.13",
    },
    applies120Rule
      ? {
          param: "120% Panel Busbar Verification",
          val: `${totalInfeed}A ${is120Pass ? "<=" : ">"} ${maxBus120}A Busbar Limit`,
          ref: is120Pass ? "PEC 6.90.7.2.D [COMPLIANT]" : "EXCEEDS BUSBAR [WARNING]",
        }
      : {
          param: "120% Panel Busbar Verification",
          val: "NOT APPLICABLE",
          ref: isOffGrid ? "Off-grid: utility input only, no export" : "Supply-side interconnection",
        },
  ];

  // Rows share the table height (extra rows appear with several inverters)
  calcRowH = Math.min(14.5, (calcHeadY - 2 - calcTblY) / calcSummaryData.length);
  calcSummaryData.forEach((row, idx) => {
    const ry = calcHeadY - (idx + 1) * calcRowH;
    d.setActiveLayer("EPH-BORDER");
    d.drawLine(calcTblX, ry, calcTblX + calcTblW, ry);
    drawText("EPH-TITLE", calcTblX + 4, ry + 4.5, 1.6, row.param, "left", 114);
    drawText("EPH-TEXT", calcTblX + 124, ry + 4.5, 1.5, row.val, "left", 68);
    drawText("EPH-ANNO", calcTblX + 199, ry + 4.5, 1.4, row.ref, "left", 48);
  });

  // Right Top Section: EQUIPMENT SCHEDULE TABLE (X: 721 to 847, Y: 96 to 264 - aligned with Title Block)
  const schedX = s2OriginX + 276;
  const schedY = 96;
  const schedW = 126;
  const schedH = 168;

  drawBox("EPH-BORDER", schedX, schedY, schedW, schedH);
  drawBox("EPH-BORDER", schedX + 1, schedY + schedH - 12, schedW - 2, 11);
  drawText("EPH-TITLE", schedX + 4, schedY + schedH - 8, 2.3, "EQUIPMENT & PROTECTION SCHEDULE");

  d.setActiveLayer("EPH-BORDER");
  d.drawLine(schedX + 34, schedY, schedX + 34, schedY + schedH - 12);
  d.drawLine(schedX + 88, schedY, schedX + 88, schedY + schedH - 12);

  const schedRowH = 17.5;
  const schedHeadY = schedY + schedH - 22;
  drawBox("EPH-BORDER", schedX + 1, schedHeadY - 2, schedW - 2, 10);
  drawText("EPH-TITLE", schedX + 3, schedHeadY + 2, 1.7, "EQUIPMENT");
  drawText("EPH-TITLE", schedX + 37, schedHeadY + 2, 1.7, "RATING & SPECS");
  drawText("EPH-TITLE", schedX + 91, schedHeadY + 2, 1.7, "STANDARD");

  const equipmentRows = [
    {
      eq: "PV MODULES",
      spec: `${calc.totalModules}x ${calc.selectedModule.ratedPowerWp}Wp\n${calc.selectedModule.manufacturer}`,
      std: "IEC 61215 / 61730",
    },
    {
      eq: "INVERTERS",
      spec: `${calc.effective.inverterQuantity}x ${calc.selectedInverter.ratedAcPowerKw}kW AC\n${calc.selectedInverter.manufacturer}`,
      std: "UL 1741 / IEEE 1547",
    },
    {
      eq: "DC ISOLATOR",
      spec: `${calc.effective.dcIsolatorRatingAmps}A DC ${dcIsolatorVolts}V\nRotary Lockable Switch`,
      std: "IEC 60947-3",
    },
    {
      eq: "STRING OCPD",
      spec: `${calc.effective.dcFuseRatingAmps}A ${dcFuseVolts}V DC, 2P\n1 per string (1.56 x Isc)`,
      std: "PEC 6.90.9",
    },
    {
      eq: multiInverter ? "AC BREAKER (EACH INV.)" : "AC BREAKER",
      spec: `${calc.effective.acBreakerAtAmps}A AT / ${calc.effective.acKaic} kAIC\n${calc.effective.acBreakerPoles}P @ ${calc.selectedInverter.acVoltage || pVolt}V AC`,
      std: "PEC 6.90.8",
    },
    {
      eq: "SURGE SPD",
      spec: `DC Uc: ${calc.effective.dcSpdUcVolts}V / AC: ${acSpdVolts}V\nDC In=${dcSpdInKa}kA, Imax=${dcSpdImaxKa}kA`,
      std: "IEC 61643-11",
    },
    {
      eq: "GROUNDING",
      spec: `EGC: ${calc.effective.dcEgcSizeMm2} mm² DC / ${calc.effective.acEgcSizeMm2} mm² AC\nRod: 16mm x 3.0m Cu (typ.)`,
      std: "PEC 2.50",
    },
    {
      eq: hasBattery ? "BATTERY" : "METER",
      spec: hasBattery
        ? `${calc.batteryUsableEnergyKwh} kWh usable${config.battery.chemistry ? ` ${sanitizeStringForDxf(config.battery.chemistry)}` : ""}`
        : hasNetMetering
          ? "Bi-Directional kWh"
          : "Utility kWh Meter",
      std: hasBattery ? "UL 1973 / 9540" : hasNetMetering ? "ERC Resolution" : "-",
    },
  ];

  equipmentRows.forEach((row, idx) => {
    const ry = schedHeadY - (idx + 1) * schedRowH;
    d.setActiveLayer("EPH-BORDER");
    d.drawLine(schedX, ry, schedX + schedW, ry);
    drawText("EPH-TITLE", schedX + 3, ry + 8, 1.5, row.eq, "left", 30);
    const lines = row.spec.split("\n");
    drawText("EPH-TEXT", schedX + 37, ry + 10, 1.4, lines[0], "left", 50);
    if (lines[1]) drawText("EPH-TEXT", schedX + 37, ry + 4, 1.3, lines[1], "left", 50);
    drawText("EPH-ANNO", schedX + 91, ry + 8, 1.4, row.std, "left", 33);
  });

  // ==========================================
  // SHEET 3 OF 3: GENERAL NOTES, MANDATES & DETAILS
  // Origin X: Sheet 2 origin + 445
  // ==========================================
  const s3OriginX = s2OriginX + 445;
  drawStandardSheet(s3OriginX, 3, "GENERAL NOTES, PEC 2017 MANDATES & DETAILS");
  drawStandardTitleBlock(s3OriginX, 3, "NOTES & MANDATES");

  // General Notes Box (Left Section: X: 908 to 1158, Y: 14 to 264 - 4mm clearance from sheet border)
  const notesBoxX = s3OriginX + 18;
  const notesBoxY = 14;
  const notesBoxW = 250;
  const notesBoxH = 250;

  drawBox("EPH-BORDER", notesBoxX, notesBoxY, notesBoxW, notesBoxH);
  drawBox("EPH-BORDER", notesBoxX + 1, notesBoxY + notesBoxH - 12, notesBoxW - 2, 11);
  drawText(
    "EPH-TITLE",
    notesBoxX + 4,
    notesBoxY + notesBoxH - 8,
    2.5,
    "GENERAL NOTES & PEC 2017 ARTICLE 6.90 COMPLIANCE MANDATES"
  );

  // General Notes & PEC 2017 Article 6.90 Mandates
  interface NoteItem {
    num: string;
    title: string;
    body: string[];
  }

  const busbarNote: Omit<NoteItem, "num"> = applies120Rule
    ? {
        title: "120% BUSBAR RULE COMPLIANCE (PEC 6.90.7.2.D)",
        body: [
          `Main OCPD (${pMain}A) + ${backfeedLabel(calc)} (${backfeedAmps}A) = ${totalInfeed}A total infeed.`,
          is120Pass
            ? `Shall not exceed 120% of panel busbar rating (${busRating}A x 1.2 = ${maxBus120}A allowable). Status: [PASS - COMPLIANT].`
            : `EXCEEDS 120% of panel busbar rating (${busRating}A x 1.2 = ${maxBus120}A allowable). Status: [WARNING] - REVISE DESIGN BEFORE ISSUE.`
        ]
      }
    : isOffGrid
      ? {
          title: "OFF-GRID SYSTEM WITH UTILITY BACKUP INPUT",
          body: [
            "The utility feeds the inverter AC input (charging / bypass) only; the system never exports. The",
            "120% busbar rule and net-metering do not apply. The inverter AC output shall not be tied to utility circuits."
          ]
        }
      : {
          title: "SUPPLY-SIDE INTERCONNECTION",
          body: [
            "The PV system is connected on the supply side of the service disconnect; the 120% busbar rule",
            "(PEC 6.90.7.2.D) does not apply. Supply-side tap conductors and OCPD shall be sized per PEC."
          ]
        };

  const noteDrafts: Array<Omit<NoteItem, "num">> = [
    {
      title: "CODE COMPLIANCE & LEGAL MANDATES",
      body: [
        "All works shall strictly comply with the Philippine Electrical Code (PEC) 2017 Part 1,",
        "Republic Act 7920 (Electrical Engineering Law), RA 9513 (Renewable Energy Act), and ERC Res. 06-2019."
      ]
    },
    {
      title: "DIRECT PROFESSIONAL SUPERVISION",
      body: [
        "Electrical installation, testing, and commissioning shall be under the direct supervision",
        "of a duly licensed Professional Electrical Engineer (PEE) or Registered Electrical Engineer (REE)."
      ]
    },
    busbarNote,
    {
      title: "RAPID SHUTDOWN REQUIREMENTS (PEC 6.90.2.2)",
      body: [
        "PV system circuits on or in buildings shall include rapid shutdown reducing conductor voltage to <= 80V",
        "inside the array boundary and <= 30V outside the array boundary within 30 seconds of initiation."
      ]
    },
    ...(isGridTied
      ? [
          {
            title: "ANTI-ISLANDING & GRID INTERCONNECTION (IEEE 1547 / UL 1741)",
            body: [
              "Grid-interactive inverters shall be listed with anti-islanding protection that disconnects",
              "from the distribution utility within 2.0 seconds of power outage or abnormal grid parameters."
            ]
          }
        ]
      : []),
    {
      title: "GROUND FAULT DETECTION & INTERRUPTION (GFDI - PEC 6.90.1.5)",
      body: [
        "Ground-fault protection shall be provided (integral to the listed inverter where applicable) to detect,",
        "interrupt, and indicate any ground-fault current per PEC 6.90.1.5 mandates."
      ]
    },
    {
      title: "CONDUCTOR & CONDUIT SPECIFICATIONS",
      body: [
        `DC PV wiring: ${config.cabling?.dcCable?.insulation || "PV1-F"} in ${config.cabling?.dcCable?.conduitType || "RSC"} conduit. AC feeders: ${config.cabling?.acCable?.insulation || "THHN"}`,
        `in ${config.cabling?.acCable?.conduitType || "PVC"} conduit. EGC: ${egcInsulation}, sizes per the calculation summary (Sheet 2).`
      ]
    },
    {
      title: "EQUIPMENT GROUNDING & BONDING SYSTEM (PEC 2.50)",
      body: [
        "All exposed non-current-carrying metal frames, racks, enclosures, and inverters shall be solidly",
        "bonded to the Equipment Grounding Conductor (EGC) and copper ground rod (R <= 5.0 Ohms)."
      ]
    }
  ];
  const structuredNotes: NoteItem[] = noteDrafts.map((note, i) => ({ ...note, num: `${i + 1}.` }));
  const placardNoteNum = structuredNotes.length + 1;

  // Render the structured notes in the upper section of Sheet 3
  let curNoteY = notesBoxY + notesBoxH - 18;
  structuredNotes.forEach((note) => {
    drawText(
      "EPH-TITLE",
      notesBoxX + 4,
      curNoteY,
      1.55,
      `${note.num} ${note.title}:`,
      "left",
      notesBoxW - 8
    );
    curNoteY -= 4.2;

    note.body.forEach((line) => {
      drawText(
        "EPH-TEXT",
        notesBoxX + 8,
        curNoteY,
        1.35,
        line,
        "left",
        notesBoxW - 12
      );
      curNoteY -= 3.8;
    });

    curNoteY -= 2.6; // Section separator
  });

  // Dedicated Lower Section: 9. PERMANENT DIRECTORY & SAFETY WARNING PLACARDS (PEC 6.90.7 / PEC 6.90.54)
  // Perfectly positioned between Y: 18 and Y: 114 to prevent any overlaps or wasted sheet space
  const placY = notesBoxY + 6;
  const placH = 92;
  const placW = notesBoxW - 8;
  const placX = notesBoxX + 4;

  drawBox("EPH-BORDER", placX, placY, placW, placH);
  drawBox("EPH-BORDER", placX + 1, placY + placH - 9, placW - 2, 8);
  drawText(
    "EPH-TITLE",
    placX + 4,
    placY + placH - 6.5,
    1.9,
    `${placardNoteNum}. PERMANENT DIRECTORY & SAFETY WARNING PLACARDS (PEC 6.90.7 / PEC 6.90.54)`
  );

  // Placard 1: Main Dual Source Warning Placard (Left Half)
  const p1X = placX + 4;
  const p1Y = placY + 5;
  const p1W = (placW - 12) / 2;
  const p1H = placH - 17;

  drawBox("EPH-BREAKER", p1X, p1Y, p1W, p1H);
  drawBox("EPH-BREAKER", p1X + 1, p1Y + p1H - 9, p1W - 2, 8);
  drawText(
    "EPH-BREAKER",
    p1X + p1W / 2,
    p1Y + p1H - 6.5,
    1.6,
    isGridTied ? "WARNING: DUAL POWER SOURCE" : "WARNING: SOLAR PV POWER SOURCE",
    "center"
  );

  drawText(
    "EPH-TEXT",
    p1X + 4,
    p1Y + p1H - 14,
    1.3,
    isGridTied
      ? "SECOND SOURCE IS ON-SITE SOLAR PHOTOVOLTAIC SYSTEM"
      : "POWER SOURCE IS ON-SITE SOLAR PHOTOVOLTAIC SYSTEM",
    "left",
    p1W - 8
  );
  drawText(
    "EPH-TEXT",
    p1X + 4,
    p1Y + p1H - 21,
    1.25,
    `RATED DC VOLTAGE: ${calc.stringVoc} V DC (MAX: ${calc.selectedInverter.maxDcVoltage}V)`,
    "left",
    p1W - 8
  );
  drawText(
    "EPH-TEXT",
    p1X + 4,
    p1Y + p1H - 27,
    1.25,
    `RATED DC CURRENT: ${calc.totalDcCurrent} A DC | STRING Isc: ${calc.stringIsc} A`,
    "left",
    p1W - 8
  );
  drawText(
    "EPH-TEXT",
    p1X + 4,
    p1Y + p1H - 33,
    1.2,
    "DISCONNECT BOTH AC AND DC DISCONNECTS BEFORE SERVICING",
    "left",
    p1W - 8
  );
  drawText(
    "EPH-ANNO",
    p1X + 4,
    p1Y + p1H - 40,
    1.15,
    "RAPID SHUTDOWN INITIATOR LOCATION: ____________________ (PEC 6.90.2.2)",
    "left",
    p1W - 8
  );
  drawText(
    "EPH-TEXT",
    p1X + 4,
    p1Y + 4,
    1.1,
    "SIGN MATERIAL: ENGRAVED UV-RESISTANT PHENOLIC PLAQUE WITH RED BACKGROUND",
    "left",
    p1W - 8
  );

  // Placard 2: Interconnection & Busbar Placard (Right Half)
  const p2X = placX + 8 + p1W;
  const p2Y = placY + 5;
  const p2W = p1W;
  const p2H = placH - 17;

  drawBox("EPH-ANNO", p2X, p2Y, p2W, p2H);
  drawBox("EPH-ANNO", p2X + 1, p2Y + p2H - 9, p2W - 2, 8);
  drawText("EPH-ANNO", p2X + p2W / 2, p2Y + p2H - 6.5, 1.6, "SOLAR PV INTERCONNECTION DIRECTORY", "center");

  drawText(
    "EPH-TEXT",
    p2X + 4,
    p2Y + p2H - 14,
    1.3,
    `CONNECTED AT: ${pName} (${pVolt}V ${pPhase})`,
    "left",
    p2W - 8
  );
  drawText(
    "EPH-TEXT",
    p2X + 4,
    p2Y + p2H - 21,
    1.25,
    `SOLAR INVERTER OUTPUT: ${calc.totalInverterAcKw} kW AC | I_MAX: ${multiInverter ? `${calc.totalSystemAcCurrent} A TOTAL` : `${calc.inverterMaxAcCurrent} A`}`,
    "left",
    p2W - 8
  );
  drawText(
    "EPH-TEXT",
    p2X + 4,
    p2Y + p2H - 27,
    1.25,
    `${backfeedLabel(calc).toUpperCase()}: ${backfeedAmps}A AT${multiInverter ? ` (${calc.effective.inverterQuantity} INVERTERS)` : ` / ${calc.effective.acKaic} kAIC`}`,
    "left",
    p2W - 8
  );
  drawText(
    applies120Rule && !is120Pass ? "EPH-BREAKER" : "EPH-TEXT",
    p2X + 4,
    p2Y + p2H - 33,
    1.2,
    applies120Rule
      ? `120% BUSBAR RULE: ${totalInfeed}A ${is120Pass ? "<=" : ">"} ${maxBus120}A (PEC 6.90.7.2.D) ${is120Pass ? "[PASS]" : "[WARNING]"}`
      : isOffGrid
        ? "OFF-GRID: UTILITY INPUT ONLY, NO EXPORT (120% RULE N/A)"
        : "SUPPLY-SIDE INTERCONNECTION: 120% BUSBAR RULE N/A",
    "left",
    p2W - 8
  );
  if (applies120Rule) {
    drawText(
      "EPH-ANNO",
      p2X + 4,
      p2Y + p2H - 40,
      1.15,
      `WARNING: DO NOT RELOCATE SOLAR INTERCONNECTION BREAKER FROM BUS END`,
      "left",
      p2W - 8
    );
  }
  drawText(
    "EPH-TEXT",
    p2X + 4,
    p2Y + 4,
    1.1,
    "INSTALLATION SHALL REMAIN VISIBLE AND LEGIBLE AFTER FINAL FINISHES",
    "left",
    p2W - 8
  );

  // Right Top Section: COMMISSIONING & PEE AUDIT CHECKLIST (X: 1166 to 1292, Y: 96 to 264 - aligned with Title Block)
  const chkX = s3OriginX + 276;
  const chkY = 96;
  const chkW = 126;
  const chkH = 168;

  drawBox("EPH-BORDER", chkX, chkY, chkW, chkH);
  drawBox("EPH-BORDER", chkX + 1, chkY + chkH - 12, chkW - 2, 11);
  drawText("EPH-TITLE", chkX + 4, chkY + chkH - 8, 2.3, "COMMISSIONING AUDIT CHECKLIST");

  // Tests are left unchecked: results are recorded on site during commissioning
  const checklistItems = [
    "Array Open Circuit Voltage (Voc) Test",
    "String Operating Current (Imp) Verification",
    "Ground Fault Resistance (Riso) >= 1.0 M-Ohm",
    "Earth Grounding Resistance (R) <= 5.0 Ohms",
    "Polarity Verification (+ / -) Prior to Connection",
    ...(isGridTied ? ["Inverter Anti-Islanding Trip Test (<= 2.0s)"] : []),
    "Rapid Shutdown Initiation & Discharge Check",
    ...(applies120Rule ? ["120% Busbar Rule Verification & Main OCPD"] : []),
    ...(hasBattery ? ["Battery OCPD, Polarity & BMS Communication Check"] : []),
    "Terminal Torque Verification per Manufacturer",
    isGridTied ? "Phenolic Danger & Dual Source Warning Plaques" : "Phenolic Danger & PV Source Warning Plaques",
    ...(hasNetMetering ? ["Net-Metering Revenue Meter Bi-Directional Test"] : []),
    "As-Built Documentation Signed & Sealed by PEE",
  ];

  const chkRowH = Math.min(9.8, 112 / checklistItems.length);
  checklistItems.forEach((item, idx) => {
    drawText("EPH-TEXT", chkX + 6, chkY + chkH - 22 - idx * chkRowH, 1.45, `[   ] ${item}`, "left", chkW - 12);
  });

  // Commissioning sign-off lines
  drawText("EPH-TEXT", chkX + 6, chkY + 13, 1.4, "TESTED BY: ________________________________", "left", chkW - 12);
  drawText("EPH-TEXT", chkX + 6, chkY + 5, 1.4, "DATE TESTED: ______________________________", "left", chkW - 12);

  // ==========================================
  // SHEET 4 OF 4: EQUIPMENT DATASHEET TABLES
  // Origin X: Sheet 3 origin + 445
  // ==========================================
  const s4OriginX = s3OriginX + 445;
  drawStandardSheet(s4OriginX, 4, "EQUIPMENT DATASHEET SPECIFICATIONS");
  drawStandardTitleBlock(s4OriginX, 4, "EQUIPMENT DATASHEETS");

  const fmt = (v: any, unit = "") =>
    v === undefined || v === null || v === "" || (typeof v === "number" && !isFinite(v))
      ? "-"
      : `${v}${unit}`;

  // Top-anchored two-column specification table; returns the table's bottom Y
  const drawSpecTable = (
    x: number,
    topY: number,
    w: number,
    labelW: number,
    title: string,
    rows: Array<[string, string]>,
    rowH: number
  ) => {
    const titleH = 11;
    const headH = 9;
    const h = titleH + headH + rows.length * rowH + 1;
    const y = topY - h;
    const headTop = topY - titleH;

    drawBox("EPH-BORDER", x, y, w, h);
    drawBox("EPH-BORDER", x + 1, headTop, w - 2, titleH - 1);
    drawText("EPH-TITLE", x + 4, topY - 7, 2.3, title, "left", w - 8);

    d.setActiveLayer("EPH-BORDER");
    d.drawLine(x, headTop - headH, x + w, headTop - headH);
    d.drawLine(x + labelW, y, x + labelW, headTop);
    drawText("EPH-TITLE", x + 3, headTop - headH + 3, 1.7, "PARAMETER");
    drawText("EPH-TITLE", x + labelW + 3, headTop - headH + 3, 1.7, "VALUE");

    rows.forEach(([label, value], i) => {
      const ry = headTop - headH - (i + 1) * rowH;
      if (i < rows.length - 1) {
        d.setActiveLayer("EPH-BORDER");
        d.drawLine(x, ry, x + w, ry);
      }
      const ty = ry + (rowH - 1.5) / 2;
      drawText("EPH-TITLE", x + 3, ty, 1.45, label, "left", labelW - 6);
      drawText("EPH-TEXT", x + labelW + 3, ty, 1.45, value, "left", w - labelW - 6);
    });
    return y;
  };

  const mod = calc.selectedModule;
  const moduleRows: Array<[string, string]> = [
    ["Manufacturer", fmt(mod.manufacturer)],
    ["Model", fmt(mod.model)],
    ["Rated Power (Pmax @ STC)", fmt(mod.ratedPowerWp, " Wp")],
    ["Open Circuit Voltage (Voc)", fmt(mod.voc, " V")],
    ["Short Circuit Current (Isc)", fmt(mod.isc, " A")],
    ["Max. Power Voltage (Vmp)", fmt(mod.vmp, " V")],
    ["Max. Power Current (Imp)", fmt(mod.imp, " A")],
    ["Maximum System Voltage", fmt(mod.maxSystemVoltage, " V DC")],
    ["Module Efficiency", fmt(mod.efficiencyPercent, " %")],
    ["Temp. Coefficient of Voc", fmt(mod.tempCoeffVoc, " %/°C")],
    ["Temp. Coefficient of Isc", fmt(mod.tempCoeffIsc, " %/°C")],
    ["Temp. Coefficient of Pmax", fmt(mod.tempCoeffPmax, " %/°C")],
    ["Dimensions (L x W x T)", `${fmt(mod.lengthMm)} x ${fmt(mod.widthMm)} x ${fmt(mod.thicknessMm)} mm`],
    ["Weight", fmt(mod.weightKg, " kg")],
    [`Module Voc @ ${fmt(config.minOperatingTempC, "°C")} (Design)`, fmt(calc.vocCold, " V")],
    [`Module Vmp @ ${fmt(config.maxOperatingTempC, "°C")} (Design)`, fmt(calc.vmpHot, " V")],
    ["Quantity", `${fmt(calc.totalModules)} pcs (${eff.numberOfStrings} x ${eff.modulesPerString})`],
  ];
  const moduleBottom = drawSpecTable(
    s4OriginX + 18,
    264,
    250,
    120,
    "PV MODULE DATASHEET",
    moduleRows,
    6.5
  );

  if (hasBattery) {
    const b = config.battery;
    const batteryRows: Array<[string, string]> = [
      ["Manufacturer", fmt(b.manufacturer)],
      ["Model", fmt(b.model)],
      ["Chemistry", fmt(b.chemistry)],
      ["Nominal Voltage (per unit)", fmt(b.voltageV, " V")],
      ["Capacity (per unit)", fmt(b.capacityAh, " Ah")],
      ["Energy (per unit)", fmt(b.energyKwh, " kWh")],
      ["Depth of Discharge (Design)", fmt(b.dodPercent || 90, " %")],
      ["Round-Trip Efficiency (Design)", fmt(b.efficiencyPercent || 95, " %")],
      ["Battery Units", fmt(eff.batteryUnits)],
      ["Total Installed Energy", fmt(Number((eff.batteryUnits * (b.energyKwh || 4.8)).toFixed(1)), " kWh")],
      ["Usable Bank Energy (Design)", fmt(calc.batteryUsableEnergyKwh, " kWh")],
      ["Backup Load (Design Basis)", fmt(b.requiredBackupLoadKw || 25, " kW")],
      ["Backup Duration (Design)", calc.batteryBackupHoursActual > 0 ? fmt(calc.batteryBackupHoursActual, " h") : "-"],
    ];
    drawSpecTable(s4OriginX + 18, moduleBottom - 6, 250, 120, "BATTERY STORAGE DATASHEET", batteryRows, 6.5);
  }

  const inv = calc.selectedInverter;
  const inverterRows: Array<[string, string]> = [
    ["Manufacturer", fmt(inv.manufacturer)],
    ["Model", fmt(inv.model)],
    ["Rated AC Power", fmt(inv.ratedAcPowerKw, " kW")],
    ["Max. DC Input Power", fmt(inv.maxDcInputPowerKw, " kW")],
    ["Max. DC Input Voltage", fmt(inv.maxDcVoltage, " V")],
    ["MPPT Voltage Range", `${fmt(inv.mpptVoltageRangeMin)} - ${fmt(inv.mpptVoltageRangeMax)} V`],
    ["Number of MPPTs", fmt(inv.numMppts)],
    ["Max. Input Current / MPPT", fmt(inv.maxInputCurrentPerMppt, " A")],
    ["Max. Isc / MPPT", fmt(inv.maxIscPerMppt, " A")],
    ["Rated AC Current", fmt(inv.ratedAcCurrent, " A")],
    ["Max. AC Current", fmt(inv.maxAcCurrent, " A")],
    ["AC Output", `${fmt(inv.phase)} ${fmt(inv.acVoltage, "V")} ${fmt(inv.frequencyHz, "Hz")}`],
    ["Max. Efficiency", fmt(inv.efficiencyPercent, " %")],
    ["Enclosure Rating", fmt(inv.ipRating)],
    ["Quantity", `${inverterQty} unit(s)`],
  ];
  const invBottom = drawSpecTable(s4OriginX + 276, 264, 126, 62, "INVERTER DATASHEET", inverterRows, 7.5);
  drawText(
    "EPH-ANNO",
    s4OriginX + 278,
    invBottom - 6,
    1.3,
    "Values as entered in ElectricalPH. Verify against the manufacturer's latest datasheet before procurement and construction.",
    "left",
    122
  );

  // ==========================================
  // SHEET 5 OF 5: ROOF PLAN (true scale 1:N, vector geometry)
  // Origin X: Sheet 4 origin + 445
  // ==========================================
  if (withRoofPlan) {
    const o5 = s4OriginX + 445;
    drawStandardSheet(o5, 5, "ROOF PLAN - PV MODULE LAYOUT");
    drawStandardTitleBlock(o5, 5, "ROOF PLAN");
    const plan = config.roofPlan!;
    // Drawing zone left of the info column; the info column sits above the title block
    const zone = { x1: o5 + 18, x2: o5 + 268, y1: 18, y2: 262 };
    const lay = roofPlanLayout(plan, calc, zone.x2 - zone.x1, zone.y2 - zone.y1);
    const { bounds: b, s: k, N } = lay;
    const left = zone.x1 + (zone.x2 - zone.x1 - lay.drawW) / 2;
    const top = zone.y2 - (zone.y2 - zone.y1 - lay.drawH) / 2;
    const RX = (px: number) => left + (px - b.x1) * k;
    const RY = (py: number) => top - (py - b.y1) * k;
    const mpp = metersPerPx(plan);
    const polyline = (layer: string, pts: Array<[number, number]>) => {
      d.setActiveLayer(layer);
      pts.forEach((p, i) => {
        const q = pts[(i + 1) % pts.length];
        d.drawLine(RX(p[0]), RY(p[1]), RX(q[0]), RY(q[1]));
      });
    };

    // Modules with string labels
    const dims = moduleDims(calc);
    const strings = assignStrings(plan, calc);
    const shortMm = Math.min(dims.lengthM, dims.widthM) * (1000 / N);
    plan.modules.forEach((m) => {
      polyline("EPH-PV", moduleCorners(m, dims, mpp));
      const st = strings.get(m.id);
      if (st && shortMm >= 3.2) drawText("EPH-TEXT", RX(m.x), RY(m.y), Math.min(1.8, shortMm * 0.3), st.extra ? "X" : `S${st.stringNo}-${st.pos}`, "center");
    });

    // Roof outlines, edge lengths and face names
    plan.faces.forEach((face) => {
      polyline("EPH-ROOF", face.points);
      face.points.forEach((p, i) => {
        const q = face.points[(i + 1) % face.points.length];
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]) * mpp;
        // Outside the edge, clear of it whatever the edge direction (y is up in the DXF)
        const label = `${len.toFixed(2)} m`;
        const [nx, ny] = edgeLabelOffset(face.points, i, 1);
        const off = 1.2 + Math.abs(nx) * (label.length * 1.8 * 0.62) / 2 + Math.abs(ny) * 1.4;
        drawText("EPH-DIM", RX((p[0] + q[0]) / 2) + nx * off, RY((p[1] + q[1]) / 2) - ny * off, 1.8, label, "center");
      });
      const cx = face.points.reduce((a, p) => a + p[0], 0) / face.points.length;
      const cy = face.points.reduce((a, p) => a + p[1], 0) / face.points.length;
      drawText("EPH-ROOF", RX(cx), RY(cy), 2.2, face.name.toUpperCase(), "center");
    });

    // North arrow (top-right of the zone) and scale bar (bottom-left)
    const nx = zone.x2 - 8, ny = zone.y2 - 6;
    d.setActiveLayer("EPH-ANNO");
    d.drawLine(nx, ny, nx + 2.6, ny - 8);
    d.drawLine(nx + 2.6, ny - 8, nx, ny - 5.5);
    d.drawLine(nx, ny - 5.5, nx - 2.6, ny - 8);
    d.drawLine(nx - 2.6, ny - 8, nx, ny);
    drawText("EPH-ANNO", nx, ny - 11, 2.2, "N", "center");
    const mmPerM = 1000 / N;
    const barM = [100, 50, 20, 10, 5, 2, 1, 0.5].find((m) => m * mmPerM <= 50) || 0.5;
    const bx = zone.x1 + 4, by = zone.y1 + 6;
    d.setActiveLayer("EPH-ANNO");
    d.drawLine(bx, by, bx + barM * mmPerM, by);
    for (let i = 0; i <= 4; i++) d.drawLine(bx + (i * barM * mmPerM) / 4, by, bx + (i * barM * mmPerM) / 4, by + (i % 4 === 0 ? 2 : 1.2));
    drawText("EPH-ANNO", bx, by + 3.4, 1.8, "0", "center");
    drawText("EPH-ANNO", bx + barM * mmPerM, by + 3.4, 1.8, `${barM} m`, "center");
    drawText("EPH-ANNO", bx + barM * mmPerM + 5, by + 0.6, 2.0, `SCALE 1:${N}`, "left");

    // Info column above the title block
    const info = roofPlanInfo(config, calc, N, "A3");
    const ix = o5 + 278, iw = 122;
    let iy = 258;
    const put = (t: string, h: number, layer = "EPH-TEXT") => {
      const per = Math.max(10, Math.floor(iw / (h * 0.62)));
      const words = t.split(/\s+/);
      let cur = "";
      const flush = () => {
        if (cur) {
          drawText(layer, ix, iy, h, cur, "left");
          iy -= h * 1.6;
        }
        cur = "";
      };
      for (const w of words) {
        if ((cur + " " + w).trim().length > per) flush();
        cur = (cur + " " + w).trim();
      }
      flush();
    };
    drawText("EPH-TITLE", ix, iy, 2.4, "ROOF PLAN DATA", "left");
    iy -= 5;
    for (const [key, val] of info.rows) {
      if (iy < 98) break;
      put(`${key}: ${val}`, 1.6);
      iy -= 0.6;
    }
    iy -= 1.5;
    for (const fc of info.faces) {
      if (iy < 104) break;
      put(fc.title, 1.7, "EPH-ROOF");
      put(fc.detail, 1.5);
      put(fc.edges, 1.5);
      iy -= 0.8;
    }
    if (info.issues.length && iy > 104) {
      put("CHECKS:", 1.7, "EPH-BREAKER");
      for (const t of info.issues) if (iy > 98) put(`- ${t.toUpperCase()}`, 1.5, "EPH-BREAKER");
    }
    if (iy > 98) put("NOTE: SATELLITE PHOTO NOT EMBEDDED IN DXF; ROOF OUTLINES AND MODULES ARE DRAWN TO SCALE.", 1.5);
  }

  // Ensure all AutoCAD text styles utilize Arial TrueType font, matching System SLD
  const styleTable = (d as any).tables?.["STYLE"];
  if (styleTable && styleTable.elements) {
    styleTable.elements.forEach((elem: any) => {
      elem.fontFileName = "arial.ttf";
    });
  }

  return d.toDxfString();
}
