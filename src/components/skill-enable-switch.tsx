import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { setSkillEnabled } from "../lib/local-skills";
import {
  markSkillsChanged,
  useInstalledSkills,
} from "../hooks/use-installed-skills";
import { errorMessage } from "../lib/utils";
import type { Skill } from "../types/skill";
import { Switch } from "./ui/switch";

/**
 * The enable/disable action of an installed skill — the counterpart of
 * `SkillInstallButton`, and the third and last write a skill has (install,
 * enable, remove).
 *
 * Enablement is real backend state — the library moves the skill between the
 * canonical and the parked directory — so the switch reflects the installed
 * record and writes straight through the backend, exactly like the install
 * button. It is self-contained for the same reason: the card and the detail
 * drawer both show it, and neither should have to own the mutation, an
 * optimistic copy of it, or a callback to thread back to the other.
 *
 * Renders only while the skill is on disk, so any surface can hand it the same
 * `Skill` it gives the install button and let the record decide. A click stays
 * on the switch: the card body opens the detail panel behind it.
 */
export function SkillEnableSwitch({
  skill,
  className,
}: {
  /** Only the name is read: enablement is resolved from the installed record. */
  skill: Pick<Skill, "name">;
  /** Merged onto the switch; callers place it. */
  className?: string;
}) {
  const queryClient = useQueryClient();
  const { data: installed } = useInstalledSkills();
  // The record is the truth; a pending write is held over the top of it only
  // until the refetch that follows the write lands.
  const [pending, setPending] = useState<boolean | null>(null);

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => setSkillEnabled(skill.name, enabled),
    onMutate: (enabled: boolean) => setPending(enabled),
    onSuccess: async () => {
      await markSkillsChanged(queryClient);
      setPending(null);
    },
    onError: (e) => {
      setPending(null);
      toast.error(errorMessage(e, "切换失败"));
      // Best-effort refresh: the error is already shown, so keep the promise
      // from turning into an unhandled rejection.
      void markSkillsChanged(queryClient);
    },
  });

  const record = installed?.find((s) => s.name === skill.name);
  if (!record) return null;

  const enabled = pending ?? record.enabled;

  return (
    <Switch
      checked={enabled}
      onCheckedChange={(next) => toggle.mutate(next)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`${enabled ? "关闭" : "开启"} ${skill.name}`}
      className={className}
    />
  );
}
