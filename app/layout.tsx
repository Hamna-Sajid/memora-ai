
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Memora Ai",
  description: "A familiar voice when memory needs help.",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}