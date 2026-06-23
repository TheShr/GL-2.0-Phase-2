import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionHeader, TabStrip, Eyebrow, Readout } from "@/components/hud";
import { useTelemetry } from "@/lib/telemetry-context";
import { DEPLOYMENT_FRONTIER } from "@/lib/mock";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/optimizer")({
  head: () => ({
    meta: [
      { title: "Optimizer & Simulation — Atlas" },
      { name: "description", content: "MILP dispatch optimizer and Greenshields traffic simulation with scenario builder." },
    ],
  }),
  component: Optimizer,
});

const TABS = ["Before/After", "Intervention Simulator", "Deployment Frontier", "Live Dispatch Tracking", "Scenario Builder", "Counterfactual"];

function Optimizer() {
  const [tab, setTab] = useState(TABS[0]);
  return (
    <div className="space-y-4 max-w-5xl">
      <SectionHeader title="Optimizer & Simulation" subtitle="MILP dispatch · Greenshields flow simulation" />
      <TabStrip tabs={TABS} active={tab} onChange={setTab} />
      {tab === "Before/After" && <BeforeAfter />}
      {tab === "Intervention Simulator" && <Simulator />}
      {tab === "Deployment Frontier" && <Frontier />}
      {tab === "Live Dispatch Tracking" && <LiveDispatchTracking />}
      {tab === "Scenario Builder" && <ScenarioBuilder />}
      {tab === "Counterfactual" && <Counterfactual />}
    </div>
  );
}


// Helper to assign baseline capacity and travel demand based on police station domains
const getRoadProfile = (policeStation: string) => {
  const station = policeStation || "";
  if (['HAL Old Airport', 'Hebbala', 'High ground', 'Chikkajala', 'HSR Layout', 'Bellandur'].includes(station)) {
    return { C_base: 4000.0, q_demand: 3900.0, lanes: 3 };
  } else if (['Upparpet', 'Shivajinagar', 'City Market', 'Malleshwaram', 'Vijayanagara', 'Rajajinagar', 'Kodigehalli', 'Magadi Road'].includes(station)) {
    return { C_base: 1600.0, q_demand: 1550.0, lanes: 2 };
  } else {
    return { C_base: 1000.0, q_demand: 950.0, lanes: 1 };
  }
};

// Simulation engine running Greenshields queuing solver across hotspots
const simulateIntervention = (
  hotspotsList: any[],
  officersCount: number,
  budgetLimit: number,
  wDelay: number,
  wRisk: number,
  wLogi: number
) => {
  if (!hotspotsList || hotspotsList.length === 0) {
    return { congestion: 95, delaySaved: 23, riskCut: 20, logiGain: 15 };
  }

  const allocations = new Array(hotspotsList.length).fill(0);
  const maxPerHotspot = 3;

  const wSum = (wDelay + wRisk + wLogi) || 1;
  const wd = wDelay / wSum;
  const wr = wRisk / wSum;
  const wl = wLogi / wSum;

  const V_free = 40.0;
  const rho_jam_lane = 150.0;

  const getHotspotMetrics = (h: any, x: number) => {
    const profile = getRoadProfile(h.police_station);
    const C_base = profile.C_base;
    const q_demand = profile.q_demand;
    const lanes = h.lanes || profile.lanes;
    const rho_jam = rho_jam_lane * lanes;

    const coeff_c_normal = (q_demand * rho_jam) / V_free;
    const discriminant_normal = (rho_jam ** 2) - (4.0 * coeff_c_normal);
    const rho_normal = discriminant_normal >= 0 ? (rho_jam - Math.sqrt(discriminant_normal)) / 2.0 : rho_jam / 2.0;
    const v_normal = V_free * (1.0 - (rho_normal / rho_jam));
    const t_normal = (1.0 / v_normal) * 60.0;

    const baseRisk = h.predicted_risk_index || 0;
    const riskUpdated = baseRisk * Math.exp(-0.25 * x);

    const constriction_coef = 0.3;
    const slopePenalty = 1.5 * Math.abs(h.slope || 0);
    const rcf = Math.min(0.50, riskUpdated * constriction_coef + slopePenalty);
    const C_congested = C_base * (1.0 - rcf);
    const rho_jam_reduced = rho_jam * (1.0 - rcf);

    let t_congested = 0.0;
    if (q_demand > C_congested) {
      const rho_congested = rho_jam_reduced / 2.0;
      const v_congested = V_free * (1.0 - (rho_congested / rho_jam_reduced));
      const t_segment = (1.0 / v_congested) * 60.0;
      const delay_queue = ((q_demand - C_congested) / (2.0 * C_congested)) * 60.0;
      t_congested = t_segment + delay_queue;
    } else {
      const coeff_c_congested = (q_demand * rho_jam_reduced) / V_free;
      const discriminant_congested = (rho_jam_reduced ** 2) - (4.0 * coeff_c_congested);
      const rho_congested = discriminant_congested >= 0 ? (rho_jam_reduced - Math.sqrt(discriminant_congested)) / 2.0 : rho_jam_reduced / 2.0;
      const v_congested = V_free * (1.0 - (rho_congested / rho_jam_reduced));
      t_congested = (1.0 / v_congested) * 60.0;
    }

    const delaySavings = Math.max(0.0, t_congested - t_normal);
    const totalDelaySavingsHours = (delaySavings / 60.0) * q_demand;

    const lambda_i = h.logistics_weight || 1.0;
    const lpi = rcf * lambda_i;

    const delay_component = Math.min(1.0, totalDelaySavingsHours / 1500.0) * 40.0;
    const logistics_component = Math.min(1.0, lpi / 0.45) * 30.0;
    const risk_component = riskUpdated * 30.0;

    const score = delay_component * wd + logistics_component * wl + risk_component * wr;

    return {
      risk: riskUpdated,
      rcf,
      delaySavings,
      lpi,
      score,
      t_congested,
      t_normal
    };
  };

  const officerCost = 1.5;
  const maxAffordableOfficers = Math.min(officersCount, Math.floor(budgetLimit / officerCost));

  for (let o = 0; o < maxAffordableOfficers; o++) {
    let bestIdx = -1;
    let bestDelta = -Infinity;

    for (let i = 0; i < hotspotsList.length; i++) {
      if (allocations[i] >= maxPerHotspot) continue;

      const currentScore = getHotspotMetrics(hotspotsList[i], allocations[i]).score;
      const nextScore = getHotspotMetrics(hotspotsList[i], allocations[i] + 1).score;
      const delta = currentScore - nextScore;
      if (delta > bestDelta) {
        bestDelta = delta;
        bestIdx = i;
      }
    }

    if (bestIdx !== -1 && bestDelta > 0) {
      allocations[bestIdx]++;
    } else {
      break;
    }
  }

  const runFrankWolfe = (h: any, x: number) => {
    const m = getHotspotMetrics(h, x);
    const profile = getRoadProfile(h.police_station);
    const q_demand = profile.q_demand;
    const t_normal = m.t_normal;
    const t_congested = m.t_congested;
    
    const t_detour_base = t_normal * 1.6 + 8.0;
    
    let f1 = q_demand;
    for (let k = 0; k < 6; k++) {
      const ratio = f1 / q_demand;
      const t_prim = t_normal + (t_congested - t_normal) * Math.pow(ratio, 4);
      const t_detour = t_detour_base + 3.0 * Math.pow(1 - ratio, 2);
      
      const y1 = t_prim < t_detour ? q_demand : 0;
      const alpha = 2.0 / (k + 2.0);
      f1 = f1 + alpha * (y1 - f1);
    }
    
    const ratio_final = f1 / q_demand;
    return t_normal + (t_congested - t_normal) * Math.pow(ratio_final, 4);
  };

  let totalRiskBefore = 0;
  let totalRiskAfter = 0;
  let totalLpiBefore = 0;
  let totalLpiAfter = 0;
  let totalRcfBefore = 0;
  let totalRcfAfter = 0;
  let totalDelaySavedMin = 0;

  for (let i = 0; i < hotspotsList.length; i++) {
    const mBefore = getHotspotMetrics(hotspotsList[i], 0);
    const mAfter = getHotspotMetrics(hotspotsList[i], allocations[i]);

    totalRiskBefore += hotspotsList[i].predicted_risk_index || 0;
    totalRiskAfter += mAfter.risk;

    totalLpiBefore += hotspotsList[i].logistics_penalty_index || 0;
    totalLpiAfter += mAfter.lpi;

    totalRcfBefore += hotspotsList[i].capacity_reduction_rcf || 0;
    totalRcfAfter += mAfter.rcf;

    const tBeforeEquil = runFrankWolfe(hotspotsList[i], 0);
    const tAfterEquil = runFrankWolfe(hotspotsList[i], allocations[i]);
    const delaySavedVehicle = Math.max(0, tBeforeEquil - tAfterEquil);
    totalDelaySavedMin += delaySavedVehicle;
  }

  const count = hotspotsList.length || 1;
  const avgCongestedRcfAfter = totalRcfAfter / count;
  const congestionPercent = Math.round((avgCongestedRcfAfter / 0.50) * 100);

  const riskReductionPercent = totalRiskBefore > 0 ? Math.round(((totalRiskBefore - totalRiskAfter) / totalRiskBefore) * 100) : 0;
  const logisticsGainPercent = totalLpiBefore > 0 ? Math.round(((totalLpiBefore - totalLpiAfter) / totalLpiBefore) * 100) : 0;
  const averageDelaySavedMin = Math.round(totalDelaySavedMin / count);

  return {
    congestion: Math.max(0, Math.min(100, congestionPercent)),
    delaySaved: averageDelaySavedMin,
    riskCut: Math.max(0, Math.min(100, riskReductionPercent)),
    logiGain: Math.max(0, Math.min(100, logisticsGainPercent))
  };
};

