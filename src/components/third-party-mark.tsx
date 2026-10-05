import { useTranslation } from "react-i18next";
import { FolderCode } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";
import { cn } from "../lib/utils";

/**
 * The owner's geometry with a different glyph inside it — `OwnerAvatar`'s round
 * box, hairline border and muted fill. Exported so the mark and the control
 * that reuses it (see `LinkSuggestionMark`) cannot drift into two shapes: a
 * source-less skill must look like itself whether or not it can be linked.
 *
 * The ink carries the mark's two tones. Amber means the fact is still open: a
 * registry namesake exists, so the mark can become a control that links a
 * source (`LinkSuggestionMark`) and the color asks for that one press. Muted —
 * the owner-face fill the app files neutral facts under — means the fact is
 * closed: nothing to link, so nothing to draw the eye toward. Amber must stay
 * reserved for the open case; a muted glyph risks reading as a failed avatar
 * at a row's 20px, which is why the closed tone keeps the border and the
 * glyph's presence rather than collapsing into a bare placeholder.
 */
export const THIRD_PARTY_MARK_CLASS =
  "flex shrink-0 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-500/80";

/** The same box in the closed tone: a source-less skill with no candidate to link. */
export const THIRD_PARTY_MARK_MUTED_CLASS =
  "flex shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted text-muted-foreground";

/**
 * A folder-code glyph, sized to the box it sits in rather than to a pixel constant —
 * the same glyph at a row's 20px, a square's 16px and a card bar's
 * 24px, so one mark scales across every surface that wears it. At 58% of a 16px
 * square it was a three-pixel smudge; 72% leaves a hairline of breathing room
 * on the tightest box while still reading as a glyph rather than a picture.
 *
 * It represents a local or third-party skill on disk. Unlike a broken chain,
 * it conveys a neutral, positive representation of local code without implying
 * error or network failure.
 */
export function ThirdPartyMarkGlyph() {
  return <FolderCode className="size-[72%]" aria-hidden />;
}

/**
 * What stands in for the owner face on a skill no source vouches for — an
 * install that came from outside this app and that the ledger never recorded a
 * repository for, which is what the installed list files as 第三方安装.
 *
 * It wears `OwnerAvatar`'s own shape, so it drops into the face's column
 * without moving the layout around it: a card's footer, a row's facts cluster
 * and a repository card's bar all size that column off this box. Every other
 * surface answers 「谁发布的」 with a person; this one answers it with the
 * absence of one, which is the whole fact such a skill has to state.
 *
 * Decoration: `OwnerAvatar` can be `aria-hidden` because every call site prints
 * the owner beside it. Nothing prints this mark's name — it *is* the statement,
 * glyph for glyph — so it is labelled instead of hidden, and the tooltip spells
 * the sentence out for a pointer. The glyph itself stays `aria-hidden` so it
 * cannot leak into the name.
 *
 * This is the mark as a statement. When namesake candidates exist to link, the
 * same box becomes a control instead — `LinkSuggestionMark`.
 *
 * Tone: `muted` renders the closed statement — no candidate to link, so the
 * box wears the owner-face's own neutral fill and the eye is not asked to
 * press anything. The default stays amber for the surfaces that report the
 * fact without knowing whether a link is still open.
 */
export function ThirdPartyMark({
  className,
  muted = false,
}: {
  className?: string;
  /** The closed tone: nothing to link, so the mark files under neutral. */
  muted?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="img"
            aria-label={t("common.thirdPartyInstall")}
            className={cn(
              muted ? THIRD_PARTY_MARK_MUTED_CLASS : THIRD_PARTY_MARK_CLASS,
              className,
            )}
          >
            <ThirdPartyMarkGlyph />
          </span>
        }
      />
      <TooltipContent>{t("common.thirdPartyInstallTip")}</TooltipContent>
    </Tooltip>
  );
}
