import fs from 'fs';
let content = fs.readFileSync('src/components/SingleLineDiagram.tsx', 'utf8');

content = content.replace(
  'const pText = `${c.mcbP}P`;',
  'const pText = typeof c.mcbP === "string" && c.mcbP.endsWith("P") ? c.mcbP : typeof c.mcbP === "string" && c.mcbP.includes("+N") ? c.mcbP : `${c.mcbP}P`;'
);

content = content.replace(
  'const conductors = `${c.mcbP}-#${c.wireSize || \'8.0\'}mm²`;',
  'const conductors = `${getTotalPoles(c.mcbP)}-#${c.wireSize || \'8.0\'}mm²`;'
);

fs.writeFileSync('src/components/SingleLineDiagram.tsx', content, 'utf8');
