import * as XLSX from "xlsx-js-style";
import { Document, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, WidthType, BorderStyle, VerticalAlign, Packer } from "docx";
import { jsPDF } from "jspdf";
import Drawing from "dxf-writer";

export interface EgcTableEntry {
  rating: number; // OCPD up to (Amperes)
  copperMm2: number;
  copperDia: string;
  copperAwg: string;
  alumMm2: number;
  alumDia: string;
  alumAwg: string;
}

// PEC 2017 Table 2.50.6.13
export const PEC_EGC_TABLE_2017: EgcTableEntry[] = [
  { rating: 15, copperMm2: 2.0, copperDia: "1.6", copperAwg: "14 AWG", alumMm2: 3.5, alumDia: "2.0", alumAwg: "12 AWG" },
  { rating: 20, copperMm2: 3.5, copperDia: "2.0", copperAwg: "12 AWG", alumMm2: 5.5, alumDia: "2.6", alumAwg: "10 AWG" },
  { rating: 30, copperMm2: 5.5, copperDia: "2.6", copperAwg: "10 AWG", alumMm2: 8.0, alumDia: "3.2", alumAwg: "8 AWG" },
  { rating: 40, copperMm2: 5.5, copperDia: "2.6", copperAwg: "10 AWG", alumMm2: 8.0, alumDia: "3.2", alumAwg: "8 AWG" },
  { rating: 60, copperMm2: 5.5, copperDia: "2.6", copperAwg: "10 AWG", alumMm2: 8.0, alumDia: "3.2", alumAwg: "8 AWG" },
  { rating: 100, copperMm2: 8.0, copperDia: "3.2", copperAwg: "8 AWG", alumMm2: 14.0, alumDia: "---", alumAwg: "6 AWG" },
  { rating: 200, copperMm2: 14.0, copperDia: "---", copperAwg: "6 AWG", alumMm2: 22.0, alumDia: "---", alumAwg: "4 AWG" },
  { rating: 300, copperMm2: 22.0, copperDia: "---", copperAwg: "4 AWG", alumMm2: 30.0, alumDia: "---", alumAwg: "2 AWG" },
  { rating: 400, copperMm2: 30.0, copperDia: "---", copperAwg: "2 AWG", alumMm2: 38.0, alumDia: "---", alumAwg: "1 AWG" },
  { rating: 500, copperMm2: 30.0, copperDia: "---", copperAwg: "2 AWG", alumMm2: 50.0, alumDia: "---", alumAwg: "1/0 AWG" },
  { rating: 600, copperMm2: 38.0, copperDia: "---", copperAwg: "1 AWG", alumMm2: 60.0, alumDia: "---", alumAwg: "2/0 AWG" },
  { rating: 800, copperMm2: 50.0, copperDia: "---", copperAwg: "1/0 AWG", alumMm2: 80.0, alumDia: "---", alumAwg: "3/0 AWG" },
  { rating: 1000, copperMm2: 60.0, copperDia: "---", copperAwg: "2/0 AWG", alumMm2: 100.0, alumDia: "---", alumAwg: "4/0 AWG" },
  { rating: 1200, copperMm2: 80.0, copperDia: "---", copperAwg: "3/0 AWG", alumMm2: 125.0, alumDia: "---", alumAwg: "250 kcmil" },
  { rating: 1600, copperMm2: 100.0, copperDia: "---", copperAwg: "4/0 AWG", alumMm2: 175.0, alumDia: "---", alumAwg: "350 kcmil" },
  { rating: 2000, copperMm2: 125.0, copperDia: "---", copperAwg: "250 kcmil", alumMm2: 200.0, alumDia: "---", alumAwg: "400 kcmil" },
  { rating: 2500, copperMm2: 175.0, copperDia: "---", copperAwg: "350 kcmil", alumMm2: 325.0, alumDia: "---", alumAwg: "600 kcmil" },
  { rating: 3000, copperMm2: 200.0, copperDia: "---", copperAwg: "400 kcmil", alumMm2: 325.0, alumDia: "---", alumAwg: "600 kcmil" },
  { rating: 4000, copperMm2: 250.0, copperDia: "---", copperAwg: "500 kcmil", alumMm2: 375.0, alumDia: "---", alumAwg: "750 kcmil" },
  { rating: 5000, copperMm2: 375.0, copperDia: "---", copperAwg: "750 kcmil", alumMm2: 600.0, alumDia: "---", alumAwg: "1200 kcmil" },
  { rating: 6000, copperMm2: 400.0, copperDia: "---", copperAwg: "800 kcmil", alumMm2: 600.0, alumDia: "---", alumAwg: "1200 kcmil" }
];

