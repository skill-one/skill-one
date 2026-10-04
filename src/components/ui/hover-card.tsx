import { PreviewCard } from "@base-ui/react/preview-card"
import { cn } from "cn"

function HoverCard({ ...props }: PreviewCard.Root.Props) {
  return <PreviewCard.Root data-slot="hover-card" {...props} />
}

function HoverCardTrigger({ ...props }: PreviewCard.Trigger.Props) {
  return <PreviewCard.Trigger data-slot="hover-card-trigger" {...props} />
}

function HoverCardContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  ...props
}: PreviewCard.Popup.Props &
  Pick<
    PreviewCard.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <PreviewCard.Portal>
      <PreviewCard.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <PreviewCard.Popup
          data-slot="hover-card-content"
          className={cn(
            "z-50 flex w-72 origin-(--transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        />
      </PreviewCard.Positioner>
    </PreviewCard.Portal>
  )
}

export {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
}
