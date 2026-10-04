import { Suspense, lazy, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import type {
  EmojiClickData,
  Theme as PickerTheme,
} from "emoji-picker-react";
// A pure type query: no runtime import, so the dataset cannot land in the
// main bundle through it. The zh module re-exports the package's own
// `EmojiData` as its default, which is what types the state below.
type ZhEmojis = (typeof import("emoji-picker-react/dist/data/emojis-zh"))["default"];

import { useAppLocale } from "../../i18n/use-language";
import { Skeleton } from "../ui/skeleton";

/**
 * The emoji dataset is the heaviest thing the tag menu can mount, so the
 * picker rides its own chunk: a reader who types the mark (or picks the
 * label's first character by leaving it blank) never downloads it. Loaded
 * on the panel's first open, cached ever after.
 *
 * Only type imports come from the package statically — the component and
 * the Chinese dataset both load dynamically — so neither lands in the main
 * bundle. `Theme` stays a cast string for the same reason: importing the
 * enum value would pull the module in with it.
 */
const LazyPicker = lazy(() => import("emoji-picker-react"));

/** Placeholder while the picker's chunk (and the zh dataset) arrives. */
function PickerSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex h-[320px] w-[296px] flex-col gap-2"
    >
      <Skeleton className="h-8 w-full" />
      <div className="grid grid-cols-8 gap-1.5">
        {Array.from({ length: 32 }).map((_, index) => (
          <Skeleton key={index} className="aspect-square w-full" />
        ))}
      </div>
    </div>
  );
}

/**
 * One mark picker for the tag menu's emoji box: full search over the whole
 * set, the app's own theme, and the Chinese dataset in zh mode. A pick
 * writes the box and closes the panel — the menu's 新建 still files the
 * skill, so choosing and creating stay one gesture apart, never two writes.
 */
export function EmojiPickerPanel({
  onPick,
}: {
  /** Called with the picked native emoji; the caller owns the draft. */
  onPick: (emoji: string) => void;
}) {
  const { t } = useTranslation();
  const locale = useAppLocale();
  const { resolvedTheme } = useTheme();
  const [zhData, setZhData] = useState<ZhEmojis | undefined>(undefined);

  // The Chinese dataset rides its own chunk beside the picker: an en-first
  // paint never pays for it, and a zh open waits for both before painting
  // rather than flashing the English search first.
  useEffect(() => {
    if (locale !== "zh") return;
    let live = true;
    void import("emoji-picker-react/dist/data/emojis-zh").then((m) => {
      if (live) setZhData(m.default);
    });
    return () => {
      live = false;
    };
  }, [locale]);

  const ready = locale !== "zh" || zhData !== undefined;
  return (
    <Suspense fallback={<PickerSkeleton />}>
      {ready ? (
        <LazyPicker
          theme={
            (resolvedTheme === "dark" ? "dark" : "light") as PickerTheme
          }
          lazyLoadEmojis
          autoFocusSearch
          searchPlaceholder={t("tag.emojiSearch")}
          previewConfig={{ showPreview: false }}
          skinTonesDisabled
          width={296}
          height={320}
          {...(zhData ? { emojiData: zhData } : {})}
          onEmojiClick={(data: EmojiClickData) => onPick(data.emoji)}
        />
      ) : (
        <PickerSkeleton />
      )}
    </Suspense>
  );
}
