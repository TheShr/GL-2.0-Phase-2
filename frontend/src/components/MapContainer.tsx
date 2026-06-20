"use client";

import { useEffect, useRef, useState } from "react";
import type L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTheme } from "@/lib/theme";

// Declare window types for Mappls
declare global {
  interface Window {
    Mappls: any;
    mappls: any;
  }
}

interface Hotspot {
  rank: number;
  cluster_id: number;
  police_station: string;
  road_class: string;
  lanes: number;
  lat: number;
  lon: number;
  predicted_risk_index: number;
  capacity_reduction_rcf: number;
  travel_time_before: string;
  travel_time_after: string;
  delay_savings_per_vehicle: string;
  total_commuter_time_saved_hours: number;
  priority_score: number;
  target_shift: string;
  enforcement_action: string;
  logistics_weight: number;
  logistics_penalty_index: number;
  nearest_landmark?: string;
  directed_side?: string;
  upstream_edges?: { lat: number; lng: number }[][];
}

interface RouteData {
  name: string;
  coords: { lat: number; lng: number }[];
  color: string;
}

interface MapContainerProps {
  hotspots: Hotspot[];
  selectedId: number | null;
  onSelectHotspot: (hotspot: Hotspot) => void;
  routes?: RouteData[];
  visibleLayers?: Record<string, boolean>;
}

function getTierStyle(score: number) {
  if (score >= 15.0) return {
    color: "#DC2626",
    fillColor: "#DC2626",
    pulseClass: "pulse-ring-alert",
    labelColor: "#DC2626",
  };
  if (score >= 3.0) return {
    color: "#D97706",
    fillColor: "#D97706",
    pulseClass: "pulse-ring-warning",
    labelColor: "#D97706",
  };
  return {
    color: "#0077CC",
    fillColor: "#0077CC",
    pulseClass: "pulse-ring-cyan",
    labelColor: "#0077CC",
  };
}

function cleanLandmark(landmark: string | undefined, roadClass: string) {
  if (!landmark) return `Near ${roadClass}`;
  let clean = landmark.split(/Bengaluru/i)[0].trim();
  if (clean.endsWith(",")) {
    clean = clean.substring(0, clean.length - 1).trim();
  }
  return clean ? `Near ${clean}` : `Near ${roadClass}`;
}

function getHotspotCircleCenter(h: Hotspot) {
  return { lat: h.lat, lng: h.lon };
}

