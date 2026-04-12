import { notFound } from "next/navigation";
import { getPageBySlug, getContentPath } from "@/lib/pages";
import PageView from "@/app/components/PageView";

export const dynamic = "force-dynamic";

export default async function PublicPage({ params }) {
  const { slug } = await params;
  const contentPath = await getContentPath();
  const joined = "/" + slug.join("/");

  // Strip content_path prefix to get the page slug
  let pageSlug;
  if (contentPath) {
    if (!joined.startsWith(contentPath + "/")) notFound();
    pageSlug = joined.slice(contentPath.length + 1);
  } else {
    pageSlug = slug.join("/");
  }

  if (!pageSlug) notFound();

  const page = await getPageBySlug(pageSlug, true);
  if (!page) notFound();

  return <PageView page={page} />;
}
