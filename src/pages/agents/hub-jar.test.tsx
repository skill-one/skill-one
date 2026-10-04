import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";

import type { InstalledSkill } from "../../lib/skills-manager";
import {
  avatarFace,
  jarCardScale,
  jarFaces,
  labeledCapacity,
  rightedAngularVelocity,
  settledPoses,
  spawnOf,
  tapVelocityX,
  JAR_CAPACITY,
  JAR_NOMINAL_CAPACITY,
  TAP_COUNT,
  HubJar,
} from "./hub-jar";

function skill(name: string): InstalledSkill {
  return { name, enabled: true, description: "" };
}

/** A roster of `count` throwaway names, longest-first so truncation shows. */
function roster(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `skill-number-${i}`);
}

describe("labeledCapacity", () => {
  it("counts the capsules the floor holds, across and down", () => {
    // The jar at the app's default window (380×190): a 66×26 capsule in a 72×32
    // slot, so five across and five down.
    expect(labeledCapacity(380, 190)).toBe(25);
    // A narrower window holds fewer across, and the rows do not change.
    expect(labeledCapacity(200, 190)).toBe(10);
  });

  it("holds nothing when the field cannot take a single capsule", () => {
    // Too narrow, too short, or not measured at all: no names anywhere, rather
    // than a fractional card the pour would have to clip.
    expect(labeledCapacity(40, 190)).toBe(0);
    expect(labeledCapacity(380, 20)).toBe(0);
    expect(labeledCapacity(0, 0)).toBe(0);
  });

  it("keeps the answer whole, so a resize only ever steps it", () => {
    // The pour is keyed on this integer, so a resize that does not change it
    // must not read as a different jar: two fields a few pixels apart, one
    // capacity.
    expect(labeledCapacity(381, 190)).toBe(labeledCapacity(380, 190));
    // And one that crosses a step does change it.
    expect(labeledCapacity(72 * 5 - 1, 190)).toBe(20);
    expect(labeledCapacity(72 * 5, 190)).toBe(25);
  });
});

