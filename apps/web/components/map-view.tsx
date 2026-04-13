"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { LeadDetail } from "./lead-detail";
import { Filter, Search, Layers, ZoomIn, ZoomOut, Loader2, MapPin, X } from "lucide-react";
import { trpc } from "../lib/trpc/client";
import { SEED_LEADS } from "@recon/outreach/seed-data";

const SCORE_COLORS: Record<string, string> = {
  hot: "#ef4444",
  warm: "#f59e0b",
  cold: "#60a5fa",
  unscored: "#94a3b8",
};

// Mapbox dark style that matches our brand
const MAPBOX_DARK_STYLE = "mapbox://styles/mapbox/dark-v11";

/** Normalised lead shape used by the map */
interface MapLead {
  id: string;
  name: string;
  category: string;
  suburb: string;
  state: string;
  postcode: string;
  rating: string;
  reviewCount: number;
  email: string | null;
  phone: string | null;
  website: string | null;
  status: "new" | "qualified" | "contacted" | "proposal" | "converted" | "rejected";
  score: "hot" | "warm" | "cold" | "unscored";
  lat: number;
  lng: number;
  painPoints: string[];
}

function toMapLeads(
  raw: Array<Record<string, any>>,
): MapLead[] {
  return raw
    .filter((l) => l.lat != null && l.lng != null)
    .map((l) => ({
      id: l.id ?? crypto.randomUUID(),
      name: l.name ?? "",
      category: l.category ?? "",
      suburb: l.suburb ?? "",
      state: l.state ?? "",
      postcode: l.postcode ?? "",
      rating: String(l.rating ?? "0"),
      reviewCount: l.reviewCount ?? 0,
      email: l.email ?? null,
      phone: l.phone ?? null,
      website: l.website ?? null,
      status: l.status ?? "new",
      score: l.score ?? "unscored",
      lat: Number(l.lat),
      lng: Number(l.lng),
      painPoints: l.painPoints ?? [],
    }));
}

