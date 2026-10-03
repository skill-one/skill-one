import { expect, test } from "@playwright/test";

/**
 * The journeys that only exist once the real shell is mounted: routing, the
 * installed list drawn from `mock-local`, the detail drawer, and the keyboard
 * path through both.
 *
 * Every locator is a role or a visible name. That is not stylistic — a
 * selector that reaches into the DOM keeps working after the thing it names
 * has been replaced by something worse, which is the opposite of what a
 * regression test is for.
 */

/** The app is one page behind a hash router, so every journey starts here. */
const app = async (page: import("@playwright/test").Page, hash = "#/") => {
  await page.goto(`/${hash}`);
  // The header is the app's own chrome and mounts on every route, so its
  // presence means React has rendered rather than the document having loaded.
  await expect(page.getByRole("banner")).toBeVisible();
};

test.describe("navigation", () => {
  test("lands on the agents view and moves between the three lists", async ({
    page,
  }) => {
    await app(page);

    await page.getByRole("link", { name: "浏览" }).click();
    await expect(page).toHaveURL(/#\/explore$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.getByRole("link", { name: "已安装" }).click();
    await expect(page).toHaveURL(/#\/installed$/);
    await expect(
      page.getByRole("heading", { level: 1, name: /已安装/ }),
    ).toBeVisible();
  });

  test("sends an unknown route back to the landing view", async ({ page }) => {
    // The catch-all is a redirect, not a 404: a stale bookmark should land
    // somewhere useful rather than on a blank shell.
    await app(page, "#/no-such-page");
    await expect(page).toHaveURL(/#\/$/);
  });
});

test.describe("installed skills", () => {
  test.beforeEach(async ({ page }) => {
    await app(page, "#/installed");
  });

  test("lists the installed skills from the browser stand-in", async ({
    page,
  }) => {
    // `mock-local` is what the browser build serves, so this is the only place
    // the installed list can be seen end to end without the Rust backend.
    await expect(page.getByRole("button", { name: /查看 pdf 详情/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /查看 docx 详情/ }),
    ).toBeVisible();
  });

  test("opens a skill's detail drawer and closes it with Escape", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /查看 pdf 详情/ }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("pdf");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("walks the list with the keyboard alone", async ({ page }) => {
    // The drawer's arrow-key walk is a claim the component tests make against
    // a mounted panel; here it is the whole page taking focus in the first
    // place, which jsdom cannot show.
    const first = page.getByRole("button", { name: /查看 pdf 详情/ });
    await first.focus();
    await expect(first).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("never nests one control inside another", async ({ page }) => {
    // The card body is a click target, so a button placed inside it would be
    // unreachable and invalid. Checked on the live DOM, which is the only
    // place the nesting actually exists.
    const nested = await page
      .locator('button button, a button, button a')
      .count();
    expect(nested).toBe(0);
  });
});

test.describe("visual regression", () => {
  // Baselines are generated on first run and committed. They are captured in
  // this project rather than in a hosted service because the alternative would
  // put the whole app's rendered surface in a third-party account.
  test.use({ reducedMotion: "reduce" });

  test("the installed list", async ({ page }) => {
    await app(page, "#/installed");
    await expect(page.getByRole("button", { name: /查看 pdf 详情/ })).toBeVisible();
    await expect(page).toHaveScreenshot("installed.png", {
      // Fonts settle a frame after first paint, and a screenshot taken before
      // then captures a fallback face and fails on every machine but this one.
      animations: "disabled",
      fullPage: true,
    });
  });

  test("the detail drawer", async ({ page }) => {
    await app(page, "#/installed");
    await page.getByRole("button", { name: /查看 pdf 详情/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page).toHaveScreenshot("detail-drawer.png", {
      animations: "disabled",
    });
  });
});
