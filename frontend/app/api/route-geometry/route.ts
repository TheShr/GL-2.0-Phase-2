import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side proxy for route geometry.
 * Uses OSRM (Open Source Routing Machine) — free, no auth required,
 * returns navigation-grade road-snapped polyline geometry.
 *
 * Query params:
 *   start_lat, start_lng, end_lat, end_lng
 *
 * Returns OSRM response with routes[].geometry (encoded polyline, precision 5)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startLat = searchParams.get("start_lat");
    const startLng = searchParams.get("start_lng");
    const endLat = searchParams.get("end_lat");
    const endLng = searchParams.get("end_lng");

    if (!startLat || !startLng || !endLat || !endLng) {
      return NextResponse.json(
        { error: "Missing required params: start_lat, start_lng, end_lat, end_lng" },
        { status: 400 }
      );
    }

    // OSRM uses lng,lat order: {lng},{lat};{lng},{lat}
    const coordsStr = `${startLng},${startLat};${endLng},${endLat}`;
    const apiUrl = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=polyline&steps=true&alternatives=false`;

    console.log(`[Route Geometry API] OSRM request: ${apiUrl}`);

    const response = await fetch(apiUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "GridLock2.0/1.0",
      },
    });

    console.log(`[Route Geometry API] OSRM status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Route Geometry API] OSRM error: ${errorText}`);
      return NextResponse.json(
        { error: `OSRM returned ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    // OSRM returns: { code: "Ok", routes: [{ geometry: "encoded_polyline", legs: [...] }] }
    const routeCount = data?.routes?.length ?? 0;
    const geomLength = data?.routes?.[0]?.geometry?.length ?? 0;
    console.log(`[Route Geometry API] OSRM success — ${routeCount} route(s), geometry: ${geomLength} chars`);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[Route Geometry API] Server error:", error);
    return NextResponse.json(
      { error: "Failed to fetch route geometry", details: error.message },
      { status: 500 }
    );
  }
}
