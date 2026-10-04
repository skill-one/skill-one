import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";

import type { InstalledSkill } from "../../lib/skills-manager";
import {
  avatarFace,
  jarCardScale,
  jarFaces,
  rightedAngularVelocity,
  spawnOf,
  tapVelocityX,
  JAR_CAPACITY,
  TAP_COUNT,
  HubJar,
} from "./hub-jar";

// The pour is a motion concern; the tests drive both presentations through a
// switchable mock instead of a media query.
const reduceMotionMock = vi.hoisted(() => vi.fn(() => false));
vi.mock("motion/react", () => ({ useReducedMotion: reduceMotionMock }));

function skill(name: string): InstalledSkill {
  return { name, enabled: true, description: "" };
}

describe("jarCardScale", () => {
  it("steps card size down as the roster grows", () => {
    const few = jarCardScale(3);
    const some = jarCardScale(10);
    const many = jarCardScale(30);
    // A sparse jar gets big, weighty capsules; a full roster shrinks to
    // compact icon tiles — edge and glyph step together.
    expect(few.width).toBeGreaterThan(some.width);
    expect(some.width).toBeGreaterThan(many.width);
    expect(few.glyph).toBeGreaterThan(many.glyph);
    for (const scale of [few, some, many]) {
      expect(scale.glyph).toBeLessThan(scale.width);
    }
  });

  it("keeps one size within each bucket, icon tiles square", () => {
    expect(jarCardScale(1)).toBe(jarCardScale(6));
    expect(jarCardScale(7)).toBe(jarCardScale(14));
    expect(jarCardScale(15)).toBe(jarCardScale(JAR_CAPACITY));
    // Only the sparse lg bucket prints a label; the rest stay icon-only
    // squares.
    expect(jarCardScale(3).labeled).toBe(true);
    for (const count of [7, 15]) {
      const scale = jarCardScale(count);
      expect(scale.labeled).toBe(false);
      expect(scale.width).toBe(scale.height);
    }
  });
});

