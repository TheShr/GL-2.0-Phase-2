"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
  commercial_density?: number;
  transit_density?: number;
  dining_density?: number;
  corporate_density?: number;
  vulnerability_index?: number;
  elevation?: number;
  slope?: number;
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

// Cleans landmark formatting by stripping out redundant city/state pin code suffixes
function cleanLandmark(landmark: string | undefined, roadClass: string) {
  if (!landmark) return `Near ${roadClass}`;
  let clean = landmark.split(/Bengaluru/i)[0].trim();
  if (clean.endsWith(",")) {
    clean = clean.substring(0, clean.length - 1).trim();
  }
  return clean ? `Near ${clean}` : `Near ${roadClass}`;
}



// TASK 3: Calculates anisotropic offset perpendicular to standard driving direction (shifting left for India)
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
  const markersRef = useRef<any[]>([]);
  const circlesRef = useRef<any[]>([]);
  const polylinesRef = useRef<any[]>([]);
  const infoWindowsRef = useRef<any[]>([]);
  const infoWindowsMapRef = useRef<Map<number, any>>(new Map());
  const leafletMarkersMapRef = useRef<Map<number, L.Marker>>(new Map());

  // Task 4 references to track and clear dynamic GNN upstream queue trail overlays
  const upstreamPolylinesRef = useRef<any[]>([]);
  const leafletUpstreamPolylinesRef = useRef<L.Polyline[]>([]);



  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [fallbackToLeaflet, setFallbackToLeaflet] = useState(false);
  const [judgeMode, setJudgeMode] = useState(false);

  // Live traffic stream states
  const [trafficEnabled, setTrafficEnabled] = useState(false);
  const [trafficFreeFlowEnabled, setTrafficFreeFlowEnabled] = useState(true);
  const [trafficNonFreeFlowEnabled, setTrafficNonFreeFlowEnabled] = useState(true);
  const [trafficClosureEnabled, setTrafficClosureEnabled] = useState(true);
  const [trafficStopIconEnabled, setTrafficStopIconEnabled] = useState(true);

  // Clean activeRoutes coordinates to ensure no null or NaN values reach the map layers
  const showRoutes = visibleLayers?.routes ?? true;
  const activeRoutes = showRoutes ? (routes || []).map(route => {
    const cleanCoords = route.coords.filter(
      c => c && c.lat != null && c.lng != null && !isNaN(c.lat) && !isNaN(c.lng)
    );
    return { ...route, coords: cleanCoords };
  }).filter(route => route.coords.length >= 2) : [];

  const [selectedRouteName, setSelectedRouteName] = useState<string | null>(null);
  const directionPluginRef = useRef<any>(null);

  // Task 4: Upstream queue trail visualizer for Mappls (fading, translucent red gradient path)
  const drawMapplsUpstreamTrail = (map: any, h: Hotspot) => {
    upstreamPolylinesRef.current.forEach(p => { if (p.remove) p.remove(); });
    upstreamPolylinesRef.current = [];
    // Polylines removed per user request
  };

  // Task 4: Upstream queue trail visualizer for Leaflet (fading, translucent red gradient path)
  const drawLeafletUpstreamTrail = (map: L.Map, h: Hotspot) => {
    leafletUpstreamPolylinesRef.current.forEach(p => p.remove());
    leafletUpstreamPolylinesRef.current = [];
    // Polylines removed per user request
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

  // 1. Dynamic Script Injection Hook using official loader script parameter
  useEffect(() => {
    if (typeof window === "undefined") return;

    const webScriptId = "mappls-web-maps-sdk";
    const pluginsScriptId = "mappls-web-plugins-sdk";
    const accessToken = process.env.NEXT_PUBLIC_MAPPLS_TOKEN || "rysmqsqzhyrdjzzdhxthpgdljebmkdipyjmb";

    // 7-second script loading timeout safeguard (covering both scripts)
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
          console.log("[Mappls SDK] Web & Plugins already loaded.");
          console.log("Mappls:", (window as any).mappls || (window as any).Mappls);
          console.log("mappls.direction:", typeof ((window as any).mappls || (window as any).Mappls)?.direction);
          setSdkLoaded(true);
          clearTimeout(timeoutTimer);
        } else {
          existingPluginsScript.addEventListener("load", () => {
            console.log("[Mappls SDK] Plugins loaded via existing script listener.");
            console.log("Mappls:", (window as any).mappls || (window as any).Mappls);
            console.log("mappls.direction:", typeof ((window as any).mappls || (window as any).Mappls)?.direction);
            setSdkLoaded(true);
            clearTimeout(timeoutTimer);
          });
        }
        return;
      }

      console.log("[Mappls SDK] Web loaded, starting Plugins SDK script...");
      const pluginsScript = document.createElement("script");
      pluginsScript.id = pluginsScriptId;
      pluginsScript.src = `https://sdk.mappls.com/map/sdk/plugins?access_token=${accessToken}&v=3.0`;
      pluginsScript.async = true;
      pluginsScript.defer = true;
      pluginsScript.onload = () => {
        console.log("[Mappls SDK] Plugins SDK loaded successfully.");
        console.log("Mappls:", (window as any).mappls || (window as any).Mappls);
        console.log("mappls.direction:", typeof ((window as any).mappls || (window as any).Mappls)?.direction);
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
      console.log("[Mappls SDK] Starting Web SDK script...");
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

  // 2. Map Canvas Initialization (Mappls Vector vs. Leaflet Fallback)
  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current || mapRef.current) return;

    if (fallbackToLeaflet) {
      console.log("[MapContainer] Initializing Leaflet map as backup mapping...");
      try {
        const map = L.map(mapContainerRef.current, {
          center: [12.9716, 77.5946],
          zoom: 12,
          zoomControl: false,
          attributionControl: false,
        });

        // CartoDB Positron base tiles
        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
          maxZoom: 19,
          minZoom: 10,
        }).addTo(map);

        L.control.zoom({ position: "bottomright" }).addTo(map);

        mapRef.current = map;
        setMapInstance(map);
        leafletLayersRef.current = L.layerGroup().addTo(map);
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
        }
      };
    }

    if (sdkLoaded) {
      try {
        const Mappls = (window as any).Mappls || (window as any).mappls;
        if (!Mappls || !Mappls.Map) {
          throw new Error("Mappls.Map constructor namespace not fully loaded.");
        }

        const targetDiv = document.getElementById("mappls-core-grid");
        if (!targetDiv) {
          throw new Error("Target DIV #mappls-core-grid not found in DOM.");
        }

        console.log("[Mappls SDK] Instantiating new Mappls.Map on #mappls-core-grid...");
        const map = new Mappls.Map("mappls-core-grid", {
          center: { lat: 12.9716, lng: 77.5946 },
          zoom: 12,
          zoomControl: false
        });

        // Apply custom dark theme on load
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
              console.log("[Mappls SDK] Set custom dark skin style:", darkStyle.name);
            } else {
              Mappls.setStyle("dark");
              console.log("[Mappls SDK] Set fallback 'dark' style.");
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
  }, [sdkLoaded, fallbackToLeaflet]);

  // 3. Wire ambient traffic feed overlay to core map instance
  useEffect(() => {
    if (mapInstance && !fallbackToLeaflet && sdkLoaded) {
      try {
        // Defensive check calling native showTraffic or enableTraffic functions
        if (typeof mapInstance.showTraffic === "function") {
          mapInstance.showTraffic(trafficEnabled);
          console.log(`[Mappls SDK] Live traffic toggled via showTraffic: ${trafficEnabled}`);
        } else if (typeof mapInstance.enableTraffic === "function") {
          mapInstance.enableTraffic(trafficEnabled);
          console.log(`[Mappls SDK] Live traffic toggled via enableTraffic: ${trafficEnabled}`);
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



  // Dynamic direction widget logic: render only the selected logistics routeSnapped corridor
  useEffect(() => {
    const map = mapInstance;
    if (!sdkLoaded || !map || fallbackToLeaflet) return;

    // 1. Cleanup any existing direction widget instance
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

  // 4. Render hotspots & corridors on Mappls/Leaflet canvas
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (fallbackToLeaflet) {
      const layerGroup = leafletLayersRef.current;
      if (!layerGroup) return;

      layerGroup.clearLayers();
      leafletMarkersMapRef.current.clear();



      // B. Draw hotspots in Leaflet
      hotspots.forEach((h) => {
        if (h.lat == null || h.lon == null || isNaN(h.lat) || isNaN(h.lon)) {
          console.error("[Leaflet] Hotspot has invalid coordinates:", h);
          return;
        }

        const isTop5 = h.rank <= 5;
        const style = getTierStyle(h.priority_score);

        const markerColor = style.color;
        const markerPulse = style.pulseClass;

        const isSelected = h.cluster_id === selectedId;
        const dotSize = isSelected ? 30 : 22;

        const icon = L.divIcon({
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

        // TASK 3: Apply minor coordinate offset to shift hazard circle onto driving lane (Leaflet)
        const circleCenter = getHotspotCircleCenter(h);
        if (circleCenter.lat == null || circleCenter.lng == null || isNaN(circleCenter.lat) || isNaN(circleCenter.lng)) {
          console.error("[Leaflet] Invalid circle center for hotspot:", h);
          return;
        }
        const radius = 80 + h.capacity_reduction_rcf * 450;
        const circle = L.circle([circleCenter.lat, circleCenter.lng], {
          color: markerColor,
          fillColor: style.fillColor,
          fillOpacity: isSelected ? 0.30 : 0.12,
          weight: isSelected ? 1.5 : 1,
          dashArray: isSelected ? "5, 5" : undefined,
          radius,
        });

        // Advanced Glassmorphic InfoWindow layout
        const enforcementStatus = h.priority_score >= 15.0 ? "Tier 1 · Critical Enforcement" : (h.priority_score >= 3.0 ? "Tier 2 · Active Patrol" : "Tier 3 · Monitor Zone");

        const isGeocodeMissing = !h.nearest_landmark || h.nearest_landmark.toLowerCase().includes("coordinates") || h.nearest_landmark.toLowerCase().includes("unavailable");
        const isPoiMissing = h.commercial_density === null || h.commercial_density === undefined || isNaN(h.commercial_density) || (h.commercial_density === 0 && h.transit_density === 0);
        const isElevationMissing = h.elevation === null || h.elevation === undefined || isNaN(h.elevation) || h.elevation === 900;

        const missingFields = [];
        if (isGeocodeMissing) missingFields.push("Geocoding");
        if (isPoiMissing) missingFields.push("POI");
        if (isElevationMissing) missingFields.push("Elevation");

        const dataWarningBadge = missingFields.length > 0
          ? `<div style="padding:3.5px 8px; background:#DC2626; color:#FFFFFF; font-size:7px; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; border-radius:9999px; display:flex; align-items:center; gap:2px;">
               ⚠️ Data Unavailable (${missingFields.join(', ')})
             </div>`
          : '';

        const popupHtml = `
          <div class="glass-popup" style="
            font-family:'Inter',sans-serif; padding:12px 14px; min-width:220px; max-width:260px; color:#1E293B;
            background:transparent; border:none; box-shadow:none;
          ">
            <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px;">
              <div style="padding:3.5px 8px; background:#0F172A; color:#F1F5F9; font-size:7px; font-weight:800; text-transform:uppercase; letter-spacing:0.15em; border-radius:9999px;">
                ${enforcementStatus}
              </div>
              ${dataWarningBadge}
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

        const marker = L.marker([h.lat, h.lon], { icon });
        leafletMarkersMapRef.current.set(h.cluster_id, marker);

        const handleHotspotClick = (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          onSelectHotspotRef.current(h);

          // TASK 4: Dynamically render spatiotemporal upstream queue trail on selection
          drawLeafletUpstreamTrail(map, h);

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
        if (circle && typeof circle.on === "function") {
          circle.on("mouseover", showInfo);
          circle.on("mouseout", hideInfo);
        }

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

        // Checklist active layer effects (Leaflet fallback)
        if (visibleLayers?.commercialDensity && h.commercial_density && h.commercial_density > 0) {
          L.circle([h.lat, h.lon], {
            color: "#D97706",
            fillColor: "#D97706",
            fillOpacity: 0.08,
            weight: 1.5,
            dashArray: "3, 6",
            radius: h.commercial_density * 350,
          }).addTo(layerGroup).bindTooltip(`Commercial Profile: ${(h.commercial_density * 100).toFixed(1)}%`);
        }
        if (visibleLayers?.transitDensity && h.transit_density && h.transit_density > 0) {
          L.circle([h.lat, h.lon], {
            color: "#2563EB",
            fillColor: "#2563EB",
            fillOpacity: 0.08,
            weight: 1.5,
            dashArray: "3, 6",
            radius: h.transit_density * 350,
          }).addTo(layerGroup).bindTooltip(`Transit Density: ${(h.transit_density * 100).toFixed(1)}%`);
        }
        if (visibleLayers?.diningDensity && h.dining_density && h.dining_density > 0) {
          L.circle([h.lat, h.lon], {
            color: "#EC4899",
            fillColor: "#EC4899",
            fillOpacity: 0.08,
            weight: 1.5,
            dashArray: "3, 6",
            radius: h.dining_density * 350,
          }).addTo(layerGroup).bindTooltip(`Dining Proximity: ${(h.dining_density * 100).toFixed(1)}%`);
        }
        if (visibleLayers?.corporateDensity && h.corporate_density && h.corporate_density > 0) {
          L.circle([h.lat, h.lon], {
            color: "#06B6D4",
            fillColor: "#06B6D4",
            fillOpacity: 0.08,
            weight: 1.5,
            dashArray: "3, 6",
            radius: h.corporate_density * 350,
          }).addTo(layerGroup).bindTooltip(`Corporate Density: ${(h.corporate_density * 100).toFixed(1)}%`);
        }
        if (visibleLayers?.roadCapacity) {
          L.circle([h.lat, h.lon], {
            color: "#10B981",
            fillColor: "#10B981",
            fillOpacity: 0.15,
            weight: 2,
            radius: h.lanes * 60,
          }).addTo(layerGroup).bindTooltip(`Road Width: ${h.lanes} Lanes (${h.road_class})`);
        }
        if (visibleLayers?.vulnerabilityIndex && h.vulnerability_index) {
          L.circle([h.lat, h.lon], {
            color: "#EF4444",
            fillColor: "#EF4444",
            fillOpacity: h.vulnerability_index * 0.25,
            weight: 2,
            radius: h.vulnerability_index * 250,
          }).addTo(layerGroup).bindTooltip(`Vulnerability Index: ${(h.vulnerability_index * 100).toFixed(1)}%`);
        }
        if (visibleLayers?.elevationSlope && h.elevation) {
          L.circle([h.lat, h.lon], {
            color: "#6366F1",
            fillColor: "#6366F1",
            fillOpacity: 0.20,
            weight: 2,
            radius: 120,
          }).addTo(layerGroup).bindTooltip(`Altitude: ${h.elevation.toFixed(0)}m, Slope: ${((h.slope || 0) * 100).toFixed(2)}%`);
        }
      });

      // Render Flipkart Logistics Hubs (Leaflet fallback)
      if (visibleLayers?.flipkartLogisticsHubs) {
        const hubs = [
          { name: "Whitefield Logistics Hub", lat: 12.969, lon: 77.750 },
          { name: "Koramangala Logistics Hub", lat: 12.934, lon: 77.624 },
          { name: "Electronic City Gateway", lat: 12.845, lon: 77.663 },
          { name: "Majestic Dispatch Terminal", lat: 12.978, lon: 77.571 },
          { name: "Hebbal Logistics Hub", lat: 13.035, lon: 77.597 },
          { name: "Indiranagar Hub", lat: 12.978, lon: 77.641 }
        ];
        hubs.forEach((hub) => {
          const hubIcon = L.divIcon({
            className: "",
            html: `
              <div style="background:#F2C94C; border:2px solid #000; color:#000; border-radius:4px; padding:3px 6px; font-weight:800; font-size:8px; white-space:nowrap; box-shadow:0 2px 6px rgba(0,0,0,0.3)">
                📦 ${hub.name}
              </div>
            `,
            iconSize: [80, 20],
            iconAnchor: [40, 10]
          });
          L.marker([hub.lat, hub.lon], { icon: hubIcon }).addTo(layerGroup);
        });
      }
      return;
    }

    if (sdkLoaded) {
      const Mappls = (window as any).Mappls || (window as any).mappls;
      if (!Mappls) return;

      // Clean up previous Mappls layers
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
            console.error("[Mappls] Hotspot has invalid coordinates:", h);
            return;
          }

          const isTop5 = h.rank <= 5;
          const style = getTierStyle(h.priority_score);

          const markerColor = style.color;
          const markerPulse = style.pulseClass;

          const isSelected = h.cluster_id === selectedId;
          const markerSize = isSelected ? 30 : 22;
          const dotSize = markerSize;

          // Custom InfoWindow Content
          const enforcementStatus = h.priority_score >= 15.0 ? "Tier 1 · Critical Enforcement" : (h.priority_score >= 3.0 ? "Tier 2 · Active Patrol" : "Tier 3 · Monitor Zone");

          const isGeocodeMissing = !h.nearest_landmark || h.nearest_landmark.toLowerCase().includes("coordinates") || h.nearest_landmark.toLowerCase().includes("unavailable");
          const isPoiMissing = h.commercial_density === null || h.commercial_density === undefined || isNaN(h.commercial_density) || (h.commercial_density === 0 && h.transit_density === 0);
          const isElevationMissing = h.elevation === null || h.elevation === undefined || isNaN(h.elevation) || h.elevation === 900;

          const missingFields = [];
          if (isGeocodeMissing) missingFields.push("Geocoding");
          if (isPoiMissing) missingFields.push("POI");
          if (isElevationMissing) missingFields.push("Elevation");

          const dataWarningBadge = missingFields.length > 0
            ? `<div style="padding:3.5px 8px; background:#DC2626; color:#FFFFFF; font-size:7px; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; border-radius:9999px; display:flex; align-items:center; gap:2px;">
                 ⚠️ Data Unavailable (${missingFields.join(', ')})
               </div>`
            : '';

          const popupHtml = `
            <div class="glass-popup" style="
              font-family:'Inter',sans-serif; padding:12px 14px; min-width:220px; max-width:260px; color:#1E293B;
              background:transparent; border:none; box-shadow:none;
            ">
              <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px;">
                <div style="padding:3.5px 8px; background:#0F172A; color:#F1F5F9; font-size:7px; font-weight:800; text-transform:uppercase; letter-spacing:0.15em; border-radius:9999px;">
                  ${enforcementStatus}
                </div>
                ${dataWarningBadge}
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
            // TASK 3: Apply minor coordinate offset to shift hazard circle onto driving lane (Mappls)
            const circleCenter = getHotspotCircleCenter(h);
            if (circleCenter.lat == null || circleCenter.lng == null || isNaN(circleCenter.lat) || isNaN(circleCenter.lng)) {
              console.error("[Mappls] Invalid circle center for hotspot:", h);
              return;
            }

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

              // TASK 4: Dynamically render spatiotemporal upstream queue trail on selection (Mappls)
              drawMapplsUpstreamTrail(map, h);

              // Open popup InfoWindow on click
              if (infoWindow) {
                infoWindowsRef.current.forEach(iw => {
                  try { iw.close(); } catch (err) { }
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

              // Bind custom Mappls.InfoWindow
              infoWindow = new Mappls.InfoWindow({
                map: map,
                position: { lat: h.lat, lng: h.lon },
                content: popupHtml,
                maxWidth: 250,
                closeButton: true
              });
              infoWindowsRef.current.push(infoWindow);
              infoWindowsMapRef.current.set(h.cluster_id, infoWindow);

              // Close infoWindow by default, open only if selected
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

            // Checklist active layer effects (Mappls SDK)
            if (visibleLayers?.commercialDensity && h.commercial_density && h.commercial_density > 0) {
              const commercialCircle = new Mappls.Circle({
                map: map,
                center: { lat: h.lat, lng: h.lon },
                radius: h.commercial_density * 350,
                fillColor: "#D97706",
                fillOpacity: 0.08,
                strokeColor: "#D97706",
                strokeOpacity: 0.5,
                strokeWeight: 1.5,
                dashArray: "3, 6"
              });
              circlesRef.current.push(commercialCircle);
            }
            if (visibleLayers?.transitDensity && h.transit_density && h.transit_density > 0) {
              const transitCircle = new Mappls.Circle({
                map: map,
                center: { lat: h.lat, lng: h.lon },
                radius: h.transit_density * 350,
                fillColor: "#2563EB",
                fillOpacity: 0.08,
                strokeColor: "#2563EB",
                strokeOpacity: 0.5,
                strokeWeight: 1.5,
                dashArray: "3, 6"
              });
              circlesRef.current.push(transitCircle);
            }
            if (visibleLayers?.diningDensity && h.dining_density && h.dining_density > 0) {
              const diningCircle = new Mappls.Circle({
                map: map,
                center: { lat: h.lat, lng: h.lon },
                radius: h.dining_density * 350,
                fillColor: "#EC4899",
                fillOpacity: 0.08,
                strokeColor: "#EC4899",
                strokeOpacity: 0.5,
                strokeWeight: 1.5,
                dashArray: "3, 6"
              });
              circlesRef.current.push(diningCircle);
            }
            if (visibleLayers?.corporateDensity && h.corporate_density && h.corporate_density > 0) {
              const corpCircle = new Mappls.Circle({
                map: map,
                center: { lat: h.lat, lng: h.lon },
                radius: h.corporate_density * 350,
                fillColor: "#06B6D4",
                fillOpacity: 0.08,
                strokeColor: "#06B6D4",
                strokeOpacity: 0.5,
                strokeWeight: 1.5,
                dashArray: "3, 6"
              });
              circlesRef.current.push(corpCircle);
            }
            if (visibleLayers?.roadCapacity) {
              const capCircle = new Mappls.Circle({
                map: map,
                center: { lat: h.lat, lng: h.lon },
                radius: h.lanes * 60,
                fillColor: "#10B981",
                fillOpacity: 0.15,
                strokeColor: "#10B981",
                strokeOpacity: 0.6,
                strokeWeight: 2
              });
              circlesRef.current.push(capCircle);
            }
            if (visibleLayers?.vulnerabilityIndex && h.vulnerability_index) {
              const vulnCircle = new Mappls.Circle({
                map: map,
                center: { lat: h.lat, lng: h.lon },
                radius: h.vulnerability_index * 250,
                fillColor: "#EF4444",
                fillOpacity: h.vulnerability_index * 0.25,
                strokeColor: "#EF4444",
                strokeOpacity: 0.7,
                strokeWeight: 2
              });
              circlesRef.current.push(vulnCircle);
            }
            if (visibleLayers?.elevationSlope && h.elevation) {
              const elevCircle = new Mappls.Circle({
                map: map,
                center: { lat: h.lat, lng: h.lon },
                radius: 120,
                fillColor: "#6366F1",
                fillOpacity: 0.20,
                strokeColor: "#6366F1",
                strokeOpacity: 0.8,
                strokeWeight: 2
              });
              circlesRef.current.push(elevCircle);
            }
          } catch (err) {
            console.error("[Mappls SDK] Failed to render hotspot marker: ", h.cluster_id, err);
          }
        });

        // Render Flipkart Logistics Hubs (Mappls SDK)
        if (visibleLayers?.flipkartLogisticsHubs) {
          const hubs = [
            { name: "Whitefield Logistics Hub", lat: 12.969, lon: 77.750 },
            { name: "Koramangala Logistics Hub", lat: 12.934, lon: 77.624 },
            { name: "Electronic City Gateway", lat: 12.845, lon: 77.663 },
            { name: "Majestic Dispatch Terminal", lat: 12.978, lon: 77.571 },
            { name: "Hebbal Logistics Hub", lat: 13.035, lon: 77.597 },
            { name: "Indiranagar Hub", lat: 12.978, lon: 77.641 }
          ];
          hubs.forEach((hub) => {
            try {
              const hubMarker = new Mappls.Marker({
                map: map,
                position: { lat: hub.lat, lng: hub.lon },
                html: `
                  <div style="background:#F2C94C; border:2px solid #000; color:#000; border-radius:4px; padding:3px 6px; font-weight:800; font-size:8px; white-space:nowrap; box-shadow:0 2px 6px rgba(0,0,0,0.3)">
                    📦 ${hub.name}
                  </div>
                `
              });
              markersRef.current.push(hubMarker);
            } catch (err) { }
          });
        }
      }
    }
  }, [hotspots, selectedId, sdkLoaded, fallbackToLeaflet, judgeMode, activeRoutes, mapInstance, visibleLayers]);



  // 5. Pan to selected hotspot (Leaflet & Mappls support) & draw upstream queue trail
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
          // TASK 4: Draw queue trail on Leaflet map focus
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

          // Open Mappls InfoWindow for the selected cluster
          const infoWindow = infoWindowsMapRef.current.get(selectedId);
          if (infoWindow) {
            infoWindowsRef.current.forEach(iw => {
              try { iw.close(); } catch (err) { }
            });
            infoWindow.open(map);
          }
          // TASK 4: Draw queue trail on Mappls map focus
          drawMapplsUpstreamTrail(map, h);
        }
      } catch (err) {
        console.error("[MapContainer] Viewport update failed: ", err);
      }
    }
  }, [selectedId, hotspots, sdkLoaded, fallbackToLeaflet]);



  return (
    <div className="relative w-full h-full">
      {/* Explicit Target Mount Container */}
      <div id="mappls-core-grid" ref={mapContainerRef} className="w-full h-full" style={{ width: "100%", height: "100%" }} />



      {/* ── Legend — Glass Pods ─────────────────────────────────────────── */}
      <div className="absolute bottom-6 left-4 z-[40] flex gap-2">
        {/* Hotspots priority legend */}
        <div className="glass-panel rounded-xl p-3 flex flex-col gap-1.5 min-w-[150px]">
          <span className="text-[9px] font-bold text-slate-700 uppercase tracking-wide">Enforcement Tiers</span>
          <LegendItem color="#DC2626" glow="rgba(220,38,38,0.35)" label="Tier 1 · Critical" sub="Score ≥ 15" />
          <LegendItem color="#D97706" glow="rgba(217,119,6,0.35)" label="Tier 2 · Moderate" sub="3 ≤ Score < 15" />
          <LegendItem color="#0077CC" glow="rgba(0,119,204,0.35)" label="Tier 3 · Monitor" sub="Score < 3" />
        </div>
      </div>
    </div>
  );
}

function TrafficSubToggle({ label, checked, onChange, colorClass }: {
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  colorClass: string;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer py-0.5">
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${colorClass}`} />
        <span className="text-[8px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3 w-3 rounded text-emerald-500 border-slate-300 focus:ring-0 focus:ring-offset-0 cursor-pointer"
      />
    </label>
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
