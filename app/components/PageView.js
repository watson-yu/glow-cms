export default function PageView({ page }) {
  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {page.header_content && <div dangerouslySetInnerHTML={{ __html: page.header_content }} />}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 20px" }}>
        <h1 style={{ margin: "0 0 16px" }}>{page.title}</h1>
        {page.sections?.map((s, i) => (
          <section key={i} style={{ marginBottom: 24 }}>
            <div dangerouslySetInnerHTML={{ __html: s.content }} />
          </section>
        ))}
      </div>
      {page.footer_content && <div dangerouslySetInnerHTML={{ __html: page.footer_content }} />}
    </div>
  );
}
