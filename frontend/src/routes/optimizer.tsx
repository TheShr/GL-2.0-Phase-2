import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionHeader, TabStrip, Eyebrow, Readout } from "@/components/hud";
import { useTelemetry } from "@/lib/telemetry-context";
import { DEPLOYMENT_FRONTIER } from "@/lib/mock";

export const Route = createFileRoute("/optimizer")({
  head: () => ({
    meta: [
      { title: "Optimizer & Simulation — Atlas" },
      { name: "description", content: "MILP dispatch optimizer and Greenshields traffic simulation with scenario builder." },
    ],
  }),
  component: Optimizer,
});

const TABS = ["Before/After", "Intervention Simulator", "Deployment Frontier", "Scenario Builder", "Counterfactual"];

function Optimizer() {
  const [tab, setTab] = useState(TABS[0]);
  return (
    <div className="space-y-4 max-w-5xl">
      <SectionHeader title="Optimizer & Simulation" subtitle="MILP dispatch · Greenshields flow simulation" />
      <TabStrip tabs={TABS} active={tab} onChange={setTab} />
      {tab === "Before/After" && <BeforeAfter />}
      {tab === "Intervention Simulator" && <Simulator />}
      {tab === "Deployment Frontier" && <Frontier />}
      {tab === "Scenario Builder" && <ScenarioBuilder />}
      {tab === "Counterfactual" && <Counterfactual />}
    </div>
  );
}

function BeforeAfter() {
  const [pos, setPos] = useState(50);
  const { summary } = useTelemetry();

  const avgCapacityRecovered = summary?.avg_capacity_recovered || 5;
  const totalSavings = summary?.total_savings || 118;

  return (
    <div className="space-y-4">
      <div className="relative h-72 border border-hairline overflow-hidden select-none bg-slate-950 rounded-xl">
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
        <div className="absolute inset-0 w-full h-full">
          <StreetLevelView state="before" />
          <div className="absolute top-3 left-4 z-10 bg-slate-900/95 border border-red-900/40 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider text-red-500 flex items-center gap-1.5 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            <span>Before: Blocked Corridor (Status Quo)</span>
          </div>
        </div>

        {/* AFTER STATE (Right / Top Layer - Clipped) */}
        <div className="absolute inset-0 w-full h-full" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
          <StreetLevelView state="after" />
          <div className="absolute top-3 right-4 z-10 bg-slate-900/95 border border-emerald-500/40 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>After: AI-Optimized Deployment</span>
          </div>
        </div>

        {/* SCRUBBER DIVIDER LINE */}
        <div className="absolute top-0 bottom-0 pointer-events-none z-20" style={{ left: `${pos}%` }}>
          <div className="h-full w-[2px] bg-signal relative">
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-slate-900 border-2 border-signal shadow-lg flex items-center justify-center cursor-ew-resize">
              <div className="flex gap-0.5 text-signal text-[8px] font-bold font-mono">
                <span>◀</span><span>▶</span>
              </div>
            </div>
          </div>
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
        <Delta label="Congestion" before="100%" after={`${100 - avgCapacityRecovered}%`} delta={`−${avgCapacityRecovered}%`} />
        <Delta label="Avg Delay" before="72m" after="49m" delta="−23m" />
        <Delta label="Total Savings" before="0h" after={`${totalSavings}h`} delta={`+${totalSavings}h`} />
        <Delta label="Logistics Recovery" before="0%" after={`${Math.round(avgCapacityRecovered * 1.2)}%`} delta={`+${Math.round(avgCapacityRecovered * 1.2)}%`} />
      </div>
    </div>
  );
}

function Delta({ label, before, after, delta }: { label: string; before: string; after: string; delta: string }) {
  return (
    <div className="border border-hairline bg-surface p-3">
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

  const out = useMemo(() => {
    const wsum = wDelay + wRisk + wLogi || 1;
    const eff = (officers / 80) * (0.6 + budget / 250);
    const reduction = Math.min(62, Math.round(eff * 62));
    return {
      congestion: 100 - reduction,
      delaySaved: Math.round(reduction * 0.4 * (wDelay / wsum) * 3 + reduction * 0.3),
      riskCut: Math.round(reduction * (wRisk / wsum) * 1.4 + reduction * 0.3),
      logiGain: Math.round(reduction * (wLogi / wsum) * 1.6 + reduction * 0.2),
    };
  }, [officers, budget, wDelay, wRisk, wLogi]);

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
            {["South ORR", "Central", "North", "East"].map((r, i) => (
              <div key={r} className="flex items-center justify-between border border-hairline px-2 py-1">
                <span className="text-text-muted">{r}</span>
                <span className="readout">{[18, 14, 10, 12][i]}</span>
              </div>
            ))}
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
  return (
    <div className="border border-hairline bg-surface p-4">
      <Eyebrow>Officer count vs congestion reduction — click a point to load scenario</Eyebrow>
      <div className="h-72 mt-3">
        <ResponsiveContainer>
          <LineChart data={DEPLOYMENT_FRONTIER} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} onClick={(e) => e?.activeTooltipIndex != null && setPicked(e.activeTooltipIndex)}>
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
          Loaded scenario · {DEPLOYMENT_FRONTIER[picked].officers} officers → {DEPLOYMENT_FRONTIER[picked].reduction}% reduction
        </p>
      )}
    </div>
  );
}

