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
        panel: "0 22px 70px rgb(20 20 24 / 0.12)",
        soft: "0 1px 2px rgb(20 20 24 / 0.04), 0 8px 24px rgb(20 20 24 / 0.05)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
}

export default config
