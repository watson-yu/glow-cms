import pool from "@/lib/db";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

async function getKey(key) {
  const [rows] = await pool.query("SELECT config_value FROM system_config WHERE config_key = ?", [key]);
  return rows[0]?.config_value || "";
}

async function getActivePromptRow(scopeKey) {
  const [rows] = await pool.query("SELECT id, version, content FROM prompts WHERE scope_key = ? AND is_active = 1", [scopeKey]);
  return rows[0] || null;
}

const KEY_MAP = { openai: "openai_api_key", claude: "claude_api_key", gemini: "gemini_api_key" };

async function callOpenAI(apiKey, systemPrompt, userPrompt, imageData) {
  const client = new OpenAI({ apiKey });
  const model = "gpt-4o-mini";
  const content = [{ type: "text", text: userPrompt }];
  if (imageData) content.push({ type: "image_url", image_url: { url: `data:${imageData.mimeType};base64,${imageData.base64}` } });
  const res = await client.chat.completions.create({ model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content }] });
  return { text: res.choices[0].message.content, model };
}

async function callClaude(apiKey, systemPrompt, userPrompt, imageData) {
  const client = new Anthropic({ apiKey });
  const model = "claude-sonnet-4-20250514";
  const content = [];
  if (imageData) content.push({ type: "image", source: { type: "base64", media_type: imageData.mimeType, data: imageData.base64 } });
  content.push({ type: "text", text: userPrompt });
  const res = await client.messages.create({ model, max_tokens: 4096, system: systemPrompt, messages: [{ role: "user", content }] });
  return { text: res.content[0].text, model };
}

async function callGemini(apiKey, systemPrompt, userPrompt, imageData) {
  const client = new GoogleGenerativeAI(apiKey);
  const model = "gemini-2.5-flash";
  const genModel = client.getGenerativeModel({ model });
  const parts = [{ text: `${systemPrompt}\n\n${userPrompt}` }];
  if (imageData) parts.push({ inlineData: { mimeType: imageData.mimeType, data: imageData.base64 } });
  const res = await genModel.generateContent(parts);
  return { text: res.response.text(), model };
}

const HANDLERS = { openai: callOpenAI, claude: callClaude, gemini: callGemini };

/**
 * Call an LLM with the versioned prompt chain and log the result.
 * @param {object} opts
 * @param {string} opts.provider - "openai" | "claude" | "gemini"
 * @param {string} opts.prompt - user prompt text
 * @param {string} [opts.currentHtml] - current template HTML for context
 * @param {string} [opts.objectType] - prompt scope type (e.g. "header", "section_type")
 * @param {string} [opts.objectKey] - prompt scope key (e.g. "header:1")
 * @param {object} [opts.imageData] - { base64, mimeType }
 * @returns {{ text: string, model: string }}
 */
export async function callLLM({ provider = "gemini", prompt, currentHtml, objectType, objectKey, imageData, skipPromptChain }) {
  const apiKey = await getKey(KEY_MAP[provider] || KEY_MAP.gemini);
  if (!apiKey) throw new Error(`No API key configured for ${provider}`);

  // Build prompt chain
  let systemPrompt = "";
  let sysRow = null, typeRow = null, objRow = null;
  if (!skipPromptChain) {
    sysRow = await getActivePromptRow("system");
    typeRow = objectType ? await getActivePromptRow(objectType) : null;
    objRow = objectKey ? await getActivePromptRow(objectKey) : null;
    systemPrompt = [sysRow?.content, typeRow?.content, objRow?.content].filter(Boolean).join("\n\n");
  }

  const userPrompt = currentHtml != null
    ? `<current_template>\n${currentHtml || "(empty)"}\n</current_template>\n\n<user_request>\n${prompt}\n</user_request>`
    : prompt;

  const handler = HANDLERS[provider] || HANDLERS.gemini;
  const result = await handler(apiKey, systemPrompt, userPrompt, imageData);

  // Log generation
  await pool.query(
    `INSERT INTO generation_logs (provider, model, object_type, object_key,
      system_prompt_id, system_prompt_version,
      type_prompt_id, type_prompt_version,
      object_prompt_id, object_prompt_version,
      user_prompt, current_html, response_html)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      provider, result.model, objectType || null, objectKey || null,
      sysRow?.id || null, sysRow?.version || null,
      typeRow?.id || null, typeRow?.version || null,
      objRow?.id || null, objRow?.version || null,
      prompt, currentHtml || null, result.text,
    ]
  );

  return result;
}
