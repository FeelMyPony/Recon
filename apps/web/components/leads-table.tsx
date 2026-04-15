"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
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
  Upload,
  Users,
  Target,
  Send,
  X,
  CheckCircle2,
} from "lucide-react";
import { LeadDetail } from "./lead-detail";
import { CsvImportDialog } from "./csv-import-dialog";
import { EmptyState } from "./empty-state";
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
  opportunityScore: number;
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
    opportunityScore: Number(l.opportunityScore ?? l.opportunity_score ?? 0),
    lat: Number(l.lat ?? 0),
    lng: Number(l.lng ?? 0),
    painPoints: l.painPoints ?? [],
  }));
}

type SortField = "name" | "rating" | "reviewCount" | "score" | "status" | "opportunityScore";
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

  // Hydrate selection from map cluster click (stored in sessionStorage)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem("recon:bulk-select");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { ids: string[]; ts: number };
      // Only honour if set within the last 30s (stale protection)
      if (Array.isArray(parsed.ids) && Date.now() - parsed.ts < 30_000) {
        setSelectedIds(new Set(parsed.ids));
      }
      sessionStorage.removeItem("recon:bulk-select");
    } catch {}
  }, []);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scoreFilter, setScoreFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("opportunityScore");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showBulkSend, setShowBulkSend] = useState(false);
  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    kind: "analyse" | "send" | "enroll";
    total: number;
    succeeded: number;
  } | null>(null);

  // Bulk deep analyse (fetches reviews + AI pain points for selected leads)
  const bulkAnalyse = trpc.outreach.bulkDeepAnalyse.useMutation({
    onSuccess: (data) => {
      setBulkResult({ kind: "analyse", total: data.total, succeeded: data.succeeded });
      utils.outreach.leads.list.invalidate();
      setSelectedIds(new Set());
    },
  });

  // Fetch leads from tRPC
  const utils = trpc.useUtils();
  const { data: rawLeads, isLoading } = trpc.outreach.leads.list.useQuery(
    { limit: 100 },
    { retry: false },
  );

  // Export CSV handler
  const handleExportCsv = useCallback(async () => {
    setIsExporting(true);
    try {
      const filters: { status?: string; score?: string; search?: string } = {};
      if (statusFilter !== "all") filters.status = statusFilter;
      if (scoreFilter !== "all") filters.score = scoreFilter;
      if (searchQuery) filters.search = searchQuery;

      const csvString = await utils.outreach.leads.exportCsv.fetch(
        Object.keys(filters).length > 0 ? filters : undefined,
      );

      const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "recon-leads-export.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[leads] CSV export failed:", err);
    } finally {
      setIsExporting(false);
    }
  }, [statusFilter, scoreFilter, searchQuery, utils]);

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
        case "opportunityScore":
          // Higher score = higher priority, so invert for "asc" intuition
          cmp = b.opportunityScore - a.opportunityScore;
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

  // Empty state when there are truly no leads from the database
  if (!isLoading && (!rawLeads || rawLeads.length === 0)) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState
          icon={Users}
          title="No leads in your workspace"
          description="Import a CSV or run a Google Maps search to get started."
          actions={[
            {
              label: "Import CSV",
              onClick: () => setShowImportDialog(true),
              variant: "secondary",
            },
            {
              label: "New Search",
              onClick: () => {
                const btn = document.querySelector<HTMLButtonElement>(
                  '[data-action="new-search"]',
                );
                btn?.click();
              },
              variant: "primary",
            },
          ]}
        />
        {showImportDialog && (
          <CsvImportDialog onClose={() => setShowImportDialog(false)} />
        )}
      </div>
    );
  }

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
            <div className="ml-2 flex items-center gap-1.5 rounded-md bg-brand-teal/10 px-2 py-1">
              <span className="text-xs font-medium text-brand-teal">
                {selectedIds.size} selected
              </span>
              <button
                onClick={() => {
                  if (selectedIds.size > 10) {
                    alert("Max 10 leads per bulk Deep Analyse (API cost + timeout).");
                    return;
                  }
                  bulkAnalyse.mutate({ leadIds: Array.from(selectedIds) });
                }}
                disabled={bulkAnalyse.isPending}
                className="flex items-center gap-1 rounded bg-purple-100 px-1.5 py-0.5 text-[11px] font-medium text-purple-700 hover:bg-purple-200 disabled:opacity-50"
                title="Fetch reviews + AI pain point extraction for each selected lead"
              >
                {bulkAnalyse.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Target className="h-3 w-3" />
                )}
                Deep Analyse
              </button>
              <button
                onClick={() => setShowBulkSend(true)}
                className="flex items-center gap-1 rounded bg-brand-teal px-1.5 py-0.5 text-[11px] font-medium text-white hover:bg-brand-teal-600"
                title="AI-draft + send email to each selected lead"
              >
                <Send className="h-3 w-3" />
                Bulk Send
              </button>
              <button
                onClick={() => setShowEnrollDialog(true)}
                className="flex items-center gap-1 rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-200"
                title="Enroll selected leads into a drip sequence"
              >
                <Users className="h-3 w-3" />
                Enroll
              </button>
              <button
                className="rounded p-1 text-brand-teal hover:bg-brand-teal/10"
                title="Export"
                onClick={handleExportCsv}
                disabled={isExporting}
              >
                {isExporting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Download className="h-3 w-3" />
                )}
              </button>
            </div>
          )}

          <button
            onClick={() => setShowImportDialog(true)}
            className="ml-2 flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-100"
          >
            <Upload className="h-3 w-3" />
            Import CSV
          </button>

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
                  onClick={() => toggleSort("opportunityScore")}
                  className="group sticky top-0 z-10 cursor-pointer border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-center font-semibold text-slate-500"
                >
                  <span className="inline-flex items-center gap-1">Opportunity <SortIcon field="opportunityScore" /></span>
                </th>
                <th
                  onClick={() => toggleSort("score")}
                  className="group sticky top-0 z-10 hidden cursor-pointer border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-center font-semibold text-slate-500 xl:table-cell"
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
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${lead.opportunityScore}%`,
                              background:
                                lead.opportunityScore >= 70
                                  ? "#00BFA6"
                                  : lead.opportunityScore >= 40
                                    ? "#f59e0b"
                                    : "#cbd5e1",
                            }}
                          />
                        </div>
                        <span className="w-7 text-right text-[11px] font-semibold tabular-nums text-brand-navy-900">
                          {lead.opportunityScore}
                        </span>
                      </div>
                    </td>
                    <td className="hidden px-3 py-2.5 text-center xl:table-cell">
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

      {/* Import CSV dialog */}
      {showImportDialog && (
        <CsvImportDialog
          onClose={() => setShowImportDialog(false)}
          onImportComplete={() => {
            utils.outreach.leads.list.invalidate();
          }}
        />
      )}

      {/* Bulk result banner */}
      {bulkResult && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 shadow-lg">
            <CheckCircle2 className="h-4 w-4" />
            <span>
              Bulk {bulkResult.kind}: {bulkResult.succeeded}/{bulkResult.total} succeeded
            </span>
            <button
              onClick={() => setBulkResult(null)}
              className="ml-1 rounded p-0.5 text-emerald-600 hover:bg-emerald-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Enroll in Sequence dialog */}
      {showEnrollDialog && (
        <EnrollInSequenceDialog
          leadIds={Array.from(selectedIds)}
          onClose={() => setShowEnrollDialog(false)}
          onComplete={(enrolled) => {
            setBulkResult({
              kind: "enroll",
              total: selectedIds.size,
              succeeded: enrolled,
            });
            setSelectedIds(new Set());
            setShowEnrollDialog(false);
          }}
        />
      )}

      {/* Bulk Send dialog */}
      {showBulkSend && (
        <BulkSendDialog
          selectedIds={Array.from(selectedIds)}
          leads={filteredLeads.filter((l) => selectedIds.has(l.id))}
          onClose={() => setShowBulkSend(false)}
          onComplete={(res) => {
            setBulkResult({
              kind: "send",
              total: res.total,
              succeeded: res.succeeded,
            });
            setSelectedIds(new Set());
            setShowBulkSend(false);
            utils.outreach.leads.list.invalidate();
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Bulk Send Dialog
// ─────────────────────────────────────────────────────────────────────────

function BulkSendDialog({
  selectedIds,
  leads,
  onClose,
  onComplete,
}: {
  selectedIds: string[];
  leads: TableLead[];
  onClose: () => void;
  onComplete: (res: { total: number; succeeded: number }) => void;
}) {
  const [templateId, setTemplateId] = useState<string | "">("");
  const [attachPdf, setAttachPdf] = useState(false);
  const [sendDelayMs, setSendDelayMs] = useState(2000);
  const [results, setResults] = useState<Array<{
    leadId: string;
    leadName?: string;
    ok: boolean;
    error?: string;
  }> | null>(null);

  const templatesQuery = trpc.outreach.templates.list.useQuery();

  const withoutEmail = leads.filter((l) => !l.email).length;
  const sendableCount = leads.length - withoutEmail;

  const bulkSend = trpc.outreach.bulkSend.useMutation({
    onSuccess: (data) => {
      setResults(data.results);
      // Close + report after 2s so user sees results
      setTimeout(() => {
        onComplete({ total: data.total, succeeded: data.succeeded });
      }, 2500);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy-900/60 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-brand-navy-900">
              Bulk Send
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              AI-draft + send personalised email to each selected lead
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {results ? (
          <div className="p-5">
            <div className="mb-3 text-sm font-semibold text-brand-navy-900">
              Results: {results.filter((r) => r.ok).length}/{results.length} sent
            </div>
            <div className="scrollbar-thin max-h-64 overflow-auto rounded-md border border-slate-200">
              {results.map((r, i) => (
                <div
                  key={r.leadId}
                  className={`flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs last:border-b-0 ${
                    r.ok ? "text-emerald-700" : "text-red-600"
                  }`}
                >
                  {r.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                  ) : (
                    <X className="h-3.5 w-3.5 flex-shrink-0" />
                  )}
                  <span className="flex-1 truncate">
                    {r.leadName ?? r.leadId}
                  </span>
                  {!r.ok && <span className="text-[10px]">{r.error}</span>}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-5">
            <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              <div>
                <strong>{sendableCount}</strong> of {leads.length} leads will receive emails
              </div>
              {withoutEmail > 0 && (
                <div className="mt-1 text-amber-600">
                  {withoutEmail} lead{withoutEmail > 1 ? "s" : ""} will be skipped (no email)
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Template (optional — AI uses as starting point)
              </label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900"
              >
                <option value="">— Generate from scratch (per-lead pain points) —</option>
                {(templatesQuery.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={attachPdf}
                onChange={(e) => setAttachPdf(e.target.checked)}
                className="h-3.5 w-3.5 accent-brand-teal"
              />
              Attach proposal PDF (only for leads with a pitch page)
            </label>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Delay between sends: {(sendDelayMs / 1000).toFixed(1)}s
              </label>
              <input
                type="range"
                min="0"
                max="10000"
                step="500"
                value={sendDelayMs}
                onChange={(e) => setSendDelayMs(Number(e.target.value))}
                className="w-full accent-brand-teal"
              />
              <p className="mt-1 text-[10px] text-slate-400">
                Anti-spam pacing. Recommended 2-5s for cold outreach.
              </p>
            </div>

            <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              <strong>Heads up:</strong> Each email is AI-generated + personalised using that lead&apos;s
              pain points. Requires your Resend API key to be set.
            </div>

            {bulkSend.error && (
              <div className="rounded-md bg-red-50 p-2.5 text-xs text-red-600">
                {bulkSend.error.message}
              </div>
            )}
          </div>
        )}

        {!results && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-slate-500"
            >
              Cancel
            </button>
            <button
              onClick={() =>
                bulkSend.mutate({
                  leadIds: selectedIds,
                  templateId: templateId || undefined,
                  attachProposalPdf: attachPdf,
                  sendDelayMs,
                })
              }
              disabled={bulkSend.isPending || sendableCount === 0}
              className="flex items-center gap-1.5 rounded-md bg-brand-teal px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-teal-600 disabled:opacity-50"
            >
              {bulkSend.isPending ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Sending {sendableCount}...
                </>
              ) : (
                <>
                  <Send className="h-3 w-3" />
                  Send to {sendableCount}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Enroll in Sequence Dialog
// ─────────────────────────────────────────────────────────────────────────

function EnrollInSequenceDialog({
  leadIds,
  onClose,
  onComplete,
}: {
  leadIds: string[];
  onClose: () => void;
  onComplete: (enrolled: number) => void;
}) {
  const sequencesQuery = trpc.outreach.sequences.list.useQuery();
  const [sequenceId, setSequenceId] = useState<string>("");

  const enroll = trpc.outreach.sequences.enroll.useMutation({
    onSuccess: (data) => onComplete(data.enrolled),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Enroll {leadIds.length} {leadIds.length === 1 ? "lead" : "leads"} in sequence
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <label className="block text-xs font-medium text-slate-700">
            Sequence
          </label>
          <select
            value={sequenceId}
            onChange={(e) => setSequenceId(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">Select a sequence…</option>
            {sequencesQuery.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.stepCount} step{s.stepCount === 1 ? "" : "s"})
              </option>
            ))}
          </select>

          <p className="text-xs text-slate-500">
            First email fires on the next hourly cron tick. Already-enrolled leads
            are skipped. Replies / bounces auto-stop progression.
          </p>

          {enroll.error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {enroll.error.message}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-500">
            Cancel
          </button>
          <button
            onClick={() => sequenceId && enroll.mutate({ sequenceId, leadIds })}
            disabled={!sequenceId || enroll.isPending}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {enroll.isPending ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Enrolling…
              </>
            ) : (
              <>
                <Users className="h-3 w-3" />
                Enroll {leadIds.length}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
