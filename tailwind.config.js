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
        app: {
          bg: "#0F1115",
          s1: "#151922",
          s2: "#1C2230",
          border: "#2A3142",
          text: "#E8ECF3",
          muted: "#A7B0C0",
          primary: "#2F6FED",
          primaryHover: "#255ED0",
          accent: "#C6A96B",
          success: "#2E9E6F",
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
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", '"Liberation Mono"', "monospace"],
      },
      boxShadow: {
        panel: "0 1px 0 rgba(255,255,255,0.03), 0 0 0 1px rgba(42,49,66,0.85)",
        raise: "0 10px 30px rgba(0,0,0,0.55)",
      },
    },
  },
  plugins: [],
};
