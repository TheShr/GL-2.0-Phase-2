"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Shield, RefreshCw, Zap, ShieldAlert, X, Printer,
  MapPin, Database, TrendingUp, Clock, ChevronRight, AlertTriangle
} from "lucide-react";
import IntelligencePanel from "../components/IntelligencePanel";
import RecommendationsPanel from "../components/RecommendationsPanel";
import TrafficCommander from "../components/TrafficCommander";
import CommandBar from "../components/CommandBar";
import FloatingKPIs from "../components/FloatingKPIs";
import BottomSheet from "../components/BottomSheet";

const MapContainer = dynamic(() => import("../components/MapContainer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-slate-400 text-xs tracking-widest font-medium">
      Initializing cartographic engine...
    </div>
  ),
});

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

interface RouteData {
  name: string;
  coords: { lat: number; lng: number }[];
  color: string;
}

interface SummaryStats {
  total_hotspots: number;
  total_violations: number;
  avg_capacity_recovered: number;
  total_savings: number;
}

export default function Home() {
  const [data, setData] = useState<{ summary: SummaryStats; hotspots: Hotspot[]; routes?: RouteData[] } | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState("08:00");
  const [isDispatchPlanOpen, setIsDispatchPlanOpen] = useState(false);

  // Drawer & Overlay UI States
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [judgeMode, setJudgeMode] = useState(false);
  const [trafficCommanderOpen, setTrafficCommanderOpen] = useState(false);

  // Map layer visibility states
  const [visibleLayers, setVisibleLayers] = useState<Record<string, boolean>>({
    hotspots: true,
    routes: true,
    patrols: true,
    congestion: true,
  });

  // Autocomplete search states
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Simulation updates states (to update metric badges globally in real time)
  const [simulatedUpdates, setSimulatedUpdates] = useState<Record<number, { capacity_reduction_after: number; total_commuter_time_saved_hours: number }>>({});

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/data");
      if (!res.ok) throw new Error("Failed to load model outputs.");
      const json = await res.json();
      setData(json);
      if (json.hotspots?.length > 0) {
        setSelectedId(json.hotspots[0].cluster_id);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to synchronize telemetry database.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const handleSelectNode = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.cluster_id !== undefined) {
        setSelectedId(customEvent.detail.cluster_id);
        setRightDrawerOpen(true);
        if (window.innerWidth < 768) {
          setLeftDrawerOpen(false);
        }
      }
    };

    const handleOpenDispatch = () => {
      setIsDispatchPlanOpen(true);
    };

    const handleSimulationUpdateGlobal = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { cluster_id, capacity_reduction_after, total_commuter_time_saved_hours } = customEvent.detail;
      setSimulatedUpdates(prev => ({
        ...prev,
        [cluster_id]: { capacity_reduction_after, total_commuter_time_saved_hours }
      }));
    };

    window.addEventListener("select-hotspot-node", handleSelectNode);
    window.addEventListener("open-dispatch-matrix", handleOpenDispatch);
    window.addEventListener("simulation-update", handleSimulationUpdateGlobal);

    return () => {
      window.removeEventListener("select-hotspot-node", handleSelectNode);
      window.removeEventListener("open-dispatch-matrix", handleOpenDispatch);
      window.removeEventListener("simulation-update", handleSimulationUpdateGlobal);
    };
  }, []);

  const handleSelectHotspot = useCallback((h: Hotspot) => {
    setSelectedId(h.cluster_id);
    setRightDrawerOpen(true);
    if (window.innerWidth < 768) {
      setLeftDrawerOpen(false);
    }
  }, []);

  const handleToggleLayer = useCallback((layer: string) => {
    setVisibleLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
  }, []);

  const handleToggleJudgeMode = useCallback((val: boolean) => {
    setJudgeMode(val);
    window.dispatchEvent(new CustomEvent("judge-mode-change", { detail: { judgeMode: val } }));
  }, []);

  const handleSearchChange = useCallback((q: string) => {
    setSearchQuery(q);
    if (q.trim().length === 0) {
      setSearchResults([]);
      return;
    }
    const filtered = data?.hotspots.filter(h =>
      h.police_station.toLowerCase().includes(q.toLowerCase()) ||
      h.road_class.toLowerCase().includes(q.toLowerCase())
    ) ?? [];
    setSearchResults(filtered.map(h => ({
      ...h,
      placeName: h.police_station,
      placeAddress: `${h.road_class} (Cluster ${h.cluster_id})`
    })));
  }, [data]);

  const handleSelectSearchResult = useCallback((res: any) => {
    setSelectedId(res.cluster_id);
    setSearchQuery("");
    setSearchResults([]);
    setRightDrawerOpen(true);
    if (window.innerWidth < 768) {
      setLeftDrawerOpen(false);
    }
  }, []);

  const handleToggleLeftDrawer = useCallback(() => {
    setLeftDrawerOpen(prev => {
      const next = !prev;
      if (next && window.innerWidth < 768) {
        setRightDrawerOpen(false);
      }
      return next;
    });
  }, []);

  const handleCloseLeftDrawer = useCallback(() => {
    setLeftDrawerOpen(false);
  }, []);

  const handleCloseRightDrawer = useCallback(() => {
    setRightDrawerOpen(false);
  }, []);

  const handleToggleTrafficCommander = useCallback(() => {
    setTrafficCommanderOpen(prev => !prev);
  }, []);

  const handleCloseTrafficCommander = useCallback(() => {
    setTrafficCommanderOpen(false);
  }, []);

  const handleOpenTrafficCommander = useCallback(() => {
    setTrafficCommanderOpen(true);
  }, []);

  const handleSimulateClick = useCallback(() => {
    if (selectedId === null && data?.hotspots && data.hotspots.length > 0) {
      setSelectedId(data.hotspots[0].cluster_id);
    }
    setRightDrawerOpen(true);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("switch-recommendations-tab", { detail: { tab: "simulator" } }));
    }, 50);
  }, [selectedId, data]);

  // Dynamic metric calculations for the Floating KPI cards
  const hotspotsList = data?.hotspots ?? [];
  const criticalCount = hotspotsList.filter(h => h.priority_score >= 15.0).length;
  const moderateCount = hotspotsList.filter(h => h.priority_score >= 3.0 && h.priority_score < 15.0).length;

  const top10 = hotspotsList.slice(0, 10);
  const totalHotspotsForAvg = Math.min(10, hotspotsList.length || 1);

  const dynamicCapacityRecovery = top10.reduce((sum, h) => {
    const update = simulatedUpdates[h.cluster_id];
    const rcf_before = h.capacity_reduction_rcf;
    const rcf_after = update ? (update.capacity_reduction_after / 100) : rcf_before;
    const rcf_resolved = Math.max(0, rcf_before - rcf_after);
    return sum + (update ? rcf_resolved : rcf_before * 0.25);
  }, 0) / totalHotspotsForAvg * 100;

  const dynamicDelaySavings = hotspotsList.reduce((sum, h) => {
    const update = simulatedUpdates[h.cluster_id];
    return sum + (update ? update.total_commuter_time_saved_hours : h.total_commuter_time_saved_hours);
  }, 0);

  const criticalHotspots = hotspotsList.filter(h => h.priority_score >= 15.0);
  const moderateHotspots = hotspotsList.filter(h => h.priority_score >= 3.0 && h.priority_score < 15.0);

  // ─── LOADING STATE ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center relative overflow-hidden">
        <div className="mesh-gradient-canvas" />
        <div className="relative z-10 glass-panel-heavy rounded-2xl p-10 flex flex-col items-center gap-6 max-w-sm w-full mx-4">
          <div className="flex flex-col items-center gap-3">
            <div className="h-12 w-12 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #0077CC, #00A3FF)', boxShadow: '0 8px 24px rgba(0,163,255,0.3)' }}>
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div className="flex flex-col items-center">
              <span className="text-base font-bold text-slate-900 tracking-tight">GridLock 2.0</span>
              <span className="text-[11px] text-slate-400 font-medium tracking-wider uppercase mt-0.5">Smart City Intelligence</span>
            </div>
          </div>
          <div className="w-full flex flex-col gap-2">
            <div className="loading-bar-track h-1.5 w-full">
              <div className="loading-bar-sweep h-full" />
            </div>
            <span className="text-[10px] text-slate-400 font-medium text-center tracking-wider uppercase animate-pulse-dot">
              Initializing spatial topology graphs...
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ─── ERROR STATE ─────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center px-4 relative">
        <div className="mesh-gradient-canvas" />
        <div className="relative z-10 glass-panel-heavy rounded-2xl p-8 max-w-md w-full flex flex-col items-center gap-5 text-center">
          <div className="h-12 w-12 rounded-xl bg-red-50/80 border border-red-200/40 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-red-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 mb-1">System Initialization Failed</p>
            <p className="text-[12px] text-slate-500 leading-relaxed">
              {error || "Could not synchronize telemetry. Ensure Python pipeline outputs exist in backend/output/ and are properly calibrated."}
            </p>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[12px] font-semibold text-white cursor-pointer transition-all hover:opacity-90 active:scale-95 border-none"
            style={{ background: 'linear-gradient(135deg, #0077CC, #00A3FF)' }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // ─── MAIN DASHBOARD ──────────────────────────────────────────────────────────
  return (
    <div className="h-screen w-screen flex flex-col text-slate-800 overflow-hidden select-none relative">
      {/* Background canvas */}
      <div className="mesh-gradient-canvas" />

      {/* Top command bar strip */}
      <CommandBar
        onToggleLeftDrawer={handleToggleLeftDrawer}
        selectedTime={selectedTime}
        onSelectTime={setSelectedTime}
        visibleLayers={visibleLayers}
        onToggleLayer={handleToggleLayer}
        onSimulateClick={handleSimulateClick}
        judgeMode={judgeMode}
        onToggleJudgeMode={handleToggleJudgeMode}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        searchResults={searchResults}
        onSelectSearchResult={handleSelectSearchResult}
        trafficCommanderOpen={trafficCommanderOpen}
        onToggleTrafficCommander={handleToggleTrafficCommander}
      />

      {/* Main viewport container */}
      <div className="flex-1 relative min-h-0">
        
        {/* Full screen Map */}
        <div className="absolute inset-0 z-[1]">
          <MapContainer
            hotspots={data.hotspots}
            routes={data.routes}
            selectedId={selectedId}
            onSelectHotspot={handleSelectHotspot}
            visibleLayers={visibleLayers}
          />
        </div>

        {/* Floating KPI Cards overlaying map (top-left) */}
        <FloatingKPIs
          criticalCount={criticalCount}
          moderateCount={moderateCount}
          capacityRecovery={dynamicCapacityRecovery}
          delaySavings={dynamicDelaySavings}
        />

        {/* Collapsible Left Drawer (Intelligence / Corridors) */}
        <div className={`drawer-overlay ${leftDrawerOpen ? "visible" : ""}`} onClick={handleCloseLeftDrawer} />
        <div className={`drawer-left ${leftDrawerOpen ? "open" : ""}`}>
          <div className="glass-panel h-full rounded-r-2xl overflow-hidden flex flex-col">
            <IntelligencePanel
              summary={data.summary}
              hotspots={data.hotspots}
              selectedId={selectedId}
              onSelectHotspot={handleSelectHotspot}
              isOpen={leftDrawerOpen}
              onClose={handleCloseLeftDrawer}
              judgeMode={judgeMode}
              onToggleJudgeMode={handleToggleJudgeMode}
            />
          </div>
        </div>

        {/* Collapsible Right Drawer (Inspector / Simulator) */}
        <div className={`drawer-overlay ${rightDrawerOpen ? "visible" : ""}`} onClick={handleCloseRightDrawer} />
        <div className={`drawer-right ${rightDrawerOpen ? "open" : ""}`}>
          <div className="glass-panel h-full rounded-l-2xl overflow-hidden flex flex-col">
            <RecommendationsPanel
              hotspots={data.hotspots}
              selectedId={selectedId}
              isOpen={rightDrawerOpen}
              onClose={handleCloseRightDrawer}
            />
          </div>
        </div>

        {/* Collapsible Bottom Sheet (Ranked list overlay) */}
        <BottomSheet
          hotspots={data.hotspots}
          selectedId={selectedId}
          onSelectHotspot={handleSelectHotspot}
        />

        {/* Traffic Commander (Floating AI Copilot button) */}
        <TrafficCommander
          hotspots={data.hotspots}
          isOpen={trafficCommanderOpen}
          onClose={handleCloseTrafficCommander}
          onOpen={handleOpenTrafficCommander}
        />
      </div>



      {/* ── DISPATCH MODAL ───────────────────────────────────────────────────── */}
      {isDispatchPlanOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center z-[9999] p-4"
          style={{ background: 'rgba(15,23,42,0.40)', backdropFilter: 'blur(12px)' }}
          onClick={() => setIsDispatchPlanOpen(false)}
        >
          <div
            className="glass-panel-heavy rounded-2xl w-full max-w-lg flex flex-col animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/30">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #0077CC, #00A3FF)' }}>
                  <ShieldAlert className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-slate-900 tracking-tight">Enforcement Dispatch Matrix</p>
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">AI-Generated Priority Schedule</p>
                </div>
              </div>
              <button
                onClick={() => setIsDispatchPlanOpen(false)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-white/40 transition-all cursor-pointer border-none bg-transparent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
              {/* Tier 1 */}
              {criticalHotspots.length > 0 && (
                <DispatchTier
                  label="Tier 1 — Critical Dispatch"
                  labelColor="text-red-600"
                  bg="bg-red-50/60"
                  border="border-red-200/40"
                  dot="bg-red-500"
                  hotspots={criticalHotspots}
                />
              )}

              {/* Tier 2 */}
              {moderateHotspots.length > 0 && (
                <DispatchTier
                  label="Tier 2 — Moderate Response"
                  labelColor="text-amber-600"
                  bg="bg-amber-50/60"
                  border="border-amber-200/40"
                  dot="bg-amber-500"
                  hotspots={moderateHotspots.slice(0, 3)}
                />
              )}

              {/* Impact Summary */}
              <div className="rounded-xl glass-card p-4">
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Projected System Impact</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-slate-400 font-medium">Capacity Recovered</span>
                    <span className="text-lg font-extrabold text-emerald-600 leading-none metric-value">+{Math.round(dynamicCapacityRecovery)}%</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-slate-400 font-medium">Peak Delay Savings</span>
                    <span className="text-lg font-extrabold text-blue-600 leading-none metric-value">~{Math.round(dynamicDelaySavings)}h</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-white/30">
              <button
                onClick={() => alert("DISPATCH MATRIX TRANSMITTED // COMMAND PACKET SENT TO DISTRICT PATROL VEHICLES.")}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-semibold text-white cursor-pointer transition-all hover:opacity-90 border-none"
                style={{ background: 'linear-gradient(135deg, #0077CC, #00A3FF)' }}
              >
                <Printer className="h-3.5 w-3.5" />
                Transmit Dispatch Plan
              </button>
              <button
                onClick={() => setIsDispatchPlanOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-[11px] font-semibold text-slate-600 glass-card hover:bg-white/60 cursor-pointer transition-all border-none"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HELPER: Dispatch Tier Block ──────────────────────────────────────────────
function DispatchTier({ label, labelColor, bg, border, dot, hotspots }: {
  label: string;
  labelColor: string;
  bg: string;
  border: string;
  dot: string;
  hotspots: Hotspot[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className={`text-[10px] font-bold uppercase tracking-wider ${labelColor}`}>{label}</p>
      <div className={`rounded-xl border ${bg} ${border} divide-y divide-white/40`}>
        {hotspots.map((h, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
            <span className={`h-2 w-2 rounded-full shrink-0 ${dot}`} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-slate-800 truncate">{h.police_station}</p>
              <p className="text-[9px] text-slate-500 font-medium">{h.enforcement_action}</p>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
