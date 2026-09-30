import { useLayoutEffect, useRef } from "react";
import Matter from "matter-js";
import { useReducedMotion } from "motion/react";

import type { InstalledSkill } from "../../lib/skills-manager";
import { cn } from "../../lib/utils";
import { scatterOf, scatterStyle, unitOf } from "../../lib/scatter";

/**
 * The jar's mini card, measured — every physics body and every static pose is
 * cut to this box, so the DOM cards and the bodies simulating them can never
 * disagree.
 */
export const JAR_CARD_WIDTH = 44;
export const JAR_CARD_HEIGHT = 20;

/** The most cards the jar simulates — its own capacity guarantee. */
export const JAR_CAPACITY = 50;

const CARD_CLASS =
  "flex flex-col items-center rounded-md border border-border bg-card px-1 py-1 shadow-xs";

/**
 * The spawn column of the card seeded by `name`: a figure in [0, 1) the
 * engine maps onto the jar's inner width. The same name always spawns in the
 * same column, at the same tilt — the rain is a replay, not a reroll.
 */
function spawnOf(name: string): { unit: number; angle: number } {
  return {
    unit: unitOf(`${name}:x`),
    angle: (unitOf(`${name}:a`) - 0.5) * 0.5,
  };
}

/**
 * The hub's jar: the enabled skills as tiny title cards poured into a fixed
 * field by real physics — `matter-js` drops every card from above with a
 * seeded spawn column and angle, gravity settles the pile against the jar's
 * floor and walls, and the run stops animating once every card has fallen
 * asleep. The same list always rains the same way: seeded spawns and the
 * fixed 60Hz step make the settle a replay, not a reroll.
 *
 * The bodies are simulated; the *cards* are plain DOM (one absolutely
 * positioned span per body, transformed to its body's pose each frame), so
 * the names stay crisp, hoverable text rather than pixels on a canvas. The
 * pour is the jar's only animation: once settled, nothing moves — a hover
 * raises a buried card above its neighbours (a z-order swap, not a motion),
 * and nothing transitions.
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

  useLayoutEffect(() => {
    if (reduceMotion) return;
    const field = fieldRef.current;
    const jarred = skillsRef.current;
    if (!field || jarred.length === 0) return;
    const width = field.clientWidth;
    const height = field.clientHeight;
    if (width === 0 || height === 0) return;

    const engine = Matter.Engine.create({ enableSleeping: true });
    // The walls: a floor across the jar's mouth and two side walls tall
    // enough to catch every card from its spawn above the rim — the jar is
    // open-topped, so an over-full pile would rise past the rim rather than
    // clip through the field.
    const wall = 60;
    const wallTop = 600;
    const walls = [
      Matter.Bodies.rectangle(
        width / 2,
        height + wall / 2 - 1,
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
      const { unit, angle } = spawnOf(skill.name);
      const x = JAR_CARD_WIDTH + unit * (width - JAR_CARD_WIDTH * 2);
      // Cards spawn stacked above the rim, so they pour in one after
      // another rather than materialising in a single overlapping slab.
      const y = -(index + 1) * (JAR_CARD_HEIGHT + 6) - 10;
      return Matter.Bodies.rectangle(x, y, JAR_CARD_WIDTH, JAR_CARD_HEIGHT, {
        angle,
        restitution: 0.05,
        friction: 0.8,
        frictionStatic: 0.9,
        frictionAir: 0.02,
        chamfer: { radius: 4 },
      });
    });
    Matter.Composite.add(engine.world, [...walls, ...bodies]);

    let raf = 0;
    const settle = () => {
      // One fixed 60Hz step: a replay, not a variable-rate roll.
      Matter.Engine.update(engine, 1000 / 60);
      let asleep = true;
      bodies.forEach((body, index) => {
        const card = cardRefs.current[index];
        if (!card) return;
        card.style.transform = `translate(${
          body.position.x - JAR_CARD_WIDTH / 2
        }px, ${body.position.y - JAR_CARD_HEIGHT / 2}px) rotate(${body.angle}rad)`;
        if (!body.isSleeping) asleep = false;
      });
      // A settled jar holds still — the loop ends once every card sleeps,
      // and only a roster change rebuilds the run.
      if (!asleep) raf = requestAnimationFrame(settle);
    };
    raf = requestAnimationFrame(settle);

    return () => {
      cancelAnimationFrame(raf);
      Matter.Composite.clear(engine.world, false);
      Matter.Engine.clear(engine);
    };
  }, [signature, reduceMotion]);

  if (reduceMotion) {
    // No simulation: the same cards, bottom-aligned and seeded — the pile
    // without the pour.
    return (
      <div className={cn("relative overflow-hidden", className)}>
        <div className="flex h-full flex-wrap content-end justify-center gap-0.5 p-2">
          {skills.map((skill) => (
            <span
              key={skill.name}
              data-skill={skill.name}
              style={scatterStyle(scatterOf(skill.name))}
              className={cn(
                "relative z-0 w-11 shrink-0 hover:z-10",
                "[transform:rotate(var(--scatter-rotate))_translate(var(--scatter-x),var(--scatter-y))]",
                CARD_CLASS,
              )}
            >
              <JarCardName name={skill.name} />
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={fieldRef} className={cn("relative overflow-hidden", className)}>
      {skills.map((skill, index) => (
        <span
          key={skill.name}
          ref={(el) => {
            cardRefs.current[index] = el;
          }}
          data-skill={skill.name}
          style={{
            width: JAR_CARD_WIDTH,
            height: JAR_CARD_HEIGHT,
            // The spawn pose is the card's first paint; the engine's first
            // frame (laid out before paint) takes the transform over.
            transform: `translate(0px, ${
              -(index + 1) * (JAR_CARD_HEIGHT + 6) - 10
            }px) rotate(${spawnOf(skill.name).angle}rad)`,
          }}
          className={cn(
            "absolute top-0 left-0 z-0 will-change-transform hover:z-10",
            CARD_CLASS,
          )}
        >
          <JarCardName name={skill.name} />
        </span>
      ))}
    </div>
  );
}

/** The one line a jar card carries: its name, truncated to the card's box. */
function JarCardName({ name }: { name: string }) {
  return (
    <span
      title={name}
      className="w-full truncate text-center text-[10px] leading-tight font-medium text-foreground"
    >
      {name}
    </span>
  );
}
