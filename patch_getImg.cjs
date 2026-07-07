const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const targetStr = `          const isSld = id.startsWith("sld-");
          const pRatio = isSld ? 1 : 1.5;`;

const replStr = `          const isSld = id.startsWith("sld-");
          const pRatio = isSld ? 4 : 2; // Increase resolution for Word export (min 300 DPI eq)`;

code = code.replace(targetStr, replStr);
fs.writeFileSync('src/App.tsx', code);
console.log('App.tsx getImg patched');
