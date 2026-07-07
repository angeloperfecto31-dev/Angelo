const fs = require('fs');
let code = fs.readFileSync('src/utils/exportWord.ts', 'utf8');

const targetPushLand = `docChildren.push(new Paragraph({ text: isLandscape ? "___SECTION_BREAK_LANDSCAPE___" : "___SECTION_BREAK_PORTRAIT___" }));`;
const replPushLand = `docChildren.push({ isSectionBreak: true, orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT });`;

const targetPushPort = `docChildren.push(new Paragraph({ text: "___SECTION_BREAK_PORTRAIT___" }));`;
const replPushPort = `docChildren.push({ isSectionBreak: true, orientation: PageOrientation.PORTRAIT });`;

code = code.replace(targetPushLand, replPushLand);
code = code.replace(targetPushPort, replPushPort);

const targetLoop = `  for (const child of docChildren) {
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
    }`;
const replLoop = `  for (const child of docChildren) {
    let isBreak = false;
    let newOrientation = PageOrientation.PORTRAIT;
    
    if (child && child.isSectionBreak) {
        isBreak = true;
        newOrientation = child.orientation;
    }`;

code = code.replace(targetLoop, replLoop);
fs.writeFileSync('src/utils/exportWord.ts', code);
console.log('Sections patched 2');
