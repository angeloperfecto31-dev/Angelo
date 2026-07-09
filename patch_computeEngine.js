import fs from 'fs';

let content = fs.readFileSync('src/utils/computeEngine.ts', 'utf8');

const helperCode = `
export const getValidPolesForSystem = (system: string): string[] => {
  if (system.includes("3PH, 4W") || system.includes("3PH, 5W")) {
    return ["1P", "1P+N", "2P", "2P+N", "3P", "3P+N", "4P"];
  } else if (system.includes("1PH, 2W") || system.includes("1PH, 3W")) {
    return ["1P", "1P+N", "2P"];
  } else if (system.includes("3PH, 3W")) {
    return ["2P", "3P"];
  }
  return ["1P", "2P", "3P", "4P"];
};

export const getActivePoles = (poleStr: string | number): number => {
  if (typeof poleStr === "number") return poleStr;
  if (!poleStr) return 1;
  const match = poleStr.match(/^(\d)P/);
  return match ? parseInt(match[1]) : 1;
};

export const getNeutralPoles = (poleStr: string | number): number => {
  if (typeof poleStr === "number") return 0;
  if (!poleStr) return 0;
  return poleStr.includes("+N") ? 1 : 0;
};
`;

if (!content.includes('getValidPolesForSystem')) {
  content = content.replace("export const getAdjustedWireForVoltageDrop", helperCode + "\nexport const getAdjustedWireForVoltageDrop");
  fs.writeFileSync('src/utils/computeEngine.ts', content, 'utf8');
  console.log("computeEngine.ts patched");
}
