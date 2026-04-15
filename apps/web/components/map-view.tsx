"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Loader } from "@googlemaps/js-api-loader";
import {
  MarkerClusterer,
  SuperClusterAlgorithm,
} from "@googlemaps/markerclusterer";
import {
  Circle,
  Loader2,
  Map as MapIcon,
  MapPin,
  Pencil,
  Plus,
  Search,
  Target,
  X,
} from "lucide-react";
import { EmptyState } from "./empty-state";
// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

type LeadScore = "hot" | "warm" | "cold" | "unscored";
type LeadStatus =
  | "new"
  | "qualified"
  | "contacted"
  | "proposal"
  | "converted"
  | "rejected";

interface MapLead {
  id: string;
  name: string;
  category: string | null;
  lat: number;
  lng: number;
  status: LeadStatus;
  score: LeadScore;
  suburb: string | null;
  rating: string | null;
  reviewCount: number | null;
  email: string | null;
  phone: string | null;
}

const SCORE_COLORS: Record<LeadScore, string> = {
  hot: "#ef4444",
  warm: "#f59e0b",
  cold: "#60a5fa",
  unscored: "#94a3b8",
};

const MELBOURNE_CENTER = { lat: -37.814, lng: 144.963 };

// Dark mode map style (applied when no Map ID is supplied).
// Navy #0F1B2D base, aligns with RTT brand.
const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0F1B2D" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0F1B2D" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8892a8" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#cbd5e1" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#64748b" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#0a1624" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#1a2b47" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#0b1628" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#243b63" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#14243d" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#05101f" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#3b82f6" }],
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function toMapLeads<
  T extends {
    id: string;
    name: string;
    category: string | null;
    lat: number | null;
    lng: number | null;
    status: LeadStatus | null;
    score: LeadScore | null;
    suburb: string | null;
    rating: string | null;
    reviewCount: number | null;
    email: string | null;
    phone: string | null;
  },
>(rows: T[] | undefined): MapLead[] {
  if (!rows) return [];
  const out: MapLead[] = [];
  for (const r of rows) {
    if (r.lat == null || r.lng == null) continue;
    out.push({
      id: r.id,
      name: r.name,
      category: r.category,
      lat: r.lat,
      lng: r.lng,
      status: r.status ?? "new",
      score: r.score ?? "unscored",
      suburb: r.suburb,
      rating: r.rating,
      reviewCount: r.reviewCount,
      email: r.email,
      phone: r.phone,
    });
  }
  return out;
}

