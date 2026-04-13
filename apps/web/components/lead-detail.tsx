"use client";

import {
  X,
  Star,
  Mail,
  Globe,
  Phone,
  Sparkles,
  Target,
} from "lucide-react";

const STATUS_CONFIG = {
  new: { label: "New", classes: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  qualified: { label: "Qualified", classes: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  contacted: { label: "Contacted", classes: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  proposal: { label: "Proposal", classes: "bg-purple-50 text-purple-700", dot: "bg-purple-500" },
  converted: { label: "Converted", classes: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  rejected: { label: "Rejected", classes: "bg-red-50 text-red-700", dot: "bg-red-400" },
};

const SCORE_CONFIG = {
  hot: { label: "Hot", classes: "text-red-500", icon: "●●●" },
  warm: { label: "Warm", classes: "text-amber-500", icon: "●●○" },
  cold: { label: "Cold", classes: "text-blue-400", icon: "●○○" },
  unscored: { label: "---", classes: "text-slate-300", icon: "○○○" },
};

interface Lead {
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
  status: keyof typeof STATUS_CONFIG;
  score: keyof typeof SCORE_CONFIG;
  painPoints: string[];
}

export function LeadDetail({
  lead,
  onClose,
}: {
  lead: Lead;
  onClose: () => void;
}) {
  const st = STATUS_CONFIG[lead.status];
  const sc = SCORE_CONFIG[lead.score];

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-200 p-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-brand-navy-900">
            {lead.name}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {lead.category} · {lead.suburb}, {lead.state} {lead.postcode}
          </p>
        </div>
        <button
          onClick={onClose}
          className="ml-2 flex-shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {/* Status + Score */}
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${st.classes}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
            {st.label}
          </span>
          <span className={`font-mono text-xs ${sc.classes}`}>
            {sc.icon} {sc.label}
          </span>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 px-4 py-3">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-amber-500">
              <Star className="h-3.5 w-3.5 fill-current" />
              <span className="text-sm font-semibold text-brand-navy-900">
                {lead.rating}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-slate-400">Rating</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-semibold text-brand-navy-900">
              {lead.reviewCount}
            </div>
            <div className="mt-0.5 text-xs text-slate-400">Reviews</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center">
              <Mail
                className={`h-3.5 w-3.5 ${lead.email ? "text-emerald-500" : "text-slate-300"}`}
              />
            </div>
            <div className="mt-0.5 text-xs text-slate-400">
              {lead.email ? "Email" : "No email"}
            </div>
          </div>
        </div>

        {/* Contact details */}
        <div className="space-y-2 border-b border-slate-100 px-4 py-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Contact
          </h4>
          {lead.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-3.5 w-3.5 text-brand-teal" />
              <span className="text-brand-navy-900">{lead.email}</span>
            </div>
          )}
          {lead.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-brand-navy-900">{lead.phone}</span>
            </div>
          )}
          {lead.website && (
            <div className="flex items-center gap-2 text-sm">
              <Globe className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-brand-navy-900">{lead.website}</span>
            </div>
          )}
        </div>

        {/* AI Pain Points */}
        {lead.painPoints.length > 0 && (
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="mb-2 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-brand-teal" />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                AI-Detected Pain Points
              </h4>
            </div>
            <div className="space-y-1.5">
              {lead.painPoints.map((pp, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-md bg-amber-50 px-2 py-1.5 text-sm text-amber-800"
                >
                  <span className="mt-0.5 text-xs">⚠</span>
                  <span>{pp}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2 px-4 py-3">
          <button className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-teal px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-teal-600">
            <Sparkles className="h-4 w-4" /> Generate Outreach Email
          </button>
          <button className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-brand-navy-900 transition-colors hover:bg-slate-50">
            <Target className="h-4 w-4" /> Analyse Reviews
          </button>
        </div>
      </div>
    </div>
  );
}
