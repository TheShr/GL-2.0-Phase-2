"use client";

import { useState, useEffect } from "react";
import { Search, Flame, Truck, X, Clock } from "lucide-react";

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

interface SummaryStats {
  total_hotspots: number;
  total_violations: number;
  avg_capacity_recovered: number;
  total_savings: number;
}

interface IntelligencePanelProps {
  summary: SummaryStats;
  hotspots: Hotspot[];
  selectedId: number | null;
  onSelectHotspot: (hotspot: Hotspot) => void;
  isOpen: boolean;
  onClose: () => void;
  judgeMode: boolean;
  onToggleJudgeMode: (val: boolean) => void;
}

function getTierConfig(score: number) {
  if (score >= 15.0) return {
    label: "Critical",
    badgeBg: "badge-critical",
    dotColor: "bg-red-500",
    textColor: "text-red-600",
    barColor: "bg-red-500",
  };
  if (score >= 3.0) return {
    label: "Moderate",
    badgeBg: "badge-warning",
    dotColor: "bg-amber-500",
    textColor: "text-amber-600",
    barColor: "bg-amber-500",
  };
  return {
    label: "Monitor",
    badgeBg: "badge-monitor",
    dotColor: "bg-blue-500",
    textColor: "text-blue-600",
    barColor: "bg-blue-500",
  };
}

