/** @type {import('tailwindcss').Config} */
// Tailwind bridge to the AMS design tokens (Notes/UI.md §16).
// Components use these semantic names — raw hex/arbitrary colors are banned.
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        surface: {
          DEFAULT: "hsl(var(--surface-t))",
          hover: "hsl(var(--surface-hover))",
          sunken: "hsl(var(--surface-sunken))",
        },
        line: {
          DEFAULT: "hsl(var(--border-t))",
          strong: "hsl(var(--border-strong))",
        },
        foreground: {
          DEFAULT: "hsl(var(--foreground))",
          muted: "hsl(var(--muted-foreground))",
          faint: "hsl(var(--faint-foreground))",
        },
        brand: {
          DEFAULT: "hsl(var(--primary))",
          hover: "hsl(var(--primary-hover))",
          active: "hsl(var(--primary-active))",
          foreground: "hsl(var(--primary-foreground))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        danger: {
          DEFAULT: "hsl(var(--danger))",
          active: "hsl(var(--danger-active))",
        },
        info: "hsl(var(--info))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-bg))",
          fg: "hsl(var(--sidebar-fg))",
          "fg-active": "hsl(var(--sidebar-fg-active))",
          hover: "hsl(var(--sidebar-item-hover))",
          line: "hsl(var(--sidebar-border))",
        },
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        focus: "var(--shadow-focus)",
        "focus-danger": "var(--shadow-focus-danger)",
      },
      fontFamily: {
        sans: "var(--font-sans)",
        mono: "var(--font-mono)",
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
        inout: "var(--ease-inout)",
      },
      transitionDuration: {
        fast: "120ms",
        base: "180ms",
        slow: "260ms",
      },
      maxWidth: {
        content: "var(--content-max)",
      },
    },
  },
  plugins: [],
}
