import fs from 'fs';
let content = fs.readFileSync('src/utils/computeEngine.ts', 'utf8');

const oldCode = `      let calculatedPoles = subMainFeeder.poles;
      if (connValidation.isValid && connValidation.connectionType) {
        if (connValidation.connectionType === "Three-Phase") {
          calculatedPoles = panel.system.includes("3PH") ? 3 : 2;
        } else if (connValidation.connectionType === "Line-to-Line") {
          calculatedPoles = 2;
        } else if (connValidation.connectionType === "Line-to-Neutral") {
          calculatedPoles = 1;
        }
      }`;

const newCode = `      let calculatedPoles: string | number = subMainFeeder.poles || "1P";
      if (connValidation.isValid && connValidation.connectionType) {
        if (connValidation.connectionType === "Three-Phase") {
          calculatedPoles = panel.system.includes("3PH") ? "3P" : "2P";
        } else if (connValidation.connectionType === "Line-to-Line") {
          calculatedPoles = "2P";
        } else if (connValidation.connectionType === "Line-to-Neutral") {
          calculatedPoles = "1P";
        }
      }`;

content = content.replace(oldCode, newCode);
fs.writeFileSync('src/utils/computeEngine.ts', content, 'utf8');
