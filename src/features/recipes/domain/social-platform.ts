// Social platforms never carry a recipe as structured data: it is in the
// caption, a comment or said in the video. A link to one that finds no recipe
// gets help that says so.

const platforms: readonly { name: string; hosts: readonly string[] }[] = [
  { name: "TikTok", hosts: ["tiktok.com", "vm.tiktok.com"] },
  { name: "Instagram", hosts: ["instagram.com", "instagr.am"] },
  { name: "Facebook", hosts: ["facebook.com", "fb.watch", "fb.com"] },
  { name: "YouTube", hosts: ["youtube.com", "youtu.be"] },
];

/** The platform a link points to ("TikTok"), or null for any other site or a link that is no address. */
export function socialPlatformOf(link: string): string | null {
  const trimmed = link.trim();
  if (!trimmed) return null;
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const platform of platforms) {
    if (platform.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return platform.name;
  }
  return null;
}

export type NoRecipeHelp = {
  /** The first line: where the recipe usually is, and the screenshot way. */
  text: string;
  /** The second line: pasting text, for those who can copy it. */
  photoText: string;
};

/** The help shown when a link had no recipe: the platform is named when it is a social one. */
export function noRecipeHelp(link: string): NoRecipeHelp {
  const platform = socialPlatformOf(link);
  return {
    text: platform
      ? `Receptet på ${platform} står ofta i bildtexten eller i videon, inte på sidan. Ta en skärmbild av texten och använd Foto. Foto läser en skärmbild per gång.`
      : "Receptet kan stå någon annanstans än på sidan. Ta en skärmbild av receptet och använd Foto. Foto läser en skärmbild per gång.",
    photoText: "Går texten att kopiera kan du i stället klistra in den här.",
  };
}
