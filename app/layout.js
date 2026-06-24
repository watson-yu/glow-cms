import "./globals.css";
import { getSiteLang } from "@/lib/pages";

export const metadata = { title: "Glow CMS", description: "Minimal WordPress-like CMS" };

export default async function RootLayout({ children }) {
  // Traditional Chinese site by default; configurable via the `site_lang`
  // site_config key. Resolves to "zh-TW" if the DB is unavailable.
  const lang = await getSiteLang();
  return (
    <html lang={lang}>
      <body>{children}</body>
    </html>
  );
}
