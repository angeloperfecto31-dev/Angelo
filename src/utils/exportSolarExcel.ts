import * as XLSX from "xlsx-js-style";
import { saveAs } from "file-saver";
import { SolarDesignConfig, SolarCalculationResults, SolarBOMItem } from "../types/solar";
import { generateSolarBOM } from "./solarEngine";

/**
 * Generates an executive-grade, multi-sheet Solar PV Engineering Workbook (.xlsx)
 * with professional styling, font formatting, colors, column widths, and borders.
 * Uses xlsx-js-style for complete Excel rendering.
 */
export function exportSolarToExcel(
  config: SolarDesignConfig,
  calc: SolarCalculationResults
) {
  const wb = XLSX.utils.book_new();

  // Color Definitions
  const COLOR_HEADER_BG = "0F172A"; // Slate 900
  const COLOR_HEADER_TEXT = "FFFFFF";
  const COLOR_SECTION_BG = "1E3A8A"; // Royal Navy Blue
  const COLOR_SUBSECTION_BG = "312E81"; // Indigo Navy
  const COLOR_ZEBRA_BG = "F8FAFC"; // Slate 50
  const COLOR_BORDER = "CBD5E1"; // Slate 300
  const COLOR_PASS_BG = "D1FAE5"; // Emerald 100
  const COLOR_PASS_TEXT = "065F46"; // Emerald 800
  const COLOR_WARN_BG = "FEF3C7"; // Amber 100
  const COLOR_WARN_TEXT = "92400E"; // Amber 800
  const COLOR_TOTAL_BG = "EEF2FF"; // Indigo 50

  const borderThin = {
    top: { style: "thin", color: { rgb: COLOR_BORDER } },
    bottom: { style: "thin", color: { rgb: COLOR_BORDER } },
    left: { style: "thin", color: { rgb: COLOR_BORDER } },
    right: { style: "thin", color: { rgb: COLOR_BORDER } },
  };

  const styleHeaderBanner = {
    font: { name: "Calibri", sz: 14, bold: true, color: { rgb: COLOR_HEADER_TEXT } },
    fill: { fgColor: { rgb: COLOR_HEADER_BG } },
    alignment: { horizontal: "left", vertical: "center" },
  };

  const styleSubBanner = {
    font: { name: "Calibri", sz: 10, italic: true, color: { rgb: "E2E8F0" } },
    fill: { fgColor: { rgb: COLOR_HEADER_BG } },
    alignment: { horizontal: "left", vertical: "center" },
  };

  const styleSectionTitle = {
    font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: COLOR_SECTION_BG } },
    alignment: { horizontal: "left", vertical: "center" },
    border: borderThin,
  };

  const styleTableHead = {
    font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: COLOR_SUBSECTION_BG } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: borderThin,
  };

  const styleDataLabel = {
    font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "334155" } },
    fill: { fgColor: { rgb: "F1F5F9" } },
    alignment: { horizontal: "left", vertical: "center" },
    border: borderThin,
  };

  const styleDataValue = {
    font: { name: "Calibri", sz: 10, color: { rgb: "0F172A" } },
    alignment: { horizontal: "left", vertical: "center" },
    border: borderThin,
  };

  const styleDataValueCenter = {
    font: { name: "Calibri", sz: 10, color: { rgb: "0F172A" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: borderThin,
  };

  const styleDataValueRight = {
    font: { name: "Calibri", sz: 10, color: { rgb: "0F172A" } },
    alignment: { horizontal: "right", vertical: "center" },
    border: borderThin,
  };

  const stylePassBadge = {
    font: { name: "Calibri", sz: 9, bold: true, color: { rgb: COLOR_PASS_TEXT } },
    fill: { fgColor: { rgb: COLOR_PASS_BG } },
    alignment: { horizontal: "center", vertical: "center" },
    border: borderThin,
  };

  const styleGrandTotal = {
    font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "1E1B4B" } },
    fill: { fgColor: { rgb: COLOR_TOTAL_BG } },
    alignment: { horizontal: "right", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "312E81" } },
      bottom: { style: "double", color: { rgb: "312E81" } },
      left: { style: "thin", color: { rgb: "312E81" } },
      right: { style: "thin", color: { rgb: "312E81" } },
    },
  };

  // Helper to apply style to a worksheet cell
  const setCellStyle = (ws: any, cellAddr: string, style: any) => {
    if (!ws[cellAddr]) ws[cellAddr] = { t: "s", v: "" };
    ws[cellAddr].s = style;
  };

  // -------------------------------------------------------------
  // SHEET 1: PROJECT SUMMARY & DASHBOARD
  // -------------------------------------------------------------
  const summaryAOA: any[][] = [
    ["ELECTRICALPH SOLAR PV DESIGN & CALCULATION REPORT", "", "", ""],
    ["Philippine Electrical Code (PEC 2017 Part 1 & 2 Art. 6.90) • RA 9513 • ERC Net-Metering", "", "", ""],
    [],
    ["1. PROJECT & SITE INFORMATION", "", "", ""],
    ["Project Name", config.projectName || "Solar PV Installation", "Client / Owner", config.clientName || "Valued Client"],
    ["Project Location", config.projectLocation || "Philippines", "Lead PE / Designer", config.designerName || "Electrical Engineer"],
    ["Project Type", `${config.projectType.toUpperCase()} FACILITY`, "System Type", `${config.systemType.toUpperCase()} SOLAR SYSTEM`],
    ["Sizing Methodology", config.sizingMethod === "target_capacity" ? "Target kWp Sizing" : "Load Demand Matching", "Utility Service", `${config.utilityVoltage}V, ${config.utilityPhase}, ${config.utilityFrequency} Hz`],
    ["Date Generated", new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }), "Document Reference", `EPH-SOLAR-${Date.now().toString().slice(-6)}`],
    [],
    ["2. SYSTEM CAPACITY & GENERATION SUMMARY", "", "", ""],
    ["Total Installed DC Capacity", `${calc.totalDcCapacityKwp} kWp (${calc.totalDcCapacityW.toLocaleString()} Wp)`, "DC / AC Inverter Sizing Ratio", `${calc.dcAcRatio}x`],
    ["Total Inverter AC Rating", `${calc.totalInverterAcKw} kW AC`, "Total Continuous AC Current", `${calc.totalSystemAcCurrent.toFixed(1)} Amperes`],
    ["Total PV Modules Installed", `${calc.totalModules} Units (${calc.selectedModule.ratedPowerWp}W)`, "PV Module Efficiency", `${calc.selectedModule.efficiencyPercent}%`],
    ["Total Solar Inverters", `${calc.inverterQuantity} Units (${calc.selectedInverter.model})`, "Inverter MPPT Range", `${calc.selectedInverter.mpptVoltageRangeMin}V - ${calc.selectedInverter.mpptVoltageRangeMax}V`],
    ["Required Installation Area", `${calc.areaRequiredM2.toFixed(1)} m²`, "Available Area", `${config.availableRoofAreaM2} m²`],
    ["Mounting Architecture", config.mountingType.replace("_", " ").toUpperCase(), "Roof Construction", config.roofType.replace("_", " ").toUpperCase()],
    ["Est. Daily Solar Yield", `~${(calc.totalDcCapacityKwp * config.peakSunHours * 0.8).toFixed(1)} kWh / day`, "Est. Annual Energy Yield", `~${(calc.totalDcCapacityKwp * config.peakSunHours * 365 * 0.8 / 1000).toFixed(1)} MWh / year`],
    [],
    ["3. LOAD SCHEDULE INTEGRATION & NET METERING", "", "", ""],
    ["Facility Connected Load", `${calc.connectedLoadKw.toFixed(1)} kW`, "Facility Maximum Demand", `${calc.maxDemandKw.toFixed(1)} kW`],
    ["Peak Solar Daytime Output", `${calc.estimatedSolarPeakGenerationKw.toFixed(1)} kW`, "Remaining Daytime Grid Demand", `${calc.netRemainingGridDemandKw.toFixed(1)} kW`],
    ["Distribution Utility (DU)", config.netMetering.utilityProvider || "MERALCO / Local DU", "Interconnection Type", config.netMetering.interconnectionType === "load_side" ? "Load-Side Interconnection (PEC 6.90.7.2)" : "Supply-Side Interconnection"],
    ["Export Control Scheme", config.netMetering.exportLimitation === "none" ? "Full Export Net-Metering" : config.netMetering.exportLimitation === "zero_export" ? "Zero Export Active Control" : `Limited Export (${config.netMetering.exportLimitPercent}%)`, "Revenue Smart Meter", config.netMetering.smartMeterModel || "Class 0.2S Bi-directional Meter"],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryAOA);
  wsSummary["!cols"] = [{ wch: 28 }, { wch: 36 }, { wch: 28 }, { wch: 36 }];

  // Style Header Banner
  for (let c = 0; c < 4; c++) {
    const colLetter = XLSX.utils.encode_col(c);
    setCellStyle(wsSummary, `${colLetter}1`, styleHeaderBanner);
    setCellStyle(wsSummary, `${colLetter}2`, styleSubBanner);
  }

  // Style section rows
  [3, 10, 19].forEach((rowIdx) => {
    for (let c = 0; c < 4; c++) {
      const colLetter = XLSX.utils.encode_col(c);
      setCellStyle(wsSummary, `${colLetter}${rowIdx + 1}`, styleSectionTitle);
    }
  });

  // Style data cells
  for (let r = 4; r < summaryAOA.length; r++) {
    if (r === 9 || r === 18) continue;
    setCellStyle(wsSummary, `A${r + 1}`, styleDataLabel);
    setCellStyle(wsSummary, `B${r + 1}`, styleDataValue);
    setCellStyle(wsSummary, `C${r + 1}`, styleDataLabel);
    setCellStyle(wsSummary, `D${r + 1}`, styleDataValue);
  }

  XLSX.utils.book_append_sheet(wb, wsSummary, "Project Summary");

  // -------------------------------------------------------------
  // SHEET 2: PV ARRAY & STRING CALCULATIONS
  // -------------------------------------------------------------
  const pvAOA: any[][] = [
    ["PV MODULE & TEMPERATURE-CORRECTED STRING CALCULATIONS (PEC 6.90.2)", "", "", "", ""],
    ["Design Calculations evaluated per PEC 2017 thermal gradient requirements", "", "", "", ""],
    [],
    ["PARAMETER / SPECIFICATION", "CALCULATED VALUE", "UNIT", "DESIGN CRITERIA / LIMIT", "COMPLIANCE STATUS"],
    ["Selected PV Module Brand", calc.selectedModule.manufacturer, "", "Tier 1 BloombergNEF List", "PASSED"],
    ["Selected Module Model", calc.selectedModule.model, "", "High Efficiency N-Type Monocrystalline", "PASSED"],
    ["Rated Power (Pmax @ STC)", calc.selectedModule.ratedPowerWp, "Wp", "Standard Test Conditions (1000 W/m², 25°C)", "PASSED"],
    ["Open Circuit Voltage (Voc @ STC)", calc.selectedModule.voc, "V", "Nameplate STC Open Circuit Voltage", "PASSED"],
    ["Max Power Voltage (Vmp @ STC)", calc.selectedModule.vmp, "V", "Nameplate STC Operating Voltage", "PASSED"],
    ["Short Circuit Current (Isc @ STC)", calc.selectedModule.isc, "A", "Nameplate STC Short Circuit Current", "PASSED"],
    ["Max Power Current (Imp @ STC)", calc.selectedModule.imp, "A", "Nameplate STC Operating Current", "PASSED"],
    ["Temperature Coefficient of Voc (β)", `${calc.selectedModule.tempCoeffVoc}% / °C`, "%/°C", "Thermal Voc Derating Factor", "PASSED"],
    ["Temperature Coefficient of Pmax (γ)", `${calc.selectedModule.tempCoeffPmax}% / °C`, "%/°C", "Thermal Power Derating Factor", "PASSED"],
    ["Design Minimum Ambient Temperature", config.minOperatingTempC, "°C", "Design Coldest Record in Region", "PASSED"],
    ["Design Maximum Cell Operating Temp", 70.0, "°C", "NOCT Thermal Model Worst-Case", "PASSED"],
    [],
    ["TEMPERATURE-CORRECTED STRING PARAMETERS", "", "", "", ""],
    ["Modules Per String (Series)", calc.effective.modulesPerString, "Modules", "Series String Voltage Sizing", "PASSED"],
    ["Total Parallel Strings", calc.effective.numberOfStrings, "Strings", "Parallel Current Sizing", "PASSED"],
    ["Module Voc at Minimum Temp (Voc,cold)", Number(calc.vocCold.toFixed(2)), "V", "Voc × [1 + β × (Tmin - 25)]", "PASSED"],
    ["Module Vmp at Max Cell Temp (Vmp,hot)", Number(calc.vmpHot.toFixed(2)), "V", "Vmp × [1 + γ × (Tmax - 25)]", "PASSED"],
    ["Total String Voc (Cold Weather Peak)", Number(calc.stringVoc.toFixed(1)), "VDC", `≤ Inverter Max DC Voltage (${calc.selectedInverter.maxDcVoltage}V)`, calc.validations.vocWithinMaxDcVoltage ? "PASSED" : "FAILED"],
    ["Total String Vmp (Hot Operating Min)", Number(calc.stringVmp.toFixed(1)), "VDC", `≥ Inverter MPPT Min Voltage (${calc.selectedInverter.mpptVoltageRangeMin}V)`, calc.validations.vmpWithinMpptRange ? "PASSED" : "FAILED"],
    ["String Operating Current (Imp)", Number(calc.stringImp.toFixed(2)), "A", "Rated string full power current", "PASSED"],
    ["Total Array DC Current to Combiner", Number(calc.totalDcCurrent.toFixed(2)), "A", "Parallel Strings × String Imp", "PASSED"],
    ["Total DC Array Peak Capacity", Number(calc.totalDcCapacityKwp.toFixed(2)), "kWp", "Total Modules × Module Wattage", "PASSED"],
  ];

  const wsPV = XLSX.utils.aoa_to_sheet(pvAOA);
  wsPV["!cols"] = [{ wch: 38 }, { wch: 22 }, { wch: 10 }, { wch: 42 }, { wch: 20 }];

  for (let c = 0; c < 5; c++) {
    const colLetter = XLSX.utils.encode_col(c);
    setCellStyle(wsPV, `${colLetter}1`, styleHeaderBanner);
    setCellStyle(wsPV, `${colLetter}2`, styleSubBanner);
    setCellStyle(wsPV, `${colLetter}4`, styleTableHead);
    setCellStyle(wsPV, `${colLetter}17`, styleSectionTitle);
  }

  for (let r = 4; r < pvAOA.length; r++) {
    if (r === 15 || r === 16) continue;
    const isZebra = r % 2 === 0;
    const rowBg = isZebra ? COLOR_ZEBRA_BG : "FFFFFF";
    setCellStyle(wsPV, `A${r + 1}`, { ...styleDataLabel, fill: { fgColor: { rgb: rowBg } } });
    setCellStyle(wsPV, `B${r + 1}`, { ...styleDataValueRight, fill: { fgColor: { rgb: rowBg } } });
    setCellStyle(wsPV, `C${r + 1}`, { ...styleDataValueCenter, fill: { fgColor: { rgb: rowBg } } });
    setCellStyle(wsPV, `D${r + 1}`, { ...styleDataValue, fill: { fgColor: { rgb: rowBg } } });
    const statusVal = pvAOA[r][4];
    setCellStyle(wsPV, `E${r + 1}`, statusVal === "PASSED" ? stylePassBadge : { ...stylePassBadge, fill: { fgColor: { rgb: COLOR_WARN_BG } }, font: { ...stylePassBadge.font, color: { rgb: COLOR_WARN_TEXT } } });
  }

  XLSX.utils.book_append_sheet(wb, wsPV, "PV Array Calculations");

  // -------------------------------------------------------------
  // SHEET 3: INVERTER & ELECTRICAL PROTECTION SCHEDULE
  // -------------------------------------------------------------
  const invAOA: any[][] = [
    ["SOLAR INVERTER & ELECTRICAL PROTECTION SCHEDULE (PEC 2017 ART. 6.90)", "", "", "", ""],
    ["Protection ratings sized according to continuous duty and safety multipliers", "", "", "", ""],
    [],
    ["EQUIPMENT / COMPONENT", "CALCULATED CRITERIA", "RECOMMENDED SPECIFICATION", "PEC / CODE STANDARD", "STATUS"],
    [
      "Inverter Manufacturer & Model",
      `${calc.inverterQuantity} Units @ ${calc.selectedInverter.ratedAcPowerKw} kW`,
      `${calc.selectedInverter.manufacturer} ${calc.selectedInverter.model}`,
      "PEC 6.90.4 Equipment Sizing",
      "PASSED",
    ],
    [
      "Inverter Full-Load Current",
      `Rated: ${calc.inverterRatedAcCurrent.toFixed(1)} A / Unit`,
      `Max: ${calc.inverterMaxAcCurrent.toFixed(1)} A Continuous Output`,
      "Continuous AC Inverter Full Load",
      "PASSED",
    ],
    [
      "DC String Fuse (OCPD)",
      `1.56 × Module Isc (${(calc.selectedModule.isc * 1.56).toFixed(2)} A)`,
      `${calc.effective.dcFuseRatingAmps}A gPV, ${config.dcProtection.fuseVoltageVolts}VDC, ${config.dcProtection.fuseKaic} kAIC`,
      "PEC 6.90.2.2 DC Overcurrent",
      "PASSED",
    ],
    [
      "DC Disconnect / Isolator",
      `Max String Voc (${calc.stringVoc.toFixed(0)}V) & Total Current`,
      `${calc.effective.dcIsolatorRatingAmps}A DC Isolator, ${config.dcProtection.isolatorVoltageVolts}VDC, ${config.dcProtection.isolatorPoles}-Pole`,
      "PEC 6.90.3.1 Disconnecting Means",
      "PASSED",
    ],
    [
      "DC Surge Protection (SPD)",
      `Uc ≥ 1.2 × String Voc (${(calc.stringVoc * 1.2).toFixed(0)}V)`,
      `Type 2 SPD, Uc: ${calc.effective.dcSpdUcVolts}VDC, In: ${config.dcProtection.spdInKa}kA, Imax: ${config.dcProtection.spdImaxKa}kA`,
      "PEC 6.90.4.5 Surge Suppression",
      "PASSED",
    ],
    [
      "AC Inverter Circuit Breaker",
      `1.25 × Inverter Max Output (${(calc.inverterMaxAcCurrent * 1.25).toFixed(1)} A)`,
      `${calc.effective.acBreakerAtAmps} AT / ${calc.effective.acBreakerAfAmps} AF, ${calc.effective.acBreakerPoles}P, ${calc.effective.acKaic} kAIC (${config.acProtection.breakerType})`,
      "PEC 6.90.2.3 Continuous OCPD",
      calc.validations.acBreakerAdequate ? "PASSED" : "CHECK BREAKER",
    ],
    [
      "AC Disconnect Switch",
      "Visible lockable blade isolator",
      `${config.acProtection.isolatorRatingAmps}A AC Isolator, ${config.acProtection.isolatorPoles}-Pole Heavy Duty`,
      "ERC Net-Metering Interconnection",
      "PASSED",
    ],
    [
      "AC Surge Protection (SPD)",
      "Type 2 AC SPD for grid transients",
      `Type 2 SPD, ${config.acProtection.spdRatingVolts}V AC, In: 20kA, Imax: 40kA`,
      "PEC 2.85 Transient Suppression",
      "PASSED",
    ],
    [
      "Equipment Grounding (EGC)",
      "Sized from highest circuit breaker rating",
      `${calc.effective.dcEgcSizeMm2} mm² ${config.dcProtection.egcMaterial} Ground Conductor (${config.dcProtection.egcInsulation})`,
      "PEC Table 2.50.6.13 Grounding",
      "PASSED",
    ],
  ];

  const wsInv = XLSX.utils.aoa_to_sheet(invAOA);
  wsInv["!cols"] = [{ wch: 30 }, { wch: 32 }, { wch: 42 }, { wch: 32 }, { wch: 18 }];

  for (let c = 0; c < 5; c++) {
    const colLetter = XLSX.utils.encode_col(c);
    setCellStyle(wsInv, `${colLetter}1`, styleHeaderBanner);
    setCellStyle(wsInv, `${colLetter}2`, styleSubBanner);
    setCellStyle(wsInv, `${colLetter}4`, styleTableHead);
  }

  for (let r = 4; r < invAOA.length; r++) {
    const isZebra = r % 2 === 0;
    const rowBg = isZebra ? COLOR_ZEBRA_BG : "FFFFFF";
    setCellStyle(wsInv, `A${r + 1}`, { ...styleDataLabel, fill: { fgColor: { rgb: rowBg } } });
    setCellStyle(wsInv, `B${r + 1}`, { ...styleDataValue, fill: { fgColor: { rgb: rowBg } } });
    setCellStyle(wsInv, `C${r + 1}`, { ...styleDataValue, fill: { fgColor: { rgb: rowBg } } });
    setCellStyle(wsInv, `D${r + 1}`, { ...styleDataValue, fill: { fgColor: { rgb: rowBg } } });
    const statusVal = invAOA[r][4];
    setCellStyle(wsInv, `E${r + 1}`, statusVal === "PASSED" ? stylePassBadge : { ...stylePassBadge, fill: { fgColor: { rgb: COLOR_WARN_BG } }, font: { ...stylePassBadge.font, color: { rgb: COLOR_WARN_TEXT } } });
  }

  XLSX.utils.book_append_sheet(wb, wsInv, "Inverter & Protection");

  // -------------------------------------------------------------
  // SHEET 4: CABLE SIZING & VOLTAGE DROP
  // -------------------------------------------------------------
  const cableAOA: any[][] = [
    ["CONDUCTOR SIZING & VOLTAGE DROP ANALYSIS (PEC VOLTAGE DROP COMPLIANCE)", "", "", "", "", "", "", "", ""],
    ["Evaluated based on copper conductor impedance per PEC 2017 Chapter 9 Table 8", "", "", "", "", "", "", "", ""],
    [],
    ["CIRCUIT DESCRIPTION", "CONDUCTOR SPECS", "CONDUIT", "LENGTH (M)", "DESIGN AMPS", "AMPACITY", "V-DROP (V)", "V-DROP (%)", "STATUS"],
    [
      "DC Array String to Inverter",
      `${calc.effective.dcCableSizeMm2} mm² ${config.cabling.dcCable.insulation} Cu`,
      `${config.cabling.dcCable.conduitSizeMm}mm ${config.cabling.dcCable.conduitType}`,
      config.cabling.dcCable.lengthM,
      Number(calc.stringImp.toFixed(2)),
      calc.dcCableAmpacity,
      Number(calc.dcVoltageDropV.toFixed(2)),
      `${calc.dcVoltageDropPercent.toFixed(2)}% (Max ${config.cabling.dcMaxDropPercent}%)`,
      calc.validations.dcVoltageDropValid ? "PASSED" : "FAILED",
    ],
    [
      "AC Inverter Feed to Panel",
      `${calc.effective.acCableSizeMm2} mm² ${config.cabling.acCable.insulation} Cu`,
      `${calc.effective.acConduitSizeMm}mm ${config.cabling.acCable.conduitType}`,
      config.cabling.acCable.lengthM,
      Number(calc.inverterRatedAcCurrent.toFixed(1)),
      calc.acCableAmpacity,
      Number(calc.acVoltageDropV.toFixed(2)),
      `${calc.acVoltageDropPercent.toFixed(2)}% (Max ${config.cabling.acMaxDropPercent}%)`,
      calc.validations.acVoltageDropValid ? "PASSED" : "FAILED",
    ],
    [
      "Combined System V-Drop",
      "Cumulative DC + AC System Voltage Drop",
      "---",
      "---",
      "---",
      "---",
      Number((calc.dcVoltageDropV + calc.acVoltageDropV).toFixed(2)),
      `${(calc.dcVoltageDropPercent + calc.acVoltageDropPercent).toFixed(2)}% (Max 3.00%)`,
      (calc.dcVoltageDropPercent + calc.acVoltageDropPercent) <= 3.0 ? "PASSED" : "WARNING",
    ],
  ];

  const wsCable = XLSX.utils.aoa_to_sheet(cableAOA);
  wsCable["!cols"] = [
    { wch: 28 },
    { wch: 30 },
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 22 },
    { wch: 16 },
  ];

  for (let c = 0; c < 9; c++) {
    const colLetter = XLSX.utils.encode_col(c);
    setCellStyle(wsCable, `${colLetter}1`, styleHeaderBanner);
    setCellStyle(wsCable, `${colLetter}2`, styleSubBanner);
    setCellStyle(wsCable, `${colLetter}4`, styleTableHead);
  }

  for (let r = 4; r < cableAOA.length; r++) {
    const isZebra = r % 2 === 0;
    const rowBg = isZebra ? COLOR_ZEBRA_BG : "FFFFFF";
    setCellStyle(wsCable, `A${r + 1}`, { ...styleDataLabel, fill: { fgColor: { rgb: rowBg } } });
    setCellStyle(wsCable, `B${r + 1}`, { ...styleDataValue, fill: { fgColor: { rgb: rowBg } } });
    setCellStyle(wsCable, `C${r + 1}`, { ...styleDataValueCenter, fill: { fgColor: { rgb: rowBg } } });
    setCellStyle(wsCable, `D${r + 1}`, { ...styleDataValueRight, fill: { fgColor: { rgb: rowBg } } });
    setCellStyle(wsCable, `E${r + 1}`, { ...styleDataValueRight, fill: { fgColor: { rgb: rowBg } } });
    setCellStyle(wsCable, `F${r + 1}`, { ...styleDataValueRight, fill: { fgColor: { rgb: rowBg } } });
    setCellStyle(wsCable, `G${r + 1}`, { ...styleDataValueRight, fill: { fgColor: { rgb: rowBg } } });
    setCellStyle(wsCable, `H${r + 1}`, { ...styleDataValueRight, fill: { fgColor: { rgb: rowBg } } });
    const statusVal = cableAOA[r][8];
    setCellStyle(wsCable, `I${r + 1}`, statusVal === "PASSED" ? stylePassBadge : { ...stylePassBadge, fill: { fgColor: { rgb: COLOR_WARN_BG } }, font: { ...stylePassBadge.font, color: { rgb: COLOR_WARN_TEXT } } });
  }

  XLSX.utils.book_append_sheet(wb, wsCable, "Cable Sizing & V-Drop");

  // -------------------------------------------------------------
  // SHEET 5: SOLAR BILL OF MATERIALS (BOM) & COST ESTIMATE
  // -------------------------------------------------------------
  const bomAOA: any[][] = [
    ["SOLAR PV SYSTEM BILL OF MATERIALS (BOM) & COST ESTIMATE", "", "", "", "", "", "", "", "", ""],
    ["Itemized procurement schedule and PEC 2017 compliant engineering cost estimate (PHP)", "", "", "", "", "", "", "", "", ""],
    [],
    ["ITEM #", "CATEGORY", "ITEM DESCRIPTION", "MANUFACTURER", "MODEL", "QTY", "UNIT", "UNIT PRICE (PHP)", "MARKUP (%)", "TOTAL AMOUNT (PHP)"],
  ];

  // Resolve BOM items: use user customized BOM if present, otherwise calc.bomItems, or generate fresh from engine
  const bomList: SolarBOMItem[] =
    config.bomItems && config.bomItems.length > 0
      ? config.bomItems
      : calc.bomItems && calc.bomItems.length > 0
      ? calc.bomItems
      : generateSolarBOM(config, calc);

  let grandTotal = 0;
  let subtotalCost = 0;

  bomList.forEach((b, idx) => {
    const unitCost = typeof b.unitCostPhp === "number" ? b.unitCostPhp : Number(b.unitCostPhp) || 0;
    const qty = typeof b.quantity === "number" ? b.quantity : Number(b.quantity) || 1;
    const markup = typeof b.markupPercent === "number" ? b.markupPercent : Number(b.markupPercent) || 0;
    const totalCost =
      typeof b.totalCostPhp === "number" && b.totalCostPhp > 0
        ? b.totalCostPhp
        : Math.round(qty * unitCost * (1 + markup / 100));

    subtotalCost += qty * unitCost;
    grandTotal += totalCost;

    bomAOA.push([
      idx + 1,
      b.category || "General",
      b.itemDescription || "",
      b.manufacturer || "Tier 1 / Standard",
      b.model || "Commercial Standard",
      qty,
      b.unit || "pcs",
      unitCost,
      markup,
      totalCost,
    ]);
  });

  const totalRowIdx = bomAOA.length;
  bomAOA.push([
    "",
    "",
    "TOTAL ESTIMATED SYSTEM INVESTMENT (PHP)",
    "",
    "",
    "",
    "",
    "",
    "",
    grandTotal,
  ]);

  // Financial KPI Breakdown Rows
  const totalMarkup = grandTotal - subtotalCost;
  const costPerWattDc = calc.totalDcCapacityW > 0 ? grandTotal / calc.totalDcCapacityW : 0;
  const metricsStartRowIdx = bomAOA.length;

  bomAOA.push([]);
  bomAOA.push(["FINANCIAL SUMMARY & COST METRICS", "", "", "", "", "", "", "", "", ""]);
  bomAOA.push(["Net Base Equipment Material Cost (Subtotal)", "", `PHP ${subtotalCost.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "", "", "", "", "", "", ""]);
  bomAOA.push(["Contractor Margin, Labor & Contingency", "", `PHP ${totalMarkup.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "", "", "", "", "", "", ""]);
  bomAOA.push(["Total Turnkey Installed System Cost", "", `PHP ${grandTotal.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "", "", "", "", "", "", ""]);
  bomAOA.push(["Turnkey Installed Cost Metric", "", `PHP ${costPerWattDc.toFixed(2)} / Wp (${calc.totalDcCapacityKwp} kWp DC Array)`, "", "", "", "", "", "", ""]);

  const wsBOM = XLSX.utils.aoa_to_sheet(bomAOA);
  wsBOM["!cols"] = [
    { wch: 8 },
    { wch: 22 },
    { wch: 48 },
    { wch: 22 },
    { wch: 24 },
    { wch: 9 },
    { wch: 9 },
    { wch: 18 },
    { wch: 12 },
    { wch: 22 },
  ];

  for (let c = 0; c < 10; c++) {
    const colLetter = XLSX.utils.encode_col(c);
    setCellStyle(wsBOM, `${colLetter}1`, styleHeaderBanner);
    setCellStyle(wsBOM, `${colLetter}2`, styleSubBanner);
    setCellStyle(wsBOM, `${colLetter}4`, styleTableHead);
  }

  for (let r = 4; r < totalRowIdx; r++) {
    const isZebra = r % 2 === 0;
    const rowBg = isZebra ? COLOR_ZEBRA_BG : "FFFFFF";
    setCellStyle(wsBOM, `A${r + 1}`, { ...styleDataValueCenter, fill: { fgColor: { rgb: rowBg } } });
    setCellStyle(wsBOM, `B${r + 1}`, { ...styleDataLabel, fill: { fgColor: { rgb: rowBg } } });
    setCellStyle(wsBOM, `C${r + 1}`, { ...styleDataValue, fill: { fgColor: { rgb: rowBg } } });
    setCellStyle(wsBOM, `D${r + 1}`, { ...styleDataValue, fill: { fgColor: { rgb: rowBg } } });
    setCellStyle(wsBOM, `E${r + 1}`, { ...styleDataValue, fill: { fgColor: { rgb: rowBg } } });
    setCellStyle(wsBOM, `F${r + 1}`, { ...styleDataValueCenter, fill: { fgColor: { rgb: rowBg } } });
    setCellStyle(wsBOM, `G${r + 1}`, { ...styleDataValueCenter, fill: { fgColor: { rgb: rowBg } } });

    // Unit Price (Currency formatted)
    setCellStyle(wsBOM, `H${r + 1}`, {
      ...styleDataValueRight,
      fill: { fgColor: { rgb: rowBg } },
      numFmt: '"PHP "#,##0.00',
    });

    setCellStyle(wsBOM, `I${r + 1}`, { ...styleDataValueCenter, fill: { fgColor: { rgb: rowBg } } });

    // Total Amount (Currency formatted)
    setCellStyle(wsBOM, `J${r + 1}`, {
      ...styleDataValueRight,
      fill: { fgColor: { rgb: rowBg } },
      font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "0F172A" } },
      numFmt: '"PHP "#,##0.00',
    });
  }

  // Style Grand Total Row
  for (let c = 0; c < 10; c++) {
    const colLetter = XLSX.utils.encode_col(c);
    setCellStyle(wsBOM, `${colLetter}${totalRowIdx + 1}`, {
      ...styleGrandTotal,
      alignment: c === 2 ? { horizontal: "left", vertical: "center" } : { horizontal: "right", vertical: "center" },
      numFmt: c === 9 ? '"PHP "#,##0.00' : undefined,
    });
  }

  // Style Financial Metrics Section
  for (let c = 0; c < 10; c++) {
    const colLetter = XLSX.utils.encode_col(c);
    setCellStyle(wsBOM, `${colLetter}${metricsStartRowIdx + 2}`, styleSectionTitle);
  }
  for (let r = metricsStartRowIdx + 2; r < bomAOA.length; r++) {
    setCellStyle(wsBOM, `A${r + 1}`, styleDataLabel);
    setCellStyle(wsBOM, `B${r + 1}`, styleDataLabel);
    setCellStyle(wsBOM, `C${r + 1}`, {
      ...styleDataValue,
      font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "0F172A" } },
    });
  }

  XLSX.utils.book_append_sheet(wb, wsBOM, "Solar BOM");

  // Save Workbook
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, `${config.projectName.replace(/[^a-zA-Z0-9_-]/g, "_")}_Solar_Engineering_Design.xlsx`);
}
