const fs = require('fs');
let code = fs.readFileSync('src/utils/exportWord.ts', 'utf8');

code = code.replace(/await addImageToDoc\(images\.systemSLD\);/g, "await addImageToDoc(images.systemSLD, true);");
code = code.replace(/await addImageToDoc\(images\.sld\[designationKey\]\);/g, "await addImageToDoc(images.sld[designationKey], true);");

fs.writeFileSync('src/utils/exportWord.ts', code);
console.log('addImageToDoc calls patched');
