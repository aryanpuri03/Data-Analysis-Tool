import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      tailwindcss(),
      // SPA fallback: rewrite app routes to app.html so the React router handles them
      {
        name: 'spa-fallback',
        configureServer(server) {
          // This runs BEFORE Vite's internal middleware
          server.middlewares.use((req, res, next) => {
            const url = req.url.split('?')[0]
            if (url === '/icon-library' || url === '/icon-library/') {
              req.url = '/index.html'
              return next()
            }
            // Redirect root to /upload (React app default route)
            if (url === '/' || url === '') {
              res.writeHead(302, { Location: '/upload' })
              res.end()
              return
            }
            // Let static files, api, assets, and index.html pass through
            if (
              url.startsWith('/api/') ||
              url.startsWith('/src/') ||
              url.startsWith('/assets/') ||
              url.startsWith('/icons/') ||
              url.startsWith('/@') ||
              url.startsWith('/node_modules/') ||
              url === '/index.html' ||
              url === '/app.html' ||
              url.includes('.')
            ) {
              return next()
            }
            // SPA routes (/charts, /upload, /profile, etc.) → serve app.html
            req.url = '/app.html'
            next()
          })
        },
      },
      // Local dev proxy for the /api/insights edge function
      {
        name: 'api-insights-proxy',
        configureServer(server) {
          server.middlewares.use('/api/insights', async (req, res) => {
            if (req.method === 'OPTIONS') {
              res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              })
              res.end()
              return
            }

            if (req.method !== 'POST') {
              res.writeHead(405, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Method not allowed' }))
              return
            }

            const ollamaUrl = env.OLLAMA_URL || 'http://localhost:11434'
            const ollamaModel = env.OLLAMA_MODEL || 'deepseek-coder:1.3b'
            const groqKey = env.GROQ_API_KEY
            const geminiKey = env.GEMINI_API_KEY
            const nvidiaKey = env.NVIDIA_API_KEY
            const anthropicKey = env.ANTHROPIC_API_KEY

            // Check if Ollama is reachable — use manual AbortController for Node compat
            let ollamaAvailable = false
            try {
              const ac = new AbortController()
              const t = setTimeout(() => ac.abort(), 2000)
              const ping = await fetch(`${ollamaUrl}/api/tags`, { signal: ac.signal })
              clearTimeout(t)
              ollamaAvailable = ping.ok
            } catch { /* not running or timed out */ }

            if (!ollamaAvailable && !groqKey && !geminiKey && !nvidiaKey && !anthropicKey) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'No AI provider available. Add GROQ_API_KEY (free at console.groq.com) or GEMINI_API_KEY (free at aistudio.google.com) to your .env file.' }))
              return
            }

            // Priority: Ollama (local/free) > Groq (free) > Gemini (free tier) > NVIDIA > Anthropic
            const provider = ollamaAvailable ? 'ollama' : groqKey ? 'groq' : geminiKey ? 'gemini' : nvidiaKey ? 'nvidia' : 'anthropic'

            let body = ''
            for await (const chunk of req) body += chunk
            const { prompt, maxTokens = 1024, systemPrompt } = JSON.parse(body)

            const DEFAULT_SYSTEM = 'You are a senior data analyst at Edinburgh Airport. Respond with precise, professional analysis. Use declarative statements backed by specific numbers from the data. No filler phrases, no hedging. Be concise and direct.'
            const activeSystem = systemPrompt || DEFAULT_SYSTEM

            if (!prompt || typeof prompt !== 'string') {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Missing or invalid prompt' }))
              return
            }

            try {
              let apiRes
              if (provider === 'ollama') {
                // Ollama OpenAI-compatible endpoint
                apiRes = await fetch(`${ollamaUrl}/v1/chat/completions`, {
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
                const model = env.GROQ_MODEL || 'llama-3.3-70b-versatile'
                apiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
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
                const model = env.GEMINI_MODEL || 'gemini-2.0-flash-lite'
                apiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.5 },
                  }),
                })
              } else if (provider === 'nvidia') {
                const model = env.NVIDIA_MODEL || 'meta/llama-3.3-70b-instruct'
                apiRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${nvidiaKey}` },
                  body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, temperature: 0.5, top_p: 1 }),
                })
              } else {
                apiRes = await fetch('https://api.anthropic.com/v1/messages', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
                  body: JSON.stringify({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: maxTokens,
                    system: 'You are a senior data analyst at Edinburgh Airport. Respond with precise, professional analysis. Use declarative statements backed by specific numbers. No filler phrases, no hedging, no conversational language. Cite exact figures. Be concise and direct.',
                    messages: [{ role: 'user', content: prompt }],
                  }),
                })
              }

              const data = await apiRes.json()
              if (!apiRes.ok) {
                res.writeHead(apiRes.status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
                res.end(JSON.stringify({ error: `API error: ${apiRes.status} — ${JSON.stringify(data)}` }))
                return
              }

              let content = ''
              if (provider === 'ollama' || provider === 'groq' || provider === 'nvidia') {
                content = data.choices?.[0]?.message?.content || ''
              } else if (provider === 'gemini') {
                content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
              } else {
                content = data.content?.[0]?.text || ''
              }

              res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
              res.end(JSON.stringify({ content, provider }))
            } catch (err) {
              res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
              res.end(JSON.stringify({ error: `Upstream API error: ${err.message}` }))
            }
          })
        },
      },
    ],
    appType: 'spa',
    build: {
      rollupOptions: {
        input: {
          app: 'app.html',
          index: 'index.html',
        },
      },
    },
    server: {
      open: '/upload',
      watch: {
        ignored: ['**/icons/**', '**/source/**', '**/.venv/**', '**/scripts/**', '**/index.html'],
      },
    },
    optimizeDeps: {
      exclude: [],
    },
  }
})
