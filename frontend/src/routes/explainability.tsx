import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SectionHeader, TabStrip, Eyebrow, FactorBar, Beacon } from "@/components/hud";
import { useTelemetry } from "@/lib/telemetry-context";

export const Route = createFileRoute("/explainability")({
  head: () => ({
    meta: [
      { title: "Explainability — Atlas" },
      { name: "description", content: "Factor attribution and congestion propagation for spatiotemporal hotspot predictions." },
    ],
  }),
  component: Explainability,
});

const TABS = ["Why This Hotspot", "Congestion Propagation"];

function Explainability() {
  const [tab, setTab] = useState(TABS[0]);
  return (
    <div className="space-y-4 max-w-3xl">
      <SectionHeader title="Explainability" subtitle="Why the model flags what it flags" />
      <TabStrip tabs={TABS} active={tab} onChange={setTab} />
      {tab === "Why This Hotspot" ? <Why /> : <Propagation />}
    </div>
  );
}

function Why() {
  const { hotspots } = useTelemetry();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sel = hotspots.find((h) => h.id === selectedId) || hotspots[0];

  if (!sel) {
    return <div className="text-xs text-text-muted py-4">Loading model attributions...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {hotspots.map((h) => (
          <button
            key={h.id}
            onClick={() => setSelectedId(h.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs border cursor-pointer bg-surface/50 ${sel.id === h.id ? "border-signal text-text-primary" : "border-hairline text-text-muted"}`}
          >
            <Beacon severity={h.severity} />
            {h.name}
          </button>
        ))}
      </div>
      <div className="border border-hairline bg-surface p-4">
        <div className="flex items-center justify-between">
          <Eyebrow>Factor attribution · {sel.name}</Eyebrow>
          <span className="readout text-xl" style={{ color: sel.severity === "critical" ? "var(--critical)" : undefined }}>{sel.riskScore}%</span>
        </div>
        <div className="mt-3">
          {sel.factors.map((f) => (
            <FactorBar key={f.label} label={f.label} weight={f.weight} max={45} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Propagation() {
  const steps = ["Illegal Parking", "Queue Formation", "Upstream Congestion", "Network Spillover"];
  const [tick] = useState(() => Date.now());
  return (
    <div className="border border-hairline bg-surface p-6">
      <Eyebrow>Why a spatiotemporal graph model is required</Eyebrow>
      <div className="relative mt-6 flex flex-col items-center gap-0">
        {steps.map((s, i) => (
          <div key={s} className="flex flex-col items-center w-full">
            <div className="border border-hairline bg-surface-2 px-4 py-3 w-64 text-center text-sm font-medium">{s}</div>
            {i < steps.length - 1 && (
              <div className="relative h-10 w-px bg-hairline my-0">
                <span
                  key={tick}
                  className="absolute left-1/2 -translate-x-1/2 h-2 w-2 bg-signal"
                  style={{ animation: `pulse-travel 0.6s ease-in ${i * 0.5}s 1 both` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-text-muted mt-6 text-center max-w-md mx-auto leading-relaxed">
        A single illegal-parking event cascades across non-adjacent corridors. A fixed road-adjacency model cannot
        capture this — only an adaptive spatiotemporal graph reproduces the spillover dynamics.
      </p>
    </div>
  );
}

