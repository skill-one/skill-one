import { forwardRef, useLayoutEffect, useRef, type CSSProperties } from "react";
import Matter from "matter-js";
import { useReducedMotion } from "motion/react";

import type { InstalledSkill } from "../../lib/skills-manager";
import { cn } from "../../lib/utils";
import { scatterOf, scatterStyle, unitOf } from "../../lib/scatter";
import { skillDisplayName } from "../../lib/skill-view";
import { RIBBON_COLORS, ribbonColorIndex } from "./agent-graph-layout";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip";

/** Alpha of the hue wash a face wears (~14%), appended as 8-digit hex. */
const FACE_TINT_ALPHA = "24";

/** A palette hue as a tinted face: a soft wash with the hue as the glyph. */
function faceOfHue(hue: (typeof RIBBON_COLORS)[number]): {
  bg: string;
  fg: string;
} {
  return { bg: `${hue}${FACE_TINT_ALPHA}`, fg: hue };
}

/**
 * A skill avatar's stable, intrinsic face: the app's per-entity palette hue
 * (the same hash that colours an agent's ribbon) as a soft translucent
 * wash, with the initial in the hue itself.
 */
export function avatarFace(name: string): { bg: string; fg: string } {
  return faceOfHue(RIBBON_COLORS[ribbonColorIndex(name)]);
}

/**
 * The prefix truncated labels share: everything before the last hyphen
 * (`frontend-design` / `frontend-devops` → `frontend`). Names with no hyphen
 * key to themselves.
 */
function faceGroupKey(name: string): string {
  const dash = name.lastIndexOf("-");
  return dash > 0 ? name.slice(0, dash) : name;
}

/**
 * Every face a roster wears. A name keeps its intrinsic hue while it is the
 * only member of its prefix group; siblings that truncate to one label take
 * consecutive palette slots (starting at the first sorted member's hue), so
 * same-prefix chips never wear the same face. Deterministic for the roster
 * regardless of pour order.
 */
export function jarFaces(
  names: readonly string[],
): Map<string, { bg: string; fg: string }> {
  const groups = new Map<string, string[]>();
  for (const name of names) {
    const key = faceGroupKey(name);
    const group = groups.get(key);
    if (group) group.push(name);
    else groups.set(key, [name]);
  }
  const faces = new Map<string, { bg: string; fg: string }>();
  for (const members of groups.values()) {
    if (members.length === 1) {
      faces.set(members[0], avatarFace(members[0]));
      continue;
    }
    // Distinct consecutive slots, anchored at the lexicographically first
    // member's intrinsic hue — ranked by comparison, with no sort pass.
    const first = members.reduce((best, name) => (name < best ? name : best));
    const start = ribbonColorIndex(first);
    for (const name of members) {
      const rank = members.filter((other) => other < name).length;
      faces.set(
        name,
        faceOfHue(RIBBON_COLORS[(start + rank) % RIBBON_COLORS.length]),
      );
    }
  }
  return faces;
}

/** The most cards the jar simulates — its own capacity guarantee. */
export const JAR_CAPACITY = 50;

/**
 * One card-size bucket. A card is just the skill's squircle face — an icon
 * tile with no label: the jar reads as a box of app icons, and a face's
 * name floats above it in a tooltip on hover. A sparse jar pours big,
 * weighty tiles so a few skills still fill the floor; a full roster shrinks
 * to compact tiles that pack the capacity. The jar's own frame never
 * changes size, so the graph around it never re-flows as the roster grows.
 */
export interface JarCardScale {
  /** The square tile's edge — card width, height and physics body. */
  size: number;
  /** The initial glyph's size inside the face, in px. */
  glyph: number;
}

const CARD_SCALES: Record<"lg" | "md" | "sm", JarCardScale> = {
  lg: { size: 36, glyph: 18 },
  md: { size: 28, glyph: 14 },
  sm: { size: 22, glyph: 11 },
};

/** The card-size bucket for a roster of `count` — stable object per bucket. */
export function jarCardScale(count: number): JarCardScale {
  if (count <= 6) return CARD_SCALES.lg;
  if (count <= 14) return CARD_SCALES.md;
  return CARD_SCALES.sm;
}

/**
 * The largest lean a settled chip keeps without help — roughly 23°. Past
 * it a wide, flat chip reads as broken (a 100px label standing on edge or
 * upside down), so the run rights it.
 */
const TILT_BAND = 0.4;
/** Per-step spring and damper of the righting moment (critically-ish tuned). */
const RIGHTING_SPRING = 0.02;
const RIGHTING_DAMPING = 0.15;

