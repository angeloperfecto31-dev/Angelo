import fs from 'fs';
let content = fs.readFileSync('src/utils/computeEngine.ts', 'utf8');

content = content.replace(
  'poles: number,',
  'poles: number | string,'
);

// We need to find how `poles` is used inside `getConduitFillDetails`.
// Probably something like: const numWires = (systemName.includes("3PH") ? poles : poles + 1);
content = content.replace(
  'const numPhaseWires = poles;',
  'const numPhaseWires = typeof poles === "string" ? getTotalPoles(poles) : poles;'
);
// Or maybe let's just see how poles is used:
