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
  CheckCircle2,
  Send,
  X,
} from "lucide-react";

// Mock sequences
const MOCK_SEQUENCES = [
  {
    id: "1",
    name: "NDIS Provider Outreach",
    active: true,
    steps: 3,
    enrolled: 24,
    sent: 67,
    opened: 41,
    replied: 8,
    openRate: 61,
    replyRate: 12,
  },
  {
    id: "2",
    name: "Allied Health Introduction",
    active: true,
    steps: 4,
    enrolled: 15,
    sent: 42,
    opened: 28,
    replied: 5,
    openRate: 67,
    replyRate: 12,
  },
  {
    id: "3",
    name: "Plan Manager Follow-up",
    active: false,
    steps: 2,
    enrolled: 8,
    sent: 16,
    opened: 9,
    replied: 2,
    openRate: 56,
    replyRate: 13,
  },
];

// Mock templates
const MOCK_TEMPLATES = [
  {
    id: "1",
    name: "Initial Outreach",
    subject: "Quick question about {{business_name}}",
    preview: "Hi {{contact_name}}, I noticed {{pain_point}} and wanted to reach out...",
    usedIn: 2,
  },
  {
    id: "2",
    name: "Follow Up #1",
    subject: "Following up - {{business_name}}",
    preview: "Hi {{contact_name}}, just circling back on my previous email...",
    usedIn: 2,
  },
  {
    id: "3",
    name: "Value Proposition",
    subject: "How we helped {{similar_business}} grow",
    preview: "Hi {{contact_name}}, I wanted to share a quick case study...",
    usedIn: 1,
  },
  {
    id: "4",
    name: "Breakup Email",
    subject: "Should I close your file?",
    preview: "Hi {{contact_name}}, I've reached out a few times now...",
    usedIn: 1,
  },
];

// Mock recent emails
const MOCK_EMAILS = [
  { id: "1", to: "info@activeability.com.au", business: "Active Ability Support", subject: "Quick question about Active Ability Support", status: "opened" as const, sentAt: "2h ago" },
  { id: "2", to: "admin@sunshinephysio.com.au", business: "Sunshine Physiotherapy", subject: "Following up - Sunshine Physiotherapy", status: "sent" as const, sentAt: "4h ago" },
  { id: "3", to: "hello@careconnect.com.au", business: "CareConnect Allied Health", subject: "How we helped similar providers grow", status: "replied" as const, sentAt: "1d ago" },
  { id: "4", to: "team@baysidesupport.com.au", business: "Bayside Support Coordination", subject: "Quick question about Bayside Support", status: "opened" as const, sentAt: "1d ago" },
  { id: "5", to: "admin@northerncc.org.au", business: "Northern Community Care", subject: "Quick question about Northern Community Care", status: "bounced" as const, sentAt: "2d ago" },
];

const EMAIL_STATUS = {
  draft: { label: "Draft", icon: Clock, classes: "text-slate-500 bg-slate-100" },
  queued: { label: "Queued", icon: Clock, classes: "text-blue-600 bg-blue-50" },
  sent: { label: "Sent", icon: Send, classes: "text-blue-600 bg-blue-50" },
  opened: { label: "Opened", icon: Eye, classes: "text-emerald-600 bg-emerald-50" },
  replied: { label: "Replied", icon: Reply, classes: "text-purple-600 bg-purple-50" },
  bounced: { label: "Bounced", icon: AlertTriangle, classes: "text-red-600 bg-red-50" },
};

type Tab = "sequences" | "templates" | "emails";

export default function OutreachPage() {
  const [activeTab, setActiveTab] = useState<Tab>("sequences");
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "sequences", label: "Sequences", count: MOCK_SEQUENCES.length },
    { id: "templates", label: "Templates", count: MOCK_TEMPLATES.length },
    { id: "emails", label: "Sent Emails", count: MOCK_EMAILS.length },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
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
            if (activeTab === "templates") setShowCreateTemplate(true);
          }}
          className="flex items-center gap-1.5 rounded-md bg-brand-teal px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-teal-600"
        >
          <Plus className="h-3.5 w-3.5" />
          {activeTab === "sequences" ? "New Sequence" : activeTab === "templates" ? "New Template" : "Compose"}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === "sequences" && <SequencesList />}
        {activeTab === "templates" && <TemplatesList />}
        {activeTab === "emails" && <EmailsList />}
      </div>

      {/* Create template modal */}
      {showCreateTemplate && (
        <TemplateEditor onClose={() => setShowCreateTemplate(false)} />
      )}
    </div>
  );
}

