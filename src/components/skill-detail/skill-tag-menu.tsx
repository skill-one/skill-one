import { useMemo, useState, type ReactElement } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, Pencil, RotateCcw, Smile, X } from "lucide-react";

import { DOMAINS, domainLabel } from "../../data/domains";
import { useAppLocale } from "../../i18n/use-language";
import { useCustomTags } from "../../hooks/use-custom-tags";
import { markSkillsChanged } from "../../hooks/use-installed-skills";
import {
  collectTakenTagKeys,
  defaultTagMark,
  normalizeTagEmoji,
  validateNewTag,
  type TagValidationError,
} from "../../lib/custom-tags";
import {
  deleteCustomTagDef,
  renameCustomTagDef,
  saveCustomTagDef,
  setSkillTag,
} from "../../lib/provenance";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { toast } from "../ui/toast";
import { errorMessage, cn } from "../../lib/utils";
import { EmojiPickerPanel } from "./emoji-picker-panel";

/**
 * The installed skill's tag picker in the detail drawer, opened by the
 * classification badge itself: one press on the badge shows the creation
 * row first, then — when the reader has coined any — their own tags leading
 * the list, with the system domains after, plus the ways out: clearing
 * back to the store's classification, or deleting a tag no
 * skill uses anymore. A custom tag's pencil reuses the creation row as its
 * editor — prefilled, saving back over the tag (and moving every assignment
 * along when the name changes) — so there is one form, not two. Nothing is
 * written until the user picks, creates, saves, clears or deletes; the list
 * re-answers through the shared `markSkillsChanged` invalidation.
 */
