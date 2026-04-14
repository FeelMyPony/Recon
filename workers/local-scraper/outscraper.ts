/**
 * Outscraper API client.
 * Uses the same endpoint as the AWS Lambda scraper (workers/scraper/handler.ts)
 * so we stay consistent with the already-paid-for service.
 *
 * Docs: https://app.outscraper.com/api-docs#tag/Google/paths/~1maps~1search-v3/get
 *
 * Pricing: roughly $1 per 1000 businesses returned — far cheaper than Google
 * Places Text Search ($32 / 1000 queries of up to 20 places each).
 */

import { config } from "./config.ts";

export interface OutscraperPlace {
  name: string;
  place_id?: string;
  full_address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country_code?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  site?: string;
  subtypes?: string[];
  rating?: number;
  reviews?: number;
  working_hours?: string[];
  emails_and_contacts?: Array<{ email: string }>;
}

type OutscraperResponse = OutscraperPlace[][];

export interface CircleArea {
  type: "circle";
  centerLat: number;
  centerLng: number;
  radiusKm: number;
}

export interface PolygonArea {
  type: "polygon";
  points: Array<{ lat: number; lng: number }>;
}

export type Area = CircleArea | PolygonArea;

// ─────────────────────────────────────────────────────────────────────────
// Geo helpers
// ─────────────────────────────────────────────────────────────────────────

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function pointInPolygon(
  lat: number,
  lng: number,
  polygon: PolygonArea["points"],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]!.lng;
    const yi = polygon[i]!.lat;
    const xj = polygon[j]!.lng;
    const yj = polygon[j]!.lat;
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonCentroid(pts: PolygonArea["points"]): {
  lat: number;
  lng: number;
} {
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  return {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Nominatim reverse geocoding (free OpenStreetMap service)
// ─────────────────────────────────────────────────────────────────────────

interface NominatimResponse {
  address?: {
    suburb?: string;
    town?: string;
    city?: string;
    village?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
  display_name?: string;
}

/**
 * Reverse-geocode a lat/lng to a "Suburb, State" string Outscraper can use.
 * Caches nothing since the worker processes one search at a time.
 *
 * Nominatim asks for a non-empty User-Agent and requests the caller limits
 * requests to 1/second, which we respect naturally (one lookup per search).
 */
export async function reverseGeocodeToLocation(
  lat: number,
  lng: number,
): Promise<string> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("zoom", "14");
    url.searchParams.set("addressdetails", "1");

    const res = await fetch(url, {
      headers: {
        "User-Agent": "recon-local-scraper/0.1 (stefanf@realtimetraffic.com.au)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const data = (await res.json()) as NominatimResponse;

    const a = data.address ?? {};
    const locality = a.suburb ?? a.town ?? a.city ?? a.village;
    const state = a.state;
    const country = a.country ?? "Australia";

    if (locality && state) return `${locality}, ${state}, ${country}`;
    if (state) return `${state}, ${country}`;
    return data.display_name ?? `${lat.toFixed(4)},${lng.toFixed(4)}`;
  } catch (err) {
    console.warn(
      "[outscraper] Reverse geocode failed, falling back to coords:",
      err instanceof Error ? err.message : String(err),
    );
    // Fall back to raw coords. Outscraper / Google Maps accepts these
    // as part of a query string.
    return `${lat.toFixed(4)},${lng.toFixed(4)}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Outscraper call
// ─────────────────────────────────────────────────────────────────────────

async function callOutscraper(
  query: string,
  location: string,
  limit: number,
): Promise<OutscraperPlace[]> {
  const searchQuery = `${query} in ${location}`;

  console.log("[outscraper] Calling API", { query: searchQuery, limit });

  const res = await fetch("https://api.outscraper.com/maps/search-v3", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.outscraperApiKey,
    },
    body: JSON.stringify({
      query: searchQuery,
      limit,
      async: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Outscraper ${res.status}: ${errText.slice(0, 400)}`,
    );
  }

  const data = (await res.json()) as OutscraperResponse;
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error("Invalid Outscraper response shape");
  }
  return data[0];
}

// ─────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────

/**
 * Search businesses within a drawn area.
 *
 * Strategy:
 * 1. Reverse-geocode the area centre to a locality name.
 * 2. Query Outscraper with "{query} in {locality}".
 * 3. Filter returned places by the exact geometry (distance for circles,
 *    point-in-polygon for polygons) so we don't widen the search beyond
 *    what the user drew.
 *
 * The locality gives Outscraper a geographic anchor that Google Maps
 * understands; the client-side geometric filter gives us precise control
 * without paying for additional API queries.
 */
export async function searchPlacesInArea(
  query: string,
  area: Area,
  limit: number,
): Promise<OutscraperPlace[]> {
  // 1. Find the centre to anchor the query.
  const centre =
    area.type === "circle"
      ? { lat: area.centerLat, lng: area.centerLng }
      : polygonCentroid(area.points);

  // 2. Reverse geocode for a human-readable locality.
  const location = await reverseGeocodeToLocation(centre.lat, centre.lng);

  // 3. Query Outscraper. Ask for 1.5x the limit to compensate for places
  //    that will be filtered out as outside the drawn area.
  const overfetch = Math.min(Math.ceil(limit * 1.5), 100);
  const places = await callOutscraper(query, location, overfetch);

  console.log("[outscraper] Got", places.length, "raw results, filtering to area");

  // 4. Filter to the drawn area.
  const filtered = places.filter((p) => {
    if (p.latitude == null || p.longitude == null) return false;
    if (area.type === "circle") {
      return (
        haversineKm(
          area.centerLat,
          area.centerLng,
          p.latitude,
          p.longitude,
        ) <= area.radiusKm
      );
    }
    return pointInPolygon(p.latitude, p.longitude, area.points);
  });

  console.log(
    "[outscraper]",
    filtered.length,
    "places remain after area filter",
  );

  return filtered.slice(0, limit);
}
