import { getTranslations } from "next-intl/server";
import type { getVenueServiceSettings } from "@/core";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { saveServiceSettings } from "./insights/actions";

const field = "workspace-input mt-1";

export async function ServiceSettings({ venueId, settings, open }: {
  venueId: string; settings: Awaited<ReturnType<typeof getVenueServiceSettings>>; open: boolean;
}) {
  const t = await getTranslations("Insights");
  const rows = settings?.periods ?? [];
  return (
    <details id="service-hours" className="workspace-panel manager-setup-section" open={open || undefined}>
      <summary className="workspace-summary">{t("settings")}</summary>
      <ActionForm action={saveServiceSettings.bind(null, venueId)} className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <TimeField name="opensAt" label={t("opens")} value={settings?.hours.opensAt} required />
          <TimeField name="closesAt" label={t("closes")} value={settings?.hours.closesAt} required />
        </div>
        {rows.map((period, index) => (
          <fieldset className="space-y-2 border-t border-rule py-3" key={index}>
            <legend className="text-sm font-semibold">{period.name}</legend>
            <label className="block text-sm font-medium">{t("periodName")} <input name="periodName" className={field} defaultValue={period.name} /></label>
            <div className="flex flex-wrap gap-3">
              <TimeField name="startsAt" label={t("starts")} value={period.startsAt} />
              <TimeField name="endsAt" label={t("ends")} value={period.endsAt} />
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="remove" value={index} /> {t("removePeriod")}</label>
          </fieldset>
        ))}
        {rows.length < 24 && (
          <fieldset className="space-y-2 border-t border-rule py-3">
            <legend className="text-sm font-semibold">{t("newPeriod")}</legend>
            <label className="block text-sm font-medium">{t("periodName")} <input name="periodName" className={field} /></label>
            <div className="flex flex-wrap gap-3">
              <TimeField name="startsAt" label={t("starts")} />
              <TimeField name="endsAt" label={t("ends")} />
            </div>
          </fieldset>
        )}
        <SubmitButton>{t("save")}</SubmitButton>
      </ActionForm>
    </details>
  );
}

function TimeField({ name, label, value, required }: { name: string; label: string; value?: string; required?: boolean }) {
  return <label className="text-sm font-medium">{label}<input className={field} type="time" name={name} defaultValue={value} required={required} /></label>;
}
