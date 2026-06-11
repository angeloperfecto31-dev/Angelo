import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const p = path.join(__dirname, 'src/utils/exportDxf.ts');
let content = fs.readFileSync(p, 'utf-8');
const lines = content.split('\n');

for (let i = 1261; i <= 1570 && i < lines.length; i++) {
  if (lines[i] && lines[i].includes('b.addText(')) {
    // b.addText("I. SYSTEM SINGLE LINE DIAGRAM", xLeft, by + contentH - 24, 2.5, 0, 'TEXT_TITLE', 'center');
    // We want to replace 2.5 with 4.0
    // regex: ^(\s*b\.addText\([^,]+,\s*[^,]+,\s*[^,]+,\s*)[0-9.]+(,\s*[0-9]+,\s*'[^']+'.*)
    lines[i] = lines[i].replace(
      /^(\s*b\.addText\([^,]+,\s*[^,]+,\s*[^,]+,\s*)[0-9.]+(,\s*[0-9]+,\s*'[^']+'.*)/,
      "$14.0$2"
    );
  }
}
fs.writeFileSync(p, lines.join('\n'));
