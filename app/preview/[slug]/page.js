import { notFound } from "next/navigation";
import { getPageBySlug } from "@/lib/pages";
import PageView from "@/app/components/PageView";

export const dynamic = "force-dynamic";

export default async function PreviewPage({ params }) {
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
