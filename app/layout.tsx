import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { DEFAULT_THEME, THEME_INIT_SCRIPT } from "./_lib/theme";
import "./globals.css";

// IBM Plex Sans for the interface, IBM Plex Mono for every number.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "Vault",
  description: "Personal finance: banks, credit cards, investments, and loans in one place",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The inline script may switch data-theme before hydration, so React should not flag the difference.
    <html
      lang="en"
      data-theme={DEFAULT_THEME}
      className={`${plexSans.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
