import { useState } from "react";

import { SkillCard, type SkillMatched } from "../../components/skill-card";
import {
  SkillInstallButton,
  type InstallState,
} from "../../components/skill-install-button";
import type { Skill } from "../../types/skill";

export type { SkillMatched };

/**
 * One skill in a store listing — the store's binding of the shared `SkillCard`.
 *
 * The card renders the skill; what the store adds is the only thing a registry
 * row does that an installed row does not: installing. The corner action is the
 * install button (idle → installing → installed | retry, through the skills
 * backend or the mock store), and a failed install reports its message under
 * the card.
 *
 * The card carries no surface-specific extras — no rank chip, no alternative
 * metric — so the store list, a repo's skills, a leaderboard and the installed
 * list are one card in one layout, and the only thing that differs between them
 * is the order their data arrives in.
 */
export function SkillListRow({
  skill,
  matched,
  selected = false,
  onSelect,
}: {
  skill: Skill;
  /** Search-hit highlights; absent outside a search (nothing highlighted). */
  matched?: SkillMatched;
  /** Whether this card is the one shown in the detail panel. */
  selected?: boolean;
  /** Opens the skill detail panel. */
  onSelect?: () => void;
}) {
  // The failure message of the last install attempt, shown under the card.
  const [installError, setInstallError] = useState<string | null>(null);
  // The install button's state, reported back by the button. Only the idle
  // state waits for the reader's attention: hover reveals the download
  // affordance, while installed, installing and retry persist — they are
  // facts the reader should not have to hover for.
  const [installState, setInstallState] = useState<InstallState>("idle");

  return (
    <SkillCard
      skill={skill}
      matched={matched}
      selected={selected}
      onSelect={onSelect}
      action={
        <SkillInstallButton
          skill={skill}
          onError={setInstallError}
          onStateChange={setInstallState}
        />
      }
      actionVisibility={installState === "idle" ? "on-hover" : "always"}
      below={
        installError && (
          <p
            role="alert"
            className="mt-1 line-clamp-2 px-4 text-[12px] leading-relaxed text-destructive"
          >
            {installError}
          </p>
        )
      }
    />
  );
}
