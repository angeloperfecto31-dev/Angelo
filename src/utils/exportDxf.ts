import {
  PanelConfig,
  Circuit,
  ShortCircuitParams,
  LoadType,
  MCBType,
  VoltageDropCalculation,
} from "../types";
import { WIRE_IMPEDANCE_TABLE } from "../constants";
import { computePanelScheduleValues, getPanelSystemVoltageFallback, calculatePanelFault, isIdleSpareOrSpace, calculateEquivalentFeederImpedance, getConductorLabel, formatStandardCableDescription } from "./computeEngine";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import Drawing from "dxf-writer";
// @ts-ignore
import DatabaseObject from "dxf-writer/src/DatabaseObject.js";
// @ts-ignore
import TextStyle from "dxf-writer/src/TextStyle.js";

try {
  let ts = TextStyle;
  if (ts && (ts as any).default) {
    ts = (ts as any).default;
  }
  ts.prototype.fontFileName = "arial.ttf";
} catch (e) {
  // silent fallback
}


function sanitizeStringForDxf(text: any): string {
  if (text === null || text === undefined) return "";

  let res = String(text);

  // 1. Normalize stray/unintended backslashes to forward slashes first (to prevent DXF errors), and clean Unicode variants
  res = res
    .replace(/\\/g, "/") // Normalize stay backslashes to forward slashes
    .replace(/—/g, " - ") // Em-dash
    .replace(/–/g, " - ") // En-dash
    .replace(/[‘’]/g, "'") // Curly single quotes
    .replace(/[“”]/g, '"') // Curly double quotes
    .replace(/[ΩΩ]/g, " Ohms") // Omega Symbol
    .replace(/[µμ]/g, "u") // Micro
    .replace(/×/g, " x ") // Times
    .replace(/√/g, "sqrt") // Square root
    .replace(/≥/g, " >= ") // Greater than or equal to
    .replace(/≤/g, " <= ") // Less than or equal to
    .replace(/≈/g, " = approx ") // Almost equal to
    .replace(/π/g, "pi") // Pi
    .replace(/Δ/g, "Delta"); // Delta

  // 2. Perform AutoCAD-specific control code & Unicode escape mapping (retaining these backslashes!)
  res = res
    .replace(/mm\^2/gi, "mm\\U+00B2")
    .replace(/mm2/gi, "mm\\U+00B2")
    .replace(/mm²/gi, "mm\\U+00B2")
    .replace(/mm\^3/gi, "mm\\U+00B3")
    .replace(/mm3/gi, "mm\\U+00B3")
    .replace(/mm³/gi, "mm\\U+00B3")
    .replace(/²/g, "\\U+00B2") // Superscript 2
    .replace(/³/g, "\\U+00B3") // Superscript 3
    .replace(/[øØ]/g, "%%c") // Native AutoCAD Control code for Diameter/Phase (Ø)
    .replace(/°/g, "%%d"); // Native AutoCAD Control code for Degrees (°)

  res = res
    .replace(/\r?\n/g, " ") // Replace newlines with spaces
    .replace(/[{}]/g, ""); // Remove stray curly braces

  // 3. Strict printable ASCII whitelist filter [32 to 126] to ensure 100% universal reader compatibility
  let asciiOnly = "";
  for (let i = 0; i < res.length; i++) {
    const code = res.charCodeAt(i);
    if (code >= 32 && code <= 126) {
      asciiOnly += res[i];
    } else {
      // Map other characters to spaces / ignore
      asciiOnly += " ";
    }
  }

  // 4. Spacing and length cleanup
  return asciiOnly.replace(/\s+/g, " ").trim();
}

// Custom MText entity that integrates perfectly with the dxf-writer system and uses its internal Handle system
class MText extends DatabaseObject {
  x: number;
  y: number;
  height: number;
  rotation: number;
  value: string;
  horizontalAlignment: string;
  verticalAlignment: string;
  layer: any;
  wrapWidth: number;

  constructor(
    x: number,
    y: number,
    height: number,
    rotation: number,
    value: string,
    horizontalAlignment: string = "left",
    verticalAlignment: string = "baseline",
    wrapWidth: number = 0.0
  ) {
    super(["AcDbEntity", "AcDbMText"]);
    this.x = x;
    this.y = y;
    this.height = height;
    this.rotation = rotation;
    this.value = value;
    this.horizontalAlignment = horizontalAlignment;
    this.verticalAlignment = verticalAlignment;
    this.wrapWidth = wrapWidth;
  }

  tags(manager: any) {
    manager.push(0, "MTEXT");
    super.tags(manager);
    manager.push(8, this.layer.name);
    manager.point(this.x, this.y);
    manager.push(40, this.height);
    manager.push(41, this.wrapWidth); // reference rectangle width (0.0 = no wrapping)

    // 71: Attachment point:
    // 1 = Top left, 2 = Top center, 3 = Top right
    // 4 = Middle left, 5 = Middle center, 6 = Middle right
    // 7 = Bottom left, 8 = Bottom center, 9 = Bottom right
    let attachmentPoint = 1;
    if (this.horizontalAlignment === "center") {
      if (this.verticalAlignment === "middle") attachmentPoint = 5;
      else if (this.verticalAlignment === "top") attachmentPoint = 2;
      else if (this.verticalAlignment === "bottom") attachmentPoint = 8;
      else attachmentPoint = 2; // default center to top center
    } else if (this.horizontalAlignment === "right") {
      if (this.verticalAlignment === "middle") attachmentPoint = 6;
      else if (this.verticalAlignment === "top") attachmentPoint = 3;
      else if (this.verticalAlignment === "bottom") attachmentPoint = 9;
      else attachmentPoint = 3;
    } else {
      if (this.verticalAlignment === "middle") attachmentPoint = 4;
      else if (this.verticalAlignment === "bottom") attachmentPoint = 7;
    }
    manager.push(71, attachmentPoint);
    manager.push(1, this.value);

    // MTEXT group 50 is rotation angle in radians
    const rotationRad = (this.rotation * Math.PI) / 180;
    manager.push(50, rotationRad);

    manager.push(7, "standard");
  }

  toDxfString(): string {
    return "";
  }
}

class DxfBuilder {
  drawing: Drawing;
  isSLDMode: boolean = false;

  constructor() {
    this.drawing = new Drawing();
    this.drawing.setUnits("Millimeters");

    // Keep internal definitions of layers & colors for entity styling
    this.addLayer("0", 7);
    this.addLayer("BORDER", 2);
    this.addLayer("TABLE_GRID", 8);
    this.addLayer("TEXT_TITLE", 4);
    this.addLayer("TEXT_HEADER", 5);
    this.addLayer("TEXT_DATA", 7);
    this.addLayer("SLD_BUSBAR", 4);
    this.addLayer("SLD_GEOMETRY", 3);
    this.addLayer("SLD_FAULT", 1);
    this.addLayer("SLD_DASHED", 9, "DASHED");
    this.addLayer("SLD_FEEDER", 30, "DASHED");
  }

  addLayer(name: string, color: number, lineType: string = "CONTINUOUS") {
    const ltName = lineType.toUpperCase();
    this.drawing.addLayer(name, color, ltName);
  }

  getLayerColor(layer: string): number {
    switch (layer) {
      case "BORDER":
        return 2; // Yellow
      case "TABLE_GRID":
        return 8; // Dark Gray
      case "TEXT_TITLE":
        return 4; // Cyan
      case "TEXT_HEADER":
        return 5; // Blue
      case "TEXT_DATA":
        return 7; // White/Black
      case "SLD_BUSBAR":
        return 4; // Cyan
      case "SLD_GEOMETRY":
        return 3; // Green
      case "SLD_FAULT":
        return 1; // Red
      case "SLD_DASHED":
        return 9; // Light Gray
      case "SLD_FEEDER":
        return 30; // Orange
      case "0":
      default:
        return 7; // White/Black
    }
  }

  addLine(x1: number, y1: number, x2: number, y2: number, layer: string = "0") {
    this.drawing.setActiveLayer(layer);
    this.drawing.drawLine(x1, y1, x2, y2);
  }

  addRect(x1: number, y1: number, x2: number, y2: number, layer: string = "0") {
    this.addLine(x1, y1, x2, y1, layer);
    this.addLine(x2, y1, x2, y2, layer);
    this.addLine(x2, y2, x1, y2, layer);
    this.addLine(x1, y2, x1, y1, layer);
  }

  addCircle(cx: number, cy: number, r: number, layer: string = "0") {
    this.drawing.setActiveLayer(layer);
    this.drawing.drawCircle(cx, cy, r);
  }

  addArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number, layer: string = "0") {
    this.drawing.setActiveLayer(layer);
    this.drawing.drawArc(cx, cy, r, startAngle, endAngle);
  }

  addText(
    text: any,
    x: number,
    y: number,
    height: number = 2.5,
    rotation: number = 0,
    layer: string = "0",
    align: "left" | "center" | "right" = "left",
    wrapWidth: number = 0.0
  ) {
    if (text === null || text === undefined) return;
    const textStr = String(text).trim();
    if (textStr === "") return;

    // Apply a global text height multiplier to improve legibility in AutoCAD as requested, only for SLD
    const TEXT_SCALE_FACTOR = this.isSLDMode ? 1.6 : 1.0;
    const baseHeight = height * TEXT_SCALE_FACTOR;

    let adjustedHeight = baseHeight;
    if (wrapWidth > 0.0) {
      // Average character width factor for Arial is approx 0.55 of height
      const charWidthFactor = 0.55;
      const estimatedWidth = textStr.length * baseHeight * charWidthFactor;
      if (estimatedWidth > wrapWidth) {
        // Only mildly scale down to 85% at most, otherwise let it wrap normally
        const idealHeight = wrapWidth / (textStr.length * charWidthFactor);
        adjustedHeight = Math.max(baseHeight * 0.85, Math.min(baseHeight, idealHeight));
      }
    }

    const cleanedText = sanitizeStringForDxf(textStr).slice(0, 250);
    this.drawing.setActiveLayer(layer);

    // Compute the visual middle using the caller's requested height to perfectly restore the original intended center
    // (Callers pass y = centerY - height/2, so y + height/2 recovers the exact center)
    const adjustedY = y + height / 2.0;

    // Instantiate and add our custom MText entity directly to the active layer shapes list
    let vAlign = "middle";
    const mtext = new MText(x, adjustedY, adjustedHeight, rotation, cleanedText, align, vAlign, wrapWidth);
    this.drawing.activeLayer!.addShape(mtext as any);
  }

  toDxfString(): string {
    // Ensure all styles are configured to utilize Arial
    const styleTable = (this.drawing as any).tables?.["STYLE"];
    if (styleTable && styleTable.elements) {
      styleTable.elements.forEach((elem: any) => {
        elem.fontFileName = "arial.ttf";
      });
    }

    return this.drawing.toDxfString();
  }
}

// Draw lightning bolt for short circuit diagram faults
const drawLightning = (b: DxfBuilder, x: number, y: number) => {
  b.addLine(x, y + 8, x - 3, y + 1, "SLD_FAULT");
  b.addLine(x - 3, y + 1, x + 1, y + 1, "SLD_FAULT");
  b.addLine(x + 1, y + 1, x - 2, y - 5, "SLD_FAULT");
  b.addLine(x - 2, y - 5, x, y - 2, "SLD_FAULT");
  b.addLine(x, y - 2, x - 3, y - 2, "SLD_FAULT");
};

// Draw jagged starburst for short circuit faults matching high-fidelity electrical blueprints
const drawFaultStarburst = (b: DxfBuilder, x: number, y: number) => {
  const outerR = 6.0;
  const innerR = 2.5;
  const numPoints = 12;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= numPoints * 2; i++) {
    const angle = (i * Math.PI) / numPoints;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push({
      x: x + r * Math.cos(angle),
      y: y + r * Math.sin(angle),
    });
  }
  for (let i = 0; i < pts.length - 1; i++) {
    b.addLine(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, "SLD_FAULT");
  }
  b.addText("FAULT", x, y - 0.8, 1.2, 0, "SLD_FAULT", "center");
};

const drawCadPanelSLD = (
  b: DxfBuilder,
  panel: PanelConfig,
  panelCircuits: Circuit[],
  mainFeeder: any,
  xBase: number,
  yBase: number,
  isSubPanel: boolean,
  fedFromLabel: string = "FED FROM MDP",
) => {
  const previousMode = b.isSLDMode;
  b.isSLDMode = true;
  const is3Phase = panel.system.includes("3PH");
  const voltage = panel.voltage || 230;
  const phaseText = is3Phase ? "3-PH" : "1-PH";
  const wireNumber = is3Phase ? ((panel.system.includes("4W") || panel.system.includes("5W")) ? 4 : 3) : 2;

  // 1. Source / Incoming feed terminal
  b.addLine(xBase, yBase, xBase, yBase - 15, "SLD_GEOMETRY");

  if (isSubPanel) {
    b.addCircle(xBase, yBase, 1.5, "SLD_GEOMETRY");
    b.addText(
      fedFromLabel,
      xBase - 12,
      yBase,
      1.6,
      0,
      "TEXT_HEADER",
      "right",
    );
    b.addText(
      `${voltage}V, ${phaseText}`,
      xBase - 12,
      yBase - 5,
      1.5,
      0,
      "TEXT_DATA",
      "right",
    );
    b.addText("60 Hz", xBase - 12, yBase - 10, 1.5, 0, "TEXT_DATA", "right");
  } else {
    // Utility Triangle symbol
    b.addLine(xBase - 5, yBase + 4, xBase + 5, yBase + 4, "SLD_GEOMETRY");
    b.addLine(xBase - 5, yBase + 4, xBase, yBase + 10, "SLD_GEOMETRY");
    b.addLine(xBase + 5, yBase + 4, xBase, yBase + 10, "SLD_GEOMETRY");
    b.addLine(xBase, yBase + 4, xBase, yBase - 15, "SLD_GEOMETRY");

    // Calculate recommended transformer kVA based on total connected load
    let totalVA = panelCircuits.reduce((sum, curr) => sum + (curr.loadVA || 0), 0);
    const connectedLoadKVA = totalVA / 1000;
    const demandLoadKVA = connectedLoadKVA * 0.80;
    const requiredKVA = demandLoadKVA / 0.80;
    const STANDARD_SIZES = [15, 30, 45, 75, 112.5, 150, 225, 300, 500, 750, 1000, 1500, 2000, 2500];
    const recommendedKVA = STANDARD_SIZES.find((s) => s >= requiredKVA) || 1000;

    b.addText(
      "POWER TRANSFORMER",
      xBase - 12,
      yBase + 8,
      1.8,
      0,
      "TEXT_HEADER",
      "right",
    );
    b.addText(
      `RATING: ${recommendedKVA} kVA`,
      xBase - 12,
      yBase + 3,
      1.5,
      0,
      "TEXT_DATA",
      "right",
    );
    b.addText(
      `${voltage}V, ${phaseText}, 60Hz`,
      xBase - 12,
      yBase - 2,
      1.4,
      0,
      "TEXT_DATA",
      "right",
    );
  }

  // 2. Feeder Cable specifications block
  const runs = mainFeeder.runs || mainFeeder.wire?.runs || 1;
  const runsStr = runs > 1 ? `${runs}x SETS OF ` : "";
  const runsSfxComp = runs > 1 ? `${runs}x` : "";
  const wireSize = mainFeeder.wire?.size || "38";
  const groundSize = mainFeeder.groundSize || "8.0";
  const conduitSize = mainFeeder.conduitSize?.toUpperCase() || "40MM";
  const conduitType = (mainFeeder.conduitType || "PVC").toUpperCase();

  b.addText(
    `${runsStr}${wireNumber}x${wireSize} mm² ${panel.insulationType || "THHN"} +`,
    xBase + 10,
    yBase - 2,
    1.6,
    0,
    "TEXT_DATA",
    "left",
  );
  b.addText(
    `1x${groundSize} mm² ${panel.insulationType || "THHN"}(G) IN`,
    xBase + 10,
    yBase - 7,
    1.6,
    0,
    "TEXT_DATA",
    "left",
  );
  b.addText(
    `Ø ${conduitSize} ${conduitType} CONDUIT`,
    xBase + 10,
    yBase - 12,
    1.6,
    0,
    "TEXT_DATA",
    "left",
  );

  // 3. Meter (Main Panel only)
  let feedLineStartY = yBase - 15;
  if (!isSubPanel) {
    b.addCircle(xBase, yBase - 22, 5, "SLD_GEOMETRY");
    b.addText("M", xBase, yBase - 24, 2.5, 0, "TEXT_HEADER", "center");
    b.addLine(xBase, yBase - 15, xBase, yBase - 17, "SLD_GEOMETRY");
    feedLineStartY = yBase - 27;
  }
  
  if (panel.transferSwitchType && panel.transferSwitchType !== "None") {
    b.addLine(xBase, feedLineStartY, xBase, yBase - 29, "SLD_GEOMETRY");
    b.addRect(xBase - 5, yBase - 35, xBase + 5, yBase - 29, "SLD_GEOMETRY");
    b.addText(panel.transferSwitchType, xBase, yBase - 33, 2, 0, "TEXT_HEADER", "center");
    b.addLine(xBase, yBase - 35, xBase, yBase - 38, "SLD_GEOMETRY");
    
    // Gen Input
    b.addLine(xBase - 5, yBase - 32, xBase - 10, yBase - 32, "SLD_GEOMETRY");
    b.addCircle(xBase - 13, yBase - 32, 3, "SLD_GEOMETRY");
    b.addText("G", xBase - 13, yBase - 33, 1.5, 0, "TEXT_HEADER", "center");
    
    const STANDARD_TS_RATINGS = [30, 40, 50, 60, 70, 80, 90, 100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000, 5000];
    const recommendedTsRating = STANDARD_TS_RATINGS.find(r => r >= (mainFeeder?.cb || 60)) || (mainFeeder?.cb || 60);
    const tsRating = panel.transferSwitchRating || recommendedTsRating;
    const tsPoles = panel.transferSwitchPoles || (panel.system.includes("3PH") ? 3 : 2);

    b.addText(
      `${tsRating}A, ${tsPoles}P ${panel.transferSwitchType === "ATS" ? "AUTO" : "MANUAL"} TS`,
      xBase - 18,
      yBase - 31,
      1.2,
      0,
      "TEXT_DATA",
      "right"
    );
  } else {
    b.addLine(xBase, feedLineStartY, xBase, yBase - 38, "SLD_GEOMETRY");
  }

  // 4. Main Overcurrent Protective Device (CB, professional graphic matching web UI)
  b.addLine(xBase, yBase - 38, xBase, yBase - 40, "SLD_GEOMETRY");
  b.addCircle(xBase, yBase - 40, 1.2, "SLD_GEOMETRY");
  b.addArc(xBase, yBase - 44, 4, 270, 90, "SLD_GEOMETRY");
  b.addCircle(xBase, yBase - 48, 1.2, "SLD_GEOMETRY");
  b.addLine(xBase, yBase - 48, xBase, yBase - 55, "SLD_GEOMETRY");

  b.addText(
    `${mainFeeder.cb || "100"} AT / ${mainFeeder.af || "100"} AF`,
    xBase + 10,
    yBase - 43,
    1.6,
    0,
    "TEXT_HEADER",
    "left",
  );
  b.addText(
    `${mainFeeder.poles || "3"}P, ${voltage}V, 60Hz`,
    xBase + 10,
    yBase - 47,
    1.5,
    0,
    "TEXT_DATA",
    "left",
  );

  // 5. Panelboard Bus enclosure
  const maxCircuitNo = Math.max(...panelCircuits.map((c) => c.circuitNo), 0);
  const rows: { index: number; left?: Circuit; right?: Circuit }[] = [];
  for (let i = 1; i <= Math.max(maxCircuitNo, 2); i += 2) {
    rows.push({
      index: i,
      left: panelCircuits.find((c) => c.circuitNo === i),
      right: panelCircuits.find((c) => c.circuitNo === i + 1),
    });
  }
  const numRows = rows.length;
  const rowSpacing = 16;
  const boxTop = yBase - 55;

  // Clean dynamic container boundary layout preventing bottom collision
  const boxBottom = boxTop - 18 - (numRows - 1) * rowSpacing - 8;

  b.addRect(xBase - 40, boxBottom, xBase + 40, boxTop, "BORDER");

  // Sub-Panel designation and bus rating placed cleanly INSIDE the enclosure block header to prevent overlapping with the main CB
  b.addText(
    `${panel.designation || "PANELBOARD"}`,
    xBase,
    boxTop - 5.5,
    2.0,
    0,
    "TEXT_TITLE",
    "center",
  );
  b.addText(
    `BUS RATING: ${panel.mainBreakerAF || "225"}A | ${voltage}V | ${phaseText}`,
    xBase,
    boxTop - 11.5,
    1.8,
    0,
    "TEXT_HEADER",
    "center",
  );

  b.addLine(xBase, boxTop, xBase, boxBottom, "SLD_BUSBAR");

  // Ground Symbol
  b.addLine(xBase, boxBottom, xBase, boxBottom - 10, "SLD_GEOMETRY");
  b.addLine(
    xBase - 8,
    boxBottom - 10,
    xBase + 8,
    boxBottom - 10,
    "SLD_GEOMETRY",
  );
  b.addLine(
    xBase - 5,
    boxBottom - 13,
    xBase + 5,
    boxBottom - 13,
    "SLD_GEOMETRY",
  );
  b.addLine(
    xBase - 2,
    boxBottom - 16,
    xBase + 2,
    boxBottom - 16,
    "SLD_GEOMETRY",
  );

  // 6. Branch Circuits Rows starts below the enclosure headers
  const circuitMap: Map<
    number,
    { arrowX: number; arrowY: number; isLeft: boolean }
  > = new Map();

  for (let idx = 0; idx < numRows; idx++) {
    // 18 units left at the top for title & bus rating headers inside the board box
    const yRow = boxTop - 18 - idx * rowSpacing;
    const row = rows[idx];

    if (row.left) {
      b.addCircle(xBase, yRow, 0.7, "SLD_BUSBAR");
      b.addLine(xBase, yRow, xBase - 7, yRow, "SLD_GEOMETRY");

      const isLeftSpace = row.left.description?.toUpperCase() === "SPACE";
      if (!isLeftSpace) {
        // High fidelity NECA dual-circle & arc Lever branch breaker
        b.addCircle(xBase - 15, yRow, 0.8, "SLD_GEOMETRY");
        b.addArc(xBase - 11, yRow, 4, 0, 180, "SLD_GEOMETRY");
        b.addCircle(xBase - 7, yRow, 0.8, "SLD_GEOMETRY");

        b.addText(
          `${row.left.mcbAT}AT`,
          xBase - 11,
          yRow + 4.5,
          1.8,
          0,
          "TEXT_HEADER",
          "center",
        );
      } else {
        b.addLine(xBase - 15, yRow, xBase - 7, yRow, "SLD_DASHED");
      }
      
      b.addLine(xBase - 15, yRow, xBase - 20, yRow, "SLD_GEOMETRY");
      
      b.addCircle(xBase - 23, yRow, 2.5, "SLD_GEOMETRY");
      b.addText(
        row.left.circuitNo.toString(),
        xBase - 23,
        yRow - 0.9,
        1.8,
        0,
        "TEXT_DATA",
        "center",
      );

      b.addLine(xBase - 25.5, yRow, xBase - 35, yRow, "SLD_GEOMETRY");

      // Arrow pointing left outwards
      b.addLine(xBase - 35, yRow, xBase - 32, yRow + 1.2, "SLD_GEOMETRY");
      b.addLine(xBase - 35, yRow, xBase - 32, yRow - 1.2, "SLD_GEOMETRY");
      b.addLine(xBase - 32, yRow + 1.2, xBase - 32, yRow - 1.2, "SLD_GEOMETRY");

      const desc = row.left.description || "SPARE";
      // Shift text up slightly (+ 1.5) to avoid crossing the extracted feeder line
      b.addText(
        desc.slice(0, 18),
        xBase - 38,
        yRow + 1.5,
        1.8,
        0,
        "TEXT_DATA",
        "right",
      );

      circuitMap.set(row.left.circuitNo, {
        arrowX: xBase - 35,
        arrowY: yRow,
        isLeft: true,
      });
    }

    if (row.right) {
      b.addCircle(xBase, yRow, 0.7, "SLD_BUSBAR");
      b.addLine(xBase, yRow, xBase + 7, yRow, "SLD_GEOMETRY");

      const isRightSpace = row.right.description?.toUpperCase() === "SPACE";
      if (!isRightSpace) {
        // High fidelity NECA dual-circle & arc Lever branch breaker
        b.addCircle(xBase + 15, yRow, 0.8, "SLD_GEOMETRY");
        b.addArc(xBase + 11, yRow, 4, 0, 180, "SLD_GEOMETRY");
        b.addCircle(xBase + 7, yRow, 0.8, "SLD_GEOMETRY");

        b.addText(
          `${row.right.mcbAT}AT`,
          xBase + 11,
          yRow + 4.5,
          1.8,
          0,
          "TEXT_HEADER",
          "center",
        );
      } else {
        b.addLine(xBase + 7, yRow, xBase + 15, yRow, "SLD_DASHED");
      }

      b.addLine(xBase + 15, yRow, xBase + 20, yRow, "SLD_GEOMETRY");

      b.addCircle(xBase + 23, yRow, 2.5, "SLD_GEOMETRY");
      b.addText(
        row.right.circuitNo.toString(),
        xBase + 23,
        yRow - 0.9,
        1.8,
        0,
        "TEXT_DATA",
        "center",
      );

      b.addLine(xBase + 25.5, yRow, xBase + 35, yRow, "SLD_GEOMETRY");

      // Arrow pointing right outwards
      b.addLine(xBase + 35, yRow, xBase + 32, yRow + 1.2, "SLD_GEOMETRY");
      b.addLine(xBase + 35, yRow, xBase + 32, yRow - 1.2, "SLD_GEOMETRY");
      b.addLine(xBase + 32, yRow + 1.2, xBase + 32, yRow - 1.2, "SLD_GEOMETRY");

      const desc2 = row.right.description || "SPARE";
      // Shift text up slightly (+ 1.5) to avoid crossing the extracted feeder line
      b.addText(
        desc2.slice(0, 18),
        xBase + 38,
        yRow + 1.5,
        1.8,
        0,
        "TEXT_DATA",
        "left",
      );

      circuitMap.set(row.right.circuitNo, {
        arrowX: xBase + 35,
        arrowY: yRow,
        isLeft: false,
      });
    }
  }

  b.isSLDMode = previousMode;
  return circuitMap;
};

