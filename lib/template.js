/**
 * Replace {{variable}} placeholders with values from config.
 * Works both server-side and client-side.
 */
export function substituteVars(template, config) {
  if (!template) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => config[key] ?? `{{${key}}}`);
}
