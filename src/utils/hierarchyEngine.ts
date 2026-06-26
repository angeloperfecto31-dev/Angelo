import { Circuit, PanelConfig, LoadType, VoltageDropCalculation, MCBType } from "../types";
import { computePanelScheduleValues, calculateCircuitValues, formatWireSizeLocal, isIdleSpareOrSpace } from "./computeEngine";

export interface PanelNode {
  id: string;
  panel: PanelConfig;
  circuits: Circuit[];
  parentId?: string | null;
  level: number;
}

export function buildHierarchy(
  mdpCircuits: Circuit[],
  subPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[]
): { nodes: PanelNode[]; sortedNodeIds: string[]; hasCircular: boolean } {
  const nodes = new Map<string, PanelNode>();
  
  // Initialize nodes
  subPanels.forEach(sp => {
    nodes.set(sp.id, {
      ...sp,
      parentId: null,
      level: 0,
    });
  });

  // Map links
  const addLinks = (circuits: Circuit[], parentId: string | null) => {
    circuits.forEach(c => {
      if ((c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL) && c.linkedSubPanelId) {
        const childNode = nodes.get(c.linkedSubPanelId);
        if (childNode) {
          childNode.parentId = parentId;
        }
      }
    });
  };

  addLinks(mdpCircuits, 'mdp');
  subPanels.forEach(sp => addLinks(sp.circuits, sp.id));

  // Compute topological order (post-order / leaves first)
  const sortedNodeIds: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  let hasCircular = false;

  const visit = (id: string) => {
    if (visiting.has(id)) {
      hasCircular = true;
      return;
    }
    if (!visited.has(id)) {
      visiting.add(id);
      const node = nodes.get(id);
      if (node) {
        node.circuits.forEach(c => {
          if ((c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL) && c.linkedSubPanelId) {
            visit(c.linkedSubPanelId);
          }
        });
      }
      visiting.delete(id);
      visited.add(id);
      sortedNodeIds.push(id);
    }
  };

  // Start from all nodes
  for (const id of nodes.keys()) {
    if (!visited.has(id)) {
      visit(id);
    }
  }

  // Compute levels
  const mdpLevel = 0;
  for (let i = sortedNodeIds.length - 1; i >= 0; i--) {
    const id = sortedNodeIds[i];
    const node = nodes.get(id);
    if (node) {
      if (node.parentId === 'mdp') {
        node.level = 1;
      } else if (node.parentId) {
        const parent = nodes.get(node.parentId);
        if (parent) {
          node.level = parent.level + 1;
        }
      }
    }
  }

  return { nodes: Array.from(nodes.values()), sortedNodeIds, hasCircular };
}

export function syncHierarchyData(
  mdpPanel: PanelConfig,
  mdpCircuits: Circuit[],
  subPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[],
  vdCalculations: VoltageDropCalculation[]
): { updatedMdpCircuits: Circuit[], updatedSubPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[], hasChanges: boolean } {
  
  const { nodes, sortedNodeIds, hasCircular } = buildHierarchy(mdpCircuits, subPanels);
  if (hasCircular) {
    // If circular, return unmodified
    return { updatedMdpCircuits: mdpCircuits, updatedSubPanels: subPanels, hasChanges: false };
  }

  const updatedNodes = new Map<string, { id: string; panel: PanelConfig; circuits: Circuit[] }>();
  subPanels.forEach(sp => updatedNodes.set(sp.id, { ...sp, circuits: [...sp.circuits] }));
  
  let currentMdpCircuits = [...mdpCircuits];

  // Process from leaves to root
  for (const id of sortedNodeIds) {
    const sp = updatedNodes.get(id);
    if (!sp) continue;

    // 1. Recalculate circuits in this subpanel using updated children values
    // Children were already processed because of topological sort!
    sp.circuits = sp.circuits.map(c => {
      // If it's a subpanel circuit, calculateCircuitValues will read from availableSubPanels.
      // So we must pass the updated nodes.
      const updated = calculateCircuitValues(c, sp.panel, Array.from(updatedNodes.values()), vdCalculations);
      return { ...c, ...updated };
    });
    
    // We do NOT need to manually update the parent circuit here.
    // The topological sort guarantees that the parent will be processed AFTER this subpanel,
    // and when the parent's circuits are mapped through `calculateCircuitValues`, 
    // they will read the updated values from this subpanel dynamically!
  }

  // Finally recalculate MDP circuits itself
  let hasChanges = false;
  currentMdpCircuits = currentMdpCircuits.map((c, i) => {
    const updated = calculateCircuitValues(c, mdpPanel, Array.from(updatedNodes.values()), vdCalculations);
    const newCircuit = { ...c, ...updated };
    if (JSON.stringify(c) !== JSON.stringify(newCircuit)) {
      hasChanges = true;
    }
    return newCircuit;
  });

  const finalSubPanels = Array.from(updatedNodes.values());
  if (JSON.stringify(subPanels) !== JSON.stringify(finalSubPanels)) {
    hasChanges = true;
  }

  return { updatedMdpCircuits: currentMdpCircuits, updatedSubPanels: finalSubPanels, hasChanges };
}
