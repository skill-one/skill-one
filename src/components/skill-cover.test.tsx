import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";

import { SkillCover } from "./skill-cover";

/**
 * jsdom never loads an image, and Radix reads `complete` / `naturalWidth` off
 * the one it preloads to decide the status. This fake keeps jsdom's values —
 * so the candidate chain walks exactly as it does under the test runner —
 * while recording the addresses it walked. A real browser walks the same list
 * through the image's own error events.
 */
class RecordingImage {
  static requested: string[] = [];
  complete = true;
  naturalWidth = 0;
  referrerPolicy = "";
  crossOrigin: string | null = null;
  private source = "";

  set src(value: string) {
    this.source = value;
    RecordingImage.requested.push(value);
  }
  get src(): string {
    return this.source;
  }
  addEventListener() {}
  removeEventListener() {}
}

/** The one attribute the component marks itself with. */
const COVER = '[data-slot="skill-cover"]';

beforeEach(() => {
  RecordingImage.requested = [];
  vi.stubGlobal("Image", RecordingImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SkillCover", () => {
  it("addresses the skill's cover in the profiles dataset, over the source chain", () => {
    const { container } = render(
      <SkillCover repo="anthropics/skills" name="pdf" />,
    );

    // The canonical id is `repo/name`; the cover sits next to the skill's
    // profile files. Origin first, CDN mirror as the fallback — the same
    // chain every other registry file rides.
    expect(RecordingImage.requested[0]).toBe(
      "https://raw.githubusercontent.com/skill-one/skills-profiles/dist/skills/anthropics/skills/pdf/cover.png",
    );
    expect(RecordingImage.requested.at(-1)).toContain("cdn.jsdmirror.com");
    // Nothing loads here, so the slot carries the author's initial.
    expect(container.querySelector(COVER)).toHaveTextContent("a");
  });

  it("names the slot after the skill for assistive tech", () => {
    const { container } = render(
      <SkillCover repo="anthropics/skills" name="pdf" />,
    );

    // One name for the whole slot: the image and its fallback are never
    // announced as two different things.
    expect(container.querySelector(COVER)).toHaveAttribute(
      "aria-label",
      "pdf 封面图",
    );
    expect(container.querySelector(COVER)).toHaveAttribute("role", "img");
  });

  it("falls back to the skill's own name when there is no source to name", () => {
    const { container } = render(<SkillCover name="my-tool" />);

    // A hand-placed local install has no owner, so its own name stands in.
    expect(RecordingImage.requested).toEqual([]);
    expect(container.querySelector(COVER)).toHaveTextContent("m");
  });

  it("still fills the slot when there is neither a source nor a name", () => {
    const { container } = render(<SkillCover />);

    expect(container.querySelector(COVER)).toHaveTextContent("?");
  });

  it("restarts the chain for the skill it is pointed at next", () => {
    const { container, rerender } = render(
      <SkillCover repo="anthropics/skills" name="pdf" />,
    );
    expect(container.querySelector(COVER)).toHaveTextContent("a");

    rerender(<SkillCover repo="vercel-labs/skills" name="find-skills" />);

    // A reused instance must not keep the previous skill's address or its
    // initial.
    expect(RecordingImage.requested.at(-1)).toContain(
      "skills/vercel-labs/skills/find-skills/cover.png",
    );
    expect(container.querySelector(COVER)).toHaveTextContent("v");
    expect(container.querySelector(COVER)).toHaveAttribute(
      "aria-label",
      "find-skills 封面图",
    );
  });
});