function SequencesList() {
  return (
    <div className="space-y-3">
      {MOCK_SEQUENCES.map((seq) => (
        <div
          key={seq.id}
          className="rounded-lg border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${seq.active ? "bg-brand-teal/10" : "bg-slate-100"}`}>
                <Mail className={`h-4 w-4 ${seq.active ? "text-brand-teal" : "text-slate-400"}`} />
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
                  {seq.steps} steps · {seq.enrolled} leads enrolled
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                {seq.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </button>
              <button className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-3 grid grid-cols-4 gap-3 rounded-md bg-slate-50 p-2.5">
            <div className="text-center">
              <div className="text-sm font-semibold text-brand-navy-900">{seq.sent}</div>
              <div className="text-[10px] text-slate-500">Sent</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-emerald-600">{seq.opened}</div>
              <div className="text-[10px] text-slate-500">Opened ({seq.openRate}%)</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-purple-600">{seq.replied}</div>
              <div className="text-[10px] text-slate-500">Replied ({seq.replyRate}%)</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-brand-navy-900">{seq.steps}</div>
              <div className="text-[10px] text-slate-500">Steps</div>
            </div>
          </div>

          {/* Step visualization */}
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
        </div>
      ))}
    </div>
  );
}

function TemplatesList() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {MOCK_TEMPLATES.map((tmpl) => (
        <div
          key={tmpl.id}
          className="group cursor-pointer rounded-lg border border-slate-200 bg-white p-4 transition-all hover:border-brand-teal/30 hover:shadow-sm"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-brand-teal/10">
                <Mail className="h-3.5 w-3.5 text-brand-teal" />
              </div>
              <h3 className="text-sm font-semibold text-brand-navy-900">{tmpl.name}</h3>
            </div>
            <button className="rounded p-1 text-slate-400 opacity-0 hover:bg-slate-100 group-hover:opacity-100">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-2.5 rounded-md bg-slate-50 p-2.5">
            <div className="text-xs font-medium text-brand-navy-900">{tmpl.subject}</div>
            <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
              {tmpl.preview}
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <Sparkles className="h-3 w-3" />
              Merge fields: {tmpl.subject.match(/\{\{.*?\}\}/g)?.length ?? 0}
            </div>
            <span className="text-[10px] text-slate-400">
              Used in {tmpl.usedIn} sequence{tmpl.usedIn > 1 ? "s" : ""}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmailsList() {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50">
            <th className="border-b border-slate-200 px-4 py-2.5 text-left font-semibold text-slate-500">Recipient</th>
            <th className="border-b border-slate-200 px-3 py-2.5 text-left font-semibold text-slate-500">Subject</th>
            <th className="border-b border-slate-200 px-3 py-2.5 text-center font-semibold text-slate-500">Status</th>
            <th className="border-b border-slate-200 px-3 py-2.5 text-right font-semibold text-slate-500">Sent</th>
          </tr>
        </thead>
        <tbody>
          {MOCK_EMAILS.map((email) => {
            const status = EMAIL_STATUS[email.status];
            const StatusIcon = status.icon;
            return (
              <tr key={email.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-brand-navy-900">{email.business}</div>
                  <div className="mt-0.5 text-[10px] text-slate-400">{email.to}</div>
                </td>
                <td className="px-3 py-2.5 text-slate-600">{email.subject}</td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${status.classes}`}>
                    <StatusIcon className="h-3 w-3" />
                    {status.label}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-slate-400">{email.sentAt}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TemplateEditor({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const mergeFields = ["{{business_name}}", "{{contact_name}}", "{{category}}", "{{suburb}}", "{{pain_point}}", "{{rating}}"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy-900/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-brand-navy-900">New Email Template</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Template Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Initial Outreach"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Subject Line</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Quick question about {{business_name}}"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Email Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your email template here. Use merge fields like {{business_name}} for personalisation..."
              rows={8}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          </div>

          {/* Merge fields */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Available Merge Fields
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

          <div className="flex items-center gap-2 rounded-md bg-brand-teal/5 p-2.5 text-xs text-teal-700">
            <Sparkles className="h-4 w-4 flex-shrink-0" />
            <span>AI can auto-generate personalised versions of this template for each lead using their review data and pain points.</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-slate-500">
            Cancel
          </button>
          <button
            onClick={onClose}
            className="rounded-md bg-brand-teal px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-teal-600"
          >
            Save Template
          </button>
        </div>
      </div>
    </div>
  );
}
