import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronRight,
  CircleCheck,
  LoaderCircle,
  RefreshCw,
  Settings,
  SlidersHorizontal,
} from "lucide-react";

import {
  REPO_CARD_LIMITS,
  setRepoCardLimit,
  type RepoCardLimit,
} from "../lib/repo-card-preview";
import { useAppUpdate } from "../hooks/use-app-update";
import { useRepoCardLimit } from "../hooks/use-repo-card-limit";
import { AdvancedSettingsDialog } from "./advanced-settings-dialog";
import { LanguageToggle } from "./language-toggle";
import { ThemeModeToggle } from "./theme-mode-toggle";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Separator } from "./ui/separator";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

/** Shared chrome for the two menu rows at the bottom of the popover. */
const rowClassName =
  "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground disabled:pointer-events-none disabled:opacity-50";

/**
 * The whole in-rail update affordance: one chip above 设置, and the chip itself
 * is the way in.
 *
 * Marking the control the user already knows — rather than adding a
 * destination of its own — is how the desktop apps this one lives next to do
 * it: VS Code badges the Settings gear, Chrome badges the ⋮ menu, Slack badges
 * the workspace. VS Code went as far as fixing a bug where the gear badge
 * *and* its "Update" button showed at once, on the grounds that two signals
 * for one fact is noise.
 *
 * Clicking it opens the confirmation dialog from wherever the user is, so
 * nobody has to know the update is filed under settings. It says its piece
 * instead of being a bare dot — a silent dot beside an icon reads as
 * decoration — and it is the only coloured thing in the rail, which is what
 * makes it read as an action. Green (`success`) rather than the palette's
 * red: an available update is something to go and get, not a failure, and red
 * would say the app is broken.
 */
function UpdateBadge() {
  const { t } = useTranslation();
  const { open } = useAppUpdate();
  return (
    <Badge
      variant="success"
      render={
        <button
          type="button"
          onClick={() => open()}
          // The badge slot is `pointer-events-none` so it never swallows clicks
          // meant for the row; this one is a button and wants them.
          className="pointer-events-auto cursor-pointer"
        >
          {t("update.newVersion")}
        </button>
      }
    />
  );
}

/** Trailing status for the 软件更新 row, one shape per update phase. */
function UpdateRowStatus({ phase }: { phase: ReturnType<typeof useAppUpdate>["phase"] }) {
  const { t } = useTranslation();
  switch (phase) {
    case "checking":
      return (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          {t("update.checking")}
        </span>
      );
    case "upToDate":
      return (
        <span className="flex items-center gap-1 text-xs text-primary">
          <CircleCheck className="size-3.5" />
          {t("update.upToDate")}
        </span>
      );
    case "available":
      return <Badge variant="success">{t("update.newVersion")}</Badge>;
    case "managed":
      return (
        <span className="text-xs text-muted-foreground">
          {t("update.managed")}
        </span>
      );
    case "error":
      return (
        <span className="text-xs text-destructive">{t("update.failed")}</span>
      );
    default:
      return null;
  }
}

/**
 * Settings entry: the rail's foot opens a small anchored popover with the
 * at-a-glance settings (appearance, repo-card preview size, software update).
 * Heavier sections — CDN base and the registry data source — live one click
 * deeper in a dialog, per the common desktop pattern (Linear, VS Code, GitHub):
 * a lightweight flyout for the frequent toggles, a full surface only when there
 * is real content to manage.
 *
 * The entry itself is the icon alone. It is a control, not a place, so it does
 * not wear the labelled tile the two destinations wear; the label it drops lives
 * in the tooltip instead, which is where a rail this narrow keeps the words that
 * do not fit.
 */