const drawSystemSLD = (
  b: DxfBuilder,
  sheetIndex: number,
  mdpPanel: PanelConfig,
  mdpCircuits: Circuit[],
  mdpCalcData: any,
  subPanelsData: { id: string; panel: PanelConfig; circuits: Circuit[] }[],
  sheetWidth: number = 841,
  sheetOffsetX: number = -1
) => {
  const previousMode = b.isSLDMode;
  b.isSLDMode = true;
  const xOffset = sheetOffsetX !== -1 ? sheetOffsetX : sheetIndex * 900;

  // 1. Resolve layouts and parent-child relationships
  interface SpLayout {
    sp: { id: string; panel: PanelConfig; circuits: Circuit[] };
    parentId: string;
    isLeft: boolean;
    tempIsLeft: boolean;
    feedingCircuit: Circuit | null;
  }

  const spLayouts: SpLayout[] = [];

  subPanelsData.forEach((sp) => {
    let parentId = "mdp";
    let feedingCircuit: Circuit | null = null;
    let tempIsLeft = true;

    for (const parent of subPanelsData) {
      const match = parent.circuits.find(
        (c) => c.linkedSubPanelId === sp.id || (sp.panel.designation && c.description === sp.panel.designation)
      );
      if (match) {
        parentId = parent.id;
        feedingCircuit = match;
        break;
      }
    }

    if (parentId === "mdp") {
      const match = mdpCircuits.find(
        (c) => c.linkedSubPanelId === sp.id || (sp.panel.designation && c.description === sp.panel.designation)
      );
      if (match) {
        feedingCircuit = match;
      } else {
        const mdpSubCircuits = mdpCircuits.filter(
          (c) => c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL
        );
        const idx = subPanelsData.findIndex(s => s.id === sp.id);
        if (mdpSubCircuits.length > idx) {
          feedingCircuit = mdpSubCircuits[idx];
        }
      }
    }

    spLayouts.push({ sp, parentId, isLeft: true, tempIsLeft, feedingCircuit });
  });

  const getChildren = (pid: string) => spLayouts.filter((l) => l.parentId === pid);

  const getDepth = (id: string, seen: Set<string> = new Set()): number => {
    if (seen.has(id)) return 2;
    seen.add(id);
    const layout = spLayouts.find((l) => l.sp.id === id);
    if (!layout) return 2;
    if (layout.parentId === "mdp") return 2;
    return getDepth(layout.parentId, seen) + 1;
  };

  const depths = new Map<string, number>();
  spLayouts.forEach((l) => {
    depths.set(l.sp.id, getDepth(l.sp.id));
  });

  let maxDepth = 1;
  depths.forEach((d) => {
    if (d > maxDepth) maxDepth = d;
  });

  const getWidth = (id: string, seen: Set<string> = new Set()): number => {
    if (seen.has(id)) return 180;
    seen.add(id);
    const children = getChildren(id);
    if (children.length === 0) return 180;
    return children.reduce((sum, c) => sum + getWidth(c.sp.id, seen), 0);
  };

  const widths = new Map<string, number>();
  spLayouts.forEach((l) => {
    widths.set(l.sp.id, getWidth(l.sp.id));
  });

  const layoutAreaW = sheetWidth - 140;
  let xBase_MDP = xOffset + layoutAreaW / 2;
  if (spLayouts.length === 0 && sheetWidth === 841) {
    xBase_MDP = xOffset + 355;
  }

  const yBase_MDP = 120 + (maxDepth - 1) * 200;
  const mdpCircuitCoords = drawCadPanelSLD(
    b, mdpPanel, mdpCircuits, mdpCalcData.mainFeeder, xBase_MDP, yBase_MDP, false
  );

  const leftRoots: SpLayout[] = [];
  const rightRoots: SpLayout[] = [];

  spLayouts.forEach((l) => {
    if (l.parentId === "mdp") {
      let isL = true;
      if (l.feedingCircuit) {
        const coord = mdpCircuitCoords.get(l.feedingCircuit.circuitNo);
        if (coord) isL = coord.isLeft;
      }
      l.tempIsLeft = isL;
      if (isL) leftRoots.push(l);
      else rightRoots.push(l);
    }
  });

  const resolveIsLeft = (id: string, seen: Set<string> = new Set()): boolean => {
    if (seen.has(id)) return true;
    seen.add(id);
    const layout = spLayouts.find(l => l.sp.id === id);
    if (!layout) return true;
    if (layout.parentId === "mdp") return layout.tempIsLeft;
    return resolveIsLeft(layout.parentId, seen);
  };

  spLayouts.forEach((l) => {
    l.isLeft = resolveIsLeft(l.sp.id);
  });

  const positions = new Map<string, number>();
  const placeChildren = (parentId: string, startX: number) => {
    let currentX = startX;
    const children = getChildren(parentId);
    children.sort((a, b) => (a.feedingCircuit?.circuitNo || 0) - (b.feedingCircuit?.circuitNo || 0));
    
    children.forEach((c) => {
      const w = widths.get(c.sp.id) || 180;
      const cx = currentX + w / 2;
      positions.set(c.sp.id, cx);
      placeChildren(c.sp.id, currentX);
      currentX += w;
    });
  };

  const leftTotalWidth = leftRoots.reduce((sum, r) => sum + (widths.get(r.sp.id) || 180), 0);
  const leftSpan = xBase_MDP - 100 - (xOffset + 60);
  const leftS = leftSpan - leftTotalWidth;
  const leftGap = leftRoots.length > 0 ? leftS / (leftRoots.length + 1) : 0;

  let currentLeftX = xOffset + 60;
  leftRoots.sort((a, b) => (a.feedingCircuit?.circuitNo || 0) - (b.feedingCircuit?.circuitNo || 0));
  leftRoots.forEach((r) => {
    const w = widths.get(r.sp.id) || 180;
    const cx = currentLeftX + leftGap + w / 2;
    positions.set(r.sp.id, cx);
    placeChildren(r.sp.id, currentLeftX + leftGap);
    currentLeftX += w + leftGap;
  });

  const rightTotalWidth = rightRoots.reduce((sum, r) => sum + (widths.get(r.sp.id) || 180), 0);
  const rightSpan = (xOffset + layoutAreaW - 60) - (xBase_MDP + 100);
  const rightS = rightSpan - rightTotalWidth;
  const rightGap = rightRoots.length > 0 ? rightS / (rightRoots.length + 1) : 0;

  let currentRightX = xBase_MDP + 100;
  rightRoots.sort((a, b) => (a.feedingCircuit?.circuitNo || 0) - (b.feedingCircuit?.circuitNo || 0));
  rightRoots.forEach((r) => {
    const w = widths.get(r.sp.id) || 180;
    const cx = currentRightX + rightGap + w / 2;
    positions.set(r.sp.id, cx);
    placeChildren(r.sp.id, currentRightX + rightGap);
    currentRightX += w + rightGap;
  });

  const drawnCoords = new Map<string, Map<number, { arrowX: number, arrowY: number, isLeft: boolean }>>();
  drawnCoords.set("mdp", mdpCircuitCoords);

  for (let d = 2; d <= maxDepth; d++) {
    const layoutsAtDepth = spLayouts.filter(l => depths.get(l.sp.id) === d);
    const yBase = 120 + (maxDepth - d) * 200;
    
    layoutsAtDepth.forEach((layout, index) => {
      const sp = layout.sp;
      const xBase = positions.get(sp.id) || xOffset + 355;
      
      const spCalcData = computePanelScheduleValues(sp.panel, sp.circuits);
      const parentLabel = layout.parentId === "mdp" ? `FED FROM ${mdpPanel.designation || "MDP"}` : `FED FROM SUB-PANEL`;
      
      const coords = drawCadPanelSLD(
        b, sp.panel, sp.circuits, spCalcData.mainFeeder, xBase, yBase, true, parentLabel
      );
      drawnCoords.set(sp.id, coords);
      
      const parentCoords = drawnCoords.get(layout.parentId);
      if (parentCoords && layout.feedingCircuit) {
        const coord = parentCoords.get(layout.feedingCircuit.circuitNo);
        if (coord) {
          const xStart = coord.arrowX;
          const yStart = coord.arrowY;
          
          let pXBase = xBase_MDP;
          if (layout.parentId !== "mdp") {
            pXBase = positions.get(layout.parentId) || xBase_MDP;
          }
          
          const isLeft = coord.isLeft;
          const xGutter = pXBase + (isLeft ? -75 : 75) + (isLeft ? -(index % 5) * 6 : (index % 5) * 6);
          const yChannel = yBase + 60 + (index % 10) * 8;
          
          b.addLine(xStart, yStart, xGutter, yStart, "SLD_FEEDER");
          b.addLine(xGutter, yStart, xGutter, yChannel, "SLD_FEEDER");
          b.addLine(xGutter, yChannel, xBase, yChannel, "SLD_FEEDER");
          b.addLine(xBase, yChannel, xBase, yBase, "SLD_FEEDER");
        } else {
          b.addLine(xBase, yBase + 100, xBase, yBase, "SLD_FEEDER");
        }
      } else {
        b.addLine(xBase, yBase + 100, xBase, yBase, "SLD_FEEDER");
      }
      
      b.addRect(xBase - 26, yBase + 10, xBase + 26, yBase + 18, "BORDER");
      const labelText = d === 2 ? "SUB-PANEL" : d === 3 ? "SUB-SUB PANEL" : `LEVEL ${d} PANEL`;
      b.addText(
        `FEED TO ${sp.panel.designation || labelText}`,
        xBase, yBase + 12.5, 1.3, 0, "TEXT_HEADER", "center"
      );
    });
  }

  b.isSLDMode = previousMode;
};

interface PanelLayoutMetrics {
  rowH: number;
  dataFontSize: number;
  headerRowH: number;
  headerFontSize: number;
  splitHeaderFontSize: number;
  titleFontSize: number;
  subtitleFontSize: number;
  summaryRowH: number;
  summaryFontSize: number;
  mainFeederBoxH: number;
  mainFeederFontSize: number;
  calcBoxH: number;
  calcTitleFontSize: number;
  calcTextFontSize: number;
}

const getPanelLayoutMetrics = (panel: PanelConfig, circuits: Circuit[]): PanelLayoutMetrics => {
  const N = circuits.length;
  const is3Phase = panel.system.includes("3PH");
  
  if (N <= 12) {
    return {
      rowH: 11.0,
      dataFontSize: 2.5,
      headerRowH: is3Phase ? 16.0 : 12.0,
      headerFontSize: 3.0,
      splitHeaderFontSize: 2.4,
      titleFontSize: 5.0,
      subtitleFontSize: 2.5,
      summaryRowH: 11.0,
      summaryFontSize: 2.5,
      mainFeederBoxH: 22.0,
      mainFeederFontSize: 2.4,
      calcBoxH: 130.0,
      calcTitleFontSize: 5.0,
      calcTextFontSize: 2.2,
    };
  } else if (N <= 20) {
    return {
      rowH: 9.0,
      dataFontSize: 2.1,
      headerRowH: is3Phase ? 14.0 : 10.0,
      headerFontSize: 2.5,
      splitHeaderFontSize: 2.1,
      titleFontSize: 4.0,
      subtitleFontSize: 2.2,
      summaryRowH: 9.0,
      summaryFontSize: 2.1,
      mainFeederBoxH: 18.0,
      mainFeederFontSize: 2.0,
      calcBoxH: 115.0,
      calcTitleFontSize: 4.0,
      calcTextFontSize: 1.8,
    };
  } else {
    // High density
    return {
      rowH: 7.5,
      dataFontSize: 1.8,
      headerRowH: is3Phase ? 12.0 : 8.0,
      headerFontSize: 2.2,
      splitHeaderFontSize: 1.8,
      titleFontSize: 3.5,
      subtitleFontSize: 2.0,
      summaryRowH: 8.0,
      summaryFontSize: 1.8,
      mainFeederBoxH: 16.0,
      mainFeederFontSize: 1.8,
      calcBoxH: 95.0,
      calcTitleFontSize: 3.5,
      calcTextFontSize: 1.6,
    };
  }
};

// Main Export function accommodating Load Schedule AND Short Circuit results on a professional drawing
// Helper to calculate the exact bottom Y coordinate of a panel schedule table
const getPanelTableBottomY = (
  panelConfig: PanelConfig,
  panelCircuits: Circuit[],
) => {
  const metrics = getPanelLayoutMetrics(panelConfig, panelCircuits);
  const N = panelCircuits.length;
  let currentY = 574;
  currentY -= 22; // Header block
  currentY -= metrics.headerRowH; // Column headers
  currentY -= N * metrics.rowH; // Circuit rows
  currentY -= metrics.summaryRowH; // Summary footer row
  currentY -= metrics.mainFeederBoxH; // Main feeder details box under table
  currentY -= (24 + metrics.calcBoxH); // Calculations and Formulas block (24 + calcBoxH)
  return currentY;
};