export function MapView() {
  const [selectedLead, setSelectedLead] = useState<MapLead | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [scoreFilter, setScoreFilter] = useState("all");
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  // Radius search state
  const [radiusMode, setRadiusMode] = useState(false);
  const [radiusCentre, setRadiusCentre] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState(10);

  // Fetch leads from tRPC (standard list)
  const { data: rawLeads, isLoading } = trpc.outreach.leads.list.useQuery(
    { limit: 100 },
    { retry: false, enabled: !radiusCentre },
  );

  // Fetch nearby leads when radius search is active
  const { data: nearbyLeads, isLoading: isLoadingNearby } = trpc.outreach.leads.nearby.useQuery(
    {
      lat: radiusCentre?.lat ?? 0,
      lng: radiusCentre?.lng ?? 0,
      radiusKm,
      limit: 200,
    },
    { retry: false, enabled: !!radiusCentre },
  );

  // Use nearby query when radius is set, otherwise standard list
  const activeData = radiusCentre ? nearbyLeads : rawLeads;
  const allLeads = toMapLeads(
    activeData && activeData.length > 0 ? activeData : [...SEED_LEADS],
  );

  const filteredLeads = allLeads.filter((lead) => {
    if (statusFilter !== "all" && lead.status !== statusFilter) return false;
    if (scoreFilter !== "all" && lead.score !== scoreFilter) return false;
    return true;
  });

  const hasMapboxToken = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  // Initialize Mapbox
  useEffect(() => {
    if (!hasMapboxToken || !mapContainer.current || mapRef.current) return;

    let cancelled = false;

    async function initMap() {
      const mapboxgl = (await import("mapbox-gl")).default;

      if (cancelled || !mapContainer.current) return;

      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: MAPBOX_DARK_STYLE,
        center: [144.963, -37.814], // Melbourne CBD
        zoom: 9.5,
        pitch: 0,
        attributionControl: false,
      });

      map.addControl(
        new mapboxgl.AttributionControl({ compact: true }),
        "bottom-left",
      );

      map.on("load", () => {
        if (!cancelled) {
          mapRef.current = map;
          setMapLoaded(true);

          // ── Leads GeoJSON source with clustering ──
          map.addSource("leads", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 50,
          });

          // Cluster circles
          map.addLayer({
            id: "clusters",
            type: "circle",
            source: "leads",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": [
                "step",
                ["get", "point_count"],
                "#00BFA6", // teal for small clusters
                10,
                "#f59e0b", // amber for medium
                50,
                "#ef4444", // red for large
              ],
              "circle-radius": [
                "step",
                ["get", "point_count"],
                16, 10, 22, 50, 30,
              ],
              "circle-opacity": 0.85,
              "circle-stroke-width": 2,
              "circle-stroke-color": "rgba(255,255,255,0.15)",
            },
          });

          // Cluster count labels
          map.addLayer({
            id: "cluster-count",
            type: "symbol",
            source: "leads",
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
              "text-size": 12,
            },
            paint: {
              "text-color": "#ffffff",
            },
          });

          // Individual unclustered lead points
          map.addLayer({
            id: "unclustered-point",
            type: "circle",
            source: "leads",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": [
                "match",
                ["get", "score"],
                "hot", "#ef4444",
                "warm", "#f59e0b",
                "cold", "#60a5fa",
                "#94a3b8", // unscored default
              ],
              "circle-radius": 7,
              "circle-stroke-width": 2,
              "circle-stroke-color": [
                "match",
                ["get", "score"],
                "hot", "rgba(239,68,68,0.3)",
                "warm", "rgba(245,158,11,0.3)",
                "cold", "rgba(96,165,250,0.3)",
                "rgba(148,163,184,0.3)",
              ],
            },
          });

          // ── Cluster click: zoom into cluster ──
          map.on("click", "clusters", (e: any) => {
            const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
            const feature = features?.[0];
            if (!feature?.properties) return;
            const clusterId = feature.properties.cluster_id;
            const coords = (feature.geometry as any).coordinates as [number, number];
            (map.getSource("leads") as any).getClusterExpansionZoom(
              clusterId,
              (err: any, zoom: number) => {
                if (err) return;
                map.easeTo({ center: coords, zoom });
              },
            );
          });

          // ── Point click: select lead ──
          map.on("click", "unclustered-point", (e: any) => {
            if (!e.features?.length) return;
            const props = e.features[0].properties;
            // Store lead ID so the effect can pick it up
            const detail = new CustomEvent("recon:select-lead", { detail: props.id });
            window.dispatchEvent(detail);
          });

          // Cursor changes
          map.on("mouseenter", "clusters", () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", "clusters", () => { map.getCanvas().style.cursor = ""; });
          map.on("mouseenter", "unclustered-point", () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", "unclustered-point", () => { map.getCanvas().style.cursor = ""; });

          // Add an empty GeoJSON source for the radius circle
          map.addSource("radius-circle", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
          map.addLayer({
            id: "radius-circle-fill",
            type: "fill",
            source: "radius-circle",
            paint: {
              "fill-color": "#00BFA6",
              "fill-opacity": 0.08,
            },
          });
          map.addLayer({
            id: "radius-circle-stroke",
            type: "line",
            source: "radius-circle",
            paint: {
              "line-color": "#00BFA6",
              "line-width": 1.5,
              "line-opacity": 0.4,
            },
          });
        }
      });
    }

    initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [hasMapboxToken]);

  // Update GeoJSON source when leads or filters change (clustering handled by Mapbox)
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const source = mapRef.current.getSource("leads");
    if (!source) return;

    const geojson = {
      type: "FeatureCollection" as const,
      features: filteredLeads.map((lead) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [lead.lng, lead.lat],
        },
        properties: {
          id: lead.id,
          name: lead.name,
          category: lead.category,
          suburb: lead.suburb,
          rating: lead.rating,
          reviewCount: lead.reviewCount,
          score: lead.score,
          status: lead.status,
        },
      })),
    };

    source.setData(geojson);
  }, [filteredLeads, mapLoaded]);

  // Listen for lead selection from the map click handler
  useEffect(() => {
    function handleSelect(e: Event) {
      const leadId = (e as CustomEvent).detail;
      const lead = filteredLeads.find((l) => l.id === leadId);
      if (lead) setSelectedLead(lead);
    }
    window.addEventListener("recon:select-lead", handleSelect);
    return () => window.removeEventListener("recon:select-lead", handleSelect);
  }, [filteredLeads]);

  // Handle map click in radius mode
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    function handleClick(e: any) {
      if (!radiusMode) return;
      setRadiusCentre({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      setRadiusMode(false); // exit placement mode after click
    }

    mapRef.current.on("click", handleClick);
    // Change cursor in radius mode
    if (radiusMode) {
      mapRef.current.getCanvas().style.cursor = "crosshair";
    } else {
      mapRef.current.getCanvas().style.cursor = "";
    }

    return () => {
      mapRef.current?.off("click", handleClick);
    };
  }, [radiusMode, mapLoaded]);

  // Draw radius circle on map
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const source = mapRef.current.getSource("radius-circle");
    if (!source) return;

    if (!radiusCentre) {
      source.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    // Generate a circle polygon (64 points)
    const steps = 64;
    const coords: [number, number][] = [];
    const earthRadiusKm = 6371;
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * 2 * Math.PI;
      const dLat = (radiusKm / earthRadiusKm) * (180 / Math.PI);
      const dLng =
        dLat / Math.cos((radiusCentre.lat * Math.PI) / 180);
      coords.push([
        radiusCentre.lng + dLng * Math.cos(angle),
        radiusCentre.lat + dLat * Math.sin(angle),
      ]);
    }

    source.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [coords] },
          properties: {},
        },
      ],
    });
  }, [radiusCentre, radiusKm, mapLoaded]);

  // Fly to selected lead
  useEffect(() => {
    if (!mapRef.current || !selectedLead) return;
    mapRef.current.flyTo({
      center: [selectedLead.lng, selectedLead.lat],
      zoom: 12,
      duration: 800,
    });
  }, [selectedLead]);

  return (
    <div className="flex h-full">
      {/* Map area */}
      <div className="relative flex-1">
        {/* Map filter overlay */}
        <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-brand-navy-900/80 px-3 py-1.5 backdrop-blur-sm">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={scoreFilter}
              onChange={(e) => setScoreFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-300 outline-none"
            >
              <option value="all" className="bg-brand-navy-900">All Scores</option>
              <option value="hot" className="bg-brand-navy-900">Hot</option>
              <option value="warm" className="bg-brand-navy-900">Warm</option>
              <option value="cold" className="bg-brand-navy-900">Cold</option>
            </select>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-brand-navy-900/80 px-3 py-1.5 backdrop-blur-sm">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-300 outline-none"
            >
              <option value="all" className="bg-brand-navy-900">All Status</option>
              <option value="new" className="bg-brand-navy-900">New</option>
              <option value="qualified" className="bg-brand-navy-900">Qualified</option>
              <option value="contacted" className="bg-brand-navy-900">Contacted</option>
              <option value="proposal" className="bg-brand-navy-900">Proposal</option>
            </select>
          </div>
        </div>

        {/* Radius search controls */}
        <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-2">
          {/* Lead count badge */}
          <div className="rounded-lg border border-white/10 bg-brand-navy-900/80 px-3 py-1.5 backdrop-blur-sm">
            <span className="font-mono text-xs text-brand-teal">
              {filteredLeads.length}
            </span>
            <span className="ml-1 text-xs text-slate-400">leads</span>
            {(isLoading || isLoadingNearby) && (
              <Loader2 className="ml-1.5 inline h-3 w-3 animate-spin text-brand-teal" />
            )}
          </div>

          {/* Radius search toggle */}
          {!radiusCentre ? (
            <button
              onClick={() => setRadiusMode(!radiusMode)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs backdrop-blur-sm transition-colors ${
                radiusMode
                  ? "border-brand-teal/50 bg-brand-teal/20 text-brand-teal"
                  : "border-white/10 bg-brand-navy-900/80 text-slate-400 hover:text-slate-200"
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              {radiusMode ? "Click map to set centre" : "Radius search"}
            </button>
          ) : (
            <div className="flex flex-col gap-1.5 rounded-lg border border-brand-teal/30 bg-brand-navy-900/80 px-3 py-2 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] uppercase tracking-wider text-brand-teal">Radius</span>
                <button
                  onClick={() => {
                    setRadiusCentre(null);
                    setRadiusMode(false);
                  }}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Number(e.target.value))}
                  className="h-1 w-24 accent-brand-teal"
                />
                <span className="font-mono text-xs text-slate-300">{radiusKm}km</span>
              </div>
            </div>
          )}
        </div>

        {/* Score legend */}
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 rounded-lg border border-white/10 bg-brand-navy-900/80 px-3 py-1.5 backdrop-blur-sm">
          {Object.entries(SCORE_COLORS).map(([score, color]) => (
            <div key={score} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: color }}
              />
              <span className="text-xs capitalize text-slate-400">{score}</span>
            </div>
          ))}
        </div>

        {hasMapboxToken ? (
          /* Real Mapbox map */
          <div ref={mapContainer} className="h-full w-full" />
        ) : (
          /* Fallback: styled SVG map when no Mapbox token */
          <FallbackMap
            leads={filteredLeads}
            selectedId={selectedLead?.id ?? null}
            onSelectLead={setSelectedLead}
          />
        )}
      </div>

      {/* Detail panel */}
      {selectedLead && (
        <div className="hidden w-80 flex-shrink-0 border-l border-slate-200 md:block">
          <LeadDetail
            lead={selectedLead}
            onClose={() => setSelectedLead(null)}
          />
        </div>
      )}
    </div>
  );
}

