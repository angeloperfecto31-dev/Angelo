import React from "react";
import { RefreshCw, X, Sparkles } from "lucide-react";
import { useAppUpdate, reloadForUpdate, dismissAppUpdate } from "../utils/appUpdate";

/**
 * Shown on every page (signed in or not) when a newer ElectricalPH build has been deployed.
 * "Later" hides it for this browser session; the notification bell keeps the reload option.
 */
export const AppUpdateBanner: React.FC = () => {
  const { available, dismissed } = useAppUpdate();
  if (!available || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[200] bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md no-print"
    >
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-slate-900 text-white shadow-2xl border border-slate-700">
        <div className="w-9 h-9 shrink-0 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">A new version of ElectricalPH is available</p>
          {available.summary && <p className="text-xs text-slate-300 mt-0.5 break-words">{available.summary}</p>}
          <p className="text-[11px] text-slate-400 mt-1">Save any open work, then reload to get the latest features and fixes.</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              onClick={reloadForUpdate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reload now
            </button>
            <button
              type="button"
              onClick={dismissAppUpdate}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition cursor-pointer"
            >
              Later
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismissAppUpdate}
          aria-label="Dismiss"
          className="p-1 -m-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
