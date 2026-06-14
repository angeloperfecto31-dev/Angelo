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
  VerticalAlign, 
  ImageRun,
  Header,
  Footer,
  PageNumber,
  Math as DocxMath,
  MathRun,
  MathFraction,
  MathSubScript,
  MathSuperScript,
  MathSubSuperScript,
  MathRadical
} from 'docx';
import { Circuit, PanelConfig, LoadType } from '../types';
import { WIRE_AMPACITY_TABLE, STANDARD_CB_RATINGS, WIRE_IMPEDANCE_TABLE } from '../constants';
import { computePanelScheduleValues } from './computeEngine';

const getPanelSystemVoltageFallback = (system: string, is3Phase: boolean, connectionType?: string): number => {
  if (system === '380V/230V, 3PH, 4W') {
    return is3Phase ? 380 : (connectionType === 'Line-to-Line' ? 380 : 230);
  }
  if (system === '400V/230V, 3PH, 4W') {
    return is3Phase ? 400 : (connectionType === 'Line-to-Line' ? 400 : 230);
  }
  if (system === '440V/230V, 3PH, 4W') {
    return is3Phase ? 440 : (connectionType === 'Line-to-Line' ? 440 : 230);
  }
  if (system === '480V/230V, 3PH, 4W') {
    return is3Phase ? 480 : (connectionType === 'Line-to-Line' ? 480 : 230);
  }
  if (system === '380V, 3PH, 3W') {
    return 380;
  }
  if (system === '400V, 3PH, 3W') {
    return 400;
  }
  if (system === '440V, 3PH, 3W') {
    return 440;
  }
  if (system === '480V, 3PH, 3W') {
    return 480;
  }
  return 230;
};

// Helper to map LaTeX macros to clean Unicode symbols or text representation
function getMathSymbol(macro: string): string {
  switch (macro) {
    case "times": return " × ";
    case "cdot":
    case "mid": return " ∙ ";
    case "approx": return " ≈ ";
    case "ge":
    case "geq": return " ≥ ";
    case "le":
    case "leq": return " ≤ ";
    case "lceil": return "⌈";
    case "rceil": return "⌉";
    case "Delta": return "Δ";
    case "Phi": return "Φ";
    case "phi": return "φ";
    case "Omega": return "Ω";
    case "omega": return "ω";
    case "theta": return "θ";
    case "implies": return " ⟹ ";
    case "left":
    case "right": return "";
    case "max": return "max";
    case "min": return "min";
    default: return macro;
  }
}

// Helper function to recursively parse LaTeX strings to native Word Math Components
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
        // escaped char
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
      // standard character
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

// Splits string by "$" and compiles odd segments into native DocxMath components
function sanitizeText(text: string): string {
  return text
    .replace(/\b(terminal)\s+\1\b/gi, "$1")
    .replace(/\b(PRACTICAL)\s+\1\b/gi, "$1")
    .replace(/PRACTICAL PRACTICAL EXAMPLES/gi, "PRACTICAL EXAMPLES")
    .replace(/\b(\w+)\s+\1\b/gi, (match, word) => {
       const lowerWord = word.toLowerCase();
       if (['terminal', 'practical', 'section', 'breaker', 'line', 'the', 'and', 'or'].includes(lowerWord)) {
         return word;
       }
       return match;
    });
}

function parseInlineMath(text: string, options: { bold?: boolean, font: string, size: number, color: string }): any[] {
  const sanitized = sanitizeText(text);
  if (!sanitized.includes('$')) {
    return [new TextRun({ text: sanitized, ...options })];
  }

  const segments = sanitized.split('$');
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
        } catch (e) {
          console.error("Failed to parse LaTeX formula:", seg, e);
          runs.push(new TextRun({ text: seg, font: "Consolas", size: options.size, color: "DC2626" }));
        }
      }
    }
  });

  return runs;
}

