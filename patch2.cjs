const fs = require('fs');
let code = fs.readFileSync('src/utils/exportDxf.ts', 'utf8');

code = code.replace(
  'const rightSpan = (xOffset + layoutAreaW - 60) - (xBase_MDP + 100);', 
  'const rightSpan = (usableRight - 50) - (xBase_MDP + 100);'
);

fs.writeFileSync('src/utils/exportDxf.ts', code);
