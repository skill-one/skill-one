import { cva } from "class-variance-authority";

/**
 * One segmented look, shared by the app's two segmented controls: the header's
 * destinations (`AppNav`) and a list's shape switch (`ListUnitToggle`). Both are a
 * short row of peer choices with one of them chosen, so wherever the reader meets
 * the second of them they already know how to read the first.
 *
 * The recipe is shadcn's own `Tabs` default variant
 * (`registry/base-nova/ui/tabs.tsx`): a muted track with the chosen half raised
 * out of it in the surface colour, under one quiet shadow. It is a *recipe* and
 * not the `Tabs` component because neither of these controls is a tab set. The
 * header's halves are places, so they are links marked `aria-current="page"`; a
 * list's shape is a pressed state, so it is a `ToggleGroup`. A tablist would
 * claim panels that do not exist, and it would hand the arrow keys a job that
 * links do not have. So only the appearance is shared — the behaviour and the
 * accessibility of each control are its own primitive's, and a change here moves
 * the two together without either one's semantics moving with it.
 *
 * Two deliberate departures from the tabs recipe, both to hold these controls at
 * the height of the things they stand beside: `p-0.5` rather than the tabs'
 * `p-[3px]`, and `gap-0.5` rather than no gap at all. A 28px half in a
 * 3px-padded track is a 34px control, which would make a list's shape switch the
 * tallest thing on a row whose field is `h-8`; at 2px of padding the whole track
 * is 32px, the field's own height, which is also exactly the height the header's
 * nav has always been. The 2px gap is what keeps two 28px halves from fusing
 * into one button at that size — the same air a native segmented control leaves
 * between its segments.
 *
 * Height, padding and text size stay with the caller, because the window's chrome
 * and a list's content row are not the same density. The radius does not: a half
 * that is 8px round inside a 10px track is the whole look.
 */
export const segmentedTrackVariants = cva(
  "flex w-fit items-center gap-0.5 rounded-lg bg-muted p-0.5",
);

/**
 * One half of a segmented control: the chosen one raised out of the track, the
 * others resting on it. Reads the raised look off whichever state its caller has
 * — see the `active` variants below — so a control whose choice is made by the
 * route and a control whose choice is made by a press end up identical on screen.
 *
 * The idle halves keep no fill of their own and no hover fill either: a hover
 * that tinted them would give a reader who is only pointing at a half a second
 * shade to mistake for the one that is chosen.
 */
export const segmentedItemVariants = cva(
  // The library's own focus ring, kept as it is: two controls that look alike
  // must also focus alike. `hover:bg-transparent` is here to beat the toggle's
  // own `hover:bg-muted` rather than to draw anything.
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium text-foreground/60 transition-all outline-none hover:bg-transparent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
  {
    variants: {
      /**
       * Which half is on screen. `chosen` is for a caller that knows while it
       * renders — a link reads the route — so the class goes on the element
       * itself. `toggle` is for a caller whose state never passes through this
       * component at all: Base UI states a pressed toggle with `aria-pressed`
       * and nothing else (it writes no `data-state`), so the recipe has to carry
       * the selector rather than a boolean, and the raised look lands on whichever
       * half the library pressed. `off` is the resting half, which the base above
       * already describes.
       *
       * `aria-pressed:` here also has to *beat* the library's own
       * `aria-pressed:bg-muted` in `toggleVariants`, which is why this variant
       * repeats the fill: tailwind-merge drops the earlier one, and what is left
       * is a raised half rather than a shaded one.
       */
      active: {
        chosen: "bg-background text-foreground shadow-sm",
        toggle: "aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm",
        off: "",
      },
    },
    defaultVariants: { active: "off" },
  },
);
