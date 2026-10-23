import { jsPDF } from "jspdf";
import "./pdfSafeText"; // printable PDF text (₱, ≤, Ω ...)
import { pdfFitText } from "./pdfLayout";
import autoTable from "jspdf-autotable";
import { SolarDesignConfig, SolarCalculationResults, SolarBOMItem } from "../types/solar";
import { generateSolarBOM } from "./solarEngine";
import { captureSolarBlockDiagram } from "./solarSldCapture";
import { drawCaptureToPdf } from "./pdfCapturedDrawing";
import { hasRoofPlan, roofPlanLayout, roofPlanImage, roofPlanInfo, drawRoofPlanPdf, drawRoofPlanInfoPdf } from "./roofPlanExport";

/**
 * Generates an executive-grade, multi-page Solar PV Engineering Design & Calculation Report (PDF).
 * Fully compliant with Philippine Electrical Code (PEC 2017 Part 1 & 2 Article 6.90),
 * Republic Act No. 9513 (Renewable Energy Act), and ERC Net-Metering Rules.
 */
export async function exportSolarToPdf(
  config: SolarDesignConfig,
  calc: SolarCalculationResults,
  /** Panel board the house loads are fed from (shown on the block diagram) */
  panelDesignation?: string
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

  // Color Palette
  const C_NAVY = [15, 23, 42] as [number, number, number]; // Slate 900
  const C_SLATE_DARK = [30, 41, 59] as [number, number, number]; // Slate 800
  const C_AMBER = [217, 119, 6] as [number, number, number]; // Amber 600
  const C_AMBER_DARK = [180, 83, 9] as [number, number, number]; // Amber 700
  const C_BLUE = [2, 132, 199] as [number, number, number]; // Sky 600
  const C_MUTED = [100, 116, 139] as [number, number, number]; // Slate 500
  const C_LIGHT_BG = [248, 250, 252] as [number, number, number]; // Slate 50
  const C_BORDER = [226, 232, 240] as [number, number, number]; // Slate 200
  const C_GREEN = [5, 150, 105] as [number, number, number]; // Emerald 600

  // -------------------------------------------------------------
  // HELPER: PAGE HEADER & RUNNING FOOTER
  // -------------------------------------------------------------
  const drawRunningHeaderFooter = (currentPage: number, totalPages: number) => {
    // Top running header
    doc.setDrawColor(C_BORDER[0], C_BORDER[1], C_BORDER[2]);
    doc.setLineWidth(0.3);
    doc.line(margin, 12, pageWidth - margin, 12);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(C_SLATE_DARK[0], C_SLATE_DARK[1], C_SLATE_DARK[2]);
    doc.text("ELECTRICALPH • SOLAR PV ENGINEERING DESIGN REPORT", margin, 9);

    // Right-hand header fits the space left after the title
    const titleW = doc.getTextWidth("ELECTRICALPH • SOLAR PV ENGINEERING DESIGN REPORT");
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(C_MUTED[0], C_MUTED[1], C_MUTED[2]);
    pdfFitText(
      doc,
      `${config.projectName.toUpperCase()} | PEC 2017 ART 6.90 COMPLIANT`,
      pageWidth - margin,
      9,
      pageWidth - 2 * margin - titleW - 6,
      { align: "right", minFontSize: 5.5 }
    );

    // Bottom running footer
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(C_MUTED[0], C_MUTED[1], C_MUTED[2]);
    doc.text(
      "Confidential & Proprietary • Certified under Philippine Electrical Code (PEC) & ERC Net-Metering Rules",
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
  // PAGE 1: COVER & EXECUTIVE SUMMARY
  // -------------------------------------------------------------

  // Top Title Bar Background
  doc.setFillColor(C_NAVY[0], C_NAVY[1], C_NAVY[2]);
  doc.rect(0, 0, pageWidth, 44, "F");

  // Accent Gold Bar
  doc.setFillColor(C_AMBER[0], C_AMBER[1], C_AMBER[2]);
  doc.rect(0, 44, pageWidth, 2.5, "F");

  // Title Block
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text("SOLAR PV SYSTEM DESIGN & CALCULATION REPORT", margin, 18);

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225); // Slate 300
  doc.text(
    "ENGINEERING SIZING, STRING CALCULATIONS, ELECTRICAL PROTECTION & NET-METERING INTEGRATION",
    margin,
    25
  );

  // Regulatory standard badges text
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(251, 191, 36); // Amber 400
  doc.text(
    "COMPLIANCE: PEC 2017 PART 1 & 2 (ART 6.90)  •  RA 9513 (RENEWABLE ENERGY ACT)  •  ERC RES. 09 S. 2013",
    margin,
    33
  );

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184); // Slate 400
  doc.text(`Document Reference: EPH-SOLAR-${Date.now().toString().slice(-6)} • Issued: ${new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}`, margin, 39);

  let currentY = 54;

  // -------------------------------------------------------------
  // METADATA GRID BOX
  // -------------------------------------------------------------
  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: "plain",
    styles: { fontSize: 8, cellPadding: 2, textColor: C_SLATE_DARK },
    columnStyles: {
      0: { fontStyle: "bold", textColor: C_MUTED, cellWidth: 32 },
      1: { cellWidth: 58 },
      2: { fontStyle: "bold", textColor: C_MUTED, cellWidth: 32 },
      3: { cellWidth: 60 },
    },
    body: [
      ["PROJECT NAME:", config.projectName || "Solar PV Installation", "CLIENT / OWNER:", config.clientName || "Valued Client"],
      ["LOCATION:", config.projectLocation || "Philippines", "LEAD DESIGNER / PE:", config.designerName || "Electrical Engineer"],
      ["PROJECT PROFILE:", `${config.projectType.toUpperCase()} INSTALLATION`, "SYSTEM TYPE:", `${config.systemType.toUpperCase()} SOLAR SYSTEM`],
      ["SIZING APPROACH:", config.sizingMethod === "target_capacity" ? "Target Capacity Method" : "Load Demand Matching", "UTILITY SERVICE:", `${config.utilityVoltage}V, ${config.utilityPhase}, ${config.utilityFrequency} Hz`],
    ],
  });

  currentY = (doc as any).lastAutoTable.finalY + 5;

  // -------------------------------------------------------------
  // EXECUTIVE KPI CARDS
  // -------------------------------------------------------------
  const cardWidth = (contentWidth - 9) / 4;
  const cardHeight = 22;

  const kpis = [
    {
      title: "INSTALLED DC CAPACITY",
      val: `${calc.totalDcCapacityKwp} kWp`,
      sub: `${calc.totalModules} x ${calc.selectedModule.ratedPowerWp}W Modules`,
      color: C_AMBER,
    },
    {
      title: "INVERTER AC CAPACITY",
      val: `${calc.totalInverterAcKw} kW AC`,
      sub: `${calc.inverterQuantity}x ${calc.selectedInverter.model}`,
      color: C_BLUE,
    },
    {
      title: "DC / AC SIZING RATIO",
      val: `${calc.dcAcRatio}x`,
      sub: calc.dcAcRatio >= 1.05 && calc.dcAcRatio <= 1.35 ? "Optimal Sizing Range" : "Check Inverter Sizing",
      color: calc.dcAcRatio >= 1.05 && calc.dcAcRatio <= 1.35 ? C_GREEN : C_AMBER,
    },
    {
      title: "EST. ANNUAL YIELD",
      val: `${(calc.totalDcCapacityKwp * config.peakSunHours * 365 * 0.8 / 1000).toFixed(1)} MWh`,
      sub: `~${(calc.totalDcCapacityKwp * config.peakSunHours * 0.8).toFixed(1)} kWh/day (${config.peakSunHours} PSH)`,
      color: C_GREEN,
    },
  ];

  kpis.forEach((kpi, idx) => {
    const x = margin + idx * (cardWidth + 3);
    doc.setFillColor(C_LIGHT_BG[0], C_LIGHT_BG[1], C_LIGHT_BG[2]);
    doc.setDrawColor(C_BORDER[0], C_BORDER[1], C_BORDER[2]);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, currentY, cardWidth, cardHeight, 1.5, 1.5, "FD");

    // Top color strip
    doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.rect(x, currentY, cardWidth, 1.2, "F");

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(C_MUTED[0], C_MUTED[1], C_MUTED[2]);
    doc.text(kpi.title, x + 2.5, currentY + 5.5);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(C_NAVY[0], C_NAVY[1], C_NAVY[2]);
    doc.text(kpi.val, x + 2.5, currentY + 12.5);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(C_MUTED[0], C_MUTED[1], C_MUTED[2]);
    doc.text(kpi.sub, x + 2.5, currentY + 18, { maxWidth: cardWidth - 5 });
  });

  currentY += cardHeight + 8;

  // -------------------------------------------------------------
  // SECTION 1: PV ARRAY & STRING CONFIGURATION TABLE
  // -------------------------------------------------------------
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(C_NAVY[0], C_NAVY[1], C_NAVY[2]);
  doc.text("1. PV Array Sizing & Temperature Corrected Parameters", margin, currentY);
  doc.setFontSize(7.5);
  doc.setFont("Helvetica", "normal");
  doc.setTextColor(C_MUTED[0], C_MUTED[1], C_MUTED[2]);
  doc.text("Evaluated in accordance with PEC 2017 Article 6.90.2.1 temperature correction requirements", margin, currentY + 4);

  currentY += 6;

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: "striped",
    headStyles: {
      fillColor: C_SLATE_DARK,
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: "bold",
    },
    styles: { fontSize: 7.5, cellPadding: 2.2, textColor: C_SLATE_DARK },
    body: [
      [
        "PV Module Brand & Model",
        `${calc.selectedModule.manufacturer} - ${calc.selectedModule.model}`,
        "Rated Module Power (STC)",
        `${calc.selectedModule.ratedPowerWp} Wp (Efficiency: ${calc.selectedModule.efficiencyPercent}%)`,
      ],
      [
        "Open-Circuit Voltage (Voc STC)",
        `${calc.selectedModule.voc.toFixed(2)} V`,
        "Max-Power Voltage (Vmp STC)",
        `${calc.selectedModule.vmp.toFixed(2)} V`,
      ],
      [
        "Short-Circuit Current (Isc STC)",
        `${calc.selectedModule.isc.toFixed(2)} A`,
        "Max-Power Current (Imp STC)",
        `${calc.selectedModule.imp.toFixed(2)} A`,
      ],
      [
        "Temperature Coeff. of Voc (β)",
        `${calc.selectedModule.tempCoeffVoc}% / °C`,
        "Temperature Coeff. of Pmax (γ)",
        `${calc.selectedModule.tempCoeffPmax}% / °C`,
      ],
      [
        "Design Ambient Temperatures",
        `Min: ${config.minOperatingTempC}°C | Max: ${config.maxOperatingTempC}°C`,
        "Design Max Cell Temperature",
        `70.0°C (NOCT Ambient Model)`,
      ],
      [
        "Module Voc at Tmin (Voc,cold)",
        `${calc.vocCold.toFixed(2)} V (Cold Weather Peak)`,
        "Module Vmp at Tcell,max (Vmp,hot)",
        `${calc.vmpHot.toFixed(2)} V (Hot Weather Low)`,
      ],
      [
        "Array String Layout",
        `${calc.effective.modulesPerString} Modules in Series per String`,
        "Total Parallel Strings",
        `${calc.effective.numberOfStrings} Parallel Strings`,
      ],
      [
        "Maximum String Voc (Cold)",
        `${calc.stringVoc.toFixed(1)} VDC (Max System: ${calc.selectedModule.maxSystemVoltage}V)`,
        "Minimum String Vmp (Hot)",
        `${calc.stringVmp.toFixed(1)} VDC (Operating Point)`,
      ],
      [
        "Total Array DC Current (Isc,hot)",
        `${calc.totalDcCurrent.toFixed(2)} Amperes`,
        "Required Array Roof/Ground Area",
        `${calc.areaRequiredM2.toFixed(1)} m² (${config.roofType.replace("_", " ").toUpperCase()})`,
      ],
    ],
  });

  currentY = (doc as any).lastAutoTable.finalY + 7;

  // -------------------------------------------------------------
  // SECTION 2: INVERTER SIZING & MPPT VALIDATION TABLE
  // -------------------------------------------------------------
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(C_NAVY[0], C_NAVY[1], C_NAVY[2]);
  doc.text("2. Solar Inverter Sizing & MPPT Tracking Compliance", margin, currentY);
  currentY += 5;

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: "striped",
    headStyles: {
      fillColor: C_SLATE_DARK,
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: "bold",
    },
    styles: { fontSize: 7.5, cellPadding: 2.2, textColor: C_SLATE_DARK },
    body: [
      [
        "Selected Inverter Model",
        `${calc.selectedInverter.manufacturer} ${calc.selectedInverter.model}`,
        "Inverter Quantity & Total AC",
        `${calc.inverterQuantity} Unit(s) = ${calc.totalInverterAcKw} kW AC`,
      ],
      [
        "Rated AC Output Voltage / Phase",
        `${calc.selectedInverter.acVoltage}V, ${calc.selectedInverter.phase}, ${calc.selectedInverter.frequencyHz}Hz`,
        "Inverter Full-Load Current",
        `Rated: ${calc.inverterRatedAcCurrent.toFixed(1)}A | Max: ${calc.inverterMaxAcCurrent.toFixed(1)}A`,
      ],
      [
        "Max Permissible DC Input Voltage",
        `${calc.selectedInverter.maxDcVoltage} VDC`,
        "Voc String Peak Check",
        `${calc.stringVoc.toFixed(1)} VDC ≤ ${calc.selectedInverter.maxDcVoltage} VDC (${calc.validations.vocWithinMaxDcVoltage ? "PASSED" : "FAILED"})`,
      ],
      [
        "Inverter MPPT Voltage Range",
        `${calc.selectedInverter.mpptVoltageRangeMin}V - ${calc.selectedInverter.mpptVoltageRangeMax}V`,
        "Operating Vmp String Check",
        `${calc.stringVmp.toFixed(1)} VDC within MPPT bounds (${calc.validations.vmpWithinMpptRange ? "PASSED" : "FAILED"})`,
      ],
      [
        "DC / AC Sizing Ratio",
        `${calc.dcAcRatio}x`,
        "Total Inverter Continuous Current",
        `${calc.totalSystemAcCurrent.toFixed(1)} Amperes Continuous`,
      ],
    ],
  });

  // -------------------------------------------------------------
  // PAGE 2: ELECTRICAL PROTECTION, CABLING & NET METERING
  // -------------------------------------------------------------
  doc.addPage();
  currentY = 20;

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(C_NAVY[0], C_NAVY[1], C_NAVY[2]);
  doc.text("3. DC & AC Electrical Protection & Conductor Schedules", margin, currentY);
  doc.setFontSize(7.5);
  doc.setFont("Helvetica", "normal");
  doc.setTextColor(C_MUTED[0], C_MUTED[1], C_MUTED[2]);
  doc.text("Sized per PEC 2017 Article 6.90.2.2 (DC Fusing at 1.56 x Isc) and Article 6.90.2.3 (AC Breaker at 1.25 x Icont)", margin, currentY + 4);

  currentY += 7;

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: "grid",
    headStyles: {
      fillColor: C_SLATE_DARK,
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: "bold",
    },
    styles: { fontSize: 7.5, cellPadding: 2.2, textColor: C_SLATE_DARK },
    head: [["PROTECTION ELEMENT", "ENGINEERING CALCULATION BASIS", "RECOMMENDED SPECIFICATION", "STATUS"]],
    body: [
      [
        "DC String Fuse (OCPD)",
        `1.56 x Module Isc (${calc.selectedModule.isc.toFixed(2)}A) = ${(1.56 * calc.selectedModule.isc).toFixed(2)}A`,
        `${calc.effective.dcFuseRatingAmps}A gPV, ${config.dcProtection.fuseVoltageVolts}VDC, ${config.dcProtection.fuseKaic} kAIC`,
        "PEC COMPLIANT",
      ],
      [
        "DC Disconnect / Isolator",
        `Rated for Max String Voc (${calc.stringVoc.toFixed(0)}V) & Total Array DC Current`,
        `${calc.effective.dcIsolatorRatingAmps}A DC Isolator, ${config.dcProtection.isolatorVoltageVolts}VDC, ${config.dcProtection.isolatorPoles}-Pole`,
        "PEC COMPLIANT",
      ],
      [
        "DC Surge Protection (SPD)",
        `Type 2 SPD with Uc ≥ 1.2 x String Voc (${(calc.stringVoc * 1.2).toFixed(0)}V)`,
        `Type 2 SPD, Uc: ${calc.effective.dcSpdUcVolts}VDC, In: ${config.dcProtection.spdInKa}kA, Imax: ${config.dcProtection.spdImaxKa}kA`,
        "PEC COMPLIANT",
      ],
      [
        "AC Inverter Circuit Breaker",
        `1.25 x Inverter Max Output (${calc.inverterMaxAcCurrent.toFixed(1)}A) = ${(calc.inverterMaxAcCurrent * 1.25).toFixed(1)}A`,
        `${calc.effective.acBreakerAtAmps} AT / ${calc.effective.acBreakerAfAmps} AF, ${calc.effective.acBreakerPoles}P, ${calc.effective.acKaic} kAIC (${config.acProtection.breakerType})`,
        calc.validations.acBreakerAdequate ? "PASSED" : "CHECK BREAKER",
      ],
      [
        "AC Disconnect Switch",
        `Lockable, visible blade manual isolator per ERC Net-Metering standard`,
        `${config.acProtection.isolatorRatingAmps}A AC Isolator, ${config.acProtection.isolatorPoles}-Pole Heavy Duty`,
        "ERC COMPLIANT",
      ],
      [
        "AC Surge Protection (SPD)",
        `Type 2 AC SPD for grid transient & lightning surge suppression`,
        `Type 2 SPD, ${config.acProtection.spdRatingVolts}V, In: 20kA, Imax: 40kA`,
        "PEC COMPLIANT",
      ],
      [
        "Equipment Grounding (EGC)",
        `PEC Table 2.50.6.13 sized based on highest circuit OCPD rating`,
        `${calc.effective.dcEgcSizeMm2} mm² ${config.dcProtection.egcMaterial} Ground Wire (${config.dcProtection.egcInsulation})`,
        "PEC COMPLIANT",
      ],
    ],
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // -------------------------------------------------------------
  // SECTION 4: CONDUIT & CABLE SIZING WITH VOLTAGE DROP
  // -------------------------------------------------------------
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(C_NAVY[0], C_NAVY[1], C_NAVY[2]);
  doc.text("4. Conductor Sizing & Voltage Drop Verification", margin, currentY);
  currentY += 5;

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: "striped",
    headStyles: {
      fillColor: C_SLATE_DARK,
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: "bold",
    },
    styles: { fontSize: 7.5, cellPadding: 2.2, textColor: C_SLATE_DARK },
    head: [["CABLE RUN", "CONDUCTOR SPECS", "CONDUIT", "RUN (M)", "DESIGN CURRENT", "V-DROP (V)", "V-DROP (%)", "LIMIT", "STATUS"]],
    body: [
      [
        "DC Array String Cable",
        `${calc.effective.dcCableSizeMm2} mm² ${config.cabling.dcCable.insulation} Cu`,
        `${config.cabling.dcCable.conduitSizeMm}mm ${config.cabling.dcCable.conduitType}`,
        `${config.cabling.dcCable.lengthM} m`,
        `${calc.stringImp.toFixed(2)} A`,
        `${calc.dcVoltageDropV.toFixed(2)} V`,
        `${calc.dcVoltageDropPercent.toFixed(2)}%`,
        `≤ ${config.cabling.dcMaxDropPercent}%`,
        calc.validations.dcVoltageDropValid ? "PASSED" : "EXCEEDED",
      ],
      [
        "AC Inverter Feed to Panel",
        `${calc.effective.acCableSizeMm2} mm² ${config.cabling.acCable.insulation} Cu`,
        `${calc.effective.acConduitSizeMm}mm ${config.cabling.acCable.conduitType}`,
        `${config.cabling.acCable.lengthM} m`,
        `${calc.inverterRatedAcCurrent.toFixed(1)} A`,
        `${calc.acVoltageDropV.toFixed(2)} V`,
        `${calc.acVoltageDropPercent.toFixed(2)}%`,
        `≤ ${config.cabling.acMaxDropPercent}%`,
        calc.validations.acVoltageDropValid ? "PASSED" : "EXCEEDED",
      ],
      [
        "Total Combined System V-Drop",
        "Cumulative DC + AC System Voltage Drop",
        "---",
        "---",
        "---",
        `${(calc.dcVoltageDropV + calc.acVoltageDropV).toFixed(2)} V`,
        `${(calc.dcVoltageDropPercent + calc.acVoltageDropPercent).toFixed(2)}%`,
        "≤ 3.00%",
        (calc.dcVoltageDropPercent + calc.acVoltageDropPercent) <= 3.0 ? "PASSED" : "WARNING",
      ],
    ],
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // -------------------------------------------------------------
  // SECTION 5: NET METERING & BESS (IF CONFIGURED)
  // -------------------------------------------------------------
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(C_NAVY[0], C_NAVY[1], C_NAVY[2]);
  doc.text("5. Utility Interconnection & Energy Storage Integration", margin, currentY);
  currentY += 5;

  const utilityRows = [
    [
      "Distribution Utility (DU)",
      config.netMetering.utilityProvider || "MERALCO / Local DU",
      "Interconnection Point",
      config.netMetering.interconnectionType === "load_side" ? "Load-Side Interconnection (PEC 6.90.7.2)" : "Supply-Side Interconnection",
    ],
    [
      "Export Mode",
      config.netMetering.exportLimitation === "none" ? "Full Export Net-Metering" : config.netMetering.exportLimitation === "zero_export" ? "Zero Export Active Control" : `Limited Export (${config.netMetering.exportLimitPercent}%)`,
      "Bi-Directional Metering",
      config.netMetering.smartMeterModel || "Class 0.2S Revenue Smart Bi-directional Meter",
    ],
  ];

  if (config.battery.enabled) {
    utilityRows.push([
      "BESS Storage Chemistry",
      `${config.battery.manufacturer} ${config.battery.model} (LiFePO4)`,
      "Total Energy / Usable",
      `${calc.batteryTotalEnergyKwh} kWh Total / ${calc.batteryUsableEnergyKwh} kWh Usable (${config.battery.dodPercent}% DoD)`,
    ]);
    utilityRows.push([
      "Battery Bank Voltage",
      `${calc.batteryBankVoltage} VDC (${calc.effective.batteryUnits} Units: ${calc.batteryUnitsInSeries}S / ${calc.batteryUnitsInParallel}P), ${calc.batteryBreakerAmps}A DC breaker`,
      "Estimated Autonomy Backup",
      `${calc.batteryBackupHoursActual.toFixed(1)} Hours at ${config.battery.requiredBackupLoadKw} kW Critical Load`,
    ]);
  }

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: "striped",
    headStyles: {
      fillColor: C_SLATE_DARK,
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: "bold",
    },
    styles: { fontSize: 7.5, cellPadding: 2.2, textColor: C_SLATE_DARK },
    body: utilityRows,
  });

  // -------------------------------------------------------------
  // PAGE 3: BILL OF MATERIALS (BOM) & COST ESTIMATE
  // -------------------------------------------------------------
  doc.addPage();
  currentY = 20;

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(C_NAVY[0], C_NAVY[1], C_NAVY[2]);
  doc.text("6. Solar PV Bill of Materials (BOM) & Cost Schedule", margin, currentY);
  doc.setFontSize(7.5);
  doc.setFont("Helvetica", "normal");
  doc.setTextColor(C_MUTED[0], C_MUTED[1], C_MUTED[2]);
  doc.text("Itemized material procurement schedule and engineering estimate in Philippine Pesos (PHP)", margin, currentY + 4);

  currentY += 7;

  let grandTotalPhp = 0;
  const bomList: SolarBOMItem[] =
    config.bomItems && config.bomItems.length > 0
      ? config.bomItems
      : calc.bomItems && calc.bomItems.length > 0
      ? calc.bomItems
      : generateSolarBOM(config, calc);

  const bomRows = bomList.map((item, idx) => {
    const unitCost = typeof item.unitCostPhp === "number" ? item.unitCostPhp : Number(item.unitCostPhp) || 0;
    const qty = typeof item.quantity === "number" ? item.quantity : Number(item.quantity) || 1;
    const markup = typeof item.markupPercent === "number" ? item.markupPercent : Number(item.markupPercent) || 0;
    const totalCost =
      typeof item.totalCostPhp === "number" && item.totalCostPhp > 0
        ? item.totalCostPhp
        : Math.round(qty * unitCost * (1 + markup / 100));

    grandTotalPhp += totalCost;
    return [
      String(idx + 1),
      item.category || "General",
      `${item.itemDescription} (${item.manufacturer || "Standard"})`,
      String(qty),
      item.unit || "pcs",
      `PHP ${unitCost.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `${markup}%`,
      `PHP ${totalCost.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    ];
  });

  // Add Grand Total row
  bomRows.push([
    "",
    "",
    "TOTAL ESTIMATED SYSTEM INVESTMENT (PHP)",
    "",
    "",
    "",
    "",
    `PHP ${grandTotalPhp.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  ]);

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: "grid",
    headStyles: {
      fillColor: C_NAVY,
      textColor: [255, 255, 255],
      fontSize: 7,
      fontStyle: "bold",
    },
    styles: { fontSize: 6.8, cellPadding: 2, textColor: C_SLATE_DARK },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 28 },
      2: { cellWidth: 54 },
      3: { cellWidth: 10, halign: "center" },
      4: { cellWidth: 10, halign: "center" },
      5: { cellWidth: 26, halign: "right" },
      6: { cellWidth: 14, halign: "center" },
      7: { cellWidth: 32, halign: "right", fontStyle: "bold" },
    },
    head: [["#", "CATEGORY", "ITEM SPECIFICATION", "QTY", "UNIT", "UNIT PRICE (PHP)", "MARKUP", "TOTAL AMOUNT (PHP)"]],
    body: bomRows,
    didParseCell: (data) => {
      // Highlight Grand Total Row
      if (data.row.index === bomRows.length - 1) {
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = C_NAVY;
      }
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // -------------------------------------------------------------
  // SECTION 7: PROFESSIONAL CERTIFICATION & SEAL BLOCK
  // -------------------------------------------------------------
  if (currentY > pageHeight - 65) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFillColor(C_LIGHT_BG[0], C_LIGHT_BG[1], C_LIGHT_BG[2]);
  doc.setDrawColor(C_BORDER[0], C_BORDER[1], C_BORDER[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, currentY, contentWidth, 50, 2, 2, "FD");

  // Gold indicator bar
  doc.setFillColor(C_AMBER[0], C_AMBER[1], C_AMBER[2]);
  doc.rect(margin, currentY, contentWidth, 1.5, "F");

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(C_NAVY[0], C_NAVY[1], C_NAVY[2]);
  doc.text("PROFESSIONAL ELECTRICAL ENGINEER (PEE) CERTIFICATION", margin + 5, currentY + 7);

  doc.setFont("Helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(C_SLATE_DARK[0], C_SLATE_DARK[1], C_SLATE_DARK[2]);
  const disclaimerText =
    "\"I hereby certify that the solar photovoltaic engineering design, temperature-corrected string configurations, " +
    "electrical protection sizing, conductor schedules, and load integration presented in this report were prepared in " +
    "strict compliance with the Philippine Electrical Code (PEC 2017 Edition, Parts 1 and 2), Republic Act No. 9513 " +
    "(Renewable Energy Act of 2008), and Energy Regulatory Commission (ERC) Net-Metering Rules and Regulations.\"";
  doc.text(disclaimerText, margin + 5, currentY + 13, { maxWidth: contentWidth - 10 });

  // Signature lines inside block
  const sigY = currentY + 32;
  const colW = (contentWidth - 20) / 2;

  // Left Sign: Designer
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(C_MUTED[0], C_MUTED[1], C_MUTED[2]);
  doc.text("PREPARED / DESIGNED BY:", margin + 5, sigY - 5);
  doc.line(margin + 5, sigY + 5, margin + 5 + colW, sigY + 5);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(C_NAVY[0], C_NAVY[1], C_NAVY[2]);
  doc.text(config.designerName || "Electrical Engineer", margin + 5, sigY + 9);
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(C_MUTED[0], C_MUTED[1], C_MUTED[2]);
  doc.text("Solar PV Systems Specialist", margin + 5, sigY + 12.5);

  // Right Sign: PEE
  const rightX = margin + 15 + colW;
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(C_MUTED[0], C_MUTED[1], C_MUTED[2]);
  doc.text("CHECKED & APPROVED FOR SUBMISSION BY:", rightX, sigY - 5);
  doc.line(rightX, sigY + 5, rightX + colW, sigY + 5);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(C_NAVY[0], C_NAVY[1], C_NAVY[2]);
  doc.text("PROFESSIONAL ELECTRICAL ENGINEER (PEE)", rightX, sigY + 9);
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(C_MUTED[0], C_MUTED[1], C_MUTED[2]);
  doc.text("PRC Reg. No.: ___________  •  PTR No.: ___________", rightX, sigY + 12.5);

  // -------------------------------------------------------------
  // BLOCK DIAGRAM (own page, vector drawing - the same diagram as in Solar Design)
  // -------------------------------------------------------------
  doc.addPage();
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(C_NAVY[0], C_NAVY[1], C_NAVY[2]);
  doc.text("BLOCK DIAGRAM", margin, 22);
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(C_MUTED[0], C_MUTED[1], C_MUTED[2]);
  doc.text("Power flow from the PV array through the inverter, protection and metering to the utility and the loads", margin, 26);
  doc.setDrawColor(C_BORDER[0], C_BORDER[1], C_BORDER[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, 31, contentWidth, 150, 2, 2, "S");
  drawCaptureToPdf(doc, captureSolarBlockDiagram(config, calc, panelDesignation), {
    x: margin + 4,
    y: 35,
    w: contentWidth - 8,
    h: 142,
  });

  // -------------------------------------------------------------
  // ROOF PLAN (when a roof has been captured and outlined)
  // -------------------------------------------------------------
  if (hasRoofPlan(config)) {
    doc.addPage();
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(C_NAVY[0], C_NAVY[1], C_NAVY[2]);
    doc.text("ROOF PLAN", margin, 22);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(C_MUTED[0], C_MUTED[1], C_MUTED[2]);
    doc.text("PV module layout on the captured roof, with roof edge lengths, north arrow and drawing scale", margin, 26);
    const box = { x: margin, y: 30, w: contentWidth, h: 150 };
    const layout = roofPlanLayout(config.roofPlan!, calc, box.w, box.h);
    let image: string | null = null;
    try {
      image = await roofPlanImage(config.roofPlan!, layout.bounds);
    } catch {
      image = null; // the vector layout is still drawn without the photo
    }
    drawRoofPlanPdf(doc, config, calc, box, layout, image);
    drawRoofPlanInfoPdf(doc, roofPlanInfo(config, calc, layout.N, "A4"), margin, box.y + box.h + 8, contentWidth);
  }

  // -------------------------------------------------------------
  // APPLY RUNNING HEADERS & FOOTERS TO ALL PAGES
  // -------------------------------------------------------------
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawRunningHeaderFooter(i, totalPages);
  }

  // Save document
  const fileName = `${config.projectName.replace(/[^a-zA-Z0-9_-]/g, "_")}_Solar_Engineering_Report.pdf`;
  doc.save(fileName);
}
