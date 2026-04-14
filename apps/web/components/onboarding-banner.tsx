"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X, Settings, Search, Upload } from "lucide-react";
import { trpc } from "../lib/trpc/client";

const DISMISSED_KEY = "recon:onboarding-dismissed";

export function OnboardingBanner() {
  const [dismissed, setDismissed] = useState(true); // default hidden until checked

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED_KEY) === "true");
  }, []);

  const workspaceQuery = trpc.outreach.workspace.get.useQuery(undefined, {
    retry: false,
  });
  const statsQuery = trpc.outreach.stats.useQuery(undefined, {
    retry: false,
  });

  if (dismissed) return null;

  const ws = workspaceQuery.data;
  const stats = statsQuery.data;

  // Don't render until data is loaded
  if (workspaceQuery.isLoading || statsQuery.isLoading) return null;

  const workspaceConfigured =
    !!ws?.settings &&
    typeof ws.settings === "object" &&
    !!(ws.settings as any).serviceDescription &&
    ((ws.settings as any).targetCategories?.length ?? 0) > 0;

  const hasLeads = (stats?.total ?? 0) > 0;

  // All steps done — no need to show banner
  if (workspaceConfigured && hasLeads) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  };

  const openSearch = () => {
    // Trigger the search modal in Topbar via custom event
    const btn = document.querySelector<HTMLButtonElement>(
      '[data-action="new-search"]',
    );
    btn?.click();
  };

  const steps = [
    {
      done: workspaceConfigured,
      label: "Set up workspace",
      description: "Add your service description and target categories",
      href: "/settings",
    },
    {
      done: hasLeads,
      label: "Run your first search",
      description: "Find leads on Google Maps",
      onClick: openSearch,
    },
    {
      done: hasLeads,
      label: "Import leads",
      description: "Upload a CSV of existing contacts",
      href: "/leads",
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;

  return (
    <div className="border-b border-brand-teal/20 bg-brand-teal/5 px-4 py-3">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-brand-navy-900">
              Get started with RECON
            </h2>
            <span className="rounded-full bg-brand-teal/10 px-2 py-0.5 text-[10px] font-medium text-brand-teal">
              {completedCount}/{steps.length}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-4">
            {steps.map((step) => {
              const content = (
                <div className="flex items-start gap-2">
                  {step.done ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-300" />
                  )}
                  <div>
                    <span
                      className={`text-xs font-medium ${
                        step.done
                          ? "text-slate-400 line-through"
                          : "text-brand-navy-900"
                      }`}
                    >
                      {step.label}
                    </span>
                    {!step.done && (
                      <p className="text-[11px] text-slate-500">
                        {step.description}
                      </p>
                    )}
                  </div>
                </div>
              );

              if (step.href && !step.done) {
                return (
                  <Link
                    key={step.label}
                    href={step.href}
                    className="group rounded-md px-2 py-1 transition-colors hover:bg-brand-teal/10"
                  >
                    {content}
                  </Link>
                );
              }

              if (step.onClick && !step.done) {
                return (
                  <button
                    key={step.label}
                    onClick={step.onClick}
                    className="rounded-md px-2 py-1 text-left transition-colors hover:bg-brand-teal/10"
                  >
                    {content}
                  </button>
                );
              }

              return (
                <div key={step.label} className="px-2 py-1">
                  {content}
                </div>
              );
            })}
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="ml-2 rounded p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