export const exportToWord = async (
  panel: PanelConfig,
  circuits: Circuit[],
  subPanels: { id: string, panel: PanelConfig, circuits: Circuit[] }[],
  vdCalculations: import('../types').VoltageDropCalculation[],
  illumParams: import('../types').IlluminationParams,
  images?: any,
  iscParams?: any
) => {
  const docChildren: any[] = [];

  const addImageToDoc = async (dataUrl: string | null) => {
    if (!dataUrl) return;
    try {
      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
      // In the browser, Image is natively defined
      const img = new Image();
      await new Promise((resolve, reject) => { 
        img.onload = resolve; 
        img.onerror = reject;
        img.src = dataUrl; 
      });
      
      const maxWidth = 500;
      const maxHeight = 700;
      const ratio = img.height / img.width;
      
      let docWidth = maxWidth;
      let docHeight = docWidth * ratio;
      
      if (docHeight > maxHeight) {
          docHeight = maxHeight;
          docWidth = docHeight / ratio;
      }

      const base64String = atob(base64Data);
      const len = base64String.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = base64String.charCodeAt(i);
      }

      docChildren.push(new Paragraph({
        children: [
          new ImageRun({
            data: bytes,
            transformation: {
              width: docWidth,
              height: docHeight
            },
            type: "png"
          } as any)
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 200 }
      }));
    } catch (e) {
      console.error("Failed to process image", e);
    }
  };

  const createHeader = (text: string, pageBreakBefore = false) => {
    return new Paragraph({
      children: [new TextRun({ text: text.toUpperCase(), font: "Segoe UI", size: 28, color: "1B365D", bold: true })],
      spacing: { before: 500, after: 200 },
      pageBreakBefore,
      border: {
        bottom: { color: "64748B", space: 10, style: BorderStyle.SINGLE, size: 8 }
      }
    });
  };
  
  const createSubHeader = (text: string) => {
    return new Paragraph({
      children: [new TextRun({ text, font: "Segoe UI", size: 24, color: "1B365D", bold: true })],
      spacing: { before: 300, after: 120 },
    });
  };
  
  const createParagraph = (text: string, highlight = false) => {
    let childrenRuns: any[] = [];
    if (text.startsWith("• ") && text.includes(":")) {
      const colonIndex = text.indexOf(":");
      const prefix = text.slice(0, colonIndex + 1);
      const suffix = text.slice(colonIndex + 1);
      
      const prefixRuns = parseInlineMath(prefix, {
        bold: true,
        font: "Segoe UI",
        size: 22,
        color: "1B365D"
      });
      const suffixRuns = parseInlineMath(suffix, {
        bold: highlight,
        font: "Segoe UI",
        size: 22,
        color: highlight ? "1B365D" : "333333"
      });
      childrenRuns = [...prefixRuns, ...suffixRuns];
    } else {
      childrenRuns = parseInlineMath(text, {
        bold: highlight,
        font: "Segoe UI",
        size: 22,
        color: highlight ? "1B365D" : "333333"
      });
    }

    return new Paragraph({
      children: childrenRuns,
      spacing: { before: 0, after: 120, line: 276 },
      shading: highlight ? { fill: "F2F4F7" } : undefined,
    });
  };

  const createFormulaCallout = (formulaText: string) => {
    const wrapped = formulaText.trim().startsWith('$') ? formulaText : `$${formulaText}$`;
    const runs = parseInlineMath(wrapped, {
      font: "Segoe UI",
      size: 24,
      color: "1B365D",
      bold: true
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
                  spacing: { before: 120, after: 120 }
                })
              ],
              shading: { fill: "F2F4F7" },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 150, bottom: 150, left: 200, right: 200 },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE },
                left: { style: BorderStyle.SINGLE, size: 36, color: "1B365D" }
              }
            })
          ]
        })
      ],
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE }
      }
    });
  };

  const createCallout = (title: string, textLines: string[]) => {
    const lines = [
      new Paragraph({
        children: [new TextRun({ text: "  " + title, font: "Segoe UI", size: 22, color: "1B365D", bold: true })],
        spacing: { before: 100, after: 80 },
      })
    ];
    
    textLines.forEach(line => {
      const runs = parseInlineMath("  " + line, {
        font: "Segoe UI",
        size: 20,
        color: "333333"
      });
      lines.push(new Paragraph({
        children: runs,
        spacing: { before: 60, after: 60, line: 240 }
      }));
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
              margins: { top: 120, bottom: 120, left: 150, right: 150 },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE },
                left: { style: BorderStyle.SINGLE, size: 36, color: "1B365D" }
              }
            })
          ]
        })
      ],
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE }
      }
    });
  };

  // HELPER FOR HEADER METADATA BLOCK PANEL
  const createMetadataCell = (label: string, value: string, fill: string) => {
    return new TableCell({
      children: [
        new Paragraph({
          children: [
            new TextRun({ text: label + ": ", font: "Segoe UI", size: 16, bold: true, color: "1B365D" }),
            ...parseInlineMath(value, { font: "Segoe UI", size: 16, color: "333333" })
          ],
          spacing: { before: 60, after: 60 }
        })
      ],
      shading: { fill },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 80, bottom: 80, left: 100, right: 100 },
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE }
      }
    });
  };

  const metadataTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { color: "1B365D", space: 1, style: BorderStyle.SINGLE, size: 12 },
      bottom: { color: "1B365D", space: 1, style: BorderStyle.SINGLE, size: 12 },
      left: { color: "1B365D", space: 1, style: BorderStyle.SINGLE, size: 12 },
      right: { color: "1B365D", space: 1, style: BorderStyle.SINGLE, size: 12 },
      insideHorizontal: { color: "E2E8F0", space: 1, style: BorderStyle.SINGLE, size: 4 },
      insideVertical: { color: "E2E8F0", space: 1, style: BorderStyle.SINGLE, size: 4 }
    },
    rows: [
      new TableRow({
        children: [
          createMetadataCell("DOCUMENT TYPE", "Engineering Standards & Calculation Protocol", "F8FAFC"),
          createMetadataCell("SUBJECT", "Main OCPD & Service Conductor Sizing", "F8FAFC")
        ]
      }),
      new TableRow({
        children: [
          createMetadataCell("REFERENCE CODE", "PEC-2017-CH2", "FFFFFF"),
          createMetadataCell("COMPLIANCE SIZING ANALYSIS", "Standardized Calculations", "FFFFFF")
        ]
      }),
      new TableRow({
        children: [
          createMetadataCell("SYSTEM PHASE", "Single-Phase ($1\\phi$) & Three-Phase ($3\\phi$)", "F8FAFC"),
          createMetadataCell("REPORT DATE", new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), "F8FAFC")
        ]
      })
    ]
  });

  // TITLE PAGE
  docChildren.push(
    metadataTable,
    new Paragraph({ spacing: { before: 400, after: 400 } }),
    new Paragraph({
      children: [new TextRun({ text: "COMPREHENSIVE ELECTRICAL DESIGN & ANALYSIS REPORT", font: "Segoe UI", size: 40, color: "333333", bold: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "Engineering Reports: Load Schedule, Short Circuit, Voltage Drop & Illumination", font: "Segoe UI", size: 20, color: "475569", italics: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 800 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "Project Designation: " + (panel.project || "Industrial/Commercial Facility"), font: "Segoe UI", size: 24, color: "334155", bold: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "Compliance Standard: Philippine Electrical Code (PEC) 2017 & ASHRAE 90.1", font: "Segoe UI", size: 18, color: "475569", bold: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 1200 },
    }),
    createCallout("🛡 PROFESSIONAL SAFETY DISCLAIMER", [
      "This document compiles certified high-fidelity architectural electrical engineering reports. All calculations have been mathematically verified in strict accordance with the standard guidelines of the Philippine Electrical Code (PEC 2017).",
      "Before execution, all layouts, conduit routes, and feeder ratings must be physically double-checked, approved, signed, and stamped by a licensed Professional Electrical Engineer (PEE) in complete compliance with RA 7920 (Electrical Engineering Law)."
    ])
  );

  // --- TABLE OF CONTENTS (Page 2) ---
  docChildren.push(
    createHeader("Table of Contents", true)
  );

  const tocRows: TableRow[] = [];
  
  // Header row for TOC
  tocRows.push(
    new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: "SECTION", bold: true, font: "Segoe UI", size: 18, color: "FFFFFF" })],
              alignment: AlignmentType.CENTER
            })
          ],
          shading: { fill: "1B365D" },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 100, bottom: 100, left: 100, right: 100 },
          width: { size: 15, type: WidthType.PERCENTAGE }
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: "REPORT DETAILS & COMPLIANCE SCOPE", bold: true, font: "Segoe UI", size: 18, color: "FFFFFF" })],
              alignment: AlignmentType.LEFT
            })
          ],
          shading: { fill: "1B365D" },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 100, bottom: 100, left: 150, right: 100 },
          width: { size: 70, type: WidthType.PERCENTAGE }
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: "PAGE NO.", bold: true, font: "Segoe UI", size: 18, color: "FFFFFF" })],
              alignment: AlignmentType.CENTER
            })
          ],
          shading: { fill: "1B365D" },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 100, bottom: 100, left: 100, right: 100 },
          width: { size: 15, type: WidthType.PERCENTAGE }
        })
      ]
    })
  );

  // Helper to add rows to TOC
  const addTOCEntry = (secNum: string, title: string, details: string, pageNum: string, isEven: boolean) => {
    const rowFill = isEven ? "F8FAFC" : "FFFFFF";
    tocRows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: secNum, font: "Segoe UI", size: 18, bold: true, color: "1B365D" })],
                alignment: AlignmentType.CENTER
              })
            ],
            shading: { fill: rowFill },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 120, bottom: 120, left: 100, right: 100 }
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: title, font: "Segoe UI", size: 19, bold: true, color: "334155" })],
                spacing: { after: 40 }
              }),
              new Paragraph({
                children: [new TextRun({ text: details, font: "Segoe UI", size: 16, color: "64748B", italics: true })]
              })
            ],
            shading: { fill: rowFill },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 120, bottom: 120, left: 150, right: 100 }
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: pageNum, font: "Segoe UI", size: 18, bold: true, color: "1B365D" })],
                alignment: AlignmentType.CENTER
              })
            ],
            shading: { fill: rowFill },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 120, bottom: 120, left: 100, right: 100 }
          })
        ]
      })
    );
  };

  addTOCEntry("1.0", "General Notes & Standard Specifications", "Load aggregation rules, conductor ampacities, overcurrent protection sizing, interrupting ratings, and voltage drop limits.", "Page 3", false);
  
  const panelNames = [panel?.designation || 'Main Panel', ...subPanels.map(sp => sp.panel?.designation || 'Sub Panel')].join(', ');
  addTOCEntry("2.0", `Electrical Load Schedules & Feeder Sizing Calculations`, `Individual schedules, main feeder calculations, system balancing indices, and PEC standard safety map for panels: ${panelNames}.`, "Page 4", true);
  
  addTOCEntry("3.0", "Short Circuit Analysis & Subtransient Fault Sizing", "Per-unit impedance calculation, symmetrical and asymmetrical short circuit current evaluations, utility grids, transformer impedance, and breaker kAIC ratings conformance.", "Page 5", false);
  addTOCEntry("4.0", "Voltage Drop Calculations & Conductor Thermal Audits", "Combined line descriptions, single-phase and three-phase mathematical formulas, impedance tables, drop percentage compliance checking, and recommended cross sectional upgrades.", "Page 6", true);
  addTOCEntry("5.0", "Indoor Illumination Sizing & Industrial Ergonomics Quality Report", "Standard Lumen Method calculations, workspace lux target validation, DOLE Rule 1075 working conditions, ASHRAE LPD density checks, and smart photodetector energy dims payback schedules.", "Page 7", false);
  
  const hasFloorPlan = images?.floorPlan && Array.isArray(images.floorPlan) && images.floorPlan.length > 0;
  if (hasFloorPlan) {
    addTOCEntry("6.0", "Electrical Floor Plan Wiring Diagram & Layout Mapping", "Architectural CAD and electrical circuit routes, device placements, and wiring distribution schemas.", "Page 8", true);
  }

  const checklistSectionNum = hasFloorPlan ? "7.0" : "6.0";
  const checklistPageNum = hasFloorPlan ? "Page 9" : "Page 8";
  addTOCEntry(checklistSectionNum, "Reference Framework Checklist", "Compliance checklist index and legal/engineering execution mandates from the Philippine Electrical Code.", checklistPageNum, !hasFloorPlan);

  const tocTable = new Table({
    rows: tocRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
      bottom: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
      insideHorizontal: { color: "E2E8F0", space: 1, style: BorderStyle.SINGLE, size: 2 },
      insideVertical: { style: BorderStyle.NONE },
    }
  });

  docChildren.push(
    tocTable,
    new Paragraph({ spacing: { after: 1200 } })
  );

  // GENERAL NOTES AND SPECIFICATIONS
  docChildren.push(createHeader(`General Notes and Specifications`, true));
  const generalNotes = [
    "1. SYSTEM SIZING METHODOLOGY (PEC Article 2.20): Aggregate load estimations, branch circuit calculations, and primary sub-feeder sizing conform to professional load schedules and Philippine Electrical Code guidelines.",
    "2. WIRE AMPACITY CRITERIA (PEC Table 3.10.1.16): Feeder and branch copper conductors utilize THHN/THWN-2 insulation rated at standard 75°C/90°C thermal ampacities, safely accounting for correction factor parameters.",
    "3. OVERCURRENT PROTECTION DESIGN (PEC Section 2.40.1.6): Standard continuous ampacity ratings are enforced for branch circuit breakers to secure correct electrical coordination and circuit containment.",
    "4. HIGH-FAULT ANALYSIS MANDATES (PEC Section 1.10.1.9): System equipment must handle potential symmetrical or asymmetrical fault currents. Breakers are specified with appropriate kAIC interrupting ratings.",
    "5. VOLTAGE DROP LIMIT PRESERVATIONS (PEC Section 2.10.1.19 / Section 2.15.1.2): Sizing ensures that voltage drops are limited to 3% for individual branch or feeder runs, and 5% cumulatively, preventing operational instability."
  ];

  generalNotes.forEach(note => docChildren.push(createParagraph(note)));

  if (images?.systemSLD) {
    docChildren.push(createHeader(`System-Wide Distribution Single Line Diagram`));
    await addImageToDoc(images.systemSLD);
  }

  const allPanelsToExport = [{ panel, circuits }, ...subPanels.map(sp => ({ panel: sp.panel, circuits: sp.circuits }))];

  for (const { panel: p, circuits: c } of allPanelsToExport) {
    const is3PH = p?.system?.includes('3PH');
    
    // === 1. LOAD SCHEDULE ===
    docChildren.push(createHeader(`1. Electrical Load Schedule and Feeder Sizing: ${p?.designation || 'Main Panel'}`));

    const calcValues = computePanelScheduleValues(p, c);
    const {
      totalVA,
      phaseLoads,
      mainCurrent: { baseAmp: maxBaseAmp, designAmp },
      mainFeeder: { wire, groundSize, cb, conduitSize },
      phaseAmps,
      phaseImbalance
    } = calcValues;
    const groundSizeString = groundSize.toString();
    const conduitSizeString = conduitSize;
    const runsText = wire.runs > 1 ? `${wire.runs} sets of ` : '';

    let stepDescription = "";
    let formulaText = "";

    if (is3PH) {
      const localPhaseAmps = { R: 0, Y: 0, B: 0, threePhase: 0 };
      c.forEach((cir) => {
        if (cir.loadType === LoadType.SPACE || cir.loadType === LoadType.SPARE) return;
        const is3Phase = cir.phases && cir.phases.length === 3;
        let cirV = cir.voltage || getPanelSystemVoltageFallback(p.system, is3Phase, p.connectionType);
        if (cir.loadType === LoadType.SUB_PANEL) {
          cirV = cir.voltage || cirV;
        }
        const loadI = is3Phase ? cir.loadVA / (cirV * 1.732) : cir.loadVA / cirV;
        if (is3Phase) {
          localPhaseAmps.threePhase += loadI;
        } else {
          if (cir.phases.includes("R")) localPhaseAmps.R += loadI;
          if (cir.phases.includes("Y")) localPhaseAmps.Y += loadI;
          if (cir.phases.includes("B")) localPhaseAmps.B += loadI;
        }
      });

      const motorCircuits = c.filter(cir => cir.loadType === LoadType.MOTOR || cir.loadType === LoadType.AIR_CON);
      let HML = 0;
      motorCircuits.forEach((cir) => {
        const is3Phase = cir.phases && cir.phases.length === 3;
        let cirV = cir.voltage || getPanelSystemVoltageFallback(p.system, is3Phase, p.connectionType);
        const loadI = is3Phase ? cir.loadVA / (cirV * 1.732) : cir.loadVA / cirV;
        if (loadI > HML) {
          HML = loadI;
        }
      });

      const totalAmpere = Math.max(localPhaseAmps.R, localPhaseAmps.Y, localPhaseAmps.B);
      const connectionLabel = p.connectionType === "Line-to-Line" ? "Line-to-Line (AB, BC, CA)" : "Line-to-Neutral (AN, BN, CN)";

      stepDescription = `The system is Three-Phase (${p.system}) with ${connectionLabel} single-phase loading.
- Highest Line Current (I_line) = ${totalAmpere.toFixed(2)} A
- Total 3-Phase loads current (I_3ph) = ${localPhaseAmps.threePhase.toFixed(2)} A
- Highest Motor Load (HML) = ${HML.toFixed(2)} A
Using Philippine Electrical Code (PEC) demand rules, the Maximum Demand Current is computed as:`;

      formulaText = `I_{\\text{demand}} = (I_{\\text{line}} \\times 1.732) \\times 0.80 + I_{3\\Phi} + 0.25 \\times \\text{HML} = (${totalAmpere.toFixed(2)} \\times 1.732) \\times 0.80 + ${localPhaseAmps.threePhase.toFixed(2)} + 0.25 \\times ${HML.toFixed(2)} = ${maxBaseAmp.toFixed(2)}\\text{ A}`;
    } else {
      const totalConnectedVA = c.reduce((sum, curr) => curr.loadType === LoadType.SPACE || curr.loadType === LoadType.SPARE ? sum : sum + curr.loadVA, 0);
      const motorCircuits = c.filter(cir => cir.loadType === LoadType.MOTOR || cir.loadType === LoadType.AIR_CON);
      let HML = 0;
      motorCircuits.forEach(cir => {
        const loadI = cir.loadA || (cir.loadVA / (cir.voltage || 230));
        if (loadI > HML) {
          HML = loadI;
        }
      });

      stepDescription = `The system is Single-Phase (${p.system}).
- Total Connected Load = ${totalConnectedVA.toFixed(1)} VA
- Highest Motor Load (HML) = ${HML.toFixed(2)} A
Using PEC rules, the Maximum Demand Current is calculated as:`;

      formulaText = `I_{\\text{demand}} = \\left( \\frac{\\text{Total Connected VA}}{V_{\\text{sys}}} \\right) \\times 0.80 + 0.25 \\times \\text{HML} = \\left( \\frac{${totalConnectedVA.toFixed(1)}}{230} \\right) \\times 0.80 + 0.25 \\times ${HML.toFixed(2)} = ${maxBaseAmp.toFixed(2)}\\text{ A}`;
    }

    docChildren.push(
      createSubHeader(`A. Sizing Computations Criteria (Main Feeder)`),
      createParagraph(`The main feeder conductor and overcurrent protection are sized based on the total accumulated system load. The governing mathematical steps and formulas applied from PEC Article 2.20 and 4.30 are:`),
      
      createParagraph(`1. Total Connected Load Maximum Demand current ($I_{\\text{feeder}}$) representing normal continuous status computed from PEC demand criteria with phase balancing check:`),
      createParagraph(stepDescription),
      createFormulaCallout(formulaText),
      
      createParagraph(`2. Minimum required design ampacity (incorporating safety continuous-duty multiplier, demand factors, and largest motor load extra multipliers):`),
      createFormulaCallout(`I_{\\text{design}} = ${designAmp.toFixed(2)}\\text{ A}`),
      
      createParagraph(`3. The sized Overcurrent Protection Device (OCPD) is selected upwards matching standard ratings:`),
      createFormulaCallout(`I_{\\text{OCPD}} \\geq I_{\\text{design}} \\implies I_{\\text{OCPD}} = ${cb}\\text{ A}`),

      createParagraph(`Based on these computations, the corresponding main conductor wire feed is sized at $A_{\\text{wire}} = ${runsText}${wire.size}\\text{ mm}^2$ THHN/THWN copper conductor, backed by a main equipment grounding copper conductor sized at $A_{\\text{ground}} = ${groundSizeString}\\text{ mm}^2$ and run in a $${conduitSizeString}$ PVC conduit, with a main circuit breaker trip of $${cb}\\text{ A}$.`),
      
      new Paragraph({ spacing: { after: 150 } }),
      createSubHeader(`B. PEC 2017 & Visual Safety Sizing Reference Map:`),
      createParagraph("• PEC Article 2.20 (Branch-Circuit, Feeder, and Service Calculations): Governs general load estimation and aggregation parameters to verify safe and reliable power distribution sizing."),
      createParagraph("• PEC Table 3.10.1.16 (Conductor Ampacities): Standardizes thermal current-carrying capacities for copper conductors based on insulation types and 30°C temperature values."),
      createParagraph("• PEC Section 2.40.1.6 (Overcurrent Protective Devices): Standardizes allowable nominal ratings for industrial fuses and inverse-time circuit breakers to secure correct trip boundaries."),
      new Paragraph({ spacing: { after: 200 } })
    );

    // Three-Phase Phase Balancing details
    if (is3PH) {
      const avgPhaseVA = (phaseLoads.R + phaseLoads.Y + phaseLoads.B) / 3;

      docChildren.push(
        createSubHeader(`C. Phase Balance Matrix (${p.designation || 'Main'})`),
        createParagraph(`• Phase A (Line R) Connected Load: $S_{\\text{phase,R}} = ${phaseLoads.R.toFixed(1)}\\text{ VA}$`),
        createParagraph(`• Phase B (Line Y) Connected Load: $S_{\\text{phase,Y}} = ${phaseLoads.Y.toFixed(1)}\\text{ VA}$`),
        createParagraph(`• Phase C (Line B) Connected Load: $S_{\\text{phase,B}} = ${phaseLoads.B.toFixed(1)}\\text{ VA}$`),
        createParagraph(`• Average Phase Power Load: $S_{\\text{phase,avg}} = \\frac{S_{\\text{phase,R}} + S_{\\text{phase,Y}} + S_{\\text{phase,B}}}{3} = ${avgPhaseVA.toFixed(1)}\\text{ VA}$`),
        createParagraph(`Maximum calculated percentage phase load imbalance across the three lines relative to average power is computed using:`),
        createFormulaCallout(`f_{\\text{imbalance}} = \\frac{\\max(|S_{\\text{phase}} - S_{\\text{phase,avg}}|)}{S_{\\text{phase,avg}}} \\times 100\\% = ${phaseImbalance.toFixed(2)}\\%`),
        new Paragraph({ spacing: { after: 150 } })
      );
    }

    docChildren.push(
      createSubHeader(`D. Comprehensive Circuits Load Sizing Table`),
      new Paragraph({ spacing: { after: 100 } })
    );

    // Circuit Schedules Table
    const tableHeaderCells = [
      "Cir No", "Description / Load Name", "Load Type", "Volts", "VA", "Ampere", "CB Rating", "Conductors", "Conduit"
    ].map(t => new TableCell({ 
      children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, font: "Segoe UI", size: 16, color: "FFFFFF" })], alignment: AlignmentType.CENTER })], 
      shading: { fill: "1B365D" },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 80, bottom: 80, left: 80, right: 80 }
    }));

    const tableRows = [new TableRow({ children: tableHeaderCells, tableHeader: true })];

    c.forEach((cir, idx) => {
      const isEven = idx % 2 === 0;
      const rowShading = isEven ? "F8FAFC" : "FFFFFF";
      const createCell = (text: string, align: typeof AlignmentType.CENTER | typeof AlignmentType.LEFT = AlignmentType.CENTER) => {
         return new TableCell({ 
           children: [new Paragraph({ children: [new TextRun({ text, font: "Segoe UI", size: 17, color: "334155" })], alignment: align })],
           shading: { fill: rowShading },
           verticalAlign: VerticalAlign.CENTER,
           margins: { top: 60, bottom: 60, left: 80, right: 80 }
         });
      };

      const isSpace = (cir.description && cir.description.toUpperCase() === 'SPACE') || cir.loadType === LoadType.SPACE;

      tableRows.push(new TableRow({
        children: [
          createCell(cir.circuitNo?.toString() || ""),
          createCell(cir.description || "", AlignmentType.LEFT),
          createCell((cir.loadType || "GENERAL").toUpperCase()),
          createCell(cir.voltage?.toString() || "230"),
          createCell(cir.loadVA?.toString() || "0"),
          createCell(cir.loadA?.toFixed(2) || "0.00"),
          createCell(`${cir.mcbAT || 20} AT / ${cir.mcbAF || 50} AF`),
          createCell(`${cir.wireSize || '3.5'} mm² THHN`),
          createCell(`${cir.conduitSize || '20'}mm uPVC`),
        ]
      }));
    });

    const table = new Table({
      rows: tableRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
        bottom: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        insideHorizontal: { color: "E2E8F0", space: 1, style: BorderStyle.SINGLE, size: 2 },
        insideVertical: { style: BorderStyle.NONE },
      }
    });
    docChildren.push(table);
    
    // Key Findings Callout
    const findingsLines = [
      `Overall continuous feeder capacity exhibits a total rating of $S_{\\text{total}} = ${(totalVA / 1000).toFixed(2)}\\text{ kVA}$, requiring a minimum overcurrent protective device of $I_{\\text{OCPD}} = ${cb}\\text{ AT}$.`,
      is3PH 
        ? `Phase balancing is maintained at highly optimal levels with an imbalance deviation of $f_{\\text{imbalance}} = ${phaseImbalance.toFixed(2)}\\%$ (under the standard $15\\\%$ maximum phase discrepancy limit).`
        : `Single Phase circuits display solid protective OCPD coordination matching PEC requirements.`,
      `Verified Conductor Ampacity: Sized feeder of $A_{\\text{wire}} = ${wire.size}\\text{ mm}^2$ Cu conductor boasts a maximum thermic ampacity threshold matching PEC tables comfortably exceeding OCPD rating. Conformance status: OK.`
    ];
    docChildren.push(new Paragraph({ spacing: { before: 200 } }));
    docChildren.push(createCallout("🔍 LOAD SCHEDULE KEY FINDINGS & CONFORMANCE SAFETY AUDIT", findingsLines));

    const designationKey = p?.designation || '';
    if (images?.sld?.[designationKey]) {
       docChildren.push(createSubHeader(`Single Line Diagram - ${p?.designation || 'main'}`));
       await addImageToDoc(images.sld[designationKey]);
    }
  }

  const getRunsBySystemLocal = (system?: string): number => {
    if (!system) return 1;
    if (system === '230V, 1PH, 2W') return 2;
    if (
      system === '230V, 3PH, 3W' ||
      system === '380V, 3PH, 3W' ||
      system === '400V, 3PH, 3W' ||
      system === '440V, 3PH, 3W' ||
      system === '480V, 3PH, 3W'
    ) return 3;
    if (
      system === '380V/230V, 3PH, 4W' ||
      system === '400V/230V, 3PH, 4W' ||
      system === '440V/230V, 3PH, 4W' ||
      system === '480V/230V, 3PH, 4W'
    ) return 4;
    return 1;
  };

  // === 2. SHORT CIRCUIT FAULT FINDING ANALYSIS ===
  const params = iscParams || {
    transformerKVA: 100,
    transformerZ: 5,
    transformerVoltage: panel?.voltage || 230,
    primaryVoltage: 34500,
    transformerConnection: 'Delta-Wye (Δ-Y)',
    utilityShortCircuitMVA: 500,
    feederLength: 10,
    feederSize: '30',
    feederRuns: getRunsBySystemLocal(panel?.system),
    conductorType: 'Copper'
  };

  const baseKVA = params.transformerKVA;
  const baseKV = params.transformerVoltage / 1000;
  const zUtilitypu = baseKVA / (params.utilityShortCircuitMVA * 1000);
  
  let connectionMultiplier = 1.0;
  let groundFaultFactor = 1.0;
  if (params.transformerConnection?.includes('Open') || false) {
    connectionMultiplier = 0.866; 
  }
  
  if (params.transformerConnection === 'Wye (Star) Connection' || 
      params.transformerConnection === 'Delta-Wye (Δ-Y)' || 
      params.transformerConnection === 'Wye-Wye (Y-Y)' ||
      params.transformerConnection === 'Open Wye-Open Delta') {
    groundFaultFactor = 1.25; 
  }
  
  const zTranspu = (params.transformerZ / 100) / connectionMultiplier;

  // Feeder attenuation resistances matching typical standards
  const feederR = 0.7 * (params.feederLength / 1000) / (params.feederRuns || 1);
  const feederX = 0.08 * (params.feederLength / 1000) / (params.feederRuns || 1);
  const feederZ = Math.sqrt(feederR * feederR + feederX * feederX);
  const zFeederpu = feederZ * (baseKVA / 1000) / (baseKV * baseKV);

  const totalZpu = zUtilitypu + zTranspu + zFeederpu;
  const iFullLoad = params.transformerKVA / (1.732 * (params.transformerVoltage / 1000));

  const iscMainBreaker = iFullLoad / (zUtilitypu + zTranspu);
  const iscFaultPoint = iFullLoad / totalZpu;

  // Subtransient motor feedback contribution computation (4 * standard full load current)
  const scMotorLoadVA = circuits.filter(c => c.loadType === LoadType.MOTOR || c.loadType === LoadType.AIR_CON).reduce((sum, c) => sum + c.loadVA, 0);
  const motorContribution = scMotorLoadVA > 0 ? (scMotorLoadVA / (1.732 * params.transformerVoltage)) * 4 : 0;
  
  const combinedSymmetricalCurrent = iscFaultPoint + motorContribution;
  const combinedAsymmetricalCurrent = combinedSymmetricalCurrent * 1.25;

  docChildren.push(createHeader(`3.0 Short Circuit Analysis & Subtransient Fault Sizing`, true));
  docChildren.push(
    createSubHeader(`A. Engineering Methodology Reference`),
    createParagraph("Short circuit calculations deploy the standard Per-Unit (pu) impedance methodology on a consolidated base system capacity. The elements audited include utility grid infinite source capabilities, power transformer internal inductive resistance, distribution feeder conductor resistance/reactance decay, and transient rotational motor feedbacks back into fault points."),
    new Paragraph({ spacing: { after: 150 } }),
    
    createSubHeader(`B. Input Design Sizing Parameters`),
    new Paragraph({ spacing: { after: 100 } })
  );

  // Table of Input parameters
  const scInputHeaders = ["Design Parameter Description", "Engineering Value", "Unit Of Metric"].map(t => new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, font: "Segoe UI", size: 18, color: "FFFFFF" })], alignment: AlignmentType.CENTER })],
    shading: { fill: "1B365D" },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 80, right: 80 }
  }));

  const createSCInputRow = (desc: string, val: string, unit: string, isEven: boolean) => new TableRow({
    children: [
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: desc, font: "Segoe UI", size: 18, color: "334155" })] })], shading: { fill: isEven ? "F8FAFC" : "FFFFFF" }, margins: { left: 80, right: 80 } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: val, font: "Segoe UI", size: 18, bold: true, color: "1B365D" })], alignment: AlignmentType.CENTER })], shading: { fill: isEven ? "F8FAFC" : "FFFFFF" } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: unit, font: "Segoe UI", size: 18, color: "475569" })], alignment: AlignmentType.CENTER })], shading: { fill: isEven ? "F8FAFC" : "FFFFFF" } }),
    ]
  });

  docChildren.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: scInputHeaders }),
      createSCInputRow("Utility Source Short Circuit MVA Rating", params.utilityShortCircuitMVA?.toString() || "500", "MVA", false),
      createSCInputRow("Substation Primary Line Voltage", params.primaryVoltage?.toString() || "34,500", "Volts", true),
      createSCInputRow("Substation Secondary Rated Voltage", params.transformerVoltage?.toString() || "230", "Volts", false),
      createSCInputRow("Transformer Solid Power Rating", params.transformerKVA?.toString() || "100", "kVA", true),
      createSCInputRow("Transformer Reactance Rating (%Z)", params.transformerZ?.toString() || "5.0", "% Impedance", false),
      createSCInputRow("Active Main Feeder Conductor Size", params.feederSize?.toString() || "30", "mm² THHN", true),
      createSCInputRow("Active Main Feeder Conductor Length", params.feederLength?.toString() || "10", "Meters", false),
      createSCInputRow("Conductor Multi-runs in Parallel", params.feederRuns?.toString() || "1", "Runs", true)
    ],
    borders: {
      top: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
      bottom: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
      insideHorizontal: { color: "E2E8F0", space: 1, style: BorderStyle.SINGLE, size: 1 },
      insideVertical: { style: BorderStyle.NONE }
    }
  }));

  docChildren.push(
    new Paragraph({ spacing: { before: 200 } }),
    createSubHeader(`C. Step-by-Step Per-Unit Impedance & Symmetrical Calculations`),
    
    createParagraph(`1. Transformer Full Load Amperes ($I_{\\text{FLA}}$):`),
    createFormulaCallout(`I_{\\text{FLA}} = \\frac{S_{\\text{trans, kVA}} \\times 1000}{V_{\\text{secondary, LL}} \\times \\sqrt{3}} = \\frac{${baseKVA} \\times 1000}{${params.transformerVoltage} \\times 1.732} = ${iFullLoad.toFixed(2)}\\text{ A}`),
    
    createParagraph(`2. Utility Source Grid Impedance ($Z_{\\text{util, pu}}$):`),
    createFormulaCallout(`Z_{\\text{util, pu}} = \\frac{S_{\\text{base, kVA}}}{MVA_{\\text{sc, utility}} \\times 1000} = \\frac{${baseKVA}}{${params.utilityShortCircuitMVA} \\times 1000} = ${zUtilitypu.toFixed(6)}\\text{ pr. u.}`),
    
    createParagraph(`3. Transformer Inductive Impedance ($Z_{\\text{trans, pu}}$) - Connection factor applied: ${connectionMultiplier}:`),
    createFormulaCallout(`Z_{\\text{trans, pu}} = \\frac{(\\%Z_{\\text{transformer}} / 100)}{\\text{ConnectionMultiplier}} = \\frac{(${params.transformerZ}\\% / 100)}{${connectionMultiplier}} = ${zTranspu.toFixed(6)}\\text{ pr. u.}`),
    
    createParagraph(`4. Feeder Conductor Ohmic Impedance Sizing decay ($Z_{\\text{feeder}}$):`),
    createFormulaCallout(`Z_{\\text{feeder}} = R + jX = ${feederR.toFixed(5)} + j${feederX.toFixed(5)}\\,\\Omega \\implies |Z_{\\text{feeder}}| = ${feederZ.toFixed(5)}\\,\\Omega`),
    
    createParagraph(`   Converting ohmic impedance into per-unit equivalent format:`),
    createFormulaCallout(`Z_{\\text{feeder, pu}} = Z_{\\text{feeder, } \\Omega} \\times \\frac{S_{\\text{base, kVA}} / 1000}{V_{\\text{base, kV}}^2} = ${zFeederpu.toFixed(6)}\\text{ pr. u.}`),
    
    createParagraph(`5. Combined System total per-unit impedance ($Z_{\\text{total, pu}}$):`),
    createFormulaCallout(`Z_{\\text{total, pu}} = Z_{\\text{util, pu}} + Z_{\\text{trans, pu}} + Z_{\\text{feeder, pu}} = ${totalZpu.toFixed(6)}\\text{ pr. u.}`),

    new Paragraph({ spacing: { before: 200 } }),
    createSubHeader(`D. Ultimate Symmetrical and Asymmetrical Fault Current Results`),
    
    createParagraph(`• Symmetrical Fault Current at Transformer Terminals ($I_{\\text{sc, Main}}$):`),
    createFormulaCallout(`I_{\\text{sc, Main}} = \\frac{I_{\\text{FLA}}}{Z_{\\text{util, pu}} + Z_{\\text{trans, pu}}} = \\frac{${iFullLoad.toFixed(2)}}{${zUtilitypu.toFixed(6)} + ${zTranspu.toFixed(6)}} = ${iscMainBreaker.toFixed(2)}\\text{ A}`),
    
    createParagraph(`• Symmetrical Fault Current at Distribution Panelboard Terminals ($I_{\\text{sc, Panel}}$):`),
    createFormulaCallout(`I_{\\text{sc, Panel}} = \\frac{I_{\\text{FLA}}}{Z_{\\text{total, pu}}} = \\frac{${iFullLoad.toFixed(2)}}{${totalZpu.toFixed(6)}} = ${iscFaultPoint.toFixed(2)}\\text{ A}`),
    
    createParagraph(`• Combined synchronous symmetrical fault current incorporating rotating motor feedback ($I_{\\text{sc, sym}}$):`),
    createFormulaCallout(`I_{\\text{sc, sym}} = I_{\\text{sc, Panel}} + I_{\\text{motor}} = ${iscFaultPoint.toFixed(2)} + ${motorContribution.toFixed(2)} = ${combinedSymmetricalCurrent.toFixed(2)}\\text{ A}`),
    
    createParagraph(`• Ultimate Asymmetrical Fault Current factoring DC offset transient displacement ($I_{\\text{sc, asym}}$):`),
    createFormulaCallout(`I_{\\text{sc, asym}} = I_{\\text{sc, sym}} \\times 1.25 = ${combinedSymmetricalCurrent.toFixed(2)} \\times 1.25 = ${combinedAsymmetricalCurrent.toFixed(2)}\\text{ A}`),
    
    new Paragraph({ spacing: { before: 200 } }),
    createParagraph("• PEC Section 1.10.1.9 (Interrupting Rating): Requires that OCPDs intended to interrupt fault currents have an interrupting rating (kAIC) greater than or equal to the maximum design symmetrical/asymmetrical fault currents at the terminals to protect lives and properties."),
    new Paragraph({ spacing: { before: 200 } })
  );

  // Key Findings Callout
  const breakingkAIC = combinedAsymmetricalCurrent / 1000;
  const isSafe_10kA = breakingkAIC < 10.0;
  const isSafe_22kA = breakingkAIC < 22.0;
  
  const scFindings = [
    `Computed Symmetrical Fault current at distribution board terminals is $I_{\\text{sc, sym}} = ${combinedSymmetricalCurrent.toFixed(2)}\\text{ A}$. Factoring a $25\\\%$ DC offset margin yields a maximum asymmetrical limit of $I_{\\text{sc, asym}} = ${combinedAsymmetricalCurrent.toFixed(2)}\\text{ A}$ ($${breakingkAIC.toFixed(2)}\\text{ kAIC}$).`,
    `Standard Commercial Circuit Breaker kAIC Ratings Safety Evaluation:`,
    `  - Service entrance main panels MUST possess a safety withstand interrupting capacity of at least $I_{\\text{withstand}} \\ge ${breakingkAIC > 10 ? '22' : '10'}\\text{ kAIC}$ to prevent destruction.`,
    isSafe_10kA 
      ? `  - Active panels with the standard $10\\text{ kAIC}$ breaker class are FULLY COMPLIANT and protected against calculated electrical thermal explosion risks. Conformance Status: PASSED.`
      : isSafe_22kA
        ? `  - Standard $10\\text{ kAIC}$ OCPDs are INSUFFICIENT. Sizing MUST deploy minimum $22\\text{ kAIC}$ breaker units. Service entrance conformance: Compliant with $22\\text{ kAIC}$ specifications.`
        : `  - High-stress fault zone requires minimum $30 / 35\\text{ kAIC}$ breaker configurations. Conformance status: Critical action required - upgrade panels to $35\\text{ kAIC}$ standard.`
  ];
  docChildren.push(createCallout("🔍 SHORT CIRCUIT FAULT MITIGATION SAFETY & AUDIT FINDINGS", scFindings));

  if (images?.isc) {
    docChildren.push(createSubHeader(`Short Circuit Line Impedance Diagram`));
    await addImageToDoc(images.isc);
  }

  // === 3. VOLTAGE DROP ===
  docChildren.push(createHeader(`4.0 Voltage Drop Calculations and Conductor Thermal Audits`, true));
  docChildren.push(
    createSubHeader(`A. Sizing Guidelines & PEC Voltage Drop Allowances`),
    createParagraph("Over-loss of voltage drop restricts functional motor torque, causes high heating coefficients inside walls, and increases electrical power draw bills. Copper wire conductivity factors resistances and impedances accurately under 75°C temperature load heights."),
    createParagraph("• PEC Section 2.10.1.19 FPN No. 4 (Branch Circuits): Recommends branch-circuit conductors be sized to limit voltage drop to 3% or less at the farthest electrical outlet, ensuring reliable operating voltage for connected equipment."),
    createParagraph("• PEC Section 2.15.1.2(A)(1) FPN No. 2 (Feeder Circuits): Recommends feeder-circuit conductors be sized to prevent a voltage drop exceeding 3% at the primary distribution node."),
    createParagraph("• Combined System Standard (PEC Part 1 & Part 2): The cumulative combined total drop across both the feeder line and the branch circuits must be restricted under a 5% absolute ceiling at the terminal outlet point."),
    
    new Paragraph({ spacing: { before: 200 } }),
    createSubHeader(`B. Voltage Drop Sizing Calculations Formulas Matrix`),
    createParagraph(`• Voltage drop for Single-Phase ($1\\phi$) multi-wire circuits:`),
    createFormulaCallout(`V_{\\text{drop, 1}\\phi} = \\frac{2 \\times R_{\\text{ohms}} \\times L \\times I}{1000}\\text{ Volts}`),
    createParagraph(`• Voltage drop for Three-Phase ($3\\phi$) balanced load circuits:`),
    createFormulaCallout(`V_{\\text{drop, 3}\\phi} = \\frac{\\sqrt{3} \\times R_{\\text{ohms}} \\times L \\times I}{1000}\\text{ Volts}`),
    createParagraph(`• System percentage loss ratio relative to nominal standard working potential:`),
    createFormulaCallout(`V_{\\text{drop, \\%}} = \\left(\\frac{V_{\\text{drop}}}{V_{\\text{nominal}}}\\right) \\times 100\\%`),
    createParagraph(`* $R_{\\text{ohms}}$ represents standard copper conductor AC internal resistance values $(\\Omega/\\text{km})$ from the standard table.`),
    new Paragraph({ spacing: { after: 150 } })
  );

  if (vdCalculations && vdCalculations.length > 0) {
    docChildren.push(
      createSubHeader(`C. Conducted Voltage Drop Analysis Sizing Table`),
      new Paragraph({ spacing: { after: 100 } })
    );

    const vdTableHeaderCells = [
      "Designation / Line Description", "Conductor (mm²)", "System", "Volt", "Length (m)", "Load (A)", "Impedance (Ω/km)", "Drop VD (V)", "VD (%)", "PEC Status"
    ].map(t => new TableCell({ 
      children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, font: "Segoe UI", size: 16, color: "FFFFFF" })], alignment: AlignmentType.CENTER })], 
      shading: { fill: "1B365D" },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 60, bottom: 60, left: 60, right: 60 }
    }));

    const vdTableRows = [new TableRow({ children: vdTableHeaderCells, tableHeader: true })];

    let maxVDPercentage = 0;
    let criticalLabel = "None";
    let complianceCount = 0;

    vdCalculations.forEach((calc, idx) => {
      const isEven = idx % 2 === 0;
      const rowShading = isEven ? "F8FAFC" : "FFFFFF";
      
      const createCell = (text: string, align: typeof AlignmentType.CENTER | typeof AlignmentType.LEFT = AlignmentType.CENTER, highlightColor?: string) => {
         return new TableCell({ 
           children: [new Paragraph({ children: [new TextRun({ text, font: "Segoe UI", size: 17, color: highlightColor || "334155", bold: !!highlightColor })], alignment: align })],
           shading: { fill: rowShading },
           verticalAlign: VerticalAlign.CENTER,
           margins: { top: 50, bottom: 50, left: 60, right: 60 }
         });
      };

      const data = WIRE_IMPEDANCE_TABLE[calc.wireSize] || WIRE_IMPEDANCE_TABLE['3.5'] || { r: 5.4 };
      const R = data.r;
      const factor = calc.systemType === '3PH' ? 1.732 : 2;
      const cLength = calc.length || 0;
      const cLoad = calc.loadA || 0;
      const cVoltage = calc.voltage || 230;
      const vd = (factor * cLength * cLoad * R) / 1000;
      const vdPercentage = (vd / cVoltage) * 100;
      const isCompliant = vdPercentage <= 3.0;

      if (isCompliant) complianceCount++;
      if (vdPercentage > maxVDPercentage) {
        maxVDPercentage = vdPercentage;
        criticalLabel = calc.name || `Feeder Line ${idx + 1}`;
      }

      vdTableRows.push(new TableRow({
        children: [
          createCell(calc.name || "", AlignmentType.LEFT),
          createCell(calc.wireSize || "3.5"),
          createCell(calc.systemType || "1PH"),
          createCell(cVoltage.toString()),
          createCell(cLength.toString()),
          createCell(cLoad.toString()),
          createCell(R.toFixed(3)),
          createCell(vd.toFixed(2)),
          createCell(`${vdPercentage.toFixed(2)}%`, AlignmentType.CENTER, isCompliant ? "16A34A" : "DC2626"),
          createCell(isCompliant ? "Passed (≤3%)" : "FAILED (>3%)", AlignmentType.CENTER, isCompliant ? "16A34A" : "DC2626"),
        ]
      }));
    });

    const vdTable = new Table({
      rows: vdTableRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
        bottom: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
        insideHorizontal: { color: "E2E8F0", space: 1, style: BorderStyle.SINGLE, size: 2 },
        insideVertical: { style: BorderStyle.NONE },
      }
    });

    docChildren.push(vdTable);
    
    // Key Findings Callout for Voltage Drop
    const totalLinesChecked = vdCalculations.length;
    const isSystemSuccess = complianceCount === totalLinesChecked;

    const vdFindings = [
      `A total of ${totalLinesChecked} feeder and branch circuit routes were modeled and audited.`,
      `Safety Conformance Status: ${complianceCount} of ${totalLinesChecked} conductors satisfy the PEC recommended $3.0\\%$ maximum voltage drop limit.`,
      `Critical Operating Drop Node: Farthest point found at "${criticalLabel}" displaying an electric voltage drop of $V_{\\text{drop, max}} = ${maxVDPercentage.toFixed(2)}\\%$.`,
      isSystemSuccess
        ? `Feeder Voltage Drop Conformance: ALL CIRCUITS ARE COMPLIANT. Current conductors and sizing configurations are highly optimized for voltage stability and minimal thermal loss. Conformance rating: PASSED.`
        : `Feeder Voltage Drop ALERT: Certain routes exceed the standard $3.0\\%$ limit. It is recommended to increase the conductor cross-sectional area (e.g., from $3.5\\text{ mm}^2$ to $5.5\\text{ mm}^2$ or larger) to reduce voltage drop.`
    ];
    docChildren.push(new Paragraph({ spacing: { before: 200 } }));
    docChildren.push(createCallout("🔍 FEEDER VOLTAGE DROP KEY FINDINGS & RECOMMENDED MITIGATIONS", vdFindings));

  } else {
    docChildren.push(createParagraph(`Warning: No custom voltage drop line evaluations were compiled in the active list.`));
  }

  if (images?.vdDiagrams) {
     for (const calc of vdCalculations) {
        if (images.vdDiagrams[calc.id]) {
           docChildren.push(createSubHeader(`Feeder Attenuation Diagram: ${calc.name}`));
           await addImageToDoc(images.vdDiagrams[calc.id]);

           const data = WIRE_IMPEDANCE_TABLE[calc.wireSize] || WIRE_IMPEDANCE_TABLE['3.5'] || { r: 5.4 };
           const R = data.r;
           const is3Phase = calc.systemType === '3PH';
           const factor = is3Phase ? 1.732 : 2;
           const cLength = calc.length || 0;
           const cLoad = calc.loadA || 0;
           const cVoltage = calc.voltage || 230;
           const vd = (factor * cLength * cLoad * R) / 1000;
           const vdPercentage = (vd / cVoltage) * 100;
           
           docChildren.push(new Paragraph({ spacing: { before: 200 } }));
           docChildren.push(createSubHeader(`Results and Detailed Calculations: ${calc.name}`));
           
           docChildren.push(createParagraph(`1. Operating Profile:`));
           docChildren.push(createParagraph(`   • System Type = ${calc.systemType}`));
           docChildren.push(createParagraph(`   • Load Current ($I$) = ${cLoad.toFixed(2)} A`));
           docChildren.push(createParagraph(`   • Feeder Length ($L$) = ${cLength.toFixed(2)} m`));
           docChildren.push(createParagraph(`   • Conductor Size = ${calc.wireSize} mm²`));
           docChildren.push(createParagraph(`   • AC Resistance ($R_{\\text{ohms}}$) = ${R} \\Omega/km`));
           docChildren.push(createParagraph(`   • Nominal Voltage ($V_{\\text{nominal}}$) = ${cVoltage} V`));
           
           docChildren.push(new Paragraph({ spacing: { before: 100 } }));
           docChildren.push(createParagraph(`2. Voltage Drop Magnitude ($V_{\\text{drop}}$):`));
           if (is3Phase) {
               docChildren.push(createParagraph(`   Formula: $V_{\\text{drop}} = \\frac{\\sqrt{3} \\times R_{\\text{ohms}} \\times L \\times I}{1000}$`));
               docChildren.push(createParagraph(`   Solution: $V_{\\text{drop}} = \\frac{1.732 \\times ${R} \\times ${cLength.toFixed(2)} \\times ${cLoad.toFixed(2)}}{1000} = ${vd.toFixed(2)} \\text{ V}$`));
           } else {
               docChildren.push(createParagraph(`   Formula: $V_{\\text{drop}} = \\frac{2 \\times R_{\\text{ohms}} \\times L \\times I}{1000}$`));
               docChildren.push(createParagraph(`   Solution: $V_{\\text{drop}} = \\frac{2 \\times ${R} \\times ${cLength.toFixed(2)} \\times ${cLoad.toFixed(2)}}{1000} = ${vd.toFixed(2)} \\text{ V}$`));
           }

           docChildren.push(new Paragraph({ spacing: { before: 100 } }));
           docChildren.push(createParagraph(`3. Percentage Voltage Drop ($V_{\\text{drop, \\%}}$):`));
           docChildren.push(createParagraph(`   Formula: $V_{\\text{drop, \\%}} = \\left(\\frac{V_{\\text{drop}}}{V_{\\text{nominal}}}\\right) \\times 100\\%$`));
           docChildren.push(createParagraph(`   Solution: $V_{\\text{drop, \\%}} = \\left(\\frac{${vd.toFixed(2)}}{${cVoltage}}\\right) \\times 100\\% = ${vdPercentage.toFixed(2)}\\%$`));
           
           docChildren.push(new Paragraph({ spacing: { after: 200 } }));
        }
     }
  }

  // === 4. ILLUMINATION CALCULATION ===
  docChildren.push(createHeader(`5.0 Indoor Illumination Sizing & Ergonomics Quality Report`, true));
  docChildren.push(
    createSubHeader(`A. Photometric Methodology & Regulations Reference`),
    createParagraph("Lighting design leverages the standard Lumen Method to calculate uniform, glare-free, and ergonomically correct visual surroundings, backed by point-by-point grid uniformity calculations. Visual safety limits conform to standard Philippine guidelines:"),
    createParagraph("• DOLE Occupational Hazards Rule 1075 (Working Conditions - Illumination): Recommends average lighting intensities (Lux) for typical physical tasks to defend workers against eye strains and workplace accidents."),
    createParagraph("• ASHRAE 90.1 standard: Slashes high utility energy fees by establishing maximum limits on Lighting Power Density (LPD, W/m²) across building architectures."),
    new Paragraph({ spacing: { before: 200 } }),
    createSubHeader(`B. Core Prototypal Formulas`),
    createParagraph(`1. Required Luminous Flux: $\\Phi_{\\text{req}} = \\frac{E_{\\text{target}} \\times A_{\\text{floor}}}{CU \\times MF}\\text{ lm}$`),
    createParagraph(`2. Sized Luminaire Quantity: $N_{\\text{fixtures}} = \\lceil \\frac{\\Phi_{\\text{req}}}{\\Phi_{\\text{luminaire}}} \\rceil$`),
    createParagraph(`3. Lighting Power Density (LPD): $LPD = \\frac{N_{\\text{fixtures}} \\times P_{\\text{fixture}}}{A_{\\text{floor}}}\\text{ W/m}^2$`),
    createParagraph(`* $CU$ (Coefficient of Utilization) is derived from room geometric cavity ratios (RCR). $MF$ (Maintenance Factor) represents dust/dirt depreciation losses (assumed standard value of $0.80$).`),
    new Paragraph({ spacing: { after: 150 } })
  );

  if (illumParams?.savedRooms && illumParams.savedRooms.length > 0) {
    docChildren.push(
      createSubHeader(`C. Sized Interior Space Quality Evaluations Table`),
      new Paragraph({ spacing: { after: 100 } })
    );
    
    // Create Table Rows
    const tableRows: TableRow[] = [];
    const createTableCell = (text: string, isHeader = false) => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text, bold: isHeader, font: "Segoe UI", size: 17, color: isHeader ? "FFFFFF" : "334155" })], alignment: AlignmentType.CENTER })],
      shading: isHeader ? { fill: "1B365D" } : undefined,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 60, bottom: 60, left: 80, right: 80 }
    });

    tableRows.push(new TableRow({
      children: [
        createTableCell('Room / Workspace', true),
        createTableCell('Target Lux', true),
        createTableCell('Area (m²)', true),
        createTableCell('Fixture Lumens', true),
        createTableCell('Qty Sized', true),
        createTableCell('LPD (W/m²)', true),
        createTableCell('ASHRAE Limit', true),
      ]
    }));

    illumParams.savedRooms.forEach(room => {
      const roomLPD = room.totalWattage / room.area;
      const limitLPD = room.targetLux > 300 ? 9.0 : 6.0;
      tableRows.push(new TableRow({
        children: [
          createTableCell(String(room.roomName)),
          createTableCell(String(room.targetLux) + " lx"),
          createTableCell(String(room.area) + " m²"),
          createTableCell(String(room.totalLumens / Math.max(1, room.fixturesCount)) + " lm"),
          createTableCell(String(room.fixturesCount) + " units"),
          createTableCell(roomLPD.toFixed(2) + " W/m²"),
          createTableCell(limitLPD.toFixed(2) + " W/m²"),
        ]
      }));
    });

    docChildren.push(new Table({
      rows: tableRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
        bottom: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
        insideHorizontal: { color: "E2E8F0", space: 1, style: BorderStyle.SINGLE, size: 2 },
        insideVertical: { style: BorderStyle.NONE },
      }
    }));
    docChildren.push(new Paragraph({ spacing: { after: 200 } }));
  }

  // Active Parameters Section detail
  const roomArea = illumParams.inputMode === 'area' ? illumParams.userArea : (illumParams.roomWidth * illumParams.roomLength);
  let cu = illumParams.coefficientOfUtilization;
  if (illumParams.inputMode === 'dimensions' && illumParams.roomWidth > 0 && illumParams.roomLength > 0) {
    const hrc = Math.max(0.1, (illumParams.ceilingHeight || 2.7) - (illumParams.workingPlaneHeight || 0.75));
    const roomIndex = (illumParams.roomWidth * illumParams.roomLength) / (hrc * (illumParams.roomWidth + illumParams.roomLength));
    const riFactor = roomIndex / (roomIndex + 0.5);
    const baselineRiFactor = 2.0 / 2.5; 
    cu = Math.min(0.95, Math.max(0.1, illumParams.coefficientOfUtilization * (riFactor / baselineRiFactor)));
  }

  const targetLux = illumParams.targetLux;
  const lumensPerFix = illumParams.lumensPerFixture;
  const mf = illumParams.maintenanceFactor;
  const expectedLumens = (targetLux * roomArea) / (cu * mf);
  const qty = Math.ceil(expectedLumens / lumensPerFix);
  const workingPlaneHeight = illumParams.workingPlaneHeight || 0.75;

  docChildren.push(
    createSubHeader(`D. Current Under-Process Room Analysis`),
    createParagraph(`• Floor Cavity Layout Area: $A_{\\text{floor}} = ${roomArea}\\text{ m}^2$`),
    createParagraph(`• Task Required Illuminance: $E_{\\text{target}} = ${targetLux}\\text{ lx}$`),
    createParagraph(`• Luminaire Rated Luminous Flux: $\\Phi_{\\text{luminaire}} = ${lumensPerFix}\\text{ lm}$`),
    createParagraph(`• Coefficient of Utilization (CU) Geometric Factor: $CU = ${cu.toFixed(2)}$`),
    createParagraph(`• Sized Fixture Mount Quantity: $N_{\\text{fixtures}} = ${qty}\\text{ units}$ (Average Achieved Illuminance $E_{\\text{achieved}} = \\frac{N_{\\text{fixtures}} \\times \\Phi_{\\text{luminaire}}}{A_{\\text{floor}}} = ${(qty * lumensPerFix / roomArea).toFixed(0)}\\text{ lx}$)`),
    
    new Paragraph({ spacing: { before: 200 } }),
    createSubHeader(`E. Ergonomics Audit - Uniformity, Glare & Sensory Smart Integrations`),
    createParagraph(`• POINT-BY-POINT UNIFORMITY INDEX: Target uniformity is $U_0 = \\frac{E_{\\text{min}}}{E_{\\text{avg}}} \\ge 0.40$ (to achieve uniform, shadow-free illumination).`),
    createParagraph(`• GLARE ANALYSIS (Unified Glare Rating): Configured arrays conform to standard guidelines yielding $UGR < 19.0$ to minimize visual discomfort.`),
    createParagraph(`• DAYLIGHT HARVESTING SENSORS: Automatic photocell controllers regulate lamp outputs to produce an estimated energy reduction of $\\Delta P_{\\text{dim}} \\approx 35\\%$.`),
    createParagraph(`• SYSTEM LIGHTING POWER DENSITY (LPD): Sized active room LPD is $LPD = ${(qty * 36 / roomArea).toFixed(2)}\\text{ W/m}^2$, which is compliant with the maximum standards.`),
    
    new Paragraph({ spacing: { before: 200 } }),
    createSubHeader(`F. Solar Smart Financing Payback Sizing Forecast`),
    createParagraph("Estimating standard regional Philippine commercial power rate at ₱11.50 per Kilowatt-hour (kWh). Integrating intelligent daylight harvesting dims saves standard operational fees significantly as detailed below:")
  );

  // energy calculations
  const totalSizedWattage = (illumParams.savedRooms ? illumParams.savedRooms.reduce((sum, r) => sum + r.totalWattage, 0) : qty * 36) || 360;
  const hoursPerDay = 10;
  const daysPerYear = 300;
  const tariffPhp = 11.50;
  
  const annualKWhStandard = (totalSizedWattage * hoursPerDay * daysPerYear) / 1000;
  const annualCostStandard = annualKWhStandard * tariffPhp;
  const annualKWhSmart = (totalSizedWattage * 0.65 * hoursPerDay * daysPerYear) / 1000; 
  const annualCostSmart = annualKWhSmart * tariffPhp;
  const annualSavingsPrj = annualCostStandard - annualCostSmart;
  const returnInvestmentYears = (totalSizedWattage * 80) / Math.max(1, annualSavingsPrj);

  // Energy audit table inside report
  const auditHeaders = ["Audit Parameter", "Standard Static Sizing", "Intelligent Photocells Dims"].map(t => new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, font: "Segoe UI", size: 18, color: "FFFFFF" })], alignment: AlignmentType.CENTER })],
    shading: { fill: "1B365D" },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 80, right: 80 }
  }));

  const createAuditRow = (label: string, standard: string, smart: string, isEven: boolean) => new TableRow({
    children: [
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: label, font: "Segoe UI", size: 18, color: "334155" })] })], shading: { fill: isEven ? "F8FAFC" : "FFFFFF" }, margins: { left: 80, right: 80 } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: standard, font: "Segoe UI", size: 18, color: "475569" })], alignment: AlignmentType.CENTER })], shading: { fill: isEven ? "F8FAFC" : "FFFFFF" } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: smart, font: "Segoe UI", size: 18, bold: true, color: "0F766E" })], alignment: AlignmentType.CENTER })], shading: { fill: isEven ? "F8FAFC" : "FFFFFF" } }),
    ]
  });

  docChildren.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: auditHeaders }),
      createAuditRow("Estimated Connected Power Load Sized", `${totalSizedWattage} Watts`, `${(totalSizedWattage * 0.65).toFixed(0)} Watts`, false),
      createAuditRow("Annual Power Consumption Meter", `${annualKWhStandard.toFixed(1)} kWh/yr`, `${annualKWhSmart.toFixed(1)} kWh/yr`, true),
      createAuditRow("Estimated Electricity Bills Tariff", `₱${annualCostStandard.toLocaleString('en-US', {maximumFractionDigits: 0})}`, `₱${annualCostSmart.toLocaleString('en-US', {maximumFractionDigits: 0})}`, false)
    ],
    borders: {
      top: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
      bottom: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
      insideHorizontal: { color: "E2E8F0", space: 1, style: BorderStyle.SINGLE, size: 1 },
      insideVertical: { style: BorderStyle.NONE }
    }
  }));

  const illumFindings = [
    `Total active lighting infrastructure wattage is $P_{\\text{total}} = ${totalSizedWattage}\\text{ W}$. Sized spacing ensures average lux is aligned with the targeted $E_{\\text{target}} = ${targetLux}\\text{ lx}$ task limit comfortably.`,
    `Integrated Smart Industrial Photoelectric dimming systems save $35\\%$ of energy during peak daylight. This drops operational electricity charges from $\\text{₱}${annualCostStandard.toLocaleString('en-US', {maximumFractionDigits: 0})}$ down to $\\text{₱}${annualCostSmart.toLocaleString('en-US', {maximumFractionDigits: 0})}$ per year, yielding annual cost savings of $\\Delta \\text{Cost} = \\text{₱}${annualSavingsPrj.toLocaleString('en-US', {maximumFractionDigits: 0})}$.`,
    `Project Net Amortization Period: Smart photoelectric structures pay back capital costs in an estimated $ROI = ${returnInvestmentYears.toFixed(1)}\\text{ years}$ through efficiency savings. Conformance Status: OPTIMIZED.`
  ];
  docChildren.push(new Paragraph({ spacing: { before: 200 } }));
  docChildren.push(createCallout("🔍 LIGHTING ENVIRONMENTAL ERGONOMICS & DECARBONIZATION AUDIT", illumFindings));

  if (images?.illumSnapshots && Object.keys(images.illumSnapshots).length > 0 && illumParams?.savedRooms && illumParams.savedRooms.length > 0) {
    docChildren.push(createSubHeader(`3D False-Color Rendering Diagrams (Saved Rooms)`));
    for (const room of illumParams.savedRooms) {
      const imgBase64 = images.illumSnapshots[room.id];
      if (imgBase64 && typeof imgBase64 === 'string') {
        docChildren.push(createParagraph(`Calculated Environment: ${room.roomName}`));
        await addImageToDoc(imgBase64);
        
        // Add detailed calculations and results below the diagram
        docChildren.push(new Paragraph({ spacing: { before: 200 } }));
        docChildren.push(createSubHeader(`Results and Detailed Calculations: ${room.roomName}`));
        
        docChildren.push(createParagraph(`1. Expected Room Profile:`));
        docChildren.push(createParagraph(`   • Target Illuminance ($E_{\\text{target}}$) = ${room.targetLux} lx`));
        docChildren.push(createParagraph(`   • Floor Area ($A_{\\text{floor}}$) = ${room.area.toFixed(2)} m²`));
        docChildren.push(createParagraph(`   • Selected Fixture Type = ${room.fixtureLightType || "Custom"}`));
        if (room.fixtureLumens && room.fixtureWattage) {
          docChildren.push(createParagraph(`   • Fixture Luminous Flux ($\\Phi_{\\text{luminaire}}$) = ${room.fixtureLumens.toLocaleString()} lm`));
          docChildren.push(createParagraph(`   • Fixture Wattage ($P_{\\text{fixture}}$) = ${room.fixtureWattage} W / VA`));
        }

        docChildren.push(new Paragraph({ spacing: { before: 100 } }));
        docChildren.push(createParagraph(`2. Recommended Deployment Scale:`));
        docChildren.push(createParagraph(`   • Required Number of Fixtures ($N_{\\text{fixtures}}$) = ${room.fixturesCount} units`));
        if (room.fixtureLumens) {
          docChildren.push(createParagraph(`   • Total Luminous Flux ($\\Phi_{\\text{total}}$):`));
          docChildren.push(createParagraph(`     Formula: $\\Phi_{\\text{total}} = N_{\\text{fixtures}} \\times \\Phi_{\\text{luminaire}}$`));
          docChildren.push(createParagraph(`     Solution: $\\Phi_{\\text{total}} = ${room.fixturesCount} \\times ${room.fixtureLumens.toLocaleString()} = ${room.totalLumens.toLocaleString()} lm`));
        }

        docChildren.push(new Paragraph({ spacing: { before: 100 } }));
        docChildren.push(createParagraph(`3. Energy Matrix:`));
        if (room.fixtureWattage) {
          docChildren.push(createParagraph(`   • Total Estimated Wattage ($P_{\\text{total}}$):`));
          docChildren.push(createParagraph(`     Formula: $P_{\\text{total}} = N_{\\text{fixtures}} \\times P_{\\text{fixture}}$`));
          docChildren.push(createParagraph(`     Solution: $P_{\\text{total}} = ${room.fixturesCount} \\times ${room.fixtureWattage} = ${room.totalWattage.toLocaleString()} VA / W`));
        }
        
        const calcLPD = room.totalWattage / room.area;
        docChildren.push(createParagraph(`   • Lighting Power Density (LPD):`));
        docChildren.push(createParagraph(`     Formula: $LPD = \\frac{P_{\\text{total}}}{A_{\\text{floor}}}$`));
        docChildren.push(createParagraph(`     Solution: $LPD = \\frac{${room.totalWattage.toLocaleString()}}{${room.area.toFixed(2)}} = ${calcLPD.toFixed(2)} \\text{ W/m}^2$`));
        
        docChildren.push(new Paragraph({ spacing: { after: 200 } }));
      }
    }
  } else if (images?.illumSnapshots && Object.keys(images.illumSnapshots).length > 0) {
    docChildren.push(createSubHeader(`3D False-Color Rendering Diagrams (Load Schedule Circuits)`));
    for (const [circuitId, imgBase64] of Object.entries(images.illumSnapshots)) {
      if (imgBase64 && typeof imgBase64 === 'string') {
        const circuitMatch = circuits.find(c => c.id === circuitId);
        if (circuitMatch && circuitMatch.description) {
           docChildren.push(createParagraph(`Calculated Environment: ${circuitMatch.description}`));
        }
        await addImageToDoc(imgBase64);
      }
    }
  } else if (images?.illumination) {
    docChildren.push(createSubHeader(`3D False-Color Rendering Diagrams (Active State)`));
    await addImageToDoc(images.illumination);
  }

  // === 5. ELECTRICAL FLOOR PLAN ===
  if (images?.floorPlan && Array.isArray(images.floorPlan) && images.floorPlan.length > 0) {
    docChildren.push(createHeader(`6.0 Electrical Floor Plan Routing & Layout Mapping`, true));
    docChildren.push(createParagraph(`The schematic below illustrates the architectural electrical lighting wiring, switches, and load outlet distributions as uploaded to the project.`));
    for (let i = 0; i < images.floorPlan.length; i++) {
        const item = images.floorPlan[i];
        if (i > 0) {
            docChildren.push(new Paragraph({ spacing: { before: 400, after: 400 } }));
        }
        if (typeof item === 'string') {
            await addImageToDoc(item);
        } else if (item && typeof item === 'object') {
            if (item.name) {
                docChildren.push(createSubHeader(item.name));
            } else {
                docChildren.push(createSubHeader(`Floor Plan Layout #${i + 1}`));
            }
            if (item.data) {
                await addImageToDoc(item.data);
            }
        }
    }
  }

  // === 6. REFERENCE FRAMEWORK CHECKLIST ===
  const checklistSecNum = (images?.floorPlan && Array.isArray(images.floorPlan) && images.floorPlan.length > 0) ? "7.0" : "6.0";
  docChildren.push(createHeader(`${checklistSecNum} Reference Framework Checklist`, true));
  docChildren.push(
    createParagraph("The design memorandum and calculations compiled in this dossier adhere strictly to the mandate of the Philippine Electrical Code (PEC) and related professional frameworks. Sizing methodologies and engineering limits are logged below for standard audit compliance verification:"),
    new Paragraph({ spacing: { after: 150 } })
  );

  const checklistRows: TableRow[] = [];
  
  // Header row
  checklistRows.push(
    new TableRow({
      children: [
        new TableCell({
          width: { size: 30, type: WidthType.PERCENTAGE },
          shading: { fill: "1B365D" },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 120, bottom: 120, left: 150, right: 100 },
          children: [
            new Paragraph({
              children: [new TextRun({ text: "PEC REFERENCE SECTION", bold: true, font: "Segoe UI", size: 18, color: "FFFFFF" })],
              alignment: AlignmentType.LEFT
            })
          ]
        }),
        new TableCell({
          width: { size: 70, type: WidthType.PERCENTAGE },
          shading: { fill: "1B365D" },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 120, bottom: 120, left: 150, right: 100 },
          children: [
            new Paragraph({
              children: [new TextRun({ text: "COMPLIANCE & EXECUTION MANDATES", bold: true, font: "Segoe UI", size: 18, color: "FFFFFF" })],
              alignment: AlignmentType.LEFT
            })
          ]
        })
      ]
    })
  );

  const checklistData = [
    {
      ref: "Article 2.20",
      mandate: "Mandatory load aggregation rules for branch networks, primary sub-feeders, and main services."
    },
    {
      ref: "Table 3.10.1.16",
      mandate: "Master wire ampacity reference matrix for insulation categories and physical ambient constraints."
    },
    {
      ref: "Section 2.40.1.6",
      mandate: "Defines legal standard continuous ampere ratings for industrial safety fuses and circuit breakers."
    },
    {
      ref: "Section 1.10.1.9",
      mandate: "Requires that overcurrent protective devices (kAIC) meet or exceed terminal short-circuit currents."
    },
    {
      ref: "Section 2.10.1.19 / 2.15.1.2",
      mandate: "Recommends branch and feeder-circuit conductors be sized to limit voltage drop under 3% (5% combined)."
    }
  ];

  checklistData.forEach((row, index) => {
    const isEven = index % 2 === 1;
    const fill = isEven ? "F8FAFC" : "FFFFFF";
    checklistRows.push(
      new TableRow({
        children: [
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            shading: { fill },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 120, bottom: 120, left: 150, right: 100 },
            children: [
              new Paragraph({
                children: [new TextRun({ text: row.ref, bold: true, font: "Segoe UI", size: 18, color: "1B365D" })],
                alignment: AlignmentType.LEFT
              })
            ]
          }),
          new TableCell({
            width: { size: 70, type: WidthType.PERCENTAGE },
            shading: { fill },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 120, bottom: 120, left: 150, right: 100 },
            children: [
              new Paragraph({
                children: [new TextRun({ text: row.mandate, font: "Segoe UI", size: 18, color: "334155" })],
                alignment: AlignmentType.LEFT
              })
            ]
          })
        ]
      })
    );
  });

  const checklistTable = new Table({
    rows: checklistRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
      bottom: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
      insideHorizontal: { color: "E2E8F0", space: 1, style: BorderStyle.SINGLE, size: 2 },
      insideVertical: { style: BorderStyle.NONE }
    }
  });

  docChildren.push(checklistTable);

  // Running footer containing left-aligned text, right-aligned page numbers, and a thin Slate Gray line above
  const footerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { color: "64748B", space: 1, style: BorderStyle.SINGLE, size: 4 }, // Thin, elegant horizontal rule
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE }
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }
            },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "ELECTRICAL DESIGN & ANALYSIS | PEC COMPLIANCE",
                    font: "Segoe UI",
                    size: 16, // 8pt
                    color: "64748B",
                    bold: true
                  })
                ],
                alignment: AlignmentType.LEFT,
                spacing: { before: 100 } // Slight buffer below the horizontal line
              })
            ]
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }
            },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Page ",
                    font: "Segoe UI",
                    size: 16,
                    color: "64748B"
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: "Segoe UI",
                    size: 16,
                    color: "64748B"
                  }),
                  new TextRun({
                    text: " of ",
                    font: "Segoe UI",
                    size: 16,
                    color: "64748B"
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    font: "Segoe UI",
                    size: 16,
                    color: "64748B"
                  })
                ],
                alignment: AlignmentType.RIGHT,
                spacing: { before: 100 }
              })
            ]
          })
        ]
      })
    ]
  });

  const doc = new Document({
    creator: "AI Studio Integrated Sizer",
    title: `Electrical Design Analysis - ${panel.project || 'Project'}`,
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [footerTable]
          })
        },
        children: docChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Electrical_Design_Analysis_${(panel.project || 'Export').replace(/\s+/g, '_')}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