export function SkillTagMenu({
  skillName,
  assignedKey,
  effectiveKey,
  trigger,
}: {
  /** The installed skill's name — the ledger key the choice is stored under. */
  skillName: string;
  /** The user's explicit choice, if any; null means the store's answer shows. */
  assignedKey: string | null;
  /** What the badge shows now: the choice, else the store's classification. */
  effectiveKey: string;
  /** The badge the menu opens from — pressed, not hovered, to choose a tag. */
  trigger: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  // The mark for the tag being created: "" means the label's first character.
  // Set from the picker panel below; the toggle itself shows it, so no
  // separate box is needed to display or clear the choice.
  const [markDraft, setMarkDraft] = useState("");
  // The custom tag being renamed, if any: the creation row below turns into
  // its editor, prefilled with the tag's own label and mark.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const locale = useAppLocale();
  const { data: customTags } = useCustomTags();
  const defs = customTags?.tagDefs ?? [];
  // Tags currently filing a skill: only an unused tag offers its delete, so
  // removing one can never orphan a choice — the menu never asks "and the N
  // skills using it?" because the question cannot arise.
  const usedTags = useMemo(() => {
    const used = new Set<string>();
    for (const tag of Object.values(customTags?.skillTags ?? {})) used.add(tag);
    return used;
  }, [customTags]);

  const errorText = (error: TagValidationError): string => {
    switch (error) {
      case "empty":
        return t("tag.errorEmpty");
      case "tooLong":
        return t("tag.errorTooLong");
      case "reserved":
        return t("tag.errorReserved");
      case "duplicate":
        return t("tag.errorDuplicate");
      case "emojiLong":
        return t("tag.errorEmojiLong");
    }
  };

  const pick = async (key: string) => {
    if (busy || key === effectiveKey) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await setSkillTag(skillName, key);
      await markSkillsChanged(queryClient);
      setOpen(false);
    } catch (e) {
      toast.add({ title: errorMessage(e, t("tag.failed")), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (busy || assignedKey == null) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await setSkillTag(skillName, null);
      await markSkillsChanged(queryClient);
      toast.add({ title: t("tag.cleared"), type: "success" });
      setOpen(false);
    } catch (e) {
      toast.add({ title: errorMessage(e, t("tag.failed")), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (busy) return;
    // Renaming skips its own key: the tag already holds it, so only other
    // keys — custom or system — can collide.
    const taken = collectTakenTagKeys(
      defs.map((def) => def.key).filter((key) => key !== editingKey),
    );
    const checked = validateNewTag(draft, taken);
    if (!checked.ok) {
      toast.add({ title: errorText(checked.error), type: "error" });
      return;
    }
    // The mark always comes from the picker (one visible character by
    // construction); the check stays as the second lock, never the path.
    const mark = normalizeTagEmoji(markDraft);
    if (!mark.ok) {
      toast.add({ title: errorText(mark.error), type: "error" });
      return;
    }
    setBusy(true);
    try {
      const label = draft.trim();
      if (editingKey == null) {
        await saveCustomTagDef(checked.key, label, mark.emoji);
        // The new tag files this skill at once: creating it was the act of
        // choosing it, and an unused tag would only linger in the menu.
        await setSkillTag(skillName, checked.key);
      } else if (
        checked.key.toLowerCase() === editingKey.toLowerCase()
      ) {
        // A case-only touch-up keeps its key: no assignment moves, only the
        // spelling and the mark change.
        await saveCustomTagDef(editingKey, label, mark.emoji);
      } else {
        // A real rename moves every assignment along in the same ledger
        // pass, so no skill is ever left pointing at the old key.
        await renameCustomTagDef(editingKey, checked.key, label, mark.emoji);
      }
      await markSkillsChanged(queryClient);
      cancelEdit();
      setOpen(false);
    } catch (e) {
      toast.add({ title: errorMessage(e, t("tag.failed")), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (key: string, label: string, emoji?: string) => {
    setEditingKey(key);
    setDraft(label);
    setMarkDraft(emoji ?? "");
    setPickerOpen(false);
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setDraft("");
    setMarkDraft("");
    setPickerOpen(false);
  };

  const remove = async (key: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteCustomTagDef(key);
      await markSkillsChanged(queryClient);
      toast.add({ title: t("tag.deleted"), type: "success" });
      // Stays open: removing one unused tag often precedes removing the next.
    } catch (e) {
      toast.add({ title: errorMessage(e, t("tag.failed")), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const itemClass = (active: boolean) =>
    cn(
      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px]",
      "transition-colors hover:bg-muted",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      active && "bg-muted/60 font-medium",
    );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Closing discards the form: a half-typed rename never survives into
        // the next open, so the row always reads as what the ledger holds.
        if (!next) cancelEdit();
        setOpen(next);
      }}
    >
      {/* The badge itself is the trigger — a press chooses the tag, so there
          is no second affordance beside it. The badge root is a span, so it
          nests inside the button without an interactive-descendant problem,
          and its own hover tooltip (the classification's scope) still reads
          on hover. */}
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={t("tag.editAria", { name: skillName })}
            title={t("tag.edit")}
            className={cn(
              "inline-flex cursor-pointer items-center rounded-4xl transition-colors",
              "hover:bg-muted/60",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            )}
          >
            {trigger}
          </button>
        }
      />
      <PopoverContent align="start" sideOffset={6} className="w-80 gap-2 p-3">
        <p className="px-1 text-[11px] font-medium text-muted-foreground">
          {t("tag.title")}
        </p>
        {/* Creation leads: the list below scrolls past a dozen system
            domains, so a form parked at the end would hide the one action a
            first-time reader opened the menu for. Picking still costs
            nothing extra — one compact row above it. */}
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          {/* The mark toggle wears the choice itself — a picked emoji, else
              the smile that opens the picker. A set mark grows a clear
              beside it, back to the label's first character; two inputs
              remain, not three. */}
          <button
            type="button"
            disabled={busy}
            aria-label={t("tag.pickEmoji")}
            title={t("tag.pickEmoji")}
            aria-pressed={pickerOpen}
            onClick={() => setPickerOpen((next) => !next)}
            className={cn(
              "inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md",
              "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              pickerOpen && "bg-muted text-foreground",
            )}
          >
            {markDraft ? (
              <span aria-hidden="true" className="text-[15px] leading-none">
                {markDraft}
              </span>
            ) : (
              <Smile className="size-3.5" aria-hidden />
            )}
          </button>
          {markDraft && (
            <button
              type="button"
              disabled={busy}
              aria-label={t("tag.clearEmoji")}
              title={t("tag.clearEmoji")}
              onClick={() => setMarkDraft("")}
              className={cn(
                "-ml-1 inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded",
                "text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              )}
            >
              <X className="size-3" aria-hidden />
            </button>
          )}
          <Input
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("tag.newPlaceholder")}
            aria-label={t("tag.newPlaceholder")}
            className="h-7 text-[12px]"
          />
          {editingKey != null && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-[12px]"
              disabled={busy}
              onClick={cancelEdit}
            >
              {t("tag.cancel")}
            </Button>
          )}
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 px-2.5 text-[12px]"
            disabled={busy || draft.trim().length === 0}
          >
            {editingKey != null ? t("tag.save") : t("tag.create")}
          </Button>
        </form>
        {pickerOpen && (
          <EmojiPickerPanel
            onPick={(emoji) => {
              setMarkDraft(emoji);
              setPickerOpen(false);
            }}
          />
        )}
        <div className="max-h-64 overflow-y-auto">
          {/* Custom tags lead, when any exist: they are the labels the reader
              coined themselves, so the menu answers with them before the
              system domains. With none defined the system list stands alone,
              headers and all, exactly as before. */}
          {defs.length > 0 && (
            <>
              <p className="px-2 pt-1 pb-0.5 text-[10px] text-muted-foreground/70">
                {t("tag.customGroup")}
              </p>
              {defs.map((def) => (
                <div key={def.key} className="group flex items-center gap-0.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void pick(def.key)}
                    className={cn(itemClass(effectiveKey === def.key || editingKey === def.key), "w-auto min-w-0 flex-1")}
                  >
                    <span aria-hidden="true" className="text-[13px] leading-none">
                      {def.emoji ?? defaultTagMark(def.label)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{def.label}</span>
                    {effectiveKey === def.key && (
                      <Check className="size-3 shrink-0" aria-hidden />
                    )}
                  </button>
                  {/* The pencil stays for used tags too: renaming moves every
                      assignment along, so unlike deletion it needs no unused
                      guard. It toggles — a second press backs out. */}
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={t("tag.renameAria", { label: def.label })}
                    title={t("tag.rename")}
                    aria-pressed={editingKey === def.key}
                    onClick={() =>
                      editingKey === def.key
                        ? cancelEdit()
                        : startEdit(def.key, def.label, def.emoji)
                    }
                    className={cn(
                      "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded",
                      "text-muted-foreground/60 transition-all hover:bg-muted hover:text-foreground",
                      "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      editingKey === def.key && "bg-muted text-foreground opacity-100",
                    )}
                  >
                    <Pencil className="size-3" aria-hidden />
                  </button>
                  {!usedTags.has(def.key) && (
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={t("tag.deleteAria", { label: def.label })}
                      title={t("tag.delete")}
                      onClick={() => void remove(def.key)}
                      className={cn(
                        "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded",
                        "text-muted-foreground/60 transition-all hover:bg-destructive/10 hover:text-destructive",
                        "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      )}
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
          <p
            className={cn(
              "px-2 pb-0.5 text-[10px] text-muted-foreground/70",
              defs.length > 0 ? "pt-2" : "pt-1",
            )}
          >
            {t("tag.systemGroup")}
          </p>
          {DOMAINS.map((domain) => (
            <button
              key={domain.key}
              type="button"
              disabled={busy}
              onClick={() => void pick(domain.key)}
              className={itemClass(effectiveKey === domain.key)}
            >
              <span aria-hidden="true" className="text-[13px] leading-none">
                {domain.emoji}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {domainLabel(domain.key, locale)}
              </span>
              {effectiveKey === domain.key && (
                <Check className="size-3 shrink-0" aria-hidden />
              )}
            </button>
          ))}
        </div>
        {assignedKey != null && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 justify-start px-2 text-[11px]"
            disabled={busy}
            onClick={() => void clear()}
          >
            <RotateCcw className="size-3" aria-hidden />
            {t("tag.clear")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
