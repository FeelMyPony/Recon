"use client";

import { useState, useMemo } from "react";
import {
  Star,
  Search,
  ChevronDown,
  ChevronUp,
  Mail,
  Globe,
  Sparkles,
  MoreHorizontal,
  Download,
  Trash2,
  Tag,
  Loader2,
} from "lucide-react";
import { LeadDetail } from "./lead-detail";
import { trpc } from "../lib/trpc/client";
import { SEED_LEADS } from "@recon/outreach/seed-data";

/** Normalised lead shape used by the table */
interface TableLead {
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

function toTableLeads(raw: Array<Record<string, any>>): TableLead[] {
  return raw.map((l) => ({
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
    lat: Number(l.lat ?? 0),
    lng: Number(l.lng ?? 0),
    painPoints: l.painPoints ?? [],
  }));
}

type SortField = "name" | "rating" | "reviewCount" | "score" | "status";
type SortDir = "asc" | "desc";

const STATUS_CONFIG = {
  new: { label: "New", classes: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  qualified: { label: "Qualified", classes: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  contacted: { label: "Contacted", classes: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  proposal: { label: "Proposal", classes: "bg-purple-50 text-purple-700", dot: "bg-purple-500" },
  converted: { label: "Converted", classes: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  rejected: { label: "Rejected", classes: "bg-red-50 text-red-700", dot: "bg-red-400" },
};

const SCORE_CONFIG = {
  hot: { label: "Hot", classes: "text-red-500", bg: "bg-red-50", icon: "●●●", order: 0 },
  warm: { label: "Warm", classes: "text-amber-500", bg: "bg-amber-50", icon: "●●○", order: 1 },
  cold: { label: "Cold", classes: "text-blue-400", bg: "bg-blue-50", icon: "●○○", order: 2 },
  unscored: { label: "---", classes: "text-slate-300", bg: "bg-slate-50", icon: "○○○", order: 3 },
};

export function LeadsTable() {
  const [selectedLead, setSelectedLead] = useState<TableLead | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scoreFilter, setScoreFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("score");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Fetch leads from tRPC
  const { data: rawLeads, isLoading } = trpc.outreach.leads.list.useQuery(
    { limit: 100 },
    { retry: false },
  );

  // Use tRPC data if available, fall back to seed data
  const allLeads = toTableLeads(
    rawLeads && rawLeads.length > 0 ? rawLeads : [...SEED_LEADS],
  );

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const filteredLeads = useMemo(() => {
    let result = [...allLeads];

    if (statusFilter !== "all")
      result = result.filter((l) => l.status === statusFilter);
    if (scoreFilter !== "all")
      result = result.filter((l) => l.score === scoreFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.suburb.toLowerCase().includes(q) ||
          l.category.toLowerCase().includes(q) ||
          (l.email?.toLowerCase().includes(q) ?? false),
      );
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "rating":
          cmp = parseFloat(a.rating) - parseFloat(b.rating);
          break;
        case "reviewCount":
          cmp = a.reviewCount - b.reviewCount;
          break;
        case "score":
          cmp = SCORE_CONFIG[a.score].order - SCORE_CONFIG[b.score].order;
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return result;
  }, [allLeads, statusFilter, scoreFilter, searchQuery, sortField, sortDir]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredLeads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredLeads.map((l) => l.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronDown className="h-3 w-3 opacity-0 group-hover:opacity-30" />;
    return sortDir === "asc" ? (
      <ChevronUp className="h-3 w-3 text-brand-teal" />
    ) : (
      <ChevronDown className="h-3 w-3 text-brand-teal" />
    );
  };

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col">
        {/* Filter bar */}
        <div className="flex h-11 flex-shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4">
          <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search leads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-40 bg-transparent text-xs text-brand-navy-900 outline-none placeholder:text-slate-400"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="cursor-pointer rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-brand-navy-900 outline-none"
          >
            <option value="all">All Status</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          <select
            value={scoreFilter}
            onChange={(e) => setScoreFilter(e.target.value)}
            className="cursor-pointer rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-brand-navy-900 outline-none"
          >
            <option value="all">All Scores</option>
            <option value="hot">Hot</option>
            <option value="warm">Warm</option>
            <option value="cold">Cold</option>
          </select>

          {/* Bulk actions */}
          {selectedIds.size > 0 && (
            <div className="ml-2 flex items-center gap-1 rounded-md bg-brand-teal/10 px-2 py-1">
              <span className="text-xs font-medium text-brand-teal">
                {selectedIds.size} selected
              </span>
              <button className="rounded p-1 text-brand-teal hover:bg-brand-teal/10" title="Tag">
                <Tag className="h-3 w-3" />
              </button>
              <button className="rounded p-1 text-brand-teal hover:bg-brand-teal/10" title="Email">
                <Mail className="h-3 w-3" />
              </button>
              <button className="rounded p-1 text-brand-teal hover:bg-brand-teal/10" title="Export">
                <Download className="h-3 w-3" />
              </button>
            </div>
          )}

          <span className="ml-auto text-xs text-slate-400">
            {isLoading ? (
              <Loader2 className="inline h-3 w-3 animate-spin" />
            ) : (
              <>{filteredLeads.length} of {allLeads.length} leads</>
            )}
          </span>
        </div>

        {/* Table */}
        <div className="scrollbar-thin flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="sticky top-0 z-10 w-10 border-b border-slate-200 bg-slate-50 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredLeads.length && filteredLeads.length > 0}
                    onChange={toggleSelectAll}
                    className="h-3.5 w-3.5 rounded border-slate-300 accent-brand-teal"
                  />
                </th>
                <th
                  onClick={() => toggleSort("name")}
                  className="group sticky top-0 z-10 cursor-pointer border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left font-semibold text-slate-500"
                >
                  <span className="flex items-center gap-1">Business <SortIcon field="name" /></span>
                </th>
                <th className="sticky top-0 z-10 hidden border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-left font-semibold text-slate-500 lg:table-cell">
                  Category
                </th>
                <th className="sticky top-0 z-10 hidden border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-left font-semibold text-slate-500 sm:table-cell">
                  Location
                </th>
                <th
                  onClick={() => toggleSort("rating")}
                  className="group sticky top-0 z-10 cursor-pointer border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-center font-semibold text-slate-500"
                >
                  <span className="inline-flex items-center gap-1">Rating <SortIcon field="rating" /></span>
                </th>
                <th className="sticky top-0 z-10 hidden border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-center font-semibold text-slate-500 md:table-cell">
                  Contact
                </th>
                <th
                  onClick={() => toggleSort("score")}
                  className="group sticky top-0 z-10 cursor-pointer border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-center font-semibold text-slate-500"
                >
                  <span className="inline-flex items-center gap-1">Score <SortIcon field="score" /></span>
                </th>
                <th
                  onClick={() => toggleSort("status")}
                  className="group sticky top-0 z-10 cursor-pointer border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-center font-semibold text-slate-500"
                >
                  <span className="inline-flex items-center gap-1">Status <SortIcon field="status" /></span>
                </th>
                <th className="sticky top-0 z-10 w-10 border-b border-slate-200 bg-slate-50 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => {
                const st = STATUS_CONFIG[lead.status];
                const sc = SCORE_CONFIG[lead.score];
                const isSelected = selectedLead?.id === lead.id;
                const isChecked = selectedIds.has(lead.id);

                return (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className={`cursor-pointer border-b border-slate-100 transition-colors ${
                      isSelected
                        ? "bg-brand-teal/5"
                        : isChecked
                          ? "bg-blue-50/50"
                          : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelect(lead.id)}
                        className="h-3.5 w-3.5 rounded border-slate-300 accent-brand-teal"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-brand-navy-900">
                        {lead.name}
                      </div>
                      {lead.painPoints.length > 0 && (
                        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-600">
                          <Sparkles className="h-2.5 w-2.5" />
                          {lead.painPoints.length} pain point{lead.painPoints.length > 1 ? "s" : ""}
                        </div>
                      )}
                    </td>
                    <td className="hidden px-3 py-2.5 text-slate-500 lg:table-cell">
                      {lead.category}
                    </td>
                    <td className="hidden px-3 py-2.5 text-slate-500 sm:table-cell">
                      {lead.suburb}, {lead.state}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="inline-flex items-center gap-0.5 text-amber-500">
                        <Star className="h-3 w-3 fill-current" />
                        <span className="font-medium">{lead.rating}</span>
                      </span>
                      <span className="ml-1 text-slate-300">
                        ({lead.reviewCount})
                      </span>
                    </td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      <div className="flex items-center justify-center gap-1.5">
                        {lead.email ? (
                          <Mail className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Mail className="h-3.5 w-3.5 text-slate-200" />
                        )}
                        {lead.website ? (
                          <Globe className="h-3.5 w-3.5 text-blue-400" />
                        ) : (
                          <Globe className="h-3.5 w-3.5 text-slate-200" />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium ${sc.classes} ${sc.bg}`}>
                        {sc.icon} {sc.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${st.classes}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                        {st.label}
                      </span>
                    </td>
                    <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
