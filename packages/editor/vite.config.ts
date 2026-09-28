import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // 5174 is a busy default and collided with another project on this machine.
    port: 5180,
    // The API is same-origin in production; in dev it runs separately.
    // /mcp too: the Team page's connect command names this page's address,
    // so Claude Code connected from the dev server must reach the server.
    proxy: { "/api": "http://localhost:3000", "/mcp": "http://localhost:3000" },
  },
});
