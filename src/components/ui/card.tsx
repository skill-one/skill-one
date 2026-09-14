import * as React from "react"
import { cn } from "cn"

/**
 * shadcn/ui's Card, at this app's density.
 *
 * The registry ships `gap-6`, `py-6` and `px-6`. The card here is a browsing
 * surface — a grid where several skills have to fit on one screen — and at a
 * 300–430px cell that spacing left 96px of a 208px card as pure emptiness. The
 * spacing is tightened once, in the component, so the app keeps using the slots
 * unchanged (`CardHeader`, `CardTitle`, `CardDescription`, `CardAction`,
 * `CardContent`, `CardFooter`) and no call site carries layout overrides.
 *
 * The registry's `[.border-b]:pb-6` / `[.border-t]:pt-6` conveniences went with
 * the rest of that looser rhythm: they restate the same 6-unit spacing for a
 * bordered slot, nothing here used them, and one of them did apply — the
 * self-referential `[.border-t]:pt-6` beats a plain `pt-2.5` on the same
 * element, which silently turned the card's hairline rail into a 24px band. A
 * slot that draws a divider now states its own padding.
 */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card py-4 text-card-foreground shadow-sm",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-4 has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-4", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-4", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
