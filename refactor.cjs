const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf-8');

// 1. Add import for syncHierarchyData
content = content.replace(
  'import { exportToWord } from "./utils/exportWord";',
  'import { exportToWord } from "./utils/exportWord";\nimport { syncHierarchyData } from "./utils/hierarchyEngine";'
);

// 2. Remove subSubPanels state
content = content.replace(
  /const \[subSubPanels, setSubSubPanels\] = useState<[\s\S]*?>\(\[\]\);/,
  ''
);

// 3. Update uniqueSubPanels to include both and remove uniqueSubSubPanels
content = content.replace(
  /const uniqueSubSubPanels = useMemo\(\(\) => \{[\s\S]*?\}, \[subSubPanels\]\);/,
  ''
);

// 4. Update setGlobalSubPanels to just uniqueSubPanels
content = content.replace(
  /setGlobalSubPanels\(\[\.\.\.uniqueSubPanels, \.\.\.uniqueSubSubPanels\]\);/,
  'setGlobalSubPanels(uniqueSubPanels);'
);
content = content.replace(
  /\[uniqueSubPanels, uniqueSubSubPanels\]/g,
  '[uniqueSubPanels]'
);

// 5. Replace cascading useEffects (lines 860 to 1195 approx)
// Instead of replacing by line number, let's replace by regex.
const useEffectsRegex = /\/\/ Synchronize Sub-Sub-Panels recalculations back to Sub-Panels circuits[\s\S]*?\/\/ Automatically recalculate subSubPanels circuits when subSubPanel configuration changes[\s\S]*?\}, \[\n    subSubPanels\.map[^\n]*\n    subSubPanels,\n    vdCalculations,\n  \]\);/m;

content = content.replace(useEffectsRegex, `// Centralized N-Level Hierarchy Synchronization
  useEffect(() => {
    const { updatedMdpCircuits, updatedSubPanels, hasChanges } = syncHierarchyData(
      panel,
      circuits,
      subPanels,
      vdCalculations
    );

    if (hasChanges) {
      setCircuits(updatedMdpCircuits);
      setSubPanels(updatedSubPanels);
    }
  }, [panel, circuits, subPanels, vdCalculations]);`);

// Fix App.tsx missing subSubPanels
content = content.replace(/subSubPanels\.find/g, "subPanels.find");
content = content.replace(/uniqueSubSubPanels\.map/g, "uniqueSubPanels.map");
content = content.replace(/uniqueSubSubPanels/g, "uniqueSubPanels");
content = content.replace(/subSubPanelsToUpdate/g, "subPanelsToUpdate");
content = content.replace(/setSubSubPanels/g, "setSubPanels");
content = content.replace(/subSubPanels=\{subSubPanels\}/g, "");
content = content.replace(/subSubPanels,/g, "");
content = content.replace(/subSubPanels/g, "subPanels");

fs.writeFileSync('src/App.tsx', content);
console.log('App.tsx refactored!');
