import { useState, useMemo, useCallback } from 'react'
import { useData } from '../../context/DataContext'
import { Download, Upload, Table2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

const AGG_METHODS = [
  { value: 'sum',     label: 'Sum' },
  { value: 'average', label: 'Average' },
  { value: 'count',   label: 'Count' },
  { value: 'min',     label: 'Min' },
  { value: 'max',     label: 'Max' },
]

export default function PivotTable() {
  const { dataset, columns, types, fileName } = useData()

  const [rowCol, setRowCol]     = useState('')
  const [colCol, setColCol]     = useState('')
  const [valCol, setValCol]     = useState('')
  const [aggMethod, setAggMethod] = useState('sum')

  const numericCols     = columns.filter(c => types[c] === 'numeric')
  const categoricalCols = columns.filter(c => types[c] === 'categorical' || types[c] === 'date' || types[c] === 'freetext')

  const { pivotData, rowKeys, colKeys, grandTotals, rowTotals } = useMemo(() => {
    if (!dataset || !rowCol || !valCol) return { pivotData: {}, rowKeys: [], colKeys: [], grandTotals: {}, rowTotals: {} }

    const agg = {}
    const rowSet = new Set()
    const colSet = new Set()

    for (const row of dataset) {
      const rk  = String(row[rowCol] ?? 'Unknown')
      const ck  = colCol ? String(row[colCol] ?? 'Unknown') : '__total__'
      const val = Number(String(row[valCol] ?? '0').replace(/,/g, ''))
      if (!isFinite(val)) continue
      rowSet.add(rk); colSet.add(ck)
      if (!agg[rk]) agg[rk] = {}
      if (!agg[rk][ck]) agg[rk][ck] = { sum: 0, count: 0, min: Infinity, max: -Infinity }
      agg[rk][ck].sum += val; agg[rk][ck].count += 1
      agg[rk][ck].min = Math.min(agg[rk][ck].min, val)
      agg[rk][ck].max = Math.max(agg[rk][ck].max, val)
    }

    const resolve = (bucket) => {
      if (!bucket) return null
      switch (aggMethod) {
        case 'sum':     return bucket.sum
        case 'average': return bucket.count ? bucket.sum / bucket.count : 0
        case 'count':   return bucket.count
        case 'min':     return bucket.min === Infinity ? null : bucket.min
        case 'max':     return bucket.max === -Infinity ? null : bucket.max
        default:        return bucket.sum
      }
    }

    const rowKeys = [...rowSet].sort()
    const colKeys = [...colSet].sort()
    const pivotData = {}
    const rowTotals = {}
    const grandTotals = {}

    for (const rk of rowKeys) {
      pivotData[rk] = {}
      let rb = { sum: 0, count: 0, min: Infinity, max: -Infinity }
      for (const ck of colKeys) {
        const val = resolve(agg[rk]?.[ck])
        pivotData[rk][ck] = val
        if (val !== null) { rb.sum += val; rb.count += 1; rb.min = Math.min(rb.min, val); rb.max = Math.max(rb.max, val) }
      }
      rowTotals[rk] = rb.count > 0 ? resolve(rb) : null
    }

    for (const ck of colKeys) {
      let cb = { sum: 0, count: 0, min: Infinity, max: -Infinity }
      for (const rk of rowKeys) {
        const val = pivotData[rk][ck]
        if (val !== null) { cb.sum += val; cb.count += 1; cb.min = Math.min(cb.min, val); cb.max = Math.max(cb.max, val) }
      }
      grandTotals[ck] = cb.count > 0 ? resolve(cb) : null
    }

    return { pivotData, rowKeys, colKeys, grandTotals, rowTotals }
  }, [dataset, rowCol, colCol, valCol, aggMethod])

  const fmt = (v) => v === null || v === undefined ? '—' : Number(v.toFixed(2)).toLocaleString()

  const exportPivotCsv = useCallback(() => {
    if (!rowKeys.length) return
    const header = [rowCol, ...colKeys.map(c => c === '__total__' ? valCol : c), ...(colKeys.length > 1 ? ['Total'] : [])]
    const rows = rowKeys.map(rk => {
      const row = [rk, ...colKeys.map(ck => pivotData[rk]?.[ck] ?? '')]
      if (colKeys.length > 1) row.push(rowTotals[rk] ?? '')
      return row
    })
    const csv = Papa.unparse({ fields: header, data: rows })
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `${(fileName || 'data').replace(/\.[^.]+$/, '')}_pivot.csv`; a.click()
    URL.revokeObjectURL(url)
  }, [rowKeys, colKeys, pivotData, rowTotals, rowCol, valCol, fileName])

  const exportPivotExcel = useCallback(() => {
    if (!rowKeys.length) return
    const header = [rowCol, ...colKeys.map(c => c === '__total__' ? valCol : c), ...(colKeys.length > 1 ? ['Total'] : [])]
    const rows = rowKeys.map(rk => {
      const row = { [rowCol]: rk }
      colKeys.forEach(ck => { row[ck === '__total__' ? valCol : ck] = pivotData[rk]?.[ck] ?? '' })
      if (colKeys.length > 1) row['Total'] = rowTotals[rk] ?? ''
      return row
    })
    const ws = XLSX.utils.json_to_sheet(rows, { header })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pivot')
    XLSX.writeFile(wb, `${(fileName || 'data').replace(/\.[^.]+$/, '')}_pivot.xlsx`)
  }, [rowKeys, colKeys, pivotData, rowTotals, rowCol, valCol, fileName])

  if (!dataset) {
    return (
      <div className="max-w-lg mx-auto pt-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <Table2 className="w-7 h-7 text-slate-400" />
        </div>
        <h1 className="text-xl font-semibold text-text-primary mb-1">Pivot Table</h1>
        <p className="text-sm text-text-secondary mb-6">Upload a dataset to start building pivot summaries.</p>
        <Link to="/upload">
          <button className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 transition-colors cursor-pointer">
            <Upload className="w-4 h-4" />Upload Data
          </button>
        </Link>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Pivot Table</h1>
          <p className="text-xs text-text-secondary mt-0.5">Aggregate values by row and column categories — like Excel PivotTables.</p>
        </div>
        {rowKeys.length > 0 && (
          <div className="flex items-center gap-2">
            <button onClick={exportPivotCsv} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary border border-border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button onClick={exportPivotExcel} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 transition-colors cursor-pointer">
              <Download className="w-3.5 h-3.5" /> Excel
            </button>
          </div>
        )}
      </div>

      {/* Config */}
      <div className="bg-white rounded-xl border border-border shadow-sm p-5 mb-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Rows', value: rowCol, onChange: e => setRowCol(e.target.value), options: [...categoricalCols, ...numericCols] },
            { label: 'Columns (optional)', value: colCol, onChange: e => setColCol(e.target.value), options: categoricalCols.filter(c => c !== rowCol), hasNone: true },
            { label: 'Values (numeric)', value: valCol, onChange: e => setValCol(e.target.value), options: numericCols },
          ].map(({ label, value, onChange, options, hasNone }) => (
            <div key={label}>
              <label className="text-xs font-medium text-text-secondary block mb-1.5">{label}</label>
              <select value={value} onChange={onChange} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-accent cursor-pointer">
                {hasNone ? <option value="">None</option> : <option value="">Select…</option>}
                {options.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          ))}
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1.5">Aggregation</label>
            <select value={aggMethod} onChange={e => setAggMethod(e.target.value)} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-accent cursor-pointer">
              {AGG_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      {!rowCol || !valCol ? (
        <div className="bg-white rounded-xl border-2 border-dashed border-border p-16 text-center">
          <Table2 className="w-8 h-8 text-text-muted mx-auto mb-3" />
          <p className="text-sm font-medium text-text-primary">Select Rows and Values to build the pivot</p>
          <p className="text-xs text-text-secondary mt-1">Columns and Aggregation are optional.</p>
        </div>
      ) : rowKeys.length === 0 ? (
        <div className="bg-white rounded-xl border-2 border-dashed border-border p-16 text-center">
          <p className="text-sm text-text-secondary">No data matches the selected configuration.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold text-text-primary">
              {rowKeys.length.toLocaleString()} rows{colCol ? ` × ${colKeys.length} columns` : ''}
              {' · '}<span className="text-text-muted font-normal">{aggMethod} of {valCol}</span>
            </p>
          </div>
          <div className="overflow-auto max-h-[65vh]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50">
                  <th className="text-left px-4 py-3 font-semibold text-text-primary border-b border-border sticky left-0 bg-slate-50 z-20">{rowCol}</th>
                  {colKeys.map(ck => (
                    <th key={ck} className="text-right px-4 py-3 font-semibold text-text-primary border-b border-border whitespace-nowrap">
                      {ck === '__total__' ? `${aggMethod} of ${valCol}` : ck}
                    </th>
                  ))}
                  {colKeys.length > 1 && (
                    <th className="text-right px-4 py-3 font-bold text-brand-blue border-b border-border bg-blue-50">Total</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rowKeys.map((rk, i) => (
                  <tr key={rk} className={`hover:bg-slate-50/70 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                    <td className="px-4 py-2.5 font-medium text-text-primary border-b border-border sticky left-0 bg-inherit z-10 whitespace-nowrap">{rk}</td>
                    {colKeys.map(ck => (
                      <td key={ck} className="text-right px-4 py-2.5 font-mono text-text-primary border-b border-border">{fmt(pivotData[rk]?.[ck])}</td>
                    ))}
                    {colKeys.length > 1 && (
                      <td className="text-right px-4 py-2.5 font-mono font-bold text-brand-blue border-b border-border bg-blue-50/40">{fmt(rowTotals[rk])}</td>
                    )}
                  </tr>
                ))}
                {colKeys.length > 1 && (
                  <tr className="bg-slate-100 font-bold">
                    <td className="px-4 py-3 font-bold text-text-primary border-t-2 border-border sticky left-0 bg-slate-100 z-10">Grand Total</td>
                    {colKeys.map(ck => (
                      <td key={ck} className="text-right px-4 py-3 font-mono font-semibold text-text-primary border-t-2 border-border">{fmt(grandTotals[ck])}</td>
                    ))}
                    <td className="text-right px-4 py-3 font-mono text-brand-blue border-t-2 border-border bg-blue-50" />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
