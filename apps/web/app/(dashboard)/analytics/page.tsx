"use client";

import {
  Users,
  Mail,
  Eye,
  Reply,
  TrendingUp,
  Target,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

const STATS = [
  { label: "Total Leads", value: "247", change: "+32", positive: true, icon: Users },
  { label: "Emails Sent", value: "125", change: "+18", positive: true, icon: Mail },
  { label: "Open Rate", value: "61%", change: "+3%", positive: true, icon: Eye },
  { label: "Reply Rate", value: "12%", change: "-1%", positive: false, icon: Reply },
];

const PIPELINE = [
  { status: "New", count: 142, percentage: 57, color: "bg-slate-400" },
  { status: "Qualified", count: 38, percentage: 15, color: "bg-blue-500" },
  { status: "Contacted", count: 35, percentage: 14, color: "bg-amber-500" },
  { status: "Proposal", count: 18, percentage: 7, color: "bg-purple-500" },
  { status: "Converted", count: 12, percentage: 5, color: "bg-emerald-500" },
  { status: "Rejected", count: 2, percentage: 1, color: "bg-red-400" },
];

const SCORE_DIST = [
  { score: "Hot", count: 34, percentage: 14, color: "bg-red-500" },
  { score: "Warm", count: 87, percentage: 35, color: "bg-amber-500" },
  { score: "Cold", count: 62, percentage: 25, color: "bg-blue-400" },
  { score: "Unscored", count: 64, percentage: 26, color: "bg-slate-300" },
];

const TOP_CATEGORIES = [
  { name: "NDIS Provider", count: 89, withEmail: 67 },
  { name: "Allied Health", count: 52, withEmail: 41 },
  { name: "Physiotherapist", count: 38, withEmail: 32 },
  { name: "Support Coordinator", count: 31, withEmail: 28 },
  { name: "Plan Manager", count: 22, withEmail: 18 },
  { name: "Occupational Therapist", count: 15, withEmail: 12 },
];

const RECENT_ACTIVITY = [
  { action: "Lead scored as Hot", detail: "Active Ability Support", time: "2m ago", icon: Target },
  { action: "Email opened", detail: "Sunshine Physiotherapy", time: "15m ago", icon: Eye },
  { action: "Reply received", detail: "CareConnect Allied Health", time: "1h ago", icon: Reply },
  { action: "Search completed", detail: "NDIS Provider · Melbourne VIC · 47 results", time: "3h ago", icon: TrendingUp },
  { action: "Lead scored as Warm", detail: "Peninsula Plan Management", time: "5h ago", icon: Target },
];

export default function AnalyticsPage() {
  return (
    <div className="scrollbar-thin h-full overflow-auto p-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">{stat.label}</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100">
                <stat.icon className="h-3.5 w-3.5 text-slate-500" />
              </div>
            </div>
            <div className="mt-2 flex items-end justify-between">
              <span className="text-2xl font-bold text-brand-navy-900">{stat.value}</span>
              <span
                className={`flex items-center gap-0.5 text-xs font-medium ${
                  stat.positive ? "text-emerald-600" : "text-red-500"
                }`}
              >
                {stat.positive ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {stat.change}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Pipeline funnel */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-brand-navy-900">Pipeline</h3>
          <p className="mt-0.5 text-xs text-slate-500">Lead status distribution</p>
          <div className="mt-4 space-y-2.5">
            {PIPELINE.map((stage) => (
              <div key={stage.status} className="flex items-center gap-3">
                <span className="w-20 text-xs text-slate-600">{stage.status}</span>
                <div className="flex-1">
                  <div className="h-5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${stage.color} transition-all`}
                      style={{ width: `${stage.percentage}%` }}
                    />
                  </div>
                </div>
                <span className="w-10 text-right text-xs font-medium text-brand-navy-900">
                  {stage.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Score distribution */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-brand-navy-900">Lead Scores</h3>
          <p className="mt-0.5 text-xs text-slate-500">AI scoring distribution</p>
          <div className="mt-4 space-y-2.5">
            {SCORE_DIST.map((item) => (
              <div key={item.score} className="flex items-center gap-3">
                <span className="w-20 text-xs text-slate-600">{item.score}</span>
                <div className="flex-1">
                  <div className="h-5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${item.color} transition-all`}
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                </div>
                <span className="w-10 text-right text-xs font-medium text-brand-navy-900">
                  {item.count}
                </span>
              </div>
            ))}
          </div>

          {/* Score ring chart */}
          <div className="mt-4 flex items-center justify-center">
            <div className="relative">
              <svg width="120" height="120" viewBox="0 0 120 120">
                {SCORE_DIST.reduce(
                  (acc, item, i) => {
                    const radius = 50;
                    const circumference = 2 * Math.PI * radius;
                    const offset = acc.offset;
                    const dash = (item.percentage / 100) * circumference;
                    const colors = ["#ef4444", "#f59e0b", "#60a5fa", "#cbd5e1"];
                    acc.elements.push(
                      <circle
                        key={i}
                        cx="60"
                        cy="60"
                        r={radius}
                        fill="none"
                        stroke={colors[i]}
                        strokeWidth="10"
                        strokeDasharray={`${dash} ${circumference - dash}`}
                        strokeDashoffset={-offset}
                        transform="rotate(-90 60 60)"
                      />,
                    );
                    acc.offset += dash;
                    return acc;
                  },
                  { elements: [] as React.ReactNode[], offset: 0 },
                ).elements}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-brand-navy-900">247</span>
                <span className="text-[10px] text-slate-500">Total</span>
              </div>
            </div>
          </div>
        </div>

        {/* Top categories */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-brand-navy-900">Top Categories</h3>
          <p className="mt-0.5 text-xs text-slate-500">Leads by business category</p>
          <div className="mt-3 space-y-2">
            {TOP_CATEGORIES.map((cat, i) => (
              <div key={cat.name} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-slate-50">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-brand-teal/10 text-[10px] font-semibold text-brand-teal">
                    {i + 1}
                  </span>
                  <span className="text-xs text-brand-navy-900">{cat.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">
                    {cat.withEmail}/{cat.count} with email
                  </span>
                  <span className="text-xs font-medium text-brand-navy-900">{cat.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-brand-navy-900">Recent Activity</h3>
          <p className="mt-0.5 text-xs text-slate-500">Latest workspace events</p>
          <div className="mt-3 space-y-1">
            {RECENT_ACTIVITY.map((activity, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-md px-2 py-2 hover:bg-slate-50">
                <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-brand-teal/10">
                  <activity.icon className="h-3 w-3 text-brand-teal" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-brand-navy-900">{activity.action}</div>
                  <div className="mt-0.5 truncate text-[10px] text-slate-500">{activity.detail}</div>
                </div>
                <span className="flex-shrink-0 text-[10px] text-slate-400">{activity.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
