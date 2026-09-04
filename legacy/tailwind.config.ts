import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["system-ui", "ui-sans-serif", "sans-serif"],
      },
      colors: {
        oth: {
          primary: "#0066B3",
          warm: "#F2A33C",
          ink: "#1A1F2A",
          paper: "#F8F6F0",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
