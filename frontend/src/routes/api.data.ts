import { createFileRoute } from "@tanstack/react-router";
import fs from "fs";
import path from "path";

// Regex to split by commas not enclosed in double quotes (handles coordinates like "(lat, lon)" cleanly)
const splitCsvLine = (line: string) => {
  return line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(item => {
    let clean = item.trim();
    if (clean.startsWith('"') && clean.endsWith('"')) {
      clean = clean.substring(1, clean.length - 1);
    }
    return clean;
  });
};

function getBackendOutputDir() {
  if (process.env.BACKEND_OUTPUT_DIR) {
    return process.env.BACKEND_OUTPUT_DIR;
  }
  const possiblePaths = [
    path.join(process.cwd(), "..", "backend", "output"),
    path.join(process.cwd(), "backend", "output"),
    "c:/Users/anujs/OneDrive/Desktop/GridLock Phase 2/backend/output"
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return possiblePaths[0]; // fallback
}

async function readTelemetryFile(fileName: string): Promise<string | null> {
  const remoteUrl = process.env.REMOTE_TELEMETRY_URL || process.env.BACKEND_URL;
  if (remoteUrl) {
    try {
      const url = remoteUrl.endsWith("/") ? `${remoteUrl}${fileName}` : `${remoteUrl}/${fileName}`;
      console.log(`[API] Fetching remote file: ${url}`);
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        return await res.text();
      }
    } catch (err) {
      console.error(`[API] Failed to fetch remote file ${fileName}:`, err);
    }
  }

  const backendOutputDir = getBackendOutputDir();
  const filePath = path.join(backendOutputDir, fileName);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf-8");
  }
  return null;
}

