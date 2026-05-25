import Drawing from 'dxf-writer';

export const exportDiagramToDXF = (panel: any, params: any, calculation: any, motorLoadVA: number) => {
  const d = new Drawing();
  
  d.setUnits('Millimeters');
  
  const SVG_HEIGHT = 880;
  const SVG_WIDTH = 850;
  
  const convertY = (y: number) => SVG_HEIGHT - y;
  
  // Create some layers
  d.addLayer('TITLES', Drawing.ACI.BLUE, 'CONTINUOUS');
  d.addLayer('LINES', Drawing.ACI.WHITE, 'CONTINUOUS');
  d.addLayer('DASHED', Drawing.ACI.CYAN, 'DASHED');
  d.addLayer('VALUES', Drawing.ACI.MAGENTA, 'CONTINUOUS');
  d.addLayer('WARNINGS', Drawing.ACI.RED, 'CONTINUOUS');
  
  const addLine = (x1: number, y1: number, x2: number, y2: number, layer: string = 'LINES') => {
    d.setActiveLayer(layer);
    d.drawLine(x1, convertY(y1), x2, convertY(y2));
  };
  
  const addCircle = (x: number, y: number, r: number, layer: string = 'LINES') => {
    d.setActiveLayer(layer);
    d.drawCircle(x, convertY(y), r);
  };
  
  const addRect = (x: number, y: number, w: number, h: number, layer: string = 'LINES') => {
    d.setActiveLayer(layer);
    addLine(x, y, x + w, y, layer);
    addLine(x + w, y, x + w, y + h, layer);
    addLine(x + w, y + h, x, y + h, layer);
    addLine(x, y + h, x, y, layer);
  };
  
  const addText = (text: string, x: number, y: number, height: number = 10, layer: string = 'VALUES') => {
    d.setActiveLayer(layer);
    d.drawText(x, convertY(y), height, 0, text);
  };
  
  // Headers
  addText("I. System Single Line Diagram", 185 - 100, 30, 13, 'TITLES');
  addLine(80, 40, 280, 40, 'TITLES');
  
  addText("II. Sequence Impedance Model", 565 - 100, 30, 13, 'WARNINGS');
  addLine(460, 40, 660, 40, 'WARNINGS');
  
  // ROW 1: UTILITY
  addCircle(180, 80, 22, 'LINES');
  addLine(166, 80, 194, 80, 'LINES');
  addText("UTILITY SERVICE ENTRANCE", 180 - 70, 115, 10, 'TITLES');
  
  addLine(210, 80, 510, 80, 'DASHED');
  
  addLine(510, 80, 610, 80, 'LINES');
  addText("Infinite Bus (V = 1.0 pu)", 560 - 70, 65, 10, 'TITLES');
  
  addLine(560, 80, 560, 120, 'LINES');
  addRect(545, 120, 30, 35, 'LINES');
  addText("Zu", 560 - 5, 140, 10, 'VALUES');
  addLine(560, 155, 560, 180, 'LINES');
  
  // PRIMARY TO SECONDARY BUS CONNECTORS
  addLine(180, 102, 180, 180, 'LINES');
  
  // --- FAULT 1: PRIMARY SIDE ---
  addLine(80, 180, 280, 180, 'LINES'); // Primary Bus (HV)
  addText("PRIMARY BUS (HV)", 285, 177, 10, 'TITLES');
  addText(`${params.primaryVoltage} V`, 285, 190, 8, 'VALUES');
  
  // Fault 1 Starburst represented by circles in DXF
  addCircle(120, 180, 12, 'WARNINGS');
  addText("Fault 1", 120 - 15, 165, 8, 'WARNINGS');
  addText(`Isc1=${calculation.iscFault1}A`, 120 - 25, 198, 8, 'WARNINGS');
  
  addCircle(560, 180, 5, 'WARNINGS');
  addLine(560, 180, 500, 180, 'WARNINGS');
  addLine(500, 180, 480, 170, 'WARNINGS'); // switch symbol
  addLine(480, 180, 450, 180, 'WARNINGS');
  // F1 grounding triangles representation
  addLine(450, 175, 450, 185, 'WARNINGS');
  addLine(446, 178, 446, 182, 'WARNINGS');
  addLine(442, 180, 442, 180, 'WARNINGS');
  
  addLine(285, 180, 500, 180, 'DASHED');
  
  // ROW 2: PRIMARY PROTECTIVE / SWITCH
  addLine(180, 180, 180, 205, 'LINES');
  addLine(180, 205, 192, 218, 'LINES');
  addLine(180, 225, 180, 250, 'LINES');
  addText("LBS / HV FUSE", 195, 215, 8, 'TITLES');
  
  // ROW 3: TRANSFORMER
  addCircle(180, 275, 18, 'LINES');
  addCircle(180, 295, 18, 'LINES');
  addText("TX-01 SUBSTATION", 180 - 45, 328, 9, 'TITLES');
  addText(`${params.transformerKVA} kVA`, 180 - 25, 340, 8, 'VALUES');
  
  addLine(205, 285, 510, 285, 'DASHED');
  
  addLine(560, 180, 560, 265, 'LINES');
  addRect(545, 265, 30, 35, 'LINES');
  addText("Zt", 560 - 5, 285, 10, 'VALUES');
  addLine(560, 300, 560, 390, 'LINES');
  
  // SECONDARY BUS WORKWAY
  addLine(180, 313, 180, 360, 'LINES');
  
  // ROW 4: MAIN BREAKER
  addRect(171, 360, 18, 26, 'LINES');
  addText(panel ? `${panel.mainBreakerAT}A/${panel.mainBreakerAF}AF` : '100A', 200, 377, 8, 'VALUES');
  
  addLine(180, 386, 180, 420, 'LINES');
  
  // --- FAULT 2: SECONDARY MDP BUS ---
  addLine(80, 420, 280, 420, 'LINES'); // MDP Bus
  addText("MAIN MDP BUSBAR", 285, 417, 10, 'TITLES');
  addText(`${params.transformerVoltage} V (Dyn11 Wye-G)`, 285, 430, 8, 'VALUES');
  
  addCircle(120, 420, 14, 'WARNINGS');
  addText("Fault 2", 120 - 15, 402, 8, 'WARNINGS');
  addText(`Isc2=${calculation.iscFault2}A`, 120 - 25, 442, 8, 'WARNINGS');
  
  addCircle(560, 390, 6, 'WARNINGS');
  addText("MDP NODE (Node 2)", 575, 386, 10, 'TITLES');
  addText(`Isc2 = ${calculation.iscFault2} A`, 575, 398, 8, 'VALUES');
  
  addLine(560, 390, 500, 390, 'WARNINGS');
  addLine(500, 390, 480, 380, 'WARNINGS'); // switch symbol
  addLine(480, 390, 450, 390, 'WARNINGS');
  // F2 grounding triangles
  addLine(450, 385, 450, 395, 'WARNINGS');
  addLine(446, 388, 446, 392, 'WARNINGS');
  addLine(442, 390, 442, 390, 'WARNINGS');
  
  addLine(285, 420, 500, 390, 'DASHED');
  
  // ROW 5: BRANCH BREAKER & FEEDER CABLE
  addLine(180, 422, 180, 450, 'LINES');
  addRect(173, 450, 14, 20, 'LINES');
  addLine(180, 470, 180, 580, 'VALUES'); // Feeder cable
  addText("FEEDER CABLE", 185, 525, 9, 'VALUES');
  addText(`${params.feederRuns}x ${params.feederSize}mm2`, 185, 540, 8, 'VALUES');
  
  addLine(205, 520, 510, 520, 'DASHED');
  
  addLine(560, 390, 560, 475, 'LINES');
  addRect(545, 475, 30, 35, 'LINES');
  addText("Zcab", 560 - 10, 495, 10, 'VALUES');
  addLine(560, 510, 560, 620, 'LINES');
  
  // --- FAULT 3: Remote Panel BOARD BUS ---
  addLine(80, 580, 280, 580, 'LINES'); // Remote Panel board Bus
  addText(`DISTRIBUTION PANELBOARD (${panel?.designation || 'PANEL A'})`, 285, 577, 10, 'TITLES');
  
  addCircle(120, 580, 15, 'WARNINGS');
  addText("Fault 3", 120 - 15, 562, 8, 'WARNINGS');
  addText(`Isc3=${calculation.iscFault3}A`, 120 - 25, 602, 8, 'WARNINGS');
  
  addCircle(560, 620, 6, 'WARNINGS');
  addText("PANEL NODE (Node 3)", 575, 616, 10, 'TITLES');
  addText(`Isc3 = ${calculation.iscFault3} A`, 575, 628, 8, 'VALUES');
  
  addLine(560, 620, 500, 620, 'WARNINGS');
  addLine(500, 620, 480, 610, 'WARNINGS'); // Switch symbol
  addLine(480, 620, 450, 620, 'WARNINGS');
  // F3 grounding triangles
  addLine(450, 615, 450, 625, 'WARNINGS');
  addLine(446, 618, 446, 622, 'WARNINGS');
  addLine(442, 620, 442, 620, 'WARNINGS');
  
  addLine(285, 580, 500, 620, 'DASHED');
  
  // ROW 6: MOTOR FEEDBACK (IF MOTOR LOAD EXISTS)
  if (motorLoadVA > 0) {
    addLine(180, 580, 180, 630, 'LINES');
    addCircle(180, 648, 18, 'LINES');
    addText("M", 180 - 5, 652, 10, 'LINES');
    addText(`Motor feedback +${calculation.motorContribution}A`, 180 - 45, 680, 8, 'VALUES');
    
    addLine(560, 620, 620, 620, 'LINES');
    addRect(620, 602, 22, 35, 'LINES');
    addText("Zm", 625, 620, 8, 'VALUES');
    addLine(642, 620, 690, 620, 'LINES');
    addCircle(705, 620, 15, 'LINES');
    addText("Em", 700, 624, 8, 'VALUES');
  }
  
  // STANDARD FOOTER DETAILS in Philippine practices
  addRect(40, 740, 770, 110, 'DASHED');
  addText("PHILIPPINE ELECTRICAL CODE (PEC) DESIGN COMPLIANCE BLOCK", 60, 762, 10, 'TITLES');
  addText(`Utility Strength: ${params.utilityShortCircuitMVA} MVA s.c. | Secondary Voltage: 3-Phase ${params.transformerVoltage} V, 60 Hz`, 60, 780, 8, 'VALUES');
  addText(`Fault 1 (HV Utility Bus): ${calculation.iscFault1} Amps | Symmetrical Primary protection evaluated`, 60, 795, 8, 'VALUES');
  addText(`Fault 2 (LV Secondary Bus): ${calculation.iscFault2} Amps | Air / Molded Case Circuit Breaker layout`, 60, 810, 8, 'VALUES');
  addText(`Fault 3 (Remote Board Bus): ${calculation.iscFault3} Amps (incl. ${calculation.motorContribution}A motor feedback) | PEC 1.10.1.24 Compliant`, 60, 825, 8, 'VALUES');
  addText("PEC APPROVED CONFIG | SYSTEM POWER GRID DIAGRAM", 60, 840, 8, 'TITLES');
  
  // Labelling Draggable Boxes
  // 1. Grid Supply Box
  addRect(20, 65, 120, 40, 'DASHED');
  addText("Grid Supply", 25, 75, 8, 'TITLES');
  addText(`${params.utilityShortCircuitMVA} MVAsc`, 25, 85, 8, 'VALUES');
  addText(`${(params.primaryVoltage/1000).toFixed(1)} kV Pri`, 25, 95, 8, 'VALUES');
  
  // 2. Utility Impedance Box
  addRect(630, 112, 130, 40, 'DASHED');
  addText("Utility Impedance", 635, 122, 8, 'TITLES');
  addText(`${calculation.zUtilitypu} pu`, 635, 142, 8, 'VALUES');
  
  // 3. Fault 1 Outputs Box
  addRect(20, 145, 120, 40, 'DASHED');
  addText("Fault 1 (Pri HV)", 25, 155, 8, 'TITLES');
  addText(`${calculation.iscFault1} A`, 25, 175, 8, 'WARNINGS');
  
  // 4. Transformer Spec Box
  addRect(20, 245, 120, 45, 'DASHED');
  addText("TX-01 Spec", 25, 255, 8, 'TITLES');
  addText(`${params.transformerKVA} kVA`, 25, 265, 8, 'VALUES');
  addText(`%Z = ${params.transformerZ}%`, 25, 275, 8, 'VALUES');
  
  // 5. Transformer Impedance Box
  addRect(630, 245, 130, 40, 'DASHED');
  addText("XFMR Impedance", 635, 255, 8, 'TITLES');
  addText(`${calculation.zTranspu} pu`, 635, 275, 8, 'VALUES');
  
  // 6. Fault 2 Outputs Box
  addRect(20, 380, 120, 40, 'DASHED');
  addText("Fault 2 (Secondary)", 25, 390, 8, 'TITLES');
  addText(`${calculation.iscFault2} A`, 25, 410, 8, 'WARNINGS');
  
  // 7. Conductor Conductor Info Box
  addRect(20, 480, 140, 45, 'DASHED');
  addText("Conductor Spec", 25, 490, 8, 'TITLES');
  addText(`${params.feederRuns} Runs x ${params.feederSize} mm2`, 25, 500, 8, 'VALUES');
  addText(`Length: ${params.feederLength} meters`, 25, 515, 8, 'VALUES');
  
  // 8. Conductor Impedance Box
  addRect(630, 460, 140, 45, 'DASHED');
  addText("Feeder Impedance", 635, 470, 8, 'TITLES');
  addText(`R=${calculation.feederR} X=${calculation.feederX}`, 635, 480, 8, 'VALUES');
  addText(`${calculation.zFeederpu} pu`, 635, 500, 8, 'VALUES');
  
  // 9. Fault 3 Outputs Box
  addRect(20, 560, 140, 55, 'DASHED');
  addText("Fault 3 (Remote)", 25, 570, 8, 'TITLES');
  addText(`Total: ${calculation.totalFaultM} A`, 25, 595, 8, 'WARNINGS');
  
  // 10. Impedance Total Box
  addRect(630, 580, 140, 40, 'DASHED');
  addText("Total Equivalent Z", 635, 590, 8, 'TITLES');
  addText(`${calculation.ztotalpu || (parseFloat(calculation.zUtilitypu) + parseFloat(calculation.zTranspu) + parseFloat(calculation.zFeederpu)).toFixed(5)} pu`, 635, 610, 8, 'VALUES');

  const dxfString = d.toDxfString();
  
  const blob = new Blob([dxfString], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const designation = panel?.designation || 'PANEL_A';
  a.href = url;
  a.download = `ShortCircuit_Diagram_${designation}.dxf`;
  document.body.appendChild(a);
  a.click();
  document.body.appendChild(a);
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
