import { PanelConfig, Circuit, VoltageDropCalculation } from "../types";
import { SolarDesignConfig, SolarCalculationResults } from "../types/solar";
import { computePanelScheduleValues, getConductorLabel } from "./computeEngine";

/**
 * Panel board the solar system connects to (the MDP selected in Solar Design), with its main
 * breaker and service feeder taken from the Load Schedule. Shared by the on-screen SLD and every
 * Solar export so they all show the same main breaker, busbar, feeder and panel name.
 */
export function computeLinkedPanelData(
  config: SolarDesignConfig,
  panels?: PanelConfig[],
  circuits?: Circuit[],
  subPanels?: any[],
  vdCalculations?: VoltageDropCalculation[]
) {
  const targetId = config.selectedMdpId;
  let targetPanel: PanelConfig | undefined;
  let targetCircuits: Circuit[] = circuits || [];

  if (subPanels && subPanels.length > 0) {
    const sp = subPanels.find((p) => p.id === targetId || p.panel?.designation === targetId);
    if (sp) {
      targetPanel = sp.panel;
      targetCircuits = sp.circuits || [];
    }
  }

  if (!targetPanel && panels && panels.length > 0) {
    targetPanel = panels.find((p) => p.id === targetId || p.designation === targetId) || panels[0];
    targetCircuits = circuits || [];
  }

  if (!targetPanel) {
    targetPanel = {
      id: "main",
      designation: "MAIN DISTRIBUTION PANEL (MDP)",
      system: `${config.utilityVoltage}V ${config.utilityPhase}`,
      voltage: config.utilityVoltage || 230,
      phase: config.utilityPhase?.includes("3PH") ? 3 : 1,
      mainBreakerRating: config.serviceCapacityAmps || 100,
      mainBreakerType: "MCCB",
      mainBreakerPoles: config.utilityPhase?.includes("3PH") ? 3 : 2,
      serviceEntranceConduitSize: "32mm",
      insulationType: "THHN",
      conductorMaterial: "Copper",
      icRating: "10",
    } as any;
  }
  const panel = targetPanel as PanelConfig;

  const computed = computePanelScheduleValues(panel, targetCircuits, {
    vdCalculations,
    panelId: panel.id || "main",
    availableSubPanels: subPanels,
  });

  const cb = computed.mainFeeder.cb || config.serviceCapacityAmps || 100;
  const af = computed.mainFeeder.af || Math.max(cb, cb <= 100 ? 100 : cb <= 225 ? 225 : cb <= 400 ? 400 : cb <= 600 ? 600 : 800);
  const poles = computed.mainFeeder.poles || (panel.system.includes("3PH") ? 3 : 2);
  const kaic = computed.mainFeeder.kaic || parseFloat(panel.icRating || "10") || 10;
  const wire = computed.mainFeeder.wire;
  const groundSize = computed.mainFeeder.groundSize;
  const conduitSize = computed.mainFeeder.conduitSize;
  const conduitType = computed.mainFeeder.conduitType || "PVC";
  const runs = wire?.runs || 1;
  const insulation = panel.insulationType || "THHN";
  const material = panel.conductorMaterial || "Copper";

  const feederLabel =
    getConductorLabel(wire?.size || 14, groundSize || "8.0", poles, runs, insulation) +
    (material === "Aluminum" ? " (AL)" : " (CU)");

  const conduitLabel = `IN ${conduitSize.toUpperCase()}Ø ${conduitType.toUpperCase()} CONDUIT`;

  const connectedKVA = (computed.totalVA / 1000).toFixed(2);
  const demandKVA = (computed.totalDemandVA / 1000).toFixed(2);
  const systemVoltage = panel.voltage || config.utilityVoltage || 230;
  const is3Phase = panel.system?.includes("3PH") || false;
  const demandA = (
    computed.mainCurrent?.designAmp ||
    computed.totalDemandVA / (systemVoltage * (is3Phase ? 1.732 : 1)) ||
    0
  ).toFixed(1);
  const phaseText = is3Phase ? "3PH 3W" : "1PH 2W";

  // Active branch circuits from panel schedule
  const activeCircuits = (targetCircuits || []).filter((c) => {
    const load = (c.loadVA || 0) + (c.wattage || 0);
    return load > 0 || (c.description && c.description.trim() !== "");
  });

  return {
    panel,
    circuits: targetCircuits,
    activeCircuits,
    computed,
    designation: panel.designation || "MAIN DISTRIBUTION PANEL (MDP)",
    mainFeeder: {
      cb,
      af,
      poles: Number(poles) || 2,
      kaic,
      type: panel.mainOverrides?.breakerType || panel.type || "MCCB",
      wire,
      groundSize,
      conduitSize,
      conduitType,
      feederLabel,
      conduitLabel,
    },
    connectedKVA,
    demandKVA,
    demandA,
    systemVoltage,
    is3Phase,
    phaseText,
  };
}

export type LinkedPanelData = ReturnType<typeof computeLinkedPanelData>;

/**
 * Solar back-feed overcurrent device used for the 120% busbar rule. The AC breaker in the design
 * is sized per inverter; with several inverters the combined solar output is protected by the
 * main solar disconnect (sized by the engine from the total inverter AC current).
 */
export function solarBackfeedAmps(calc: SolarCalculationResults): number {
  return calc.effective.inverterQuantity > 1 ? calc.acMainDisconnectAmps : calc.effective.acBreakerAtAmps;
}
