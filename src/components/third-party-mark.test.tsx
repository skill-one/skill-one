import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThirdPartyMark } from "./third-party-mark";
import { TooltipProvider } from "./ui/tooltip";
import { renderWithRouter } from "../test/test-utils";

function renderMark(props: { className?: string; muted?: boolean } = {}) {
  return renderWithRouter(
    <TooltipProvider>
      <ThirdPartyMark {...props} />
    </TooltipProvider>,
  );
}

describe("ThirdPartyMark", () => {
  it("is a labelled graphic, not a decoration: nothing prints its name beside it", () => {
    renderMark();

    const mark = screen.getByRole("img", { name: "第三方安装" });
    expect(mark).toBeInTheDocument();
    // Labelled rather than hidden, unlike the owner face it stands in for.
    expect(mark).not.toHaveAttribute("aria-hidden");
    // The glyph is decoration inside the mark and must not leak into the name.
    expect(mark.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("wears the owner's shape, so it drops into the face's column unchanged", () => {
    renderMark({ className: "size-5" });

    const mark = screen.getByRole("img", { name: "第三方安装" });
    // The same round box and the same hairline border `OwnerAvatar` wears — the
    // face's geometry — so nothing in the layout moves when one replaces the
    // other.
    expect(mark).toHaveClass("rounded-full", "border", "size-5");
    expect(mark).not.toHaveClass("size-8");
  });

  it("wears a clean neutral fill matching the owner-face fallback", () => {
    renderMark({ className: "size-4" });

    const mark = screen.getByRole("img", { name: "第三方安装" });
    expect(mark).toHaveClass("border-border/60", "bg-muted", "text-muted-foreground");
    expect(mark).not.toHaveClass("bg-amber-500/10");
    expect(mark).not.toHaveClass("text-amber-500/80");
    // 72% of the box, not the 58% that left a three-pixel smudge in a square.
    expect(mark.querySelector("svg")).toHaveClass("size-[72%]");
  });

  it("files the closed case under the owner-face's neutral fill when muted", () => {
    // A source-less skill with nothing to link is a settled fact: the muted
    // tone reports it without the amber asking for a press that has nothing
    // behind it — while keeping the box's border so it never collapses into a
    // bare failed-avatar placeholder.
    renderMark({ muted: true, className: "size-4" });

    const mark = screen.getByRole("img", { name: "第三方安装" });
    expect(mark).toHaveClass("border-border/60", "bg-muted");
    expect(mark).toHaveClass("text-muted-foreground");
    expect(mark).not.toHaveClass("bg-amber-500/10");
    expect(mark).not.toHaveClass("text-amber-500/80");
  });

  it("spells the fact out on hover, since the mark carries no text", async () => {
    const user = userEvent.setup();
    renderMark();

    await user.hover(screen.getByRole("img", { name: "第三方安装" }));

    expect(
      await screen.findByRole("tooltip"),
    ).toHaveTextContent("第三方安装，未关联来源");
  });

  it("renders a clean monogram avatar when name is provided without candidates", () => {
    renderWithRouter(
      <TooltipProvider>
        <ThirdPartyMark name="git-commit" className="size-7" />
      </TooltipProvider>,
    );

    const mark = screen.getByRole("img", { name: "第三方安装" });
    expect(mark).toHaveTextContent("G");
    // Clean monogram: no badge in corner when candidate is false
    expect(mark.querySelector("svg")).toBeNull();
  });

  it("renders an amber link badge when candidate is true", () => {
    renderWithRouter(
      <TooltipProvider>
        <ThirdPartyMark name="pdf" candidate className="size-6" />
      </TooltipProvider>,
    );

    const mark = screen.getByRole("img", { name: "第三方安装" });
    expect(mark).toHaveTextContent("P");
    expect(mark.querySelector(".bg-amber-500")).not.toBeNull();
  });
});
