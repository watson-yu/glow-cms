import { getSiteConfig } from "@/lib/pages";
import { getBaseUrl } from "@/lib/seo";

// robots.txt — public pages are crawlable; admin/preview/api are not.
export const dynamic = "force-dynamic";

export default async function robots() {
  let baseUrl = getBaseUrl({});
  try {
    baseUrl = getBaseUrl(await getSiteConfig());
  } catch {
    // DB unavailable (e.g. at build time) — fall back to env/dev base URL.
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/cms-admin", "/preview", "/api"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