/** Fallback map when no Mapbox token is configured */
function FallbackMap({
  leads,
  selectedId,
  onSelectLead,
}: {
  leads: MapLead[];
  selectedId: string | null;
  onSelectLead: (lead: MapLead) => void;
}) {
  const toXY = (lat: number, lng: number) => {
    const x = ((lng - 144.0) / (145.5 - 144.0)) * 100;
    const y = ((lat - -38.3) / (-37.5 - -38.3)) * 100;
    return {
      x: Math.max(3, Math.min(97, x)),
      y: Math.max(3, Math.min(97, 100 - y)),
    };
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#1a1f2e]">
      {/* Grid */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.06]">
        {Array.from({ length: 30 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={`${(i / 30) * 100}%`} x2="100%" y2={`${(i / 30) * 100}%`} stroke="#00BFA6" strokeWidth="0.5" />
        ))}
        {Array.from({ length: 30 }, (_, i) => (
          <line key={`v${i}`} x1={`${(i / 30) * 100}%`} y1="0" x2={`${(i / 30) * 100}%`} y2="100%" stroke="#00BFA6" strokeWidth="0.5" />
        ))}
      </svg>

      {/* Region label */}
      <div className="absolute left-4 top-4 font-mono text-[10px] uppercase tracking-[0.2em] text-brand-teal/20">
        Melbourne Metropolitan Area
      </div>

      {/* No token notice */}
      <div className="absolute bottom-3 right-3 rounded bg-brand-navy-900/60 px-2 py-1 text-[10px] text-slate-500">
        Set NEXT_PUBLIC_MAPBOX_TOKEN for real map
      </div>

      {/* Lead pins */}
      {leads.map((lead) => {
        const pos = toXY(lead.lat, lead.lng);
        const isSelected = lead.id === selectedId;
        const color = SCORE_COLORS[lead.score] ?? "#94a3b8";

        return (
          <button
            key={lead.id}
            onClick={() => onSelectLead(lead)}
            className="group absolute -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-125"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          >
            {isSelected && (
              <span
                className="absolute -inset-1 animate-ping rounded-full opacity-75"
                style={{ background: `${color}30` }}
              />
            )}
            <span
              className="block rounded-full border-2"
              style={{
                width: isSelected ? 18 : 12,
                height: isSelected ? 18 : 12,
                background: color,
                borderColor: isSelected ? "#fff" : `${color}60`,
                boxShadow: `0 0 ${isSelected ? 14 : 8}px ${color}80`,
              }}
            />
            {/* Tooltip */}
            <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
              <div className="whitespace-nowrap rounded-md border border-slate-700 bg-brand-navy-900 px-2.5 py-1.5 text-left shadow-xl">
                <div className="text-xs font-semibold text-white">{lead.name}</div>
                <div className="mt-0.5 text-[10px] text-slate-400">
                  {lead.category} · {lead.suburb}
                </div>
                <div className="mt-0.5 text-[10px] text-amber-400">
                  ★ {lead.rating} ({lead.reviewCount} reviews)
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
