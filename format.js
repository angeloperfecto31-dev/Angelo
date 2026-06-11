const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, 'src/utils/exportDxf.ts');
let content = fs.readFileSync(p, 'utf-8');
const lines = content.split('\n');

for (let i = 1261; i <= 1570 && i < lines.length; i++) {
  if (lines[i] && lines[i].includes('b.addText(')) {
    // Regex matches the first three arguments of b.addText, then replaces the 4th (font size)
    lines[i] = lines[i].replace(
      /(b\.addText\((?:[^,]+,\s*){3})[0-9.]+(,\s*(?:[0-9]+,\s*)?'[^']+')/,
      "$14.0$2"
    );
  }
}
fs.writeFileSync(p, lines.join('\n'));
