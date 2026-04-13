/**
 * RECON brand design tokens.
 * Use these for any non-Tailwind contexts (maps, charts, etc.)
 */
export const theme = {
  colors: {
    brand: {
      navy: "#0F1B2D",
      teal: "#00BFA6",
    },
    score: {
      hot: "#ef4444",
      warm: "#f59e0b",
      cold: "#60a5fa",
      unscored: "#94a3b8",
    },
    status: {
      new: { bg: "#f1f5f9", text: "#334155", dot: "#94a3b8" },
      qualified: { bg: "#eff6ff", text: "#1d4ed8", dot: "#3b82f6" },
      contacted: { bg: "#fffbeb", text: "#b45309", dot: "#f59e0b" },
      proposal: { bg: "#faf5ff", text: "#7c3aed", dot: "#a855f7" },
      converted: { bg: "#ecfdf5", text: "#059669", dot: "#10b981" },
      rejected: { bg: "#fef2f2", text: "#dc2626", dot: "#f87171" },
    },
  },
  fonts: {
    sans: "'Inter', system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', monospace",
  },
} as const;
