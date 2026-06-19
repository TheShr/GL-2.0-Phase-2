import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  
  if (!query) {
    return NextResponse.json({ error: "Missing query parameter" }, { status: 400 });
  }

  const token = "rysmqsqzhyrdjzzdhxthpgdljebmkdipyjmb";
  const biasLat = 12.9716;
  const biasLon = 77.5946;

  const url = `https://atlas.mappls.com/api/places/geocode/autocomplete?access_token=${token}&query=${encodeURIComponent(query)}&location=${biasLat},${biasLon}`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) {
      throw new Error(`Mappls Autosuggest error: ${response.status}`);
    }
    const data = await response.json();
    return NextResponse.json(data.suggestedLocations || []);
  } catch (err: any) {
    console.error("Autosuggest proxy failed: ", err);
    // Return structured mock locations centered in Bengaluru if API fails/offline/rate-limited
    const mockSuggestions = [
      { placeName: "Silk Board Junction", placeAddress: "Outer Ring Road, Bengaluru", latitude: 12.9176, longitude: 77.6225 },
      { placeName: "Koramangala Wipro Park", placeAddress: "80 Feet Road, Koramangala, Bengaluru", latitude: 12.9344, longitude: 77.6242 },
      { placeName: "Varthur Road Hub", placeAddress: "Varthur Road, Whitefield, Bengaluru", latitude: 12.9550, longitude: 77.7470 },
      { placeName: "Hebbal Flyover", placeAddress: "Bellary Road, Hebbal, Bengaluru", latitude: 13.0350, longitude: 77.5970 },
      { placeName: "Old Airport Road Junction", placeAddress: "HAL Old Airport Road, Bengaluru", latitude: 12.9602, longitude: 77.6791 }
    ];
    // Filter suggestions based on query matches for a seamless developer feedback loop
    const filtered = mockSuggestions.filter(s => 
      s.placeName.toLowerCase().includes(query.toLowerCase()) ||
      s.placeAddress.toLowerCase().includes(query.toLowerCase())
    );
    return NextResponse.json(filtered);
  }
}
