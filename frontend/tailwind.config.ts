import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["var(--font-vazirmatn)", "Tahoma", "sans-serif"] },
      colors: {
        primary: "var(--primary)",
        surface: "var(--surface)",
        canvas: "var(--background)",
        ink: "var(--text)",
        line: "var(--border)",
      },
      borderRadius: { panel: "var(--radius)" },
      boxShadow: { panel: "var(--shadow)" },
    },
  },
  plugins: [],
} satisfies Config;
