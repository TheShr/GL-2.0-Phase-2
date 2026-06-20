"use client";

import { TrendingDown, Activity, Zap } from "lucide-react";

interface FloatingKPIsProps {
  criticalCount: number;
  moderateCount: number;
  capacityRecovery: number;
  delaySavings: number;
}

export default function FloatingKPIs({ criticalCount, moderateCount, capacityRecovery, delaySavings }: FloatingKPIsProps) {
  return (
    <div className="absolute top-3 left-3 right-3 sm:right-auto z-[50] flex gap-2 overflow-x-auto no-scrollbar sm:flex-wrap sm:max-w-[500px] pb-2 sm:pb-0">
      <div className="floating-kpi px-2.5 py-1.5 sm:px-3.5 sm:py-2.5 flex items-center gap-2 sm:gap-2.5 shrink-0">
        <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-lg bg-red-50/80 border border-red-200/30 flex items-center justify-center shrink-0">
          <TrendingDown className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-red-500" />
        </div>
        <div className="flex flex-col">
          <span className="text-[14px] sm:text-[17px] font-extrabold text-red-600 leading-none metric-value">{criticalCount}</span>
          <span className="text-[7px] sm:text-[8px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">Critical</span>
        </div>
      </div>

      <div className="floating-kpi px-2.5 py-1.5 sm:px-3.5 sm:py-2.5 flex items-center gap-2 sm:gap-2.5 shrink-0">
        <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-lg bg-amber-50/80 border border-amber-200/30 flex items-center justify-center shrink-0">
          <Activity className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-amber-500" />
        </div>
        <div className="flex flex-col">
          <span className="text-[14px] sm:text-[17px] font-extrabold text-amber-600 leading-none metric-value">{moderateCount}</span>
          <span className="text-[7px] sm:text-[8px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">Patrols</span>
        </div>
      </div>

      <div className="floating-kpi px-2.5 py-1.5 sm:px-3.5 sm:py-2.5 flex items-center gap-2 sm:gap-2.5 shrink-0">
        <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-lg bg-blue-50/80 border border-blue-200/30 flex items-center justify-center shrink-0">
          <Activity className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-blue-500" />
        </div>
        <div className="flex flex-col">
          <span className="text-[14px] sm:text-[17px] font-extrabold text-blue-600 leading-none metric-value">~{Math.round(delaySavings)}h</span>
          <span className="text-[7px] sm:text-[8px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">Saved</span>
        </div>
      </div>

      <div className="floating-kpi px-2.5 py-1.5 sm:px-3.5 sm:py-2.5 flex items-center gap-2 sm:gap-2.5 shrink-0">
        <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-lg bg-emerald-50/80 border border-emerald-200/30 flex items-center justify-center shrink-0">
          <Zap className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-emerald-500" />
        </div>
        <div className="flex flex-col">
          <span className="text-[14px] sm:text-[17px] font-extrabold text-emerald-600 leading-none metric-value">+{Math.round(capacityRecovery)}%</span>
          <span className="text-[7px] sm:text-[8px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">Capacity</span>
        </div>
      </div>
    </div>
  );
}
