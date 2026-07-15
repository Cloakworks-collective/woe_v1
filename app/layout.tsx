import type { Metadata } from "next";
import { Cinzel } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

/** Medieval display face for headings — body text stays Georgia for reading. */
const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-heading",
  display: "swap",
});

export const metadata: Metadata = {
  title: "War of Empires",
  description: "A persistent, turn-based multiplayer strategy game.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("woe_theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang="en" data-theme={theme} className={cinzel.variable}>
      <body>{children}</body>
    </html>
  );
}
