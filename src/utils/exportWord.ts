import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, AlignmentType, WidthType, BorderStyle, VerticalAlign, ImageRun } from 'docx';
import { Circuit, PanelConfig, LoadType } from '../types';
import { WIRE_AMPACITY_TABLE, STANDARD_CB_RATINGS, WIRE_IMPEDANCE_TABLE, RECOMMENDED_LUX_LEVELS } from '../constants';

export const exportToWord = async (
  panel: PanelConfig,
  circuits: Circuit[],
  subPanels: { id: string, panel: PanelConfig, circuits: Circuit[] }[],
  vdCalculations: import('../types').VoltageDropCalculation[],
  images?: any
) => {
  const docChildren: any[] = [];

  const addImageToDoc = async (dataUrl: string | null) => {
    if (!dataUrl) return;
    try {
      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
      const img = new Image();
      await new Promise((resolve, reject) => { 
        img.onload = resolve; 
        img.onerror = reject;
        img.src = dataUrl; 
      });
      
      // Calculate aspect ratio to fit within page width and height
      const maxWidth = 600;
      const maxHeight = 850;
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

  // TITLE PAGE
  docChildren.push(
    new Paragraph({
      children: [new TextRun({ text: "ELECTRICAL DESIGN ANALYSIS", font: "Segoe UI", size: 56, color: "1E3A8A", bold: true })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 2000, after: 1000 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "Project: " + (panel.project || "Unnamed Project"), font: "Segoe UI", size: 32, color: "334155", bold: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "Date: " + new Date().toLocaleDateString(), font: "Segoe UI", size: 24, color: "94A3B8", italics: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 2000 },
    })
  );

  const createHeader = (text: string, pageBreakBefore = false) => {
    return new Paragraph({
      children: [new TextRun({ text, font: "Segoe UI", size: 36, color: "1E3A8A", bold: true })],
      spacing: { before: 800, after: 400 },
      pageBreakBefore,
      border: {
        bottom: { color: "CBD5E1", space: 10, style: BorderStyle.SINGLE, size: 12 }
      }
    });
  };
  
  const createSubHeader = (text: string) => {
    return new Paragraph({
      children: [new TextRun({ text, font: "Segoe UI", size: 28, color: "334155", bold: true })],
      spacing: { before: 500, after: 200 },
    });
  };
  
  const createParagraph = (text: string, highlight = false) => {
    return new Paragraph({
      children: [new TextRun({ text, bold: highlight, font: "Segoe UI", size: 22, color: highlight ? "0F766E" : "475569" })],
      spacing: { before: 120, after: 120 },
      shading: highlight ? { fill: "F0FDFA" } : undefined,
    });
  };

  // GENERAL NOTES AND SPECIFICATIONS
  docChildren.push(createHeader(`General Notes and Specifications`, true));
  const generalNotes = [
    "1. All electrical works herein shall be executed in accordance with the latest edition of the Philippine Electrical Code (PEC) 2017 Part 1 (for design, installation, and safety of electrical systems in buildings) and Part 2 (for electrical safety standards, utility/generation connections, and workplace safety guidelines), the rules and regulations of the local enforcing authority, and the requirements of the local power company.",
    "2. Supervision & Professional License (PEC Article 1.3 / RA 7920): The electrical works shall be done under the direct and immediate supervision of a Registered Electrical Engineer (REE) or Registered Master Electrician (RME) as allowed by law, and signed/sealed by a Professional Electrical Engineer (PEE).",
    "3. Quality and Standards (PEC Section 1.10.1.3): All materials to be used shall be brand new, certified by the Bureau of Philippine Standards (BPS) with Product Safety (PS) or Import Commodity Clearance (ICC) marks, and suitable for the environment.",
    `4. System Nominal Voltages (PEC Section 2.20.1.5): Power service to the building shall be ${panel.system || "230V, 1PH, 2W"} or equivalent, sourced from the local utility distribution system conforming to PEC Part 2 standards.`,
    "5. Conductor Insulation (PEC Article 3.10): All wires shall be copper with THHN/THWN-2 thermoplastic high heat-resistant nylon-coated insulation, rated for 600V with a maximum operating temperature of 90°C in dry locations and 75°C in wet locations.",
    "6. Branch Circuit Size Limits (PEC Section 2.10.2.1 / 3.10.1.16): The minimum standard wire size for lighting and general convenience outlets is 3.5 mm² copper (12 AWG) to ensure mechanical strength and limit voltage drop under nominal loads.",
    "7. Conduits and Raceways (PEC Chapter 3): All electrical conduits shall be heavy-wall Polyvinyl Chloride (PVC) Schedule 40 (conforming to PEC Article 3.52) or Rigid Metal Conduit (RMC, Article 3.44) and electrical metallic tubing (EMT, Article 3.58) depending on structural or environmental exposure.",
    "8. Circuit Breaker Interrupting Capacity (PEC Section 1.10.1.9): Standard molded-case circuit breakers (MCCB/MCB) shall be utilized, having a trip rating matching the PEC-allowable branch conductor ampacity, and an interrupting capacity (kAIC) greater than or equal to the calculated maximum symmetrical/asymmetrical fault currents.",
    "9. Equipment Grounding (PEC Article 2.50): All non-current carrying metallic enclosures, frames, and raceways of the electrical distribution system shall be solidly grounded using standard copper equipment grounding conductors (EGC) sized according to PEC Table 2.50.6.13.",
    "10. Standard Device Mounting Heights (PEC Occupational Rules & General Guidelines): Mounting height of wiring devices shall be as follows:",
    "    - Wall Switches: 1.37 meters above the finished floor line (center).",
    "    - General Convenience Outlets: 0.30 meters above the finished floor line.",
    "    - Main and Branch Panelboards: 1.50 meters above the finished floor line (measured to top of cabinet structure)."
  ];

  generalNotes.forEach(note => docChildren.push(createParagraph(note)));

  const is3PH = panel?.system?.includes('3PH');
  const allPanelsToExport = [{ panel, circuits }, ...subPanels.map(sp => ({ panel: sp.panel, circuits: sp.circuits }))];

  for (const { panel: p, circuits: c } of allPanelsToExport) {
    // === 1. LOAD SCHEDULE ===
    docChildren.push(createHeader(`1. Load Schedule: ${p?.designation || 'Panel'}`));

    const totalVA = c.reduce((sum, curr) => sum + curr.loadVA, 0);
    let mainCurrent = 0;
    if (p?.system?.includes('3PH')) {
      const loads = { R: 0, Y: 0, B: 0 };
      c.forEach(cir => {
        (cir.phases || []).forEach(ph => {
          loads[ph as keyof typeof loads] += cir.loadVA / (cir.phases?.length || 1);
        });
      });
      const maxPhaseVA = Math.max(loads.R, loads.Y, loads.B);
      mainCurrent = (maxPhaseVA * 3) / (p.voltage * Math.sqrt(3));
    } else {
      mainCurrent = totalVA / p.voltage;
    }

    const designAmp = mainCurrent * 1.25;
    const cb = STANDARD_CB_RATINGS.find(r => r >= designAmp) || 100;
    let minSize = 2.0;
    if (cb > 15 && cb <= 20) minSize = 3.5;
    else if (cb > 20 && cb <= 30) minSize = 5.5;
    const requiredAmpacity = Math.max(designAmp, cb);
    const wire = WIRE_AMPACITY_TABLE.find(w => w.ampacity >= requiredAmpacity && w.size >= minSize) || WIRE_AMPACITY_TABLE[WIRE_AMPACITY_TABLE.length - 1];

    docChildren.push(
      createParagraph(`System: ${p.system}, ${p.voltage}V`),
      createParagraph(`Total Connected Load: ${totalVA.toFixed(2)} VA (${(totalVA / 1000).toFixed(2)} kVA)`),
      createParagraph(`Main Feeder Design Ampacity: ${designAmp.toFixed(2)} A`),
      createParagraph(`Recommended Main Breaker: ${cb} AF/AT`),
      createParagraph(`Recommended Main Wire Size: ${wire.size} mm² THHN/THWN`),
      new Paragraph({ spacing: { after: 200 } }),
      new Paragraph({
        children: [new TextRun({ text: "PEC 2017 Design References & Sizing Standards Map:", font: "Segoe UI", size: 22, color: "1E3A8A", bold: true })],
        spacing: { before: 200, after: 100 }
      }),
      createParagraph("• PEC Article 2.20 (Branch-Circuit, Feeder, and Service Calculations): Standards for branch-circuit loads (general lighting, receptacles, and heavy appliance loads) to verify safe and reliable power distribution sizing."),
      createParagraph("• PEC Article 2.40 (Overcurrent Protection / Small Conductor Limit): Enforces standard overcurrent limits (Section 2.40.1.4 / Table 2.40.4(D)) limiting overcurrent devices to 15A for 2.0 mm² wire, 20A for 3.5 mm² wire, and 30A for 5.5 mm² wire protect against severe wire thermal distress."),
      createParagraph("• PEC Article 4.40 (Air-Conditioning and Refrigerating Equipment): Dictates exact branch-circuit sizing criteria. Conductor rating must be at least 125% of the hermetic motor-compressor FLC (Section 4.40.4.2). The circuit breaker sizing uses standard maximum rating limit of 175% of FLC (Section 4.40.6.2(A)) or up to 225% as absolute ceiling exception to secure motor starting transients."),
      createParagraph("• PEC Article 4.30 (Motors, Motor Circuits, and Controllers): Governs standard electric motor branch circuits, sizing the conductor ampacity at 125% of motor FLC (Section 4.30.2.2) and protecting against starting transients with inverse-time breakers sized up to 250% of FLC (Table 4.30.4.2)."),
      new Paragraph({ spacing: { after: 400 } })
    );

    // Professional table for circuits
    const tableHeaderCells = [
      "Cir No", "Description", "VA", "A", "CB", "Wire"
    ].map(t => new TableCell({ 
      children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, font: "Segoe UI", size: 20, color: "FFFFFF" })], alignment: AlignmentType.CENTER })], 
      shading: { fill: "1E3A8A" },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 100, bottom: 100, left: 100, right: 100 }
    }));

    const tableRows = [new TableRow({ children: tableHeaderCells, tableHeader: true })];

    c.forEach((cir, idx) => {
      const isEven = idx % 2 === 0;
      const rowShading = isEven ? "F8FAFC" : "FFFFFF";
      const createCell = (text: string, align: typeof AlignmentType.CENTER | typeof AlignmentType.LEFT = AlignmentType.CENTER) => {
         return new TableCell({ 
           children: [new Paragraph({ children: [new TextRun({ text, font: "Segoe UI", size: 20, color: "334155" })], alignment: align })],
           shading: { fill: rowShading },
           verticalAlign: VerticalAlign.CENTER,
           margins: { top: 80, bottom: 80, left: 100, right: 100 }
         });
      };

      tableRows.push(new TableRow({
        children: [
          createCell(cir.circuitNo?.toString() || ""),
          createCell(cir.description || "", AlignmentType.LEFT),
          createCell(cir.loadVA?.toString() || "0"),
          createCell(cir.loadA?.toFixed(2) || "0.00"),
          createCell(`${cir.mcbAT || 0}AT/${cir.mcbAF || 0}AF`),
          createCell(`${cir.wireSize || ''} mm²`),
        ]
      }));
    });

    const table = new Table({
      rows: tableRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        insideHorizontal: { color: "E2E8F0", space: 1, style: BorderStyle.SINGLE, size: 2 },
        insideVertical: { color: "E2E8F0", space: 1, style: BorderStyle.SINGLE, size: 2 },
      }
    });
    docChildren.push(table);
    
    const designationKey = p?.designation || '';
    if (images?.sld?.[designationKey]) {
       docChildren.push(createSubHeader(`Single Line Diagram - ${p?.designation || 'main'}`));
       await addImageToDoc(images.sld[designationKey]);
    }
  }

  // Calculate generic defaults for main panel
  const totalMainVA = circuits.reduce((sum, c) => sum + c.loadVA, 0);
  const totalMainKVA = totalMainVA / 1000;
  
  // Standard transformer ratings
  const standardKVA = [10, 15, 25, 37.5, 50, 75, 100, 167, 250, 333, 500, 750, 1000, 1500, 2000, 2500];
  const transformerKVA = standardKVA.find(k => k >= totalMainKVA) || standardKVA[standardKVA.length - 1];
  const transformerZ = 5;
  const utilityMVA = 500;
  
  const zUtilitypu = transformerKVA / (utilityMVA * 1000);
  const zTranspu = transformerZ / 100;
  const totalZpu = zUtilitypu + zTranspu;
  const pVoltage = panel?.voltage || 230;
  const iFullLoad = transformerKVA / (Math.sqrt(3) * (pVoltage / 1000));
  const iscSecondary = iFullLoad / totalZpu;
  const iscAsym = iscSecondary * 1.25;

  // === 2. SHORT CIRCUIT CALCULATION ===
  docChildren.push(createHeader(`2. Short Circuit Calculation (Main Supply)`));
  docChildren.push(
    createParagraph(`Transformer Rating (assumed): ${transformerKVA} kVA`),
    createParagraph(`Secondary Voltage: ${pVoltage}V`),
    createParagraph(`Transformer Impedance (%Z): ${transformerZ}%`),
    createParagraph(`Utility Short Circuit MVA: ${utilityMVA} MVA`),
    new Paragraph({ spacing: { after: 200 } }),
    createSubHeader(`Formulas & Results:`),
    createParagraph(`Full Load Ampere (FLA) = (kVA × 1000) / (Voltage × √3) = ${iFullLoad.toFixed(2)} A`),
    createParagraph(`Transformer Impedance (pu) = ${transformerZ} / 100 = ${zTranspu.toFixed(4)}`),
    createParagraph(`Utility Impedance (pu) = ${transformerKVA} / (${utilityMVA} × 1000) = ${zUtilitypu.toFixed(4)}`),
    createParagraph(`Total Impedance = ${totalZpu.toFixed(4)}`),
    createParagraph(`Symmetrical Fault Current (Isc) = FLA / Total Impedance = ${iscSecondary.toFixed(2)} A`, true),
    createParagraph(`Asymmetrical Fault Current = Isc × 1.25 = ${iscAsym.toFixed(2)} A`, true),
    new Paragraph({ spacing: { after: 120 } }),
    new Paragraph({
      children: [new TextRun({ text: "PEC 2017 Short Circuit & Protective System Sizing Standards:", font: "Segoe UI", size: 22, color: "1E3A8A", bold: true })],
      spacing: { before: 200, after: 100 }
    }),
    createParagraph("• PEC Section 1.10.1.9 (Interrupting Rating): Requires that all overcurrent protective devices (OCPD) intended to interrupt fault currents have a safety rating (kAIC) sufficient for the nominal design voltage and the maximum possible short circuit current at the line terminals."),
    createParagraph("• PEC Section 2.30.7.1 & Article 2.40 (Overcurrent Protection Coordination): Enforces short-circuit coordination, ensuring localized faults are cleared safely by branch breakers without causing primary system trip cascades."),
    createParagraph("• PEC Part 2 (Electrical Safety in Workplace / Service Integration): Dictates safety standards and clearances for utility-level power connections, protecting personnel during high-energy arc discharge faults."),
  );
  if (images?.isc) {
    docChildren.push(createSubHeader(`Short Circuit Diagram`));
    await addImageToDoc(images.isc);
  }

  // === 3. VOLTAGE DROP ===
  docChildren.push(createHeader(`3. Voltage Drop Calculations`));
  
  docChildren.push(
    createSubHeader(`Formulas:`),
    createParagraph(`1-Phase Voltage Drop = (2 × K × I × L) / Area`),
    createParagraph(`3-Phase Voltage Drop = (√3 × K × I × L) / Area`),
    createParagraph(`Voltage Drop Percentage = (Actual Voltage Drop / Source Voltage) × 100`),
    createParagraph(`* K = 3.56 for Copper (ohms per km/mm²)`),
    new Paragraph({ spacing: { after: 120 } }),
    new Paragraph({
      children: [new TextRun({ text: "PEC 2017 Voltage Drop Standards & Efficiency Limits:", font: "Segoe UI", size: 22, color: "1E3A8A", bold: true })],
      spacing: { before: 200, after: 100 }
    }),
    createParagraph("• PEC Section 2.10.1.19 FPN No. 4 (Branch Circuits): Recommends branch-circuit conductors be sized to limit voltage drop to 3% or less at the farthest electrical outlet, ensuring reliable operating voltage for connected equipment."),
    createParagraph("• PEC Section 2.15.1.2(A)(1) FPN No. 2 (Feeder Circuits): Recommends feeder-circuit conductors be sized to prevent a voltage drop exceeding 3% at the primary distribution node."),
    createParagraph("• Full System Efficiency (PEC Part 1 & Part 2): Sizing both distribution feeders and branch circuits to keep the combined total voltage drop below 5% at the farthest outlet node, maintaining energy efficiency and standard equipment operations."),
    new Paragraph({ spacing: { after: 400 } })
  );

  if (vdCalculations && vdCalculations.length > 0) {
    docChildren.push(createSubHeader(`Calculation Results:`));

    vdCalculations.forEach((calc) => {
      const data = WIRE_IMPEDANCE_TABLE[calc.wireSize] || WIRE_IMPEDANCE_TABLE['3.5'];
      const R = data.r;
      const factor = calc.systemType === '3PH' ? Math.sqrt(3) : 2;
      const cLength = calc.length || 0;
      const cLoad = calc.loadA || 0;
      const cVoltage = calc.voltage || 230;
      const vd = (factor * cLength * cLoad * R) / 1000;
      const vdPercentage = (vd / cVoltage) * 100;
      const isCompliant = vdPercentage <= 3.0;

      docChildren.push(
        new Paragraph({
          children: [new TextRun({ text: `Circuit: ${calc.name || ''}`, font: "Segoe UI", size: 22, color: "0F766E", bold: true })],
          spacing: { before: 120, after: 120 }
        }),
        createParagraph(`Parameters: System: ${calc.systemType || ''}, Length: ${cLength}m, Load: ${cLoad}A, Wire: ${calc.wireSize || ''}mm², Voltage: ${cVoltage}V`),
        createParagraph(`Voltage Drop = ${vd.toFixed(2)} V`),
        createParagraph(`Voltage Drop Percentage = ${vdPercentage.toFixed(2)}%`),
        createParagraph(`Status: ${isCompliant ? "Compliant (≤ 3%)" : "Non-Compliant (> 3%)"}`),
        new Paragraph({ spacing: { after: 200 } })
      );
    });

    docChildren.push(createSubHeader(`Summary Table:`));

    const vdTableHeaderCells = [
      "Circuit / Designation", "Length (m)", "Load (A)", "Wire (mm²)", "System", "VD (V)", "VD (%)", "Status"
    ].map(t => new TableCell({ 
      children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, font: "Segoe UI", size: 18, color: "FFFFFF" })], alignment: AlignmentType.CENTER })], 
      shading: { fill: "1E3A8A" },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 80, bottom: 80, left: 80, right: 80 }
    }));

    const vdTableRows = [new TableRow({ children: vdTableHeaderCells, tableHeader: true })];

    vdCalculations.forEach((calc, idx) => {
      const isEven = idx % 2 === 0;
      const rowShading = isEven ? "F8FAFC" : "FFFFFF";
      const createCell = (text: string, align: typeof AlignmentType.CENTER | typeof AlignmentType.LEFT = AlignmentType.CENTER, highlightColor?: string) => {
         return new TableCell({ 
           children: [new Paragraph({ children: [new TextRun({ text, font: "Segoe UI", size: 18, color: highlightColor || "334155", bold: !!highlightColor })], alignment: align })],
           shading: { fill: rowShading },
           verticalAlign: VerticalAlign.CENTER,
           margins: { top: 60, bottom: 60, left: 80, right: 80 }
         });
      };

      const data = WIRE_IMPEDANCE_TABLE[calc.wireSize] || WIRE_IMPEDANCE_TABLE['3.5'];
      const R = data.r;
      const factor = calc.systemType === '3PH' ? Math.sqrt(3) : 2;
      const cLength = calc.length || 0;
      const cLoad = calc.loadA || 0;
      const cVoltage = calc.voltage || 230;
      const vd = (factor * cLength * cLoad * R) / 1000;
      const vdPercentage = (vd / cVoltage) * 100;
      const isCompliant = vdPercentage <= 3.0;

      vdTableRows.push(new TableRow({
        children: [
          createCell(calc.name || "", AlignmentType.LEFT),
          createCell(cLength.toString()),
          createCell(cLoad.toString()),
          createCell(calc.wireSize || ""),
          createCell(calc.systemType || ""),
          createCell(vd.toFixed(2)),
          createCell(`${vdPercentage.toFixed(2)}%`, AlignmentType.CENTER, isCompliant ? "16A34A" : "DC2626"),
          createCell(isCompliant ? "Compliant" : "Exceeds", AlignmentType.CENTER, isCompliant ? "16A34A" : "DC2626"),
        ]
      }));
    });

    const vdTable = new Table({
      rows: vdTableRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        insideHorizontal: { color: "E2E8F0", space: 1, style: BorderStyle.SINGLE, size: 2 },
        insideVertical: { color: "E2E8F0", space: 1, style: BorderStyle.SINGLE, size: 2 },
      }
    });

    docChildren.push(vdTable);
    docChildren.push(new Paragraph({ spacing: { after: 400 } }));
  } else {
    docChildren.push(createParagraph(`No voltage drop calculations were added to the list.`));
  }

  if (images?.vdDiagrams) {
     for (const calc of vdCalculations) {
        if (images.vdDiagrams[calc.id]) {
           docChildren.push(createSubHeader(`Single Line Diagram: ${calc.name}`));
           await addImageToDoc(images.vdDiagrams[calc.id]);
        }
     }
  }

  // === 4. ILLUMINATION CALCULATION ===
  docChildren.push(createHeader(`4. Illumination Calculation (Lumen Method)`));
  
  const roomArea = 20; // 4x5m standard typical room assumed for example
  const targetLux = RECOMMENDED_LUX_LEVELS['GENERAL OFFICE'] || 300;
  const lumensPerFix = 1800; // standard equivalent LED tube
  const cu = 0.6;
  const mf = 0.8;
  const expectedLumens = (targetLux * roomArea) / (cu * mf);
  const qty = Math.ceil(expectedLumens / lumensPerFix);

  docChildren.push(
    createParagraph(`This section details the lumen method calculation used for general area lighting sizing.`),
    createParagraph(`Typical Space Area: ${roomArea} m²`),
    createParagraph(`Target Illuminance: ${targetLux} Lux`),
    createParagraph(`Lumens per Fixture: ${lumensPerFix}`),
    createParagraph(`Coefficient of Utilization (CU): ${cu}`),
    createParagraph(`Maintenance Factor (MF): ${mf}`),
    new Paragraph({ spacing: { after: 200 } }),
    createSubHeader(`Formulas & Results:`),
    createParagraph(`Total Required Lumens = (Lux × Area) / (CU × MF)`),
    createParagraph(`Total Required Lumens = (${targetLux} × ${roomArea}) / (${cu} × ${mf}) = ${Math.round(expectedLumens)} Lumens`),
    createParagraph(`Quantity of Fixtures Required = Total Required Lumens / Lumens per Fixture`),
    createParagraph(`Quantity = ${Math.round(expectedLumens)} / ${lumensPerFix} = ${qty} Fixtures`, true),
    new Paragraph({ spacing: { after: 120 } }),
    new Paragraph({
      children: [new TextRun({ text: "PEC 2017 & Visual Safety Compliance Standards:", font: "Segoe UI", size: 22, color: "1E3A8A", bold: true })],
      spacing: { before: 200, after: 100 }
    }),
    createParagraph("• PEC Section 2.20.2.3 (General Lighting Loads by Occupancy): Outlines baseline unit power densities (VA per m²) which act as safety requirements for sizing lighting feeder loads during design building phases."),
    createParagraph("• PEC Part 2 & DOLE Rule 1075 (Environmental Safety - Illumination): Recommends average lighting intensities (Lux) for typical work spaces, promoting occupational health and safety standards by protecting laborers against eye strains and industrial accidents."),
  );
  if (images?.illumination) {
    docChildren.push(createSubHeader(`Illumination Calculation Diagram`));
    await addImageToDoc(images.illumination);
  }

  if (images?.floorPlan && Array.isArray(images.floorPlan) && images.floorPlan.length > 0) {
    docChildren.push(createHeader(`5. Electrical Floor Plan`, true));
    for (let i = 0; i < images.floorPlan.length; i++) {
        if (i > 0) {
            docChildren.push(new Paragraph({ spacing: { before: 400, after: 400 } }));
        }
        await addImageToDoc(images.floorPlan[i]);
    }
  }

  const doc = new Document({
    creator: "AI Studio",
    title: "Electrical Design Report",
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
        children: docChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Electrical_Design_Analysis_${panel.project || 'Export'}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
