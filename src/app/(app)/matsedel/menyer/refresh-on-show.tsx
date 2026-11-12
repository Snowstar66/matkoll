"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Coming back with the browser's back button can show the page as it was (the router keeps it): a person added under
// Inställningar → Medlemmar would be missing. One refresh when the page shows brings the list up to date.
export function RefreshOnShow() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
