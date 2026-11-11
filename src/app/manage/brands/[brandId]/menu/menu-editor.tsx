"use client";

import { NextIntlClientProvider, useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import type { Bilingual, GuestMenu, Language, MenuDraft, MenuDraftContent } from "@/core";
import { localizeMenuSections } from "@/core/browser";
import type { Messages } from "@/i18n/messages";
import { Field } from "@/ui/field";
import { GuestMenuView } from "@/ui/guest-menu-view";
import { languageButtonClass } from "@/ui/language-switch";
import { Ordering } from "@/app/v/[token]/ordering";
import { persistMenuDraft } from "./actions";

type Section = MenuDraftContent["sections"][number];
type Dish = Section["dishes"][number];
type GuestMessages = Pick<Messages, "GuestMenu" | "LanguageSwitch" | "Ordering" | "Price">;

const emptyText = { en: "", am: "" };
const editorButton = "min-h-11 min-w-11 rounded-md border border-ink/30 px-3 text-sm font-medium disabled:opacity-45";
const panelTabs = ["edit", "preview"] as const;
const dishLanguages = ["am", "en"] as const;

function named(name: Bilingual) {
  return name.am.trim() || name.en.trim();
}

function missingTranslation({ name, description }: Dish) {
  return !name.am.trim() || !name.en.trim() || Boolean(description.am.trim()) !== Boolean(description.en.trim());
}

function move<T>(items: T[], index: number, step: number) {
  const reordered = [...items];
  [reordered[index], reordered[index + step]] = [reordered[index + step], reordered[index]];
  return reordered;
}

export function MenuEditor({
  initialDraft,
  theme,
  guestMessages,
}: {
  initialDraft: MenuDraft;
  theme: GuestMenu["theme"];
  guestMessages: Record<Language, GuestMessages>;
}) {
  const t = useTranslations("MenuEditor");
  const errors = useTranslations("StaffErrors");
  const locale = useLocale();
  const [saved, setSaved] = useState(initialDraft);
  const [menu, setMenu] = useState(initialDraft.menu);
  const [tab, setTab] = useState<(typeof panelTabs)[number]>("edit");
  const [previewLanguage, setPreviewLanguage] = useState<Language>(locale);
  const [openedDish, setOpenedDish] = useState<string>();
  const [status, setStatus] = useState<"saved" | "published">();
  const [error, setError] = useState<keyof Messages["StaffErrors"]>();
  const [pending, startTransition] = useTransition();
  const dirty = menu !== saved.menu && JSON.stringify(menu) !== JSON.stringify(saved.menu);
  const needsTranslation = menu.sections.flatMap(({ dishes }) => dishes).filter(missingTranslation).length;

  function changeSections(sections: Section[]) {
    setMenu({ sections });
    setStatus(undefined);
  }

  function updateSection(index: number, patch: Partial<Section>) {
    changeSections(menu.sections.map((section, i) => i === index ? { ...section, ...patch } : section));
  }

  function setFavourite(dishId: string, checked: boolean) {
    changeSections(menu.sections.map((section) => ({
      ...section,
      dishes: section.dishes.map((dish) => ({
        ...dish,
        houseFavourite: dish.dishId === dishId && checked,
      })),
    })));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const publish = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "publish";
    setError(undefined);
    setStatus(undefined);
    startTransition(async () => {
      const result = await persistMenuDraft(saved.brand.id, saved.revision, menu, publish);
      if (result.draft) {
        setSaved(result.draft);
        setMenu(result.draft.menu);
        setStatus(publish ? "published" : "saved");
      } else {
        setError(result.error ?? "invalid_input");
      }
    });
  }

  const previewSections = localizeMenuSections(menu.sections
    .filter((section) => named(section.name))
    .map((section) => ({ ...section, dishes: section.dishes.filter((dish) => named(dish.name)) })), previewLanguage);
  const previewDishes = previewSections.flatMap((section) => section.dishes);
  const favouriteId = menu.sections.flatMap(({ dishes }) => dishes).find((dish) => dish.houseFavourite)?.dishId;
  const lastPublish = saved.lastPublishedAt && new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Addis_Ababa",
  }).format(saved.lastPublishedAt);

  return (
    <div id="brand-menu-editor">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-rule pb-4">
        <div>
          <h1 className="font-display text-3xl">{t("heading", { brand: saved.brand.name })}</h1>
          <p className="mt-1 text-sm text-ink-muted">{lastPublish ? t("lastPublish", { date: lastPublish }) : t("neverPublished")}</p>
          <p className="text-sm font-semibold">{t(dirty || saved.hasUnpublishedChanges ? "unpublished" : "upToDate")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" form="menu-editor-fields" value="save" disabled={!dirty || pending} className={editorButton}>
            {t("save")}
          </button>
          <button type="submit" form="menu-editor-fields" value="publish" disabled={pending || (!dirty && !saved.hasUnpublishedChanges)} className="min-h-11 rounded-md bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-45">
            {t("publish")}
          </button>
        </div>
        {needsTranslation > 0 && <p className="w-full text-sm font-medium text-amber-900">{t("translationCount", { count: needsTranslation })}</p>}
        <div className="w-full empty:hidden" aria-live="polite">
          {status && <p className="text-sm text-ink-muted">{t(status)}</p>}
          {error && <p role="alert" className="text-sm font-medium text-red-800">{errors(error)}</p>}
        </div>
      </header>

      <div role="tablist" aria-label={t("nav")} className="mt-4 grid grid-cols-2 gap-2 lg:hidden">
        {panelTabs.map((panel) => (
          <button
            key={panel}
            id={`menu-${panel}-tab`}
            type="button"
            role="tab"
            aria-selected={tab === panel}
            aria-controls={`menu-${panel}-panel`}
            tabIndex={tab === panel ? 0 : -1}
            className={`${editorButton} aria-selected:bg-ink aria-selected:text-paper`}
            onClick={() => setTab(panel)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? "edit" : event.key === "End" ? "preview" : tab === "edit" ? "preview" : "edit";
              setTab(next);
              document.getElementById(`menu-${next}-tab`)?.focus();
            }}
          >
            {t(panel)}
          </button>
        ))}
      </div>

      <div className="mt-5 grid items-start gap-8 lg:grid-cols-2">
        <div id="menu-edit-panel" role="tabpanel" aria-labelledby="menu-edit-tab" className={tab === "edit" ? "" : "hidden lg:block"}>
          <section aria-label={t("edit")}>
            <form id="menu-editor-fields" onSubmit={submit} onInvalid={(event) => {
              setTab("edit");
              const details = (event.target as HTMLElement).closest("details");
              if (details) details.open = true;
            }}>
              <fieldset disabled={pending} className="space-y-5">
                <button type="button" className={editorButton} onClick={() => changeSections([
                  ...menu.sections,
                  { sectionId: crypto.randomUUID(), name: emptyText, dishes: [] },
                ])}>
                  {t("addSection")}
                </button>
                {menu.sections.map((section, sectionIndex) => (
                  <fieldset key={section.sectionId} className="min-w-0 rounded-xl border border-rule bg-white/35 px-4 pb-4">
                    <legend className="px-2 text-sm font-semibold">{t("section", { number: sectionIndex + 1 })}</legend>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <Field label={t("sectionAm")} lang="am" value={section.name.am}
                        onChange={(event) => updateSection(sectionIndex, { name: { ...section.name, am: event.target.value } })} />
                      <Field label={t("sectionEn")} lang="en" value={section.name.en}
                        onChange={(event) => updateSection(sectionIndex, { name: { ...section.name, en: event.target.value } })} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <MoveButtons index={sectionIndex} count={menu.sections.length} onMove={(step) => changeSections(move(menu.sections, sectionIndex, step))} />
                      <button type="button" className={editorButton} onClick={() => changeSections(menu.sections.filter((_, i) => i !== sectionIndex))}>
                        {t("removeSection")}
                      </button>
                    </div>
                    <div className="mt-4 divide-y divide-rule border-t border-rule">
                      {section.dishes.map((dish, dishIndex) => (
                        <DishFields
                          key={dish.dishId}
                          dish={dish}
                          open={openedDish === dish.dishId || undefined}
                          index={dishIndex}
                          count={section.dishes.length}
                          onChange={(patch) => updateSection(sectionIndex, {
                            dishes: section.dishes.map((candidate, i) => i === dishIndex ? { ...candidate, ...patch } : candidate),
                          })}
                          onMove={(step) => updateSection(sectionIndex, { dishes: move(section.dishes, dishIndex, step) })}
                          onFavourite={(checked) => setFavourite(dish.dishId, checked)}
                        />
                      ))}
                    </div>
                    <button type="button" className={`${editorButton} mt-4`} onClick={() => {
                      const dishId = crypto.randomUUID();
                      setOpenedDish(dishId);
                      updateSection(sectionIndex, {
                        dishes: [...section.dishes, {
                          dishId, name: emptyText, description: emptyText, priceSantim: 0,
                          fasting: false, houseFavourite: false, optionGroups: [],
                        }],
                      });
                    }}>
                      {t("addDish")}
                    </button>
                  </fieldset>
                ))}
              </fieldset>
            </form>
          </section>
        </div>
        <div id="menu-preview-panel" role="tabpanel" aria-labelledby="menu-preview-tab" className={tab === "preview" ? "min-w-0" : "hidden min-w-0 lg:block"}>
          <section aria-label={t("previewLabel")} className="overflow-hidden rounded-xl border border-rule bg-paper lg:sticky lg:top-0">
            <p className="border-b border-rule bg-paper-deep px-5 py-2 text-sm font-semibold">{t("draft")}</p>
            <NextIntlClientProvider locale={previewLanguage} messages={guestMessages[previewLanguage]}>
              <GuestMenuView
                brand={saved.brand}
                venueName={saved.venueName}
                theme={theme}
                sections={previewSections}
                fastingDishes={saved.fastingDay ? previewDishes.filter((dish) => dish.fasting) : []}
                houseFavourite={previewDishes.find((dish) => dish.id === favouriteId) ?? null}
                languageSwitch={<PreviewLanguages selectLanguage={setPreviewLanguage} />}
                ordering={<Ordering venueLinkToken="" sections={previewSections} recordBrowsing={false} preview />}
                preview
              />
            </NextIntlClientProvider>
          </section>
        </div>
      </div>
    </div>
  );
}

