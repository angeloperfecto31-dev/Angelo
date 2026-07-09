import { Circuit, PanelConfig, LoadType, VoltageDropCalculation, MCBType } from "../types";
import { computePanelScheduleValues, calculateCircuitValues, formatWireSizeLocal, isIdleSpareOrSpace } from "./computeEngine";
import { isEqual } from "lodash";

export interface PanelNode {
  id: string;
  panel: PanelConfig;
  circuits: Circuit[];
  parentId?: string | null;
  level: number;
}

export function sanitizePanelHierarchy(
  mdpCircuits: Circuit[],
  subPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[]
): {
  sanitizedMdpCircuits: Circuit[];
  sanitizedSubPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[];
  hasSanitizationChanges: boolean;
} {
  let hasChanges = false;
  const seenSubPanels = new Set<string>();

  // parentMap: childId -> parentId
  const parentMap = new Map<string, string>();

  const isAncestor = (ancestorId: string, descendantId: string): boolean => {
    let curr = parentMap.get(descendantId);
    const visited = new Set<string>();
    while (curr && !visited.has(curr)) {
      if (curr === ancestorId) return true;
      visited.add(curr);
      curr = parentMap.get(curr);
    }
    return false;
  };

  const processCircuits = (circuits: Circuit[], currentPanelId: string): Circuit[] => {
    return circuits.map((c) => {
      if ((c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL) && c.linkedSubPanelId) {
        const childId = c.linkedSubPanelId;

        // 1. Self-parenting check
        if (childId === currentPanelId) {
          hasChanges = true;
          return { ...c, linkedSubPanelId: undefined };
        }

        // 2. Multi-parent check (Each subpanel can have only one parent)
        if (seenSubPanels.has(childId)) {
          hasChanges = true;
          return { ...c, linkedSubPanelId: undefined };
        }

        // 3. Circular reference check
        if (currentPanelId !== "mdp" && isAncestor(childId, currentPanelId)) {
          hasChanges = true;
          return { ...c, linkedSubPanelId: undefined };
        }

        // Track valid connection
        seenSubPanels.add(childId);
        parentMap.set(childId, currentPanelId);
      }
      return c;
    });
  };

  const sanitizedMdpCircuits = processCircuits(mdpCircuits, "mdp");

  const sanitizedSubPanels = subPanels.map((sp) => {
    const nextCircuits = processCircuits(sp.circuits, sp.id);
    if (!isEqual(cleanObj(sp.circuits), cleanObj(nextCircuits))) {
      hasChanges = true;
      return { ...sp, circuits: nextCircuits };
    }
    return sp;
  });

  return {
    sanitizedMdpCircuits,
    sanitizedSubPanels,
    hasSanitizationChanges: hasChanges,
  };
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

function cleanObj(obj: any): any {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(cleanObj);
  const result: any = {};
  for (const key in obj) {
    if (obj[key] !== undefined && !Number.isNaN(obj[key])) {
      result[key] = cleanObj(obj[key]);
    }
  }
  return result;
};

export function syncHierarchyData(
  mdpPanel: PanelConfig,
  mdpCircuits: Circuit[],
  subPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[],
  vdCalculations: VoltageDropCalculation[]
): { updatedMdpCircuits: Circuit[], updatedSubPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[], hasChanges: boolean } {
  
  // 1. Sanitize the hierarchy first (prune self-parenting, duplicate, or circular references)
  const {
    sanitizedMdpCircuits,
    sanitizedSubPanels,
    hasSanitizationChanges,
  } = sanitizePanelHierarchy(mdpCircuits, subPanels);

  const activeMdpCircuits = hasSanitizationChanges ? sanitizedMdpCircuits : mdpCircuits;
  const activeSubPanels = hasSanitizationChanges ? sanitizedSubPanels : subPanels;

  const { nodes, sortedNodeIds, hasCircular } = buildHierarchy(activeMdpCircuits, activeSubPanels);
  if (hasCircular) {
    // Should not happen as we just sanitized it, but as a safe fallback
    return {
      updatedMdpCircuits: activeMdpCircuits,
      updatedSubPanels: activeSubPanels,
      hasChanges: hasSanitizationChanges,
    };
  }

  const updatedNodes = new Map<string, { id: string; panel: PanelConfig; circuits: Circuit[] }>();
  activeSubPanels.forEach(sp => updatedNodes.set(sp.id, { ...sp, circuits: [...sp.circuits] }));
  
  let currentMdpCircuits = [...activeMdpCircuits];

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
  let hasChanges = hasSanitizationChanges;
  currentMdpCircuits = currentMdpCircuits.map((c, i) => {
    const updated = calculateCircuitValues(c, mdpPanel, Array.from(updatedNodes.values()), vdCalculations);
    const newCircuit = { ...c, ...updated };
    if (!isEqual(cleanObj(c), cleanObj(newCircuit))) {
      hasChanges = true;
    }
    return newCircuit;
  });

  const finalSubPanels = Array.from(updatedNodes.values());
  if (!isEqual(cleanObj(subPanels), cleanObj(finalSubPanels))) {
    hasChanges = true;
  }

  return { updatedMdpCircuits: currentMdpCircuits, updatedSubPanels: finalSubPanels, hasChanges };
}
