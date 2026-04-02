import { useMemo } from 'react'
import { useData } from '../../context/DataContext'
import { AlertCircle, Upload, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Link } from 'react-router-dom'

function pearson(xs, ys) {
  const n = xs.length
  if (n < 3) return null
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, denX = 0, denY = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }
  const den = Math.sqrt(denX * denY)
  return den === 0 ? 0 : num / den
}

// Navy (#003F87) → White → Red (#DC2626)
function getColor(r) {
  if (r === null) return '#F1F5F9'
  if (r === 1) return '#E2E8F0'
  const abs = Math.abs(r)
  if (r > 0) {
    // white to navy
    const t = abs
    const red   = Math.round(255 + t * (0 - 255))
    const green = Math.round(255 + t * (63 - 255))
    const blue  = Math.round(255 + t * (135 - 255))
    return `rgb(${red},${green},${blue})`
  } else {
    // white to red
    const t = abs
    const red   = Math.round(255 + t * (220 - 255))
    const green = Math.round(255 + t * (38 - 255))
    const blue  = Math.round(255 + t * (38 - 255))
    return `rgb(${red},${green},${blue})`
  }
}

function getTextColor(r) {
  if (r === null || r === 1) return '#64748B'
  const abs = Math.abs(r)
  return abs > 0.5 ? '#FFFFFF' : '#0F172A'
}

function getStrength(r) {
  if (r === null) return ''
  const abs = Math.abs(r)
  if (abs >= 0.8) return 'Very strong'
  if (abs >= 0.6) return 'Strong'
  if (abs >= 0.4) return 'Moderate'
  if (abs >= 0.2) return 'Weak'
  return 'Very weak'
}

function CorrelationCard({ colA, colB, r }) {
  const isPositive = r > 0
  const Icon = isPositive ? TrendingUp : TrendingDown
  const strength = getStrength(r)
  const abs = Math.abs(r)
  const strengthColor =
    abs >= 0.8 ? (isPositive ? 'text-blue-700 bg-blue-50 border-blue-200' : 'text-red-700 bg-red-50 border-red-200') :
    abs >= 0.6 ? (isPositive ? 'text-blue-600 bg-blue-50 border-blue-100' : 'text-red-600 bg-red-50 border-red-100') :
    'text-amber-700 bg-amber-50 border-amber-200'

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isPositive ? 'bg-blue-50' : 'bg-red-50'}`}>
          <Icon className={`w-4 h-4 ${isPositive ? 'text-brand-blue' : 'text-red-500'}`} />
        </div>
        <span className={`text-lg font-bold font-mono ${isPositive ? 'text-brand-blue' : 'text-red-600'}`}>
          {isPositive ? '+' : ''}{r.toFixed(2)}
        </span>
      </div>
      <p className="text-xs font-semibold text-text-primary truncate">{colA}</p>
      <p className="text-[10px] text-text-muted mb-2">↔ {colB}</p>
      <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${strengthColor}`}>
        {strength}
      </span>
    </div>
  )
}

