import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { setManySkillsEnabled } from "../lib/local-skills";
import {
  markSkillsChanged,
  useInstalledSkills,
} from "../hooks/use-installed-skills";
import { errorMessage } from "../lib/utils";
import { Switch } from "./ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";
import { toast } from "./ui/toast";

/**
 * The one-shot enable/disable action for every skill of one repository card —
 * the only enablement control the installed list's cards carry: per-skill
 * switches live one step deeper, on the repository's own page.
 *
 * The switch states what it sees across the card's skills:
 *
 * - every one enabled — checked; one press disables them all;
 * - every one disabled — unchecked; one press enables them all;
 * - some enabled — unchecked on a half-filled track (the tooltip says
 *   部分开启), and one press means "enable all"; disabling all is then one
 *   more press away. Enable-all-first is deliberate: the mixed state already
 *   shows how to switch an individual skill off, while a single press that
 *   turns everything off would be the destructive reading.
 *
 * Like `SkillEnableSwitch`, it reads the installed record for truth and writes
 * straight through the backend's batch command, holding only a pending value
 * until the refetch lands.
 */
export function RepoEnableSwitch({
  names,
  label,
}: {
  /** Every skill the card stands for — the batch write covers all of them,
   *  including skills past the card's preview cap. */
  names: string[];
  /** The repository's `owner/repo`, or the pool card's own label. */
  label: string;
}) {
  const queryClient = useQueryClient();
  const { data: installed } = useInstalledSkills();
  const { t } = useTranslation();
  const [pending, setPending] = useState<boolean | null>(null);

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => setManySkillsEnabled(names, enabled),
    onMutate: (enabled: boolean) => setPending(enabled),
    onSuccess: async () => {
      await markSkillsChanged(queryClient);
      setPending(null);
    },
    onError: (e) => {
      setPending(null);
      toast.add({ title: errorMessage(e, t("action.toggleFailed")), type: "error" });
      void markSkillsChanged(queryClient);
    },
  });

  const wanted = new Set(names);
  const records = (installed ?? []).filter((s) => wanted.has(s.name));
  if (records.length === 0) return null;

  const allOn = records.every((s) => s.enabled);
  const someOn = records.some((s) => s.enabled);
  const checked = pending ?? allOn;
  // A half decision is worth showing, but only while the record is the truth:
  // a pending write is already a full one (its value rides the switch).
  const mixed = pending === null && !allOn && someOn;

  const tooltip = allOn
    ? t("action.disableAll")
    : someOn
      ? t("action.partialOn")
      : t("action.enableAll");

  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={
          checked
            ? t("action.disableAllAria", { label })
            : t("action.enableAllAria", { label })
        }
        render={
          <Switch
            checked={checked}
            onCheckedChange={(next) => toggle.mutate(next)}
            // The unchosen half, tinted with the chosen colour: the track keeps
            // the off position's thumb, so the mixed state never pretends to be
            // fully on. The important marker wins the specificity tie with the
            // switch's own `data-unchecked:bg-input`.
            className={mixed ? "data-unchecked:bg-primary/40!" : undefined}
          />
        }
      />
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );
}
