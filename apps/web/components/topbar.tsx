"use client";

import { useState } from "react";
import { Search, Sparkles, X, Loader2 } from "lucide-react";
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

      {/* Search Modal */}
      {showSearch && (
        <SearchModal onClose={() => setShowSearch(false)} />
      )}
    </>
  );
}

function SearchModal({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState("NDIS Provider");
  const [location, setLocation] = useState("Melbourne VIC");
  const [minRating, setMinRating] = useState("any");
  const [mustHave, setMustHave] = useState("none");

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
        minRating: minRating !== "any" ? parseFloat(minRating) : undefined,
        mustHave: mustHave !== "none" ? mustHave : undefined,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-brand-navy-900/60 pt-24 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-brand-navy-900">
              New Lead Search
            </h2>
            <button
              onClick={onClose}
              className="rounded p-1 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Business Category
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., NDIS Provider, Physiotherapist..."
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
                placeholder="e.g., Melbourne VIC, 3000..."
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Min Rating
                </label>
                <select
                  value={minRating}
                  onChange={(e) => setMinRating(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900"
                >
                  <option value="any">Any</option>
                  <option value="3.0">3.0+</option>
                  <option value="3.5">3.5+</option>
                  <option value="4.0">4.0+</option>
                  <option value="4.5">4.5+</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Must Have
                </label>
                <select
                  value={mustHave}
                  onChange={(e) => setMustHave(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-navy-900"
                >
                  <option value="none">No filter</option>
                  <option value="email">Email</option>
                  <option value="website">Website</option>
                  <option value="phone">Phone</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-md bg-brand-teal/5 p-2 text-xs text-teal-700">
              <Sparkles className="h-4 w-4" />
              <span>
                AI will auto-analyse reviews and score leads after scraping
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3">
          <span className="text-xs text-slate-400">
            Est. cost: ~$0.15 for 50 leads
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-slate-500"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={createSearch.isPending}
              className="flex items-center gap-1.5 rounded-md bg-brand-teal px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-teal-600 disabled:opacity-50"
            >
              {createSearch.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Search
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