export const Route = createFileRoute("/api/data")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const telemetryRaw = await readTelemetryFile("telemetry_dump.json");
          if (telemetryRaw) {
            try {
              const telemetryData = JSON.parse(telemetryRaw);
              if (telemetryData["0"]) {
                console.log("[API] Serving data from telemetry_dump.json");
                return new Response(JSON.stringify(telemetryData["0"]), {
                  status: 200,
                  headers: { "Content-Type": "application/json" }
                });
              }
            } catch (err: any) {
              console.error("Failed to parse telemetry_dump.json, falling back to CSV: ", err);
            }
          }

          const clustersData = await readTelemetryFile("hotspot_clusters.csv");
          const scheduleData = await readTelemetryFile("enforcement_schedule.csv");

          if (!clustersData || !scheduleData) {
            return new Response(JSON.stringify({ error: "ML output files not found locally or remotely. Run GNN backend." }), {
              status: 404,
              headers: { "Content-Type": "application/json" }
            });
          }

          // 1. Parse clusters
          const clusterLines = clustersData.split(/\r?\n/).filter(line => line.trim() !== "");
          const clusterHeaders = splitCsvLine(clusterLines[0]);

          const clustersMap = new Map<number, any>();

          for (let i = 1; i < clusterLines.length; i++) {
            const values = splitCsvLine(clusterLines[i]);
            if (values.length < clusterHeaders.length) continue;

            const clusterId = parseInt(values[0], 10);
            clustersMap.set(clusterId, {
              cluster_id: clusterId,
              centroid_lat: parseFloat(values[1]),
              centroid_lon: parseFloat(values[2]),
              total_violations: parseInt(values[3], 10),
              total_capacity_loss: parseFloat(values[4]),
              num_nodes: parseInt(values[5], 10),
              primary_police_station: values[6],
              priority_score: parseFloat(values[7]),
            });
          }

          // 2. Parse schedule
          const scheduleLines = scheduleData.split(/\r?\n/).filter(line => line.trim() !== "");
          const scheduleHeaders = splitCsvLine(scheduleLines[0]);

          const scheduleList: any[] = [];

          for (let i = 1; i < scheduleLines.length; i++) {
            const values = splitCsvLine(scheduleLines[i]);
            if (values.length < scheduleHeaders.length) continue;

            const row: any = {};
            scheduleHeaders.forEach((header, index) => {
              row[header] = values[index];
            });

            const clusterId = parseInt(row.cluster_id, 10);
            const clusterDetails = clustersMap.get(clusterId) || {};

            const latLonStr = row.location_centroid || "";
            let lat = clusterDetails.centroid_lat || 12.9716;
            let lon = clusterDetails.centroid_lon || 77.5946;

            if (latLonStr) {
              const matches = latLonStr.replace(/[\(\)\s]/g, "").split(",");
              if (matches.length === 2) {
                lat = parseFloat(matches[0]);
                lon = parseFloat(matches[1]);
              }
            }

            const rawRcf = parseFloat(row.capacity_reduction_rcf || "0");
            const cleanRcf = isNaN(rawRcf) ? 0 : rawRcf;

            const totalHoursSaved = parseFloat((row.total_commuter_time_saved_hours || "0").replace(" hours", "")) || 0;

            const formatTime = (raw: string | undefined): string => {
              if (!raw || raw === "N/A") return "N/A";
              const parsed = parseFloat(raw);
              if (isNaN(parsed)) return raw;
              return `${parsed.toFixed(1)} min/km`;
            };

            const formatSavings = (raw: string | undefined): string => {
              if (!raw || raw === "N/A") return "N/A";
              const parsed = parseFloat(raw);
              if (isNaN(parsed)) return raw;
              return `${parsed.toFixed(1)} min`;
            };

            const stationName = row.police_station || clusterDetails.primary_police_station || "Bengaluru Town";
            const upstreamFallbackMap: Record<string, { lat: number, lng: number }[][]> = {
              "Upparpet": [
                [{ lat: 12.978, lng: 77.571 }, { lat: 12.975, lng: 77.607 }],
                [{ lat: 12.965, lng: 77.576 }, { lat: 12.978, lng: 77.571 }]
              ],
              "Cubbon Park": [
                [{ lat: 12.975, lng: 77.607 }, { lat: 12.972, lng: 77.595 }],
                [{ lat: 12.972, lng: 77.595 }, { lat: 12.970, lng: 77.591 }]
              ],
              "HSR Layout": [
                [{ lat: 12.917, lng: 77.622 }, { lat: 12.910, lng: 77.641 }],
                [{ lat: 12.910, lng: 77.641 }, { lat: 12.898, lng: 77.630 }]
              ],
              "Bellandur": [
                [{ lat: 12.930, lng: 77.680 }, { lat: 12.914, lng: 77.678 }],
                [{ lat: 12.920, lng: 77.670 }, { lat: 12.930, lng: 77.680 }]
              ],
              "Adugodi": [
                [{ lat: 12.937, lng: 77.631 }, { lat: 12.934, lng: 77.624 }],
                [{ lat: 12.962, lng: 77.638 }, { lat: 12.934, lng: 77.626 }]
              ],
              "Halasur": [
                [{ lat: 12.973, lng: 77.617 }, { lat: 12.974, lng: 77.620 }],
                [{ lat: 12.977, lng: 77.625 }, { lat: 12.974, lng: 77.620 }]
              ]
            };

            scheduleList.push({
              rank: parseInt(row.rank || i.toString(), 10),
              cluster_id: clusterId,
              police_station: stationName,
              road_class: row.road_class || clusterDetails.road_class || "Secondary Commercial Street",
              lanes: parseInt(row.lanes || "2", 10),
              lat,
              lon,
              predicted_risk_index: clusterDetails.priority_score || parseFloat(row.predicted_risk_index || "0"),
              capacity_reduction_rcf: cleanRcf,
              logistics_weight: parseFloat(row.logistics_weight || "1.0"),
              logistics_penalty_index: parseFloat(row.logistics_penalty_index || "0.0"),
              travel_time_before: formatTime(row.travel_time_before_min_km || row.travel_time_before),
              travel_time_after: formatTime(row.travel_time_after_min_km || row.travel_time_after),
              delay_savings_per_vehicle: formatSavings(row.delay_savings_per_vehicle_min || row.delay_savings_per_vehicle),
              total_commuter_time_saved_hours: totalHoursSaved,
              priority_score: parseFloat(row.priority_score) || (clusterDetails.priority_score ? clusterDetails.priority_score * 100 : 0) || 0,
              target_shift: row.target_shift || "Day Shift",
              enforcement_action: row.enforcement_action || "Tow units + double-parking citation",
              directed_side: "left",
              upstream_edges: upstreamFallbackMap[stationName] || [],
            });
          }

          scheduleList.sort((a, b) => a.rank - b.rank);

          const totalHotspots = scheduleList.length;
          const totalViolations = Array.from(clustersMap.values()).reduce((sum, c) => sum + c.total_violations, 0);
          const avgCapacityRecovered = scheduleList.slice(0, 10).reduce((sum, s) => sum + s.capacity_reduction_rcf, 0) / Math.min(10, totalHotspots || 1) * 100;
          const totalSavings = scheduleList.reduce((sum, s) => sum + s.total_commuter_time_saved_hours, 0);

          const fallbackRoutes = [
            {
              name: "Whitefield Hub ➔ Koramangala Hub (Route 1)",
              coords: [
                { lat: 12.969, lng: 77.750 },
                { lat: 12.990, lng: 77.716 },
                { lat: 12.989, lng: 77.696 },
                { lat: 12.956, lng: 77.701 },
                { lat: 12.930, lng: 77.680 },
                { lat: 12.920, lng: 77.670 },
                { lat: 12.922, lng: 77.649 },
                { lat: 12.934, lng: 77.624 }
              ],
              color: "#F43F5E"
            },
            {
              name: "Electronic City ➔ Majestic Hub (Route 2)",
              coords: [
                { lat: 12.845, lng: 77.663 },
                { lat: 12.879, lng: 77.644 },
                { lat: 12.863, lng: 77.659 },
                { lat: 12.903, lng: 77.624 },
                { lat: 12.917, lng: 77.622 },
                { lat: 12.921, lng: 77.618 },
                { lat: 12.943, lng: 77.611 },
                { lat: 12.969, lng: 77.588 },
                { lat: 12.978, lng: 77.571 }
              ],
              color: "#D97706"
            },
            {
              name: "Hebbal Hub ➔ Indiranagar Hub (Route 3)",
              coords: [
                { lat: 13.035, lng: 77.597 },
                { lat: 13.024, lng: 77.619 },
                { lat: 13.018, lng: 77.643 },
                { lat: 13.007, lng: 77.663 },
                { lat: 13.004, lng: 77.675 },
                { lat: 12.978, lng: 77.641 }
              ],
              color: "#2563EB"
            }
          ];

          return new Response(JSON.stringify({
            summary: {
              total_hotspots: totalHotspots,
              total_violations: totalViolations,
              avg_capacity_recovered: Math.round(avgCapacityRecovered),
              total_savings: Math.round(totalSavings),
            },
            hotspots: scheduleList,
            routes: fallbackRoutes,
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        } catch (error: any) {
          console.error("API Fetch Error: ", error);
          return new Response(JSON.stringify({ error: "Internal Server Error", details: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
    }
  }
});
