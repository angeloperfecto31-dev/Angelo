import { jsPDF } from "jspdf";
import "./pdfSafeText"; // printable PDF text (₱, ≤, Ω ...)
import { pdfFitText } from "./pdfLayout";
import autoTable from "jspdf-autotable";
import {
  SolarDesignConfig,
  SolarCalculationResults,
  SolarQuotationConfig,
} from "../types/solar";
import { calculateQuotationTotals } from "./solarQuotationEngine";

/**
 * Generates an executive-grade Contractor Solar Proposal / Quotation PDF
 */
export function exportSolarProposalPdf(
  config: SolarDesignConfig,
  calc: SolarCalculationResults,
  quotation: SolarQuotationConfig
) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // Colors
  const C_NAVY = [27, 54, 93] as [number, number, number]; // Primary Navy #1B365D
  const C_SLATE_DARK = [31, 41, 55] as [number, number, number]; // Slate 800
  const C_AMBER = [217, 119, 6] as [number, number, number]; // Amber 600
  const C_MUTED = [100, 116, 139] as [number, number, number]; // Slate 500
  const C_LIGHT_BG = [248, 250, 252] as [number, number, number]; // Slate 50
  const C_BORDER = [203, 213, 225] as [number, number, number]; // Slate 300
  const C_GREEN = [16, 185, 129] as [number, number, number];

  const totals = calculateQuotationTotals(quotation, calc);

  // -------------------------------------------------------------
  // HELPER: RUNNING HEADER & FOOTER
  // -------------------------------------------------------------
  const drawRunningHeaderFooter = (currentPage: number, totalPages: number) => {
    // Header line
    doc.setDrawColor(C_BORDER[0], C_BORDER[1], C_BORDER[2]);
    doc.setLineWidth(0.3);
    doc.line(margin, 12, pageWidth - margin, 12);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(C_NAVY[0], C_NAVY[1], C_NAVY[2]);
    doc.text("ELECTRICALPH • SOLAR PV COMMERCIAL PROPOSAL & QUOTATION", margin, 9);

    // Right-hand header fits the space left after the title
    const titleW = doc.getTextWidth("ELECTRICALPH • SOLAR PV COMMERCIAL PROPOSAL & QUOTATION");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(C_MUTED[0], C_MUTED[1], C_MUTED[2]);
    pdfFitText(
      doc,
      `${quotation.quotationNumber} | ${quotation.revision} | ${quotation.clientName.toUpperCase()}`,
      pageWidth - margin,
      9,
      pageWidth - 2 * margin - titleW - 6,
      { align: "right", minFontSize: 5.5 }
    );

    // Footer line
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(C_MUTED[0], C_MUTED[1], C_MUTED[2]);
    doc.text(
      "CONFIDENTIAL COMMERCIAL PROPOSAL • PROPRIETARY CONTRACTOR QUOTATION",
      margin,
      pageHeight - 8
    );
    doc.text(
      `Page ${currentPage} of ${totalPages}`,
      pageWidth - margin,
      pageHeight - 8,
      { align: "right" }
    );
  };

  // -------------------------------------------------------------
  // PAGE 1: COVER HEADER & PROJECT OVERVIEW
  // -------------------------------------------------------------
  // Top Banner
  doc.setFillColor(C_NAVY[0], C_NAVY[1], C_NAVY[2]);
  doc.rect(0, 0, pageWidth, 42, "F");

  doc.setFillColor(C_AMBER[0], C_AMBER[1], C_AMBER[2]);
  doc.rect(0, 42, pageWidth, 2.5, "F");

  // Title in Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("SOLAR PV INSTALLATION PROPOSAL & CONTRACT QUOTATION", margin, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(226, 232, 240);
  doc.text(
    `ENGINEERING, PROCUREMENT & CONSTRUCTION (EPC) TURNKEY PROPOSAL | PEC 2017 & RA 9513`,
    margin,
    26
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(253, 230, 138); // light amber
  doc.text(
    `Quotation No: ${quotation.quotationNumber}  •  ${quotation.revision}  •  Date: ${quotation.quotationDate}`,
    margin,
    34
  );

  let currentY = 52;

  // Project & Client Info Card Table
  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: "plain",
    styles: {
      fontSize: 8,
      cellPadding: 2.2,
      font: "helvetica",
      textColor: [31, 41, 55],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { fontStyle: "bold", textColor: C_NAVY, cellWidth: 38, fillColor: [248, 250, 252] },
      1: { cellWidth: 53 },
      2: { fontStyle: "bold", textColor: C_NAVY, cellWidth: 38, fillColor: [248, 250, 252] },
      3: { cellWidth: 53 },
    },
    body: [
      [
        "PROJECT TITLE",
        config.projectName || "Solar PV Installation",
        "PREPARED BY",
        quotation.preparedBy || "Lead Electrical Engineer",
      ],
      [
        "CLIENT / OWNER",
        quotation.clientName || "Valued Client",
        "COMPANY / EPC",
        quotation.preparedByCompany || "ElectricalPH Engineering Solutions",
      ],
      [
        "CLIENT COMPANY",
        quotation.clientCompany || "N/A",
        "CONTACT INFO",
        quotation.preparedByPhone || "+63 2 8800-SOLAR",
      ],
      [
        "SITE LOCATION",
        config.projectLocation || "Philippines",
        "VALID UNTIL",
        quotation.validUntilDate || "30 Days from date",
      ],
      [
        "SYSTEM CAPACITY",
        `${calc.totalDcCapacityKwp} kWp DC (${calc.totalInverterAcKw} kW AC)`,
        "SYSTEM TYPE",
        `${config.systemType.toUpperCase()} SOLAR SYSTEM`,
      ],
      [
        "UTILITY SERVICE",
        `${config.utilityVoltage}V, ${config.utilityPhase}, 60 Hz`,
        "CONNECTED MDP",
        config.selectedMdpId || "MAIN DISTRIBUTION PANEL",
      ],
    ],
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // Executive Project Overview Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(C_BORDER[0], C_BORDER[1], C_BORDER[2]);
  doc.roundedRect(margin, currentY, contentWidth, 22, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(C_NAVY[0], C_NAVY[1], C_NAVY[2]);
  doc.text("EXECUTIVE PROJECT OVERVIEW & GENERATION CAPACITY", margin + 3, currentY + 5.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  const overviewText =
    `This proposal covers the turnkey engineering design, equipment procurement, delivery, physical mounting, electrical wiring, testing, and commissioning of a ` +
    `${calc.totalDcCapacityKwp} kWp DC Photovoltaic generation facility featuring ${calc.totalModules} high-efficiency solar modules and ${calc.inverterQuantity} solar inverter(s). ` +
    `Expected estimated daytime generation is ~${(calc.totalDcCapacityKwp * config.peakSunHours * 0.8).toFixed(1)} kWh/day under ${config.peakSunHours} Peak Sun Hours (PSH).`;
  doc.text(doc.splitTextToSize(overviewText, contentWidth - 6), margin + 3, currentY + 10.5);

  currentY += 28;

  // -------------------------------------------------------------
  // SCOPE OF WORK SECTION
  // -------------------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(C_NAVY[0], C_NAVY[1], C_NAVY[2]);
  doc.text("1. SCOPE OF CONTRACTOR WORKS & DELIVERABLES", margin, currentY);

  currentY += 4;

  const scopeRows = quotation.scopeOfWork
    .filter((s) => s.included)
    .map((s, idx) => [
      String(idx + 1),
      s.title,
      s.description,
      "INCLUDED",
    ]);

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: "striped",
    head: [["#", "SCOPE PHASE", "DESCRIPTION OF CONTRACTOR ACTIVITIES", "STATUS"]],
    headStyles: {
      fillColor: C_NAVY,
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      font: "helvetica",
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 8 },
      1: { fontStyle: "bold", cellWidth: 46 },
      2: { cellWidth: 108 },
      3: { halign: "center", fontStyle: "bold", textColor: [16, 120, 70], cellWidth: 20 },
    },
    body: scopeRows,
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Check if we need page break for pricing table
  if (currentY > 210) {
    doc.addPage();
    currentY = 20;
  }

  // -------------------------------------------------------------
  // BILL OF MATERIALS / COST BREAKDOWN TABLE
  // -------------------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(C_NAVY[0], C_NAVY[1], C_NAVY[2]);
  doc.text(
    `2. BILL OF MATERIALS & COST SCHEDULE (${quotation.pricingDisplayMode.toUpperCase()} VIEW)`,
    margin,
    currentY
  );

  currentY += 4;

  if (quotation.pricingDisplayMode === "detailed") {
    const itemRows = quotation.items.map((it, idx) => {
      const sellPrice =
        typeof it.sellingPricePhp === "number"
          ? it.sellingPricePhp
          : Math.round(it.unitCostPhp * (1 + it.markupPercent / 100));
      const amount = it.quantity * sellPrice;

      return [
        String(idx + 1),
        it.category || "General",
        `${it.itemDescription} (${it.manufacturer} ${it.model})`.trim(),
        String(it.quantity),
        it.unit || "pcs",
        `₱ ${sellPrice.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `₱ ${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      ];
    });

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      theme: "striped",
      head: [["#", "CATEGORY", "ITEM & SPECIFICATION", "QTY", "UNIT", "UNIT PRICE", "AMOUNT (PHP)"]],
      headStyles: {
        fillColor: C_NAVY,
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: "bold",
      },
      styles: {
        fontSize: 7,
        cellPadding: 1.8,
        font: "helvetica",
      },
      columnStyles: {
        0: { halign: "center", cellWidth: 7 },
        1: { cellWidth: 32 },
        2: { cellWidth: 70 },
        3: { halign: "center", cellWidth: 12 },
        4: { halign: "center", cellWidth: 12 },
        5: { halign: "right", cellWidth: 24 },
        6: { halign: "right", fontStyle: "bold", cellWidth: 25 },
      },
      body: itemRows,
    });
  } else if (quotation.pricingDisplayMode === "summary") {
    // Group items by category
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

    const summaryRows = Array.from(categoryTotals.entries()).map(([cat, data], idx) => [
      String(idx + 1),
      cat.toUpperCase(),
      `Complete certified supply & materials lot (${data.count} items)`,
      "1",
      "lot",
      `₱ ${data.total.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `₱ ${data.total.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    ]);

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      theme: "striped",
      head: [["#", "CATEGORY", "SCOPE DESCRIPTION", "QTY", "UNIT", "UNIT PRICE", "AMOUNT (PHP)"]],
      headStyles: {
        fillColor: C_NAVY,
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: "bold",
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2.2,
        font: "helvetica",
      },
      columnStyles: {
        0: { halign: "center", cellWidth: 8 },
        1: { fontStyle: "bold", cellWidth: 44 },
        2: { cellWidth: 65 },
        3: { halign: "center", cellWidth: 12 },
        4: { halign: "center", cellWidth: 12 },
        5: { halign: "right", cellWidth: 21 },
        6: { halign: "right", fontStyle: "bold", cellWidth: 20 },
      },
      body: summaryRows,
    });
  } else {
    // Lump-Sum Turnkey Package
    const lumpSumRows = [
      [
        "1",
        "TURNKEY SOLAR PHOTOVOLTAIC EPC CONTRACT",
        `Complete engineering design, supply of ${calc.totalDcCapacityKwp} kWp PV modules, inverter systems, aluminum racking, DC/AC protection, installation labor, testing, commissioning, and net-metering technical documentation.`,
        "1",
        "lot",
        `₱ ${totals.materialsSubtotalPhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `₱ ${totals.materialsSubtotalPhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      ],
    ];

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      theme: "striped",
      head: [["#", "CONTRACT PACKAGE", "TURNKEY SPECIFICATION & DELIVERABLES", "QTY", "UNIT", "UNIT PRICE", "AMOUNT (PHP)"]],
      headStyles: {
        fillColor: C_NAVY,
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: "bold",
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 3,
        font: "helvetica",
      },
      columnStyles: {
        0: { halign: "center", cellWidth: 8 },
        1: { fontStyle: "bold", cellWidth: 48 },
        2: { cellWidth: 65 },
        3: { halign: "center", cellWidth: 10 },
        4: { halign: "center", cellWidth: 10 },
        5: { halign: "right", cellWidth: 20 },
        6: { halign: "right", fontStyle: "bold", cellWidth: 21 },
      },
      body: lumpSumRows,
    });
  }

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // -------------------------------------------------------------
  // COMMERCIAL COST SUMMARY & RECAPITULATION
  // -------------------------------------------------------------
  if (currentY > 215) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(C_NAVY[0], C_NAVY[1], C_NAVY[2]);
  doc.text("3. COMMERCIAL CONTRACT PRICE SUMMARY", margin, currentY);

  currentY += 4;

  const costBreakdownRows: any[] = [
    ["Equipment & Materials Subtotal", `₱ ${totals.materialsSubtotalPhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
    ["Civil Mounting & Electrical Installation Labor", `₱ ${totals.totalLaborPhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
    ["Engineering System Design & PEC Compliance Dossier", `₱ ${totals.engineeringDesignFeePhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
    ["Pre-Energization Testing, Commissioning & Cloud Monitoring", `₱ ${totals.testingCommissioningCostPhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
  ];

  if (totals.permittingUtilityFeePhp > 0) {
    costBreakdownRows.push(["Utility Permitting & Net-Metering Assistance", `₱ ${totals.permittingUtilityFeePhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
  }
  if (totals.mobilizationDeliveryPhp > 0) {
    costBreakdownRows.push(["Freight, Handling & Project Mobilization", `₱ ${totals.mobilizationDeliveryPhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
  }
  if (totals.otherChargesPhp > 0) {
    costBreakdownRows.push(["Other Applicable Charges / Contingency", `₱ ${totals.otherChargesPhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
  }
  if (totals.discountAmountPhp > 0) {
    costBreakdownRows.push(["Contractor Project Discount", `- ₱ ${totals.discountAmountPhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
  }
  if (quotation.applyTax) {
    costBreakdownRows.push([`Value Added Tax (${quotation.taxRatePercent}% VAT)`, `₱ ${totals.taxAmountPhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
  }

  costBreakdownRows.push([
    "PROPOSED CONTRACT PRICE (GRAND TOTAL)",
    `PHP ${totals.grandTotalContractPricePhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  ]);

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin + 30, right: margin + 30 },
    theme: "plain",
    styles: {
      fontSize: 8,
      cellPadding: 2,
      font: "helvetica",
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { fontStyle: "bold", textColor: C_NAVY, cellWidth: 75, fillColor: [248, 250, 252] },
      1: { halign: "right", fontStyle: "bold", textColor: [31, 41, 55], cellWidth: 47 },
    },
    body: costBreakdownRows,
    didParseCell: (data) => {
      if (data.row.index === costBreakdownRows.length - 1) {
        data.cell.styles.fillColor = C_NAVY;
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontSize = 8.5;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // -------------------------------------------------------------
  // PAYMENT TERMS & WARRANTY BLOCK
  // -------------------------------------------------------------
  if (currentY > 210) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(C_NAVY[0], C_NAVY[1], C_NAVY[2]);
  doc.text("4. COMMERCIAL TERMS & WARRANTY GUARANTEE", margin, currentY);

  currentY += 4;

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: "plain",
    styles: {
      fontSize: 7.5,
      cellPadding: 2.2,
      font: "helvetica",
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { fontStyle: "bold", textColor: C_NAVY, cellWidth: 45, fillColor: [248, 250, 252] },
      1: { cellWidth: 137 },
    },
    body: [
      ["Payment Milestone Terms", quotation.paymentTerms || "30% Downpayment • 50% Delivery • 20% Commissioning"],
      ["Expected Project Duration", quotation.projectDuration || "15 to 30 Working Days upon downpayment and site handover"],
      ["Equipment & Workmanship Warranty", quotation.warrantyTerms || "25-Yr Module Performance • 5-Yr Inverter • 1-Yr Workmanship"],
      [
        "Key Inclusions",
        quotation.inclusions.slice(0, 4).join("\n• ") ? `• ${quotation.inclusions.slice(0, 4).join("\n• ")}` : "Standard EPC Scope",
      ],
      [
        "Standard Exclusions",
        quotation.exclusions.slice(0, 3).join("\n• ") ? `• ${quotation.exclusions.slice(0, 3).join("\n• ")}` : "Utility meter deposits",
      ],
    ],
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // -------------------------------------------------------------
  // FORMAL ACCEPTANCE & SIGNATURE BLOCKS
  // -------------------------------------------------------------
  if (currentY > 220) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(C_NAVY[0], C_NAVY[1], C_NAVY[2]);
  doc.text("5. PROPOSAL SIGN-OFF & CLIENT ACCEPTANCE (CONFORME)", margin, currentY);

  currentY += 5;

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: "plain",
    styles: {
      fontSize: 7.5,
      cellPadding: 3,
      font: "helvetica",
      lineColor: [203, 213, 225],
      lineWidth: 0.3,
    },
    columnStyles: {
      0: { cellWidth: 60, fillColor: [255, 255, 255] },
      1: { cellWidth: 60, fillColor: [255, 255, 255] },
      2: { cellWidth: 62, fillColor: [255, 255, 255] },
    },
    body: [
      [
        "PREPARED BY (CONTRACTOR):",
        "CHECKED & VERIFIED BY:",
        "CLIENT / CONTRACTOR ACCEPTANCE:",
      ],
      [
        `\n\n________________________________\n${quotation.preparedBy.toUpperCase()}\n${quotation.preparedByTitle || "Solar EPC Project Engineer"}\nDate: ${quotation.quotationDate}`,
        `\n\n________________________________\n${quotation.checkedBy || "PROFESSIONAL ELECTRICAL ENGINEER"}\n${quotation.checkedByTitle || "Licensed PEE (PRC Reg. No.)"}\nDate: ${quotation.quotationDate}`,
        `\n\n________________________________\n${quotation.clientName.toUpperCase()}\nAuthorized Representative / Conforme\nDate: ________________________`,
      ],
    ],
  });

  // Stamp running headers & footers on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawRunningHeaderFooter(i, totalPages);
  }

  // Save PDF
  const cleanNum = quotation.quotationNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `${cleanNum}_Solar_Quotation_Proposal.pdf`;
  doc.save(fileName);
}
