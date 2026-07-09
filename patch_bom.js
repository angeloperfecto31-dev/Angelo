import fs from 'fs';
let content = fs.readFileSync('src/utils/bomRulesEngine.ts', 'utf8');

// The line is: name: \`Circuit Breaker MCB, \${c.mcbAT || 20}AT/\${c.mcbAF || 50}AF, \${c.mcbP || 2}P\`,
// Let's replace c.mcbP || 2}P with \${typeof c.mcbP === "string" && c.mcbP.endsWith("P") ? c.mcbP : (c.mcbP || 2) + "P"}
content = content.replace(/\\\$\\{c\.mcbP \|\| 2\\}P/g, '${typeof c.mcbP === "string" ? c.mcbP : (c.mcbP || 2) + "P"}');

content = content.replace(/const bPoles = c\.mcbP \|\| 2;/g, 'const bPoles = typeof c.mcbP === "string" ? parseInt(c.mcbP) || 2 : c.mcbP || 2;');

fs.writeFileSync('src/utils/bomRulesEngine.ts', content, 'utf8');