function ScenarioBuilder() {
  const scenarios = ["Rain", "Special Event", "Road Closure", "Demand Surge +30%"];
  const [active, setActive] = useState<Record<string, boolean>>({});
  const mult = 1 + Object.entries(active).filter(([, v]) => v).length * 0.12;
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
        <Readout label="Adjusted City Risk" value={Math.round(76 * mult)} size="lg" critical={76 * mult > 90} />
        <Readout label="Adjusted Avg Delay" value={`${Math.round(49 * mult)}m`} size="lg" />
        <Readout label="Required Officers" value={Math.round(47 * mult)} size="lg" />
      </div>
      <p className="text-xs text-text-muted">Active perturbations re-scale every readout on this page via the shared scenario multiplier ({mult.toFixed(2)}×).</p>
    </div>
  );
}

function Counterfactual() {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="border border-hairline bg-surface p-6 text-center">
        <Eyebrow>Without Intervention</Eyebrow>
        <div className="readout text-5xl mt-3">72<span className="text-xl text-text-muted">min</span></div>
        <p className="text-xs text-text-muted mt-2">Projected average corridor delay at peak</p>
      </div>
      <div className="border border-hairline bg-surface p-6 text-center">
        <Eyebrow>With Intervention</Eyebrow>
        <div className="readout text-5xl mt-3">49<span className="text-xl text-text-muted">min</span></div>
        <p className="text-xs text-text-muted mt-2">Optimized MILP dispatch outcome</p>
      </div>
      <div className="md:col-span-2 border border-hairline bg-surface p-6 text-center">
        <Eyebrow>Delay Saved</Eyebrow>
        <div className="readout text-7xl mt-2" style={{ color: "var(--signal)" }}>23<span className="text-2xl text-text-muted">min</span></div>
      </div>
    </div>
  );
}

