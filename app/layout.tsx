import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RECMS — NDDU Ethics Research Committee", template: "%s · RECMS" },
  description: "Research Ethics Committee Management System for Notre Dame of Dadiangas University.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
