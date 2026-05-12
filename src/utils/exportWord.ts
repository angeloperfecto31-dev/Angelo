import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, AlignmentType, WidthType, BorderStyle, VerticalAlign, ImageRun } from 'docx';
import { saveAs } from 'file-saver';
import { Circuit, PanelConfig, LoadType } from '../types';
import { WIRE_AMPACITY_TABLE, STANDARD_CB_RATINGS, WIRE_IMPEDANCE_TABLE, RECOMMENDED_LUX_LEVELS } from '../constants';

export const exportToWord = async (
  panel: PanelConfig,
  circuits: Circuit[],
  subPanels: { id: string, panel: PanelConfig, circuits: Circuit[] }[],
  images?: any
) => {
  const docChildren: any[] = [];

  const addImageToDoc = async (dataUrl: string | null) => {
    if (!dataUrl) return;
    try {
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
      const img = new Image();
      await new Promise((resolve, reject) => { 
        img.onload = resolve; 
        img.onerror = reject;
        img.src = dataUrl; 
      });
      
      const ratio = img.height / img.width;
      const docWidth = 600;
      const docHeight = docWidth * ratio;

      docChildren.push(new Paragraph({
        children: [
          new ImageRun({
            data: Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)),
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
      text: "ELECTRICAL DESIGN REPORT",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 2000, after: 1000 },
    }),
    new Paragraph({
      text: "Project: " + (panel.project || "Unnamed Project"),
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
    new Paragraph({
      text: "Panel Designation: " + panel.designation,
      heading: HeadingLevel.HEADING_2,
      alignment: AlignmentType.CENTER,
      spacing: { after: 2000 },
    })
  );

  const createHeader = (text: string) => {
    return new Paragraph({
      text: text,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 800, after: 400 },
    });
  };
  const createSubHeader = (text: string) => {
    return new Paragraph({
      text: text,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400, after: 200 },
    });
  };
  const createParagraph = (text: string, bold = false) => {
    return new Paragraph({
      children: [new TextRun({ text, bold })],
      spacing: { before: 100, after: 100 },
    });
  };

  const is3PH = panel.system.includes('3PH');
  const allPanelsToExport = [{ panel, circuits }, ...subPanels.map(sp => ({ panel: sp.panel, circuits: sp.circuits }))];

  for (const { panel: p, circuits: c } of allPanelsToExport) {
    // === 1. LOAD SCHEDULE ===
    docChildren.push(createHeader(`1. Load Schedule: ${p.designation || 'Panel'}`));

    const totalVA = c.reduce((sum, curr) => sum + curr.loadVA, 0);
    let mainCurrent = 0;
    if (p.system.includes('3PH')) {
      const loads = { R: 0, Y: 0, B: 0 };
      c.forEach(cir => {
        cir.phases.forEach(ph => {
          loads[ph as keyof typeof loads] += cir.loadVA / cir.phases.length;
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

    // Simple table for circuits
    const tableHeaderCells = [
      "Cir No", "Description", "VA", "A", "CB", "Wire"
    ].map(t => new TableCell({ children: [createParagraph(t, true)], shading: { fill: "f3f4f6" } }));

    const tableRows = [new TableRow({ children: tableHeaderCells })];

    c.forEach(cir => {
      tableRows.push(new TableRow({
        children: [
          new TableCell({ children: [createParagraph(cir.circuitNo.toString())] }),
          new TableCell({ children: [createParagraph(cir.description)] }),
          new TableCell({ children: [createParagraph(cir.loadVA.toString())] }),
          new TableCell({ children: [createParagraph(cir.loadA.toFixed(2))] }),
          new TableCell({ children: [createParagraph(`${cir.mcbAT}AT/${cir.mcbAF}AF`)] }),
          new TableCell({ children: [createParagraph(`${cir.wireSize} mm²`)] }),
        ]
      }));
    });

    const table = new Table({
      rows: tableRows,
      width: { size: 100, type: WidthType.PERCENTAGE }
    });
    docChildren.push(table);
    
    if (images?.sld?.[p.designation]) {
       docChildren.push(createSubHeader(`Single Line Diagram - ${p.designation}`));
       await addImageToDoc(images.sld[p.designation]);
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
  const iFullLoad = transformerKVA / (Math.sqrt(3) * (panel.voltage / 1000));
  const iscSecondary = iFullLoad / totalZpu;
  const iscAsym = iscSecondary * 1.25;

  // === 2. SHORT CIRCUIT CALCULATION ===
  docChildren.push(createHeader(`2. Short Circuit Calculation (Main Supply)`));
  docChildren.push(
    createParagraph(`Transformer Rating (assumed): ${transformerKVA} kVA`),
    createParagraph(`Secondary Voltage: ${panel.voltage}V`),
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
  docChildren.push(createHeader(`3. Voltage Drop Calculation (Main Feeder)`));
  
  let mainCurrent = 0;
  if (is3PH) {
    const loads = { R: 0, Y: 0, B: 0 };
    circuits.forEach(cir => {
      cir.phases.forEach(ph => {
        loads[ph as keyof typeof loads] += cir.loadVA / cir.phases.length;
      });
    });
    const maxPhaseVA = Math.max(loads.R, loads.Y, loads.B);
    mainCurrent = (maxPhaseVA * 3) / (panel.voltage * Math.sqrt(3));
  } else {
    mainCurrent = totalMainVA / panel.voltage;
  }
  const factor = is3PH ? Math.sqrt(3) : 2;
  const designAmp = mainCurrent * 1.25;
  const cb = STANDARD_CB_RATINGS.find(r => r >= designAmp) || 100;
  let minSize = 2.0;
  if (cb > 15 && cb <= 20) minSize = 3.5;
  else if (cb > 20 && cb <= 30) minSize = 5.5;
  const requiredAmpacity = Math.max(designAmp, cb);
  const wire = WIRE_AMPACITY_TABLE.find(w => w.ampacity >= requiredAmpacity && w.size >= minSize) || WIRE_AMPACITY_TABLE[WIRE_AMPACITY_TABLE.length - 1];

  const wireSize = wire.size.toString();
  const feederLength = 30; // Assume 30m
  const impedanceData = WIRE_IMPEDANCE_TABLE[wireSize] || { r: 1.0 };
  const rDrop = impedanceData.r;
  const vd = (factor * feederLength * mainCurrent * rDrop) / 1000;
  const vdPercentage = (vd / panel.voltage) * 100;
  const isCompliant = vdPercentage <= 3.0;

  docChildren.push(
    createParagraph(`Selected Wire Size: ${wireSize} mm² THHN/THWN`),
    createParagraph(`Estimated Feeder Length: ${feederLength} m`),
    createParagraph(`Operating Current: ${mainCurrent.toFixed(2)} A`),
    createParagraph(`Wire Resistance Factor K: ${rDrop} ohms per km/mm²`),
    new Paragraph({ spacing: { after: 200 } }),
    createSubHeader(`Formulas & Results:`),
    createParagraph(is3PH ? `Voltage Drop = (√3 × K × I × L) / Area` : `Voltage Drop = (2 × K × I × L) / Area`),
    createParagraph(`Voltage Drop = ${vd.toFixed(2)} V`, true),
    createParagraph(`Voltage Drop Percentage = (VD / Voltage) × 100 = ${vdPercentage.toFixed(2)}%`, true),
    createParagraph(isCompliant ? "Result: Compliant with PEC requirement of ≤ 3%." : "Result: Non-Compliant (Exceeds 3%). Requires larger wire size.", true),
  );
  if (images?.vd) {
    docChildren.push(createSubHeader(`Voltage Drop Analysis Diagram`));
    await addImageToDoc(images.vd);
  }

  // === 4. ILLUMINATION CALCULATION ===
  docChildren.push(createHeader(`4. Illumination Calculation (Lumen Method)`));
  
  const roomArea = 20; // 4x5m standard typical room assumed for example
  const targetLux = RECOMMENDED_LUX_LEVELS['Office / Classroom'];
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

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: docChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Electrical_Design_Report_${panel.project || 'Export'}.docx`);
};
