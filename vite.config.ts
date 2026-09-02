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
    // e2e/ is Playwright's: same *.spec.ts filenames, different runner.
    exclude: [...configDefaults.exclude, "**/.worktrees/**", "**/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // Measure what ships: pages, components, hooks and lib. Test files, the
      // setup helpers, type-only modules and the browser mock (a test double,
      // never shipped) are not the subject.
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/src/test/**",
        "**/src/types/**",
        "**/src/lib/mock-local.ts",
        "**/src/lib/registry/protocol.ts",
      ],
      thresholds: {
        // A couple of points under today's figures: tight enough to catch a
        // real drop, loose enough that touching one file cannot fail CI.
        // Raise them as coverage improves.
        statements: 80,
        branches: 77,
        functions: 77,
        lines: 82,
      },
    },
  },
  // Tauri expects a fixed dev server port and a clean terminal.
  clearScreen: false,
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    watch: {
      // Git worktrees under .worktrees hold their own copies of the app
      // sources; without this, an edit in another checkout (a parallel
      // session) reloads this dev server. Mirrors `test.exclude` above.
      ignored: ["**/.worktrees/**"],
    },
  },
  // Env variables starting with TAURI_ are exposed to the client.
  envPrefix: ["VITE_", "TAURI_"],
  // The registry worker is bundled as an ES module (it imports shared
  // modules); WKWebView supports module workers on macOS 12+.
  worker: {
    format: "es",
  },
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
