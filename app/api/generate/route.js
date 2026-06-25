import pool from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { MAX_OUTPUT_TOKENS, cleanGeneratedHtml } from "@/lib/llm";
import { NextResponse } from "next/server";

async function getKey(key) {
  const [rows] = await pool.query("SELECT config_value FROM system_config WHERE config_key = ?", [key]);
  return rows[0]?.config_value || "";
}

async function getActivePromptRow(scopeKey) {
  const [rows] = await pool.query("SELECT id, version, content FROM prompts WHERE scope_key = ? AND is_active = 1", [scopeKey]);
  return rows[0] || null;
}

// Deterministic, offline stub provider — enabled ONLY when GLOW_LLM_STUB=1.
// The E2E suite sets this so the full generate → publish → render pipeline runs
// fast, without network, and without any real API keys or credits. It returns
// clean, fence-free HTML that deliberately contains NO {{placeholder}} tokens
// and NO dead CTAs (every link is a literal URL), mirroring what the hardened
// system prompt asks a real model to produce. Never enabled in production.
function stubGenerate(prompt) {
  // Echo the request as a heading, with any template-token characters stripped
  // so the output can never leak `{{ }}` into a published page.
  const heading = String(prompt || "Section")
    .replace(/[{}<>]/g, "")
    .trim()
    .slice(0, 120) || "Section";
  const rawText = [
    `<section class="generated-section">`,
    `  <h2>${heading}</h2>`,
    `  <p>This is deterministic stub content generated for end-to-end testing.</p>`,
    `  <a class="cta" href="https://example.com/contact">Contact us</a>`,
    `</section>`,
  ].join("\n");
  return { rawText, truncated: false, model: "stub" };
}

// Each provider returns a normalized shape: { rawText, truncated, model }.
// rawText is the unprocessed model output (may be null/empty on a refusal or
// content filter); truncated is true when the provider stopped because it hit
// the output token budget. The POST handler applies the shared empty-guard /
// fence-strip / truncation checks so all three behave identically.

async function callOpenAI(apiKey, systemPrompt, userPrompt, imageData) {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey });
  const model = "gpt-4o-mini";
  const content = [{ type: "text", text: userPrompt }];
  if (imageData) content.push({ type: "image_url", image_url: { url: `data:${imageData.mimeType};base64,${imageData.base64}` } });
  const res = await client.chat.completions.create({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content },
    ],
  });
  const choice = res.choices?.[0];
  // content is null on a content-filter stop; finish_reason "length" means the
  // output was cut off at max_tokens.
  return {
    rawText: choice?.message?.content ?? "",
    truncated: choice?.finish_reason === "length",
    model,
  };
}

async function callClaude(apiKey, systemPrompt, userPrompt, imageData) {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });
  const model = "claude-sonnet-4-20250514";
  const content = [];
  if (imageData) content.push({ type: "image", source: { type: "base64", media_type: imageData.mimeType, data: imageData.base64 } });
  content.push({ type: "text", text: userPrompt });
  const res = await client.messages.create({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: systemPrompt,
    messages: [{ role: "user", content }],
  });
  // The content array can lead with a non-text block (e.g. thinking); pick the
  // first text block rather than assuming index 0. stop_reason "max_tokens"
  // means the response was truncated at the budget.
  const textBlock = res.content?.find((b) => b.type === "text");
  return {
    rawText: textBlock?.text ?? "",
    truncated: res.stop_reason === "max_tokens",
    model,
  };
}

async function callGemini(apiKey, systemPrompt, userPrompt, imageData) {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const client = new GoogleGenerativeAI(apiKey);
  const model = "gemini-2.5-flash";
  const genModel = client.getGenerativeModel({ model, generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS } });
  const parts = [{ text: `${systemPrompt}\n\n${userPrompt}` }];
  if (imageData) parts.push({ inlineData: { mimeType: imageData.mimeType, data: imageData.base64 } });
  const res = await genModel.generateContent(parts);
  // .text() throws if the candidate was blocked or returned no text; treat that
  // as an empty completion rather than letting it escape. finishReason
  // "MAX_TOKENS" means the output hit the budget.
  let rawText = "";
  try {
    rawText = res.response?.text() ?? "";
  } catch {
    rawText = "";
  }
  const finishReason = res.response?.candidates?.[0]?.finishReason;
  return { rawText, truncated: finishReason === "MAX_TOKENS", model };
}

export async function POST(req) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const { provider, prompt, currentHtml, objectType, objectKey, imageData } = await req.json();
  if (!prompt) return NextResponse.json({ error: "Prompt required" }, { status: 400 });

  // Offline test path: skip the API-key requirement and the real provider call.
  const useStub = process.env.GLOW_LLM_STUB === "1";

  const keyMap = { openai: "openai_api_key", claude: "claude_api_key", gemini: "gemini_api_key" };
  const apiKey = useStub ? "stub" : await getKey(keyMap[provider] || keyMap.gemini);
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
    const result = useStub
      ? stubGenerate(prompt)
      : await (handlers[provider] || handlers.gemini)(apiKey, systemPrompt, userPrompt, imageData);

    // Guard against empty/refused completions and strip any stray markdown
    // fences. Throws if there is no usable HTML — handled below so we never
    // persist empty HTML to generation_logs as if it were a complete page.
    const html = cleanGeneratedHtml(result.rawText);

    // If the provider truncated at the output budget, surface a clear warning
    // instead of silently returning/storing a partial (mid-tag) page.
    if (result.truncated) {
      return NextResponse.json(
        {
          error:
            "LLM response was truncated (hit the output token limit) — the HTML is incomplete. Try a shorter request or split it into sections.",
          truncated: true,
        },
        { status: 502 }
      );
    }

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
        prompt, currentHtml || null, html,
      ]
    );

    return NextResponse.json({ html });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
