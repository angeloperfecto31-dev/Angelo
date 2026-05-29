import { ShortCircuitParams, VoltageDropCalculation, IlluminationParams, LightFixture } from './types';

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
  { size: 175, ampacity: 310 },
  { size: 200, ampacity: 335 },
  { size: 250, ampacity: 380 },
  { size: 325, ampacity: 445 },
  { size: 400, ampacity: 490 },
  { size: 500, ampacity: 545 },
];

export const STANDARD_CB_RATINGS = [15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250, 300, 400, 450, 500, 600, 700, 800, 1000];

export const SYSTEM_VOLTAGES = {
  '230V, 1PH, 2W': 230,
  '230V, 3PH, 3W': 230,
  '400V/230V, 3PH, 4W': 400,
};

export const INITIAL_SHORT_CIRCUIT_PARAMS: ShortCircuitParams = {
  transformerKVA: 100,
  transformerZ: 5,
  transformerVoltage: 230,
  primaryVoltage: 34500,
  transformerConnection: 'Delta-Wye',
  utilityShortCircuitMVA: 500,
  feederLength: 10,
  feederSize: '30',
  feederRuns: 1,
  conductorType: 'Copper'
};

export const INITIAL_VOLTAGE_DROP_CALCULATIONS: VoltageDropCalculation[] = [
  {
    id: 'initial',
    source: 'custom',
    name: 'Custom Circuit',
    loadA: 20,
    length: 30,
    wireSize: '3.5',
    voltage: 230,
    systemType: '1PH'
  }
];
export const LIGHT_FIXTURES_LIBRARY: LightFixture[] = [
  { id: 'ind-led-bulb', category: 'Indoor', lightType: 'LED Bulb', wattageRange: '3W–24W', lumensRange: '250–3000 lm', brands: 'Philips, Omni, Firefly, Akari', wattage: 12, lumens: 1000 },
  { id: 'ind-smart-bulb', category: 'Indoor', lightType: 'Smart Bulb', wattageRange: '7W–15W', lumensRange: '800–1600 lm', brands: 'Philips Wiz, Philips Hue, Tapo', wattage: 10, lumens: 1000 },
  { id: 'ind-t5-t8', category: 'Indoor', lightType: 'T5/T8 Tube Light', wattageRange: '5W–40W', lumensRange: '500–4500 lm', brands: 'Philips, Omni, Firefly', wattage: 18, lumens: 1800 },
  { id: 'ind-panel', category: 'Indoor', lightType: 'Panel Light', wattageRange: '6W–48W', lumensRange: '500–5000 lm', brands: 'Philips, Akari', wattage: 36, lumens: 3600 },
  { id: 'ind-downlight', category: 'Indoor', lightType: 'Downlight/Recessed Light', wattageRange: '3W–18W', lumensRange: '250–2200 lm', brands: 'Philips, Firefly', wattage: 12, lumens: 1000 },
  { id: 'ind-ceiling', category: 'Indoor', lightType: 'Ceiling Light', wattageRange: '12W–60W', lumensRange: '1000–7000 lm', brands: 'Firefly, Omni', wattage: 24, lumens: 2400 },
  { id: 'ind-chandelier', category: 'Indoor', lightType: 'Chandelier', wattageRange: '20W–100W', lumensRange: '2000–12000 lm', brands: 'Philips, Decorative Brands', wattage: 40, lumens: 4000 },
  { id: 'ind-track', category: 'Indoor', lightType: 'Track Light', wattageRange: '7W–40W', lumensRange: '600–4500 lm', brands: 'Philips, Omni', wattage: 15, lumens: 1200 },
  { id: 'ind-desk', category: 'Indoor', lightType: 'Desk Lamp', wattageRange: '3W–12W', lumensRange: '200–1200 lm', brands: 'Philips, Xiaomi', wattage: 7, lumens: 600 },
  { id: 'ind-emergency', category: 'Indoor', lightType: 'Emergency Light', wattageRange: '5W–20W', lumensRange: '500–4000 lm', brands: 'Firefly, Akari', wattage: 10, lumens: 1000 },

  { id: 'out-floodlight', category: 'Outdoor', lightType: 'Floodlight', wattageRange: '10W–300W', lumensRange: '900–30000 lm', brands: 'Firefly, Akari, Philips', wattage: 100, lumens: 10000 },
  { id: 'out-street', category: 'Outdoor', lightType: 'Street Light', wattageRange: '30W–120W', lumensRange: '3000–15000 lm', brands: 'Omni, Firefly', wattage: 60, lumens: 6000 },
  { id: 'out-solar', category: 'Outdoor', lightType: 'Solar Light', wattageRange: '1W–300W', lumensRange: '100–30000 lm', brands: 'Akari, Firefly', wattage: 50, lumens: 5000 },
  { id: 'out-garden', category: 'Outdoor', lightType: 'Garden Light', wattageRange: '3W–10W', lumensRange: '200–1200 lm', brands: 'Philips, Omni', wattage: 5, lumens: 500 },
  { id: 'out-wall', category: 'Outdoor', lightType: 'Wall Sconce', wattageRange: '5W–20W', lumensRange: '400–2500 lm', brands: 'Philips, Akari', wattage: 10, lumens: 1000 },
  { id: 'out-highbay', category: 'Outdoor', lightType: 'High Bay Light', wattageRange: '50W–200W', lumensRange: '5000–30000 lm', brands: 'Philips, Omni', wattage: 150, lumens: 18000 },
  { id: 'out-lowbay', category: 'Outdoor', lightType: 'Low Bay Light', wattageRange: '40W–100W', lumensRange: '4000–12000 lm', brands: 'Firefly, Philips', wattage: 60, lumens: 6000 },
  { id: 'out-canopy', category: 'Outdoor', lightType: 'Canopy Light', wattageRange: '40W–80W', lumensRange: '4000–12000 lm', brands: 'Omni, Philips', wattage: 60, lumens: 6000 },
  { id: 'out-pool', category: 'Outdoor', lightType: 'Pool/Underwater Light', wattageRange: '12W–35W', lumensRange: '800–4000 lm', brands: 'Hayward, Philips', wattage: 15, lumens: 1500 },

  { id: 'spl-motion', category: 'Special', lightType: 'Motion Sensor Light', wattageRange: '5W–50W', lumensRange: '500–5000 lm', brands: 'Omni, Philips', wattage: 15, lumens: 1500 },
  { id: 'spl-rgb', category: 'Special', lightType: 'RGB Smart Light', wattageRange: '5W–15W', lumensRange: '500–1600 lm', brands: 'Philips Hue, Xiaomi', wattage: 10, lumens: 1000 },
  { id: 'spl-uv', category: 'Special', lightType: 'UV Light', wattageRange: '6W–40W', lumensRange: 'N/A', brands: 'Philips, Omni', wattage: 20, lumens: 0 },
  { id: 'spl-grow', category: 'Special', lightType: 'Grow Light', wattageRange: '20W–300W', lumensRange: '2000–30000 lm', brands: 'Generic, Philips', wattage: 100, lumens: 10000 },
  { id: 'spl-exit', category: 'Special', lightType: 'Exit Light', wattageRange: '3W–10W', lumensRange: '200–800 lm', brands: 'Firefly, Akari', wattage: 5, lumens: 400 },
  { id: 'spl-strip', category: 'Special', lightType: 'LED Strip Light', wattageRange: '4W–24W/m', lumensRange: '300–2400 lm/m', brands: 'Philips, Xiaomi', wattage: 10, lumens: 1000 },
  { id: 'spl-cob-strip', category: 'Special', lightType: 'COB LED Strip', wattageRange: '10W–20W/m', lumensRange: '800–2000 lm/m', brands: 'Philips, Omni', wattage: 15, lumens: 1500 },
  { id: 'spl-neon', category: 'Special', lightType: 'Neon Flex Light', wattageRange: '5W–15W/m', lumensRange: '300–1500 lm/m', brands: 'Akari, Omni', wattage: 10, lumens: 1000 }
];

