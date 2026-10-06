import { useMemo, useRef, useState, type ReactElement } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { DOMAINS, domainLabel } from "../../data/domains";
import { useAppLocale } from "../../i18n/use-language";
import { useCustomTags } from "../../hooks/use-custom-tags";
import { markSkillsChanged } from "../../hooks/use-installed-skills";
import {
  collectTakenTagKeys,
  defaultTagMark,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { toast } from "../ui/toast";
import { errorMessage, cn } from "../../lib/utils";

const EMPTY_DEFS: never[] = [];

/**
 * The installed skill's tag picker in the detail drawer, opened by the
 * classification badge itself: one press on the badge shows the creation /
 * search row first, followed by filtered custom and system categories,
 * supporting search-as-you-type, 1-click toggle unassign, and safe definition
 * management.
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
  // The custom tag being renamed, if any: the creation row below turns into
  // its editor, prefilled with the tag's own label.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{
    key: string;
    label: string;
    count: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const locale = useAppLocale();
  const { data: customTags } = useCustomTags();
  const defs = customTags?.tagDefs ?? EMPTY_DEFS;

  const getTagUsedCount = (key: string) => {
    let count = 0;
    for (const tag of Object.values(customTags?.skillTags ?? {})) {
      if (tag === key) count += 1;
    }
    return count;
  };

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

  const pick = async (key: string) => {
    if (busy) return;
    // Clicking the already assigned key toggles it off (clears it back to default)
    if (assignedKey === key) {
      await clear();
      return;
    }
    // If it's already the effective store classification without a custom assignment, close
    if (key === effectiveKey && assignedKey == null) {
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
    setBusy(true);
    try {
      const label = draft.trim();
      if (editingKey == null) {
        await saveCustomTagDef(checked.key, label);
        // The new tag files this skill at once: creating it was the act of
        // choosing it, and an unused tag would only linger in the menu.
        await setSkillTag(skillName, checked.key);
      } else if (
        checked.key.toLowerCase() === editingKey.toLowerCase()
      ) {
        // A case-only touch-up keeps its key: no assignment moves, only the
        // spelling changes.
        await saveCustomTagDef(editingKey, label);
      } else {
        // A real rename moves every assignment along in the same ledger
        // pass, so no skill is ever left pointing at the old key.
        await renameCustomTagDef(editingKey, checked.key, label);
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

  const startEdit = (key: string, label: string) => {
    setEditingKey(key);
    setDraft(label);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setDraft("");
  };

  const remove = async (key: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteCustomTagDef(key);
      await markSkillsChanged(queryClient);
      toast.add({ title: t("tag.deleted"), type: "success" });
    } catch (e) {
      toast.add({ title: errorMessage(e, t("tag.failed")), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const trimmedDraft = draft.trim();
  const searchLower = trimmedDraft.toLowerCase();

  const filteredDefs = useMemo(() => {
    if (editingKey != null || !searchLower) return defs;
    return defs.filter(
      (d) =>
        d.label.toLowerCase().includes(searchLower) ||
        d.key.toLowerCase().includes(searchLower),
    );
  }, [defs, editingKey, searchLower]);

  const filteredDomains = useMemo(() => {
    if (editingKey != null || !searchLower) return DOMAINS;
    return DOMAINS.filter((d) => {
      const label = domainLabel(d.key, locale).toLowerCase();
      return (
        label.includes(searchLower) ||
        d.key.toLowerCase().includes(searchLower)
      );
    });
  }, [locale, editingKey, searchLower]);

  const exactMatchExists = useMemo(() => {
    if (!trimmedDraft) return false;
    const isCustomMatch = defs.some(
      (d) =>
        d.label.toLowerCase() === searchLower ||
        d.key.toLowerCase() === searchLower,
    );
    const isDomainMatch = DOMAINS.some(
      (d) =>
        domainLabel(d.key, locale).toLowerCase() === searchLower ||
        d.key.toLowerCase() === searchLower,
    );
    return isCustomMatch || isDomainMatch;
  }, [defs, locale, searchLower, trimmedDraft]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (editingKey != null) {
      await create();
      return;
    }
    if (!trimmedDraft) return;

    // If typing an exact match of an existing item, pick it
    const exactDef = defs.find(
      (d) =>
        d.label.toLowerCase() === searchLower ||
        d.key.toLowerCase() === searchLower,
    );
    if (exactDef) {
      await pick(exactDef.key);
      return;
    }
    const exactDomain = DOMAINS.find(
      (d) =>
        domainLabel(d.key, locale).toLowerCase() === searchLower ||
        d.key.toLowerCase() === searchLower,
    );
    if (exactDomain) {
      await pick(exactDomain.key);
      return;
    }

    // Otherwise create as new tag
    await create();
  };

  const itemClass = (active: boolean) =>
    cn(
      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px]",
      "transition-colors hover:bg-muted",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      active && "bg-muted/60 font-medium",
    );

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (!next) cancelEdit();
          setOpen(next);
        }}
      >
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={t("tag.editAria", { name: skillName })}
              title={t("tag.edit")}
              className={cn(
                "group/tag-btn inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors",
                assignedKey != null
                  ? "bg-secondary/80 hover:bg-secondary text-secondary-foreground border border-border/50 font-medium"
                  : "hover:bg-muted/80 text-muted-foreground hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              )}
            >
              {trigger}
              <Pencil className="size-2.5 opacity-40 transition-opacity group-hover/tag-btn:opacity-100" aria-hidden />
            </button>
          }
        />
        <PopoverContent align="start" sideOffset={6} className="w-80 gap-2 p-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-[11px] font-medium text-muted-foreground">
              {editingKey != null
                ? t("tag.editingTag", {
                    name: defs.find((d) => d.key === editingKey)?.label ?? "",
                  })
                : t("tag.title")}
            </p>
            {editingKey != null && (
              <span className="text-[10px] text-muted-foreground">
                {t("tag.rename")}
              </span>
            )}
          </div>
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              void handleFormSubmit(e);
            }}
          >
            <div className="relative flex-1">
              <Input
                ref={inputRef}
                value={draft}
                disabled={busy}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  editingKey != null
                    ? t("tag.rename")
                    : t("tag.searchOrNewPlaceholder")
                }
                aria-label={t("tag.newPlaceholder")}
                className="h-7 text-[12px] pr-6"
              />
              {draft.length > 0 && editingKey == null && (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => {
                    setDraft("");
                    inputRef.current?.focus();
                  }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
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
          <div className="max-h-64 overflow-y-auto">
            {/* Quick create option when search query doesn't match existing tags */}
            {editingKey == null && trimmedDraft.length > 0 && !exactMatchExists && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void create()}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-primary hover:bg-primary/10 transition-colors font-medium border border-dashed border-primary/30 mb-1"
              >
                <Plus className="size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  {t("tag.createPrompt", { name: trimmedDraft })}
                </span>
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  Enter
                </span>
              </button>
            )}

            {filteredDefs.length > 0 && (
              <>
                <p className="px-2 pt-1 pb-0.5 text-[10px] text-muted-foreground/70">
                  {t("tag.customGroup")}
                </p>
                {filteredDefs.map((def) => {
                  const count = getTagUsedCount(def.key);
                  return (
                    <div key={def.key} className="group flex items-center gap-0.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void pick(def.key)}
                        className={cn(
                          itemClass(
                            effectiveKey === def.key || editingKey === def.key,
                          ),
                          "w-auto min-w-0 flex-1",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className="text-[13px] leading-none"
                        >
                          {def.emoji ?? defaultTagMark(def.label)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {def.label}
                        </span>
                        {count > 0 && (
                          <span className="text-[10px] text-muted-foreground/60 mr-1">
                            {count}
                          </span>
                        )}
                        {effectiveKey === def.key && (
                          <Check className="size-3 shrink-0" aria-hidden />
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={t("tag.renameAria", { label: def.label })}
                        title={t("tag.rename")}
                        aria-pressed={editingKey === def.key}
                        onClick={() =>
                          editingKey === def.key
                            ? cancelEdit()
                            : startEdit(def.key, def.label)
                        }
                        className={cn(
                          "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded",
                          "text-muted-foreground/60 transition-all hover:bg-muted hover:text-foreground",
                          "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                          editingKey === def.key &&
                            "bg-muted text-foreground opacity-100",
                        )}
                      >
                        <Pencil className="size-3" aria-hidden />
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={t("tag.deleteAria", { label: def.label })}
                        title={t("tag.delete")}
                        onClick={() => {
                          if (count > 0) {
                            setConfirmDelete({
                              key: def.key,
                              label: def.label,
                              count,
                            });
                          } else {
                            void remove(def.key);
                          }
                        }}
                        className={cn(
                          "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded",
                          "text-muted-foreground/60 transition-all hover:bg-destructive/10 hover:text-destructive",
                          "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        )}
                      >
                        <Trash2 className="size-3" aria-hidden />
                      </button>
                    </div>
                  );
                })}
              </>
            )}

            {filteredDomains.length > 0 && (
              <>
                <p
                  className={cn(
                    "px-2 pb-0.5 text-[10px] text-muted-foreground/70",
                    filteredDefs.length > 0 ? "pt-2" : "pt-1",
                  )}
                >
                  {t("tag.systemGroup")}
                </p>
                {filteredDomains.map((domain) => (
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
              </>
            )}

            {filteredDefs.length === 0 && filteredDomains.length === 0 && (
              <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                {t("tag.noMatchingTags")}
              </p>
            )}
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
      <Dialog
        open={confirmDelete != null}
        onOpenChange={(next) => {
          if (!next) setConfirmDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("tag.confirmDeleteTitle")}</DialogTitle>
            <DialogDescription>
              {confirmDelete &&
                t("tag.confirmDeleteDesc", {
                  name: confirmDelete.label,
                  count: confirmDelete.count,
                })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setConfirmDelete(null)}
            >
              {t("tag.cancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={async () => {
                if (!confirmDelete) return;
                const keyToDelete = confirmDelete.key;
                setConfirmDelete(null);
                await remove(keyToDelete);
              }}
            >
              {t("tag.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
