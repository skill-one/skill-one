import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HardDrive } from "lucide-react";

import { CollapsibleSection } from "./collapsible-section";

function renderSection(
  props: Partial<Parameters<typeof CollapsibleSection>[0]> = {},
) {
  return render(
    <CollapsibleSection title="今天" count="3 个 skill" {...props}>
      <div>section body</div>
    </CollapsibleSection>,
  );
}

describe("CollapsibleSection", () => {
  it("opens unfolded: the header names the section and holds the count", () => {
    renderSection();

    // The whole header row is the one trigger, open from the first paint.
    const trigger = screen.getByRole("button", { name: /今天/ });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveTextContent("3 个 skill");
    // The section is named for assistive tech (a labelled <section> is a
    // region landmark).
    expect(screen.getByRole("region", { name: "今天" })).toBeInTheDocument();
    // The body is shown, not held back.
    expect(screen.getByText("section body")).toBeVisible();
  });

  it("pins the trigger while its section scrolls past", () => {
    renderSection();
    // The pinning ground is the trigger's wrapper: a square, opaque rectangle
    // (the trigger keeps its rounded hover corners inside it).
    const trigger = screen.getByRole("button", { name: /今天/ });
    expect(trigger.parentElement).toHaveClass(
      "sticky",
      "top-0",
      "z-10",
      "bg-background",
    );
  });

  it("keeps the body 16px below the header and drops the gap when folded", async () => {
    const user = userEvent.setup();
    renderSection();

    // The gap is the panel's top padding on top of the trigger's own padding.
    const panel = screen.getByText("section body").parentElement!;
    expect(panel).toHaveClass("pt-2");

    // Folding unmounts the panel, so its gap leaves with it — a folded header
    // carries no trailing space.
    await user.click(screen.getByRole("button", { name: /今天/ }));
    expect(screen.queryByText("section body")).not.toBeInTheDocument();
  });

  it("folds the body from the header, then unfolds it, keeping the count", async () => {
    const user = userEvent.setup();
    renderSection();

    // The chevron's state class rides the Collapsible root's data-open
    // attribute: down 90° while open, the class present from first paint.
    const chevron = document.querySelector("svg.lucide-chevron-right");
    expect(chevron).toHaveClass("group-data-[open]/section:rotate-90");

    await user.click(screen.getByRole("button", { name: /今天/ }));
    // Folded: the trigger flips its state and the body leaves the view, but
    // the count stays on the header so the folded section states its size.
    expect(screen.getByRole("button", { name: /今天/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    // Base UI unmounts the folded panel rather than hiding it.
    expect(screen.queryByText("section body")).not.toBeInTheDocument();
    expect(screen.getByText("3 个 skill")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /今天/ }));
    expect(screen.getByRole("button", { name: /今天/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("section body")).toBeVisible();
  });

  it("draws the source glyph when the section carries one", () => {
    renderSection({ icon: HardDrive });
    // The glyph is decorative: the title still names the section. (The
    // accessible name carries no whitespace between the title span and the
    // badge.)
    expect(document.querySelector("svg.lucide-hard-drive")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /今天\s*3 个 skill/ }),
    ).toBeInTheDocument();
  });

  it("can start folded", () => {
    renderSection({ defaultOpen: false });
    expect(screen.getByRole("button", { name: /今天/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText("section body")).not.toBeInTheDocument();
  });
});
