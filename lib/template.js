/**
 * Replace {{variable}} placeholders with values from config.
 * Works both server-side and client-side.
 */
export function substituteVars(template, config, { stripUnresolved = false } = {}) {
  if (!template) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    config[key] ?? (stripUnresolved ? "" : `{{${key}}}`)
  );
}

/**
 * Inject assembled section HTML into a page template's {{content}} placeholder(s).
 *
 * Uses a function replacement so `$`-sequences in the section HTML/CSS/JS
 * (e.g. `$$` in prices, `$&` in jQuery/regex/templating) are inserted
 * literally rather than interpreted as `String.prototype.replace` patterns,
 * and replaceAll so every {{content}} placeholder is filled (not just the first).
 */
export function injectContent(template, content) {
  if (!template) return template;
  return template.replaceAll("{{content}}", () => content);
}
