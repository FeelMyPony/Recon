"use client";

import { useState } from "react";
import { Search, Sparkles, X, Loader2, Check } from "lucide-react";
import { trpc } from "../lib/trpc/client";

export function Topbar() {
  const [showSearch, setShowSearch] = useState(false);

  // Quick stats from tRPC
  const { data: stats } = trpc.outreach.stats.useQuery(undefined, {
    retry: false,
  });

  return (
    <>
      <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold tracking-wider text-brand-navy-900">
            RECON
          </h1>
          <span className="rounded bg-brand-teal/10 px-1.5 py-0.5 text-xs font-medium text-brand-teal">
            BETA
          </span>
        </div>

        {/* Quick stats — wired to tRPC */}
        <div className="hidden items-center gap-4 text-xs text-slate-500 sm:flex">
          <span>
            <strong className="text-brand-navy-900">{stats?.total ?? 0}</strong> leads
          </span>
          <span className="h-4 w-px bg-slate-200" />
          <span>
            <strong className="text-brand-teal">{stats?.withEmail ?? 0}</strong> with email
          </span>
          <span className="h-4 w-px bg-slate-200" />
          <span>
            <strong className="text-red-500">{stats?.hot ?? 0}</strong> hot
          </span>
        </div>

        <button
          data-action="new-search"
          onClick={() => setShowSearch(true)}
          className="flex items-center gap-2 rounded-md bg-brand-teal px-3 py-1.5 text-sm font-medium text-brand-navy-900 transition-colors hover:bg-brand-teal-600"
        >
          <Search className="h-4 w-4" />
          New Search
        </button>
      </div>

      {showSearch && <SearchModal onClose={() => setShowSearch(false)} />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Search Modal — enhanced filters for targeted outreach
// ─────────────────────────────────────────────────────────────────────────

function SearchModal({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState("plumber");
  const [location, setLocation] = useState("Melbourne VIC");
  const [goodReviews, setGoodReviews] = useState(true);
  const [excludeWithWebsite, setExcludeWithWebsite] = useState(false);
  const [requireEmail, setRequireEmail] = useState(false);

  const utils = trpc.useUtils();
  const createSearch = trpc.outreach.searches.create.useMutation({
    onSuccess: () => {
      utils.outreach.leads.list.invalidate();
      utils.outreach.stats.invalidate();
      onClose();
    },
  });

  const handleSubmit = () => {
    createSearch.mutate({
      query: category,
      location,
      filters: {
        // "Good reviews" toggle → minRating 4.0 + at least 10 reviews
        ...(goodReviews ? { minRating: 4.0, minReviewCount: 10 } : {}),
        ...(excludeWithWebsite ? { excludeWithWebsite: true } : {}),
        ...(requireEmail ? { requireEmail: true } : {}),
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-brand-navy-900/60 pt-20 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-brand-navy-900">
                New Lead Search
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Describe your ideal lead
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded p-1 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Business category
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., plumber, physiotherapist, cafe"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Location
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Melbourne VIC, Richmond, 3121"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
              />
            </div>

            {/* Criteria checkboxes */}
            <div>
              <label className="mb-2 block text-xs font-medium text-slate-500">
                Criteria
              </label>
              <div className="space-y-2">
                <CriteriaToggle
                  label="Good reviews (4.0★ and 10+ reviews)"
                  checked={goodReviews}
                  onChange={setGoodReviews}
                />
                <CriteriaToggle
                  label="No website (outreach opportunity)"
                  checked={excludeWithWebsite}
                  onChange={setExcludeWithWebsite}
                />
                <CriteriaToggle
                  label="Must have a contact email"
                  checked={requireEmail}
                  onChange={setRequireEmail}
                />
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-md bg-brand-teal/5 p-2.5 text-xs text-teal-700">
              <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>
                After scraping, leads are auto-ranked by opportunity score.
                Click the top ones to run Deep Analyse for pain points.
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3">
          {createSearch.error && (
            <span className="text-xs text-red-500">
              {createSearch.error.message}
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-slate-500"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={createSearch.isPending || !category.trim() || !location.trim()}
              className="flex items-center gap-1.5 rounded-md bg-brand-teal px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-teal-600 disabled:opacity-50"
            >
              {createSearch.isPending ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> Scraping...
                </>
              ) : (
                <>
                  <Search className="h-3 w-3" /> Scrape & Rank
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CriteriaToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900 transition-colors hover:bg-slate-50">
      <div
        className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
          checked
            ? "border-brand-teal bg-brand-teal"
            : "border-slate-300 bg-white"
        }`}
      >
        {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span>{label}</span>
    </label>
  );
}
