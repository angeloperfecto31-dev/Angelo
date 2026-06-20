import { PanelConfig, Circuit, ShortCircuitParams, VoltageDropCalculation, IlluminationParams } from "../types";

export interface ProjectData {
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
