const fs = require('fs');
let code = fs.readFileSync('src/utils/exportWord.ts', 'utf8');

const targetStr = `  const doc = new Document({
    creator: "AI Studio Integrated Sizer",
    title: \`Electrical Design Analysis - \${panel.project || 'Project'}\`,
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [footerTable]
          })
        },
        children: docChildren,
      },
    ],
  });`;

const replStr = `  const processedSections = [];
  let currentChildren = [];
  let currentOrientation = PageOrientation.PORTRAIT;

  for (const child of docChildren) {
    let isBreak = false;
    let newOrientation = PageOrientation.PORTRAIT;
    
    // Check if it's a marker paragraph
    if (child && child.root) {
        const textRuns = child.root.filter(r => r && r.root && typeof r.root[0] === 'string');
        const text = textRuns.map(r => r.root[0]).join('');
        if (text === "___SECTION_BREAK_LANDSCAPE___") {
            isBreak = true;
            newOrientation = PageOrientation.LANDSCAPE;
        } else if (text === "___SECTION_BREAK_PORTRAIT___") {
            isBreak = true;
            newOrientation = PageOrientation.PORTRAIT;
        }
    }

    if (isBreak) {
        if (currentChildren.length > 0) {
            processedSections.push({
                properties: {
                  page: {
                    margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 }, // 20mm
                    size: { orientation: currentOrientation },
                  },
                },
                footers: {
                  default: new Footer({ children: [footerTable] })
                },
                children: currentChildren,
            });
            currentChildren = [];
        }
        currentOrientation = newOrientation;
        continue; // skip the marker
    }
    
    currentChildren.push(child);
  }

  if (currentChildren.length > 0) {
      processedSections.push({
          properties: {
            page: {
              margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 }, // 20mm
              size: { orientation: currentOrientation },
            },
          },
          footers: {
            default: new Footer({ children: [footerTable] })
          },
          children: currentChildren,
      });
  }

  const doc = new Document({
    creator: "AI Studio Integrated Sizer",
    title: \`Electrical Design Analysis - \${panel.project || 'Project'}\`,
    sections: processedSections,
  });`;

code = code.replace(targetStr, replStr);
fs.writeFileSync('src/utils/exportWord.ts', code);
console.log('Sections patched');