export function findEgcSize(ocpdValue: number, material: "Copper" | "Aluminum" | "Copper-Clad Aluminum"): {
  entry: EgcTableEntry;
  sizeMm2: number;
  sizeDia: string;
  sizeAwg: string;
  isCustom: boolean;
  warning?: string;
} {
  const normalizedOcpd = Math.max(0, ocpdValue);
  let warning: string | undefined;

  // Handles ratings larger than 6000A
  if (normalizedOcpd > 6000) {
    warning = "Entered OCPD rating exceeds the maximum value in PEC Table 2.50.6.13 (6000A). Defaulting to the maximum 6000A sizing table parameters. Specific protective relay settings or standard calculations may be required.";
  }

  // Find the matching row (first row where rating >= ocpdValue)
  let matchedEntry = PEC_EGC_TABLE_2017[PEC_EGC_TABLE_2017.length - 1];
  let isCustom = true;

  for (const entry of PEC_EGC_TABLE_2017) {
    if (entry.rating === normalizedOcpd) {
      matchedEntry = entry;
      isCustom = false;
      break;
    }
    if (entry.rating > normalizedOcpd) {
      matchedEntry = entry;
      isCustom = true;
      break;
    }
  }

  const isCopper = material === "Copper";
  const sizeMm2 = isCopper ? matchedEntry.copperMm2 : matchedEntry.alumMm2;
  const sizeDia = isCopper ? matchedEntry.copperDia : matchedEntry.alumDia;
  const sizeAwg = isCopper ? matchedEntry.copperAwg : matchedEntry.alumAwg;

  return {
    entry: matchedEntry,
    sizeMm2,
    sizeDia,
    sizeAwg,
    isCustom,
    warning
  };
}

