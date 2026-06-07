/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      colors: {
        ink: {
          950: "#07080b",
          900: "#0b0d12",
          850: "#0e1117",
          800: "#13171f",
          700: "#1a1f2a",
          600: "#262d3b",
          500: "#3a4253",
          400: "#5b6478",
          300: "#8a93a6",
          200: "#b8bfcc",
          100: "#e3e7ef",
        },
        accent: {
          DEFAULT: "#ff6b35",
          dim: "#c8501f",
          glow: "rgba(255, 107, 53, 0.18)",
        },
        verdict: {
          go: "#3ddc84",
          maybe: "#ffb84d",
          stop: "#ff5470",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,107,53,0.4), 0 0 30px rgba(255,107,53,0.18)",
        card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 0 0 1px rgba(255,255,255,0.05), 0 12px 40px -12px rgba(0,0,0,0.6)",
        ring: "0 0 0 1px rgba(255,255,255,0.06)",
      },
      animation: {
        breathe: "breathe 4s ease-in-out infinite",
      },
      keyframes: {
        breathe: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
