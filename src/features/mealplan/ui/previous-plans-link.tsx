import Link from "next/link";
import { buttonClasses } from "@/components/button";

/** "Tidigare" in Matsedel's header: the earlier meal plans (FR-14). */
export function PreviousPlansLink() {
  return (
    <Link href="/matsedel/tidigare" className={buttonClasses("text")}>
      Tidigare
    </Link>
  );
}
