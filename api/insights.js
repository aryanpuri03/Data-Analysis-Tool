/**
 * Vercel Edge Function — AI API Proxy
 * Keeps API keys server-side so they never reach the client.
 *
 * GET  /api/insights  → health check: { status, providers }
 * POST /api/insights  → { prompt, maxTokens?, systemPrompt? }
 *                     → { content, provider, model, usage? }
 *
 * Provider priority: Ollama (local/free) > Groq (free) > Gemini (free tier) > NVIDIA > OpenAI > Anthropic
 *
 * FREE providers:
 *   Groq    — free API key at console.groq.com, no credit card needed
 *   Gemini  — free tier at aistudio.google.com (gemini-2.0-flash-lite)
 *   Ollama  — fully local, no API key needed
 */

export const config = { runtime: 'edge' }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  const ollamaUrl    = process.env.OLLAMA_URL
  const ollamaModel  = process.env.OLLAMA_MODEL || 'deepseek-coder:1.3b'
  const groqKey      = process.env.GROQ_API_KEY
  const geminiKey    = process.env.GEMINI_API_KEY
  const nvidiaKey    = process.env.NVIDIA_API_KEY
  const openaiKey    = process.env.OPENAI_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  const activeProviders = [
    ollamaUrl    && 'ollama',
    groqKey      && 'groq',
    geminiKey    && 'gemini',
    nvidiaKey    && 'nvidia',
    openaiKey    && 'openai',
    anthropicKey && 'anthropic',
  ].filter(Boolean)

  // ── GET: health check ──
  if (req.method === 'GET') {
    return json({
      status: activeProviders.length > 0 ? 'ok' : 'unconfigured',
      providers: activeProviders,
      message: activeProviders.length === 0
        ? 'Set GROQ_API_KEY (free at console.groq.com) or GEMINI_API_KEY (free at aistudio.google.com) in Vercel environment variables.'
        : `Active: ${activeProviders.join(', ')}`,
    })
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  if (activeProviders.length === 0) {
    return json({ error: 'No AI provider configured. Add GROQ_API_KEY (free at console.groq.com) or GEMINI_API_KEY (free at aistudio.google.com) to your Vercel environment variables.' }, 500)
  }

  let body
  try { body = await req.json() }
  catch { return json({ error: 'Invalid JSON body' }, 400) }

  let { prompt, maxTokens = 1024, systemPrompt } = body

  if (!prompt || typeof prompt !== 'string') {
    return json({ error: 'Missing or invalid prompt field' }, 400)
  }

  // Sanitize
  prompt = prompt.trim().slice(0, 8000)
  if (systemPrompt) systemPrompt = String(systemPrompt).trim().slice(0, 2000)

  const DEFAULT_SYSTEM = 'You are a senior data analyst at Edinburgh Airport. Respond with precise, professional analysis. Use declarative statements backed by specific numbers from the data. No filler phrases, no hedging. Be concise and direct.'
  const activeSystem = systemPrompt || DEFAULT_SYSTEM

  const provider = ollamaUrl ? 'ollama'
    : groqKey     ? 'groq'
    : geminiKey   ? 'gemini'
    : nvidiaKey   ? 'nvidia'
    : openaiKey   ? 'openai'
    : 'anthropic'

  let upstreamRes
  try {
    if (provider === 'ollama') {
      upstreamRes = await fetch(`${ollamaUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          messages: [
            { role: 'system', content: activeSystem },
            { role: 'user', content: prompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.4,
          stream: false,
        }),
      })
    } else if (provider === 'groq') {
      // Groq — free API, OpenAI-compatible. Get key at console.groq.com
      const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
      upstreamRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: activeSystem },
            { role: 'user', content: prompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.4,
        }),
      })
    } else if (provider === 'gemini') {
      // Gemini — free tier at aistudio.google.com
      const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite'
      upstreamRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: maxTokens,
              temperature: 0.5,
            },
          }),
        }
      )
    } else if (provider === 'nvidia') {
      const model = process.env.NVIDIA_MODEL || 'meta/llama-3.3-70b-instruct'
      upstreamRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${nvidiaKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: activeSystem },
            { role: 'user', content: prompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.5,
        }),
      })
    } else if (provider === 'openai') {
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
      upstreamRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: activeSystem },
            { role: 'user', content: prompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.5,
        }),
      })
    } else {
      // Anthropic Claude
      const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'
      upstreamRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: activeSystem,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
    }
  } catch (fetchErr) {
    return json({ error: `Upstream request failed (${provider}): ${fetchErr.message}` }, 502)
  }

  let data
  try { data = await upstreamRes.json() }
  catch { return json({ error: `Invalid JSON from ${provider} API (HTTP ${upstreamRes.status})` }, 502) }

  if (!upstreamRes.ok) {
    const detail = data?.error?.message || data?.error || JSON.stringify(data)
    return json({ error: `${provider} API error ${upstreamRes.status}: ${detail}` }, upstreamRes.status)
  }

  let content = ''
  let model = ''
  let usage = null

  if (provider === 'ollama' || provider === 'groq' || provider === 'nvidia' || provider === 'openai') {
    content = data.choices?.[0]?.message?.content || ''
    model = data.model || ''
    if (data.usage) usage = { input: data.usage.prompt_tokens, output: data.usage.completion_tokens }
  } else if (provider === 'gemini') {
    content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    content = content.replace(/^```(?:json|javascript|js)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
    model = data.modelVersion || ''
    if (data.usageMetadata) usage = { input: data.usageMetadata.promptTokenCount, output: data.usageMetadata.candidatesTokenCount }
  } else {
    content = data.content?.[0]?.text || ''
    model = data.model || ''
    if (data.usage) usage = { input: data.usage.input_tokens, output: data.usage.output_tokens }
  }

  return json({ content, provider, model, usage })
}
