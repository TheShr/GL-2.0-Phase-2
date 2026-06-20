import { useEffect, useRef, useState } from "react";
import type L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTelemetry } from "@/lib/telemetry-context";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useApp } from "@/lib/app-context";

export type HeatmapLayer = "risk" | "violations" | "congestion" | "dispatch" | "logistics";

export function MissionMap({
  compact = false,
  focus,
  onSelect,
  heatmapCase,
  setHeatmapCase,
  expanded,
}: {
  compact?: boolean;
  focus?: string | null;
  onSelect?: (h: any) => void;
  heatmapCase: HeatmapLayer;
  setHeatmapCase: (val: HeatmapLayer) => void;
  expanded?: boolean;
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const { rawHotspots, routes } = useTelemetry();
  const heatmapLayersRef = useRef<L.LayerGroup | null>(null);
  const kdeOverlayRef = useRef<L.ImageOverlay | null>(null);
  const [leafletInstance, setLeafletInstance] = useState<typeof L | null>(null);
  const { theme } = useTheme();
  const { timeLapseHour } = useApp();

  // Overlay render configuration states
  const [showKde, setShowKde] = useState(true);
  const [showIncidentPoints, setShowIncidentPoints] = useState(false);
  const [showClusterBoundaries, setShowClusterBoundaries] = useState(false);
  const [showPredicted, setShowPredicted] = useState(false);
  const [showPatrolRoutes, setShowPatrolRoutes] = useState(false);
  const [mapZoom, setMapZoom] = useState(11);
  const [redrawTrigger, setRedrawTrigger] = useState(0);

  // Dynamically load Leaflet on client side
  useEffect(() => {
    if (typeof window === "undefined") return;
    import("leaflet").then((mod) => {
      setLeafletInstance(mod.default);
    });
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!leafletInstance || typeof window === "undefined" || !mapContainerRef.current || mapRef.current) return;

    try {
      const map = leafletInstance.map(mapContainerRef.current, {
        center: [12.9716, 77.5946],
        zoom: 11,
        zoomControl: false,
        attributionControl: false,
      });

      const initialUrl = theme === "dark"
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

      const tileLayer = leafletInstance.tileLayer(initialUrl, {
        maxZoom: 19,
        minZoom: 10,
      }).addTo(map);

      tileLayerRef.current = tileLayer;
      mapRef.current = map;

      // Event listeners for tracking zoom and trigger redraw of the canvas KDE
      const handleZoom = () => {
        setMapZoom(map.getZoom());
      };
      const triggerRedraw = () => {
        setRedrawTrigger((t) => t + 1);
      };

      map.on("zoomend", handleZoom);
      map.on("moveend", triggerRedraw);
      map.on("zoomend", triggerRedraw);
      map.on("resize", triggerRedraw);

      // Set initial zoom level
      setMapZoom(map.getZoom());
    } catch (e) {
      console.error("MapDock Leaflet initialization failed:", e);
    }

    return () => {
      if (mapRef.current) {
        if (kdeOverlayRef.current) {
          try {
            kdeOverlayRef.current.remove();
          } catch (err) {}
          kdeOverlayRef.current = null;
        }
        mapRef.current.remove();
        mapRef.current = null;
        tileLayerRef.current = null;
      }
    };
  }, [leafletInstance]);

  // Sync map tile layer theme dynamically
  useEffect(() => {
    const tileLayer = tileLayerRef.current;
    if (!tileLayer) return;

    const url = theme === "dark"
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

    tileLayer.setUrl(url);
  }, [theme]);

  // Handle Map Resizing on Expansion Transitions
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Invalidate size immediately and after transition finishes
    map.invalidateSize();
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 320);

    return () => clearTimeout(timer);
  }, [expanded]);

