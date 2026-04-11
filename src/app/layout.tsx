import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tigress",
  description: "Club management platform for a bar & billiards venue.",
};

export const viewport: Viewport = {
  themeColor: "#0F0F23",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="bg-background">
      <body className="min-h-screen font-sans text-white">{children}</body>
    </html>
  );
}