function buildMarkerIcon(score: LeadScore): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: SCORE_COLORS[score],
    fillOpacity: 1,
    strokeColor: "#0F1B2D",
    strokeWeight: 2,
    scale: 8,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function popupHtml(lead: MapLead): string {
  const rating =
    lead.rating != null
      ? `<div style="color:#fbbf24; font-size:12px;">★ ${escapeHtml(
          String(lead.rating),
        )}${
          lead.reviewCount ? " · " + lead.reviewCount + " reviews" : ""
        }</div>`
      : "";
  const contact = lead.email
    ? `<div style="color:#22d3ee; font-size:11px; margin-top:4px;">${escapeHtml(
        lead.email,
      )}</div>`
    : lead.phone
    ? `<div style="color:#22d3ee; font-size:11px; margin-top:4px;">${escapeHtml(
        lead.phone,
      )}</div>`
    : "";
  return `
    <div style="color:#e2e8f0; font-family: ui-sans-serif, system-ui; min-width:200px;">
      <div style="font-weight:600; font-size:14px; margin-bottom:2px; color:#fff;">${escapeHtml(
        lead.name,
      )}</div>
      <div style="color:#94a3b8; font-size:12px;">${escapeHtml(
        lead.category ?? "",
      )}${lead.suburb ? " · " + escapeHtml(lead.suburb) : ""}</div>
      ${rating}
      ${contact}
      <div style="margin-top:6px; display:flex; gap:4px; flex-wrap:wrap;">
        <span style="padding:2px 6px; border-radius:9999px; font-size:10px; background:${
          SCORE_COLORS[lead.score]
        }22; color:${SCORE_COLORS[lead.score]};">${lead.score}</span>
        <span style="padding:2px 6px; border-radius:9999px; font-size:10px; background:#1e293b; color:#cbd5e1;">${
          lead.status
        }</span>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────
// Fallback when no API key
// ─────────────────────────────────────────────────────────────────────────

function FallbackMap({ leads }: { leads: MapLead[] }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-slate-900 p-8 text-center">
      <MapPin className="h-12 w-12 text-slate-500" />
      <h3 className="text-lg font-semibold text-slate-200">
        Google Maps API key missing
      </h3>
      <p className="max-w-md text-sm text-slate-400">
        Add{" "}
        <code className="rounded bg-slate-800 px-1.5 py-0.5 text-teal-400">
          NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
        </code>{" "}
        to your environment, enable Maps JavaScript API and Places API in GCP,
        then redeploy.
      </p>
      <p className="text-xs text-slate-500">
        {leads.length} leads loaded (not displayed without API key).
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────

type DrawMode = "none" | "radius" | "polygon";

export function MapView() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;
  const router = useRouter();

  // Refs
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const polygonRef = useRef<google.maps.Polygon | null>(null);
  const polygonPointsRef = useRef<google.maps.Marker[]>([]);
  const clickListenerRef = useRef<google.maps.MapsEventListener | null>(null);

  // Filters + mode
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [scoreFilter, setScoreFilter] = useState<LeadScore | "all">("all");
  const [drawMode, setDrawMode] = useState<DrawMode>("none");
  const [radiusKm, setRadiusKm] = useState(5);
  const [circleCenter, setCircleCenter] =
    useState<google.maps.LatLngLiteral | null>(null);
  const [polygonPath, setPolygonPath] = useState<google.maps.LatLngLiteral[]>(
    [],
  );

  // Area scrape dialog
  const [areaQuery, setAreaQuery] = useState("");
  const [showAreaDialog, setShowAreaDialog] = useState(false);

  // Map lifecycle
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // ───────── Data queries ─────────
  const leadsQuery = trpc.outreach.leads.list.useQuery({
    limit: 100,
    status: statusFilter === "all" ? undefined : statusFilter,
    score: scoreFilter === "all" ? undefined : scoreFilter,
  });

  const nearbyEnabled = !!circleCenter && drawMode === "radius";
  const nearbyQuery = trpc.outreach.leads.nearby.useQuery(
    circleCenter
      ? {
          lat: circleCenter.lat,
          lng: circleCenter.lng,
          radiusKm,
          score: scoreFilter === "all" ? undefined : scoreFilter,
          limit: 200,
        }
      : { lat: 0, lng: 0, radiusKm: 1, limit: 1 },
    { enabled: nearbyEnabled },
  );

  const activeLeads: MapLead[] = useMemo(() => {
    if (nearbyEnabled && nearbyQuery.data) {
      return toMapLeads(nearbyQuery.data);
    }
    return toMapLeads(leadsQuery.data);
  }, [nearbyEnabled, nearbyQuery.data, leadsQuery.data]);

  // ───────── Create search mutation ─────────
  const utils = trpc.useUtils();
  const createSearch = trpc.outreach.searches.createFromArea.useMutation({
    onSuccess: (search) => {
      setShowAreaDialog(false);
      setAreaQuery("");
      utils.outreach.searches.list.invalidate();
      window.dispatchEvent(
        new CustomEvent("recon:toast", {
          detail: `Queued scrape for "${search.query}". The worker will pick it up shortly.`,
        }),
      );
    },
  });

  // ───────── Map init ─────────
  useEffect(() => {
    if (!apiKey || !mapDivRef.current || mapRef.current) return;

    const loader = new Loader({
      apiKey,
      version: "weekly",
      libraries: ["places", "geometry"],
    });

    loader
      .load()
      .then(() => {
        if (!mapDivRef.current) return;

        const mapOptions: google.maps.MapOptions = {
          center: MELBOURNE_CENTER,
          zoom: 10,
          mapId: mapId || undefined,
          styles: mapId ? undefined : DARK_MAP_STYLES,
          disableDefaultUI: false,
          zoomControl: true,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          backgroundColor: "#0F1B2D",
        };

        const map = new google.maps.Map(mapDivRef.current, mapOptions);
        mapRef.current = map;
        infoWindowRef.current = new google.maps.InfoWindow();
        setMapReady(true);
      })
      .catch((err) => {
        console.error("[map] Failed to load Google Maps", err);
        setMapError(err instanceof Error ? err.message : String(err));
      });
  }, [apiKey, mapId]);

  // ───────── Marker sync ─────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const map = mapRef.current;
    const existing = markersRef.current;
    const iw = infoWindowRef.current;
    const desiredIds = new Set(activeLeads.map((l) => l.id));

    for (const [id, marker] of existing) {
      if (!desiredIds.has(id)) {
        marker.setMap(null);
        existing.delete(id);
      }
    }

    const fresh: google.maps.Marker[] = [];
    for (const lead of activeLeads) {
      let marker = existing.get(lead.id);
      if (!marker) {
        marker = new google.maps.Marker({
          position: { lat: lead.lat, lng: lead.lng },
          title: lead.name,
          icon: buildMarkerIcon(lead.score),
        });
        const thisLead = lead;
        marker.addListener("click", () => {
          if (!iw) return;
          iw.setContent(popupHtml(thisLead));
          iw.open({ map, anchor: marker });
          window.dispatchEvent(
            new CustomEvent("recon:select-lead", { detail: thisLead.id }),
          );
        });
        existing.set(lead.id, marker);
      } else {
        marker.setPosition({ lat: lead.lat, lng: lead.lng });
        marker.setIcon(buildMarkerIcon(lead.score));
      }
      fresh.push(marker);
    }

    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
    }
    if (fresh.length > 0) {
      // Build reverse lookup: marker → leadId (for cluster bulk select)
      const markerToId = new Map<google.maps.Marker, string>();
      for (const [id, m] of existing) markerToId.set(m, id);

      clustererRef.current = new MarkerClusterer({
        map,
        markers: fresh,
        algorithm: new SuperClusterAlgorithm({ radius: 60, maxZoom: 14 }),
        onClusterClick: (event, cluster) => {
          const clusterMarkers = (cluster.markers ?? []) as google.maps.Marker[];
          const ids = clusterMarkers
            .map((m) => markerToId.get(m))
            .filter((x): x is string => Boolean(x));
          if (ids.length === 0) return;
          // Stash selection + navigate to leads table
          try {
            sessionStorage.setItem(
              "recon:bulk-select",
              JSON.stringify({ ids, ts: Date.now() }),
            );
          } catch {}
          router.push(`/leads?select=${ids.length}`);
        },
      });
    }
  }, [activeLeads, mapReady, router]);

  // ───────── Draw mode handlers ─────────
  const clearDrawing = useCallback(() => {
    if (circleRef.current) {
      circleRef.current.setMap(null);
      circleRef.current = null;
    }
    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }
    for (const m of polygonPointsRef.current) m.setMap(null);
    polygonPointsRef.current = [];
    setCircleCenter(null);
    setPolygonPath([]);
  }, []);

  const setMode = useCallback(
    (mode: DrawMode) => {
      clearDrawing();
      if (clickListenerRef.current) {
        clickListenerRef.current.remove();
        clickListenerRef.current = null;
      }
      setDrawMode(mode);

      if (!mapRef.current) return;
      const map = mapRef.current;

      if (mode === "radius") {
        clickListenerRef.current = map.addListener(
          "click",
          (e: google.maps.MapMouseEvent) => {
            if (!e.latLng) return;
            const center = { lat: e.latLng.lat(), lng: e.latLng.lng() };
            if (circleRef.current) circleRef.current.setMap(null);
            circleRef.current = new google.maps.Circle({
              map,
              center,
              radius: radiusKm * 1000,
              fillColor: "#00BFA6",
              fillOpacity: 0.12,
              strokeColor: "#00BFA6",
              strokeWeight: 2,
            });
            setCircleCenter(center);
          },
        );
      }

      if (mode === "polygon") {
        const pts: google.maps.LatLngLiteral[] = [];
        clickListenerRef.current = map.addListener(
          "click",
          (e: google.maps.MapMouseEvent) => {
            if (!e.latLng) return;
            const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
            pts.push(p);
            setPolygonPath([...pts]);

            const pointMarker = new google.maps.Marker({
              position: p,
              map,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 4,
                fillColor: "#00BFA6",
                fillOpacity: 1,
                strokeColor: "#fff",
                strokeWeight: 1,
              },
            });
            polygonPointsRef.current.push(pointMarker);

            if (polygonRef.current) polygonRef.current.setMap(null);
            if (pts.length >= 2) {
              polygonRef.current = new google.maps.Polygon({
                map,
                paths: pts,
                fillColor: "#00BFA6",
                fillOpacity: 0.12,
                strokeColor: "#00BFA6",
                strokeWeight: 2,
              });
            }
          },
        );
      }
    },
    [clearDrawing, radiusKm],
  );

  useEffect(() => {
    if (circleRef.current) circleRef.current.setRadius(radiusKm * 1000);
  }, [radiusKm]);

  const canSubmit =
    (drawMode === "radius" && !!circleCenter) ||
    (drawMode === "polygon" && polygonPath.length >= 3);

  const handleSubmitArea = () => {
    if (!canSubmit || !areaQuery.trim()) return;

    if (drawMode === "radius" && circleCenter) {
      createSearch.mutate({
        query: areaQuery.trim(),
        area: {
          type: "circle",
          centerLat: circleCenter.lat,
          centerLng: circleCenter.lng,
          radiusKm,
        },
      });
    } else if (drawMode === "polygon" && polygonPath.length >= 3) {
      createSearch.mutate({
        query: areaQuery.trim(),
        area: {
          type: "polygon",
          points: polygonPath,
        },
      });
    }
  };

  if (!apiKey) {
    return <FallbackMap leads={toMapLeads(leadsQuery.data)} />;
  }

  // Empty state — show when query has loaded and there are no leads at all
  if (!leadsQuery.isLoading && activeLeads.length === 0 && drawMode === "none") {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950">
        <EmptyState
          icon={MapIcon}
          title="No leads yet"
          description="Run your first search to see leads plotted on the map."
          actionLabel="New Search"
          onAction={() => {
            const btn = document.querySelector<HTMLButtonElement>(
              '[data-action="new-search"]',
            );
            btn?.click();
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-[600px] w-full overflow-hidden bg-slate-950">
      <div ref={mapDivRef} className="h-full w-full" />

      {mapError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/80">
          <div className="max-w-md rounded border border-red-900 bg-slate-900 p-4 text-sm text-red-300">
            Map failed to load: {mapError}
          </div>
        </div>
      )}

      {/* Top toolbar */}
      <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 shadow-lg backdrop-blur">
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as LeadStatus | "all")
            }
            className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200"
          >
            <option value="all">All statuses</option>
            <option value="new">New</option>
            <option value="qualified">Qualified</option>
            <option value="contacted">Contacted</option>
            <option value="proposal">Proposal</option>
          </select>
          <select
            value={scoreFilter}
            onChange={(e) =>
              setScoreFilter(e.target.value as LeadScore | "all")
            }
            className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200"
          >
            <option value="all">All scores</option>
            <option value="hot">Hot</option>
            <option value="warm">Warm</option>
            <option value="cold">Cold</option>
            <option value="unscored">Unscored</option>
          </select>

          <div className="mx-1 h-5 w-px bg-slate-700" />

          <button
            type="button"
            onClick={() => setMode(drawMode === "radius" ? "none" : "radius")}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
              drawMode === "radius"
                ? "bg-teal-500 text-slate-900"
                : "bg-slate-800 text-slate-200 hover:bg-slate-700"
            }`}
            title="Click a point to draw a radius"
          >
            <Circle className="h-3 w-3" /> Radius
          </button>
          <button
            type="button"
            onClick={() => setMode(drawMode === "polygon" ? "none" : "polygon")}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
              drawMode === "polygon"
                ? "bg-teal-500 text-slate-900"
                : "bg-slate-800 text-slate-200 hover:bg-slate-700"
            }`}
            title="Click multiple points to draw an area"
          >
            <Pencil className="h-3 w-3" /> Polygon
          </button>
          {drawMode !== "none" && (
            <button
              type="button"
              onClick={() => setMode("none")}
              className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {drawMode === "radius" && circleCenter && (
        <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-900/95 px-4 py-3 shadow-lg backdrop-blur">
          <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">
            <Target className="h-3 w-3" /> Radius: {radiusKm} km
          </div>
          <input
            type="range"
            min={1}
            max={50}
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            className="w-64 accent-teal-500"
          />
        </div>
      )}

      {canSubmit && !showAreaDialog && (
        <div className="absolute bottom-20 right-4 z-10 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowAreaDialog(true)}
            className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg hover:bg-teal-400"
          >
            <Plus className="h-4 w-4" /> Scrape this area
          </button>
        </div>
      )}

      {showAreaDialog && (
        <div className="absolute bottom-4 right-4 z-20 w-80 rounded-lg border border-slate-700 bg-slate-900 p-4 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              Scrape this area
            </h3>
            <button
              onClick={() => setShowAreaDialog(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <label className="mb-1 block text-xs text-slate-400">
            Business type to search
          </label>
          <input
            autoFocus
            value={areaQuery}
            onChange={(e) => setAreaQuery(e.target.value)}
            placeholder="e.g. physiotherapist, cafe, NDIS provider"
            className="mb-3 w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
          />
          <div className="mb-3 text-xs text-slate-500">
            {drawMode === "radius" && circleCenter ? (
              <>
                Circle: {radiusKm} km around {circleCenter.lat.toFixed(4)},{" "}
                {circleCenter.lng.toFixed(4)}
              </>
            ) : (
              <>Polygon: {polygonPath.length} points</>
            )}
          </div>
          <button
            onClick={handleSubmitArea}
            disabled={!areaQuery.trim() || createSearch.isPending}
            className="flex w-full items-center justify-center gap-2 rounded bg-teal-500 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createSearch.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Queuing...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" /> Queue scrape
              </>
            )}
          </button>
          {createSearch.error && (
            <p className="mt-2 text-xs text-red-400">
              {createSearch.error.message}
            </p>
          )}
        </div>
      )}

      <div className="absolute bottom-4 left-4 z-10 rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs text-slate-300 shadow-lg backdrop-blur">
        <div className="mb-1 font-semibold text-white">
          {activeLeads.length} leads
        </div>
        <div className="flex flex-col gap-0.5">
          {(["hot", "warm", "cold", "unscored"] as LeadScore[]).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: SCORE_COLORS[s] }}
              />
              <span className="capitalize">{s}</span>
            </div>
          ))}
        </div>
      </div>

      {(leadsQuery.isLoading || nearbyQuery.isFetching) && (
        <div className="absolute top-20 right-4 z-10 flex items-center gap-2 rounded bg-slate-900/90 px-3 py-1.5 text-xs text-slate-300">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading leads...
        </div>
      )}

    </div>
  );
}

export default MapView;
