import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0F0F23",
        primary: "#1A1A2E",
        "surface-1": "#141428",
        "surface-2": "#1A1A35",
        "surface-3": "#222244",
        accent: "#E94560",
        "accent-soft": "#E94560",
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans Variable"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
