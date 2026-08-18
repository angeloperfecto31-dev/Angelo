import React from "react";
import { CheckCircle2, AlertTriangle, Layers, Cpu, ShieldCheck } from "lucide-react";

interface TransformerTableSummaryProps {
  numTransformers: number;
  activeRating: number;
  txDemandKVA: number[];
  txConnectedVA: number[];
  loadingFactor: number;
}

export const TransformerTableSummary: React.FC<TransformerTableSummaryProps> = ({
  numTransformers,
  activeRating,
  txDemandKVA,
  txConnectedVA,
  loadingFactor,
}) => {
  const totalConnectedKVA = txConnectedVA.slice(0, numTransformers).reduce((acc, curr) => acc + (curr || 0) / 1000, 0);
  const totalDemandKVA = txDemandKVA.slice(0, numTransformers).reduce((acc, curr) => acc + (curr || 0), 0);
  const totalBankCapacity = activeRating * numTransformers;
  const overallLoadingPct = totalBankCapacity > 0 ? (totalDemandKVA / totalBankCapacity) * 100 : 0;
  const isOverallOverloaded = overallLoadingPct > (loadingFactor * 100);

  return (
    <div id="tx-summary-table-container" className="space-y-3.5 w-full">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h5 className="text-sm font-black text-slate-800 dark:text-slate-100 tracking-tight">
              Individual Transformer Unit Load Study
            </h5>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Detailed per-unit capacity allocation, loading ratios, and thermal margins
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/40 px-2.5 py-1 rounded-lg">
            {numTransformers} Unit{numTransformers > 1 ? "s" : ""} in Parallel Bank
          </span>
          <span className="text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-lg">
            Total {totalBankCapacity.toFixed(1)} kVA
          </span>
        </div>
      </div>

      <div className="w-full overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <table className="w-full text-left border-collapse min-w-[640px]">
          <thead>
            <tr className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 uppercase text-[10px] font-extrabold tracking-wider border-b border-slate-200 dark:border-slate-800">
              <th className="px-5 py-3.5">Transformer Unit</th>
              <th className="px-5 py-3.5 text-right whitespace-nowrap">Unit Capacity</th>
              <th className="px-5 py-3.5 text-right whitespace-nowrap">Assigned Connected</th>
              <th className="px-5 py-3.5 text-right whitespace-nowrap">Assigned Demand</th>
              <th className="px-5 py-3.5 text-right whitespace-nowrap">Capacity Loading</th>
              <th className="px-5 py-3.5 text-center whitespace-nowrap">Operational Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {Array.from({ length: numTransformers }).map((_, idx) => {
              const demandK = txDemandKVA[idx] || 0;
              const connectedK = (txConnectedVA[idx] || 0) / 1000;
              const txLoadingPct = activeRating > 0 ? (demandK / activeRating) * 100 : 0;
              const isTxOverloaded = txLoadingPct > (loadingFactor * 100);

              return (
                <tr key={idx} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-black text-slate-700 dark:text-slate-300 text-xs shrink-0">
                        #{idx + 1}
                      </div>
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-100 block">
                          Transformer Unit #{idx + 1}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Parallel Unit {idx + 1} of {numTransformers}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right font-mono font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                    {activeRating.toFixed(1)} kVA
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {connectedK.toFixed(1)} kVA
                  </td>
                  <td className="px-5 py-4 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                    {demandK.toFixed(1)} kVA
                  </td>
                  <td className="px-5 py-4 text-right whitespace-nowrap">
                    <div className="flex flex-col items-end gap-1">
                      <span className={`font-mono font-black ${
                        isTxOverloaded 
                          ? "text-rose-600 dark:text-rose-400" 
                          : txLoadingPct > (loadingFactor * 85)
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-emerald-600 dark:text-emerald-400"
                      }`}>
                        {txLoadingPct.toFixed(1)}%
                      </span>
                      {/* Visual loading bar */}
                      <div className="w-24 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${
                            isTxOverloaded 
                              ? "bg-rose-500" 
                              : txLoadingPct > (loadingFactor * 85)
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.min(100, txLoadingPct)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-center whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border ${
                      isTxOverloaded 
                        ? "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/50" 
                        : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50"
                    }`}>
                      {isTxOverloaded ? (
                        <>
                          <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
                          Overloaded
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                          Passed
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {numTransformers > 1 && (
            <tfoot>
              <tr className="bg-slate-50/90 dark:bg-slate-800/80 font-bold border-t-2 border-slate-200 dark:border-slate-700 text-xs">
                <td className="px-5 py-3.5 text-slate-800 dark:text-slate-100 font-extrabold">
                  Combined Total Bank
                </td>
                <td className="px-5 py-3.5 text-right font-mono text-slate-900 dark:text-white font-black whitespace-nowrap">
                  {totalBankCapacity.toFixed(1)} kVA
                </td>
                <td className="px-5 py-3.5 text-right font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  {totalConnectedKVA.toFixed(1)} kVA
                </td>
                <td className="px-5 py-3.5 text-right font-mono text-indigo-600 dark:text-indigo-300 font-black whitespace-nowrap">
                  {totalDemandKVA.toFixed(1)} kVA
                </td>
                <td className="px-5 py-3.5 text-right font-mono whitespace-nowrap">
                  <span className={`font-black ${isOverallOverloaded ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                    {overallLoadingPct.toFixed(1)}%
                  </span>
                </td>
                <td className="px-5 py-3.5 text-center whitespace-nowrap">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border ${
                    isOverallOverloaded 
                      ? "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/50" 
                      : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50"
                  }`}>
                    {isOverallOverloaded ? "Overloaded" : "All Passed"}
                  </span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-sans px-1">
        <span className="font-bold text-slate-600 dark:text-slate-300 shrink-0">*Note:</span>
        <span>
          Loading percentage represents actual assigned demand load relative to the nominal nameplate kVA rating of each individual transformer unit. Continuous safe operating threshold limit is <strong>{(loadingFactor * 100).toFixed(0)}%</strong> according to Philippine Electrical Code (PEC) guidelines.
        </span>
      </div>
    </div>
  );
};

