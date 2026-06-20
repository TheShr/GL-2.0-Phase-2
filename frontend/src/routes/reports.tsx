import { createFileRoute } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { SectionHeader, Eyebrow, Beacon } from "@/components/hud";
import { useApp } from "@/lib/app-context";
import { useTelemetry } from "@/lib/telemetry-context";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Atlas" },
      { name: "description", content: "Priority pre-shift brief and full audit report of corridor scores and model assumptions." },
    ],
  }),
  component: Reports,
});

function Reports() {
  const { reportMode } = useApp();
  const { summary, hotspots: telemetryHotspots, corridors: telemetryCorridors, rawHotspots, isLoading } = useTelemetry();
  const audit = reportMode === "audit";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 border border-hairline bg-surface">
        <div className="readout text-sm animate-pulse">Syncing Telemetry Database...</div>
      </div>
    );
  }

  const corridors = audit ? telemetryCorridors : telemetryCorridors.filter((c) => c.severity === "critical" || c.severity === "high");
  const hotspots = audit ? telemetryHotspots : telemetryHotspots.filter((h) => h.severity === "critical");

  const avgCapacityRecovered = summary?.avg_capacity_recovered ?? 5;
  const totalSavings = summary?.total_savings ?? 118;
  const criticalHotspots = telemetryHotspots.filter((h) => h.severity === "critical").length;

  const execBrief = [
    { eyebrow: "Junction congestion recovered", value: String(avgCapacityRecovered), unit: "%" },
    { eyebrow: "Total commuter hours saved", value: String(totalSavings), unit: "h" },
    { eyebrow: "Critical hotspots", value: String(criticalHotspots), unit: "" },
    { eyebrow: "SLA breaches avoided", value: String(summary?.flipkart_impact?.sla_breaches_avoided ?? 0), unit: "" },
  ];

  const stationBurden = rawHotspots.map((h) => {
    const workload = Math.round(h.predicted_risk_index * 100 + 15);
    const stress = Math.round(h.capacity_reduction_rcf * 400 + 20);
    const deficit = Math.round(h.capacity_reduction_rcf * 50) || 1;
    return {
      station: `${h.police_station} PS`,
      workload: Math.min(100, workload),
      stress: Math.min(100, stress),
      deficit,
    };
  });

  return (
    <div className="space-y-5 max-w-4xl">
      <SectionHeader
        title={`Reports · ${audit ? "Audit Mode" : "Priority Mode"}`}
        subtitle={audit ? "Full transparency — every corridor, score, and model assumption" : "Critical hotspots only — pre-shift glance"}
        right={
          <button onClick={() => window.print()} className="no-print flex items-center gap-1.5 border border-hairline px-2.5 py-1 text-[11px] text-text-muted hover:text-text-primary">
            <Printer size={13} /> Print
          </button>
        }
      />

      <section>
        <Eyebrow>Executive Brief</Eyebrow>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
          {execBrief.map((s) => (
            <div key={s.eyebrow} className="border border-hairline bg-surface p-3">
              <div className="eyebrow leading-tight">{s.eyebrow}</div>
              <div className="readout text-2xl mt-1">{s.value}{s.unit}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <Eyebrow>Corridor Ranking</Eyebrow>
        <table className="w-full text-sm border border-hairline mt-2">
          <thead className="border-b border-hairline">
            <tr>
              <th className="text-left eyebrow py-2 px-3">Corridor</th>
              <th className="text-left eyebrow py-2 px-3">Risk</th>
              <th className="text-left eyebrow py-2 px-3">Delay</th>
              <th className="text-left eyebrow py-2 px-3">Logistics</th>
            </tr>
          </thead>
          <tbody>
            {corridors.map((c) => (
              <tr key={c.id} className="border-b border-hairline last:border-0">
                <td className="py-2 px-3 flex items-center gap-2"><Beacon severity={c.severity} />{c.name}</td>
                <td className="py-2 px-3 readout">{c.risk}</td>
                <td className="py-2 px-3 readout">{c.delay}m</td>
                <td className="py-2 px-3 readout">{c.logisticsImpact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <Eyebrow>{audit ? "All Hotspots" : "Critical Hotspots"}</Eyebrow>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          {hotspots.map((h) => (
            <div key={h.id} className="border border-hairline bg-surface p-3">
              <div className="flex items-center gap-2 text-sm font-medium"><Beacon severity={h.severity} />{h.name}</div>
              <div className="readout text-xs text-text-muted mt-1">Risk {h.riskScore} · {h.officers} ofc · {h.timeWindow}</div>
            </div>
          ))}
        </div>
      </section>

      {audit && (
        <section>
          <Eyebrow>Station Burden</Eyebrow>
          <table className="w-full text-sm border border-hairline mt-2">
            <thead className="border-b border-hairline">
              <tr>
                <th className="text-left eyebrow py-2 px-3">Station</th>
                <th className="text-left eyebrow py-2 px-3">Workload</th>
                <th className="text-left eyebrow py-2 px-3">Stress</th>
                <th className="text-left eyebrow py-2 px-3">Deficit</th>
              </tr>
            </thead>
            <tbody>
              {stationBurden.map((s) => (
                <tr key={s.station} className="border-b border-hairline last:border-0">
                  <td className="py-2 px-3">{s.station}</td>
                  <td className="py-2 px-3 readout">{s.workload}</td>
                  <td className="py-2 px-3 readout">{s.stress}</td>
                  <td className="py-2 px-3 readout">{s.deficit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {audit && (
        <section className="border border-hairline bg-surface p-4">
          <Eyebrow>Model Assumptions</Eyebrow>
          <ul className="text-xs text-text-muted mt-2 space-y-1 list-disc pl-4">
            <li>ST-GATv2 with adaptive graph learning over monitored junctions.</li>
            <li>Weighted loss prioritising commercial hotspots; historical-violation weighting per junction.</li>
            <li>MILP dispatch objective: weighted sum of delay, risk, and logistics priority.</li>
            <li>Greenshields fundamental diagram used for corridor flow simulation.</li>
          </ul>
        </section>
      )}
    </div>
  );
}

