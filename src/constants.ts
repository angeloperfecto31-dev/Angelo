import { ShortCircuitParams, VoltageDropParams, IlluminationParams } from './types';

// PEC Table 3.10.1.16 (Copper THHN/THWN at 75°C)
export const WIRE_AMPACITY_TABLE = [
  { size: 2.0, ampacity: 20 },
  { size: 3.5, ampacity: 25 },
  { size: 5.5, ampacity: 35 },
  { size: 8.0, ampacity: 50 },
  { size: 14, ampacity: 65 },
  { size: 22, ampacity: 90 },
  { size: 30, ampacity: 110 },
  { size: 38, ampacity: 125 },
  { size: 50, ampacity: 150 },
  { size: 60, ampacity: 175 },
  { size: 80, ampacity: 200 },
  { size: 100, ampacity: 230 },
  { size: 125, ampacity: 255 },
  { size: 150, ampacity: 285 },
];

export const STANDARD_CB_RATINGS = [15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250, 300, 400];

export const SYSTEM_VOLTAGES = {
  '230V, 1PH, 2W': 230,
  '230V, 3PH, 3W': 230,
  '400V/230V, 3PH, 4W': 400,
};

export const INITIAL_SHORT_CIRCUIT_PARAMS: ShortCircuitParams = {
  transformerKVA: 100,
  transformerZ: 5,
  transformerVoltage: 230,
  utilityShortCircuitMVA: 500,
  feederLength: 10,
  feederSize: '30'
};

export const INITIAL_VOLTAGE_DROP_PARAMS: VoltageDropParams = {
  loadA: 20,
  length: 30,
  wireSize: '3.5',
  voltage: 230,
  systemType: '1PH'
};

export const INITIAL_ILLUMINATION_PARAMS: IlluminationParams = {
  roomWidth: 4,
  roomLength: 5,
  ceilingHeight: 2.7,
  workingPlaneHeight: 0.75,
  targetLux: 300,
  lumensPerFixture: 1800,
  coefficientOfUtilization: 0.6,
  maintenanceFactor: 0.8
};

export const DESCRIPTION_CODES = {
  S: 'Socket Outlets',
  AC: 'Air Conditioning',
  M: 'Motors / Pumps',
  P: 'Power',
  SP: 'Spare',
  SPACE: 'Space',
  SUB: 'Sub-Panel',
};

export const CONDUIT_SIZES = ['15mm', '20mm', '25mm', '32mm', '40mm', '50mm'];

// PEC Table 9 (Resistance and Reactance for 600V Cables)
// Values in Ohms per 1000m (or Ohm/km)
export const WIRE_IMPEDANCE_TABLE: Record<string, { r: number, x: number }> = {
  '2.0': { r: 10.15, x: 0.164 },
  '3.5': { r: 5.76, x: 0.157 },
  '5.5': { r: 3.61, x: 0.148 },
  '8.0': { r: 2.27, x: 0.144 },
  '14': { r: 1.30, x: 0.141 },
  '22': { r: 0.817, x: 0.135 },
  '30': { r: 0.587, x: 0.135 },
  '38': { r: 0.463, x: 0.131 },
  '50': { r: 0.354, x: 0.128 },
  '60': { r: 0.282, x: 0.128 },
  '80': { r: 0.223, x: 0.125 },
  '100': { r: 0.177, x: 0.125 },
  '125': { r: 0.141, x: 0.121 },
  '150': { r: 0.118, x: 0.121 },
};

export const RECOMMENDED_LUX_LEVELS = {
  'STAIRWAY / CORRIDOR': 100,
  'WAREHOUSE / STORAGE': 150,
  'GENERAL OFFICE': 300,
  'CONFERENCE ROOM': 500,
  'DRAWING OFFICE / LAB': 750,
  'CLASSROOM': 300,
};

export interface LoadPreset {
  category: string;
  items: {
    description: string;
    wattage: number;
    loadType: string;
    label: string;
  }[];
}