export default function CorrelationMatrix() {
  const { dataset, columns, types } = useData()

  const numericCols = useMemo(() => columns.filter(c => types[c] === 'numeric'), [columns, types])

  const { matrix, significant } = useMemo(() => {
    if (!dataset || numericCols.length < 2) return { matrix: {}, significant: [] }
    const parsed = {}
    for (const col of numericCols) {
      parsed[col] = dataset.map(r => {
        const v = Number(String(r[col] ?? '').replace(/,/g, ''))
        return isFinite(v) ? v : null
      })
    }
    const matrix = {}
    const significant = []
    for (const colA of numericCols) {
      matrix[colA] = {}
      for (const colB of numericCols) {
        if (colA === colB) { matrix[colA][colB] = 1; continue }
        const xs = [], ys = []
        for (let i = 0; i < dataset.length; i++) {
          if (parsed[colA][i] !== null && parsed[colB][i] !== null) {
            xs.push(parsed[colA][i]); ys.push(parsed[colB][i])
          }
        }
        const r = pearson(xs, ys)
        matrix[colA][colB] = r !== null ? Number(r.toFixed(3)) : null
        if (r !== null && colA < colB && Math.abs(r) >= 0.4) {
          significant.push({ colA, colB, r: Number(r.toFixed(3)) })
        }
      }
    }
    significant.sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
    return { matrix, significant }
  }, [dataset, numericCols])

  if (!dataset) {
    return (
      <div className="max-w-lg mx-auto pt-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <TrendingUp className="w-7 h-7 text-slate-400" />
        </div>
        <h1 className="text-xl font-semibold text-text-primary mb-1">Correlation Matrix</h1>
        <p className="text-sm text-text-secondary mb-6">Upload a dataset to compute Pearson correlations between numeric columns.</p>
        <Link to="/upload">
          <button className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 transition-colors cursor-pointer">
            <Upload className="w-4 h-4" />Upload Data
          </button>
        </Link>
      </div>
    )
  }

  if (numericCols.length < 2) {
    return (
      <div className="max-w-lg mx-auto pt-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-7 h-7 text-slate-400" />
        </div>
        <h1 className="text-xl font-semibold text-text-primary mb-1">Correlation Matrix</h1>
        <p className="text-sm text-text-secondary">Need at least 2 numeric columns. Check column types on the Upload page.</p>
      </div>
    )
  }

  const isLarge = numericCols.length > 6

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Correlation Matrix</h1>
        <p className="text-xs text-text-secondary mt-0.5">
          Pearson r between {numericCols.length} numeric columns · {dataset.length.toLocaleString()} rows
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">
        {/* Heatmap */}
        <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-text-primary">Heatmap</p>
            <p className="text-xs text-text-muted">Navy = positive · Red = negative · Diagonal = self</p>
          </div>
          <div className="overflow-auto p-2">
            <table className="text-xs border-separate" style={{ borderSpacing: 2 }}>
              <thead>
                <tr>
                  <th className="px-2 py-1 bg-slate-50 rounded sticky left-0 z-20 min-w-[80px]" />
                  {numericCols.map(col => (
                    <th
                      key={col}
                      className="px-1 py-1 font-medium text-text-primary bg-slate-50 rounded whitespace-nowrap"
                      style={{
                        writingMode: isLarge ? 'vertical-rl' : undefined,
                        minWidth: isLarge ? 28 : 60,
                        maxWidth: isLarge ? 28 : 100,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {numericCols.map(colA => (
                  <tr key={colA}>
                    <td className="px-2 py-1 font-medium text-text-primary bg-slate-50 rounded sticky left-0 z-10 whitespace-nowrap" style={{ maxWidth: 120 }}>
                      <span className="truncate block max-w-[120px]">{colA}</span>
                    </td>
                    {numericCols.map(colB => {
                      const r = matrix[colA]?.[colB]
                      const isDiag = colA === colB
                      return (
                        <td
                          key={colB}
                          className="rounded text-center font-mono font-semibold"
                          style={{
                            backgroundColor: getColor(r),
                            color: isDiag ? '#94A3B8' : getTextColor(r),
                            minWidth: isLarge ? 28 : 60,
                            padding: isLarge ? '4px 2px' : '6px 4px',
                          }}
                          title={isDiag ? `${colA}` : `${colA} vs ${colB}: ${r ?? '—'}`}
                        >
                          {isDiag ? '1' : r !== null ? r.toFixed(2) : '—'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Legend */}
          <div className="px-4 py-3 border-t border-border flex items-center gap-3">
            <span className="text-[10px] text-text-muted font-mono">−1.0</span>
            <div className="flex h-3 rounded overflow-hidden flex-1 max-w-[200px]">
              {Array.from({ length: 40 }, (_, i) => {
                const r = -1 + (i / 39) * 2
                return <div key={i} className="flex-1 h-3" style={{ backgroundColor: getColor(r) }} />
              })}
            </div>
            <span className="text-[10px] text-text-muted font-mono">+1.0</span>
            <div className="flex items-center gap-3 ml-3">
              {[
                { label: '≥0.8 Very strong', color: 'bg-brand-blue' },
                { label: '≥0.4 Moderate', color: 'bg-blue-300' },
                { label: 'Negative', color: 'bg-red-500' },
              ].map(({ label, color }) => (
                <div key={label} className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-sm ${color}`} />
                  <span className="text-[10px] text-text-muted">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Notable correlations */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-text-primary mb-1">Notable Correlations</p>
            <p className="text-xs text-text-muted">|r| ≥ 0.4 pairs, sorted by strength</p>
          </div>
          {significant.length === 0 ? (
            <div className="bg-white rounded-xl border border-border p-6 text-center">
              <Minus className="w-6 h-6 text-text-muted mx-auto mb-2" />
              <p className="text-xs text-text-secondary">No moderate or stronger correlations found.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[70vh] overflow-y-auto">
              {significant.slice(0, 12).map(({ colA, colB, r }) => (
                <CorrelationCard key={`${colA}-${colB}`} colA={colA} colB={colB} r={r} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
