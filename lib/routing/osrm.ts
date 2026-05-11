// lib/routing/osrm.ts

export async function getRoute(
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number
): Promise<{
    distance: number;
    duration: number;
    geometry: GeoJSON.LineString;
} | null> {
    if (
        !isFinite(startLat) || !isFinite(startLng) ||
        !isFinite(endLat) || !isFinite(endLng)
    ) {
        console.warn("[OSRM] Invalid coordinates provided to getRoute");
        return null;
    }

    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;

        // Add a 5s timeout to avoid hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            if (response.status === 429) {
                console.warn("[OSRM] Rate limited by public API");
            } else {
                console.error(`[OSRM] API error: ${response.status} ${response.statusText}`);
            }
            return null;
        }

        const data = await response.json();

        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
            console.warn("[OSRM] No route found:", data.code);
            return null;
        }

        const route = data.routes[0];

        return {
            distance: route.distance / 1000,
            duration: route.duration / 60,
            geometry: route.geometry as GeoJSON.LineString,
        };
    } catch (err: any) {
        if (err.name === 'AbortError') {
            console.warn("[OSRM] Request timed out");
        } else {
            console.error("[OSRM] Failed to fetch route:", err.message);
        }
        return null;
    }
}
