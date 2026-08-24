import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://support.orderofkpi.com";
const socialTitle = "KP Support Center | Coming Soon";
const socialDescription =
  "A clearer way for Order of KP members to request help, receive a request number, and follow progress is coming soon.";
const socialImageUrl = `${siteUrl}/og.jpg?v=20260824`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "KP Support Center",
  title: socialTitle,
  description:
    "The Order of KP Support Center is coming soon, with guided requests, clear ownership, and visible progress for members.",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Order of KP",
    locale: "en_US",
    title: socialTitle,
    description: socialDescription,
    images: [
      {
        url: socialImageUrl,
        secureUrl: socialImageUrl,
        width: 1200,
        height: 630,
        type: "image/jpeg",
        alt: "KP Support Center coming soon, featuring the member request portal",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: socialTitle,
    description: socialDescription,
    images: [socialImageUrl],
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
