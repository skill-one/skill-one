/// <reference types="@playwright/test" />
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the **web** build, not the packaged app.
 *
 * What this layer is for: the journeys that unit and component tests cannot
 * reach because they each replace the world below them with a mock. Rendering
 * the real shell, resolving real routes, mounting real CSS, and answering with
 * `lib/mock-local`'s stand-in for the Rust backend is a whole different claim
 * from "this component renders given this props" — and it is the layer where
 * Tailwind classes, hash routing, focus order and layout actually have to hold
 * together.
 *
 * What this layer is **not** for: proving the Tauri commands work. In a browser
 * `isTauri()` is false, so every install, removal and link goes through
 * `mock-local` and the Rust side is never reached. That boundary is covered
 * from the other two directions instead — `src/lib/skills-manager.test.ts` pins
 * the call side, and the `#[cfg(test)]` module in `src-tauri/src/skills.rs`
 * pins the command logic and the DTOs it returns — so the contract is locked
 * even though no single test crosses it. What this layer adds is the UI
 * behaviour around those calls.
 *
 * Driven on port 5274: 5173 is the developer's own dev server and 5273 belongs
 * to the Tauri dev-test config, so an E2E run never disturbs either.
 */
const PORT = 5274;

export default defineConfig({
  testDir: "./e2e",
  // The whole app is one page behind a hash router, so a failure is a state
  // worth naming rather than a flake to retry into silence. Retries stay at 0
  // deliberately: a test that only passes on the second try is a broken test.
  retries: 0,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "line" : [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Fails the whole run instead of letting a hung teardown occupy a CI
  // runner indefinitely.
  globalTimeout: 15 * 60_000,

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    // Pinned rather than inherited from the machine: a screenshot baseline is
    // only comparable against the same renderer, and font rendering differs
    // between platforms and macOS versions.
    ...devices["Desktop Chrome"],
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    // The dev server rather than a preview of a build: the E2E run should not
    // need `pnpm build` first, and the dev server is what CI would otherwise
    // be testing against anyway.
    // Invoke the vite binary directly: a `pnpm exec` wrapper spawns vite as a
    // child that does not receive the teardown signal, so Playwright waits
    // forever for the webServer to exit and the CI job hangs.
    command: `node_modules/.bin/vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
