import type { Metadata } from "next";
import Link from "next/link";
import { appDescription, appName, appTagline } from "@/app/app-info";
import {
  builtText,
  commitText,
  readBuildInfo,
  shortVersion,
} from "@/app/build-info";
import { ChevronRightIcon, SparkleIcon } from "@/components/icons";
import { ListGroup } from "@/components/list-group";
import { settingsPageHref } from "@/features/settings";
import { NewsDot } from "@/features/settings/ui/news-seen";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";
import { latestReleaseDate } from "../nyheter/releases";

export const metadata: Metadata = { title: `Om ${appName}` };

// Om Livskoll (Story 14.7): the app, its version, when it was built and from which
// commit (build-info.ts), and the way to Nyheter.
export default function AboutPage() {
  const build = readBuildInfo();
  const built = builtText(build.builtAt);
  return (
    <>
      <SettingsPageHeader title={`Om ${appName}`} />
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1 rounded-lg bg-surface p-4">
          <p className="text-row-title text-ink">{appName}</p>
          <p className="text-body text-ink-2">{appTagline}</p>
          <p className="text-body text-ink-2">{appDescription}</p>
          <div
            className="flex flex-col pt-2 text-meta text-ink-3"
            data-testid="about-version"
          >
            <p>
              Version {shortVersion(build.version)} · {commitText(build.commit)}
            </p>
            {built ? <p>{built}</p> : null}
            <p>{appName} · av Snowstar</p>
          </div>
        </div>
        <ListGroup label="Nyheter">
          <li>
            <Link
              href={settingsPageHref("nyheter")}
              className="flex min-h-[52px] items-center gap-3 px-4 py-1.5 focus-visible:-outline-offset-2"
            >
              <span
                aria-hidden="true"
                className="flex size-[30px] shrink-0 items-center justify-center rounded-[8px] bg-mint text-mint-ink"
              >
                <SparkleIcon size={18} />
              </span>
              <span className="min-w-0 flex-1 text-row-title font-normal text-ink">
                Nyheter
              </span>
              <NewsDot latest={latestReleaseDate} />
              <ChevronRightIcon
                size={16}
                className="-mr-1 shrink-0 text-ink-3"
              />
            </Link>
          </li>
        </ListGroup>
      </div>
    </>
  );
}
