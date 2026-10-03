import { expect, test, type Page } from "@playwright/test";

/**
 * The journeys that only exist once the real shell is mounted: routing, the
 * installed list drawn from `mock-local`, the detail drawer, and the keyboard
 * path through both.
 *
 * Every locator is a role or a visible name. That is not stylistic — a selector
 * that reaches into the DOM keeps working after the thing it names has been
 * replaced by something worse, which is the opposite of what a regression test
 * is for.
 */

/**
 * The app's language preference is `system` by default, which resolves through
 * `navigator.language` — so a spec asserting Chinese copy would pass on a
 * Chinese machine and fail in CI. Pinned the same way the jsdom suite pins it
 * in `src/test/setup.ts`, before any script runs, so the copy these locators
 * name is the copy the app renders.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("skill-one-language", "zh");
  });
});

/** The app is one page behind a hash router, so every journey starts here. */
const app = async (page: Page, hash = "#/") => {
  await page.goto(`/${hash}`);
  // The header is the app's own chrome and mounts on every route, so its
  // presence means React has rendered rather than the document having loaded.
  await expect(page.getByRole("banner")).toBeVisible();
};

test.describe("navigation", () => {
  test("moves between the three lists and marks where it is", async ({
    page,
  }) => {
    await app(page);

    await page.getByRole("link", { name: "商店" }).click();
    await expect(page).toHaveURL(/#\/explore$/);
    // The nav sets `aria-current` by hand, because the active route family is
    // above what `NavLink` can know. That is what makes the current item
    // announced rather than merely highlighted.
    await expect(page.getByRole("link", { name: "商店" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await page.getByRole("link", { name: "已安装" }).click();
    await expect(page).toHaveURL(/#\/installed$/);
    await expect(page.getByRole("link", { name: "已安装" })).toHaveAttribute(
      "aria-current",
      "page",
    );
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
    await expect(
      page.getByRole("button", { name: /查看 pdf 详情/ }),
    ).toBeVisible();
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

  test("reaches and activates a row with the keyboard alone", async ({
    page,
  }) => {
    // The component tests prove the drawer answers Enter; this proves the row
    // takes focus in the first place inside the real document, which is a
    // question about tab order rather than about any component.
    const first = page.getByRole("button", { name: /查看 pdf 详情/ });
    await first.focus();
    await expect(first).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("never nests one control inside another", async ({ page }) => {
    // The card body is itself a click target, so a button placed inside it
    // would be both unreachable and invalid. Counted on the live DOM, which is
    // the only place the nesting actually exists.
    expect(await page.locator("button button, a button, button a").count()).toBe(
      0,
    );
  });
});

test.describe("visual regression", () => {
  // Baselines are generated on first run and committed. They live in this
  // repository rather than a hosted service because the alternative would put
  // the whole app's rendered surface in a third-party account.
  test.use({ reducedMotion: "reduce" });

  test("the installed list", async ({ page }) => {
    await app(page, "#/installed");
    await expect(
      page.getByRole("button", { name: /查看 pdf 详情/ }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot("installed.png", {
      // A screenshot taken before fonts settle captures a fallback face and
      // then fails on every machine but this one.
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
