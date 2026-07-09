import { calculateCircuitValues } from './src/utils/computeEngine.ts';
import { isEqual } from 'lodash';

const cleanObj = (obj: any): any => {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(cleanObj);
  const result: any = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = cleanObj(obj[key]);
    }
  }
  return result;
};

const c = { id: "1", loadType: "Lighting", description: "L1", wattage: 100, quantity: 1, circuitNo: 1 };
const panel = { id: "mdp", system: "1PH 3W 230V", voltage: 230, phaseSelect: "A" };

let currentC = c;
for (let i = 0; i < 5; i++) {
  const nextC = calculateCircuitValues(currentC as any, panel as any, [], []);
  const newC = { ...currentC, ...nextC };
  console.log(`Iteration ${i} isEqual:`, isEqual(cleanObj(currentC), cleanObj(newC)));
  currentC = newC;
}
