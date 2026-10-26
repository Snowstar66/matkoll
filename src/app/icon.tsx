import { notFound } from "next/navigation";
import { appIconResponse } from "./app-icon-image";
import { manifestIcons } from "./app-info";

// The manifest's icons (AD-27) at /icon/192, /icon/512 and /icon/maskable.
// Generated at build time; the proxy lets them through without a session. Any
// other id is "not found" (`dynamicParams` is not available with Cache
// Components, so the check is here).

export function generateImageMetadata() {
  return manifestIcons.map(({ id, side }) => ({ id, contentType: "image/png", size: { width: side, height: side } }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const iconId = String(await id);
  const icon = manifestIcons.find((candidate) => candidate.id === iconId);
  if (!icon) notFound();
  return appIconResponse(icon.side, icon.scale);
}
