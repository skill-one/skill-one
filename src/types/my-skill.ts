export interface MySkill {
  /** Skill identifier, e.g. "pdf" */
  name: string;
  /** Source repository in "owner/repo" form */
  repo: string;
  /** Short human-readable description */
  description: string;
  /** Installed version tag */
  version: string;
  /** ISO date when the skill was installed */
  installedAt: string;
  /** Whether the skill is currently active */
  enabled: boolean;
  /** Whether a newer version is available */
  hasUpdate?: boolean;
}
