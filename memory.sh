#!/usr/bin/env bash
# memory.sh — Launch Claude with full project context as system prompt
# Usage: bash memory.sh

set -e

PRIMER="/root/.claude/primer.md"
LESSONS="tasks/lessons.md"
MEMORY=".claude-memory.md"

# ── Gather context ─────────────────────────────────────────────────────────

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

COMMITS=$(git log --oneline -5 2>/dev/null || echo "No git history")

MODIFIED=$(git diff --name-only HEAD 2>/dev/null | head -20)
if [ -z "$MODIFIED" ]; then
  MODIFIED="(none)"
fi

PRIMER_CONTENT=""
if [ -f "$PRIMER" ]; then
  PRIMER_CONTENT=$(cat "$PRIMER")
fi

LESSONS_CONTENT=""
if [ -f "$LESSONS" ]; then
  LESSONS_CONTENT=$(cat "$LESSONS")
fi

MEMORY_CONTENT=""
if [ -f "$MEMORY" ]; then
  MEMORY_CONTENT=$(cat "$MEMORY")
fi

# ── Build system prompt ────────────────────────────────────────────────────

SYSTEM_PROMPT=$(cat <<PROMPT
${PRIMER_CONTENT}

---

## Session Context — $(date '+%Y-%m-%d %H:%M')

**Branch:** ${BRANCH}

**Last 5 commits:**
${COMMITS}

**Modified files (uncommitted):**
${MODIFIED}

---

## Lessons Learned

${LESSONS_CONTENT}

---

## Session Memory

${MEMORY_CONTENT}
PROMPT
)

# ── Launch Claude ──────────────────────────────────────────────────────────

claude \
  --permission-mode acceptEdits \
  --allowedTools "Bash(git:*) Bash(npm:*) Edit Write Read" \
  --system-prompt "$SYSTEM_PROMPT"
