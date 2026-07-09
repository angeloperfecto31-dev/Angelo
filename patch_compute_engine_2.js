import fs from 'fs';
let content = fs.readFileSync('src/utils/computeEngine.ts', 'utf8');

content = content.replace(/cir\.mcbP === 1/g, 'getActivePoles(cir.mcbP) === 1');
content = content.replace(/cir\.mcbP !== 1/g, 'getActivePoles(cir.mcbP) !== 1');
content = content.replace(/c\.mcbP === 1/g, 'getActivePoles(c.mcbP) === 1');
content = content.replace(/c\.mcbP !== 1/g, 'getActivePoles(c.mcbP) !== 1');
content = content.replace(/c\.mcbP === 2/g, 'getActivePoles(c.mcbP) === 2');
content = content.replace(/c\.mcbP === 3/g, 'getActivePoles(c.mcbP) === 3');

// Fix calculateCircuitValues pole logic
content = content.replace(
  /let mcbP = c\.mcbP \|\| 1;\s*\/\/ Auto-update poles for three-phase circuits when in a three-phase system\s*if \(panel\.system\.includes\("3PH"\) && is3PhaseLoadFinal\) \{\s*if \(mcbP !== 4\) \{\s*mcbP = 3;\s*\}\s*\} else if \(\s*c\.loadType !== LoadType\.SUB_PANEL &&\s*c\.loadType !== LoadType\.SUB_SUB_PANEL &&\s*!panel\.system\.includes\("3PH"\)\s*\) \{\s*\/\/ Auto-update poles based on global connection type for 1-phase systems\s*if \(panel\.connectionType === "Line-to-Line"\) \{\s*mcbP = 2;\s*\} else if \(panel\.connectionType === "Line-to-Neutral"\) \{\s*mcbP = 1;\s*\}\s*\}/,
  `let mcbP = c.mcbP || "1P";
  
  if (typeof mcbP === 'number') { mcbP = mcbP + "P"; }

  // Auto-update poles for three-phase circuits when in a three-phase system
  if (panel.system.includes("3PH") && is3PhaseLoadFinal) {
    if (mcbP !== "4P" && mcbP !== "3P+N") {
      mcbP = "3P";
    }
  } else if (
    c.loadType !== LoadType.SUB_PANEL &&
    c.loadType !== LoadType.SUB_SUB_PANEL &&
    !panel.system.includes("3PH")
  ) {
    if (panel.connectionType === "Line-to-Line") {
      if (!mcbP.toString().startsWith("2")) mcbP = "2P";
    } else if (panel.connectionType === "Line-to-Neutral") {
      if (!mcbP.toString().startsWith("1")) mcbP = "1P";
    }
  }`
);

content = content.replace(
  /if \(!c\.mcbP\) \{\s*mcbP = 1;\s*if \(c\.loadType === LoadType\.AIR_CON \|\| c\.loadType === LoadType\.MOTOR\) \{\s*mcbP = 2;\s*\/\/\s*Default to 2-Pole for motors\/AC regardless of panel type\s*\}\s*\}/,
  `if (!c.mcbP) {
    mcbP = "1P";
    if (c.loadType === LoadType.AIR_CON || c.loadType === LoadType.MOTOR) {
      mcbP = "2P";
    }
  }`
);

// We need to change where mcbP is assigned back:
// But wait, the function returns an object with mcbP inside it?
// The variable mcbP is just used later. We must update the assignment.
content = content.replace(/mcbP: mcbP,/g, 'mcbP: mcbP.toString(),');
content = content.replace(/mcbP,/g, 'mcbP: mcbP.toString(),');

// Ensure calculatedPoles handles strings:
content = content.replace(
  /let calculatedPoles = 1;\s*if \(\!sp\.panel\.system\.includes\("3PH"\)\) \{\s*if \(connValidation\.connectionType === "Line-to-Line"\) \{\s*calculatedPoles = 2;\s*\} else if \(connValidation\.connectionType === "Line-to-Neutral"\) \{\s*calculatedPoles = 1;\s*\}\s*\}/,
  `let calculatedPoles: string | number = "1P";
      if (!sp.panel.system.includes("3PH")) {
        if (connValidation.connectionType === "Line-to-Line") {
          calculatedPoles = "2P";
        } else if (connValidation.connectionType === "Line-to-Neutral") {
          calculatedPoles = "1P";
        }
      } else {
         calculatedPoles = "3P";
      }`
);


fs.writeFileSync('src/utils/computeEngine.ts', content, 'utf8');
console.log("computeEngine patched 2");
