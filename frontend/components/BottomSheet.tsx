"use client";

import { useState } from "react";
import { ChevronUp } from "lucide-react";

interface Hotspot {
  rank: number;
  cluster_id: number;
  police_station: string;
  road_class: string;
  lanes: number;
  lat: number;
  lon: number;
  predicted_risk_index: number;
  capacity_reduction_rcf: number;
  travel_time_before: string;
  travel_time_after: string;
  delay_savings_per_vehicle: string;
  total_commuter_time_saved_hours: number;
  priority_score: number;
  target_shift: string;
  enforcement_action: string;
  logistics_weight: number;
  logistics_penalty_index: number;
  directed_side?: string;
  upstream_edges?: { lat: number; lng: number }[][];
}

interface BottomSheetProps {
  hotspots: Hotspot[];
  selectedId: number | null;
  onSelectHotspot: (h: Hotspot) => void;
}

function getTierDot(score: number) {
  if (score >= 15.0) return "bg-red-500";
  if (score >= 3.0) return "bg-amber-500";
  return "bg-blue-500";
}

export default function BottomSheet({ hotspots, selectedId, onSelectHotspot }: BottomSheetProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`bottom-sheet glass-panel-heavy rounded-t-2xl flex flex-col overflow-hidden ${expanded ? 'expanded' : ''}`}>
      {/* Grip header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex flex-col items-center pt-2 pb-2 px-4 cursor-pointer border-none bg-transparent w-full shrink-0"
      >
        <div className="bottom-sheet-grip mb-2" />
        <div className="flex items-center gap-2 w-full">
          <ChevronUp className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
            Enforcement Hotspots ({hotspots.length})
          </span>
        </div>
      </button>

      {/* Expandable content */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <div className="flex flex-col gap-1">
          {hotspots.map((h) => {
            const isSelected = h.cluster_id === selectedId;
            return (
              <button
                key={h.cluster_id}
                type="button"
                onClick={() => { onSelectHotspot(h); setExpanded(false); }}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all cursor-pointer border border-transparent text-left w-full ${
                  isSelected
                    ? 'bg-blue-500/10 border-blue-500/20'
                    : 'bg-transparent border-transparent hover:bg-white/20'
                }`}
              >
                <span className="text-[10px] font-extrabold text-slate-400 w-5 text-center font-mono shrink-0">{h.rank}</span>
                <span className={`h-2 w-2 rounded-full shrink-0 ${getTierDot(h.priority_score)}`} />
                <span className={`text-[11px] font-semibold flex-1 truncate ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>
                  {h.police_station}
                </span>
                <span className="text-[9px] font-bold text-slate-400 font-mono shrink-0">
                  {h.priority_score.toFixed(1)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
