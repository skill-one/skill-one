/// <reference types="vitest/config" />
import path from "node:path";
import { fileURLToPath } from "node:url";

import { configDefaults } from "vitest/config";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json" with { type: "json" };

const srcDir = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  define: {
    // Single source of truth for the displayed app version (package.json).
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": path.resolve(srcDir, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // Git worktrees under .worktrees carry their own (stale) test copies;
    // running them here fails on duplicated React resolution.
    exclude: [...configDefaults.exclude, "**/.worktrees/**"],
  },
  // Tauri expects a fixed dev server port and a clean terminal.
  clearScreen: false,
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
  },
  // Env variables starting with TAURI_ are exposed to the client.
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    // Multi-page build: the menu bar popover window gets its own entry
    // (see popover.html / src/popover/).
    rolldownOptions: {
      input: {
        main: "index.html",
        popover: "popover.html",
      },
    },
    // Tauri supports es2021.
    target: "es2021",
    // Disable minify (default Oxc minifier) for debug builds.
    minify: !process.env.TAURI_DEBUG,
    // Produce sourcemaps for debug builds.
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
