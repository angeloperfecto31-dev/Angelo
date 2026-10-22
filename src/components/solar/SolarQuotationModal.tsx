import React, { useState } from "react";
import {
  SolarDesignConfig,
  SolarCalculationResults,
  SolarQuotationConfig,
  SolarQuotationItem,
  PricingDisplayMode,
  ProposalSubmissionMode,
} from "../../types/solar";
import {
  generateDefaultSolarQuotation,
  calculateQuotationTotals,
  syncQuotationWithBOM,
  incrementQuotationRevision,
} from "../../utils/solarQuotationEngine";
import { exportSolarProposalPdf } from "../../utils/exportSolarProposalPdf";
import { exportSolarProposalWord } from "../../utils/exportSolarProposalWord";
import {
  X,
  FileText,
  FileSpreadsheet,
  Download,
  Printer,
  Save,
  RotateCcw,
  Sparkles,
  DollarSign,
  Plus,
  Trash2,
  CheckCircle2,
  Shield,
  Layers,
  Calendar,
  Building,
  User,
  Phone,
  Mail,
  MapPin,
  Tag,
  Eye,
  FileSignature,
  Percent,
  Sliders,
  Check,
  ChevronRight,
  Receipt,
  FileCheck,
} from "lucide-react";

interface SolarQuotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SolarDesignConfig;
  calc: SolarCalculationResults;
  onUpdateConfig: (updated: Partial<SolarDesignConfig>) => void;
  projectInfo?: {
    projectName?: string;
    projectLocation?: string;
    clientName?: string;
    designerName?: string;
  };
}

