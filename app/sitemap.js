import pool from "@/lib/db";
import { getContentPath, getSiteConfig } from "@/lib/pages";
import { getBaseUrl, pageCanonical } from "@/lib/seo";

// Public sitemap of all PUBLISHED pages, honouring the content_path prefix.
export const dynamic = "force-dynamic";

export default async function sitemap() {
  try {
    const config = await getSiteConfig();
    const baseUrl = getBaseUrl(config);
    const contentPath = await getContentPath();
    const [pages] = await pool.query(
      "SELECT slug, canonical, updated_at FROM pages WHERE status = 'published'"
    );
    return pages.map((p) => ({
      url: pageCanonical({ canonical: p.canonical, slug: p.slug, contentPath, baseUrl }),
      lastModified: p.updated_at || undefined,
    }));
  } catch {
    // DB unavailable (e.g. at build time) — emit an empty sitemap rather than fail.
    return [];
  }
}
