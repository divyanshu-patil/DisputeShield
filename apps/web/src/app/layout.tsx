import type { Metadata } from "next";
import { Nunito_Sans } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dispute Shield",
  description: "PayPal dispute evidence with every sentence checked against your records. Sandbox only.",
};

// DESIGN.md font.family.primary. Mono text (IDs, JSON) uses the system monospace stack.
const sans = Nunito_Sans({ subsets: ["latin"], variable: "--font-nunito-sans" });

// Applies the saved theme before paint so dark mode never flashes (guarded: storage may be blocked).
const THEME_SCRIPT = `try{var t=localStorage.getItem("ds-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
