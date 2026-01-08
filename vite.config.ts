import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // 👇 REQUIRED for Replit
  preview: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
  },

  // 👇 Optional but recommended if you ever use `vite dev` on Replit
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
  },
});
