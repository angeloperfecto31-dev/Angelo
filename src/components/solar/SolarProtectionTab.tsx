import React from "react";
import {
  SolarDesignConfig,
  SolarCalculationResults,
  SolarDesignOverrides,
} from "../../types/solar";
import { SolarOverrideField } from "./SolarOverrideField";
import {
  ShieldCheck,
  Zap,
  Cable,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Layers,
  Settings2,
} from "lucide-react";

interface SolarProtectionTabProps {
  config: SolarDesignConfig;
  calc: SolarCalculationResults;
  onChange: (updated: Partial<SolarDesignConfig>) => void;
  onSetOverride?: (field: keyof SolarDesignOverrides, val: any) => void;
  onResetOverride?: (field: keyof SolarDesignOverrides) => void;
}

export const SolarProtectionTab: React.FC<SolarProtectionTabProps> = ({
  config,
  calc,
  onChange,
  onSetOverride,
  onResetOverride,
}) => {
  const handleSetField = (field: keyof SolarDesignOverrides, value: any, extraConfig?: Partial<SolarDesignConfig>) => {
    if (onSetOverride) {
      onSetOverride(field, value);
    } else {
      onChange({
        ...extraConfig,
        overrides: { ...(config.overrides || {}), [field]: value },
      });
    }
  };

  const handleResetField = (field: keyof SolarDesignOverrides, extraConfig?: Partial<SolarDesignConfig>) => {
    if (onResetOverride) {
      onResetOverride(field);
    } else {
      const nextOverrides = { ...(config.overrides || {}) };
      delete nextOverrides[field];
      onChange({
        ...extraConfig,
        overrides: nextOverrides,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. DC Protection & Combiner Box (PEC 2017 Article 6.90.8 / 6.90.9 / 6.90.13) */}
      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-rose-500" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              DC Photovoltaic Protection & Combiner System
            </h3>
          </div>
          <span className="text-[11px] font-bold text-slate-500">
            PEC 2017 Art 6.90.8 & 6.90.9
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <SolarOverrideField
            label="DC String Fuse Rating"
            fieldKey="dcFuseRatingAmps"
            effectiveValue={calc.effective.dcFuseRatingAmps}
            autoValue={calc.autoValues.dcFuseRatingAmps}
            isOverridden={calc.isOverridden.dcFuseRatingAmps}
            unit="A DC"
            min={10}
            max={60}
            step={1}
            warning={calc.fieldWarnings.dcFuseRatingAmps}
            hint={`PEC 1.56 × Isc: ${(calc.stringIsc * 1.56).toFixed(1)}A min`}
            onValueChange={(val) => {
              const num = parseInt(val) || 25;
              handleSetField("dcFuseRatingAmps", num, {
                dcProtection: { ...config.dcProtection, fuseRatingAmps: num },
              });
            }}
            onResetToAuto={() => {
              handleResetField("dcFuseRatingAmps", {
                dcProtection: { ...config.dcProtection, fuseRatingAmps: calc.autoValues.dcFuseRatingAmps },
              });
            }}
          />

          <SolarOverrideField
            label="DC Disconnect / Isolator"
            fieldKey="dcIsolatorRatingAmps"
            effectiveValue={calc.effective.dcIsolatorRatingAmps}
            autoValue={calc.autoValues.dcIsolatorRatingAmps}
            isOverridden={calc.isOverridden.dcIsolatorRatingAmps}
            unit="A DC"
            min={16}
            max={125}
            step={1}
            warning={calc.fieldWarnings.dcIsolatorRatingAmps}
            hint="1000V/1500V DC 4-Pole Rotary"
            onValueChange={(val) => {
              const num = parseInt(val) || 32;
              handleSetField("dcIsolatorRatingAmps", num, {
                dcProtection: { ...config.dcProtection, isolatorRatingAmps: num },
              });
            }}
            onResetToAuto={() => {
              handleResetField("dcIsolatorRatingAmps", {
                dcProtection: { ...config.dcProtection, isolatorRatingAmps: calc.autoValues.dcIsolatorRatingAmps },
              });
            }}
          />

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              DC Surge Protective Device (SPD)
            </label>
            <select
              value={config.dcProtection.spdType}
              onChange={(e) =>
                onChange({
                  dcProtection: {
                    ...config.dcProtection,
                    spdType: e.target.value,
                  },
                })
              }
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
            >
              <option value="Type II DC SPD">Type II Photovoltaic SPD</option>
              <option value="Type I+II DC SPD">Type I+II Lightning & Surge SPD</option>
            </select>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Uc ≥ {calc.dcSpdUcMinVolts}V (Array Voc: {calc.stringVoc}V)
            </span>
          </div>

          <SolarOverrideField
            label="DC Equipment Ground (EGC)"
            fieldKey="dcEgcSizeMm2"
            effectiveValue={calc.effective.dcEgcSizeMm2}
            autoValue={calc.autoValues.dcEgcSizeMm2}
            isOverridden={calc.isOverridden.dcEgcSizeMm2}
            unit="mm²"
            type="select"
            options={[
              { value: 5.5, label: "5.5 mm² Cu Bare/THW" },
              { value: 8.0, label: "8.0 mm² Cu Bare/THW (Standard)" },
              { value: 14.0, label: "14.0 mm² Cu Bare/THW" },
              { value: 22.0, label: "22.0 mm² Cu Bare/THW" },
            ]}
            warning={calc.fieldWarnings.dcEgcSizeMm2}
            hint="PEC 2.50 Grounding Electrode System"
            onValueChange={(val) => {
              const num = parseFloat(val) || 8.0;
              handleSetField("dcEgcSizeMm2", num, {
                dcProtection: { ...config.dcProtection, egcSizeMm2: num },
              });
            }}
            onResetToAuto={() => {
              handleResetField("dcEgcSizeMm2", {
                dcProtection: { ...config.dcProtection, egcSizeMm2: calc.autoValues.dcEgcSizeMm2 },
              });
            }}
          />
        </div>
      </div>

      {/* 2. AC Protection & Distribution (PEC 2017 Article 6.90.8 / 7.05) */}
      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              AC Inverter Circuit Breaker & Panelboard Protection
            </h3>
          </div>
          <span className="text-[11px] font-bold text-slate-500">
            PEC 2017 Art 6.90.8 & 7.05
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <SolarOverrideField
            label="Breaker Trip (AT Amps)"
            fieldKey="acBreakerAtAmps"
            effectiveValue={calc.effective.acBreakerAtAmps}
            autoValue={calc.autoValues.acBreakerAtAmps}
            isOverridden={calc.isOverridden.acBreakerAtAmps}
            unit="AT"
            min={15}
            max={2000}
            step={5}
            warning={calc.fieldWarnings.acBreakerAtAmps}
            hint={`PEC 1.25 × Inverter AC: ${(calc.inverterMaxAcCurrent * 1.25).toFixed(1)}A min`}
            onValueChange={(val) => {
              const num = parseInt(val) || 200;
              handleSetField("acBreakerAtAmps", num, {
                acProtection: { ...config.acProtection, atAmps: num },
              });
            }}
            onResetToAuto={() => {
              handleResetField("acBreakerAtAmps", {
                acProtection: { ...config.acProtection, atAmps: calc.autoValues.acBreakerAtAmps },
              });
            }}
          />

          <SolarOverrideField
            label="Breaker Frame (AF Amps)"
            fieldKey="acBreakerAfAmps"
            effectiveValue={calc.effective.acBreakerAfAmps}
            autoValue={calc.autoValues.acBreakerAfAmps}
            isOverridden={calc.isOverridden.acBreakerAfAmps}
            unit="AF"
            type="select"
            options={[
              { value: 50, label: "50 AF" },
              { value: 60, label: "60 AF" },
              { value: 100, label: "100 AF" },
              { value: 125, label: "125 AF" },
              { value: 225, label: "225 AF" },
              { value: 250, label: "250 AF" },
              { value: 400, label: "400 AF" },
              { value: 600, label: "600 AF" },
              { value: 800, label: "800 AF" },
              { value: 1000, label: "1000 AF" },
              { value: 1200, label: "1200 AF" },
            ]}
            warning={calc.fieldWarnings.acBreakerAfAmps}
            hint="Sized ≥ Trip Ampere (AT)"
            onValueChange={(val) => {
              const num = parseInt(val) || 225;
              handleSetField("acBreakerAfAmps", num, {
                acProtection: { ...config.acProtection, afAmps: num },
              });
            }}
            onResetToAuto={() => {
              handleResetField("acBreakerAfAmps", {
                acProtection: { ...config.acProtection, afAmps: calc.autoValues.acBreakerAfAmps },
              });
            }}
          />

          <SolarOverrideField
            label="Interrupting Capacity (kAIC)"
            fieldKey="acKaic"
            effectiveValue={calc.effective.acKaic}
            autoValue={calc.autoValues.acKaic}
            isOverridden={calc.isOverridden.acKaic}
            unit="kAIC"
            type="select"
            options={[
              { value: 10, label: "10 kAIC (Residential Branch)" },
              { value: 18, label: "18 kAIC (Commercial Standard)" },
              { value: 25, label: "25 kAIC (Commercial High Fault)" },
              { value: 35, label: "35 kAIC (Main Distribution Panel)" },
              { value: 50, label: "50 kAIC (Substation Vicinity)" },
              { value: 65, label: "65 kAIC (Industrial Primary)" },
            ]}
            warning={calc.fieldWarnings.acKaic}
            hint="PEC 2.40 Available fault withstand"
            onValueChange={(val) => {
              const num = parseInt(val) || 35;
              handleSetField("acKaic", num, {
                acProtection: { ...config.acProtection, kaic: num },
              });
            }}
            onResetToAuto={() => {
              handleResetField("acKaic", {
                acProtection: { ...config.acProtection, kaic: calc.autoValues.acKaic },
              });
            }}
          />

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Interconnection Method
            </label>
            <select
              value={config.netMetering.interconnectionType}
              onChange={(e) =>
                onChange({
                  netMetering: {
                    ...config.netMetering,
                    interconnectionType: e.target.value as any,
                  },
                })
              }
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
            >
              <option value="load_side">Load-Side Tap (PEC 7.05.12(B))</option>
              <option value="supply_side">Supply-Side Tap (PEC 7.05.12(A))</option>
            </select>
            <span className="text-[10px] text-slate-400 mt-1 block">
              120% Busbar Rule applies for load-side
            </span>
          </div>
        </div>
      </div>

      {/* 3. Cable Sizing & Voltage Drop Verification */}
      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
          <div className="flex items-center gap-2">
            <Cable className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Conductor Ampacity & Voltage Drop Verification
            </h3>
          </div>
          <span className="text-[11px] font-bold text-slate-500">
            PEC 2017 Chapter 3 & Section 2.15 (Max 1.5% Vd recommended)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* DC Cable Card */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-700 dark:text-rose-400">
                DC String Cable (PV1-F / H1Z2Z2-K)
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  calc.validations.dcVoltageDropValid
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                    : "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400"
                }`}
              >
                {calc.validations.dcVoltageDropValid ? "PASS (Vd ≤ 1.5%)" : "EXCEEDED LIMIT"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <SolarOverrideField
                label="Conductor Size"
                fieldKey="dcCableSizeMm2"
                effectiveValue={calc.effective.dcCableSizeMm2}
                autoValue={calc.autoValues.dcCableSizeMm2}
                isOverridden={calc.isOverridden.dcCableSizeMm2}
                unit="mm²"
                type="select"
                options={[
                  { value: 4.0, label: "4.0 mm² PV Cable" },
                  { value: 6.0, label: "6.0 mm² PV Cable (Standard)" },
                  { value: 10.0, label: "10.0 mm² PV Cable" },
                  { value: 16.0, label: "16.0 mm² PV Cable" },
                ]}
                warning={calc.fieldWarnings.dcCableSizeMm2}
                onValueChange={(val) => {
                  const num = parseFloat(val) || 6.0;
                  handleSetField("dcCableSizeMm2", num, {
                    cabling: {
                      ...config.cabling,
                      dcCable: { ...config.cabling.dcCable, conductorSizeMm2: num },
                    },
                  });
                }}
                onResetToAuto={() => {
                  handleResetField("dcCableSizeMm2", {
                    cabling: {
                      ...config.cabling,
                      dcCable: { ...config.cabling.dcCable, conductorSizeMm2: calc.autoValues.dcCableSizeMm2 },
                    },
                  });
                }}
              />

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 text-xs font-semibold">
                  One-Way Run Length (m)
                </label>
                <input
                  type="number"
                  min="5"
                  max="200"
                  value={config.cabling.dcCable.lengthM}
                  onChange={(e) =>
                    onChange({
                      cabling: {
                        ...config.cabling,
                        dcCable: {
                          ...config.cabling.dcCable,
                          lengthM: parseFloat(e.target.value) || 35,
                        },
                      },
                    })
                  }
                  className="w-full px-2.5 py-2 font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Derated Ampacity:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{calc.dcCableAmpacity} A</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">DC Voltage Drop:</span>
                <span className="font-bold text-rose-600">{calc.dcVoltageDropV} V ({calc.dcVoltageDropPercent}%)</span>
              </div>
            </div>
          </div>

          {/* AC Feeder Cable Card */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sky-700 dark:text-sky-400">
                AC Feeder Cable (THHN/THWN-2 in Conduit)
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  calc.validations.acVoltageDropValid
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                    : "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400"
                }`}
              >
                {calc.validations.acVoltageDropValid ? "PASS (Vd ≤ 1.5%)" : "EXCEEDED LIMIT"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <SolarOverrideField
                label="Conductor Size"
                fieldKey="acCableSizeMm2"
                effectiveValue={calc.effective.acCableSizeMm2}
                autoValue={calc.autoValues.acCableSizeMm2}
                isOverridden={calc.isOverridden.acCableSizeMm2}
                unit="mm²"
                type="select"
                options={[
                  { value: 5.5, label: "5.5 mm² Cu (Up to 30A)" },
                  { value: 8.0, label: "8.0 mm² Cu (Up to 40A)" },
                  { value: 14.0, label: "14.0 mm² Cu (Up to 60A)" },
                  { value: 22.0, label: "22.0 mm² Cu (Up to 80A)" },
                  { value: 30.0, label: "30.0 mm² Cu (Up to 100A)" },
                  { value: 38.0, label: "38.0 mm² Cu (Up to 125A)" },
                  { value: 50.0, label: "50.0 mm² Cu (Up to 150A)" },
                  { value: 60.0, label: "60.0 mm² Cu (Up to 175A)" },
                  { value: 80.0, label: "80.0 mm² Cu (Up to 200A)" },
                  { value: 95.0, label: "95.0 mm² Cu (Up to 230A)" },
                  { value: 125.0, label: "125.0 mm² Cu (Up to 275A)" },
                  { value: 150.0, label: "150.0 mm² Cu (Up to 315A)" },
                  { value: 200.0, label: "200.0 mm² Cu (Up to 380A)" },
                  { value: 250.0, label: "250.0 mm² Cu (Up to 430A)" },
                ]}
                warning={calc.fieldWarnings.acCableSizeMm2}
                onValueChange={(val) => {
                  const num = parseFloat(val) || 95.0;
                  handleSetField("acCableSizeMm2", num, {
                    cabling: {
                      ...config.cabling,
                      acCable: { ...config.cabling.acCable, conductorSizeMm2: num },
                    },
                  });
                }}
                onResetToAuto={() => {
                  handleResetField("acCableSizeMm2", {
                    cabling: {
                      ...config.cabling,
                      acCable: { ...config.cabling.acCable, conductorSizeMm2: calc.autoValues.acCableSizeMm2 },
                    },
                  });
                }}
              />

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 text-xs font-semibold">
                  One-Way Run Length (m)
                </label>
                <input
                  type="number"
                  min="5"
                  max="300"
                  value={config.cabling.acCable.lengthM}
                  onChange={(e) =>
                    onChange({
                      cabling: {
                        ...config.cabling,
                        acCable: {
                          ...config.cabling.acCable,
                          lengthM: parseFloat(e.target.value) || 40,
                        },
                      },
                    })
                  }
                  className="w-full px-2.5 py-2 font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {/* AC Conduit Size Override */}
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/50">
              <SolarOverrideField
                label="AC Trade Conduit Size"
                fieldKey="acConduitSizeMm"
                effectiveValue={calc.effective.acConduitSizeMm}
                autoValue={calc.autoValues.acConduitSizeMm}
                isOverridden={calc.isOverridden.acConduitSizeMm}
                unit="mmØ"
                type="select"
                options={[
                  { value: 20, label: "20 mmØ (1/2\" trade size)" },
                  { value: 25, label: "25 mmØ (3/4\" trade size)" },
                  { value: 32, label: "32 mmØ (1\" trade size)" },
                  { value: 40, label: "40 mmØ (1-1/4\" trade size)" },
                  { value: 50, label: "50 mmØ (1-1/2\" trade size)" },
                  { value: 65, label: "65 mmØ (2\" trade size)" },
                  { value: 80, label: "80 mmØ (2-1/2\" trade size)" },
                  { value: 90, label: "90 mmØ (3\" trade size)" },
                  { value: 100, label: "100 mmØ (3-1/2\" trade size)" },
                  { value: 110, label: "110 mmØ (4\" trade size)" },
                ]}
                warning={calc.fieldWarnings.acConduitSizeMm}
                hint="PEC Chapter 9, Table 1 & 4 max 40% conduit fill"
                onValueChange={(val) => {
                  const num = parseInt(val) || 50;
                  handleSetField("acConduitSizeMm", num, {
                    cabling: {
                      ...config.cabling,
                      acCable: { ...config.cabling.acCable, conduitSizeMm: num },
                    },
                  });
                }}
                onResetToAuto={() => {
                  handleResetField("acConduitSizeMm", {
                    cabling: {
                      ...config.cabling,
                      acCable: { ...config.cabling.acCable, conduitSizeMm: calc.autoValues.acConduitSizeMm },
                    },
                  });
                }}
              />
            </div>

            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Derated Ampacity:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{calc.acCableAmpacity} A</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">AC Voltage Drop:</span>
                <span className="font-bold text-sky-600">{calc.acVoltageDropV} V ({calc.acVoltageDropPercent}%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
