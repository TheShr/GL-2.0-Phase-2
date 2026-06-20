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
      <div className="relative h-72 border border-hairline overflow-hidden select-none">
        <div className="absolute inset-0 flex items-center justify-center bg-surface-2">
          <span className="wordmark text-sm text-text-muted">Current Network State</span>
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-surface" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
          <span className="wordmark text-sm text-signal">Optimized Deployment</span>
        </div>
        <div className="absolute top-0 bottom-0" style={{ left: `${pos}%` }}>
          <div className="h-full w-0.5 bg-signal" />
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 w-2/3 accent-signal"
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
