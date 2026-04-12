import TemplateManager from "@/app/cms-admin/components/TemplateManager";

export default function FootersPage() {
  return <TemplateManager apiPath="/api/footers" title="Footers" objectType="footer" />;
}
