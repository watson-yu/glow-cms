"use client";
import { useRef } from "react";
import TemplateManager from "@/app/cms-admin/components/TemplateManager";

export default function SectionTypesPage() {
  const ref = useRef();
  return (
    <>
      <div className="page-header">
        <h1>Section Types</h1>
        <button className="btn btn-primary" onClick={() => ref.current?.startNew()}>+ Add New</button>
      </div>
      <TemplateManager ref={ref} apiPath="/api/section-types" contentField="default_content" contentLabel="Default Content (HTML)" />
    </>
  );
}
