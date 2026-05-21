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
    "1. All electrical works herein shall be executed in accordance with the latest edition of the Philippine Electrical Code (PEC) 2017 Part 1 and Part 2, the rules and regulations of the local enforcing authority, and the requirements of the local power company.",
    "2. The electrical works shall be done under the direct and immediate supervision of a duly licensed Professional Electrical Engineer (PEE) or Registered Electrical Engineer (REE).",
    "3. All materials to be used shall be brand new, of the approved type for the location and purpose, and shall bear the PS or ICC mark.",
    `4. Power service to the building shall be ${panel.system || "230V, 1PH, 2W"} or equivalent, sourced from the local utility company.`,
    "5. All wires shall be THHN/THWN-2 copper conductors with thermoplastic insulation, minimum 600V, unless otherwise specified.",
    "6. Minimum size of wire to be used shall be 3.5 mm² copper conductor (12 AWG), except for control leads.",
    "7. All electrical conduits shall be Polyvinyl Chloride (PVC) Schedule 40 or Rigid Steel Conduit (RSC) depending on the area.",
    "8. Circuit breakers shall be of the molded case type, bolt-on, with proper trip rating and interrupting capacity.",
    "9. All non-current carrying metallic parts of electrical equipment, raceways, and enclosures shall be properly grounded in accordance with PEC regulations.",
    "10. Mounting height of wiring devices shall be as follows:",
    "    - Switches: 1.37m from finished floor line.",
    "    - Convenience Outlets: 0.30m from finished floor line.",
    "    - Panelboards: 1.50m (center) from finished floor line."
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
