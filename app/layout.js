import "./globals.css";

export const metadata = { title: "Glow CMS", description: "Minimal WordPress-like CMS" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
