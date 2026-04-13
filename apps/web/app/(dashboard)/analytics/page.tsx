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
  Loader2,
} from "lucide-react";
import { trpc } from "../../../lib/trpc/client";

export default function AnalyticsPage() {
  const { data: stats, isLoading } = trpc.outreach.stats.useQuery(undefined, {
    retry: false,
  });

  const total = stats?.total ?? 0;
  const withEmail = stats?.withEmail ?? 0;
  const hot = stats?.hot ?? 0;
  const warm = stats?.warm ?? 0;
  const cold = stats?.cold ?? 0;
  const unscored = stats?.unscored ?? 0;
  const emailsSent = stats?.emailsSent ?? 0;
  const openRate = stats?.openRate ?? 0;
  const replyRate = stats?.replyRate ?? 0;

  const STATS = [
    { label: "Total Leads", value: String(total), icon: Users },
    { label: "Emails Sent", value: String(emailsSent), icon: Mail },
    { label: "Open Rate", value: `${openRate}%`, icon: Eye },
    { label: "Reply Rate", value: `${replyRate}%`, icon: Reply },
  ];

  const PIPELINE = [
    { status: "New", count: stats?.byStatus.new ?? 0, color: "bg-slate-400" },
    { status: "Qualified", count: stats?.byStatus.qualified ?? 0, color: "bg-blue-500" },
    { status: "Contacted", count: stats?.byStatus.contacted ?? 0, color: "bg-amber-500" },
    { status: "Proposal", count: stats?.byStatus.proposal ?? 0, color: "bg-purple-500" },
    { status: "Converted", count: stats?.byStatus.converted ?? 0, color: "bg-emerald-500" },
    { status: "Rejected", count: stats?.byStatus.rejected ?? 0, color: "bg-red-400" },
  ];

  const SCORE_DIST = [
    { score: "Hot", count: hot, color: "bg-red-500" },
    { score: "Warm", count: warm, color: "bg-amber-500" },
    { score: "Cold", count: cold, color: "bg-blue-400" },
    { score: "Unscored", count: unscored, color: "bg-slate-300" },
  ];

  const byCategory = stats?.byCategory ?? [];

  return (
    <div className="scrollbar-thin h-full overflow-auto p-4">
      {isLoading && (
        <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading analytics...
        </div>
      )}

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
            <div className="mt-2">
              <span className="text-2xl font-bold text-brand-navy-900">{stat.value}</span>
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
            {PIPELINE.map((stage) => {
              const pct = total > 0 ? Math.round((stage.count / total) * 100) : 0;
              return (
                <div key={stage.status} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-slate-600">{stage.status}</span>
                  <div className="flex-1">
                    <div className="h-5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${stage.color} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-10 text-right text-xs font-medium text-brand-navy-900">
                    {stage.count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Score distribution */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-brand-navy-900">Lead Scores</h3>
          <p className="mt-0.5 text-xs text-slate-500">AI scoring distribution</p>
          <div className="mt-4 space-y-2.5">
            {SCORE_DIST.map((item) => {
              const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
              return (
                <div key={item.score} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-slate-600">{item.score}</span>
                  <div className="flex-1">
                    <div className="h-5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${item.color} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-10 text-right text-xs font-medium text-brand-navy-900">
                    {item.count}
                  </span>
                </div>
              );
            })}
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
                    const pct = total > 0 ? item.count / total : 0;
                    const dash = pct * circumference;
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
                <span className="text-lg font-bold text-brand-navy-900">{total}</span>
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
            {byCategory.length > 0 ? (
              byCategory.map((cat, i) => (
                <div key={cat.name} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-slate-50">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-brand-teal/10 text-[10px] font-semibold text-brand-teal">
                      {i + 1}
                    </span>
                    <span className="text-xs text-brand-navy-900">{cat.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">
                      {cat.withEmail}/{cat.total} with email
                    </span>
                    <span className="text-xs font-medium text-brand-navy-900">{cat.total}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-4 text-center text-xs text-slate-400">
                No leads yet. Run a search to get started.
              </p>
            )}
          </div>
        </div>

        {/* Recent activity placeholder */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-brand-navy-900">Recent Activity</h3>
          <p className="mt-0.5 text-xs text-slate-500">Latest workspace events</p>
          <div className="mt-3">
            <p className="py-4 text-center text-xs text-slate-400">
              Activity feed will populate as you use RECON.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
