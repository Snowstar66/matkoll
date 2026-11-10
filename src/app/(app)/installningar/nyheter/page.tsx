import type { Metadata } from "next";
import { ListGroup } from "@/components/list-group";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";
import { MarkNewsSeen } from "@/features/settings/ui/news-seen";
import { latestReleaseDate, releaseDateText, releasesByDate } from "./releases";

export const metadata: Metadata = { title: "Nyheter" };

// Nyheter: what is new in the app, newest first and grouped by day (releases/, collected by releases.ts).
// Opening it clears the dot on the Nyheter row on this device.
export default function NewsPage() {
  return (
    <>
      <SettingsPageHeader title="Nyheter" />
      <MarkNewsSeen latest={latestReleaseDate} />
      <div className="flex flex-col gap-6" data-testid="news-list">
        {releasesByDate().map((group) => (
          <section key={group.date} aria-labelledby={`nyheter-${group.date}`}>
            <h2 id={`nyheter-${group.date}`} className="mx-1 mb-2 text-section-label text-ink-2">
              {releaseDateText(group.date)}
            </h2>
            <ListGroup labelledBy={`nyheter-${group.date}`}>
              {group.entries.map((release) => (
                <li key={release.title} className="flex flex-col gap-1.5 px-4 py-3.5">
                  <h3 className="text-row-title text-ink">{release.title}</h3>
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-[0.9375rem] leading-[1.3125rem] text-ink-2 marker:text-ink-3">
                    {release.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ListGroup>
          </section>
        ))}
      </div>
    </>
  );
}
