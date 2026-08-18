import React from "react";

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
  return (
    <div id="tx-summary-table-container" className="space-y-3">
      <div className="flex justify-between items-center">
        <h5 className="text-xs font-black uppercase text-slate-500 dark:text-slate-400">
          Individual Transformer Unit Load Study
        </h5>
        <span className="text-[10px] font-black bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-md">
          {numTransformers} Sized Unit{numTransformers > 1 ? "s" : ""}
        </span>
      </div>
      <div className="overflow-x-auto w-full rounded-2xl border border-slate-150 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-sm">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 uppercase text-[9px] font-black tracking-wider border-b border-slate-150 dark:border-slate-800">
              <th className="px-4 py-3">Transformer Unit</th>
              <th className="px-4 py-3 text-right">Unit Capacity</th>
              <th className="px-4 py-3 text-right">Assigned Connected</th>
              <th className="px-4 py-3 text-right">Assigned Demand</th>
              <th className="px-4 py-3 text-right">Capacity Loading</th>
              <th className="px-4 py-3 text-center">Operational Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
            {Array.from({ length: numTransformers }).map((_, idx) => {
              const demandK = txDemandKVA[idx] || 0;
              const connectedK = (txConnectedVA[idx] || 0) / 1000;
              const txLoadingPct = activeRating > 0 ? (demandK / activeRating) * 100 : 0;
              const isTxOverloaded = txLoadingPct > (loadingFactor * 100);
              return (
                <tr key={idx} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-all">
                  <td className="px-4 py-3.5 font-bold text-slate-800 dark:text-slate-100">
                    Transformer Unit #{idx + 1}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-600 dark:text-slate-350 font-bold">
                    {activeRating.toFixed(1)} kVA
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-500 dark:text-slate-400">
                    {connectedK.toFixed(1)} kVA
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                    {demandK.toFixed(1)} kVA
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold">
                    <span className={isTxOverloaded ? "text-red-500" : "text-green-600 dark:text-green-400"}>
                      {txLoadingPct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                      isTxOverloaded 
                        ? "bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border border-red-200/40" 
                        : "bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 border border-green-200/40"
                    }`}>
                      {isTxOverloaded ? "Overloaded" : "Passed"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-450 leading-relaxed font-sans">
        *Loading percentage represents actual assigned demand load relative to the nominal nameplate kVA rating of each individual transformer unit. Safe operating threshold limit is <strong>{(loadingFactor * 100).toFixed(0)}%</strong>.
      </p>
    </div>
  );
};
