import { notFound } from "next/navigation";
import { getPageBySlug } from "@/lib/pages";
import { getServerSession } from "@/lib/auth";
import PageView from "@/app/components/PageView";

export const dynamic = "force-dynamic";

export default async function PreviewPage({ params }) {
  // Previews expose unpublished drafts — require an allow-listed session whenever
  // auth is configured (the proxy gate also covers this; this is defense in depth).
  const { configured, allowed } = await getServerSession();
  if (configured && !allowed) notFound();

  const { slug } = await params;
  const page = await getPageBySlug(slug, false);
  if (!page) notFound();

  return (
    <>
      <div style={{ background: "#fef3c7", color: "#92400e", padding: "8px 16px", fontSize: 13, fontWeight: 500, textAlign: "center" }}>
        Preview Mode — This page may not be published
      </div>
      <PageView page={page} />
    </>
  );
}
