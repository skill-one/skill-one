/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
  // Tauri expects a fixed dev server port and a clean terminal.
  clearScreen: false,
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  // Env variables starting with TAURI_ are exposed to the client.
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    // Tauri supports es2021.
    target: "es2021",
    // Disable minify for debug builds.
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    // Produce sourcemaps for debug builds.
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
