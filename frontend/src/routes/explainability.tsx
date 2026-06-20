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
  const { hotspots } = useTelemetry();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState(TABS[0]);

  const sel = hotspots.find((h) => h.id === selectedId) || hotspots[0];

  return (
    <div className="space-y-4 max-w-3xl">
      <SectionHeader title="Explainability" subtitle="Why the model flags what it flags" />
      <TabStrip tabs={TABS} active={tab} onChange={setTab} />
      {tab === "Why This Hotspot" ? (
        <Why selectedHotspot={sel} onSelect={setSelectedId} hotspots={hotspots} />
      ) : (
        <Propagation selectedHotspot={sel} />
      )}
    </div>
  );
}

function Why({
  selectedHotspot,
  onSelect,
  hotspots
}: {
  selectedHotspot: any;
  onSelect: (id: string) => void;
  hotspots: any[];
}) {
  if (!selectedHotspot) {
    return <div className="text-xs text-text-muted py-4">Loading model attributions...</div>;
  }

  return (
    <div className="space-y-4 font-mono">
      <div className="flex flex-wrap gap-2">
        {hotspots.map((h) => (
          <button
            key={h.id}
            onClick={() => onSelect(h.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs border cursor-pointer bg-surface/50 ${selectedHotspot.id === h.id ? "border-signal text-text-primary" : "border-hairline text-text-muted"}`}
          >
            <Beacon severity={h.severity} />
            {h.name}
          </button>
        ))}
      </div>
      <div className="border border-hairline bg-surface p-4">
        <div className="flex items-center justify-between">
          <Eyebrow>Factor attribution · {selectedHotspot.name}</Eyebrow>
          <span className="readout text-xl" style={{ color: selectedHotspot.severity === "critical" ? "var(--critical)" : undefined }}>{selectedHotspot.riskScore}%</span>
        </div>
        <div className="mt-3">
          {selectedHotspot.factors.map((f: any) => (
            <FactorBar key={f.label} label={f.label} weight={f.weight} max={100} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Propagation({ selectedHotspot }: { selectedHotspot: any }) {
  const [tick] = useState(() => Date.now());

  if (!selectedHotspot) {
    return <div className="text-xs text-text-muted py-4 font-mono">Loading queue propagation...</div>;
  }

  // Derive spatiotemporal propagation steps from the selected hotspot
  const steps = [
    `Illegal Parking Centroid: ${selectedHotspot.name}`,
    `Queue Formation: ${selectedHotspot.corridor} capacity drops by ${selectedHotspot.congestionContribution}%`,
    `Upstream Congestion: Spreading via ${selectedHotspot.upstream_edges ? selectedHotspot.upstream_edges.length : 2} critical junctions`,
    `Network Spillover: Flipkart delivery routes delayed by +${Math.round(selectedHotspot.delayEstimate * 0.4)}m`
  ];

  return (
    <div className="border border-hairline bg-surface p-6 font-mono">
      <Eyebrow>Spatiotemporal queue propagation · {selectedHotspot.name}</Eyebrow>
      <div className="relative mt-6 flex flex-col items-center gap-0">
        {steps.map((s, i) => (
          <div key={s} className="flex flex-col items-center w-full">
            <div className="border border-hairline bg-surface-2 px-4 py-3 w-80 text-center text-xs font-semibold text-text-primary rounded-md shadow-sm">{s}</div>
            {i < steps.length - 1 && (
              <div className="relative h-10 w-px bg-hairline my-0">
                <span
                  key={tick}
                  className="absolute left-1/2 -translate-x-1/2 h-2 w-2 bg-signal rounded-full"
                  style={{ animation: `pulse-travel 0.6s ease-in ${i * 0.5}s 1 both` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-text-muted mt-6 text-center max-w-lg mx-auto leading-relaxed">
        A single illegal-parking event at <span className="text-text-primary font-bold font-sans">{selectedHotspot.name}</span> cascades across upstream corridors. 
        Only an adaptive spatiotemporal graph model captures these spillover dynamics.
      </p>
    </div>
  );
}