/**
 * The angular velocity a tilted chip gets this step, or `null` when its
 * lean is inside the tilt band and needs no help. Models the weighted
 * bottom a wide flat chip has — which matter-js, whose bodies carry no
 * mass distribution, cannot express on its own: a standing or inverted
 * card turns back toward upright, while the small leans a pile props its
 * cards in stay untouched.
 */
export function rightedAngularVelocity(
  angle: number,
  angularVelocity: number,
): number | null {
  const tilt = Math.atan2(Math.sin(angle), Math.cos(angle));
  if (Math.abs(tilt) <= TILT_BAND) return null;
  // A restoring moment — opposite the tilt — so upright (0) is the stable
  // attractor and the inverted seam (±π) repels toward it.
  return angularVelocity * (1 - RIGHTING_DAMPING) - RIGHTING_SPRING * tilt;
}

/**
 * How far a card leans as it enters, in radians — ±0.4 rad (~23°), wider
 * than the old ±0.25 but still inside the righting band, so a card never
 * spawns already condemned to a flip.
 */
const SPAWN_TILT = 0.4;
/** A card's seeded sideways entry velocity, in px per step. */
const SPAWN_DRIFT = 1.5;

/**
 * The spawn pose of the card seeded by `name`: its column (a figure in
 * [0, 1) the engine maps onto the jar's inner width), entry tilt and a
 * sideways drift, so cards sail down varied paths into every corner rather
 * than dropping on vertical rails. Every dimension is seeded — the same
 * name always rains the same way: a replay, not a reroll.
 */
export function spawnOf(name: string): {
  unit: number;
  angle: number;
  drift: number;
} {
  return {
    unit: unitOf(`${name}:x`),
    angle: (unitOf(`${name}:a`) - 0.5) * SPAWN_TILT * 2,
    drift: (unitOf(`${name}:vx`) - 0.5) * SPAWN_DRIFT * 2,
  };
}

/**
 * Compaction taps: once the pour has first settled, the jar is tapped
 * sideways like a settled jar of loose things — a few alternating jolts
 * with the pile momentarily loosened let wedged cards slide into the gaps
 * along the floor, so the final pile fills the bottom instead of holding
 * mid-air voids. Three taps, right, left, right.
 */
export const TAP_COUNT = 3;
/** The shared shove every card gets in a tap, in px per step. */
const TAP_SPEED = 2.2;
/** Per-card seeded jitter around the shared shove, in px per step. */
const TAP_JITTER = 0.6;
/** Friction while a tap loosens the pile; the pile re-packs slickly. */
const TAP_FRICTION = 0.15;
/** Friction restored between taps, so each jolt settles before the next. */
const REST_FRICTION = 0.8;

/**
 * One card's horizontal velocity during compaction tap `tap` (zero-based):
 * the round's shared shove, alternating direction, plus a seeded per-card
 * jitter so the pile stirs instead of translating as a rigid slab.
 */
export function tapVelocityX(name: string, tap: number): number {
  const direction = tap % 2 === 0 ? 1 : -1;
  return (
    direction * TAP_SPEED + (unitOf(`${name}:tap${tap}`) - 0.5) * TAP_JITTER * 2
  );
}

/**
 * The hub's jar: the enabled skills as title cards poured into a fixed
 * field by real physics — `matter-js` drops every card from above with a
 * seeded spawn column, tilt and sideways drift, gravity settles the pile
 * against the jar's floor and walls, and the run stops animating once the
 * pile has slept. The same list always rains the same way: seeded spawns
 * and the fixed 60Hz step make the settle a replay, not a reroll.
 *
 * After the pour first sleeps, the jar gets three alternating taps the way
 * a settled jar of loose things does: the pile is briefly loosened and
 * shoved sideways so wedged cards slide into the gaps along the floor —
 * the final pile fills the bottom instead of holding mid-air voids.
 *
 * Every tile in a bucket is one fixed square, so each physics body is cut
 * to exactly its DOM tile. Tiles are icon-only — a squircle initial — and a
 * hover floats the skill's name above them in a portal tooltip.
 *
 * The bodies are simulated; the *tiles* are plain DOM (one absolutely
 * positioned span per body, transformed to its body's pose each frame), so
 * the faces stay crisp rather than pixels on a canvas. The pour is the
 * jar's only animation: once settled, nothing moves — a hover raises a
 * buried tile above its neighbours (a z-order swap, not a motion), and
 * nothing transitions.
 *
 * Readers who ask for reduced motion get no simulation: the same cards
 * render as a static bottom-aligned wrap, each pose seeded the way every
 * scattered card in the app sits (see `lib/scatter`).
 */
