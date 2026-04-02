@/root/.claude/primer.md
@.claude-memory.md

# PROJECT CONTEXT

**Project:** Iconographpt — Edinburgh Airport CX internal data analysis platform
**Repo:** https://github.com/aryanpuri03/Data-Analysis-Tool
**Stack:** React 19 + Vite + Tailwind CSS, Recharts, PapaParse, SheetJS, Pyodide
**AI backend:** Vercel Edge Function (`api/insights.js`) — priority: Ollama → Groq → Gemini → NVIDIA → OpenAI → Anthropic
**Deploy:** Vercel free tier — `npm run build` → auto-deploy from main branch

## Project Overview

Iconographpt is a browser-based internal tool for Edinburgh Airport's CX team. Two modules:
- **Module 1 — Icon Library:** Browse, upload, and manage SVG icons (existing, unchanged)
- **Module 2 — Data Analysis:** Upload CSV/Excel, auto-profile, clean, chart, and get AI-powered insights

All data processing is client-side. Raw data never leaves the browser — only computed summaries are sent to AI.

## Project Structure

```
src/
  modules/
    upload/       DataUpload.jsx       — CSV/Excel upload + smart alerts
    profile/      DataProfile.jsx      — auto data profile panel
    clean/        DataClean.jsx        — interactive cleaning operations
    calculated/   CalculatedColumns.jsx
    charts/       ChartBuilder.jsx     — Recharts bar/line/scatter/pie
    pivot/        PivotTable.jsx
    correlation/  CorrelationMatrix.jsx
    forecast/     Forecasting.jsx
    anomaly/      AnomalyExplainer.jsx
    nlfilter/     NLFilter.jsx
    ai/           AIAssistant.jsx      — chat + auto-analyse
    chat/         DataChat.jsx         — conversational data chat
    insights/     AIInsights.jsx       — one-shot AI insights
    codegen/      CodeGenerator.jsx    — AI → Python/pandas code + live Pyodide execution
    report/       ReportBuilder.jsx    — AI executive report generator
    icons/        IconLibrary.jsx
  utils/
    renderMarkdown.jsx   — shared markdown → React renderer (USE THIS for all AI output)
    buildInsightPrompt.js
    computeProfile.js
    inferTypes.js
    extractJSON.js
    exportData.js
api/
  insights.js     — Vercel Edge Function AI proxy
  auth.js         — password gate
```

## PROJECT RULES

1. **Read `tasks/lessons.md` at the start of every session** before making any changes.
2. **Update `tasks/todo.md`** as you work — move items to Done when complete, add new tasks as discovered.
3. All AI output surfaces must use `renderMarkdown()` from `src/utils/renderMarkdown.jsx` — never `whitespace-pre-wrap`.
4. Never hardcode API keys. Never commit `.env`.
5. Keep files under 500 lines. Prefer editing existing files over creating new ones.
6. Run `npm run build` to verify no build errors before committing.
7. Free AI providers take priority over paid ones (see provider order above).

## Behavioral Rules

- Do what has been asked; nothing more, nothing less
- Always read a file before editing it
- NEVER create documentation files unless explicitly requested
- NEVER save working files to the root folder — use `src/`, `api/`, `tasks/`