export default function MapContainer({ hotspots, selectedId, onSelectHotspot, routes, visibleLayers }: MapContainerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const onSelectHotspotRef = useRef(onSelectHotspot);

  useEffect(() => {
    onSelectHotspotRef.current = onSelectHotspot;
  }, [onSelectHotspot]);

  const [mapInstance, setMapInstance] = useState<any>(null);
  const leafletLayersRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const leafletRoutesRef = useRef<L.Polyline[]>([]);
  const mapplsRoutesRef = useRef<any[]>([]);
  const [leafletInstance, setLeafletInstance] = useState<typeof L | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (typeof window === "undefined") return;
    import("leaflet").then((mod) => {
      setLeafletInstance(mod.default);
    });
  }, []);
  const markersRef = useRef<any[]>([]);
  const circlesRef = useRef<any[]>([]);
  const polylinesRef = useRef<any[]>([]);
  const infoWindowsRef = useRef<any[]>([]);
  const infoWindowsMapRef = useRef<Map<number, any>>(new Map());
  const leafletMarkersMapRef = useRef<Map<number, L.Marker>>(new Map());

  const upstreamPolylinesRef = useRef<any[]>([]);
  const leafletUpstreamPolylinesRef = useRef<L.Polyline[]>([]);

  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [fallbackToLeaflet, setFallbackToLeaflet] = useState(false);
  const [judgeMode, setJudgeMode] = useState(false);

  const [trafficEnabled, setTrafficEnabled] = useState(false);
  const [trafficFreeFlowEnabled, setTrafficFreeFlowEnabled] = useState(true);
  const [trafficNonFreeFlowEnabled, setTrafficNonFreeFlowEnabled] = useState(true);
  const [trafficClosureEnabled, setTrafficClosureEnabled] = useState(true);
  const [trafficStopIconEnabled, setTrafficStopIconEnabled] = useState(true);

  const showRoutes = visibleLayers?.routes ?? true;
  const activeRoutes = showRoutes ? (routes || []).map(route => {
    const cleanCoords = route.coords.filter(
      c => c && c.lat != null && c.lng != null && !isNaN(c.lat) && !isNaN(c.lng)
    );
    return { ...route, coords: cleanCoords };
  }).filter(route => route.coords.length >= 2) : [];

  const [selectedRouteName, setSelectedRouteName] = useState<string | null>(null);
  const directionPluginRef = useRef<any>(null);

  const drawMapplsUpstreamTrail = (map: any, h: Hotspot) => {
    upstreamPolylinesRef.current.forEach(p => { if (p.remove) p.remove(); });
    upstreamPolylinesRef.current = [];
  };

  const drawLeafletUpstreamTrail = (map: L.Map, h: Hotspot) => {
    leafletUpstreamPolylinesRef.current.forEach(p => p.remove());
    leafletUpstreamPolylinesRef.current = [];
  };

  useEffect(() => {
    const handleJudgeModeChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      setJudgeMode(customEvent.detail.judgeMode);
    };
    const handleSelectRoute = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.routeName !== undefined) {
        setSelectedRouteName(customEvent.detail.routeName);
      }
    };
    window.addEventListener("judge-mode-change", handleJudgeModeChange as EventListener);
    window.addEventListener("select-route", handleSelectRoute as EventListener);
    return () => {
      window.removeEventListener("judge-mode-change", handleJudgeModeChange as EventListener);
      window.removeEventListener("select-route", handleSelectRoute as EventListener);
    };
  }, []);

  useEffect(() => {
    if (selectedId !== null) {
      setSelectedRouteName(null);
    }
  }, [selectedId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const webScriptId = "mappls-web-maps-sdk";
    const pluginsScriptId = "mappls-web-plugins-sdk";
    const accessToken = (import.meta.env?.VITE_MAPPLS_TOKEN) || (process.env.NEXT_PUBLIC_MAPPLS_TOKEN) || "rysmqsqzhyrdjzzdhxthpgdljebmkdipyjmb";

    const timeoutTimer = setTimeout(() => {
      const Mappls = (window as any).Mappls || (window as any).mappls;
      if (!Mappls && !fallbackToLeaflet) {
        console.warn("[Mappls SDK] Script loading timed out. Switching to Leaflet fallback.");
        setFallbackToLeaflet(true);
      }
    }, 7000);

    const loadPluginsScript = () => {
      const existingPluginsScript = document.getElementById(pluginsScriptId);
      if (existingPluginsScript) {
        const Mappls = (window as any).Mappls || (window as any).mappls;
        if (Mappls && typeof Mappls.direction === "function") {
          setSdkLoaded(true);
          clearTimeout(timeoutTimer);
        } else {
          existingPluginsScript.addEventListener("load", () => {
            setSdkLoaded(true);
            clearTimeout(timeoutTimer);
          });
        }
        return;
      }

      const pluginsScript = document.createElement("script");
      pluginsScript.id = pluginsScriptId;
      pluginsScript.src = `https://sdk.mappls.com/map/sdk/plugins?access_token=${accessToken}&v=3.0`;
      pluginsScript.async = true;
      pluginsScript.defer = true;
      pluginsScript.onload = () => {
        setSdkLoaded(true);
        clearTimeout(timeoutTimer);
      };
      pluginsScript.onerror = () => {
        console.error("[Mappls SDK] Plugins SDK failed to load.");
        setFallbackToLeaflet(true);
        clearTimeout(timeoutTimer);
      };
      document.head.appendChild(pluginsScript);
    };

    const existingWebScript = document.getElementById(webScriptId);
    if (existingWebScript) {
      const Mappls = (window as any).Mappls || (window as any).mappls;
      if (Mappls) {
        loadPluginsScript();
      } else {
        existingWebScript.addEventListener("load", loadPluginsScript);
        existingWebScript.addEventListener("error", () => {
          setFallbackToLeaflet(true);
          clearTimeout(timeoutTimer);
        });
      }
    } else {
      const webScript = document.createElement("script");
      webScript.id = webScriptId;
      webScript.src = `https://sdk.mappls.com/map/sdk/web?v=3.0&access_token=${accessToken}`;
      webScript.async = true;
      webScript.defer = true;
      webScript.onload = loadPluginsScript;
      webScript.onerror = () => {
        console.error("[Mappls SDK] Web SDK failed to load.");
        setFallbackToLeaflet(true);
        clearTimeout(timeoutTimer);
      };
      document.head.appendChild(webScript);
    }

    return () => {
      clearTimeout(timeoutTimer);
    };
  }, [fallbackToLeaflet]);

  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current || mapRef.current) return;

    if (fallbackToLeaflet) {
      if (!leafletInstance) return;
      console.log("[MapContainer] Initializing Leaflet map as backup mapping...");
      try {
        const map = leafletInstance.map(mapContainerRef.current, {
          center: [12.9716, 77.5946],
          zoom: 12,
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

        leafletInstance.control.zoom({ position: "bottomright" }).addTo(map);

        mapRef.current = map;
        setMapInstance(map);
        leafletLayersRef.current = leafletInstance.layerGroup().addTo(map);
      } catch (err) {
        console.error("[MapContainer] Leaflet fallback failed to initialize:", err);
      }

      return () => {
        if (mapRef.current) {
          try {
            mapRef.current.remove();
          } catch (e) { }
          mapRef.current = null;
          setMapInstance(null);
          leafletLayersRef.current = null;
          tileLayerRef.current = null;
        }
      };
    }

    if (sdkLoaded) {
      try {
        const Mappls = (window as any).Mappls || (window as any).mappls;
        if (!Mappls || !Mappls.Map) {
          throw new Error("Mappls.Map constructor namespace not fully loaded.");
        }

        const map = new Mappls.Map("mappls-core-grid", {
          center: { lat: 12.9716, lng: 77.5946 },
          zoom: 12,
          zoomControl: false
        });

        map.addListener("load", () => {
          try {
            const styles = Mappls.getStyles ? Mappls.getStyles() : [];
            const darkStyle = styles.find((s: any) =>
              s.name.includes("dark") ||
              s.name.includes("night") ||
              s.name.includes("black") ||
              s.name.includes("grey")
            );
            if (darkStyle) {
              Mappls.setStyle(darkStyle.name);
            } else {
              Mappls.setStyle("dark");
            }
          } catch (e) {
            console.warn("[Mappls SDK] Failed to set theme style:", e);
          }
        });

        mapRef.current = map;
        setMapInstance(map);
      } catch (err) {
        console.error("[Mappls SDK] Map initialization error, forcing Leaflet fallback: ", err);
        setFallbackToLeaflet(true);
      }
    }
  }, [sdkLoaded, fallbackToLeaflet, leafletInstance]);

  // Sync Leaflet fallback tile theme dynamically
  useEffect(() => {
    if (fallbackToLeaflet && tileLayerRef.current) {
      const url = theme === "dark"
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
      tileLayerRef.current.setUrl(url);
    }
  }, [theme, fallbackToLeaflet]);

  // Sync Mappls SDK map style theme dynamically
  useEffect(() => {
    if (mapInstance && !fallbackToLeaflet && sdkLoaded) {
      try {
        const Mappls = (window as any).Mappls || (window as any).mappls;
        if (Mappls && typeof Mappls.getStyles === "function") {
          const styles = Mappls.getStyles();
          if (theme === "dark") {
            const darkStyle = styles.find((s: any) =>
              s.name.includes("dark") || s.name.includes("night") || s.name.includes("black") || s.name.includes("grey")
            );
            Mappls.setStyle(darkStyle ? darkStyle.name : "dark");
          } else {
            const lightStyle = styles.find((s: any) =>
              s.name.includes("light") || s.name.includes("day") || s.name.includes("default")
            );
            Mappls.setStyle(lightStyle ? lightStyle.name : "default");
          }
        }
      } catch (err) {
        console.warn("[Mappls SDK] Theme style switch failed: ", err);
      }
    }
  }, [theme, mapInstance, sdkLoaded, fallbackToLeaflet]);

  // Sync Leaflet fallback routes geometry via OSRM
  useEffect(() => {
    const map = mapRef.current;
    if (!fallbackToLeaflet || !leafletInstance || !map) return;

    const LInstance = leafletInstance;

    // Clear old polylines
    leafletRoutesRef.current.forEach((p) => p.remove());
    leafletRoutesRef.current = [];

    if (!showRoutes || activeRoutes.length === 0) return;

    activeRoutes.forEach(async (route) => {
      try {
        const coordsStr = route.coords.map(c => `${c.lng},${c.lat}`).join(";");
        const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`OSRM status ${res.status}`);
        const json = await res.json();

        const coords = json.routes?.[0]?.geometry?.coordinates;
        if (coords && Array.isArray(coords)) {
          const latLngs = coords.map((pt: [number, number]) => [pt[1], pt[0]] as [number, number]);
          const polyline = LInstance.polyline(latLngs, {
            color: route.color || "#3b82f6",
            weight: 4,
            opacity: 0.8,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(map);

          leafletRoutesRef.current.push(polyline);
        }
      } catch (err) {
        console.error(`[MapContainer] Failed OSRM route fetch for ${route.name}:`, err);
        // Fallback to straight line segments
        const latLngs = route.coords.map(c => [c.lat, c.lng] as [number, number]);
        const polyline = LInstance.polyline(latLngs, {
          color: route.color || "#3b82f6",
          weight: 3,
          opacity: 0.5,
          dashArray: "5, 8",
        }).addTo(map);

        leafletRoutesRef.current.push(polyline);
      }
    });

    return () => {
      leafletRoutesRef.current.forEach((p) => p.remove());
      leafletRoutesRef.current = [];
    };
  }, [activeRoutes, showRoutes, fallbackToLeaflet, leafletInstance]);

  // Sync Mappls SDK routes geometry via OSRM
  useEffect(() => {
    const map = mapRef.current;
    if (fallbackToLeaflet || !sdkLoaded || !map) return;

    const Mappls = (window as any).Mappls || (window as any).mappls;
    if (!Mappls) return;

    const PolylineConstructor = Mappls.polyline || Mappls.Polyline;
    if (!PolylineConstructor) return;

    // Clear old polylines
    mapplsRoutesRef.current.forEach((p) => {
      try {
        if (p.remove) p.remove();
        else Mappls.remove({ map, layer: p });
      } catch (err) {
        console.error("[MapContainer] Failed to remove Mappls route polyline:", err);
      }
    });
    mapplsRoutesRef.current = [];

    if (!showRoutes || activeRoutes.length === 0) return;

    activeRoutes.forEach(async (route) => {
      try {
        const coordsStr = route.coords.map(c => `${c.lng},${c.lat}`).join(";");
        const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`OSRM status ${res.status}`);
        const json = await res.json();

        const coords = json.routes?.[0]?.geometry?.coordinates;
        if (coords && Array.isArray(coords)) {
          const pathCoords = coords.map((pt: [number, number]) => ({ lat: pt[1], lng: pt[0] }));
          const polyline = new PolylineConstructor({
            map: map,
            path: pathCoords,
            strokeColor: route.color || "#3b82f6",
            strokeWeight: 4,
            strokeOpacity: 0.8
          });

          mapplsRoutesRef.current.push(polyline);
        }
      } catch (err) {
        console.error(`[MapContainer] Failed Mappls OSRM route fetch for ${route.name}:`, err);
        // Fallback to straight line segments
        const pathCoords = route.coords.map(c => ({ lat: c.lat, lng: c.lng }));
        const polyline = new PolylineConstructor({
          map: map,
          path: pathCoords,
          strokeColor: route.color || "#3b82f6",
          strokeWeight: 3,
          strokeOpacity: 0.5
        });

        mapplsRoutesRef.current.push(polyline);
      }
    });

    return () => {
      mapplsRoutesRef.current.forEach((p) => {
        try {
          if (p.remove) p.remove();
          else Mappls.remove({ map, layer: p });
        } catch (err) { }
      });
      mapplsRoutesRef.current = [];
    };
  }, [activeRoutes, showRoutes, fallbackToLeaflet, sdkLoaded, mapInstance]);

  useEffect(() => {
    if (mapInstance && !fallbackToLeaflet && sdkLoaded) {
      try {
        if (typeof mapInstance.showTraffic === "function") {
          mapInstance.showTraffic(trafficEnabled);
        } else if (typeof mapInstance.enableTraffic === "function") {
          mapInstance.enableTraffic(trafficEnabled);
        }

        if (typeof mapInstance.enableTrafficFreeFlow === "function") {
          mapInstance.enableTrafficFreeFlow(trafficEnabled && trafficFreeFlowEnabled);
        }
        if (typeof mapInstance.enableTrafficNonFreeFlow === "function") {
          mapInstance.enableTrafficNonFreeFlow(trafficEnabled && trafficNonFreeFlowEnabled);
        }
        if (typeof mapInstance.enableTrafficClosure === "function") {
          mapInstance.enableTrafficClosure(trafficEnabled && trafficClosureEnabled);
        }
        if (typeof mapInstance.enableTrafficStopIcon === "function") {
          mapInstance.enableTrafficStopIcon(trafficEnabled && trafficStopIconEnabled);
        }
      } catch (err) {
        console.error("[Mappls SDK] Traffic overlay sync failed: ", err);
      }
    }
  }, [
    sdkLoaded,
    fallbackToLeaflet,
    trafficEnabled,
    trafficFreeFlowEnabled,
    trafficNonFreeFlowEnabled,
    trafficClosureEnabled,
    trafficStopIconEnabled,
    mapInstance
  ]);

  useEffect(() => {
    const map = mapInstance;
    if (!sdkLoaded || !map || fallbackToLeaflet) return;

    if (directionPluginRef.current) {
      try {
        if (typeof directionPluginRef.current.remove === "function") {
          directionPluginRef.current.remove();
        } else if (typeof directionPluginRef.current.clear === "function") {
          directionPluginRef.current.clear();
        }
      } catch (err) {
        console.error("Failed to clean up direction widget:", err);
      }
      directionPluginRef.current = null;
    }

    if (!selectedRouteName) return;

    const selectedRoute = activeRoutes.find(r => {
      if (r.name === selectedRouteName) return true;
      const match1 = r.name.match(/Route\s*(\d+)/i);
      const match2 = selectedRouteName?.match(/Route\s*(\d+)/i);
      if (match1 && match2 && match1[1] === match2[1]) return true;
      return false;
    });
    if (!selectedRoute || selectedRoute.coords.length < 2) return;

    const start = selectedRoute.coords[0];
    const end = selectedRoute.coords[selectedRoute.coords.length - 1];

    if (
      start && end &&
      start.lat != null && start.lng != null &&
      end.lat != null && end.lng != null &&
      !isNaN(start.lat) && !isNaN(start.lng) &&
      !isNaN(end.lat) && !isNaN(end.lng)
    ) {
      try {
        const MapplsLib = (window as any).Mappls || (window as any).mappls;
        if (MapplsLib && typeof MapplsLib.direction === "function") {
          MapplsLib.direction({
            map: map,
            start: `${start.lat},${start.lng}`,
            end: `${end.lat},${end.lng}`,
            search: false,
            fitbounds: false,
            geolocation: false,
            stepPopup: false,
            stepIcon: false,
            iconPopup: false,
            autoSubmit: true,
            alternatives: false,
            profile: "driving",
            callback: (data: any) => {
              directionPluginRef.current = data;
            }
          });
        }
      } catch (err) {
        console.error("Failed to initialize direction widget:", err);
      }
    }
  }, [selectedRouteName, activeRoutes, mapInstance, sdkLoaded, fallbackToLeaflet]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (fallbackToLeaflet) {
      if (!leafletInstance) return;
      const layerGroup = leafletLayersRef.current;
      if (!layerGroup) return;

      layerGroup.clearLayers();
      leafletMarkersMapRef.current.clear();

      hotspots.forEach((h) => {
        if (h.lat == null || h.lon == null || isNaN(h.lat) || isNaN(h.lon)) {
          return;
        }

        const style = getTierStyle(h.priority_score);
        const markerColor = style.color;
        const markerPulse = style.pulseClass;
        const isSelected = h.cluster_id === selectedId;
        const dotSize = isSelected ? 30 : 22;

        const icon = leafletInstance.divIcon({
          className: "",
          html: `
            <div style="display:flex; flex-direction:column; align-items:center; width:${dotSize + 60}px;">
              <div style="position:relative; width:${dotSize}px; height:${dotSize}px;">
                <div class="${markerPulse}" style="position:absolute; inset:0; border-radius:50%;"></div>
                <div style="
                  position:absolute; inset:0; border-radius:50%;
                  background:${markerColor};
                  display:flex; align-items:center; justify-content:center;
                  color:#fff;
                  border:2px solid #ffffff;
                  box-shadow:0 3px 10px rgba(0,0,0,0.22);
                  padding: 4px;
                ">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 100%; height: 100%;">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
              </div>
              <div style="
                margin-top:4px;
                background:rgba(255,255,255,0.85);
                backdrop-filter:blur(12px);
                border:1px solid rgba(255,255,255,0.50);
                border-radius:8px;
                padding:2px 8px;
                font-family:'Inter',sans-serif;
                font-size:7px;
                font-weight:700;
                color:#334155;
                white-space:nowrap;
                max-width:88px;
                overflow:hidden;
                text-overflow:ellipsis;
                box-shadow:0 2px 8px rgba(0,0,0,0.08);
                letter-spacing:0.03em;
                text-transform:uppercase;
              ">${h.police_station}</div>
            </div>
          `,
          iconSize: [dotSize + 60, dotSize + 24],
          iconAnchor: [(dotSize + 60) / 2, dotSize / 2],
        });

        const circleCenter = getHotspotCircleCenter(h);
        const radius = 80 + h.capacity_reduction_rcf * 450;
        const circle = leafletInstance.circle([circleCenter.lat, circleCenter.lng], {
          color: markerColor,
          fillColor: style.fillColor,
          fillOpacity: isSelected ? 0.30 : 0.12,
          weight: isSelected ? 1.5 : 1,
          dashArray: isSelected ? "5, 5" : undefined,
          radius,
        });

        const enforcementStatus = h.priority_score >= 15.0 ? "Tier 1 · Critical Enforcement" : (h.priority_score >= 3.0 ? "Tier 2 · Active Patrol" : "Tier 3 · Monitor Zone");

        const popupHtml = `
          <div class="glass-popup" style="
            font-family:'Inter',sans-serif; padding:12px 14px; min-width:220px; max-width:260px; color:#1E293B;
            background:transparent; border:none; box-shadow:none;
          ">
            <div style="display:inline-block; padding:3.5px 8px; background:#0F172A; color:#F1F5F9; font-size:7px; font-weight:800; text-transform:uppercase; letter-spacing:0.15em; border-radius:9999px; margin-bottom:8px;">
              ${enforcementStatus}
            </div>
            <div style="font-size:12px; font-weight:800; color:#0F172A; margin-bottom:4px; line-height:1.35;">
              ${cleanLandmark(h.nearest_landmark, h.road_class)}
            </div>
            <div style="font-size:8px; color:#64748B; font-weight:600; text-transform:uppercase; margin-bottom:8px;">
              ${h.police_station} Station · ${h.lanes} Lanes
            </div>
            
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:8px;">
              <div style="background:rgba(255,255,255,0.5); border:1px solid rgba(226,232,240,0.8); border-radius:8px; padding:6px; text-align:center;">
                <div style="font-size:7px; color:#94A3B8; font-weight:700; text-transform:uppercase;">PCU Choke</div>
                <div style="font-size:12px; font-weight:800; color:#E53E3E;">~${Math.round(h.capacity_reduction_rcf * 100)}%</div>
              </div>
              <div style="background:rgba(255,255,255,0.5); border:1px solid rgba(226,232,240,0.8); border-radius:8px; padding:6px; text-align:center;">
                <div style="font-size:7px; color:#94A3B8; font-weight:700; text-transform:uppercase;">Risk Score</div>
                <div style="font-size:12px; font-weight:800; color:#D97706;">${(h.predicted_risk_index * 100).toFixed(0)}%</div>
              </div>
            </div>
            <div style="background:rgba(240,253,244,0.85); border:1px solid rgba(5,150,105,0.15); border-radius:8px; padding:6px; font-size:9px; line-height:1.3;">
              <span style="color:#064E3B; font-weight:700;">Action: </span>
              <span style="color:#047857; font-weight:600;">${h.enforcement_action}</span>
            </div>
          </div>
        `;

        const marker = leafletInstance.marker([h.lat, h.lon], { icon });
        leafletMarkersMapRef.current.set(h.cluster_id, marker);

        const handleHotspotClick = (e: any) => {
          leafletInstance.DomEvent.stopPropagation(e);
          onSelectHotspotRef.current(h);
          drawLeafletUpstreamTrail(map, h);
        };

        let closeTimeout: any = null;

        const showInfo = () => {
          if (closeTimeout) {
            clearTimeout(closeTimeout);
            closeTimeout = null;
          }
          marker.openPopup();
        };

        const hideInfo = () => {
          if (closeTimeout) clearTimeout(closeTimeout);
          closeTimeout = setTimeout(() => {
            if (selectedId !== h.cluster_id) {
              marker.closePopup();
            }
          }, 100);
        };

        circle.on("click", handleHotspotClick);
        marker.on("click", handleHotspotClick);
        marker.on("mouseover", showInfo);
        marker.on("mouseout", hideInfo);
        circle.on("mouseover", showInfo);
        circle.on("mouseout", hideInfo);

        marker.bindPopup(popupHtml, {
          closeButton: false,
          maxWidth: 260,
          minWidth: 220,
        });

        const showCircles = (visibleLayers?.hotspots ?? true) || (visibleLayers?.congestion ?? true);
        const showMarkers = (visibleLayers?.hotspots ?? true) || (visibleLayers?.patrols ?? true);

        if (showCircles) {
          circle.addTo(layerGroup);
        }
        if (showMarkers) {
          marker.addTo(layerGroup);
        }
      });
      return;
    }

    if (sdkLoaded) {
      const Mappls = (window as any).Mappls || (window as any).mappls;
      if (!Mappls) return;

      markersRef.current.forEach((m) => { if (m.remove) m.remove(); });
      markersRef.current = [];

      polylinesRef.current.forEach((p) => {
        try {
          if (p.remove) p.remove();
          else Mappls.remove({ map, layer: p });
        } catch (err) { }
      });
      polylinesRef.current = [];

      infoWindowsRef.current.forEach((iw) => { if (iw.close) iw.close(); });
      infoWindowsRef.current = [];
      infoWindowsMapRef.current.clear();

      circlesRef.current.forEach((c) => {
        try {
          if (c.remove) c.remove();
          else Mappls.remove({ map, layer: c });
        } catch (err) { }
      });
      circlesRef.current = [];

      const showCircles = (visibleLayers?.hotspots ?? true) || (visibleLayers?.congestion ?? true);
      const showMarkers = (visibleLayers?.hotspots ?? true) || (visibleLayers?.patrols ?? true);

      if (showCircles || showMarkers) {
        hotspots.forEach((h) => {
          if (h.lat == null || h.lon == null || isNaN(h.lat) || isNaN(h.lon)) {
            return;
          }

          const style = getTierStyle(h.priority_score);
          const markerColor = style.color;
          const markerPulse = style.pulseClass;
          const isSelected = h.cluster_id === selectedId;
          const dotSize = isSelected ? 30 : 22;

          const enforcementStatus = h.priority_score >= 15.0 ? "Tier 1 · Critical Enforcement" : (h.priority_score >= 3.0 ? "Tier 2 · Active Patrol" : "Tier 3 · Monitor Zone");

          const popupHtml = `
            <div class="glass-popup" style="
              font-family:'Inter',sans-serif; padding:12px 14px; min-width:220px; max-width:260px; color:#1E293B;
              background:transparent; border:none; box-shadow:none;
            ">
              <div style="display:inline-block; padding:3.5px 8px; background:#0F172A; color:#F1F5F9; font-size:7px; font-weight:800; text-transform:uppercase; letter-spacing:0.15em; border-radius:9999px; margin-bottom:8px;">
                ${enforcementStatus}
              </div>
              <div style="font-size:12px; font-weight:800; color:#0F172A; margin-bottom:4px; line-height:1.35;">
                ${cleanLandmark(h.nearest_landmark, h.road_class)}
              </div>
              <div style="font-size:8px; color:#64748B; font-weight:600; text-transform:uppercase; margin-bottom:8px;">
                ${h.police_station} Station · ${h.lanes} Lanes
              </div>
              
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:8px;">
                <div style="background:rgba(255,255,255,0.5); border:1px solid rgba(226,232,240,0.8); border-radius:8px; padding:6px; text-align:center;">
                  <div style="font-size:7px; color:#94A3B8; font-weight:700; text-transform:uppercase;">PCU Choke</div>
                  <div style="font-size:12px; font-weight:800; color:#E53E3E;">~${Math.round(h.capacity_reduction_rcf * 100)}%</div>
                </div>
                <div style="background:rgba(255,255,255,0.5); border:1px solid rgba(226,232,240,0.8); border-radius:8px; padding:6px; text-align:center;">
                  <div style="font-size:7px; color:#94A3B8; font-weight:700; text-transform:uppercase;">Risk Score</div>
                  <div style="font-size:12px; font-weight:800; color:#D97706;">${(h.predicted_risk_index * 100).toFixed(0)}%</div>
                </div>
              </div>
              <div style="background:rgba(240,253,244,0.85); border:1px solid rgba(5,150,105,0.15); border-radius:8px; padding:6px; font-size:9px; line-height:1.3;">
                <span style="color:#064E3B; font-weight:700;">Action: </span>
                <span style="color:#047857; font-weight:600;">${h.enforcement_action}</span>
              </div>
            </div>
          `;

          try {
            const circleCenter = getHotspotCircleCenter(h);
            let circle: any = null;
            let marker: any = null;
            let infoWindow: any = null;

            let isClicked = isSelected;
            let closeTimeout: any = null;

            const showInfoWindow = () => {
              if (closeTimeout) {
                clearTimeout(closeTimeout);
                closeTimeout = null;
              }
              if (infoWindow) {
                infoWindowsRef.current.forEach(iw => {
                  if (iw !== infoWindow) {
                    try { iw.close(); } catch (err) { }
                  }
                });
                infoWindow.open(map);
              }
            };

            const hideInfoWindow = () => {
              if (closeTimeout) clearTimeout(closeTimeout);
              closeTimeout = setTimeout(() => {
                if (!isClicked && selectedId !== h.cluster_id && infoWindow) {
                  try { infoWindow.close(); } catch (err) { }
                }
              }, 100);
            };

            const handleHotspotClickMappls = (e: any) => {
              if (e && e.preventDefault) e.preventDefault();
              isClicked = true;
              onSelectHotspotRef.current(h);
              drawMapplsUpstreamTrail(map, h);

              if (infoWindow) {
                infoWindowsRef.current.forEach(iw => {
                  if (iw !== infoWindow) {
                    try { iw.close(); } catch (err) { }
                  }
                });
                infoWindow.open(map);
              }

              const logisticsImpact = h.logistics_weight >= 3.0 ? "high" : (h.logistics_weight >= 1.8 ? "medium" : "low");
              const event = new CustomEvent("copilot-inject-hotspot", {
                detail: {
                  hotspot: h.police_station,
                  risk: h.predicted_risk_index,
                  delay_savings: Math.round(h.total_commuter_time_saved_hours),
                  logistics_impact: logisticsImpact
                }
              });
              window.dispatchEvent(event);
            };

            if (showCircles) {
              const radiusInMeters = 80 + h.capacity_reduction_rcf * 450;
              circle = new Mappls.Circle({
                map: map,
                center: { lat: circleCenter.lat, lng: circleCenter.lng },
                radius: radiusInMeters,
                fillColor: style.fillColor,
                fillOpacity: isSelected ? 0.30 : 0.12,
                strokeColor: markerColor,
                strokeOpacity: isSelected ? 0.60 : 0.25,
                strokeWeight: isSelected ? 2.0 : 1.0
              });
              circlesRef.current.push(circle);

              if (circle && typeof circle.addListener === "function") {
                circle.addListener("click", handleHotspotClickMappls);
                circle.addListener("mouseover", showInfoWindow);
                circle.addListener("mouseout", hideInfoWindow);
              }
            }

            if (showMarkers) {
              marker = new Mappls.Marker({
                map: map,
                position: { lat: h.lat, lng: h.lon },
                html: `
                  <div style="display:flex; flex-direction:column; align-items:center; width:${dotSize + 60}px;">
                    <div style="position:relative; width:${dotSize}px; height:${dotSize}px;">
                      <div class="${markerPulse}" style="position:absolute; inset:0; border-radius:50%;"></div>
                      <div style="
                        position:absolute; inset:0; border-radius:50%;
                        background:${markerColor};
                        display:flex; align-items:center; justify-content:center;
                        color:#fff;
                        border:2px solid #ffffff;
                        box-shadow:0 3px 10px rgba(0,0,0,0.22);
                        padding: 4px;
                      ">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 100%; height: 100%;">
                          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                          <circle cx="12" cy="10" r="3"/>
                        </svg>
                      </div>
                    </div>
                    <div style="
                      margin-top:4px;
                      background:rgba(255,255,255,0.85);
                      backdrop-filter:blur(12px);
                      border:1px solid rgba(255,255,255,0.50);
                      border-radius:6px;
                      padding:2px 6px;
                      font-family:'Inter',sans-serif;
                      font-size:7px;
                      font-weight:700;
                      color:#334155;
                      white-space:nowrap;
                      max-width:88px;
                      overflow:hidden;
                      text-overflow:ellipsis;
                      box-shadow:0 2px 8px rgba(0,0,0,0.08);
                      letter-spacing:0.02em;
                      text-transform:uppercase;
                    ">${h.police_station}</div>
                  </div>
                `,
              });

              infoWindow = new Mappls.InfoWindow({
                map: map,
                position: { lat: h.lat, lng: h.lon },
                content: popupHtml,
                maxWidth: 250,
                closeButton: true
              });
              infoWindowsRef.current.push(infoWindow);
              infoWindowsMapRef.current.set(h.cluster_id, infoWindow);

              if (!isSelected) {
                infoWindow.close();
              } else {
                infoWindow.open(map);
              }

              marker.addListener("click", handleHotspotClickMappls);
              marker.addListener("mouseover", showInfoWindow);
              marker.addListener("mouseout", hideInfoWindow);

              markersRef.current.push(marker);
            }
          } catch (err) {
            console.error("[Mappls SDK] Failed to render hotspot marker: ", h.cluster_id, err);
          }
        });
      }
    }
  }, [hotspots, selectedId, sdkLoaded, fallbackToLeaflet, judgeMode, activeRoutes, mapInstance, visibleLayers, leafletInstance]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || selectedId === null) return;

    const h = hotspots.find(h => h.cluster_id === selectedId);
    if (h) {
      try {
        if (fallbackToLeaflet) {
          map.setView([h.lat, h.lon], 13.5, { animate: true, duration: 0.7 });
          const marker = leafletMarkersMapRef.current.get(selectedId);
          if (marker) {
            marker.openPopup();
          }
          drawLeafletUpstreamTrail(map, h);
        } else if (sdkLoaded) {
          if (typeof map.panTo === "function") {
            map.panTo({ lat: h.lat, lng: h.lon });
          } else if (typeof map.setCenter === "function") {
            map.setCenter({ lat: h.lat, lng: h.lon });
          }
          if (typeof map.setZoom === "function") {
            map.setZoom(13.5);
          }

          const infoWindow = infoWindowsMapRef.current.get(selectedId);
          if (infoWindow) {
            infoWindowsRef.current.forEach(iw => {
              try { iw.close(); } catch (err) { }
            });
            infoWindow.open(map);
          }
          drawMapplsUpstreamTrail(map, h);
        }
      } catch (err) {
        console.error("[MapContainer] Viewport update failed: ", err);
      }
    }
  }, [selectedId, hotspots, sdkLoaded, fallbackToLeaflet]);

  return (
    <div className="relative w-full h-full">
      <div id="mappls-core-grid" ref={mapContainerRef} className="w-full h-full" style={{ width: "100%", height: "100%" }} />

      <div className="absolute bottom-6 left-4 z-[40] flex gap-2">
        <div className="glass-panel rounded-xl p-3 flex flex-col gap-1.5 min-w-[150px]" style={{ background: "rgba(255, 255, 255, 0.75)", backdropFilter: "blur(12px)", border: "1px solid var(--border-hairline)" }}>
          <span className="text-[9px] font-bold text-slate-700 uppercase tracking-wide">Enforcement Tiers</span>
          <LegendItem color="#DC2626" glow="rgba(220,38,38,0.35)" label="Tier 1 · Critical" sub="Score ≥ 15" />
          <LegendItem color="#D97706" glow="rgba(217,119,6,0.35)" label="Tier 2 · Moderate" sub="3 ≤ Score < 15" />
          <LegendItem color="#0077CC" glow="rgba(0,119,204,0.35)" label="Tier 3 · Monitor" sub="Score < 3" />
        </div>
      </div>
    </div>
  );
}

function LegendItem({ color, glow, label, sub }: {
  color: string; glow: string; label: string; sub: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-2 w-2 rounded-full shrink-0"
        style={{ background: color, boxShadow: `0 0 6px ${glow}` }}
      />
      <div className="flex flex-col">
        <span className="text-[8px] font-semibold text-slate-700 leading-none">{label}</span>
        <span className="text-[7px] text-slate-400 mt-0.5">{sub}</span>
      </div>
    </div>
  );
}