export const INITIAL_ILLUMINATION_PARAMS: IlluminationParams = {
  inputMode: 'dimensions',
  roomWidth: 4,
  roomLength: 5,
  userArea: 20,
  ceilingHeight: 2.7,
  workingPlaneHeight: 0.75,
  mountingHeight: 1.95,
  targetLux: 500, // Default to a standard office lux
  selectedFixtureId: 'ind-panel',
  lumensPerFixture: 3600,
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

export const RECOMMENDED_LUX_LEVELS_CATEGORIZED: Record<string, { name: string; lux: number }[]> = {
  "Residential Lighting": [
    { name: "Living Room", lux: 150 },
    { name: "Bedroom", lux: 200 },
    { name: "Kitchen (General)", lux: 300 },
    { name: "Kitchen (Task)", lux: 500 },
    { name: "Bathroom (General)", lux: 200 },
    { name: "Bathroom (Mirror)", lux: 500 },
    { name: "Hallways / Stairs", lux: 100 },
    { name: "Dining Area", lux: 200 },
  ],
  "Office & Educational": [
    { name: "General Office", lux: 500 },
    { name: "Workstations", lux: 500 },
    { name: "Meeting Rooms", lux: 500 },
    { name: "Reading / Study", lux: 500 },
    { name: "CAD / Drafting", lux: 750 },
    { name: "Classrooms", lux: 500 },
    { name: "Libraries", lux: 500 },
  ],
  "Commercial & Retail": [
    { name: "Small Shops", lux: 500 },
    { name: "Supermarkets", lux: 750 },
    { name: "Showrooms", lux: 750 },
    { name: "Display / Feature Areas", lux: 2000 },
    { name: "Reception", lux: 300 },
  ],
  "Industrial": [
    { name: "Warehouses", lux: 100 },
    { name: "Packing / Sorting", lux: 300 },
    { name: "Mechanical Rooms", lux: 150 },
    { name: "Heavy Industrial Work", lux: 500 },
    { name: "Precision Work / Inspection", lux: 2000 },
  ],
  "Public Areas": [
    { name: "Corridors", lux: 150 },
    { name: "Stairwells", lux: 100 },
    { name: "Lobbies", lux: 200 },
    { name: "Parking Areas", lux: 150 },
    { name: "Outdoor Walkways", lux: 40 },
  ],
  "Healthcare": [
    { name: "Patient Rooms", lux: 200 },
    { name: "Examination Rooms", lux: 1000 },
    { name: "Operating Rooms", lux: 1500 },
  ]
};

export const RECOMMENDED_LUX_LEVELS: Record<string, number> = {};
Object.entries(RECOMMENDED_LUX_LEVELS_CATEGORIZED).forEach(([_, items]) => {
  items.forEach(item => {
    RECOMMENDED_LUX_LEVELS[item.name] = item.lux;
  });
});


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
      { description: "Window Type ACU - 0.75 HP", wattage: 1587, loadType: "AC", label: "6.9A FLC @ 230V" },
      { description: "Window/Split ACU - 1.0 HP", wattage: 1840, loadType: "AC", label: "8.0A FLC @ 230V" },
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
      { description: "Fan Motor - 1/6 HP", wattage: 506, loadType: "M", label: "2.2A FLC @ 230V" },
      { description: "Small Motor - 1/4 HP", wattage: 667, loadType: "M", label: "2.9A FLC @ 230V" },
      { description: "Small Motor - 1/3 HP", wattage: 828, loadType: "M", label: "3.6A FLC @ 230V" },
      { description: "Medium Motor - 1/2 HP", wattage: 1127, loadType: "M", label: "4.9A FLC @ 230V" },
      { description: "Medium Motor - 3/4 HP", wattage: 1587, loadType: "M", label: "6.9A FLC @ 230V" },
      { description: "Standard Motor - 1 HP", wattage: 1840, loadType: "M", label: "8.0A FLC @ 230V" },
      { description: "Standard Motor - 1.5 HP", wattage: 2300, loadType: "M", label: "10.0A FLC @ 230V" },
      { description: "Standard Motor - 2 HP", wattage: 2760, loadType: "M", label: "12.0A FLC @ 230V" },
      { description: "Large Motor - 3 HP", wattage: 3910, loadType: "M", label: "17.0A FLC @ 230V" },
      { description: "Large Motor - 5 HP", wattage: 6440, loadType: "M", label: "28.0A FLC @ 230V" },
      { description: "Heavy Duty Motor - 7.5 HP", wattage: 9200, loadType: "M", label: "40.0A FLC @ 230V" },
      { description: "Industrial Motor - 10 HP", wattage: 11500, loadType: "M", label: "50.0A FLC @ 230V" },
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
