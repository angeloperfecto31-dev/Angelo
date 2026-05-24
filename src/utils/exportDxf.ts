import Drawing from 'dxf-writer';

export const exportDiagramToDXF = (panel: any, params: any, calculation: any, motorLoadVA: number) => {
  const d = new Drawing();
  
  d.setUnits('Millimeters');
  
  const SVG_HEIGHT = 720;
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
  addText("I. System Single Line Diagram", 180 - 70, 30, 13, 'TITLES');
  addLine(80, 40, 280, 40, 'TITLES');
  
  addText("II. Sequence Impedance Model", 560 - 70, 30, 13, 'WARNINGS');
  addLine(460, 40, 660, 40, 'WARNINGS');
  
  // ROW 1: UTILITY
  addCircle(180, 90, 22, 'LINES');
  addLine(166, 90, 194, 90, 'LINES'); // simple generator mark
  addText("UTILITY INF. BUS", 180 - 30, 125, 10, 'TITLES');
  
  addLine(210, 90, 510, 90, 'DASHED');
  
  addLine(510, 90, 610, 90, 'LINES');
  addText("Infinite Bus (V = 1.0 pu)", 560 - 50, 75, 10, 'TITLES');
  
  addLine(560, 90, 560, 120, 'LINES');
  addRect(545, 120, 30, 35, 'LINES');
  addText("Zu", 560 - 5, 140, 10, 'VALUES');
  addLine(560, 155, 560, 185, 'LINES');
  
  // PRIMARY TO SECONDARY BUS CONNECTORS
  addLine(180, 112, 180, 190, 'LINES');
  
  // ROW 2: TRANSFORMER
  addCircle(180, 212, 20, 'LINES');
  addCircle(180, 232, 20, 'LINES');
  addText("TX-01 TRANSFORMER", 180 - 45, 270, 10, 'TITLES');
  
  addLine(210, 212, 510, 212, 'DASHED');
  
  addRect(545, 185, 30, 35, 'LINES');
  addText("Zt", 560 - 5, 205, 10, 'VALUES');
  addLine(560, 220, 560, 280, 'LINES');
  
  // SECONDARY BUS WORKWAY
  addLine(180, 252, 180, 300, 'LINES');
  
  // ROW 3: MAIN BREAKER & MDP BUS
  addRect(171, 300, 18, 26, 'LINES');
  addText(panel ? `${panel.mainBreakerAT}A/${panel.mainBreakerAF}AF` : '100A', 200, 317, 10, 'VALUES');
  
  addLine(180, 326, 180, 350, 'LINES');
  
  addLine(80, 350, 280, 350, 'LINES'); // MDP Bus
  addText("MAIN MDP BUS", 285, 347, 10, 'TITLES');
  addText(`${calculation.iscMainBreaker} A (Isc Symmetrical)`, 285, 360, 10, 'WARNINGS');
  
  addLine(285, 350, 510, 350, 'DASHED');
  
  addCircle(560, 280, 5, 'WARNINGS');
  addText("MDP MAIN BUS NODE", 575, 284, 10, 'TITLES');
  addText(`Isc = ${calculation.iscMainBreaker}A`, 575, 296, 10, 'WARNINGS');
  
  // FEEDER CONDUCTOR WORKWAY
  addLine(180, 352, 180, 400, 'LINES');
  
  // ROW 4: FEEDER SEGMENT
  addLine(180, 400, 180, 480, 'VALUES'); // Feeder cable
  addText("FEEDER CABLE", 180 + 10, 445, 10, 'VALUES');
  
  addLine(210, 440, 510, 440, 'DASHED');
  
  addLine(560, 285, 560, 380, 'LINES');
  addRect(545, 380, 30, 35, 'LINES');
  addText("Zcab", 560 - 10, 400, 10, 'VALUES');
  addLine(560, 415, 560, 520, 'LINES');
  
  // FEEDER TO FAULT POINT CONNECTORS
  addLine(180, 480, 180, 520, 'LINES');
  
  // ROW 5: FAULT POINT AND SYSTEM GROUND
  // Starburst roughly represented by a circle here in DXF
  addCircle(180, 540, 25, 'WARNINGS');
  addText("Isc", 180 - 10, 545, 10, 'WARNINGS');
  addText("LINE FAULT POINT B", 180 - 45, 595, 10, 'WARNINGS');
  
  addLine(220, 540, 510, 530, 'DASHED');
  
  addLine(560, 465, 560, 505, 'LINES');
  
  // Grounding symbol
  addLine(530, 505, 590, 505, 'WARNINGS');
  addLine(540, 513, 580, 513, 'WARNINGS');
  addLine(550, 521, 570, 521, 'WARNINGS');
  
  addText("SYSTEM SHORT CIRCUITED NODE", 560 - 80, 540, 10, 'WARNINGS');
  addText(`Total Equiv Sym Isc = ${calculation.totalFaultM} A`, 560 - 80, 555, 10, 'WARNINGS');
  
  // LABELS
  // 1. Grid Supply Detail Box
  addRect(20, 65, 120, 40, 'DASHED');
  addText("Grid Supply", 25, 75, 8, 'TITLES');
  addText(`${params.utilityShortCircuitMVA} MVAsc`, 25, 85, 8, 'VALUES');
  addText(`${(params.primaryVoltage/1000).toFixed(1)} kV Pri`, 25, 95, 8, 'VALUES');
  
  // 2. Utility Impedance Box
  addRect(630, 112, 130, 40, 'DASHED');
  addText("Utility Impedance", 635, 122, 8, 'TITLES');
  addText("Z_utility:", 635, 132, 8, 'TITLES');
  addText(`${calculation.zUtilitypu} pu`, 635, 142, 8, 'VALUES');
  
  // 3. Transformer Spec Box
  addRect(20, 188, 120, 40, 'DASHED');
  addText("TX-01 Spec", 25, 198, 8, 'TITLES');
  addText(`${params.transformerKVA} kVA`, 25, 208, 8, 'VALUES');
  addText(`%Z = ${params.transformerZ}%`, 25, 218, 8, 'VALUES');
  
  // 4. Transformer Impedance Box
  addRect(630, 178, 130, 40, 'DASHED');
  addText("XFMR Impedance", 635, 188, 8, 'TITLES');
  addText(`${calculation.zTranspu} pu`, 635, 208, 8, 'VALUES');
  
  // 5. Conductor Spec Box
  addRect(20, 398, 140, 45, 'DASHED');
  addText("Conductor Spec", 25, 408, 8, 'TITLES');
  addText(`${params.feederRuns} Runs x ${params.feederSize} mm²`, 25, 418, 8, 'VALUES');
  addText(`Length: ${params.feederLength} meters`, 25, 438, 8, 'VALUES');
  
  // 6. Conductor Impedance Box
  addRect(630, 372, 140, 45, 'DASHED');
  addText("Feeder Impedance", 635, 382, 8, 'TITLES');
  addText(`R=${calculation.feederR} X=${calculation.feederX}`, 635, 392, 8, 'VALUES');
  addText(`${calculation.zFeederpu} pu`, 635, 412, 8, 'VALUES');
  
  // 7. Fault Outputs Box
  addRect(20, 505, 140, 55, 'DASHED');
  addText("Fault Outputs", 25, 515, 8, 'TITLES');
  addText(`${calculation.iscSecondary} A`, 25, 535, 8, 'VALUES');
  addText(`Total: ${calculation.totalFaultM} A`, 25, 555, 8, 'WARNINGS');
  
  // 8. Impedance Total Box
  addRect(630, 510, 140, 40, 'DASHED');
  addText("Total Equivalent Z", 635, 520, 8, 'TITLES');
  addText(`${calculation.ztotalpu} pu`, 635, 540, 8, 'VALUES');

  const dxfString = d.toDxfString();
  
  const blob = new Blob([dxfString], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ShortCircuit_Diagram_${panel.designation}.dxf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
