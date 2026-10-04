import {
  forwardRef,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Matter from "matter-js";

import type { InstalledSkill } from "../../lib/skills-manager";
import { cn } from "../../lib/utils";
import { unitOf } from "../../lib/scatter";
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

/** The most cards the jar pours — its own capacity guarantee. */
export const JAR_CAPACITY = 50;

/**
 * One card-size bucket. The labeled bucket is a capsule wide enough to carry the
 * skill's name beside its emoji, and the jar pours it for as long as the whole
 * roster fits the floor — names are the point of a card, so they are the last
 * thing to go. A roster the floor cannot hold drops to icon-only tiles: the jar
 * reads as a box of app icons, and a face's name floats above it in a tooltip on
 * hover. The jar's own frame never changes size, so the graph around it never
 * re-flows as the roster grows.
 */
export interface JarCardScale {
  /** The tile's edge — card and physics body share these exact numbers. */
  width: number;
  height: number;
  /** The emoji/initial glyph's size inside the face, in px. */
  glyph: number;
  /** Whether the tile prints the skill's name (the labeled lg capsule). */
  labeled: boolean;
}

const CARD_SCALES: Record<"lg" | "md" | "sm", JarCardScale> = {
  lg: { width: 66, height: 26, glyph: 13, labeled: true },
  md: { width: 28, height: 28, glyph: 14, labeled: false },
  sm: { width: 22, height: 22, glyph: 11, labeled: false },
};

/**
 * The air one capsule needs beside itself to lie in a pile without touching —
 * the same 6px the spawn stack leaves between cards, so the estimate counts the
 * floor the pour actually lands on rather than a tidier grid that never forms.
 */
const SLOT_GAP = 6;

/**
 * How many labeled capsules a field of `width` × `height` holds: as many 66×26
 * cards as fit across it and down it, each in its own slot. This is what decides
 * whether a roster keeps its names — a wide window fits a full jar of them, a
 * narrow one drops to icons far earlier, and neither is a count somebody picked.
 */
export function labeledCapacity(width: number, height: number): number {
  const slotW = CARD_SCALES.lg.width + SLOT_GAP;
  const slotH = CARD_SCALES.lg.height + SLOT_GAP;
  const across = Math.floor(width / slotW);
  const down = Math.floor(height / slotH);
  return across > 0 && down > 0 ? across * down : 0;
}

/**
 * The field the hub's jar has at the app's default window — the capacity every
 * caller and every test means when it does not measure a field of its own. It
 * is also what the first frame renders with, before the field has been measured
 * (and what an environment with no layout at all resolves to), so the very first
 * pour already knows whether the names fit.
 */
export const JAR_FIELD_FALLBACK = { width: 360, height: 190 } as const;

/** `labeledCapacity` of the fallback field: the names a default window holds. */
export const JAR_NOMINAL_CAPACITY = labeledCapacity(
  JAR_FIELD_FALLBACK.width,
  JAR_FIELD_FALLBACK.height,
);

/**
 * The card-size bucket for a roster of `count` in a field holding `capacity`
 * labeled capsules: the whole roster keeps its names while it fits, and past that
 * the jar steps down to icon tiles — `md` while the pile still reads as a
 * handful, `sm` once it is a box of them. `capacity` defaults to the fallback
 * field's, which is the answer for any caller that has no field to measure.
 */
export function jarCardScale(
  count: number,
  capacity: number = JAR_NOMINAL_CAPACITY,
): JarCardScale {
  if (count <= capacity) return CARD_SCALES.lg;
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

/** Where one card ends up: its settled centre, and the lean it settled at. */
export interface JarPose {
  x: number;
  y: number;
  angle: number;
}

/** A field too small to measure, or not measured yet: nothing settles in it. */
const NO_FIELD = { width: 0, height: 0 };

/**
 * The step ceiling for one solve — the same hard stop the animated pour had, for
 * the rare card wedged too tight to right or tap. The pile is left wherever it
 * got to, which is a jar of cards rather than an empty one.
 */
const MAX_STEPS = 2400;
/** Fixed steps a tap loosens the pile for before normal grip returns (~0.33s). */
const TAP_LOOSE_STEPS = 20;

/**
 * The pile, solved. The same engine, the same seeded spawns, the same three
 * compaction taps and the same fixed 60Hz step the animated pour ran — run to
 * their end in one synchronous pass, and only the resting pose kept.
 *
 * The pour existed to arrive somewhere: cards in a loose seeded heap at the
 * bottom of the jar, wedged and tipped the way loose things wedge. That
 * arrangement is a property of the roster and the field alone, so it is
 * computed rather than performed — nothing is ever drawn between the spawn and
 * the rest, and a card has no intermediate position to be seen in.
 *
 * Deterministic like the pour it replaces: the same names in the same field
 * answer the same pile, every run.
 */
export function settledPoses(
  names: readonly string[],
  field: { width: number; height: number },
  scale: JarCardScale,
): JarPose[] {
  const { width, height } = field;
  if (names.length === 0 || width === 0 || height === 0) {
    return names.map(() => ({ x: 0, y: 0, angle: 0 }));
  }
  const tileW = scale.width;
  const tileH = scale.height;

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
  const bodies = names.map((name, index) => {
    const { unit, angle, drift } = spawnOf(name);
    const x = tileW / 2 + unit * (width - tileW);
    // Tiles spawn stacked above the rim, so they pour in one after
    // another rather than materialising in a single overlapping slab.
    const y = -(index + 1) * (tileH + 6) - 10;
    const body = Matter.Bodies.rectangle(x, y, tileW, tileH, {
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

  let steps = 0;
  let taps = 0;
  let looseSteps = 0;
  // The loop the pour ran each frame, run here to its end instead. The only
  // difference is that no pose is written anywhere per step: the pile is read
  // once, at the bottom, which is the whole cost of an animation removed.
  for (;;) {
    Matter.Engine.update(engine, 1000 / 60);
    if (looseSteps > 0) {
      looseSteps -= 1;
      if (looseSteps === 0) {
        for (const body of bodies) body.friction = REST_FRICTION;
      }
    }
    let asleep = true;
    bodies.forEach((body) => {
      // Right the standing and the inverted: wake a sleeping card the
      // pile parked past the tilt band, then hand it the spring-damper
      // velocity. Cards inside the band keep the lean they settled in.
      const righted = rightedAngularVelocity(body.angle, body.angularVelocity);
      if (righted !== null) {
        if (body.isSleeping) Matter.Sleeping.set(body, false);
        Matter.Body.setAngularVelocity(body, righted);
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
          x: tapVelocityX(names[index], tap),
          y: body.velocity.y,
        });
      });
      looseSteps = TAP_LOOSE_STEPS;
    }
    steps += 1;
    if (!asleep && steps < MAX_STEPS) continue;
    break;
  }

  const poses = bodies.map((body) => ({
    x: body.position.x - tileW / 2,
    y: body.position.y - tileH / 2,
    angle: body.angle,
  }));
  Matter.Composite.clear(engine.world, false);
  Matter.Engine.clear(engine);
  return poses;
}

/**
 * The hub's jar: the enabled skills as title cards resting in one fixed field.
 * The pile is solved, not poured — `settledPoses` runs the pour's own engine to
 * its end and hands back only where each card came to rest, so the jar looks
 * exactly as it did once the animation had finished while nothing ever moves.
 *
 * Every tile in a bucket is one fixed rectangle, so a tile is cut to exactly the
 * body that placed it. A tile wears the skill's classification emoji (an initial
 * when nothing classified it), and the labeled bucket prints the name in the tile
 * itself for as long as the whole roster fits the floor; a hover floats the name
 * above every other tile in a portal tooltip.
 *
 * The poses are written straight to the tiles in the layout pass, before the
 * first paint — a card is never drawn in flight, so there is no frame in which
 * the jar is anything but settled. Readers who resize or change the roster get
 * the same treatment: one more solve, still no in-between.
 */
export function HubJar({
  skills,
  emojis,
  className,
}: {
  /** The cards to lay out, in any order — each card's pile is its own. */
  skills: InstalledSkill[];
  /**
   * Each skill's classification emoji, keyed by name. Absent or missing
   * entries fall back to the display name's initial.
   */
  emojis?: ReadonlyMap<string, string>;
  /** Classes for the jar field itself (size, rim, backdrop). */
  className?: string;
}) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLSpanElement | null>>([]);
  // The measured field, or the fallback until it is measured. The roster's
  // names hang on this: a card keeps its name for as long as the whole roster
  // fits the floor, which is a property of the jar's width, so the bucket is
  // decided by measurement rather than by a count somebody picked. A
  // ResizeObserver keeps it honest as the window resizes, and because the
  // measurement only enters the pour through the integer capacity, ordinary
  // resizing does not restart the run — only crossing a capacity step does.
  const [fieldSize, setFieldSize] = useState<{ width: number; height: number }>(
    JAR_FIELD_FALLBACK,
  );
  useLayoutEffect(() => {
    const element = fieldRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setFieldSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // The effect reads the roster through a ref and keys on its signature, so a
  // parent re-render (a hovered agent, a badge) never re-solves the pile — only
  // a changed roster or jar does. Syncing the ref in an effect rather than
  // during render keeps the ref out of the render phase; declared first, it has
  // already written by the time the solve below reads it.
  const skillsRef = useRef(skills);
  useLayoutEffect(() => {
    skillsRef.current = skills;
  }, [skills]);
  const signature = skills.map((skill) => skill.name).join("\n");
  // How many names the floor holds, then the bucket that follows from it. Both
  // are memos on their own terms: an integer capacity and a stable object per
  // bucket, so the pour below is keyed to the shape of the answer rather than to
  // every pixel a resize delivers.
  const capacity = useMemo(
    () => labeledCapacity(fieldSize.width, fieldSize.height),
    [fieldSize.width, fieldSize.height],
  );
  const scale = useMemo(
    () => jarCardScale(skills.length, capacity),
    [skills.length, capacity],
  );
  // Roster-aware faces so same-prefix siblings split across hues (a cheap
  // pass over at most JAR_CAPACITY names, recomputed each render).
  const faces = jarFaces(skills.map((s) => s.name));

  useLayoutEffect(() => {
    const field = fieldRef.current;
    const jarred = skillsRef.current;
    if (!field) return;
    // The measured field, or none: a jar in an environment with no layout has
    // nothing to settle into, and the cards stay parked above the rim.
    const measured =
      field.clientWidth === 0 && field.clientHeight === 0
        ? NO_FIELD
        : { width: field.clientWidth, height: field.clientHeight };
    const poses = settledPoses(
      jarred.map((skill) => skill.name),
      measured,
      scale,
    );
    poses.forEach((pose, index) => {
      const card = cardRefs.current[index];
      if (card) {
        card.style.transform = `translate(${pose.x}px, ${pose.y}px) rotate(${pose.angle}rad)`;
      }
    });
  }, [signature, scale]);

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
          emoji={emojis?.get(skill.name)}
          face={faces.get(skill.name) ?? avatarFace(skill.name)}
          // The spawn pose is the card's first paint; the solve above (laid out
          // before paint) takes the transform over. It sits above the rim, so
          // the one frame it is on screen is clipped away.
          style={{
            transform: `translate(0px, ${
              -(index + 1) * (scale.height + 6) - 10
            }px) rotate(${spawnOf(skill.name).angle}rad)`,
          }}
          className="absolute top-0 left-0 z-0 hover:z-10"
        />
      ))}
    </div>
  );
}

/**
 * One jar card: the skill's squircle face wearing its classification emoji —
 * a colored mark that scans faster than any initial — or, with no
 * classification, the display spelling's leading letter in the face's own
 * hue. The labeled bucket pours capsules instead: the name printed beside the
 * emoji in one truncated line, which is the shape every card wears for as long
 * as the roster fits the floor. Everywhere else the name floats above the tile
 * in a portal tooltip on hover (so it never clips on the jar's overflow). The
 * tooltip trigger IS the transformed tile the solve placed.
 */
const JarCard = forwardRef<
  HTMLSpanElement,
  {
    skill: InstalledSkill;
    scale: JarCardScale;
    /** The classification emoji, when the skill has one. */
    emoji?: string;
    /** The roster-resolved tinted face (hue wash plus glyph colour). */
    face: { bg: string; fg: string };
    className?: string;
    style?: CSSProperties;
  }
>(function JarCard({ skill, scale, emoji, face, className, style }, ref) {
  const name = skillDisplayName(skill);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            ref={ref}
            data-skill={skill.name}
            aria-label={name}
            style={{ width: scale.width, height: scale.height, ...style }}
            className={cn("flex items-center justify-center", className)}
          />
        }
      >
        {/* The macOS-app-style squircle: a soft hue wash edged by a hairline
            so the tint reads on the jar's own ground. The emoji needs no
            glyph colour (color emoji paint themselves); the initial comes
            from the display spelling — what the skill is published as —
            while the hue and scatter stay seeded by the slug, so renames
            upstream cannot reshuffle the jar. */}
        <span
          aria-hidden="true"
          data-slot="jar-face"
          style={{
            width: scale.width,
            height: scale.height,
            backgroundColor: face.bg,
            color: face.fg,
            fontSize: scale.glyph,
          }}
          className={cn(
            "flex items-center gap-1 overflow-hidden px-2 ring-black/10 ring-1 ring-inset dark:ring-white/10",
            scale.labeled ? "rounded-full" : "justify-center rounded-[22.5%]",
            !scale.labeled && "font-semibold uppercase",
          )}
        >
          <span className="leading-none">{emoji ?? name.charAt(0)}</span>
          {scale.labeled && (
            <span className="min-w-0 truncate text-[9px] leading-tight font-medium">
              {name}
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>{name}</TooltipContent>
    </Tooltip>
  );
});