describe("jarCardScale", () => {
  it("keeps the whole roster named while the floor holds it", () => {
    // Names are the point of a card, so they are the last thing to go: a roster
    // of 20 still wears 20 capsules in a field that holds 25, and 21 tips the
    // whole jar over to icons rather than naming half of it.
    expect(jarCardScale(1).labeled).toBe(true);
    expect(jarCardScale(20).labeled).toBe(true);
    expect(jarCardScale(JAR_NOMINAL_CAPACITY).labeled).toBe(true);
    expect(jarCardScale(JAR_NOMINAL_CAPACITY + 1).labeled).toBe(false);
  });

  it("answers for the field it is given, not a fixed count", () => {
    // The same roster is named in a wide jar and icon-only in a narrow one —
    // which is the whole reason the capacity is measured.
    expect(jarCardScale(12, 25).labeled).toBe(true);
    expect(jarCardScale(12, 6).labeled).toBe(false);
  });

  it("steps card size down as the roster outgrows the floor", () => {
    const named = jarCardScale(20);
    const some = jarCardScale(12, 6);
    const many = jarCardScale(30, 6);
    // Past capacity the jar drops to icon tiles, and shrinks again once the
    // pile is a box of them — edge and glyph step together.
    expect(named.width).toBeGreaterThan(some.width);
    expect(some.width).toBeGreaterThan(many.width);
    expect(named.glyph).toBeLessThan(named.width);
    expect(many.glyph).toBeLessThan(many.width);
  });

  it("keeps one size within each bucket, icon tiles square", () => {
    expect(jarCardScale(1)).toBe(jarCardScale(6));
    expect(jarCardScale(7, 6)).toBe(jarCardScale(14, 6));
    expect(jarCardScale(15, 6)).toBe(jarCardScale(JAR_CAPACITY, 6));
    // Only the named bucket prints a label; the rest stay icon-only squares.
    expect(jarCardScale(3).labeled).toBe(true);
    for (const count of [7, 15]) {
      const scale = jarCardScale(count, 6);
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

describe("settledPoses", () => {
  const field = { width: 360, height: 190 };
  const lg = jarCardScale(6);

  it("rests a pile at the floor of the field, not at its rim", () => {
    // The whole point of solving rather than pouring: every card comes to rest
    // against the floor, so the jar reads as a jar of settled things.
    const poses = settledPoses(roster(6), field, lg);
    expect(poses).toHaveLength(6);
    for (const pose of poses) {
      expect(pose.y + lg.height).toBeLessThanOrEqual(field.height);
      // And inside the side walls, within the chamfer's slack.
      expect(pose.x).toBeGreaterThan(-lg.width);
      expect(pose.x + lg.width).toBeLessThan(field.width + lg.width);
    }
  });

  it("answers the same pile every run — a replay, not a reroll", () => {
    // The pour was seeded precisely so the jar looks the same on every visit;
    // solving it must not have cost that.
    const names = roster(12);
    expect(settledPoses(names, field, lg)).toEqual(
      settledPoses(names, field, lg),
    );
  });

  it("is a pile, not a grid: distinct cards do not share a slot", () => {
    // The settled heap is loose and overlapping, so no two cards rest on the
    // same spot — the arrangement the tap phase exists to produce.
    const poses = settledPoses(roster(12), field, lg);
    const spots = new Set(poses.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`));
    expect(spots.size).toBe(12);
  });

  it("rights the pile: no card settles upside down", () => {
    // The righting moment is what the settle has to survive, so the solved rest
    // state is inside the tilt band for every card.
    for (const pose of settledPoses(roster(20), field, lg)) {
      const tilt = Math.abs(Math.atan2(Math.sin(pose.angle), Math.cos(pose.angle)));
      expect(tilt).toBeLessThanOrEqual(0.4 + 1e-6);
    }
  });

  it("parks a roster in a field too small to hold, rather than losing it", () => {
    // No layout at all: a pose per card still comes back, so every skill keeps
    // a tile and the frame never answers with fewer cards than it was given.
    for (const [w, h] of [
      [0, 0],
      [40, 0],
    ]) {
      const poses = settledPoses(roster(6), { width: w, height: h }, lg);
      expect(poses).toHaveLength(6);
    }
    // And an empty roster is an empty pile, not a throw.
    expect(settledPoses([], field, lg)).toEqual([]);
  });
});

describe("HubJar", () => {
  it("pours labeled capsules: emoji, name, no tooltip need", () => {
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
    // Past the field's capacity the jar is icon-only, and with no emoji to wear
    // the face's whole text is the initial alone — the name waits in the tooltip.
    const { container } = render(<HubJar skills={roster(30).map(skill)} />);
    const face = container
      .querySelector('[data-skill="skill-number-0"]')!
      .querySelector('[data-slot="jar-face"]')!;
    expect(face.textContent).toBe("s");
  });

  it("keeps a named roster named, however many the field holds", () => {
    // The whole point of measuring the field: a dozen cards is not a "full"
    // roster any more, and every one of them still carries its name.
    const names = roster(12);
    const { container } = render(<HubJar skills={names.map(skill)} />);

    expect(jarCardScale(12).labeled).toBe(true);
    const faces = container.querySelectorAll('[data-slot="jar-face"]');
    expect(faces).toHaveLength(12);
    for (const [index, face] of Array.from(faces).entries()) {
      expect(face.className).toContain("rounded-full");
      expect(face.textContent).toContain(names[index]);
    }
  });

  it("lays out icon-only squares once the roster outgrows the field, name out of the tile", () => {
    // One card past the capacity tips the whole jar to icons: never a jar of
    // half-named cards, which would read as an arbitrary line through the
    // roster rather than as one answer about the jar being full.
    const names = roster(JAR_NOMINAL_CAPACITY + 1);
    const emojis = new Map(names.map((name) => [name, "💻"]));
    const { container } = render(
      <HubJar skills={names.map(skill)} emojis={emojis} />,
    );

    const scale = jarCardScale(names.length);
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

  it("rests every tile at its solved pose, and holds it still", () => {
    // The jar states a roster, it does not perform one: each tile carries the
    // resting pose the solve laid out for it, written in the layout pass so
    // there is no frame in which a card is anywhere else. A re-render with the
    // same roster does not move a card.
    const names = ["frontend-a", "frontend-b"];
    const { container, rerender } = render(
      <HubJar skills={names.map(skill)} />,
    );
    const read = () =>
      Array.from(container.querySelectorAll<HTMLElement>("[data-skill]")).map(
        (card) => card.style.transform,
      );

    const poses = read();
    for (const pose of poses) {
      expect(pose).toContain("translate(");
      expect(pose).toContain("rotate(");
      // A solved pose, not the spawn stack above the rim: every card has come
      // down into the field.
      expect(pose).not.toMatch(/translate\(0px, -\d/);
    }
    rerender(<HubJar skills={names.map(skill)} />);
    expect(read()).toEqual(poses);
  });
});