export const SolarQuotationModal: React.FC<SolarQuotationModalProps> = ({
  isOpen,
  onClose,
  config,
  calc,
  onUpdateConfig,
  projectInfo,
}) => {
  if (!isOpen) return null;

  // Initialize from project config or generate fresh synced quotation
  const [quotation, setQuotation] = useState<SolarQuotationConfig>(() => {
    if (config.quotation && config.quotation.items && config.quotation.items.length > 0) {
      return config.quotation;
    }
    return generateDefaultSolarQuotation(config, calc, projectInfo);
  });

  const [activeTab, setActiveTab] = useState<"pricing" | "client" | "scope" | "preview">("pricing");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // New Item State for custom line item addition
  const [newItem, setNewItem] = useState<Partial<SolarQuotationItem>>({
    category: "Wiring & Conduit",
    itemDescription: "",
    manufacturer: "",
    model: "",
    quantity: 1,
    unit: "lot",
    unitCostPhp: 0,
    markupPercent: 15,
  });

  // Calculate live financial totals
  const totals = calculateQuotationTotals(quotation, calc);

  // Handlers for modifying quotation
  const handleUpdateQuotation = (updated: Partial<SolarQuotationConfig>) => {
    const next = { ...quotation, ...updated };
    setQuotation(next);
  };

  const handleUpdateItem = (index: number, updated: Partial<SolarQuotationItem>) => {
    const nextItems = [...quotation.items];
    const current = { ...nextItems[index], ...updated };

    const unitCost = Number(current.unitCostPhp) || 0;
    const markup = Number(current.markupPercent) || 0;

    // Recalculate selling price if unitCost or markup changed and sellingPrice was not explicitly provided
    if (updated.unitCostPhp !== undefined || updated.markupPercent !== undefined) {
      current.sellingPricePhp = Math.round(unitCost * (1 + markup / 100));
    } else if (updated.sellingPricePhp !== undefined) {
      current.sellingPricePhp = Number(updated.sellingPricePhp) || 0;
      if (unitCost > 0) {
        current.markupPercent = Number((((current.sellingPricePhp - unitCost) / unitCost) * 100).toFixed(1));
      }
    }

    const qty = Number(current.quantity) || 1;
    const labor = Number(current.laborCostPhp) || 0;
    const discount = Number(current.discountPhp) || 0;
    current.totalCostPhp = Math.round(qty * current.sellingPricePhp + labor - discount);

    nextItems[index] = current;
    handleUpdateQuotation({ items: nextItems });
  };

  const handleDeleteItem = (index: number) => {
    const nextItems = quotation.items.filter((_, idx) => idx !== index);
    handleUpdateQuotation({ items: nextItems });
  };

  const handleAddItem = () => {
    if (!newItem.itemDescription) return;
    const unitCost = Number(newItem.unitCostPhp) || 0;
    const markup = Number(newItem.markupPercent) || 15;
    const sellingPrice = Math.round(unitCost * (1 + markup / 100));
    const qty = Number(newItem.quantity) || 1;

    const item: SolarQuotationItem = {
      id: `quote-item-${Date.now()}`,
      category: newItem.category || "General",
      itemDescription: newItem.itemDescription,
      manufacturer: newItem.manufacturer || "Standard",
      model: newItem.model || "N/A",
      quantity: qty,
      unit: newItem.unit || "lot",
      unitCostPhp: unitCost,
      markupPercent: markup,
      sellingPricePhp: sellingPrice,
      laborCostPhp: 0,
      discountPhp: 0,
      totalCostPhp: qty * sellingPrice,
    };

    handleUpdateQuotation({ items: [...quotation.items, item] });
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

  const handleSyncFromBOM = () => {
    const synced = syncQuotationWithBOM(quotation, config, calc);
    setQuotation(synced);
  };

  const handleIncrementRevision = () => {
    const updated = incrementQuotationRevision(quotation);
    setQuotation(updated);
  };

  const handleSaveToProject = () => {
    onUpdateConfig({ quotation });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleExportPdf = () => {
    exportSolarProposalPdf(config, calc, quotation);
  };

  const handleExportWord = async () => {
    await exportSolarProposalWord(config, calc, quotation);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-slate-900 dark:text-slate-100">
        {/* ========================================================================= */}
        {/* MODAL HEADER WITH EXPORT ACTIONS                                         */}
        {/* ========================================================================= */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-600 to-indigo-700 text-white flex items-center justify-center shadow-md">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white">
                  Solar Quotation & Proposal Generator
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-black rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
                  {quotation.revision}
                </span>
                <span className="hidden sm:inline-block text-xs font-semibold text-slate-400">
                  {quotation.quotationNumber}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Turnkey EPC Commercial Proposal & Contractor Bidding Costing Dossier
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportWord}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 transition cursor-pointer"
              title="Download Microsoft Word Proposal (.docx)"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Word</span>
            </button>

            <button
              onClick={handleExportPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 transition cursor-pointer"
              title="Download Multi-Page PDF Proposal"
            >
              <Download className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
              title="Print Proposal"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>

            <button
              onClick={handleSaveToProject}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition cursor-pointer"
            >
              {saveSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Quotation</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* EXECUTIVE KPI STRIP                                                       */}
        {/* ========================================================================= */}
        <div className="px-6 py-2.5 bg-slate-100/70 dark:bg-slate-800/40 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-bold block">Capacity</span>
              <span className="font-extrabold text-slate-800 dark:text-slate-200">
                {calc.totalDcCapacityKwp} kWp DC <span className="text-slate-400 font-normal">({calc.totalInverterAcKw} kW AC)</span>
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-bold block">Materials Cost</span>
              <span className="font-bold text-slate-700 dark:text-slate-300">
                ₱ {totals.materialsSubtotalPhp.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-bold block">Labor & Services</span>
              <span className="font-bold text-slate-700 dark:text-slate-300">
                ₱ {(totals.totalLaborPhp + totals.engineeringDesignFeePhp + totals.testingCommissioningCostPhp).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-bold block">Unit Installed Rate</span>
              <span className="font-extrabold text-sky-600 dark:text-sky-400">
                ₱ {totals.costPerWattDcPhp.toFixed(2)} / Wp
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase block tracking-wider">
                Proposed Contract Amount
              </span>
              <span className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400">
                ₱ {totals.grandTotalContractPricePhp.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* NAVIGATION TABS                                                           */}
        {/* ========================================================================= */}
        <div className="px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab("pricing")}
              className={`px-4 py-3 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer ${
                activeTab === "pricing"
                  ? "border-sky-600 text-sky-600 dark:text-sky-400"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <DollarSign className="w-4 h-4" />
              <span>Itemized Pricing ({quotation.items.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("client")}
              className={`px-4 py-3 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer ${
                activeTab === "client"
                  ? "border-sky-600 text-sky-600 dark:text-sky-400"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Building className="w-4 h-4" />
              <span>Client & Proposal Info</span>
            </button>

            <button
              onClick={() => setActiveTab("scope")}
              className={`px-4 py-3 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer ${
                activeTab === "scope"
                  ? "border-sky-600 text-sky-600 dark:text-sky-400"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Scope of Work & Terms</span>
            </button>

            <button
              onClick={() => setActiveTab("preview")}
              className={`px-4 py-3 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer ${
                activeTab === "preview"
                  ? "border-sky-600 text-sky-600 dark:text-sky-400"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>Proposal Preview & Layout</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={handleSyncFromBOM}
              className="flex items-center gap-1 px-2.5 py-1 text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Refresh pricing and equipment from Solar BOM"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sync BOM</span>
            </button>

            <button
              onClick={handleIncrementRevision}
              className="flex items-center gap-1 px-2.5 py-1 text-amber-600 dark:text-amber-400 hover:text-amber-700 font-semibold rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/40 transition cursor-pointer"
              title="Increment Proposal Revision (e.g. Rev. 00 -> Rev. 01)"
            >
              <Tag className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Revision</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* TAB BODY (SCROLLABLE)                                                     */}
        {/* ========================================================================= */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: ITEMIZED PRICING */}
          {activeTab === "pricing" && (
            <div className="space-y-6">
              {/* Pricing Display Options Bar */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-sky-600" />
                    <span>Pricing Presentation Mode:</span>
                  </span>
                  <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-900 text-xs">
                    {(["detailed", "summary", "lumpsum"] as PricingDisplayMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => handleUpdateQuotation({ pricingDisplayMode: mode })}
                        className={`px-3 py-1 font-bold rounded-md capitalize transition cursor-pointer ${
                          quotation.pricingDisplayMode === mode
                            ? "bg-sky-600 text-white shadow-xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                        }`}
                      >
                        {mode === "detailed" ? "Detailed Items" : mode === "summary" ? "Summary by Cat" : "Turnkey Lump-Sum"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Target Submission:</span>
                  <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-900 text-xs">
                    {(["client", "contractor"] as ProposalSubmissionMode[]).map((sub) => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => handleUpdateQuotation({ submissionMode: sub })}
                        className={`px-3 py-1 font-bold rounded-md capitalize transition cursor-pointer ${
                          quotation.submissionMode === sub
                            ? "bg-indigo-600 text-white shadow-xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                        }`}
                      >
                        {sub === "client" ? "Client Proposal" : "Contractor Sub"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-400">
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3 min-w-[200px]">Description & Specs</th>
                        <th className="py-2.5 px-2 w-16">Qty</th>
                        <th className="py-2.5 px-2 w-14">Unit</th>
                        <th className="py-2.5 px-2 w-24">Unit Cost (₱)</th>
                        <th className="py-2.5 px-2 w-16 text-center">Markup%</th>
                        <th className="py-2.5 px-2 w-24">Selling (₱)</th>
                        <th className="py-2.5 px-2 w-20">Labor (₱)</th>
                        <th className="py-2.5 px-2 w-20">Discount (₱)</th>
                        <th className="py-2.5 px-3 text-right w-28">Subtotal (₱)</th>
                        <th className="py-2.5 px-2 text-center w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {quotation.items.map((it, idx) => (
                        <tr key={it.id || idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-semibold text-slate-400">{idx + 1}</td>
                          <td className="py-2 px-3">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {it.category}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={it.itemDescription}
                              onChange={(e) => handleUpdateItem(idx, { itemDescription: e.target.value })}
                              className="w-full font-medium text-slate-800 dark:text-slate-200 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-sky-500 focus:outline-none"
                            />
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {it.manufacturer} • {it.model}
                            </div>
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="number"
                              min="1"
                              value={it.quantity}
                              onChange={(e) => handleUpdateItem(idx, { quantity: parseFloat(e.target.value) || 1 })}
                              className="w-full px-1.5 py-1 font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-center"
                            />
                          </td>
                          <td className="py-2 px-2 text-slate-500">{it.unit}</td>
                          <td className="py-2 px-2">
                            <input
                              type="number"
                              min="0"
                              value={it.unitCostPhp}
                              onChange={(e) => handleUpdateItem(idx, { unitCostPhp: parseFloat(e.target.value) || 0 })}
                              className="w-full px-1.5 py-1 font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="number"
                              min="0"
                              value={it.markupPercent}
                              onChange={(e) => handleUpdateItem(idx, { markupPercent: parseFloat(e.target.value) || 0 })}
                              className="w-full px-1 py-1 font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-center"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="number"
                              min="0"
                              value={it.sellingPricePhp}
                              onChange={(e) => handleUpdateItem(idx, { sellingPricePhp: parseFloat(e.target.value) || 0 })}
                              className="w-full px-1.5 py-1 font-extrabold text-sky-700 dark:text-sky-300 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/20 text-right"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="number"
                              min="0"
                              value={it.laborCostPhp || 0}
                              onChange={(e) => handleUpdateItem(idx, { laborCostPhp: parseFloat(e.target.value) || 0 })}
                              className="w-full px-1.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="number"
                              min="0"
                              value={it.discountPhp || 0}
                              onChange={(e) => handleUpdateItem(idx, { discountPhp: parseFloat(e.target.value) || 0 })}
                              className="w-full px-1.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right text-rose-600"
                            />
                          </td>
                          <td className="py-2 px-3 text-right font-black text-slate-900 dark:text-white">
                            ₱ {it.totalCostPhp.toLocaleString()}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              onClick={() => handleDeleteItem(idx)}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded transition"
                              title="Delete Item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Add Custom Item Footer */}
                <div className="p-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-750">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Add Custom Quotation Line Item
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
                      placeholder="Item Description & Specs"
                      value={newItem.itemDescription}
                      onChange={(e) => setNewItem({ ...newItem, itemDescription: e.target.value })}
                      className="md:col-span-2 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                    <input
                      type="number"
                      placeholder="Qty"
                      min="1"
                      value={newItem.quantity}
                      onChange={(e) => setNewItem({ ...newItem, quantity: parseFloat(e.target.value) || 1 })}
                      className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                    <input
                      type="number"
                      placeholder="Unit Cost (₱)"
                      min="0"
                      value={newItem.unitCostPhp}
                      onChange={(e) => setNewItem({ ...newItem, unitCostPhp: parseFloat(e.target.value) || 0 })}
                      className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                    <button
                      onClick={handleAddItem}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-xs transition flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Item</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Service & Additional Cost Adjustments Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Labor & Engineering Fees
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div>
                      <label className="text-slate-500 block mb-0.5">Civil & Electrical Installation Labor (₱)</label>
                      <input
                        type="number"
                        min="0"
                        value={quotation.installationLaborCostPhp}
                        onChange={(e) => handleUpdateQuotation({ installationLaborCostPhp: parseFloat(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 block mb-0.5">Engineering Design & PEC Dossier (₱)</label>
                      <input
                        type="number"
                        min="0"
                        value={quotation.engineeringDesignFeePhp}
                        onChange={(e) => handleUpdateQuotation({ engineeringDesignFeePhp: parseFloat(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Testing, Permitting & Freight
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div>
                      <label className="text-slate-500 block mb-0.5">Testing & Commissioning (₱)</label>
                      <input
                        type="number"
                        min="0"
                        value={quotation.testingCommissioningCostPhp}
                        onChange={(e) => handleUpdateQuotation({ testingCommissioningCostPhp: parseFloat(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 block mb-0.5">Mobilization, Delivery & Freight (₱)</label>
                      <input
                        type="number"
                        min="0"
                        value={quotation.mobilizationDeliveryPhp}
                        onChange={(e) => handleUpdateQuotation({ mobilizationDeliveryPhp: parseFloat(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Discounts & Taxes
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div>
                      <label className="text-slate-500 block mb-0.5">Overall Project Discount (₱)</label>
                      <input
                        type="number"
                        min="0"
                        value={quotation.discountPhp}
                        onChange={(e) => handleUpdateQuotation({ discountPhp: parseFloat(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-rose-600"
                      />
                    </div>
                    <div className="pt-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={quotation.applyTax}
                          onChange={(e) => handleUpdateQuotation({ applyTax: e.target.checked })}
                          className="rounded text-sky-600 focus:ring-sky-500"
                        />
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          Apply VAT ({quotation.taxRatePercent || 12}%)
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CLIENT & PROPOSAL INFO */}
          {activeTab === "client" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Proposal Identification */}
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-sky-600" />
                  <span>Proposal & Tracking Details</span>
                </h3>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-500 block mb-1 font-semibold">Quotation / Proposal Number</label>
                    <input
                      type="text"
                      value={quotation.quotationNumber}
                      onChange={(e) => handleUpdateQuotation({ quotationNumber: e.target.value })}
                      className="w-full px-3 py-2 font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-500 block mb-1 font-semibold">Revision</label>
                      <input
                        type="text"
                        value={quotation.revision}
                        onChange={(e) => handleUpdateQuotation({ revision: e.target.value })}
                        className="w-full px-3 py-2 font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-amber-600"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 block mb-1 font-semibold">Proposal Date</label>
                      <input
                        type="date"
                        value={quotation.quotationDate}
                        onChange={(e) => handleUpdateQuotation({ quotationDate: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-1 font-semibold">Proposal Valid Until</label>
                    <input
                      type="date"
                      value={quotation.validUntilDate}
                      onChange={(e) => handleUpdateQuotation({ validUntilDate: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Client Information */}
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <User className="w-4 h-4 text-emerald-600" />
                  <span>Client & Customer Information</span>
                </h3>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-500 block mb-1 font-semibold">Client Name / Contact Person</label>
                    <input
                      type="text"
                      value={quotation.clientName}
                      onChange={(e) => handleUpdateQuotation({ clientName: e.target.value })}
                      className="w-full px-3 py-2 font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-1 font-semibold">Client Company / Institution</label>
                    <input
                      type="text"
                      value={quotation.clientCompany || ""}
                      onChange={(e) => handleUpdateQuotation({ clientCompany: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-1 font-semibold">Project Site Address</label>
                    <input
                      type="text"
                      value={quotation.clientAddress || ""}
                      onChange={(e) => handleUpdateQuotation({ clientAddress: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-500 block mb-1 font-semibold">Phone / Mobile</label>
                      <input
                        type="text"
                        value={quotation.contactPhone || ""}
                        onChange={(e) => handleUpdateQuotation({ contactPhone: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 block mb-1 font-semibold">Email Address</label>
                      <input
                        type="email"
                        value={quotation.contactEmail || ""}
                        onChange={(e) => handleUpdateQuotation({ contactEmail: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Contractor / Prepared By */}
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Building className="w-4 h-4 text-indigo-600" />
                  <span>Contractor / Prepared By</span>
                </h3>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-500 block mb-1 font-semibold">Lead Engineer / Prepared By</label>
                    <input
                      type="text"
                      value={quotation.preparedBy}
                      onChange={(e) => handleUpdateQuotation({ preparedBy: e.target.value })}
                      className="w-full px-3 py-2 font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-1 font-semibold">Engineer Designation / Title</label>
                    <input
                      type="text"
                      value={quotation.preparedByTitle || ""}
                      onChange={(e) => handleUpdateQuotation({ preparedByTitle: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-1 font-semibold">Company / Contractor Name</label>
                    <input
                      type="text"
                      value={quotation.preparedByCompany}
                      onChange={(e) => handleUpdateQuotation({ preparedByCompany: e.target.value })}
                      className="w-full px-3 py-2 font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-1 font-semibold">Contractor Contact & Hotline</label>
                    <input
                      type="text"
                      value={quotation.preparedByPhone || ""}
                      onChange={(e) => handleUpdateQuotation({ preparedByPhone: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Professional Electrical Engineer (PEE) Signoff Details */}
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <FileSignature className="w-4 h-4 text-purple-600" />
                  <span>Engineering Signoff & Certification</span>
                </h3>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-500 block mb-1 font-semibold">Checked & Certified By</label>
                    <input
                      type="text"
                      value={quotation.checkedBy || ""}
                      onChange={(e) => handleUpdateQuotation({ checkedBy: e.target.value })}
                      className="w-full px-3 py-2 font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-1 font-semibold">Professional License & Credentials</label>
                    <input
                      type="text"
                      value={quotation.checkedByTitle || ""}
                      onChange={(e) => handleUpdateQuotation({ checkedByTitle: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      placeholder="e.g. Professional Electrical Engineer (PRC Reg. No. 00000)"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-1 font-semibold">Project General Notes</label>
                    <textarea
                      rows={3}
                      value={quotation.generalNotes || ""}
                      onChange={(e) => handleUpdateQuotation({ generalNotes: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SCOPE OF WORK & TERMS */}
          {activeTab === "scope" && (
            <div className="space-y-6">
              {/* Scope Checklist */}
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Contractor Scope of Work Phases</span>
                  </h3>
                  <span className="text-xs text-slate-500">
                    {quotation.scopeOfWork.filter((s) => s.included).length} of {quotation.scopeOfWork.length} Phases Included
                  </span>
                </div>

                <div className="space-y-2.5">
                  {quotation.scopeOfWork.map((scope, idx) => (
                    <div
                      key={scope.id}
                      className={`p-3 rounded-xl border transition flex items-start gap-3 ${
                        scope.included
                          ? "bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700"
                          : "opacity-50 border-slate-200 dark:border-slate-800"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={scope.included}
                        onChange={(e) => {
                          const nextScope = [...quotation.scopeOfWork];
                          nextScope[idx] = { ...scope, included: e.target.checked };
                          handleUpdateQuotation({ scopeOfWork: nextScope });
                        }}
                        className="mt-1 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                      />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <input
                            type="text"
                            value={scope.title}
                            onChange={(e) => {
                              const nextScope = [...quotation.scopeOfWork];
                              nextScope[idx] = { ...scope, title: e.target.value };
                              handleUpdateQuotation({ scopeOfWork: nextScope });
                            }}
                            className="font-bold text-xs text-slate-900 dark:text-slate-100 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-sky-500 focus:outline-none"
                          />
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              scope.included
                                ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400"
                                : "bg-slate-200 dark:bg-slate-700 text-slate-500"
                            }`}
                          >
                            {scope.included ? "INCLUDED" : "EXCLUDED"}
                          </span>
                        </div>
                        <textarea
                          rows={2}
                          value={scope.description}
                          onChange={(e) => {
                            const nextScope = [...quotation.scopeOfWork];
                            nextScope[idx] = { ...scope, description: e.target.value };
                            handleUpdateQuotation({ scopeOfWork: nextScope });
                          }}
                          className="w-full text-xs text-slate-600 dark:text-slate-400 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-sky-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Commercial Terms & Milestone Schedule */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-sky-600" />
                    <span>Commercial Terms & Duration</span>
                  </h3>
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="text-slate-500 block mb-1 font-semibold">Payment Terms Schedule</label>
                      <textarea
                        rows={2}
                        value={quotation.paymentTerms}
                        onChange={(e) => handleUpdateQuotation({ paymentTerms: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 block mb-1 font-semibold">Estimated Project Execution Duration</label>
                      <input
                        type="text"
                        value={quotation.projectDuration}
                        onChange={(e) => handleUpdateQuotation({ projectDuration: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 block mb-1 font-semibold">Equipment & Workmanship Warranties</label>
                      <textarea
                        rows={2}
                        value={quotation.warrantyTerms}
                        onChange={(e) => handleUpdateQuotation({ warrantyTerms: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-amber-600" />
                    <span>Inclusions & Exclusions</span>
                  </h3>
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="text-slate-500 block mb-1 font-semibold">Turnkey Scope Inclusions (1 per line)</label>
                      <textarea
                        rows={4}
                        value={quotation.inclusions.join("\n")}
                        onChange={(e) =>
                          handleUpdateQuotation({
                            inclusions: e.target.value.split("\n").filter((l) => l.trim().length > 0),
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-[11px]"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 block mb-1 font-semibold">Standard Scope Exclusions (1 per line)</label>
                      <textarea
                        rows={3}
                        value={quotation.exclusions.join("\n")}
                        onChange={(e) =>
                          handleUpdateQuotation({
                            exclusions: e.target.value.split("\n").filter((l) => l.trim().length > 0),
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-[11px]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PROPOSAL PREVIEW */}
          {activeTab === "preview" && (
            <div className="bg-slate-50 dark:bg-slate-950 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-6">
              {/* Proposal Document Preview Header */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 gap-4">
                  <div>
                    <span className="text-[10px] font-black text-sky-600 uppercase tracking-widest block">
                      ELECTRICALPH ENGINEERING PROPOSAL
                    </span>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white">
                      {config.projectName || "Solar PV Installation"}
                    </h2>
                    <span className="text-xs text-slate-500">
                      {quotation.quotationNumber} • {quotation.revision} • Date: {quotation.quotationDate}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-bold text-slate-400 block">Total Proposed Amount</span>
                    <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                      PHP {totals.grandTotalContractPricePhp.toLocaleString()}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      Turnkey Contract (₱ {totals.costPerWattDcPhp.toFixed(2)} / Wp)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 block text-[10px]">Client</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{quotation.clientName}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 block text-[10px]">Contractor</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{quotation.preparedByCompany}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 block text-[10px]">Installed DC Capacity</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{calc.totalDcCapacityKwp} kWp</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 block text-[10px]">System Type</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{config.systemType.toUpperCase()}</span>
                  </div>
                </div>
              </div>

              {/* Cost Summary Preview Card */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
                  Commercial Pricing Schedule
                </h4>
                <div className="space-y-2 text-xs divide-y divide-slate-100 dark:divide-slate-800">
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-600 dark:text-slate-400">Materials & Equipment Subtotal:</span>
                    <span className="font-bold">₱ {totals.materialsSubtotalPhp.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-600 dark:text-slate-400">Mounting & Electrical Installation Labor:</span>
                    <span className="font-bold">₱ {totals.totalLaborPhp.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-600 dark:text-slate-400">Engineering System Design & PEC Compliance:</span>
                    <span className="font-bold">₱ {totals.engineeringDesignFeePhp.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-600 dark:text-slate-400">Testing, Commissioning & Portal Setup:</span>
                    <span className="font-bold">₱ {totals.testingCommissioningCostPhp.toLocaleString()}</span>
                  </div>
                  {totals.discountAmountPhp > 0 && (
                    <div className="flex justify-between py-1.5 text-rose-600 font-bold">
                      <span>Contractor Project Discount:</span>
                      <span>- ₱ {totals.discountAmountPhp.toLocaleString()}</span>
                    </div>
                  )}
                  {quotation.applyTax && (
                    <div className="flex justify-between py-1.5">
                      <span className="text-slate-600 dark:text-slate-400">Value Added Tax ({quotation.taxRatePercent}% VAT):</span>
                      <span className="font-bold">₱ {totals.taxAmountPhp.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-3 text-sm font-black text-emerald-600 dark:text-emerald-400 border-t-2 border-slate-200 dark:border-slate-700">
                    <span>FINAL PROPOSED CONTRACT PRICE:</span>
                    <span>PHP {totals.grandTotalContractPricePhp.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Signatures Conforme Preview */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Prepared By (Contractor)</span>
                  <div className="h-12 border-b border-slate-300 dark:border-slate-700"></div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">{quotation.preparedBy}</span>
                  <span className="text-[10px] text-slate-400 block">{quotation.preparedByCompany}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Checked & Certified By</span>
                  <div className="h-12 border-b border-slate-300 dark:border-slate-700"></div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">{quotation.checkedBy || "PROFESSIONAL ELECTRICAL ENGINEER"}</span>
                  <span className="text-[10px] text-slate-400 block">Licensed PEE (RA 7920)</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Client Acceptance (Conforme)</span>
                  <div className="h-12 border-b border-slate-300 dark:border-slate-700"></div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">{quotation.clientName}</span>
                  <span className="text-[10px] text-slate-400 block">Authorized Signature & Date</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