export default function IntelligencePanel({
  summary, hotspots, selectedId, onSelectHotspot, isOpen, onClose, judgeMode, onToggleJudgeMode
}: IntelligencePanelProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"hotspots" | "logistics">("hotspots");
  const [simulatedUpdates, setSimulatedUpdates] = useState<Record<number, { capacity_reduction_after: number; total_commuter_time_saved_hours: number }>>({});

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { cluster_id, capacity_reduction_after, total_commuter_time_saved_hours } = customEvent.detail;
      setSimulatedUpdates(prev => ({
        ...prev,
        [cluster_id]: { capacity_reduction_after, total_commuter_time_saved_hours }
      }));
    };
    window.addEventListener("simulation-update", handleUpdate as EventListener);
    return () => window.removeEventListener("simulation-update", handleUpdate as EventListener);
  }, []);

  const filtered = hotspots.filter(h =>
    h.police_station.toLowerCase().includes(searchTerm.toLowerCase()) ||
    h.road_class.toLowerCase().includes(searchTerm.toLowerCase()) ||
    `cluster ${h.cluster_id}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full text-slate-700 overflow-hidden">

      {/* ── Top Bar: Judge Toggle + Segmented Tabs ─────────────────────────── */}
      <div className="px-4 pt-4 pb-3 shrink-0 flex flex-col gap-3">
        {/* Title and Close Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Intelligence Panel</span>
            {judgeMode && (
              <span className="px-1.5 py-0.5 text-[8px] font-bold bg-slate-500/15 text-slate-700 border border-slate-300/40 rounded uppercase tracking-wider animate-pulse-dot">
                ✦ Judge Mode
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-6 w-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100/60 transition-all cursor-pointer border-none bg-transparent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Judge mode toggle (inside drawer) */}
        <div className="flex items-center justify-between bg-white/30 border border-white/20 p-2 rounded-xl">
          <span className="text-[10px] text-slate-500 font-medium font-sans">Activate Judge Evaluation</span>
          <button
            type="button"
            onClick={() => onToggleJudgeMode(!judgeMode)}
            className={`px-2.5 py-1 text-[8px] font-bold uppercase tracking-wider rounded-lg cursor-pointer transition-all border ${
              judgeMode
                ? "bg-slate-500/15 text-slate-700 border-slate-300/40"
                : "bg-slate-100/60 text-slate-400 border-slate-200/40 hover:text-slate-600"
            }`}
          >
            {judgeMode ? "Active" : "Disabled"}
          </button>
        </div>

        {/* Segmented Controller */}
        <div className="seg-control-track">
          <button
            type="button"
            className={`seg-control-btn ${activeTab === "hotspots" ? "active" : ""}`}
            onClick={() => setActiveTab("hotspots")}
          >
            <Flame className="h-3 w-3 inline-block mr-1 -mt-0.5" />
            Critical Hotspots
          </button>
          <button
            type="button"
            className={`seg-control-btn ${activeTab === "logistics" ? "active" : ""}`}
            onClick={() => setActiveTab("logistics")}
          >
            <Truck className="h-3 w-3 inline-block mr-1 -mt-0.5" />
            Logistics Corridors
          </button>
        </div>
      </div>

      {/* ── Tab Content ───────────────────────────────────────────────────── */}
      {activeTab === "hotspots" ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden animate-fade-tab" key="hotspots-tab">

          {/* ── Search ──────────────────────────────────────────────────── */}
          <div className="px-4 pb-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Filter by station or road class..."
                className="w-full bg-white/40 border border-white/50 rounded-xl py-2 pl-9 pr-3 text-[11px] focus:outline-none focus:border-blue-400/60 text-slate-700 placeholder:text-slate-400 transition-all backdrop-blur-sm"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* ── Hotspot List ────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="px-4 pb-1">
              <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">
                {judgeMode ? "Top 5 Critical Hotspots (Judge Evaluation)" : `Enforcement Hotspots (${filtered.length})`}
              </span>
            </div>

            <div className="px-3 pb-3 flex flex-col gap-1.5">
              {((judgeMode ? hotspots.slice(0, 5) : filtered).length === 0) ? (
                <div className="py-10 text-center text-slate-400 text-[11px] font-medium border border-dashed border-slate-200/40 rounded-xl m-1">
                  No matching stations found.
                </div>
              ) : (
                (judgeMode ? hotspots.slice(0, 5) : filtered).map((h, idx) => {
                  const tier = getTierConfig(h.priority_score);
                  const isSelected = h.cluster_id === selectedId;
                  const chokePercent = Math.round(h.capacity_reduction_rcf * 100);

                  if (judgeMode) {
                    const predictedViolations = Math.round(h.predicted_risk_index * 1250);
                    const recommendedDeployment = Math.max(1, Math.round(h.priority_score / 12));
                    const congestionReduction = Math.round(h.capacity_reduction_rcf * 0.6 * 100);

                    return (
                      <div
                        key={h.cluster_id}
                        onClick={() => onSelectHotspot(h)}
                        className={`p-4 rounded-xl border cursor-pointer transition-all backdrop-blur-md ${
                          isSelected
                            ? "bg-slate-500/10 border-slate-500/40 ring-1 ring-slate-500/50 shadow-[0_0_12px_rgba(100,116,139,0.12)]"
                            : "bg-white/20 border-white/20 hover:bg-white/30"
                        }`}
                        style={{ borderColor: isSelected ? '#64748B' : 'rgba(255,255,255,0.15)' }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-extrabold text-slate-600 uppercase tracking-widest">
                            TOP 5 HOTSPOT #{idx + 1}
                          </span>
                          <span className="text-[9px] bg-slate-500/10 text-slate-700 font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-slate-500/20 font-mono">
                            Score: {h.priority_score.toFixed(1)}
                          </span>
                        </div>

                        <p className="text-[13px] font-bold text-slate-800 leading-snug truncate">
                          {h.police_station}
                        </p>
                        <p className="text-[10px] text-slate-500 font-medium truncate mb-3">
                          {h.road_class}
                        </p>

                        <div className="space-y-2 text-[10px] border-t border-slate-200/50 pt-2.5">
                          <div className="flex justify-between">
                            <span className="text-slate-500 font-medium">Predicted Violations:</span>
                            <span className="font-mono font-bold text-slate-800">~{predictedViolations} / shift</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500 font-medium">Capacity Recovery:</span>
                            <span className="font-mono font-bold text-slate-800">+{congestionReduction}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500 font-medium">Delay Savings:</span>
                            <span className="font-mono font-bold text-slate-800">~{Math.round(h.total_commuter_time_saved_hours)}h / day</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500 font-medium">Logistics Impact Index:</span>
                            <span className="font-mono font-bold text-slate-800">LPI {h.logistics_penalty_index.toFixed(2)}</span>
                          </div>
                          <div className="text-[8px] font-bold text-slate-700 bg-slate-500/10 border border-slate-500/20 p-1.5 rounded uppercase mt-2.5 text-center tracking-wider">
                            Deployment Rec: {recommendedDeployment} Officers ({h.enforcement_action.split(" + ")[0] || "Patrols"})
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={h.cluster_id}
                      onClick={() => onSelectHotspot(h)}
                      className={`hotspot-card ${isSelected ? 'selected' : ''} p-4 rounded-xl border cursor-pointer backdrop-blur-md`}
                      style={{
                        background: isSelected ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)',
                        borderColor: isSelected ? 'rgba(0,119,204,0.50)' : 'rgba(255,255,255,0.15)',
                      }}
                    >
                      {/* Row 1: Rank + Tier badge */}
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 rounded-full ${tier.dotColor}`} />
                          <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">
                            Rank {h.rank}
                          </span>
                        </div>
                        <span className={`text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${tier.badgeBg}`}>
                          {tier.label} · {h.priority_score.toFixed(1)}
                        </span>
                      </div>

                      {/* Row 2: Station name */}
                      <p className="text-[12px] font-semibold text-slate-900 truncate leading-snug mb-0.5">
                        {h.police_station}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium truncate mb-2.5">
                        {h.road_class} · {h.lanes} {h.lanes === 1 ? 'lane' : 'lanes'}
                      </p>

                      {/* Row 3: Choke capacity bar */}
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] text-slate-400 font-medium">Capacity Choke</span>
                          <span className="text-[9px] font-bold text-slate-700">{chokePercent}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-200/50 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full progress-fill ${tier.barColor}`}
                            style={{ width: `${chokePercent}%`, opacity: 0.7 }}
                          />
                        </div>
                      </div>

                      {/* Row 4: Metadata chips */}
                      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                        <Chip label="LPI" value={h.logistics_penalty_index ? h.logistics_penalty_index.toFixed(2) : '0.00'} />
                        <Chip label="Saved" value={`~${Math.round(h.total_commuter_time_saved_hours)}h`} />
                        <Chip label="Shift" value={h.target_shift?.split(' ')[0] ?? 'AM'} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ── LOGISTICS CORRIDORS TAB ──────────────────────────────────────── */
        <div className="flex-1 overflow-y-auto px-4 pb-4 animate-fade-tab" key="logistics-tab">
          <div className="flex flex-col gap-3">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Flipkart Route Performance</span>

            <RouteStatusRow
              name="Route 1 (Whitefield ➔ Koramangala)"
              delay="+14.5 min"
              status="Congested (Agara Circle)"
              color="bg-blue-600"
              gradient="from-blue-600 to-blue-500"
            />
            <RouteStatusRow
              name="Route 2 (Electronic City ➔ Majestic)"
              delay="+26.8 min"
              status="Critical (Silk Board Bottleneck)"
              color="bg-blue-600"
              gradient="from-blue-600 to-blue-500"
            />
            <RouteStatusRow
              name="Route 3 (Hebbal ➔ Indiranagar)"
              delay="+8.2 min"
              status="Slow (Tin Factory Junction)"
              color="bg-blue-600"
              gradient="from-blue-600 to-blue-500"
            />

            {/* Corridor metrics summary */}
            <div className="glass-card rounded-xl p-4 mt-2">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-3">Corridor Impact Metrics</span>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] text-slate-400 font-medium">Avg Route Delay</span>
                  <span className="text-lg font-extrabold text-slate-800 leading-none metric-value">+16.5 min</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] text-slate-400 font-medium">Deliveries Affected</span>
                  <span className="text-lg font-extrabold text-slate-800 leading-none metric-value">~340/hr</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] text-slate-400 font-medium">Cost Impact (LPI)</span>
                  <span className="text-lg font-extrabold text-slate-800 leading-none metric-value">₹2.4L/day</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] text-slate-400 font-medium">Recovery Potential</span>
                  <span className="text-lg font-extrabold text-slate-800 leading-none metric-value">+18%</span>
                </div>
              </div>
            </div>

            {/* Logistics weight legend */}
            <div className="glass-card rounded-xl p-4">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Logistics Weight Scale</span>
              <div className="flex flex-col gap-2">
                <WeightBar label="Whitefield ITPL" weight={3.0} />
                <WeightBar label="Electronic City" weight={3.0} />
                <WeightBar label="Koramangala" weight={3.0} />
                <WeightBar label="Hebbal" weight={3.0} />
                <WeightBar label="Shivajinagar" weight={1.8} />
                <WeightBar label="City Market" weight={1.8} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-Components ────────────────────────────────────────────────────────────

function KpiCard({ value, label, sub, valueColor, bg, border, icon }: {
  value: string; label: string; sub: string;
  valueColor: string; bg: string; border: string; icon: React.ReactNode;
}) {
  return (
    <div className={`${bg} border ${border} rounded-xl p-3 flex flex-col gap-0.5 backdrop-blur-sm`}>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <span className={`text-xl font-extrabold leading-none tracking-tight metric-value ${valueColor}`}>{value}</span>
      <span className="text-[9px] text-slate-400 font-medium">{sub}</span>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 border border-white/20 backdrop-blur-sm">
      <span className="text-[8px] font-medium text-slate-400">{label}</span>
      <span className="text-[8px] font-bold text-slate-700">{value}</span>
    </div>
  );
}

function RouteStatusRow({ name, delay, status, color, gradient }: {
  name: string; delay: string; status: string; color: string; gradient: string;
}) {
  const handleClick = () => {
    window.dispatchEvent(new CustomEvent("select-route", { detail: { routeName: name } }));
  };

  return (
    <div 
      onClick={handleClick} 
      className="glass-card rounded-xl p-4 flex flex-col gap-2 cursor-pointer hover:bg-slate-100/10 active:scale-[0.98] transition-all"
    >
      <div className="flex items-center gap-2.5">
        <span className={`h-2 w-2 rounded-full shrink-0 ${color}`} />
        <p className="text-[10px] font-bold text-slate-800 truncate flex-1 leading-none">{name}</p>
      </div>
      <p className="text-[9px] text-slate-400 font-medium pl-4.5">{status}</p>
      <div className="flex items-center gap-2 mt-1">
        <div className="flex-1 h-1.5 bg-slate-100/60 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${gradient}`}
            style={{ width: `${Math.min(100, parseFloat(delay) * 3)}%` }}
          />
        </div>
        <div className="flex items-center gap-1 shrink-0 text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-0.5">
          <Clock className="h-2.5 w-2.5" />
          <span className="text-[8px] font-extrabold">{delay}</span>
        </div>
      </div>
    </div>
  );
}

function WeightBar({ label, weight }: { label: string; weight: number }) {
  const pct = (weight / 3.0) * 100;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-medium text-slate-600">{label}</span>
        <span className="text-[9px] font-bold text-slate-700">×{weight.toFixed(1)}</span>
      </div>
      <div className="h-1.5 bg-slate-100/60 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-blue-500 progress-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
