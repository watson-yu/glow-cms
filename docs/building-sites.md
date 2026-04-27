# Building Sites With Glow CMS

This guide is for the practical workflow of using Glow CMS to build a full site.

## Two Common Entry Paths

### Path A: Building A Full Site

Use this path if you are starting a new site with a developer + marketer workflow.

The best mental model is:
- the category tree defines the site structure
- headers, footers, and page templates define the shell
- section types define reusable page modules
- prompts define how AI generates HTML and copy
- pages bind all of that into a publishable site

Recommended order:
1. Boot the app and connect MySQL.
2. Configure `system_config` with at least one LLM API key, optional auth, and optional external category DB sync.
3. Configure `site_config` with branding, `content_path`, legal links, and reusable site variables.
4. Build the 2-level category tree in `/cms-admin/categories`.
5. Create one or more headers, footers, and page templates.
6. Create a reusable section library in `/cms-admin/section-types`.
7. Add system, object-type, and object-level prompts.
8. Batch-create pages from the category tree.
9. Edit pages, add sections, re-generate variables as needed, preview, and publish.

Suggested first reusable sections:
- Hero
- Overview
- Benefits
- Features
- FAQ
- CTA
- Related Links

Good reusable variables:
- `headline`
- `subheadline`
- `intro`
- `primary_cta`
- `faq_1_question`
- `faq_1_answer`

### Path B: Coming From WordPress

Use this path if you normally build with WordPress and want to understand Glow quickly.

Concept mapping:

| WordPress concept | Glow CMS equivalent |
|---|---|
| Site settings / Customizer | `site_config` + `system_config` |
| Theme header/footer | `headers` / `footers` |
| Page template | `page_templates` |
| Reusable blocks / flexible layouts | `section_types` |
| Custom fields | `sections.variables` |
| Categories taxonomy | `categories` |
| Pages table | `pages` |
| AI plugin prompts | `prompts` |
| AI audit trail | `generation_logs` |

The biggest differences:
- Glow works best when the category tree becomes the canonical site structure.
- Pages can be batch-created from categories instead of being authored one by one.
- Section types are live templates, so updating a section type can update many pages at render time.
- Prompt control is built into the CMS instead of being bolted on through plugins.

Recommended migration-style workflow:
1. Define the 2-level category tree first.
2. Create the global shell with headers, footers, and page templates.
3. Build a reusable section library instead of page-by-page custom layouts.
4. Use prompt layers to generate and refine reusable assets.
5. Batch-create pages from categories and then edit exceptions manually.

## How Site Structure Works

The `categories` table is not just organizational metadata. In this project it is the backbone for full-site generation.

The model is a strict 2-level tree:
- level 1 = major hub
- level 2 = child page/topic/service

The Categories admin page can:
- create categories manually
- sync them from an external MySQL database
- batch-create pages for selected categories

That means Glow can turn a taxonomy-like structure into an actual page inventory quickly.

## Template Variables

Headers, footers, page templates, and section content support `{{variable}}` placeholders that are substituted at render time:

| Variable | Source |
|---|---|
| `{{site_title}}` | Site Config |
| `{{logo_url}}` | Site Config |
| `{{copyright_text}}` | Site Config |
| `{{privacy_link}}` | Site Config |
| `{{terms_link}}` | Site Config |
| `{{content_path}}` | Site Config |
| `{{custom_key}}` | Site Config (user-defined custom variables) |
| `{{content}}` | Page template only — replaced with assembled section HTML |
| `{{section_var}}` | Section variables — per-page values defined in section type |

### Section Variables

Section types can define page variables with two modes:
- **Prompt** — LLM auto-generates the value using the prompt text (supports `{{category}}`, `{{title}}`, `{{slug}}`)
- **Fixed** — the label text is used directly as the value

When a section is added to a page, prompt-type variables are auto-generated in the background. Existing values can be refreshed with the **Re-generate** button, which regenerates all prompt-based variables except those manually edited.

