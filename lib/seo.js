// SEO helpers — pure functions that turn a page row + site config into the
// values the public renderer needs (canonical URLs, Next.js metadata objects).
// Kept free of DB/React imports so they are easy to unit test.

// Default lang for the public site. Traditional Chinese product; override via
// the `site_lang` site_config key.
export const DEFAULT_LANG = "zh-TW";

// Strip trailing slashes so we can safely concatenate paths onto a base URL.
export function normalizeBaseUrl(raw) {
  if (!raw) return "";
  return String(raw).trim().replace(/\/+$/, "");
}

// Resolve the absolute base URL from site config, then env, then a dev default.
// `config.base_url` is the admin-editable value; env vars cover deploy targets.
export function getBaseUrl(config = {}) {
  const raw =
    config.base_url ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "http://localhost:3000";
  return normalizeBaseUrl(raw);
}

// The public path for a page, honouring the configurable content_path prefix.
// `contentPath` is already normalized by lib/pages#getContentPath ("" or "/x").
export function pagePath(slug, contentPath = "") {
  const cp = contentPath || "";
  return `${cp}/${slug}`;
}

// Absolute canonical URL for a page. An explicit `canonical` column wins (a full
// URL is used as-is; a path is resolved against baseUrl); otherwise it is derived
// from the slug + content path.
export function pageCanonical({ canonical, slug, contentPath = "", baseUrl = "" }) {
  const base = normalizeBaseUrl(baseUrl);
  if (canonical) {
    if (/^https?:\/\//i.test(canonical)) return canonical;
    const path = canonical.startsWith("/") ? canonical : `/${canonical}`;
    return base ? `${base}${path}` : path;
  }
  const path = pagePath(slug, contentPath);
  return base ? `${base}${path}` : path;
}

// Resolve an image reference (page or config) to an absolute URL when possible.
function resolveImage(image, baseUrl) {
  if (!image) return null;
  if (/^https?:\/\//i.test(image)) return image;
  const base = normalizeBaseUrl(baseUrl);
  const path = image.startsWith("/") ? image : `/${image}`;
  return base ? `${base}${path}` : image;
}

// Build a Next.js metadata object for a public page, with fallbacks:
//   title       → meta_title → page title → site name
//   description → meta_description → config.site_description
//   og image    → og_image → config.og_image → config.logo_url
//   canonical   → canonical column → derived from slug/content_path
export function buildPageMetadata({ page, config = {}, contentPath = "", baseUrl = "" }) {
  const siteName = config.site_title || "Glow CMS";
  const title = page.meta_title || page.title || siteName;
  const description = page.meta_description || config.site_description || undefined;
  const canonical = pageCanonical({
    canonical: page.canonical,
    slug: page.slug,
    contentPath,
    baseUrl,
  });
  const ogImage = resolveImage(page.og_image || config.og_image || config.logo_url, baseUrl);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName,
      type: "article",
      images: ogImage ? [ogImage] : undefined,
    },
  };
}
