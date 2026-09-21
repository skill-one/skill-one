import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { SkillCover } from "./skill-cover";

/** The one attribute the component marks itself with. */
const COVER = '[data-slot="skill-cover"]';

describe("SkillCover", () => {
  it("shows the author's initial", () => {
    const { container } = render(
      <SkillCover repo="anthropics/skills" name="pdf" />,
    );

    expect(container.querySelector(COVER)).toHaveTextContent("a");
  });

  it("names the slot after the skill for assistive tech", () => {
    const { container } = render(
      <SkillCover repo="anthropics/skills" name="pdf" />,
    );

    // One name for the whole slot, never two different things.
    expect(container.querySelector(COVER)).toHaveAttribute(
      "aria-label",
      "pdf 封面图",
    );
    expect(container.querySelector(COVER)).toHaveAttribute("role", "img");
  });

  it("falls back to the skill's own name when there is no source to name", () => {
    const { container } = render(<SkillCover name="my-tool" />);

    // A hand-placed local install has no owner, so its own name stands in.
    expect(container.querySelector(COVER)).toHaveTextContent("m");
  });

  it("still fills the slot when there is neither a source nor a name", () => {
    const { container } = render(<SkillCover />);

    expect(container.querySelector(COVER)).toHaveTextContent("?");
  });

  it("follows the skill it is pointed at next", () => {
    const { container, rerender } = render(
      <SkillCover repo="anthropics/skills" name="pdf" />,
    );
    expect(container.querySelector(COVER)).toHaveTextContent("a");

    rerender(<SkillCover repo="vercel-labs/skills" name="find-skills" />);

    // A reused instance must not keep the previous skill's initial.
    expect(container.querySelector(COVER)).toHaveTextContent("v");
    expect(container.querySelector(COVER)).toHaveAttribute(
      "aria-label",
      "find-skills 封面图",
    );
  });
});
