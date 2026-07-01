import React, { useState } from "react";
import { MainSourceConfig, MdpData } from "../types/project";
import { Plus, Copy, Trash2, Edit2, Settings, Zap, CheckCircle2 } from "lucide-react";
import { INITIAL_PANEL } from "./LoadSchedule";
import { getFreshInitialCircuits } from "../App";
import { SYSTEM_VOLTAGES } from "../constants";

interface Props {
  mainSource: MainSourceConfig;
  setMainSource: (val: MainSourceConfig | ((prev: MainSourceConfig) => MainSourceConfig)) => void;
  mdps: MdpData[];
  setMdps: (val: MdpData[] | ((prev: MdpData[]) => MdpData[])) => void;
  activeMdpId: string;
  setActiveMdpId: (id: string) => void;
}

export const PanelManagement: React.FC<Props> = ({
  mainSource,
  setMainSource,
  mdps,
  setMdps,
  activeMdpId,
  setActiveMdpId,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleSourceChange = (field: keyof MainSourceConfig, value: any) => {
    setMainSource((prev) => {
      const next = { ...prev, [field]: value };
      
      if (field === 'phaseConfiguration' && SYSTEM_VOLTAGES[value as keyof typeof SYSTEM_VOLTAGES]) {
        next.systemVoltage = SYSTEM_VOLTAGES[value as keyof typeof SYSTEM_VOLTAGES];
      }
      
      // Auto-sync voltage, frequency, phase config, and transformer connection to ALL MDPs
      if (['systemVoltage', 'systemFrequency', 'phaseConfiguration', 'transformerConnection'].includes(field)) {
        setMdps(mdps.map(mdp => ({
          ...mdp,
          panel: {
            ...mdp.panel,
            voltage: next.systemVoltage,
            frequency: next.systemFrequency,
            system: next.phaseConfiguration,
            transformerConnection: next.transformerConnection
          }
        })));
      }
      return next;
    });
  };

  const handleAddMdp = () => {
    const newId = `mdp-${crypto.randomUUID().slice(0, 8)}`;
    setMdps((prev) => [
      ...prev,
      {
        id: newId,
        panel: {
          ...INITIAL_PANEL,
          designation: `MDP-${prev.length + 1}`,
          voltage: mainSource.systemVoltage,
          frequency: mainSource.systemFrequency,
          system: mainSource.phaseConfiguration,
        },
        circuits: getFreshInitialCircuits(),
        subPanels: [],
      },
    ]);
    setActiveMdpId(newId);
  };

  const handleDuplicate = (mdp: MdpData) => {
    const newId = `mdp-${crypto.randomUUID().slice(0, 8)}`;
    setMdps((prev) => [
      ...prev,
      {
        ...mdp,
        id: newId,
        panel: {
          ...mdp.panel,
          designation: `${mdp.panel.designation} (Copy)`,
        },
      },
    ]);
  };

  const handleDelete = (id: string) => {
    if (mdps.length === 1) {
      alert("You must have at least one MDP.");
      return;
    }
    setMdps((prev) => prev.filter((m) => m.id !== id));
    if (activeMdpId === id) {
      setActiveMdpId(mdps.find((m) => m.id !== id)!.id);
    }
  };

  const handleRenameSubmit = (id: string) => {
    if (editName.trim()) {
      setMdps((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, panel: { ...m.panel, designation: editName } } : m
        )
      );
    }
    setEditingId(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center gap-3">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Main Source Configuration</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Settings here will automatically synchronize to all connected MDPs.</p>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">System Voltage (V)</label>
            <input
              type="number"
              value={mainSource.systemVoltage}
              onChange={(e) => handleSourceChange("systemVoltage", Number(e.target.value))}
              className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Frequency (Hz)</label>
            <input
              type="number"
              value={mainSource.systemFrequency}
              onChange={(e) => handleSourceChange("systemFrequency", Number(e.target.value))}
              className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Phase Configuration</label>
            <select
              value={mainSource.phaseConfiguration}
              onChange={(e) => handleSourceChange("phaseConfiguration", e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <optgroup
                label="Single-Phase (1PH) Systems"
                className="bg-white dark:bg-slate-900 text-xs font-bold text-slate-400 dark:text-slate-500"
              >
                {Object.keys(SYSTEM_VOLTAGES)
                  .filter((s) => s.includes("1PH"))
                  .map((s) => (
                    <option
                      key={s}
                      value={s}
                      className="font-normal text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900"
                    >
                      {s}
                    </option>
                  ))}
              </optgroup>
              <optgroup
                label="Three-Phase, 5-Wire (3PH, 5W) Systems"
                className="bg-white dark:bg-slate-900 text-xs font-bold text-slate-400 dark:text-slate-500"
              >
                {Object.keys(SYSTEM_VOLTAGES)
                  .filter((s) => s.includes("3PH") && s.includes("5W"))
                  .map((s) => (
                    <option
                      key={s}
                      value={s}
                      className="font-normal text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900"
                    >
                      {s}
                    </option>
                  ))}
              </optgroup>
              <optgroup
                label="Three-Phase, 4-Wire (3PH, 4W) Systems"
                className="bg-white dark:bg-slate-900 text-xs font-bold text-slate-400 dark:text-slate-500"
              >
                {Object.keys(SYSTEM_VOLTAGES)
                  .filter((s) => s.includes("3PH") && s.includes("4W"))
                  .map((s) => (
                    <option
                      key={s}
                      value={s}
                      className="font-normal text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900"
                    >
                      {s}
                    </option>
                  ))}
              </optgroup>
              <optgroup
                label="Three-Phase, 3-Wire (3PH, 3W) Systems"
                className="bg-white dark:bg-slate-900 text-xs font-bold text-slate-400 dark:text-slate-500"
              >
                {Object.keys(SYSTEM_VOLTAGES)
                  .filter((s) => s.includes("3PH") && s.includes("3W"))
                  .map((s) => (
                    <option
                      key={s}
                      value={s}
                      className="font-normal text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900"
                    >
                      {s}
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Transformer Connection</label>
            <select
              value={mainSource.transformerConnection || "Delta-Wye (Δ-Y)"}
              onChange={(e) => handleSourceChange("transformerConnection", e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="Wye (Star) Connection">Wye (Star) Connection</option>
              <option value="Delta Connection">Delta Connection</option>
              <option value="Delta-Wye (Δ-Y)">Delta-Wye (Δ-Y)</option>
              <option value="Wye-Delta (Y-Δ)">Wye-Delta (Y-Δ)</option>
              <option value="Delta-Delta (Δ-Δ)">Delta-Delta (Δ-Δ)</option>
              <option value="Wye-Wye (Y-Y)">Wye-Wye (Y-Y)</option>
              <option value="Open Delta (V-V)">Open Delta (V-V)</option>
              <option value="Scott-T Connection">Scott-T Connection</option>
              <option value="Zigzag Connection">Zigzag Connection</option>
              <option value="Center-Tapped (Split-Phase)">Center-Tapped (Split-Phase)</option>
              <option value="High-Leg Delta">High-Leg Delta</option>
              <option value="Corner-Grounded Delta">Corner-Grounded Delta</option>
              <option value="N/A">N/A</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Available Fault Current (kA)</label>
            <input
              type="number"
              value={mainSource.availableFaultCurrent}
              onChange={(e) => handleSourceChange("availableFaultCurrent", Number(e.target.value))}
              className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Source Capacity (kVA)</label>
            <input
              type="number"
              value={mainSource.sourceCapacity}
              onChange={(e) => handleSourceChange("sourceCapacity", Number(e.target.value))}
              className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Main Distribution Panels (MDPs)</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Manage all MDPs connected to the common source.</p>
            </div>
          </div>
          <button
            onClick={handleAddMdp}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> Add MDP
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mdps.map((mdp) => {
              const isActive = activeMdpId === mdp.id;
              return (
                <div
                  key={mdp.id}
                  className={`relative p-5 rounded-xl border-2 transition-all cursor-pointer ${
                    isActive
                      ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10 shadow-md"
                      : "border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700"
                  }`}
                  onClick={() => setActiveMdpId(mdp.id)}
                >
                  {isActive && (
                    <div className="absolute -top-3 -right-3 bg-indigo-500 text-white rounded-full p-1 shadow-sm">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between mb-4">
                    {editingId === mdp.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => handleRenameSubmit(mdp.id)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit(mdp.id)}
                        className="text-lg font-bold bg-white dark:bg-slate-950 border border-slate-300 rounded px-2 py-1 w-full mr-2"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <h4 className="text-lg font-bold text-slate-900 dark:text-white truncate pr-2">
                        {mdp.panel.designation || "Unnamed MDP"}
                      </h4>
                    )}
                    
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingId(mdp.id); setEditName(mdp.panel.designation); }}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                        title="Rename"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDuplicate(mdp); }}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                        title="Duplicate"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(mdp.id); }}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
                    <p>Circuits: <span className="font-medium text-slate-900 dark:text-slate-200">{mdp.circuits.length}</span></p>
                    <p>Sub-Panels: <span className="font-medium text-slate-900 dark:text-slate-200">{mdp.subPanels.length}</span></p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
