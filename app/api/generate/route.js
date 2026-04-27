import pool from "@/lib/db";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireAuth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeHtml } from "@/lib/sanitize";

async function getKey(key) {
  const [rows] = await pool.query("SELECT config_value FROM system_config WHERE config_key = ?", [key]);
  return rows[0]?.config_value || "";
}

async function getActivePromptRow(scopeKey) {
  const [rows] = await pool.query("SELECT id, version, content FROM prompts WHERE scope_key = ? AND is_active = 1", [scopeKey]);
  return rows[0] || null;
}

async function callOpenAI(apiKey, systemPrompt, userPrompt, imageData) {
  const client = new OpenAI({ apiKey });
  const model = "gpt-4o-mini";
  const content = [{ type: "text", text: userPrompt }];
  if (imageData) content.push({ type: "image_url", image_url: { url: `data:${imageData.mimeType};base64,${imageData.base64}` } });
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content },
    ],
  });
  return { html: res.choices[0].message.content, model };
}

async function callClaude(apiKey, systemPrompt, userPrompt, imageData) {
  const client = new Anthropic({ apiKey });
  const model = "claude-sonnet-4-20250514";
  const content = [];
  if (imageData) content.push({ type: "image", source: { type: "base64", media_type: imageData.mimeType, data: imageData.base64 } });
  content.push({ type: "text", text: userPrompt });
  const res = await client.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content }],
  });
  return { html: res.content[0].text, model };
}

async function callGemini(apiKey, systemPrompt, userPrompt, imageData) {
  const client = new GoogleGenerativeAI(apiKey);
  const model = "gemini-2.5-flash";
  const genModel = client.getGenerativeModel({ model });
  const parts = [{ text: `${systemPrompt}\n\n${userPrompt}` }];
  if (imageData) parts.push({ inlineData: { mimeType: imageData.mimeType, data: imageData.base64 } });
  const res = await genModel.generateContent(parts);
  return { html: res.response.text(), model };
}

export async function POST(req) {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {

    const { provider, prompt, currentHtml, objectType, objectKey, imageData } = await req.json();
    if (!prompt) return NextResponse.json({ error: "Prompt required" }, { status: 400 });
    if (prompt.length > 10_000 || (currentHtml && currentHtml.length > 100_000)) {
      return NextResponse.json({ error: "Input too large" }, { status: 400 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!rateLimit(`generate:${ip}`, 10, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
    }

    const keyMap = { openai: "openai_api_key", claude: "claude_api_key", gemini: "gemini_api_key" };
    const apiKey = await getKey(keyMap[provider] || keyMap.gemini);
    if (!apiKey) return NextResponse.json({ error: `No API key configured for ${provider}` }, { status: 400 });

    // Fetch prompt rows for logging
    const sysRow = await getActivePromptRow("system");
    const typeRow = objectType ? await getActivePromptRow(objectType) : null;
    const objRow = objectKey ? await getActivePromptRow(objectKey) : null;

    const parts = [sysRow?.content, typeRow?.content, objRow?.content].filter(Boolean);
    const systemPrompt = parts.join("\n\n");
    const userPrompt = `<current_template>\n${currentHtml || "(empty)"}\n</current_template>\n\n<user_request>\n${prompt}\n</user_request>`;

    try {
      const handlers = { openai: callOpenAI, claude: callClaude, gemini: callGemini };
      const result = await (handlers[provider] || handlers.gemini)(apiKey, systemPrompt, userPrompt, imageData);

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
          prompt, currentHtml || null, result.html,
        ]
      );

      return NextResponse.json({ html: sanitizeHtml(result.html) });
    } catch (e) {
      console.error("LLM generation error:", e);
      return NextResponse.json({ error: "Generation failed" }, { status: 500 });
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