const colorRamps = {
  risk: {
    0.0: "rgba(37, 99, 235, 0)",       // blue (opacity 0)
    0.2: "rgba(37, 99, 235, 0.4)",     // blue
    0.4: "rgba(16, 185, 129, 0.6)",    // green
    0.6: "rgba(234, 179, 8, 0.75)",    // yellow
    0.8: "rgba(249, 115, 22, 0.85)",   // orange
    1.0: "rgba(220, 38, 38, 0.95)",    // red
  },
  violations: {
    0.0: "rgba(220, 38, 38, 0)",
    0.3: "rgba(239, 68, 68, 0.4)",
    0.7: "rgba(220, 38, 38, 0.75)",
    1.0: "rgba(153, 27, 27, 0.95)",
  },
  congestion: {
    0.0: "rgba(249, 115, 22, 0)",
    0.3: "rgba(245, 158, 11, 0.4)",
    0.7: "rgba(249, 115, 22, 0.75)",
    1.0: "rgba(234, 88, 12, 0.95)",
  },
  dispatch: {
    0.0: "rgba(168, 85, 247, 0)",
    0.3: "rgba(192, 132, 252, 0.4)",
    0.7: "rgba(168, 85, 247, 0.75)",
    1.0: "rgba(109, 40, 217, 0.95)",
  },
  logistics: {
    0.0: "rgba(59, 130, 246, 0)",
    0.3: "rgba(6, 182, 212, 0.4)",
    0.7: "rgba(59, 130, 246, 0.75)",
    1.0: "rgba(29, 78, 216, 0.95)",
  },
};

  // Center/Pan on focus change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    if (focus.includes(",")) {
      const [latStr, lonStr] = focus.split(",");
      const lat = parseFloat(latStr);
      const lon = parseFloat(lonStr);
      if (!isNaN(lat) && !isNaN(lon)) {
        map.setView([lat, lon], 14, { animate: true });
      }
    } else {
      const target = rawHotspots.find((h) => String(h.cluster_id) === focus);
      if (target && target.lat != null && target.lon != null) {
        map.setView([target.lat, target.lon], 13.5, { animate: true });
      }
    }
  }, [focus, rawHotspots]);

  // Update Heatmap Overlays
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !leafletInstance) return;

    if (!heatmapLayersRef.current) {
      heatmapLayersRef.current = leafletInstance.layerGroup().addTo(map);
    }
    const layerGroup = heatmapLayersRef.current;
    layerGroup.clearLayers();

    // Calculate dynamic temporal curve scaling factors
    let multiplier = 1.0;
    if (timeLapseHour != null) {
      const morning = Math.exp(-((timeLapseHour - 9) ** 2) / 6) * 40;
      const evening = Math.exp(-((timeLapseHour - 18.5) ** 2) / 7) * 46;
      const base = 20 + morning + evening + (((timeLapseHour * 2) % 5) - 2);
      multiplier = base / 60;
    }

    // 1. RENDER KERNEL DENSITY HEATMAP (KDE)
    if (!showKde) {
      if (kdeOverlayRef.current) {
        try {
          kdeOverlayRef.current.remove();
        } catch (e) {}
        kdeOverlayRef.current = null;
      }
    } else {
      const size = map.getSize();
      const width = size.x;
      const height = size.y;

      if (width > 0 && height > 0) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        const shadowCanvas = document.createElement("canvas");
        shadowCanvas.width = width;
        shadowCanvas.height = height;
        const shadowCtx = shadowCanvas.getContext("2d");

        if (ctx && shadowCtx) {
          // Bandwidth (radius) depending on layer
          let radius = 50;
          if (heatmapCase === "violations") radius = 25;
          else if (heatmapCase === "congestion") radius = 45;
          else if (heatmapCase === "dispatch") radius = 60;
          else if (heatmapCase === "logistics") radius = 90;
          else if (heatmapCase === "risk") radius = 50;

          // Draw each point on the shadow canvas
          rawHotspots.forEach((h) => {
            if (h.lat == null || h.lon == null || isNaN(h.lat) || isNaN(h.lon)) return;

            let lat = h.lat;
            let lon = h.lon;
            let intensityMultiplier = 1.0;

            // Simulated Predicted Next Hour (shift northeast + boost intensity)
            if (showPredicted) {
              lat += 0.0015;
              lon += 0.0015;
              intensityMultiplier = 1.25;
            }

            const point = map.latLngToContainerPoint([lat, lon]);

            let baseIntensity = 0;
            if (heatmapCase === "risk") {
              baseIntensity = h.predicted_risk_index || 0;
            } else if (heatmapCase === "violations") {
              baseIntensity = Math.min(1.0, (h.total_violations || 0) / 500);
            } else if (heatmapCase === "congestion") {
              baseIntensity = h.capacity_reduction_rcf || 0;
            } else if (heatmapCase === "logistics") {
              baseIntensity = h.logistics_penalty_index || 0;
            } else if (heatmapCase === "dispatch") {
              baseIntensity = Math.min(
                1.0,
                (h.predicted_risk_index || 0) * 0.7 + ((h.total_violations || 0) / 500) * 0.3
              );
            }

            const intensity = Math.min(1.0, baseIntensity * multiplier * intensityMultiplier);
            if (intensity <= 0.01) return;

            // Draw radial gradient representing Gaussian kernel
            const grad = shadowCtx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
            grad.addColorStop(0, `rgba(0, 0, 0, ${intensity})`);
            grad.addColorStop(0.2, `rgba(0, 0, 0, ${intensity * 0.8})`);
            grad.addColorStop(0.5, `rgba(0, 0, 0, ${intensity * 0.4})`);
            grad.addColorStop(0.8, `rgba(0, 0, 0, ${intensity * 0.1})`);
            grad.addColorStop(1, "rgba(0, 0, 0, 0)");

            shadowCtx.fillStyle = grad;
            shadowCtx.beginPath();
            shadowCtx.arc(point.x, point.y, radius, 0, Math.PI * 2);
            shadowCtx.fill();
          });

          // Create palette image for colorizing pixels
          const paletteCanvas = document.createElement("canvas");
          paletteCanvas.width = 256;
          paletteCanvas.height = 1;
          const paletteCtx = paletteCanvas.getContext("2d");
          if (paletteCtx) {
            const grad = paletteCtx.createLinearGradient(0, 0, 256, 0);
            const ramp = colorRamps[heatmapCase];
            Object.entries(ramp).forEach(([stop, color]) => {
              grad.addColorStop(parseFloat(stop), color);
            });
            paletteCtx.fillStyle = grad;
            paletteCtx.fillRect(0, 0, 256, 1);

            const palette = paletteCtx.getImageData(0, 0, 256, 1).data;
            const shadowData = shadowCtx.getImageData(0, 0, width, height);
            const pixels = shadowData.data;

            // Keep streets legible underneath
            const opacityFactor = 0.65;

            for (let i = 0; i < pixels.length; i += 4) {
              const alpha = pixels[i + 3];
              if (alpha > 0) {
                const colorIdx = alpha * 4;
                pixels[i] = palette[colorIdx];
                pixels[i + 1] = palette[colorIdx + 1];
                pixels[i + 2] = palette[colorIdx + 2];
                pixels[i + 3] = Math.round(palette[colorIdx + 3] * opacityFactor);
              }
            }
            ctx.putImageData(shadowData, 0, 0);

            const dataUrl = canvas.toDataURL();
            const bounds = map.getBounds();

            if (kdeOverlayRef.current) {
              kdeOverlayRef.current.setUrl(dataUrl);
              kdeOverlayRef.current.setBounds(bounds);
            } else {
              kdeOverlayRef.current = leafletInstance.imageOverlay(dataUrl, bounds, {
                opacity: 1.0,
                interactive: false,
                zIndex: 350,
              }).addTo(map);
            }
          }
        }
      }
    }

    // 2. RENDER POINT MARKERS AND CLUSTER BOUNDARIES
    const shouldShowPoints = showIncidentPoints || mapZoom >= 13.5;

    rawHotspots.forEach((h) => {
      if (h.lat == null || h.lon == null || isNaN(h.lat) || isNaN(h.lon)) return;

      let lat = h.lat;
      let lon = h.lon;
      let intensityMultiplier = 1.0;

      if (showPredicted) {
        lat += 0.0015;
        lon += 0.0015;
        intensityMultiplier = 1.25;
      }

      let baseIntensity = 0;
      if (heatmapCase === "risk") {
        baseIntensity = Math.round((h.predicted_risk_index || 0) * 100);
      } else if (heatmapCase === "violations") {
        baseIntensity = Math.min(100, Math.round(((h.total_violations || 0) / 500) * 100));
      } else if (heatmapCase === "congestion") {
        baseIntensity = Math.round((h.capacity_reduction_rcf || 0) * 100);
      } else if (heatmapCase === "logistics") {
        baseIntensity = Math.round((h.logistics_penalty_index || 0) * 100);
      } else if (heatmapCase === "dispatch") {
        baseIntensity = Math.round(
          Math.min(1.0, (h.predicted_risk_index || 0) * 0.7 + ((h.total_violations || 0) / 500) * 0.3) * 100
        );
      }

      const intensity = Math.min(100, Math.max(5, Math.round(baseIntensity * multiplier * intensityMultiplier)));

      let color = "#10B981"; // nominal
      if (heatmapCase === "risk") {
        if (intensity >= 80) color = "#DC2626"; // critical (Red)
        else if (intensity >= 60) color = "#F97316"; // high (Orange)
        else if (intensity >= 40) color = "#EAB308"; // moderate (Yellow)
        else if (intensity >= 20) color = "#10B981"; // low (Green)
        else color = "#2563EB"; // minimal (Blue)
      } else {
        if (heatmapCase === "violations") color = "#DC2626";
        else if (heatmapCase === "congestion") color = "#F97316";
        else if (heatmapCase === "dispatch") color = "#A855F7";
        else if (heatmapCase === "logistics") color = "#3B82F6";
      }

      // Draw Cluster Boundaries (connecting upstream edges) only if showClusterBoundaries is true
      if (showClusterBoundaries && h.upstream_edges && Array.isArray(h.upstream_edges)) {
        h.upstream_edges.forEach((edge: any) => {
          if (Array.isArray(edge) && edge.length >= 2) {
            const polylinePoints = edge.map((pt: any) => {
              let ptLat = pt.lat;
              let ptLng = pt.lng;
              if (showPredicted) {
                ptLat += 0.0015;
                ptLng += 0.0015;
              }
              return [ptLat, ptLng];
            });
            leafletInstance.polyline(polylinePoints, {
              color: color,
              weight: 2 + (intensity * 0.08),
              opacity: 0.7,
            }).addTo(layerGroup);
          }
        });
      }

      // Draw Incident Point Marker if Zoomed In or Explicitly Toggled
      if (shouldShowPoints) {
        const marker = leafletInstance.circleMarker([lat, lon], {
          radius: 7,
          color: "#ffffff",
          weight: 1.5,
          fillColor: color,
          fillOpacity: 0.9,
        });

        const label = heatmapCase === "risk" ? "Risk" : heatmapCase.charAt(0).toUpperCase() + heatmapCase.slice(1);
        const timeStr = timeLapseHour != null ? `${String(timeLapseHour).padStart(2, "0")}:00` : "LIVE";
        const officersCount = Math.round(intensity * 0.25) || 1;

        const valStr = heatmapCase === "violations"
          ? `${Math.round((h.total_violations || 100) * multiplier)} violations`
          : heatmapCase === "congestion"
            ? `~${intensity}% capacity reduction`
            : `${intensity}%`;

        marker.bindTooltip(`
          <div style="font-family: 'Inter', sans-serif; font-size: 10px; color: #fff; padding: 2px 4px;">
            <strong style="text-transform: uppercase;">${h.police_station} Junction</strong><br/>
            <span style="opacity: 0.85;">Time: <strong>${timeStr}</strong></span><br/>
            <span style="opacity: 0.85;">${label}: <strong>${valStr}</strong></span><br/>
            <span style="opacity: 0.85;">Deploy Unit: <strong>Officer #${officersCount}</strong></span>
          </div>
        `, {
          direction: "top",
          className: "bg-slate-950 border border-slate-800 rounded p-1 shadow-md text-white text-[10px] opacity-95",
          opacity: 0.95,
        });

        marker.on("click", () => {
          if (onSelect) {
            onSelect(h);
          }
        });

        marker.addTo(layerGroup);
      }
    });

    // 3. RENDER PATROL ROUTES
    if (showPatrolRoutes && routes && routes.length > 0) {
      routes.forEach((route: any) => {
        if (route.coords && Array.isArray(route.coords)) {
          const latLngs = route.coords.map((c: any) => [c.lat, c.lng]);
          const polyline = leafletInstance.polyline(latLngs, {
            color: route.color || "#3b82f6",
            weight: 3.5,
            opacity: 0.85,
            dashArray: "6, 8",
            lineCap: "round",
            lineJoin: "round",
          }).addTo(layerGroup);

          polyline.bindTooltip(route.name, {
            sticky: true,
            className: "bg-slate-900 border border-slate-700 text-white text-[8px] rounded px-1"
          });
        }
      });
    }
  }, [
    rawHotspots,
    routes,
    heatmapCase,
    onSelect,
    leafletInstance,
    timeLapseHour,
    showKde,
    showIncidentPoints,
    showClusterBoundaries,
    showPredicted,
    showPatrolRoutes,
    mapZoom,
    redrawTrigger,
  ]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950">
      {/* Target Mount for Leaflet Map */}
      <div ref={mapContainerRef} className="h-full w-full" />

      {/* Floating Heatmap Case Selector Overlay */}
      <div className="absolute top-2 left-2 z-[1000] flex gap-1 bg-slate-950/80 backdrop-blur-md p-1 border border-slate-800 rounded">
        {(["risk", "violations", "congestion", "dispatch", "logistics"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setHeatmapCase(mode)}
            className={cn(
              "px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider rounded transition-colors cursor-pointer border-none",
              heatmapCase === mode
                ? "bg-signal text-white"
                : "text-slate-400 bg-transparent hover:text-white"
            )}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Floating Layers & Rendering Config Overlay */}
      <div className="absolute top-2 right-2 z-[1000] bg-slate-950/85 backdrop-blur-md p-2 border border-slate-800 rounded flex flex-col gap-1.5 min-w-[140px] shadow-lg text-[9px] text-white">
        <div className="font-semibold text-[8px] uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1 mb-1">
          Render Options
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showKde}
            onChange={(e) => setShowKde(e.target.checked)}
            className="accent-signal cursor-pointer"
          />
          <span>Kernel Density (KDE)</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showIncidentPoints}
            onChange={(e) => setShowIncidentPoints(e.target.checked)}
            className="accent-signal cursor-pointer"
          />
          <span>Incident Points</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showClusterBoundaries}
            onChange={(e) => setShowClusterBoundaries(e.target.checked)}
            className="accent-signal cursor-pointer"
          />
          <span>Cluster Boundaries</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showPredicted}
            onChange={(e) => setShowPredicted(e.target.checked)}
            className="accent-signal cursor-pointer"
          />
          <span>Predicted Next Hour</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showPatrolRoutes}
            onChange={(e) => setShowPatrolRoutes(e.target.checked)}
            className="accent-signal cursor-pointer"
          />
          <span>Patrol Routes</span>
        </label>
      </div>

      {compact && (
        <div className="absolute bottom-1 left-2 eyebrow opacity-70 z-[1000] pointer-events-none text-slate-400">
          {timeLapseHour != null ? `Time-Lapse: ${String(timeLapseHour).padStart(2, "0")}:00 Map` : "Live Map Dock"}
        </div>
      )}
    </div>
  );
}

