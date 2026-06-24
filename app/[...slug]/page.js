import { notFound } from "next/navigation";
import { getPageBySlug, getContentPath, getSiteConfig, resolvePageSlug } from "@/lib/pages";
import { buildPageMetadata, getBaseUrl } from "@/lib/seo";
import PageView from "@/app/components/PageView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const contentPath = await getContentPath();
  const pageSlug = resolvePageSlug(slug, contentPath);
  if (!pageSlug) return {};

  const page = await getPageBySlug(pageSlug, true);
  if (!page) return {};

  const config = await getSiteConfig();
  return buildPageMetadata({ page, config, contentPath, baseUrl: getBaseUrl(config) });
}

export default async function PublicPage({ params }) {
  const { slug } = await params;
  const contentPath = await getContentPath();

  // Strip content_path prefix to get the page slug
  const pageSlug = resolvePageSlug(slug, contentPath);
  if (!pageSlug) notFound();

  const page = await getPageBySlug(pageSlug, true);
  if (!page) notFound();

  return <PageView page={page} />;
}