// ---------------- EXCEL EXPORT ----------------
export function exportEgcToExcel(ocpdValue: number, material: "Copper" | "Aluminum" | "Copper-Clad Aluminum", result: ReturnType<typeof findEgcSize>) {
  // We'll build an elegant block layout
  const rows: any[][] = [
    ["PHILIPPINE ELECTRICAL CODE (PEC) - EQUIPMENT GROUNDING CONDUCTOR SIZING ANALYSIS"],
    ["Generated in compliance with PEC 2017 Table 2.50.6.13"],
    [],
    ["SUMMARY CARD OF SIZING VALUES", "", ""],
    ["Parameter Name", "Design Parameter Value", "Units / PEC Reference", "", "", "", ""],
    ["System Overcurrent Protective Device (OCPD)", ocpdValue, "Amperes", "", "", "", ""],
    ["Selected Grounding Wire Material", material, "---", "", "", "", ""],
    ["Sized Minimum Grounding wire Cross Section Size", result.sizeMm2, "sq.mm. (mm²)", "", "", "", ""],
    ["Equivalent Standard Sizing (AWG/kcmil)", result.sizeAwg, "AWG / kcmil Equivalent", "", "", "", ""],
    ["Conductor Diameter (mm)", result.sizeDia === "---" ? "N/A" : result.sizeDia, "Millimeter (mm)", "", "", "", ""],
    ["Calculation Standard Source Code", "Table 2.50.6.13", "PEC 2017 Edition Part 1", "", "", "", ""],
    [],
    ["PEC REFERENCE DATA - TABLE 2.50.6.13_HEADER", "", "", "", "", "", ""],
    ["OCPD Rating (A)", "Copper Size (mm²)", "Copper Diameter (mm)", "Copper AWG/kcmil", "Alum/Copper-Clad Alum Size (mm²)", "Alum Diameter (mm)", "Alum AWG/kcmil"]
  ];

  // Append reference table data
  PEC_EGC_TABLE_2017.forEach(e => {
    rows.push([
      e.rating,
      e.copperMm2,
      e.copperDia === "---" ? "" : e.copperDia,
      e.copperAwg,
      e.alumMm2,
      e.alumDia === "---" ? "" : e.alumDia,
      e.alumAwg
    ]);
  });

  const refEndIndex = rows.length;

  rows.push([]);
  rows.push(["ENGINEERING COMPLIANCE GENERAL DISCLAIMER NOTICE", "", "", "", "", "", ""]);
  rows.push(["This computation and analysis is based on PEC 2017 Table 2.50.6.13. Final engineering designs and layouts shall be vetted and approved by a licensed Professional Electrical Engineer (PEE) in accordance with local municipal building regulations and valid engineering standards.", "", "", "", "", "", ""]);

  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  // Set merges
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, // Title
    { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }, // Subtitle
    { s: { r: 3, c: 0 }, e: { r: 3, c: 6 } }, // Section summary heading
    { s: { r: 12, c: 0 }, e: { r: 12, c: 6 } }, // Section reference heading
    { s: { r: refEndIndex + 1, c: 0 }, e: { r: refEndIndex + 1, c: 6 } }, // Disclaimer title
    { s: { r: refEndIndex + 2, c: 0 }, e: { r: refEndIndex + 2, c: 6 } }, // Disclaimer text
  ];

  // Column widths
  worksheet["!cols"] = [
    { wch: 42 }, // Parameter or OCPD
    { wch: 30 }, // Value or Copper mm2
    { wch: 24 }, // Units or Dia
    { wch: 22 }, // AWG
    { wch: 30 }, // Alum mm2
    { wch: 20 }, // Alum Dia
    { wch: 20 }  // Alum AWG
  ];

  // Apply row heights
  worksheet["!rows"] = [
    { hpt: 30 }, // Title
    { hpt: 20 }, // Subtitle
    { hpt: 15 }, // empty
    { hpt: 24 }, // summary section header
    { hpt: 22 }, // sub table headers
    { hpt: 18 }, // summary row 1
    { hpt: 18 }, // summary row 2
    { hpt: 18 }, // summary row 3
    { hpt: 18 }, // summary row 4
    { hpt: 18 }, // summary row 5
    { hpt: 18 }, // summary row 6
    { hpt: 15 }, // empty
    { hpt: 24 }, // ref table section header
    { hpt: 22 }, // ref table headers
  ];

  const decoded = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
  for (let R = decoded.s.r; R <= decoded.e.r; ++R) {
    for (let C = decoded.s.c; C <= decoded.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      if (!worksheet[cellAddress]) {
        // Create empty styled cell if within headers or styled boundaries
        if (R <= 1 || R === 3 || R === 12 || R >= refEndIndex + 1) {
          worksheet[cellAddress] = { t: "s", v: "" };
        } else {
          continue;
        }
      }

      const cell = worksheet[cellAddress];
      
      // Default cell styling (Slate theme)
      cell.s = {
        font: { name: "Segoe UI", sz: 10, color: { rgb: "334155" } },
        alignment: { vertical: "center", horizontal: "left" },
        border: {
          top: { style: "thin", color: { rgb: "E2E8F0" } },
          bottom: { style: "thin", color: { rgb: "E2E8F0" } },
          left: { style: "thin", color: { rgb: "E2E8F0" } },
          right: { style: "thin", color: { rgb: "E2E8F0" } }
        }
      };

      // 1. Title Row
      if (R === 0) {
        cell.s.font = { name: "Segoe UI", sz: 12, bold: true, color: { rgb: "FFFFFF" } };
        cell.s.fill = { fgColor: { rgb: "1E3A8A" } }; // Royal/Navy Blue
        cell.s.alignment = { horizontal: "center", vertical: "center" };
        cell.s.border = {
          bottom: { style: "none" }
        };
      }
      
      // 2. Subtitle Row
      else if (R === 1) {
        cell.s.font = { name: "Segoe UI", sz: 9.5, italic: true, color: { rgb: "E2E8F0" } };
        cell.s.fill = { fgColor: { rgb: "1E3A8A" } }; // Royal/Navy Blue
        cell.s.alignment = { horizontal: "center", vertical: "center" };
        cell.s.border = {
          top: { style: "none" }
        };
      }

      // 3. Section Sizing values Header
      else if (R === 3) {
        cell.s.font = { name: "Segoe UI", sz: 11, bold: true, color: { rgb: "FFFFFF" } };
        cell.s.fill = { fgColor: { rgb: "312E81" } }; // Indigo 900
        cell.s.alignment = { horizontal: "left", vertical: "center", indent: 1 };
      }

      // 4. Subtable Columns header (Sizing card values)
      else if (R === 4) {
        cell.s.font = { name: "Segoe UI", sz: 10, bold: true, color: { rgb: "0F172A" } };
        cell.s.fill = { fgColor: { rgb: "E2E8F0" } }; // Slate 200
        cell.s.alignment = { horizontal: "center", vertical: "center" };
        cell.s.border = {
          top: { style: "medium", color: { rgb: "94A3B8" } },
          bottom: { style: "medium", color: { rgb: "94A3B8" } },
          left: { style: "thin", color: { rgb: "CBD5E1" } },
          right: { style: "thin", color: { rgb: "CBD5E1" } }
        };
      }

      // 5. Card contents
      else if (R >= 5 && R <= 10) {
        // Zebra design for card values
        if (R % 2 === 1) {
          cell.s.fill = { fgColor: { rgb: "F8FAFC" } };
        }
        
        // Parameter label bold
        if (C === 0) {
          cell.s.font.bold = true;
          cell.s.font.color = { rgb: "0F172A" };
        }
        
        // Value design
        if (C === 1) {
          cell.s.font.bold = true;
          cell.s.font.color = { rgb: "4F46E5" }; // Indigo
          cell.s.alignment = { horizontal: "center", vertical: "center" };
        }
        
        if (C === 2) {
          cell.s.font.italic = true;
          cell.s.font.color = { rgb: "64748B" }; // Muted Slate
          cell.s.alignment = { horizontal: "left", vertical: "center" };
        }
        
        // Blank cells styled appropriately to maintain card boundary
        if (C > 2) {
          cell.v = "";
          cell.t = "s";
          cell.s.border = {
            top: { style: "none" },
            bottom: { style: "none" },
            left: { style: "none" },
            right: { style: "none" }
          };
          cell.s.fill = { fgColor: { rgb: "FFFFFF" } };
        }
      }

      // 6. PEC Reference Section Header
      else if (R === 12) {
        cell.v = "PEC REFERENCE DATA - TABLE 2.50.6.13"; // Overwrite the internal header string
        cell.s.font = { name: "Segoe UI", sz: 11, bold: true, color: { rgb: "FFFFFF" } };
        cell.s.fill = { fgColor: { rgb: "0F172A" } }; // Slate 900
        cell.s.alignment = { horizontal: "left", vertical: "center", indent: 1 };
      }

      // 7. PEC Reference Columns Header
      else if (R === 13) {
        cell.s.font = { name: "Segoe UI", sz: 9.5, bold: true, color: { rgb: "FFFFFF" } };
        cell.s.fill = { fgColor: { rgb: "1E293B" } }; // Slate 800
        cell.s.alignment = { horizontal: "center", vertical: "center", wrapText: true };
        cell.s.border = {
          bottom: { style: "medium", color: { rgb: "000000" } }
        };
      }

      // 8. PEC reference Rows
      else if (R >= 14 && R < refEndIndex) {
        const ratingVal = rows[R][0];
        const isSelectedRow = (ratingVal === result.entry.rating);

        if (isSelectedRow) {
          // Highlight selected wire parameter
          cell.s.fill = { fgColor: { rgb: "EFF6FF" } }; // Indigo/Sky soft blue highlight
          cell.s.font = { name: "Segoe UI", sz: 10, bold: true, color: { rgb: "2563EB" } }; // Blue-600
          cell.s.border = {
            top: { style: "medium", color: { rgb: "93C5FD" } },
            bottom: { style: "medium", color: { rgb: "93C5FD" } },
            left: { style: "medium", color: { rgb: "93C5FD" } },
            right: { style: "medium", color: { rgb: "93C5FD" } }
          };
        } else {
          // Regular rows with light zebra striping
          if (R % 2 === 0) {
            cell.s.fill = { fgColor: { rgb: "F8FAFC" } };
          }
        }

        // Alignments
        if (C === 0) {
          cell.s.alignment = { horizontal: "right", vertical: "center" };
        } else if (C === 1 || C === 4) {
          cell.s.alignment = { horizontal: "center", vertical: "center" };
        } else {
          cell.s.alignment = { horizontal: "center", vertical: "center" };
        }
      }

      // 9. Engineering Disclaimer
      else if (R === refEndIndex + 1) {
        cell.s.font = { name: "Segoe UI", sz: 10, bold: true, color: { rgb: "991B1B" } }; // Red-800
        cell.s.fill = { fgColor: { rgb: "FEF2F2" } }; // Warning light red
        cell.s.alignment = { horizontal: "center", vertical: "center" };
        cell.s.border = {
          top: { style: "medium", color: { rgb: "FCA5A5" } },
          left: { style: "medium", color: { rgb: "FCA5A5" } },
          right: { style: "medium", color: { rgb: "FCA5A5" } },
          bottom: { style: "none" }
        };
      }
      
      else if (R === refEndIndex + 2) {
        cell.s.font = { name: "Segoe UI", sz: 8.5, color: { rgb: "7F1D1D" }, italic: true }; // Red-900
        cell.s.fill = { fgColor: { rgb: "FEF2F2" } };
        cell.s.alignment = { horizontal: "center", vertical: "center", wrapText: true };
        cell.s.border = {
          bottom: { style: "medium", color: { rgb: "FCA5A5" } },
          left: { style: "medium", color: { rgb: "FCA5A5" } },
          right: { style: "medium", color: { rgb: "FCA5A5" } },
          top: { style: "none" }
        };
      }
      
      // 10. Space rows (R === 2, 11, refEndIndex)
      else {
        cell.s.border = {
          top: { style: "none" },
          bottom: { style: "none" },
          left: { style: "none" },
          right: { style: "none" }
        };
        cell.s.fill = { fgColor: { rgb: "FFFFFF" } };
      }
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "EGC Sizing Report");
  XLSX.writeFile(workbook, `PEC_EGC_Sizing_Report_${ocpdValue}A.xlsx`);
}

