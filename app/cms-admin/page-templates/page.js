"use client";
import { useEffect, useState } from "react";
import TemplateManager from "@/app/cms-admin/components/TemplateManager";
import { substituteVars } from "@/lib/template";
import SafeHtml from "@/app/components/SafeHtml";

export default function PageTemplatesPage() {
  const [headerHtml, setHeaderHtml] = useState("");
  const [footerHtml, setFooterHtml] = useState("");
  const [config, setConfig] = useState({});

  useEffect(() => {
    fetch("/api/site-config").then(r => r.json()).then(setConfig);
    fetch("/api/headers").then(r => r.json()).then(h => { if (h[0]) setHeaderHtml(h[0].content || ""); });
    fetch("/api/footers").then(r => r.json()).then(f => { if (f[0]) setFooterHtml(f[0].content || ""); });
  }, []);

  function renderPreview(templateHtml) {
    const header = substituteVars(headerHtml, config);
    const footer = substituteVars(footerHtml, config);
    const body = templateHtml
      ? templateHtml.replace("{{content}}", '<div style="border:2px dashed var(--border);padding:24px;text-align:center;color:var(--text-muted);border-radius:8px;margin:16px 0">Page sections go here</div>')
      : '<span style="color:var(--text-muted)">No content yet</span>';
    return (
      <>
        {header && <SafeHtml html={header} />}
        <SafeHtml html={body} />
        {footer && <SafeHtml html={footer} />}
      </>
    );
  }

  return <TemplateManager apiPath="/api/page-templates" title="Page Templates" objectType="page_template" renderPreview={renderPreview} />;
}
