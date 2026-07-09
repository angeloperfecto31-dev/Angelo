import fs from 'fs';
let content = fs.readFileSync('src/components/SingleLineDiagram.tsx', 'utf8');

content = content.replace(/import \{([^}]+)\} from "\.\.\/utils\/computeEngine";/g, 'import {$1, getActivePoles} from "../utils/computeEngine";');
content = content.replace(/c\.mcbP === 3/g, 'getActivePoles(c.mcbP) === 3');
content = content.replace(/c\.mcbP === 2/g, 'getActivePoles(c.mcbP) === 2');
content = content.replace(/c\.mcbP === 1/g, 'getActivePoles(c.mcbP) === 1');
content = content.replace(/const pText = \\\`\\\$\\{c\.mcbP\\}P\\\`;/g, 'const pText = typeof c.mcbP === "string" ? c.mcbP : `${c.mcbP}P`;');
content = content.replace(/const conductors = \\\`\\\$\\{c\.mcbP\\}-\\#\\\$\\{c\.wireSize \|\| '8\.0'\\}mm²\\\`;/g, 'const conductors = `${getActivePoles(c.mcbP)}-#${c.wireSize || "8.0"}mm²`;');
content = content.replace(/const groundStr = c\.groundSize \? \\\`1-\\#\\\$\\{c\.groundSize\\}mm²\\\` : \\\`\\\`;/g, 'const groundStr = c.groundSize ? `1-#${c.groundSize}mm²` : ``;');

fs.writeFileSync('src/components/SingleLineDiagram.tsx', content, 'utf8');
