import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Matkoll",
  description: "Recept, matsedel, inköpslista och det du har hemma.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sv" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