describe("avatarFace", () => {
  it("is a stable tinted face per name", () => {
    expect(avatarFace("pdf")).toEqual(avatarFace("pdf"));
    const face = avatarFace("pdf");
    // The wash is the 8-digit-hue form (hue plus an alpha byte); the glyph
    // is the hue itself.
    expect(face.bg).toMatch(/^#[0-9a-f]{8}$/i);
    expect(face.fg).toMatch(/^#[0-9a-f]{6}$/i);
    expect(face.bg.startsWith(face.fg)).toBe(true);
  });

  it("splits same-prefix skills into different hues", () => {
    const hues = new Set(
      ["frontend-design", "frontend-devops", "frontend-debugger"].map(
        (name) => avatarFace(name).fg,
      ),
    );
    expect(hues.size).toBeGreaterThan(1);
  });

  it("only ever washes a palette hue", () => {
    for (let i = 0; i < 40; i += 1) {
      const { bg, fg } = avatarFace(`skill-${i}`);
      expect(bg.slice(0, 7).toLowerCase()).toBe(fg.toLowerCase());
      expect(bg.slice(7)).toBe("24");
    }
  });
});

describe("jarFaces", () => {
  it("leaves a lone name on its intrinsic hue", () => {
    const faces = jarFaces(["pdf"]);
    expect(faces.get("pdf")).toEqual(avatarFace("pdf"));
  });

  it("splits same-prefix siblings onto distinct hues, deterministically", () => {
    const trio = ["frontend-design", "frontend-devops", "frontend-debugger"];
    const faces = jarFaces(trio);
    const hues = trio.map((name) => faces.get(name)!.fg);
    expect(new Set(hues).size).toBe(3);
    // Pour order never repaints a face.
    expect(jarFaces([...trio].reverse())).toEqual(faces);
  });

  it("keeps unrelated prefixes on their own hues", () => {
    const faces = jarFaces(["pdf", "docx", "frontend-a", "frontend-b"]);
    expect(faces.get("pdf")).toEqual(avatarFace("pdf"));
    expect(faces.get("docx")).toEqual(avatarFace("docx"));
    expect(faces.get("frontend-a")!.fg).not.toBe(faces.get("frontend-b")!.fg);
  });
});

describe("rightedAngularVelocity", () => {
  it("leaves small leans, including upright after a full turn, untouched", () => {
    expect(rightedAngularVelocity(0, 0.1)).toBeNull();
    expect(rightedAngularVelocity(0.3, 0)).toBeNull();
    expect(rightedAngularVelocity(-0.4, 0)).toBeNull();
    expect(rightedAngularVelocity(2 * Math.PI, 0)).toBeNull();
  });

  it("restores a standing card toward upright the short way", () => {
    expect(rightedAngularVelocity(Math.PI / 2, 0)).toBeLessThan(0);
    expect(rightedAngularVelocity(-Math.PI / 2, 0)).toBeGreaterThan(0);
  });

  it("flips an inverted card instead of holding it upside down", () => {
    expect(rightedAngularVelocity(Math.PI, 0)).toBeLessThan(0);
    expect(rightedAngularVelocity(-Math.PI, 0)).toBeGreaterThan(0);
  });

  it("damps the spin it inherits while righting", () => {
    // 0.85·v − 0.02·tilt, at a quarter turn with v = 1.
    expect(rightedAngularVelocity(Math.PI / 2, 1)).toBeCloseTo(
      0.85 - 0.02 * (Math.PI / 2),
    );
  });
});

describe("spawnOf", () => {
  it("is a deterministic, bounded pose replay", () => {
    const a = spawnOf("pdf");
    expect(spawnOf("pdf")).toEqual(a);
    expect(a.unit).toBeGreaterThanOrEqual(0);
    expect(a.unit).toBeLessThan(1);
    // The wider entry tilt still rests inside the righting band, so no card
    // spawns already condemned to a flip.
    expect(Math.abs(a.angle)).toBeLessThanOrEqual(0.4);
    // A seeded sideways drift sends cards down varied paths.
    expect(Math.abs(a.drift)).toBeLessThanOrEqual(1.5);
  });

  it("spreads names across columns, tilts and drifts", () => {
    const poses = Array.from({ length: 20 }, (_, i) => spawnOf(`skill-${i}`));
    const units = new Set(poses.map((p) => p.unit.toFixed(3)));
    const tilts = new Set(poses.map((p) => p.angle.toFixed(3)));
    const drifts = new Set(poses.map((p) => p.drift.toFixed(3)));
    expect(units.size).toBeGreaterThan(15);
    expect(tilts.size).toBeGreaterThan(15);
    expect(drifts.size).toBeGreaterThan(15);
    // Drifts run both ways — the rain is not one uniform breeze.
    expect(poses.some((p) => p.drift > 0.2)).toBe(true);
    expect(poses.some((p) => p.drift < -0.2)).toBe(true);
  });
});

describe("tapVelocityX", () => {
  it("alternates the jar-tap direction each round", () => {
    for (const name of ["pdf", "docx", "frontend-design"]) {
      expect(tapVelocityX(name, 0)).toBeGreaterThan(0);
      expect(tapVelocityX(name, 1)).toBeLessThan(0);
      expect(tapVelocityX(name, TAP_COUNT - 1)).toBeGreaterThan(0);
    }
  });

  it("is seeded per card and replayable", () => {
    expect(tapVelocityX("pdf", 0)).toBe(tapVelocityX("pdf", 0));
    // The shared shove dominates the per-card jitter, so a round always
    // moves the pile as one body rather than churning in place.
    for (const name of ["a", "b", "c", "d"]) {
      expect(Math.abs(tapVelocityX(name, 0))).toBeGreaterThan(1.5);
    }
  });
});

describe("HubJar", () => {
  it("pours labeled capsules in the sparse bucket: emoji, name, no tooltip need", () => {
    const names = ["mcp-builder", "code-review", "frontend-design"];
    const emojis = new Map([
      ["mcp-builder", "🔧"],
      ["code-review", "🧪"],
      ["frontend-design", "🎨"],
    ]);
    const { container } = render(
      <HubJar skills={names.map(skill)} emojis={emojis} />,
    );

    expect(container.querySelectorAll("[data-skill]")).toHaveLength(3);
    for (const name of names) {
      const card = container.querySelector<HTMLElement>(
        `[data-skill="${name}"]`,
      );
      // The capsule wears the classification emoji and the printed name.
      expect(card).toHaveAttribute("aria-label", name);
      const face = card?.querySelector('[data-slot="jar-face"]');
      expect(face?.className).toContain("rounded-full");
      expect(face?.textContent).toContain(emojis.get(name));
      expect(face?.textContent).toContain(name);
      // A labeled capsule never wears the initial-only styling.
      expect(face?.className).not.toContain("uppercase");
    }
  });

  it("falls back to the display initial when no classification is known", () => {
    // 7 skills: the md bucket, where the face is icon-only — so the face's
    // whole text is the glyph alone.
    const names = ["pdf", "alpha", "beta", "gamma", "delta", "omega", "sigma"];
    const { container } = render(<HubJar skills={names.map(skill)} />);
    const face = container
      .querySelector('[data-skill="pdf"]')!
      .querySelector('[data-slot="jar-face"]')!;
    expect(face.textContent).toBe("p");
  });

  it("pours icon-only squares past the sparse bucket, name out of the tile", () => {
    // 7 skills: the md bucket — squares, emoji only, no printed label.
    const names = Array.from({ length: 7 }, (_, i) => `skill-${i}`);
    const emojis = new Map(names.map((name) => [name, "💻"]));
    const { container } = render(
      <HubJar skills={names.map(skill)} emojis={emojis} />,
    );

    const scale = jarCardScale(7);
    expect(scale.labeled).toBe(false);
    for (const card of container.querySelectorAll<HTMLElement>(
      "[data-skill]",
    )) {
      const name = card.getAttribute("data-skill")!;
      const face = card.querySelector('[data-slot="jar-face"]')!;
      // The emoji rides the face; the name does not.
      expect(face.textContent).toBe("💻");
      expect(face.textContent).not.toContain(name);
      expect(card).toHaveAttribute("aria-label", name);
      // Square squircle, not a capsule.
      expect(face.className).toContain("rounded-[22.5%]");
      expect(face.className).not.toContain("rounded-full");
    }
  });

  it("floats the skill name above a hovered tile in a tooltip", async () => {
    const user = userEvent.setup();
    render(<HubJar skills={[skill("mcp-builder")]} />);

    const tile = screen.getByLabelText("mcp-builder");
    await user.hover(tile);
    const tip = await screen.findByRole("tooltip", { name: "mcp-builder" });
    expect(tip).toBeInTheDocument();
  });

  it("pours fixed tiles cut to the bucket size", () => {
    const { container } = render(
      <HubJar skills={[skill("pdf"), skill("docx")]} />,
    );
    const scale = jarCardScale(2);
    for (const card of container.querySelectorAll<HTMLElement>(
      "[data-skill]",
    )) {
      // One fixed rectangle per bucket — the physics body is cut to it.
      expect(card.style.width).toBe(`${scale.width}px`);
      expect(card.style.height).toBe(`${scale.height}px`);
      // The face fills the tile edge to edge.
      const face = card.querySelector<HTMLElement>('[data-slot="jar-face"]');
      expect(face?.style.width).toBe(`${scale.width}px`);
      expect(face?.style.height).toBe(`${scale.height}px`);
      expect(face?.style.fontSize).toBe(`${scale.glyph}px`);
    }
  });

  it("keeps the same tiles in the static, reduced-motion pile", () => {
    reduceMotionMock.mockReturnValue(true);
    try {
      const { container } = render(
        <HubJar skills={[skill("frontend-a"), skill("frontend-b")]} />,
      );
      const scale = jarCardScale(2);
      for (const card of container.querySelectorAll<HTMLElement>(
        "[data-skill]",
      )) {
        expect(card.style.width).toBe(`${scale.width}px`);
        expect(card.style.height).toBe(`${scale.height}px`);
        expect(card.querySelector('[data-slot="jar-face"]')).not.toBeNull();
        // The seeded static pose, not the pour's spawn transform.
        expect(card.style.getPropertyValue("--scatter-rotate")).toBeTruthy();
      }
    } finally {
      reduceMotionMock.mockReturnValue(false);
    }
  });
});
