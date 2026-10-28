import type { Metadata, Viewport } from "next";
import "./globals.css";
import { appDescription, appName } from "./app-info";
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
    <html lang="sv" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
