import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";

import { removeInstalledSkills } from "../lib/local-skills";
import {
  markSkillsChanged,
  useInstalledSkills,
} from "../hooks/use-installed-skills";
import { errorMessage } from "../lib/utils";
import { Button } from "./ui/button";
import { RemoveConfirmDialog } from "./remove-confirm-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";
import { toast } from "./ui/toast";

/**
 * The one-shot uninstall action for every skill of one repository — the head's
 * counterpart to `RepoEnableSwitch`, one step up from where the per-skill
 * removal lives (`SkillRemoveButton`, inside the detail panel).
 *
 * Single removal earns its place in the app by costing the reader a deliberate
 * step — open the skill — while a whole repository at once has no such step to
 * hide behind: the control sits in the head beside the switch it accompanies,
 * one mispress from a routine toggle. So the ask is unconditional: the press
 * opens `RemoveConfirmDialog`, which names the count and every name, and only
 * a second, destructive press acts.
 *
 * Renders only while at least one of the repository's skills is on disk, so a
 * surface can hand it the same names it gives the group switch and let the
 * installed state pick. Removal is by name all the way down (`remove_skills`
 * takes names).
 */
export function RepoRemoveButton({
  names,
  label,
  onRemoved,
}: {
  /** Every skill the repository stands for on disk — the batch write covers
   *  all of them, including skills past the page's preview. */
  names: string[];
  /** The repository's `owner/repo`, for the control's name and the dialog. */
  label: string;
  /** Called after every skill is gone; the repository's page has nothing left
   *  to show then, so its caller goes back to the list it came from. */
  onRemoved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { data: installed } = useInstalledSkills();
  const wanted = new Set(names);
  const onDisk = (installed ?? []).filter((s) => wanted.has(s.name));
  if (onDisk.length === 0) return null;

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await removeInstalledSkills(names);
      // Same broadcast the single removal makes: the my-skills list, the
      // sidebar count and the menu bar popover all read this one signal.
      await markSkillsChanged(queryClient);
      toast.add({
        title: t("action.removedRepoCount", {
          label,
          count: names.length,
        }),
        type: "success",
      });
      setOpen(false);
      onRemoved?.();
    } catch (err) {
      toast.add({ title: errorMessage(err, t("action.removeFailed")), type: "error" });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      {/* The mark alone, in the square the head's other icon-only controls
          wear, and in the destructive ink only on approach — resting, it is
          the head's muted voice, so an uninstall control does not shout over
          the switch beside it. The word lives in the tooltip and the
          accessible name, as the head's marks do. */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("action.removeAllAria", { label })}
              onClick={() => setOpen(true)}
              className="shrink-0 text-muted-foreground hover:text-destructive focus-visible:text-destructive"
            />
          }
        >
          <Trash2 aria-hidden />
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("action.removeAll")}</TooltipContent>
      </Tooltip>

      <RemoveConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("action.removeRepoTitle")}
        description={t("action.removeRepoDescription", {
          label,
          count: names.length,
        })}
        names={names}
        pending={removing}
        onConfirm={() => void handleRemove()}
      />
    </>
  );
}
