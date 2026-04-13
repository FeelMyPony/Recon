"use client";

import { useState } from "react";
import {
  Building2,
  Key,
  Users,
  Bell,
  Palette,
  Globe,
  Save,
  ExternalLink,
  Copy,
  CheckCircle2,
} from "lucide-react";

type SettingsTab = "workspace" | "api" | "team" | "notifications";

const TABS = [
  { id: "workspace" as const, label: "Workspace", icon: Building2 },
  { id: "api" as const, label: "API Keys", icon: Key },
  { id: "team" as const, label: "Team", icon: Users },
  { id: "notifications" as const, label: "Notifications", icon: Bell },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("workspace");

  return (
    <div className="flex h-full">
      {/* Settings sidebar */}
      <div className="w-48 flex-shrink-0 border-r border-slate-200 bg-white p-3">
        <h2 className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Settings
        </h2>
        <nav className="space-y-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-brand-teal/10 text-brand-teal"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Settings content */}
      <div className="scrollbar-thin flex-1 overflow-auto p-6">
        {activeTab === "workspace" && <WorkspaceSettings />}
        {activeTab === "api" && <ApiKeysSettings />}
        {activeTab === "team" && <TeamSettings />}
        {activeTab === "notifications" && <NotificationSettings />}
      </div>
    </div>
  );
}

function WorkspaceSettings() {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h3 className="text-base font-semibold text-brand-navy-900">Workspace</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Manage your workspace settings and preferences
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Workspace Name</label>
          <input
            type="text"
            defaultValue="My Workspace"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Service Description</label>
          <textarea
            rows={3}
            defaultValue=""
            placeholder="Describe your service offering. This helps AI generate more relevant outreach emails."
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
          <p className="mt-1 text-[10px] text-slate-400">
            Used by AI when generating personalised outreach content
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Target Categories</label>
          <input
            type="text"
            defaultValue="NDIS Provider, Physiotherapist, Allied Health"
            placeholder="Comma-separated categories"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Default Search Location</label>
          <input
            type="text"
            defaultValue="Melbourne VIC"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
        </div>
      </div>

      <button className="flex items-center gap-2 rounded-md bg-brand-teal px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-teal-600">
        <Save className="h-4 w-4" />
        Save Changes
      </button>
    </div>
  );
}

function ApiKeysSettings() {
  const [copied, setCopied] = useState<string | null>(null);

  const keys = [
    { name: "Outscraper API Key", envVar: "OUTSCRAPER_API_KEY", configured: false },
    { name: "Anthropic API Key", envVar: "ANTHROPIC_API_KEY", configured: false },
    { name: "Mapbox Token", envVar: "NEXT_PUBLIC_MAPBOX_TOKEN", configured: false },
    { name: "Google OAuth", envVar: "AUTH_GOOGLE_ID", configured: false },
  ];

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h3 className="text-base font-semibold text-brand-navy-900">API Keys</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Configure external service integrations
        </p>
      </div>

      <div className="space-y-3">
        {keys.map((key) => (
          <div
            key={key.envVar}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3"
          >
            <div className="flex items-center gap-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${key.configured ? "bg-emerald-50" : "bg-slate-100"}`}>
                <Key className={`h-4 w-4 ${key.configured ? "text-emerald-500" : "text-slate-400"}`} />
              </div>
              <div>
                <div className="text-sm font-medium text-brand-navy-900">{key.name}</div>
                <div className="mt-0.5 font-mono text-[10px] text-slate-400">{key.envVar}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {key.configured ? (
                <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" />
                  Configured
                </span>
              ) : (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                  Not Set
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-700">
        API keys are stored in environment variables. Update your <code className="rounded bg-blue-100 px-1 py-0.5 font-mono">.env</code> file and restart the dev server.
      </div>
    </div>
  );
}

function TeamSettings() {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h3 className="text-base font-semibold text-brand-navy-900">Team</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Manage team members and roles
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-teal text-sm font-bold text-white">
            S
          </div>
          <div>
            <div className="text-sm font-medium text-brand-navy-900">You (Owner)</div>
            <div className="text-xs text-slate-500">stefan@recon.app</div>
          </div>
          <span className="ml-auto rounded-full bg-brand-teal/10 px-2 py-0.5 text-[10px] font-medium text-brand-teal">
            Owner
          </span>
        </div>
      </div>

      <button className="flex items-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-brand-navy-900 transition-colors hover:bg-slate-50">
        <Users className="h-4 w-4" />
        Invite Team Member
      </button>

      <p className="text-xs text-slate-400">
        Team member invitations coming in Phase 4.
      </p>
    </div>
  );
}

function NotificationSettings() {
  const notifications = [
    { label: "New leads scraped", description: "Get notified when a search completes", enabled: true },
    { label: "Email replies", description: "Get notified when a lead replies", enabled: true },
    { label: "Email bounces", description: "Get notified when an email bounces", enabled: true },
    { label: "Lead scored as Hot", description: "Get notified when AI scores a lead as hot", enabled: false },
    { label: "Weekly digest", description: "Summary of outreach activity", enabled: false },
  ];

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h3 className="text-base font-semibold text-brand-navy-900">Notifications</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Choose what events you want to be notified about
        </p>
      </div>

      <div className="space-y-2">
        {notifications.map((notif) => (
          <div
            key={notif.label}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3"
          >
            <div>
              <div className="text-sm font-medium text-brand-navy-900">{notif.label}</div>
              <div className="mt-0.5 text-xs text-slate-500">{notif.description}</div>
            </div>
            <button
              className={`relative h-5 w-9 rounded-full transition-colors ${
                notif.enabled ? "bg-brand-teal" : "bg-slate-200"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                  notif.enabled ? "left-4.5 translate-x-0" : "left-0.5"
                }`}
                style={{ left: notif.enabled ? "18px" : "2px" }}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
