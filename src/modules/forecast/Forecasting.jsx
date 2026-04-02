import { useState, useCallback, useMemo } from 'react'
import { useData } from '../../context/DataContext'
import { isNullish } from '../../utils/inferTypes'
import { extractJSONObject } from '../../utils/extractJSON'
import { AlertCircle, TrendingUp, TrendingDown, Minus, Loader2, Sparkles, RotateCw, Copy, Check, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'

const TREND_META = {
  increasing: { Icon: TrendingUp,   color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  decreasing: { Icon: TrendingDown, color: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200'     },
  stable:     { Icon: Minus,        color: 'text-brand-blue',  bg: 'bg-blue-50',    border: 'border-blue-200'    },
  volatile:   { Icon: TrendingUp,   color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200'   },
}

const CONF_STYLES = {
  high:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low:    'bg-red-100 text-red-700 border-red-200',
}

function StatChip({ label, value, className = '' }) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${className}`}>
      <span className="text-current/60 font-normal">{label}</span>
      <span>{value}</span>
    </div>
  )
}

export default function Forecasting() {
  const { dataset, columns, types } = useData()

  const dateColumns = useMemo(() => columns.filter(c => types[c] === 'date'), [columns, types])
  const numericColumns = useMemo(() => columns.filter(c => types[c] === 'numeric'), [columns, types])

  const [dateCol, setDateCol] = useState('')
  const [valueCol, setValueCol] = useState('')
  const [periods, setPeriods] = useState(6)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [forecast, setForecast] = useState(null)
  const [copied, setCopied] = useState(false)

  const timeSeriesData = useMemo(() => {
    if (!dataset || !dateCol || !valueCol) return []
    const grouped = {}
    for (const row of dataset) {
      const d = row[dateCol]; const v = row[valueCol]
      if (isNullish(d) || isNullish(v)) continue
      const num = Number(String(v).replace(/,/g, ''))
      if (!isFinite(num)) continue
      const key = String(d).trim()
      if (!grouped[key]) grouped[key] = { sum: 0, count: 0 }
      grouped[key].sum += num; grouped[key].count++
    }
    return Object.entries(grouped)
      .map(([label, { sum, count }]) => ({ label, value: Number((sum / count).toFixed(2)), type: 'actual' }))
      .sort((a, b) => {
        const da = Date.parse(a.label), db = Date.parse(b.label)
        return (!isNaN(da) && !isNaN(db)) ? da - db : a.label.localeCompare(b.label)
      })
  }, [dataset, dateCol, valueCol])

  const runForecast = useCallback(async () => {
    if (timeSeriesData.length < 3) return
    setLoading(true); setError(null); setForecast(null)
    const seriesStr = timeSeriesData.map(d => `${d.label}: ${d.value}`).join('\n')
    const prompt = `ROLE: Quantitative analyst. Analyse the time series below and produce a forecast. State trend direction, magnitude, and confidence based on the data. Respond only with the JSON object requested — no preamble.

Time series of "${valueCol}" by "${dateCol}":
${seriesStr}

Forecast the next ${periods} periods. Respond with ONLY a JSON object (no markdown):
{
  "narrative": "2-3 sentence analysis of trend direction, magnitude, and any seasonality. Cite specific numbers.",
  "predictions": [{"label": "next period label", "value": numeric_value}, ...repeat ${periods} times],
  "trend": "increasing"|"decreasing"|"stable"|"volatile",
  "confidence": "high"|"medium"|"low"
}
Round predicted values to 2 decimal places.`

    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 800 }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Request failed')
      const result = extractJSONObject(data.content || '')
      if (!result) throw new Error('AI did not return valid forecast data')
      setForecast(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [timeSeriesData, valueCol, dateCol, periods])

  // Build chart data with CI band on forecast
  const chartData = useMemo(() => {
    if (!timeSeriesData.length) return []
    const withBridge = timeSeriesData.map((d, i) => ({
      ...d,
      forecast: null,
      ciLow: null,
      ciHigh: null,
      // bridge the last actual point to forecast
      ...(forecast && i === timeSeriesData.length - 1 ? { forecast: d.value } : {}),
    }))
    if (!forecast?.predictions) return withBridge
    const CI_FACTOR = 0.08 // ±8% confidence interval
    const predicted = forecast.predictions.map(p => {
      const v = Number(p.value)
      const ci = Math.abs(v) * CI_FACTOR
      return { label: p.label, value: null, forecast: v, ciLow: v - ci, ciHigh: v + ci, type: 'forecast' }
    })
    return [...withBridge, ...predicted]
  }, [timeSeriesData, forecast])

  const copyNarrative = useCallback(async () => {
    if (!forecast?.narrative) return
    try { await navigator.clipboard.writeText(forecast.narrative) } catch { /* noop */ }
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }, [forecast])

  if (!dataset) {
    return (
      <div className="max-w-lg mx-auto pt-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <TrendingUp className="w-7 h-7 text-slate-400" />
        </div>
        <h1 className="text-xl font-semibold text-text-primary mb-1">AI Forecasting</h1>
        <p className="text-sm text-text-secondary mb-6">Upload a dataset with date and numeric columns to project future trends.</p>
        <Link to="/upload">
          <button className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 transition-colors cursor-pointer">
            <Upload className="w-4 h-4" />Upload Data
          </button>
        </Link>
      </div>
    )
  }

  if (dateColumns.length === 0 || numericColumns.length === 0) {
    return (
      <div className="max-w-lg mx-auto pt-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-7 h-7 text-amber-500" />
        </div>
        <h1 className="text-xl font-semibold text-text-primary mb-1">AI Forecasting</h1>
        <p className="text-sm text-text-secondary">
          Need at least one date column and one numeric column.{' '}
          <Link to="/upload" className="text-brand-accent underline">Check column types</Link> on the Upload page.
        </p>
      </div>
    )
  }

  const trendMeta = forecast ? TREND_META[forecast.trend] || TREND_META.stable : null

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text-primary">AI Forecasting</h1>
        <p className="text-xs text-text-secondary mt-0.5">Select a date and value column to project future trends.</p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-border shadow-sm p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1.5">Date Column</label>
            <select value={dateCol} onChange={e => setDateCol(e.target.value)} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-accent cursor-pointer">
              <option value="">Select…</option>
              {dateColumns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1.5">Value Column</label>
            <select value={valueCol} onChange={e => setValueCol(e.target.value)} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-accent cursor-pointer">
              <option value="">Select…</option>
              {numericColumns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1.5">Forecast Periods</label>
            <select value={periods} onChange={e => setPeriods(Number(e.target.value))} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-accent cursor-pointer">
              {[3, 6, 9, 12].map(n => <option key={n} value={n}>{n} periods</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={runForecast}
              disabled={loading || !dateCol || !valueCol || timeSeriesData.length < 3}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
              {loading ? 'Forecasting…' : 'Run Forecast'}
            </button>
          </div>
        </div>
        {dateCol && valueCol && timeSeriesData.length < 3 && (
          <p className="text-xs text-amber-600 mt-3 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            Need at least 3 data points. Currently: {timeSeriesData.length}.
          </p>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Chart */}
      {chartData.length > 0 && dateCol && valueCol && (
        <div className="bg-white rounded-xl border border-border shadow-sm p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-text-primary">{valueCol} over {dateCol}</p>
              {forecast && <p className="text-xs text-text-muted mt-0.5">{periods}-period AI forecast with ±8% confidence band</p>}
            </div>
            {/* Stat chips */}
            {forecast && (
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {trendMeta && (
                  <StatChip
                    label="Trend"
                    value={forecast.trend}
                    className={`${trendMeta.bg} ${trendMeta.border} ${trendMeta.color}`}
                  />
                )}
                {forecast.confidence && (
                  <StatChip
                    label="Confidence"
                    value={forecast.confidence}
                    className={`${CONF_STYLES[forecast.confidence] || CONF_STYLES.medium} border`}
                  />
                )}
                <StatChip
                  label="Data points"
                  value={timeSeriesData.length}
                  className="bg-slate-50 border-border text-text-secondary"
                />
              </div>
            )}
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94A3B8' }} angle={-35} textAnchor="end" height={65} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} width={55} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                formatter={(val, name) => [val !== null ? Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—', name]}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              {/* CI band */}
              <Area
                type="monotone"
                dataKey="ciHigh"
                stroke="none"
                fill="#F59E0B"
                fillOpacity={0.12}
                name="CI High"
                legendType="none"
                connectNulls
              />
              <Area
                type="monotone"
                dataKey="ciLow"
                stroke="none"
                fill="#FFFFFF"
                fillOpacity={1}
                name="CI Low"
                legendType="none"
                connectNulls
              />
              {/* Actual line */}
              <Line
                type="monotone"
                dataKey="value"
                stroke="#003F87"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#003F87', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                name="Actual"
                connectNulls={false}
              />
              {/* Forecast line */}
              {forecast && (
                <Line
                  type="monotone"
                  dataKey="forecast"
                  stroke="#F59E0B"
                  strokeWidth={2.5}
                  strokeDasharray="7 4"
                  dot={{ r: 3, fill: '#F59E0B', strokeWidth: 0 }}
                  name="Forecast"
                  connectNulls
                />
              )}
              {/* Reference line at forecast start */}
              {forecast && timeSeriesData.length > 0 && (
                <ReferenceLine
                  x={timeSeriesData[timeSeriesData.length - 1].label}
                  stroke="#CBD5E1"
                  strokeDasharray="4 3"
                  label={{ value: 'Forecast →', position: 'insideTopRight', fontSize: 9, fill: '#94A3B8' }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Forecast narrative + table */}
      {forecast && !loading && (
        <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-blue" />
              <h2 className="text-sm font-semibold text-text-primary">Forecast Analysis</h2>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={copyNarrative} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary border border-border rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button onClick={runForecast} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary border border-border rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                <RotateCw className="w-3 h-3" /> Redo
              </button>
            </div>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm text-text-primary leading-relaxed mb-5">{forecast.narrative}</p>
            {forecast.predictions && forecast.predictions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Predicted Values</p>
                <div className="overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-4 py-2.5 text-left font-semibold text-text-secondary border-b border-border rounded-tl-lg">Period</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-text-secondary border-b border-border">Predicted {valueCol}</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-text-secondary border-b border-border rounded-tr-lg">CI Range (±8%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forecast.predictions.map((p, i) => {
                        const v = Number(p.value)
                        const ci = Math.abs(v) * 0.08
                        return (
                          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                            <td className="px-4 py-2.5 text-text-primary border-b border-border font-medium">{p.label}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-600 border-b border-border">
                              {v.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-text-muted border-b border-border text-[11px]">
                              {(v - ci).toLocaleString(undefined, { maximumFractionDigits: 1 })} – {(v + ci).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
