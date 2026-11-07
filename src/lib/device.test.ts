import { describe, expect, it } from "vitest";
import { deviceFrom, isStandalone, parseDeviceInfo, recipeSiteLink } from "./device";

const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";
const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";

describe("deviceFrom", () => {
  it("tells iPhone, iPad as Mac, Android and computer apart", () => {
    expect(deviceFrom(iphone, 5)).toBe("iphone");
    expect(deviceFrom(mac, 5)).toBe("iphone");
    expect(deviceFrom(mac, 0)).toBe("computer");
    expect(deviceFrom(android, 5)).toBe("android");
  });
});

describe("isStandalone", () => {
  it("is true for navigator.standalone or the standalone display mode", () => {
    expect(isStandalone(true, false)).toBe(true);
    expect(isStandalone(undefined, true)).toBe(true);
    expect(isStandalone(false, false)).toBe(false);
    expect(isStandalone(undefined, false)).toBe(false);
  });
});

describe("recipeSiteLink", () => {
  it("opens real Safari from the installed app on iPhone", () => {
    expect(recipeSiteLink("koket.se", "iphone", true)).toEqual({ href: "x-safari-https://koket.se/", newTab: false });
  });
  it("is a normal link in a new tab everywhere else, and before the device is known", () => {
    const normal = { href: "https://koket.se/", newTab: true };
    expect(recipeSiteLink("koket.se", "iphone", false)).toEqual(normal);
    expect(recipeSiteLink("koket.se", "android", true)).toEqual(normal);
    expect(recipeSiteLink("koket.se", "computer", false)).toEqual(normal);
    expect(recipeSiteLink("koket.se", null, false)).toEqual(normal);
  });
});

describe("parseDeviceInfo", () => {
  it("reads the snapshot string", () => {
    expect(parseDeviceInfo("iphone:true")).toEqual({ device: "iphone", standalone: true });
    expect(parseDeviceInfo("null:false")).toEqual({ device: null, standalone: false });
  });
});
