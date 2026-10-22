import React, { useMemo, memo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { Activity } from "lucide-react";
import { PanelConfig, Circuit } from "../types";
import { computePanelScheduleValues } from "../utils/computeEngine";

interface PhaseBalanceChartProps {
  panel: PanelConfig;
  circuits: Circuit[];
  subPanels?: any[];
}

export const PhaseBalanceChart: React.FC<PhaseBalanceChartProps> = memo(({
  panel,
  circuits,
  subPanels = [],
}) => {
  const { phaseLoads, phaseImbalance } = useMemo(() => {
    return computePanelScheduleValues(panel, circuits, {
      availableSubPanels: subPanels,
    });
  }, [panel, circuits, subPanels]);

  const rKVA = (phaseLoads?.R || 0) / 1000;
  const yKVA = (phaseLoads?.Y || 0) / 1000;
  const bKVA = (phaseLoads?.B || 0) / 1000;

  const rVal = parseFloat(rKVA.toFixed(2));
  const yVal = parseFloat(yKVA.toFixed(2));
  const bVal = parseFloat(bKVA.toFixed(2));

  const chartData = useMemo(() => [
    {
      name: "Phase R",
      Load: rVal,
      color: "#ef4444",
    },
    {
      name: "Phase Y",
      Load: yVal,
      color: "#f59e0b",
    },
    {
      name: "Phase B",
      Load: bVal,
      color: "#3b82f6",
    },
  ], [rVal, yVal, bVal]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-xs">
              Phase Loading Balance
            </h4>
          </div>
          <span
            className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
              phaseImbalance <= 15
                ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400"
                : "bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400"
            }`}
          >
            {phaseImbalance.toFixed(2)}% Imbalance
          </span>
        </div>
        <p className="text-[11px] text-slate-400 leading-normal">
          Symmetrical current alignment per phase. Minimize imbalance to
          optimize feeder wire sizes and limit transformer temperature
          expansion under full load.
        </p>
      </div>

      <div className="h-32 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <BarChart
            data={chartData}
            margin={{
              top: 10,
              right: 10,
              left: -25,
              bottom: 0,
            }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="#f1f5f9"
              className="dark:stroke-slate-800"
            />
            <XAxis
              dataKey="name"
              stroke="#94a3b8"
              fontSize={10}
              tickLine={false}
            />
            <YAxis
              stroke="#94a3b8"
              fontSize={10}
              tickLine={false}
              unit="k"
            />
            <Tooltip
              cursor={{ fill: "transparent" }}
              contentStyle={{
                background: "#1e293b",
                border: "none",
                borderRadius: "8px",
                color: "#fff",
                fontSize: "10px",
                fontFamily: "monospace",
              }}
            />
            <Bar dataKey="Load" radius={[6, 6, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${entry.name}-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between text-[10px] font-mono border-t border-slate-100 dark:border-slate-800 pt-3 text-slate-500">
        <span>
          R: <strong className="text-red-600 font-bold">{rKVA.toFixed(2)}k</strong>
        </span>
        <span>
          Y: <strong className="text-amber-500 font-bold">{yKVA.toFixed(2)}k</strong>
        </span>
        <span>
          B: <strong className="text-blue-500 font-bold">{bKVA.toFixed(2)}k</strong>
        </span>
      </div>
    </div>
  );
});

export default PhaseBalanceChart;
