"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { deriveBrandTheme, displayFonts, type DisplayFont } from "@/core/browser";
import type { Brand } from "@/core";
import type { FormState } from "@/lib/session";
import { DraftSlipContents, draftSlipClass, GuestDishRow, GuestMenuHeader, GuestMenuIntro } from "@/ui/guest-menu-parts";
import { brandThemeStyle, displayFontClasses } from "@/ui/guest-theme";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";

type Artwork = { file: File; url: string | null };

export function BrandingForm({ brand, save, accept, maxFileBytes }: {
  brand: Brand;
  save: (state: FormState, form: FormData) => Promise<FormState>;
  accept: string;
  maxFileBytes: number;
}) {
  const t = useTranslations("StaffBranding");
  const [colour, setColour] = useState(brand.colour);
  const [font, setFont] = useState(brand.displayFont);
  const [logo, setLogo] = useArtwork();
  const [cover, setCover] = useArtwork();
  const theme = deriveBrandTheme(colour);
  const priceSantim = 6_000;

  function preview(file: File | null): Artwork | null {
    if (!file) return null;
    const supported = file.size <= maxFileBytes && accept.split(",").includes(file.type);
    return { file, url: supported ? URL.createObjectURL(file) : null };
  }

  async function submit(state: FormState, form: FormData): Promise<FormState> {
    for (const [name, artwork] of [["logo", logo], ["cover", cover]] as const) {
      if (!artwork) continue;
      if (!artwork.url) return { error: "invalidBrandArtwork" };
      // Keep the selected file available to retry after a refusal resets native file inputs.
      form.set(name, artwork.file);
    }
    const result = await save(state, form);
    if (result?.done) {
      setLogo((current) => current === logo ? null : current);
      setCover((current) => current === cover ? null : current);
    }
    return result;
  }

  return (
    <ActionForm action={submit} className="mt-5">
      <div className="grid items-start gap-6 sm:grid-cols-2">
        <div className="space-y-4">
          <div>
            <div className="flex flex-wrap gap-3">
              <ArtworkField name="logo" label={t("logo")} accept={accept} fileName={logo?.file.name} onChange={(file) => setLogo(preview(file))} />
              <ArtworkField name="cover" label={t("cover")} accept={accept} fileName={cover?.file.name} onChange={(file) => setCover(preview(file))} />
            </div>
            <p id="brand-artwork-help" className="mt-2 text-sm text-ink-muted">{t("imageHelp")}</p>
          </div>

          <label className="block text-sm font-medium">
            {t("colour")}
            <input
              name="colour"
              type="color"
              value={colour.toLowerCase()}
              onChange={(event) => setColour(event.currentTarget.value)}
              className="mt-1 block h-11 w-20 cursor-pointer rounded-md border border-ink/30 bg-white p-1"
            />
          </label>
          {theme.accent !== theme.readable && (
            <div className="text-sm">
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                <Swatch colour={theme.accent}>{t("original", { colour: theme.accent })}</Swatch>
                <Swatch colour={theme.readable}>{t("adjusted", { colour: theme.readable })}</Swatch>
              </div>
              <p className="mt-2 text-ink-muted">{t("contrast")}</p>
            </div>
          )}
          <label className="block text-sm font-medium">
            {t("font")}
            <select
              name="displayFont"
              value={font}
              onChange={(event) => setFont(event.currentTarget.value as DisplayFont)}
              className="mt-1 block min-h-11 w-full rounded-md border border-ink/30 bg-white px-3 text-base font-normal"
            >
              {displayFonts.map((face) => <option key={face} value={face}>{t(face)}</option>)}
            </select>
          </label>
        </div>

        <section aria-labelledby="brand-preview">
          <h2 id="brand-preview" className="mb-2 text-sm font-semibold">{t("preview")}</h2>
          <div
            className={`overflow-hidden rounded-lg border border-rule bg-paper font-sans ${displayFontClasses[font]}`}
            style={brandThemeStyle(theme)}
          >
            <GuestMenuHeader brand={{ name: brand.name, logoUrl: logo?.url ?? brand.logoUrl }} />
            <GuestMenuIntro label={brand.name} coverUrl={cover?.url ?? brand.coverUrl} heading="h3" />
            <ul className="px-5 pt-4">
              <GuestDishRow dish={{ id: "preview", name: t("exampleDish"), description: t("exampleDescription"), fasting: false, priceSantim }} />
            </ul>
            <div className="p-3 pt-4">
              <div className={draftSlipClass}><DraftSlipContents dishCount={1} totalSantim={priceSantim} /></div>
            </div>
          </div>
        </section>
      </div>
      <div className="mt-5"><SubmitButton>{t("save")}</SubmitButton></div>
    </ActionForm>
  );
}

function useArtwork() {
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const url = artwork?.url;
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return [artwork, setArtwork] as const;
}

function ArtworkField({ name, label, accept, fileName, onChange }: {
  name: "logo" | "cover";
  label: string;
  accept: string;
  fileName?: string;
  onChange: (file: File | null) => void;
}) {
  return (
    <div className="min-w-0">
      <input
        id={`brand-${name}`}
        type="file"
        name={name}
        accept={accept}
        aria-describedby="brand-artwork-help"
        onChange={(event) => onChange(event.currentTarget.files?.[0] ?? null)}
        className="peer sr-only"
      />
      <label
        htmlFor={`brand-${name}`}
        className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-ink/30 px-3 text-sm font-medium peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
      >
        {label}
      </label>
      {fileName && <p className="mt-1 truncate text-sm text-ink-muted" title={fileName}>{fileName}</p>}
    </div>
  );
}

function Swatch({ colour, children }: { colour: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="size-5 rounded border border-ink/20" style={{ backgroundColor: colour }} />
      {children}
    </span>
  );
}