const runScenarioSimulation = (hotspotsList: any[], activeScenarios: Record<string, boolean>) => {
  if (!hotspotsList || hotspotsList.length === 0) {
    return { risk: 76, delay: 49, officers: 47 };
  }
  let speedMult = 1.0;
  let demandMult = 1.0;
  let capacityMult = 1.0;
  let riskMultiplier = 1.0;

  if (activeScenarios["Rain"]) {
    speedMult = 0.8;
    riskMultiplier *= 1.25;
  }
  if (activeScenarios["Special Event"]) {
    demandMult *= 1.2;
    riskMultiplier *= 1.15;
  }
  if (activeScenarios["Road Closure"]) {
    capacityMult = 0.65;
    riskMultiplier *= 1.10;
  }
  if (activeScenarios["Demand Surge +30%"]) {
    demandMult *= 1.3;
  }

  let totalRiskBefore = 0;
  let totalDelayBefore = 0;
  let totalOfficersRequired = 0;

  const V_free = 40.0 * speedMult;
  const rho_jam_lane = 150.0;

  for (const h of hotspotsList) {
    const profile = getRoadProfile(h.police_station || "");
    const C_base = profile.C_base * capacityMult;
    const q_demand = profile.q_demand * demandMult;
    const lanes = h.lanes || profile.lanes;
    const rho_jam = rho_jam_lane * lanes * capacityMult;

    const coeff_c_normal = (q_demand * rho_jam) / V_free;
    const discriminant_normal = (rho_jam ** 2) - (4.0 * coeff_c_normal);
    const rho_normal = discriminant_normal >= 0 ? (rho_jam - Math.sqrt(discriminant_normal)) / 2.0 : rho_jam / 2.0;
    const v_normal = V_free * (1.0 - (rho_normal / rho_jam));
    const t_normal = (1.0 / v_normal) * 60.0;

    const baseRisk = (h.predicted_risk_index || 0) * riskMultiplier;
    const constriction_coef = 0.3;
    const slopePenalty = 1.5 * Math.abs(h.slope || 0);
    const rcf = Math.min(0.50, baseRisk * constriction_coef + slopePenalty);
    const C_congested = C_base * (1.0 - rcf);
    const rho_jam_reduced = rho_jam * (1.0 - rcf);

    let t_congested = 0.0;
    if (q_demand > C_congested) {
      const rho_congested = rho_jam_reduced / 2.0;
      const v_congested = V_free * (1.0 - (rho_congested / rho_jam_reduced));
      const t_segment = (1.0 / v_congested) * 60.0;
      const delay_queue = ((q_demand - C_congested) / (2.0 * C_congested)) * 60.0;
      t_congested = t_segment + delay_queue;
    } else {
      const coeff_c_congested = (q_demand * rho_jam_reduced) / V_free;
      const discriminant_congested = (rho_jam_reduced ** 2) - (4.0 * coeff_c_congested);
      const rho_congested = discriminant_congested >= 0 ? (rho_jam_reduced - Math.sqrt(discriminant_congested)) / 2.0 : rho_jam_reduced / 2.0;
      const v_congested = V_free * (1.0 - (rho_congested / rho_jam_reduced));
      t_congested = (1.0 / v_congested) * 60.0;
    }

    totalRiskBefore += Math.min(1.0, baseRisk);
    totalDelayBefore += t_congested;

    const req = h.logistics_weight >= 3.0 ? 3 : (h.logistics_weight >= 1.8 ? 2 : 1);
    totalOfficersRequired += Math.round(req * riskMultiplier);
  }

  const count = hotspotsList.length || 1;
  const avgRiskIndex = Math.round((totalRiskBefore / count) * 100);
  const avgDelayMin = Math.round(totalDelayBefore / count);

  return {
    risk: Math.max(0, Math.min(100, avgRiskIndex)),
    delay: Math.max(0, avgDelayMin),
    officers: Math.max(0, totalOfficersRequired)
  };
};

