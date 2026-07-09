import fs from 'fs';
let content = fs.readFileSync('src/utils/computeEngine.ts', 'utf8');

// replace getConduitFillDetails signature
content = content.replace(
  'poles: number,',
  'poles: number | string,'
);

// replace getConduitSizeForWiresLocal signature
content = content.replace(
  'poles: number,',
  'poles: number | string,'
);

const findConduitFillDetailsBody = `
  const activeType = conduitType && CONDUIT_LIBRARY[conduitType] ? conduitType : "PVC";
  const table = CONDUIT_LIBRARY[activeType];
  const finalWireType = wireType || "THHN";
  const activePoles = typeof poles === "string" ? getActivePoles(poles) : poles;

  // Determine conductors in one set
  let numPhases = activePoles === 1 ? 1 : activePoles;
  if (activePoles === 1) {
    numPhases = 1;
  }
  const phaseArea = getConductorArea(wireSize, finalWireType);

  let numNeutrals = typeof poles === "string" ? getNeutralPoles(poles) : 0;
  if (typeof poles === "number" || !poles.toString().includes("+N")) {
    if (activePoles === 1) {
      numNeutrals = 1;
    } else if (activePoles === 2) {
      if (systemName.includes("1PH, 3W") || systemName.includes("3W") || systemName.includes("3-Wire")) {
        numNeutrals = 1;
      }
    } else if (activePoles === 3) {
      if (systemName.includes("4W") || systemName.includes("5W") || systemName.includes("4-Wire") || systemName.includes("5-Wire")) {
        numNeutrals = 1;
      }
    }
  }
`;

content = content.replace(
  /const activeType = conduitType[\s\S]*?if \(poles === 3\) \{[\s\S]*?numNeutrals = 1;\s*\}\s*\}/,
  findConduitFillDetailsBody
);

fs.writeFileSync('src/utils/computeEngine.ts', content, 'utf8');