export function HubJar({
  skills,
  className,
}: {
  /** The cards to pour, in any order — each card's choreography is its own. */
  skills: InstalledSkill[];
  /** Classes for the jar field itself (size, rim, backdrop). */
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const fieldRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLSpanElement | null>>([]);
  // The effect reads the roster through a ref and keys on its signature, so
  // a parent re-render (a hovered agent, a badge) never restarts the rain —
  // only a changed roster or jar does.
  const skillsRef = useRef(skills);
  skillsRef.current = skills;
  const signature = skills.map((skill) => skill.name).join("\n");
  const scale = jarCardScale(skills.length);
  // Roster-aware faces so same-prefix siblings split across hues (a cheap
  // pass over at most JAR_CAPACITY names, recomputed each render).
  const faces = jarFaces(skills.map((s) => s.name));

  useLayoutEffect(() => {
    if (reduceMotion) return;
    const field = fieldRef.current;
    const jarred = skillsRef.current;
    if (!field || jarred.length === 0) return;
    const width = field.clientWidth;
    const height = field.clientHeight;
    if (width === 0 || height === 0) return;

    // Every tile in a bucket is one fixed square, so its physics body is
    // cut to exactly the DOM tile — no measure pass, no disagreement.
    const tile = scale.size;

    const engine = Matter.Engine.create({ enableSleeping: true });
    // The walls: a floor across the jar's mouth and two side walls tall
    // enough to catch every card from its spawn above the rim — the jar is
    // open-topped, so an over-full pile would rise past the rim rather than
    // clip through the field.
    const wall = 60;
    const wallTop = 600;
    const walls = [
      // The floor sits a few px above the rim, so the bottom row keeps a
      // sliver of breathing room instead of kissing the clip edge.
      Matter.Bodies.rectangle(
        width / 2,
        height + wall / 2 - 4,
        width + wall * 2,
        wall,
        { isStatic: true },
      ),
      Matter.Bodies.rectangle(
        -wall / 2 + 1,
        (height - wallTop) / 2,
        wall,
        height + wallTop,
        { isStatic: true },
      ),
      Matter.Bodies.rectangle(
        width + wall / 2 - 1,
        (height - wallTop) / 2,
        wall,
        height + wallTop,
        { isStatic: true },
      ),
    ];
    const bodies = jarred.map((skill, index) => {
      const { unit, angle, drift } = spawnOf(skill.name);
      const x = tile / 2 + unit * (width - tile);
      // Tiles spawn stacked above the rim, so they pour in one after
      // another rather than materialising in a single overlapping slab.
      const y = -(index + 1) * (tile + 6) - 10;
      const body = Matter.Bodies.rectangle(x, y, tile, tile, {
        angle,
        restitution: 0.05,
        friction: REST_FRICTION,
        frictionStatic: 0.9,
        frictionAir: 0.02,
        chamfer: { radius: 4 },
      });
      // The seeded sideways entry drift — varied paths, not vertical rails.
      Matter.Body.setVelocity(body, { x: drift, y: 0 });
      return body;
    });
    Matter.Composite.add(engine.world, [...walls, ...bodies]);

    let raf = 0;
    // A hard stop for the rare chip wedged too tight to right or tap: the
    // springs would otherwise keep it awake and the loop would never end.
    let steps = 0;
    const MAX_STEPS = 2400;
    let taps = 0;
    // Fixed steps a tap loosens the pile for before normal grip returns
    // (~0.33s): long enough to slide into floor gaps, short enough that the
    // pile re-settles before the next sleep can launch another tap.
    const TAP_LOOSE_STEPS = 20;
    let looseSteps = 0;
    const settle = () => {
      // One fixed 60Hz step: a replay, not a variable-rate roll.
      Matter.Engine.update(engine, 1000 / 60);
      if (looseSteps > 0) {
        looseSteps -= 1;
        if (looseSteps === 0) {
          bodies.forEach((body) => {
            body.friction = REST_FRICTION;
          });
        }
      }
      let asleep = true;
      bodies.forEach((body, index) => {
        // Right the standing and the inverted: wake a sleeping card the
        // pile parked past the tilt band, then hand it the spring-damper
        // velocity. Cards inside the band keep the lean they settled in.
        const righted = rightedAngularVelocity(
          body.angle,
          body.angularVelocity,
        );
        if (righted !== null) {
          if (body.isSleeping) Matter.Sleeping.set(body, false);
          Matter.Body.setAngularVelocity(body, righted);
        }
        const card = cardRefs.current[index];
        if (card) {
          card.style.transform = `translate(${body.position.x - tile / 2}px, ${
            body.position.y - tile / 2
          }px) rotate(${body.angle}rad)`;
        }
        if (!body.isSleeping) asleep = false;
      });
      // The first sleep is the poured pile; each further sleep is a tapped
      // pile. Until the taps are spent, jolt the whole pile sideways with
      // its friction briefly loosened — wedged cards slide into floor gaps
      // and the pile re-packs from the bottom up, one tap per new sleep.
      if (asleep && taps < TAP_COUNT) {
        const tap = taps;
        taps += 1;
        asleep = false;
        bodies.forEach((body, index) => {
          body.friction = TAP_FRICTION;
          Matter.Sleeping.set(body, false);
          Matter.Body.setVelocity(body, {
            x: tapVelocityX(jarred[index].name, tap),
            y: body.velocity.y,
          });
        });
        looseSteps = TAP_LOOSE_STEPS;
      }
      steps += 1;
      // A settled jar holds still — the loop ends once every card sleeps
      // after the final tap (or the step cap trips), and only a roster
      // change rebuilds the run.
      if (!asleep && steps < MAX_STEPS) {
        raf = requestAnimationFrame(settle);
      }
    };
    raf = requestAnimationFrame(settle);

    return () => {
      cancelAnimationFrame(raf);
      Matter.Composite.clear(engine.world, false);
      Matter.Engine.clear(engine);
    };
  }, [signature, reduceMotion, scale]);

  if (reduceMotion) {
    // No simulation: the same cards, bottom-aligned and seeded — the pile
    // without the pour.
    return (
      <div className={cn("relative overflow-hidden", className)}>
        <div className="flex h-full flex-wrap content-end justify-center gap-1 p-2">
          {skills.map((skill) => (
            <JarCard
              key={skill.name}
              skill={skill}
              scale={scale}
              face={faces.get(skill.name) ?? avatarFace(skill.name)}
              style={scatterStyle(scatterOf(skill.name))}
              className={cn(
                "relative z-0 hover:z-10",
                "[transform:rotate(var(--scatter-rotate))_translate(var(--scatter-x),var(--scatter-y))]",
              )}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={fieldRef} className={cn("relative overflow-hidden", className)}>
      {skills.map((skill, index) => (
        <JarCard
          key={skill.name}
          ref={(el) => {
            cardRefs.current[index] = el;
          }}
          skill={skill}
          scale={scale}
          face={faces.get(skill.name) ?? avatarFace(skill.name)}
          // The spawn pose is the card's first paint; the engine's first
          // frame (laid out before paint) takes the transform over.
          style={{
            transform: `translate(0px, ${
              -(index + 1) * (scale.size + 6) - 10
            }px) rotate(${spawnOf(skill.name).angle}rad)`,
          }}
          className="absolute top-0 left-0 z-0 will-change-transform hover:z-10"
        />
      ))}
    </div>
  );
}

/**
 * One jar card: just the skill's squircle face, icon-only — the name is not
 * printed under it, it floats above the tile in a portal tooltip on hover
 * (so it never clips on the jar's overflow). The tooltip trigger IS the
 * transformed tile the physics engine moves.
 */
const JarCard = forwardRef<
  HTMLSpanElement,
  {
    skill: InstalledSkill;
    scale: JarCardScale;
    /** The roster-resolved tinted face (hue wash plus glyph colour). */
    face: { bg: string; fg: string };
    className?: string;
    style?: CSSProperties;
  }
>(function JarCard({ skill, scale, face, className, style }, ref) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            ref={ref}
            data-skill={skill.name}
            aria-label={skillDisplayName(skill)}
            style={{ width: scale.size, height: scale.size, ...style }}
            className={cn("flex items-center justify-center", className)}
          />
        }
      >
        {/* The macOS-app-style squircle: a soft hue wash with the initial
            in the hue itself, edged by a hairline so the tint reads on the
            jar's own ground. The initial comes from the display spelling —
            what the skill is published as — while the hue and scatter stay
            seeded by the slug, so renames upstream cannot reshuffle the jar. */}
        <span
          aria-hidden="true"
          data-slot="jar-face"
          style={{
            width: scale.size,
            height: scale.size,
            backgroundColor: face.bg,
            color: face.fg,
            fontSize: scale.glyph,
          }}
          className="flex items-center justify-center rounded-[22.5%] font-semibold uppercase ring-black/10 ring-1 ring-inset dark:ring-white/10"
        >
          {skillDisplayName(skill).charAt(0)}
        </span>
      </TooltipTrigger>
      <TooltipContent>{skillDisplayName(skill)}</TooltipContent>
    </Tooltip>
  );
});
