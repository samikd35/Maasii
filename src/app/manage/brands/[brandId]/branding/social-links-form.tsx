"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import type { SocialLink } from "@/core";
import type { FormState } from "@/lib/session";
import { Field } from "@/ui/field";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";

const buttonClass = "min-h-11 rounded-md border border-ink/30 px-3 text-sm font-medium disabled:opacity-60";

export function SocialLinksForm({ links, limits, save }: {
  links: SocialLink[];
  limits: { entries: number; name: number; url: number };
  save: (state: FormState, form: FormData) => Promise<FormState>;
}) {
  const t = useTranslations("StaffSocialLinks");
  const id = useId();
  const nextId = useRef(links.length);
  const [rows, setRows] = useState(() => links.map((link, id) => ({ ...link, id })));

  function setField(rowId: number, field: keyof SocialLink, value: string) {
    setRows((current) => current.map((row) => row.id === rowId ? { ...row, [field]: value } : row));
  }

  function move(index: number, target: number) {
    setRows((current) => {
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function submit(state: FormState, form: FormData): Promise<FormState> {
    try {
      return await save(state, form);
    } catch {
      return { error: "menuRequestFailed" };
    }
  }

  return (
    <div className="mt-10 border-t border-rule pt-5">
      <h2 id={id} className="font-display text-2xl">{t("heading")}</h2>
      <p className="mt-1 text-sm text-ink-muted">{t("brandHelp")}</p>
      <ActionForm action={submit} aria-labelledby={id} className="mt-4 space-y-4">
        {!rows.length && <p className="text-sm text-ink-muted">{t("empty")}</p>}
        <p id={`${id}-help`} className="text-sm text-ink-muted">{t("urlHelp")}</p>
        {rows.map((row, index) => (
          <fieldset key={row.id} className="space-y-2 border-b border-rule pb-4">
            <legend className="font-semibold">{t("position", { position: index + 1 })}</legend>
            <Field name="socialName" label={t("name")} value={row.name} maxLength={limits.name} required
              onChange={(event) => setField(row.id, "name", event.currentTarget.value)} />
            <Field name="socialUrl" type="url" label={t("url")} value={row.url} maxLength={limits.url} required
              aria-describedby={`${id}-help`} autoCapitalize="none" autoCorrect="off" spellCheck={false}
              onChange={(event) => setField(row.id, "url", event.currentTarget.value)} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonClass} disabled={index === 0} onClick={() => move(index, index - 1)}>
                {t("moveUp", { position: index + 1 })}
              </button>
              <button type="button" className={buttonClass} disabled={index === rows.length - 1} onClick={() => move(index, index + 1)}>
                {t("moveDown", { position: index + 1 })}
              </button>
              <button type="button" className={buttonClass} onClick={() => setRows((current) => current.filter(({ id }) => id !== row.id))}>
                {t("remove", { position: index + 1 })}
              </button>
            </div>
          </fieldset>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass} disabled={rows.length >= limits.entries} onClick={() => {
            const id = nextId.current++;
            setRows((current) => [...current, { id, name: "", url: "" }]);
          }}>
            {t("add")}
          </button>
          <SubmitButton>{t("save")}</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