function BeforeAfter() {
  const [pos, setPos] = useState(50);
  const { rawHotspots, summary } = useTelemetry();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const avgCapacityRecovered = summary?.avg_capacity_recovered || 5;
  const totalSavings = summary?.total_savings || 118;

  const avgDelayBefore = rawHotspots.length > 0
    ? rawHotspots.reduce((sum: number, h: any) => sum + (parseFloat(h.travel_time_before) || 0), 0) / rawHotspots.length
    : 3.2;

  const avgDelayAfter = rawHotspots.length > 0
    ? rawHotspots.reduce((sum: number, h: any) => sum + (parseFloat(h.travel_time_after) || 0), 0) / rawHotspots.length
    : 2.1;

  const avgDelaySaved = Math.max(0, avgDelayBefore - avgDelayAfter);

  // Scrubber-dependent live values
  const pctAfter = (100 - pos) / 100;
  
  const currentCongestion = Math.round(100 - pctAfter * avgCapacityRecovered);
  const currentDelay = avgDelayBefore - pctAfter * avgDelaySaved;
  const currentSavings = Math.round(pctAfter * totalSavings);
  const currentLogisticsRecovery = Math.round(pctAfter * (avgCapacityRecovered * 1.2));

  return (
    <div className="space-y-4">
      <div className={`relative h-72 border border-hairline overflow-hidden select-none rounded-xl ${isDark ? "bg-slate-950" : "bg-slate-50"}`}>
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes flow-slow-right {
            0% { stroke-dashoffset: 0; }
            100% { stroke-dashoffset: 15; }
          }
          @keyframes flow-slow-left {
            0% { stroke-dashoffset: 0; }
            100% { stroke-dashoffset: -15; }
          }
          @keyframes flow-fast-right {
            0% { stroke-dashoffset: 0; }
            100% { stroke-dashoffset: -40; }
          }
          @keyframes flow-fast-left {
            0% { stroke-dashoffset: 0; }
            100% { stroke-dashoffset: 40; }
          }
          @keyframes pulse-queue-red {
            0%, 100% { fill-opacity: 0.15; stroke-opacity: 0.4; }
            50% { fill-opacity: 0.35; stroke-opacity: 0.8; }
          }
          @keyframes blink-hazard-light {
            0%, 100% { fill: #EAB308; filter: drop-shadow(0 0 1px #EAB308); }
            50% { fill: #EF4444; filter: drop-shadow(0 0 4px #EF4444); }
          }
          .animate-flow-slow-rt {
            stroke-dasharray: 6, 8;
            animation: flow-slow-right 4s linear infinite;
          }
          .animate-flow-slow-lt {
            stroke-dasharray: 6, 8;
            animation: flow-slow-left 4s linear infinite;
          }
          .animate-flow-fast-rt {
            stroke-dasharray: 8, 12;
            animation: flow-fast-right 1.5s linear infinite;
          }
          .animate-flow-fast-lt {
            stroke-dasharray: 8, 12;
            animation: flow-fast-left 1.5s linear infinite;
          }
          .animate-pulse-qr {
            animation: pulse-queue-red 2s ease-in-out infinite;
          }
          .animate-blink-hz {
            animation: blink-hazard-light 0.6s step-end infinite;
          }
        `}} />

        {/* BEFORE STATE (Left / Bottom Layer) */}
        <div className="absolute inset-0 w-full h-full" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <StreetLevelView state="before" />
          <div className={`absolute top-3 left-4 z-10 border px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 backdrop-blur ${
            isDark 
              ? "bg-slate-900/95 border-red-900/40 text-red-500" 
              : "bg-white/95 border-red-200 text-red-600 shadow-sm"
          }`}>
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            <span>Before: Blocked Corridor (Status Quo)</span>
          </div>
        </div>

        {/* AFTER STATE (Right / Top Layer - Clipped) */}
        <div className="absolute inset-0 w-full h-full" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
          <StreetLevelView state="after" />
          <div className={`absolute top-3 right-4 z-10 border px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 backdrop-blur ${
            isDark 
              ? "bg-slate-900/95 border-emerald-500/40 text-emerald-400" 
              : "bg-white/95 border-emerald-200 text-emerald-600 shadow-sm"
          }`}>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>After: AI-Optimized Deployment</span>
          </div>
        </div>

        {/* SCRUBBER DIVIDER LINE */}
        <div className="absolute top-0 bottom-0 pointer-events-none z-20" style={{ left: `${pos}%` }}>
          <div className="h-full w-[2px] bg-signal relative" />
        </div>

        {/* RANGE SLIDER INPUT OVERLAY */}
        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 w-3/4 accent-signal z-30 opacity-70 hover:opacity-100 transition-opacity"
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Delta 
          label="Congestion" 
          before="100%" 
          after={`${currentCongestion}%`} 
          delta={`−${100 - currentCongestion}%`} 
        />
        <Delta 
          label="Avg Delay" 
          before={`${avgDelayBefore.toFixed(1)}m/km`} 
          after={`${currentDelay.toFixed(1)}m/km`} 
          delta={`−${(avgDelayBefore - currentDelay).toFixed(1)}m/km`} 
        />
        <Delta 
          label="Total Savings" 
          before="0h" 
          after={`${currentSavings}h`} 
          delta={`+${currentSavings}h`} 
        />
        <Delta 
          label="Logistics Recovery" 
          before="0%" 
          after={`${currentLogisticsRecovery}%`} 
          delta={`+${currentLogisticsRecovery}%`} 
        />
      </div>
    </div>
  );
}

function Delta({ label, before, after, delta }: { label: string; before: string; after: string; delta: string }) {
  return (
    <div className="border border-hairline bg-surface p-3 font-mono">
      <Eyebrow>{label}</Eyebrow>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="readout text-xs text-text-muted line-through">{before}</span>
        <span className="readout text-xl">{after}</span>
      </div>
      <div className="readout text-xs mt-1" style={{ color: "var(--signal)" }}>{delta}</div>
    </div>
  );
}

function Simulator() {
  const [officers, setOfficers] = useState(40);
  const [budget, setBudget] = useState(60);
  const [wDelay, setWDelay] = useState(50);
  const [wRisk, setWRisk] = useState(30);
  const [wLogi, setWLogi] = useState(20);
  const { rawHotspots } = useTelemetry();

  const out = useMemo(() => {
    return simulateIntervention(rawHotspots, officers, budget, wDelay, wRisk, wLogi);
  }, [rawHotspots, officers, budget, wDelay, wRisk, wLogi]);

  const Slider = ({ label, value, set, max, unit }: { label: string; value: number; set: (n: number) => void; max: number; unit?: string }) => (
    <div>
      <div className="flex justify-between">
        <Eyebrow>{label}</Eyebrow>
        <span className="readout text-xs">{value}{unit}</span>
      </div>
      <input type="range" min={0} max={max} value={value} onChange={(e) => set(Number(e.target.value))} className="w-full accent-signal" />
    </div>
  );

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="border border-hairline bg-surface p-4 space-y-4">
        <Eyebrow>MILP Objective Inputs</Eyebrow>
        <Slider label="Officer Count" value={officers} set={setOfficers} max={80} />
        <Slider label="Budget (lakh ₹)" value={budget} set={setBudget} max={120} />
        <div className="border-t border-hairline pt-3 space-y-3">
          <Eyebrow>Objective Weights</Eyebrow>
          <Slider label="Delay priority" value={wDelay} set={setWDelay} max={100} unit="%" />
          <Slider label="Risk priority" value={wRisk} set={setWRisk} max={100} unit="%" />
          <Slider label="Logistics priority" value={wLogi} set={setWLogi} max={100} unit="%" />
        </div>
        <div className="border-t border-hairline pt-3">
          <Eyebrow>Per-region capacity</Eyebrow>
          <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
            {["South ORR", "Central", "North", "East"].map((r) => {
              const regionHotspots = rawHotspots.filter(h => {
                const ps = (h.police_station || "").toLowerCase();
                if (r === "South ORR") return ps.includes("airport") || ps.includes("bellandur") || ps.includes("hsr");
                if (r === "Central") return ps.includes("cubbon") || ps.includes("upparpet") || ps.includes("gate") || ps.includes("adugodi") || ps.includes("halasuru");
                if (r === "North") return ps.includes("hebbal");
                return true;
              });
              const regionalLoss = regionHotspots.reduce((sum, h) => sum + (h.capacity_reduction_rcf || 0), 0) / (regionHotspots.length || 1);
              return (
                <div key={r} className="flex items-center justify-between border border-hairline px-2 py-1 font-mono">
                  <span className="text-text-muted">{r}</span>
                  <span className="readout">{Math.round(regionalLoss * 100)}% Choke</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="border border-hairline bg-surface p-4 grid grid-cols-2 gap-5 content-start">
        <Eyebrow className="col-span-2">Live Optimizer Output</Eyebrow>
        <Readout label="Congestion" value={out.congestion} unit="%" size="lg" critical={out.congestion > 85} />
        <Readout label="Delay Saved" value={out.delaySaved} unit="m" size="lg" />
        <Readout label="Risk Reduction" value={out.riskCut} unit="%" size="lg" />
        <Readout label="Logistics Gain" value={out.logiGain} unit="%" size="lg" />
      </div>
    </div>
  );
}

function Frontier() {
  const [picked, setPicked] = useState<number | null>(null);
  const { rawHotspots } = useTelemetry();

  const frontierData = useMemo(() => {
    const counts = [0, 10, 20, 30, 40, 50, 60, 70, 80];
    return counts.map(c => {
      const res = simulateIntervention(rawHotspots, c, 120, 40, 30, 30);
      return {
        officers: c,
        reduction: res.riskCut
      };
    });
  }, [rawHotspots]);

  return (
    <div className="border border-hairline bg-surface p-4 font-mono">
      <Eyebrow>Officer count vs congestion reduction — click a point to load scenario</Eyebrow>
      <div className="h-72 mt-3">
        <ResponsiveContainer>
          <LineChart data={frontierData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} onClick={(e) => e?.activeTooltipIndex != null && setPicked(e.activeTooltipIndex)}>
            <CartesianGrid stroke="var(--border-hairline)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="officers" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
            <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
            <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-hairline)", fontSize: 11 }} />
            <Line type="monotone" dataKey="reduction" stroke="var(--signal)" strokeWidth={2} dot={{ r: 3, fill: "var(--signal)" }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {picked != null && (
        <p className="text-xs text-text-muted mt-2 readout">
          Loaded scenario · {frontierData[picked].officers} officers → {frontierData[picked].reduction}% reduction
        </p>
      )}
    </div>
  );
}

function ScenarioBuilder() {
  const scenarios = ["Rain", "Special Event", "Road Closure", "Demand Surge +30%"];
  const [active, setActive] = useState<Record<string, boolean>>({});
  const { rawHotspots } = useTelemetry();

  const scenarioMetrics = useMemo(() => {
    return runScenarioSimulation(rawHotspots, active);
  }, [rawHotspots, active]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {scenarios.map((s) => (
          <button
            key={s}
            onClick={() => setActive((a) => ({ ...a, [s]: !a[s] }))}
            className={`px-3 py-1.5 text-xs border ${active[s] ? "border-signal text-signal" : "border-hairline text-text-muted"}`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Readout label="Adjusted City Risk" value={scenarioMetrics.risk} size="lg" critical={scenarioMetrics.risk > 85} />
        <Readout label="Adjusted Avg Delay" value={`${scenarioMetrics.delay}m`} size="lg" />
        <Readout label="Required Officers" value={scenarioMetrics.officers} size="lg" />
      </div>
      <p className="text-xs text-text-muted">Active perturbations dynamically re-evaluate road capacities, free-flow speeds, jam densities, and GNN risk indices across the network.</p>
    </div>
  );
}

function Counterfactual() {
  const { rawHotspots } = useTelemetry();

  const avgDelayBefore = rawHotspots.length > 0
    ? Math.round(rawHotspots.reduce((sum: number, h: any) => sum + (parseFloat(h.travel_time_before) || 0), 0) / rawHotspots.length)
    : 72;

  const avgDelayAfter = rawHotspots.length > 0
    ? Math.round(rawHotspots.reduce((sum: number, h: any) => sum + (parseFloat(h.travel_time_after) || 0), 0) / rawHotspots.length)
    : 49;

  const avgDelaySaved = Math.max(0, avgDelayBefore - avgDelayAfter);

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="border border-hairline bg-surface p-6 text-center font-mono">
        <Eyebrow>Without Intervention</Eyebrow>
        <div className="readout text-5xl mt-3">{avgDelayBefore}<span className="text-xl text-text-muted">min/km</span></div>
        <p className="text-xs text-text-muted mt-2">Projected average corridor travel time at peak</p>
      </div>
      <div className="border border-hairline bg-surface p-6 text-center font-mono">
        <Eyebrow>With Intervention</Eyebrow>
        <div className="readout text-5xl mt-3">{avgDelayAfter}<span className="text-xl text-text-muted">min/km</span></div>
        <p className="text-xs text-text-muted mt-2">Optimized MILP dispatch outcome</p>
      </div>
      <div className="md:col-span-2 border border-hairline bg-surface p-6 text-center font-mono">
        <Eyebrow>Travel Time Saved</Eyebrow>
        <div className="readout text-7xl mt-2" style={{ color: "var(--signal)" }}>{avgDelaySaved}<span className="text-2xl text-text-muted">min/km</span></div>
      </div>
    </div>
  );
}

function StreetLevelView({ state }: { state: "before" | "after" }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Colors
  const gridStroke = isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(15, 23, 42, 0.04)";
  const cctvCornerStroke = isDark ? "rgba(255, 255, 255, 0.3)" : "rgba(15, 23, 42, 0.3)";
  const recDotFill = isDark ? "#EF4444" : "#DC2626";
  const cctvText = isDark ? "#E2E8F0" : "#0F172A";
  const cctvSubtext = isDark ? "#94A3B8" : "#475569";
  const roadFill = isDark ? "rgba(30, 41, 59, 0.45)" : "rgba(203, 213, 225, 0.45)";
  const roadBorder = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.08)";
  const dividerStroke = isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(15, 23, 42, 0.15)";
  const centerLineStroke = "#F59E0B";
  const crossRoadFill = isDark ? "rgba(30, 41, 59, 0.4)" : "rgba(203, 213, 225, 0.4)";
  const intersectionFill = isDark ? "#1E293B" : "#CBD5E1";
  const intersectionDashes = isDark ? "rgba(255, 255, 255, 0.3)" : "rgba(15, 23, 42, 0.3)";
  
  const beforeOverlayFill = "#EF4444";
  const obstructionCarBg = isDark ? "#0F172A" : "#FFFFFF";
  const hudCardBg = isDark ? "rgba(15, 23, 42, 0.9)" : "rgba(255, 255, 255, 0.95)";
  const hudCardBorderBefore = isDark ? "#EF4444" : "#DC2626";
  const hudCardBorderAfter = isDark ? "#10B981" : "#059669";
  const hudCardTextTitleBefore = isDark ? "#EF4444" : "#DC2626";
  const hudCardTextTitleAfter = isDark ? "#10B981" : "#059669";
  const hudCardText = isDark ? "#E2E8F0" : "#1E293B";
  const bottomHUDBg = isDark ? "rgba(15, 23, 42, 0.85)" : "rgba(255, 255, 255, 0.95)";
  const bottomHUDBorder = isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(15, 23, 42, 0.08)";
  const bottomHUDLabel = isDark ? "rgba(255, 255, 255, 0.4)" : "rgba(15, 23, 42, 0.5)";
  const bottomHUDText = isDark ? "#E2E8F0" : "#0F172A";

  return (
    <svg viewBox="0 0 800 288" className="w-full h-full object-cover font-mono">
      {/* Blueprint grid background */}
      <defs>
        <pattern id="street-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke={gridStroke} strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#street-grid)" />

      {/* CCTV Camera HUD overlay corners */}
      <path d="M 15 30 L 15 15 L 30 15" stroke={cctvCornerStroke} strokeWidth="1.5" fill="none" />
      <path d="M 785 30 L 785 15 L 770 15" stroke={cctvCornerStroke} strokeWidth="1.5" fill="none" />
      <path d="M 15 258 L 15 273 L 30 273" stroke={cctvCornerStroke} strokeWidth="1.5" fill="none" />
      <path d="M 785 258 L 785 273 L 770 273" stroke={cctvCornerStroke} strokeWidth="1.5" fill="none" />

      {/* CCTV Live Feed metadata */}
      <g opacity="0.6">
        <circle cx="28" cy="26" r="3.5" fill={recDotFill} className="animate-pulse" />
        <text x="38" y="29" fill={cctvText} fontSize="8" fontWeight="bold" letterSpacing="0.05em">REC ● CCTV_083_ORR_E</text>
        <text x="765" y="29" fill={cctvText} fontSize="8" fontWeight="bold" textAnchor="end" letterSpacing="0.05em">LIVE DISPATCH FEED</text>
        <text x="90" y="267" fill={cctvSubtext} fontSize="7" fontWeight="bold">GPS: 12.9716° N, 77.5946° E</text>
        <text x="710" y="267" fill={cctvSubtext} fontSize="7" fontWeight="bold" textAnchor="end">SYS STATUS: ACTIVE</text>
      </g>

      {/* ── ROAD NETWORK DRAWINGS ────────────────────────────────────── */}
      {/* Main Horizontal Arterial (East-West) */}
      <rect x="0" y="110" width="800" height="68" fill={roadFill} stroke={roadBorder} strokeWidth="1.5" />
      
      {/* Westbound Lanes Divider */}
      <line x1="0" y1="127" x2="800" y2="127" stroke={dividerStroke} strokeWidth="1.2" strokeDasharray="5 5" />
      {/* Center Separation Line */}
      <line x1="0" y1="144" x2="800" y2="144" stroke={centerLineStroke} strokeWidth="2.5" />
      {/* Eastbound Lanes Divider */}
      <line x1="0" y1="161" x2="800" y2="161" stroke={dividerStroke} strokeWidth="1.2" strokeDasharray="5 5" />

      {/* Cross-Street A (Vertical) */}
      <rect x="180" y="0" width="60" height="288" fill={crossRoadFill} stroke={roadBorder} strokeWidth="1.5" />
      <line x1="210" y1="0" x2="210" y2="288" stroke={dividerStroke} strokeWidth="1.2" strokeDasharray="5 5" />

      {/* Cross-Street B (Vertical) */}
      <rect x="540" y="0" width="60" height="288" fill={crossRoadFill} stroke={roadBorder} strokeWidth="1.5" />
      <line x1="570" y1="0" x2="570" y2="288" stroke={dividerStroke} strokeWidth="1.2" strokeDasharray="5 5" />

      {/* Intersection Markings */}
      {/* Intersection A */}
      <rect x="181" y="111" width="58" height="66" fill={intersectionFill} opacity="0.8" />
      <path d="M 185 115 L 185 173 M 235 115 L 235 173" stroke={intersectionDashes} strokeWidth="2" strokeDasharray="2 3" />
      {/* Intersection B */}
      <rect x="541" y="111" width="58" height="66" fill={intersectionFill} opacity="0.8" />
      <path d="M 545 115 L 545 173 M 595 115 L 595 173" stroke={intersectionDashes} strokeWidth="2" strokeDasharray="2 3" />

      {/* ── FLOW SEGMENTS STATE OVERLAYS ──────────────────────────────── */}
      {/* Static Unchanged Flow Segments */}
      {/* Segment 1: Far Left (Eastbound) - Green free flow */}
      <line x1="0" y1="152.5" x2="180" y2="152.5" stroke="#10B981" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
      
      {/* Segment 2: Far Right (Eastbound) - Green free flow */}
      <line x1="600" y1="152.5" x2="800" y2="152.5" stroke="#10B981" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
      
      {/* Segment 3: Far Left (Westbound) - Green free flow */}
      <line x1="0" y1="135.5" x2="180" y2="135.5" stroke="#10B981" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
      
      {/* Segment 4: Far Right (Westbound) - Green free flow */}
      <line x1="600" y1="135.5" x2="800" y2="135.5" stroke="#10B981" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
      
      {/* Segment 5: Cross Street Flows - Green free flow */}
      <line x1="210" y1="0" x2="210" y2="110" stroke="#10B981" strokeWidth="3" opacity="0.7" />
      <line x1="210" y1="178" x2="210" y2="288" stroke="#10B981" strokeWidth="3" opacity="0.7" />
      <line x1="570" y1="0" x2="570" y2="110" stroke="#10B981" strokeWidth="3" opacity="0.7" />
      <line x1="570" y1="178" x2="570" y2="288" stroke="#10B981" strokeWidth="3" opacity="0.7" />

      {/* ── DYNAMIC / CHANGED ROAD SEGMENTS ───────────────────────────── */}
      {state === "before" ? (
        <>
          {/* Eastbound Middle Segment (CONGESTED BEFORE) */}
          <rect x="240" y="147" width="160" height="28" fill={beforeOverlayFill} stroke={beforeOverlayFill} strokeWidth="1.5" className="animate-pulse-qr" />
          <line x1="240" y1="152.5" x2="400" y2="152.5" stroke={beforeOverlayFill} strokeWidth="5" strokeLinecap="round" />
          <line x1="240" y1="152.5" x2="400" y2="152.5" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" className="animate-flow-slow-rt" />
          
          {/* Westbound Middle Segment (CONGESTED BEFORE) */}
          <rect x="380" y="112" width="160" height="28" fill={beforeOverlayFill} stroke={beforeOverlayFill} strokeWidth="1.5" className="animate-pulse-qr" />
          <line x1="380" y1="135.5" x2="540" y2="135.5" stroke={beforeOverlayFill} strokeWidth="5" strokeLinecap="round" />
          <line x1="380" y1="135.5" x2="540" y2="135.5" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" className="animate-flow-slow-lt" />

          {/* ── ILLEGALLY PARKED VEHICLES (VIOLATIONS) ────────────────────── */}
          {/* Eastbound Obstruction (at x = 390) */}
          <g transform="translate(390, 150)">
            <rect x="0" y="0" width="22" height="11" fill="#334155" stroke="#F59E0B" strokeWidth="1.5" rx="2" />
            <rect x="15" y="2" width="6" height="7" fill="#64748B" />
            <circle cx="5" cy="5.5" r="2.5" className="animate-blink-hz" />
            <circle cx="17" cy="5.5" r="2.5" className="animate-blink-hz" />
            <text x="11" y="-4" fill="#EF4444" fontSize="6" fontWeight="bold" textAnchor="middle">ILLEGAL PARK</text>
          </g>

          {/* Westbound Obstruction (at x = 355) */}
          <g transform="translate(355, 115)">
            <rect x="0" y="0" width="22" height="11" fill={obstructionCarBg} stroke="#F59E0B" strokeWidth="1.5" rx="2" />
            <rect x="3" y="2" width="15" height="7" fill="#475569" rx="1" />
            <circle cx="5" cy="5.5" r="2.5" className="animate-blink-hz" />
            <circle cx="17" cy="5.5" r="2.5" className="animate-blink-hz" />
            <text x="11" y="-4" fill="#EF4444" fontSize="6" fontWeight="bold" textAnchor="middle">OBSTRUCTION</text>
          </g>

          {/* ── TOP HUD CALLOUT: WESTBOUND CHOKE (BEFORE) ────────────────── */}
          <g>
            {/* Leader line from top card to westbound chokepoint */}
            <path d="M 500 75 L 500 100 L 480 120" stroke="#EF4444" strokeWidth="1" strokeDasharray="2 2" fill="none" opacity="0.8" />
            <circle cx="480" cy="120" r="3" fill="#EF4444" stroke="#FFFFFF" strokeWidth="1" />
            
            {/* HUD Card Container */}
            <rect x="420" y="25" width="170" height="50" rx="4" fill={hudCardBg} stroke={hudCardBorderBefore} strokeWidth="1.5" />
            
            {/* HUD Details */}
            <text x="430" y="37" fill={hudCardTextTitleBefore} fontSize="7.5" fontWeight="black" letterSpacing="0.05em">ZONE [WB_LANE_BOT] - CRITICAL</text>
            <text x="430" y="49" fill={hudCardText} fontSize="8" fontWeight="bold">FLOW SPEED: &lt;5 KM/H</text>
            <text x="430" y="60" fill={hudCardText} fontSize="8" fontWeight="bold">QUEUE: 210m</text>
            <text x="430" y="70" fill={hudCardTextTitleBefore} fontSize="7" fontWeight="bold" letterSpacing="0.02em">STATUS: STALLED / UNRESOLVED</text>
          </g>

          {/* ── BOTTOM HUD CALLOUT: EASTBOUND CHOKE (BEFORE) ─────────────── */}
          <g>
            {/* Leader line from bottom card to eastbound chokepoint */}
            <path d="M 300 210 L 300 185 L 320 165" stroke="#EF4444" strokeWidth="1" strokeDasharray="2 2" fill="none" opacity="0.8" />
            <circle cx="320" cy="165" r="3" fill="#EF4444" stroke="#FFFFFF" strokeWidth="1" />
            
            {/* HUD Card Container */}
            <rect x="215" y="210" width="170" height="50" rx="4" fill={hudCardBg} stroke={hudCardBorderBefore} strokeWidth="1.5" />
            
            {/* HUD Details */}
            <text x="225" y="222" fill={hudCardTextTitleBefore} fontSize="7.5" fontWeight="black" letterSpacing="0.05em">ZONE [EB_LANE_BOT] - BLOCKED</text>
            <text x="225" y="234" fill={hudCardText} fontSize="8" fontWeight="bold">FLOW SPEED: &lt;5 KM/H</text>
            <text x="225" y="245" fill={hudCardText} fontSize="8" fontWeight="bold">QUEUE: 180m</text>
            <text x="225" y="255" fill={hudCardTextTitleBefore} fontSize="7" fontWeight="bold" letterSpacing="0.02em">STATUS: CONGESTED / PARKING VIOL</text>
          </g>
        </>
      ) : (
        <>
          {/* Eastbound Middle Segment (RESOLVED AFTER) */}
          <line x1="240" y1="152.5" x2="400" y2="152.5" stroke="#10B981" strokeWidth="5" strokeLinecap="round" />
          <line x1="240" y1="152.5" x2="400" y2="152.5" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" className="animate-flow-fast-rt" />
          
          {/* Westbound Middle Segment (RESOLVED AFTER) */}
          <line x1="380" y1="135.5" x2="540" y2="135.5" stroke="#10B981" strokeWidth="5" strokeLinecap="round" />
          <line x1="380" y1="135.5" x2="540" y2="135.5" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" className="animate-flow-fast-lt" />

          {/* BTP Dispatch Tow Truck Clearing Scene */}
          <g transform="translate(420, 150)">
            <line x1="-15" y1="5.5" x2="0" y2="5.5" stroke={cctvSubtext} strokeWidth="1.5" strokeDasharray="3 3" />
            <rect x="0" y="-1" width="18" height="13" fill="#10B981" rx="2" />
            <path d="M 0 5.5 L -8 5.5 L -10 10" fill="none" stroke="#10B981" strokeWidth="1.5" />
            <rect x="10" y="2" width="6" height="7" fill={isDark ? "#E2E8F0" : "#1E293B"} />
            <text x="8" y="-4" fill="#10B981" fontSize="6" fontWeight="bold" textAnchor="middle">BTP TOWED</text>
          </g>

          {/* ── TOP HUD CALLOUT: WESTBOUND CHOKE (AFTER) ─────────────────── */}
          <g>
            {/* Leader line from top card to westbound chokepoint */}
            <path d="M 500 75 L 500 100 L 480 120" stroke="#10B981" strokeWidth="1" strokeDasharray="2 2" fill="none" opacity="0.8" />
            <circle cx="480" cy="120" r="3" fill="#10B981" stroke="#FFFFFF" strokeWidth="1" />
            
            {/* HUD Card Container */}
            <rect x="420" y="25" width="170" height="50" rx="4" fill={hudCardBg} stroke={hudCardBorderAfter} strokeWidth="1.5" />
            
            {/* HUD Details */}
            <text x="430" y="37" fill={hudCardTextTitleAfter} fontSize="7.5" fontWeight="black" letterSpacing="0.05em">ZONE [WB_LANE_BOT] - RESOLVED</text>
            <text x="430" y="49" fill={hudCardText} fontSize="8" fontWeight="bold">FLOW SPEED: 48 KM/H (FREE)</text>
            <text x="430" y="60" fill={hudCardText} fontSize="8" fontWeight="bold">QUEUE: 0m (CLEAR)</text>
            <text x="430" y="70" fill={hudCardTextTitleAfter} fontSize="7" fontWeight="bold" letterSpacing="0.02em">STATUS: DISPATCH COMPLETE</text>
          </g>

          {/* ── BOTTOM HUD CALLOUT: EASTBOUND CHOKE (AFTER) ──────────────── */}
          <g>
            {/* Leader line from bottom card to eastbound chokepoint */}
            <path d="M 300 210 L 300 185 L 320 165" stroke="#10B981" strokeWidth="1" strokeDasharray="2 2" fill="none" opacity="0.8" />
            <circle cx="320" cy="165" r="3" fill="#10B981" stroke="#FFFFFF" strokeWidth="1" />
            
            {/* HUD Card Container */}
            <rect x="215" y="210" width="170" height="50" rx="4" fill={hudCardBg} stroke={hudCardBorderAfter} strokeWidth="1.5" />
            
            {/* HUD Details */}
            <text x="225" y="222" fill={hudCardTextTitleAfter} fontSize="7.5" fontWeight="black" letterSpacing="0.05em">ZONE [EB_LANE_BOT] - OPTIMAL</text>
            <text x="225" y="234" fill={hudCardText} fontSize="8" fontWeight="bold">FLOW SPEED: 45 KM/H (FREE)</text>
            <text x="225" y="245" fill={hudCardText} fontSize="8" fontWeight="bold">QUEUE: 0m (CLEAR)</text>
            <text x="225" y="255" fill={hudCardTextTitleAfter} fontSize="7" fontWeight="bold" letterSpacing="0.02em">STATUS: BTP DEPLOYMENT CLEARED</text>
          </g>
        </>
      )}

      {/* Sector details */}
      <g>
        <rect x="10" y="248" width="70" height="30" rx="4" fill={bottomHUDBg} stroke={bottomHUDBorder} />
        <text x="45" y="260" fill={bottomHUDLabel} fontSize="7" fontWeight="bold" textAnchor="middle">SECTOR ID</text>
        <text x="45" y="273" fill={bottomHUDText} fontSize="10" fontWeight="bold" textAnchor="middle" className="readout">KA-03-MGR</text>

        <rect x="720" y="248" width="70" height="30" rx="4" fill={bottomHUDBg} stroke={bottomHUDBorder} />
        <text x="755" y="260" fill={bottomHUDLabel} fontSize="7" fontWeight="bold" textAnchor="middle">CORRIDOR FLOW</text>
        <text x="755" y="273" fill={state === "before" ? "#EF4444" : "#10B981"} fontSize="10" fontWeight="bold" textAnchor="middle" className="readout">
          {state === "before" ? "CONGESTED" : "OPTIMAL"}
        </text>
      </g>
    </svg>
  );
}

const STATION_CENTROIDS: Record<string, [number, number]> = {
  "Upparpet": [12.978, 77.571],
  "Cubbon Park": [12.975, 77.607],
  "HSR Layout": [12.917, 77.622],
  "Bellandur": [12.930, 77.680],
  "Adugodi": [12.937, 77.631],
  "Halasur": [12.973, 77.617],
  "Shivajinagar": [12.986, 77.597],
  "Koramangala": [12.934, 77.624],
  "Hebbal": [13.035, 77.597],
  "Hebbala": [13.035, 77.597],
  "Indiranagar": [12.978, 77.641],
  "HAL Old Airport": [12.956, 77.648],
  "Kasturi Nagar": [13.007, 77.649],
  "Unknown": [12.9716, 77.5946]
};

function LiveDispatchTracking() {
  const { hotspots: rawHotspots } = useTelemetry();
  const [speed, setSpeed] = useState(1);

  const activeHotspots = useMemo(() => {
    return rawHotspots.length > 0 ? rawHotspots.slice(0, 4) : [];
  }, [rawHotspots]);

  const [officers, setOfficers] = useState(() => {
    let list: any[] = [];
    let id = 1;
    activeHotspots.forEach((h) => {
      list.push({
        id: `Ofc-${id++}`,
        name: `Officer BTP-${100 + id}`,
        station: h.police_station || "Unknown",
        destination: h.corridor || "Junction",
        lat: h.police_station ? (STATION_CENTROIDS[h.police_station]?.[0] || 12.9716) : 12.9716,
        lon: h.police_station ? (STATION_CENTROIDS[h.police_station]?.[1] || 77.5946) : 77.5946,
        startLat: h.police_station ? (STATION_CENTROIDS[h.police_station]?.[0] || 12.9716) : 12.9716,
        startLon: h.police_station ? (STATION_CENTROIDS[h.police_station]?.[1] || 77.5946) : 77.5946,
        destLat: h.lat || 12.9716,
        destLon: h.lon || 77.5946,
        status: "Station Pool",
        progress: 0,
        logs: [`[INFO] Unit initialized at ${h.police_station || "Unknown"} station pool.`]
      });
    });
    return list;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setOfficers(prev => prev.map(o => {
        if (o.status !== "En Route") return o;
        
        const newProgress = Math.min(100, o.progress + 4 * speed);
        const curLat = o.startLat + (o.destLat - o.startLat) * (newProgress / 100);
        const curLon = o.startLon + (o.destLon - o.startLon) * (newProgress / 100);
        
        let newStatus = o.status;
        let newLogs = [...o.logs];
        
        if (newProgress >= 100) {
          newStatus = "Arrived";
          newLogs.push(`[SYSTEM] Arrived at ${o.destination}. Awaiting officer confirmation.`);
        } else if (Math.floor(newProgress) % 20 === 0 && Math.floor(newProgress) !== Math.floor(o.progress)) {
          newLogs.push(`[GPS] Telemetry update: (${curLat.toFixed(5)}, ${curLon.toFixed(5)}) at speed 22 km/h.`);
        }

        return {
          ...o,
          progress: newProgress,
          lat: curLat,
          lon: curLon,
          status: newStatus,
          logs: newLogs
        };
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, [speed]);

  const handleDispatch = (id: string) => {
    setOfficers(prev => prev.map(o => {
      if (o.id !== id) return o;
      return {
        ...o,
        status: "En Route",
        progress: 0,
        logs: [...o.logs, `[DISPATCH] Commander ordered patrol to proceed to ${o.destination}. GPS tracking started.`]
      };
    }));
  };

  const handleConfirmArrival = (id: string) => {
    setOfficers(prev => prev.map(o => {
      if (o.id !== id) return o;
      return {
        ...o,
        status: "Active Enforcement",
        logs: [...o.logs, `[CONFIRMATION] Arrival verified by officer. Enforcement active (Towing KA-03-MM-4491, issuing fines).`]
      };
    }));
  };

  const handleRecall = (id: string) => {
    setOfficers(prev => prev.map(o => {
      if (o.id !== id) return o;
      return {
        ...o,
        status: "Station Pool",
        progress: 0,
        lat: o.startLat,
        lon: o.startLon,
        logs: [...o.logs, `[RECALL] Unit recalled back to station pool.`]
      };
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-surface border border-hairline p-3 rounded-lg glass">
        <div>
          <Eyebrow>BTP Officer Telemetry Command</Eyebrow>
          <p className="text-xs text-text-muted mt-0.5">Live patrol dispatch and arrival validation checks</p>
          <p className="text-[10px] text-amber-500/85 mt-1.5 flex items-center gap-1 font-mono">
            <span>⚠️</span> <span>Note: This is currently a mock simulation. In production, this can be integrated with live officer GPS beacons and BTP dispatch resources.</span>
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono">
          <span className="text-[10px] text-text-muted font-semibold uppercase">Sim Speed:</span>
          {([1, 5, 10] as const).map(s => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-2 py-0.5 text-xs font-mono border rounded ${speed === s ? "border-signal text-signal font-bold bg-signal/10" : "border-hairline text-text-muted bg-transparent cursor-pointer"}`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {officers.map((o) => (
          <div key={o.id} className="border border-hairline bg-surface p-4 space-y-3 font-mono rounded-lg glass">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-text-primary">{o.name}</span>
                <div className="text-[10px] text-text-muted mt-0.5">{o.station} PS ➔ {o.destination}</div>
              </div>
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                o.status === "Station Pool" ? "bg-slate-500/10 text-slate-500 border border-slate-500/20" :
                o.status === "En Route" ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" :
                o.status === "Arrived" ? "bg-blue-500/10 text-blue-500 border border-blue-500/20 animate-pulse" :
                "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
              }`}>
                {o.status}
              </span>
            </div>

            {o.status === "En Route" && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-text-muted">
                  <span>GPS Tracking ({o.progress.toFixed(0)}%)</span>
                  <span>{o.lat.toFixed(4)}, {o.lon.toFixed(4)}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-900 rounded overflow-hidden">
                  <div className="h-full bg-signal transition-all duration-300" style={{ width: `${o.progress}%` }} />
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {o.status === "Station Pool" && (
                <button
                  onClick={() => handleDispatch(o.id)}
                  className="flex-1 bg-signal text-primary-foreground py-1.5 rounded text-[10px] uppercase font-bold border-none cursor-pointer flex items-center justify-center gap-1 hover:opacity-90"
                >
                  Dispatch Unit
                </button>
              )}
              {(o.status === "En Route" || o.status === "Arrived") && (
                <button
                  onClick={() => handleConfirmArrival(o.id)}
                  className={`flex-1 py-1.5 rounded text-[10px] uppercase font-bold border-none cursor-pointer flex items-center justify-center gap-1 hover:opacity-90 ${
                    o.status === "Arrived" ? "bg-emerald-600 text-white animate-pulse" : "bg-blue-600 text-white"
                  }`}
                >
                  Confirm Arrival
                </button>
              )}
              {o.status !== "Station Pool" && (
                <button
                  onClick={() => handleRecall(o.id)}
                  className="border border-hairline py-1.5 px-3 rounded text-[10px] uppercase text-text-muted hover:text-text-primary bg-surface/50 cursor-pointer"
                >
                  Recall
                </button>
              )}
            </div>

            <div className="border border-hairline p-2 bg-slate-950/40 rounded max-h-24 overflow-y-auto space-y-1">
              {o.logs.slice(-3).map((l: string, idx: number) => (
                <div key={idx} className="text-[9px] text-text-muted leading-tight truncate">{l}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
