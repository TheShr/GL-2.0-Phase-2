import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Play, Pause } from "lucide-react";
import { SectionHeader, TabStrip, Beacon, FactorBar, Eyebrow, Panel, Readout } from "@/components/hud";
import { useTelemetry } from "@/lib/telemetry-context";
import { useApp } from "@/lib/app-context";

const FORECAST_HOURS = Array.from({ length: 17 }, (_, i) => 6 + i);

export const Route = createFileRoute("/predictions")({
  head: () => ({
    meta: [
      { title: "Predictions & Analytics — Atlas" },
      { name: "description", content: "ST-GATv2 spatiotemporal forecasts, junction exposure, corridor ranking and station burden." },
    ],
  }),
  component: Predictions,
});

const TABS = ["Forecast", "Time-Lapse", "Junction Exposure", "Corridor Ranking", "Station Burden", "Manual Forecast"];

function Predictions() {
  const [tab, setTab] = useState(TABS[0]);
  const [modelOpen, setModelOpen] = useState(false);

  return (
    <div className="space-y-4 max-w-5xl">
      <SectionHeader title="Predictions & Analytics" subtitle="ST-GATv2 spatiotemporal demand & risk forecasting" />

      <div className="flex flex-wrap items-center gap-4 text-[11px]">
        <span className="flex items-center gap-1.5">
          <Beacon severity="nominal" /> <span className="text-text-muted">ST-GATv2 · </span>
          <span className="text-text-primary">Active</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Beacon severity="nominal" /> <span className="text-text-muted">Adaptive Graph Learning · </span>
          <span className="text-text-primary">Enabled</span>
        </span>
        <button onClick={() => setModelOpen((o) => !o)} className="text-signal text-[11px] hover:underline border-none bg-transparent cursor-pointer">
          {modelOpen ? "Hide model notes" : "Model notes"}
        </button>
      </div>
      {modelOpen && (
        <p className="text-xs text-text-muted border border-hairline p-3 leading-relaxed bg-surface/50">
          Training methodology: weighted loss prioritising commercial hotspots, historical-violation weighting applied
          per junction, and balanced hotspot sampling to prevent dominance by the highest-traffic corridors. The
          adaptive graph layer learns inter-junction influence rather than relying on a fixed road-adjacency matrix,
          allowing congestion spillover to be modelled across non-adjacent corridors.
        </p>
      )}

      <TabStrip tabs={TABS} active={tab} onChange={setTab} />

      {tab === "Forecast" && <Forecast />}
      {tab === "Time-Lapse" && <TimeLapse />}
      {tab === "Junction Exposure" && <JunctionExposure />}
      {tab === "Corridor Ranking" && <CorridorRanking />}
      {tab === "Station Burden" && <StationBurden />}
      {tab === "Manual Forecast" && <ManualForecast />}
    </div>
  );
}

function ChartFrame({ children, conf }: { children: React.ReactNode; conf: number }) {
  return (
    <div className="border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <Eyebrow>Predicted congestion index · 06:00 → 22:00</Eyebrow>
        <span className="readout text-xs text-text-muted">Confidence {conf}%</span>
      </div>
      <div className="h-72">{children}</div>
    </div>
  );
}

