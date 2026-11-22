"use client";

import { usePathname } from "next/navigation";
import { ListGroup } from "@/components/list-group";
import { OptionRow } from "./option-settings";
import { type SettingsGroupData, SettingsGroup } from "./settings-menu";

/**
 * Avancerat: what only some people touch. Receptsajter for everyone; the AI group (Modell, the month's cost
 * and Låt agenten söka på webben) and Felsökning (Visa sidtider) only for those who see the AI row
 * (`ai` is null for everyone else). The two switches keep their keys on the device.
 */
export function AdvancedSettings({ sites, ai }: { sites: SettingsGroupData; ai: SettingsGroupData | null }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-3 pb-2">
      <p className="px-1 text-meta text-ink-2 desktop:px-0">Det här behöver de flesta aldrig röra.</p>
      <SettingsGroup group={sites} current={pathname} />
      {ai ? (
        <>
          <SettingsGroup group={ai} current={pathname} extra={<OptionRow id="restaurantAgentWeb" />} />
          <section className="flex flex-col gap-1.5">
            <h2 className="px-1 desktop:px-0 text-section-label text-ink-2">Felsökning</h2>
            <ListGroup label="Felsökning">
              <OptionRow id="showTimings" />
            </ListGroup>
          </section>
        </>
      ) : null}
    </div>
  );
}
