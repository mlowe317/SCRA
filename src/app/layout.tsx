import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "SCRA Compliance Tracker",
  description: "Loan portfolio tracking and DMDC SCRA compliance checks",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <SiteNav />
        <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
        <Toaster richColors />
      </body>
    </html>
  );
}
