export default function PageView({ page }) {
  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {page.header_content && <div dangerouslySetInnerHTML={{ __html: page.header_content }} />}
      <div dangerouslySetInnerHTML={{ __html: page.body_content || "" }} />
      {page.footer_content && <div dangerouslySetInnerHTML={{ __html: page.footer_content }} />}
    </div>
  );
}
