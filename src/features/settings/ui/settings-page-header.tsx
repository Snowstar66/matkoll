import { PageHeader } from "@/components/app-shell/page-header";

/** The header of a page under Inställningar (Story 14.7): "‹ Inställningar" back on a phone, the list is beside the page on a desktop. */
export function SettingsPageHeader({ title }: { title: string }) {
  return <PageHeader title={title} backHref="/installningar" backLabel="Inställningar" backOnlyOnMobile />;
}
