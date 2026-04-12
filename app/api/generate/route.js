import pool from "@/lib/db";
import { NextResponse } from "next/server";

async function getKey(key) {
  const [rows] = await pool.query("SELECT config_value FROM system_config WHERE config_key = ?", [key]);
  return rows[0]?.config_value || "";
}

async function getActivePrompt(scopeKey) {
  const [rows] = await pool.query("SELECT content FROM prompts WHERE scope_key = ? AND is_active = 1", [scopeKey]);
  return rows[0]?.content || "";
}

async function buildSystemPrompt(objectType, objectKey) {
  const parts = [await getActivePrompt("system")];
  if (objectType) parts.push(await getActivePrompt(objectType));
  if (objectKey) parts.push(await getActivePrompt(objectKey));
  return parts.filter(Boolean).join("\n\n");
}

async function callOpenAI(apiKey, systemPrompt, userPrompt) {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey });
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  return res.choices[0].message.content;
}

async function callClaude(apiKey, systemPrompt, userPrompt) {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  return res.content[0].text;
}

async function callGemini(apiKey, systemPrompt, userPrompt) {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });
  const res = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
  return res.response.text();
}

export async function POST(req) {
  const { provider, prompt, currentHtml, objectType, objectKey } = await req.json();
  if (!prompt) return NextResponse.json({ error: "Prompt required" }, { status: 400 });

  const keyMap = { openai: "openai_api_key", claude: "claude_api_key", gemini: "gemini_api_key" };
  const apiKey = await getKey(keyMap[provider] || keyMap.gemini);
  if (!apiKey) return NextResponse.json({ error: `No API key configured for ${provider}` }, { status: 400 });

  const systemPrompt = await buildSystemPrompt(objectType, objectKey);
  const userPrompt = `Current template:\n${currentHtml || "(empty)"}\n\nRequest: ${prompt}`;

  console.log("[Generate] provider:", provider, "system prompt length:", systemPrompt.length);

  try {
    const handlers = { openai: callOpenAI, claude: callClaude, gemini: callGemini };
    const html = await (handlers[provider] || handlers.gemini)(apiKey, systemPrompt, userPrompt);
    console.log("[LLM Response]", provider, JSON.stringify(html).slice(0, 200));
    return NextResponse.json({ html });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
