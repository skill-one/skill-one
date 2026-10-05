import { expect, test } from "@playwright/test";

/**
 * One end-to-end test, deliberately.
 *
 * The 846-test jsdom suite cannot see whether the app is *operable*. It
 * replaces the document, so nothing is hit-tested, nothing is laid out, and
 * nothing has to be clickable. That gap is not hypothetical: the header centres
 * its brand mark with an `absolute inset-0` wrapper, and that wrapper painted
 * over the nav and swallowed every click on it. The app was unusable — no
 * navigation at all — while all fourteen header component tests stayed green.
 *
 * So this test clicks a nav link, which is the one assertion a browser can make
 * and jsdom cannot. Everything else that used to live here was a slower restatement
 * of something the fast suite already covers: the drawer and its Escape
 * dismissal (`skill-detail-panel.test.tsx`), focus and Enter (`userEvent` in the
 * same suites), the catch-all redirect (`App.test.tsx`), and nested-control
 * validity (axe, in `src/test/a11y.ts`). Screenshot baselines went with them:
 * they cost two committed images to maintain, they differ across platforms and
 * font versions, and a real CSS regression shows up in the click below anyway.
 *
 * The Rust backend is not reachable from here — in a browser `isTauri()` is
 * false, so installs go through `mock-local`. The command layer is covered from
 * the other side instead; see docs/testing.md.
 */

/**
 * The app's language preference is `system` by default, which resolves through
 * `navigator.language` — so a spec asserting Chinese copy would pass on a
 * Chinese machine and fail in CI. Pinned the way the jsdom suite pins it, before
 * any script runs.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("skill-one-language", "zh");
  });
});

test("a nav link takes a click, and the list it opens is operable", async ({
  page,
}) => {
  // `domcontentloaded`, not Playwright's default `load`: the registry index
  // request is still in flight when the app is interactive, and it is aborted
  // rather than resolved when the CDN is unreachable, so `load` may never
  // arrive. Waiting on it would hang the suite on the network instead of on the
  // app.
  await page.goto("/#/installed", { waitUntil: "domcontentloaded" });

  // The header is the app's own chrome, so its presence means React rendered.
  await expect(page.getByRole("banner")).toBeVisible();

  // The claim: the nav is operable, not merely present. This is the assertion
  // that failed before the header's overlay was made transparent to pointers.
  await page.getByRole("link", { name: "我的技能" }).click();
  await expect(page).toHaveURL(/#\/installed$/);
  await expect(page.getByRole("link", { name: "我的技能" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // And the page behind it is real: a row from the browser stand-in, rendered
  // with a non-zero box. A zero-height element is what jsdom would also report
  // for a stylesheet that never loaded, so height is the part worth asserting
  // here — it is the only proof in the suite that the CSS actually applied.
  const row = page.getByRole("button", { name: /查看 pdf 详情/ });
  await expect(row).toBeVisible();
  expect((await row.boundingBox())?.height).toBeGreaterThan(0);

  // A row is reachable and takes a click, which is the same claim one level
  // down: the interactive surface is not just in the document.
  await row.click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
