import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: "#CC785C",
        surface: "#F5F4EF",
        sidebar: "#EEECE3",
        border: "#E0DDD5",
        muted: "#7A7568",
      },
    },
  },
  plugins: [],
};

export default config;
