import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/route-geometry")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { searchParams } = new URL(request.url);
          const startLat = searchParams.get("start_lat");
          const startLng = searchParams.get("start_lng");
          const endLat = searchParams.get("end_lat");
          const endLng = searchParams.get("end_lng");

          if (!startLat || !startLng || !endLat || !endLng) {
            return new Response(JSON.stringify({ error: "Missing required params: start_lat, start_lng, end_lat, end_lng" }), {
              status: 400,
              headers: { "Content-Type": "application/json" }
            });
          }

          const coordsStr = `${startLng},${startLat};${endLng},${endLat}`;
          const apiUrl = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=polyline&steps=true&alternatives=false`;

          console.log(`[Route Geometry API] OSRM request: ${apiUrl}`);

          const response = await fetch(apiUrl, {
            headers: {
              "Accept": "application/json",
              "User-Agent": "Atlas/1.0",
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            return new Response(JSON.stringify({ error: `OSRM returned ${response.status}`, details: errorText }), {
              status: response.status,
              headers: { "Content-Type": "application/json" }
            });
          }

          const data = await response.json();
          return new Response(JSON.stringify(data), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        } catch (error: any) {
          console.error("[Route Geometry API] Server error:", error);
          return new Response(JSON.stringify({ error: "Failed to fetch route geometry", details: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
    }
  }
});
