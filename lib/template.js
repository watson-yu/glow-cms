/**
 * Replace {{variable}} placeholders with values from config.
 * Works both server-side and client-side.
 */
export function substituteVars(template, config, { stripUnresolved = false } = {}) {
  if (!template) return template;
  // Only resolve own keys: the `\w+` token matches prototype names like
  // `__proto__`/`constructor`/`prototype`, and a bare `config[key]` would pull
  // those off the prototype chain (e.g. leaking the Object constructor), so
  // guard the lookup with Object.hasOwn before reading.
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    (config && Object.hasOwn(config, key) ? config[key] : undefined) ??
    (stripUnresolved ? "" : `{{${key}}}`)
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
