import { exportToWord } from './src/utils/exportWord';

const panel = {
  id: '1',
  designation: 'Main Panel',
  project: 'Test',
  location: 'Room',
  panelType: 'MAIN',
  voltage: 230,
  phases: 3,
  wireLength: 10,
  enclosureType: 'NEMA',
  mountingType: 'Surface',
  temperatureRating: '75C'
};

const circuits = [{
  id: '1',
  circuitNo: 1,
  description: 'Test',
  loadVA: 100,
  voltage: 230,
  phases: ['R'],
  loadA: 10,
  mcbAT: 20,
  mcbAF: 50,
  mcbP: 1,
  mcbKAIC: 10,
  mcbType: 'MCB',
  wireSize: '3.5',
  wireType: 'THHN',
  groundSize: '2.0',
  conduitSize: '15',
  conduitType: 'PVC',
  loadType: 'Lighting',
  quantity: 1,
  wattage: 100
}] as any[];

const vdCalculations = [{
  id: '1',
  name: 'Test',
  length: 10,
  loadA: 10,
  wireSize: '3.5',
  voltage: 230,
  systemType: '1PH'
}] as any[];

global.atob = (str) => Buffer.from(str, 'base64').toString('binary');

global.Image = class {
  src = '';
  width = 100;
  height = 100;
  onload = () => {};
  onerror = () => {};
  set srcAttr(val) {
    this.src = val;
    setTimeout(() => this.onload(), 10);
  }
  get srcAttr() { return this.src; }
} as any;

import fileSaver from 'file-saver';
(fileSaver as any).saveAs = () => console.log('Saved');

(async () => {
  try {
    await exportToWord(panel as any, circuits, [], vdCalculations, { sld: {}, isc: null, vdDiagrams: {}, illumination: null });
    console.log("Success with export!");
  } catch (e) {
    console.error("FAIL", e);
  }
})();
