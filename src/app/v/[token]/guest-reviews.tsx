"use client";

import { createTranslator, useLocale } from "next-intl";
import { useId, useState } from "react";
import type { GuestReviewForm } from "@/core";
import am from "../../../../messages/reviews.am.json";
import en from "../../../../messages/reviews.en.json";

const experience = ["great", "okay", "needs_work"] as const;
const parts = {
  visit: { ratings: experience, topics: ["food", "service", "wait_time", "paying"] },
  dish: { ratings: ["yes", "maybe", "no"], topics: ["taste", "portion", "temperature", "value"] },
  waiter: { ratings: experience, topics: ["service", "wait_time"] },
} as const;
const button = "min-h-11 rounded-lg border border-rule px-4 text-sm font-semibold disabled:opacity-50";

export function GuestReviews({ form, url }: { form: GuestReviewForm; url: string }) {
  const locale = useLocale();
  const t = createTranslator({ locale, messages: locale === "am" ? am : en });
  const heading = useId();
  return (
    <section aria-labelledby={heading} className="border-t border-rule pt-4">
      <h3 id={heading} className="text-sm font-semibold uppercase">{t("heading")}</h3>
      <ReviewPart form={form} url={url} kind="visit" prompt={t("visit")} />
      {form.dishes.map(({ id, name }) => (
        <ReviewPart key={id} form={form} url={url} kind="dish" dishId={id}
          prompt={t("dish", { name: name[locale] || name[locale === "am" ? "en" : "am"] })} />
      ))}
      {form.waiterName && <ReviewPart form={form} url={url} kind="waiter" prompt={t("waiter", { name: form.waiterName })} />}
    </section>
  );
}

function ReviewPart({ form, url, kind, prompt, dishId }: {
  form: GuestReviewForm; url: string; kind: keyof typeof parts; prompt: string; dishId?: string;
}) {
  const locale = useLocale();
  const t = createTranslator({ locale, messages: locale === "am" ? am : en });
  const part = dishId ? `dish:${dishId}` : kind;
  const [saved, setSaved] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  if (saved || form.submitted.includes(part)) return <p className="py-2 text-sm" role="status">{t("saved", { prompt })}</p>;
  if (skipped) return null;

  return (
    <form className="space-y-2 border-b border-rule py-3" onSubmit={async (event) => {
      event.preventDefault();
      if (working) return;
      const input = new FormData(event.currentTarget);
      setWorking(true);
      setFailed(false);
      try {
        const response = await fetch(url, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            visitId: form.visitId, kind, dishId, language: locale,
            rating: input.get("rating"), topics: input.getAll("topic"), comment: input.get("comment"),
          }),
        });
        if (response.ok) setSaved(true);
        else setFailed(true);
      } catch {
        setFailed(true);
      } finally {
        setWorking(false);
      }
    }}>
      <fieldset disabled={working}>
        <legend className="text-sm font-semibold">{prompt}</legend>
        <div className="flex flex-wrap gap-2">
          {parts[kind].ratings.map((rating) => (
            <label key={rating} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="radio" name="rating" value={rating} required /> {t(rating)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={working}>
        <legend className="text-sm">{t("topics")}</legend>
        <div className="flex flex-wrap gap-2">
          {parts[kind].topics.map((topic) => (
            <label key={topic} className="flex min-h-11 items-center gap-2 rounded-full border border-rule px-3 text-sm">
              <input type="checkbox" name="topic" value={topic} /> {t(topic)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm">
        {t("comment")}
        <textarea name="comment" rows={2} maxLength={500} disabled={working}
          className="mt-1 block w-full rounded-lg border border-rule px-3 py-2" />
      </label>
      <p className="text-sm text-ink-muted">{t("private", { brand: form.brandName })}</p>
      <div className="flex gap-2">
        <button className={button} disabled={working}>{t("submit")}</button>
        <button type="button" className={button} disabled={working} onClick={() => setSkipped(true)}>{t("skip")}</button>
      </div>
      {failed && <p role="alert" className="text-sm">{t("error")}</p>}
    </form>
  );
}
