import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Severity = "critical" | "high" | "elevated" | "nominal";

export interface MappedHotspot {
  id: string;
  name: string;
  corridor: string;
  x: number;
  y: number;
  severity: Severity;
  riskScore: number;
  congestionContribution: number;
  violationVolume: number;
  logisticsImpact: number;
  confidence: number;
  delayEstimate: number;
  officers: number;
  timeWindow: string;
  delayDelta: number;
  factors: { label: string; weight: number }[];
  flipkart_impact?: {
    sla_breaches_avoided: number;
    cost_savings_inr: number;
  };
}

export interface MappedCorridor {
  id: string;
  name: string;
  path: { x: number; y: number }[];
  severity: Severity;
  risk: number;
  delay: number;
  logisticsImpact: number;
}

export interface TelemetrySummary {
  total_hotspots: number;
  total_violations: number;
  avg_capacity_recovered: number;
  total_savings: number;
  flipkart_impact?: {
    sla_breaches_avoided: number;
    cost_savings_inr: number;
  };
}

interface TelemetryState {
  summary: TelemetrySummary | null;
  hotspots: MappedHotspot[];
  corridors: MappedCorridor[];
  routes: any[];
  rawHotspots: any[];
  rawRoutes: any[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const TelemetryCtx = createContext<TelemetryState | null>(null);

function mapActualToMockHotspot(h: any): MappedHotspot {
  const priority = h.priority_score || 0;
  let severity: Severity = "nominal";
  if (priority >= 15.0) severity = "critical";
  else if (priority >= 3.0) severity = "high";
  else if (priority >= 1.0) severity = "elevated";

  // Map latitude/longitude to approximate x/y normalized coordinates for SVG canvas
  // Bengaluru bounds: Lat [12.8, 13.1], Lon [77.5, 77.8]
  const x = (h.lon - 77.5) / 0.3;
  const y = 1.0 - (h.lat - 12.8) / 0.3;

  const delayEst = Math.round(parseFloat(h.travel_time_before || "0"));

  return {
    id: String(h.cluster_id),
    name: `${h.police_station} Junction`,
    corridor: h.road_class || `Corridor ${h.cluster_id}`,
    x: Math.max(0.01, Math.min(0.99, x)),
    y: Math.max(0.01, Math.min(0.99, y)),
    severity,
    riskScore: Math.round((h.predicted_risk_index || 0) * 100),
    congestionContribution: Math.round((h.capacity_reduction_rcf || 0) * 100),
    violationVolume: h.total_violations || Math.round((h.predicted_risk_index || 0) * 400),
    logisticsImpact: Math.round((h.logistics_penalty_index || 0) * 100),
    confidence: Math.round(80 + (h.predicted_risk_index || 0) * 15),
    delayEstimate: isNaN(delayEst) ? 0 : delayEst,
    officers: Math.round((h.capacity_reduction_rcf || 0) * 30) || 2,
    timeWindow: h.target_shift || "08:00 – 12:00",
    delayDelta: Math.round(parseFloat(h.delay_savings_per_vehicle || "0")),
    factors: [
      { label: "Historical Violations", weight: Math.round((h.predicted_risk_index || 0) * 45) },
      { label: "Transit Density", weight: Math.round((h.capacity_reduction_rcf || 0) * 35) },
      { label: "Commercial Profile", weight: Math.round((h.logistics_weight || 0) * 10) }
    ],
    flipkart_impact: h.flipkart_impact
  };
}

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<{ summary: TelemetrySummary; hotspots: any[]; routes: any[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTelemetry = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch("/api/data");
      if (!res.ok) throw new Error(`Telemetry load failed with status: ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      console.error("Telemetry sync failed: ", err);
      setError(err.message || "Failed to sync telemetry database.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
  }, []);

  const hotspots = data?.hotspots ? data.hotspots.map(mapActualToMockHotspot) : [];

  const corridors = data?.hotspots ? data.hotspots.map((h: any) => {
    const priority = h.priority_score || 0;
    let severity: Severity = "nominal";
    if (priority >= 15.0) severity = "critical";
    else if (priority >= 3.0) severity = "high";
    else if (priority >= 1.0) severity = "elevated";

    const x = (h.lon - 77.5) / 0.3;
    const y = 1.0 - (h.lat - 12.8) / 0.3;

    return {
      id: `corr-${h.cluster_id}`,
      name: `${h.police_station} PS · ${h.road_class}`,
      path: [
        { x: Math.max(0.01, Math.min(0.99, x - 0.05)), y: Math.max(0.01, Math.min(0.99, y + 0.05)) },
        { x: Math.max(0.01, Math.min(0.99, x)), y: Math.max(0.01, Math.min(0.99, y)) },
        { x: Math.max(0.01, Math.min(0.99, x + 0.05)), y: Math.max(0.01, Math.min(0.99, y - 0.05)) },
      ],
      severity,
      risk: Math.round((h.predicted_risk_index || 0) * 100),
      delay: Math.round(parseFloat(h.travel_time_before || "0")),
      logisticsImpact: Math.round((h.logistics_penalty_index || 0) * 100),
    };
  }) : [];

  return (
    <TelemetryCtx.Provider
      value={{
        summary: data?.summary || null,
        hotspots,
        corridors,
        routes: data?.routes || [],
        rawHotspots: data?.hotspots || [],
        rawRoutes: data?.routes || [],
        isLoading,
        error,
        refresh: fetchTelemetry
      }}
    >
      {children}
    </TelemetryCtx.Provider>
  );
}

export function useTelemetry() {
  const context = useContext(TelemetryCtx);
  if (!context) throw new Error("useTelemetry must be used within TelemetryProvider");
  return context;
}
