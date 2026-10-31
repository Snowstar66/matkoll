import { PageHeader } from "@/components/app-shell/page-header";

/**
 * The header of a page under Inställningar (Story 14.7, 14.8): "‹ Inställningar"
 * back and the page title on a phone. On a desktop the list is beside the page
 * and "Inställningar" stands over both, so the page's title is a section
 * heading at the top of the column, in line with the first group label.
 */
export function SettingsPageHeader({ title }: { title: string }) {
  return (
    <>
      <div className="desktop:hidden">
        <PageHeader title={title} backHref="/installningar" backLabel="Inställningar" />
      </div>
      <h1 className="hidden pb-3 text-section-title text-ink desktop:block">{title}</h1>
    </>
  );
}
