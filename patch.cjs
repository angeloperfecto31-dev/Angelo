const fs = require('fs');
let code = fs.readFileSync('src/utils/exportDxf.ts', 'utf8');

const replacement = `  const usableLeft = xOffset + 10;
  const usableRight = xOffset + sheetWidth - 130;
  const usableWidth = usableRight - usableLeft;
  
  let xBase_MDP = usableLeft + usableWidth / 2;
  
  if (spLayouts.length === 0 && sheetWidth === 841) {
    xBase_MDP = usableLeft + usableWidth / 2;
  }`;

code = code.replace(/  const layoutAreaW = sheetWidth - 140;\n  let xBase_MDP = xOffset \+ layoutAreaW \/ 2;\n  if \(spLayouts.length === 0 && sheetWidth === 841\) {\n    xBase_MDP = xOffset \+ 355;\n  }/, replacement);

const replacement2 = `  const leftSpan = xBase_MDP - 100 - (usableLeft + 50);
  const leftS = leftSpan - leftTotalWidth;
  const leftGap = leftRoots.length > 0 ? leftS / (leftRoots.length + 1) : 0;
  let currentLeftX = usableLeft + 50;`;

code = code.replace(/  const leftSpan = xBase_MDP - 100 - \(xOffset \+ 60\);\n  const leftS = leftSpan - leftTotalWidth;\n  const leftGap = leftRoots.length > 0 \? leftS \/ \(leftRoots.length \+ 1\) : 0;\n  let currentLeftX = xOffset \+ 60;/, replacement2);

const replacement3 = `  const rightSpan = (usableRight - 50) - (xBase_MDP + 100);
  const rightS = rightSpan - rightTotalWidth;
  const rightGap = rightRoots.length > 0 ? rightS / (rightRoots.length + 1) : 0;
  let currentRightX = xBase_MDP + 100;`;

code = code.replace(/  const rightSpan = \(xOffset \+ layoutAreaW - 60\) - \(xBase_MDP \+ 100\);\n  const rightS = rightSpan - rightTotalWidth;\n  const rightGap = rightRoots.length > 0 \? rightS \/ \(rightRoots.length \+ 1\) : 0;\n  let currentRightX = xBase_MDP \+ 100;/, replacement3);

fs.writeFileSync('src/utils/exportDxf.ts', code);
