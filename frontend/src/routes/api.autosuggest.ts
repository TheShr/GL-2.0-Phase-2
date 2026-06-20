import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/autosuggest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { searchParams } = new URL(request.url);
          const query = searchParams.get("query");
          
          if (!query) {
            return new Response(JSON.stringify({ error: "Missing query parameter" }), {
              status: 400,
              headers: { "Content-Type": "application/json" }
            });
          }

          const token = process.env.MAPPLS_TOKEN || process.env.NEXT_PUBLIC_MAPPLS_TOKEN || "rysmqsqzhyrdjzzdhxthpgdljebmkdipyjmb";
          const biasLat = 12.9716;
          const biasLon = 77.5946;

          const url = `https://atlas.mappls.com/api/places/geocode/autocomplete?access_token=${token}&query=${encodeURIComponent(query)}&location=${biasLat},${biasLon}`;

          const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
          if (!response.ok) {
            throw new Error(`Mappls Autosuggest error: ${response.status}`);
          }
          const data = await response.json();
          return new Response(JSON.stringify(data.suggestedLocations || []), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        } catch (err: any) {
          console.error("Autosuggest proxy failed: ", err);
          const mockSuggestions = [
            { placeName: "Silk Board Junction", placeAddress: "Outer Ring Road, Bengaluru", latitude: 12.9176, longitude: 77.6225, eLoc: "mock-silk" },
            { placeName: "Koramangala Wipro Park", placeAddress: "80 Feet Road, Koramangala, Bengaluru", latitude: 12.9344, longitude: 77.6242, eLoc: "mock-wipro" },
            { placeName: "Varthur Road Hub", placeAddress: "Varthur Road, Whitefield, Bengaluru", latitude: 12.9550, longitude: 77.7470, eLoc: "mock-varthur" },
            { placeName: "Hebbal Flyover", placeAddress: "Bellary Road, Hebbal, Bengaluru", latitude: 13.0350, longitude: 77.5970, eLoc: "mock-hebbal" },
            { placeName: "Old Airport Road Junction", placeAddress: "HAL Old Airport Road, Bengaluru", latitude: 12.9602, longitude: 77.6791, eLoc: "mock-airport" }
          ];
          const { searchParams } = new URL(request.url);
          const q = searchParams.get("query") || "";
          const filtered = mockSuggestions.filter(s => 
            s.placeName.toLowerCase().includes(q.toLowerCase()) ||
            s.placeAddress.toLowerCase().includes(q.toLowerCase())
          );
          return new Response(JSON.stringify(filtered), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
    }
  }
});