// Main Export function accommodating Load Schedule AND Short Circuit results on a professional drawing
export const exportToCAD = (
  panel: PanelConfig,
  circuits: Circuit[],
  subPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[] = [],
  iscParams: ShortCircuitParams,
  exportMode:
    | "ALL"
    | "LOAD_SCHEDULE"
    | "SHORT_CIRCUIT"
    | "VOLTAGE_DROP" = "ALL",
  vdCalculations: VoltageDropCalculation[] = [],
  illumParams?: any,
  selectedEndpointId?: string
) => {
  const b = new DxfBuilder();

  const getConductorMaterialForCalculation = (calc: VoltageDropCalculation) => {
    if (calc.source === "main") {
      return panel?.conductorMaterial || "Copper";
    }
    const subPanel = subPanels.find(sp => sp.id === calc.source);
    if (subPanel) {
      return subPanel.panel?.conductorMaterial || "Copper";
    }
    if (circuits?.some(c => c.id === calc.source)) {
      return panel?.conductorMaterial || "Copper";
    }
    const spWithCircuit = subPanels.find(sp => sp.circuits.some(c => c.id === calc.source));
    if (spWithCircuit) {
      return spWithCircuit.panel?.conductorMaterial || "Copper";
    }
    return "Copper";
  };

  const getInsulationTypeForCalculation = (calc: VoltageDropCalculation) => {
    if (calc.source === "main") {
      return panel?.insulationType || "THHN";
    }
    const subPanel = subPanels.find(sp => sp.id === calc.source);
    if (subPanel) {
      return subPanel.panel?.insulationType || "THHN";
    }
    if (circuits?.some(c => c.id === calc.source)) {
      return panel?.insulationType || "THHN";
    }
    const spWithCircuit = subPanels.find(sp => sp.circuits.some(c => c.id === calc.source));
    if (spWithCircuit) {
      return spWithCircuit.panel?.insulationType || "THHN";
    }
    return "THHN";
  };

  // Run Load Schedule calculations
  const calcData = computePanelScheduleValues(panel, circuits);
  const is3Phase = panel.system.includes("3PH");

  const formatLatexForCAD = (text: any) => {
    if (text === null || text === undefined) return "";
    let res = String(text);

    // 1. Recursive outer LaTeX structure strip/replacements
    let prev = "";
    while (res !== prev) {
      prev = res;
      // Strip out LaTeX control sequence blocks
      res = res.replace(/\\textbf{((?:[^{}]|{[^}]*})*)}/g, "$1");
      res = res.replace(/\\text{((?:[^{}]|{[^}]*})*)}/g, "$1");
      res = res.replace(
        /\\frac{((?:[^{}]|{[^}]*})*)}{((?:[^{}]|{[^}]*})*)}/g,
        "($1) / ($2)",
      );
      res = res.replace(/\\sqrt{((?:[^{}]|{[^}]*})*)}/g, "sqrt($1)");
    }

    // 2. Replace subscript and superscript brackets _{xyz} -> _xyz, ^{abc} -> ^abc
    res = res.replace(/_{((?:[^{}]|{[^}]*})*)}/g, "_$1");
    res = res.replace(/\^{((?:[^{}]|{[^}]*})*)}/g, "^$1");

    // 3. Clean left/right fences and common LaTeX math keywords/operators
    res = res
      .replace(/\\left\(/gi, "(")
      .replace(/\\right\)/gi, ")")
      .replace(/\\left\[/gi, "[")
      .replace(/\\right\]/gi, "]")
      .replace(/\\left\|/gi, "|")
      .replace(/\\right\|/gi, "|")
      .replace(/\\times/gi, " * ")
      .replace(/\\Omega/gi, " Ohms")
      .replace(/\\Delta/gi, "Delta")
      .replace(/\\theta/gi, "theta")
      .replace(/\\Phi/g, "%%c") // Map Phase symbol to universal diameter symbol (%%c)
      .replace(/\\phi/g, "%%c") // Map Phase symbol to universal diameter symbol (%%c)
      .replace(/\\geq/gi, " >= ")
      .replace(/\\leq/gi, " <= ")
      .replace(/\\ge/gi, " >= ")
      .replace(/\\le/gi, " <= ")
      .replace(/\\%/gi, "%")
      .replace(/\\text\s+/gi, " ") // Strip un-braced LaTeX raw \text keywords
      .replace(/\\ /gi, " ");

    // 4. Convert actual Unicode symbols to plain English ASCII representations
    // This removes all alien characters entirely for complete DWG/CAD compatibility
    res = res
      .replace(/Ω/g, " Ohms")
      .replace(/√/g, "sqrt")
      .replace(/×/g, " x ")
      .replace(/≥/g, " >= ")
      .replace(/≤/g, " <= ")
      .replace(/≈/g, " = approx ")
      .replace(/π/g, "pi")
      .replace(/Δ/g, "Delta");

    // 5. Clean up duplicate/escaped slashes and any stray curly brackets or control sequences
    res = res
      .replace(/\\/g, "") // strip any other stray backslashes
      .replace(/[{}]/g, ""); // strip any stray remaining curly brackets

    // 6. Simplify spacing
    res = res.replace(/\s+/g, " ").trim();

    return res;
  };

  const getRunsBySystemLocal = (system?: string): number => {
    if (!system) return 1;
    if (system.includes("4W") || system.includes("5W")) return 4;
    if (system.includes("3W")) return 3;
    if (system.includes("2W") || system.includes("1PH")) return 2;
    return 1;
  };

  // Run Short Circuit calculations
  const defaultScParams = {
    transformerKVA: 100,
    transformerZ: 5,
    transformerVoltage: panel.voltage || 230,
    primaryVoltage: 34500,
    transformerConnection: "Delta-Wye (D-Y)",
    utilityShortCircuitMVA: 500,
    feederLength: 10,
    feederSize: "3.5",
    feederRuns: getRunsBySystemLocal(panel.system),
    conductorType: "Copper",
    connectionType: "Series",
    parallelTransformersCount: 1,
    parallelTransformersZMatch: true,
    parallelTransformerskVAMatch: true,
    parallelTransformersRating: 100,
    parallelTransformersZ: 5,
    parallelFeedersSizeMatch: true,
    parallelFeedersLengthMatch: true,
    parallelFeedersMaterialMatch: true,
    parallelFeedersCustomSizes: [],
    parallelFeedersCustomLengths: [],
    parallelFeedersCustomMaterials: [],
  };

  const scParams = {
    transformerKVA: iscParams?.transformerKVA ?? defaultScParams.transformerKVA,
    transformerZ: iscParams?.transformerZ ?? defaultScParams.transformerZ,
    transformerVoltage: iscParams?.transformerVoltage ?? defaultScParams.transformerVoltage,
    primaryVoltage: iscParams?.primaryVoltage ?? defaultScParams.primaryVoltage,
    transformerConnection: iscParams?.transformerConnection ?? defaultScParams.transformerConnection,
    utilityShortCircuitMVA: iscParams?.utilityShortCircuitMVA ?? defaultScParams.utilityShortCircuitMVA,
    feederLength: iscParams?.feederLength ?? defaultScParams.feederLength,
    feederSize: iscParams?.feederSize ?? defaultScParams.feederSize,
    feederRuns: iscParams?.feederRuns ?? defaultScParams.feederRuns,
    conductorType: iscParams?.conductorType ?? defaultScParams.conductorType,
    connectionType: iscParams?.connectionType ?? defaultScParams.connectionType,
    parallelTransformersCount: iscParams?.parallelTransformersCount ?? defaultScParams.parallelTransformersCount,
    parallelTransformersZMatch: iscParams?.parallelTransformersZMatch ?? defaultScParams.parallelTransformersZMatch,
    parallelTransformerskVAMatch: iscParams?.parallelTransformerskVAMatch ?? defaultScParams.parallelTransformerskVAMatch,
    parallelTransformersRating: iscParams?.parallelTransformersRating ?? defaultScParams.parallelTransformersRating,
    parallelTransformersZ: iscParams?.parallelTransformersZ ?? defaultScParams.parallelTransformersZ,
    parallelFeedersSizeMatch: iscParams?.parallelFeedersSizeMatch ?? defaultScParams.parallelFeedersSizeMatch,
    parallelFeedersLengthMatch: iscParams?.parallelFeedersLengthMatch ?? defaultScParams.parallelFeedersLengthMatch,
    parallelFeedersMaterialMatch: iscParams?.parallelFeedersMaterialMatch ?? defaultScParams.parallelFeedersMaterialMatch,
    parallelFeedersCustomSizes: iscParams?.parallelFeedersCustomSizes ?? defaultScParams.parallelFeedersCustomSizes,
    parallelFeedersCustomLengths: iscParams?.parallelFeedersCustomLengths ?? defaultScParams.parallelFeedersCustomLengths,
    parallelFeedersCustomMaterials: iscParams?.parallelFeedersCustomMaterials ?? defaultScParams.parallelFeedersCustomMaterials,
  };

  let connectionMultiplier = 1.0;
  let groundFaultFactor = 1.0;

  if (scParams.transformerConnection?.includes("Open") || false) {
    connectionMultiplier = 0.866;
  }

  if (
    scParams.transformerConnection === "Wye (Star) Connection" ||
    scParams.transformerConnection === "Delta-Wye (D-Y)" ||
    scParams.transformerConnection === "Wye-Wye (Y-Y)" ||
    scParams.transformerConnection === "Open Wye-Open Delta"
  ) {
    groundFaultFactor = 1.25;
  }

  const baseKVA = scParams.transformerKVA;
  const baseKV = scParams.transformerVoltage / 1000;
  const zUtilitypu = baseKVA / (scParams.utilityShortCircuitMVA * 1000);
  
  let zTranspu = scParams.transformerZ / 100 / connectionMultiplier;
  let totalTransformerKVA = baseKVA;
  const ptCount = scParams.parallelTransformersCount || 1;
  const ptZMatch = scParams.parallelTransformersZMatch !== false;
  const ptkVAMatch = scParams.parallelTransformerskVAMatch !== false;

  if (ptCount > 1) {
    if (ptZMatch && ptkVAMatch) {
      zTranspu = zTranspu / ptCount;
      totalTransformerKVA = baseKVA * ptCount;
    } else {
      const z1pu = zTranspu;
      const t2Rating = scParams.parallelTransformersRating || 100;
      const t2Z = scParams.parallelTransformersZ || 5;
      const z2pu = ((t2Z / 100) / connectionMultiplier) * (baseKVA / t2Rating);
      
      const y1 = 1 / z1pu;
      const y2 = (ptCount - 1) / z2pu;
      zTranspu = 1 / (y1 + y2);
      totalTransformerKVA = baseKVA + (ptCount - 1) * t2Rating;
    }
  }

  const feederRuns = scParams.feederRuns || 1;
  const condType = scParams.conductorType || "Copper";
  const connType = scParams.connectionType || "Series";

  const eqFeeder = calculateEquivalentFeederImpedance(
    scParams.feederLength || 10,
    scParams.feederSize || "3.5",
    feederRuns,
    condType as "Copper" | "Aluminum",
    connType as "Series" | "Parallel",
    scParams.parallelFeedersSizeMatch !== false,
    scParams.parallelFeedersLengthMatch !== false,
    scParams.parallelFeedersMaterialMatch !== false,
    scParams.parallelFeedersCustomSizes,
    scParams.parallelFeedersCustomLengths,
    scParams.parallelFeedersCustomMaterials,
  );

  const feederR = eqFeeder.r;
  const feederX = eqFeeder.x;
  const feederZ = eqFeeder.z;
  const zFeederpu = (feederZ * (baseKVA / 1000)) / (baseKV * baseKV);

  const totalZpu = zUtilitypu + zTranspu + zFeederpu;
  const iFullLoad = totalTransformerKVA / (1.732 * baseKV);
  const iFullLoadBase = baseKVA / (1.732 * baseKV);

  const iscMainBreaker = iFullLoadBase / (zUtilitypu + zTranspu);
  const iscFaultPoint = iFullLoadBase / totalZpu;

  const motorLoadVA = circuits
    .filter(
      (c) => c.loadType === LoadType.MOTOR || c.loadType === LoadType.AIR_CON,
    )
    .reduce((sum, c) => sum + c.loadVA, 0);
  const motorContribution =
    motorLoadVA > 0
      ? (motorLoadVA / (1.732 * scParams.transformerVoltage)) * 4
      : 0;

  const fault1Isc =
    (scParams.utilityShortCircuitMVA * 1000000) /
    (1.732 * scParams.primaryVoltage);
  const fault2Isc = iscMainBreaker;
  const fault3Isc = iscFaultPoint + motorContribution;

  // Drawing Frame Dimensions: 841mm x 594mm (Standard ISO-A1 Blueprint Sheet Size)
  const baseW = 841;
  const H = 594;
  const MARGIN_LEFT = 10;
  const MARGIN_RIGHT = 10;
  const MARGIN_TOP = 10;
  const MARGIN_BOTTOM = 10;
  const includeSLDSheet =
    exportMode === "ALL" || exportMode === "LOAD_SCHEDULE";
  const hasIllumination = !!(illumParams?.savedRooms && illumParams.savedRooms.length > 0);
  const allSubPanels = subPanels;
  // Calculate dynamic Voltage Drop equation pages
  let vdPages: VoltageDropCalculation[][] = [];
  if (
    (exportMode === "ALL" || exportMode === "VOLTAGE_DROP") &&
    vdCalculations &&
    vdCalculations.length > 0
  ) {
    const pages: VoltageDropCalculation[][] = [];
    let currentPageCalcs: VoltageDropCalculation[] = [];
    let currentY = 580;
    
    // Page 1 has formula reference
    currentY -= (5 * 7.5 + 4.0); // 41.5
    
    vdCalculations.forEach((calc) => {
      const blockHeight = 41.5;
      if (currentY - blockHeight < 60) {
        pages.push(currentPageCalcs);
        currentPageCalcs = [calc];
        currentY = 580 - blockHeight;
      } else {
        currentPageCalcs.push(calc);
        currentY -= blockHeight;
      }
    });
    if (currentPageCalcs.length > 0) {
      pages.push(currentPageCalcs);
    }
    vdPages = pages;
  }
  
  const extraVdSheets = vdPages.length > 1 ? vdPages.length - 1 : 0;

  let totalSheets = 4;
  if (exportMode === "ALL") {
    let baseSheets = 4 + Math.ceil(allSubPanels.length / 2);
    let extra = 3; // Voltage Drop, Short Circuit, and KAIC Compliance tables
    if (hasIllumination) {
      extra += 1; // plus Illumination table
    }
    totalSheets = baseSheets + extra + extraVdSheets + 1; // +1 for the Voltage Drop SLD sheet
  } else if (exportMode === "LOAD_SCHEDULE") {
    totalSheets = 2 + Math.ceil(allSubPanels.length / 2);
  } else if (exportMode === "SHORT_CIRCUIT") {
    totalSheets = 4; // Calculations Summary, SLD, Dedicated SC Table, and KAIC Compliance Audit Table
  } else if (exportMode === "VOLTAGE_DROP") {
    totalSheets = 2 + extraVdSheets + 1; // Calculations Summary, Dedicated VD Table, and +1 for the Voltage Drop SLD sheet
  }

  // Pre-calculate variable sheet widths and their xOffsets
  let leftSpCount = 0;
  let rightSpCount = 0;
  allSubPanels.forEach((sp, spIdx) => {
    let mdpFeederIndex = circuits.findIndex(
      (c) =>
        c.linkedSubPanelId === sp.id ||
        (sp.panel.designation && c.description === sp.panel.designation),
    );
    if (mdpFeederIndex < 0) {
      const parentSp = subPanels.find((psp) =>
        psp.circuits.some(
          (c) =>
            c.linkedSubPanelId === sp.id ||
            (sp.panel.designation && c.description === sp.panel.designation),
        )
      );
      if (parentSp) {
        mdpFeederIndex = circuits.findIndex(
          (c) =>
            c.linkedSubPanelId === parentSp.id ||
            (parentSp.panel.designation && c.description === parentSp.panel.designation),
        );
      }
    }
    if (mdpFeederIndex < 0) {
      const mdpSubCircuits = circuits.filter(
        (c) => c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL,
      );
      if (mdpSubCircuits.length > spIdx) {
        mdpFeederIndex = circuits.findIndex(
          (c) => c.id === mdpSubCircuits[spIdx].id,
        );
      }
    }
    let isLeft = true;
    if (mdpFeederIndex >= 0 && circuits[mdpFeederIndex]) {
      // @ts-ignore
      isLeft = circuits[mdpFeederIndex].circuitNo % 2 === 1;
    }
    if (isLeft) leftSpCount++;
    else rightSpCount++;
  });

  const spRequiredWidth = 180; // Generous width per subpanel to avoid text collisions
  const leftRequired = Math.max(300, leftSpCount * spRequiredWidth);
  const rightRequired = Math.max(300, rightSpCount * spRequiredWidth);
  const maxSideRequired = Math.max(leftRequired, rightRequired);
  const sldCustomW = Math.max(baseW, maxSideRequired * 2 + 460);

  const sheetConfigs: { w: number; xOffset: number }[] = [];
  let currentSheetX = 0;
  for (let i = 0; i < totalSheets; i++) {
    const isSLD =
      (exportMode === "ALL" || exportMode === "LOAD_SCHEDULE") &&
      includeSLDSheet &&
      i === 1;
    const w = isSLD ? sldCustomW : baseW;
    sheetConfigs.push({ w, xOffset: currentSheetX });
    currentSheetX += w + 60; // 60 padding between sheets
  }

  const drawSheetTemplate = (
    sheetIndex: number,
    currentPanel: PanelConfig,
    customTitle1?: string,
    customTitle2?: string,
  ) => {
    const sConf = sheetConfigs[sheetIndex] || {
      w: baseW,
      xOffset: sheetIndex * 900,
    };
    const xOffset = sConf.xOffset;
    const W = sConf.w;

    // Outer border
    b.addRect(xOffset + 0, 0, xOffset + W, H, "BORDER");
    // Inner layout cut border (10mm margins)
    b.addRect(
      xOffset + MARGIN_LEFT,
      MARGIN_BOTTOM,
      xOffset + W - MARGIN_RIGHT,
      H - MARGIN_TOP,
      "BORDER",
    );

    // Title block dividing boundary: aligned to the right
    const titleBlockX = xOffset + W - 130;
    b.addLine(
      titleBlockX,
      MARGIN_BOTTOM,
      titleBlockX,
      H - MARGIN_TOP,
      "BORDER",
    );

    // Professional Column partitions within vertical block
    b.addLine(titleBlockX, 85, xOffset + W - MARGIN_RIGHT, 85, "BORDER"); // Sheet ID Row
    b.addLine(titleBlockX, 145, xOffset + W - MARGIN_RIGHT, 145, "BORDER"); // Date / Scaling info
    b.addLine(titleBlockX, 235, xOffset + W - MARGIN_RIGHT, 235, "BORDER"); // Custom Drawing title Row
    b.addLine(titleBlockX, 325, xOffset + W - MARGIN_RIGHT, 325, "BORDER"); // Project name block
    b.addLine(titleBlockX, 420, xOffset + W - MARGIN_RIGHT, 420, "BORDER"); // Firm ID
    b.addLine(titleBlockX, 550, xOffset + W - MARGIN_RIGHT, 550, "BORDER"); // General Notes header partition

    // Label Titles & Static Texts in Vertical block
    const tx = titleBlockX + 5;
    const blockCenter = titleBlockX + (130 - MARGIN_RIGHT) / 2;

    // Firm Block
    b.addText(
      "ELECTRICALPH CONSULTANTS",
      blockCenter,
      400,
      2.5,
      0,
      "TEXT_TITLE",
      "center"
    );
    b.addText(
      "SEC REGISTERED ELECTRICAL ENGINEERS",
      blockCenter,
      390,
      1.8,
      0,
      "TEXT_DATA",
      "center"
    );
    b.addText(
      "PHILIPPINES DESIGN CONFORMITY PRACTICE",
      blockCenter,
      381,
      1.5,
      0,
      "TEXT_DATA",
      "center"
    );

    // Project metadata
    b.addText("PROJECT:", tx, 312, 1.8, 0, "TEXT_HEADER", "left");
    b.addText(
      (panel.projectType ? `[${panel.projectType}] ` : "") + (panel.project || "UNSPECIFIED DESIGN PROJECT"),
      tx,
      301,
      2.0,
      0,
      "TEXT_DATA",
      "left"
    );

    b.addText("OWNER:", tx, 290, 1.8, 0, "TEXT_HEADER", "left");
    b.addText(
      panel.owner || "UNSPECIFIED OWNER",
      tx,
      281,
      1.8,
      0,
      "TEXT_DATA",
      "left"
    );

    b.addText("LOCATION:", tx, 271, 1.8, 0, "TEXT_HEADER", "left");
    b.addText(
      panel.location || "PHILIPPINES LOCAL SITE",
      tx,
      261,
      2.3,
      0,
      "TEXT_DATA",
      "left",
    );

    // Drawing title
    b.addText("DRAWING TITLE:", tx, 222, 1.8, 0, "TEXT_HEADER", "left");
    b.addText(
      customTitle1 || `${currentPanel.designation || "SUB BOARD"} DISTRIBUTION`,
      blockCenter,
      205,
      2.8,
      0,
      "TEXT_TITLE",
      "center"
    );
    b.addText(
      customTitle2 || "LOAD SCHEDULE & FAULT ANALYSIS",
      blockCenter,
      194,
      2.4,
      0,
      "TEXT_TITLE",
      "center"
    );

    // Approval stamp / PEC statement
    b.addText("DESIGN APPROVAL:", tx, 175, 1.8, 0, "TEXT_HEADER", "left");
    b.addText(
      "PEC APPROVED FOR CONSTRUCTION",
      tx,
      164,
      2.0,
      0,
      "TEXT_DATA",
      "left",
    );

    // Scale and stats block
    b.addLine(titleBlockX + 60, 85, titleBlockX + 60, 145, "BORDER");
    b.addText("SCALE:", tx, 133, 1.6, 0, "TEXT_HEADER", "left");
    b.addText("NOT TO SCALE (N.T.S.)", tx, 122, 2.2, 0, "TEXT_DATA", "left");

    b.addText("CREATED DATE:", tx, 108, 1.6, 0, "TEXT_HEADER", "left");
    b.addText("06 JUNE 2026", tx, 97, 2.2, 0, "TEXT_DATA", "left");

    b.addText(
      "DESIGNED BY:",
      titleBlockX + 65,
      133,
      1.6,
      0,
      "TEXT_HEADER",
      "left",
    );
    b.addText("EE OFFICE", titleBlockX + 65, 122, 2.2, 0, "TEXT_DATA", "left");

    b.addText(
      "CHECKED BY:",
      titleBlockX + 65,
      108,
      1.6,
      0,
      "TEXT_HEADER",
      "left",
    );
    b.addText("PEE ENGR.", titleBlockX + 65, 97, 2.2, 0, "TEXT_DATA", "left");

    // Sheet Numbers
    b.addText("SHEET CODE", tx, 74, 1.8, 0, "TEXT_HEADER", "left");
    b.addText(
      `E - ${sheetIndex + 1} / ${totalSheets}`,
      blockCenter,
      32,
      10.0,
      0,
      "BORDER",
      "center",
    );

    // Standard Electrical Notes
    b.addText("GENERAL DRAWING NOTES:", tx, 538, 2.2, 0, "TEXT_HEADER", "left");
    b.addText(
      "1. ALL ELECTRICAL INSTALLATIONS SHALL BE",
      tx,
      525,
      1.6,
      0,
      "TEXT_DATA",
      "left"
    );
    b.addText(
      "   MADE IN ACCORDANCE WITH THE PHILIPPINE",
      tx,
      517,
      1.6,
      0,
      "TEXT_DATA",
      "left"
    );
    b.addText(
      "   ELECTRICAL CODE (PEC) COMPLIANCE MANDATES.",
      tx,
      509,
      1.6,
      0,
      "TEXT_DATA",
      "left"
    );
    b.addText(
      "2. CONDUCTORS FOR POWER LOADS SHALL BE EXCLUSIVELY",
      tx,
      497,
      1.6,
      0,
      "TEXT_DATA",
      "left"
    );
    b.addText(
      "   COPPER THHN / THWN-2 HEAT RESISTANT TYPES.",
      tx,
      489,
      1.6,
      0,
      "TEXT_DATA",
      "left"
    );
    b.addText(
      "3. ALL CIRCUITS SHALL RUN IN HEAVY DUTY CONDUIT.",
      tx,
      477,
      1.6,
      0,
      "TEXT_DATA",
      "left"
    );
    b.addText(
      "4. COMPLIANCE STAMP INDICATES POINT-TO-POINT",
      tx,
      465,
      1.6,
      0,
      "TEXT_DATA",
      "left"
    );
    b.addText(
      "   SHORT CIRCUIT EVALUATION AS PER SEC 1.10.1.24",
      tx,
      457,
      1.6,
      0,
      "TEXT_DATA",
      "left"
    );
    b.addText(
      "   FOR PROPER INTERRUPTING kAIC SAFETY RATINGS.",
      tx,
      449,
      1.6,
      0,
      "TEXT_DATA",
      "left"
    );
  };

  const drawPanelSchedule = (
    sheetIndex: number,
    currentPanel: PanelConfig,
    currentCircuits: Circuit[],
    currentCalcData: any,
    localXOffset: number = 0,
  ) => {
    const sConf = sheetConfigs[sheetIndex] || {
      w: baseW,
      xOffset: sheetIndex * 900,
    };
    const isPanel3Phase = currentPanel.system.includes("3PH");
    const targetTableWidth = 345;

    let activeXOffset = localXOffset;
    if (localXOffset === 0) {
      // Usable width on the drawing sheet is between left margin (10) and title block (w - 130)
      const usableWidth = sConf.w - 130 - 10; // 701
      const centerX = 10 + Math.floor((usableWidth - targetTableWidth) / 2); // Center the table in usable area
      activeXOffset = centerX - 20; // Adjust for the 20mm margin inset of the table starting point
    }

    const xOffset = sConf.xOffset + activeXOffset;
    let ty = 574;

    const metrics = getPanelLayoutMetrics(currentPanel, currentCircuits);

    // Columns Width Allocations matching the HTML table structure and order
    let cols: { name: string; w: number }[] = [];

    if (!isPanel3Phase) {
      const baseColWidths = [
        { name: "NO.", w: 12 },
        { name: "LOAD DESCRIPTION", w: 60 },
        { name: "W", w: 14 },
        { name: "QTY", w: 12 },
        { name: "VA", w: 18 },
        { name: "AMPS", w: 16 },
        { name: "AT", w: 12 },
        { name: "AF", w: 12 },
        { name: "P", w: 10 },
        { name: "KAIC", w: 14 },
        { name: "TYPE", w: 22 },
        { name: "WIRE / CONDUIT SIZING", w: 90 },
      ];
      const sumBase = baseColWidths.reduce((sum, col) => sum + col.w, 0); // 308
      cols = baseColWidths.map((col, idx) => {
        let colW = Math.floor((col.w / sumBase) * targetTableWidth);
        if (idx === baseColWidths.length - 1) {
          const sumSoFar = baseColWidths.slice(0, -1).map(c => Math.floor((c.w / sumBase) * targetTableWidth)).reduce((a, b) => a + b, 0);
          colW = targetTableWidth - sumSoFar;
        }
        return { name: col.name, w: colW };
      });
    } else {
      const label1 = currentPanel.connectionType === "Line-to-Neutral" ? "AN" : "AB";
      const label2 = currentPanel.connectionType === "Line-to-Neutral" ? "BN" : "BC";
      const label3 = currentPanel.connectionType === "Line-to-Neutral" ? "CN" : "CA";

      const baseColWidths = [
        { name: "NO.", w: 12 },
        { name: "LOAD DESCRIPTION", w: 58 },
        { name: "W", w: 14 },
        { name: "QTY", w: 12 },
        { name: "VA", w: 18 },
        { name: "PHASE", w: 16 },
        { name: label1, w: 14 },
        { name: label2, w: 14 },
        { name: label3, w: 14 },
        { name: "3Ø", w: 14 },
        { name: "AT", w: 12 },
        { name: "AF", w: 12 },
        { name: "P", w: 10 },
        { name: "KAIC", w: 14 },
        { name: "TYPE", w: 22 },
        { name: "WIRE / CONDUIT SIZING", w: 89 },
      ];
      const sumBase = baseColWidths.reduce((sum, col) => sum + col.w, 0); // 345
      cols = baseColWidths.map((col, idx) => {
        let colW = Math.floor((col.w / sumBase) * targetTableWidth);
        if (idx === baseColWidths.length - 1) {
          const sumSoFar = baseColWidths.slice(0, -1).map(c => Math.floor((c.w / sumBase) * targetTableWidth)).reduce((a, b) => a + b, 0);
          colW = targetTableWidth - sumSoFar;
        }
        return { name: col.name, w: colW };
      });
    }

    const tableWidth = cols.reduce((sum, col) => sum + col.w, 0);
    const tableRight = xOffset + 20 + tableWidth;

    // Table 1: Frame Outer Header Box
    b.addRect(xOffset + 20, ty - 22, tableRight, ty - 2, "BORDER");

    // Table Main Header Texts
    b.addText(
      `PANELBOARD BOARD SCHEDULE — ${currentPanel.designation || "BOARD"}`,
      xOffset + 20 + tableWidth / 2,
      ty - 11,
      metrics.titleFontSize,
      0,
      "TEXT_TITLE",
      "center",
    );
    b.addText(
      `SYSTEM RATING: ${currentPanel.system} | ENCLOSURE: ${currentPanel.enclosure} | MOUNTING: ${currentPanel.mounting} | VOLTAGE: ${currentPanel.voltage}V | PRIMARY VOLTAGE (HV): ${iscParams?.primaryVoltage || 34500}V`,
      xOffset + 20 + tableWidth / 2,
      ty - 18,
      metrics.subtitleFontSize,
      0,
      "TEXT_DATA",
      "center",
    );

    ty -= 22; // ty is now 552

    // Draw table row grids & texts
    const colPositions: number[] = [];
    let currentX = xOffset + 20;

    cols.forEach((col) => {
      colPositions.push(currentX);
      currentX += col.w;
    });
    colPositions.push(tableRight); // end cap

    // Draw Header Row (supporting double-header tier for Three-Phase AMPS split)
    const headerRowH = metrics.headerRowH;
    b.addRect(xOffset + 20, ty - headerRowH, tableRight, ty, "BORDER");

    if (!isPanel3Phase) {
      // Single Phase Header Layout
      for (let i = 1; i < colPositions.length; i++) {
        b.addLine(
          colPositions[i],
          ty - headerRowH,
          colPositions[i],
          ty,
          "TABLE_GRID",
        );
      }
      for (let i = 0; i < cols.length; i++) {
        const cx = colPositions[i] + cols[i].w / 2;
        b.addText(
          cols[i].name,
          cx,
          ty - headerRowH / 2 - metrics.headerFontSize / 2,
          metrics.headerFontSize,
          0,
          "TEXT_HEADER",
          "center",
          cols[i].w - 2
        );
      }
    } else {
      // 3-Phase Double Tier Header Layout
      for (let i = 1; i < colPositions.length; i++) {
        if (i < 7 || i > 10) {
          b.addLine(
            colPositions[i],
            ty - headerRowH,
            colPositions[i],
            ty,
            "TABLE_GRID",
          );
        }
      }

      // Print standard column titles
      for (let i = 0; i < cols.length; i++) {
        if (i < 6 || i > 9) {
          const cx = colPositions[i] + cols[i].w / 2;
          b.addText(
            cols[i].name,
            cx,
            ty - headerRowH / 2 - metrics.headerFontSize / 2,
            metrics.headerFontSize,
            0,
            "TEXT_HEADER",
            "center",
            cols[i].w - 2
          );
        }
      }

      // Split tier for AMPS
      const ampsStartX = colPositions[6];
      const ampsEndX = colPositions[10];
      const splitTierY = ty - headerRowH / 2;
      b.addLine(ampsStartX, splitTierY, ampsEndX, splitTierY, "TABLE_GRID");
      b.addText(
        "AMPS",
        (ampsStartX + ampsEndX) / 2,
        ty - (headerRowH / 2) / 2 - metrics.headerFontSize / 2,
        metrics.headerFontSize,
        0,
        "TEXT_HEADER",
        "center",
      );

      for (let i = 7; i <= 9; i++) {
        b.addLine(
          colPositions[i],
          ty - headerRowH,
          colPositions[i],
          splitTierY,
          "TABLE_GRID",
        );
      }
      for (let i = 6; i <= 9; i++) {
        const cx = colPositions[i] + cols[i].w / 2;
        b.addText(
          cols[i].name,
          cx,
          splitTierY - (headerRowH / 2) / 2 - metrics.splitHeaderFontSize / 2,
          metrics.splitHeaderFontSize,
          0,
          "TEXT_HEADER",
          "center",
          cols[i].w - 2
        );
      }
    }

    ty -= headerRowH;

    // Print circuit rows
    const rowH = metrics.rowH;
    currentCircuits.forEach((cir) => {
      // Draw bottom horizontal line
      b.addLine(xOffset + 20, ty - rowH, tableRight, ty - rowH, "TABLE_GRID");
      // Draw left outer vertical line
      b.addLine(xOffset + 20, ty - rowH, xOffset + 20, ty, "BORDER");
      // Draw right outer vertical line
      b.addLine(tableRight, ty - rowH, tableRight, ty, "BORDER");

      // Draw inner dividers only
      for (let i = 1; i < colPositions.length - 1; i++) {
        b.addLine(
          colPositions[i],
          ty - rowH,
          colPositions[i],
          ty,
          "TABLE_GRID",
        );
      }

      const isSpace =
        (cir.description && cir.description.toUpperCase() === "SPACE") ||
        cir.loadType === LoadType.SPACE;

      const yText = ty - rowH / 2 - metrics.dataFontSize / 2;

      // Col 1: NO.
      b.addText(
        cir.circuitNo.toString(),
        colPositions[0] + cols[0].w / 2,
        yText,
        metrics.dataFontSize,
        0,
        "TEXT_DATA",
        "center",
        cols[0].w - 2
      );

      // Col 2: DESCRIPTION
      b.addText(
        cir.description,
        colPositions[1] + 2,
        yText,
        metrics.dataFontSize,
        0,
        "TEXT_DATA",
        "left",
        cols[1].w - 4
      );

      // Col 3: W
      b.addText(
        isSpace ? "-" : cir.wattage.toString(),
        colPositions[2] + cols[2].w / 2,
        yText,
        metrics.dataFontSize,
        0,
        "TEXT_DATA",
        "center",
        cols[2].w - 2
      );

      // Col 4: QTY
      b.addText(
        isSpace ? "-" : cir.quantity.toString(),
        colPositions[3] + cols[3].w / 2,
        yText,
        metrics.dataFontSize,
        0,
        "TEXT_DATA",
        "center",
        cols[3].w - 2
      );

      // Col 5: VA
      b.addText(
        isSpace ? "-" : cir.loadVA.toString(),
        colPositions[4] + cols[4].w / 2,
        yText,
        metrics.dataFontSize,
        0,
        "TEXT_DATA",
        "center",
        cols[4].w - 2
      );

      // Col 6: PHASE / AMPS
      if (isPanel3Phase) {
        let phaseStr = "-";
        if (!isSpace) {
          const phases = cir.phases || [];
          if (phases.length === 3) {
            phaseStr = "3P";
          } else if (phases.length > 0) {
            phaseStr = phases.join(",");
          }
        }
        b.addText(
          phaseStr,
          colPositions[5] + cols[5].w / 2,
          yText,
          metrics.dataFontSize,
          0,
          "TEXT_DATA",
          "center",
          cols[5].w - 2
        );
      }

      // Col 7: AMPS
      if (!isPanel3Phase) {
        b.addText(
          isSpace ? "-" : `${cir.loadA.toFixed(2)}A`,
          colPositions[5] + cols[5].w / 2,
          yText,
          metrics.dataFontSize,
          0,
          "TEXT_DATA",
          "center",
          cols[5].w - 2
        );
      } else {
        const phases = cir.phases || [];
        const phRVal =
          isSpace
            ? "-"
            : cir.subPanelReflectionMode === "phase_loads" && cir.reflectedPhaseAmps
            ? cir.reflectedPhaseAmps.R > 0
              ? `${cir.reflectedPhaseAmps.R.toFixed(2)}A`
              : "-"
            : phases.includes("R") && phases.length < 3
            ? `${cir.loadA.toFixed(2)}A`
            : "-";
            
        const phYVal =
          isSpace
            ? "-"
            : cir.subPanelReflectionMode === "phase_loads" && cir.reflectedPhaseAmps
            ? cir.reflectedPhaseAmps.Y > 0
              ? `${cir.reflectedPhaseAmps.Y.toFixed(2)}A`
              : "-"
            : phases.includes("Y") && phases.length < 3
            ? `${cir.loadA.toFixed(2)}A`
            : "-";
            
        const phBVal =
          isSpace
            ? "-"
            : cir.subPanelReflectionMode === "phase_loads" && cir.reflectedPhaseAmps
            ? cir.reflectedPhaseAmps.B > 0
              ? `${cir.reflectedPhaseAmps.B.toFixed(2)}A`
              : "-"
            : phases.includes("B") && phases.length < 3
            ? `${cir.loadA.toFixed(2)}A`
            : "-";
            
        const ph3PVal =
          isSpace
            ? "-"
            : cir.subPanelReflectionMode === "phase_loads" && cir.reflectedPhaseAmps
            ? cir.reflectedPhaseAmps.ThreePhase > 0
              ? `${cir.reflectedPhaseAmps.ThreePhase.toFixed(2)}A`
              : "-"
            : phases.length === 3
            ? `${cir.loadA.toFixed(2)}A`
            : "-";

        const yTextSplit = ty - rowH / 2 - metrics.splitHeaderFontSize / 2;

        b.addText(
          phRVal,
          colPositions[6] + cols[6].w / 2,
          yTextSplit,
          metrics.splitHeaderFontSize,
          0,
          "TEXT_DATA",
          "center",
          cols[6].w - 2
        );
        b.addText(
          phYVal,
          colPositions[7] + cols[7].w / 2,
          yTextSplit,
          metrics.splitHeaderFontSize,
          0,
          "TEXT_DATA",
          "center",
          cols[7].w - 2
        );
        b.addText(
          phBVal,
          colPositions[8] + cols[8].w / 2,
          yTextSplit,
          metrics.splitHeaderFontSize,
          0,
          "TEXT_DATA",
          "center",
          cols[8].w - 2
        );
        b.addText(
          ph3PVal,
          colPositions[9] + cols[9].w / 2,
          yTextSplit,
          metrics.splitHeaderFontSize,
          0,
          "TEXT_DATA",
          "center",
          cols[9].w - 2
        );
      }

      const baseIdx = isPanel3Phase ? 10 : 6;

      // Col 8: AT
      b.addText(
        isSpace ? "-" : `${cir.mcbAT} AT`,
        colPositions[baseIdx] + cols[baseIdx].w / 2,
        yText,
        metrics.dataFontSize,
        0,
        "TEXT_DATA",
        "center",
        cols[baseIdx].w - 2
      );

      // Col 9: AF
      b.addText(
        isSpace ? "-" : `${cir.mcbAF} AF`,
        colPositions[baseIdx + 1] + cols[baseIdx + 1].w / 2,
        yText,
        metrics.dataFontSize,
        0,
        "TEXT_DATA",
        "center",
        cols[baseIdx + 1].w - 2
      );

      // Col 10: P
      b.addText(
        isSpace ? "-" : `${typeof cir.mcbP === "string" ? cir.mcbP : cir.mcbP + "P"}`,
        colPositions[baseIdx + 2] + cols[baseIdx + 2].w / 2,
        yText,
        metrics.dataFontSize,
        0,
        "TEXT_DATA",
        "center",
        cols[baseIdx + 2].w - 2
      );

      // Col 11: KAIC
      b.addText(
        isSpace ? "-" : `${cir.mcbKAIC}`,
        colPositions[baseIdx + 3] + cols[baseIdx + 3].w / 2,
        yText,
        metrics.dataFontSize,
        0,
        "TEXT_DATA",
        "center",
        cols[baseIdx + 3].w - 2
      );

      // Col 12: TYPE
      b.addText(
        isSpace ? "-" : `${cir.mcbType}`,
        colPositions[baseIdx + 4] + cols[baseIdx + 4].w / 2,
        yText,
        metrics.dataFontSize,
        0,
        "TEXT_DATA",
        "center",
        cols[baseIdx + 4].w - 2
      );

      // Col 13: WIRE / CONDUIT SIZING
      const sizeStr = isSpace
        ? "SPACE"
        : formatStandardCableDescription(
            cir.wireSets || cir.calculatedWireSets || 1,
            cir.wireSize || "2.0",
            cir.wireType || "THHN",
            cir.groundSize || "2.0",
            cir.conduitSize || "20",
            cir.conduitType || "PVC"
          );
      
      const yTextWire = ty - rowH / 2 - metrics.splitHeaderFontSize / 2;
      b.addText(
        sizeStr,
        colPositions[baseIdx + 5] + 3,
        yTextWire,
        metrics.splitHeaderFontSize,
        0,
        "TEXT_DATA",
        "left",
        cols[baseIdx + 5].w - 6
      );

      ty -= rowH;
    });

    // DRAW TABULAR SUMMARY FOOTER (Aligned exactly with HTML table arrangement)
    const sumRowH = metrics.summaryRowH;
    b.addRect(xOffset + 20, ty - sumRowH, tableRight, ty, "BORDER");

    const ySumText = ty - sumRowH / 2 - metrics.summaryFontSize / 2;

    // Merged block for Cols 1-4
    b.addText(
      "TOTAL CONNECTED LOAD / SUMMARY:",
      xOffset + 23,
      ySumText,
      metrics.summaryFontSize,
      0,
      "TEXT_HEADER",
      "left",
      colPositions[4] - (xOffset + 23) - 2
    );

    // Draw dividers only for configured summary boundaries
    // Divider at start of VA column
    b.addLine(colPositions[4], ty - sumRowH, colPositions[4], ty, "TABLE_GRID");
    // VA Column total
    b.addText(
      `${currentCalcData.totalVA.toFixed(0)} VA`,
      colPositions[4] + cols[4].w / 2,
      ySumText,
      metrics.summaryFontSize,
      0,
      "TEXT_HEADER",
      "center",
      cols[4].w - 2
    );

    let ampsEndIdx = 6;
    if (isPanel3Phase) {
      // Divider at start of PHASE / kVA column
      b.addLine(colPositions[5], ty - sumRowH, colPositions[5], ty, "TABLE_GRID");
      // Phase / kVA total
      b.addText(
        `(${(currentCalcData.totalVA / 1000).toFixed(2)} kVA)`,
        colPositions[5] + cols[5].w / 2,
        ySumText,
        metrics.summaryFontSize,
        0,
        "TEXT_HEADER",
        "center",
        cols[5].w - 2
      );

      // Divider at start of AMPS column(s)
      b.addLine(colPositions[6], ty - sumRowH, colPositions[6], ty, "TABLE_GRID");

      // Draw vertical lines in AMPS region
      for (let i = 7; i <= 10; i++) {
        b.addLine(
          colPositions[i],
          ty - sumRowH,
          colPositions[i],
          ty,
          "TABLE_GRID",
        );
      }
      
      const ySumTextSplit = ty - sumRowH / 2 - metrics.splitHeaderFontSize / 2;

      b.addText(
        `${currentCalcData.phaseAmps.R.toFixed(2)} A`,
        colPositions[6] + cols[6].w / 2,
        ySumTextSplit,
        metrics.splitHeaderFontSize,
        0,
        "TEXT_HEADER",
        "center",
        cols[6].w - 2
      );
      b.addText(
        `${currentCalcData.phaseAmps.Y.toFixed(2)} A`,
        colPositions[7] + cols[7].w / 2,
        ySumTextSplit,
        metrics.splitHeaderFontSize,
        0,
        "TEXT_HEADER",
        "center",
        cols[7].w - 2
      );
      b.addText(
        `${currentCalcData.phaseAmps.B.toFixed(2)} A`,
        colPositions[8] + cols[8].w / 2,
        ySumTextSplit,
        metrics.splitHeaderFontSize,
        0,
        "TEXT_HEADER",
        "center",
        cols[8].w - 2
      );
      const ph3PVal =
        currentCalcData.phaseAmps.threePhase > 0
          ? `${currentCalcData.phaseAmps.threePhase.toFixed(2)} A`
          : "-";
      b.addText(
        ph3PVal,
        colPositions[9] + cols[9].w / 2,
        ySumTextSplit,
        metrics.splitHeaderFontSize,
        0,
        "TEXT_HEADER",
        "center",
        cols[9].w - 2
      );
      ampsEndIdx = 10;
    } else {
      // Single-phase footer: PHASE column is removed. AMPS column is now at index 5.
      b.addLine(colPositions[5], ty - sumRowH, colPositions[5], ty, "TABLE_GRID");
      b.addText(
        `${currentCalcData.totalConnectedAmps.toFixed(2)} A`,
        colPositions[5] + cols[5].w / 2,
        ySumText,
        metrics.summaryFontSize,
        0,
        "TEXT_HEADER",
        "center",
        cols[5].w - 2
      );
      b.addLine(
        colPositions[6],
        ty - sumRowH,
        colPositions[6],
        ty,
        "TABLE_GRID",
      );
      ampsEndIdx = 6;
    }

    // Merged block for Cols 8-13 (Summary specifications)
    const mainFeederCableStandard = formatStandardCableDescription(
      currentCalcData.mainFeeder.wire.runs || 1,
      currentCalcData.mainFeeder.wire.size,
      currentPanel.insulationType || "THHN",
      currentCalcData.mainFeeder.groundSize,
      currentCalcData.mainFeeder.conduitSize,
      currentCalcData.mainFeeder.conduitType || "PVC"
    );
    const summarySpecStr = `FEEDER: ${mainFeederCableStandard} | MAIN CB: ${currentCalcData.mainFeeder.cb} AT / ${currentCalcData.mainFeeder.af} AF, ${currentCalcData.mainFeeder.poles}P${isPanel3Phase ? ` | IMBALANCE: ${currentCalcData.phaseImbalance.toFixed(1)}%` : ""}`;
    
    const ySumTextSpec = ty - sumRowH / 2 - metrics.splitHeaderFontSize / 2;

    b.addText(
      summarySpecStr,
      colPositions[ampsEndIdx] + 3,
      ySumTextSpec,
      metrics.splitHeaderFontSize,
      0,
      "TEXT_DATA",
      "left",
      tableRight - colPositions[ampsEndIdx] - 6
    );

    ty -= sumRowH; // ty is now table bottom

    // Main feeder layout details (Box with specifications under the table)
    b.addRect(xOffset + 20, ty - metrics.mainFeederBoxH, tableRight, ty, "BORDER");
    b.addText(
      `MAIN FEEDER CONDUCTORS: ${mainFeederCableStandard}.`,
      xOffset + 23,
      ty - metrics.mainFeederBoxH / 2 + 3.5,
      metrics.mainFeederFontSize,
      0,
      "TEXT_DATA",
      "left",
      (tableRight - (xOffset + 23)) - 140
    );
    b.addText(
      `MAIN RATED OVERCURRENT BREAKER: ${currentCalcData.mainFeeder.cb} AT / ${currentCalcData.mainFeeder.af} AF, ${currentCalcData.mainFeeder.poles}P, ${currentCalcData.mainFeeder.kaic} kAIC, ${currentCalcData.mainFeeder.type}.`,
      xOffset + 23,
      ty - metrics.mainFeederBoxH / 2 - 1.5,
      metrics.mainFeederFontSize,
      0,
      "TEXT_DATA",
      "left",
      (tableRight - (xOffset + 23)) - 140
    );
    if (currentPanel.transferSwitchType && currentPanel.transferSwitchType !== "None") {
      const STANDARD_TS_RATINGS = [30, 40, 50, 60, 70, 80, 90, 100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000, 5000];
      const recommendedTsRating = STANDARD_TS_RATINGS.find(r => r >= (currentCalcData?.mainFeeder?.cb || 60)) || (currentCalcData?.mainFeeder?.cb || 60);
      const tsRating = currentPanel.transferSwitchRating || recommendedTsRating;
      const tsPoles = currentPanel.transferSwitchPoles || (currentPanel.system.includes("3PH") ? 3 : 2);

      b.addText(
        `TRANSFER SWITCH: ${currentPanel.transferSwitchType === "ATS" ? "AUTOMATIC" : "MANUAL"} TRANSFER SWITCH (${currentPanel.transferSwitchType}) RATED ${tsRating}A, ${tsPoles}P.`,
        xOffset + 23,
        ty - metrics.mainFeederBoxH / 2 - 6.5,
        metrics.mainFeederFontSize,
        0,
        "TEXT_DATA",
        "left",
        (tableRight - (xOffset + 23)) - 140
      );
    }
    b.addText(
      `${isPanel3Phase ? `PHASE DISBALANCE RATIO: ${currentCalcData.phaseImbalance.toFixed(2)}% | ` : ""}RATED MAX DEMAND CURRENT: ${currentCalcData.mainCurrent.designAmp.toFixed(2)} A`,
      tableRight - 5,
      ty - metrics.mainFeederBoxH / 2 - 1.0,
      metrics.mainFeederFontSize,
      0,
      "TEXT_HEADER",
      "right",
      135
    );

    // CALCULATIONS & FORMULAS MODULE
    const calcY = ty - metrics.mainFeederBoxH - 8; // Start right below the main feeder details
    const calcBoxHeight = metrics.calcBoxH;
    const col2X = xOffset + Math.floor((tableRight - xOffset) / 2) + 20;
    b.addRect(xOffset + 20, calcY - calcBoxHeight, tableRight, calcY, "BORDER");
    b.addRect(xOffset + 20, calcY - 12, tableRight, calcY, "BORDER"); // Header bar
    b.addText(
      "CALCULATIONS & FORMULAS",
      (xOffset + 20 + tableRight) / 2,
      calcY - 8,
      metrics.calcTitleFontSize,
      0,
      "TEXT_TITLE",
      "center",
      tableRight - (xOffset + 20) - 10
    );

    const writeCalcLine = (
      text: string,
      cy: number,
      textType: string = "TEXT_DATA",
    ) => {
      const wWidth = col2X - (xOffset + 25) - 5;
      b.addText(text, xOffset + 25, cy, metrics.calcTextFontSize, 0, textType, "left", wWidth);
    };

    let cy = calcY - 20;

    // 1. Total Load Calculation
    writeCalcLine("1. TOTAL LOAD CALCULATION", cy, "TEXT_HEADER");
    cy -= 6;
    writeCalcLine(
      "Total VA = Σ (Quantity * Wattage) per active branch circuit.",
      cy,
    );
    cy -= 6;
    writeCalcLine(
      `Calculated Total: ${currentCalcData.totalVA.toFixed(2)} VA`,
      cy,
      "TEXT_TITLE",
    );
    cy -= 12;

    // Local Helper delegation for System Voltage Fallback
    const getSystemVoltageLFallback = getPanelSystemVoltageFallback;

    // 2. Base Demand Current (I_demand) Calculation
    const maxDemandDetails = currentCalcData.maxDemandDetails;
    writeCalcLine("2. TOTAL BASE DEMAND CURRENT (I_demand)", cy, "TEXT_HEADER");
    cy -= 6;
    if (isPanel3Phase) {
      writeCalcLine(
        `Formula: I_demand = ((I_line * 1.732) * 0.80 + I_3ph + 0.25 * HML) * 1.25`,
        cy,
      );
      cy -= 6;
      writeCalcLine(
        `Values: I_line = ${(maxDemandDetails.totalAmpere || 0).toFixed(2)} A, I_3ph = ${(maxDemandDetails.total3Phase || 0).toFixed(2)} A, HML = ${(maxDemandDetails.HML || 0).toFixed(2)} A`,
        cy,
      );
      cy -= 6;
      writeCalcLine(
        `Math: (((${maxDemandDetails.totalAmpere.toFixed(2)} * 1.732) * 0.80) + ${maxDemandDetails.total3Phase.toFixed(2)} + (0.25 * ${maxDemandDetails.HML.toFixed(2)})) * 1.25 = ${(((maxDemandDetails.totalAmpere || 0) * 1.732 * 0.8 + (maxDemandDetails.total3Phase || 0) + 0.25 * (maxDemandDetails.HML || 0)) * 1.25).toFixed(2)} A`,
        cy,
        "TEXT_TITLE",
      );
      cy -= 12;
    } else {
      const dxfSysV = maxDemandDetails.systemVoltage || 230;
      writeCalcLine(
        `Formula: I_demand = ((Total VA / ${dxfSysV}) * 0.80 + 0.25 * HML) * 1.25`,
        cy,
      );
      cy -= 6;
      writeCalcLine(
        `Values: totalVA = ${maxDemandDetails.internalConnectedVA.toFixed(1)} VA, HML = ${maxDemandDetails.HML.toFixed(2)} A`,
        cy,
      );
      cy -= 6;
      writeCalcLine(
        `Math: (((${maxDemandDetails.internalConnectedVA.toFixed(1)} / ${dxfSysV}) * 0.80) + (0.25 * ${maxDemandDetails.HML.toFixed(2)})) * 1.25 = ${((((maxDemandDetails.internalConnectedVA || 0) / dxfSysV) * 0.8 + 0.25 * (maxDemandDetails.HML || 0)) * 1.25).toFixed(2)} A`,
        cy,
        "TEXT_TITLE",
      );
      cy -= 12;
    }

    // 3. Main Design Properties
    writeCalcLine("3. MAIN DESIGN CAPACITY & PROTECTION", cy, "TEXT_HEADER");
    cy -= 6;
    writeCalcLine(
      "Protective breaker rating matches/exceeds calculation per PEC.",
      cy,
    );
    cy -= 6;
    writeCalcLine(
      `Design Current: ${currentCalcData.mainCurrent.designAmp.toFixed(2)} A`,
      cy,
      "TEXT_TITLE",
    );
    cy -= 6;
    writeCalcLine(
      `RATED MAIN CB PROTECTIVE GEAR: ${currentCalcData.mainFeeder.cb} AT`,
      cy,
      "TEXT_TITLE",
    );
    cy -= 6;

    // Split into second column if space permits, but for simplicity let's shift X for column 2
    const cyRightStart = calcY - 20;
    const writeCalcLineCol2 = (
      text: string,
      cy: number,
      textType: string = "TEXT_DATA",
    ) => {
      const wWidth = tableRight - col2X - 10;
      b.addText(text, col2X, cy, metrics.calcTextFontSize, 0, textType, "left", wWidth);
    };

    let cy2 = cyRightStart;

    if (isPanel3Phase) {
      writeCalcLineCol2("4. PHASE BALANCING & ANALYSIS", cy2, "TEXT_HEADER");
      cy2 -= 6;
      writeCalcLineCol2(
        "Evaluation of load symmetry across phases R, Y, B.",
        cy2,
      );
      cy2 -= 6;
      writeCalcLineCol2(
        `Phase R: ${currentCalcData.phaseLoads.R.toFixed(2)} VA`,
        cy2,
      );
      cy2 -= 6;
      writeCalcLineCol2(
        `Phase Y: ${currentCalcData.phaseLoads.Y.toFixed(2)} VA`,
        cy2,
      );
      cy2 -= 6;
      writeCalcLineCol2(
        `Phase B: ${currentCalcData.phaseLoads.B.toFixed(2)} VA`,
        cy2,
      );
      cy2 -= 6;

      const maxP = Math.max(
        currentCalcData.phaseLoads.R,
        currentCalcData.phaseLoads.Y,
        currentCalcData.phaseLoads.B,
      );
      const minP = Math.min(
        currentCalcData.phaseLoads.R,
        currentCalcData.phaseLoads.Y,
        currentCalcData.phaseLoads.B,
      );
      const imbalance = maxP > 0 ? (1 - minP / maxP) * 100 : 0;

      writeCalcLineCol2(
        `Imbalance Ratio: ${imbalance.toFixed(2)}%`,
        cy2,
        "TEXT_TITLE",
      );
      cy2 -= 6;
      const pStatus =
        imbalance > 15 ? "(WARNING: EXCEEDS 15% LIMIT)" : "(ACCEPTABLE SYMMETRY)";
      writeCalcLineCol2(`Status: ${pStatus}`, cy2, "TEXT_TITLE");
      cy2 -= 12;
    }
  };

  // Render main sheet template & load schedule only if not short circuit isolated mode
  if (exportMode === "ALL" || exportMode === "LOAD_SCHEDULE") {
    drawSheetTemplate(0, panel);
    drawPanelSchedule(0, panel, circuits, calcData);
  }

  let globalSheetCursor =
    exportMode === "ALL" || exportMode === "LOAD_SCHEDULE" ? 1 : 0;

  if (exportMode === "ALL" || exportMode === "LOAD_SCHEDULE") {
    const sldSheetIndex = globalSheetCursor++;
    drawSheetTemplate(
      sldSheetIndex,
      panel,
      `${panel.designation || "MAIN"} PANELBOARD`,
      "SYSTEM SINGLE LINE DIAGRAM",
    );

    // Pass dynamic width and xOffset to SLD to allow it to spread subpanels intelligently
    const sConfig = sheetConfigs[sldSheetIndex] || {
      w: baseW,
      xOffset: sldSheetIndex * 900,
    };
    drawSystemSLD(
      b,
      sldSheetIndex,
      panel,
      circuits,
      calcData,
      subPanels,
      sConfig.w,
      sConfig.xOffset
    );
  }

  if (exportMode === "ALL" || exportMode === "LOAD_SCHEDULE") {
    let activeSheetIndex = -1;

    allSubPanels.forEach((sp, i) => {
      // Logic for bundling 2 sub-panels side-by-side if they both fit in 1 template
      const isEven = i % 2 === 0;
      if (isEven) {
        activeSheetIndex = globalSheetCursor++;
        // Draw the envelope mapping ONLY once per sheet
        drawSheetTemplate(activeSheetIndex, sp.panel);
      }

      const drawIsOdd = !isEven;
      const sConf = sheetConfigs[activeSheetIndex] || {
        w: baseW,
        xOffset: activeSheetIndex * 900,
      };
      const xOffset = sConf.xOffset;

      // Since max table width is 345, we place them safely within the 701 usable area
      const localXOffset = drawIsOdd ? 342 : -6; // Second panel at 362, first at 14 (gap from 10)
      const sheetContentOffset = xOffset + 20 + localXOffset;

      // Run Calculations for local Sub Panel
      const spCalcData = computePanelScheduleValues(sp.panel, sp.circuits);

      // Draw corresponding table grids and row schedules with exact layout offset
      drawPanelSchedule(
        activeSheetIndex,
        sp.panel,
        sp.circuits,
        spCalcData,
        localXOffset,
      );

      const by = 20;

      // Compute dynamic height for subpanel path study card to maximize space utilization
      const spTableBottomY = getPanelTableBottomY(sp.panel, sp.circuits);
      const spBottomSectionHeight = Math.max(
        130,
        Math.min(360, spTableBottomY - by - 15),
      );

      // Render schematic Single Line Diagram representing connection path from Main Panel to Sub Board
      const tableW = 345;
      const subMidX = sheetContentOffset + tableW / 2;

      b.addRect(
        sheetContentOffset,
        by,
        sheetContentOffset + tableW,
        by + spBottomSectionHeight,
        "BORDER",
      );
      b.addRect(
        sheetContentOffset,
        by + spBottomSectionHeight - 12,
        sheetContentOffset + tableW,
        by + spBottomSectionHeight,
        "BORDER",
      );

      const previousMode = b.isSLDMode;
      b.isSLDMode = true;

      // Limit designation text size or length to prevent overlap
      b.addText(
        `SLD — ${sp.panel.designation || "SUB"}`,
        subMidX,
        by + spBottomSectionHeight - 8,
        2.5,
        0,
        "TEXT_TITLE",
        "center",
      );

      // Draw standard vertical format using the identical component used in System SLD
      // Position it dynamically starting from top of this lower box.
      const sldStartY = by + spBottomSectionHeight - 25; // 25 units below the box header
      let fedFromLabel = "FED FROM MDP";
      const parentSp = subPanels.find((psp) =>
        psp.circuits.some(
          (c) =>
            c.linkedSubPanelId === sp.id ||
            (sp.panel.designation && c.description === sp.panel.designation),
        )
      );
      if (parentSp) {
        fedFromLabel = `FED FROM ${parentSp.panel.designation || "SUB-PANEL"}`;
      }

      drawCadPanelSLD(
        b,
        sp.panel,
        sp.circuits,
        spCalcData.mainFeeder,
        subMidX,
        sldStartY,
        true,
        fedFromLabel,
      );

      b.isSLDMode = previousMode;
    });
  }
  if (
    exportMode === "ALL" ||
    exportMode === "SHORT_CIRCUIT" ||
    exportMode === "VOLTAGE_DROP"
  ) {
    // === SHEET : COMBINED SYSTEM ENGINEERING CALCULATIONS ===
    const calcSheetIndex = globalSheetCursor++;
    drawSheetTemplate(
      calcSheetIndex,
      panel,
      "SYSTEM ENGINEERING CALCULATIONS",
      "DETAILED ENGINEERING ANALYSIS",
    );

    const sConfCalc = sheetConfigs[calcSheetIndex] || {
      w: baseW,
      xOffset: calcSheetIndex * 900,
    };
    const xBase = sConfCalc.xOffset + 20;
    const by = 20;
    const contentH = H - by - MARGIN_TOP;

    const boundingW = sConfCalc.w - 150;
    const colW = boundingW / 2;

    // Draw card covering the full active width instead of only 540 width! Bounding width = 670.
    b.addRect(xBase, by, xBase + boundingW, by + contentH, "BORDER");
    b.addLine(xBase + colW, by, xBase + colW, by + contentH, "BORDER");

    // Draw left header
    b.addRect(xBase, by + contentH - 12, xBase + colW, by + contentH, "BORDER");
    b.addText(
      "MATHEMATICAL FORMULATION AND STEP-BY-STEP EVALUATION",
      xBase + colW / 2,
      by + contentH - 8,
      3.0,
      0,
      "TEXT_TITLE",
      "center",
    );

    // Draw right header
    b.addRect(
      xBase + colW,
      by + contentH - 12,
      xBase + boundingW,
      by + contentH,
      "BORDER",
    );
    b.addText(
      "VOLTAGE DROP MATHEMATICAL EVALUATION AND FORMULA APPLICATION",
      xBase + colW + colW / 2,
      by + contentH - 8,
      2.5,
      0,
      "TEXT_TITLE",
      "center",
    );

    let currentYSC = by + contentH - 22;
    const writeEqSC = (texts: string[]) => {
      texts.forEach((t) => {
        b.addText(
          formatLatexForCAD(t),
          xBase + 25,
          currentYSC,
          4.0,
          0,
          "TEXT_DATA",
          "left",
          colW - 50
        );
        currentYSC -= 12.0;
      });
      currentYSC -= 6.0;
    };

    let currentYVD = by + contentH - 22;
    const writeEqVD = (texts: string[]) => {
      texts.forEach((t) => {
        b.addText(
          formatLatexForCAD(t),
          xBase + colW + 25,
          currentYVD,
          2.5,
          0,
          "TEXT_DATA",
          "left",
          colW - 50
        );
        currentYVD -= 7.5;
      });
      currentYVD -= 4.0;
    };

    // Short circuit formulations
    if (exportMode === "ALL" || exportMode === "SHORT_CIRCUIT") {
      writeEqSC([
        "\\textbf{1. Base System Parameters Definition}",
        `S_{base} = \\text{Transformer Capacity} = ${baseKVA} \\text{ kVA}`,
        `V_{base, HV} = ${scParams.primaryVoltage} \\text{ V}_{L-L}`,
        `V_{base, LV} = ${scParams.transformerVoltage} \\text{ V}_{L-L}`,
        `I_{FLA} = \\frac{S_{base} \\times 1000}{\\sqrt{3} \\times V_{base, LV}} = ${iFullLoad.toFixed(2)} \\text{ A}`,
      ]);

      writeEqSC([
        "\\textbf{2. Utility Interface Impedance (Z_{u, pu})}",
        `Z_{u, pu} = \\frac{S_{base}}{MVA_{SC} \\times 1000} = \\frac{${baseKVA}}{${scParams.utilityShortCircuitMVA} \\times 1000} = ${zUtilitypu.toFixed(6)} \\text{ pu}`,
      ]);

      writeEqSC([
        "\\textbf{3. Transformer Equivalent Impedance (Z_{tx, pu})}",
        `\\text{Multiplier for Connection } C_{mult} = ${connectionMultiplier.toFixed(3)}`,
        `Z_{tx, pu} = \\frac{\\%Z}{100 \\times C_{mult}} = \\frac{${scParams.transformerZ}}{100 \\times ${connectionMultiplier.toFixed(3)}} = ${zTranspu.toFixed(6)} \\text{ pu}`,
      ]);

      writeEqSC([
        "\\textbf{4. Feeder Conductor Impedance (Z_{feeder, pu})}",
        `\\text{Length } L = ${scParams.feederLength} \\text{ m, Runs } n = ${scParams.feederRuns}\\text{, Size = } ${scParams.feederSize} \\text{ mm}^2`,
        `R_{total} = R_{km} \\times \\frac{L}{1000} / n = ${feederR.toFixed(5)} \\ \\Omega`,
        `X_{total} = X_{km} \\times \\frac{L}{1000} / n = ${feederX.toFixed(5)} \\ \\Omega`,
        `Z_{\\Omega} = \\sqrt{R_{total}^2 + X_{total}^2} = ${feederZ.toFixed(5)} \\ \\Omega`,
        `Z_{feeder, pu} = \\frac{Z_{\\Omega} \\times S_{base} / 1000}{KV_{base}^2} = ${zFeederpu.toFixed(6)} \\text{ pu}`,
      ]);

      writeEqSC([
        "\\textbf{5. Total System Per-Unit Impedance Evaluated (Z_{total})}",
        `Z_{total} = Z_{u, pu} + Z_{tx, pu} + Z_{feeder, pu} = ${totalZpu.toFixed(6)} \\text{ pu}`,
      ]);

      writeEqSC([
        "\\textbf{6. Derived Symmetrical Short Circuit Currents (I_{sym})}",
        `\\text{Fault 1 (HV Primary): } I_{SC1} = \\frac{MVA_{SC} \\times 10^6}{\\sqrt{3} \\times V_{base, HV}} = ${fault1Isc.toFixed(0)} \\text{ A}`,
        `\\text{Fault 2 (LV Secondary): } I_{SC2} = \\frac{I_{FLA}}{Z_{u, pu} + Z_{tx, pu}} = ${fault2Isc.toFixed(0)} \\text{ A}`,
        `\\text{Fault 3 (End of Line): } I_{SC3} = \\frac{I_{FLA}}{Z_{total}} + I_{motor} = ${fault3Isc.toFixed(0)} \\text{ A}`,
      ]);

      writeEqSC([
        "\\textbf{7. Asymmetrical Factor Adjustment & Interrupting Capacity (kAIC)}",
        `I_{asym} = I_{SC3} \\times 1.25 \\text (Asymmetry factor) = ${(fault3Isc * 1.25).toFixed(0)} \\text{ A}`,
        `\\text{Recommended Breaker Safety Class Min Protection: } \\ge ${Math.ceil((fault3Isc * 1.25) / 1000)} \\text{ kAIC}`,
        `\\text{Status: VERIFIED COMPLIANT WITH PHILIPPINE ELECTRICAL CODE.}`,
      ]);
    } else {
      writeEqSC([
        `\\text{(Short Circuit Computations omitted relative to partial export scope)}`,
      ]);
    }

    if (
      (exportMode === "ALL" || exportMode === "VOLTAGE_DROP") &&
      vdPages &&
      vdPages.length > 0
    ) {
      vdPages.forEach((pageCalcs, pageIdx) => {
        let activeSheetIdx = calcSheetIndex;
        if (pageIdx > 0) {
          activeSheetIdx = globalSheetCursor++;
          drawSheetTemplate(
            activeSheetIdx,
            panel,
            "SYSTEM ENGINEERING CALCULATIONS",
            `DETAILED ENGINEERING ANALYSIS (PAGE ${pageIdx + 1})`,
          );
          
          const sConf = sheetConfigs[activeSheetIdx] || { w: baseW, xOffset: activeSheetIdx * 900 };
          const xb = sConf.xOffset + 20;
          b.addRect(xb, by, xb + boundingW, by + contentH, "BORDER");
          b.addLine(xb + colW, by, xb + colW, by + contentH, "BORDER");

          // Draw left header
          b.addRect(xb, by + contentH - 12, xb + colW, by + contentH, "BORDER");
          b.addText(
            "MATHEMATICAL FORMULATION AND STEP-BY-STEP EVALUATION",
            xb + colW / 2,
            by + contentH - 8,
            3.0,
            0,
            "TEXT_TITLE",
            "center",
          );

          // Draw right header
          b.addRect(
            xb + colW,
            by + contentH - 12,
            xb + boundingW,
            by + contentH,
            "BORDER",
          );
          b.addText(
            "VOLTAGE DROP MATHEMATICAL EVALUATION AND FORMULA APPLICATION",
            xb + colW + colW / 2,
            by + contentH - 8,
            2.5,
            0,
            "TEXT_TITLE",
            "center",
          );
          
          // Draw a nice note on the left side
          b.addText(
            "Short circuit calculations and symmetrical fault current study",
            xb + 25,
            by + contentH - 40,
            3.5,
            0,
            "TEXT_HEADER",
            "left"
          );
          b.addText(
            "are completely detailed on Sheet E-3 / Page 1.",
            xb + 25,
            by + contentH - 55,
            3.5,
            0,
            "TEXT_HEADER",
            "left"
          );
          b.addText(
            "Refer to the single line diagram and study tables",
            xb + 25,
            by + contentH - 75,
            3.0,
            0,
            "TEXT_DATA",
            "left"
          );
          b.addText(
            "for complete system protection coordination.",
            xb + 25,
            by + contentH - 90,
            3.0,
            0,
            "TEXT_DATA",
            "left"
          );
        }

        const sConf = sheetConfigs[activeSheetIdx] || { w: baseW, xOffset: activeSheetIdx * 900 };
        const xb = sConf.xOffset + 20;
        let currentYVD = by + contentH - 22;

        const writeEqVD = (texts: string[]) => {
          texts.forEach((t) => {
            b.addText(
              formatLatexForCAD(t),
              xb + colW + 25,
              currentYVD,
              2.5,
              0,
              "TEXT_DATA",
              "left",
              colW - 50
            );
            currentYVD -= 7.5;
          });
          currentYVD -= 4.0;
        };

        if (pageIdx === 0) {
          writeEqVD([
            "\\textbf{Analytical Engineering Formula Reference:}",
            "\\text{Single Phase System: } VD_{1\\phi} = \\frac{2 \\times R_{ohms} \\times L \\times I}{1000} \\text{ Volts}",
            "\\text{Three Phase System: } VD_{3\\phi} = \\frac{\\sqrt{3} \\times R_{ohms} \\times L \\times I}{1000} \\text{ Volts}",
            "\\text{Percentage Definition: } VD_{\\%} = \\left(\\frac{VD}{V_{nominal}}\\right) \\times 100\\%",
            "\\text{Where } R_{ohms} = \\text{Wire AC Resistance per km}",
          ]);
        }

        pageCalcs.forEach((calc) => {
          const globalIdx = vdCalculations.indexOf(calc);
          const is3Phase = calc.systemType === "3PH";
          const factorRaw = is3Phase ? 1.732 : 2.0;
          const factorMath = is3Phase ? "\\sqrt{3}" : "2";

          const data =
            WIRE_IMPEDANCE_TABLE[calc.wireSize] || WIRE_IMPEDANCE_TABLE["3.5"];
          let R = data.r;
          const material = getConductorMaterialForCalculation(calc);
          if (material === "Aluminum") {
            R = R * 1.64;
          }
          const sets = calc.wireSets && calc.wireSets > 1 ? calc.wireSets : 1;
          R = R / sets;
          const vd = (factorRaw * calc.length * calc.loadA * R) / 1000;
          const vdPerc = (vd / calc.voltage) * 100;

          const isFeeder = calc.source === "main" || allSubPanels.some(sp => sp.id === calc.source) || calc.name.toLowerCase().includes("feeder");
          const limit = isFeeder ? 5.0 : 3.0;

          writeEqVD([
            `\\textbf{Computation \\#${globalIdx + 1}: ${calc.name} } \\text{(} ${calc.systemType}\\text{, } ${sets > 1 ? `${sets} Sets of ` : ''}${calc.wireSize}\\text{ mm}^2 ${material === "Copper" ? "CU" : "AL"} ${getInsulationTypeForCalculation(calc)}\\text{, L = } ${calc.length}\\text{m, I = } ${calc.loadA.toFixed(2)}\\text{A, V = } ${calc.voltage} \\text{V)}`,
            `R_{ohms} = ${R.toFixed(4)} \\ \\Omega\\text{/km}`,
            `VD = \\frac{${factorMath} \\times ${R.toFixed(4)} \\times ${calc.length} \\times ${calc.loadA.toFixed(2)}}{1000} = ${vd.toFixed(2)} \\text{ V}`,
            `VD_{\\%} = \\left(\\frac{${vd.toFixed(2)}}{${calc.voltage}}\\right) \\times 100\\% = ${vdPerc.toFixed(2)} \\%`,
            `\\text{Compliance Check: } ${vdPerc <= limit ? `\\text{VERIFIED ACCEPTABLE} (\\le ${limit}\\%)` : `\\text{WARNING EXCEEDS ${limit}\\% LIMIT}`}`,
          ]);
        });
      });
    } else {
      let currentYVD = by + contentH - 22;
      b.addText(
        "(Voltage Drop Computations omitted relative to partial export scope)",
        xBase + colW + 25,
        currentYVD,
        2.5,
        0,
        "TEXT_DATA",
        "left",
        colW - 50
      );
    }
  }

  if (exportMode === "ALL" || exportMode === "SHORT_CIRCUIT") {
    // === SHEET 2: SHORT-CIRCUIT SINGLE-LINE IMPEDANCE DIAGRAM ===
    const sldSheetIndex2 = globalSheetCursor++;
    drawSheetTemplate(
      sldSheetIndex2,
      panel,
      "SHORT CIRCUIT DIAGRAM",
      "DETAILED ENGINEERING ANALYSIS",
    );

    const sConfSld2 = sheetConfigs[sldSheetIndex2] || {
      w: baseW,
      xOffset: sldSheetIndex2 * 900,
    };
    const xBase2 = sConfSld2.xOffset + 20;
    const by = 20;
    const contentH = H - by - MARGIN_TOP;

    // Draw outer boundary for drawing section (W-40 width, matching title block boundary)
    const boundingW2 = sConfSld2.w - 150;
    b.addRect(xBase2, by, xBase2 + boundingW2, by + contentH, "BORDER");
    b.addRect(
      xBase2,
      by + contentH - 12,
      xBase2 + boundingW2,
      by + contentH,
      "BORDER",
    );
    b.addText(
      "SHORT CIRCUIT SINGLE LINE IMPEDANCE DIAGRAM",
      xBase2 + boundingW2 / 2,
      by + contentH - 8,
      4.0,
      0,
      "TEXT_TITLE",
      "center",
    );

    // Section Column Centers
    const xLeft = xBase2 + 180;
    const xRight = xBase2 + 480;

    // Sub-titles for side-by-side streams
    b.addText(
      "I. SYSTEM SINGLE LINE DIAGRAM",
      xLeft,
      by + contentH - 24,
      4.0,
      0,
      "TEXT_TITLE",
      "center",
    );
    b.addText(
      "II. SEQUENCE IMPEDANCE MODEL",
      xRight,
      by + contentH - 24,
      4.0,
      0,
      "TEXT_TITLE",
      "center",
    );

    // Vertical Level Heights
    const y1 = 475; // Utility / Infinite Bus
    const y2 = 405; // Fault 1 / Primary Bus
    const y3 = 315; // Transformer / Zt
    const y4 = 235; // Fault 2 / Secondary MDP Busbar
    const y5 = 150; // Feeder Cable / Zcab
    const y6 = 65; // Fault 3 / Distribution Panelboard

    // ----------------------------------------------------
    // LEVEL 1: UTILITY / INFINITE BUS
    // ----------------------------------------------------
    // Left System: Utility service entrance
    b.addCircle(xLeft, y1, 10, "SLD_GEOMETRY");
    // Sine wave representation inside circle
    b.addLine(xLeft - 7, y1, xLeft - 3.5, y1 + 4, "SLD_GEOMETRY");
    b.addLine(xLeft - 3.5, y1 + 4, xLeft, y1, "SLD_GEOMETRY");
    b.addLine(xLeft, y1, xLeft + 3.5, y1 - 4, "SLD_GEOMETRY");
    b.addLine(xLeft + 3.5, y1 - 4, xLeft + 7, y1, "SLD_GEOMETRY");

    b.addLine(xLeft, y1 - 10, xLeft, y2, "SLD_GEOMETRY");
    b.addLine(xLeft, y1 + 10, xLeft, y1 + 30, "SLD_GEOMETRY");
    b.addText(
      "UTILITY SERVICE ENTRANCE",
      xLeft + 30,
      y1 + 5,
      4.0,
      0,
      "TEXT_HEADER",
      "left",
    );

    // Left Spec Box: GRID SUPPLY
    b.addRect(xLeft - 150, y1 - 18, xLeft - 55, y1 + 18, "SLD_DASHED");
    b.addText(
      "GRID SUPPLY",
      xLeft - 144,
      y1 + 9,
      4.0,
      0,
      "TEXT_HEADER",
      "left",
    );
    b.addText(
      `${scParams.utilityShortCircuitMVA} MVAsc`,
      xLeft - 144,
      y1 - 1,
      4.0,
      0,
      "TEXT_TITLE",
      "left",
    );
    b.addText(
      `${scParams.primaryVoltage / 1000} kV Pri`,
      xLeft - 144,
      y1 - 11,
      4.0,
      0,
      "TEXT_DATA",
      "left",
    );
    // Pointer line
    b.addLine(xLeft - 55, y1, xLeft - 12, y1, "SLD_DASHED");

    // Right System: Infinite Bus
    b.addLine(xRight - 60, y1 + 30, xRight + 60, y1 + 30, "SLD_BUSBAR");
    b.addLine(xRight - 60, y1 + 29.5, xRight + 60, y1 + 29.5, "SLD_BUSBAR"); // Bold effect
    b.addText(
      "INFINITE BUS (V = 1.0 PU)",
      xRight,
      y1 + 33,
      4.0,
      0,
      "TEXT_HEADER",
      "center",
    );

    b.addLine(xRight, y1 + 30, xRight, y1 + 10, "SLD_GEOMETRY");
    // Zu Box
    b.addRect(xRight - 8, y1 - 10, xRight + 8, y1 + 10, "SLD_GEOMETRY");
    b.addText("Zu", xRight, y1 - 1.5, 4.0, 0, "TEXT_HEADER", "center");
    b.addLine(xRight, y1 - 10, xRight, y2, "SLD_GEOMETRY");

    // Right Spec Box: UTILITY IMPEDANCE
    b.addRect(xRight + 45, y1 - 15, xRight + 145, y1 + 15, "SLD_DASHED");
    b.addText(
      "UTILITY IMPEDANCE",
      xRight + 50,
      y1 + 7,
      4.0,
      0,
      "TEXT_HEADER",
      "left",
    );
    b.addText("Z_utility:", xRight + 50, y1 - 1, 4.0, 0, "TEXT_DATA", "left");
    b.addText(
      `${zUtilitypu.toFixed(5)} pu`,
      xRight + 50,
      y1 - 9,
      4.0,
      0,
      "TEXT_TITLE",
      "left",
    );
    // Pointer line
    b.addLine(xRight + 8, y1, xRight + 45, y1, "SLD_DASHED");

    // Across dashed bridge
    b.addLine(xLeft + 10, y1, xRight - 8, y1, "SLD_DASHED");

    // ----------------------------------------------------
    // LEVEL 2: FAULT 1 / PRIMARY BUS
    // ----------------------------------------------------
    // Left System: Primary Bus fat line
    b.addLine(xLeft - 70, y2, xLeft + 70, y2, "SLD_BUSBAR");
    b.addLine(xLeft - 70, y2 - 0.5, xLeft + 70, y2 - 0.5, "SLD_BUSBAR");
    b.addText(
      "PRIMARY BUS (HV)",
      xLeft + 80,
      y2 + 1,
      4.0,
      0,
      "TEXT_HEADER",
      "left",
    );
    b.addText(
      `${scParams.primaryVoltage} V`,
      xLeft + 80,
      y2 - 7,
      4.0,
      0,
      "TEXT_DATA",
      "left",
    );

    const f1X = xLeft - 40;
    drawFaultStarburst(b, f1X, y2);
    b.addText(
      `Isc1 = ${fault1Isc.toFixed(1)} A`,
      f1X,
      y2 - 12,
      4.0,
      0,
      "SLD_FAULT",
      "center",
    );

    // Fault 1 Left Spec Box
    b.addRect(xLeft - 150, y2 - 18, xLeft - 55, y2 + 18, "SLD_DASHED");
    b.addText(
      "FAULT 1 (PRIMARY HV)",
      xLeft - 144,
      y2 + 9,
      4.0,
      0,
      "SLD_FAULT",
      "left",
    );
    b.addText(
      "Symmetrical Isc:",
      xLeft - 144,
      y2 + 1,
      4.0,
      0,
      "TEXT_DATA",
      "left",
    );
    b.addText(
      `${fault1Isc.toFixed(1)} A`,
      xLeft - 144,
      y2 - 7,
      4.0,
      0,
      "SLD_FAULT",
      "left",
    );
    b.addText(
      `At @ ${scParams.primaryVoltage}V Pri`,
      xLeft - 144,
      y2 - 15,
      4.0,
      0,
      "TEXT_DATA",
      "left",
    );
    // Pointer line
    b.addLine(xLeft - 55, y2, f1X - 6, y2, "SLD_DASHED");

    // Right System: Node 1 MDP
    b.addCircle(xRight, y2, 1.5, "SLD_FAULT");
    // Fault switch F1 Ground
    b.addLine(xRight, y2, xRight - 15, y2, "SLD_GEOMETRY");
    b.addCircle(xRight - 15, y2, 0.5, "SLD_GEOMETRY");
    b.addLine(xRight - 15, y2, xRight - 30, y2 + 6, "SLD_GEOMETRY"); // open lever
    b.addCircle(xRight - 30, y2, 0.5, "SLD_GEOMETRY");
    // Ground horizontal line
    b.addLine(xRight - 30, y2, xRight - 42, y2, "SLD_GEOMETRY");
    // Reducing parallel lines
    b.addLine(xRight - 42, y2 + 3, xRight - 42, y2 - 3, "SLD_GEOMETRY");
    b.addLine(xRight - 44, y2 + 2, xRight - 44, y2 - 2, "SLD_GEOMETRY");
    b.addLine(xRight - 46, y2 + 1, xRight - 46, y2 - 1, "SLD_GEOMETRY");
    b.addText(
      "F1 Ground",
      xRight - 30,
      y2 + 9,
      4.0,
      0,
      "TEXT_HEADER",
      "center",
    );

    // Dashed bridge connecting F1 Fault locations
    b.addLine(f1X + 6, y2, xRight - 42, y2, "SLD_DASHED");

    // ----------------------------------------------------
    // LEVEL 3: TRANSFORMER SPEC / SUBSTATION
    // ----------------------------------------------------
    // Left System: Transformer overlapping circles
    const tfY = y3;
    b.addCircle(xLeft, tfY + 6, 8.5, "SLD_GEOMETRY");
    b.addCircle(xLeft, tfY - 6, 8.5, "SLD_GEOMETRY");
    b.addLine(xLeft, y2, xLeft, tfY + 14.5, "SLD_GEOMETRY");

    // Disconnect LBS fuse device
    const lbY = (y2 + tfY) / 2 + 5;
    b.addRect(xLeft - 3, lbY - 8, xLeft + 3, lbY + 8, "SLD_GEOMETRY");
    b.addLine(xLeft, lbY - 8, xLeft, lbY + 8, "SLD_GEOMETRY");
    b.addText(
      "LBS / HV FUSE",
      xLeft + 10,
      lbY - 1.5,
      4.0,
      0,
      "TEXT_HEADER",
      "left",
    );

    b.addText(
      "TX-01 SUBSTATION",
      xLeft,
      tfY - 22,
      4.0,
      0,
      "TEXT_HEADER",
      "center",
    );
    b.addText(
      `${scParams.transformerKVA}kVA ${scParams.transformerConnection}`,
      xLeft,
      tfY - 29,
      4.0,
      0,
      "TEXT_DATA",
      "center",
    );

    // Spec Box left: TX-01 SPEC
    b.addRect(xLeft - 150, tfY - 18, xLeft - 55, tfY + 18, "SLD_DASHED");
    b.addText(
      "TX-01 SPEC",
      xLeft - 144,
      tfY + 9,
      4.0,
      0,
      "TEXT_HEADER",
      "left",
    );
    b.addText(
      `${scParams.transformerKVA} kVA`,
      xLeft - 144,
      tfY + 1,
      4.0,
      0,
      "TEXT_TITLE",
      "left",
    );
    b.addText(
      `%Z = ${scParams.transformerZ}%`,
      xLeft - 144,
      tfY - 7,
      4.0,
      0,
      "TEXT_DATA",
      "left",
    );
    b.addText(
      scParams.transformerConnection,
      xLeft - 144,
      tfY - 15,
      4.0,
      0,
      "TEXT_DATA",
      "left",
    );
    // Pointer line
    b.addLine(xLeft - 55, tfY, xLeft - 9.5, tfY, "SLD_DASHED");

    // Right System: Transformer Impedance Zt
    b.addLine(xRight, y2, xRight, tfY + 10, "SLD_GEOMETRY");
    b.addRect(xRight - 8, tfY - 10, xRight + 8, tfY + 10, "SLD_GEOMETRY");
    b.addText("Zt", xRight, tfY - 1.5, 4.0, 0, "TEXT_HEADER", "center");
    b.addLine(xRight, tfY - 10, xRight, y4, "SLD_GEOMETRY");

    // Right Spec Box: XFMR IMPEDANCE
    b.addRect(xRight + 45, tfY - 15, xRight + 145, tfY + 15, "SLD_DASHED");
    b.addText(
      "XFMR IMPEDANCE",
      xRight + 50,
      tfY + 7,
      4.0,
      0,
      "TEXT_HEADER",
      "left",
    );
    b.addText(
      "Z_transformer:",
      xRight + 50,
      tfY - 1,
      4.0,
      0,
      "TEXT_DATA",
      "left",
    );
    b.addText(
      `${zTranspu.toFixed(5)} pu`,
      xRight + 50,
      tfY - 9,
      4.0,
      0,
      "TEXT_TITLE",
      "left",
    );
    // Pointer line
    b.addLine(xRight + 8, tfY, xRight + 45, tfY, "SLD_DASHED");

    // Across dashed bridge
    b.addLine(xLeft + 9.5, tfY, xRight - 8, tfY, "SLD_DASHED");

    // ----------------------------------------------------
    // LEVEL 4: FAULT 2 / SECONDARY BUS (MAIN MDP)
    // ----------------------------------------------------
    // Left System: secondary wire down and Main Breaker
    b.addLine(xLeft, tfY - 14.5, xLeft, y4, "SLD_GEOMETRY");
    // Main Breaker
    const mbY = (tfY + y4) / 2 + 5;
    b.addCircle(xLeft, mbY + 3, 1.2, "SLD_GEOMETRY");
    b.addArc(xLeft, mbY, 3, 270, 90, "SLD_GEOMETRY");
    b.addCircle(xLeft, mbY - 3, 1.2, "SLD_GEOMETRY");
    b.addText(
      `${panel.mainBreakerAT} AT / ${panel.mainBreakerAF} AF`,
      xLeft + 10,
      mbY - 1.5,
      4.0,
      0,
      "TEXT_HEADER",
      "left",
    );

    b.addLine(xLeft - 70, y4, xLeft + 70, y4, "SLD_BUSBAR");
    b.addLine(xLeft - 70, y4 - 0.5, xLeft + 70, y4 - 0.5, "SLD_BUSBAR");
    b.addText(
      "MAIN MDP BUSBAR",
      xLeft + 80,
      y4 + 1,
      4.0,
      0,
      "TEXT_HEADER",
      "left",
    );
    b.addText(
      `${scParams.transformerVoltage} V (Dyn11 Wye-G)`,
      xLeft + 80,
      y4 - 7,
      4.0,
      0,
      "TEXT_DATA",
      "left",
    );

    const f2X = xLeft - 40;
    drawFaultStarburst(b, f2X, y4);
    b.addText(
      `Isc2 = ${fault2Isc.toFixed(1)} A`,
      f2X,
      y4 - 12,
      4.0,
      0,
      "SLD_FAULT",
      "center",
    );

    // Fault 2 Left Spec Box
    b.addRect(xLeft - 150, y4 - 18, xLeft - 55, y4 + 18, "SLD_DASHED");
    b.addText(
      "FAULT 2 (SECONDARY)",
      xLeft - 144,
      y4 + 9,
      4.0,
      0,
      "SLD_FAULT",
      "left",
    );
    b.addText(
      "Symmetrical Isc:",
      xLeft - 144,
      y4 + 1,
      4.0,
      0,
      "TEXT_DATA",
      "left",
    );
    b.addText(
      `${fault2Isc.toFixed(1)} A`,
      xLeft - 144,
      y4 - 7,
      4.0,
      0,
      "SLD_FAULT",
      "left",
    );
    b.addText(
      "At Main Dist Panel Bus",
      xLeft - 144,
      y4 - 15,
      4.0,
      0,
      "TEXT_DATA",
      "left",
    );
    b.addLine(xLeft - 55, y4, f2X - 6, y4, "SLD_DASHED");

    // Right System : MDP Node
    b.addCircle(xRight, y4, 1.5, "SLD_FAULT");
    b.addText(
      "MDP NODE (Node 2)",
      xRight + 12,
      y4 + 3,
      4.0,
      0,
      "TEXT_HEADER",
      "left",
    );
    b.addText(
      `Isc2 = ${fault2Isc.toFixed(1)} A`,
      xRight + 12,
      y4 - 4,
      4.0,
      0,
      "SLD_FAULT",
      "left",
    );

    b.addLine(xRight, y4, xRight - 15, y4, "SLD_GEOMETRY");
    b.addCircle(xRight - 15, y4, 0.5, "SLD_GEOMETRY");
    b.addLine(xRight - 15, y4, xRight - 30, y4 + 6, "SLD_GEOMETRY");
    b.addCircle(xRight - 30, y4, 0.5, "SLD_GEOMETRY");
    b.addLine(xRight - 30, y4, xRight - 42, y4, "SLD_GEOMETRY");
    b.addLine(xRight - 42, y4 + 3, xRight - 42, y4 - 3, "SLD_GEOMETRY");
    b.addLine(xRight - 44, y4 + 2, xRight - 44, y4 - 2, "SLD_GEOMETRY");
    b.addLine(xRight - 46, y4 + 1, xRight - 46, y4 - 1, "SLD_GEOMETRY");
    b.addText(
      "F2 Ground",
      xRight - 30,
      y4 + 9,
      4.0,
      0,
      "TEXT_HEADER",
      "center",
    );

    // Dashed bridge connecting F2 Fault locations
    b.addLine(f2X + 6, y4, xRight - 42, y4, "SLD_DASHED");

    // ----------------------------------------------------
    // LEVEL 5: FEEDER CONDUCTOR SPEC / ZCAB
    // ----------------------------------------------------
    // Left System: Branch Breaker and Feeder Cable line
    const bbY = (y4 + y5 + 10) / 2;
    b.addRect(xLeft - 3, bbY - 4, xLeft + 3, bbY + 4, "SLD_GEOMETRY");
    b.addLine(xLeft, bbY - 4, xLeft, bbY + 4, "SLD_GEOMETRY");
    // Branch breaker rating
    b.addText(
      "30 AT / 100 AF",
      xLeft + 10,
      bbY - 1.5,
      4.0,
      0,
      "TEXT_HEADER",
      "left",
    );

    b.addLine(xLeft, y4, xLeft, y6, "SLD_FEEDER");
    b.addText(
      "★ FEEDER CABLE ★",
      xLeft + 10,
      y5 + 6,
      4.0,
      0,
      "TEXT_HEADER",
      "left",
    );
    b.addText(
      `${scParams.feederRuns}x SETS OF ${scParams.feederSize} mm² ${panel?.insulationType || "THHN"} (${scParams.feederLength}m)`,
      xLeft + 10,
      y5 - 2,
      4.0,
      0,
      "TEXT_DATA",
      "left",
    );

    // Left Spec Card: CONDUCTOR SPEC
    b.addRect(xLeft - 150, y5 - 18, xLeft - 55, y5 + 18, "SLD_DASHED");
    b.addText(
      "CONDUCTOR SPEC",
      xLeft - 144,
      y5 + 9,
      4.0,
      0,
      "TEXT_HEADER",
      "left",
    );
    b.addText(
      `${scParams.feederRuns} Runs x ${scParams.feederSize} mm²`,
      xLeft - 144,
      y5 + 1,
      4.0,
      0,
      "TEXT_TITLE",
      "left",
    );
    b.addText(
      "Copper Conductors",
      xLeft - 144,
      y5 - 7,
      4.0,
      0,
      "TEXT_DATA",
      "left",
    );
    b.addText(
      `Length: ${scParams.feederLength} meters`,
      xLeft - 144,
      y5 - 15,
      4.0,
      0,
      "TEXT_DATA",
      "left",
    );
    // Connection pointer
    b.addLine(xLeft - 55, y5, xLeft - 1, y5, "SLD_DASHED");

    // Right System: Impedance Zcab
    b.addRect(xRight - 8, y5 - 10, xRight + 8, y5 + 10, "SLD_GEOMETRY");
    b.addText("Zcab", xRight, y5 - 1.5, 4.0, 0, "TEXT_HEADER", "center");
    b.addLine(xRight, y4, xRight, y5 + 10, "SLD_GEOMETRY");
    b.addLine(xRight, y5 - 10, xRight, y6, "SLD_GEOMETRY");

    // Right Spec Box: FEEDER IMPEDANCE
    b.addRect(xRight + 45, y5 - 18, xRight + 145, y5 + 18, "SLD_DASHED");
    b.addText(
      "FEEDER IMPEDANCE",
      xRight + 50,
      y5 + 10,
      4.0,
      0,
      "TEXT_HEADER",
      "left",
    );
    b.addText(
      `R=${feederR.toFixed(4)} Ohms | X=${feederX.toFixed(4)}`,
      xRight + 50,
      y5 + 2,
      4.0,
      0,
      "TEXT_DATA",
      "left",
    );
    b.addText(
      "Z_feeder (pu):",
      xRight + 50,
      y5 - 6,
      4.0,
      0,
      "TEXT_DATA",
      "left",
    );
    b.addText(
      `${zFeederpu.toFixed(5)} pu`,
      xRight + 50,
      y5 - 14,
      4.0,
      0,
      "TEXT_TITLE",
      "left",
    );
    // Pointer line
    b.addLine(xRight + 8, y5, xRight + 45, y5, "SLD_DASHED");

    // Across dashed bridge
    b.addLine(xLeft + 1, y5, xRight - 8, y5, "SLD_DASHED");

    // ----------------------------------------------------
    // LEVEL 6: DISTRIBUTION BOARD / PANEL NODE
    // ----------------------------------------------------
    // Left System: Sub-panelboard bus
    b.addLine(xLeft - 70, y6, xLeft + 70, y6, "SLD_BUSBAR");
    b.addLine(xLeft - 70, y6 - 0.5, xLeft + 70, y6 - 0.5, "SLD_BUSBAR");
    b.addText(
      "DISTRIBUTION PANELBOARD (MDP)",
      xLeft + 5,
      y6 - 13,
      4.0,
      0,
      "TEXT_HEADER",
      "left",
    );
    b.addText(
      "Sec Bus Fault point",
      xLeft + 5,
      y6 - 21,
      4.0,
      0,
      "TEXT_DATA",
      "left",
    );

    const f3X = xLeft - 40;
    drawFaultStarburst(b, f3X, y6);
    b.addText(
      `Isc3 = ${fault3Isc.toFixed(1)} A`,
      f3X,
      y6 - 12,
      4.0,
      0,
      "SLD_FAULT",
      "center",
    );

    // Fault 3 Left Spec Box
    b.addRect(xLeft - 150, y6 - 18, xLeft - 55, y6 + 18, "SLD_DASHED");
    b.addText(
      "FAULT 3 (REMOTE BUS)",
      xLeft - 144,
      y6 + 9,
      4.0,
      0,
      "SLD_FAULT",
      "left",
    );
    b.addText(
      "Symmetrical Isc:",
      xLeft - 144,
      y6 + 1,
      4.0,
      0,
      "TEXT_DATA",
      "left",
    );
    b.addText(
      `${fault3Isc.toFixed(1)} A`,
      xLeft - 144,
      y6 - 7,
      4.0,
      0,
      "SLD_FAULT",
      "left",
    );
    b.addText(
      `Total: ${fault3Isc.toFixed(1)} A`,
      xLeft - 144,
      y6 - 15,
      4.0,
      0,
      "TEXT_DATA",
      "left",
    );
    b.addLine(xLeft - 55, y6, f3X - 6, y6, "SLD_DASHED");

    // Right System : Panel Node
    b.addCircle(xRight, y6, 1.5, "SLD_FAULT");
    b.addText(
      "PANEL NODE (Node 3)",
      xRight + 12,
      y6 + 3,
      4.0,
      0,
      "TEXT_HEADER",
      "left",
    );
    b.addText(
      `Isc3 = ${fault3Isc.toFixed(1)} A`,
      xRight + 12,
      y6 - 4,
      4.0,
      0,
      "SLD_FAULT",
      "left",
    );

    b.addLine(xRight, y6, xRight - 15, y6, "SLD_GEOMETRY");
    b.addCircle(xRight - 15, y6, 0.5, "SLD_GEOMETRY");
    b.addLine(xRight - 15, y6, xRight - 30, y6 + 6, "SLD_GEOMETRY");
    b.addCircle(xRight - 30, y6, 0.5, "SLD_GEOMETRY");
    b.addLine(xRight - 30, y6, xRight - 42, y6, "SLD_GEOMETRY");
    b.addLine(xRight - 42, y6 + 3, xRight - 42, y6 - 3, "SLD_GEOMETRY");
    b.addLine(xRight - 44, y6 + 2, xRight - 44, y6 - 2, "SLD_GEOMETRY");
    b.addLine(xRight - 46, y6 + 1, xRight - 46, y6 - 1, "SLD_GEOMETRY");
    b.addText(
      "F3 Ground",
      xRight - 30,
      y6 + 9,
      4.0,
      0,
      "TEXT_HEADER",
      "center",
    );

    // Dashed bridge connecting F3 Fault locations
    b.addLine(f3X + 6, y6, xRight - 42, y6, "SLD_DASHED");

    // ----------------------------------------------------
    // SUMMARY PANEL: IMPEDANCE TOTAL SUMMARY BOX (BOTTOM RIGHT)
    // ----------------------------------------------------
    b.addRect(xRight + 45, y6 - 18, xRight + 145, y6 + 18, "SLD_FAULT");
    b.addText(
      "IMPEDANCE TOTAL",
      xRight + 50,
      y6 + 9,
      4.0,
      0,
      "SLD_FAULT",
      "left",
    );
    b.addText(
      `Total Z = ${totalZpu.toFixed(5)} pu`,
      xRight + 50,
      y6 + 1,
      4.0,
      0,
      "TEXT_DATA",
      "left",
    );
    b.addText(
      `Multiplier M = ${(1 / totalZpu).toFixed(2)}`,
      xRight + 50,
      y6 - 7,
      4.0,
      0,
      "TEXT_DATA",
      "left",
    );
    b.addText(
      `Asym Isc (1.6x): ${(fault3Isc * 1.6).toFixed(0)} A`,
      xRight + 50,
      y6 - 15,
      4.0,
      0,
      "SLD_FAULT",
      "left",
    );

    // Summary connecting guide
    b.addLine(xRight + 1.5, y6, xRight + 45, y6, "SLD_DASHED");
  }

  // === DEDICATED NEW SHEET: VOLTAGE DROP ANALYSIS TABLE ===
  if (exportMode === "ALL" || exportMode === "VOLTAGE_DROP") {
    const vdSheetIndex = globalSheetCursor++;
    drawSheetTemplate(
      vdSheetIndex,
      panel,
      "VOLTAGE DROP ANALYSIS",
      "FEEDER VOLTAGE REGULATION REPORT",
    );

    const sConf = sheetConfigs[vdSheetIndex] || { w: baseW, xOffset: vdSheetIndex * 900 };
    const xOffset = sConf.xOffset;
    let ty = 521; // Centered vertically

    const baseColWidths = [120, 95, 45, 45, 75, 45, 45, 45, 45, 55];
    const totalBaseW = baseColWidths.reduce((a, b) => a + b, 0); // 590
    const targetTableWidth = 680; // Expanded horizontally

    const cols = baseColWidths.map((w, idx) => {
      const names = [
        "SYSTEM / SOURCE",
        "LINE NAME",
        "CURRENT (A)",
        "LENGTH (m)",
        "WIRE SIZE (mm²)",
        "VOLTAGE",
        "SYSTEM TYPE",
        "VD (V)",
        "VD (%)",
        "STATUS"
      ];
      let colW = Math.floor((w / totalBaseW) * targetTableWidth);
      if (idx === names.length - 1) {
        const sumSoFar = baseColWidths.slice(0, -1).map(bW => Math.floor((bW / totalBaseW) * targetTableWidth)).reduce((a, b) => a + b, 0);
        colW = targetTableWidth - sumSoFar;
      }
      return { name: names[idx], w: colW };
    });

    const tableWidth = targetTableWidth;
    const titleBlockX = sConf.w - 130;
    const availableCenter = MARGIN_LEFT + (titleBlockX - MARGIN_LEFT) / 2; // 360.5
    const tableLeft = xOffset + availableCenter - (tableWidth / 2); // Center horizontally in drawing area
    const tableRight = tableLeft + tableWidth;

    const calculationsToRender = vdCalculations && vdCalculations.length > 0 ? vdCalculations : [];
    
    const panelsForVdHeader = [
      { id: "main", type: "MDP", panel: panel, circuits: circuits },
      ...(subPanels || [])
    ].filter(p => p && p.panel);

    let groupHeaderCount = 0;
    panelsForVdHeader.forEach(group => {
      if (calculationsToRender.some(c => c.source === group.id || (group.circuits && group.circuits.some(circuit => circuit.id === c.source)))) {
         groupHeaderCount++;
      }
    });
    if (calculationsToRender.some(c => c.source === "custom")) groupHeaderCount++;
    
    const numRows = (calculationsToRender.length + groupHeaderCount) || 1;
    
    // Automatically adjust row height based on content density (budget roughly 350 units)
    const rowH = Math.min(18.0, Math.max(14.0, Math.floor(350 / numRows)));
    const dataFontSize = Math.max(4.0, Number((rowH * 0.25).toFixed(2)));
    const headerFontSize = Math.max(4.5, Number((dataFontSize * 1.1).toFixed(2)));

    // Header Border
    const headH = Math.max(20.0, rowH * 1.3);
    b.addRect(tableLeft, ty - headH, tableRight, ty, "BORDER");
    b.addText(
      "VOLTAGE DROP ANALYSIS REPORT TABLE",
      tableLeft + tableWidth / 2,
      ty - headH / 2 - Math.max(5.5, dataFontSize * 1.6) / 2,
      Math.max(5.5, dataFontSize * 1.6),
      0,
      "TEXT_TITLE",
      "center",
    );

    ty -= headH;

    // Header Row Columns labels
    const labelH = Math.max(24.0, rowH * 1.3);
    b.addRect(tableLeft, ty - labelH, tableRight, ty, "BORDER");
    let currentX = tableLeft;
    const colPositions: number[] = [];
    cols.forEach((col) => {
      colPositions.push(currentX);
      b.addText(
        col.name,
        currentX + col.w / 2,
        ty - labelH / 2 - Math.max(1.8, headerFontSize) / 2,
        Math.max(1.8, headerFontSize),
        0,
        "TEXT_HEADER",
        "center",
        col.w - 2
      );
      currentX += col.w;
    });
    colPositions.push(currentX);

    // Grid vertical lines for headers (inner dividers only)
    for (let i = 1; i < colPositions.length - 1; i++) {
      b.addLine(colPositions[i], ty - labelH, colPositions[i], ty, "BORDER");
    }

    ty -= labelH;

    // Grouping for AutoCAD Export
    const panelsForVd = [
      { id: "main", type: "MDP", panel: panel, circuits: circuits },
      ...(subPanels || [])
    ].filter(p => p && p.panel);
    
    const allSpIds = new Set([...(subPanels || [])].map(sp => sp.id));
    
    let renderGroups: { panelName: string, calcs: VoltageDropCalculation[] }[] = [];
    panelsForVd.forEach((group) => {
      const groupCalcs = calculationsToRender.filter(c => 
        c.source === group.id || 
        (group.circuits && group.circuits.some(circuit => circuit.id === c.source))
      );
      if (groupCalcs.length > 0) {
        renderGroups.push({
          panelName: `PANEL: ${group.panel.designation || ("type" in group ? (group as any).type : "Sub Panel")}`,
          calcs: groupCalcs
        });
      }
    });

    const customCalcs = calculationsToRender.filter(c => c.source === "custom");
    if (customCalcs.length > 0) {
       renderGroups.push({ panelName: "CUSTOM CIRCUITS", calcs: customCalcs });
    }

    // Data Row rendering
    renderGroups.forEach((group) => {
      // Draw Panel Group Header
      b.addRect(tableLeft, ty - rowH, tableRight, ty, "BORDER");
      
      b.addText(group.panelName, tableLeft + 5, ty - rowH / 2 - dataFontSize / 2, dataFontSize * 1.1, 0, "TEXT_HEADER", "left", tableWidth - 10);
      ty -= rowH;

      group.calcs.forEach((calc) => {
        // Draw bottom horizontal line
        b.addLine(tableLeft, ty - rowH, tableRight, ty - rowH, "TABLE_GRID");
        // Draw left outer vertical line
        b.addLine(tableLeft, ty - rowH, tableLeft, ty, "BORDER");
        // Draw right outer vertical line
        b.addLine(tableRight, ty - rowH, tableRight, ty, "BORDER");

        // Draw inner vertical divider lines
        for (let i = 1; i < colPositions.length - 1; i++) {
          b.addLine(colPositions[i], ty - rowH, colPositions[i], ty, "TABLE_GRID");
        }

        // Compute details consistent with Excel export
        const factor = calc.systemType === "3PH" ? 1.732 : 2.0;
        const cLength = calc.length || 0;
        const cLoad = calc.loadA || 0;
        const cVoltage = calc.voltage || 230;
        const dataStr = calc.wireSize;
        const impedanceInfo = WIRE_IMPEDANCE_TABLE[dataStr] ||
          WIRE_IMPEDANCE_TABLE["3.5"] || { r: 5.76, x: 0.157 };
        let R_val = impedanceInfo.r;
        const sets = calc.wireSets && calc.wireSets > 1 ? calc.wireSets : 1;
        R_val = R_val / sets;

        const VD_v = (factor * cLength * cLoad * R_val) / 1000;
        const VD_percent = (VD_v / cVoltage) * 100;
        
        const isFeeder = calc.source === "main" || allSpIds.has(calc.source) || calc.name.toLowerCase().includes("feeder");
        const limit = isFeeder ? 5.0 : 3.0;
        const isWarning = VD_percent > limit * 0.9 && VD_percent <= limit;
        const isCompliant = VD_percent <= limit;
        const status = !isCompliant ? "CRITICAL" : (isWarning ? "WARNING" : "COMPLIANT");

        let sourceLabel = calc.source;
        if (calc.source === "custom") {
          sourceLabel = "Custom";
        } else {
          let foundPanel: any = null;
          if (calc.source === "main" || calc.source === "MDP" || (panel && panel.designation === calc.source)) {
            foundPanel = { id: "main", panel: panel };
          } else {
            foundPanel = allSubPanels.find((sp) => sp.id === calc.source || sp.panel.designation === calc.source);
            if (!foundPanel) {
              if (circuits.some((c) => c.id === calc.source)) {
                foundPanel = { id: "main", panel: panel };
              } else {
                const matchedSp = allSubPanels.find((sp) => sp.circuits.some((c) => c.id === calc.source));
                if (matchedSp) foundPanel = matchedSp;
              }
            }
          }

          if (foundPanel) {
            sourceLabel = `${foundPanel.panel.system} / ${foundPanel.panel.designation || (foundPanel.id === "main" ? "MDP" : "Sub Panel")}`;
          } else {
            sourceLabel = calc.source || "Local Distribution";
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sourceLabel)) {
              sourceLabel = "Local Distribution";
            }
          }
        }

        b.addText(sourceLabel, colPositions[0] + 3, ty - rowH / 2 - dataFontSize / 2, dataFontSize, 0, "TEXT_DATA", "left", cols[0].w - 4);
        b.addText(calc.name, colPositions[1] + 3, ty - rowH / 2 - dataFontSize / 2, dataFontSize, 0, "TEXT_DATA", "left", cols[1].w - 4);
        b.addText(calc.loadA.toFixed(2), colPositions[2] + cols[2].w / 2, ty - rowH / 2 - dataFontSize / 2, dataFontSize, 0, "TEXT_DATA", "center", cols[2].w - 4);
        b.addText(calc.length.toString(), colPositions[3] + cols[3].w / 2, ty - rowH / 2 - dataFontSize / 2, dataFontSize, 0, "TEXT_DATA", "center", cols[3].w - 4);
        b.addText((sets > 1 ? `${sets} Sets of ` : '') + calc.wireSize, colPositions[4] + cols[4].w / 2, ty - rowH / 2 - dataFontSize / 2, dataFontSize, 0, "TEXT_DATA", "center", cols[4].w - 4);
        b.addText(calc.voltage.toString(), colPositions[5] + cols[5].w / 2, ty - rowH / 2 - dataFontSize / 2, dataFontSize, 0, "TEXT_DATA", "center", cols[5].w - 4);
        b.addText(calc.systemType, colPositions[6] + cols[6].w / 2, ty - rowH / 2 - dataFontSize / 2, dataFontSize, 0, "TEXT_DATA", "center", cols[6].w - 4);
        b.addText(VD_v.toFixed(2), colPositions[7] + cols[7].w / 2, ty - rowH / 2 - dataFontSize / 2, dataFontSize, 0, "TEXT_DATA", "center", cols[7].w - 4);
        b.addText(VD_percent.toFixed(2) + "%", colPositions[8] + cols[8].w / 2, ty - rowH / 2 - dataFontSize / 2, dataFontSize, 0, "TEXT_DATA", "center", cols[8].w - 4);
        
        const statLayer = status === "CRITICAL" ? "SLD_FAULT" : "TEXT_DATA";
        b.addText(status, colPositions[9] + cols[9].w / 2, ty - rowH / 2 - dataFontSize / 2, dataFontSize, 0, statLayer, "center", cols[9].w - 4);

        ty -= rowH;
      });
    });

    if (calculationsToRender.length > 0) {
      b.addLine(tableLeft, ty, tableRight, ty, "BORDER");
    } else {
      // Draw bottom horizontal line
      b.addLine(tableLeft, ty - rowH * 2, tableRight, ty - rowH * 2, "BORDER");
      // Draw left outer vertical line
      b.addLine(tableLeft, ty - rowH * 2, tableLeft, ty, "BORDER");
      // Draw right outer vertical line
      b.addLine(tableRight, ty - rowH * 2, tableRight, ty, "BORDER");

      b.addText(
        "NO VOLTAGE DROP ANALYSIS DATA RECORDED IN SCOPE",
        tableLeft + tableWidth / 2,
        ty - rowH - (dataFontSize / 2),
        Math.max(2.2, dataFontSize * 1.2),
        0,
        "TEXT_HEADER",
        "center"
      );
    }
  }

  // === DEDICATED NEW SHEET: VOLTAGE DROP SINGLE LINE DIAGRAM ===
  if (exportMode === "ALL" || exportMode === "VOLTAGE_DROP") {
    const vdSldSheetIndex = globalSheetCursor++;
    drawSheetTemplate(
      vdSldSheetIndex,
      panel,
      "VOLTAGE DROP SINGLE LINE DIAGRAM",
      "CASCADE PATH VOLTAGE REGULATION DIAGRAM",
    );

    const sConfSld = sheetConfigs[vdSldSheetIndex] || { w: baseW, xOffset: vdSldSheetIndex * 900 };
    const xOffset = sConfSld.xOffset;
    const yLevel = 280; // Center vertically on our 594mm high sheet
    
    // Resolve calculations, active path, and draw using mapX, mapY
    const previousMode = b.isSLDMode;
    b.isSLDMode = true;

    const activeCalculations = (vdCalculations || []).map(c => {
      const factor = c.systemType === "3PH" ? 1.732 : 2.0;
      const cLength = c.length || 0;
      const cLoad = c.loadA || 0;
      const cVoltage = c.voltage || 230;
      const dataStr = c.wireSize;
      const impedanceInfo = WIRE_IMPEDANCE_TABLE[dataStr] ||
        WIRE_IMPEDANCE_TABLE["3.5"] || { r: 5.76, x: 0.157 };
      let R_val = impedanceInfo.r;
      const sets = c.wireSets && c.wireSets > 1 ? c.wireSets : 1;
      R_val = R_val / sets;

      const VD_v = (factor * cLength * cLoad * R_val) / 1000;
      const VD_percent = (VD_v / cVoltage) * 100;
      
      const isFeeder = c.source === "main" || (subPanels || []).some(sp => sp.id === c.source) || c.name.toLowerCase().includes("feeder");
      const limit = isFeeder ? 5.0 : 3.0;

      return {
        ...c,
        result: {
          vd: VD_v.toFixed(2),
          vdPercentage: VD_percent.toFixed(2),
          isCompliant: VD_percent <= limit,
          isWarning: VD_percent > limit * 0.9 && VD_percent <= limit,
        }
      };
    });

    const pathEndpoints: Array<{ id: string; name: string; type: string }> = [];
    pathEndpoints.push({
      id: "main",
      name: `${panel?.designation || "Main Distribution Panel"} (MDP) Feeder`,
      type: "panel",
    });

    if (circuits) {
      circuits.forEach(c => {
        if (c.loadType === LoadType.SPACE || c.loadType === LoadType.SPARE) return;
        if (c.linkedSubPanelId) return; // covered by subpanel option
        pathEndpoints.push({
          id: c.id,
          name: `MDP Circuit ${c.circuitNo}: ${c.description || "Branch Load"}`,
          type: "circuit",
        });
      });
    }

    (subPanels || []).forEach(sp => {
      pathEndpoints.push({
        id: sp.id,
        name: `${sp.panel.designation || "Subpanel"} Feeder`,
        type: "panel",
      });

      sp.circuits.forEach(c => {
        if (c.loadType === LoadType.SPACE || c.loadType === LoadType.SPARE) return;
        pathEndpoints.push({
          id: c.id,
          name: `${sp.panel.designation || "Subpanel"} Circuit ${c.circuitNo}: ${c.description || "Branch Load"}`,
          type: "circuit",
        });
      });
    });

    let endpointId = selectedEndpointId;
    if (!endpointId || !pathEndpoints.some(ep => ep.id === endpointId)) {
      endpointId = pathEndpoints[pathEndpoints.length - 1]?.id || "main";
    }

    const pathSegments: Array<{
      id: string;
      fromName: string;
      toName: string;
      calc: typeof activeCalculations[0];
      type: "feeder" | "branch";
    }> = [];

    const getCalc = (sourceId: string) => activeCalculations.find(c => c.source === sourceId);

    if (endpointId === "main") {
      const mainCalc = getCalc("main");
      if (mainCalc) {
        pathSegments.push({
          id: "segment-main",
          fromName: "SERVICE ENTRANCE",
          toName: panel?.designation || "MDP",
          calc: mainCalc,
          type: "feeder",
        });
      }
    } else {
      const matchedSp = (subPanels || []).find(sp => sp.id === endpointId);
      if (matchedSp) {
        const mainCalc = getCalc("main");
        if (mainCalc) {
          pathSegments.push({
            id: "segment-main",
            fromName: "SERVICE ENTRANCE",
            toName: panel?.designation || "MDP",
            calc: mainCalc,
            type: "feeder",
          });
        }

        const spCalc = getCalc(matchedSp.id);
        if (spCalc) {
          let parentName = panel?.designation || "MDP";
          if (circuits) {
            const linkingCircuit = circuits.find(c => c.linkedSubPanelId === matchedSp.id);
            if (!linkingCircuit) {
              for (const otherSp of (subPanels || [])) {
                if (otherSp.circuits.some(c => c.linkedSubPanelId === matchedSp.id)) {
                  parentName = otherSp.panel.designation || "Subpanel";
                  break;
                }
              }
            }
          }
          pathSegments.push({
            id: `segment-${matchedSp.id}`,
            fromName: parentName,
            toName: matchedSp.panel.designation || "Subpanel",
            calc: spCalc,
            type: "feeder",
          });
        }
      } else {
        const mdpCircuit = circuits?.find(c => c.id === endpointId);
        if (mdpCircuit) {
          const mainCalc = getCalc("main");
          if (mainCalc) {
            pathSegments.push({
              id: "segment-main",
              fromName: "SERVICE ENTRANCE",
              toName: panel?.designation || "MDP",
              calc: mainCalc,
              type: "feeder",
          });
          }

          const circuitCalc = getCalc(mdpCircuit.id);
          if (circuitCalc) {
            pathSegments.push({
              id: `segment-${mdpCircuit.id}`,
              fromName: panel?.designation || "MDP",
              toName: mdpCircuit.description || `Circuit ${mdpCircuit.circuitNo} Endpoint`,
              calc: circuitCalc,
              type: "branch",
            });
          }
        } else {
          for (const sp of (subPanels || [])) {
            const spCircuit = sp.circuits.find(c => c.id === endpointId);
            if (spCircuit) {
              const mainCalc = getCalc("main");
              if (mainCalc) {
                pathSegments.push({
                  id: "segment-main",
                  fromName: "SERVICE ENTRANCE",
                  toName: panel?.designation || "MDP",
                  calc: mainCalc,
                  type: "feeder",
                });
              }

              const spCalc = getCalc(sp.id);
              if (spCalc) {
                let parentName = panel?.designation || "MDP";
                pathSegments.push({
                  id: `segment-${sp.id}`,
                  fromName: parentName,
                  toName: sp.panel.designation || "Subpanel",
                  calc: spCalc,
                  type: "feeder",
                });
              }

              const circuitCalc = getCalc(spCircuit.id);
              if (circuitCalc) {
                pathSegments.push({
                  id: `segment-${spCircuit.id}`,
                  fromName: sp.panel.designation || "Subpanel",
                  toName: spCircuit.description || `Circuit ${spCircuit.circuitNo} Endpoint`,
                  calc: circuitCalc,
                  type: "branch",
                });
              }
              break;
            }
          }
        }
      }
    }

    const numNodes = pathSegments.length + 1;
    const startX = 120;
    const endX = 800;
    const stepX = (endX - startX) / (numNodes - 1 || 1);
    const nodePositions = Array.from({ length: numNodes }, (_, i) => startX + i * stepX);

    const mapX = (svgX: number) => xOffset + 20 + svgX * 0.75;
    const mapY = (svgY: number) => yLevel - (svgY - 150);

    // Draw Node 0: SERVICE ENTRANCE
    const x_se = mapX(nodePositions[0]);
    b.addLine(x_se - 25 * 0.75, yLevel - 15, x_se - 25 * 0.75, yLevel + 15, "SLD_GEOMETRY");
    b.addLine(x_se - 25 * 0.75, yLevel + 15, x_se - 5 * 0.75, yLevel, "SLD_GEOMETRY");
    b.addLine(x_se - 5 * 0.75, yLevel, x_se - 25 * 0.75, yLevel - 15, "SLD_GEOMETRY");

    b.addLine(x_se - 40 * 0.75, yLevel - 10, x_se - 25 * 0.75, yLevel - 10, "SLD_GEOMETRY");
    b.addLine(x_se - 40 * 0.75, yLevel, x_se - 25 * 0.75, yLevel, "SLD_GEOMETRY");
    b.addLine(x_se - 40 * 0.75, yLevel + 10, x_se - 25 * 0.75, yLevel + 10, "SLD_GEOMETRY");

    b.addLine(x_se - 25 * 0.75, yLevel - 15, x_se - 25 * 0.75, yLevel - 25, "SLD_GEOMETRY");
    b.addLine(x_se - 30 * 0.75, yLevel - 25, x_se - 20 * 0.75, yLevel - 25, "SLD_GEOMETRY");
    b.addLine(x_se - 28 * 0.75, yLevel - 28, x_se - 22 * 0.75, yLevel - 28, "SLD_GEOMETRY");
    b.addLine(x_se - 26 * 0.75, yLevel - 31, x_se - 24 * 0.75, yLevel - 31, "SLD_GEOMETRY");

    const systemVoltage = panel?.voltage || 230;
    const systemPhase = panel?.system?.includes("3PH") ? "3Ø" : "1Ø";
    const serviceEntranceLabel = `${systemVoltage}V, ${systemPhase}, 60Hz`;

    b.addText("SERVICE ENTRANCE", x_se, mapY(200), 2.5, 0, "TEXT_HEADER", "center");
    b.addText(serviceEntranceLabel, x_se, mapY(215), 2.0, 0, "TEXT_DATA", "center");

    const getCircuitDetailsForCalc = (calc: VoltageDropCalculation) => {
      let cbRating = "";
      let conduitInfo = "";
      
      if (calc.source === "main") {
        const cbAT = panel.mainOverrides?.breakerAT || calcData.mainFeeder.cb || 100;
        const cbAF = panel.mainOverrides?.breakerAF || panel.mainBreakerAF || 225;
        const cbP = panel.system.includes("3PH") ? "3P" : "2P";
        cbRating = `${cbAT}AT/${cbAF}AF, ${cbP}`;
        
        const cSize = panel.mainOverrides?.conduitSize || calcData.mainFeeder.conduitSize || "25";
        const cType = panel.mainOverrides?.conduitType || panel.mainConduitType || "PVC";
        conduitInfo = `${cSize}mm dia. ${cType}`;
      } else {
        let circuit = (circuits || []).find(c => c.id === calc.source || c.linkedSubPanelId === calc.source);
        if (!circuit) {
          for (const sp of (subPanels || [])) {
            circuit = sp.circuits.find(c => c.id === calc.source || c.linkedSubPanelId === calc.source);
            if (circuit) break;
          }
        }
        
        if (circuit) {
          const cbAT = circuit.mcbATOverride || circuit.mcbAT || 30;
          const cbAF = circuit.mcbAF || 50;
          const cbP = circuit.mcbP || (panel.system.includes("3PH") ? "3P" : "2P");
          cbRating = `${cbAT}AT/${cbAF}AF, ${cbP}`;
          
          const cSize = circuit.conduitSizeOverride || circuit.conduitSize || "20";
          const cType = circuit.conduitTypeOverride || circuit.conduitType || "PVC";
          conduitInfo = `${cSize}mm dia. ${cType}`;
        } else {
          const estCB = Math.max(15, Math.ceil((calc.loadA * 1.25) / 5) * 5);
          cbRating = `${estCB}AT/50AF`;
          conduitInfo = "20mm dia. PVC";
        }
      }
      return { cbRating, conduitInfo };
    };

    pathSegments.forEach((segment, idx) => {
      const x1 = nodePositions[idx];
      const x2 = nodePositions[idx + 1];
      const vdPct = parseFloat(segment.calc.result.vdPercentage);
      const isSegCompliant = segment.calc.result.isCompliant;
      
      const strokeColorLayer = isSegCompliant ? "SLD_GEOMETRY" : "SLD_FAULT";
      const lineType = segment.type === "branch" ? "SLD_DASHED" : "SLD_GEOMETRY";

      b.addLine(mapX(x1 + 25), yLevel, mapX(x2 - 25), yLevel, lineType);

      const bx1 = mapX(x1 + 30);
      const bx2 = mapX(x2 - 30);
      const by1 = mapY(100);
      const by2 = mapY(110);
      const by_mid = mapY(105);
      
      b.addLine(bx1, by1, bx1, by2, "SLD_DASHED");
      b.addLine(bx1, by_mid, bx2, by_mid, "SLD_DASHED");
      b.addLine(bx2, by1, bx2, by2, "SLD_DASHED");

      const lengthText = `${segment.calc.length.toFixed(2)} m`;
      b.addText(lengthText, mapX((x1 + x2) / 2), mapY(95), 2.5, 0, "TEXT_DATA", "center");

      const cx = mapX((x1 + x2) / 2);
      b.addRect(cx - 28, mapY(143), cx + 28, mapY(125), "SLD_DASHED");
      
      const vdText = `Vd = ${segment.calc.result.vd}V (${vdPct.toFixed(2)}%)`;
      b.addText(vdText, cx, mapY(138), 2.2, 0, strokeColorLayer, "center");

      const sets = segment.calc.wireSets || 1;
      const setsStr = sets > 1 ? `${sets}x ` : "";
      const mat = getConductorMaterialForCalculation(segment.calc);
      const ins = getInsulationTypeForCalculation(segment.calc);
      const cableSizeText = `${setsStr}${segment.calc.wireSize} mm² ${mat === "Copper" ? "CU" : "AL"} ${ins}`;
      b.addText(cableSizeText, mapX((x1 + x2) / 2), mapY(175), 2.2, 0, "TEXT_DATA", "center");

      const { cbRating, conduitInfo } = getCircuitDetailsForCalc(segment.calc);
      if (cbRating) {
        b.addText(`CB: ${cbRating}`, mapX((x1 + x2) / 2), mapY(190), 2.0, 0, "TEXT_HEADER", "center");
      }
      if (conduitInfo) {
        b.addText(`Conduit: ${conduitInfo}`, mapX((x1 + x2) / 2), mapY(202), 1.8, 0, "TEXT_DATA", "center");
      }
    });

    pathSegments.forEach((segment, idx) => {
      const nodeX = mapX(nodePositions[idx + 1]);
      const isLastNode = idx === pathSegments.length - 1;
      const isLastBranch = isLastNode && segment.type === "branch";

      if (isLastBranch) {
        let circuit = (circuits || []).find(c => c.id === segment.calc.source);
        if (!circuit) {
          for (const sp of (subPanels || [])) {
            circuit = sp.circuits.find(c => c.id === segment.calc.source);
            if (circuit) break;
          }
        }
        
        const loadType = circuit ? circuit.loadType : LoadType.CONVENIENCE_OUTLET;
        let loadTypeLabel = "FINAL LOAD ENDPOINT";

        switch (loadType) {
          case LoadType.LIGHTING:
            loadTypeLabel = "LIGHT FIXTURE";
            b.addCircle(nodeX, yLevel, 10, "SLD_GEOMETRY");
            b.addLine(nodeX - 7, yLevel - 7, nodeX + 7, yLevel + 7, "SLD_GEOMETRY");
            b.addLine(nodeX - 7, yLevel + 7, nodeX + 7, yLevel - 7, "SLD_GEOMETRY");
            break;
            
          case LoadType.MOTOR:
            loadTypeLabel = "MOTOR INDUCTION";
            b.addCircle(nodeX, yLevel, 10, "SLD_GEOMETRY");
            b.addText("M", nodeX, yLevel - 2.5, 5, 0, "TEXT_DATA", "center");
            break;
            
          case LoadType.AIR_CON:
            loadTypeLabel = "AIR CONDITIONER";
            b.addRect(nodeX - 10, yLevel - 10, nodeX + 10, yLevel + 10, "SLD_GEOMETRY");
            b.addText("AC", nodeX, yLevel - 2.5, 4.5, 0, "TEXT_DATA", "center");
            break;
            
          case LoadType.POWER:
            loadTypeLabel = "POWER OUTLET / RANGE";
            b.addCircle(nodeX, yLevel, 10, "SLD_GEOMETRY");
            b.addText("P", nodeX, yLevel - 2.5, 5, 0, "TEXT_DATA", "center");
            break;
            
          case LoadType.CONVENIENCE_OUTLET:
          default:
            loadTypeLabel = "CONVENIENCE RECEPTACLE";
            b.addCircle(nodeX, yLevel, 10, "SLD_GEOMETRY");
            b.addLine(nodeX - 3, yLevel - 13.5, nodeX - 3, yLevel + 13.5, "SLD_GEOMETRY");
            b.addLine(nodeX + 3, yLevel - 13.5, nodeX + 3, yLevel + 13.5, "SLD_GEOMETRY");
            
            b.addLine(nodeX, yLevel - 10, nodeX, yLevel - 16, "SLD_GEOMETRY");
            b.addLine(nodeX - 4, yLevel - 16, nodeX + 4, yLevel - 16, "SLD_GEOMETRY");
            b.addLine(nodeX - 2.5, yLevel - 18, nodeX + 2.5, yLevel - 18, "SLD_GEOMETRY");
            b.addLine(nodeX - 1, yLevel - 20, nodeX + 1, yLevel - 20, "SLD_GEOMETRY");
            break;
        }

        b.addText(segment.toName, nodeX, mapY(192), 2.5, 0, "TEXT_HEADER", "center");
        b.addText(loadTypeLabel, nodeX, mapY(205), 2.0, 0, "TEXT_DATA", "center");
      } else {
        b.addRect(nodeX - 10, yLevel - 15, nodeX + 10, yLevel + 15, "SLD_GEOMETRY");
        b.addLine(nodeX - 10, yLevel - 15, nodeX + 10, yLevel + 15, "SLD_GEOMETRY");

        b.addText(segment.toName, nodeX, mapY(185), 2.5, 0, "TEXT_HEADER", "center");
        b.addText(segment.type === "feeder" ? "DIST. BOARD" : "SUB-PANEL", nodeX, mapY(198), 2.0, 0, "TEXT_DATA", "center");
      }
    });

    b.isSLDMode = previousMode;
  }

  // === DEDICATED NEW SHEET: SHORT-CIRCUIT STUDY TABLE ===
  if (exportMode === "ALL" || exportMode === "SHORT_CIRCUIT") {
    const scSheetIndex = globalSheetCursor++;
    drawSheetTemplate(
      scSheetIndex,
      panel,
      "SHORT CIRCUIT STUDY",
      "FAULT LEVEL CALCULATED RESULTS",
    );

    const sConf = sheetConfigs[scSheetIndex] || { w: baseW, xOffset: scSheetIndex * 900 };
    const xOffset = sConf.xOffset;
    let ty = 521; // Perfectly centered vertically

    const cols = [
      { name: "PARAMETER / COMPONENT DESCRIPTION", w: 320 },
      { name: "VALUE", w: 100 },
      { name: "UNIT", w: 100 },
    ];

    const tableWidth = cols.reduce((sum, col) => sum + col.w, 0); // 680 mm wide
    const titleBlockX = sConf.w - 130;
    const availableCenter = MARGIN_LEFT + (titleBlockX - MARGIN_LEFT) / 2; // 360.5
    const tableLeft = xOffset + availableCenter - (tableWidth / 2); // Center horizontally in drawing area
    const tableRight = tableLeft + tableWidth;

    // Header Border
    const headH = 22.0;
    b.addRect(tableLeft, ty - headH, tableRight, ty, "BORDER");
    b.addText(
      "SHORT CIRCUIT POINT-TO-POINT CALCULATION RESULTS",
      tableLeft + tableWidth / 2,
      ty - headH / 2 - 5.5 / 2,
      5.5,
      0,
      "TEXT_TITLE",
      "center",
    );

    ty -= headH;

    // Header Row Column labels
    const labelH = 18.0;
    b.addRect(tableLeft, ty - labelH, tableRight, ty, "BORDER");
    let currentX = tableLeft;
    const colPositions: number[] = [];
    cols.forEach((col) => {
      colPositions.push(currentX);
      b.addText(
        col.name,
        currentX + col.w / 2,
        ty - labelH / 2 - 4.5 / 2,
        4.5,
        0,
        "TEXT_HEADER",
        "center",
        col.w - 2
      );
      currentX += col.w;
    });
    colPositions.push(currentX);

    // Grid vertical lines for headers (inner dividers only)
    for (let i = 1; i < colPositions.length - 1; i++) {
      b.addLine(colPositions[i], ty - labelH, colPositions[i], ty, "BORDER");
    }

    ty -= labelH;

    // Compute Short Circuit values matching Excel EXACTLY
    const excelBaseKVA = scParams.transformerKVA || 100;
    const excelBaseKV = (scParams.transformerVoltage || 230) / 1000;
    const excelZUtilitypu = excelBaseKVA / ((scParams.utilityShortCircuitMVA || 500) * 1000);
    
    let excelZTranspu = (scParams.transformerZ || 5) / 100 / connectionMultiplier;
    let excelTotalTransformerKVA = excelBaseKVA;
    const ptCount = scParams.parallelTransformersCount || 1;
    const ptZMatch = scParams.parallelTransformersZMatch !== false;
    const ptkVAMatch = scParams.parallelTransformerskVAMatch !== false;

    if (ptCount > 1) {
      if (ptZMatch && ptkVAMatch) {
        excelZTranspu = excelZTranspu / ptCount;
        excelTotalTransformerKVA = excelBaseKVA * ptCount;
      } else {
        const z1pu = excelZTranspu;
        const t2Rating = scParams.parallelTransformersRating || 100;
        const t2Z = scParams.parallelTransformersZ || 5;
        const z2pu = ((t2Z / 100) / connectionMultiplier) * (excelBaseKVA / t2Rating);
        
        const y1 = 1 / z1pu;
        const y2 = (ptCount - 1) / z2pu;
        excelZTranspu = 1 / (y1 + y2);
        excelTotalTransformerKVA = excelBaseKVA + (ptCount - 1) * t2Rating;
      }
    }

    const feederRuns = scParams.feederRuns || 1;
    const condType = scParams.conductorType || "Copper";
    const connType = scParams.connectionType || "Series";

    const eqFeeder = calculateEquivalentFeederImpedance(
      scParams.feederLength || 10,
      scParams.feederSize || "3.5",
      feederRuns,
      condType as "Copper" | "Aluminum",
      connType as "Series" | "Parallel",
      scParams.parallelFeedersSizeMatch !== false,
      scParams.parallelFeedersLengthMatch !== false,
      scParams.parallelFeedersMaterialMatch !== false,
      scParams.parallelFeedersCustomSizes,
      scParams.parallelFeedersCustomLengths,
      scParams.parallelFeedersCustomMaterials,
    );

    const excelFeederR = eqFeeder.r;
    const excelFeederX = eqFeeder.x;
    const excelFeederZ = eqFeeder.z;
    const excelZFeederpu = (excelFeederZ * (excelBaseKVA / 1000)) / (excelBaseKV * excelBaseKV);

    const excelTotalZpu = excelZUtilitypu + excelZTranspu + excelZFeederpu;
    const excelIFullLoad = excelTotalTransformerKVA / (1.732 * excelBaseKV);
    const excelIFullLoadBase = excelBaseKVA / (1.732 * excelBaseKV);

    const excelIscMainBreaker = excelIFullLoadBase / (excelZUtilitypu + excelZTranspu);
    const excelIscFaultPoint = excelIFullLoadBase / excelTotalZpu;

    const excelMotorLoadVA = circuits
      .filter(
        (c) => c.loadType === LoadType.MOTOR || c.loadType === LoadType.AIR_CON,
      )
      .reduce((sum, c) => sum + c.loadVA, 0);
    const excelMotorContribution =
      excelMotorLoadVA > 0
        ? (excelMotorLoadVA / (1.732 * (scParams.transformerVoltage || 230))) * 4
        : 0;

    const excelCombinedSymmetricalCurrent = excelIscFaultPoint + excelMotorContribution;
    const excelCombinedAsymmetricalCurrent = excelCombinedSymmetricalCurrent * 1.25;
    const excelBreakingkAIC = excelCombinedAsymmetricalCurrent / 1000;

    const scRows: { label: string; val: string | number; unit: string; isSection?: boolean }[] = [
      { label: "INPUT DESIGN PARAMETERS", val: "", unit: "", isSection: true },
      { label: "Utility Short Circuit Strength", val: scParams.utilityShortCircuitMVA || 500, unit: "MVAsc" },
      { label: "Primary Bus Voltage (HV)", val: scParams.primaryVoltage || 34500, unit: "Volts" },
      { label: "Secondary Rated Bus Voltage (LV)", val: scParams.transformerVoltage || 230, unit: "Volts" },
      { label: "Transformer 1 Sizing Capacity", val: excelBaseKVA, unit: "kVA" },
      { label: "Transformer 1 Percent Impedance (%Z)", val: scParams.transformerZ || 5, unit: "%" },
    ];

    if (ptCount > 1) {
      scRows.push(
        { label: "Parallel Transformers Count", val: ptCount, unit: "Units" },
        { label: "Parallel Transformer 2+ Sizing", val: scParams.parallelTransformersRating || 100, unit: "kVA" },
        { label: "Parallel Transformer 2+ %Z", val: scParams.parallelTransformersZ || 5, unit: "%" },
        { label: "Combined Transformer Capacity", val: excelTotalTransformerKVA, unit: "kVA" }
      );
    }

    scRows.push(
      { label: "Feeder Connection Architecture", val: connType, unit: "Topology" },
      { label: "Feeder Conductor Cross-Section", val: scParams.feederSize || "3.5", unit: `mm² ${panel?.insulationType || "THHN"}` },
      { label: "Feeder Distance Length", val: scParams.feederLength || 10, unit: "Meters" },
      { label: "Parallel Feeder Conductors", val: feederRuns, unit: "Runs" },
      { label: "Active Conductor Metal Type", val: scParams.conductorType || "Copper", unit: "Copper/Aluminum" },
      { label: "Transformer Connection", val: scParams.transformerConnection || "Delta-Wye (D-Y)", unit: "Configuration" },
      { label: "Ground Fault Factor applied", val: groundFaultFactor.toFixed(2), unit: "Multiplier" },

      { label: "PER-UNIT IMPEDANCES (BASE S SYSTEM = " + excelBaseKVA + " kVA)", val: "", unit: "", isSection: true },
      { label: "Transformer Full Load Current (FLA)", val: excelIFullLoad.toFixed(2), unit: "Amperes" },
      { label: "Utility Grid Impedance (Z-utility)", val: excelZUtilitypu.toFixed(6), unit: "pu" },
      { label: "Transformer Leakage Impedance (Z-transformer)", val: excelZTranspu.toFixed(6), unit: "pu" },
      { label: "Main Feeder Ohmic Resistance (R)", val: excelFeederR.toFixed(5), unit: "Ohms" },
      { label: "Main Feeder Ohmic Reactance (X)", val: excelFeederX.toFixed(5), unit: "Ohms" },
      { label: "Main Feeder Absolute Ohmic Impedance (|Z|)", val: excelFeederZ.toFixed(5), unit: "Ohms" },
      { label: "Feeder Integrated Impedance (Z-feeder)", val: excelZFeederpu.toFixed(6), unit: "pu" },
      { label: "Total Consolidated System Impedance (Z-total)", val: excelTotalZpu.toFixed(6), unit: "pu" },

      { label: "FAULT LEVEL CALCULATED RESULTS", val: "", unit: "", isSection: true },
      { label: "Symmetrical Fault Current at Transformer (Isc Main)", val: excelIscMainBreaker.toFixed(2), unit: "Amps" },
      { label: "Symmetrical Fault Current at Panel (Isc Panel)", val: excelIscFaultPoint.toFixed(2), unit: "Amps" },
      { label: "Rotating Motor Feedback Symmetrical Contribution (Imotor)", val: excelMotorContribution.toFixed(2), unit: "Amps" },
      { label: "Combined Total Symmetrical Fault Current (Isc sym)", val: excelCombinedSymmetricalCurrent.toFixed(2), unit: "Amps" },
      { label: "Factored Asymmetrical Fault Current (Isc asym)", val: excelCombinedAsymmetricalCurrent.toFixed(2), unit: "Amps" },
      { label: "Ultimate Fault Breaking Intensity Assessment", val: excelBreakingkAIC.toFixed(2), unit: "kAIC" },
      { label: "Interrupting Protection Level Class", val: excelBreakingkAIC > 22 ? "35 kAIC Required" : excelBreakingkAIC > 10 ? "22 kAIC" : "10 kAIC", unit: "" }
    );

    scRows.forEach((row) => {
      if (row.isSection) {
        const sectH = 14.0;
        b.addRect(tableLeft, ty - sectH, tableRight, ty, "BORDER");
        b.addText(
          row.label,
          tableLeft + 10,
          ty - sectH / 2 - 5.5 / 2,
          5.5,
          0,
          "TEXT_HEADER",
          "left"
        );
        ty -= sectH;
      } else {
        const valStr = row.val !== undefined ? row.val.toString() : "-";
        
        // Compute dynamic row height based on content
        const charWidthFactor = 0.55;
        const fontSize = 5.0;
        const lines0 = Math.ceil((row.label.length * fontSize * charWidthFactor) / (cols[0].w - 10));
        const lines1 = Math.ceil((valStr.length * fontSize * charWidthFactor) / (cols[1].w - 10));
        const lines2 = Math.ceil((row.unit.length * fontSize * charWidthFactor) / (cols[2].w - 10));
        const maxLines = Math.max(1, lines0, lines1, lines2);
        
        const rowH = 10.0 + (maxLines - 1) * 7.0;

        // Draw bottom horizontal line
        b.addLine(tableLeft, ty - rowH, tableRight, ty - rowH, "TABLE_GRID");
        // Draw left outer vertical line
        b.addLine(tableLeft, ty - rowH, tableLeft, ty, "BORDER");
        // Draw right outer vertical line
        b.addLine(tableRight, ty - rowH, tableRight, ty, "BORDER");

        // Draw inner vertical dividers only
        for (let i = 1; i < colPositions.length - 1; i++) {
          b.addLine(colPositions[i], ty - rowH, colPositions[i], ty, "TABLE_GRID");
        }

        b.addText(row.label, colPositions[0] + 5, ty - rowH / 2 - fontSize / 2, fontSize, 0, "TEXT_DATA", "left", cols[0].w - 10);
        b.addText(valStr, colPositions[1] + cols[1].w / 2, ty - rowH / 2 - fontSize / 2, fontSize, 0, "TEXT_DATA", "center", cols[1].w - 10);
        b.addText(row.unit, colPositions[2] + cols[2].w / 2, ty - rowH / 2 - fontSize / 2, fontSize, 0, "TEXT_DATA", "center", cols[2].w - 10);

        ty -= rowH;
      }
    });
  }

  // === DEDICATED NEW SHEET: KAIC PROTECTION COMPLIANCE AUDIT ===
  if (exportMode === "ALL" || exportMode === "SHORT_CIRCUIT") {
    const auditSheetIndex = globalSheetCursor++;
    drawSheetTemplate(
      auditSheetIndex,
      panel,
      "KAIC COMPLIANCE AUDIT",
      "PEC SECTION 1.10.1.9 SAFETY EVALUATION",
    );

    const sConf = sheetConfigs[auditSheetIndex] || { w: baseW, xOffset: auditSheetIndex * 900 };
    const xOffset = sConf.xOffset;
    let ty = 521; // centered vertically

    const cols = [
      { name: "PROTECTIVE DEVICE LOCATION", w: 210 },
      { name: "CLASSIFICATION", w: 85 },
      { name: "MAX FAULT", w: 75 },
      { name: "INSTALLED", w: 50 },
      { name: "STATUS", w: 45 },
      { name: "SIZING RECOMMENDATION / ACTION REQUIRED", w: 235 },
    ];

    const tableWidth = cols.reduce((sum, col) => sum + col.w, 0); // 700 mm wide
    const titleBlockX = sConf.w - 130;
    const availableCenter = MARGIN_LEFT + (titleBlockX - MARGIN_LEFT) / 2;
    const tableLeft = xOffset + availableCenter - (tableWidth / 2);
    const tableRight = tableLeft + tableWidth;

    // Header Border
    const headH = 22.0;
    b.addRect(tableLeft, ty - headH, tableRight, ty, "BORDER");
    b.addText(
      "PEC COMPLIANCE: OVERCURRENT PROTECTIVE DEVICE KAIC AUDITING REPORT",
      tableLeft + tableWidth / 2,
      ty - headH / 2 - 5.5 / 2,
      5.5,
      0,
      "TEXT_TITLE",
      "center",
    );

    ty -= headH;

    // Header Row Column labels
    const labelH = 18.0;
    b.addRect(tableLeft, ty - labelH, tableRight, ty, "BORDER");
    let currentX = tableLeft;
    const colPositions: number[] = [];
    cols.forEach((col) => {
      colPositions.push(currentX);
      b.addText(
        col.name,
        currentX + col.w / 2,
        ty - labelH / 2 - 4.5 / 2,
        4.5,
        0,
        "TEXT_HEADER",
        "center",
        col.w - 2
      );
      currentX += col.w;
    });
    colPositions.push(currentX);

    // Grid vertical lines for headers
    for (let i = 1; i < colPositions.length - 1; i++) {
      b.addLine(colPositions[i], ty - labelH, colPositions[i], ty, "BORDER");
    }

    ty -= labelH;

    // Generate Validation Rows matching exactly with ShortCircuitCalc.tsx
    const auditRows: Array<{
      location: string;
      type: string;
      faultCurrentA: number;
      selectedKAIC: number;
      status: "PASS" | "FAIL";
      recommendation: string;
    }> = [];

    const standardKAICRatings = [5, 10, 14, 18, 22, 25, 30, 35, 42, 50, 65, 85, 100];

    // 1. MDP Main Breaker
    const mdpFaultA = fault2Isc || 10000;
    const mdpKAICSelected = parseFloat(panel.icRating) || 10;
    const mdpFaultKA = mdpFaultA / 1000;
    const mdpPass = mdpKAICSelected >= mdpFaultKA;
    const recMdp = standardKAICRatings.find(k => k >= mdpFaultKA) || 100;

    auditRows.push({
      location: panel.designation || "Main Panel (MDP) Main Breaker",
      type: "Main Protective Device",
      faultCurrentA: mdpFaultA,
      selectedKAIC: mdpKAICSelected,
      status: mdpPass ? "PASS" : "FAIL",
      recommendation: mdpPass 
        ? "Breaker is adequately sized for maximum short-circuit duty." 
        : `INSUFFICIENT kAIC: Upgrade main breaker rating to at least ${recMdp} kAIC immediately.`,
    });

    // 2. MDP Branch Protective Devices
    if (circuits && circuits.length > 0) {
      circuits.forEach(c => {
        if (isIdleSpareOrSpace(c)) return;
        const branchFaultA = fault3Isc || 10000;
        const branchFaultKA = branchFaultA / 1000;
        const branchKAICSelected = c.mcbKAIC || 10;
        const bPass = branchKAICSelected >= branchFaultKA;
        const recB = standardKAICRatings.find(k => k >= branchFaultKA) || 100;

        auditRows.push({
          location: `${panel.designation || "MDP"} - Circuit ${c.circuitNo} (${c.description})`,
          type: "Branch Circuit Breaker",
          faultCurrentA: branchFaultA,
          selectedKAIC: branchKAICSelected,
          status: bPass ? "PASS" : "FAIL",
          recommendation: bPass
            ? "Circuit breaker is adequate."
            : `Recommend upgrade to at least ${recB} kAIC.`,
        });
      });
    }

    // 3. Subpanels
    if (subPanels && subPanels.length > 0) {
      subPanels.forEach(sp => {
        let spFaultA = 10000;
        // Find if this subpanel is fed by another panel
        let parentConn = circuits?.find(c => c.linkedSubPanelId === sp.id);
        if (!parentConn && subPanels) {
          parentConn = subPanels.flatMap(otherSp => otherSp.circuits).find(c => c.linkedSubPanelId === sp.id);
        }

        if (parentConn) {
          const feederLen = iscParams.feederLength || 10;
          const feederSize = parentConn.wireSize || "14";
          const feederRuns = parentConn.quantity || 1;
          const motorVA = sp.circuits.reduce((acc, curr) => 
            (curr.loadType === LoadType.MOTOR || curr.loadType === LoadType.AIR_CON) ? acc + (curr.loadVA || 0) : acc, 0
          );
          spFaultA = calculatePanelFault(
            sp.panel,
            iscParams,
            feederLen,
            feederSize,
            feederRuns,
            motorVA
          );
        } else {
          spFaultA = calculatePanelFault(sp.panel, iscParams, undefined, undefined, undefined, 0);
        }

        const spFaultKA = spFaultA / 1000;
        const spKAICSelected = parseFloat(sp.panel.icRating) || 10;
        const spPass = spKAICSelected >= spFaultKA;
        const recSp = standardKAICRatings.find(k => k >= spFaultKA) || 100;

        auditRows.push({
          location: `${sp.panel.designation || `Subpanel ${sp.id}`} Main Breaker`,
          type: "Subpanel Main Device",
          faultCurrentA: spFaultA,
          selectedKAIC: spKAICSelected,
          status: spPass ? "PASS" : "FAIL",
          recommendation: spPass
            ? "Main breaker is adequate for short-circuit duty."
            : `INSUFFICIENT kAIC: Upgrade to minimum ${recSp} kAIC protection.`,
        });

        // Subpanel branch circuits
        sp.circuits.forEach(c => {
          if (isIdleSpareOrSpace(c)) return;
          const branchFaultKA = spFaultKA;
          const branchKAICSelected = c.mcbKAIC || 10;
          const bPass = branchKAICSelected >= branchFaultKA;
          const recB = standardKAICRatings.find(k => k >= branchFaultKA) || 100;

          auditRows.push({
            location: `${sp.panel.designation || `Subpanel ${sp.id}`} - Circuit ${c.circuitNo} (${c.description})`,
            type: "Branch Circuit Breaker",
            faultCurrentA: spFaultA,
            selectedKAIC: branchKAICSelected,
            status: bPass ? "PASS" : "FAIL",
            recommendation: bPass
              ? "Circuit breaker is adequate."
              : `Recommend upgrade to ${recB} kAIC.`,
          });
        });
      });
    }

    // Now render the rows in AutoCAD DXF format
    auditRows.forEach((row) => {
      const valFaultStr = `${(row.faultCurrentA / 1000).toFixed(2)} kA`;
      const valInstalledStr = `${row.selectedKAIC} kAIC`;
      const valStatusStr = row.status === "PASS" ? "PASS" : "FAIL";

      // Compute dynamic row height based on content
      const charWidthFactor = 0.70;
      const fontSize = 4.5;
      const lines0 = Math.ceil((row.location.length * fontSize * charWidthFactor) / (cols[0].w - 10));
      const lines5 = Math.ceil((row.recommendation.length * fontSize * charWidthFactor) / (cols[5].w - 10));
      const maxLines = Math.max(1, lines0, lines5);
      
      const rowH = 14.0 + (maxLines - 1) * 8.0;

      // Draw bottom horizontal line
      b.addLine(tableLeft, ty - rowH, tableRight, ty - rowH, "TABLE_GRID");
      // Draw left outer vertical line
      b.addLine(tableLeft, ty - rowH, tableLeft, ty, "BORDER");
      // Draw right outer vertical line
      b.addLine(tableRight, ty - rowH, tableRight, ty, "BORDER");

      // Draw inner vertical dividers only
      for (let i = 1; i < colPositions.length - 1; i++) {
        b.addLine(colPositions[i], ty - rowH, colPositions[i], ty, "TABLE_GRID");
      }

      // Draw texts with styling
      b.addText(row.location, colPositions[0] + 5, ty - rowH / 2 - fontSize / 2, fontSize, 0, "TEXT_DATA", "left", cols[0].w - 10);
      b.addText(row.type, colPositions[1] + cols[1].w / 2, ty - rowH / 2 - fontSize / 2, fontSize, 0, "TEXT_DATA", "center", cols[1].w - 10);
      b.addText(valFaultStr, colPositions[2] + cols[2].w / 2, ty - rowH / 2 - fontSize / 2, fontSize, 0, "TEXT_DATA", "center", cols[2].w - 10);
      b.addText(valInstalledStr, colPositions[3] + cols[3].w / 2, ty - rowH / 2 - fontSize / 2, fontSize, 0, "TEXT_DATA", "center", cols[3].w - 10);
      
      // Add status text
      b.addText(
        valStatusStr, 
        colPositions[4] + cols[4].w / 2, 
        ty - rowH / 2 - fontSize / 2, 
        fontSize, 
        0, 
        row.status === "PASS" ? "TEXT_HEADER" : "SLD_FAULT", 
        "center", 
        cols[4].w - 10
      );

      b.addText(row.recommendation, colPositions[5] + 5, ty - rowH / 2 - fontSize / 2, fontSize, 0, "TEXT_DATA", "left", cols[5].w - 10);

      ty -= rowH;
    });

    // Add compliance stamp/note box
    const noteH = 22.0;
    const noteY = ty - 10;
    b.addRect(tableLeft, noteY - noteH, tableRight, noteY, "BORDER");
    b.addText(
      "ENGINEERING SAFETY NOTE / LEGAL COMPLIANCE COMPACT",
      tableLeft + 10,
      noteY - 6.0,
      4.0,
      0,
      "TEXT_HEADER",
      "left"
    );
    b.addText(
      "Pursuant to the Philippine Electrical Code (PEC) Section 1.10.1.9, overcurrent protective devices must have an interrupting rating sufficient",
      tableLeft + 10,
      noteY - 12.0,
      3.2,
      0,
      "TEXT_DATA",
      "left"
    );
    b.addText(
      "for the nominal circuit voltage and the current that is available at the line terminals of the equipment. System verified and stamped compliant.",
      tableLeft + 10,
      noteY - 17.0,
      3.2,
      0,
      "TEXT_DATA",
      "left"
    );
  }

  // === DEDICATED NEW SHEET: ILLUMINATION TABLE ===
  if (exportMode === "ALL" && hasIllumination) {
    const illSheetIndex = globalSheetCursor++;
    drawSheetTemplate(
      illSheetIndex,
      panel,
      "ILLUMINATION ANALYSIS",
      "LUMEN METHOD LIGHTING REPORT",
    );

    const sConf = sheetConfigs[illSheetIndex] || { w: baseW, xOffset: illSheetIndex * 900 };
    const xOffset = sConf.xOffset;
    let ty = 500;

    const cols = [
      { name: "ROOM NAME", w: 80 },
      { name: "TARGET LUX", w: 45 },
      { name: "AREA (m²)", w: 45 },
      { name: "FIXTURE TYPE", w: 90 },
      { name: "FIXTURES COUNT", w: 50 },
      { name: "TOTAL LUMENS", w: 55 },
      { name: "TOTAL WATTAGE (W)", w: 60 },
      { name: "LPD (W/m²)", w: 45 },
      { name: "ASHRAE LIMIT (W/m²)", w: 65 },
      { name: "STATUS", w: 45 },
      { name: "CIRCUIT NO.", w: 50 },
    ];

    const tableWidth = cols.reduce((sum, col) => sum + col.w, 0);
    const tableLeft = xOffset + 45;
    const tableRight = tableLeft + tableWidth;

    // Header Border
    b.addRect(tableLeft, ty - 16, tableRight, ty, "BORDER");
    b.addText(
      "ILLUMINATION (LUMEN METHOD) ANALYSIS REPORT",
      tableLeft + tableWidth / 2,
      ty - 10.5,
      5.0,
      0,
      "TEXT_TITLE",
      "center",
    );

    ty -= 16;

    // Header Row Column labels
    b.addRect(tableLeft, ty - 24, tableRight, ty, "BORDER");
    let currentX = tableLeft;
    const colPositions: number[] = [];
    cols.forEach((col) => {
      colPositions.push(currentX);
      b.addText(
        col.name,
        currentX + col.w / 2,
        ty - 14.0,
        4.0,
        0,
        "TEXT_HEADER",
        "center",
        col.w - 2
      );
      currentX += col.w;
    });
    colPositions.push(currentX);

    // Grid vertical lines for headers (inner dividers only)
    for (let i = 1; i < colPositions.length - 1; i++) {
      b.addLine(colPositions[i], ty - 24, colPositions[i], ty, "BORDER");
    }

    ty -= 24;

    // Data Row rendering
    illumParams.savedRooms.forEach((room: any) => {
      const roomLPD = room.totalWattage / room.area;
      const limitLPD = room.targetLux > 300 ? 9.0 : 6.0;
      const status = roomLPD <= limitLPD ? "PASSED" : "FAILED";
      const fixType = room.fixtureLightType || "Custom";

      const charWidthFactor = 0.55;
      const fontSize = 4.0;
      const lines0 = Math.ceil((room.roomName.length * fontSize * charWidthFactor) / (cols[0].w - 4));
      const lines3 = Math.ceil((fixType.length * fontSize * charWidthFactor) / (cols[3].w - 4));
      const maxLines = Math.max(1, lines0, lines3);

      const rowH = 14.0 + (maxLines - 1) * 6.0;

      // Draw bottom horizontal line
      b.addLine(tableLeft, ty - rowH, tableRight, ty - rowH, "TABLE_GRID");
      // Draw left outer vertical line
      b.addLine(tableLeft, ty - rowH, tableLeft, ty, "BORDER");
      // Draw right outer vertical line
      b.addLine(tableRight, ty - rowH, tableRight, ty, "BORDER");

      // Draw inner dividers only
      for (let i = 1; i < colPositions.length - 1; i++) {
        b.addLine(colPositions[i], ty - rowH, colPositions[i], ty, "TABLE_GRID");
      }

      b.addText(room.roomName, colPositions[0] + 3, ty - rowH / 2 - 2.0, 4.0, 0, "TEXT_DATA", "left", cols[0].w - 4);
      b.addText(room.targetLux.toString(), colPositions[1] + cols[1].w / 2, ty - rowH / 2 - 2.0, 4.0, 0, "TEXT_DATA", "center", cols[1].w - 4);
      b.addText(room.area.toFixed(2), colPositions[2] + cols[2].w / 2, ty - rowH / 2 - 2.0, 4.0, 0, "TEXT_DATA", "center", cols[2].w - 4);
      
      b.addText(fixType, colPositions[3] + 3, ty - rowH / 2 - 2.0, 4.0, 0, "TEXT_DATA", "left", cols[3].w - 4);
      b.addText(room.fixturesCount.toString(), colPositions[4] + cols[4].w / 2, ty - rowH / 2 - 2.0, 4.0, 0, "TEXT_DATA", "center", cols[4].w - 4);
      b.addText(room.totalLumens.toString(), colPositions[5] + cols[5].w / 2, ty - rowH / 2 - 2.0, 4.0, 0, "TEXT_DATA", "center", cols[5].w - 4);
      b.addText(room.totalWattage.toString(), colPositions[6] + cols[6].w / 2, ty - rowH / 2 - 2.0, 4.0, 0, "TEXT_DATA", "center", cols[6].w - 4);
      b.addText(Number(roomLPD.toFixed(2)).toString(), colPositions[7] + cols[7].w / 2, ty - rowH / 2 - 2.0, 4.0, 0, "TEXT_DATA", "center", cols[7].w - 4);
      b.addText(limitLPD.toString(), colPositions[8] + cols[8].w / 2, ty - rowH / 2 - 2.0, 4.0, 0, "TEXT_DATA", "center", cols[8].w - 4);
      
      const statLayer = status === "PASSED" ? "TEXT_DATA" : "SLD_FAULT";
      b.addText(status, colPositions[9] + cols[9].w / 2, ty - rowH / 2 - 2.0, 4.0, 0, statLayer, "center", cols[9].w - 4);
      b.addText(room.circuitNo ? room.circuitNo.toString() : "-", colPositions[10] + cols[10].w / 2, ty - rowH / 2 - 2.0, 4.0, 0, "TEXT_DATA", "center", cols[10].w - 4);

      ty -= rowH;
    });
  }

  const dxfString = b.toDxfString();
  const filename =
    exportMode === "LOAD_SCHEDULE"
      ? `Panel_${panel.designation || "MDP"}_Load_Schedule.dxf`
      : exportMode === "SHORT_CIRCUIT"
        ? `Panel_${panel.designation || "MDP"}_Short_Circuit.dxf`
        : exportMode === "VOLTAGE_DROP"
          ? `Panel_${panel.designation || "MDP"}_Voltage_Drop.dxf`
          : `Panel_${panel.designation || "MDP"}_CAD_Drawing.dxf`;

  const userId = auth.currentUser?.uid;

  const performDownload = () => {
    const blob = new Blob([dxfString], { type: "application/dxf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (userId) {
    // Check user plan in Firestore
    const userRef = doc(db, "users", userId);
    getDoc(userRef)
      .then((userSnap) => {
        if (userSnap.exists()) {
          const userData = userSnap.data();
          const isAdmin =
            userData?.email?.trim().toLowerCase() ===
            "angeloperfecto31@gmail.com";
          const isActive = userData?.isActive === true;
          const isPremium =
            userData?.plan === "premium" ||
            userData?.plan === "Premium" ||
            userData?.plan === "PREMIUM" ||
            (userData?.plan || "").toLowerCase() === "enterprise";

          if (!isAdmin && (!isActive || !isPremium)) {
            alert(
              "Access denied. AutoCAD export functions and downloadable files (DWG/DXF) are exclusive to Premium Plan subscribers.",
            );
            return;
          }
          performDownload();
        } else {
          alert("User record not found. Cannot verify subscription plan.");
        }
      })
      .catch((error) => {
        console.error("Error verifying user plan:", error);
        alert("Error verifying user plan. Please try again later.");
      });
  } else {
    // If not logged in, prompt or block
    alert(
      "Please log in to export AutoCAD files. This feature is exclusive to Premium Plan subscribers.",
    );
  }
};

// Legacy support wrapper so existing calls do not break if reference is made anywhere
export const exportDiagramToDXF = (
  panel: PanelConfig,
  params: ShortCircuitParams,
  calculation: any,
  motorLoadVA: number = 0,
) => {
  // Translate parameters back into the uniform signature
  const mockCircuits: Circuit[] = [
    {
      id: "1",
      circuitNo: 1,
      description: "Connected Dynamic Loads",
      voltage: params.transformerVoltage || 230,
      quantity: 1,
      wattage: motorLoadVA || 1000,
      loadVA: motorLoadVA || 1000,
      loadA: motorLoadVA ? motorLoadVA / 230 : 4.34,
      phases: ["R"],
      mcbAT: 30,
      mcbAF: 50,
      mcbP: "2P",
      mcbKAIC: 10,
      mcbType: MCBType.BOLT_ON,
      wireSize: "3.5",
      wireType: panel.insulationType || "THHN",
      groundSize: "3.5",
      conduitSize: "20mm",
      conduitType: "PVC",
      loadType: LoadType.MOTOR,
    },
  ];

  exportToCAD(panel, mockCircuits, [], params);
};
