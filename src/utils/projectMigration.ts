import { ProjectData, MdpData, MainSourceConfig } from "../types/project";
import { PanelConfig, Circuit, ShortCircuitParams, VoltageDropCalculation, IlluminationParams } from "../types";
import { INITIAL_PANEL } from "../components/LoadSchedule";
import { INITIAL_SHORT_CIRCUIT_PARAMS, INITIAL_ILLUMINATION_PARAMS } from "../constants";
import { calculateCircuitValues, computePanelScheduleValues } from "./computeEngine";

const generateSafeId = () => {
  return typeof crypto !== 'undefined' && crypto.randomUUID 
    ? crypto.randomUUID() 
    : `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export function migrateProjectData(data: any): ProjectData {
  if (!data) {
    return {
      panel: { ...INITIAL_PANEL },
      circuits: [],
      subPanels: [],
      iscParams: { ...INITIAL_SHORT_CIRCUIT_PARAMS },
      iscSource: "auto",
      vdCalculations: [],
      illumParams: { ...INITIAL_ILLUMINATION_PARAMS }
    };
  }

  const seenCircuitIds = new Set<string>();

  // 1. Ensure panel normalization & defaults
  const migratePanel = (p: any): PanelConfig => {
    const merged: PanelConfig = {
      ...INITIAL_PANEL,
      ...p,
      mainOverrides: {
        ...(INITIAL_PANEL.mainOverrides || {}),
        ...(p?.mainOverrides || {})
      }
    };

    // Normalize transformer connection string if present
    let tc = merged.transformerConnection;
    if (tc === "Delta-Wye") tc = "Delta-Wye (Δ-Y)";
    else if (tc === "Wye (Star)") tc = "Wye (Star) Connection";
    else if (tc === "Delta") tc = "Delta Connection";
    else if (tc === "Wye-Wye") tc = "Wye-Wye (Y-Y)";
    merged.transformerConnection = tc;

    return merged;
  };

  const rawVdCalculations = data.vdCalculations || [];

  // Helper to migrate circuits and run them through calculation engine
  const migrateCircuits = (
    circuits: any[],
    panel: PanelConfig,
    availableSubPanels: any[],
    vdCalculations: VoltageDropCalculation[]
  ): Circuit[] => {
    return (circuits || []).map((c) => {
      let uniqueId = c.id;
      if (!uniqueId || seenCircuitIds.has(uniqueId)) {
        uniqueId = generateSafeId();
      }
      seenCircuitIds.add(uniqueId);

      const mergedCircuit = {
        ...c,
        id: uniqueId,
        quantity: c.quantity ?? 1,
        wattage: c.wattage ?? 0,
        voltage: c.voltage ?? panel.voltage ?? 230,
        phases: c.phases || (panel.system.includes("3PH") ? ["R", "Y", "B"] : ["R"]),
      };

      // Apply the latest calculation improvements and PEC-compliant logic dynamically
      const computed = calculateCircuitValues(
        mergedCircuit,
        panel,
        availableSubPanels,
        vdCalculations
      );

      return {
        ...mergedCircuit,
        ...computed,
      } as Circuit;
    });
  };

  // 2. Migrate Multiple Distribution Panels (MDPs) if they exist
  let migratedMdps: MdpData[] = [];
  if (data.mdps && Array.isArray(data.mdps) && data.mdps.length > 0) {
    migratedMdps = data.mdps.map((mdp: any) => {
      const panel = migratePanel(mdp.panel);
      const mergedSubPanels = [...(mdp.subPanels || []), ...(mdp.subSubPanels || [])];

      // Migrate sub-panels of the MDP first (since MDP circuits might refer to them)
      const migratedSubPanels = mergedSubPanels.map((sp: any) => {
        const spPanel = migratePanel(sp.panel);
        const spCircuits = migrateCircuits(sp.circuits || [], spPanel, [], rawVdCalculations);

        const { mainFeeder } = computePanelScheduleValues(spPanel, spCircuits, {
          vdCalculations: rawVdCalculations,
          panelId: sp.id,
        });

        return {
          id: sp.id || generateSafeId(),
          panel: {
            ...spPanel,
            mainBreakerAT: spPanel.mainOverrides?.isOverrideEnabled && spPanel.mainOverrides.breakerAT
              ? spPanel.mainOverrides.breakerAT : mainFeeder.cb,
            mainBreakerAF: spPanel.mainOverrides?.isOverrideEnabled && spPanel.mainOverrides.breakerAF
              ? spPanel.mainOverrides.breakerAF : mainFeeder.af,
            icRating: spPanel.mainOverrides?.isOverrideEnabled && spPanel.mainOverrides.kaic
              ? `${spPanel.mainOverrides.kaic}kAIC` : `${mainFeeder.kaic}kAIC`,
          },
          circuits: spCircuits,
        };
      });

      // Migrate parent MDP circuits using the migrated sub-panels
      const circuits = migrateCircuits(mdp.circuits || [], panel, migratedSubPanels, rawVdCalculations);

      const { mainFeeder } = computePanelScheduleValues(panel, circuits, {
        vdCalculations: rawVdCalculations,
        panelId: mdp.id || "main",
      });

      const updatedPanel = {
        ...panel,
        mainBreakerAT: panel.mainOverrides?.isOverrideEnabled && panel.mainOverrides.breakerAT
          ? panel.mainOverrides.breakerAT : mainFeeder.cb,
        mainBreakerAF: panel.mainOverrides?.isOverrideEnabled && panel.mainOverrides.breakerAF
          ? panel.mainOverrides.breakerAF : mainFeeder.af,
        icRating: panel.mainOverrides?.isOverrideEnabled && panel.mainOverrides.kaic
          ? `${panel.mainOverrides.kaic}kAIC` : `${mainFeeder.kaic}kAIC`,
      };

      return {
        id: mdp.id || "mdp-1",
        panel: updatedPanel,
        circuits,
        subPanels: migratedSubPanels,
      };
    });
  }

  // 3. Fallback/Legacy Single-Panel Project Migration (when mdps list does not exist)
  const legacyPanel = migratePanel(data.panel);

  const migratedSubSubPanels = (data.subSubPanels || []).map((sp: any) => {
    const spPanel = migratePanel(sp.panel);
    const spCircuits = migrateCircuits(sp.circuits || [], spPanel, [], rawVdCalculations);

    const { mainFeeder } = computePanelScheduleValues(spPanel, spCircuits, {
      vdCalculations: rawVdCalculations,
      panelId: sp.id,
    });

    return {
      id: sp.id || generateSafeId(),
      panel: {
        ...spPanel,
        mainBreakerAT: spPanel.mainOverrides?.isOverrideEnabled && spPanel.mainOverrides.breakerAT
          ? spPanel.mainOverrides.breakerAT : mainFeeder.cb,
        mainBreakerAF: spPanel.mainOverrides?.isOverrideEnabled && spPanel.mainOverrides.breakerAF
          ? spPanel.mainOverrides.breakerAF : mainFeeder.af,
        icRating: spPanel.mainOverrides?.isOverrideEnabled && spPanel.mainOverrides.kaic
          ? `${spPanel.mainOverrides.kaic}kAIC` : `${mainFeeder.kaic}kAIC`,
      },
      circuits: spCircuits,
    };
  });

  const migratedSubPanels = (data.subPanels || []).map((sp: any) => {
    const spPanel = migratePanel(sp.panel);
    const spCircuits = migrateCircuits(sp.circuits || [], spPanel, migratedSubSubPanels, rawVdCalculations);

    const { mainFeeder } = computePanelScheduleValues(spPanel, spCircuits, {
      vdCalculations: rawVdCalculations,
      panelId: sp.id,
    });

    return {
      id: sp.id || generateSafeId(),
      panel: {
        ...spPanel,
        mainBreakerAT: spPanel.mainOverrides?.isOverrideEnabled && spPanel.mainOverrides.breakerAT
          ? spPanel.mainOverrides.breakerAT : mainFeeder.cb,
        mainBreakerAF: spPanel.mainOverrides?.isOverrideEnabled && spPanel.mainOverrides.breakerAF
          ? spPanel.mainOverrides.breakerAF : mainFeeder.af,
        icRating: spPanel.mainOverrides?.isOverrideEnabled && spPanel.mainOverrides.kaic
          ? `${spPanel.mainOverrides.kaic}kAIC` : `${mainFeeder.kaic}kAIC`,
      },
      circuits: spCircuits,
    };
  });

  const mainCircuits = migrateCircuits(data.circuits || [], legacyPanel, migratedSubPanels, rawVdCalculations);

  const { mainFeeder: mainFeederData } = computePanelScheduleValues(legacyPanel, mainCircuits, {
    vdCalculations: rawVdCalculations,
    panelId: "main",
  });

  const loadedPanel = {
    ...legacyPanel,
    mainBreakerAT: legacyPanel.mainOverrides?.isOverrideEnabled && legacyPanel.mainOverrides.breakerAT
      ? legacyPanel.mainOverrides.breakerAT : mainFeederData.cb,
    mainBreakerAF: legacyPanel.mainOverrides?.isOverrideEnabled && legacyPanel.mainOverrides.breakerAF
      ? legacyPanel.mainOverrides.breakerAF : mainFeederData.af,
    icRating: legacyPanel.mainOverrides?.isOverrideEnabled && legacyPanel.mainOverrides.kaic
      ? `${legacyPanel.mainOverrides.kaic}kAIC` : `${mainFeederData.kaic}kAIC`,
  };

  const finalMdps = migratedMdps.length > 0 
    ? migratedMdps 
    : [{
        id: "mdp-1",
        panel: loadedPanel,
        circuits: mainCircuits,
        subPanels: [...migratedSubPanels, ...migratedSubSubPanels],
      }];

  // 4. Migrate Voltage Drop Calculations with updated metrics
  const activeMdp = finalMdps[0];
  const activePanel = activeMdp.panel;
  const activeCircuits = activeMdp.circuits;
  const activeSubPanels = activeMdp.subPanels;

  const migratedVdCalculations = rawVdCalculations.map((vd: any) => {
    if (vd.source === "main") {
      const { mainCurrent, mainFeeder } = computePanelScheduleValues(activePanel, activeCircuits);
      return {
        ...vd,
        loadA: Number(mainCurrent.baseAmp.toFixed(2)),
        wireSize: mainFeeder.wire.size.toString(),
        wireSets: mainFeeder.wire.runs || 1,
        voltage: activePanel.voltage,
        systemType: (activePanel.system.includes("3PH") ? "3PH" : "1PH") as "1PH" | "3PH",
      };
    } else if (vd.source !== "custom") {
      const sp = activeSubPanels.find((s) => s.id === vd.source);
      if (sp) {
        const { mainCurrent, mainFeeder } = computePanelScheduleValues(sp.panel, sp.circuits);
        return {
          ...vd,
          loadA: Number(mainCurrent.baseAmp.toFixed(2)),
          wireSize: mainFeeder.wire.size.toString(),
          wireSets: mainFeeder.wire.runs || 1,
          voltage: sp.panel.voltage,
          systemType: (sp.panel.system.includes("3PH") ? "3PH" : "1PH") as "1PH" | "3PH",
        };
      }
    }
    return vd;
  });

  // 5. Ensure illumination default parameters
  const migratedIllum = {
    ...INITIAL_ILLUMINATION_PARAMS,
    ...data.illumParams,
  };

  // 6. Ensure short circuit parameters are updated with standard fallback options
  const migratedIscParams: ShortCircuitParams = {
    ...INITIAL_SHORT_CIRCUIT_PARAMS,
    ...data.iscParams,
  };

  // 7. Ensure modern transformer configuration fields
  const transformerConfig = data.transformerConfig || {
    primaryVoltage: 13800,
    powerFactor: 0.85,
    demandFactor: 0.8,
    loadingFactor: 0.8,
  };

  // 8. Ensure main source config parameters
  const mainSource: MainSourceConfig = data.mainSource || {
    systemVoltage: activePanel.voltage,
    systemFrequency: activePanel.frequency,
    phaseConfiguration: activePanel.system,
    transformerConnection: activePanel.transformerConnection || "N/A",
    availableFaultCurrent: migratedIscParams.utilityShortCircuitMVA || 10,
    sourceCapacity: 500,
    utilityProvider: activePanel.utilityProvider || "Utility",
  };

  return {
    ...data,
    panel: activePanel,
    circuits: activeCircuits,
    subPanels: activeSubPanels,
    mdps: finalMdps,
    iscParams: migratedIscParams,
    iscSource: data.iscSource || "auto",
    vdCalculations: migratedVdCalculations,
    illumParams: migratedIllum,
    transformerConfig,
    mainSource,
  };
}
