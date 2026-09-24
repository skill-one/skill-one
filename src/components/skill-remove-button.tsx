import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "./ui/toast";

import { removeInstalledSkill } from "../lib/local-skills";
import {
  markSkillsChanged,
  useInstalledSkills,
} from "../hooks/use-installed-skills";
import { errorMessage } from "../lib/utils";
import type { Skill } from "../types/skill";
import { Button } from "./ui/button";

/**
 * The uninstall action — the counterpart of `SkillInstallButton`, and the only
 * uninstall entry point in the app.
 *
 * It used to sit on every card of the installed list: 8px from the enable
 * switch, with no confirmation, on a surface where the whole card is a click
 * target too. Removing a skill is not recoverable from the app (only by
 * reinstalling it), so it lives here instead: one deliberate step — the user
 * opens the skill — and one home, shared by every surface the drawer opens
 * from. The cards stay a reading surface.
 *
 * Renders only while the skill is on disk, so a surface can hand it the same
 * skill it gives the install button and let the installed state pick. That
 * match is by name, because removal is by name all the way down
 * (`remove_skills` takes names).
 */
export function SkillRemoveButton({
  skill,
  className,
  onRemoved,
}: {
  skill: Skill;
  /** Merged onto the button; callers place it. */
  className?: string;
  /** Called after the skill is gone; a list-backed caller closes its panel. */
  onRemoved?: () => void;
}) {
  const [removing, setRemoving] = useState(false);

  const queryClient = useQueryClient();
  const { data: installed } = useInstalledSkills();
  const { t } = useTranslation();
  const onDisk = installed?.some((s) => s.name === skill.name) ?? false;

  if (!onDisk) return null;

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await removeInstalledSkill(skill.name);
      // Same broadcast the install button makes: the my-skills list, the
      // sidebar count and the menu bar popover all read this one signal.
      await markSkillsChanged(queryClient);
      toast.add({ title: t("action.removed", { name: skill.name }), type: "success" });
      onRemoved?.();
    } catch (err) {
      toast.add({ title: errorMessage(err, t("action.removeFailed")), type: "error" });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={removing}
      title={t("action.remove")}
      onClick={(e) => {
        void handleRemove();
        e.stopPropagation();
      }}
      className={className}
    >
      {removing ? (
        <Loader2 className="animate-spin" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" />
      )}
      {t("action.remove")}
    </Button>
  );
}
