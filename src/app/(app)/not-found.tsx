import Link from "next/link";
import { PageHeader } from "@/components/app-shell/page-header";
import { buttonClasses } from "@/components/button";
import { EmptyState } from "@/components/empty-state";

// notFound() inside the app shell, e.g. a recipe that no longer exists.
export default function AppNotFound() {
  return (
    <>
      <PageHeader title="Sidan finns inte" />
      <EmptyState
        action={
          <Link href="/recept" className={buttonClasses("secondary")}>
            Gå till recepten
          </Link>
        }
      >
        Sidan finns inte.
      </EmptyState>
    </>
  );
}
