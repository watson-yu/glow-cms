"use client";
import { useRef } from "react";
import TemplateManager from "@/app/cms-admin/components/TemplateManager";

export default function SectionTypesPage() {
  const ref = useRef();
  return <TemplateManager ref={ref} apiPath="/api/section-types" contentField="default_content" title="Section Types" objectType="section_type" showVariables />;
}
