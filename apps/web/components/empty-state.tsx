"use client";

import type { LucideIcon } from "lucide-react";

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actions?: EmptyStateAction[];
  /** Single action shorthand — ignored if `actions` is provided */
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const resolvedActions: EmptyStateAction[] =
    actions ??
    (actionLabel && onAction
      ? [{ label: actionLabel, onClick: onAction, variant: "primary" }]
      : []);

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
        <Icon className="h-6 w-6 text-slate-400" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-brand-navy-900">
        {title}
      </h3>
      <p className="mt-1 max-w-sm text-xs text-slate-500">{description}</p>

      {resolvedActions.length > 0 && (
        <div className="mt-5 flex items-center gap-2">
          {resolvedActions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              className={
                action.variant === "secondary"
                  ? "rounded-md border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                  : "rounded-md bg-brand-teal px-4 py-2 text-xs font-medium text-brand-navy-900 transition-colors hover:bg-brand-teal-600"
              }
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
