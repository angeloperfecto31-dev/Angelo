import React, { useState } from "react";
import { SolarDesignConfig, SolarCalculationResults, SolarBOMItem } from "../../types/solar";
import { generateSolarBOM } from "../../utils/solarEngine";
import { exportSolarToExcel } from "../../utils/exportSolarExcel";
import { exportSolarToPdf } from "../../utils/exportSolarPdf";
import { SolarQuotationModal } from "./SolarQuotationModal";
import {
  FileSpreadsheet,
  Plus,
  Trash2,
  RotateCcw,
  Sparkles,
  DollarSign,
  TrendingUp,
  Boxes,
  Download,
  Receipt,
  FileCheck,
} from "lucide-react";

interface SolarBOMTabProps {
  config: SolarDesignConfig;
  calc: SolarCalculationResults;
  onChange: (updated: Partial<SolarDesignConfig>) => void;
  projectInfo?: {
    projectName?: string;
    projectLocation?: string;
    clientName?: string;
    designerName?: string;
  };
}

export const SolarBOMTab: React.FC<SolarBOMTabProps> = ({
  config,
  calc,
  onChange,
  projectInfo,
}) => {
  const [isQuotationOpen, setIsQuotationOpen] = useState(false);
  const [newItem, setNewItem] = useState<Partial<SolarBOMItem>>({
    category: "Wiring & Conduit",
    itemDescription: "",
    manufacturer: "",
    model: "",
    quantity: 1,
    unit: "lot",
    unitCostPhp: 0,
    markupPercent: 15,
  });

  // If BOM is empty, generate from engine
  const items = config.bomItems && config.bomItems.length > 0 ? config.bomItems : generateSolarBOM(config, calc);

  const handleUpdateItem = (index: number, updated: Partial<SolarBOMItem>) => {
    const nextItems = [...items];
    const current = { ...nextItems[index], ...updated };
    const unitPriceWithMarkup = current.unitCostPhp * (1 + current.markupPercent / 100);
    current.totalCostPhp = Math.round(current.quantity * unitPriceWithMarkup);
    nextItems[index] = current;
    onChange({ bomItems: nextItems });
  };

  const handleDeleteItem = (index: number) => {
    const nextItems = items.filter((_, idx) => idx !== index);
    onChange({ bomItems: nextItems });
  };

  const handleResetBOM = () => {
    const generated = generateSolarBOM(config, calc);
    onChange({ bomItems: generated });
  };

  const handleAddItem = () => {
    if (!newItem.itemDescription) return;
    const item: SolarBOMItem = {
      id: `bom-item-${Date.now()}`,
      category: newItem.category || "General",
      itemDescription: newItem.itemDescription,
      manufacturer: newItem.manufacturer || "N/A",
      model: newItem.model || "N/A",
      quantity: newItem.quantity || 1,
      unit: newItem.unit || "lot",
      unitCostPhp: newItem.unitCostPhp || 0,
      markupPercent: newItem.markupPercent || 15,
      totalCostPhp: Math.round(
        (newItem.quantity || 1) *
          (newItem.unitCostPhp || 0) *
          (1 + (newItem.markupPercent || 15) / 100)
      ),
    };
    onChange({ bomItems: [...items, item] });
    setNewItem({
      category: "Wiring & Conduit",
      itemDescription: "",
      manufacturer: "",
      model: "",
      quantity: 1,
      unit: "lot",
      unitCostPhp: 0,
      markupPercent: 15,
    });
  };

  // Financial summary
  const subtotalCostPhp = items.reduce(
    (acc, it) => acc + it.quantity * it.unitCostPhp,
    0
  );
  const grandTotalPhp = items.reduce((acc, it) => acc + it.totalCostPhp, 0);
  const totalMarkupPhp = grandTotalPhp - subtotalCostPhp;
  const costPerWattDc =
    calc.totalDcCapacityW > 0
      ? Number((grandTotalPhp / calc.totalDcCapacityW).toFixed(2))
      : 0;

  return (
    <div className="space-y-6">
      {/* 1. Cost Overview Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Base Equipment Subtotal
          </span>
          <span className="text-lg font-black text-slate-900 dark:text-slate-100 mt-1 block">
            ₱ {subtotalCostPhp.toLocaleString()}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Net material cost</span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Contractor Markup / Margin
          </span>
          <span className="text-lg font-black text-amber-600 dark:text-amber-400 mt-1 block">
            ₱ {totalMarkupPhp.toLocaleString()}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Margin & contingency</span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Estimated Grand Total (BOM)
          </span>
          <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
            ₱ {grandTotalPhp.toLocaleString()}
          </span>
          <span className="text-[10px] text-emerald-600/80 mt-0.5 block">Turnkey Material Scope</span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Installed Cost Metric
          </span>
          <span className="text-lg font-black text-sky-600 dark:text-sky-400 mt-1 block">
            ₱ {costPerWattDc.toFixed(2)} / Wp
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">
            Based on {calc.totalDcCapacityKwp} kWp DC
          </span>
        </div>
      </div>

      {/* 2. Bill of Materials Table */}
      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Boxes className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Solar Photovoltaic Bill of Materials (BOM) & Equipment Schedule
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsQuotationOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-gradient-to-r from-sky-600 via-indigo-600 to-blue-600 hover:from-sky-700 hover:to-indigo-700 text-white shadow-sm hover:shadow-md rounded-xl transition cursor-pointer"
              title="Generate Turnkey Quotation / Client Proposal"
            >
              <Receipt className="w-3.5 h-3.5 text-sky-200" />
              <span>Generate Quotation / Proposal</span>
            </button>
            <button
              onClick={() => exportSolarToExcel({ ...config, bomItems: items }, calc)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl transition"
              title="Export Solar BOM to Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export Excel</span>
            </button>
            <button
              onClick={() => exportSolarToPdf({ ...config, bomItems: items }, calc)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-xl transition"
              title="Export Solar Engineering PDF Report"
            >
              <Download className="w-3.5 h-3.5 text-amber-600" />
              <span>Export PDF</span>
            </button>
            <button
              onClick={handleResetBOM}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Recalculate & Sync BOM</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200/80 dark:border-slate-700/60 text-[11px] font-bold text-slate-600 dark:text-slate-400">
                <th className="py-2.5 px-3">Item</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3 min-w-[220px]">Description & Specifications</th>
                <th className="py-2.5 px-3">Qty</th>
                <th className="py-2.5 px-3">Unit</th>
                <th className="py-2.5 px-3 min-w-[110px]">Unit Price (₱)</th>
                <th className="py-2.5 px-3 w-20">Markup %</th>
                <th className="py-2.5 px-3 text-right min-w-[110px]">Total Price (₱)</th>
                <th className="py-2.5 px-2 text-center w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((it, idx) => (
                <tr
                  key={it.id || idx}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition"
                >
                  <td className="py-2 px-3 font-semibold text-slate-500">{idx + 1}</td>
                  <td className="py-2 px-3">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300">
                      {it.category}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">
                    <div>{it.itemDescription}</div>
                    {it.manufacturer && (
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {it.manufacturer} • {it.model}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      min="1"
                      value={it.quantity}
                      onChange={(e) =>
                        handleUpdateItem(idx, {
                          quantity: Math.max(1, parseFloat(e.target.value) || 1),
                        })
                      }
                      className="w-16 px-1.5 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </td>
                  <td className="py-2 px-3 text-slate-500">{it.unit}</td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      min="0"
                      value={it.unitCostPhp}
                      onChange={(e) =>
                        handleUpdateItem(idx, {
                          unitCostPhp: Math.max(0, parseFloat(e.target.value) || 0),
                        })
                      }
                      className="w-24 px-1.5 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      min="0"
                      value={it.markupPercent}
                      onChange={(e) =>
                        handleUpdateItem(idx, {
                          markupPercent: Math.max(0, parseFloat(e.target.value) || 0),
                        })
                      }
                      className="w-14 px-1.5 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-center"
                    />
                  </td>
                  <td className="py-2 px-3 text-right font-black text-slate-800 dark:text-slate-100">
                    ₱ {it.totalCostPhp.toLocaleString()}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <button
                      onClick={() => handleDeleteItem(idx)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                      title="Remove item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add custom item footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200/80 dark:border-slate-700/60">
          <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
            Add Custom Line Item
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-2 text-xs">
            <select
              value={newItem.category}
              onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
              className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              <option value="PV Equipment">PV Equipment</option>
              <option value="Mounting & Structure">Mounting & Structure</option>
              <option value="DC Equipment">DC Equipment</option>
              <option value="AC Equipment">AC Equipment</option>
              <option value="Wiring & Conduit">Wiring & Conduit</option>
              <option value="Safety & Accessories">Safety & Accessories</option>
              <option value="Services & Labor">Services & Labor</option>
            </select>
            <input
              type="text"
              placeholder="Item Description"
              value={newItem.itemDescription}
              onChange={(e) => setNewItem({ ...newItem, itemDescription: e.target.value })}
              className="md:col-span-2 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
            <input
              type="number"
              placeholder="Qty"
              min="1"
              value={newItem.quantity}
              onChange={(e) =>
                setNewItem({ ...newItem, quantity: parseFloat(e.target.value) || 1 })
              }
              className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
            <input
              type="number"
              placeholder="Unit Cost (₱)"
              min="0"
              value={newItem.unitCostPhp}
              onChange={(e) =>
                setNewItem({ ...newItem, unitCostPhp: parseFloat(e.target.value) || 0 })
              }
              className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
            <button
              onClick={handleAddItem}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-xs transition flex items-center justify-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Item</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quotation & Proposal Generator Modal */}
      <SolarQuotationModal
        isOpen={isQuotationOpen}
        onClose={() => setIsQuotationOpen(false)}
        config={config}
        calc={calc}
        onUpdateConfig={onChange}
        projectInfo={projectInfo}
      />
    </div>
  );
};
