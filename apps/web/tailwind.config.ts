import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // RECON brand palette
        brand: {
          navy: {
            DEFAULT: "#0F1B2D",
            50: "#E8EBF0",
            100: "#C5CBD6",
            200: "#9BA6B8",
            300: "#71819A",
            400: "#516584",
            500: "#31496E",
            600: "#2C4266",
            700: "#24385B",
            800: "#1D2F51",
            900: "#0F1B2D",
          },
          teal: {
            DEFAULT: "#00BFA6",
            50: "#E0F7F3",
            100: "#B3ECE1",
            200: "#80DFCE",
            300: "#4DD2BA",
            400: "#26C9AC",
            500: "#00BFA6",
            600: "#00B99E",
            700: "#00B195",
            800: "#00A98B",
            900: "#009B7B",
          },
        },
        // Map semantic aliases
        sidebar: {
          DEFAULT: "#0F1B2D",
          foreground: "#94A3B8",
          accent: "#00BFA6",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
