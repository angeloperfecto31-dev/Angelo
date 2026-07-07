const fs = require('fs');
let code = fs.readFileSync('src/utils/exportWord.ts', 'utf8');

const targetStr = `import { 
  Document, 
  Packer,`;
const targetStrFallback = `import {
  Document,
  Packer,`;
const replStr = `import {
  Document,
  Packer,
  PageOrientation,`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replStr);
} else {
  code = code.replace(targetStrFallback, replStr);
}
// Try regex to be safe
code = code.replace(/import\s*{\s*Document,\s*Packer,/, "import { Document, Packer, PageOrientation,");

fs.writeFileSync('src/utils/exportWord.ts', code);
console.log('exportWord.ts import patched');
