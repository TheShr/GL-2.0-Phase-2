import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useState, lazy, Suspense } from "react";
import { Beacon } from "@/components/hud";
import { useApp } from "@/lib/app-context";
import { useTelemetry, type MappedHotspot } from "@/lib/telemetry-context";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { X, ArrowRight, Shield, AlertTriangle, RefreshCw } from "lucide-react";

const MapContainer = lazy(() => import("@/components/MapContainer"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Command Center — Atlas" },
      { name: "description", content: "Map-dominant traffic operations command center for Bengaluru corridors." },
    ],
  }),
  component: CommandCenter,
});

const MAP_LAYERS = [
  "Commercial Density",
  "Transit Density",
  "Dining Density",
  "Corporate Density",
  "Road Capacity",
  "Vulnerability Index",
  "Flipkart Logistics Hubs",
  "Elevation / Slope",
];

function CommandCenter() {
  const { theme } = useTheme();
  const { mapFocus, setMapFocus } = useApp();
  const { summary, hotspots: mappedHotspots, rawHotspots, rawRoutes, isLoading, error, refresh } = useTelemetry();
  const navigate = useNavigate();

  const focusCoords = mapFocus && mapFocus.includes(",") ? (() => {
    const parts = mapFocus.split(",");
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    const name = parts.slice(2).join(",") || "Searched Location";
    return { lat, lng, name };
  })() : null;
  
  const [layers, setLayers] = useState<Record<string, boolean>>(
    Object.fromEntries(MAP_LAYERS.map((l) => [l, l === "Flipkart Logistics Hubs"])),
  );
  const [clear, setClear] = useState(false);
  const [drawer, setDrawer] = useState<MappedHotspot | null>(null);
  const [mobileActivePanel, setMobileActivePanel] = useState<"brief" | "layers" | "hotspots" | "none">("brief");

  if (isLoading) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center relative overflow-hidden bg-canvas min-h-[400px]">
        <div className="relative z-10 rounded-2xl p-10 flex flex-col items-center gap-6 max-w-sm w-full mx-4 border border-hairline bg-surface">
          <div className="flex flex-col items-center gap-2">
            <img
              src={theme === "dark" ? "/logo-dark.png" : "/logo-light.png"}
              alt="Atlas Logo"
              className="h-10 w-auto object-contain"
            />
            <span className="text-[10px] text-text-muted font-semibold tracking-widest uppercase mt-2">Smart City Intelligence</span>
          </div>
          <div className="w-full flex flex-col gap-2">
            <div className="loading-bar-track h-1.5 w-full">
              <div className="loading-bar-sweep h-full" />
            </div>
            <span className="text-[10px] text-text-muted font-medium text-center tracking-wider uppercase animate-pulse-dot">
              Initializing spatial topology graphs...
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center px-4 relative bg-canvas min-h-[400px]">
        <div className="relative z-10 rounded-2xl p-8 max-w-md w-full flex flex-col items-center gap-5 text-center border border-hairline bg-surface">
          <div className="h-12 w-12 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary mb-1">System Initialization Failed</p>
            <p className="text-[12px] text-text-muted leading-relaxed">
              {error || "Could not synchronize telemetry. Ensure Python pipeline outputs exist in backend/output/ and are properly calibrated."}
            </p>
          </div>
          <button
            onClick={refresh}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[12px] font-semibold text-primary-foreground cursor-pointer transition-all hover:opacity-90 active:scale-95 border-none bg-primary"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const ranked = [...mappedHotspots].sort((a, b) => b.riskScore - a.riskScore);

  const execBrief = [
    { eyebrow: "Total Violation Volume", value: String(summary.total_violations), unit: "" },
    { eyebrow: "Avg Capacity Recovered", value: String(summary.avg_capacity_recovered), unit: "%" },
    { eyebrow: "Critical Hotspots", value: String(mappedHotspots.filter(h => h.severity === "critical").length), unit: "" },
    { eyebrow: "Total Commuter Time Saved", value: String(summary.total_savings), unit: "h" },
  ];

  return (
    <div className="relative h-full w-full">
      {/* full-bleed map = the room */}
      <Suspense fallback={
        <div className="flex h-full w-full items-center justify-center text-text-muted text-xs tracking-widest font-medium">
          Initializing cartographic engine...
        </div>
      }>
        <MapContainer
          hotspots={rawHotspots}
          selectedId={mapFocus && !mapFocus.includes(",") ? parseInt(mapFocus, 10) : null}
          focusCoords={focusCoords}
          onSelectHotspot={(h) => {
            setMapFocus(String(h.cluster_id));
            setDrawer(mappedHotspots.find(mh => mh.id === String(h.cluster_id)) || null);
          }}
          routes={rawRoutes}
          visibleLayers={{
            hotspots: true,
            routes: layers["Flipkart Logistics Hubs"],
            patrols: true,
            congestion: true,
            commercialDensity: layers["Commercial Density"],
            transitDensity: layers["Transit Density"],
            diningDensity: layers["Dining Density"],
            corporateDensity: layers["Corporate Density"],
            roadCapacity: layers["Road Capacity"],
            vulnerabilityIndex: layers["Vulnerability Index"],
            flipkartLogisticsHubs: layers["Flipkart Logistics Hubs"],
            elevationSlope: layers["Elevation / Slope"],
          }}
        />
      </Suspense>

      {/* Floating Panel Toggles for Mobile viewports */}
      {!clear && (
        <div className="absolute top-3 left-3 right-3 z-[45] flex md:hidden gap-1.5 p-1 bg-surface/90 border border-hairline rounded glass">
          {(["brief", "layers", "hotspots"] as const).map((panel) => (
            <button
              key={panel}
              onClick={() => setMobileActivePanel(prev => prev === panel ? "none" : panel)}
              className={cn(
                "flex-1 py-1.5 text-[9px] uppercase tracking-wider font-semibold border-none cursor-pointer text-center rounded transition-all",
                mobileActivePanel === panel
                  ? "bg-signal text-white font-bold"
                  : "text-text-muted hover:text-text-primary bg-transparent"
              )}
            >
              {panel}
            </button>
          ))}
        </div>
      )}

      {!clear && (
        <>
          {/* top-left: executive brief */}
          <div className={cn(
            "absolute top-14 md:top-3 left-3 w-[calc(100%-24px)] md:w-[24%] md:min-w-[260px] glass p-4 space-y-4 z-[40]",
            mobileActivePanel === "brief" ? "block md:block" : "hidden md:block"
          )}>
            <div className="wordmark text-[10px] flex items-center gap-2">
              <Beacon severity="critical" /> Executive Brief
            </div>
            <div className="grid grid-cols-2 gap-3">
              {execBrief.map((s) => (
                <div key={s.eyebrow}>
                  <div className="eyebrow leading-tight">{s.eyebrow}</div>
                  <div className="readout text-2xl font-medium mt-1">
                    {s.value}
                    <span className="text-xs text-text-muted">{s.unit}</span>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <div className="eyebrow mb-2">Top Recommended Actions</div>
              <div className="space-y-2">
                {ranked.slice(0, 4).map((h) => (
                  <div key={h.id} className="border border-hairline p-2 text-xs bg-surface/50">
                    <div className="flex items-center gap-2">
                      <Beacon severity={h.severity} />
                      <span className="font-medium truncate">{h.corridor}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-text-muted readout text-[11px]">
                      <span>{h.officers} ofc · {h.timeWindow}</span>
                      <span style={{ color: "var(--signal)" }}>−{h.delayDelta}m</span>
                    </div>
                    <button
                      onClick={() => navigate({ to: "/optimizer" })}
                      className="mt-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-signal hover:underline border-none bg-transparent cursor-pointer"
                    >
                      Send to Optimizer <ArrowRight size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* top-right: layers panel */}
          <div className={cn(
            "absolute top-14 md:top-3 right-3 w-[calc(100%-24px)] md:w-52 glass p-3 z-[40]",
            mobileActivePanel === "layers" ? "block md:block" : "hidden md:block"
          )}>
            <div className="wordmark text-[10px] mb-2">Layers</div>
            <div className="space-y-1.5">
              {MAP_LAYERS.map((l) => (
                <label key={l} className="flex items-center gap-2 text-[11px] cursor-pointer text-text-muted hover:text-text-primary">
                  <input
                    type="checkbox"
                    checked={!!layers[l]}
                    onChange={(e) => setLayers((s) => ({ ...s, [l]: e.target.checked }))}
                    className="accent-signal"
                  />
                  {l}
                </label>
              ))}
            </div>
            <button
              onClick={() => setClear(true)}
              className="mt-3 w-full border border-hairline py-1 text-[10px] uppercase tracking-wider text-text-muted hover:text-text-primary bg-surface/50 cursor-pointer"
            >
              Clear View
            </button>
          </div>

          {/* bottom: hotspot intelligence strip */}
          <div className={cn(
            "absolute bottom-20 md:bottom-0 inset-x-0 glass border-t border-hairline z-[40]",
            mobileActivePanel === "hotspots" ? "block md:block" : "hidden md:block"
          )}>
            <div className="flex items-center gap-2 px-3 pt-2">
              <span className="wordmark text-[10px]">Hotspot Intelligence</span>
            </div>
            <div className="flex gap-2 overflow-x-auto p-3 pt-2">
              {ranked.map((h) => (
                <button
                  key={h.id}
                  onClick={() => {
                    setDrawer(h);
                    setMapFocus(h.id);
                  }}
                  className={cn(
                    "shrink-0 w-56 text-left border border-hairline bg-surface p-2.5 hover:border-signal transition-colors cursor-pointer",
                    drawer?.id === h.id && "border-signal",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Beacon severity={h.severity} />
                    <span className="text-xs font-medium truncate">{h.name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 mt-2 text-[10px]">
                    <div>
                      <div className="eyebrow">Risk</div>
                      <div className="readout" style={{ color: h.severity === "critical" ? "var(--critical)" : undefined }}>
                        {h.riskScore}%
                      </div>
                    </div>
                    <div>
                      <div className="eyebrow">Congest</div>
                      <div className="readout">{h.congestionContribution}%</div>
                    </div>
                    <div>
                      <div className="eyebrow">Logi</div>
                      <div className="readout">{h.logisticsImpact}</div>
                    </div>
                    <div>
                      <div className="eyebrow">Viol</div>
                      <div className="readout">{h.violationVolume}</div>
                    </div>
                    <div>
                      <div className="eyebrow">Conf</div>
                      <div className="readout">{h.confidence}%</div>
                    </div>
                    <div>
                      <div className="eyebrow">Delay</div>
                      <div className="readout">{h.delayEstimate}m</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {clear && (
        <button
          onClick={() => setClear(false)}
          className="absolute top-14 md:top-3 right-3 glass px-3 py-1.5 text-[10px] uppercase tracking-wider text-text-primary cursor-pointer z-[40]"
        >
          Restore Panels
        </button>
      )}

      {/* detail drawer (overlays, does not push map) */}
      {drawer && (
        <div className="absolute top-0 right-0 bottom-16 md:bottom-0 w-full md:w-80 glass border-l border-hairline p-4 overflow-y-auto z-[50]">
          <div className="flex items-center justify-between">
            <span className="wordmark text-[10px]">Hotspot Detail</span>
            <button onClick={() => setDrawer(null)} className="text-text-muted hover:text-text-primary border-none bg-transparent cursor-pointer">
              <X size={15} />
            </button>
          </div>
          <h2 className="text-lg font-medium mt-3 flex items-center gap-2">
            <Beacon severity={drawer.severity} /> {drawer.name}
          </h2>
          <p className="text-xs text-text-muted">{drawer.corridor}</p>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <Stat label="Risk Score" value={`${drawer.riskScore}%`} crit={drawer.severity === "critical"} />
            <Stat label="Confidence" value={`${drawer.confidence}%`} />
            <Stat label="Delay Est." value={`${drawer.delayEstimate}m`} />
            <Stat label="Delay Saved" value={`${drawer.delayDelta}m`} />
            <Stat label="Violations" value={drawer.violationVolume} />
            <Stat label="Logistics Impact" value={drawer.logisticsImpact} />
          </div>
          <div className="mt-4 border border-hairline p-3">
            <div className="eyebrow mb-1">Recommended Action</div>
            <div className="text-xs">
              Deploy <span className="readout">{drawer.officers}</span> officers · {drawer.timeWindow}
            </div>
          </div>
          <button
            onClick={() => navigate({ to: "/optimizer" })}
            className="mt-3 w-full bg-signal text-primary-foreground py-2 text-[11px] uppercase tracking-wider border-none cursor-pointer hover:opacity-90"
          >
            Send to Optimizer
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, crit }: { label: string; value: string | number; crit?: boolean }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="readout text-xl" style={{ color: crit ? "var(--critical)" : undefined }}>
        {value}
      </div>
    </div>
  );
}
