import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://jasermomm.github.io/need-this-later/"),
  title: "I Need This Later",
  description: "A private, local-first inbox for everything you will need later.",
  applicationName: "I Need This Later",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Need This Later", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/icon-192.png" },
  openGraph: {
    title: "I Need This Later",
    description: "Capture first. Find it later. A private local-first inbox.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "I Need This Later — Capture first. Find it later." }],
  },
  twitter: { card: "summary_large_image", title: "I Need This Later", description: "Capture first. Find it later.", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-theme="system"><body>{children}</body></html>;
}
