import { createFileRoute } from "@tanstack/react-router";
import fs from "fs";
import path from "path";
import { splitCsvLine } from "@/lib/csv";

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
      console.log(`[API Nodes] Fetching remote file: ${url}`);
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        return await res.text();
      }
    } catch (err) {
      console.error(`[API Nodes] Failed to fetch remote file ${fileName}:`, err);
    }
  }

  const backendOutputDir = getBackendOutputDir();
  const filePath = path.join(backendOutputDir, fileName);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf-8");
  }
  return null;
}

export const Route = createFileRoute("/api/nodes")({
  server: {
    handlers: {
      GET: async () => {
        try {
          // Attempt nodes_with_clusters.csv first, fallback to graph_nodes.csv
          let nodesData = await readTelemetryFile("nodes_with_clusters.csv");
          if (!nodesData) {
            nodesData = await readTelemetryFile("graph_nodes.csv");
          }

          if (!nodesData) {
            return new Response(JSON.stringify({ error: "Graph nodes file not found." }), {
              status: 404,
              headers: { "Content-Type": "application/json" }
            });
          }

          const lines = nodesData.split(/\r?\n/).filter(line => line.trim() !== "");
          if (lines.length <= 1) {
            return new Response(JSON.stringify([]), {
              status: 200,
              headers: { "Content-Type": "application/json" }
            });
          }

          const headers = splitCsvLine(lines[0]);
          const node_id_idx = headers.indexOf("node_id");
          const road_name_idx = headers.indexOf("road_name");
          const police_station_idx = headers.indexOf("police_station");
          const lanes_idx = headers.indexOf("lanes");
          const comm_idx = headers.indexOf("commercial_density");
          const trans_idx = headers.indexOf("transit_density");
          const dine_idx = headers.indexOf("dining_density");
          const corp_idx = headers.indexOf("corporate_density");
          const vuln_idx = headers.indexOf("vulnerability_index");
          const stgat_idx = headers.indexOf("stgat_risk");
          const pred_idx = headers.indexOf("predicted_risk");

          const nodesList: any[] = [];

          for (let i = 1; i < lines.length; i++) {
            const values = splitCsvLine(lines[i]);
            if (values.length < headers.length) continue;

            const node_id = values[node_id_idx];
            const road_name = values[road_name_idx] || "Unknown Road";
            const police_station = values[police_station_idx] || "Unknown PS";
            const lanes = parseInt(values[lanes_idx] || "2", 10);
            
            const commercial_density = parseFloat(values[comm_idx] || "0.0");
            const transit_density = parseFloat(values[trans_idx] || "0.0");
            const dining_density = parseFloat(values[dine_idx] || "0.0");
            const corporate_density = parseFloat(values[corp_idx] || "0.0");
            const vulnerability_index = parseFloat(values[vuln_idx] || "1.0");
            
            const stgat_risk = parseFloat(values[stgat_idx] || values[pred_idx] || "0.0");
            const predicted_risk = parseFloat(values[pred_idx] || "0.0");

            // Filter out peripheral/noise nodes to keep dropdown neat
            const hasDensity = commercial_density > 0 || transit_density > 0 || dining_density > 0 || corporate_density > 0;
            if (!hasDensity) continue;

            nodesList.push({
              node_id,
              road_name,
              police_station,
              lanes,
              commercial_density,
              transit_density,
              dining_density,
              corporate_density,
              vulnerability_index,
              stgat_risk: isNaN(stgat_risk) ? 0 : stgat_risk,
              predicted_risk: isNaN(predicted_risk) ? 0 : predicted_risk
            });
          }

          // Sort nodes by road_name then police_station
          nodesList.sort((a, b) => {
            const roadComp = a.road_name.localeCompare(b.road_name);
            if (roadComp !== 0) return roadComp;
            return a.police_station.localeCompare(b.police_station);
          });

          return new Response(JSON.stringify(nodesList), {
            status: 200,
            headers: { 
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=60"
            }
          });
        } catch (error: any) {
          console.error("API Nodes Fetch Error: ", error);
          return new Response(JSON.stringify({ error: "Internal Server Error", details: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
    }
  }
});
