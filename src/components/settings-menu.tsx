import { useState } from "react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import {
  Braces,
  CircleCheck,
  Globe,
  History,
  LoaderCircle,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  Sun,
} from "lucide-react";

import { useLanguagePreference } from "../i18n/use-language";
import { useAppUpdate } from "../hooks/use-app-update";
import { AdvancedSettingsDialog } from "./advanced-settings-dialog";
import { ActivityDialog } from "./activity-dialog";
import { DeveloperDialog } from "./developer-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

/**
 * The whole update affordance: one chip beside 设置, and the chip itself is
 * the way in.
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
 * decoration — and it is the only coloured thing in the header, which is what
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
function UpdateRowStatus({
  phase,
}: {
  phase: ReturnType<typeof useAppUpdate>["phase"];
}) {
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
    case "error":
      return (
        <span className="text-xs text-destructive">{t("update.failed")}</span>
      );
    default:
      return null;
  }
}

const LANGUAGE_VALUES = ["en", "zh", "system"] as const;
const THEME_VALUES = ["light", "dark", "system"] as const;

/**
 * Settings entry: the header's trailing edge opens a cascading menu — every
 * choice sits in a hover submenu with a radio check on the picked value, the
 * way native macOS menus do it. One consistent row shape (icon + label +
 * chevron) replaces the old flyout's mix of toggle groups and buttons: the
 * menu reads the same at every depth and grows without re-laying-out, and a
 * submenu keeps even the longest option list to a single line of chrome.
 *
 * The entry itself is the icon alone. It is a control, not a place, so it does
 * not wear the labelled segment the two destinations wear; the label it drops
 * lives in the tooltip instead.
 */
export function SettingsMenu() {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [developerOpen, setDeveloperOpen] = useState(false);
  const update = useAppUpdate();
  const { phase, open: openUpdateDialog, check } = update;
  const hasUpdate = phase === "available" && update.version !== null;
  const { preference, setPreference } = useLanguagePreference();
  const { theme, setTheme } = useTheme();

  const handleUpdateClick = () => {
    if (phase === "available") {
      // A new version is waiting: hand off to the confirmation dialog and
      // dismiss the menu so only one overlay is up at a time.
      openUpdateDialog();
      setMenuOpen(false);
      return;
    }
    // Any other phase re-runs a manual check (`force` bypasses the throttle);
    // the row then reports the outcome in place.
    void check({ force: true });
  };

  const openAdvanced = () => {
    setMenuOpen(false);
    setAdvancedOpen(true);
  };

  const openActivity = () => {
    setMenuOpen(false);
    setActivityOpen(true);
  };

  const openDeveloper = () => {
    setMenuOpen(false);
    setDeveloperOpen(true);
  };

  return (
    <>
      {/* The chip sits beside the entry, not on it: a bare dot on the gear
          would be read as decoration rather than as "an update is waiting". */}
      {hasUpdate && <UpdateBadge />}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("settings.title")}
                    // A mark on its own, not a third destination: the two
                    // segments beside the brand are places, and settings is a
                    // control — naming it beside them would put it in their
                    // class. The tooltip says the word the icon does not.
                    className="text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  />
                }
              />
            }
          >
            <Settings className="size-[18px]" />
          </TooltipTrigger>
          {/* Below the control: the row it lives in is the window's top edge. */}
          <TooltipContent side="bottom">{t("settings.title")}</TooltipContent>
        </Tooltip>
        {/* Opens downward: the entry sits on the window's top edge, with no
            room above it and the whole window below. */}
        <DropdownMenuContent side="bottom" align="end" className="w-56">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Globe />
              {t("settings.interfaceLanguage")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={preference}
                onValueChange={(value) => {
                  if (LANGUAGE_VALUES.includes(value as (typeof LANGUAGE_VALUES)[number])) {
                    setPreference(value as (typeof LANGUAGE_VALUES)[number]);
                  }
                }}
              >
                <DropdownMenuRadioItem value="system">
                  {t("language.system")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="en">
                  {t("language.en")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="zh">
                  {t("language.zh")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette />
              {t("settings.interfaceTheme")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={theme ?? "system"}
                onValueChange={(value) => {
                  if (THEME_VALUES.includes(value as (typeof THEME_VALUES)[number])) {
                    setTheme(value as (typeof THEME_VALUES)[number]);
                  }
                }}
              >
                <DropdownMenuRadioItem value="light">
                  <Sun />
                  {t("theme.light")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  <Moon />
                  {t("theme.dark")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">
                  <Monitor />
                  {t("theme.system")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          {/* closeOnClick=false: the row reports the check's outcome in
              place, so the menu must stay open while it does. */}
          <DropdownMenuItem
            disabled={phase === "checking"}
            closeOnClick={false}
            onClick={handleUpdateClick}
          >
            <RefreshCw />
            {t("settings.softwareUpdate")}
            {/* Idle trailing: the version rides the row it belongs to —
                checking for updates is exactly when a version matters — so
                the menu needs no footer of its own. Once a check runs, the
                status takes the slot back. */}
            <span className="ml-auto flex items-center">
              {phase === "idle" ? (
                <span className="text-xs text-muted-foreground">
                  v{__APP_VERSION__}
                </span>
              ) : (
                <UpdateRowStatus phase={phase} />
              )}
            </span>
          </DropdownMenuItem>
          {/* The phase worth a second line: why a check failed. Rendered
              as an inert row so it stays inside the menu's flow. */}
          {phase === "error" && (
            <DropdownMenuItem
              disabled
              role="alert"
              className="text-xs leading-relaxed text-destructive"
            >
              {update.error}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={openAdvanced}>
            <SlidersHorizontal />
            {t("settings.advanced")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openActivity}>
            <History />
            {t("activity.title")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openDeveloper}>
            <Braces />
            {t("developer.title")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Mounted outside the menu: its content unmounts on close and would
          take the dialogs down with it. */}
      <AdvancedSettingsDialog
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
      />
      <ActivityDialog open={activityOpen} onOpenChange={setActivityOpen} />
      <DeveloperDialog open={developerOpen} onOpenChange={setDeveloperOpen} />
    </>
  );
}