function MoveButtons({ index, count, onMove }: { index: number; count: number; onMove: (step: number) => void }) {
  const t = useTranslations("MenuEditor");
  return (
    <>
      <button type="button" disabled={index === 0} className={editorButton} onClick={() => onMove(-1)}>{t("moveUp")}</button>
      <button type="button" disabled={index === count - 1} className={editorButton} onClick={() => onMove(1)}>{t("moveDown")}</button>
    </>
  );
}

function DishFields({ dish, open, index, count, onChange, onMove, onFavourite }: {
  dish: Dish;
  open?: boolean;
  index: number;
  count: number;
  onChange: (patch: Partial<Dish>) => void;
  onMove: (step: number) => void;
  onFavourite: (checked: boolean) => void;
}) {
  const t = useTranslations("MenuEditor");
  const locale = useLocale();
  return (
    <details open={open} className="min-w-0">
      <summary className="min-h-11 cursor-pointer py-3 font-medium">
        {dish.name[locale].trim() || named(dish.name) || t("untitledDish")}
        {missingTranslation(dish) && <span className="ml-2 text-xs text-amber-900">{t("missingTranslation")}</span>}
      </summary>
      <div className="grid grid-cols-2 gap-3">
        {dishLanguages.map((language) => (
          <div key={language} className="min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t(language)}</p>
            <Field label={t("name")} aria-label={t(language === "am" ? "dishNameAm" : "dishNameEn")}
              lang={language} value={dish.name[language]}
              onChange={(event) => onChange({ name: { ...dish.name, [language]: event.target.value } })} />
            <label className="mt-3 block text-sm font-medium">
              {t("description")}
              <textarea
                aria-label={t(language === "am" ? "descriptionAm" : "descriptionEn")}
                lang={language}
                value={dish.description[language]}
                onChange={(event) => onChange({ description: { ...dish.description, [language]: event.target.value } })}
                className="mt-1 min-h-20 w-full rounded-md border border-ink/30 bg-white p-2 text-base font-normal"
              />
            </label>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-x-4">
        <Field label={t("price")} type="number" min="0" max="21474836.47" step="0.01" inputMode="decimal" required
          defaultValue={dish.priceSantim / 100}
          className="max-w-40"
          onChange={(event) => {
            if (event.target.validity.valid) onChange({ priceSantim: Math.round(event.target.valueAsNumber * 100) });
          }} />
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={dish.fasting} onChange={(event) => onChange({ fasting: event.target.checked })} className="size-5 accent-ink" />
          {t("fasting")}
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={dish.houseFavourite} disabled={!dish.photoUrl}
            onChange={(event) => onFavourite(event.target.checked)} className="size-5 accent-ink" />
          {t("houseFavourite")}
        </label>
      </div>
      {!dish.photoUrl && <p className="mt-1 text-xs text-ink-muted">{t("needsPhoto")}</p>}
      <div className="mt-3 flex gap-2 pb-3">
        <MoveButtons index={index} count={count} onMove={onMove} />
      </div>
    </details>
  );
}

function PreviewLanguages({ selectLanguage }: { selectLanguage: (language: Language) => void }) {
  const t = useTranslations("LanguageSwitch");
  const current = useLocale();
  return (
    <div role="group" aria-label={t("label")} className="flex font-system">
      {dishLanguages.map((language) => (
        <button key={language} type="button" lang={language} aria-pressed={language === current}
          className={languageButtonClass} onClick={() => selectLanguage(language)}>
          {t(language)}
        </button>
      ))}
    </div>
  );
}
