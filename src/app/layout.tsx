import type { Metadata, Viewport } from "next";
import "./globals.css";
import { appDescription, appName } from "./app-info";
import { paletteBootScript } from "@/lib/palette";
import { themeColors } from "./theme-colors";

export const metadata: Metadata = {
  title: { template: `%s – ${appName}`, default: appName },
  description: appDescription,
  // On the home screen (AD-27): full screen, named Matkoll. The status bar follows
  // light and dark mode with `default`; `black-translucent` would give white text
  // on the light background.
  appleWebApp: { title: appName, capable: true, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Content may run under the iPhone notch and home indicator; the shell keeps to the safe area.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: themeColors.light },
    { media: "(prefers-color-scheme: dark)", color: themeColors.dark },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the inline script at the top of <body> (an explicit <head> broke the tab scroll memory in shell.spec) sets data-palette (and --hue) on <html> before React hydrates.
    <html lang="sv" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        {/* Färgtema: the device's chosen palette, applied before first paint. Static, no request data. */}
        <script dangerouslySetInnerHTML={{ __html: paletteBootScript() }} />
        {children}
      </body>
    </html>
  );
}