export const LOAD_PRESETS: LoadPreset[] = [
  {
    category: "Lighting Loads",
    items: [
      { description: "LED Bulb", wattage: 10, loadType: "L", label: "LED Bulb (5W – 18W)" },
      { description: "Fluorescent Lamp", wattage: 30, loadType: "L", label: "Fluorescent Lamp (18W – 40W)" },
      { description: "LED Tube Light", wattage: 16, loadType: "L", label: "LED Tube Light (9W – 24W)" },
      { description: "CFL Lamp", wattage: 20, loadType: "L", label: "CFL Lamp (12W – 26W)" },
      { description: "Chandelier", wattage: 150, loadType: "L", label: "Chandelier (40W – 300W)" },
      { description: "Emergency Light", wattage: 10, loadType: "L", label: "Emergency Light (5W – 20W)" },
      { description: "Flood Light", wattage: 250, loadType: "L", label: "Flood Light (50W – 500W)" },
      { description: "Street Light", wattage: 150, loadType: "L", label: "Street Light (50W – 250W)" },
      { description: "Exit Sign Light", wattage: 5, loadType: "L", label: "Exit Sign Light (3W – 10W)" }
    ]
  },
  {
    category: "Convenience Outlet Loads",
    items: [
      { description: "Convenience Outlet", wattage: 180, loadType: "S", label: "Convenience Outlet (General Purpose) (180W p/outlet)" },
      { description: "Dedicated Outlet", wattage: 1000, loadType: "S", label: "Dedicated Outlet (500W – 2000W)" },
      { description: "USB Outlet", wattage: 40, loadType: "S", label: "USB Outlet (15W – 65W)" }
    ]
  },
  {
    category: "Kitchen Appliances",
    items: [
      { description: "Refrigerator", wattage: 500, loadType: "S", label: "Refrigerator (150W – 800W)" },
      { description: "Microwave Oven", wattage: 1200, loadType: "S", label: "Microwave Oven (800W – 1500W)" },
      { description: "Rice Cooker", wattage: 800, loadType: "S", label: "Rice Cooker (500W – 1200W)" },
      { description: "Electric Stove", wattage: 3000, loadType: "P", label: "Electric Stove (1000W – 5000W)" },
      { description: "Induction Cooker", wattage: 2000, loadType: "P", label: "Induction Cooker (1200W – 3500W)" },
      { description: "Oven", wattage: 3000, loadType: "P", label: "Oven (1000W – 5000W)" },
      { description: "Toaster", wattage: 1000, loadType: "S", label: "Toaster (600W – 1500W)" },
      { description: "Blender", wattage: 500, loadType: "S", label: "Blender (300W – 1000W)" },
      { description: "Coffee Maker", wattage: 1000, loadType: "S", label: "Coffee Maker (600W – 1500W)" },
      { description: "Water Dispenser", wattage: 500, loadType: "S", label: "Water Dispenser (300W – 800W)" },
      { description: "Range Hood", wattage: 200, loadType: "M", label: "Range Hood (100W – 300W)" }
    ]
  },
  {
    category: "Air Conditioning (PEC 2017 Based)",
    items: [
      { description: "Window Type ACU - 0.5 HP", wattage: 1127, loadType: "AC", label: "4.9A FLC @ 230V" },
      { description: "Window Type ACU - 1.0 HP", wattage: 1840, loadType: "AC", label: "8.0A FLC @ 230V" },
      { description: "Split Type ACU - 1.5 HP", wattage: 2300, loadType: "AC", label: "10.0A FLC @ 230V" },
      { description: "Split Type ACU - 2.0 HP", wattage: 2760, loadType: "AC", label: "12.0A FLC @ 230V" },
      { description: "Package ACU - 3.0 HP", wattage: 3910, loadType: "AC", label: "17.0A FLC @ 230V" },
      { description: "Centralized ACU - 5.0 HP", wattage: 6440, loadType: "AC", label: "28.0A FLC @ 230V" },
    ]
  },
  {
    category: "Water & Pumping System",
    items: [
      { description: "Water Pump", wattage: 746, loadType: "M", label: "Water Pump (0.5HP – 5HP)" },
      { description: "Deep Well Pump", wattage: 1492, loadType: "M", label: "Deep Well Pump (1HP – 10HP)" },
      { description: "Sewage Pump", wattage: 1492, loadType: "M", label: "Sewage Pump (1HP – 15HP)" },
      { description: "Pressure Pump", wattage: 746, loadType: "M", label: "Pressure Pump (0.5HP – 3HP)" }
    ]
  },
  {
    category: "Laundry & Cleaning Equipment",
    items: [
      { description: "Washing Machine", wattage: 800, loadType: "M", label: "Washing Machine (400W – 1500W)" },
      { description: "Dryer", wattage: 3000, loadType: "P", label: "Dryer (1500W – 5000W)" },
      { description: "Vacuum Cleaner", wattage: 1000, loadType: "S", label: "Vacuum Cleaner (500W – 2000W)" },
      { description: "Electric Iron", wattage: 1000, loadType: "S", label: "Electric Iron (700W – 2000W)" }
    ]
  },
  {
    category: "Entertainment & Office Loads",
    items: [
      { description: "Television", wattage: 150, loadType: "S", label: "Television (50W – 400W)" },
      { description: "Desktop Computer", wattage: 300, loadType: "S", label: "Desktop Computer (150W – 750W)" },
      { description: "Laptop Charger", wattage: 65, loadType: "S", label: "Laptop Charger (45W – 180W)" },
      { description: "Printer", wattage: 200, loadType: "S", label: "Printer (100W – 1000W)" },
      { description: "Wi-Fi Router", wattage: 15, loadType: "S", label: "Wi-Fi Router (10W – 30W)" },
      { description: "CCTV System", wattage: 100, loadType: "S", label: "CCTV System (50W – 300W)" },
      { description: "Sound System", wattage: 500, loadType: "S", label: "Sound System (100W – 2000W)" }
    ]
  },
  {
    category: "Bathroom Loads",
    items: [
      { description: "Water Heater", wattage: 3000, loadType: "P", label: "Water Heater (1500W – 6000W)" },
      { description: "Hair Dryer", wattage: 1500, loadType: "S", label: "Hair Dryer (800W – 2000W)" },
      { description: "Electric Shower Heater", wattage: 4500, loadType: "P", label: "Electric Shower Heater (3500W – 6500W)" }
    ]
  },
  {
    category: "Motor Loads (PEC 2017 Based)",
    items: [
      { description: "Exhaust Fan - 1/6 HP", wattage: 506, loadType: "M", label: "2.2A FLC @ 230V (125W Motor)" },
      { description: "Small Fan Motor - 1/4 HP", wattage: 667, loadType: "M", label: "2.9A FLC @ 230V (186W Motor)" },
      { description: "Ceiling Fan - 1/3 HP", wattage: 828, loadType: "M", label: "3.6A FLC @ 230V (250W Motor)" },
      { description: "Wall Fan - 1/2 HP", wattage: 1127, loadType: "M", label: "4.9A FLC @ 230V (373W Motor)" },
      { description: "Industrial Fan - 3/4 HP", wattage: 1587, loadType: "M", label: "6.9A FLC @ 230V (560W Motor)" },
      { description: "Heavy Duty Motor - 7.5 HP", wattage: 9200, loadType: "M", label: "40.0A FLC @ 230V (5595W Motor)" },
      { description: "Industrial Motor - 10 HP", wattage: 11500, loadType: "M", label: "50.0A FLC @ 230V (7460W Motor)" },
    ]
  },
  {
    category: "Miscellaneous Loads",
    items: [
      { description: "Elevator", wattage: 7460, loadType: "M", label: "Elevator (5HP – 100HP)" },
      { description: "Escalator", wattage: 3730, loadType: "M", label: "Escalator (3HP – 50HP)" },
      { description: "Fire Alarm System", wattage: 100, loadType: "S", label: "Fire Alarm System (50W – 500W)" },
      { description: "CCTV Power Supply", wattage: 100, loadType: "S", label: "CCTV Power Supply (50W – 300W)" },
      { description: "Server Rack", wattage: 2000, loadType: "S", label: "Server Rack (500W – 5000W)" },
      { description: "Billboard Signage", wattage: 1000, loadType: "L", label: "Billboard Signage (100W – 3000W)" },
      { description: "Electric Gate Motor", wattage: 373, loadType: "M", label: "Electric Gate Motor (0.25HP – 1HP)" },
      { description: "Solar Inverter", wattage: 5000, loadType: "P", label: "Solar Inverter (500W – 10000W)" },
      { description: "EV Charger", wattage: 7000, loadType: "P", label: "EV Charger (3kW – 22kW)" }
    ]
  },
  {
    category: "Spares & Spaces",
    items: [
      { description: "SPARE", wattage: 0, loadType: "SP", label: "Spare Circuit" },
      { description: "SPACE", wattage: 0, loadType: "SPACE", label: "Space Only" }
    ]
  }
];