function Forecast() {
  const { hotspots } = useTelemetry();
  const avgRisk = hotspots.reduce((sum, h) => sum + h.riskScore, 0) / (hotspots.length || 1);
  const avgConf = Math.round(hotspots.reduce((sum, h) => sum + h.confidence, 0) / (hotspots.length || 1)) || 82;

  const data = FORECAST_HOURS.map((h) => {
    // Generate diurnal curve peaking at 9 AM and 6:30 PM (typical urban peak profile)
    const morning = Math.exp(-((h - 9) ** 2) / 6) * 40;
    const evening = Math.exp(-((h - 18.5) ** 2) / 7) * 46;
    const base = 20 + morning + evening + (((h * 2) % 5) - 2);
    // Scale by actual GNN average risk index
    const value = Math.min(100, Math.max(5, Math.round((base / 60) * avgRisk)));
    return {
      hour: `${String(h).padStart(2, "0")}:00`,
      h,
      value,
      lower: Math.max(0, Math.round(value * 0.88)),
      upper: Math.min(100, Math.round(value * 1.12)),
    };
  });

  return (
    <ChartFrame conf={avgConf}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="var(--border-hairline)" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--text-muted)" }} interval={2} />
          <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
          <Tooltip
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-hairline)", fontSize: 11 }}
            labelStyle={{ color: "var(--text-muted)" }}
          />
          <Area type="monotone" dataKey="upper" stroke="none" fill="var(--signal)" fillOpacity={0.12} />
          <Area type="monotone" dataKey="lower" stroke="none" fill="var(--canvas)" fillOpacity={1} />
          <Line type="monotone" dataKey="value" stroke="var(--signal)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function TimeLapse() {
  const { hotspots } = useTelemetry();
  const { setTimeLapseHour } = useApp();
  const avgRisk = hotspots.reduce((sum, h) => sum + h.riskScore, 0) / (hotspots.length || 1);

  const data = FORECAST_HOURS.map((h) => {
    const morning = Math.exp(-((h - 9) ** 2) / 6) * 40;
    const evening = Math.exp(-((h - 18.5) ** 2) / 7) * 46;
    const base = 20 + morning + evening + (((h * 3) % 5) - 2);
    const value = Math.min(100, Math.max(5, Math.round((base / 60) * avgRisk)));
    return {
      hour: `${String(h).padStart(2, "0")}:00`,
      h,
      value,
    };
  });

  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % data.length), 700);
    return () => clearInterval(id);
  }, [playing, data.length]);

  const cur = data[frame];

  // Sync active hour with App Context for Map Dock update
  useEffect(() => {
    setTimeLapseHour(cur.h);
    return () => setTimeLapseHour(null);
  }, [cur.h, setTimeLapseHour]);
  return (
    <div className="border border-hairline bg-surface p-4 space-y-4">
      <div className="flex items-center justify-between">
        <Eyebrow>Time-lapse · animated corridor weight</Eyebrow>
        <span className="readout text-sm">
          {cur.hour} · index {cur.value}
        </span>
      </div>
      <div className="h-48 flex items-end gap-1">
        {data.map((d, i) => (
          <div
            key={i}
            className="flex-1"
            style={{
              height: `${(d.value / 100) * 100}%`,
              backgroundColor: i === frame ? "var(--signal)" : "var(--text-muted)",
              opacity: i === frame ? 1 : 0.3,
            }}
          />
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button onClick={() => setPlaying((p) => !p)} className="border border-hairline p-1.5 cursor-pointer bg-surface hover:bg-surface-2 transition-colors">
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <input
          type="range"
          min={0}
          max={data.length - 1}
          value={frame}
          onChange={(e) => setFrame(Number(e.target.value))}
          className="flex-1 accent-signal"
        />
        <span className="readout text-xs w-14">{cur.hour}</span>
      </div>
    </div>
  );
}

function JunctionExposure() {
  const { hotspots } = useTelemetry();
  const [sort, setSort] = useState<"risk" | "sens" | "conflict">("risk");
  
  const rows = hotspots.map((h) => ({
    name: h.name,
    risk: h.riskScore,
    sens: Math.round(h.riskScore * 0.8 + h.congestionContribution),
    conflict: Math.round(h.violationVolume / 8),
    severity: h.severity,
  })).sort((a, b) => b[sort] - a[sort]);

  const Th = ({ k, label }: { k: typeof sort; label: string }) => (
    <th onClick={() => setSort(k)} className="cursor-pointer text-left eyebrow py-2 px-3 hover:text-text-primary">
      {label} {sort === k ? "▾" : ""}
    </th>
  );

  return (
    <div className="border border-hairline bg-surface">
      <table className="w-full text-sm">
        <thead className="border-b border-hairline">
          <tr>
            <th className="text-left eyebrow py-2 px-3">Junction</th>
            <Th k="risk" label="Proximity Risk" />
            <Th k="sens" label="Intersection Sensitivity" />
            <Th k="conflict" label="Conflict Point Density" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-hairline last:border-0">
              <td className="py-2 px-3 flex items-center gap-2">
                <Beacon severity={r.severity} /> {r.name}
              </td>
              <td className="py-2 px-3 readout">{r.risk}%</td>
              <td className="py-2 px-3 readout">{r.sens}</td>
              <td className="py-2 px-3 readout">{r.conflict}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CorridorRanking() {
  const { corridors } = useTelemetry();
  
  const rows = [...corridors]
    .map((c) => ({ ...c, score: Math.round((c.risk * c.delay * c.logisticsImpact) / 1000) }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-2">
      <p className="text-xs text-text-muted" title="Risk × Delay × Logistics Impact ÷ 1000">
        Sorted by Risk × Delay × Logistics Impact <span className="text-signal">(hover for formula)</span>
      </p>
      {rows.map((c, i) => (
        <div key={c.id} className="border border-hairline bg-surface p-3" style={{ opacity: 1 - i * 0.08 }}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Beacon severity={c.severity} /> {c.name}
            </span>
            <span className="readout text-lg" style={{ color: c.severity === "critical" ? "var(--critical)" : undefined }}>
              {c.score}
            </span>
          </div>
          <div className="mt-2 space-y-0.5">
            <FactorBar label="Risk" weight={c.risk} />
            <FactorBar label="Delay (min)" weight={c.delay} />
            <FactorBar label="Logistics impact" weight={c.logisticsImpact} />
          </div>
        </div>
      ))}
    </div>
  );
}

function StationBurden() {
  const { rawHotspots } = useTelemetry();
  
  const stationMap = new Map<string, { workload: number; stress: number; deficit: number; count: number }>();
  rawHotspots.forEach(h => {
    const ps = `${h.police_station} PS`;
    const workload = Math.round((h.predicted_risk_index || 0) * 100);
    const stress = Math.round((h.capacity_reduction_rcf || 0) * 100);
    const deficit = Math.round((h.capacity_reduction_rcf || 0) * 45) || 1;
    
    if (stationMap.has(ps)) {
      const current = stationMap.get(ps)!;
      stationMap.set(ps, {
        workload: current.workload + workload,
        stress: current.stress + stress,
        deficit: current.deficit + deficit,
        count: current.count + 1
      });
    } else {
      stationMap.set(ps, { workload, stress, deficit, count: 1 });
    }
  });

  const stationBurden = Array.from(stationMap.entries()).map(([station, data]) => ({
    station,
    workload: Math.min(100, Math.round(data.workload / data.count + 15)),
    stress: Math.min(100, Math.round(data.stress / data.count + 20)),
    deficit: Math.max(1, Math.round(data.deficit / data.count))
  }));

  return (
    <div className="space-y-2">
      {stationBurden.map((s) => (
        <div key={s.station} className="border border-hairline bg-surface p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{s.station}</span>
            {s.deficit > 4 ? <span className="flex items-center gap-1 text-xs"><Beacon severity="critical" />deficit</span> : null}
          </div>
          <div className="grid grid-cols-3 gap-4 mt-2">
            <div><Eyebrow>Predicted Workload</Eyebrow><div className="readout text-lg">{s.workload}</div></div>
            <div><Eyebrow>Resource Stress</Eyebrow><div className="readout text-lg">{s.stress}</div></div>
            <div><Eyebrow>Coverage Deficit</Eyebrow><div className="readout text-lg">{s.deficit}</div></div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface NodeDetails {
  node_id: string;
  road_name: string;
  police_station: string;
  lanes: number;
  commercial_density: number;
  transit_density: number;
  dining_density: number;
  corporate_density: number;
  vulnerability_index: number;
  stgat_risk: number;
  predicted_risk: number;
}

interface ForecastResult {
  node_id: string;
  road_name: string;
  police_station: string;
  baseline: { risk_gnn: number; risk_xgboost: number; risk_hybrid: number };
  scenario: { risk_gnn: number; risk_xgboost: number; risk_hybrid: number };
  delta_risk_hybrid: number;
  feature_vector: Record<string, number>;
  note: string;
  source?: string;
}

const SHIFTS = [
  { label: "00:00 - Night Shift", hour: 0 },
  { label: "04:00 - Early Morning", hour: 4 },
  { label: "08:00 - Morning Rush", hour: 8 },
  { label: "12:00 - Afternoon Midshift", hour: 12 },
  { label: "16:00 - Evening Rush", hour: 16 },
  { label: "20:00 - Late Evening", hour: 20 },
];

const DAYS = [
  { label: "Monday", value: 0 },
  { label: "Tuesday", value: 1 },
  { label: "Wednesday", value: 2 },
  { label: "Thursday", value: 3 },
  { label: "Friday", value: 4 },
  { label: "Saturday", value: 5 },
  { label: "Sunday", value: 6 },
];

function ManualForecast() {
  const [nodes, setNodes] = useState<NodeDetails[]>([]);
  const [loadingNodes, setLoadingNodes] = useState(true);
  const [nodesError, setNodesError] = useState<string | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [hour, setHour] = useState<number>(8);
  const [dayOfWeek, setDayOfWeek] = useState<number>(0);
  const [scooterCount, setScooterCount] = useState<number>(5);
  const [carCount, setCarCount] = useState<number>(5);
  const [autoCount, setAutoCount] = useState<number>(5);

  const [result, setResult] = useState<ForecastResult | null>(null);
  const [runningForecast, setRunningForecast] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchNodes() {
      try {
        setLoadingNodes(true);
        const res = await fetch("/api/nodes");
        if (!res.ok) throw new Error("Failed to load node catalog.");
        const data = await res.json();
        setNodes(data);
        if (data.length > 0) {
          setSelectedNodeId(data[0].node_id);
        }
      } catch (err: any) {
        setNodesError(err.message || "Failed to load corridor nodes.");
      } finally {
        setLoadingNodes(false);
      }
    }
    fetchNodes();
  }, []);

  const selectedNode = useMemo(() => {
    return nodes.find((n) => n.node_id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  const handleRunForecast = async () => {
    if (!selectedNodeId) return;
    try {
      setRunningForecast(true);
      setForecastError(null);

      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          node_id: selectedNodeId,
          hour,
          day_of_week: dayOfWeek,
          scooter_count: scooterCount,
          car_count: carCount,
          auto_count: autoCount
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || errData.error || "Failed to execute forecast.");
      }
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setForecastError(err.message || "Error running forecasting model.");
    } finally {
      setRunningForecast(false);
    }
  };

  useEffect(() => {
    if (selectedNodeId) {
      handleRunForecast();
    }
  }, [selectedNodeId, hour, dayOfWeek, scooterCount, carCount, autoCount]);

  if (loadingNodes) {
    return (
      <div className="border border-hairline bg-surface p-6 text-center text-text-muted text-xs tracking-widest font-medium">
        Loading corridor nodes...
      </div>
    );
  }

  if (nodesError) {
    return (
      <div className="border border-hairline bg-surface p-6 text-center text-red-500 text-xs tracking-wider">
        Error loading nodes: {nodesError}
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* Inputs Column */}
      <Panel className="p-4 space-y-4">
        <Eyebrow>Manual Override Inputs</Eyebrow>

        {/* Node Select */}
        <div className="space-y-1">
          <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Select Corridor Segment</label>
          <select
            value={selectedNodeId}
            onChange={(e) => setSelectedNodeId(e.target.value)}
            className="w-full bg-surface-2 border border-hairline text-text-primary px-2 py-1.5 text-xs focus:border-signal outline-none rounded-none"
          >
            {nodes.map((n) => (
              <option key={n.node_id} value={n.node_id}>
                {n.road_name} ({n.police_station} PS)
              </option>
            ))}
          </select>
        </div>

        {/* Hour and Day */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Day of Week</label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
              className="w-full bg-surface-2 border border-hairline text-text-primary px-2 py-1.5 text-xs focus:border-signal outline-none rounded-none"
            >
              {DAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Shift Interval</label>
            <select
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
              className="w-full bg-surface-2 border border-hairline text-text-primary px-2 py-1.5 text-xs focus:border-signal outline-none rounded-none"
            >
              {SHIFTS.map((s) => (
                <option key={s.hour} value={s.hour}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Count Sliders */}
        <div className="border-t border-hairline pt-3 space-y-3">
          <Eyebrow>Vehicle Encroachment Overrides</Eyebrow>

          <div className="space-y-1">
            <div className="flex justify-between">
              <Eyebrow>Scooters / Two-Wheelers</Eyebrow>
              <span className="readout text-xs font-semibold">{scooterCount} units</span>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              value={scooterCount}
              onChange={(e) => setScooterCount(Number(e.target.value))}
              className="w-full accent-signal"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <Eyebrow>Cars / LVs</Eyebrow>
              <span className="readout text-xs font-semibold">{carCount} units</span>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              value={carCount}
              onChange={(e) => setCarCount(Number(e.target.value))}
              className="w-full accent-signal"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <Eyebrow>Passenger / Cargo Autos</Eyebrow>
              <span className="readout text-xs font-semibold">{autoCount} units</span>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              value={autoCount}
              onChange={(e) => setAutoCount(Number(e.target.value))}
              className="w-full accent-signal"
            />
          </div>
        </div>

        {/* Static context display */}
        {selectedNode && (
          <div className="border-t border-hairline pt-3 space-y-2">
            <Eyebrow>Static Segment Attributes</Eyebrow>
            <div className="flex items-center justify-between text-xs font-mono text-text-muted">
              <span>Physical Lanes:</span>
              <span className="text-text-primary font-semibold">{selectedNode.lanes} lanes</span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono text-text-muted">
              <span>Vulnerability Index:</span>
              <span className="text-text-primary font-semibold">{selectedNode.vulnerability_index.toFixed(3)}</span>
            </div>
            <div className="mt-2 space-y-0.5">
              <FactorBar label="Commercial Density" weight={Math.round(selectedNode.commercial_density * 100)} />
              <FactorBar label="Transit Density" weight={Math.round(selectedNode.transit_density * 100)} />
              <FactorBar label="Dining Density" weight={Math.round(selectedNode.dining_density * 100)} />
              <FactorBar label="Corporate Office Density" weight={Math.round(selectedNode.corporate_density * 100)} />
            </div>
          </div>
        )}

        <button
          onClick={handleRunForecast}
          disabled={runningForecast || !selectedNodeId}
          className="w-full bg-signal text-primary-foreground py-2 text-[11px] uppercase tracking-wider border-none cursor-pointer hover:opacity-90 font-bold transition-all disabled:opacity-50"
        >
          {runningForecast ? "Running Simulation..." : "Run Forecast"}
        </button>
      </Panel>

      {/* Outputs Column */}
      <Panel className="p-4 flex flex-col justify-between">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Eyebrow>Scenario Prediction Output</Eyebrow>
            {result?.source === "client_fallback_estimate" && (
              <span className="px-1.5 py-0.5 rounded text-[8px] font-mono border border-amber-900/30 text-amber-500 bg-amber-500/10 tracking-widest uppercase animate-pulse-dot">
                Fallback Approximation (Backend Offline)
              </span>
            )}
          </div>

          {forecastError && (
            <div className="border border-red-900/20 bg-red-900/10 p-3 text-xs text-red-500 tracking-wider">
              {forecastError}
            </div>
          )}

          {result ? (
            <div className="space-y-4">
              <div className="flex items-end justify-between border-b border-hairline pb-3">
                <Readout
                  label="Predicted Hybrid Risk Index"
                  value={result.scenario.risk_hybrid.toFixed(3)}
                  size="xl"
                  critical={result.scenario.risk_hybrid > 0.7}
                />

                <div className="text-right">
                  <Eyebrow>Risk Delta</Eyebrow>
                  <span
                    className={`readout text-xl font-bold font-mono ${
                      result.delta_risk_hybrid > 0.001
                        ? "text-red-500"
                        : result.delta_risk_hybrid < -0.001
                        ? "text-emerald-500"
                        : "text-text-muted"
                    }`}
                  >
                    {result.delta_risk_hybrid >= 0 ? "+" : ""}
                    {result.delta_risk_hybrid.toFixed(3)}
                  </span>
                </div>
              </div>

              {/* Sub-components breakdown */}
              <div className="grid grid-cols-2 gap-4 border-b border-hairline pb-3">
                <div>
                  <Eyebrow>GNN Baseline (Constant)</Eyebrow>
                  <div className="readout text-lg text-text-muted mt-1">{result.scenario.risk_gnn.toFixed(3)}</div>
                  <div className="text-[9px] text-text-muted mt-0.5">Static spatio-temporal base</div>
                </div>
                <div>
                  <Eyebrow>XGBoost Live Override</Eyebrow>
                  <div className="readout text-lg mt-1">{result.scenario.risk_xgboost.toFixed(3)}</div>
                  <div className="text-[9px] text-text-muted mt-0.5">Computed on traffic counts</div>
                </div>
              </div>

              {/* Baseline stats */}
              <div className="grid grid-cols-2 gap-4 text-xs font-mono text-text-muted">
                <div className="flex justify-between">
                  <span>Baseline GNN:</span>
                  <span className="font-semibold">{result.baseline.risk_gnn.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Baseline XGB:</span>
                  <span className="font-semibold">{result.baseline.risk_xgboost.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Baseline Hybrid:</span>
                  <span className="font-semibold text-text-primary">{result.baseline.risk_hybrid.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Scenario Hybrid:</span>
                  <span className="font-semibold text-text-primary">{result.scenario.risk_hybrid.toFixed(3)}</span>
                </div>
              </div>

              {/* Debug features dump */}
              <details className="mt-4 border-t border-hairline pt-3 cursor-pointer">
                <summary className="text-[10px] text-text-muted uppercase tracking-wider select-none hover:text-text-primary">
                  Debug Feature Vector
                </summary>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-[10px] font-mono text-text-muted">
                  {Object.entries(result.feature_vector).map(([key, val]) => (
                    <div key={key} className="flex justify-between border-b border-hairline py-0.5">
                      <span>{key}:</span>
                      <span className="text-text-primary font-semibold">{val.toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          ) : (
            <div className="border border-hairline bg-surface/50 p-6 text-center text-text-muted text-xs leading-relaxed">
              Adjust overrides in the left panel to execute real-time spatiotemporal risk simulation.
            </div>
          )}
        </div>

        {/* Model Notes Disclosure */}
        <p className="text-[10px] text-text-muted border-t border-hairline mt-4 pt-2.5 leading-relaxed">
          {result?.note || "GNN component reflects the model's last trained forecast for this corridor; the XGBoost component is recomputed live from your inputs."}
        </p>
      </Panel>
    </div>
  );
}

