import type { Metadata, Viewport } from "next";
import "./globals.css";
import { themeColors } from "./theme-colors";

export const metadata: Metadata = {
  title: { template: "%s – Matkoll", default: "Matkoll" },
  description: "Recept, matsedel, inköpslista och det du har hemma.",
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
