/**
 * Lightweight markdown → React elements renderer.
 * Handles the subset of markdown that AI outputs use:
 * headings, bold, italic, inline code, ul/ol, tables, hr, paragraphs.
 * No external dependencies required.
 */

// ── Inline formatter: **bold**, *italic*, `code` ──────────────────────────
export function inlineFormat(text) {
  if (!text) return null
  const parts = []
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let last = 0
  let match
  let k = 0
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(<span key={k++}>{text.slice(last, match.index)}</span>)
    const m = match[0]
    if (m.startsWith('**'))
      parts.push(<strong key={k++} className="font-semibold text-text-primary">{m.slice(2, -2)}</strong>)
    else if (m.startsWith('*'))
      parts.push(<em key={k++}>{m.slice(1, -1)}</em>)
    else
      parts.push(<code key={k++} className="px-1 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-mono">{m.slice(1, -1)}</code>)
    last = match.index + m.length
  }
  if (last < text.length) parts.push(<span key={k++}>{text.slice(last)}</span>)
  return parts.length === 0 ? text : parts
}

// ── Block markdown renderer ───────────────────────────────────────────────
export function renderMarkdown(text) {
  if (!text) return null
  const lines = text.split('\n')
  const result = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Headings
    if (line.startsWith('# ')) {
      result.push(<h1 key={i} className="text-xl font-bold text-text-primary mt-1 mb-3">{line.slice(2)}</h1>)
      i++; continue
    }
    if (line.startsWith('## ')) {
      result.push(<h2 key={i} className="text-base font-semibold text-text-primary mt-6 mb-2 pb-1.5 border-b border-border">{line.slice(3)}</h2>)
      i++; continue
    }
    if (line.startsWith('### ')) {
      result.push(<h3 key={i} className="text-sm font-semibold text-text-primary mt-4 mb-1.5">{line.slice(4)}</h3>)
      i++; continue
    }

    // Standalone bold line used as a section header — e.g. **Key Findings**
    // Render as an h3-style heading rather than a paragraph
    if (/^\*\*[^*]+\*\*\s*$/.test(line.trim()) || /^\*\*[^*]+\*\*\s*[—–-]/.test(line.trim())) {
      const titleMatch = line.match(/^\*\*([^*]+)\*\*(.*)$/)
      if (titleMatch) {
        const title = titleMatch[1].trim()
        const rest  = titleMatch[2].replace(/^\s*[—–-]\s*/, '').trim()
        result.push(
          <h3 key={i} className="text-sm font-semibold text-text-primary mt-5 mb-1.5 flex items-baseline gap-2">
            {title}
            {rest && <span className="text-xs font-normal text-text-secondary">{rest}</span>}
          </h3>
        )
        i++; continue
      }
    }

    // Horizontal rule
    if (/^[-*]{3,}$/.test(line.trim())) {
      result.push(<hr key={i} className="my-4 border-border" />)
      i++; continue
    }

    // Table
    if (line.startsWith('|')) {
      const tableLines = []
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!/^\|[-| :]+\|$/.test(lines[i].trim())) tableLines.push(lines[i])
        i++
      }
      if (tableLines.length > 0) {
        const [headerRow, ...bodyRows] = tableLines
        const headers = headerRow.split('|').slice(1, -1).map(h => h.trim())
        result.push(
          <div key={`tbl-${i}`} className="overflow-x-auto my-4 rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-border">
                <tr>
                  {headers.map((h, hi) => (
                    <th key={hi} className="px-3 py-2 text-left font-semibold text-text-primary whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => {
                  const cells = row.split('|').slice(1, -1).map(c => c.trim())
                  return (
                    <tr key={ri} className={`border-b border-border/40 ${ri % 2 !== 0 ? 'bg-slate-50/50' : ''}`}>
                      {cells.map((cell, ci) => (
                        <td key={ci} className="px-3 py-2 text-text-primary">{cell}</td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      }
      continue
    }

    // Unordered list
    if (/^[-*] /.test(line)) {
      const items = []
      while (i < lines.length && /^[-*] /.test(lines[i])) { items.push(lines[i].slice(2)); i++ }
      result.push(
        <ul key={`ul-${i}`} className="list-disc list-outside ml-4 space-y-1 my-3">
          {items.map((item, ii) => (
            <li key={ii} className="text-sm text-text-primary leading-relaxed pl-1">{inlineFormat(item)}</li>
          ))}
        </ul>
      )
      continue
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(lines[i].replace(/^\d+\. /, '')); i++ }
      result.push(
        <ol key={`ol-${i}`} className="list-decimal list-outside ml-4 space-y-1 my-3">
          {items.map((item, ii) => (
            <li key={ii} className="text-sm text-text-primary leading-relaxed pl-1">{inlineFormat(item)}</li>
          ))}
        </ol>
      )
      continue
    }

    // Empty line — skip
    if (line.trim() === '') { i++; continue }

    // Paragraph
    result.push(
      <p key={i} className="text-sm text-text-primary leading-relaxed my-2">{inlineFormat(line)}</p>
    )
    i++
  }

  return result
}
