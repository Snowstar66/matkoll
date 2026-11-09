import { describe, expect, it } from "vitest";
import { noRecipeHelp, socialPlatformOf } from "./social-platform";

describe("socialPlatformOf", () => {
  it.each([
    ["https://www.tiktok.com/@kock/video/123", "TikTok"],
    ["https://vm.tiktok.com/ZMabc/", "TikTok"],
    ["https://www.instagram.com/reel/abc/", "Instagram"],
    ["https://m.facebook.com/watch/?v=1", "Facebook"],
    ["https://fb.watch/abc/", "Facebook"],
    ["https://youtu.be/abc", "YouTube"],
    ["https://www.youtube.com/watch?v=abc", "YouTube"],
    ["tiktok.com/@kock/video/1", "TikTok"],
  ])("knows %s", (link, name) => expect(socialPlatformOf(link)).toBe(name));

  it.each(["https://www.koket.se/pannkakor", "https://nottiktok.com/x", "https://tiktok.com.evil.se/x", "inte en länk", ""])(
    "is null for %s",
    (link) => expect(socialPlatformOf(link)).toBeNull(),
  );
});

describe("noRecipeHelp", () => {
  it("names the platform for a social link and puts the screenshot first", () => {
    const help = noRecipeHelp("https://vm.tiktok.com/ZM1/");
    expect(help.text).toBe(
      "Receptet på TikTok står ofta i bildtexten eller i videon, inte på sidan. Ta en skärmbild av texten och använd Foto. Foto läser en skärmbild per gång.",
    );
    expect(help.photoText).toBe("Går texten att kopiera kan du i stället klistra in den här.");
  });

  it("is shorter for another site", () => {
    const help = noRecipeHelp("https://www.koket.se/x");
    expect(help.text).not.toMatch(/TikTok|videon/);
    expect(help.text).toContain("Ta en skärmbild av receptet och använd Foto.");
  });
});
