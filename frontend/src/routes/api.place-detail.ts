import { createFileRoute } from "@tanstack/react-router";

const MOCK_COORDS: Record<string, { latitude: number; longitude: number }> = {
  "mock-silk": { latitude: 12.9176, longitude: 77.6225 },
  "mock-wipro": { latitude: 12.9344, longitude: 77.6242 },
  "mock-varthur": { latitude: 12.9550, longitude: 77.7470 },
  "mock-hebbal": { latitude: 13.0350, longitude: 77.5970 },
  "mock-airport": { latitude: 12.9602, longitude: 77.6791 }
};

export const Route = createFileRoute("/api/place-detail")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { searchParams } = new URL(request.url);
          const eloc = searchParams.get("eloc");
          
          if (!eloc) {
            return new Response(JSON.stringify({ error: "Missing eloc parameter" }), {
              status: 400,
              headers: { "Content-Type": "application/json" }
            });
          }

          // Check mock coordinate lookup first
          if (eloc.startsWith("mock-") && MOCK_COORDS[eloc]) {
            return new Response(JSON.stringify(MOCK_COORDS[eloc]), {
              status: 200,
              headers: { "Content-Type": "application/json" }
            });
          }

          const token = process.env.MAPPLS_TOKEN || process.env.NEXT_PUBLIC_MAPPLS_TOKEN || "rysmqsqzhyrdjzzdhxthpgdljebmkdipyjmb";

          // Try Atlas Place Details API first
          try {
            const url = `https://atlas.mappls.com/api/places/detail/${eloc}?access_token=${token}`;
            const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
            if (response.ok) {
              const data = await response.json();
              const lat = data.latitude || data.lat;
              const lon = data.longitude || data.lng;
              if (lat != null && lon != null) {
                return new Response(JSON.stringify({ latitude: parseFloat(lat), longitude: parseFloat(lon) }), {
                  status: 200,
                  headers: { "Content-Type": "application/json" }
                });
              }
            }
          } catch (e) {
            console.warn("Atlas details failed, trying O2O:", e);
          }

          // Try O2O Place Details API as secondary fallback
          try {
            const url = `https://explore.mappls.com/apis/O2O/entity/${eloc}`;
            const response = await fetch(url, {
              headers: {
                "Authorization": `Bearer ${token}`
              },
              signal: AbortSignal.timeout(3000)
            });
            if (response.ok) {
              const data = await response.json();
              const lat = data.latitude || (data.results && data.results[0] && data.results[0].latitude);
              const lon = data.longitude || (data.results && data.results[0] && data.results[0].longitude);
              if (lat != null && lon != null) {
                return new Response(JSON.stringify({ latitude: parseFloat(lat), longitude: parseFloat(lon) }), {
                  status: 200,
                  headers: { "Content-Type": "application/json" }
                });
              }
            }
          } catch (e) {
            console.warn("O2O details failed:", e);
          }

          // Final fallback: parse name / query or return bias coordinates in Bengaluru
          // Silk Board fallback coords
          return new Response(JSON.stringify({ latitude: 12.9716, longitude: 77.5946 }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        } catch (err: any) {
          console.error("Place detail proxy failed: ", err);
          return new Response(JSON.stringify({ latitude: 12.9716, longitude: 77.5946 }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
    }
  }
});
