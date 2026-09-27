import type { Config } from "tailwindcss";

/**
 * The look, in one place: warm greys, one teal accent, and a colour per
 * meaning. Components use these names, never raw hex, so "proposed" is the
 * same blue in the filmstrip, the review queue and the frame boxes.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ['"Inter Variable"', "Inter", "system-ui", "sans-serif"] },
      // One step up from Tailwind's defaults: 13 px is the smallest text anywhere.
      fontSize: {
        xs: ["13px", "18px"],
        sm: ["14px", "20px"],
      },
      colors: {
        accent: { DEFAULT: "#0f766e", hover: "#115e59", soft: "#f0fdfa", ring: "#14b8a6" },
        yours: { DEFAULT: "#b45309", soft: "#fef3c7" },
        proposed: { DEFAULT: "#0284c7", soft: "#e0f2fe" },
        confirmed: { DEFAULT: "#047857", soft: "#d1fae5" },
        danger: { DEFAULT: "#b91c1c", soft: "#fee2e2" },
      },
      borderRadius: { DEFAULT: "6px" },
    },
  },
  plugins: [],
} satisfies Config;
