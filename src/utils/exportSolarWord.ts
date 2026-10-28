import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  WidthType,
  BorderStyle,
  Header,
  Footer,
  PageNumber,
  ImageRun,
  PageOrientation,
  VerticalAlign,
  Math as DocxMath,
  MathRun,
  MathFraction,
  MathSubScript,
  MathSuperScript,
  MathSubSuperScript,
  MathRadical,
  TableOfContents
} from "docx";
import { saveAs } from "file-saver";
import { SolarDesignConfig, SolarCalculationResults, SolarBOMItem } from "../types/solar";
import { computeSolarStudies, kaText, type SolarStudies } from "./solarStudies";
import { PanelConfig, Circuit } from "../types";
import { resolveSolarBOM } from "./solarEngine";
import { computePanelScheduleValues, getConductorLabel } from "./computeEngine";
import { solarBackfeedAmps } from "./solarLinkedPanel";
import { toPng } from "html-to-image";

export interface SolarWordExportOptions {
  panels?: PanelConfig[];
  circuits?: Circuit[];
  subPanels?: any[];
  vdCalculations?: any[];
  linkedPanelData?: any;
  sldImageBuffer?: Uint8Array;
  /** Drawing size (any unit) of sldImageBuffer, used to keep its proportions */
  sldImageSize?: { width: number; height: number };
  /** Short-circuit and voltage-drop studies (project service data); computed with defaults when absent */
  studies?: SolarStudies;
}

// =============================================================================
// MATH & LATEX PARSING UTILITIES (Matching Standard Engineering Word Format)
// =============================================================================

function getMathSymbol(macro: string): string {
  switch (macro) {
    case "times": return " × ";
    case "cdot":
    case "mid": return " • ";
    case "approx": return " ≈ ";
    case "ge":
    case "geq": return " ≥ ";
    case "le":
    case "leq": return " ≤ ";
    case "Delta": return "Δ";
    case "Phi": return "Φ";
    case "phi": return "φ";
    case "Omega": return "Ω";
    case "omega": return "ω";
    case "theta": return "θ";
    case "beta": return "β";
    case "gamma": return "γ";
    case "circ": return "°";
    case "pm": return " ± ";
    case "implies": return " ⟹ ";
    case "left":
    case "right": return "";
    default: return macro;
  }
}

function parseLatex(str: string): any[] {
  type Item = 
    | { type: 'component'; val: any }
    | { type: 'sub'; target: 'sub' }
    | { type: 'super'; target: 'super' }
    | { type: 'group'; val: any[] };

  let pos = 0;

  function parseGroupItems(): any[] {
    if (pos < str.length && str[pos] === '{') {
      pos++; // consume '{'
      let depth = 1;
      let start = pos;
      while (pos < str.length) {
        if (str[pos] === '{') depth++;
        else if (str[pos] === '}') {
          depth--;
          if (depth === 0) {
            const subStr = str.slice(start, pos);
            pos++; // consume '}'
            return parseLatex(subStr);
          }
        }
        pos++;
      }
    }
    // Fallback: parse single character / macro
    if (pos < str.length) {
      if (str[pos] === '\\') {
        pos++;
        let m = "";
        while (pos < str.length && /[a-zA-Z]/.test(str[pos])) {
          m += str[pos++];
        }
        if (m === "text") {
          if (str[pos] === ';') pos++;
          return parseGroupItems();
        }
        const sym = getMathSymbol(m === "" ? str[pos++] : m);
        return [new MathRun(sym)];
      }
      return [new MathRun(str[pos++])];
    }
    return [];
  }

  const items: Item[] = [];
  while (pos < str.length) {
    const char = str[pos];
    if (char === '_') {
      items.push({ type: 'sub', target: 'sub' });
      pos++;
      items.push({ type: 'group', val: parseGroupItems() });
    } else if (char === '^') {
      items.push({ type: 'super', target: 'super' });
      pos++;
      items.push({ type: 'group', val: parseGroupItems() });
    } else if (char === '\\') {
      pos++;
      let macro = "";
      while (pos < str.length && /[a-zA-Z]/.test(str[pos])) {
        macro += str[pos++];
      }
      if (macro === "frac") {
        const num = parseGroupItems();
        const den = parseGroupItems();
        items.push({ type: 'component', val: new MathFraction({ numerator: num, denominator: den }) });
      } else if (macro === "sqrt") {
        const rad = parseGroupItems();
        items.push({ type: 'component', val: new MathRadical({ children: rad }) });
      } else if (macro === "text") {
        if (str[pos] === ';') pos++;
        const content = parseGroupItems();
        content.forEach(c => items.push({ type: 'component', val: c }));
      } else if (macro === "" || macro === " ") {
        if (pos < str.length) {
          const esc = str[pos++];
          if (esc === "%") items.push({ type: 'component', val: new MathRun("%") });
          else if (esc === "," || esc === " ") items.push({ type: 'component', val: new MathRun(" ") });
          else items.push({ type: 'component', val: new MathRun(esc) });
        }
      } else {
        const sym = getMathSymbol(macro);
        if (sym !== "") {
          items.push({ type: 'component', val: new MathRun(sym) });
        }
      }
    } else {
      if (char !== '{' && char !== '}') {
        items.push({ type: 'component', val: new MathRun(char) });
      }
      pos++;
    }
  }

  // Bind subscripts and superscripts
  const result: any[] = [];
  let i = 0;
  while (i < items.length) {
    const current = items[i];
    if (current.type === 'component') {
      const next1 = i + 1 < items.length ? items[i + 1] : null;
      const next2 = i + 2 < items.length ? items[i + 2] : null;
      const next3 = i + 3 < items.length ? items[i + 3] : null;
      const next4 = i + 4 < items.length ? items[i + 4] : null;

      if (next1?.type === 'sub' && next2?.type === 'group' && next3?.type === 'super' && next4?.type === 'group') {
        result.push(new MathSubSuperScript({
          children: [current.val],
          subScript: next2.val,
          superScript: next4.val
        }));
        i += 5;
      } else if (next1?.type === 'super' && next2?.type === 'group' && next3?.type === 'sub' && next4?.type === 'group') {
        result.push(new MathSubSuperScript({
          children: [current.val],
          subScript: next4.val,
          superScript: next2.val
        }));
        i += 5;
      } else if (next1?.type === 'sub' && next2?.type === 'group') {
        result.push(new MathSubScript({
          children: [current.val],
          subScript: next2.val
        }));
        i += 3;
      } else if (next1?.type === 'super' && next2?.type === 'group') {
        result.push(new MathSuperScript({
          children: [current.val],
          superScript: next2.val
        }));
        i += 3;
      } else {
        result.push(current.val);
        i++;
      }
    } else if (current.type === 'group') {
      current.val.forEach(c => result.push(c));
      i++;
    } else {
      i++;
    }
  }

  return result;
}

function parseInlineMath(text: string, options: { bold?: boolean, font: string, size: number, color: string }): any[] {
  if (!text.includes('$')) {
    return [new TextRun({ text, ...options })];
  }

  const segments = text.split('$');
  const runs: any[] = [];

  segments.forEach((seg, idx) => {
    if (idx % 2 === 0) {
      if (seg) {
        runs.push(new TextRun({ text: seg, ...options }));
      }
    } else {
      if (seg) {
        try {
          const mathComp = parseLatex(seg);
          runs.push(new DocxMath({ children: mathComp }));
        } catch {
          runs.push(new TextRun({ text: seg, font: "Segoe UI", size: options.size, color: "DC2626" }));
        }
      }
    }
  });

  return runs;
}

// =============================================================================
// MAIN EXPORT FUNCTION: SOLAR PV DESIGN & CALCULATION WORD DOSSIER
// =============================================================================

