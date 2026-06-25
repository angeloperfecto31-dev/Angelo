import React, { useState, useEffect } from "react";
import { collection, onSnapshot, doc, setDoc, addDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Shield, Settings, AlertCircle, CheckCircle, EyeOff, Power, Search } from "lucide-react";

export type ModuleStatus = "active" | "hidden" | "disabled" | "maintenance";

export interface SystemModule {
  id: string;
  name: string;
  status: ModuleStatus;
  maintenanceMessage?: string;
  expectedCompletion?: string;
  updatedBy?: string;
  updatedAt?: string;
}

interface Props {
  adminEmail: string | undefined;
}

export const DEFAULT_MODULES: SystemModule[] = [
  { id: "dashboard", name: "Dashboard", status: "active" },
  { id: "schedule", name: "Load Schedule", status: "active" },
  { id: "power-suite", name: "Power Analysis Suite", status: "active" },
  { id: "isc", name: "Short Circuit Analysis", status: "active" },
  { id: "vd", name: "Voltage Drop Calculation", status: "active" },
  { id: "lighting", name: "Illumination", status: "active" },
  { id: "system-sld", name: "System SLD", status: "active" },
  { id: "floor-plan", name: "Floor Plan", status: "active" },
  { id: "current-calc", name: "PEC Calculator", status: "active" },
  { id: "egc", name: "EGC Sizer", status: "active" },
  { id: "transformer", name: "Transformer Capacity", status: "active" },
];

export const ModuleManagement: React.FC<Props> = ({ adminEmail }) => {
  const [modules, setModules] = useState<SystemModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingModule, setEditingModule] = useState<SystemModule | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "modules"), (snapshot) => {
      const docs = snapshot.docs.map(d => d.data() as SystemModule);
      // Merge with defaults
      const merged = DEFAULT_MODULES.map(def => {
        const found = docs.find(d => d.id === def.id);
        return found || def;
      });
      setModules(merged);
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleUpdate = async (mod: SystemModule, newStatus: ModuleStatus, msg?: string, eta?: string) => {
    const previousStatus = mod.status;
    const updatePayload: SystemModule = {
      ...mod,
      status: newStatus,
      maintenanceMessage: msg || "",
      expectedCompletion: eta || "",
      updatedBy: adminEmail || "Unknown",
      updatedAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, "modules", mod.id), updatePayload);
      
      // Audit Log
      await addDoc(collection(db, "moduleAuditLogs"), {
        adminEmail: adminEmail || "Unknown",
        adminName: adminEmail || "Unknown",
        moduleId: mod.id,
        moduleName: mod.name,
        previousStatus,
        newStatus,
        reason: "Admin manual update",
        timestamp: new Date().toISOString()
      });
      
      setEditingModule(null);
    } catch (err) {
      console.error(err);
      alert("Failed to update module.");
    }
  };

  if (loading) return <div className="p-8">Loading modules...</div>;

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center">
          <Settings className="w-6 h-6 mr-2 text-indigo-600" />
          Module Visibility & Maintenance Control
        </h2>
      </div>

      <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Module</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {modules.map((mod) => (
              <tr key={mod.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="text-sm font-medium text-gray-900">{mod.name}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {mod.status === "active" && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1"/> Active</span>}
                  {mod.status === "hidden" && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"><EyeOff className="w-3 h-3 mr-1"/> Hidden</span>}
                  {mod.status === "disabled" && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><Power className="w-3 h-3 mr-1"/> Disabled</span>}
                  {mod.status === "maintenance" && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"><AlertCircle className="w-3 h-3 mr-1"/> Maintenance</span>}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {mod.updatedAt ? new Date(mod.updatedAt).toLocaleString() : "Never"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button onClick={() => setEditingModule(mod)} className="text-indigo-600 hover:text-indigo-900">Configure</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingModule && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[99]">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold mb-4">Configure {editingModule.name}</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select 
                  className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  value={editingModule.status}
                  onChange={(e) => setEditingModule({...editingModule, status: e.target.value as ModuleStatus})}
                >
                  <option value="active">Active (Visible to all)</option>
                  <option value="hidden">Hidden (Accessible, but removed from menu)</option>
                  <option value="disabled">Disabled (Hidden from non-admins)</option>
                  <option value="maintenance">Maintenance (Shows maintenance page)</option>
                </select>
              </div>

              {editingModule.status === "maintenance" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Maintenance Message</label>
                    <textarea 
                      className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                      rows={3}
                      value={editingModule.maintenanceMessage || ""}
                      onChange={(e) => setEditingModule({...editingModule, maintenanceMessage: e.target.value})}
                      placeholder="We are currently upgrading this module..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Expected Completion Time (Optional)</label>
                    <input 
                      type="text"
                      className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                      value={editingModule.expectedCompletion || ""}
                      onChange={(e) => setEditingModule({...editingModule, expectedCompletion: e.target.value})}
                      placeholder="e.g. 2 Hours, Tomorrow 5PM"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button 
                onClick={() => setEditingModule(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleUpdate(editingModule, editingModule.status, editingModule.maintenanceMessage, editingModule.expectedCompletion)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
