import type { Metadata } from "next";
import { appDescription, appName, appTagline } from "@/app/app-info";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";

export const metadata: Metadata = { title: `Om ${appName}` };

// Om Matkoll (Story 14.7).
export default function AboutPage() {
  return (
    <>
      <SettingsPageHeader title={`Om ${appName}`} />
      <div className="flex flex-col gap-1 rounded-lg bg-surface p-4">
        <p className="text-row-title text-ink">{appName}</p>
        <p className="text-body text-ink-2">{appTagline}</p>
        <p className="text-body text-ink-2">{appDescription}</p>
        <p className="pt-2 text-meta text-ink-3">{appName} · av Snowstar</p>
      </div>
    </>
  );
}