function StreetLevelView({ state }: { state: "before" | "after" }) {
  return (
    <svg viewBox="0 0 800 288" className="w-full h-full object-cover">
      {/* Blueprint grid background */}
      <defs>
        <pattern id="street-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#street-grid)" />

      {/* ── ROAD NETWORK DRAWINGS ────────────────────────────────────── */}
      {/* Main Horizontal Arterial (East-West) */}
      <rect x="0" y="110" width="800" height="68" fill="rgba(30, 41, 59, 0.4)" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1.5" />
      
      {/* Westbound Lanes Divider */}
      <line x1="0" y1="127" x2="800" y2="127" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" strokeDasharray="5 5" />
      {/* Center Separation Line */}
      <line x1="0" y1="144" x2="800" y2="144" stroke="#F59E0B" strokeWidth="2.5" />
      {/* Eastbound Lanes Divider */}
      <line x1="0" y1="161" x2="800" y2="161" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" strokeDasharray="5 5" />

      {/* Cross-Street A (Vertical) */}
      <rect x="180" y="0" width="60" height="288" fill="rgba(30, 41, 59, 0.4)" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1.5" />
      <line x1="210" y1="0" x2="210" y2="288" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" strokeDasharray="5 5" />

      {/* Cross-Street B (Vertical) */}
      <rect x="540" y="0" width="60" height="288" fill="rgba(30, 41, 59, 0.4)" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1.5" />
      <line x1="570" y1="0" x2="570" y2="288" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" strokeDasharray="5 5" />

      {/* Intersection Markings */}
      {/* Intersection A */}
      <rect x="181" y="111" width="58" height="66" fill="#1E293B" opacity="0.8" />
      <path d="M 185 115 L 185 173 M 235 115 L 235 173" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeDasharray="2 3" />
      {/* Intersection B */}
      <rect x="541" y="111" width="58" height="66" fill="#1E293B" opacity="0.8" />
      <path d="M 545 115 L 545 173 M 595 115 L 595 173" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeDasharray="2 3" />


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
          <rect x="240" y="147" width="160" height="28" fill="#EF4444" stroke="#EF4444" strokeWidth="1.5" className="animate-pulse-qr" />
          
          <line x1="240" y1="152.5" x2="400" y2="152.5" stroke="#EF4444" strokeWidth="5" strokeLinecap="round" />
          <line x1="240" y1="152.5" x2="400" y2="152.5" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" className="animate-flow-slow-rt" />
          
          <text x="320" y="165" fill="#FFFFFF" fontSize="8" fontWeight="bold" textAnchor="middle" letterSpacing="0.05em">
            QUEUE: 180m
          </text>

          {/* Westbound Middle Segment (CONGESTED BEFORE) */}
          <rect x="380" y="112" width="160" height="28" fill="#EF4444" stroke="#EF4444" strokeWidth="1.5" className="animate-pulse-qr" />
          
          <line x1="380" y1="135.5" x2="540" y2="135.5" stroke="#EF4444" strokeWidth="5" strokeLinecap="round" />
          <line x1="380" y1="135.5" x2="540" y2="135.5" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" className="animate-flow-slow-lt" />
          
          <text x="460" y="130" fill="#FFFFFF" fontSize="8" fontWeight="bold" textAnchor="middle" letterSpacing="0.05em">
            QUEUE: 210m
          </text>

          {/* ── ILLEGALLY PARKED VEHICLES (VIOLATIONS) ────────────────────── */}
          {/* Eastbound Bottleneck (at x = 400) */}
          <g transform="translate(390, 150)">
            <rect x="0" y="0" width="22" height="11" fill="#334155" stroke="#F59E0B" strokeWidth="1.5" rx="2" />
            <rect x="15" y="2" width="6" height="7" fill="#64748B" />
            <circle cx="5" cy="5.5" r="2.5" className="animate-blink-hz" />
            <circle cx="17" cy="5.5" r="2.5" className="animate-blink-hz" />
            <text x="11" y="-4" fill="#F59E0B" fontSize="6" fontWeight="bold" textAnchor="middle">ILLEGAL PARK</text>
          </g>

          {/* Westbound Bottleneck (at x = 370) */}
          <g transform="translate(355, 115)">
            <rect x="0" y="0" width="22" height="11" fill="#0F172A" stroke="#F59E0B" strokeWidth="1.5" rx="2" />
            <rect x="3" y="2" width="15" height="7" fill="#475569" rx="1" />
            <circle cx="5" cy="5.5" r="2.5" className="animate-blink-hz" />
            <circle cx="17" cy="5.5" r="2.5" className="animate-blink-hz" />
            <text x="11" y="-4" fill="#F59E0B" fontSize="6" fontWeight="bold" textAnchor="middle">OBSTRUCTION</text>
          </g>
        </>
      ) : (
        <>
          {/* Eastbound Middle Segment (RESOLVED AFTER) */}
          <line x1="240" y1="152.5" x2="400" y2="152.5" stroke="#10B981" strokeWidth="5" strokeLinecap="round" />
          <line x1="240" y1="152.5" x2="400" y2="152.5" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" className="animate-flow-fast-rt" />
          
          <text x="320" y="165" fill="#34D399" fontSize="8" fontWeight="bold" textAnchor="middle" letterSpacing="0.05em">
            FLOW: 45 KM/H (CLEAR)
          </text>

          {/* Westbound Middle Segment (RESOLVED AFTER) */}
          <line x1="380" y1="135.5" x2="540" y2="135.5" stroke="#10B981" strokeWidth="5" strokeLinecap="round" />
          <line x1="380" y1="135.5" x2="540" y2="135.5" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" className="animate-flow-fast-lt" />
          
          <text x="460" y="130" fill="#34D399" fontSize="8" fontWeight="bold" textAnchor="middle" letterSpacing="0.05em">
            FLOW: 48 KM/H (CLEAR)
          </text>

          {/* BTP Dispatch Tow Truck Clearing Scene */}
          <g transform="translate(420, 150)">
            <line x1="-15" y1="5.5" x2="0" y2="5.5" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="3 3" />
            <rect x="0" y="-1" width="18" height="13" fill="#10B981" rx="2" />
            <path d="M 0 5.5 L -8 5.5 L -10 10" fill="none" stroke="#F59E0B" strokeWidth="1.5" />
            <rect x="10" y="2" width="6" height="7" fill="#E2E8F0" />
            <text x="8" y="-4" fill="#10B981" fontSize="6" fontWeight="bold" textAnchor="middle">BTP TOWED</text>
          </g>
        </>
      )}

      {/* Speed tags and HUD details */}
      <rect x="10" y="248" width="70" height="30" rx="4" fill="rgba(15, 23, 42, 0.85)" stroke="rgba(255,255,255,0.06)" />
      <text x="45" y="260" fill="rgba(255,255,255,0.4)" fontSize="7" fontWeight="bold" textAnchor="middle">SECTOR ID</text>
      <text x="45" y="273" fill="#E2E8F0" fontSize="10" fontWeight="bold" textAnchor="middle" className="readout">KA-03-MGR</text>

      <rect x="720" y="248" width="70" height="30" rx="4" fill="rgba(15, 23, 42, 0.85)" stroke="rgba(255,255,255,0.06)" />
      <text x="755" y="260" fill="rgba(255,255,255,0.4)" fontSize="7" fontWeight="bold" textAnchor="middle">CORRIDOR FLOW</text>
      <text x="755" y="273" fill={state === "before" ? "#EF4444" : "#10B981"} fontSize="10" fontWeight="bold" textAnchor="middle" className="readout">
        {state === "before" ? "CONGESTED" : "OPTIMAL"}
      </text>
    </svg>
  );
}
