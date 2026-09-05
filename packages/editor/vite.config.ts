import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // 5174 is a busy default and collided with another project on this machine.
    port: 5180,
    // The API is same-origin in production; in dev it runs separately.
    proxy: { "/api": "http://localhost:3000" },
  },
});
