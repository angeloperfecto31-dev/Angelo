import fs from 'fs';
let content = fs.readFileSync('src/utils/computeEngine.ts', 'utf8');

const regex = /if \(typeof mcbP === 'number'\) \{ mcbP = mcbP \+ "P"; \}/;

const newCode = `if (typeof mcbP === 'number') { mcbP = mcbP + "P"; }
  
  const validPoles = getValidPolesForSystem(panel.system);
  if (!validPoles.includes(mcbP.toString())) {
    mcbP = validPoles[0];
  }`;

content = content.replace(regex, newCode);
fs.writeFileSync('src/utils/computeEngine.ts', content, 'utf8');
