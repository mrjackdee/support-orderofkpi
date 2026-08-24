import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://support.orderofkpi.com"),
  title: "KP Support Center | Coming Soon",
  description:
    "The Order of KP Support Center is coming soon, with guided requests, clear ownership, and visible progress for members.",
  openGraph: {
    title: "KP Support Center | Coming Soon",
    description: "A clearer way for Order of KP members to get help is coming.",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "KP Support Center coming soon" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "KP Support Center | Coming Soon",
    description: "A clearer way for Order of KP members to get help is coming.",
    images: ["/og.jpg"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
