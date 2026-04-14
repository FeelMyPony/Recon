"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Key,
  Users,
  Bell,
  Save,
  CheckCircle2,
  Loader2,
  Plus,
  X,
  Trash2,
  Shield,
  Crown,
  UserCheck,
  Eye,
  Clock,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";

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
  const wsQuery = trpc.outreach.workspace.get.useQuery();
  const utils = trpc.useUtils();
  const updateMut = trpc.outreach.workspace.update.useMutation({
    onSuccess: () => {
      utils.outreach.workspace.get.invalidate();
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    },
  });

  const [name, setName] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [targetCategories, setTargetCategories] = useState("");
  const [defaultLocation, setDefaultLocation] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Hydrate form from fetched workspace once
  useEffect(() => {
    if (!hydrated && wsQuery.data) {
      setName(wsQuery.data.name ?? "");
      const s = wsQuery.data.settings ?? {};
      setServiceDescription(s.serviceDescription ?? "");
      setTargetCategories((s.targetCategories ?? []).join(", "));
      setDefaultLocation(s.defaultLocation ?? "");
      setHydrated(true);
    }
  }, [wsQuery.data, hydrated]);

  const handleSave = () => {
    const categories = targetCategories
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    updateMut.mutate({
      name: name.trim() || undefined,
      settings: {
        serviceDescription: serviceDescription.trim(),
        targetCategories: categories,
        defaultLocation: defaultLocation.trim(),
      },
    });
  };

  const isLoading = wsQuery.isLoading;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h3 className="text-base font-semibold text-brand-navy-900">
          Workspace
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Manage your workspace settings and preferences
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading workspace...
        </div>
      ) : (
        <>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Workspace Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Service Description
              </label>
              <textarea
                rows={3}
                value={serviceDescription}
                onChange={(e) => setServiceDescription(e.target.value)}
                placeholder="Describe your service offering. This helps AI generate more relevant outreach emails."
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
              />
              <p className="mt-1 text-[10px] text-slate-400">
                Used by the LLM when generating personalised outreach content
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Target Categories
              </label>
              <input
                type="text"
                value={targetCategories}
                onChange={(e) => setTargetCategories(e.target.value)}
                placeholder="NDIS Provider, Traffic Management, Construction"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
              />
              <p className="mt-1 text-[10px] text-slate-400">
                Comma-separated. Used to bias scoring toward preferred verticals.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Default Search Location
              </label>
              <input
                type="text"
                value={defaultLocation}
                onChange={(e) => setDefaultLocation(e.target.value)}
                placeholder="Melbourne VIC"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={updateMut.isPending}
              className="flex items-center gap-2 rounded-md bg-brand-teal px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {updateMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Changes
            </button>
            {savedFlash && (
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Saved
              </span>
            )}
            {updateMut.error && (
              <span className="text-xs text-red-500">
                {updateMut.error.message}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ApiKeysSettings() {
  // NEXT_PUBLIC_* is the only browser-accessible key we can check from the
  // client. Server-only keys are inspected on the server.
  const configured = {
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: Boolean(
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    ),
  };

  const keys = [
    {
      name: "Google Maps API Key",
      envVar: "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
      configured: configured.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
      description: "Browser-facing key for map display",
    },
    {
      name: "Outscraper API Key",
      envVar: "OUTSCRAPER_API_KEY",
      configured: null,
      description: "Server-side, used by local scraper worker",
    },
    {
      name: "LM Studio endpoint",
      envVar: "LM_STUDIO_BASE_URL",
      configured: null,
      description: "Local Gemma scoring. Default http://localhost:1234/v1",
    },
    {
      name: "Anthropic API Key",
      envVar: "ANTHROPIC_API_KEY",
      configured: null,
      description: "Claude. For review analysis (not yet wired)",
    },
    {
      name: "Google OAuth",
      envVar: "AUTH_GOOGLE_ID",
      configured: null,
      description: "Sign-in. You're already logged in so this works.",
    },
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
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  key.configured === true ? "bg-emerald-50" : "bg-slate-100"
                }`}
              >
                <Key
                  className={`h-4 w-4 ${
                    key.configured === true
                      ? "text-emerald-500"
                      : "text-slate-400"
                  }`}
                />
              </div>
              <div>
                <div className="text-sm font-medium text-brand-navy-900">
                  {key.name}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                  {key.envVar}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">
                  {key.description}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {key.configured === true ? (
                <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" />
                  Configured
                </span>
              ) : key.configured === false ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                  Not Set
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  Server only
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

const ROLE_CONFIG = {
  owner: { label: "Owner", icon: Crown, color: "bg-amber-50 text-amber-700" },
  admin: { label: "Admin", icon: Shield, color: "bg-purple-50 text-purple-700" },
  member: { label: "Member", icon: UserCheck, color: "bg-brand-teal/10 text-brand-teal" },
  viewer: { label: "Viewer", icon: Eye, color: "bg-slate-100 text-slate-600" },
} as const;

function TeamSettings() {
  const membersQuery = trpc.outreach.workspace.members.useQuery();
  const utils = trpc.useUtils();

  const inviteMut = trpc.outreach.workspace.invite.useMutation({
    onSuccess: () => {
      utils.outreach.workspace.members.invalidate();
      setShowInvite(false);
      setInviteEmail("");
      setInviteRole("member");
    },
  });

  const removeMut = trpc.outreach.workspace.removeMember.useMutation({
    onSuccess: () => utils.outreach.workspace.members.invalidate(),
  });

  const updateRoleMut = trpc.outreach.workspace.updateRole.useMutation({
    onSuccess: () => utils.outreach.workspace.members.invalidate(),
  });

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");

  const members = membersQuery.data ?? [];

  const handleInvite = () => {
    if (!inviteEmail.trim()) return;
    inviteMut.mutate({ email: inviteEmail.trim(), role: inviteRole });
  };

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-brand-navy-900">Team</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Manage team members and roles
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 rounded-md bg-brand-teal px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-teal-600"
        >
          <Plus className="h-3.5 w-3.5" />
          Invite Member
        </button>
      </div>

      {/* Invite dialog */}
      {showInvite && (
        <div className="rounded-lg border border-brand-teal/30 bg-brand-teal/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-brand-navy-900">
              Invite Team Member
            </h4>
            <button
              onClick={() => {
                setShowInvite(false);
                setInviteEmail("");
                setInviteRole("member");
                inviteMut.reset();
              }}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
            />
            <select
              value={inviteRole}
              onChange={(e) =>
                setInviteRole(e.target.value as "admin" | "member" | "viewer")
              }
              className="rounded-md border border-slate-200 px-2 py-2 text-sm text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            >
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleInvite}
              disabled={inviteMut.isPending || !inviteEmail.trim()}
              className="flex items-center gap-2 rounded-md bg-brand-teal px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {inviteMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Users className="h-3.5 w-3.5" />
              )}
              Send Invite
            </button>
            {inviteMut.error && (
              <span className="text-xs text-red-500">
                {inviteMut.error.message}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Members list */}
      {membersQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading team...
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((member) => {
            const isPending = !member.acceptedAt && member.role !== "owner";
            const roleKey = member.role as keyof typeof ROLE_CONFIG;
            const config = ROLE_CONFIG[roleKey] ?? ROLE_CONFIG.member;
            const RoleIcon = config.icon;
            const displayName =
              member.userName ??
              member.invitedEmail ??
              member.userEmail ??
              "Unknown";
            const displayEmail =
              member.userEmail ?? member.invitedEmail ?? "";
            const initials = (displayName ?? "?")
              .split(" ")
              .map((w: string) => w[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();

            return (
              <div
                key={member.id}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-teal text-xs font-bold text-white">
                  {member.userImage ? (
                    <img
                      src={member.userImage}
                      alt=""
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    initials
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-brand-navy-900">
                      {displayName}
                    </span>
                    {isPending && (
                      <span className="flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                        <Clock className="h-2.5 w-2.5" />
                        Pending
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {displayEmail}
                  </div>
                </div>

                {/* Role badge */}
                <span
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${config.color}`}
                >
                  <RoleIcon className="h-3 w-3" />
                  {config.label}
                </span>

                {/* Role changer (non-owner members, only visible to owner) */}
                {member.role !== "owner" && member.id !== "owner" && (
                  <select
                    value={member.role}
                    onChange={(e) =>
                      updateRoleMut.mutate({
                        memberId: member.id,
                        role: e.target.value as "admin" | "member" | "viewer",
                      })
                    }
                    className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 focus:border-brand-teal focus:outline-none"
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                )}

                {/* Remove button (non-owner members only) */}
                {member.role !== "owner" && member.id !== "owner" && (
                  <button
                    onClick={() => removeMut.mutate({ memberId: member.id })}
                    disabled={removeMut.isPending}
                    className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                    title="Remove member"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {removeMut.error && (
        <p className="text-xs text-red-500">{removeMut.error.message}</p>
      )}
      {updateRoleMut.error && (
        <p className="text-xs text-red-500">{updateRoleMut.error.message}</p>
      )}
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
