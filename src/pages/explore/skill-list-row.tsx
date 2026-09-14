import { useState } from "react";

import { DomainBadge } from "../../components/domain-badge";
import { SkillCard, type SkillMatched } from "../../components/skill-card";
import { SkillInstallButton } from "../../components/skill-install-button";
import { SkillPopularity } from "../../components/skill-popularity";
import type { Skill } from "../../types/skill";

export type { SkillMatched };

/**
 * One skill in a store listing — the store's binding of the shared `SkillCard`.
 *
 * Everything the card is made of is the card's; what the store adds is the two
 * facts only a registry entry has. The corner action is the install button
 * (idle → installing → installed | retry, through the skills backend or the
 * mock store), and a failed install reports its message under the card. The
 * bottom rail carries the profile domain chip and the popularity figure — the
 * same blended number every surface shows, so the store list, a repo's skills
 * and a leaderboard can never disagree about it.
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

  return (
    <SkillCard
      source={skill.repo}
      name={skill.name}
      matched={matched}
      description={skill.description}
      stars={skill.stars}
      selected={selected}
      onSelect={onSelect}
      action={<SkillInstallButton skill={skill} onError={setInstallError} />}
      footer={
        <>
          {/* Domain from the profiles dataset; absent for skills it has not
              profiled, so the figure simply keeps the right edge alone. */}
          {skill.profile?.domain && (
            <DomainBadge
              domain={skill.profile.domain}
              reason={skill.profile.reason}
              className="shrink-0 rounded-full px-2 py-0 text-[10px] font-normal text-muted-foreground"
            />
          )}
          <SkillPopularity
            skill={skill}
            side="top"
            align="end"
            className="ml-auto"
          />
        </>
      }
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
