import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: "var(--c-brand)",
        surface: "var(--c-bg)",
        sidebar: "var(--c-surface-1)",
        border: "var(--c-border)",
        muted: "var(--c-text-3)",
      },
    },
  },
  plugins: [],
};

export default config;