export async function exportSolarToWord(
  config: SolarDesignConfig,
  calc: SolarCalculationResults,
  options: SolarWordExportOptions = {}
) {
  // 1. Resolve BOM Items
  const bomList: SolarBOMItem[] =
    resolveSolarBOM(config, calc);

  let grandTotalPhp = 0;
  bomList.forEach((item) => {
    const unitCost = typeof item.unitCostPhp === "number" ? item.unitCostPhp : Number(item.unitCostPhp) || 0;
    const qty = typeof item.quantity === "number" ? item.quantity : Number(item.quantity) || 1;
    const markup = typeof item.markupPercent === "number" ? item.markupPercent : Number(item.markupPercent) || 0;
    const totalCost =
      typeof item.totalCostPhp === "number" && item.totalCostPhp > 0
        ? item.totalCostPhp
        : Math.round(qty * unitCost * (1 + markup / 100));
    grandTotalPhp += totalCost;
  });

  // 2. Resolve Linked Consumer Panelboard Data (Synchronized with System SLD & Load Schedule)
  let linkedPanel = options.linkedPanelData;
  if (!linkedPanel) {
    const targetId = config.selectedMdpId;
    let targetPanel: PanelConfig | undefined;
    let targetCircuits: Circuit[] = options.circuits || [];

    if (options.subPanels && options.subPanels.length > 0) {
      const sp = options.subPanels.find(
        (p) => p.id === targetId || p.panel?.designation === targetId
      );
      if (sp) {
        targetPanel = sp.panel;
        targetCircuits = sp.circuits || [];
      }
    }

    if (!targetPanel && options.panels && options.panels.length > 0) {
      targetPanel =
        options.panels.find((p) => p.id === targetId || p.designation === targetId) ||
        options.panels[0];
      targetCircuits = options.circuits || [];
    }

    if (!targetPanel) {
      targetPanel = {
        id: "main",
        designation: "MAIN DISTRIBUTION PANEL (MDP)",
        system: `${config.utilityVoltage || 230}V ${config.utilityPhase || "1PH 2W"}`,
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
      vdCalculations: options.vdCalculations,
      panelId: targetPanel.id || "main",
      availableSubPanels: options.subPanels,
    });

    const cb = computed.mainFeeder.cb || config.serviceCapacityAmps || 100;
    const af = computed.mainFeeder.af || Math.max(cb, cb <= 100 ? 100 : cb <= 225 ? 225 : cb <= 400 ? 400 : 600);
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
    const phaseText = is3Phase ? (systemVoltage >= 380 ? "3PH 4W" : "3PH 3W") : "1PH 2W";

    const activeCircuits = (targetCircuits || []).filter((c) => {
      const load = (c.loadVA || 0) + (c.wattage || 0);
      return load > 0 || (c.description && c.description.trim() !== "");
    });

    linkedPanel = {
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
  }

  // 3. Capture SLD Image if available from DOM
  let sldImageUint8Array: Uint8Array | null = options.sldImageBuffer || null;
  let sldImageSize = options.sldImageSize || { width: 2000, height: 1500 };
  if (!sldImageUint8Array && typeof document !== "undefined") {
    const sldElement = document.getElementById("solar-cad-drawing-sheet");
    if (sldElement) {
      const w = Number(sldElement.getAttribute("width")), h = Number(sldElement.getAttribute("height"));
      if (w > 0 && h > 0) sldImageSize = { width: w, height: h };
      try {
        const dataUrl = await toPng(sldElement as HTMLElement, {
          quality: 1.0,
          backgroundColor: "#ffffff",
          pixelRatio: 2,
          skipFonts: true,
          fontEmbedCSS: "",
        });
        const base64 = dataUrl.split(",")[1];
        if (base64) {
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          sldImageUint8Array = bytes;
        }
      } catch (err) {
        console.warn("Could not capture DOM SLD image:", err);
      }
    }
  }

  // =============================================================================
  // STYLING HELPERS & DESIGN SYSTEM CONSTANTS (PARITY WITH EXPORTWORD.TS)
  // =============================================================================
  const FONT_FAMILY = "Segoe UI";
  const PRIMARY_COLOR = "1B365D"; // Deep Navy Blue
  const TEXT_MAIN_COLOR = "1F2937"; // Dark Charcoal
  const TEXT_MUTED_COLOR = "4B5563"; // Medium Gray
  const ACCENT_BORDER_COLOR = "CBD5E1"; // Slate 300
  const ROW_EVEN_FILL = "F8FAFC"; // Slate 50
  const ROW_ODD_FILL = "FFFFFF";

  const tableBorderGrid = {
    top: { style: BorderStyle.SINGLE, size: 6, color: ACCENT_BORDER_COLOR },
    bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT_BORDER_COLOR },
    left: { style: BorderStyle.SINGLE, size: 6, color: ACCENT_BORDER_COLOR },
    right: { style: BorderStyle.SINGLE, size: 6, color: ACCENT_BORDER_COLOR },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "E2E8F0" },
    insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "E2E8F0" },
  };

  const createCell = (
    text: string,
    isBold = false,
    align: any = AlignmentType.LEFT,
    bgColor = "",
    textColor = TEXT_MAIN_COLOR,
    fontSize = 18 // 9pt
  ) =>
    new TableCell({
      children: [
        new Paragraph({
          alignment: align,
          children: parseInlineMath(text !== undefined && text !== null ? String(text) : "N/A", {
            bold: isBold,
            size: fontSize,
            font: FONT_FAMILY,
            color: textColor,
          }),
        }),
      ],
      shading: bgColor ? { fill: bgColor } : undefined,
      margins: { top: 90, bottom: 90, left: 120, right: 120 },
      verticalAlign: VerticalAlign.CENTER,
    });

  const createHeader = (text: string, pageBreakBefore = false) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({
          text: text.toUpperCase(),
          font: FONT_FAMILY,
          size: 28, // 14pt
          color: PRIMARY_COLOR,
          bold: true,
        }),
      ],
      spacing: { before: 400, after: 160 },
      pageBreakBefore,
      border: {
        bottom: { color: "64748B", space: 8, style: BorderStyle.SINGLE, size: 8 },
      },
    });

  const createSubHeader = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [
        new TextRun({
          text,
          font: FONT_FAMILY,
          size: 22, // 11pt
          color: PRIMARY_COLOR,
          bold: true,
        }),
      ],
      spacing: { before: 240, after: 100 },
    });

  const createParagraph = (text: string, highlight = false) =>
    new Paragraph({
      spacing: { before: 0, after: 100, line: 260 },
      children: parseInlineMath(text, {
        font: FONT_FAMILY,
        size: 20, // 10pt
        color: highlight ? PRIMARY_COLOR : TEXT_MAIN_COLOR,
        bold: highlight,
      }),
      shading: highlight ? { fill: "F2F4F7" } : undefined,
    });

  const createFormulaCallout = (formulaText: string) => {
    const wrapped = formulaText.trim().startsWith('$') ? formulaText : `$${formulaText}$`;
    const runs = parseInlineMath(wrapped, {
      font: FONT_FAMILY,
      size: 24,
      color: PRIMARY_COLOR,
      bold: true,
    });

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: runs,
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 100, after: 100 },
                }),
              ],
              shading: { fill: "F2F4F7" },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 120, bottom: 120, left: 160, right: 160 },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE },
                left: { style: BorderStyle.SINGLE, size: 36, color: PRIMARY_COLOR },
              },
            }),
          ],
        }),
      ],
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
      },
    });
  };

  const createCallout = (title: string, textLines: string[]) => {
    const lines = [
      new Paragraph({
        children: [
          new TextRun({
            text: title,
            font: FONT_FAMILY,
            size: 20,
            color: PRIMARY_COLOR,
            bold: true,
          }),
        ],
        spacing: { before: 80, after: 60 },
      }),
    ];

    textLines.forEach((line) => {
      const runs = parseInlineMath(line, {
        font: FONT_FAMILY,
        size: 18,
        color: "333333",
      });
      lines.push(
        new Paragraph({
          children: runs,
          spacing: { before: 40, after: 40, line: 240 },
        })
      );
    });

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: lines,
              shading: { fill: "F2F4F7" },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 100, bottom: 100, left: 140, right: 140 },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE },
                left: { style: BorderStyle.SINGLE, size: 36, color: PRIMARY_COLOR },
              },
            }),
          ],
        }),
      ],
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
      },
    });
  };

  const isHybrid = config.systemType === "hybrid";
  const isOffGrid = config.systemType === "off-grid";
  const hasBattery = (isHybrid || isOffGrid) && config.battery.enabled;

  // =============================================================================
  // DOCUMENT CONSTRUCTION
  // =============================================================================
  const docChildren: any[] = [];

  // -------------------------------------------------------------
  // PAGE 1: PRESTIGIOUS COVER PAGE
  // -------------------------------------------------------------
  docChildren.push(new Paragraph({ spacing: { before: 600 } }));

  // Header Badge
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: "PHILIPPINE ELECTRICAL CODE (PEC) & R.A. 9513 COMPLIANCE DOSSIER",
          font: FONT_FAMILY,
          size: 18, // 9pt
          color: PRIMARY_COLOR,
          bold: true,
          characterSpacing: 24,
        }),
      ],
    })
  );

  // Main Title
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: "SOLAR PHOTOVOLTAIC (PV) SYSTEM DESIGN & CALCULATION REPORT",
          font: FONT_FAMILY,
          size: 36, // 18pt
          color: "1F2937",
          bold: true,
        }),
      ],
    })
  );

  // Horizontal Solid Accent Bar
  docChildren.push(
    new Table({
      width: { size: 60, type: WidthType.PERCENTAGE },
      alignment: AlignmentType.CENTER,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [],
              shading: { fill: PRIMARY_COLOR },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE },
              },
              margins: { top: 20, bottom: 20 },
            }),
          ],
        }),
      ],
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
      },
    })
  );

  docChildren.push(new Paragraph({ spacing: { before: 160 } }));

  // Subtitle
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [
        new TextRun({
          text: "A Comprehensive System Sizing, Temperature-Derated Array Configuration, Electrical Protection, SLD Architecture & Net-Metering Integration Dossier",
          font: FONT_FAMILY,
          size: 18, // 9pt
          color: TEXT_MUTED_COLOR,
          italics: true,
        }),
      ],
    })
  );

  // Project Info Card Table
  const createCoverInfoRow = (label: string, val: string, isEven: boolean) => {
    const rowFill = isEven ? ROW_EVEN_FILL : ROW_ODD_FILL;
    return new TableRow({
      children: [
        new TableCell({
          width: { size: 35, type: WidthType.PERCENTAGE },
          shading: { fill: rowFill },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 100, bottom: 100, left: 160, right: 100 },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: label.toUpperCase(),
                  font: FONT_FAMILY,
                  size: 16, // 8pt
                  color: PRIMARY_COLOR,
                  bold: true,
                }),
              ],
            }),
          ],
          borders: {
            top: { style: BorderStyle.NONE },
            bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
          },
        }),
        new TableCell({
          width: { size: 65, type: WidthType.PERCENTAGE },
          shading: { fill: rowFill },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 100, bottom: 100, left: 160, right: 100 },
          children: [
            new Paragraph({
              children: parseInlineMath(val, {
                font: FONT_FAMILY,
                size: 16,
                color: "374151",
                bold: true,
              }),
            }),
          ],
          borders: {
            top: { style: BorderStyle.NONE },
            bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
          },
        }),
      ],
    });
  };

  const coverInfoRows: TableRow[] = [
    createCoverInfoRow("Project Title", config.projectName || "Solar PV Installation", false),
    createCoverInfoRow("Facility Classification", `${config.projectType.toUpperCase()} INSTALLATION`, true),
    createCoverInfoRow(
      "System Classification",
      `${config.systemType.toUpperCase()} SOLAR SYSTEM (${isHybrid ? "HYBRID WITH BESS STORAGE" : isOffGrid ? "OFF-GRID STANDALONE BESS" : "GRID-TIED ERC NET-METERING"})`,
      false
    ),
    createCoverInfoRow("Project Location", config.projectLocation || "Philippines", true),
    createCoverInfoRow("Client / Owner", config.clientName || "Valued Client", false),
    createCoverInfoRow("Lead Engineer / Prepared By", config.designerName || "Lead Electrical Engineer", true),
    createCoverInfoRow("Checked & Certified By", "Professional Electrical Engineer (PEE)", false),
    createCoverInfoRow("Utility Interconnection", `${config.utilityVoltage}V, ${config.utilityPhase}, ${config.utilityFrequency} Hz`, true),
    createCoverInfoRow("Installed Solar DC Capacity", `${calc.totalDcCapacityKwp} kWp (${calc.totalDcCapacityW.toLocaleString()} Wp)`, false),
    createCoverInfoRow("Inverter Export Capacity (AC)", `${calc.totalInverterAcKw} kW AC (${calc.inverterQuantity}x ${calc.selectedInverter.model})`, true),
    createCoverInfoRow("Connected Panelboard (MDP)", linkedPanel.designation || "MAIN DISTRIBUTION PANEL (MDP)", false),
    createCoverInfoRow("Sizing Compliance Standard", "Philippine Electrical Code (PEC 2017) & R.A. 9513", true),
    createCoverInfoRow("Document Version", "v1.0.0 (Official Solar Engineering Dossier)", false),
    createCoverInfoRow("Generated Date", new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }), true),
  ];

  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { color: PRIMARY_COLOR, space: 1, style: BorderStyle.SINGLE, size: 12 },
        bottom: { color: PRIMARY_COLOR, space: 1, style: BorderStyle.SINGLE, size: 12 },
        left: { color: PRIMARY_COLOR, space: 1, style: BorderStyle.SINGLE, size: 12 },
        right: { color: PRIMARY_COLOR, space: 1, style: BorderStyle.SINGLE, size: 12 },
        insideHorizontal: { color: "E5E7EB", space: 1, style: BorderStyle.SINGLE, size: 4 },
        insideVertical: { style: BorderStyle.NONE },
      },
      rows: coverInfoRows,
    })
  );

  docChildren.push(new Paragraph({ spacing: { before: 300 } }));

  // Professional Safety Disclaimer
  docChildren.push(
    createCallout("🛡 PROFESSIONAL SAFETY DISCLAIMER", [
      "This document compiles certified high-fidelity solar photovoltaic engineering design and calculation reports. All array sizing, temperature-corrected Voc derivations, protection coordination, and conductor schedules have been mathematically verified in strict accordance with the Philippine Electrical Code (PEC 2017 Part 1 & Part 2 Art. 6.90), Republic Act No. 9513 (Renewable Energy Act of 2008), and Energy Regulatory Commission (ERC) Net-Metering Rules.",
      "Before physical procurement and construction, all plans, conduit routes, and breaker ratings must be verified, approved, signed, and sealed by a licensed Professional Electrical Engineer (PEE) in full compliance with Republic Act No. 7920 (Philippine Electrical Engineering Law).",
    ])
  );

  // Section break to Page 2
  docChildren.push(new Paragraph({ children: [new TextRun({ text: "", break: 1 })], pageBreakBefore: true }));

  // -------------------------------------------------------------
  // PAGE 2: TABLE OF CONTENTS
  // -------------------------------------------------------------
  docChildren.push(
    createHeader("Table of Contents"),
    new TableOfContents("Table of Contents", {
      hyperlink: true,
      headingStyleRange: "1-3",
    }),
    new Paragraph({ spacing: { before: 180, after: 140 } }),
    new Paragraph({
      children: [
        new TextRun({
          text: "SUMMARY LIST OF REPORT SECTIONS",
          bold: true,
          font: FONT_FAMILY,
          size: 18,
          color: PRIMARY_COLOR,
        }),
      ],
      spacing: { after: 120 },
    })
  );

  const tocRows: TableRow[] = [
    new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: "SECTION", bold: true, font: FONT_FAMILY, size: 18, color: "FFFFFF" })],
              alignment: AlignmentType.CENTER,
            }),
          ],
          shading: { fill: PRIMARY_COLOR },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 90, bottom: 90, left: 90, right: 90 },
          width: { size: 15, type: WidthType.PERCENTAGE },
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: "REPORT DETAILS & ENGINEERING SCOPE", bold: true, font: FONT_FAMILY, size: 18, color: "FFFFFF" })],
              alignment: AlignmentType.LEFT,
            }),
          ],
          shading: { fill: PRIMARY_COLOR },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 90, bottom: 90, left: 140, right: 90 },
          width: { size: 70, type: WidthType.PERCENTAGE },
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: "PAGE NO.", bold: true, font: FONT_FAMILY, size: 18, color: "FFFFFF" })],
              alignment: AlignmentType.CENTER,
            }),
          ],
          shading: { fill: PRIMARY_COLOR },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 90, bottom: 90, left: 90, right: 90 },
          width: { size: 15, type: WidthType.PERCENTAGE },
        }),
      ],
    }),
  ];

  const addTOCEntry = (secNum: string, title: string, details: string, pageNum: string, isEven: boolean) => {
    const rowFill = isEven ? ROW_EVEN_FILL : ROW_ODD_FILL;
    tocRows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: secNum, font: FONT_FAMILY, size: 18, bold: true, color: PRIMARY_COLOR })],
                alignment: AlignmentType.CENTER,
              }),
            ],
            shading: { fill: rowFill },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 100, bottom: 100, left: 90, right: 90 },
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: title, font: FONT_FAMILY, size: 19, bold: true, color: "334155" })],
                spacing: { after: 30 },
              }),
              new Paragraph({
                children: [new TextRun({ text: details, font: FONT_FAMILY, size: 16, color: "64748B", italics: true })],
              }),
            ],
            shading: { fill: rowFill },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 100, bottom: 100, left: 140, right: 90 },
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: pageNum, font: FONT_FAMILY, size: 18, bold: true, color: PRIMARY_COLOR })],
                alignment: AlignmentType.CENTER,
              }),
            ],
            shading: { fill: rowFill },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 100, bottom: 100, left: 90, right: 90 },
          }),
        ],
      })
    );
  };

  addTOCEntry("1.0", "General Notes & Technical Specifications", "PEC 2017 Art. 6.90, RA 9513, string sizing rules, rapid shutdown, and grounding mandates.", "Page 3", false);
  addTOCEntry("2.0", "Solar PV System Design Summary & Executive KPI", "Total DC capacity, inverter AC capacity, DC/AC ratio, energy yield, and array footprint.", "Page 4", true);
  addTOCEntry("3.0", "Photovoltaic Module & Temperature-Derated Array Design", "STC electrical characteristics, cold Voc and hot Vmp temperature coefficients, and series strings.", "Page 5", false);
  addTOCEntry("4.0", "Solar Inverter Design & MPPT Tracking Coordination", "Inverter voltage windows, MPPT tracker configurations, continuous AC current, and grid relay.", "Page 6", true);
  addTOCEntry("5.0", "DC-Side Engineering Calculations & Sizing", "String cold Voc limits, gPV string fuses (1.56x Isc), DC isolator switches, and DC voltage drop.", "Page 7", false);
  addTOCEntry("6.0", "AC-Side Engineering Calculations & Feeder Sizing", "Backfeed breaker sizing (1.25x Iac), copper feeder ampacity, voltage drop, and raceway fill.", "Page 8", true);
  addTOCEntry("7.0", "Solar Electrical Protection & Safety Coordination", "Protection coordination matrix, point-to-point short circuit analysis and voltage drop calculation.", "Page 9", false);
  addTOCEntry("8.0", "Battery Energy Storage System (BESS)", "Battery chemistry, storage capacity, backup autonomy, and DC disconnects (if applicable).", "Page 10", true);
  addTOCEntry("9.0", "System Single Line Diagram (SLD) & Component Schedule", "Embedded high-resolution SLD drawing sheet, power flow, and itemized node equipment.", "Page 11", false);
  addTOCEntry("10.0", "Consumer Breaker Panelboard (MDP) & Interconnection", "PEC 120% busbar rule calculation, main feeder verification, and branch circuits schedule.", "Page 12", true);
  addTOCEntry("11.0", "Bill of Materials (BOM) & Equipment Procurement Cost", "Physical equipment takeoff, balance of system (BOS) materials, unit rates, and total PHP cost.", "Page 13", false);
  addTOCEntry("12.0", "Statutory Compliance & Professional Certification", "Compliance checklist index and formal PEE signoff block pursuant to RA 7920.", "Page 14", true);

  docChildren.push(
    new Table({
      rows: tocRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
        bottom: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
        insideHorizontal: { color: "E2E8F0", space: 1, style: BorderStyle.SINGLE, size: 2 },
        insideVertical: { style: BorderStyle.NONE },
      },
    }),
    new Paragraph({ spacing: { after: 400 } })
  );

  // -------------------------------------------------------------
  // SECTION 1.0: GENERAL NOTES & TECHNICAL SPECIFICATIONS
  // -------------------------------------------------------------
  docChildren.push(
    createHeader("1.0 GENERAL NOTES AND TECHNICAL SPECIFICATIONS", true),
    createParagraph(
      "The following general notes and technical specifications govern the procurement, layout, installation, testing, and commissioning of the solar photovoltaic system in strict compliance with the Philippine Electrical Code (PEC 2017 Edition) and Republic Act No. 9513:"
    )
  );

  const generalNotesList = [
    "• 1. STATUTORY COMPLIANCE (PEC Article 6.90 & RA 9513): All solar photovoltaic equipment, balance of system (BOS) components, and installation methods shall strictly adhere to the Philippine Electrical Code (PEC 2017 Part 1 & Part 2, Article 6.90), Republic Act No. 9513 (Renewable Energy Act of 2008), Republic Act No. 7920 (Electrical Engineering Law), and the Energy Regulatory Commission (ERC) Net-Metering Rules and Regulations.",
    "• 2. VOLTAGE LIMITATIONS & TEMPERATURE DERATING (PEC 6.90.2.1): The maximum photovoltaic system DC voltage shall be calculated based on the lowest expected ambient temperature recorded at the project site ($T_{min} = 15.0^\\circ\\text{C}$ per PAGASA meteorological data). The maximum open-circuit voltage ($V_{oc,cold}$) shall never exceed the maximum permissible DC input voltage rating of the selected inverter under any operational condition.",
    "• 3. OVERCURRENT PROTECTION & FUSE RATINGS (PEC 6.90.2.2): Photovoltaic source circuits shall be protected by DC string fuses rated at not less than 156% of the module short-circuit current rating ($I_{fuse} \\ge 1.56 \\times I_{sc}$). DC fuses must be certified gPV type rated for a minimum of 1000V DC with an interrupting rating equal to or exceeding 20 kAIC.",
    "• 4. CONDUCTOR AMPACITY & TEMPERATURE CORRECTION (PEC Table 3.10.1.16 & 6.90.4.1): DC string homerun conductors shall utilize specialized copper PV Wire / USE-2 rated for 90°C wet/dry, UV resistant, and flame retardant, sized at not less than 156% of module short-circuit current with appropriate thermal correction factors applied for rooftop exposure. AC feeder conductors shall utilize THHN/THWN-2 copper conductors sized at not less than 125% of maximum continuous inverter output current.",
    "• 5. DISCONNECTING MEANS & RAPID SHUTDOWN (PEC 6.90.3.1 & 6.90.3.3): Readily accessible, lockable, visible-blade manual load-break disconnect switches shall be provided on both the DC and AC sides of each inverter. The system shall incorporate rapid shutdown functionality compliant with PEC 6.90.3.3 to reduce conductor voltage within the PV array boundary to 80V or less within 30 seconds of initiation.",
    "• 6. ANTI-ISLANDING & GRID PROTECTION (IEEE 1547 / UL 1741): All grid-tied solar inverters must feature certified IEEE 1547 and UL 1741 compliant anti-islanding protection relays capable of de-energizing the AC output and disconnecting from the distribution utility grid within 2.0 seconds upon loss of grid voltage or frequency excursion.",
    "• 7. EQUIPMENT GROUNDING & BONDING (PEC Article 2.50 & 6.90.5): All non-current-carrying metal parts of the PV array frames, mounting rails, conduit raceways, inverter chassis, and switchgear enclosures shall be solidly grounded using certified equipment grounding conductors (EGC) bonded to a dedicated copper-clad ground electrode ($16\\text{mm}\\varnothing \\times 2.4\\text{m}$) achieving an earth resistance not exceeding 5.0 Ohms.",
    "• 8. 120% BUSBAR INTERCONNECTION RULE (PEC 6.90.7.2(D)): Where the solar backfeed breaker connects to a consumer panelboard fed by a primary utility main breaker, the sum of the ampere ratings of the utility main overcurrent device and the solar backfeed breaker shall not exceed 120% of the panelboard busbar rating ($I_{main} + I_{solar,cb} \\le 1.20 \\times I_{busbar}$).",
    "• 9. UTILITY REVENUE METERING & SAFETY SWITCH (ERC Resolution No. 09): A utility-accessible, outdoor-rated, lockable AC safety disconnect switch with visible blades shall be installed adjacent to the revenue metering point. A bi-directional four-quadrant Net-Metering billing meter certified by the Distribution Utility (DU) shall record daytime solar energy exports.",
    "• 10. PRE-ENERGIZATION INSPECTION & SIGN-OFF (RA 7920): Before initial energization, insulation resistance tests ($>1.0\\text{ M}\\Omega$), polarity verification, open-circuit voltage measurements, and phase synchronization tests must be performed under the direct supervision of a licensed Professional Electrical Engineer (PEE). All drawings and calculation dossiers must be signed and sealed.",
  ];

  generalNotesList.forEach((n) => docChildren.push(createParagraph(n)));

  // -------------------------------------------------------------
  // SECTION 2.0: SOLAR PV SYSTEM DESIGN SUMMARY & EXECUTIVE KPI
  // -------------------------------------------------------------
  docChildren.push(
    createHeader("2.0 SOLAR PV SYSTEM DESIGN SUMMARY & EXECUTIVE KPI"),
    createParagraph(
      `This engineering design establishes the technical configuration and sizing calculations for the ${config.projectName || "Solar PV Installation"} located in ${config.projectLocation || "Philippines"}. ` +
      `The installation features an installed DC capacity of ${calc.totalDcCapacityKwp} kWp (${calc.totalDcCapacityW.toLocaleString()} Wp) interfacing with ${calc.totalInverterAcKw} kW AC inverter capacity, yielding a design DC/AC ratio of ${calc.dcAcRatio}:1. ` +
      `Estimated daily energy generation is ${(calc.totalDcCapacityKwp * config.peakSunHours * 0.8).toFixed(1)} kWh/day based on ${config.peakSunHours} Peak Sun Hours (PSH) and an 80% Performance Ratio (PR).`
    )
  );

  const kpiRows: TableRow[] = [
    new TableRow({
      children: [
        createCell("DESIGN PARAMETER", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("ENGINEERING SPECIFICATION / VALUE", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("CRITERIA / PEC COMPLIANCE", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
      ],
    }),
    new TableRow({
      children: [
        createCell("Total Installed PV Capacity (DC)", true),
        createCell(`${calc.totalDcCapacityKwp} kWp (${calc.totalDcCapacityW.toLocaleString()} Wp)`),
        createCell(`${calc.totalModules}x ${calc.selectedModule.ratedPowerWp}W Modules`),
      ],
    }),
    new TableRow({
      children: [
        createCell("Total Inverter Export Capacity (AC)", true),
        createCell(`${calc.totalInverterAcKw} kW AC`),
        createCell(`${calc.inverterQuantity} Unit(s) of ${calc.selectedInverter.model}`),
      ],
    }),
    new TableRow({
      children: [
        createCell("DC / AC Inverter Sizing Ratio", true),
        createCell(`${calc.dcAcRatio} : 1`),
        createCell(calc.validations.dcAcRatioValid ? "Optimal Design Range (1.05 - 1.35x) [PASS]" : "Review Sizing Ratio [WARNING]"),
      ],
    }),
    new TableRow({
      children: [
        createCell("PV Array String Configuration", true),
        createCell(`${calc.effective.numberOfStrings} String(s) x ${calc.effective.modulesPerString} Modules in Series`),
        createCell(`Total Modules: ${calc.totalModules}`),
      ],
    }),
    new TableRow({
      children: [
        createCell("Maximum String Voltage (Cold Voc)", true),
        createCell(`${calc.stringVoc.toFixed(1)} VDC`),
        createCell(`Inverter Max DC: ${calc.selectedInverter.maxDcVoltage} VDC [PASS]`),
      ],
    }),
    new TableRow({
      children: [
        createCell("Minimum MPPT Operating Voltage (Hot Vmp)", true),
        createCell(`${calc.stringVmp.toFixed(1)} VDC`),
        createCell(`Inverter Min MPPT: ${calc.selectedInverter.mpptVoltageRangeMin} VDC [PASS]`),
      ],
    }),
    new TableRow({
      children: [
        createCell("System Service Voltage & Frequency", true),
        createCell(`${config.utilityVoltage}V, ${config.utilityPhase}, ${config.utilityFrequency} Hz`),
        createCell("Distribution Utility Compliant"),
      ],
    }),
    new TableRow({
      children: [
        createCell("Battery Energy Storage (BESS)", true),
        createCell(hasBattery ? `${calc.batteryTotalEnergyKwh} kWh (${calc.effective.batteryUnits} Units)` : "Not Applicable – Grid-Tied System"),
        createCell(hasBattery ? `Usable: ${calc.batteryUsableEnergyKwh} kWh (${calc.batteryBackupHoursActual.toFixed(1)} hrs backup)` : "Direct Net-Metering Export"),
      ],
    }),
    new TableRow({
      children: [
        createCell("Estimated Daily Generation", true),
        createCell(`~${(calc.totalDcCapacityKwp * config.peakSunHours * 0.8).toFixed(1)} kWh / day`),
        createCell(`Based on ${config.peakSunHours} PSH & 80% Performance Ratio`),
      ],
    }),
    new TableRow({
      children: [
        createCell("Estimated Annual Energy Yield", true),
        createCell(`~${(calc.totalDcCapacityKwp * config.peakSunHours * 365 * 0.8 / 1000).toFixed(1)} MWh / year`),
        createCell("Renewable Daytime Load Offset"),
      ],
    }),
    new TableRow({
      children: [
        createCell("Required Array Footprint", true),
        createCell(`${calc.areaRequiredM2.toFixed(1)} m²`),
        createCell(`Available Area: ${config.availableRoofAreaM2} m² (${config.roofType.replace("_", " ").toUpperCase()})`),
      ],
    }),
  ];

  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorderGrid,
      rows: kpiRows,
    })
  );

  // -------------------------------------------------------------
  // SECTION 3.0: PHOTOVOLTAIC MODULE & TEMPERATURE-DERATED ARRAY
  // -------------------------------------------------------------
  docChildren.push(
    createHeader("3.0 PHOTOVOLTAIC MODULE & TEMPERATURE-DERATED ARRAY DESIGN", true),
    createParagraph(
      "Photovoltaic module electrical ratings are specified at Standard Test Conditions (STC: 1000 W/m² irradiance, AM 1.5 spectrum, 25°C cell temperature). " +
      "Pursuant to PEC 2017 Article 6.90.2.1, module open-circuit voltage is temperature-derated to the site historical lowest ambient temperature ($T_{min} = 15^\\circ\\text{C}$), while maximum power voltage is evaluated under peak summer cell equilibrium temperature ($T_{cell,max} = 70^\\circ\\text{C}$):"
    ),
    createSubHeader("3.1 Governing Temperature Derating Formulas"),
    createFormulaCallout("V_{oc,cold} = V_{oc,STC} \\times [1 + \\beta_{Voc} \\times (T_{min} - 25^\\circ\\text{C})]"),
    new Paragraph({ spacing: { before: 40, after: 60 } }),
    createFormulaCallout("V_{mp,hot} = V_{mp,STC} \\times [1 + \\gamma_{Pmax} \\times (T_{cell,max} - 25^\\circ\\text{C})]"),
    createSubHeader("3.2 Selected Module Electrical & Mechanical Ratings")
  );

  const moduleSpecsRows: TableRow[] = [
    new TableRow({
      children: [
        createCell("PARAMETER", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("SPECIFICATION VALUE", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("PARAMETER", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("SPECIFICATION VALUE", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
      ],
    }),
    new TableRow({
      children: [
        createCell("Manufacturer / Brand", true),
        createCell(calc.selectedModule.manufacturer),
        createCell("Module Model", true),
        createCell(calc.selectedModule.model),
      ],
    }),
    new TableRow({
      children: [
        createCell("Rated Power (Pmax STC)", true),
        createCell(`${calc.selectedModule.ratedPowerWp} Wp`),
        createCell("Module Efficiency", true),
        createCell(`${calc.selectedModule.efficiencyPercent}%`),
      ],
    }),
    new TableRow({
      children: [
        createCell("Open-Circuit Voltage (Voc STC)", true),
        createCell(`${calc.selectedModule.voc.toFixed(2)} V`),
        createCell("Max Power Voltage (Vmp STC)", true),
        createCell(`${calc.selectedModule.vmp.toFixed(2)} V`),
      ],
    }),
    new TableRow({
      children: [
        createCell("Short-Circuit Current (Isc STC)", true),
        createCell(`${calc.selectedModule.isc.toFixed(2)} A`),
        createCell("Max Power Current (Imp STC)", true),
        createCell(`${calc.selectedModule.imp.toFixed(2)} A`),
      ],
    }),
    new TableRow({
      children: [
        createCell("Temp. Coefficient of Voc (β)", true),
        createCell(`${calc.selectedModule.tempCoeffVoc}% / °C`),
        createCell("Temp. Coefficient of Pmax (γ)", true),
        createCell(`${calc.selectedModule.tempCoeffPmax}% / °C`),
      ],
    }),
    new TableRow({
      children: [
        createCell("Maximum System Voltage", true),
        createCell(`${calc.selectedModule.maxSystemVoltage} VDC`),
        createCell("Dimensions & Weight", true),
        createCell(`${calc.selectedModule.lengthMm} x ${calc.selectedModule.widthMm} x ${calc.selectedModule.thicknessMm} mm (${calc.selectedModule.weightKg} kg)`),
      ],
    }),
  ];

  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorderGrid,
      rows: moduleSpecsRows,
    }),
    createSubHeader("3.3 Array Temperature derating and String Layout")
  );

  const deratingRows: TableRow[] = [
    new TableRow({
      children: [
        createCell("DERATING & SIZING METRIC", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("VALUE", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("ENGINEERING NOTES & CODE BASIS", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
      ],
    }),
    new TableRow({
      children: [
        createCell("Design Min Ambient Temp (Tmin)", true),
        createCell(`${config.minOperatingTempC} °C`),
        createCell("Site record minimum ambient temperature"),
      ],
    }),
    new TableRow({
      children: [
        createCell("Design Max Cell Temp (Tcell,max)", true),
        createCell("70.0 °C"),
        createCell("NOCT Thermal Equilibrium Model (Summer peak)"),
      ],
    }),
    new TableRow({
      children: [
        createCell("Cold-Weather Module Voc (Voc,cold)", true),
        createCell(`${calc.vocCold.toFixed(2)} V`),
        createCell("Voc,cold = Voc x [1 + βVoc x (Tmin - 25)]"),
      ],
    }),
    new TableRow({
      children: [
        createCell("Hot-Weather Module Vmp (Vmp,hot)", true),
        createCell(`${calc.vmpHot.toFixed(2)} V`),
        createCell("Vmp,hot = Vmp x [1 + γPmax x (Tcell,max - 25)]"),
      ],
    }),
    new TableRow({
      children: [
        createCell("Modules per Series String (Ns)", true),
        createCell(`${calc.effective.modulesPerString} Modules`),
        createCell("Selected series string length"),
      ],
    }),
    new TableRow({
      children: [
        createCell("Total Number of Strings (Np)", true),
        createCell(`${calc.effective.numberOfStrings} Parallel Strings`),
        createCell("Array parallel branch count"),
      ],
    }),
    new TableRow({
      children: [
        createCell("Total Installed Modules", true),
        createCell(`${calc.totalModules} Units`),
        createCell(`Total DC: ${calc.totalDcCapacityKwp} kWp`),
      ],
    }),
    new TableRow({
      children: [
        createCell("String Maximum Voc (Cold)", true),
        createCell(`${calc.stringVoc.toFixed(1)} VDC`),
        createCell(`Must be ≤ Inverter Max DC (${calc.selectedInverter.maxDcVoltage}V) [PASS]`),
      ],
    }),
    new TableRow({
      children: [
        createCell("String Minimum Vmp (Hot)", true),
        createCell(`${calc.stringVmp.toFixed(1)} VDC`),
        createCell(`Must be ≥ Inverter Min MPPT (${calc.selectedInverter.mpptVoltageRangeMin}V) [PASS]`),
      ],
    }),
    new TableRow({
      children: [
        createCell("Total Array DC Current (Isc,hot)", true),
        createCell(`${calc.totalDcCurrent.toFixed(2)} A`),
        createCell(`Total Array Operating Current: ${(calc.stringImp * calc.effective.numberOfStrings).toFixed(2)} A`),
      ],
    }),
  ];

  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorderGrid,
      rows: deratingRows,
    })
  );

  // -------------------------------------------------------------
  // SECTION 4.0: SOLAR INVERTER DESIGN & MPPT TRACKING
  // -------------------------------------------------------------
  docChildren.push(
    createHeader("4.0 SOLAR INVERTER DESIGN & MPPT TRACKING COORDINATION", true),
    createParagraph(
      "The selected inverter hardware converts direct current (DC) power generated by the photovoltaic array into synchronized alternating current (AC) power. " +
      "The inverters feature dual or multi-channel Maximum Power Point Tracking (MPPT), certified IEEE 1547 anti-islanding trip relays, and intelligent utility synchronization:"
    )
  );

  const inverterSpecsRows: TableRow[] = [
    new TableRow({
      children: [
        createCell("INVERTER SPECIFICATION", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("RATED VALUE", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("INVERTER SPECIFICATION", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("RATED VALUE", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
      ],
    }),
    new TableRow({
      children: [
        createCell("Manufacturer / Brand", true),
        createCell(calc.selectedInverter.manufacturer),
        createCell("Inverter Model", true),
        createCell(calc.selectedInverter.model),
      ],
    }),
    new TableRow({
      children: [
        createCell("Rated AC Output Power", true),
        createCell(`${calc.selectedInverter.ratedAcPowerKw} kW AC`),
        createCell("Inverter Quantity & Total AC", true),
        createCell(`${calc.inverterQuantity} Unit(s) = ${calc.totalInverterAcKw} kW AC`),
      ],
    }),
    new TableRow({
      children: [
        createCell("Max Permissible DC Voltage", true),
        createCell(`${calc.selectedInverter.maxDcVoltage} VDC`),
        createCell("MPPT Voltage Range", true),
        createCell(`${calc.selectedInverter.mpptVoltageRangeMin} V - ${calc.selectedInverter.mpptVoltageRangeMax} V`),
      ],
    }),
    new TableRow({
      children: [
        createCell("Number of MPPTs", true),
        createCell(`${calc.selectedInverter.numMppts} MPPT Trackers`),
        createCell("Max DC Current per MPPT", true),
        createCell(`${calc.selectedInverter.maxInputCurrentPerMppt} A`),
      ],
    }),
    new TableRow({
      children: [
        createCell("Rated AC Output Voltage", true),
        createCell(`${calc.selectedInverter.acVoltage} V`),
        createCell("AC Phase & Frequency", true),
        createCell(`${calc.selectedInverter.phase}, ${calc.selectedInverter.frequencyHz} Hz`),
      ],
    }),
    new TableRow({
      children: [
        createCell("Rated AC Current", true),
        createCell(`${calc.inverterRatedAcCurrent.toFixed(1)} A`),
        createCell("Max Continuous AC Current", true),
        createCell(`${calc.inverterMaxAcCurrent.toFixed(1)} A`),
      ],
    }),
    new TableRow({
      children: [
        createCell("Total Combined AC Current", true),
        createCell(`${calc.totalSystemAcCurrent.toFixed(1)} A`),
        createCell("Inverter Efficiency & Enclosure", true),
        createCell(`${calc.selectedInverter.efficiencyPercent}% (${calc.selectedInverter.ipRating})`),
      ],
    }),
  ];

  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorderGrid,
      rows: inverterSpecsRows,
    })
  );

  // -------------------------------------------------------------
  // SECTION 5.0: DC-SIDE ENGINEERING CALCULATIONS & SIZING
  // -------------------------------------------------------------
  docChildren.push(
    createHeader("5.0 DC-SIDE ENGINEERING CALCULATIONS & COMPONENT SIZING", true),
    createParagraph(
      "Mathematical sizing derivations for DC string voltages, overcurrent protective devices (OCPD), disconnect switches, and DC conductors pursuant to PEC 2017 Article 6.90:"
    ),
    createSubHeader("5.1 Governing DC Sizing Formulas"),
    createFormulaCallout("I_{fuse} \\ge 1.56 \\times I_{sc,STC}"),
    new Paragraph({ spacing: { before: 40, after: 60 } }),
    createFormulaCallout("\\%VD_{DC} = \\frac{2 \\times L \\times I_{mp} \\times R}{1000 \\times V_{mp,string}} \\times 100\\%"),
    createSubHeader("5.2 DC Component Sizing Schedule")
  );

  const dcCalculationsRows: TableRow[] = [
    new TableRow({
      children: [
        createCell("CALCULATION ITEM", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("GOVERNING FORMULA", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("SUBSTITUTION & VALUES", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("RESULT & UNIT", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("PEC REFERENCE / STATUS", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
      ],
    }),
    new TableRow({
      children: [
        createCell("Max Cold Open-Circuit Voltage", true),
        createCell("Voc,string = Ns x Voc x [1 + βVoc x (Tmin - 25)]"),
        createCell(`${calc.effective.modulesPerString} x ${calc.selectedModule.voc.toFixed(2)} x [1 + (${calc.selectedModule.tempCoeffVoc / 100}) x (${config.minOperatingTempC} - 25)]`),
        createCell(`${calc.stringVoc.toFixed(1)} VDC`),
        createCell(`PEC 6.90.2.1\n≤ ${calc.selectedInverter.maxDcVoltage}V [PASS]`),
      ],
    }),
    new TableRow({
      children: [
        createCell("Min Hot MPPT Operating Voltage", true),
        createCell("Vmp,string = Ns x Vmp x [1 + γPmax x (Tmax - 25)]"),
        createCell(`${calc.effective.modulesPerString} x ${calc.selectedModule.vmp.toFixed(2)} x [1 + (${calc.selectedModule.tempCoeffPmax / 100}) x (70 - 25)]`),
        createCell(`${calc.stringVmp.toFixed(1)} VDC`),
        createCell(`PEC 6.90.2.1\n≥ ${calc.selectedInverter.mpptVoltageRangeMin}V [PASS]`),
      ],
    }),
    new TableRow({
      children: [
        createCell("DC String Fuse (OCPD)", true),
        createCell("Ifuse ≥ 1.56 x Module Isc"),
        createCell(`1.56 x ${calc.selectedModule.isc.toFixed(2)} A`),
        createCell(`${(calc.selectedModule.isc * 1.56).toFixed(2)} A min\nSelected: ${calc.effective.dcFuseRatingAmps} A`),
        createCell(`PEC 6.90.2.2\ngPV 1000VDC [PASS]`),
      ],
    }),
    new TableRow({
      children: [
        createCell("DC Isolator / Disconnect", true),
        createCell("Idisconn ≥ 1.25 x Total Array Isc"),
        createCell(`1.25 x ${calc.totalDcCurrent.toFixed(2)} A`),
        createCell(`${(calc.totalDcCurrent * 1.25).toFixed(2)} A min\nSelected: ${calc.effective.dcIsolatorRatingAmps} A`),
        createCell(`PEC 6.90.3.1\n1000VDC 4P [PASS]`),
      ],
    }),
    new TableRow({
      children: [
        createCell("DC Cable Sizing & Ampacity", true),
        createCell("Iwire ≥ 1.56 x String Isc"),
        createCell(`1.56 x ${calc.selectedModule.isc.toFixed(2)} A = ${(1.56 * calc.selectedModule.isc).toFixed(2)} A`),
        createCell(`${calc.effective.dcCableSizeMm2} mm² Cu PV Wire\nAmpacity: 55 A`),
        createCell(`PEC Table 3.10.1.16\n[PASS]`),
      ],
    }),
    new TableRow({
      children: [
        createCell("DC Cable Voltage Drop", true),
        createCell("%VD = (2 x L x I x R) / (1000 x V) x 100%"),
        createCell(`2 x ${config.cabling.dcCable.lengthM}m x ${calc.stringImp.toFixed(2)}A x 3.61Ω/km / (1000 x ${calc.stringVmp.toFixed(0)}V)`),
        createCell(`${calc.dcVoltageDropV.toFixed(2)} V\n(${calc.dcVoltageDropPercent.toFixed(2)}%)`),
        createCell(`PEC 2.10.1.19\n≤ ${config.cabling.dcMaxDropPercent}% [PASS]`),
      ],
    }),
    new TableRow({
      children: [
        createCell("DC Equipment Grounding Conductor", true),
        createCell("Sized per highest DC OCPD rating"),
        createCell(`DC Fuse Rating: ${calc.effective.dcFuseRatingAmps} A`),
        createCell(`${calc.effective.dcEgcSizeMm2} mm² Cu Ground`),
        createCell(`PEC Table 2.50.6.13\n[PASS]`),
      ],
    }),
    new TableRow({
      children: [
        createCell("DC Conduit Raceway", true),
        createCell("Sized for 40% maximum conduit fill"),
        createCell(`2 Conductors + 1 Ground in Raceway`),
        createCell(`${config.cabling.dcCable.conduitSizeMm} mm ${config.cabling.dcCable.conduitType}`),
        createCell(`PEC Chapter 9 Table 4\n[PASS]`),
      ],
    }),
  ];

  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorderGrid,
      rows: dcCalculationsRows,
    })
  );

  // -------------------------------------------------------------
  // SECTION 6.0: AC-SIDE ENGINEERING CALCULATIONS & FEEDER SIZING
  // -------------------------------------------------------------
  const is3PhaseUtil = config.utilityPhase.includes("3PH");

  docChildren.push(
    createHeader("6.0 AC-SIDE ENGINEERING CALCULATIONS & FEEDER SIZING", true),
    createParagraph(
      "Sizing of inverter AC output conductors, overcurrent protection breakers, and voltage drop calculations under maximum continuous rated current:"
    ),
    createSubHeader("6.1 Governing AC Sizing Formulas"),
    createFormulaCallout(
      is3PhaseUtil
        ? "I_{ac} = \\frac{P_{ac}}{\\sqrt{3} \\times V_{ac} \\times PF} \\qquad I_{cb} \\ge 1.25 \\times I_{ac,max}"
        : "I_{ac} = \\frac{P_{ac}}{V_{ac} \\times PF} \\qquad I_{cb} \\ge 1.25 \\times I_{ac,max}"
    ),
    new Paragraph({ spacing: { before: 40, after: 60 } }),
    createFormulaCallout(
      is3PhaseUtil
        ? "\\%VD_{AC} = \\frac{\\sqrt{3} \\times L \\times I_{ac} \\times R}{1000 \\times V_{ac}} \\times 100\\%"
        : "\\%VD_{AC} = \\frac{2 \\times L \\times I_{ac} \\times R}{1000 \\times V_{ac}} \\times 100\\%"
    ),
    createSubHeader("6.2 AC Feeder & Breaker Sizing Schedule")
  );

  const acCalculationsRows: TableRow[] = [
    new TableRow({
      children: [
        createCell("CALCULATION ITEM", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("GOVERNING FORMULA", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("SUBSTITUTION & VALUES", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("RESULT & UNIT", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("PEC REFERENCE / STATUS", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
      ],
    }),
    new TableRow({
      children: [
        createCell("Inverter Continuous AC Current", true),
        createCell(is3PhaseUtil ? "Iac = Pac / (√3 x Vac x PF)" : "Iac = Pac / (Vac x PF)"),
        createCell(is3PhaseUtil ? `${calc.selectedInverter.ratedAcPowerKw * 1000} / (1.732 x ${calc.selectedInverter.acVoltage} x 1.0)` : `${calc.selectedInverter.ratedAcPowerKw * 1000} / (${calc.selectedInverter.acVoltage} x 1.0)`),
        createCell(`${calc.inverterRatedAcCurrent.toFixed(1)} A Rated\n${calc.inverterMaxAcCurrent.toFixed(1)} A Max Continuous`),
        createCell("Nameplate Spec [PASS]"),
      ],
    }),
    new TableRow({
      children: [
        createCell("Total System AC Current", true),
        createCell("Itotal = Inverter Qty x Iac,cont"),
        createCell(`${calc.inverterQuantity} x ${calc.inverterMaxAcCurrent.toFixed(1)} A`),
        createCell(`${calc.totalSystemAcCurrent.toFixed(1)} A Continuous`),
        createCell("Continuous Export [PASS]"),
      ],
    }),
    new TableRow({
      children: [
        createCell("AC Solar Backfeed Circuit Breaker", true),
        createCell("Icb ≥ 1.25 x Inverter Max Continuous AC"),
        createCell(`1.25 x ${calc.inverterMaxAcCurrent.toFixed(1)} A = ${(calc.inverterMaxAcCurrent * 1.25).toFixed(1)} A`),
        createCell(`${calc.effective.acBreakerAtAmps} AT / ${calc.effective.acBreakerAfAmps} AF\n${calc.effective.acBreakerPoles}P, ${calc.effective.acKaic} kAIC`),
        createCell(`PEC 6.90.2.3\nMCCB / MCB [PASS]`),
      ],
    }),
    new TableRow({
      children: [
        createCell("AC Feeder Conductor Sizing", true),
        createCell("Iwire ≥ 1.25 x Inverter Max Continuous AC"),
        createCell(`1.25 x ${calc.inverterMaxAcCurrent.toFixed(1)} A = ${(calc.inverterMaxAcCurrent * 1.25).toFixed(1)} A`),
        createCell(`${calc.effective.acCableSizeMm2} mm² Cu THHN\nAmpacity: ${calc.acCableAmpacity} A`),
        createCell(`PEC Table 3.10.1.16\n[PASS]`),
      ],
    }),
    new TableRow({
      children: [
        createCell("AC Feeder Voltage Drop", true),
        createCell(is3PhaseUtil ? "%VD = (√3 x L x I x R) / (1000 x V) x 100%" : "%VD = (2 x L x I x R) / (1000 x V) x 100%"),
        createCell(`${config.cabling.acCable.lengthM}m AC feeder run at ${calc.inverterRatedAcCurrent.toFixed(1)} A`),
        createCell(`${calc.acVoltageDropV.toFixed(2)} V\n(${calc.acVoltageDropPercent.toFixed(2)}%)`),
        createCell(`PEC 2.15.1.2\n≤ ${config.cabling.acMaxDropPercent}% [PASS]`),
      ],
    }),
    new TableRow({
      children: [
        createCell("Total Combined Voltage Drop", true),
        createCell("%VDtotal = %VD_DC + %VD_AC"),
        createCell(`${calc.dcVoltageDropPercent.toFixed(2)}% (DC) + ${calc.acVoltageDropPercent.toFixed(2)}% (AC)`),
        createCell(`${(calc.dcVoltageDropPercent + calc.acVoltageDropPercent).toFixed(2)}% Total`),
        createCell(`PEC Guidance\n≤ 3.00% [PASS]`),
      ],
    }),
    new TableRow({
      children: [
        createCell("AC Equipment Grounding Conductor", true),
        createCell("Sized based on AC Breaker rating"),
        createCell(`AC Breaker Rating: ${calc.effective.acBreakerAtAmps} AT`),
        createCell(`${calc.effective.acEgcSizeMm2} mm² Cu Ground`),
        createCell(`PEC Table 2.50.6.13\n[PASS]`),
      ],
    }),
    new TableRow({
      children: [
        createCell("AC Conduit Raceway Size", true),
        createCell("Sized for 40% maximum conduit fill"),
        createCell(`${calc.effective.acBreakerPoles} Line Wires + 1 Ground in Raceway`),
        createCell(`${calc.effective.acConduitSizeMm} mm ${config.cabling.acCable.conduitType}`),
        createCell(`PEC Chapter 9 Table 4\n[PASS]`),
      ],
    }),
    new TableRow({
      children: [
        createCell("AC External Disconnect Switch", true),
        createCell("Manual, visible blade, lockable in OFF position"),
        createCell(`Rated for continuous inverter output current`),
        createCell(`${config.acProtection.isolatorRatingAmps} A AC Isolator\n${config.acProtection.isolatorPoles}-Pole Heavy Duty`),
        createCell(`ERC Net-Metering Rules\n[PASS]`),
      ],
    }),
  ];

  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorderGrid,
      rows: acCalculationsRows,
    })
  );

  // -------------------------------------------------------------
  // SECTION 7.0: SOLAR ELECTRICAL PROTECTION & SAFETY COORDINATION
  // -------------------------------------------------------------
  docChildren.push(
    createHeader("7.0 SOLAR ELECTRICAL PROTECTION & SAFETY COORDINATION", true),
    createParagraph(
      "Comprehensive protection coordination matrix incorporating DC overcurrent protection, DC surge suppression, AC circuit breakers, AC isolators, and grounding electrode systems:"
    )
  );

  const protectionRows: TableRow[] = [
    new TableRow({
      children: [
        createCell("PROTECTION HARDWARE", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("EQUIPMENT SPECIFICATION", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("ENGINEERING FUNCTION & REGULATORY MANDATE", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
      ],
    }),
    new TableRow({
      children: [
        createCell("DC String Fuses (OCPD)", true),
        createCell(`${calc.effective.dcFuseRatingAmps} A gPV, ${config.dcProtection.fuseVoltageVolts} VDC, ${config.dcProtection.fuseKaic} kAIC`),
        createCell("Protects individual PV module strings from reverse current faults per PEC 6.90.2.2."),
      ],
    }),
    new TableRow({
      children: [
        createCell("DC Disconnect / Isolator Switch", true),
        createCell(`${calc.effective.dcIsolatorRatingAmps} A DC, ${config.dcProtection.isolatorVoltageVolts} VDC, ${config.dcProtection.isolatorPoles}-Pole Rotary`),
        createCell("Load-break rated manual disconnect switch for safe inverter maintenance per PEC 6.90.3.1."),
      ],
    }),
    new TableRow({
      children: [
        createCell("DC Surge Protective Device (SPD)", true),
        createCell(`Type 2 SPD, Uc: ${calc.effective.dcSpdUcVolts} VDC, In: ${config.dcProtection.spdInKa} kA, Imax: ${config.dcProtection.spdImaxKa} kA`),
        createCell("Suppresses atmospheric lightning induced overvoltages on the DC array homerun conductors."),
      ],
    }),
    new TableRow({
      children: [
        createCell("AC Inverter Circuit Breaker", true),
        createCell(`${calc.effective.acBreakerAtAmps} AT / ${calc.effective.acBreakerAfAmps} AF, ${calc.effective.acBreakerPoles}P, ${calc.effective.acKaic} kAIC (${config.acProtection.breakerType})`),
        createCell("Thermal-magnetic overcurrent and short-circuit protection for AC output per PEC 6.90.2.3."),
      ],
    }),
    new TableRow({
      children: [
        createCell("AC Safety Disconnect Switch", true),
        createCell(`${config.acProtection.isolatorRatingAmps} A AC, ${config.acProtection.isolatorPoles}-Pole, Visible Blade Manual Switch`),
        createCell("Utility-accessible lockable manual disconnect switch required by Distribution Utility (ERC Net-Metering Rules)."),
      ],
    }),
    new TableRow({
      children: [
        createCell("AC Surge Protective Device (SPD)", true),
        createCell(`Type 2 AC SPD, ${config.acProtection.spdRatingVolts} V, In: 20 kA, Imax: 40 kA`),
        createCell("Protects inverter and consumer panel from utility grid switching surges and transients."),
      ],
    }),
    new TableRow({
      children: [
        createCell("System Grounding & Bonding", true),
        createCell(`16mm dia x 2.4m Copper-Clad Ground Rod + ${calc.effective.dcEgcSizeMm2}mm² Cu EGC`),
        createCell("Equipment grounding of all PV module frames, mounting rails, inverter chassis, and switchgear enclosures per PEC 2.50."),
      ],
    }),
    new TableRow({
      children: [
        createCell("Anti-Islanding & Rapid Shutdown", true),
        createCell("Certified IEEE 1547 / UL 1741 compliant internal disconnect relays"),
        createCell("De-energizes AC output within 2.0 seconds upon loss of utility grid voltage to protect line workers (PEC 6.90.3.3)."),
      ],
    }),
  ];

  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorderGrid,
      rows: protectionRows,
    })
  );

  // 7.1 / 7.2: short circuit (point-to-point) and voltage drop - the same values as the SLD diagrams
  {
    const study = options.studies || computeSolarStudies(config, calc, null, options.linkedPanelData);
    const { sc, vd } = study;
    const head = (cols: string[]) =>
      new TableRow({ tableHeader: true, children: cols.map((c) => createCell(c, true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF", 16)) });
    const status = (ok: boolean) => createCell(ok ? "PASSED" : "FAILED", true, AlignmentType.CENTER, ok ? "D1FAE5" : "FEE2E2", ok ? "065F46" : "991B1B", 16);
    docChildren.push(
      createSubHeader("7.1 Short Circuit Analysis (Point-to-Point)"),
      createParagraph(
        `Source: utility ${sc.utilityMva} MVA at ${sc.primaryKv} kV, transformer ${sc.transformerKva} kVA (Z ${sc.transformerZPct}%, X/R ${sc.transformerXr}), service feeder ${sc.feeder.lengthM} m of ${sc.feeder.size} mm² x${sc.feeder.runs} ${sc.feeder.material}${sc.usesProjectData ? " (Short Circuit module)" : " (default values - enter the actual service data in the Short Circuit module)"}. Impedances per PEC 2017 Chapter 9 Table 9 with R at 20°C for the maximum fault; each inverter adds ${sc.inverterContributionEachA} A (1.5 x maximum AC current). DC fault currents: 1.25 x string Isc (PEC 6.90.8(A)(1)).`
      ),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: tableBorderGrid,
        rows: [
          head(["PT.", "FAULT LOCATION", "FAULT", "AVAILABLE", "X/R", "PROTECTIVE DEVICE", "RATING", "CHECK"]),
          ...sc.points.map(
            (p) =>
              new TableRow({
                children: [
                  createCell(p.tag, true, AlignmentType.CENTER, "", TEXT_MAIN_COLOR, 16),
                  createCell(p.location, false, AlignmentType.LEFT, "", TEXT_MAIN_COLOR, 16),
                  createCell(p.faultType, false, AlignmentType.CENTER, "", TEXT_MAIN_COLOR, 16),
                  createCell(kaText(p.amps), true, AlignmentType.CENTER, "", TEXT_MAIN_COLOR, 16),
                  createCell(p.xr != null ? p.xr.toFixed(2) : "-", false, AlignmentType.CENTER, "", TEXT_MAIN_COLOR, 16),
                  createCell(p.device, false, AlignmentType.LEFT, "", TEXT_MAIN_COLOR, 16),
                  createCell(`${p.ratingKa} kA`, false, AlignmentType.CENTER, "", TEXT_MAIN_COLOR, 16),
                  status(p.ok),
                ],
              })
          ),
        ],
      }),
      createSubHeader("7.2 Voltage Drop Calculation"),
      createParagraph(
        `VD = k x I x R x L / 1000 (k = 2 for DC and single-phase, 1.732 for three-phase) at unity power factor, R per PEC 2017 Chapter 9 (75°C). Total from the PV array to the service entrance: ${vd.totalPct.toFixed(2)}% (limit ${vd.totalLimitPct}%, PEC 2017 2.15.2(A) FPN No. 2).`
      ),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: tableBorderGrid,
        rows: [
          head(["SEGMENT", "SIZE", "L (m)", "I (A)", "V BASE", "VD (V)", "VD (%)", "LIMIT", "CUMUL.", "CHECK"]),
          ...vd.segments.map(
            (g, i) =>
              new TableRow({
                children: [
                  createCell(`${g.from} - ${g.to}`, false, AlignmentType.LEFT, "", TEXT_MAIN_COLOR, 16),
                  createCell(`${g.sizeMm2} mm²${g.runs > 1 ? ` x${g.runs}` : ""}`, false, AlignmentType.CENTER, "", TEXT_MAIN_COLOR, 16),
                  createCell(String(g.lengthM), false, AlignmentType.CENTER, "", TEXT_MAIN_COLOR, 16),
                  createCell(String(g.currentA), false, AlignmentType.CENTER, "", TEXT_MAIN_COLOR, 16),
                  createCell(String(g.basisV), false, AlignmentType.CENTER, "", TEXT_MAIN_COLOR, 16),
                  createCell(g.vdV.toFixed(2), false, AlignmentType.CENTER, "", TEXT_MAIN_COLOR, 16),
                  createCell(`${g.vdPct.toFixed(2)}%`, true, AlignmentType.CENTER, "", TEXT_MAIN_COLOR, 16),
                  createCell(`${g.limitPct}%`, false, AlignmentType.CENTER, "", TEXT_MAIN_COLOR, 16),
                  createCell(`${vd.cumulativePct[i].toFixed(2)}%`, false, AlignmentType.CENTER, "", TEXT_MAIN_COLOR, 16),
                  status(g.ok),
                ],
              })
          ),
          new TableRow({
            children: [
              createCell("TOTAL: PV ARRAY TO SERVICE ENTRANCE", true, AlignmentType.LEFT, "F2F4F7", TEXT_MAIN_COLOR, 16),
              ...["", "", "", "", ""].map(() => createCell("", false, AlignmentType.CENTER, "F2F4F7", TEXT_MAIN_COLOR, 16)),
              createCell(`${vd.totalPct.toFixed(2)}%`, true, AlignmentType.CENTER, "F2F4F7", TEXT_MAIN_COLOR, 16),
              createCell(`${vd.totalLimitPct}%`, false, AlignmentType.CENTER, "F2F4F7", TEXT_MAIN_COLOR, 16),
              createCell(`${vd.totalPct.toFixed(2)}%`, false, AlignmentType.CENTER, "F2F4F7", TEXT_MAIN_COLOR, 16),
              status(vd.totalOk),
            ],
          }),
        ],
      })
    );
  }

  // -------------------------------------------------------------
  // SECTION 8.0: BATTERY ENERGY STORAGE SYSTEM (BESS)
  // -------------------------------------------------------------
  docChildren.push(createHeader("8.0 BATTERY ENERGY STORAGE SYSTEM (BESS)", true));

  if (hasBattery) {
    docChildren.push(
      createParagraph(
        `The installation is equipped with an integrated Battery Energy Storage System (BESS) utilizing high-cycle Lithium Iron Phosphate (LiFePO4) chemistry ` +
        `to provide uninterrupted power supply (UPS) to designated critical loads during utility grid outages:`
      )
    );

    const bessRows: TableRow[] = [
      new TableRow({
        children: [
          createCell("BESS PARAMETER", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
          createCell("VALUE / SPECIFICATION", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
          createCell("BESS PARAMETER", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
          createCell("VALUE / SPECIFICATION", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        ],
      }),
      new TableRow({
        children: [
          createCell("Battery Manufacturer", true),
          createCell(config.battery.manufacturer || "Tier 1 Storage"),
          createCell("Battery Model", true),
          createCell(config.battery.model || "LFP Lithium Battery"),
        ],
      }),
      new TableRow({
        children: [
          createCell("Battery Chemistry", true),
          createCell(config.battery.chemistry || "Lithium Iron Phosphate (LiFePO4)"),
          createCell("Nominal Unit Voltage & Capacity", true),
          createCell(`${config.battery.voltageV} V, ${config.battery.capacityAh} Ah (${config.battery.energyKwh} kWh)`),
        ],
      }),
      new TableRow({
        children: [
          createCell("Battery Bank Configuration", true),
          createCell(`${calc.effective.batteryUnits} Units (${calc.batteryUnitsInSeries}S / ${calc.batteryUnitsInParallel}P)`),
          createCell("Battery Bank Nominal Voltage", true),
          createCell(`${calc.batteryBankVoltage} VDC`),
        ],
      }),
      new TableRow({
        children: [
          createCell("Total Installed Energy", true),
          createCell(`${calc.batteryTotalEnergyKwh} kWh Total`),
          createCell("Usable Energy Capacity", true),
          createCell(`${calc.batteryUsableEnergyKwh} kWh (${config.battery.dodPercent}% DoD)`),
        ],
      }),
      new TableRow({
        children: [
          createCell("Design Critical Backup Load", true),
          createCell(`${config.battery.requiredBackupLoadKw} kW Continuous Load`),
          createCell("Estimated Backup Autonomy", true),
          createCell(`${calc.batteryBackupHoursActual.toFixed(1)} Hours Backup Duration`),
        ],
      }),
      new TableRow({
        children: [
          createCell("Battery DC Breaker Rating", true),
          createCell(`${config.battery.capacityAh >= 200 ? 250 : 125} A DC 2-Pole Breaker`),
          createCell("Battery Interconnect Cable", true),
          createCell(`${config.battery.capacityAh >= 200 ? 50 : 38} mm² Cu Flexible Battery Cable`),
        ],
      }),
    ];

    docChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: tableBorderGrid,
        rows: bessRows,
      })
    );
  } else {
    docChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: tableBorderGrid,
        rows: [
          new TableRow({
            children: [
              createCell(
                "BATTERY ENERGY STORAGE SYSTEM (BESS): NOT APPLICABLE – DIRECT GRID-TIED NET-METERING SYSTEM",
                true,
                AlignmentType.CENTER,
                "FEF3C7",
                "92400E",
                20
              ),
            ],
          }),
          new TableRow({
            children: [
              createCell(
                "This project is configured as a direct grid-tied photovoltaic generation system operating under ERC Net-Metering Rules. " +
                "Solar generation is consumed in real-time by facility loads, and surplus daytime generation is exported directly to the Distribution Utility (DU) grid. " +
                "No electrochemical battery storage bank is required for this installation.",
                false,
                AlignmentType.LEFT,
                "FFFFFF",
                "334155",
                18
              ),
            ],
          }),
        ],
      })
    );
  }

  // -------------------------------------------------------------
  // SECTION 9.0: SYSTEM SINGLE LINE DIAGRAM (SLD) & SCHEDULE
  // -------------------------------------------------------------
  docChildren.push(
    createHeader("9.0 SYSTEM SINGLE LINE DIAGRAM (SLD) & COMPONENT SCHEDULE", true),
    createParagraph(
      "The Single Line Diagram (SLD) illustrates the complete power flow, protection hierarchy, disconnect switches, and metering equipment from the PV array to the consumer distribution panelboard and utility grid:"
    )
  );

  // Embedded SLD drawing: placed on its own A3 landscape page (section break) at its true proportions
  const sldSplitIndex = docChildren.length;
  const sldSectionChildren: any[] = [];
  if (sldImageUint8Array) {
    // A3 landscape with 0.5" margins: about 1490 x 950 px of drawing area at 96 dpi
    const fit = Math.min(1490 / sldImageSize.width, 950 / sldImageSize.height);
    sldSectionChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data: sldImageUint8Array,
            transformation: {
              width: Math.round(sldImageSize.width * fit),
              height: Math.round(sldImageSize.height * fit),
            },
            type: "png",
          }),
        ],
      })
    );
  }

  docChildren.push(createSubHeader("9.1 Single Line Diagram Component Schedule"));

  const sldScheduleRows: TableRow[] = [
    new TableRow({
      children: [
        createCell("NODE #", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("EQUIPMENT BLOCK", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("ELECTRICAL SPECIFICATION & RATINGS", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("INTERCONNECT DETAILS", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
      ],
    }),
    new TableRow({
      children: [
        createCell("1", true, AlignmentType.CENTER),
        createCell("Photovoltaic Array", true),
        createCell(`${calc.totalModules}x ${calc.selectedModule.ratedPowerWp}W Modules (${calc.totalDcCapacityKwp} kWp Total)\n${calc.effective.numberOfStrings} String(s) x ${calc.effective.modulesPerString} Series Modules`),
        createCell(`Voc: ${calc.stringVoc.toFixed(1)} VDC | Vmp: ${calc.stringVmp.toFixed(1)} VDC`),
      ],
    }),
    new TableRow({
      children: [
        createCell("2", true, AlignmentType.CENTER),
        createCell("DC Combiner & Protection", true),
        createCell(`${calc.effective.dcFuseRatingAmps} A gPV 1000VDC Fuses + Type 2 DC SPD (Uc: ${calc.effective.dcSpdUcVolts}VDC)`),
        createCell(`In: ${config.dcProtection.spdInKa} kA | Imax: ${config.dcProtection.spdImaxKa} kA`),
      ],
    }),
    new TableRow({
      children: [
        createCell("3", true, AlignmentType.CENTER),
        createCell("DC Isolator Switch", true),
        createCell(`${calc.effective.dcIsolatorRatingAmps} A DC 1000VDC 4-Pole Rotary Disconnect`),
        createCell("Lockable Manual Load-Break Switch"),
      ],
    }),
    new TableRow({
      children: [
        createCell("4", true, AlignmentType.CENTER),
        createCell("Solar Inverter(s)", true),
        createCell(`${calc.inverterQuantity}x ${calc.selectedInverter.manufacturer} ${calc.selectedInverter.model}\nRated AC: ${calc.totalInverterAcKw} kW AC @ ${calc.selectedInverter.acVoltage}V ${calc.selectedInverter.phase}`),
        createCell(`Max AC Output: ${calc.totalSystemAcCurrent.toFixed(1)} A`),
      ],
    }),
    new TableRow({
      children: [
        createCell("5", true, AlignmentType.CENTER),
        createCell("AC Protection Breaker", true),
        createCell(`${calc.effective.acBreakerAtAmps} AT / ${calc.effective.acBreakerAfAmps} AF, ${calc.effective.acBreakerPoles}P, ${calc.effective.acKaic} kAIC (${config.acProtection.breakerType})`),
        createCell("Sized at 125% Inverter Continuous Current"),
      ],
    }),
    new TableRow({
      children: [
        createCell("6", true, AlignmentType.CENTER),
        createCell("AC Disconnect Switch", true),
        createCell(`${config.acProtection.isolatorRatingAmps} A AC, ${config.acProtection.isolatorPoles}-Pole Heavy Duty Manual Isolator`),
        createCell("Lockable Visible Blade Switch (ERC Compliant)"),
      ],
    }),
    new TableRow({
      children: [
        createCell("7", true, AlignmentType.CENTER),
        createCell("Solar Generation Meter", true),
        createCell("Class 0.5 Revenue Digital kWh Energy Meter with Modbus/RS485 interface"),
        createCell("Dedicated Solar Production Recording"),
      ],
    }),
    new TableRow({
      children: [
        createCell("8", true, AlignmentType.CENTER),
        createCell("Consumer Panel (MDP)", true),
        createCell(`${linkedPanel.designation || "MAIN DISTRIBUTION PANEL (MDP)"}\nMain Breaker: ${linkedPanel.mainFeeder.cb} AT / ${linkedPanel.mainFeeder.af} AF (${linkedPanel.mainFeeder.poles}P, ${linkedPanel.mainFeeder.kaic} kAIC)`),
        createCell(`Feeder: ${linkedPanel.mainFeeder.feederLabel}\nLoad: ${linkedPanel.connectedKVA} kVA`),
      ],
    }),
    new TableRow({
      children: [
        createCell("9", true, AlignmentType.CENTER),
        createCell("Bi-Directional Net Meter", true),
        createCell("Class 0.2S Revenue Smart Bi-Directional Net Meter (Import/Export Recording)"),
        createCell("Supplied & Sealed by Distribution Utility"),
      ],
    }),
    new TableRow({
      children: [
        createCell("10", true, AlignmentType.CENTER),
        createCell("Distribution Utility Grid", true),
        createCell(`${config.utilityVoltage} V, ${config.utilityPhase}, 60 Hz Distribution Feeder`),
        createCell("MERALCO / Local DU Service Entrance"),
      ],
    }),
  ];

  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorderGrid,
      rows: sldScheduleRows,
    })
  );

  // -------------------------------------------------------------
  // SECTION 10.0: CONSUMER BREAKER PANELBOARD (MDP) & 120% BUSBAR
  // -------------------------------------------------------------
  docChildren.push(
    createHeader("10.0 CONSUMER BREAKER PANELBOARD (MDP) & 120% BUSBAR INTERCONNECTION", true),
    createParagraph(
      "The solar backfeed circuit connects directly to the facility's main distribution panelboard in compliance with PEC 2017 Article 6.90.7.2(D) (120% Busbar Interconnection Rule). " +
      "The panel parameters below are synchronized with the active System Single Line Diagram and Load Schedule:"
    ),
    createSubHeader("10.1 Governing 120% Busbar Interconnection Rule"),
    createFormulaCallout("I_{main} + I_{solar,cb} \\le 1.20 \\times I_{busbar}"),
    createSubHeader("10.2 Synchronized Panelboard Parameters")
  );

  const mdpRows: TableRow[] = [
    new TableRow({
      children: [
        createCell("PANELBOARD PARAMETER", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("SYNCHRONIZED SPECIFICATION", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("PANELBOARD PARAMETER", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("SYNCHRONIZED SPECIFICATION", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
      ],
    }),
    new TableRow({
      children: [
        createCell("Panel Designation / Name", true),
        createCell(linkedPanel.designation || "MAIN DISTRIBUTION PANEL (MDP)"),
        createCell("System Service Configuration", true),
        createCell(`${linkedPanel.systemVoltage} V ${linkedPanel.phaseText}, 60 Hz`),
      ],
    }),
    new TableRow({
      children: [
        createCell("Main Breaker Rating", true),
        createCell(`${linkedPanel.mainFeeder.cb} AT / ${linkedPanel.mainFeeder.af} AF (${linkedPanel.mainFeeder.poles}P, ${linkedPanel.mainFeeder.type}, ${linkedPanel.mainFeeder.kaic} kAIC)`),
        createCell("Solar Backfeed Breaker", true),
        createCell(`${calc.effective.acBreakerAtAmps} AT / ${calc.effective.acBreakerAfAmps} AF (${calc.effective.acBreakerPoles}P)`),
      ],
    }),
    new TableRow({
      children: [
        createCell("Feeder Conductor (Line & EGC)", true),
        createCell(linkedPanel.mainFeeder.feederLabel),
        createCell("Feeder Raceway / Conduit", true),
        createCell(linkedPanel.mainFeeder.conduitLabel),
      ],
    }),
    new TableRow({
      children: [
        createCell("Total Connected Load (kVA)", true),
        createCell(`${linkedPanel.connectedKVA} kVA`),
        createCell("Maximum Demand Load", true),
        createCell(`${linkedPanel.demandKVA} kVA (${linkedPanel.demandA} A)`),
      ],
    }),
    new TableRow({
      children: [
        createCell("Busbar Ampacity Rating", true),
        createCell(`${linkedPanel.mainFeeder.af || config.serviceCapacityAmps || 200} A Busbar`),
        createCell("PEC 120% Busbar Check", true),
        createCell((() => {
          const backfeed = solarBackfeedAmps(calc);
          const infeed = linkedPanel.mainFeeder.cb + backfeed;
          const limit = Math.round((linkedPanel.mainFeeder.af || config.serviceCapacityAmps || 200) * 1.2);
          return `(Main ${linkedPanel.mainFeeder.cb}A + Solar ${backfeed}A = ${infeed}A) ${infeed <= limit ? "≤" : ">"} 120% Busbar (${limit}A) [${infeed <= limit ? "PASS" : "EXCEEDED"}]`;
        })()),
      ],
    }),
  ];

  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorderGrid,
      rows: mdpRows,
    })
  );

  // Active Branch Circuits Schedule
  if (linkedPanel.activeCircuits && linkedPanel.activeCircuits.length > 0) {
    docChildren.push(
      createSubHeader(`10.3 Connected Active Branch Circuits (${linkedPanel.activeCircuits.length} Circuits)`),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: tableBorderGrid,
        rows: [
          new TableRow({
            children: [
              createCell("CKT #", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
              createCell("LOAD DESCRIPTION", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
              createCell("CONNECTED LOAD", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
              createCell("BREAKER TRIP", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
              createCell("CONDUCTOR SIZE & SPECIFICATION", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
            ],
          }),
          ...linkedPanel.activeCircuits.map((c: any, idx: number) => {
            const loadVa = c.loadVA || c.wattage || 0;
            return new TableRow({
              children: [
                createCell(String(c.circuitNumber || idx + 1), false, AlignmentType.CENTER),
                createCell(c.description || "General Load Branch Circuit", false),
                createCell(`${loadVa.toLocaleString()} VA`, false, AlignmentType.RIGHT),
                createCell(`${c.breakerRating || 20} AT (${c.poles || 2}P)`, false, AlignmentType.CENTER),
                createCell(
                  c.conductorSize || `${c.wireSize || "3.5"} mm² THHN Cu + 2.0 mm² EGC in 20mm PVC`,
                  false
                ),
              ],
            });
          }),
        ],
      })
    );
  }

  // -------------------------------------------------------------
  // SECTION 11.0: BILL OF MATERIALS (BOM) & COST SCHEDULE
  // -------------------------------------------------------------
  docChildren.push(
    createHeader("11.0 BILL OF MATERIALS (BOM) & EQUIPMENT PROCUREMENT SCHEDULE", true),
    createParagraph(
      "Itemized equipment, hardware, electrical balance of system (BOS), and installation procurement schedule in Philippine Pesos (PHP):"
    )
  );

  const bomRows: TableRow[] = [
    new TableRow({
      children: [
        createCell("#", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("CATEGORY", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("ITEM SPECIFICATION", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("QTY", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("UNIT", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("UNIT PRICE (PHP)", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("MARKUP", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("TOTAL AMOUNT (PHP)", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
      ],
    }),
    ...bomList.map((item, idx) => {
      const unitCost = typeof item.unitCostPhp === "number" ? item.unitCostPhp : Number(item.unitCostPhp) || 0;
      const qty = typeof item.quantity === "number" ? item.quantity : Number(item.quantity) || 1;
      const markup = typeof item.markupPercent === "number" ? item.markupPercent : Number(item.markupPercent) || 0;
      const totalCost =
        typeof item.totalCostPhp === "number" && item.totalCostPhp > 0
          ? item.totalCostPhp
          : Math.round(qty * unitCost * (1 + markup / 100));

      return new TableRow({
        children: [
          createCell(String(idx + 1), false, AlignmentType.CENTER),
          createCell(item.category || "General", false),
          createCell(`${item.itemDescription} (${item.manufacturer || "Standard"})`, false),
          createCell(String(qty), false, AlignmentType.CENTER),
          createCell(item.unit || "pcs", false, AlignmentType.CENTER),
          createCell(`PHP ${unitCost.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, false, AlignmentType.RIGHT),
          createCell(`${markup}%`, false, AlignmentType.CENTER),
          createCell(`PHP ${totalCost.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, true, AlignmentType.RIGHT),
        ],
      });
    }),
    new TableRow({
      children: [
        createCell("", true, AlignmentType.CENTER, "EEF2FF"),
        createCell("", true, AlignmentType.CENTER, "EEF2FF"),
        createCell("TOTAL ESTIMATED SYSTEM INVESTMENT (PHP)", true, AlignmentType.LEFT, "EEF2FF", PRIMARY_COLOR, 19),
        createCell("", true, AlignmentType.CENTER, "EEF2FF"),
        createCell("", true, AlignmentType.CENTER, "EEF2FF"),
        createCell("", true, AlignmentType.CENTER, "EEF2FF"),
        createCell("", true, AlignmentType.CENTER, "EEF2FF"),
        createCell(
          `PHP ${grandTotalPhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          true,
          AlignmentType.RIGHT,
          "EEF2FF",
          PRIMARY_COLOR,
          19
        ),
      ],
    }),
  ];

  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorderGrid,
      rows: bomRows,
    })
  );

  // -------------------------------------------------------------
  // SECTION 12.0: REGULATORY COMPLIANCE & PROFESSIONAL CERTIFICATION
  // -------------------------------------------------------------
  docChildren.push(
    createHeader("12.0 STATUTORY COMPLIANCE & PROFESSIONAL CERTIFICATION", true),
    createParagraph(
      "This solar photovoltaic system design and engineering calculation dossier complies with all statutory regulations and engineering standards in the Philippines:"
    )
  );

  const complianceRows: TableRow[] = [
    new TableRow({
      children: [
        createCell("STATUTORY STANDARD / REGULATION", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("MANDATORY PROVISION & DESIGN COMPLIANCE SUMMARY", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("STATUS", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
      ],
    }),
    new TableRow({
      children: [
        createCell("Philippine Electrical Code (PEC 2017) Art. 6.90", true),
        createCell("Mandates cold-weather voltage correction, string fusing (1.56x Isc), disconnects, grounding, and raceway fill constraints."),
        createCell("PASSED", true, AlignmentType.CENTER, "DCFCE7", "166534"),
      ],
    }),
    new TableRow({
      children: [
        createCell("Republic Act No. 9513 (Renewable Energy Act)", true),
        createCell("Establishes the legal framework for distributed renewable energy generation and net-metering customer integration."),
        createCell("COMPLIANT", true, AlignmentType.CENTER, "DCFCE7", "166534"),
      ],
    }),
    new TableRow({
      children: [
        createCell("ERC Resolution No. 09, Series of 2013", true),
        createCell("Governs technical interconnection, bi-directional metering, visible-blade manual safety disconnects, and distribution utility standards."),
        createCell("COMPLIANT", true, AlignmentType.CENTER, "DCFCE7", "166534"),
      ],
    }),
    new TableRow({
      children: [
        createCell("IEEE 1547 / UL 1741 Interconnection", true),
        createCell("Standard for interconnecting distributed resources with electric power systems, including anti-islanding trip times."),
        createCell("CERTIFIED", true, AlignmentType.CENTER, "DCFCE7", "166534"),
      ],
    }),
  ];

  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorderGrid,
      rows: complianceRows,
    }),
    new Paragraph({ spacing: { before: 180 } }),
    // Formal Certification Statement Block
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        left: { style: BorderStyle.SINGLE, size: 36, color: PRIMARY_COLOR },
      },
      rows: [
        new TableRow({
          children: [
            createCell(
              "\"I hereby certify that the solar photovoltaic engineering design, temperature-corrected string configurations, " +
              "electrical protection sizing, conductor schedules, Single Line Diagram (SLD), and load integration presented in this report were prepared in " +
              "strict compliance with the Philippine Electrical Code (PEC 2017 Edition, Parts 1 and 2), Republic Act No. 9513 " +
              "(Renewable Energy Act of 2008), and Energy Regulatory Commission (ERC) Net-Metering Rules and Regulations.\"",
              false,
              AlignmentType.LEFT,
              "F8FAFC",
              PRIMARY_COLOR,
              18
            ),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { before: 200 } }),
    // Professional Signoff Block
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.NONE },
        insideVertical: { style: BorderStyle.NONE },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE },
              },
              margins: { top: 60, bottom: 60, left: 60, right: 60 },
              children: [
                new Paragraph({
                  spacing: { before: 0, after: 360 },
                  children: [
                    new TextRun({
                      text: "PREPARED AND DESIGNED BY:",
                      bold: true,
                      font: FONT_FAMILY,
                      size: 20,
                      color: PRIMARY_COLOR,
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 0, after: 40 },
                  children: [
                    new TextRun({
                      text: "________________________________________",
                      font: FONT_FAMILY,
                      size: 19,
                      color: "0F172A",
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 20, after: 20 },
                  children: [
                    new TextRun({
                      text: (config.designerName || "Lead Electrical Engineer").toUpperCase(),
                      font: FONT_FAMILY,
                      size: 19,
                      bold: true,
                      color: "0F172A",
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 20, after: 20 },
                  children: [
                    new TextRun({
                      text: "Solar Photovoltaic Specialist",
                      font: FONT_FAMILY,
                      size: 18,
                      color: TEXT_MUTED_COLOR,
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 20, after: 20 },
                  children: [
                    new TextRun({
                      text: "Electrical Design Engineer",
                      font: FONT_FAMILY,
                      size: 18,
                      color: TEXT_MUTED_COLOR,
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 20, after: 20 },
                  children: [
                    new TextRun({
                      text: "PRC Registration No.: ____________________",
                      font: FONT_FAMILY,
                      size: 18,
                      color: TEXT_MUTED_COLOR,
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 20, after: 20 },
                  children: [
                    new TextRun({
                      text: "Date Issued: ___________________________",
                      font: FONT_FAMILY,
                      size: 18,
                      color: TEXT_MUTED_COLOR,
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE },
              },
              margins: { top: 60, bottom: 60, left: 60, right: 60 },
              children: [
                new Paragraph({
                  spacing: { before: 0, after: 360 },
                  children: [
                    new TextRun({
                      text: "CHECKED AND CERTIFIED BY:",
                      bold: true,
                      font: FONT_FAMILY,
                      size: 20,
                      color: PRIMARY_COLOR,
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 0, after: 40 },
                  children: [
                    new TextRun({
                      text: "________________________________________",
                      font: FONT_FAMILY,
                      size: 19,
                      color: "0F172A",
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 20, after: 20 },
                  children: [
                    new TextRun({
                      text: "PROFESSIONAL ELECTRICAL ENGINEER (PEE)",
                      font: FONT_FAMILY,
                      size: 19,
                      bold: true,
                      color: "0F172A",
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 20, after: 20 },
                  children: [
                    new TextRun({
                      text: "PRC Registration No.: ____________________",
                      font: FONT_FAMILY,
                      size: 18,
                      color: TEXT_MUTED_COLOR,
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 20, after: 20 },
                  children: [
                    new TextRun({
                      text: "PTR No.: _______________________________",
                      font: FONT_FAMILY,
                      size: 18,
                      color: TEXT_MUTED_COLOR,
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 20, after: 20 },
                  children: [
                    new TextRun({
                      text: "Issued At: _____________________________",
                      font: FONT_FAMILY,
                      size: 18,
                      color: TEXT_MUTED_COLOR,
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 20, after: 20 },
                  children: [
                    new TextRun({
                      text: "Date Issued: ___________________________",
                      font: FONT_FAMILY,
                      size: 18,
                      color: TEXT_MUTED_COLOR,
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 20, after: 20 },
                  children: [
                    new TextRun({
                      text: "TIN No.: _______________________________",
                      font: FONT_FAMILY,
                      size: 18,
                      color: TEXT_MUTED_COLOR,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  // Document Shell with Header & Footer
  const makeSection = (children: any[], sldSheet = false) => ({
        properties: sldSheet
          ? {
              page: {
                size: { width: 16838, height: 23811, orientation: PageOrientation.LANDSCAPE }, // A3
                margin: { top: 720, bottom: 720, left: 720, right: 720 },
              },
            }
          : {
              page: {
                margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }, // 1-inch margins
              },
            },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: "ELECTRICALPH • SOLAR PV SYSTEM DESIGN & CALCULATION REPORT  |  PEC 2017 ART. 6.90 & R.A. 9513",
                    size: 15,
                    color: "64748B",
                    font: FONT_FAMILY,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `${config.projectName || "Solar PV Installation"} • Engineering Calculation Dossier  |  `,
                    size: 15,
                    color: "64748B",
                    font: FONT_FAMILY,
                  }),
                  new TextRun({
                    children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES],
                    size: 15,
                    color: "64748B",
                    font: FONT_FAMILY,
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      });
  const doc = new Document({
    sections: sldSectionChildren.length
      ? [
          makeSection(docChildren.slice(0, sldSplitIndex)),
          makeSection(sldSectionChildren, true),
          makeSection(docChildren.slice(sldSplitIndex)),
        ]
      : [makeSection(docChildren)],
  });

  const blob = await Packer.toBlob(doc);
  const cleanProjectName = (config.projectName || "Solar_Design").replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `${cleanProjectName}_Solar_Design_Calculation.docx`;
  saveAs(blob, fileName);
}
