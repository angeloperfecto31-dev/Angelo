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
  PageOrientation,
  VerticalAlign,
  TableOfContents
} from "docx";
import { saveAs } from "file-saver";
import {
  SolarDesignConfig,
  SolarCalculationResults,
  SolarQuotationConfig,
} from "../types/solar";
import { calculateQuotationTotals } from "./solarQuotationEngine";

/**
 * Generates an executive Microsoft Word (.docx) Solar EPC Proposal & Commercial Quotation
 */
export async function exportSolarProposalWord(
  config: SolarDesignConfig,
  calc: SolarCalculationResults,
  quotation: SolarQuotationConfig
) {
  const totals = calculateQuotationTotals(quotation, calc);

  const FONT_FAMILY = "Segoe UI";
  const PRIMARY_COLOR = "1B365D"; // Deep Navy Blue
  const TEXT_MAIN_COLOR = "1F2937";
  const TEXT_MUTED_COLOR = "4B5563";
  const ACCENT_BORDER_COLOR = "CBD5E1";
  const ROW_EVEN_FILL = "F8FAFC";
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
          children: [
            new TextRun({
              text: text !== undefined && text !== null ? String(text) : "N/A",
              bold: isBold,
              size: fontSize,
              font: FONT_FAMILY,
              color: textColor,
            }),
          ],
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
          size: 26,
          color: PRIMARY_COLOR,
          bold: true,
        }),
      ],
      spacing: { before: 360, after: 140 },
      pageBreakBefore,
      border: {
        bottom: { color: "64748B", space: 8, style: BorderStyle.SINGLE, size: 8 },
      },
    });

  const createParagraph = (text: string, highlight = false) =>
    new Paragraph({
      spacing: { before: 0, after: 90, line: 260 },
      children: [
        new TextRun({
          text,
          font: FONT_FAMILY,
          size: 20,
          color: highlight ? PRIMARY_COLOR : TEXT_MAIN_COLOR,
          bold: highlight,
        }),
      ],
      shading: highlight ? { fill: "F2F4F7" } : undefined,
    });

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
      lines.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line,
              font: FONT_FAMILY,
              size: 18,
              color: "333333",
            }),
          ],
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

  const docChildren: any[] = [];

  // -------------------------------------------------------------
  // COVER PAGE (PAGE 1)
  // -------------------------------------------------------------
  docChildren.push(new Paragraph({ spacing: { before: 600 } }));

  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 180 },
      children: [
        new TextRun({
          text: "ELECTRICALPH • SOLAR PV COMMERCIAL PROPOSAL & QUOTATION",
          font: FONT_FAMILY,
          size: 18,
          color: PRIMARY_COLOR,
          bold: true,
          characterSpacing: 24,
        }),
      ],
    })
  );

  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: "SOLAR PV INSTALLATION PROPOSAL & CONTRACT QUOTATION",
          font: FONT_FAMILY,
          size: 34,
          color: "1F2937",
          bold: true,
        }),
      ],
    })
  );

  // Horizontal Accent Line
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

  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 500 },
      children: [
        new TextRun({
          text: `Comprehensive Solar Photovoltaic EPC Proposal • ${quotation.quotationNumber} • ${quotation.revision}`,
          font: FONT_FAMILY,
          size: 18,
          color: TEXT_MUTED_COLOR,
          italics: true,
        }),
      ],
    })
  );

  // Project Info Card Table
  const createCoverRow = (label: string, val: string, isEven: boolean) => {
    const rowFill = isEven ? ROW_EVEN_FILL : ROW_ODD_FILL;
    return new TableRow({
      children: [
        new TableCell({
          width: { size: 35, type: WidthType.PERCENTAGE },
          shading: { fill: rowFill },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 90, bottom: 90, left: 140, right: 100 },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: label.toUpperCase(),
                  font: FONT_FAMILY,
                  size: 16,
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
          margins: { top: 90, bottom: 90, left: 140, right: 100 },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: val || "N/A",
                  font: FONT_FAMILY,
                  size: 16,
                  color: "374151",
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
      ],
    });
  };

  const coverRows: TableRow[] = [
    createCoverRow("Quotation / Proposal Number", quotation.quotationNumber, false),
    createCoverRow("Proposal Revision", quotation.revision, true),
    createCoverRow("Proposal Date", quotation.quotationDate, false),
    createCoverRow("Proposal Validity", quotation.validUntilDate || "30 Days from date", true),
    createCoverRow("Project Title", config.projectName || "Solar PV Installation", false),
    createCoverRow("Project Location", config.projectLocation || "Philippines", true),
    createCoverRow("Client / Owner", quotation.clientName || "Valued Client", false),
    createCoverRow("Client Company", quotation.clientCompany || "N/A", true),
    createCoverRow("Prepared By (Contractor)", quotation.preparedBy || "Lead Electrical Engineer", false),
    createCoverRow("Contractor Company", quotation.preparedByCompany || "ElectricalPH Engineering", true),
    createCoverRow("Installed DC Capacity", `${calc.totalDcCapacityKwp} kWp (${calc.totalDcCapacityW.toLocaleString()} Wp)`, false),
    createCoverRow("Inverter AC Export Capacity", `${calc.totalInverterAcKw} kW AC (${calc.inverterQuantity} Units)`, true),
    createCoverRow("System Type", `${config.systemType.toUpperCase()} SOLAR SYSTEM`, false),
    createCoverRow("Turnkey Contract Amount", `PHP ${totals.grandTotalContractPricePhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, true),
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
      rows: coverRows,
    }),
    new Paragraph({ spacing: { before: 260 } }),
    createCallout("🛡 CONTRACTOR EPC COMMITMENT & QUALITY GUARANTEE", [
      "This proposal incorporates premium Tier-1 photovoltaic components, certified solar inverters, and heavy-duty balance of system hardware engineered in strict conformance with the Philippine Electrical Code (PEC 2017) and Republic Act No. 9513.",
      "All electrical layouts and single line diagrams are prepared and stamped under the direct supervision of a licensed Professional Electrical Engineer (PEE).",
    ]),
    new Paragraph({ children: [new TextRun({ text: "", break: 1 })], pageBreakBefore: true })
  );

  // -------------------------------------------------------------
  // TABLE OF CONTENTS (PAGE 2)
  // -------------------------------------------------------------
  docChildren.push(
    createHeader("Table of Contents"),
    new TableOfContents("Table of Contents", {
      hyperlink: true,
      headingStyleRange: "1-3",
    }),
    new Paragraph({ spacing: { before: 180, after: 140 } })
  );

  // -------------------------------------------------------------
  // SECTION 1.0: EXECUTIVE OVERVIEW & SYSTEM SPECIFICATIONS
  // -------------------------------------------------------------
  docChildren.push(
    createHeader("1.0 EXECUTIVE PROJECT OVERVIEW & SYSTEM CAPACITY", true),
    createParagraph(
      `ElectricalPH is pleased to submit this comprehensive turnkey Solar Photovoltaic (PV) Engineering, Procurement, and Construction (EPC) commercial proposal for the ${config.projectName || "Solar PV Installation"}. ` +
      `The facility is engineered to incorporate ${calc.totalDcCapacityKwp} kWp of high-efficiency photovoltaic modules connected to ${calc.totalInverterAcKw} kW of grid-tie/hybrid inverter capacity. ` +
      `Estimated daily energy generation is ~${(calc.totalDcCapacityKwp * config.peakSunHours * 0.8).toFixed(1)} kWh/day under standard operating solar irradiation.`
    )
  );

  const specsRows: TableRow[] = [
    new TableRow({
      children: [
        createCell("TECHNICAL PARAMETER", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("PROPOSED CONTRACTOR SPECIFICATION", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("TECHNICAL PARAMETER", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("PROPOSED CONTRACTOR SPECIFICATION", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
      ],
    }),
    new TableRow({
      children: [
        createCell("Total Installed PV Capacity", true),
        createCell(`${calc.totalDcCapacityKwp} kWp (${calc.totalDcCapacityW.toLocaleString()} Wp)`),
        createCell("Total Inverter Export Capacity", true),
        createCell(`${calc.totalInverterAcKw} kW AC`),
      ],
    }),
    new TableRow({
      children: [
        createCell("Selected PV Module", true),
        createCell(`${calc.selectedModule.manufacturer} ${calc.selectedModule.model} (${calc.selectedModule.ratedPowerWp}W)`),
        createCell("Total PV Module Count", true),
        createCell(`${calc.totalModules} Units (${calc.effective.numberOfStrings} Strings x ${calc.effective.modulesPerString} Modules)`),
      ],
    }),
    new TableRow({
      children: [
        createCell("Selected Solar Inverter", true),
        createCell(`${calc.selectedInverter.manufacturer} ${calc.selectedInverter.model}`),
        createCell("Inverter Quantity & Phasing", true),
        createCell(`${calc.inverterQuantity} Unit(s) • ${calc.selectedInverter.phase}, ${calc.selectedInverter.acVoltage}V 60Hz`),
      ],
    }),
    new TableRow({
      children: [
        createCell("Mounting Structure", true),
        createCell(`${config.roofType.replace("_", " ").toUpperCase()} • ${config.mountingType.replace("_", " ").toUpperCase()}`),
        createCell("Available & Required Area", true),
        createCell(`Req: ${calc.areaRequiredM2} m² (Avail: ${config.availableRoofAreaM2} m²)`),
      ],
    }),
    new TableRow({
      children: [
        createCell("Electrical Protection", true),
        createCell(`${calc.effective.dcFuseRatingAmps}A DC Fuses • ${calc.effective.acBreakerAtAmps}A AC Breaker`),
        createCell("Net-Metering Disconnect", true),
        createCell(`${config.acProtection.isolatorRatingAmps}A Manual Visible-Blade Safety Switch`),
      ],
    }),
  ];

  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorderGrid,
      rows: specsRows,
    })
  );

  // -------------------------------------------------------------
  // SECTION 2.0: SCOPE OF WORK
  // -------------------------------------------------------------
  docChildren.push(
    createHeader("2.0 DETAILED SCOPE OF CONTRACTOR WORKS", true),
    createParagraph(
      "The contractor scope of work includes all necessary technical, civil, mechanical, electrical, and commissioning services required for complete turnkey execution:"
    )
  );

  const scopeRows: TableRow[] = [
    new TableRow({
      children: [
        createCell("#", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("PHASE / CATEGORY", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("DESCRIPTION OF CONTRACTOR ACTIVITIES & DELIVERABLES", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        createCell("STATUS", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
      ],
    }),
    ...quotation.scopeOfWork
      .filter((s) => s.included)
      .map((s, idx) =>
        new TableRow({
          children: [
            createCell(String(idx + 1), false, AlignmentType.CENTER),
            createCell(s.title, true),
            createCell(s.description, false),
            createCell("INCLUDED", true, AlignmentType.CENTER, "DCFCE7", "166534"),
          ],
        })
      ),
  ];

  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorderGrid,
      rows: scopeRows,
    })
  );

  // -------------------------------------------------------------
  // SECTION 3.0: BILL OF MATERIALS / COST BREAKDOWN
  // -------------------------------------------------------------
  docChildren.push(
    createHeader(`3.0 BILL OF MATERIALS & COST BREAKDOWN (${quotation.pricingDisplayMode.toUpperCase()} VIEW)`, true),
    createParagraph(
      `Itemized materials, equipment, and accessories specification for the proposed solar installation:`
    )
  );

  if (quotation.pricingDisplayMode === "detailed") {
    const itemRows: TableRow[] = [
      new TableRow({
        children: [
          createCell("#", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
          createCell("CATEGORY", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
          createCell("ITEM & SPECIFICATION", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
          createCell("QTY", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
          createCell("UNIT", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
          createCell("UNIT PRICE (PHP)", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
          createCell("AMOUNT (PHP)", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        ],
      }),
      ...quotation.items.map((it, idx) => {
        const sellPrice =
          typeof it.sellingPricePhp === "number"
            ? it.sellingPricePhp
            : Math.round(it.unitCostPhp * (1 + it.markupPercent / 100));
        const amount = it.quantity * sellPrice;

        return new TableRow({
          children: [
            createCell(String(idx + 1), false, AlignmentType.CENTER),
            createCell(it.category || "General", false),
            createCell(`${it.itemDescription} (${it.manufacturer} ${it.model})`.trim(), false),
            createCell(String(it.quantity), false, AlignmentType.CENTER),
            createCell(it.unit || "pcs", false, AlignmentType.CENTER),
            createCell(`PHP ${sellPrice.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, false, AlignmentType.RIGHT),
            createCell(`PHP ${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, true, AlignmentType.RIGHT),
          ],
        });
      }),
      new TableRow({
        children: [
          createCell("", true, AlignmentType.CENTER, "EEF2FF"),
          createCell("", true, AlignmentType.CENTER, "EEF2FF"),
          createCell("EQUIPMENT & MATERIALS SUBTOTAL", true, AlignmentType.LEFT, "EEF2FF", PRIMARY_COLOR, 19),
          createCell("", true, AlignmentType.CENTER, "EEF2FF"),
          createCell("", true, AlignmentType.CENTER, "EEF2FF"),
          createCell("", true, AlignmentType.CENTER, "EEF2FF"),
          createCell(
            `PHP ${totals.materialsSubtotalPhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
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
        rows: itemRows,
      })
    );
  } else if (quotation.pricingDisplayMode === "summary") {
    const categoryTotals = new Map<string, { count: number; total: number }>();
    quotation.items.forEach((it) => {
      const cat = it.category || "General Equipment";
      const sellPrice =
        typeof it.sellingPricePhp === "number"
          ? it.sellingPricePhp
          : Math.round(it.unitCostPhp * (1 + it.markupPercent / 100));
      const amount = it.quantity * sellPrice;
      const current = categoryTotals.get(cat) || { count: 0, total: 0 };
      categoryTotals.set(cat, {
        count: current.count + it.quantity,
        total: current.total + amount,
      });
    });

    const summaryRows: TableRow[] = [
      new TableRow({
        children: [
          createCell("#", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
          createCell("CATEGORY", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
          createCell("SCOPE DESCRIPTION & SPECIFICATIONS", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
          createCell("QTY", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
          createCell("UNIT", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
          createCell("AMOUNT (PHP)", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        ],
      }),
      ...Array.from(categoryTotals.entries()).map(([cat, data], idx) =>
        new TableRow({
          children: [
            createCell(String(idx + 1), false, AlignmentType.CENTER),
            createCell(cat.toUpperCase(), true),
            createCell(`Complete certified materials supply lot (${data.count} items)`, false),
            createCell("1", false, AlignmentType.CENTER),
            createCell("lot", false, AlignmentType.CENTER),
            createCell(`PHP ${data.total.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, true, AlignmentType.RIGHT),
          ],
        })
      ),
      new TableRow({
        children: [
          createCell("", true, AlignmentType.CENTER, "EEF2FF"),
          createCell("TOTAL MATERIALS LOT", true, AlignmentType.LEFT, "EEF2FF", PRIMARY_COLOR, 19),
          createCell("", true, AlignmentType.CENTER, "EEF2FF"),
          createCell("", true, AlignmentType.CENTER, "EEF2FF"),
          createCell("", true, AlignmentType.CENTER, "EEF2FF"),
          createCell(
            `PHP ${totals.materialsSubtotalPhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
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
        rows: summaryRows,
      })
    );
  } else {
    // Lump-Sum Turnkey
    const lumpSumRows: TableRow[] = [
      new TableRow({
        children: [
          createCell("#", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
          createCell("CONTRACT SCOPE", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
          createCell("TURNKEY DELIVERABLES & TECHNICAL SPECIFICATION", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
          createCell("QTY", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
          createCell("UNIT", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
          createCell("TOTAL CONTRACT AMOUNT (PHP)", true, AlignmentType.CENTER, PRIMARY_COLOR, "FFFFFF"),
        ],
      }),
      new TableRow({
        children: [
          createCell("1", false, AlignmentType.CENTER),
          createCell("COMPLETE TURNKEY SOLAR EPC INSTALLATION", true),
          createCell(
            `Turnkey solar EPC contract covering complete engineering design, supply of ${calc.totalDcCapacityKwp} kWp PV modules, inverter systems, aluminum racking, DC/AC protection, installation labor, testing, commissioning, and net-metering technical documentation.`,
            false
          ),
          createCell("1", false, AlignmentType.CENTER),
          createCell("lot", false, AlignmentType.CENTER),
          createCell(
            `PHP ${totals.grandTotalContractPricePhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            true,
            AlignmentType.RIGHT
          ),
        ],
      }),
    ];

    docChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: tableBorderGrid,
        rows: lumpSumRows,
      })
    );
  }

  // -------------------------------------------------------------
  // SECTION 4.0: PROJECT COST SUMMARY & COMMERCIAL TERMS
  // -------------------------------------------------------------
  docChildren.push(
    createHeader("4.0 COMMERCIAL CONTRACT PRICE SUMMARY", true),
    createParagraph("Comprehensive commercial recapitulation including materials, labor, engineering, and adjustments:")
  );

  const costSummaryRows: TableRow[] = [
    new TableRow({
      children: [
        createCell("Equipment & Materials Subtotal", true),
        createCell(`PHP ${totals.materialsSubtotalPhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, false, AlignmentType.RIGHT),
      ],
    }),
    new TableRow({
      children: [
        createCell("Civil Mounting & Electrical Installation Labor", true),
        createCell(`PHP ${totals.totalLaborPhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, false, AlignmentType.RIGHT),
      ],
    }),
    new TableRow({
      children: [
        createCell("Engineering System Design & PEC Compliance Dossier", true),
        createCell(`PHP ${totals.engineeringDesignFeePhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, false, AlignmentType.RIGHT),
      ],
    }),
    new TableRow({
      children: [
        createCell("Pre-Energization Testing, Commissioning & Cloud Monitoring", true),
        createCell(`PHP ${totals.testingCommissioningCostPhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, false, AlignmentType.RIGHT),
      ],
    }),
  ];

  if (totals.permittingUtilityFeePhp > 0) {
    costSummaryRows.push(
      new TableRow({
        children: [
          createCell("Utility Permitting & Net-Metering Assistance", true),
          createCell(`PHP ${totals.permittingUtilityFeePhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, false, AlignmentType.RIGHT),
        ],
      })
    );
  }
  if (totals.mobilizationDeliveryPhp > 0) {
    costSummaryRows.push(
      new TableRow({
        children: [
          createCell("Freight, Handling & Project Mobilization", true),
          createCell(`PHP ${totals.mobilizationDeliveryPhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, false, AlignmentType.RIGHT),
        ],
      })
    );
  }
  if (totals.otherChargesPhp > 0) {
    costSummaryRows.push(
      new TableRow({
        children: [
          createCell("Other Applicable Charges / Contingency", true),
          createCell(`PHP ${totals.otherChargesPhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, false, AlignmentType.RIGHT),
        ],
      })
    );
  }
  if (totals.discountAmountPhp > 0) {
    costSummaryRows.push(
      new TableRow({
        children: [
          createCell("Contractor Project Discount", true),
          createCell(`- PHP ${totals.discountAmountPhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, false, AlignmentType.RIGHT),
        ],
      })
    );
  }
  if (quotation.applyTax) {
    costSummaryRows.push(
      new TableRow({
        children: [
          createCell(`Value Added Tax (${quotation.taxRatePercent}% VAT)`, true),
          createCell(`PHP ${totals.taxAmountPhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, false, AlignmentType.RIGHT),
        ],
      })
    );
  }

  costSummaryRows.push(
    new TableRow({
      children: [
        createCell("PROPOSED CONTRACT PRICE (GRAND TOTAL)", true, AlignmentType.LEFT, PRIMARY_COLOR, "FFFFFF", 20),
        createCell(
          `PHP ${totals.grandTotalContractPricePhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          true,
          AlignmentType.RIGHT,
          PRIMARY_COLOR,
          "FFFFFF",
          20
        ),
      ],
    })
  );

  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorderGrid,
      rows: costSummaryRows,
    })
  );

  // -------------------------------------------------------------
  // SECTION 5.0: COMMERCIAL TERMS & INCLUSIONS
  // -------------------------------------------------------------
  docChildren.push(
    createHeader("5.0 COMMERCIAL TERMS, WARRANTIES & ACCEPTANCE", true),
    createParagraph("Governing commercial terms, payment milestone schedule, and warranties:")
  );

  const termsRows: TableRow[] = [
    new TableRow({
      children: [
        createCell("Payment Milestone Schedule", true, AlignmentType.LEFT, "F1F5F9"),
        createCell(quotation.paymentTerms || "30% Downpayment • 50% Delivery • 20% Commissioning"),
      ],
    }),
    new TableRow({
      children: [
        createCell("Estimated Project Duration", true, AlignmentType.LEFT, "F1F5F9"),
        createCell(quotation.projectDuration || "15 to 30 Working Days upon downpayment and site readiness"),
      ],
    }),
    new TableRow({
      children: [
        createCell("Equipment Warranties", true, AlignmentType.LEFT, "F1F5F9"),
        createCell(quotation.warrantyTerms || "25-Yr Module Performance • 5-Yr Inverter • 1-Yr Workmanship"),
      ],
    }),
    new TableRow({
      children: [
        createCell("Turnkey Inclusions", true, AlignmentType.LEFT, "F1F5F9"),
        createCell(quotation.inclusions.join("\n• ")),
      ],
    }),
    new TableRow({
      children: [
        createCell("Standard Exclusions", true, AlignmentType.LEFT, "F1F5F9"),
        createCell(quotation.exclusions.join("\n• ")),
      ],
    }),
  ];

  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorderGrid,
      rows: termsRows,
    }),
    new Paragraph({ spacing: { before: 240 } })
  );

  // -------------------------------------------------------------
  // SECTION 6.0: FORMAL SIGNATURES & CLIENT CONFORME
  // -------------------------------------------------------------
  docChildren.push(
    createHeader("6.0 FORMAL PROPOSAL SIGN-OFF & CLIENT CONFORME"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorderGrid,
      rows: [
        new TableRow({
          children: [
            createCell("PREPARED BY (CONTRACTOR):", true, AlignmentType.LEFT, PRIMARY_COLOR, "FFFFFF"),
            createCell("CHECKED & VERIFIED BY:", true, AlignmentType.LEFT, PRIMARY_COLOR, "FFFFFF"),
            createCell("CLIENT ACCEPTANCE (CONFORME):", true, AlignmentType.LEFT, PRIMARY_COLOR, "FFFFFF"),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({ text: "\n\n\n____________________________________", spacing: { after: 40 } }),
                new Paragraph({
                  children: [new TextRun({ text: quotation.preparedBy.toUpperCase(), bold: true, color: "0F172A", font: FONT_FAMILY })],
                  spacing: { after: 20 },
                }),
                new Paragraph({ text: quotation.preparedByTitle || "Solar EPC Project Engineer", spacing: { after: 20 } }),
                new Paragraph({ text: `Company: ${quotation.preparedByCompany || "ElectricalPH"}`, spacing: { after: 20 } }),
                new Paragraph({ text: `Date: ${quotation.quotationDate}` }),
              ],
              margins: { top: 100, bottom: 100, left: 100, right: 100 },
            }),
            new TableCell({
              children: [
                new Paragraph({ text: "\n\n\n____________________________________", spacing: { after: 40 } }),
                new Paragraph({
                  children: [new TextRun({ text: (quotation.checkedBy || "PROFESSIONAL ELECTRICAL ENGINEER").toUpperCase(), bold: true, color: "0F172A", font: FONT_FAMILY })],
                  spacing: { after: 20 },
                }),
                new Paragraph({ text: quotation.checkedByTitle || "Licensed PEE (PRC Reg. No.)", spacing: { after: 20 } }),
                new Paragraph({ text: "Certified under RA 7920 & PEC 2017", spacing: { after: 20 } }),
                new Paragraph({ text: `Date: ${quotation.quotationDate}` }),
              ],
              margins: { top: 100, bottom: 100, left: 100, right: 100 },
            }),
            new TableCell({
              children: [
                new Paragraph({ text: "\n\n\n____________________________________", spacing: { after: 40 } }),
                new Paragraph({
                  children: [new TextRun({ text: quotation.clientName.toUpperCase(), bold: true, color: "0F172A", font: FONT_FAMILY })],
                  spacing: { after: 20 },
                }),
                new Paragraph({ text: quotation.clientCompany || "Authorized Representative", spacing: { after: 20 } }),
                new Paragraph({ text: "Conforme Signature & Acceptance", spacing: { after: 20 } }),
                new Paragraph({ text: "Date: ________________________" }),
              ],
              margins: { top: 100, bottom: 100, left: 100, right: 100 },
            }),
          ],
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `ELECTRICALPH • SOLAR PV COMMERCIAL PROPOSAL | ${quotation.quotationNumber} • ${quotation.revision}`,
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
                    text: `${config.projectName || "Solar PV Installation"} • Commercial Quotation Proposal  |  `,
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
        children: docChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const cleanNum = quotation.quotationNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `${cleanNum}_Solar_Quotation_Proposal.docx`;
  saveAs(blob, fileName);
}
