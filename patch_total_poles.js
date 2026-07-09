import fs from 'fs';
let content = fs.readFileSync('src/utils/computeEngine.ts', 'utf8');

const helperCode = `
export const getTotalPoles = (poleStr: string | number): number => {
  if (typeof poleStr === "number") return poleStr;
  if (!poleStr) return 1;
  const match = poleStr.match(/^(\d)P/);
  const active = match ? parseInt(match[1]) : 1;
  const neutral = poleStr.includes("+N") ? 1 : 0;
  return active + neutral;
};
`;

if (!content.includes('getTotalPoles')) {
  content = content.replace("export const getActivePoles", helperCode + "\nexport const getActivePoles");
  fs.writeFileSync('src/utils/computeEngine.ts', content, 'utf8');
}
