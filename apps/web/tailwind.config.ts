import type { Config } from "tailwindcss"

const color = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: color("border"),
        "border-strong": color("border-strong"),
        input: color("border"),
        ring: color("primary"),
        background: color("canvas"),
        surface: color("surface"),
        "surface-subtle": color("surface-subtle"),
        foreground: color("text"),
        secondary: color("text-secondary"),
        muted: {
          DEFAULT: color("surface-subtle"),
          foreground: color("text-muted"),
        },
        primary: {
          DEFAULT: color("primary"),
          foreground: color("primary-foreground"),
          strong: color("primary-strong"),
        },
        success: {
          DEFAULT: color("success"),
          foreground: color("success-foreground"),
        },
        warning: {
          DEFAULT: color("warning"),
          foreground: color("warning-foreground"),
        },
        danger: {
          DEFAULT: color("danger"),
          foreground: color("danger-foreground"),
        },
        card: {
          DEFAULT: color("surface"),
          foreground: color("text"),
        },
      },
      boxShadow: {
        panel: "0 18px 50px rgb(15 23 42 / 0.12)",
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
