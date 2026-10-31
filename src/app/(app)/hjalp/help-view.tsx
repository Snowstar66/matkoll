"use client";

import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { cx } from "@/components/cx";
import { mainDestinations } from "@/components/app-shell/destinations";
import { helpSections } from "./help-content";

const firstId = helpSections[0]?.id ?? "";

/** Where the back link goes: the tab the page was opened from (`#matsedel`), else Recept. */
export function parentOf(hash: string): { href: string; label: string } {
  const tab = mainDestinations.find((destination) => destination.helpId === hash.replace(/^#/, ""));
  return { href: tab?.href ?? "/recept", label: tab?.label ?? "Recept" };
}

/**
 * Hjälp och tips (Story 19.2): a row of chips at the top, one per tab, that jumps
 * to the tab's section and follows along while scrolling, and the sections. Opened
 * from a tab (`#recept`) it lands on that tab's section with its chip chosen.
 */
export function HelpView() {
  const [active, setActive] = useState(firstId);
  const [parent, setParent] = useState(() => parentOf(""));
  const jumping = useRef(false);

  // Each time the page is shown (also when it is shown again hidden by Activity): go to the section the address names.
  useEffect(() => {
    const id = window.location.hash.replace(/^#/, "");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is read only in the browser, after hydration.
    setParent(parentOf(id));
    const section = id ? document.getElementById(id) : null;
    if (!section) return;
    setActive(id);
    section.scrollIntoView({ block: "start" });
  }, []);

  // The chip follows the section that is under the chip row while scrolling.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (jumping.current) return;
        const shown = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (shown) setActive(shown.target.id);
      },
      { rootMargin: "-96px 0px -65% 0px", threshold: 0 },
    );
    for (const section of helpSections) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  function jump(id: string) {
    const section = document.getElementById(id);
    if (!section) return;
    setActive(id);
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    jumping.current = true;
    section.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
    window.setTimeout(() => {
      jumping.current = false;
    }, calm ? 50 : 700);
  }

  return (
    <>
      <PageHeader title="Hjälp och tips" backHref={parent.href} backLabel={parent.label} />
      <nav
        aria-label="Avsnitt"
        className="sticky top-0 z-20 -mx-page mb-1 bg-bar px-page py-1.5 backdrop-blur-[20px] backdrop-saturate-150 desktop:mx-0 desktop:px-0"
      >
        <ul className="flex gap-2 overflow-x-auto">
          {helpSections
            .filter((section) => section.chip)
            .map((section) => (
              <li key={section.id} className="shrink-0">
                <button
                  type="button"
                  aria-current={active === section.id ? "true" : undefined}
                  onClick={() => jump(section.id)}
                  className={cx(
                    "inline-flex h-8 items-center rounded-pill border px-3 text-control",
                    active === section.id ? "border-accent bg-accent font-semibold text-on-accent" : "border-border bg-surface text-ink-2",
                  )}
                >
                  {section.title}
                </button>
              </li>
            ))}
        </ul>
      </nav>
      <div className="flex flex-col gap-2 pb-4">
        {helpSections.map((section) => (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-rubrik`} className="scroll-mt-14">
            <h2 id={`${section.id}-rubrik`} className="mt-5 text-section-title text-ink">
              {section.title}
            </h2>
            <ul role="list" className="mt-2 flex flex-col divide-y divide-hairline overflow-hidden rounded-lg bg-surface">
              {section.tips.map((tip) => (
                <li key={tip.title} className="flex flex-col gap-0.5 px-4 py-3">
                  <h3 className="text-row-title text-ink">{tip.title}</h3>
                  <p className="text-meta text-ink-2">{tip.text}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
