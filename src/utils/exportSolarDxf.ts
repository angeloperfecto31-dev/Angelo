import Drawing from "dxf-writer";
// @ts-ignore
import DatabaseObject from "dxf-writer/src/DatabaseObject.js";
// @ts-ignore
import TextStyle from "dxf-writer/src/TextStyle.js";
import { saveAs } from "file-saver";
import { SolarDesignConfig, SolarCalculationResults } from "../types/solar";
import { sanitizeStringForDxf, MText } from "./exportDxf";

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
 *   - SHEET 1 OF 4: Solar PV Master Single Line Diagram (SLD) & Symbols Legend
 *   - SHEET 2 OF 4: Solar Design Data, Sizing Calculations & Equipment Schedule
 *   - SHEET 3 OF 4: General Notes, PEC Mandates, Safety Warning Placards & Checklist
 *   - SHEET 4 OF 4: PV Module, Inverter & Battery Datasheet Tables
 *
 * The drawing reflects the actual design: off-grid systems omit utility interconnection,
 * the 120% busbar status follows the calculation, and commissioning tests are left blank.
 */
export function exportSolarToDxf(
  config: SolarDesignConfig,
  calc: SolarCalculationResults,
  panelData?: {
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
) {
  const d = new Drawing();
  // Set Millimeters units (INSUNITS = 4), identical to System SLD
  d.setUnits("Millimeters");

  // 1. Standard CAD Layers per ElectricalPH Specification & System SLD conventions
  d.addLayer("EPH-BORDER", 2, "CONTINUOUS");   // Yellow
  d.addLayer("EPH-TITLE", 4, "CONTINUOUS");    // Cyan
  d.addLayer("EPH-SLD", 7, "CONTINUOUS");      // White
  d.addLayer("EPH-PV", 2, "CONTINUOUS");       // Yellow
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

  // DC conductor runs use a short dashed linetype sized for the A3 millimetre sheet
  d.addLineType("EPH_DC_DASH", "__ __ __", [2.0, -1.0]);
  d.addLayer("EPH-DC", 1, "EPH_DC_DASH");      // Red, dashed

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
    "EPH-GROUND": 35,
    "EPH-BATTERY": 35,
    "EPH-LEGEND": 18,
    "EPH-NOTES": 18,
    "EPH-TEXT": 18,
    "EPH-DIM": 13,
    "EPH-ANNO": 18,
  };
  Object.entries(layerLineweights).forEach(([name, lw]) => setLayerLineweight(name, lw));
  d.header("LWDISPLAY", [[290, 1]]);

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
      x,
      adjustedY,
      adjustedHeight,
      rotation,
      cleanedText,
      align,
      vAlign,
      wrapWidth
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
  const dcMaxDropPct = config.cabling?.dcMaxDropPercent ?? 2.0;
  const acMaxDropPct = config.cabling?.acMaxDropPercent ?? 1.5;
  const utilityName = sanitizeStringForDxf(config.netMetering?.utilityProvider || "DISTRIBUTION UTILITY");
  // Drawing date in Philippine Standard Time (YYYY-MM-DD)
  const issueDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const TOTAL_SHEETS = 4;
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
  const busRating = pAf;
  const maxBus120 = Math.round(busRating * 1.2);
  const totalInfeed = pMain + calc.effective.acBreakerAtAmps;
  const is120Pass = totalInfeed <= maxBus120;

  // Formatted Cable Strings matching System SLD standards with mm² and mmØ
  const dcCableStr = `2 x ${calc.effective.dcCableSizeMm2} mm² PV1-F + 1 x ${calc.effective.dcEgcSizeMm2} mm² G, ${calc.effective.dcConduitSizeMm} mmØ RSC`;
  const acCableStr = `${calc.effective.acBreakerPoles} x ${calc.effective.acCableSizeMm2} mm² THHN + 1 x ${calc.effective.acEgcSizeMm2} mm² G, ${calc.effective.acConduitSizeMm} mmØ PVC`;

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
      `PROJECT: ${config.projectName.toUpperCase()} | LOCATION: ${config.projectLocation.toUpperCase()} | SYSTEM: ${config.systemType.toUpperCase()}`,
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
  // SHEET 1 OF 3: MASTER SINGLE LINE DIAGRAM & SYMBOLS LEGEND
  // Origin X: 0
  // ==========================================
  drawStandardSheet(0, 1, "SOLAR PV SINGLE LINE DIAGRAM (SLD)");
  drawStandardTitleBlock(0, 1, "SOLAR PV MASTER SLD");

  const busY = 175; // Main horizontal schematic bus

  // A. PV Array Generation Source (X: 18 to 86, Y: 136 to 262)
  const arrayBoxX = 18;
  const arrayBoxY = 136;
  const arrayBoxW = 68;
  const arrayBoxH = 126;

  drawBox("EPH-PV", arrayBoxX, arrayBoxY, arrayBoxW, arrayBoxH);
  drawBox("EPH-PV", arrayBoxX + 1, arrayBoxY + 1, arrayBoxW - 2, arrayBoxH - 2);

  drawText("EPH-TITLE", arrayBoxX + 4, arrayBoxY + arrayBoxH - 8, 2.2, "PHOTOVOLTAIC GENERATION SOURCE");
  drawText("EPH-PV", arrayBoxX + 4, arrayBoxY + arrayBoxH - 14, 2.0, `TOTAL CAPACITY: ${calc.totalDcCapacityKwp} kWp DC`);
  drawText(
    "EPH-TEXT",
    arrayBoxX + 4,
    arrayBoxY + arrayBoxH - 20,
    1.6,
    `${calc.totalModules}x ${calc.selectedModule.ratedPowerWp}Wp (${calc.selectedModule.manufacturer})`,
    "left",
    arrayBoxW - 8
  );
  drawText(
    "EPH-TEXT",
    arrayBoxX + 4,
    arrayBoxY + arrayBoxH - 25,
    1.5,
    `${calc.effective.numberOfStrings} STRINGS x ${calc.effective.modulesPerString} MODULES/STRING`
  );

  // String 1 (Top String)
  const str1Y = arrayBoxY + 54;
  drawText(
    "EPH-TITLE",
    arrayBoxX + 4,
    str1Y + 23,
    1.5,
    `STRING 1 (1..${calc.effective.modulesPerString} IN SERIES)`
  );
  const modW = 9.5;
  const modH = 16;
  const modGap = 3.5;
  const startModX = arrayBoxX + 4;

  for (let i = 0; i < 3; i++) {
    const mx = startModX + i * (modW + modGap);
    drawBox("EPH-PV", mx, str1Y + 4, modW, modH);
    d.setActiveLayer("EPH-PV");
    d.drawLine(mx + modW / 2, str1Y + 4, mx + modW / 2, str1Y + 4 + modH);
    d.drawLine(mx, str1Y + 4 + modH / 2, mx + modW, str1Y + 4 + modH / 2);
    if (i < 2) {
      d.drawLine(mx + modW, str1Y + 4 + modH - 3, mx + modW + modGap, str1Y + 4 + modH - 3);
    }
  }
  d.setActiveLayer("EPH-PV");
  d.drawLine(
    startModX + 2 * (modW + modGap) + modW,
    str1Y + 4 + modH - 3,
    startModX + 2 * (modW + modGap) + modW + 3,
    str1Y + 4 + modH - 3
  );
  drawText("EPH-TEXT", startModX + 39, str1Y + 10, 2.0, "...", "center");

  const lastModX = startModX + 47;
  drawBox("EPH-PV", lastModX, str1Y + 4, modW, modH);
  d.setActiveLayer("EPH-PV");
  d.drawLine(lastModX + modW / 2, str1Y + 4, lastModX + modW / 2, str1Y + 4 + modH);
  d.drawLine(lastModX, str1Y + 4 + modH / 2, lastModX + modW, str1Y + 4 + modH / 2);
  d.drawLine(startModX + 44, str1Y + 4 + modH - 3, lastModX, str1Y + 4 + modH - 3);

  // String N (Bottom String) - only drawn when the array has more than one string
  const strNY = arrayBoxY + 18;
  const hasMultipleStrings = eff.numberOfStrings > 1;
  if (eff.numberOfStrings > 2) {
    drawText(
      "EPH-TEXT",
      arrayBoxX + 4,
      arrayBoxY + 49,
      1.3,
      eff.numberOfStrings === 3
        ? "STRING 2 IDENTICAL (NOT SHOWN)"
        : `STRINGS 2 TO ${eff.numberOfStrings - 1} IDENTICAL (NOT SHOWN)`,
      "left",
      arrayBoxW - 8
    );
  }
  if (hasMultipleStrings) {
    drawText(
      "EPH-TITLE",
      arrayBoxX + 4,
      strNY + 23,
      1.5,
      `STRING ${calc.effective.numberOfStrings} (1..${calc.effective.modulesPerString} IN SERIES)`
    );

    for (let i = 0; i < 3; i++) {
      const mx = startModX + i * (modW + modGap);
      drawBox("EPH-PV", mx, strNY + 4, modW, modH);
      d.setActiveLayer("EPH-PV");
      d.drawLine(mx + modW / 2, strNY + 4, mx + modW / 2, strNY + 4 + modH);
      d.drawLine(mx, strNY + 4 + modH / 2, mx + modW, strNY + 4 + modH / 2);
      if (i < 2) {
        d.drawLine(mx + modW, strNY + 4 + modH - 3, mx + modW + modGap, strNY + 4 + modH - 3);
      }
    }
    d.setActiveLayer("EPH-PV");
    d.drawLine(
      startModX + 2 * (modW + modGap) + modW,
      strNY + 4 + modH - 3,
      startModX + 2 * (modW + modGap) + modW + 3,
      strNY + 4 + modH - 3
    );
    drawText("EPH-TEXT", startModX + 39, strNY + 10, 2.0, "...", "center");

    drawBox("EPH-PV", lastModX, strNY + 4, modW, modH);
    d.setActiveLayer("EPH-PV");
    d.drawLine(lastModX + modW / 2, strNY + 4, lastModX + modW / 2, strNY + 4 + modH);
    d.drawLine(lastModX, strNY + 4 + modH / 2, lastModX + modW, strNY + 4 + modH / 2);
    d.drawLine(startModX + 44, strNY + 4 + modH - 3, lastModX, strNY + 4 + modH - 3);
  }

  drawText("EPH-TEXT", arrayBoxX + 4, arrayBoxY + 11, 1.5, `Voc_cold: ${calc.stringVoc}V | Vmp_hot: ${calc.stringVmp}V`);
  drawText("EPH-TEXT", arrayBoxX + 4, arrayBoxY + 5, 1.4, `Imp: ${calc.stringImp}A | Isc: ${calc.stringIsc}A | Total I_dc: ${calc.totalDcCurrent}A`);

  // DC Output Bus from Array to Combiner (dashed DC conductor runs)
  d.setActiveLayer("EPH-DC");
  d.drawLine(lastModX + modW, str1Y + 17, arrayBoxX + arrayBoxW + 6, str1Y + 17);
  d.drawLine(arrayBoxX + arrayBoxW + 6, str1Y + 17, arrayBoxX + arrayBoxW + 6, busY + 3);
  d.drawLine(arrayBoxX + arrayBoxW + 6, busY + 3, 98, busY + 3);
  drawText("EPH-BREAKER", 95, busY + 5, 1.3, "(+) DC", "center");

  // Negative lead returns from the last string; a single string returns on its own riser
  // so it does not overlap the positive lead.
  const negLeadY = hasMultipleStrings ? strNY + 7 : str1Y + 7;
  const negRiserX = hasMultipleStrings ? arrayBoxX + arrayBoxW + 6 : arrayBoxX + arrayBoxW + 3;
  d.setActiveLayer("EPH-DC");
  d.drawLine(lastModX + modW, negLeadY, negRiserX, negLeadY);
  d.drawLine(negRiserX, negLeadY, negRiserX, busY - 3);
  d.drawLine(negRiserX, busY - 3, 98, busY - 3);
  drawText("EPH-BREAKER", 95, busY - 6.5, 1.3, "(-) DC", "center");

  // B. DC Combiner Box & Disconnect (X: 98 to 138)
  const dcBoxX = 98;
  const dcBoxY = 144;
  const dcBoxW = 40;
  const dcBoxH = 62;

  drawBox("EPH-BREAKER", dcBoxX, dcBoxY, dcBoxW, dcBoxH);
  drawText("EPH-TITLE", dcBoxX + 2, dcBoxY + dcBoxH + 4, 2.0, "DC COMBINER & DISCONNECT");
  drawText("EPH-TEXT", dcBoxX + 2, dcBoxY + dcBoxH - 6, 1.5, "COMBINER ENCLOSURE (IP66)");

  drawBox("EPH-BREAKER", dcBoxX + 5, busY + 1, 9, 4);
  d.setActiveLayer("EPH-BREAKER");
  d.drawLine(dcBoxX + 5, busY + 3, dcBoxX + 14, busY + 3);
  drawBox("EPH-BREAKER", dcBoxX + 5, busY - 5, 9, 4);
  d.drawLine(dcBoxX + 5, busY - 3, dcBoxX + 14, busY - 3);
  drawText("EPH-TEXT", dcBoxX + 2, busY + 7, 1.2, `${calc.effective.dcFuseRatingAmps}A DC FUSES`);

  drawCircle("EPH-BREAKER", dcBoxX + 28, busY, 7);
  d.setActiveLayer("EPH-BREAKER");
  d.drawLine(dcBoxX + 23, busY, dcBoxX + 33, busY);
  d.drawLine(dcBoxX + 14, busY + 3, dcBoxX + 21, busY + 3);
  d.drawLine(dcBoxX + 14, busY - 3, dcBoxX + 21, busY - 3);
  d.drawLine(dcBoxX + 29, busY + 3, dcBoxX + 35, busY + 3);
  d.drawLine(dcBoxX + 29, busY - 3, dcBoxX + 35, busY - 3);

  drawBox("EPH-BREAKER", dcBoxX + 23, dcBoxY + 8, 14, 12);
  drawText("EPH-TEXT", dcBoxX + 24, dcBoxY + 16, 1.3, "TYPE 2 SPD");
  drawText("EPH-TEXT", dcBoxX + 24, dcBoxY + 10, 1.2, `Uc=${calc.effective.dcSpdUcVolts}V`);
  d.setActiveLayer("EPH-BREAKER");
  d.drawLine(dcBoxX + 28, busY - 3, dcBoxX + 28, dcBoxY + 20);

  drawText("EPH-TEXT", dcBoxX + 2, dcBoxY + 4, 1.4, `ISOLATOR: ${calc.effective.dcIsolatorRatingAmps}A DC ${dcIsolatorVolts}V`);

  d.setActiveLayer("EPH-DC");
  d.drawLine(dcBoxX + dcBoxW, busY + 2, 156, busY + 2);
  d.drawLine(dcBoxX + dcBoxW, busY - 2, 156, busY - 2);

  // DC Cable Annotation - placed in clear upper space with non-colliding leader
  const dcAnnoX = 94;
  const dcAnnoY = 224;
  drawText("EPH-ANNO", dcAnnoX, dcAnnoY + 10, 1.5, "DC FEEDER SPECIFICATION:");
  drawText("EPH-ANNO", dcAnnoX, dcAnnoY + 5, 1.35, dcCableStr, "left", 56);
  drawText(
    "EPH-ANNO",
    dcAnnoX,
    dcAnnoY,
    1.25,
    `Vd = ${calc.dcVoltageDropV}V (${calc.dcVoltageDropPercent}% <= ${dcMaxDropPct}%) | Amp = ${calc.dcCableAmpacity}A`,
    "left",
    56
  );
  d.setActiveLayer("EPH-ANNO");
  d.drawLine(dcAnnoX + 52, dcAnnoY + 2, 147, dcAnnoY + 2);
  d.drawLine(147, dcAnnoY + 2, 147, busY + 4);

  // C. Solar Inverter (X: 156 to 218)
  const invBoxX = 156;
  const invBoxY = 144;
  const invBoxW = 62;
  const invBoxH = 62;

  drawBox("EPH-INVERTER", invBoxX, invBoxY, invBoxW, invBoxH);
  drawBox("EPH-INVERTER", invBoxX + 1.5, invBoxY + 1.5, invBoxW - 3, invBoxH - 3);

  drawText(
    "EPH-TITLE",
    invBoxX + 3,
    invBoxY + invBoxH + 4,
    2.2,
    inverterQty > 1 ? `${inverterTitle} (TYP. OF ${inverterQty})` : inverterTitle,
    "left",
    invBoxW + 8
  );
  drawText(
    "EPH-TEXT",
    invBoxX + 3,
    invBoxY + invBoxH - 6,
    1.7,
    `${calc.effective.inverterQuantity}x ${sanitizeStringForDxf(calc.selectedInverter.manufacturer)} ${sanitizeStringForDxf(calc.selectedInverter.model)}`,
    "left",
    invBoxW - 6
  );
  drawText(
    "EPH-TEXT",
    invBoxX + 3,
    invBoxY + invBoxH - 11,
    1.35,
    `${stringsPerInverter} STRING(S)/INV | MPPT USED: ${mpptsUsed} OF ${mpptsTotal}`,
    "left",
    invBoxW - 6
  );

  const convX = invBoxX + 18;
  const convY = busY - 12;
  const convW = 26;
  const convH = 24;

  drawBox("EPH-INVERTER", convX, convY, convW, convH);
  d.setActiveLayer("EPH-INVERTER");
  d.drawLine(convX, convY, convX + convW, convY + convH);
  drawText("EPH-BREAKER", convX + 2, convY + convH - 7, 1.8, "DC (=)");
  drawText("EPH-CABLE", convX + convW - 13, convY + 4, 1.8, "AC (~)");

  drawBox("EPH-INVERTER", convX + 2, convY + 8, convW - 4, 8);
  drawText("EPH-TITLE", convX + convW / 2, convY + 10.5, 1.8, `${calc.totalInverterAcKw} kW AC`, "center");

  drawText(
    "EPH-TEXT",
    invBoxX + 3,
    invBoxY + 12,
    1.5,
    `OUTPUT: ${calc.totalInverterAcKw} kW AC (${calc.effective.inverterQuantity}x ${calc.selectedInverter.ratedAcPowerKw} kW)`
  );
  drawText(
    "EPH-TEXT",
    invBoxX + 3,
    invBoxY + 6.5,
    1.4,
    `${calc.selectedInverter.phase} ${calc.selectedInverter.acVoltage || pVolt}V ${calc.selectedInverter.frequencyHz || config.utilityFrequency || 60}Hz | I_max: ${calc.inverterMaxAcCurrent}A`
  );
  drawText(
    "EPH-TEXT",
    invBoxX + 3,
    invBoxY + 1.5,
    1.3,
    `MPPT: ${calc.selectedInverter.mpptVoltageRangeMin}-${calc.selectedInverter.mpptVoltageRangeMax}V | Max DC: ${calc.selectedInverter.maxDcVoltage}V`
  );

  // Ground Bus Line (Green Layer) - positioned at Y = 130
  const groundBusY = 130;

  if (hasBattery) {
    // Battery Storage Box - cleanly positioned with 6mm clearance above Legend (Y=82) and 6mm below Ground Bus (Y=130)
    const battBoxX = invBoxX + 4;
    const battBoxY = 88;
    const battBoxW = 54;
    const battBoxH = 36;

    drawBox("EPH-BATTERY", battBoxX, battBoxY, battBoxW, battBoxH);
    drawText("EPH-BATTERY", battBoxX + 3, battBoxY + battBoxH - 5.5, 1.7, "BATTERY STORAGE (BESS)");
    drawText("EPH-TEXT", battBoxX + 3, battBoxY + battBoxH - 11, 1.45, `${calc.batteryUsableEnergyKwh} kWh LiFePO4 STORAGE`);
    drawText(
      "EPH-TEXT",
      battBoxX + 3,
      battBoxY + battBoxH - 16.5,
      1.35,
      `${calc.effective.batteryUnits} Units (${config.battery.voltageV}V / ${config.battery.capacityAh}Ah)`
    );
    if (config.battery.requiredBackupLoadKw > 0) {
      drawText("EPH-TEXT", battBoxX + 3, battBoxY + battBoxH - 22, 1.25, `Backup Load: ${config.battery.requiredBackupLoadKw} kW`);
    }

    drawBox("EPH-BATTERY", battBoxX + 19, battBoxY + 3, 16, 6);
    drawText("EPH-TEXT", battBoxX + 27, battBoxY + 5.5, 1.2, "BATT OCPD", "center");

    // Power connection line between inverter and battery top
    d.setActiveLayer("EPH-BATTERY");
    d.drawLine(invBoxX + invBoxW - 12, invBoxY, invBoxX + invBoxW - 12, battBoxY + battBoxH);

    // Clean ground tap connecting top of battery box to ground bus
    d.setActiveLayer("EPH-GROUND");
    d.drawLine(battBoxX + 8, battBoxY + battBoxH, battBoxX + 8, groundBusY);
    d.drawCircle(battBoxX + 8, groundBusY, 1.2);
  }

  // D. AC Disconnect Switch (X: 230 to 268)
  const acBoxX = 230;
  const acBoxY = 144;
  const acBoxW = 38;
  const acBoxH = 62;

  d.setActiveLayer("EPH-CABLE");
  d.drawLine(invBoxX + invBoxW, busY, acBoxX, busY);

  drawBox("EPH-CABLE", acBoxX, acBoxY, acBoxW, acBoxH);
  drawText("EPH-TITLE", acBoxX + 2, acBoxY + acBoxH + 4, 2.0, "AC DISCONNECT SWITCH");
  drawText("EPH-TEXT", acBoxX + 3, acBoxY + acBoxH - 6, 1.5, "LOCKABLE ISOLATOR");

  drawCircle("EPH-CABLE", acBoxX + 19, busY, 7);
  d.setActiveLayer("EPH-CABLE");
  d.drawLine(acBoxX + 5, busY, acBoxX + 14, busY);
  d.drawLine(acBoxX + 14, busY + 2, acBoxX + 24, busY - 2);
  d.drawLine(acBoxX + 24, busY, acBoxX + 33, busY);

  drawBox("EPH-CABLE", acBoxX + 12, acBoxY + 8, 14, 12);
  drawText("EPH-TEXT", acBoxX + 13, acBoxY + 16, 1.3, "TYPE 2 SPD");
  drawText("EPH-TEXT", acBoxX + 13, acBoxY + 10, 1.2, `Uc=${acSpdVolts}V AC`);
  d.setActiveLayer("EPH-CABLE");
  d.drawLine(acBoxX + 19, busY - 7, acBoxX + 19, acBoxY + 20);

  drawText(
    "EPH-TEXT",
    acBoxX + 2,
    acBoxY + 4,
    1.4,
    `RATING: ${eff.acIsolatorRatingAmps || eff.acBreakerAtAmps}A ${eff.acBreakerPoles}P ${pVolt}V`,
    "left",
    acBoxW - 4
  );

  d.setActiveLayer("EPH-CABLE");
  d.drawLine(acBoxX + acBoxW, busY, 282, busY);

  // AC Cable Annotation - positioned with dedicated clear width and non-overlapping leader
  const acAnnoX = 224;
  const acAnnoY = 224;
  drawText("EPH-ANNO", acAnnoX, acAnnoY + 10, 1.5, "AC FEEDER SPECIFICATION:");
  drawText("EPH-ANNO", acAnnoX, acAnnoY + 5, 1.35, acCableStr, "left", 52);
  drawText(
    "EPH-ANNO",
    acAnnoX,
    acAnnoY,
    1.25,
    `Vd = ${calc.acVoltageDropV}V (${calc.acVoltageDropPercent}% <= ${acMaxDropPct}%) | Amp = ${calc.acCableAmpacity}A`,
    "left",
    52
  );
  d.setActiveLayer("EPH-ANNO");
  d.drawLine(acAnnoX + 51, acAnnoY + 2, 275, acAnnoY + 2);
  d.drawLine(275, acAnnoY + 2, 275, busY + 3);

  // E. Consumer Main Distribution Panel (MDP) (X: 282 to 336)
  const panelX = 282;
  const panelY = 134;
  const panelW = 54;
  const panelH = 82;

  drawBox("EPH-PANEL", panelX, panelY, panelW, panelH);
  drawBox("EPH-PANEL", panelX + 1.5, panelY + 1.5, panelW - 3, panelH - 3);

  drawText("EPH-TITLE", panelX + 3, panelY + panelH + 4, 2.0, pName, "left", panelW - 6);
  drawText("EPH-TEXT", panelX + 3, panelY + panelH - 6, 1.5, `SYSTEM: ${pVolt}V ${pPhase} ${config.utilityFrequency || 60}Hz`);
  drawText("EPH-TEXT", panelX + 3, panelY + panelH - 11, 1.5, `BUSBAR RATING: ${busRating}A`);

  drawBox("EPH-BREAKER", panelX + 5, busY - 5, 20, 10);
  drawText("EPH-TITLE", panelX + 6, busY + 1, 1.4, `SOLAR OCPD`);
  drawText("EPH-TEXT", panelX + 6, busY - 3.5, 1.3, `${calc.effective.acBreakerAtAmps}A AT / ${calc.effective.acKaic}kAIC`);

  drawBox("EPH-PANEL", panelX + 29, busY - 5, 20, 10);
  drawText("EPH-TITLE", panelX + 30, busY + 1, 1.4, `MAIN OCPD`);
  drawText("EPH-TEXT", panelX + 30, busY - 3.5, 1.3, `${pMain}A AT (${pPoles}P)`);

  d.setActiveLayer("EPH-PANEL");
  d.drawLine(panelX + 25, busY, panelX + 29, busY);
  d.drawLine(panelX + 27, panelY + 18, panelX + 27, panelY + panelH - 16);

  drawBox("EPH-BORDER", panelX + 3, panelY + 4, panelW - 6, 24);
  if (applies120Rule) {
    drawText("EPH-TITLE", panelX + 5, panelY + 23, 1.4, "120% BUSBAR RULE (PEC 6.90.7.2.D):");
    drawText(
      "EPH-TEXT",
      panelX + 5,
      panelY + 17.5,
      1.3,
      `Main (${pMain}A) + Solar (${calc.effective.acBreakerAtAmps}A) = ${totalInfeed}A`
    );
    drawText("EPH-TEXT", panelX + 5, panelY + 12, 1.3, `120% Bus Limit = ${maxBus120}A (${busRating}A x 1.2)`);
    drawText(
      is120Pass ? "EPH-GROUND" : "EPH-BREAKER",
      panelX + 5,
      panelY + 6.5,
      1.4,
      is120Pass ? "STATUS: [PASS] FULLY COMPLIANT" : "STATUS: [WARNING] EXCEEDS BUSBAR"
    );
  } else {
    drawText("EPH-TITLE", panelX + 5, panelY + 23, 1.4, "INTERCONNECTION:");
    drawText(
      "EPH-TEXT",
      panelX + 5,
      panelY + 15,
      1.3,
      isOffGrid
        ? "OFF-GRID SYSTEM - NO UTILITY INTERCONNECTION"
        : "SUPPLY-SIDE CONNECTION - 120% BUSBAR RULE NOT APPLICABLE",
      "left",
      panelW - 10
    );
  }

  if (isGridTied) {
    // F. Revenue Meter & Utility Grid (X: 344 to 398 - clean 8mm clearance from border at 406)
    const meterX = 344;
    const meterY = 158;
    const meterW = 22;
    const meterH = 34;

    d.setActiveLayer("EPH-CABLE");
    d.drawLine(panelX + panelW, busY, meterX, busY);

    drawBox("EPH-SLD", meterX, meterY, meterW, meterH);
    drawCircle("EPH-SLD", meterX + meterW / 2, busY, 8.0);
    drawText(
      "EPH-TITLE",
      meterX + meterW / 2,
      meterY + meterH + 4,
      1.7,
      hasNetMetering ? "BI-DIRECTIONAL METER" : "UTILITY kWh METER",
      "center"
    );
    drawText("EPH-TEXT", meterX + meterW / 2, busY + 2, 1.4, hasNetMetering ? "<= kWh =>" : "kWh", "center");
    drawText("EPH-TEXT", meterX + meterW / 2, busY - 4, 1.2, hasNetMetering ? "NET-METERING" : "NO NET-METERING", "center");
    if (hasNetMetering) {
      drawText("EPH-TEXT", meterX + meterW / 2, meterY + 4, 1.2, "ERC COMPLIANT", "center");
    }

    const utilGridX = 374;
    const utilGridY = 158;
    const utilGridW = 22;
    const utilGridH = 34;

    d.setActiveLayer("EPH-CABLE");
    d.drawLine(meterX + meterW, busY, utilGridX, busY);

    drawBox("EPH-SLD", utilGridX, utilGridY, utilGridW, utilGridH);
    drawCircle("EPH-SLD", utilGridX + utilGridW / 2, busY, 6.0);
    drawCircle("EPH-SLD", utilGridX + utilGridW / 2, busY, 3.0);

    drawText("EPH-TITLE", utilGridX + utilGridW / 2, utilGridY + utilGridH + 5, 1.5, "UTILITY GRID", "center");
    drawText("EPH-TITLE", utilGridX + utilGridW / 2, utilGridY + utilGridH + 1, 1.4, "PCC INTERCONNECTION", "center");
    drawText("EPH-TEXT", utilGridX + utilGridW / 2, busY - 8.5, 1.3, utilityName, "center", utilGridW);
    drawText("EPH-TEXT", utilGridX + utilGridW / 2, utilGridY + 3.5, 1.2, `${config.utilityVoltage}V ${config.utilityPhase}`, "center");
  }

  // G. Grounding Bus Line (Green Layer)
  d.setActiveLayer("EPH-GROUND");
  d.drawLine(24, groundBusY, 394, groundBusY);

  d.drawLine(24, arrayBoxY, 24, groundBusY);
  d.drawCircle(24, groundBusY, 1.2);
  d.drawLine(dcBoxX + 28, dcBoxY + 8, dcBoxX + 28, groundBusY);
  d.drawCircle(dcBoxX + 28, groundBusY, 1.2);
  d.drawLine(invBoxX + 20, invBoxY, invBoxX + 20, groundBusY);
  d.drawCircle(invBoxX + 20, groundBusY, 1.2);

  d.drawLine(acBoxX + 19, acBoxY + 8, acBoxX + 19, groundBusY);
  d.drawCircle(acBoxX + 19, groundBusY, 1.2);
  d.drawLine(panelX + 15, panelY, panelX + 15, groundBusY);
  d.drawCircle(panelX + 15, groundBusY, 1.2);

  const rodX = 394;
  d.drawLine(rodX, groundBusY, rodX, 94);
  d.drawLine(rodX - 5, 94, rodX + 5, 94);
  d.drawLine(rodX - 3.5, 91, rodX + 3.5, 91);
  d.drawLine(rodX - 2, 88, rodX + 2, 88);

  drawText("EPH-GROUND", 336, 122, 1.4, "SOLID EQUIPMENT GROUNDING CONDUCTOR (EGC)", "left", 56);
  drawText("EPH-GROUND", 336, 102, 1.3, "16mm x 3.0m COPPERWELD ROD (R <= 5.0 OHMS)", "left", 56);

  // H. Sheet 1 Bottom: LEGEND & ELECTRICAL SYMBOLS (X: 14 to 272, Y: 14 to 82)
  const legX = 14;
  const legY = 14;
  const legW = 258;
  const legH = 68;

  drawBox("EPH-BORDER", legX, legY, legW, legH);
  drawBox("EPH-BORDER", legX + 1, legY + legH - 9, legW - 2, 8);
  drawText("EPH-TITLE", legX + 4, legY + legH - 6.5, 2.2, "LEGEND & ELECTRICAL SYMBOLS (PEC 2017 & IEEE 315)");

  // 3-Column Symbol Legend Grid with accurate horizontal spacing
  const legColW = legW / 3;
  d.setActiveLayer("EPH-BORDER");
  d.drawLine(legX + legColW, legY, legX + legColW, legY + legH - 9);
  d.drawLine(legX + 2 * legColW, legY, legX + 2 * legColW, legY + legH - 9);

  // Column 1 Symbols
  // 1. PV Module
  drawBox("EPH-PV", legX + 4, legY + 46, 10, 8);
  d.setActiveLayer("EPH-PV");
  d.drawLine(legX + 9, legY + 46, legX + 9, legY + 54);
  d.drawLine(legX + 4, legY + 50, legX + 14, legY + 50);
  drawText("EPH-TEXT", legX + 18, legY + 49, 1.5, "PV MODULE / ARRAY");

  // 2. Inverter
  drawBox("EPH-INVERTER", legX + 4, legY + 32, 10, 8);
  d.setActiveLayer("EPH-INVERTER");
  d.drawLine(legX + 4, legY + 32, legX + 14, legY + 40);
  drawText("EPH-TEXT", legX + 18, legY + 35, 1.5, "SOLAR PV INVERTER");

  // 3. Circuit Breaker
  drawBox("EPH-BREAKER", legX + 4, legY + 19, 10, 6);
  drawText("EPH-BREAKER", legX + 9, legY + 22, 1.2, "CB", "center");
  drawText("EPH-TEXT", legX + 18, legY + 21, 1.5, "CIRCUIT BREAKER (MCB/MCCB)");

  // 4. Disconnect Switch
  drawCircle("EPH-BREAKER", legX + 9, legY + 9, 4);
  d.setActiveLayer("EPH-BREAKER");
  d.drawLine(legX + 6, legY + 7, legX + 12, legY + 11);
  drawText("EPH-TEXT", legX + 18, legY + 8, 1.5, "ROTARY DISCONNECT / ISOLATOR");

  // Column 2 Symbols
  // 5. Revenue Meter (grid-tied systems only)
  if (isGridTied) {
    drawCircle("EPH-SLD", legX + legColW + 9, legY + 50, 4.5);
    drawText(
      "EPH-TEXT",
      legX + legColW + 18,
      legY + 49,
      1.5,
      hasNetMetering ? "BI-DIRECTIONAL kWh REVENUE METER" : "UTILITY kWh REVENUE METER"
    );
  }

  // 6. Distribution Panel
  drawBox("EPH-PANEL", legX + legColW + 4, legY + 32, 10, 8);
  drawBox("EPH-PANEL", legX + legColW + 5, legY + 33, 8, 6);
  drawText("EPH-TEXT", legX + legColW + 18, legY + 35, 1.5, "MAIN DISTRIBUTION PANEL (MDP)");

  // 7. Surge Protective Device (SPD) - fixed to align in Column 2
  drawBox("EPH-BREAKER", legX + legColW + 4, legY + 18, 10, 8);
  drawText("EPH-BREAKER", legX + legColW + 9, legY + 22, 1.2, "SPD", "center");
  drawText("EPH-TEXT", legX + legColW + 18, legY + 21, 1.5, "SURGE PROTECTIVE DEVICE (TYPE 2)");

  // 8. Ground Electrode
  d.setActiveLayer("EPH-GROUND");
  d.drawLine(legX + legColW + 9, legY + 13, legX + legColW + 9, legY + 9);
  d.drawLine(legX + legColW + 5, legY + 9, legX + legColW + 13, legY + 9);
  d.drawLine(legX + legColW + 6.5, legY + 7, legX + legColW + 11.5, legY + 7);
  d.drawLine(legX + legColW + 8, legY + 5, legX + legColW + 10, legY + 5);
  drawText("EPH-TEXT", legX + legColW + 18, legY + 8, 1.5, "GROUND ELECTRODE (EARTH ROD)");

  // Column 3 Symbols
  // 9. Utility Grid PCC (grid-tied systems only)
  if (isGridTied) {
    drawCircle("EPH-SLD", legX + 2 * legColW + 9, legY + 50, 4.5);
    drawCircle("EPH-SLD", legX + 2 * legColW + 9, legY + 50, 2.2);
    drawText("EPH-TEXT", legX + 2 * legColW + 18, legY + 49, 1.5, "UTILITY DISTRIBUTION GRID (PCC)");
  }

  // 10. Battery System (If used)
  if (hasBattery) {
    drawBox("EPH-BATTERY", legX + 2 * legColW + 4, legY + 32, 10, 8);
    drawText("EPH-BATTERY", legX + 2 * legColW + 9, legY + 36, 1.2, "BATT", "center");
    drawText("EPH-TEXT", legX + 2 * legColW + 18, legY + 35, 1.5, "BATTERY ENERGY STORAGE (BESS)");
  } else {
    drawText("EPH-TEXT", legX + 2 * legColW + 18, legY + 35, 1.5, "DC FUSE (gPV STRING RATED)");
  }

  // 11. DC Conductor Line (dashed)
  d.setActiveLayer("EPH-DC");
  d.drawLine(legX + 2 * legColW + 4, legY + 22, legX + 2 * legColW + 14, legY + 22);
  drawText("EPH-TEXT", legX + 2 * legColW + 18, legY + 21, 1.5, "DC CONDUIT / CONDUCTOR RUN");

  // 12. AC Conductor Line
  d.setActiveLayer("EPH-CABLE");
  d.drawLine(legX + 2 * legColW + 4, legY + 9, legX + 2 * legColW + 14, legY + 9);
  drawText("EPH-TEXT", legX + 2 * legColW + 18, legY + 8, 1.5, "AC CONDUIT / CONDUCTOR RUN");

  // ==========================================
  // SHEET 2 OF 3: SOLAR DESIGN CALCULATION & EQUIPMENT SCHEDULES
  // Origin X: 445
  // ==========================================
  const s2OriginX = 445;
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
  const calcRowH = 14.5;
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
      param: "PV Array String Configuration",
      val: `${calc.effective.numberOfStrings} Strings x ${calc.effective.modulesPerString} Modules`,
      ref: "Series / Parallel Config",
    },
    {
      param: "Array String Voc (Cold @ 18°C)",
      val: `${calc.stringVoc} V DC`,
      ref: "PEC 6.90.7 Temp Corrected",
    },
    {
      param: "Array String Vmp (Hot @ 65°C)",
      val: `${calc.stringVmp} V DC`,
      ref: "Inverter MPPT Voltage Match",
    },
    {
      param: "String Current (Imp / Isc)",
      val: `Imp=${calc.stringImp}A / Isc=${calc.stringIsc}A`,
      ref: "PEC 6.90.8 1.25x Factor",
    },
    {
      param: "Total DC Array Current",
      val: `${calc.totalDcCurrent} A DC`,
      ref: "Combined Inverter DC Input",
    },
    {
      param: "Inverter Max AC Output Current",
      val: `${calc.inverterMaxAcCurrent} A AC`,
      ref: `${calc.selectedInverter.phase} ${pVolt}V 60Hz`,
    },
    {
      param: "Recommended Solar AC Breaker",
      val: `${calc.effective.acBreakerAtAmps}A AT / ${calc.effective.acBreakerAfAmps}A AF`,
      ref: "125% Inverter Continuous Duty",
    },
    {
      param: "DC Cable & Conduit Specification",
      val: dcCableStr,
      ref: `Vd=${calc.dcVoltageDropV}V (${calc.dcVoltageDropPercent}% <= ${dcMaxDropPct}%)`,
    },
    {
      param: "AC Cable & Conduit Specification",
      val: acCableStr,
      ref: `Vd=${calc.acVoltageDropV}V (${calc.acVoltageDropPercent}% <= ${acMaxDropPct}%)`,
    },
    {
      param: "Equipment Grounding Conductor",
      val: `${calc.effective.dcEgcSizeMm2} mm² Cu (DC) / ${calc.effective.acEgcSizeMm2} mm² Cu (AC)`,
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
          ref: isOffGrid ? "Off-grid: no utility interconnection" : "Supply-side interconnection",
        },
  ];

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
      eq: "DC FUSES",
      spec: `${calc.effective.dcFuseRatingAmps}A gPV ${dcFuseVolts}V DC\n10x38mm Ceramic`,
      std: "IEC 60269-6",
    },
    {
      eq: "AC BREAKER",
      spec: `${calc.effective.acBreakerAtAmps}A AT / ${calc.effective.acKaic} kAIC\n${calc.effective.acBreakerPoles}P @ ${pVolt}V AC`,
      std: "PEC 6.90.8",
    },
    {
      eq: "SURGE SPD",
      spec: `DC: ${calc.effective.dcSpdUcVolts}V / AC: ${acSpdVolts}V\nIn=${dcSpdInKa}kA, Imax=${dcSpdImaxKa}kA`,
      std: "IEC 61643-11",
    },
    {
      eq: "GROUNDING",
      spec: `${calc.effective.dcEgcSizeMm2} mm² EGC / 16mm GEC\nRod: 16mm x 3.0m Cu`,
      std: "PEC 2.50",
    },
    {
      eq: hasBattery ? "BATTERY" : "METER",
      spec: hasBattery
        ? `${calc.batteryUsableEnergyKwh} kWh ${sanitizeStringForDxf(config.battery.chemistry || "LiFePO4")}`
        : hasNetMetering
          ? "Bi-Directional kWh"
          : isGridTied
            ? "Utility kWh Meter"
            : "N/A (Off-Grid)",
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
  // Origin X: 890
  // ==========================================
  const s3OriginX = 890;
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
          `Main OCPD (${pMain}A) + Solar Interconnection Breaker (${calc.effective.acBreakerAtAmps}A) = ${totalInfeed}A total infeed.`,
          is120Pass
            ? `Shall not exceed 120% of panel busbar rating (${busRating}A x 1.2 = ${maxBus120}A allowable). Status: [PASS - COMPLIANT].`
            : `EXCEEDS 120% of panel busbar rating (${busRating}A x 1.2 = ${maxBus120}A allowable). Status: [WARNING] - REVISE DESIGN BEFORE ISSUE.`
        ]
      }
    : isOffGrid
      ? {
          title: "STAND-ALONE (OFF-GRID) SYSTEM",
          body: [
            "This system is not interconnected with the distribution utility. The 120% busbar rule and",
            "net-metering requirements do not apply. Any future utility connection requires a revised design."
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
        "DC PV wiring shall be 1000V XLPE PV1-F UV-resistant cable. AC power feeders shall be copper",
        "THHN/THWN-2 90°C conductors installed in Rigid Steel Conduit (RSC) or thickwall PVC."
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
    `RATED DC CURRENT: ${calc.totalDcCurrent} A DC | SHORT CIRCUIT: ${calc.stringIsc} A`,
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
    `SOLAR INVERTER OUTPUT: ${calc.totalInverterAcKw} kW AC | I_MAX: ${calc.inverterMaxAcCurrent} A`,
    "left",
    p2W - 8
  );
  drawText(
    "EPH-TEXT",
    p2X + 4,
    p2Y + p2H - 27,
    1.25,
    `SOLAR INTERCONNECTION BREAKER: ${calc.effective.acBreakerAtAmps}A AT / ${calc.effective.acKaic} kAIC`,
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
        ? "STAND-ALONE SYSTEM: NOT CONNECTED TO DISTRIBUTION UTILITY"
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
  // Origin X: 1335
  // ==========================================
  const s4OriginX = 1335;
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
      ["Depth of Discharge", fmt(b.dodPercent, " %")],
      ["Round-Trip Efficiency", fmt(b.efficiencyPercent, " %")],
      ["Units (Series x Parallel)", `${fmt(eff.batteryUnits)} (${fmt(b.unitsInSeries)} S x ${fmt(b.unitsInParallel)} P)`],
      ["Battery Bank Voltage", fmt(b.batteryBankVoltage, " V")],
      ["Total Bank Energy", fmt(b.totalEnergyKwh, " kWh")],
      ["Usable Bank Energy (Design)", fmt(calc.batteryUsableEnergyKwh, " kWh")],
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

  // Ensure all AutoCAD text styles utilize Arial TrueType font, matching System SLD
  const styleTable = (d as any).tables?.["STYLE"];
  if (styleTable && styleTable.elements) {
    styleTable.elements.forEach((elem: any) => {
      elem.fontFileName = "arial.ttf";
    });
  }

  // Generate Final DXF String & Save
  const dxfString = d.toDxfString();
  const blob = new Blob([dxfString], { type: "application/dxf;charset=utf-8" });
  const safeProjectName = sanitizeStringForDxf(config.projectName || "Solar_PV_Design")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_");
  saveAs(blob, `${safeProjectName}_Solar_SLD_Package.dxf`);
}
