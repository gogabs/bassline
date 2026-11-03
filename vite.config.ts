import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  server: {
    // Em desenvolvimento, o mini servidor roda em paralelo (npm run servidor).
    proxy: { "/api": "http://localhost:8787" },
  },
  test: { include: ["src/**/*.test.ts", "server/**/*.test.ts"] },
} as never);
