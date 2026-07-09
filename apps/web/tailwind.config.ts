import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "rgb(39 39 42)",
        input: "rgb(39 39 42)",
        ring: "rgb(59 130 246)",
        background: "rgb(9 9 11)",
        foreground: "rgb(244 244 245)",
        muted: {
          DEFAULT: "rgb(24 24 27)",
          foreground: "rgb(161 161 170)",
        },
        primary: {
          DEFAULT: "rgb(59 130 246)",
          foreground: "rgb(248 250 252)",
        },
        card: {
          DEFAULT: "rgb(24 24 27)",
          foreground: "rgb(244 244 245)",
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
}

export default config
