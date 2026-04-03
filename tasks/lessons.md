# Lessons Learned

<!-- Append new lessons here as they are discovered. Format: -->
<!-- ## YYYY-MM-DD — Short title -->
<!-- What happened, what to do differently. -->

## 2026-04-02 — Markdown rendering in AI output panels
Raw markdown was leaking into the UI as literal asterisks. All AI text output surfaces (AIInsights, AIAssistant, DataChat, ReportBuilder) must use `renderMarkdown()` from `src/utils/renderMarkdown.jsx`. Never use `whitespace-pre-wrap` on AI-generated content.

## 2026-04-02 — Code Generator delimiter reliability
Small/local models (Ollama) often ignore `###CODE` delimiters and return fenced code blocks instead. The parser must handle both: strip delimiters first, then fall back to ` ```python ` fences, then strip stray backtick fences inside the delimiter block.

## 2026-04-02 — API key security
Never write API keys to files or display them in responses. Always remind users to revoke keys shared in plain text. `.env` must always be in `.gitignore` before first commit.

## 2026-04-02 — Provider priority
Free providers must come before paid ones: Ollama (local) → Groq (free) → Gemini (free tier) → NVIDIA → OpenAI → Anthropic. Groq uses `llama-3.3-70b-versatile` and is OpenAI-API-compatible.