export function MapLegend({
  className,
  heatmapCase,
}: {
  className?: string;
  heatmapCase: HeatmapLayer;
}) {
  if (heatmapCase === "risk") {
    return (
      <div className={cn("flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-text-muted", className)}>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: "#DC2626" }} />
          Critical Risk (0.8-1.0)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: "#F97316" }} />
          High Risk (0.6-0.8)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: "#EAB308" }} />
          Moderate Risk (0.4-0.6)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: "#10B981" }} />
          Low Risk (0.2-0.4)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: "#2563EB" }} />
          Minimal Risk (0.0-0.2)
        </span>
      </div>
    );
  }

  const colorMap = {
    violations: { label: "Parking Violations", colors: ["#991B1B", "#DC2626", "#EF4444"] },
    congestion: { label: "Traffic Congestion", colors: ["#EA580C", "#F97316", "#F59E0B"] },
    dispatch: { label: "Dispatch Demand", colors: ["#7E22CE", "#A855F7", "#C084FC"] },
    logistics: { label: "Logistics Priority", colors: ["#1D4ED8", "#3B82F6", "#06B6D4"] },
  };

  const current = colorMap[heatmapCase as keyof typeof colorMap] || colorMap.violations;

  return (
    <div className={cn("flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-text-muted", className)}>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: current.colors[0] }} />
        Critical {current.label}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: current.colors[1] }} />
        Moderate {current.label}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: current.colors[2] }} />
        Minimal {current.label}
      </span>
    </div>
  );
}
