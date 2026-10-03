import { expect } from "vitest";
import axe from "axe-core";

/**
 * Assert that a rendered surface has no detectable accessibility violations.
 *
 * Calls `axe-core` directly rather than through a matcher wrapper. The obvious
 * wrapper (`vitest-axe`) ships an empty `extend-expect` entry point and does
 * not re-export its matcher from the package root, so `toHaveNoViolations()`
 * simply is not there to register; `axe-core` is also the library that wrapper
 * delegates to, so nothing is lost but the indirection.
 *
 * Scoped to the element passed in rather than to `document.body`, so a
 * violation is attributed to the component under test instead of to whatever
 * else the test left mounted — the same reason every other query in this suite
 * is scoped.
 *
 * `incomplete` results are deliberately not failures. jsdom runs no layout
 * engine, so rules that depend on geometry or painted pixels (colour contrast
 * above all) cannot be decided there and come back `incomplete`; treating those
 * as failures would mean asserting nothing. What axe *can* decide statically —
 * roles, names, relationships, keyboard access — is exactly the part a
 * hand-written test tends to miss, and that part is enforced.
 */
export async function expectNoA11yViolations(container: Element): Promise<void> {
  const { violations } = await axe.run(container);
  // Projected rather than compared whole, so a failure names the rule, its
  // severity and the selectors that tripped it — all a maintainer needs, and
  // none of axe's very large result object.
  expect(
    violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.flatMap((node) => node.target),
    })),
  ).toEqual([]);
}
