import { PanelConfig, Circuit, ShortCircuitParams, VoltageDropCalculation, IlluminationParams } from "../types";

export interface MainSourceConfig {
  systemVoltage: number;
  systemFrequency: number;
  phaseConfiguration: string;
  transformerConnection: string;
  availableFaultCurrent: number;
  sourceCapacity: number;
  utilityProvider?: string;
}

export interface MdpData {
  id: string;
  panel: PanelConfig;
  circuits: Circuit[];
  subPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[];
  subSubPanels?: { id: string; panel: PanelConfig; circuits: Circuit[] }[];
}

export interface ProjectData {
  schemaVersion?: number;
  mainSource?: MainSourceConfig;
  mdps?: MdpData[];
  panel: PanelConfig;
  circuits: Circuit[];
  subPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[];
  subSubPanels?: { id: string; panel: PanelConfig; circuits: Circuit[] }[];
  iscParams: ShortCircuitParams;
  iscSource: string;
  vdCalculations: VoltageDropCalculation[];
  illumParams: IlluminationParams;
  transformerConfig?: {
    primaryVoltage: number;
    powerFactor: number;
    demandFactor: number;
    loadingFactor: number;
  };
}

export interface SavedProject {
  id: string;
  name: string;
  lastModified: number;
  data: ProjectData;
}
