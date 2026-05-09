import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Portkey",
  description: "Craft resumes that take you there.",
  icons: { icon: '/icon.png' },
  openGraph: {
    title: "Make the Jump",
    description: "Craft resumes that take you there.",
    siteName: "Portkey",
    type: "website",
    url: "https://cv-tailor-rho-beryl.vercel.app",
    images: [{ url: 'https://cv-tailor-rho-beryl.vercel.app/og-image.jpg', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Make the Jump',
    description: 'Craft resumes that take you there.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
