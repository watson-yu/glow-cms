import TemplateManager from "@/app/cms-admin/components/TemplateManager";

export default function HeadersPage() {
  return <TemplateManager apiPath="/api/headers" title="Headers" objectType="header" />;
}