// ---------------- WORD EXPORT ----------------
export async function exportEgcToWord(ocpdValue: number, material: "Copper" | "Aluminum" | "Copper-Clad Aluminum", result: ReturnType<typeof findEgcSize>) {
  const ocpdRating = ocpdValue;
  const matSelected = material;
  const sizedMm2 = result.sizeMm2;
  const sizedAwg = result.sizeAwg;

  const titleParagraph = new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text: "PEC 2017 EQUIPMENT GROUNDING CONDUCTOR REPORT",
        bold: true,
        size: 32,
        color: "0F172A",
        font: "Segoe UI"
      })
    ],
    spacing: { after: 200 }
  });

  const subtitleParagraph = new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text: `Engineering Analysis for OCPD: ${ocpdValue}A - Material: ${material}`,
        italics: true,
        size: 20,
        color: "4F46E5",
        font: "Segoe UI"
      })
    ],
    spacing: { after: 400 }
  });

  // Summary Table
  const summaryTable = new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "DESIGN PARAMETER", bold: true, color: "FFFFFF" })] })],
            shading: { fill: "0F172A" }
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "COMPUTED VALUE", bold: true, color: "FFFFFF" })] })],
            shading: { fill: "0F172A" }
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "ENGINEERING UNITS / REFERENCE", bold: true, color: "FFFFFF" })] })],
            shading: { fill: "0F172A" }
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "System OCPD Rating" })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${ocpdRating} A`, bold: true })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Amperes" })] })] })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Conductor Material" })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: matSelected, bold: true })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "---" })] })] })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Min Required EGC Cross-Section Size" })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${sizedMm2} mm²`, bold: true, color: "4F46E5" })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Square Millimeters (Table 2.50.6.13)" })] })] })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "AWG/kcmil Equivalent Size" })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: sizedAwg, bold: true, color: "4F46E5" })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "AWG / kcmil standard gauge" })] })] })
        ]
      })
    ]
  });

  const sectionHeaderParagraph = new Paragraph({
    children: [
      new TextRun({
        text: "PEC 2017 Reference Table Data (Table 2.50.6.13):",
        bold: true,
        size: 24,
        color: "0F172A"
      })
    ],
    spacing: { before: 400, after: 200 }
  });

  const refRows = [
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "OCPD (A)", bold: true, color: "FFFFFF" })] })], shading: { fill: "4F46E5" } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Copper (mm²)", bold: true, color: "FFFFFF" })] })], shading: { fill: "4F46E5" } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Copper AWG", bold: true, color: "FFFFFF" })] })], shading: { fill: "4F46E5" } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Alum (mm²)", bold: true, color: "FFFFFF" })] })], shading: { fill: "4F46E5" } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Alum AWG", bold: true, color: "FFFFFF" })] })], shading: { fill: "4F46E5" } })
      ]
    })
  ];

  PEC_EGC_TABLE_2017.forEach(e => {
    const isCurrentMatchedRow = (e.rating === result.entry.rating);
    const rowColorShading = isCurrentMatchedRow ? "EFF6FF" : "FFFFFF";
    
    refRows.push(
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${e.rating}A`, bold: isCurrentMatchedRow })] })], shading: { fill: rowColorShading } }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${e.copperMm2}`, bold: isCurrentMatchedRow })] })], shading: { fill: rowColorShading } }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: e.copperAwg, bold: isCurrentMatchedRow })] })], shading: { fill: rowColorShading } }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${e.alumMm2}`, bold: isCurrentMatchedRow })] })], shading: { fill: rowColorShading } }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: e.alumAwg, bold: isCurrentMatchedRow })] })], shading: { fill: rowColorShading } })
        ]
      })
    );
  });

  const refTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: refRows
  });

  const disclaimerParagraph = new Paragraph({
    children: [
      new TextRun({
        text: "DISCLAIMER NOTICE:\n",
        bold: true,
        size: 16,
        color: "DC2626"
      }),
      new TextRun({
        text: "This calculation is based on PEC 2017 Table 2.50.6.13. Final design layouts and electrical schematics shall be verified, signed, and approved by a registered Professional Electrical Engineer (PEE) in accordance with the latest applicable Philippine local codes and electrical safety rules.",
        size: 16,
        italics: true,
        color: "475569"
      })
    ],
    spacing: { before: 400 }
  });

  const doc = new Document({
    creator: "ElectricalPH Sizing Core",
    title: "EGC Sizing Report",
    sections: [
      {
        children: [
          titleParagraph,
          subtitleParagraph,
          summaryTable,
          sectionHeaderParagraph,
          refTable,
          disclaimerParagraph
        ]
      }
    ]
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `EGC_Grounding_Report_${ocpdValue}A.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------------- PDF EXPORT ----------------
export function exportEgcToPdf(ocpdValue: number, material: "Copper" | "Aluminum" | "Copper-Clad Aluminum", result: ReturnType<typeof findEgcSize>) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const PRIMARY = [15, 23, 42]; // Slate 900
  const SECONDARY = [79, 70, 229]; // Indigo 600
  const TEXT_MUTED = [100, 116, 139]; // Slate 500
  const BG_LIGHT = [248, 250, 252]; // Slate 50

  // Header Panel Banner
  doc.setFillColor(BG_LIGHT[0], BG_LIGHT[1], BG_LIGHT[2]);
  doc.rect(0, 0, 210, 45, "F");

  // Secondary Color Banner Line
  doc.setFillColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
  doc.rect(15, 12, 1.5, 12, "F");

  // Title Texts
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.text("ELECTRICALPH DESIGN & AUDIT", 20, 19);

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text("PEC 2017 COMPLIANT UTILITIES CORE", 20, 23);

  // Doc Metadata Label
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
  doc.text("EGC CALCULATOR REPORT", 140, 19);

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.text(`Reference: PEC 2.50.6.13`, 140, 24);
  doc.text(`Date Executed: ${new Date().toLocaleDateString()}`, 140, 28);

  // Divide line
  doc.setDrawColor(226, 232, 240);
  doc.line(15, 45, 195, 45);

  // Report Section 1
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.text("1. Grounding Calculation Metrics Summary", 15, 55);

  // Grid / Design Details box
  doc.setFillColor(241, 245, 249);
  doc.rect(15, 60, 180, 48, "F");
  doc.setDrawColor(203, 213, 225);
  doc.rect(15, 60, 180, 48, "S");

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);

  doc.text(`System Overcurrent Protective Device (OCPD) Rating:`, 20, 68);
  doc.setFont("Helvetica", "bold");
  doc.text(`${ocpdValue} Amperes`, 115, 68);

  doc.setFont("Helvetica", "normal");
  doc.text(`Selected Equipment Grounding Wire Material:`, 20, 75);
  doc.setFont("Helvetica", "bold");
  doc.text(`${material}`, 115, 75);

  doc.setFont("Helvetica", "normal");
  doc.text(`Minimum Grounding Conductor Size (PEC Metric):`, 20, 82);
  doc.setFont("Helvetica", "bold");
  doc.setTextColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
  doc.text(`${result.sizeMm2} mm²`, 115, 82);

  doc.setFont("Helvetica", "normal");
  doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.text(`Equivalent AWG/kcmil wire size:`, 20, 89);
  doc.setFont("Helvetica", "bold");
  doc.setTextColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
  doc.text(`${result.sizeAwg}`, 115, 89);

  doc.setFont("Helvetica", "normal");
  doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.text(`Nominal wire dia. value:`, 20, 96);
  doc.setFont("Helvetica", "bold");
  doc.text(`${result.sizeDia === "---" ? "N/A" : result.sizeDia + " mm"}`, 115, 96);

  // Reference Code Selection Info Notes
  doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(11);
  doc.text("2. Complete PEC 2017 Table 2.50.6.13 Reference Matrix", 15, 120);

  // Draw printable compact table rows
  let y = 126;
  doc.setFillColor(15, 23, 42); // slate 900 headers
  doc.rect(15, y, 180, 7, "F");

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text("OCPD Rating (A) max", 18, y + 5);
  doc.text("Copper size (mm²)", 55, y + 5);
  doc.text("Copper AWG Equiv.", 90, y + 5);
  doc.text("Alum size (mm²)", 125, y + 5);
  doc.text("Alum AWG Equiv.", 160, y + 5);

  y += 7;

  PEC_EGC_TABLE_2017.forEach(e => {
    const isMatched = (e.rating === result.entry.rating);
    if (isMatched) {
      doc.setFillColor(239, 246, 255); // Highlight selected
      doc.rect(15, y, 180, 5, "F");
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(79, 70, 229); // indigo
    } else {
      doc.setFont("Helvetica", "normal");
      doc.setTextColor(15, 23, 42);
    }

    doc.setFontSize(8);
    doc.text(`${e.rating} A`, 18, y + 4);
    doc.text(`${e.copperMm2} mm²`, 55, y + 4);
    doc.text(e.copperAwg, 90, y + 4);
    doc.text(`${e.alumMm2} mm²`, 125, y + 4);
    doc.text(e.alumAwg, 160, y + 4);

    doc.setDrawColor(241, 245, 249);
    doc.line(15, y + 5, 195, y + 5);
    y += 5.2;
  });

  // Disclaimer block bottom boundary
  y += 6;
  doc.setDrawColor(239, 68, 68);
  doc.setFillColor(254, 242, 242);
  doc.rect(15, y, 180, 18, "F");
  doc.rect(15, y, 180, 18, "S");

  doc.setTextColor(220, 38, 38);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(8);
  doc.text("ENGINEERING COMPLIANCE GENERAL DISCLAIMER NOTICE:", 18, y + 4);

  doc.setFont("Helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("This computation and references are standard mappings evaluated programmatically from the Philippine Electrical Code (PEC 2017 Edition).", 18, y + 8);
  doc.text("All finalized circuit breakers, electrical panel distributions, schematics, and layouts shall be formulated, computed, of validation", 18, y + 11);
  doc.text("and approved by a duly licensed active Professional Electrical Engineer (PEE) in conforming with building permits requirements.", 18, y + 14);

  doc.save(`EGC_Sizing_Report_${ocpdValue}A.pdf`);
}

