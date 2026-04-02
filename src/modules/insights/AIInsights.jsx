import { useState, useCallback } from 'react'
import { useData } from '../../context/DataContext'
import { buildInsightPrompt } from '../../utils/buildInsightPrompt'
import { renderMarkdown } from '../../utils/renderMarkdown'
import { AlertCircle, Sparkles, Copy, Check, RotateCw, Send, Loader2 } from 'lucide-react'

export default function AIInsights() {
  const { dataset, columns, types, fileName } = useData()

  const [insights, setInsights] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [customQuestion, setCustomQuestion] = useState('')

  const generateInsights = useCallback(async (question = '') => {
    if (!dataset) return
    setLoading(true)
    setError(null)
    setInsights('')

    try {
      const prompt = buildInsightPrompt(dataset, columns, types, fileName, question)

      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 1500 }),
      })

      let data
      try {
        data = await response.json()
      } catch (jsonErr) {
        throw new Error('Invalid or empty response from server')
      }

      if (!response.ok) {
        throw new Error((data && data.error) || `Request failed with status ${response.status}`)
      }

      setInsights(data.content)
    } catch (err) {
      setError(err.message || 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [dataset, columns, types, fileName])

  const copyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(insights)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
      const textarea = document.createElement('textarea')
      textarea.value = insights
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [insights])

  // No data state
  if (!dataset) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold text-text-primary">AI Insights</h1>
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-12">
          <AlertCircle className="w-8 h-8 text-text-secondary mb-3" />
          <p className="text-sm font-medium text-text-primary">No dataset loaded</p>
          <p className="mt-1 text-xs text-text-secondary">Upload a CSV or Excel file first.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">AI Insights</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Powered by Claude — auto-generates trend summaries and recommendations from your data.
          </p>
        </div>
      </div>

      {/* Generate button */}
      <div className="rounded-lg border border-border bg-card-bg p-5 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="w-5 h-5 text-brand-blue" />
          <div>
            <p className="text-sm font-semibold text-text-primary">Auto-Analyse Dataset</p>
            <p className="text-xs text-text-secondary">
              Sends column stats and sample rows to Claude for analysis — no raw data leaves the browser.
            </p>
          </div>
        </div>
        <button
          onClick={() => generateInsights()}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analysing…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate Insights
            </>
          )}
        </button>
      </div>

      {/* Custom question */}
      <div className="rounded-lg border border-border bg-card-bg p-5 mb-6">
        <p className="text-sm font-semibold text-text-primary mb-2">Ask a specific question</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={customQuestion}
            onChange={e => setCustomQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && customQuestion.trim()) generateInsights(customQuestion) }}
            placeholder="e.g. What are the peak travel months? Which airlines have the worst ratings?"
            className="flex-1 text-sm border border-border rounded-lg px-3 py-2"
          />
          <button
            onClick={() => generateInsights(customQuestion)}
            disabled={loading || !customQuestion.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 mb-6">
          <p className="text-sm text-red-700 font-medium">Error</p>
          <p className="text-xs text-red-600 mt-1">{error}</p>
          {error.includes('ANTHROPIC_API_KEY') && (
            <p className="text-xs text-red-500 mt-2">
              Set <code className="bg-red-100 px-1 rounded">ANTHROPIC_API_KEY</code> in your Vercel project environment variables, then redeploy.
            </p>
          )}
          {error.includes('Failed to fetch') && (
            <p className="text-xs text-red-500 mt-2">
              The AI insights endpoint isn't available locally. Deploy to Vercel first, or set up a local proxy.
            </p>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="rounded-lg border border-border bg-card-bg p-8 text-center">
          <Loader2 className="w-6 h-6 text-brand-blue animate-spin mx-auto mb-3" />
          <p className="text-sm text-text-primary font-medium">Analysing your dataset…</p>
          <p className="text-xs text-text-secondary mt-1">This usually takes 5–15 seconds</p>
        </div>
      )}

      {/* Results */}
      {insights && !loading && (
        <div className="rounded-lg border border-border bg-card-bg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gray-50">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-blue" />
              <h2 className="text-sm font-semibold text-text-primary">Analysis Results</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary border border-border rounded-md hover:bg-gray-50 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                onClick={() => generateInsights(customQuestion || '')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary border border-border rounded-md hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
                Regenerate
              </button>
            </div>
          </div>
          <div className="px-5 py-4">
            <div className="max-w-none">
              {renderMarkdown(insights)}
            </div>
          </div>
        </div>
      )}

      {/* Info banner */}
      {!insights && !loading && !error && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 mt-2">
          <p className="text-xs text-blue-800">
            <strong>How it works:</strong> We compute column stats (min, max, mean, top values) and send those + 3 sample rows to Claude.
            No raw dataset is transmitted. The API key is kept server-side via a Vercel Edge Function.
          </p>
        </div>
      )}
    </div>
  )
}