How to think about variables:
- `section_types.variables` defines the schema for a reusable section
- `sections.variables` stores the actual per-page values
- pages do not store a frozen rendered copy of the section template; they store values that are applied to the current section type template at render time

Practical rule:
- put reusable structure in the section type HTML (public rendering always uses the current section type template)
- put per-page differences in variables

### Existing Pages And Variable Changes

Changing a section type does not affect existing pages in one single way. There are 2 different cases:

1. **Template source changes**
   - Updating `section_types.default_content` affects all existing pages using that section type at render time.
   - No page data migration is needed because public rendering uses the current section type template.

2. **Variable schema or prompt changes**
   - Existing pages keep their stored `sections.variables`.
   - New **fixed** variables appear automatically at render time — the renderer synthesizes defaults from `section_types.variables` labels, so no backfill is required for them to display.
   - New **prompt** variables do not appear until values are generated or entered, since the renderer has no default for them.
   - Prompt changes do not automatically rewrite existing page values.

Glow tracks variable origin so existing content can be handled more safely:
- `manual` = edited by a human in the page editor
- `ai_generated` = generated or filled by the system

Recommended behavior for existing pages:
- **Add a new fixed variable**: live immediately at render time; use propagate to persist values for editing
- **Add a new prompted variable**: generate only missing values
- **Change prompt text**: review and explicitly regenerate AI-generated values if needed
- **Manual values**: do not overwrite automatically

Safest operational rule:
- template changes can roll out immediately
- content regeneration should be explicit

If you are updating a heavily-used section type, start with:
1. save the section type change
2. preview a few existing pages
3. fill missing fixed variables if needed
4. generate missing prompted variables if needed
5. only then consider refreshing existing AI-generated values

## AI Generation

The template editor includes an AI generation panel. When you click "Generate":

1. The system prompt (from System Config) is loaded
2. The object-type prompt (e.g. "header") is appended if set
3. The object-specific prompt (e.g. "header:1") is appended if set
4. Your ad-hoc prompt + current HTML + section variable definitions are sent as the user message
5. Optionally, an attached image is included for vision-capable generation
6. The LLM returns HTML that replaces the template source

Each successful generation is also written to `generation_logs`, which powers the `/cms-admin/generation-logs` audit view.

Supported providers: OpenAI (gpt-4o-mini), Anthropic (claude-sonnet-4-20250514), Gemini (gemini-2.5-flash).

Prompt scopes:
- **System** — global brand, tone, structure, SEO, and quality rules
- **Object Type** — rules for all headers, all footers, all page templates, or all section types
- **Object** — rules for one specific template or section

This prompt layering is what makes large-scale site generation manageable.

### How Prompt Layers Apply

Glow uses prompt layers for different jobs:

- **System prompt**
  - defines the site-wide rules
  - good for brand voice, SEO posture, compliance constraints, CTA style, and HTML quality requirements

- **Object type prompt**
  - defines behavior for a whole class of assets
  - good for rules like "all landing-page heroes should be conversion-focused" or "all footers should stay concise"

- **Object prompt**
  - defines behavior for one specific header, footer, page template, or section type
  - good for special-purpose assets that need stronger local instructions

For section types, this means the effective generation behavior can come from:
1. the global system prompt
2. the `section_type` object-type prompt
3. the object prompt for that specific section type

### Prompt Changes And Existing Pages

Prompt updates are not the same as template updates.

Template updates are live immediately because rendering uses the latest section type source.

Prompt updates are different:
- they change how future generation behaves
- they do not automatically replace stored page variable values
- they should usually trigger a review step, not an automatic rewrite

Best practice when prompts change for a section type:
1. update the prompt
2. test generation on a sample page
3. preview output quality
4. generate missing values where needed
5. refresh existing AI-generated values only if the new prompt is clearly better

For production sites, treat prompt changes as content-policy changes. They can affect tone, claims, conversion language, and SEO behavior across many pages.
