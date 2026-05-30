import { PanelConfig, Circuit, ShortCircuitParams, VoltageDropCalculation, IlluminationParams } from "../types";

export interface ProjectData {
  panel: PanelConfig;
  circuits: Circuit[];
  subPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[];
  iscParams: ShortCircuitParams;
  iscSource: string;
  vdCalculations: VoltageDropCalculation[];
  illumParams: IlluminationParams;
}

export interface SavedProject {
  id: string;
  name: string;
  lastModified: number;
  data: ProjectData;
}
