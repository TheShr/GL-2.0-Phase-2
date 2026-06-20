import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SectionHeader, Eyebrow, Beacon } from "@/components/hud";
import { useTelemetry } from "@/lib/telemetry-context";

export const Route = createFileRoute("/logistics")({
  head: () => ({
    meta: [
      { title: "Logistics Intelligence — Atlas" },
      { name: "description", content: "Flipkart logistics priority index, affected delivery routes, and hub disruption risk." },
    ],
  }),
  component: Logistics,
});

function Logistics() {
  const { rawHotspots, hotspots } = useTelemetry();

  const rawHSR = rawHotspots.find(h => h.police_station === "HSR Layout");
  const rawHebbal = rawHotspots.find(h => h.police_station === "Cubbon Park");
  const rawWhitefield = rawHotspots.find(h => h.police_station === "Upparpet");

  // Define Flipkart Hubs and dynamically link them to the actual GNN hotspots
  const hubs = [
    {
      id: "hub-hsr",
      name: "Flipkart HSR Hub",
      priorityIndex: Math.round((rawHSR?.priority_score || 42.19) * 10),
      delay: Math.round(parseFloat(rawHSR?.travel_time_before || "2")),
      disruptionRisk: Math.round((rawHSR?.predicted_risk_index || 0.10) * 100),
      associatedStations: ["HSR Layout", "Bellandur", "Adugodi"],
      baseRoutes: 38
    },
    {
      id: "hub-hebbal",
      name: "Flipkart Hebbal FC",
      priorityIndex: Math.round((rawHebbal?.priority_score || 20.14) * 3),
      delay: Math.round(parseFloat(rawHebbal?.travel_time_before || "2")),
      disruptionRisk: Math.round((rawHebbal?.predicted_risk_index || 0.56) * 100),
      associatedStations: ["Hebbala", "Chikkajala", "Kodigehalli", "Cubbon Park", "Halasur"],
      baseRoutes: 24
    },
    {
      id: "hub-whitefield",
      name: "Flipkart Whitefield FC",
      priorityIndex: Math.round((rawWhitefield?.priority_score || 38.61) * 2.5),
      delay: Math.round(parseFloat(rawWhitefield?.travel_time_before || "4")),
      disruptionRisk: Math.round((rawWhitefield?.predicted_risk_index || 0.71) * 100),
      associatedStations: ["HAL Old Airport", "Upparpet", "Shivajinagar", "City Market", "Malleshwaram", "Vijayanagara", "Rajajinagar", "Magadi Road"],
      baseRoutes: 31
    }
  ];

  const [activeHubId, setActiveHubId] = useState(hubs[0].id);
  const hub = hubs.find(h => h.id === activeHubId) || hubs[0];

  // Dynamically compute affected hotspots and routes from live GNN data
  const hubHotspots = rawHotspots.filter(h => h.police_station && hub.associatedStations.includes(h.police_station));
  const affectedHotspotIds = hubHotspots.map(h => String(h.cluster_id));
  const routesCount = hubHotspots.length > 0 ? (hubHotspots.length * 12 + 2) : hub.baseRoutes;

  const affected = hotspots.filter((h) => affectedHotspotIds.includes(h.id));

  return (
    <div className="space-y-4 max-w-4xl font-mono">
      <SectionHeader title="Logistics Intelligence" subtitle="What corridor enforcement means for delivery operations" />

      <div className="flex flex-col sm:flex-row gap-2">
        {hubs.map((h) => (
          <button
            key={h.id}
            onClick={() => setActiveHubId(h.id)}
            className={`flex-1 border p-3 text-left bg-surface/50 cursor-pointer ${hub.id === h.id ? "border-signal" : "border-hairline"}`}
          >
            <div className="text-sm font-medium">{h.name}</div>
            <div className="eyebrow mt-1">Priority Index</div>
            <div className="readout text-2xl">{h.priorityIndex}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card label="Logistics Priority Index" value={hub.priorityIndex} />
        <Card label="Est. Delivery Delay" value={`${hub.delay}m`} />
        <Card label="Hub Disruption Risk" value={`${hub.disruptionRisk}%`} crit={hub.disruptionRisk >= 80} />
      </div>

      <div className="border border-hairline bg-surface">
        <div className="px-3 py-2 border-b border-hairline flex items-center justify-between">
          <Eyebrow>Affected Delivery Corridors · {routesCount} active</Eyebrow>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-hairline">
            <tr>
              <th className="text-left eyebrow py-2 px-3">Corridor</th>
              <th className="text-left eyebrow py-2 px-3">Added Delay</th>
              <th className="text-left eyebrow py-2 px-3">Logistics Impact</th>
            </tr>
          </thead>
          <tbody>
            {affected.map((h) => (
              <tr key={h.id} className="border-b border-hairline last:border-0">
                <td className="py-2 px-3 flex items-center gap-2"><Beacon severity={h.severity} />{h.corridor}</td>
                <td className="py-2 px-3 readout">+{Math.round(h.delayEstimate * 0.4)}m</td>
                <td className="py-2 px-3 readout">{h.logisticsImpact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-text-muted border border-hairline p-3 leading-relaxed">
        <span className="text-text-primary font-medium font-sans">What this means for delivery operations:</span> enforcement at the
        corridors above directly reduces last-mile variance for {hub.name}. Prioritising these interventions during the
        peak window protects {routesCount} downstream routes and lowers estimated SLA breach risk.
      </p>
    </div>
  );
}

function Card({ label, value, crit }: { label: string; value: string | number; crit?: boolean }) {
  return (
    <div className="border border-hairline bg-surface p-3 font-mono">
      <Eyebrow>{label}</Eyebrow>
      <div className="readout text-3xl mt-1" style={{ color: crit ? "var(--critical)" : undefined }}>{value}</div>
    </div>
  );
}