export function SettingsMenu() {
  const { t } = useTranslation();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const update = useAppUpdate();
  const { phase, open: openUpdateDialog, check } = update;
  const hasUpdate = phase === "available" && update.version !== null;
  // The repository-card preview size, read live so the control reflects it and
  // a change notifies any list already on screen.
  const repoCardLimit = useRepoCardLimit();

  const handleUpdateClick = () => {
    if (phase === "available") {
      // A new version is waiting: hand off to the confirmation dialog and
      // dismiss the flyout so only one overlay is up at a time.
      openUpdateDialog();
      setPopoverOpen(false);
      return;
    }
    // Any other phase re-runs a manual check (`force` bypasses the throttle);
    // the row then reports the outcome in place.
    void check({ force: true });
  };

  const openAdvanced = () => {
    setPopoverOpen(false);
    setAdvancedOpen(true);
  };

  return (
    <>
      {/* The chip sits above the entry, not on it: the rail is too narrow for a
          label beside the icon, and a bare dot would be read as decoration
          rather than as "an update is waiting". */}
      {hasUpdate && <UpdateBadge />}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    aria-label={t("settings.title")}
                    // A mark on its own, not a third destination: the two entries
                    // above it are places, and settings is a control — naming it
                    // beside them would put it in their class. The tooltip says
                    // the word the rail no longer spends a line on, and the hover
                    // tile is the one the two destinations use.
                    className="text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  />
                }
              />
            }
          >
            <Settings className="size-5" />
          </TooltipTrigger>
          <TooltipContent side="right">{t("settings.title")}</TooltipContent>
        </Tooltip>
        {/* Opens rightward: the entry sits against the window's left edge, with
            no room below it and nothing to cover above. */}
        <PopoverContent side="right" align="end" className="w-60 gap-0 p-0">
          <div className="flex items-baseline justify-between px-3 pt-2.5 pb-1">
            <span className="text-sm font-medium text-foreground">
              {t("settings.title")}
            </span>
            <span className="text-[11px] text-muted-foreground">
              Skill One v{__APP_VERSION__}
            </span>
          </div>
          <div className="flex flex-col gap-3 px-3 pt-1 pb-2.5">
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">
                {t("settings.appearance")}
              </p>
              <ThemeModeToggle />
            </div>
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">
                {t("language.label")}
              </p>
              <LanguageToggle />
            </div>
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">
                {t("settings.repoPreviewCount")}
              </p>
              <ToggleGroup
                variant="outline"
                spacing={0}
                value={[String(repoCardLimit)]}
                onValueChange={(values) => {
                  const next = values[0];
                  if (next) setRepoCardLimit(Number(next) as RepoCardLimit);
                }}
                aria-label={t("settings.repoPreviewAria")}
              >
                {REPO_CARD_LIMITS.map((limit) => (
                  <ToggleGroupItem
                    key={limit}
                    value={String(limit)}
                    className="px-3"
                  >
                    {limit}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>
          <Separator />
          <div className="flex flex-col gap-0.5 p-1.5">
            <div>
              <button
                type="button"
                className={rowClassName}
                disabled={phase === "checking" || phase === "managed"}
                onClick={handleUpdateClick}
              >
                <span className="flex items-center gap-2">
                  <RefreshCw className="size-4" />
                  {t("settings.softwareUpdate")}
                </span>
                <UpdateRowStatus phase={phase} />
              </button>
              {/* The two phases worth a second line: the brew command to run
                  instead of the in-app updater, and why a check failed. */}
              {phase === "managed" && (
                <p className="px-8 pt-0.5 pb-1 text-[11px] text-muted-foreground">
                  <code className="rounded bg-muted px-1 py-0.5">
                    brew upgrade --cask skill-one
                  </code>
                </p>
              )}
              {phase === "error" && (
                <p
                  role="alert"
                  className="px-8 pt-0.5 pb-1 text-[11px] leading-relaxed text-destructive"
                >
                  {update.error}
                </p>
              )}
            </div>
            <button type="button" className={rowClassName} onClick={openAdvanced}>
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="size-4" />
                {t("settings.advanced")}
              </span>
              <ChevronRight className="size-3.5 text-muted-foreground" />
            </button>
          </div>
        </PopoverContent>
      </Popover>
      {/* Mounted outside the popover: its content unmounts on close and would
          take the dialog down with it. */}
      <AdvancedSettingsDialog open={advancedOpen} onOpenChange={setAdvancedOpen} />
    </>
  );
}
