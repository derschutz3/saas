/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        // Identidade Garciat — dark premium "effervescent".
        // Mantido em sincronia com src/lib/brand.ts (BRAND_COLORS).
        app: {
          bg: "#0A0E13",
          s1: "#111824",
          s2: "#19222F",
          border: "#283341",
          text: "#EAEEF5",
          muted: "#9CA7B8",
          primary: "#1FCB87",
          primaryHover: "#17AE73",
          accent: "#E3B45E",
          success: "#2FB67A",
        },
      },
      fontFamily: {
        sans: [
          '"IBM Plex Sans"',
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          '"Segoe UI"',
          '"Noto Sans"',
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        display: [
          '"Space Grotesk"',
          '"IBM Plex Sans"',
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", '"Liberation Mono"', "monospace"],
      },
      boxShadow: {
        panel: "0 1px 0 rgba(255,255,255,0.03), 0 0 0 1px rgba(40,51,65,0.85)",
        raise: "0 10px 30px rgba(0,0,0,0.55)",
        glow: "0 0 0 1px rgba(31,203,135,0.35), 0 8px 30px rgba(31,203,135,0.12)",
      },
    },
  },
  plugins: [],
};
