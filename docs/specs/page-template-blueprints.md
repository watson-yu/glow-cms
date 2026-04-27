# Page Template Blueprints

## Summary

Evolve page templates from plain HTML layout shells into full page blueprints that bundle a header, footer, and an ordered list of section types. When a page is created from a blueprint, it inherits all of these as starting defaults.

## Motivation

The current page template is just an HTML wrapper with a `{{content}}` placeholder. Users must manually assign a header, footer, and add sections to every new page. With a 2-level category tree and batch page creation, this means repetitive setup.

Blueprints let an admin define "Level-1 Category Page" or "Level-2 Category Page" templates that carry the full page structure. Batch-creating 50 pages from a category tree becomes a one-click operation with consistent structure.

## Design

### Schema Changes

Add columns to `page_templates`:

```sql
ALTER TABLE page_templates
  ADD COLUMN header_id INT DEFAULT NULL,
  ADD COLUMN footer_id INT DEFAULT NULL,
  ADD CONSTRAINT fk_pt_header FOREIGN KEY (header_id) REFERENCES headers(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_pt_footer FOREIGN KEY (footer_id) REFERENCES footers(id) ON DELETE SET NULL;
```

New join table for blueprint sections:

```sql
CREATE TABLE page_template_sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  page_template_id INT NOT NULL,
  section_type_id INT NOT NULL,
  sort_order INT DEFAULT 0,
  CONSTRAINT fk_pts_template FOREIGN KEY (page_template_id) REFERENCES page_templates(id) ON DELETE CASCADE,
  CONSTRAINT fk_pts_section_type FOREIGN KEY (section_type_id) REFERENCES section_types(id) ON DELETE CASCADE
);
```

### Data Model

```
page_templates
  ├── name              (existing)
  ├── content           (existing — HTML layout with {{content}} placeholder)
  ├── header_id         (new — default header for pages created from this template)
  ├── footer_id         (new — default footer for pages created from this template)
  └── page_template_sections[]  (new — ordered list of section types)
        ├── section_type_id
        └── sort_order
```

### Page Creation from Blueprint

When a page is created with a `page_template_id`:

1. Copy `header_id` and `footer_id` from the template to the new page (if not already set).
2. For each entry in `page_template_sections` (ordered by `sort_order`):
   - Create a `sections` row linked to the new page and the `section_type_id`.
   - Copy `default_content` from the section type as the section's `content`.
   - Auto-fill fixed variables from `section_types.variables` definitions.
   - Leave prompt variables empty (to be generated separately).
3. The page's `page_template_id` is set as usual (controls the HTML layout wrapper).

This applies to both single page creation and batch creation from the category tree.

### Batch Creation Integration

The existing batch-create flow in `/cms-admin/categories` currently creates pages with a selected template but no sections. With blueprints:

1. User selects a page template (blueprint) in the batch-create dialog.
2. Each created page gets the blueprint's header, footer, and sections.
3. After creation, the existing auto-generate flow fills prompt variables per page (using category context).

### Admin UI Changes

#### Page Templates Editor (`/cms-admin/page-templates`)

Add to the existing TemplateManager-based editor:

1. **Header/Footer selectors** — two dropdowns above the preview, selecting which header and footer this blueprint uses. These are optional (null = page must set its own).
2. **Blueprint Sections panel** — below the preview, an ordered list of section types. Each row shows the section type name with drag-to-reorder (or up/down buttons) and a remove button. An "Add Section Type" dropdown appends to the list.
3. **Preview** — the existing preview already shows header + template + footer. Extend it to also render the blueprint sections inside the `{{content}}` area, giving a full page preview.

#### Page Creation

No changes to the page creation form itself. The API handles blueprint expansion server-side when `page_template_id` is provided.

### API Changes

#### `GET /api/page-templates`

Response adds `header_id`, `footer_id`, and `sections` array:

```json
{
  "id": 1,
  "name": "Level-1 Category",
  "content": "<div class=\"page\">{{content}}</div>",
  "header_id": 2,
  "footer_id": 1,
  "sections": [
    { "id": 1, "section_type_id": 5, "sort_order": 0 },
    { "id": 2, "section_type_id": 3, "sort_order": 1 }
  ]
}
```

#### `POST /api/page-templates` and `PUT /api/page-templates/[id]`

Accept `header_id`, `footer_id`, and `sections` array in the request body. The `sections` array is `[{ section_type_id, sort_order }]`. On PUT, delete existing `page_template_sections` rows and re-insert (same pattern as page sections).

#### `POST /api/pages`

When `page_template_id` is provided and the page has no sections in the request body, expand the blueprint:
- Set `header_id` and `footer_id` from the template (if not explicitly provided).
- Create sections from `page_template_sections`.

### What Does NOT Change

- **Existing pages** are unaffected. They keep their current header, footer, and sections.
- **Existing page templates** become blueprints with no header, footer, or sections (all null/empty). Fully backward compatible.
- **Page-level overrides** remain. A page created from a blueprint can change its header, footer, add/remove sections freely after creation.
- **The `content` field** (HTML layout) stays. It wraps the assembled sections via `{{content}}`. Blueprints add structure inside that wrapper.
- **Runtime rendering** in `lib/pages.js` is unchanged. It already assembles sections into the template. Blueprints only affect page creation time.

### Migration

```sql
ALTER TABLE page_templates
  ADD COLUMN header_id INT DEFAULT NULL,
  ADD COLUMN footer_id INT DEFAULT NULL,
  ADD CONSTRAINT fk_pt_header FOREIGN KEY (header_id) REFERENCES headers(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_pt_footer FOREIGN KEY (footer_id) REFERENCES footers(id) ON DELETE SET NULL;

CREATE TABLE page_template_sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  page_template_id INT NOT NULL,
  section_type_id INT NOT NULL,
  sort_order INT DEFAULT 0,
  CONSTRAINT fk_pts_template FOREIGN KEY (page_template_id) REFERENCES page_templates(id) ON DELETE CASCADE,
  CONSTRAINT fk_pts_section_type FOREIGN KEY (section_type_id) REFERENCES section_types(id) ON DELETE CASCADE
);
```

Update `db/schema.sql` to include these in the bootstrap schema.
