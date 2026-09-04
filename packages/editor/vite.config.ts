import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // The API is same-origin in production; in dev it runs separately.
    proxy: { "/api": "http://localhost:3000" },
  },
});
