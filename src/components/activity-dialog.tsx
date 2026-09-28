import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ParseKeys, TFunction } from "i18next";
import { FolderOpen, Loader2, Trash2 } from "lucide-react";

import {
  ACTIVITY_QUERY_KEY,
  useActivityLog,
} from "../hooks/use-activity-log";
import { clearActivity, revealActivityLog } from "../lib/activity";
import type { ActivityActor, ActivityRecord } from "../lib/activity";
import {
  activityCategory,
  activityNotice,
  formatRelativeTime,
  groupActivityByDay,
  startOfLocalDay,
  type ActivityCategory,
  type ActivityTone,
} from "../lib/activity-notice";
import { useAppLocale } from "../i18n/use-language";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Switch } from "./ui/switch";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

/** The category chips' i18n keys, in display order. */
const CATEGORY_KEYS: ReadonlyArray<{
  value: "all" | ActivityCategory;
  key: ParseKeys;
}> = [
  { value: "all", key: "activity.filter.all" },
  { value: "skill", key: "activity.filter.skill" },
  { value: "agent", key: "activity.filter.agent" },
  { value: "source", key: "activity.filter.source" },
];

/** The mark's semantic colour, one class per tone. */
const TONE_CLASS: Record<ActivityTone, string> = {
  default: "text-muted-foreground",
  success: "text-success",
  danger: "text-destructive",
};

/**
 * A small label on every action the user did not take themselves, so the
 * reason is visible at a glance rather than only reachable through the filter.
 */
const ACTOR_KEYS: Record<Exclude<ActivityActor, "user">, ParseKeys> = {
  auto: "activity.actor.auto",
  scan: "activity.actor.scan",
};

const DAY_MS = 86_400_000;

/**
 * The activity viewer: an append-only record of what the app did to the
 * skills and agents on this machine. A second-level settings surface, opened
 * from the popover exactly like the advanced settings dialog.
 *
 * Newest first, grouped by day, filterable by what was acted on (skills /
 * agents / sources) and by who acted (the user, or the app's own automatic
 * passes). The content is its own component so its read mounts with the open
 * dialog — a fresh read every time it is opened.
 */
export function ActivityDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <ActivityBody />
      </DialogContent>
    </Dialog>
  );
}

function ActivityBody() {
  const { t } = useTranslation();
  const locale = useAppLocale();
  const queryClient = useQueryClient();
  const { data, isPending } = useActivityLog();
  const [category, setCategory] = useState<"all" | ActivityCategory>("all");
  const [includeAuto, setIncludeAuto] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const records = data ?? [];
  const filtered = records.filter((record) => {
    if (category !== "all" && activityCategory(record.event) !== category) {
      return false;
    }
    // The user's own actions always stay; automatic ones can be muted.
    if (!includeAuto && record.actor !== "user") return false;
    return true;
  });
  const groups = groupActivityByDay(filtered);
  const today = startOfLocalDay(Date.now());

  const handleClear = async () => {
    setClearing(true);
    try {
      await clearActivity();
      await queryClient.invalidateQueries({ queryKey: ACTIVITY_QUERY_KEY });
      setConfirmOpen(false);
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("activity.title")}</DialogTitle>
        <DialogDescription>{t("activity.description")}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          variant="outline"
          spacing={0}
          value={[category]}
          onValueChange={(values) => {
            const next = values[0] as "all" | ActivityCategory | undefined;
            setCategory(next ?? "all");
          }}
          aria-label={t("activity.filterAria")}
        >
          {CATEGORY_KEYS.map(({ value, key }) => (
            <ToggleGroupItem key={value} value={value} className="px-3">
              {t(key)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {/* A plain container, not a <label>: the switch already names itself
            with aria-label, and a wrapping label would append its text to that
            name (the control would read twice to assistive tech). */}
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Switch
            checked={includeAuto}
            onCheckedChange={setIncludeAuto}
            aria-label={t("activity.autoToggle")}
          />
          {t("activity.autoToggle")}
        </div>
      </div>

      <div className="-mr-2 flex max-h-[56vh] flex-col overflow-y-auto pr-2">
        {isPending ? null : groups.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-muted-foreground">
            {t("activity.empty")}
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.day}>
              <div className="sticky top-0 z-10 bg-popover py-1.5 text-[11px] font-medium text-muted-foreground">
                {dayLabel(group.day, today, t, locale)}
              </div>
              <ul className="flex flex-col">
                {group.records.map((record, index) => (
                  <ActivityRow
                    key={`${group.day}-${index}-${record.event}`}
                    record={record}
                    locale={locale}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      <DialogFooter className="sm:justify-between">
        <Button variant="ghost" size="sm" onClick={() => void revealActivityLog()}>
          <FolderOpen aria-hidden />
          {t("activity.reveal")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={records.length === 0}
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 aria-hidden />
          {t("activity.clear")}
        </Button>
      </DialogFooter>

      {/* A nested confirm: clearing is irreversible, so it pays a second
          press. Rendered only while open, so its own state resets each time. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("activity.clearConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("activity.clearConfirmDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={clearing}
            >
              {t("action.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleClear()}
              disabled={clearing}
            >
              {clearing ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Trash2 aria-hidden />
              )}
              {t("activity.clearConfirmAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** One record: its mark, its summary, its optional detail, and its time. */
function ActivityRow({
  record,
  locale,
}: {
  record: ActivityRecord;
  locale: string;
}) {
  const { t } = useTranslation();
  const notice = activityNotice(record.event);
  const Icon = notice.icon;
  const tone = notice.tone(record);
  const detail = notice.detail?.(t, record) ?? null;

  return (
    <li className="flex items-start gap-2.5 py-1.5">
      <Icon
        className={`mt-0.5 size-3.5 shrink-0 ${TONE_CLASS[tone]}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-1.5 text-[13px] leading-snug text-foreground">
          <span>{notice.summary(t, record)}</span>
          {record.actor !== "user" && (
            <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-normal text-muted-foreground">
              {t(ACTOR_KEYS[record.actor])}
            </span>
          )}
        </p>
        {detail && (
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
            {detail}
          </p>
        )}
      </div>
      <time className="mt-0.5 shrink-0 text-[11px] whitespace-nowrap text-muted-foreground">
        {formatRelativeTime(record.ts, Date.now(), locale)}
      </time>
    </li>
  );
}

/** Today / yesterday, else the date in the reader's locale. */
function dayLabel(
  day: number,
  today: number,
  t: TFunction,
  locale: string,
): string {
  if (day === today) return t("activity.today");
  if (day === today - DAY_MS) return t("activity.yesterday");
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(day);
}