// Helper to draw clean AutoCAD rects by drawing four distinct lines
function drawDxfRect(drawing: Drawing, x1: number, y1: number, x2: number, y2: number) {
  drawing.drawLine(x1, y1, x2, y1);
  drawing.drawLine(x2, y1, x2, y2);
  drawing.drawLine(x2, y2, x1, y2);
  drawing.drawLine(x1, y2, x1, y1);
}

// ---------------- AUTOCAD DXF DRAFT ----------------
export function exportEgcToDxf(ocpdValue: number, material: "Copper" | "Aluminum" | "Copper-Clad Aluminum", result: ReturnType<typeof findEgcSize>) {
  const drawing = new Drawing();
  drawing.setUnits("Millimeters");

  // Create DXF active layers ensuring compatibility with expected parameter lengths
  drawing.addLayer("TITLE", 2, "CONTINUOUS"); // Yellow
  drawing.addLayer("BORDER", 7, "CONTINUOUS"); // White
  drawing.addLayer("GRID", 8, "CONTINUOUS"); // Gray
  drawing.addLayer("HIGHLIGHT", 4, "CONTINUOUS"); // Cyan
  drawing.addLayer("TEXT_VAL", 3, "CONTINUOUS"); // Green

  // Draw some nice drafting block boundaries
  // We frame our report card nicely at coordinates
  // let's create a beautiful CAD schedule detailing the minimum equipment grounding wire size.
  
  // Boundary Frame
  drawing.setActiveLayer("BORDER");
  drawDxfRect(drawing, 0, 0, 240, 180);
  drawDxfRect(drawing, 2, 2, 238, 178);

  // Title Box block
  drawing.setActiveLayer("TITLE");
  drawing.drawLine(0, 160, 240, 160);
  drawing.drawText(20, 168, 5, 0, "EQUIPMENT GROUNDING CONDUCTOR (EGC) SIZE SCHEDULE");
  drawing.drawText(20, 162, 2.5, 0, "IN ACCORDANCE WITH THE PHILIPPINE ELECTRICAL CODE (PEC) 2017 TABLE 2.50.6.13");

  // Calculation Sizing Summary Box Panel
  drawing.setActiveLayer("HIGHLIGHT");
  drawDxfRect(drawing, 10, 115, 115, 150);
  drawing.drawText(15, 144, 3, 0, "DESIGN SIZING RESULTS METRICS:");

  drawing.setActiveLayer("0");
  drawing.drawText(15, 136, 2.5, 0, `INPUT OCPD RATING:  ${ocpdValue} Amperes`);
  drawing.drawText(15, 129, 2.5, 0, `WIRE CONDUCTOR MATERIAL: ${material}`);
  
  drawing.setActiveLayer("TEXT_VAL");
  drawing.drawText(15, 122, 3, 0, `MIN REQUIRED SIZE: ${result.sizeMm2} sq.mm. (${result.sizeAwg} Equiv)`);

  // Drawing the official PEC Reference table as a block beside
  drawing.setActiveLayer("TITLE");
  drawing.drawText(130, 144, 3, 0, "PEC TABLE 2.50.6.13 REFERENCE:");

  // Header of reference table in CAD
  drawing.setActiveLayer("GRID");
  let ty = 135;
  drawing.drawLine(130, ty, 230, ty);
  drawing.drawText(131, ty + 2, 2, 0, "Rating (A)");
  drawing.drawText(155, ty + 2, 2, 0, "Cu (mm²)");
  drawing.drawText(180, ty + 2, 2, 0, "Cu AWG");
  drawing.drawText(205, ty + 2, 2, 0, "Al (mm²)");
  ty -= 4;
  drawing.drawLine(130, ty, 230, ty);

  // Compact drawing rows
  PEC_EGC_TABLE_2017.slice(0, 21).forEach(e => {
    const isTarget = (e.rating === result.entry.rating);
    if (isTarget) {
      drawing.setActiveLayer("HIGHLIGHT");
      drawing.drawText(131, ty + 1, 1.8, 0, `> ${e.rating}A`);
      drawing.drawText(155, ty + 1, 1.8, 0, `${e.copperMm2}`);
      drawing.drawText(180, ty + 1, 1.8, 0, `${e.copperAwg}`);
      drawing.drawText(205, ty + 1, 1.8, 0, `${e.alumMm2}`);
    } else {
      drawing.setActiveLayer("0");
      drawing.drawText(131, ty + 1, 1.5, 0, `  ${e.rating}A`);
      drawing.drawText(155, ty + 1, 1.5, 0, `${e.copperMm2}`);
      drawing.drawText(180, ty + 1, 1.5, 0, `${e.copperAwg}`);
      drawing.drawText(205, ty + 1, 1.5, 0, `${e.alumMm2}`);
    }
    ty -= 4.2;
  });

  // Footer Disclaimer text
  drawing.setActiveLayer("TITLE");
  drawing.drawText(10, 10, 1.8, 0, "DISCLAIMER: Sizing done programmatically using conforming engineering lookup indices.");
  drawing.drawText(10, 6, 1.8, 0, "Verify system load flow, short circuit, coordination details prior to physical layout.");

  // Save the DXF
  const dxfContent = drawing.toDxfString();
  const blob = new Blob([dxfContent], { type: "application/dxf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `EGC_CAD_Analysis_${ocpdValue}A.dxf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
