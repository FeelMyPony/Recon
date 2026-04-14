"use client";

import { useState } from "react";
import {
  Mail,
  Plus,
  Play,
  Pause,
  MoreHorizontal,
  Eye,
  Reply,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  Clock,
  Send,
  X,
  Loader2,
  Trash2,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { EmptyState } from "@/components/empty-state";

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

type EmailStatusKey =
  | "draft"
  | "queued"
  | "sent"
  | "opened"
  | "replied"
  | "bounced";

const EMAIL_STATUS: Record<
  EmailStatusKey,
  { label: string; icon: typeof Clock; classes: string }
> = {
  draft: { label: "Draft", icon: Clock, classes: "text-slate-500 bg-slate-100" },
  queued: { label: "Queued", icon: Clock, classes: "text-blue-600 bg-blue-50" },
  sent: { label: "Sent", icon: Send, classes: "text-blue-600 bg-blue-50" },
  opened: {
    label: "Opened",
    icon: Eye,
    classes: "text-emerald-600 bg-emerald-50",
  },
  replied: {
    label: "Replied",
    icon: Reply,
    classes: "text-purple-600 bg-purple-50",
  },
  bounced: {
    label: "Bounced",
    icon: AlertTriangle,
    classes: "text-red-600 bg-red-50",
  },
};

type Tab = "sequences" | "templates" | "emails";

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

export default function OutreachPage() {
  const [activeTab, setActiveTab] = useState<Tab>("sequences");
  const [showTemplateEditor, setShowTemplateEditor] = useState<
    | { mode: "create" }
    | { mode: "edit"; template: TemplateRow }
    | null
  >(null);
  const [showSequenceDialog, setShowSequenceDialog] = useState(false);
  const [openSequenceId, setOpenSequenceId] = useState<string | null>(null);

  const sequencesQuery = trpc.outreach.sequences.list.useQuery();
  const templatesQuery = trpc.outreach.templates.list.useQuery();
  const emailsQuery = trpc.outreach.emails.list.useQuery({ limit: 50 });

  const tabs: { id: Tab; label: string; count: number }[] = [
    {
      id: "sequences",
      label: "Sequences",
      count: sequencesQuery.data?.length ?? 0,
    },
    {
      id: "templates",
      label: "Templates",
      count: templatesQuery.data?.length ?? 0,
    },
    { id: "emails", label: "Sent Emails", count: emailsQuery.data?.length ?? 0 },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-brand-teal/10 text-brand-teal"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={() => {
            if (activeTab === "templates") setShowTemplateEditor({ mode: "create" });
            if (activeTab === "sequences") setShowSequenceDialog(true);
          }}
          className="flex items-center gap-1.5 rounded-md bg-brand-teal px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-teal-600"
          disabled={activeTab === "emails"}
        >
          <Plus className="h-3.5 w-3.5" />
          {activeTab === "sequences"
            ? "New Sequence"
            : activeTab === "templates"
            ? "New Template"
            : "Compose"}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {activeTab === "sequences" && (
          <SequencesList
            sequences={sequencesQuery.data ?? []}
            loading={sequencesQuery.isLoading}
            onOpen={(id) => setOpenSequenceId(id)}
          />
        )}
        {activeTab === "templates" && (
          <TemplatesList
            templates={templatesQuery.data ?? []}
            loading={templatesQuery.isLoading}
            onEdit={(tmpl) =>
              setShowTemplateEditor({ mode: "edit", template: tmpl })
            }
          />
        )}
        {activeTab === "emails" && (
          <EmailsList
            emails={emailsQuery.data ?? []}
            loading={emailsQuery.isLoading}
          />
        )}
      </div>

      {showTemplateEditor && (
        <TemplateEditor
          mode={showTemplateEditor.mode}
          initial={
            showTemplateEditor.mode === "edit"
              ? showTemplateEditor.template
              : undefined
          }
          onClose={() => setShowTemplateEditor(null)}
        />
      )}

      {showSequenceDialog && (
        <SequenceCreateDialog onClose={() => setShowSequenceDialog(false)} />
      )}

      {openSequenceId && (
        <SequenceDetailDialog
          sequenceId={openSequenceId}
          onClose={() => setOpenSequenceId(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sequences
// ─────────────────────────────────────────────────────────────────────────

interface SequenceRow {
  id: string;
  workspaceId: string;
  name: string;
  active: boolean | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  steps: number;
  sent: number;
  opened: number;
  replied: number;
  openRate: number;
  replyRate: number;
}

function SequencesList({
  sequences,
  loading,
  onOpen,
}: {
  sequences: SequenceRow[];
  loading: boolean;
  onOpen: (id: string) => void;
}) {
  const utils = trpc.useUtils();
  const toggle = trpc.outreach.sequences.toggleActive.useMutation({
    onSuccess: () => utils.outreach.sequences.list.invalidate(),
  });
  const del = trpc.outreach.sequences.delete.useMutation({
    onSuccess: () => utils.outreach.sequences.list.invalidate(),
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading sequences...
      </div>
    );
  }

  if (sequences.length === 0) {
    return (
      <EmptyState
        icon={Mail}
        title="No sequences yet"
        description="Create your first email sequence to automate outreach."
      />
    );
  }

  return (
    <div className="space-y-3">
      {sequences.map((seq) => (
        <div
          key={seq.id}
          onClick={() => onOpen(seq.id)}
          className="cursor-pointer rounded-lg border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  seq.active ? "bg-brand-teal/10" : "bg-slate-100"
                }`}
              >
                <Mail
                  className={`h-4 w-4 ${
                    seq.active ? "text-brand-teal" : "text-slate-400"
                  }`}
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-brand-navy-900">
                    {seq.name}
                  </h3>
                  {seq.active ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                      Active
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                      Paused
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {seq.steps} step{seq.steps === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggle.mutate({
                    id: seq.id,
                    active: !(seq.active ?? false),
                  });
                }}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                title={seq.active ? "Pause" : "Activate"}
              >
                {seq.active ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete sequence "${seq.name}"?`)) {
                    del.mutate({ id: seq.id });
                  }
                }}
                className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-3 rounded-md bg-slate-50 p-2.5">
            <div className="text-center">
              <div className="text-sm font-semibold text-brand-navy-900">
                {seq.sent}
              </div>
              <div className="text-[10px] text-slate-500">Sent</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-emerald-600">
                {seq.opened}
              </div>
              <div className="text-[10px] text-slate-500">
                Opened ({seq.openRate}%)
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-purple-600">
                {seq.replied}
              </div>
              <div className="text-[10px] text-slate-500">
                Replied ({seq.replyRate}%)
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-brand-navy-900">
                {seq.steps}
              </div>
              <div className="text-[10px] text-slate-500">Steps</div>
            </div>
          </div>

          {seq.steps > 0 && (
            <div className="mt-3 flex items-center gap-1">
              {Array.from({ length: seq.steps }, (_, i) => (
                <div key={i} className="flex items-center">
                  <div className="flex h-6 items-center justify-center rounded bg-brand-teal/10 px-2 text-[10px] font-medium text-brand-teal">
                    Step {i + 1}
                  </div>
                  {i < seq.steps - 1 && (
                    <ChevronRight className="mx-0.5 h-3 w-3 text-slate-300" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SequenceCreateDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const utils = trpc.useUtils();
  const create = trpc.outreach.sequences.create.useMutation({
    onSuccess: () => {
      utils.outreach.sequences.list.invalidate();
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy-900/60 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-brand-navy-900">
            New Sequence
          </h2>
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
              Sequence Name
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., NDIS Provider Outreach"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          </div>
          <p className="text-xs text-slate-500">
            Steps can be added by editing the sequence after creation.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-slate-500"
          >
            Cancel
          </button>
          <button
            onClick={() => name.trim() && create.mutate({ name: name.trim() })}
            disabled={!name.trim() || create.isPending}
            className="flex items-center gap-1.5 rounded-md bg-brand-teal px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {create.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            Create
          </button>
        </div>
        {create.error && (
          <p className="px-5 pb-3 text-xs text-red-500">
            {create.error.message}
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────────────────

interface TemplateRow {
  id: string;
  workspaceId: string;
  name: string;
  subject: string;
  body: string;
  mergeFields: string[] | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  usedIn: number;
}

function TemplatesList({
  templates,
  loading,
  onEdit,
}: {
  templates: TemplateRow[];
  loading: boolean;
  onEdit: (tmpl: TemplateRow) => void;
}) {
  const utils = trpc.useUtils();
  const del = trpc.outreach.templates.delete.useMutation({
    onSuccess: () => utils.outreach.templates.list.invalidate(),
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading templates...
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <EmptyState
        icon={Mail}
        title="No templates yet"
        description="Create an email template to start personalising your outreach."
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {templates.map((tmpl) => {
        const mergeFieldCount = tmpl.mergeFields?.length ?? 0;
        const preview = tmpl.body.slice(0, 120).replace(/\n+/g, " ");
        return (
          <div
            key={tmpl.id}
            onClick={() => onEdit(tmpl)}
            className="group cursor-pointer rounded-lg border border-slate-200 bg-white p-4 transition-all hover:border-brand-teal/30 hover:shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-brand-teal/10">
                  <Mail className="h-3.5 w-3.5 text-brand-teal" />
                </div>
                <h3 className="text-sm font-semibold text-brand-navy-900">
                  {tmpl.name}
                </h3>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete template "${tmpl.name}"?`)) {
                    del.mutate({ id: tmpl.id });
                  }
                }}
                className="rounded p-1 text-slate-400 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-2.5 rounded-md bg-slate-50 p-2.5">
              <div className="text-xs font-medium text-brand-navy-900">
                {tmpl.subject}
              </div>
              <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
                {preview}
                {tmpl.body.length > 120 ? "..." : ""}
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <Sparkles className="h-3 w-3" />
                Merge fields: {mergeFieldCount}
              </div>
              <span className="text-[10px] text-slate-400">
                {tmpl.usedIn > 0
                  ? `Used in ${tmpl.usedIn} sequence${tmpl.usedIn > 1 ? "s" : ""}`
                  : "Unused"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TemplateEditor({
  mode,
  initial,
  onClose,
}: {
  mode: "create" | "edit";
  initial?: TemplateRow;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");

  const utils = trpc.useUtils();
  const createMut = trpc.outreach.templates.create.useMutation({
    onSuccess: () => {
      utils.outreach.templates.list.invalidate();
      onClose();
    },
  });
  const updateMut = trpc.outreach.templates.update.useMutation({
    onSuccess: () => {
      utils.outreach.templates.list.invalidate();
      onClose();
    },
  });

  const mergeFields = [
    "{{business_name}}",
    "{{contact_name}}",
    "{{category}}",
    "{{suburb}}",
    "{{pain_point}}",
    "{{rating}}",
  ];

  const canSave = name.trim() && subject.trim() && body.trim();
  const isPending = createMut.isPending || updateMut.isPending;
  const error = createMut.error?.message ?? updateMut.error?.message;

  const handleSave = () => {
    if (!canSave) return;
    if (mode === "edit" && initial) {
      updateMut.mutate({
        id: initial.id,
        name: name.trim(),
        subject: subject.trim(),
        body: body.trim(),
      });
    } else {
      createMut.mutate({
        name: name.trim(),
        subject: subject.trim(),
        body: body.trim(),
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy-900/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-brand-navy-900">
            {mode === "edit" ? "Edit Email Template" : "New Email Template"}
          </h2>
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
              Template Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Initial Outreach"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Subject Line
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Quick question about {{business_name}}"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Email Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your email template here. Use merge fields like {{business_name}} for personalisation..."
              rows={8}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Click to insert merge field
            </label>
            <div className="flex flex-wrap gap-1.5">
              {mergeFields.map((field) => (
                <button
                  key={field}
                  onClick={() => setBody(body + " " + field)}
                  className="rounded-md bg-brand-teal/10 px-2 py-1 text-[10px] font-medium text-brand-teal transition-colors hover:bg-brand-teal/20"
                >
                  {field}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-2.5 text-xs text-red-600">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-slate-500"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || isPending}
            className="flex items-center gap-1.5 rounded-md bg-brand-teal px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            {mode === "edit" ? "Save Changes" : "Save Template"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Emails
// ─────────────────────────────────────────────────────────────────────────

interface EmailRow {
  id: string;
  leadId: string;
  subject: string;
  toEmail: string;
  status: EmailStatusKey | null;
  sentAt: Date | null;
  createdAt: Date | null;
  businessName: string;
}

function EmailsList({
  emails,
  loading,
}: {
  emails: EmailRow[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading emails...
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <EmptyState
        icon={Send}
        title="No emails sent yet"
        description="Compose an email from a lead's detail panel to get started."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50">
            <th className="border-b border-slate-200 px-4 py-2.5 text-left font-semibold text-slate-500">
              Recipient
            </th>
            <th className="border-b border-slate-200 px-3 py-2.5 text-left font-semibold text-slate-500">
              Subject
            </th>
            <th className="border-b border-slate-200 px-3 py-2.5 text-center font-semibold text-slate-500">
              Status
            </th>
            <th className="border-b border-slate-200 px-3 py-2.5 text-right font-semibold text-slate-500">
              Sent
            </th>
          </tr>
        </thead>
        <tbody>
          {emails.map((email) => {
            const statusKey = (email.status ?? "draft") as EmailStatusKey;
            const status = EMAIL_STATUS[statusKey] ?? EMAIL_STATUS.draft;
            const StatusIcon = status.icon;
            const sentLabel = email.sentAt
              ? formatRelative(email.sentAt)
              : email.createdAt
              ? formatRelative(email.createdAt) + " (draft)"
              : "-";
            return (
              <tr
                key={email.id}
                className="border-b border-slate-100 hover:bg-slate-50"
              >
                <td className="px-4 py-2.5">
                  <div className="font-medium text-brand-navy-900">
                    {email.businessName}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-400">
                    {email.toEmail}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-slate-600">{email.subject}</td>
                <td className="px-3 py-2.5 text-center">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${status.classes}`}
                  >
                    <StatusIcon className="h-3 w-3" />
                    {status.label}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-slate-400">
                  {sentLabel}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────
// Sequence detail dialog with step management
// ─────────────────────────────────────────────────────────────────────────

function SequenceDetailDialog({
  sequenceId,
  onClose,
}: {
  sequenceId: string;
  onClose: () => void;
}) {
  const detailQuery = trpc.outreach.sequences.getById.useQuery({
    id: sequenceId,
  });
  const templatesQuery = trpc.outreach.templates.list.useQuery();

  const utils = trpc.useUtils();
  const invalidate = () => {
    utils.outreach.sequences.getById.invalidate({ id: sequenceId });
    utils.outreach.sequences.list.invalidate();
  };

  const addStep = trpc.outreach.sequences.addStep.useMutation({
    onSuccess: invalidate,
  });
  const updateStep = trpc.outreach.sequences.updateStep.useMutation({
    onSuccess: invalidate,
  });
  const removeStep = trpc.outreach.sequences.removeStep.useMutation({
    onSuccess: invalidate,
  });

  const [newTemplateId, setNewTemplateId] = useState<string>("");
  const [newDelay, setNewDelay] = useState<number>(3);

  const sequence = detailQuery.data;
  const templates = templatesQuery.data ?? [];

  const canAdd = !!newTemplateId && !addStep.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy-900/60 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-brand-navy-900">
              {sequence?.name ?? "Sequence"}
            </h2>
            <p className="text-xs text-slate-500">
              {sequence?.steps.length ?? 0} step
              {(sequence?.steps.length ?? 0) === 1 ? "" : "s"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {detailQuery.isLoading && (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
            </div>
          )}

          {sequence && (
            <>
              {sequence.steps.length === 0 && (
                <div className="mb-5 rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                  No steps yet. Add your first step below.
                </div>
              )}

              {sequence.steps.length > 0 && (
                <div className="mb-5 space-y-2">
                  {sequence.steps.map((step, idx) => {
                    const isFirst = idx === 0;
                    return (
                      <div
                        key={step.id}
                        className="rounded-lg border border-slate-200 bg-white p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-teal/10 text-xs font-semibold text-brand-teal">
                              {step.stepNumber}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-brand-navy-900">
                                {step.templateName ?? "(template removed)"}
                              </div>
                              <div className="mt-0.5 truncate text-xs text-slate-500">
                                {step.templateSubject ?? ""}
                              </div>
                              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-500">
                                <label className="flex items-center gap-1.5">
                                  <Clock className="h-3 w-3" />
                                  {isFirst ? "Send after" : "Wait"}{" "}
                                  <input
                                    type="number"
                                    min={0}
                                    max={90}
                                    defaultValue={step.delayDays ?? 0}
                                    onBlur={(e) => {
                                      const v = Number(e.target.value);
                                      if (v !== step.delayDays) {
                                        updateStep.mutate({
                                          id: step.id,
                                          delayDays: v,
                                        });
                                      }
                                    }}
                                    className="w-12 rounded border border-slate-200 px-1 py-0.5 text-center text-xs"
                                  />
                                  day{(step.delayDays ?? 0) === 1 ? "" : "s"}{" "}
                                  {isFirst ? "of enrolment" : "after previous"}
                                </label>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              if (confirm(`Remove step ${step.stepNumber}?`)) {
                                removeStep.mutate({ id: step.id });
                              }
                            }}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            title="Remove step"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add step form */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-xs font-semibold text-slate-600">
                  Add step
                </div>
                {templates.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Create a template first (Templates tab) to add it as a step.
                  </p>
                ) : (
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-400">
                        Template
                      </label>
                      <select
                        value={newTemplateId}
                        onChange={(e) => setNewTemplateId(e.target.value)}
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
                      >
                        <option value="">— Pick a template —</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-400">
                        Delay (days)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={90}
                        value={newDelay}
                        onChange={(e) => setNewDelay(Number(e.target.value))}
                        className="w-20 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-center text-xs text-brand-navy-900"
                      />
                    </div>
                    <button
                      onClick={() =>
                        addStep.mutate({
                          sequenceId,
                          templateId: newTemplateId,
                          delayDays: newDelay,
                        })
                      }
                      disabled={!canAdd}
                      className="flex items-center gap-1.5 rounded-md bg-brand-teal px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {addStep.isPending && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      Add
                    </button>
                  </div>
                )}
                {addStep.error && (
                  <p className="mt-2 text-xs text-red-500">
                    {addStep.error.message}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md bg-brand-teal px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-teal-600"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function formatRelative(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}
