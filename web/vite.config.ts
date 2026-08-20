import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative asset paths (`base: "./"`) since the built bundle is served by codeatlas --serve from
// an arbitrary local path/port, not from a known absolute site root.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    proxy: {
      // Lets `npm run dev` inside web/ iterate against an already-running
      // `codeatlas <path> --serve` process instead of a full rebuild loop.
      "/api": "http://localhost:4787",
    },
  },
});
