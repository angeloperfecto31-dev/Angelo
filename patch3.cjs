const fs = require('fs');
let code = fs.readFileSync('src/utils/exportDxf.ts', 'utf8');

// Find the line: const yBase_MDP = 120 + (maxDepth - 1) * 200;
// We need to insert maxRows calculation before it

const replacement1 = `
  let maxRows = 0;
  [mdpCircuits, ...subPanelsData.map(s => s.circuits)].forEach(circs => {
    const maxCircuitNo = circs.reduce((max, c) => Math.max(max, c.circuitNo), 0);
    const numRows = Math.ceil(Math.max(maxCircuitNo, 2) / 2);
    if (numRows > maxRows) maxRows = numRows;
  });
  const maxPanelHeight = 81 + maxRows * 16;
  const totalHeight = (maxDepth - 1) * 150 + maxPanelHeight; // use 150 vertical gap
  const topY = 297 + totalHeight / 2;
  const yBase_MDP = topY;
`;

code = code.replace(/  const yBase_MDP = 120 \+ \(maxDepth - 1\) \* 200;/, replacement1);

const replacement2 = `    const yBase = topY - (d - 1) * 150;`;
code = code.replace(/    const yBase = 120 \+ \(maxDepth - d\) \* 200;/, replacement2);

fs.writeFileSync('src/utils/exportDxf.ts', code);
