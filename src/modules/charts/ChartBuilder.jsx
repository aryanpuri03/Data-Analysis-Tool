import { useState, useCallback, useRef, useMemo } from 'react'
import { useData } from '../../context/DataContext'
import { isNullish } from '../../utils/inferTypes'
import { toPng } from 'html-to-image'
import { AlertCircle, Filter, Plus, X, BarChart3, BarChart2, TrendingUp, Activity, PieChart, Donut, ScatterChart, Layers, GitMerge, Radar, LayoutGrid, ChevronDown, ChevronUp, Download, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { defaultConfig } from './chartConfig'
import ChartPreview from './ChartPreview'
import CustomisationPanel from './CustomisationPanel'

const CHART_TYPES = [
  { value: 'bar',           label: 'Bar',           icon: BarChart3 },
  { value: 'horizontalBar', label: 'H-Bar',         icon: BarChart2 },
  { value: 'stackedBar',    label: 'Stacked',        icon: Layers },
  { value: 'stackedBar100', label: '100% Stack',    icon: Layers },
  { value: 'line',          label: 'Line',          icon: TrendingUp },
  { value: 'area',          label: 'Area',          icon: Activity },
  { value: 'stackedArea',   label: 'Stack Area',    icon: Activity },
  { value: 'combo',         label: 'Combo',         icon: GitMerge },
  { value: 'scatter',       label: 'Scatter',       icon: ScatterChart },
  { value: 'pie',           label: 'Pie',           icon: PieChart },
  { value: 'donut',         label: 'Donut',         icon: PieChart },
  { value: 'radar',         label: 'Radar',         icon: Radar },
  { value: 'treemap',       label: 'Treemap',       icon: LayoutGrid },
]

const AGG_METHODS = [
  { value: 'sum',     label: 'Sum' },
  { value: 'average', label: 'Average' },
  { value: 'count',   label: 'Count' },
  { value: 'min',     label: 'Min' },
  { value: 'max',     label: 'Max' },
]

export default function ChartBuilder() {
  const { dataset, columns, types } = useData()
  const chartRef = useRef(null)

  const [chartType, setChartType] = useState('bar')
  const [xCol, setXCol] = useState('')
  const [yCol, setYCol] = useState('')
  const [y2Col, setY2Col] = useState('')
  const [groupCol, setGroupCol] = useState('')
  const [aggMethod, setAggMethod] = useState('sum')
  const [config, setConfig] = useState(JSON.parse(JSON.stringify(defaultConfig)))
  const [pngRes, setPngRes] = useState(2)
  const [filtersOpen, setFiltersOpen] = useState(false)

  // ── Filters ──
  const [filters, setFilters] = useState([])

  const addFilter = useCallback(() => {
    if (columns.length === 0) return
    setFilters(prev => [...prev, { col: columns[0], op: '=', value: '' }])
    setFiltersOpen(true)
  }, [columns])

  const updateFilter = useCallback((index, field, val) => {
    setFilters(prev => prev.map((f, i) => i === index ? { ...f, [field]: val } : f))
  }, [])

  const removeFilter = useCallback((index) => {
    setFilters(prev => prev.filter((_, i) => i !== index))
  }, [])

  const filteredDataset = useMemo(() => {
    if (!dataset || filters.length === 0) return dataset
    return dataset.filter(row =>
      filters.every(({ col, op, value }) => {
        if (!value && op !== 'is_null' && op !== 'not_null') return true
        const cellRaw = row[col]
        const cell = String(cellRaw ?? '').trim()
        const cellNum = Number(cell.replace(/,/g, ''))
        const valNum = Number(value)
        switch (op) {
          case '=':        return cell.toLowerCase() === value.toLowerCase()
          case '!=':       return cell.toLowerCase() !== value.toLowerCase()
          case 'contains': return cell.toLowerCase().includes(value.toLowerCase())
          case '>':        return isFinite(cellNum) && isFinite(valNum) && cellNum > valNum
          case '>=':       return isFinite(cellNum) && isFinite(valNum) && cellNum >= valNum
          case '<':        return isFinite(cellNum) && isFinite(valNum) && cellNum < valNum
          case '<=':       return isFinite(cellNum) && isFinite(valNum) && cellNum <= valNum
          case 'is_null':  return cellRaw == null || cell === '' || cell.toLowerCase() === 'null'
          case 'not_null': return cellRaw != null && cell !== '' && cell.toLowerCase() !== 'null'
          default:         return true
        }
      })
    )
  }, [dataset, filters])

  const resolveAgg = useCallback((bucket) => {
    if (!bucket) return 0
    switch (aggMethod) {
      case 'sum':     return bucket.sum
      case 'average': return bucket.count ? bucket.sum / bucket.count : 0
      case 'count':   return bucket.count
      case 'min':     return bucket.min
      case 'max':     return bucket.max
      default:        return bucket.sum
    }
  }, [aggMethod])

  const buildAgg = useCallback((rows, keyCol, valCol) => {
    const agg = {}, order = []
    for (const row of rows) {
      const key = String(row[keyCol] ?? 'Unknown')
      const val = Number(String(row[valCol] ?? '0').replace(/,/g, ''))
      if (!isFinite(val)) continue
      if (!(key in agg)) { agg[key] = { sum: 0, count: 0, min: Infinity, max: -Infinity }; order.push(key) }
      agg[key].sum += val; agg[key].count += 1
      agg[key].min = Math.min(agg[key].min, val); agg[key].max = Math.max(agg[key].max, val)
    }
    return { agg, order }
  }, [])

  const chartData = useMemo(() => {
    if (!filteredDataset || !xCol || !yCol) return []
    if (chartType === 'pie' || chartType === 'donut') {
      const { agg, order } = buildAgg(filteredDataset, xCol, yCol)
      return order.map(key => ({ name: key, value: Number(resolveAgg(agg[key]).toFixed(2)) })).sort((a, b) => b.value - a.value).slice(0, 20)
    }
    if (chartType === 'treemap') {
      const { agg, order } = buildAgg(filteredDataset, xCol, yCol)
      return order.map(key => ({ name: key, value: Number(resolveAgg(agg[key]).toFixed(2)) })).sort((a, b) => b.value - a.value).slice(0, 30)
    }
    if (chartType === 'scatter') {
      return filteredDataset.map(row => {
        const x = Number(String(row[xCol] ?? '').replace(/,/g, ''))
        const y = Number(String(row[yCol] ?? '').replace(/,/g, ''))
        if (!isFinite(x) || !isFinite(y)) return null
        return { x, y }
      }).filter(Boolean).slice(0, 2000)
    }
    if (chartType === 'combo') {
      const { agg, order } = buildAgg(filteredDataset, xCol, yCol)
      const result = order.map(key => ({ name: key, [yCol]: Number(resolveAgg(agg[key]).toFixed(2)) }))
      if (y2Col && y2Col !== yCol) {
        const { agg: agg2 } = buildAgg(filteredDataset, xCol, y2Col)
        for (const entry of result) {
          if (agg2[entry.name]) entry[y2Col] = Number(resolveAgg(agg2[entry.name]).toFixed(2))
        }
      }
      return result
    }
    if (!groupCol) {
      const { agg, order } = buildAgg(filteredDataset, xCol, yCol)
      return order.map(key => ({ name: key, [yCol]: Number(resolveAgg(agg[key]).toFixed(2)) }))
    }
    const agg = {}, order = [], groups = new Set()
    for (const row of filteredDataset) {
      const key = String(row[xCol] ?? 'Unknown'), grp = String(row[groupCol] ?? 'Unknown')
      const val = Number(String(row[yCol] ?? '0').replace(/,/g, ''))
      if (!isFinite(val)) continue
      if (!(key in agg)) { agg[key] = {}; order.push(key) }
      if (!agg[key][grp]) agg[key][grp] = { sum: 0, count: 0, min: Infinity, max: -Infinity }
      agg[key][grp].sum += val; agg[key][grp].count += 1
      agg[key][grp].min = Math.min(agg[key][grp].min, val); agg[key][grp].max = Math.max(agg[key][grp].max, val)
      groups.add(grp)
    }
    const groupList = [...groups].slice(0, 10)
    let data = order.map(key => {
      const entry = { name: key }
      for (const grp of groupList) { if (agg[key][grp]) entry[grp] = Number(resolveAgg(agg[key][grp]).toFixed(2)) }
      return entry
    })
    if (chartType === 'stackedBar100') {
      data = data.map(entry => {
        const total = groupList.reduce((s, g) => s + (entry[g] || 0), 0)
        if (total === 0) return entry
        const n = { name: entry.name }
        for (const g of groupList) n[g] = Number((((entry[g] || 0) / total) * 100).toFixed(1))
        return n
      })
    }
    return data
  }, [filteredDataset, xCol, yCol, y2Col, groupCol, chartType, resolveAgg, buildAgg])

  const groupKeys = useMemo(() => {
    if (!groupCol || !chartData.length) return []
    const keys = new Set()
    chartData.forEach(d => Object.keys(d).forEach(k => { if (k !== 'name') keys.add(k) }))
    return [...keys]
  }, [chartData, groupCol])

  const seriesKeys = useMemo(() => {
    if (['pie', 'donut', 'scatter', 'treemap'].includes(chartType)) return []
    if (chartType === 'combo') return y2Col && y2Col !== yCol ? [yCol, y2Col] : yCol ? [yCol] : []
    return groupKeys.length > 0 ? groupKeys : yCol ? [yCol] : []
  }, [chartType, groupKeys, yCol, y2Col])

  const supportsGroup = ['bar', 'horizontalBar', 'stackedBar', 'stackedBar100', 'line', 'area', 'stackedArea', 'radar'].includes(chartType)

  const exportSvg = useCallback(() => {
    if (!chartRef.current) return
    const svgEl = chartRef.current.querySelector('svg')
    if (!svgEl) return
    const clone = svgEl.cloneNode(true)
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    if (config.canvas.bgColor !== 'transparent') {
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', config.canvas.bgColor)
      clone.insertBefore(bg, clone.firstChild)
    }
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${(config.title.text || 'chart').replace(/[^a-z0-9]/gi, '_')}.svg`; a.click()
  }, [config.title.text, config.canvas.bgColor])

  const exportPng = useCallback(async (res = 2) => {
    if (!chartRef.current) return
    try {
      const dataUrl = await toPng(chartRef.current, { backgroundColor: config.canvas.bgColor === 'transparent' ? undefined : config.canvas.bgColor, pixelRatio: res })
      const a = document.createElement('a'); a.href = dataUrl; a.download = `${(config.title.text || 'chart').replace(/[^a-z0-9]/gi, '_')}_${res}x.png`; a.click()
    } catch (err) { console.error('PNG export failed:', err) }
  }, [config.title.text, config.canvas.bgColor])

  const numericCols = columns.filter(c => types[c] === 'numeric')
  const categoricalCols = columns.filter(c => types[c] === 'categorical' || types[c] === 'freetext' || types[c] === 'date')

  if (!dataset) {
    return (
      <div className="max-w-lg mx-auto pt-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <BarChart3 className="w-7 h-7 text-slate-400" />
        </div>
        <h1 className="text-xl font-semibold text-text-primary mb-1">Chart Builder</h1>
        <p className="text-sm text-text-secondary mb-5">Upload a dataset to start building charts.</p>
        <Link to="/upload">
          <button className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 transition-colors cursor-pointer">
            <Upload className="w-4 h-4" /> Upload Data
          </button>
        </Link>
      </div>
    )
  }

  const isChartReady = !!(xCol && yCol)

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Chart Builder</h1>
          <p className="text-sm text-text-secondary mt-0.5">Build interactive charts from your data</p>
        </div>
        {isChartReady && (
          <button
            onClick={() => exportPng(2)}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-secondary border border-border rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Export PNG
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-5">
        {/* ── Controls panel ── */}
        <div className="space-y-4">
          {/* Chart type grid */}
          <div className="bg-white rounded-xl border border-border p-4">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Chart Type</p>
            <div className="grid grid-cols-3 gap-1.5">
              {CHART_TYPES.map(t => {
                const Icon = t.icon
                const active = chartType === t.value
                return (
                  <button
                    key={t.value}
                    onClick={() => setChartType(t.value)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-center transition-colors cursor-pointer ${
                      active ? 'border-brand-blue bg-blue-50 text-brand-blue' : 'border-border text-text-secondary hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-[10px] font-medium leading-tight">{t.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Column config */}
          <div className="bg-white rounded-xl border border-border p-4 space-y-3">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Columns</p>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">
                {chartType === 'scatter' ? 'X Axis (numeric)' : 'X Axis'}
              </label>
              <select value={xCol} onChange={e => setXCol(e.target.value)} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white cursor-pointer">
                <option value="">Select column…</option>
                {(chartType === 'scatter' ? numericCols : [...categoricalCols, ...numericCols]).map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">
                {chartType === 'pie' || chartType === 'donut' ? 'Value (numeric)' : 'Y Axis (numeric)'}
              </label>
              <select value={yCol} onChange={e => setYCol(e.target.value)} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white cursor-pointer">
                <option value="">Select column…</option>
                {numericCols.map(col => <option key={col} value={col}>{col}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Aggregation</label>
              <select value={aggMethod} onChange={e => setAggMethod(e.target.value)} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white cursor-pointer">
                {AGG_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            {chartType === 'combo' && (
              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1">Line Y Axis</label>
                <select value={y2Col} onChange={e => setY2Col(e.target.value)} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white cursor-pointer">
                  <option value="">None</option>
                  {numericCols.filter(c => c !== yCol).map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
            )}
            {supportsGroup && (
              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1">Group By</label>
                <select value={groupCol} onChange={e => setGroupCol(e.target.value)} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white cursor-pointer">
                  <option value="">None</option>
                  {categoricalCols.filter(c => c !== xCol).map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => setFiltersOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm cursor-pointer hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-text-secondary" />
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Filters</span>
                {filters.length > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-blue text-white">{filters.length}</span>
                )}
              </div>
              {filtersOpen ? <ChevronUp className="w-3.5 h-3.5 text-text-muted" /> : <ChevronDown className="w-3.5 h-3.5 text-text-muted" />}
            </button>
            {filtersOpen && (
              <div className="px-4 pb-4 border-t border-border">
                {filters.length === 0 ? (
                  <p className="text-xs text-text-muted mt-3">No filters applied.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {filters.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <select value={f.col} onChange={e => updateFilter(i, 'col', e.target.value)} className="text-xs border border-border rounded-md px-2 py-1.5 bg-white flex-1 min-w-0 cursor-pointer">
                          {columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <select value={f.op} onChange={e => updateFilter(i, 'op', e.target.value)} className="text-xs border border-border rounded-md px-1.5 py-1.5 bg-white cursor-pointer">
                          <option value="=">=</option><option value="!=">≠</option><option value="contains">~</option>
                          <option value=">">{'>'}</option><option value=">=">{'>='}</option>
                          <option value="<">{'<'}</option><option value="<=">{'<='}</option>
                          <option value="is_null">∅</option><option value="not_null">¬∅</option>
                        </select>
                        {f.op !== 'is_null' && f.op !== 'not_null' && (
                          <input type="text" value={f.value} onChange={e => updateFilter(i, 'value', e.target.value)} placeholder="Value" className="text-xs border border-border rounded-md px-2 py-1.5 flex-1 min-w-0" />
                        )}
                        <button onClick={() => removeFilter(i)} className="text-text-muted hover:text-red-500 cursor-pointer shrink-0"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={addFilter} className="mt-3 flex items-center gap-1 text-xs font-medium text-brand-blue hover:text-brand-blue/80 cursor-pointer">
                  <Plus className="w-3 h-3" /> Add filter
                </button>
                {filters.length > 0 && filteredDataset && (
                  <p className="text-[10px] text-text-muted mt-1">{filteredDataset.length.toLocaleString()} of {dataset.length.toLocaleString()} rows</p>
                )}
              </div>
            )}
          </div>

          {/* Customisation panel */}
          {isChartReady && (
            <CustomisationPanel
              config={config}
              setConfig={setConfig}
              chartType={chartType}
              seriesKeys={seriesKeys}
              onExportSvg={exportSvg}
              onExportPng={exportPng}
            />
          )}
        </div>

        {/* ── Chart preview ── */}
        <div>
          {!isChartReady ? (
            <div className="bg-white rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center py-24 text-center">
              <BarChart3 className="w-8 h-8 text-slate-300 mb-3" />
              <p className="text-sm font-medium text-text-secondary">Select X and Y columns to render a chart</p>
            </div>
          ) : chartData.length === 0 ? (
            <div className="bg-white rounded-xl border border-border flex items-center justify-center py-24 text-center">
              <p className="text-sm text-text-secondary">No valid data for the selected columns.</p>
            </div>
          ) : (
            <div ref={chartRef} className="bg-white rounded-xl border border-border overflow-hidden">
              <ChartPreview
                chartType={chartType}
                chartData={chartData}
                yCol={yCol}
                y2Col={y2Col}
                groupKeys={groupKeys}
                config={config}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
