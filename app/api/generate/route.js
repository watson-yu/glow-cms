import pool from "@/lib/db";
import { NextResponse } from "next/server";

async function getKey(key) {
  const [rows] = await pool.query("SELECT config_value FROM system_config WHERE config_key = ?", [key]);
  return rows[0]?.config_value || "";
}

async function getActivePromptRow(scopeKey) {
  const [rows] = await pool.query("SELECT id, version, content FROM prompts WHERE scope_key = ? AND is_active = 1", [scopeKey]);
  return rows[0] || null;
}

async function callOpenAI(apiKey, systemPrompt, userPrompt) {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey });
  const model = "gpt-4o-mini";
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  return { html: res.choices[0].message.content, model };
}

async function callClaude(apiKey, systemPrompt, userPrompt) {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });
  const model = "claude-sonnet-4-20250514";
  const res = await client.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  return { html: res.content[0].text, model };
}

async function callGemini(apiKey, systemPrompt, userPrompt) {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const client = new GoogleGenerativeAI(apiKey);
  const model = "gemini-2.5-flash";
  const genModel = client.getGenerativeModel({ model });
  const res = await genModel.generateContent(`${systemPrompt}\n\n${userPrompt}`);
  return { html: res.response.text(), model };
}

export async function POST(req) {
  const { provider, prompt, currentHtml, objectType, objectKey } = await req.json();
  if (!prompt) return NextResponse.json({ error: "Prompt required" }, { status: 400 });

  const keyMap = { openai: "openai_api_key", claude: "claude_api_key", gemini: "gemini_api_key" };
  const apiKey = await getKey(keyMap[provider] || keyMap.gemini);
  if (!apiKey) return NextResponse.json({ error: `No API key configured for ${provider}` }, { status: 400 });

  // Fetch prompt rows for logging
  const sysRow = await getActivePromptRow("system");
  const typeRow = objectType ? await getActivePromptRow(objectType) : null;
  const objRow = objectKey ? await getActivePromptRow(objectKey) : null;

  const parts = [sysRow?.content, typeRow?.content, objRow?.content].filter(Boolean);
  const systemPrompt = parts.join("\n\n");
  const userPrompt = `Current template:\n${currentHtml || "(empty)"}\n\nRequest: ${prompt}`;

  try {
    const handlers = { openai: callOpenAI, claude: callClaude, gemini: callGemini };
    const result = await (handlers[provider] || handlers.gemini)(apiKey, systemPrompt, userPrompt);

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

    return NextResponse.json({ html: result.html });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
