"use client";

import { useMemo, useState } from "react";
import {
  X,
  Star,
  Mail,
  Globe,
  Phone,
  Sparkles,
  Target,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";

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
  const [showCompose, setShowCompose] = useState(false);

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
          {!lead.email && !lead.phone && !lead.website && (
            <p className="text-xs italic text-slate-400">
              No contact details captured yet.
            </p>
          )}
        </div>

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

        {/* AI Analysis (fetched from DB) */}
        <LeadAnalysisSection leadId={lead.id} />

        {/* 3-step workflow */}
        <div className="space-y-2 px-4 py-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Outreach workflow
          </div>
          <DeepAnalyseButton leadId={lead.id} />
          <PitchPageButton leadId={lead.id} leadName={lead.name} />
          <button
            onClick={() => setShowCompose(true)}
            disabled={!lead.email}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-teal px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />{" "}
            {lead.email ? "Compose & Send Email" : "No email address"}
          </button>
        </div>
      </div>

      {showCompose && lead.email && (
        <ComposeEmailDialog
          lead={lead}
          onClose={() => setShowCompose(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// AI Analysis Section (fetches from review_analyses table)
// ─────────────────────────────────────────────────────────────────────────

function LeadAnalysisSection({ leadId }: { leadId: string }) {
  const { data: fullLead, isLoading } = trpc.outreach.leads.getById.useQuery(
    { id: leadId },
    { retry: false, staleTime: 60_000 },
  );

  const analysis = fullLead?.latestAnalysis;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-xs text-slate-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading analysis...
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="border-b border-slate-100 px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Target className="h-4 w-4 text-brand-teal" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          AI Review Analysis
        </h4>
      </div>

      {/* Summary */}
      {analysis.summary && (
        <p className="mb-2 text-xs leading-relaxed text-slate-600">
          {analysis.summary}
        </p>
      )}

      {/* Strengths */}
      {Array.isArray(analysis.strengths) && analysis.strengths.length > 0 && (
        <div className="mb-1.5">
          <span className="text-[10px] font-semibold uppercase text-emerald-600">
            Strengths
          </span>
          <div className="mt-0.5 space-y-0.5">
            {(analysis.strengths as string[]).map((s, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                <CheckCircle2 className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-400" />
                {s}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weaknesses */}
      {Array.isArray(analysis.weaknesses) && analysis.weaknesses.length > 0 && (
        <div className="mb-1.5">
          <span className="text-[10px] font-semibold uppercase text-red-500">
            Weaknesses
          </span>
          <div className="mt-0.5 space-y-0.5">
            {(analysis.weaknesses as string[]).map((w, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                <span className="mt-0.5 text-[10px] text-red-400">!</span>
                {w}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Opportunities */}
      {Array.isArray(analysis.opportunities) && analysis.opportunities.length > 0 && (
        <div>
          <span className="text-[10px] font-semibold uppercase text-blue-500">
            Opportunities
          </span>
          <div className="mt-0.5 space-y-0.5">
            {(analysis.opportunities as string[]).map((o, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                <Sparkles className="mt-0.5 h-3 w-3 flex-shrink-0 text-blue-400" />
                {o}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI rationale */}
      {analysis.aiRationale && (
        <div className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-[10px] text-slate-500">
          <strong>Score rationale:</strong> {analysis.aiRationale}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Pitch Page Button
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// Deep Analyse Button — fetches reviews + runs AI pain point extraction
// ─────────────────────────────────────────────────────────────────────────

function DeepAnalyseButton({ leadId }: { leadId: string }) {
  const utils = trpc.useUtils();
  const [lastResult, setLastResult] = useState<{
    reviewsInserted: number;
    painPointCount: number;
    newOpportunityScore: number;
  } | null>(null);

  const deepAnalyse = trpc.outreach.deepAnalyse.useMutation({
    onSuccess: (data) => {
      setLastResult({
        reviewsInserted: data.reviewsInserted,
        painPointCount: data.painPointCount,
        newOpportunityScore: data.newOpportunityScore,
      });
      // Invalidate queries so the lead-detail panel re-fetches the fresh analysis
      utils.outreach.leads.getById.invalidate({ id: leadId });
      utils.outreach.leads.list.invalidate();
    },
  });

  if (lastResult) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
        <CheckCircle2 className="h-4 w-4" />
        <span>
          Fetched {lastResult.reviewsInserted} reviews ·{" "}
          {lastResult.painPointCount} pain points · score{" "}
          {lastResult.newOpportunityScore}/100
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={() => deepAnalyse.mutate({ leadId })}
      disabled={deepAnalyse.isPending}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-100 disabled:opacity-50"
    >
      {deepAnalyse.isPending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Fetching reviews + analysing...
        </>
      ) : (
        <>
          <Target className="h-4 w-4" />
          Deep Analyse Reviews
        </>
      )}
      {deepAnalyse.error && (
        <span className="text-xs text-red-500">{deepAnalyse.error.message}</span>
      )}
    </button>
  );
}

function PitchPageButton({ leadId, leadName }: { leadId: string; leadName: string }) {
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

  const existingPages = trpc.outreach.pitchPages.getByLead.useQuery(
    { leadId },
    { retry: false, staleTime: 60_000 },
  );

  const generate = trpc.outreach.pitchPages.generate.useMutation({
    onSuccess: (data) => {
      setGeneratedUrl(data.url);
      existingPages.refetch();
    },
  });

  const latestPage = existingPages.data?.[0];

  if (latestPage && !generatedUrl) {
    return (
      <a
        href={`/api/pitch/${latestPage.urlSlug}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-brand-navy-900 transition-colors hover:bg-slate-50"
      >
        <Globe className="h-4 w-4" /> View Pitch Page
      </a>
    );
  }

  if (generatedUrl) {
    return (
      <a
        href={generatedUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700"
      >
        <CheckCircle2 className="h-4 w-4" /> Pitch Page Ready — View
      </a>
    );
  }

  return (
    <button
      onClick={() => generate.mutate({ leadId })}
      disabled={generate.isPending}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-brand-navy-900 transition-colors hover:bg-slate-50 disabled:opacity-50"
    >
      {generate.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Target className="h-4 w-4" />
      )}
      {generate.isPending ? "Generating Pitch Page..." : "Generate Pitch Page"}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Compose Email Dialog
// ─────────────────────────────────────────────────────────────────────────

function ComposeEmailDialog({
  lead,
  onClose,
}: {
  lead: Lead;
  onClose: () => void;
}) {
  const templatesQuery = trpc.outreach.templates.list.useQuery();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | "">("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saved, setSaved] = useState(false);

  const utils = trpc.useUtils();
  const createDraft = trpc.outreach.emails.createDraft.useMutation({
    onSuccess: () => {
      utils.outreach.emails.list.invalidate();
      setSaved(true);
      setTimeout(onClose, 1200);
    },
  });

  // Build merge-field map from lead data
  const mergeMap = useMemo(
    () => ({
      business_name: lead.name,
      contact_name: "there",
      category: lead.category,
      suburb: lead.suburb,
      rating: lead.rating,
      pain_point: lead.painPoints[0] ?? "the feedback in your reviews",
    }),
    [lead],
  );

  const applyMerge = (s: string): string =>
    s.replace(/\{\{([\w_]+)\}\}/g, (_, key) =>
      String(mergeMap[key as keyof typeof mergeMap] ?? `{{${key}}}`),
    );

  const handleTemplateChange = (id: string) => {
    setSelectedTemplateId(id);
    if (!id) {
      setSubject("");
      setBody("");
      return;
    }
    const tmpl = templatesQuery.data?.find((t) => t.id === id);
    if (tmpl) {
      setSubject(applyMerge(tmpl.subject));
      setBody(applyMerge(tmpl.body));
    }
  };

  // AI draft generation
  const aiDraft = trpc.outreach.aiDraft.useMutation({
    onSuccess: (data) => {
      setSubject(data.subject);
      setBody(data.body);
    },
  });

  const handleAiGenerate = () => {
    aiDraft.mutate({
      leadId: lead.id,
      templateId: selectedTemplateId || undefined,
    });
  };

  // Check for existing pitch page (to enable "attach proposal")
  const pitchPagesQuery = trpc.outreach.pitchPages.getByLead.useQuery(
    { leadId: lead.id },
    { retry: false, staleTime: 60_000 },
  );
  const hasPitchPage = (pitchPagesQuery.data?.length ?? 0) > 0;
  const [attachPdf, setAttachPdf] = useState(true);
  const [sent, setSent] = useState(false);

  // Send now: creates draft then sends it immediately
  const sendMut = trpc.outreach.emails.send.useMutation({
    onSuccess: () => {
      setSent(true);
      utils.outreach.emails.list.invalidate();
      utils.outreach.leads.list.invalidate();
      setTimeout(onClose, 1500);
    },
  });

  const handleSendNow = async () => {
    // Create the draft first, then immediately send it
    const draftResult = await createDraft.mutateAsync({
      leadId: lead.id,
      subject: subject.trim(),
      body: body.trim(),
    });
    if (draftResult?.id) {
      sendMut.mutate({
        emailId: draftResult.id,
        attachProposalPdf: hasPitchPage && attachPdf,
      });
    }
  };

  const canSave =
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    !createDraft.isPending &&
    !sendMut.isPending &&
    !saved &&
    !sent;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy-900/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-brand-navy-900">
              Compose Email
            </h2>
            <p className="text-xs text-slate-500">
              To: <span className="text-brand-navy-900">{lead.email}</span> ·{" "}
              {lead.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Start from template (optional)
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              disabled={templatesQuery.isLoading}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            >
              <option value="">— Write from scratch —</option>
              {(templatesQuery.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Quick question about your NDIS practice"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              placeholder="Write your email here..."
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          </div>

          {createDraft.error && (
            <div className="rounded-md bg-red-50 p-2.5 text-xs text-red-600">
              {createDraft.error.message}
            </div>
          )}

          {saved && (
            <div className="flex items-center gap-2 rounded-md bg-emerald-50 p-2.5 text-xs text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Draft saved. You can send it from Outreach → Sent Emails.
            </div>
          )}
        </div>

        {/* Error + success banners above footer */}
        {sendMut.error && (
          <div className="border-t border-red-100 bg-red-50 px-5 py-2 text-xs text-red-600">
            {sendMut.error.message}
          </div>
        )}
        {sent && (
          <div className="flex items-center gap-2 border-t border-emerald-100 bg-emerald-50 px-5 py-2 text-xs text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Email sent via Resend.
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleAiGenerate}
              disabled={aiDraft.isPending}
              className="flex items-center gap-1.5 rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100 disabled:opacity-50"
            >
              {aiDraft.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              {aiDraft.isPending ? "Generating..." : "AI Generate"}
            </button>

            {hasPitchPage && (
              <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={attachPdf}
                  onChange={(e) => setAttachPdf(e.target.checked)}
                  className="h-3 w-3 accent-brand-teal"
                />
                Attach proposal PDF
              </label>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-slate-500"
            >
              Cancel
            </button>
            <button
              onClick={() =>
                createDraft.mutate({
                  leadId: lead.id,
                  subject: subject.trim(),
                  body: body.trim(),
                })
              }
              disabled={!canSave}
              className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-brand-navy-900 hover:bg-slate-50 disabled:opacity-50"
            >
              {createDraft.isPending && !sendMut.isPending && (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
              Save Draft
            </button>
            <button
              onClick={handleSendNow}
              disabled={!canSave}
              className="flex items-center gap-1.5 rounded-md bg-brand-teal px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {(createDraft.isPending || sendMut.isPending) && (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
              <Mail className="h-3 w-3" />
              {sendMut.isPending ? "Sending..." : "Send Now"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
