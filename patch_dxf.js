import fs from 'fs';
let content = fs.readFileSync('src/utils/exportDxf.ts', 'utf8');

content = content.replace(/\\\$\\{cir\.mcbP\\}P/g, '${typeof cir.mcbP === "string" ? cir.mcbP : cir.mcbP + "P"}');
content = content.replace(/\\\$\\{cir\.mcbP \|\| 2\\}P/g, '${typeof cir.mcbP === "string" ? cir.mcbP : (cir.mcbP || 2) + "P"}');

fs.writeFileSync('src/utils/exportDxf.ts', content, 'utf8');
