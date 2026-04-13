"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { LeadDetail } from "./lead-detail";
import { Filter, Search, Layers, ZoomIn, ZoomOut } from "lucide-react";

// Mock data — will be replaced with tRPC query
const MOCK_LEADS = [
  { id: "1", name: "Active Ability Support", category: "NDIS Provider", suburb: "Footscray", state: "VIC", postcode: "3011", rating: "4.2", reviewCount: 47, email: "info@activeability.com.au", phone: "03 9012 3456", website: "activeability.com.au", status: "new" as const, score: "hot" as const, lat: -37.800, lng: 144.899, painPoints: ["Slow response times mentioned in 3 reviews", "Communication gaps with families"] },
  { id: "2", name: "Sunshine Physiotherapy", category: "Physiotherapist", suburb: "Sunshine", state: "VIC", postcode: "3020", rating: "4.7", reviewCount: 123, email: "admin@sunshinephysio.com.au", phone: "03 9311 2200", website: "sunshinephysio.com.au", status: "qualified" as const, score: "warm" as const, lat: -37.788, lng: 144.833, painPoints: ["Parking difficulties noted", "Wait times for appointments"] },
  { id: "3", name: "Western Disability Services", category: "NDIS Provider", suburb: "Werribee", state: "VIC", postcode: "3030", rating: "3.8", reviewCount: 31, email: null, phone: "03 9741 0001", website: null, status: "new" as const, score: "hot" as const, lat: -37.899, lng: 144.661, painPoints: ["No website presence", "Invoicing delays mentioned twice", "Staff turnover concerns"] },
  { id: "4", name: "CareConnect Allied Health", category: "Allied Health", suburb: "Melton", state: "VIC", postcode: "3337", rating: "4.5", reviewCount: 89, email: "hello@careconnect.com.au", phone: "03 9747 8800", website: "careconnect.com.au", status: "contacted" as const, score: "warm" as const, lat: -37.683, lng: 144.578, painPoints: ["Limited weekend availability", "Booking system outdated"] },
  { id: "5", name: "Bayside Support Coordination", category: "Support Coordinator", suburb: "Brighton", state: "VIC", postcode: "3186", rating: "4.9", reviewCount: 67, email: "team@baysidesupport.com.au", phone: "03 9596 1100", website: "baysidesupport.com.au", status: "proposal" as const, score: "hot" as const, lat: -37.906, lng: 144.987, painPoints: ["Growing fast, may need better systems"] },
  { id: "6", name: "Northern Community Care", category: "NDIS Provider", suburb: "Reservoir", state: "VIC", postcode: "3073", rating: "3.5", reviewCount: 22, email: "admin@northerncc.org.au", phone: "03 9460 5500", website: "northerncc.org.au", status: "new" as const, score: "cold" as const, lat: -37.717, lng: 145.007, painPoints: ["Poor Google presence", "Only 22 reviews despite years operating"] },
  { id: "7", name: "Yarra Valley OT", category: "Occupational Therapist", suburb: "Lilydale", state: "VIC", postcode: "3140", rating: "4.8", reviewCount: 156, email: "bookings@yarravalleyot.com.au", phone: "03 9735 2000", website: "yarravalleyot.com.au", status: "new" as const, score: "unscored" as const, lat: -37.756, lng: 145.354, painPoints: [] },
  { id: "8", name: "Peninsula Plan Management", category: "Plan Manager", suburb: "Frankston", state: "VIC", postcode: "3199", rating: "4.1", reviewCount: 38, email: "plans@peninsulapm.com.au", phone: "03 9783 9000", website: "peninsulapm.com.au", status: "new" as const, score: "warm" as const, lat: -38.143, lng: 145.126, painPoints: ["Invoice processing delays", "Participant portal is confusing"] },
  { id: "9", name: "Dandenong Ranges Therapy", category: "Allied Health", suburb: "Belgrave", state: "VIC", postcode: "3160", rating: "4.6", reviewCount: 71, email: null, phone: "03 9754 1200", website: "drtherapy.com.au", status: "new" as const, score: "unscored" as const, lat: -37.909, lng: 145.354, painPoints: ["No email found on website"] },
  { id: "10", name: "Geelong Disability Network", category: "NDIS Provider", suburb: "Geelong", state: "VIC", postcode: "3220", rating: "3.9", reviewCount: 55, email: "contact@gdnetwork.com.au", phone: "03 5222 4000", website: "gdnetwork.com.au", status: "rejected" as const, score: "cold" as const, lat: -38.147, lng: 144.361, painPoints: ["Multiple complaints about billing", "Staff not returning calls"] },
];

type MockLead = (typeof MOCK_LEADS)[number];

const SCORE_COLORS: Record<string, string> = {
  hot: "#ef4444",
  warm: "#f59e0b",
  cold: "#60a5fa",
  unscored: "#94a3b8",
};

// Mapbox dark style that matches our brand
const MAPBOX_DARK_STYLE = "mapbox://styles/mapbox/dark-v11";

export function MapView() {
  const [selectedLead, setSelectedLead] = useState<MockLead | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [scoreFilter, setScoreFilter] = useState("all");
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  const filteredLeads = MOCK_LEADS.filter((lead) => {
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

  // Update markers when leads or filters change
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const mapboxgl = require("mapbox-gl");

    filteredLeads.forEach((lead) => {
      const color = SCORE_COLORS[lead.score] ?? "#94a3b8";
      const isSelected = selectedLead?.id === lead.id;
      const size = isSelected ? 18 : 12;

      // Create custom marker element
      const el = document.createElement("div");
      el.className = "recon-marker";
      el.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        border: 2px solid ${isSelected ? "#fff" : color + "60"};
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 0 ${isSelected ? 12 : 6}px ${color}80;
        transition: all 0.2s ease;
      `;

      el.addEventListener("mouseenter", () => {
        el.style.transform = "scale(1.3)";
      });
      el.addEventListener("mouseleave", () => {
        el.style.transform = "scale(1)";
      });
      el.addEventListener("click", () => {
        setSelectedLead(lead);
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lead.lng, lead.lat])
        .setPopup(
          new mapboxgl.Popup({
            offset: 15,
            closeButton: false,
            className: "recon-popup",
          }).setHTML(`
            <div style="font-family: Inter, system-ui; padding: 2px 0;">
              <div style="font-weight: 600; font-size: 12px; color: #0F1B2D;">${lead.name}</div>
              <div style="font-size: 11px; color: #64748B; margin-top: 2px;">${lead.category} · ${lead.suburb}</div>
              <div style="font-size: 11px; color: #f59e0b; margin-top: 2px;">★ ${lead.rating} (${lead.reviewCount})</div>
            </div>
          `),
        )
        .addTo(mapRef.current!);

      markersRef.current.push(marker);
    });
  }, [filteredLeads, selectedLead, mapLoaded]);

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

        {/* Lead count badge */}
        <div className="absolute right-3 top-3 z-10 rounded-lg border border-white/10 bg-brand-navy-900/80 px-3 py-1.5 backdrop-blur-sm">
          <span className="font-mono text-xs text-brand-teal">
            {filteredLeads.length}
          </span>
          <span className="ml-1 text-xs text-slate-400">leads</span>
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
  leads: MockLead[];
  selectedId: string | null;
  onSelectLead: (lead: MockLead) => void;
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
