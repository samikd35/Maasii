"use client";

import { NextIntlClientProvider, useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import type { Bilingual, GuestMenu, Language, MenuDraft, MenuDraftContent } from "@/core";
import { localizeMenuSections } from "@/core/browser";
import type { Messages } from "@/i18n/messages";
import { Price } from "@/ui/price";
import { Field } from "@/ui/field";
import { GuestMenuView } from "@/ui/guest-menu-view";
import { languageButtonClass } from "@/ui/language-switch";
import { ConfirmationDialog } from "@/ui/staff-forms";
import { Ordering } from "@/app/v/[token]/ordering";
import { persistMenuDraft, prepareDishPhoto, prepareDishVideo, requestMenuAssistance } from "./actions";

type Section = MenuDraftContent["sections"][number];
type Dish = Section["dishes"][number];
type OptionGroup = Dish["optionGroups"][number];
type ArchivedDish = MenuDraftContent["archivedDishes"][number];
type Artwork = { accept: string; maxFileBytes: number };
type GuestMessages = Pick<Messages, "GuestMenu" | "LanguageSwitch" | "Ordering" | "Price">;

const emptyText = { en: "", am: "" };
const editorButton = "min-h-11 min-w-11 rounded-xl border border-ink/30 px-3 text-sm font-medium disabled:opacity-45";
const panelTabs = ["edit", "preview"] as const;
const dishLanguages = ["am", "en"] as const;

function named(name: Bilingual) {
  return name.am.trim() || name.en.trim();
}

function missingName({ am, en }: Bilingual) {
  return !am.trim() || !en.trim();
}

function canSuggest({ am, en }: Bilingual) {
  return Boolean(am.trim()) !== Boolean(en.trim());
}

function missingTranslation({ name, description, optionGroups }: Dish) {
  return missingName(name) || canSuggest(description)
    || optionGroups.some((group) => missingName(group.name) || group.choices.some((choice) => missingName(choice.name)));
}

function move<T>(items: T[], index: number, step: number) {
  const reordered = [...items];
  [reordered[index], reordered[index + step]] = [reordered[index + step], reordered[index]];
  return reordered;
}

export function MenuEditor({
  initialDraft,
  recoveryKey,
  theme,
  guestMessages,
  artwork,
  maxImportPhotos,
  venue,
}: {
  initialDraft: MenuDraft;
  recoveryKey: string;
  theme: GuestMenu["theme"];
  guestMessages: Record<Language, GuestMessages>;
  artwork: Artwork;
  maxImportPhotos: number;
  venue?: {
    inherited: Section[];
    missing: number;
    persist: (revision: string | null, menu: MenuDraftContent, publish: boolean, inherit: string[]) =>
      Promise<{ draft?: MenuDraft; error?: keyof Messages["StaffErrors"] }>;
    upload: (form: FormData) => ReturnType<typeof prepareDishPhoto>;
    uploadVideo: (form: FormData) => ReturnType<typeof prepareDishVideo>;
  };
}) {
  const t = useTranslations("MenuEditor");
  const errors = useTranslations("StaffErrors");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [recovery, setRecovery] = useState<{ menu: MenuDraftContent; revision: string | null; inherit: string[] }>();
  const [recoveryUnavailable, setRecoveryUnavailable] = useState(false);
  const recoveryLoaded = useRef(false);
  const recoveryPending = useRef(false);
  const leaveDialog = useRef<HTMLDialogElement>(null);
  const publishDialog = useRef<HTMLDialogElement>(null);
  const leaveHref = useRef<string | undefined>(undefined);
  const leaveAfterSave = useRef(false);
  const leaveBack = useRef(false);
  const historyGuard = useRef<string | undefined>(undefined);
  const leaveForm = useRef<{ form: HTMLFormElement; submitter: HTMLElement | null } | undefined>(undefined);
  const bypassGuard = useRef(false);
  const [saved, setSaved] = useState(initialDraft);
  const [menu, setMenu] = useState(initialDraft.menu);
  const [tab, setTab] = useState<(typeof panelTabs)[number]>("edit");
  const [previewLanguage, setPreviewLanguage] = useState<Language>(locale);
  const [openedDish, setOpenedDish] = useState<string>();
  const [status, setStatus] = useState<"saved" | "published" | "menuImported" | "translationSuggested">();
  const importInput = useRef<HTMLInputElement>(null);
  const [importCount, setImportCount] = useState(0);
  const [error, setError] = useState<keyof Messages["StaffErrors"]>();
  const errorNotice = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorNotice.current?.focus({ preventScroll: true }); }, [error]);
  const [saving, startTransition] = useTransition();
  const [aiPending, startAiTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const pending = saving || aiPending || uploading;
  const [inherit, setInherit] = useState<string[]>([]);
  const [priceReset, setPriceReset] = useState<Record<string, number>>({});
  const dirty = inherit.length > 0 || (menu !== saved.menu && JSON.stringify(menu) !== JSON.stringify(saved.menu));
  /* eslint-disable react-hooks/set-state-in-effect -- Browser recovery is read after hydration; it is not derived React state. */
  useEffect(() => {
    if (recoveryLoaded.current) return;
    recoveryLoaded.current = true;
    try {
      const raw = sessionStorage.getItem(recoveryKey);
      if (raw) {
        const snapshot = JSON.parse(raw);
        if (Array.isArray(snapshot.menu?.sections) && Array.isArray(snapshot.menu?.archivedDishes) && Array.isArray(snapshot.inherit)) { recoveryPending.current = true; setRecovery(snapshot); }
      }
    } catch { setRecoveryUnavailable(true); }
  }, [recoveryKey]);
  useEffect(() => {
    if (!recoveryLoaded.current || recoveryPending.current || recovery) return;
    try {
      if (dirty) sessionStorage.setItem(recoveryKey, JSON.stringify({ menu, revision: saved.revision, inherit }));
      else sessionStorage.removeItem(recoveryKey);
    } catch { setRecoveryUnavailable(true); }
  }, [dirty, menu, saved.revision, inherit, recovery, recoveryKey]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!dirty) return;
    const guard = crypto.randomUUID();
    historyGuard.current = guard;
    if (history.state?.maasiiEditor) history.replaceState({ ...history.state, maasiiEditor: guard }, "");
    else history.pushState({ ...history.state, maasiiEditor: guard }, "");
    const back = (event: PopStateEvent) => {
      if (bypassGuard.current) return;
      event.stopImmediatePropagation();
      if (history.state?.maasiiEditor === guard) { leaveBack.current = false; leaveDialog.current?.close(); return; }
      leaveBack.current = true;
      leaveHref.current = undefined;
      leaveForm.current = undefined;
      leaveDialog.current?.showModal();
    };
    const submitElsewhere = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement;
      if (bypassGuard.current || form.closest("#brand-menu-editor")) return;
      event.preventDefault(); event.stopPropagation();
      leaveHref.current = undefined;
      leaveForm.current = { form, submitter: event.submitter };
      leaveAfterSave.current = false;
      leaveDialog.current?.showModal();
    };
    const unload = (event: BeforeUnloadEvent) => { if (!bypassGuard.current) event.preventDefault(); };
    const navigate = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
      if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || link.target === "_blank" || link.href === location.href) return;
      if (link.origin === location.origin && link.pathname === location.pathname && link.search === location.search && link.hash) return;
      event.preventDefault(); event.stopPropagation();
      leaveAfterSave.current = false;
      leaveForm.current = undefined;
      leaveHref.current = link.href;
      leaveDialog.current?.showModal();
    };
    window.addEventListener("popstate", back, true);
    document.addEventListener("submit", submitElsewhere, true);
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("popstate", back, true);
      document.removeEventListener("submit", submitElsewhere, true);
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
      if (!bypassGuard.current && history.state?.maasiiEditor === guard) history.back();
    };
  }, [dirty]);
  function leave() {
    bypassGuard.current = true;
    try { sessionStorage.removeItem(recoveryKey); } catch {}
    if (leaveBack.current) history.back();
    else if (leaveForm.current) leaveForm.current.form.requestSubmit(leaveForm.current.submitter ?? undefined);
    else if (leaveHref.current) location.replace(leaveHref.current);
  }
  function stay() {
    if (leaveBack.current) history.pushState({ ...history.state, maasiiEditor: historyGuard.current }, "");
    leaveBack.current = false;
    leaveAfterSave.current = false;
    leaveDialog.current?.close();
  }
  const inherited = new Map(venue?.inherited.flatMap((section) => section.dishes.map((dish) => [dish.dishId, dish] as const)));
  const inheritedSections = new Set(venue?.inherited.map((s) => s.sectionId));
  const needsReview = menu.sections.some((section) => section.imported || section.suggestedName || section.dishes.some(
    (dish) => dish.imported || dish.suggestedName || dish.suggestedDescription,
  ));
  const needsTranslation = menu.sections.flatMap(({ dishes }) => dishes).filter(missingTranslation).length;

  function changeSections(sections: Section[], archivedDishes = menu.archivedDishes) {
    setMenu({ sections, archivedDishes });
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

  function archiveDish(section: Section, dish: Dish) {
    setOpenedDish(undefined);
    changeSections(menu.sections.map((candidate) => candidate.sectionId === section.sectionId
      ? { ...section, dishes: section.dishes.filter(({ dishId }) => dishId !== dish.dishId) }
      : candidate), [...menu.archivedDishes, { sectionId: section.sectionId, sectionName: section.name, dish }]);
  }

  function restoreDish({ sectionId, sectionName, dish }: ArchivedDish) {
    const hasFavourite = menu.sections.some((section) => section.dishes.some((candidate) => candidate.houseFavourite));
    const restored = { ...dish, houseFavourite: dish.houseFavourite && !hasFavourite };
    const sections = menu.sections.some((section) => section.sectionId === sectionId)
      ? menu.sections.map((section) => section.sectionId === sectionId ? { ...section, dishes: [...section.dishes, restored] } : section)
      : [...menu.sections, { sectionId, name: sectionName, dishes: [restored] }];
    changeSections(sections, menu.archivedDishes.filter((entry) => entry.dish.dishId !== dish.dishId));
    setOpenedDish(dish.dishId);
  }

  async function uploadPhoto(file: File, onUploaded: (photoUrl: string) => void): Promise<keyof Messages["StaffErrors"] | undefined> {
    if (file.size > artwork.maxFileBytes) return "invalidBrandArtwork";
    const form = new FormData(); form.set("photo", file);
    setUploading(true);
    try {
      const result = await (venue ? venue.upload(form) : prepareDishPhoto(saved.brand.id, form));
      if (!result.photoUrl) return result.error ?? "invalid_input";
      onUploaded(result.photoUrl);
    } catch { return "menuRequestFailed"; }
    finally { setUploading(false); }
  }

  async function uploadVideo(file: File, onUploaded: (videoAssetId: string) => void): Promise<keyof Messages["StaffErrors"] | undefined> {
    if (file.size > 1024 * 1024 || file.type !== "video/mp4") return "invalidDishVideo";
    const form = new FormData(); form.set("video", file);
    setUploading(true);
    try {
      const result = await (venue ? venue.uploadVideo(form) : prepareDishVideo(saved.brand.id, form));
      if (!result.videoAssetId) return result.error ?? "invalidDishVideo";
      onUploaded(result.videoAssetId);
    } catch { return "menuRequestFailed"; }
    finally { setUploading(false); }
  }

  function requestAi(request: Parameters<typeof requestMenuAssistance>[3]) {
    setError(undefined);
    setStatus(undefined);
    startAiTransition(async () => {
      try {
        const result = await requestMenuAssistance(saved.brand.id, saved.revision, menu, request);
        if (result.draft) {
          setSaved(result.draft);
          setMenu(result.draft.menu);
          setStatus(request instanceof FormData ? "menuImported" : "translationSuggested");
          if (request instanceof FormData && importInput.current) {
            importInput.current.value = "";
            setImportCount(0);
          }
        } else {
          leaveAfterSave.current = false;
          setError(result.error ?? "invalid_input");
        }
      } catch {
        setError("menuAiRequestFailed");
      }
    });
  }

  function importPhotos() {
    const photos = Array.from(importInput.current?.files ?? []);
    if (photos.length === 0 || photos.length > maxImportPhotos || photos.some((photo) => photo.size > artwork.maxFileBytes)) {
      setError("menuAiPhotos");
      return;
    }
    const form = new FormData();
    for (const photo of photos) form.append("photos", photo);
    requestAi(form);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dirty && !pending) persist(false);
  }

  function persist(publish: boolean) {
    setError(undefined);
    setStatus(undefined);
    startTransition(async () => {
      try {
        const result = await (venue
          ? venue.persist(saved.revision, menu, publish, inherit)
          : persistMenuDraft(saved.brand.id, saved.revision, menu, publish));
        if (result.draft) {
          setSaved(result.draft);
          setMenu(result.draft.menu);
          setInherit([]);
          setStatus(publish ? "published" : "saved");
          if (leaveAfterSave.current) leave();
        } else {
          leaveAfterSave.current = false;
          setError(result.error ?? "invalid_input");
        }
      } catch {
        setError("menuRequestFailed");
      }
    });
  }

  const previewSections = localizeMenuSections(menu.sections
    .filter((section) => named(section.name))
    .map((section) => ({
      ...section,
      dishes: section.dishes.filter((dish) => named(dish.name)).map((dish) => ({
        ...dish,
        optionGroups: dish.optionGroups.filter((group) => named(group.name))
          .map((group) => ({ ...group, choices: group.choices.filter((choice) => named(choice.name)) }))
          .filter((group) => group.choices.length > 0),
      })),
    })), previewLanguage);
  const previewDishes = previewSections.flatMap((section) => section.dishes);
  const favouriteId = menu.sections.flatMap(({ dishes }) => dishes).find((dish) => dish.houseFavourite)?.dishId;
  const lastPublish = saved.lastPublishedAt && new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Addis_Ababa",
  }).format(saved.lastPublishedAt);
  const publishTitle = venue ? t("publishVenue", { venue: saved.venueName ?? saved.brand.name }) : t("publishBrand");

  return (
    <div id="brand-menu-editor">
      <dialog ref={leaveDialog} onCancel={event => { event.preventDefault(); stay(); }} className="maasii-card max-w-md" aria-labelledby="leave-editor-title">
        <h2 id="leave-editor-title" className="text-xl font-semibold">{t("unsavedChanges")}</h2><p className="my-4">{t("leaveHelp")}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={editorButton} onClick={() => { leaveAfterSave.current = true; leaveDialog.current?.close(); (document.getElementById("menu-editor-fields") as HTMLFormElement).requestSubmit(); }}>{t("saveAndLeave")}</button>
          <button type="button" className={editorButton} onClick={leave}>{t("discardAndLeave")}</button>
          <button type="button" className={editorButton} onClick={stay}>{t("stay")}</button>
        </div>
      </dialog>
      <ConfirmationDialog dialog={publishDialog} title={publishTitle} cancel={t("cancelPublish")} onConfirm={() => {
        publishDialog.current?.close();
        if (!dirty && !pending && !needsReview && saved.hasUnpublishedChanges) persist(true);
      }}>
        {venue ? t("publishVenueHelp", { venue: saved.venueName ?? saved.brand.name }) : t("publishBrandHelp", { brand: saved.brand.name })}
      </ConfirmationDialog>
      {recovery && <section className="maasii-card mb-4" role="status"><h2 className="font-semibold">{t("recoveryFound")}</h2>
        <p>{t(recovery.revision === saved.revision ? "recoveryHelp" : "recoveryConflict")}</p>
        <button type="button" className={editorButton} onClick={() => { setMenu(recovery.menu); setInherit(recovery.inherit); setSaved(previous => ({ ...previous, revision: recovery.revision })); recoveryPending.current = false; setRecovery(undefined); }}>{t("restoreDraft")}</button>
        <button type="button" className={editorButton} onClick={() => { try { sessionStorage.removeItem(recoveryKey); } catch {} recoveryPending.current = false; setRecovery(undefined); }}>{t("discardRecovery")}</button>
      </section>}
      {recoveryUnavailable && <p role="status">{t("recoveryUnavailable")}</p>}
      <div className="mb-4">
          <h1 className="font-sans text-3xl">{venue ? t("venueHeading", { venue: saved.venueName ?? "" }) : t("heading", { brand: saved.brand.name })}</h1>
          <p className="mt-1 text-sm text-ink-muted">{lastPublish ? t("lastPublish", { date: lastPublish }) : t("neverPublished")}</p>
      </div>
      <header className="editor-actions">
        <div className="workspace-actions">
          <p className="text-sm font-semibold">{t(dirty ? "unsavedChanges" : saved.hasUnpublishedChanges ? "draftPrivate" : "upToDate")}</p>
          {!dirty && saved.hasUnpublishedChanges ? (
            <button type="button" disabled={pending || needsReview} className="workspace-button workspace-primary"
              onClick={() => publishDialog.current?.showModal()}>{t("reviewPublish")}</button>
          ) : (
            <button type="submit" form="menu-editor-fields" value="save" disabled={!dirty || pending} className="workspace-button workspace-primary">{t("save")}</button>
          )}
        </div>
        {needsReview && <p className="w-full text-sm font-medium text-amber-900">{t("reviewBeforePublish")}</p>}
        {needsTranslation > 0 && <p className="w-full text-sm font-medium text-amber-900">{t("translationCount", { count: needsTranslation })}</p>}
        {!!venue?.missing && <p className="w-full text-sm text-ink-muted">{t("missingBrandDishes", { count: venue.missing })}</p>}
        <div className="w-full empty:hidden" aria-live="polite">
          {aiPending && <p className="text-sm text-ink-muted">{t("requestingAssistance")}</p>}
          {status && <p className="text-sm text-ink-muted">{t(status)}</p>}
          {error && <p role="alert" tabIndex={-1} ref={errorNotice} className="text-sm font-medium text-red-800">{errors(error)}</p>}
          {error === "menuDraftChanged" && <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className={editorButton} onClick={() => window.open(location.href, "_blank", "noopener")}>{t("compareLatest")}</button>
            <button type="button" className={editorButton} onClick={() => {
              if (!window.confirm(t("reloadConfirm"))) return;
              bypassGuard.current = true;
              try { sessionStorage.removeItem(recoveryKey); } catch {}
              location.reload();
            }}>{t("reloadLatest")}</button>
          </div>}
        </div>
      </header>
        <div role="tablist" aria-label={t("nav")} className="mt-3 grid w-full grid-cols-2 gap-2 lg:hidden">
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
            <label hidden={!!openedDish} className="mb-5 block"><span className="text-sm font-semibold">{t("findDish")}</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-ink/30 bg-white px-4" /></label>
            <form id="menu-editor-fields" onSubmit={submit} onInvalid={(event) => {
              setTab("edit"); setQuery("");
              const target = event.target as HTMLElement;
              const dish = target.closest<HTMLElement>("[data-edit-dish]");
              if (dish?.dataset.editDish) setOpenedDish(dish.dataset.editDish);
              let parent = target.parentElement;
              while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; }
              requestAnimationFrame(() => target.focus());
            }}>
              <fieldset disabled={pending} className="space-y-5">
                {openedDish && <button type="button" className={editorButton} onClick={() => {
                  if (!(document.getElementById("menu-editor-fields") as HTMLFormElement).reportValidity()) return;
                  const previous = openedDish; setOpenedDish(undefined);
                  requestAnimationFrame(() => document.getElementById(`edit-${previous}`)?.focus());
                }}>{t("backToDishes")}</button>}
                <div hidden={!!openedDish} className="editor-maintenance">
                {!venue && <details className="maasii-card"><summary className="min-h-11 font-semibold">{t("importPhotos")}</summary>
                  <p id="menu-import-help" className="text-sm text-ink-muted">{t("importHelp", { count: maxImportPhotos })}</p>
                  <Field ref={importInput} label={t("menuPhotos")} type="file" accept={artwork.accept} multiple
                    aria-describedby="menu-import-help" onChange={(event) => setImportCount(event.currentTarget.files?.length ?? 0)} />
                  <button type="button" className={editorButton} disabled={importCount === 0} onClick={importPhotos}>
                    {t("importPhotos")}
                  </button>
                </details>}
                <button type="button" className={editorButton} onClick={() => changeSections([
                  ...menu.sections,
                  { sectionId: crypto.randomUUID(), name: emptyText, dishes: [] },
                ])}>
                  {t("addSection")}
                </button>
                </div>
                {menu.sections.map((section, sectionIndex) => (
                  <fieldset key={section.sectionId} hidden={!!openedDish && !section.dishes.some(dish => dish.dishId === openedDish)} className="editor-section min-w-0">
                    <legend className="text-lg font-semibold">{section.name[locale] || named(section.name) || t("section", { number: sectionIndex + 1 })}</legend>
                    <details hidden={!!openedDish} className="editor-maintenance"><summary className="min-h-11 font-semibold">{t("sectionSettings")}</summary>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {dishLanguages.map((language) => {
                        const label = t(language === "am" ? "sectionAm" : "sectionEn");
                        return (
                          <div key={language}>
                            <Field label={label} lang={language} value={section.name[language]} readOnly={inheritedSections.has(section.sectionId)}
                              onChange={(event) => updateSection(sectionIndex, {
                                name: { ...section.name, [language]: event.target.value },
                                suggestedName: section.suggestedName === language ? undefined : section.suggestedName,
                              })} />
                            {section.suggestedName === language && <SuggestionReview label={label}
                              onAccept={() => updateSection(sectionIndex, { suggestedName: undefined })} />}
                          </div>
                        );
                      })}
                    </div>
                    {section.imported && <ImportReview kind="section"
                      onKeep={() => updateSection(sectionIndex, { imported: undefined })}
                      onDiscard={() => changeSections(menu.sections.filter((_, i) => i !== sectionIndex))} />}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {!venue && canSuggest(section.name) && <button type="button" className={editorButton}
                        onClick={() => requestAi({ sectionId: section.sectionId })}>{t("suggestTranslation")}</button>}
                      {!venue && <MoveButtons index={sectionIndex} count={menu.sections.length} onMove={(step) => changeSections(move(menu.sections, sectionIndex, step))} />}
                      {!section.imported && !inheritedSections.has(section.sectionId) && (!venue || !section.dishes.length) && <button type="button" className={editorButton}
                        onClick={() => changeSections(menu.sections.filter((_, i) => i !== sectionIndex))}>
                        {t("removeSection")}
                      </button>}
                    </div>
                    </details>
                    <div className="mt-4 space-y-3">
                      {section.dishes.map((dish, dishIndex) => (
                        <div key={dish.dishId} hidden={(!!openedDish && openedDish !== dish.dishId) || (!openedDish && !!query && !`${dish.name.am} ${dish.name.en} ${dish.description.am} ${dish.description.en}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))}>
                        <DishFields
                          dish={dish}
                          priceReset={priceReset[dish.dishId]}
                          open={openedDish === dish.dishId}
                          onOpen={() => setOpenedDish(dish.dishId)}
                          scope={venue ? t(!inherited.has(dish.dishId) ? "localDish" : inherit.includes(dish.dishId) ? "restorePreview" : JSON.stringify(dish) === JSON.stringify(inherited.get(dish.dishId)) ? "matchesBrand" : "localOverride") : undefined}
                          index={dishIndex}
                          count={section.dishes.length}
                          acceptArtwork={artwork.accept}
                          onChange={(patch) => updateSection(sectionIndex, {
                            dishes: section.dishes.map((candidate, i) => i === dishIndex ? { ...candidate, ...patch } : candidate),
                          })}
                          onMove={venue ? undefined : (step) => updateSection(sectionIndex, { dishes: move(section.dishes, dishIndex, step) })}
                          onFavourite={(checked) => setFavourite(dish.dishId, checked)}
                          onArchive={() => archiveDish(section, dish)}
                          onDiscardImport={() => { setOpenedDish(undefined); updateSection(sectionIndex, {
                            dishes: section.dishes.filter((candidate) => candidate.dishId !== dish.dishId),
                          }); }}
                          onSuggest={venue ? undefined : () => requestAi({ sectionId: section.sectionId, dishId: dish.dishId })}
                          onInherit={inherited.has(dish.dishId) ? () => {
                            updateSection(sectionIndex, { dishes: section.dishes.map((current) =>
                              current.dishId === dish.dishId ? inherited.get(dish.dishId)! : current) });
                            setInherit((ids) => [...new Set([...ids, dish.dishId])]);
                            setOpenedDish(dish.dishId);
                            setPriceReset((keys) => ({ ...keys, [dish.dishId]: (keys[dish.dishId] ?? 0) + 1 }));
                          } : undefined}
                          onVideo={(file) => uploadVideo(file, (videoAssetId) => updateSection(sectionIndex, {
                            dishes: section.dishes.map(candidate => candidate.dishId === dish.dishId ? { ...candidate, videoAssetId } : candidate),
                          }))}
                          onPhoto={(file) => uploadPhoto(file, (photoUrl) => updateSection(sectionIndex, {
                            dishes: section.dishes.map((candidate) => candidate.dishId === dish.dishId ? { ...candidate, photoUrl } : candidate),
                          }))}
                        /></div>
                      ))}
                    </div>
                    <button type="button" hidden={!!openedDish} className={`${editorButton} mt-4`} onClick={() => {
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
                {!openedDish && menu.archivedDishes.length > 0 && (
                  <section className="rounded-xl border border-rule bg-white/35 p-4">
                    <h2 className="font-semibold">{t("archivedDishes")}</h2>
                    <ul className="mt-2 divide-y divide-rule">
                      {menu.archivedDishes.map((entry) => (
                        <li key={entry.dish.dishId} className="py-2">
                          <button type="button" className={editorButton} onClick={() => restoreDish(entry)}>
                            {t("restoreDish", { dish: entry.dish.name[locale].trim() || named(entry.dish.name) || t("untitledDish") })}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </fieldset>
            </form>
          </section>
        </div>
        <div id="menu-preview-panel" role="tabpanel" aria-labelledby="menu-preview-tab" className={tab === "preview" ? "min-w-0" : "hidden min-w-0 lg:block"}>
          <section aria-label={t("previewLabel")} className="overflow-clip rounded-xl border border-rule bg-paper lg:sticky lg:top-0 lg:max-h-dvh lg:overflow-y-auto">
            <p className="border-b border-rule bg-paper-deep px-5 py-2 text-sm font-semibold">{t("draft")}</p>
            <NextIntlClientProvider locale={previewLanguage} messages={guestMessages[previewLanguage]}>
              <div lang={previewLanguage}>
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
              </div>
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

function SuggestionReview({ label, onAccept }: { label: string; onAccept: () => void }) {
  const t = useTranslations("MenuEditor");
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-amber-900">{t("suggested")}</span>
      <button type="button" className={editorButton} aria-label={t("acceptSuggestionFor", { field: label })}
        onClick={onAccept}>{t("acceptSuggestion")}</button>
    </div>
  );
}

function ImportReview({ kind, missingPrice, onKeep, onDiscard }: {
  kind: "section" | "dish";
  missingPrice?: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  const t = useTranslations("MenuEditor");
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <p className="w-full text-sm font-medium text-amber-900">{t("imported")}</p>
      {missingPrice && <p className="w-full text-sm text-ink-muted">{t("importPriceMissing")}</p>}
      <button type="button" className={editorButton} disabled={missingPrice} onClick={onKeep}>
        {t(kind === "section" ? "keepSection" : "keepDish")}
      </button>
      <button type="button" className={editorButton} onClick={onDiscard}>
        {t(kind === "section" ? "discardSection" : "discardDish")}
      </button>
    </div>
  );
}

function DishFields({ dish, open, onOpen, scope, priceReset, index, count, acceptArtwork, onChange, onMove, onFavourite, onArchive, onDiscardImport, onSuggest, onInherit, onPhoto, onVideo }: {
  dish: Dish;
  open: boolean;
  onOpen: () => void;
  scope?: string;
  priceReset?: number;
  index: number;
  count: number;
  acceptArtwork: string;
  onChange: (patch: Partial<Dish>) => void;
  onMove?: (step: number) => void;
  onFavourite: (checked: boolean) => void;
  onArchive: () => void;
  onDiscardImport: () => void;
  onSuggest?: () => void;
  onInherit?: () => void;
  onPhoto: (file: File) => Promise<keyof Messages["StaffErrors"] | undefined>;
  onVideo: (file: File) => Promise<keyof Messages["StaffErrors"] | undefined>;
}) {
  const t = useTranslations("MenuEditor");
  const locale = useLocale();
  const errors = useTranslations("StaffErrors");
  const [upload, setUpload] = useState<{ file: File; kind: "photo" | "video"; pending?: boolean; error?: keyof Messages["StaffErrors"] }>();
  async function sendFile(file: File, kind: "photo" | "video") {
    setUpload({ file, kind, pending: true });
    const error = await (kind === "photo" ? onPhoto(file) : onVideo(file));
    setUpload({ file, kind, error });
    requestAnimationFrame(() => document.getElementById(`${kind}-status-${dish.dishId}`)?.scrollIntoView({ block: "nearest" }));
  }
  function uploadStatus(kind: "photo" | "video") {
    return upload?.kind === kind && <div id={`${kind}-status-${dish.dishId}`} className={`mt-2 text-sm ${upload.error ? "text-red-800" : "text-ink-muted"}`} role={upload.error ? "alert" : "status"}>
      <p className="break-words">{upload.file.name}: {upload.pending ? t("uploading") : upload.error ? errors(upload.error) : t("uploadedDraft")}</p>
      {upload.error && <button type="button" className={editorButton} onClick={() => void sendFile(upload.file, kind)}>{t("retryUpload")}</button>}
    </div>;
  }
  return (
    <details data-edit-dish={dish.dishId} open={open} className="min-w-0 editor-dish">
      <summary id={`edit-${dish.dishId}`} className="flex min-h-14 cursor-pointer items-center justify-between gap-3 py-3 font-medium" onClick={event => { event.preventDefault(); onOpen(); }}>
        <span><span>{dish.name[locale].trim() || named(dish.name) || t("untitledDish")}</span>
          {scope && <small className="block text-ink-muted">{scope}</small>}
          {dish.imported && <small className="block text-amber-900">{t("imported")}</small>}
          {missingTranslation(dish) && <small className="block text-amber-900">{t("missingTranslation")}</small>}
        </span>
        <Price santim={dish.priceSantim} />
      </summary>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {dishLanguages.map((language) => (
          <div key={language} className="min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t(language)}</p>
            <Field label={t("name")} aria-label={t(language === "am" ? "dishNameAm" : "dishNameEn")}
              lang={language} value={dish.name[language]}
              onChange={(event) => onChange({
                name: { ...dish.name, [language]: event.target.value },
                suggestedName: dish.suggestedName === language ? undefined : dish.suggestedName,
              })} />
            {dish.suggestedName === language && <SuggestionReview label={t(language === "am" ? "dishNameAm" : "dishNameEn")}
              onAccept={() => onChange({ suggestedName: undefined })} />}
          </div>
        ))}
      </div>
      {onSuggest && (canSuggest(dish.name) || canSuggest(dish.description)) && <button type="button"
        className={`${editorButton} mt-3`} onClick={onSuggest}>{t("suggestTranslation")}</button>}
      <div className="mt-3 flex flex-wrap items-end gap-x-4">
        <Field key={priceReset} label={t("price")} type="number" min="0" max="21474836.47" step="0.01" inputMode="decimal"
          required={dish.imported !== "missing_price"} defaultValue={dish.imported === "missing_price" ? "" : dish.priceSantim / 100}
          className="max-w-40"
          onChange={(event) => {
            if (event.target.validity.valid && event.target.value !== "") {
              onChange({ priceSantim: Math.round(event.target.valueAsNumber * 100), imported: dish.imported && "review" });
            }
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
      <div className="mt-3 flex flex-wrap items-center gap-3">
      {dish.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dish.photoUrl} alt="" loading="lazy" decoding="async" className="size-20 rounded-xl object-cover" />
        )}
        <input id={`photo-${dish.dishId}`} type="file" accept={acceptArtwork} className="peer sr-only" aria-invalid={upload?.kind === "photo" && !!upload.error} aria-describedby={`photo-status-${dish.dishId}`} onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void sendFile(file, "photo");
        }} />
        <label htmlFor={`photo-${dish.dishId}`} className={`${editorButton} inline-flex cursor-pointer items-center peer-focus-visible:outline-2`}>
          {t(dish.photoUrl ? "replacePhoto" : "uploadPhoto")}
        </label>
        {dish.photoUrl && (
          <button type="button" className={editorButton} onClick={() => onChange({ photoUrl: undefined, houseFavourite: false })}>
            {t("removePhoto")}
          </button>
        )}
      </div>
      {uploadStatus("photo")}
      <details className="mt-4"><summary className="min-h-11 font-semibold">{t("description")}</summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{dishLanguages.map(language => <div key={language}>
            <label className="mt-3 block text-sm font-medium">
              {t("description")}
              <textarea
                aria-label={t(language === "am" ? "descriptionAm" : "descriptionEn")}
                lang={language}
                value={dish.description[language]}
                onChange={(event) => onChange({
                  description: { ...dish.description, [language]: event.target.value },
                  suggestedDescription: dish.suggestedDescription === language ? undefined : dish.suggestedDescription,
                })}
                className="mt-1 min-h-20 w-full rounded-xl border border-ink/30 bg-white p-2 text-base font-normal"
              />
            </label>
            {dish.suggestedDescription === language && <SuggestionReview label={t(language === "am" ? "descriptionAm" : "descriptionEn")}
              onAccept={() => onChange({ suggestedDescription: undefined })} />}

        </div>)}</div>
      </details>
        <details className="mt-4"><summary className="min-h-11 font-semibold">{t("servingVideo")}</summary>
        <Field label={t("servingVideo")} type="file" accept="video/mp4" aria-invalid={upload?.kind === "video" && !!upload.error} aria-describedby={`video-status-${dish.dishId}`} onChange={event => { const file = event.target.files?.[0]; if (file) void sendFile(file, "video"); event.target.value = ""; }} />
        <p className="mt-2 text-sm text-ink-muted">{t("videoHelp")}</p>
        {dish.videoAssetId && <><video src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/dish-videos/${dish.videoAssetId}.mp4`} poster={dish.photoUrl} muted playsInline controls preload="metadata" className="mt-3 max-h-60 w-full rounded-xl" />
          <button type="button" className={editorButton} onClick={() => onChange({ videoAssetId: undefined })}>{t("removeVideo")}</button></>}
      {uploadStatus("video")}
      </details>
      <details className="mt-5"><summary className="min-h-11 font-semibold">{t("optionGroups")} ({dish.optionGroups.length})</summary>
      <fieldset className="min-w-0 space-y-3">
        <legend className="text-sm font-semibold">{t("optionGroups")}</legend>
        {dish.optionGroups.map((group, groupIndex) => (
          <OptionGroupFields key={group.optionGroupId} group={group} index={groupIndex} count={dish.optionGroups.length}
            onChange={(patch) => onChange({
              optionGroups: dish.optionGroups.map((entry, i) => i === groupIndex ? { ...entry, ...patch } : entry),
            })}
            onMove={(step) => onChange({ optionGroups: move(dish.optionGroups, groupIndex, step) })}
            onRemove={() => onChange({ optionGroups: dish.optionGroups.filter((_, i) => i !== groupIndex) })}
          />
        ))}
        <button type="button" className={editorButton} onClick={() => onChange({
          optionGroups: [...dish.optionGroups, {
            optionGroupId: crypto.randomUUID(), name: emptyText, kind: "choose_one", required: false, choices: [],
          }],
        })}>
          {t("addGroup")}
        </button>
      </fieldset></details>
      <details className="mt-3"><summary className="min-h-11 font-semibold">{t("dishSettings")}</summary>
      <div className="flex flex-wrap gap-2 pb-3">
        {onMove && <MoveButtons index={index} count={count} onMove={onMove} />}
        {onInherit && <button type="button" className={editorButton} onClick={onInherit}>{t("inheritDish")}</button>}
        {!dish.imported && <button type="button" className={editorButton} onClick={onArchive}>{t("archiveDish")}</button>}
      </div>
      </details>
      {dish.imported && <ImportReview kind="dish" missingPrice={dish.imported === "missing_price"}
        onKeep={() => onChange({ imported: undefined })} onDiscard={onDiscardImport} />}
    </details>
  );
}

function OptionGroupFields({ group, index, count, onChange, onMove, onRemove }: {
  group: OptionGroup;
  index: number;
  count: number;
  onChange: (patch: Partial<OptionGroup>) => void;
  onMove: (step: number) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("MenuEditor");
  const locale = useLocale();
  return (
    <fieldset className="min-w-0 space-y-3 rounded-xl border border-rule p-3">
      <legend className="px-2 text-sm font-semibold">{group.name[locale].trim() || named(group.name) || t("untitledGroup")}</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {dishLanguages.map((language) => (
          <Field key={language} label={t(language === "am" ? "groupNameAm" : "groupNameEn")} lang={language}
            value={group.name[language]} onChange={(event) => onChange({ name: { ...group.name, [language]: event.target.value } })} />
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-x-4">
        <label className="block text-sm font-medium">
          {t("groupKind")}
          <select value={group.kind} onChange={(event) => {
            const kind = event.target.value === "add_extras" ? "add_extras" : "choose_one";
            onChange({ kind, required: false });
          }} className="mt-1 block min-h-11 rounded-xl border border-ink/30 bg-white px-3 text-base font-normal">
            <option value="choose_one">{t("chooseOne")}</option>
            <option value="add_extras">{t("addExtras")}</option>
          </select>
        </label>
        {group.kind === "choose_one" && (
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={group.required} onChange={(event) => onChange({ required: event.target.checked })} className="size-5 accent-ink" />
            {t("groupRequired")}
          </label>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <MoveButtons index={index} count={count} onMove={onMove} />
        <button type="button" className={editorButton} onClick={onRemove}>{t("removeGroup")}</button>
      </div>
      {group.choices.map((choice, choiceIndex) => {
        function changeChoice(patch: Partial<OptionGroup["choices"][number]>) {
          onChange({ choices: group.choices.map((entry, i) => i === choiceIndex ? { ...entry, ...patch } : entry) });
        }
        return (
          <fieldset key={choice.choiceId} className="min-w-0 space-y-3 rounded-xl border border-rule p-3">
            <legend className="px-2 text-sm font-medium">{choice.name[locale].trim() || named(choice.name) || t("untitledChoice")}</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {dishLanguages.map((language) => (
                <Field key={language} label={t(language === "am" ? "choiceNameAm" : "choiceNameEn")} lang={language}
                  value={choice.name[language]} onChange={(event) => changeChoice({ name: { ...choice.name, [language]: event.target.value } })} />
              ))}
            </div>
            <Field label={t("priceChange")} type="number" min="0" max="21474836.47" step="0.01" inputMode="decimal"
              defaultValue={choice.priceChangeSantim ? choice.priceChangeSantim / 100 : ""}
              className="max-w-40"
              onChange={(event) => {
                if (event.target.validity.valid) changeChoice({
                  priceChangeSantim: event.target.value ? Math.round(event.target.valueAsNumber * 100) : 0,
                });
              }} />
            <div className="flex flex-wrap gap-2">
              <MoveButtons index={choiceIndex} count={group.choices.length} onMove={(step) => onChange({
                choices: move(group.choices, choiceIndex, step),
              })} />
              <button type="button" className={editorButton} onClick={() => onChange({
                choices: group.choices.filter((_, i) => i !== choiceIndex),
              })}>{t("removeChoice")}</button>
            </div>
          </fieldset>
        );
      })}
      <button type="button" className={editorButton} onClick={() => onChange({
        choices: [...group.choices, { choiceId: crypto.randomUUID(), name: emptyText, priceChangeSantim: 0 }],
      })}>{t("addChoice")}</button>
    </fieldset>
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
