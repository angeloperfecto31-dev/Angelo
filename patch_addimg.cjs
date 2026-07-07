const fs = require('fs');
let code = fs.readFileSync('src/utils/exportWord.ts', 'utf8');

const targetStr = `  const addImageToDoc = async (dataUrl: string | null) => {`;
const replStr = `  const addImageToDoc = async (dataUrl: string | null, isFullPageDiagram = false) => {`;

code = code.replace(targetStr, replStr);

const targetBlock = `      const maxWidth = 500;
      const maxHeight = 700;
      const ratio = img.height / img.width;
      
      let docWidth = maxWidth;
      let docHeight = docWidth * ratio;
      
      if (docHeight > maxHeight) {
          docHeight = maxHeight;
          docWidth = docHeight / ratio;
      }`;
      
const replBlock = `      // Standard margins: 20mm (0.78 inches = ~1134 twips). A4 is 8.27 x 11.69 inches.
      // Standard page max width in pt = 500, maxHeight = 700.
      let maxWidth = 500;
      let maxHeight = 700;
      let isLandscape = false;
      
      if (isFullPageDiagram) {
         if (img.width > img.height) {
            isLandscape = true;
            maxWidth = 700; // Landscape A4 max width
            maxHeight = 500; // Landscape A4 max height
         } else {
            maxWidth = 500;
            maxHeight = 700;
         }
      }
      
      const ratio = img.height / img.width;
      let docWidth = maxWidth;
      let docHeight = docWidth * ratio;
      
      if (docHeight > maxHeight) {
          docHeight = maxHeight;
          docWidth = docHeight / ratio;
      }
      
      if (isFullPageDiagram) {
          docChildren.push(new Paragraph({ text: isLandscape ? "___SECTION_BREAK_LANDSCAPE___" : "___SECTION_BREAK_PORTRAIT___" }));
      }`;

code = code.replace(targetBlock, replBlock);

const targetPush = `      docChildren.push(new Paragraph({
        children: [
          new ImageRun({
            data: bytes,
            transformation: {
              width: docWidth,
              height: docHeight
            },
            type: "png"
          })
        ]
      }));`;
const replPush = `      docChildren.push(new Paragraph({
        children: [
          new ImageRun({
            data: bytes,
            transformation: {
              width: docWidth,
              height: docHeight
            },
            type: "png"
          })
        ],
        alignment: AlignmentType.CENTER
      }));
      
      if (isFullPageDiagram) {
          docChildren.push(new Paragraph({ text: "___SECTION_BREAK_PORTRAIT___" }));
      }`;

code = code.replace(targetPush, replPush);
fs.writeFileSync('src/utils/exportWord.ts', code);
console.log('addImageToDoc patched');
