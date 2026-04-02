import { useMemo, useState } from 'react'
import { useData } from '../../context/DataContext'
import { computeProfile } from '../../utils/computeProfile'
import { BarChart3, Calendar, Hash, Type, AlertCircle, Database, Columns3, Copy, Search, Upload, TrendingDown } from 'lucide-react'
import { Link } from 'react-router-dom'

const TYPE_META = {
  numeric:     { Icon: Hash,     label: 'Numeric',     bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500'   },
  date:        { Icon: Calendar, label: 'Date',         bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  categorical: { Icon: BarChart3,label: 'Categorical',  bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500'  },
  freetext:    { Icon: Type,     label: 'Free Text',   bg: 'bg-gray-50',   border: 'border-gray-200',   text: 'text-gray-600',   badge: 'bg-gray-100 text-gray-600',   dot: 'bg-gray-400'   },
}

const TABS = [
  { id: 'all',         label: 'All' },
  { id: 'numeric',     label: 'Numeric' },
  { id: 'categorical', label: 'Categorical' },
  { id: 'date',        label: 'Date' },
  { id: 'freetext',    label: 'Free Text' },
]

function StatItem({ label, value, mono = false }) {
  return (
    <div className="flex justify-between items-baseline py-1 border-b border-gray-50 last:border-0">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className={`text-xs font-medium text-text-primary ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

function NullBar({ nullPercent }) {
  const pct = parseFloat(nullPercent)
  const barColor = pct === 0 ? 'bg-emerald-400' : pct < 10 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[10px] text-text-muted mb-1">
        <span>Completeness</span>
        <span className="font-mono">{(100 - pct).toFixed(1)}%</span>
      </div>
      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${100 - pct}%` }} />
      </div>
    </div>
  )
}

function CardHeader({ col, type }) {
  const meta = TYPE_META[type] || TYPE_META.freetext
  const { Icon } = meta
  return (
    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${meta.bg}`}>
        <Icon className={`w-3.5 h-3.5 ${meta.text}`} />
      </div>
      <h3 className="text-sm font-semibold text-text-primary truncate flex-1">{col}</h3>
      <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${meta.badge}`}>
        {meta.label}
      </span>
    </div>
  )
}

function NumericCard({ col, stats }) {
  return (
    <div className="bg-white rounded-xl border border-border shadow-sm p-4 hover:shadow-md transition-shadow">
      <CardHeader col={col} type="numeric" />
      <NullBar nullPercent={stats.nullPercent} />
      <div className="mt-3 space-y-0">
        <StatItem label="Min" value={stats.min ?? '—'} mono />
        <StatItem label="Max" value={stats.max ?? '—'} mono />
        <StatItem label="Mean" value={stats.mean ?? '—'} mono />
        <StatItem label="Median" value={stats.median ?? '—'} mono />
        <StatItem label="Std Dev" value={stats.stdDev ?? '—'} mono />
        <StatItem label="Unique" value={stats.uniqueCount} mono />
        <StatItem label="Nulls" value={`${stats.nullCount} (${stats.nullPercent}%)`} mono />
      </div>
      {stats.outlierCount > 0 && (
        <div className="mt-3 p-2.5 rounded-lg bg-red-50 border border-red-100">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertCircle className="w-3 h-3 text-red-500" />
            <p className="text-[10px] font-semibold text-red-700 uppercase tracking-wider">
              {stats.outlierCount} Outlier{stats.outlierCount !== 1 ? 's' : ''} (IQR)
            </p>
          </div>
          <p className="text-[11px] text-red-600">
            Outside [{stats.lowerFence}, {stats.upperFence}]
          </p>
          {stats.outlierExamples.length > 0 && (
            <p className="text-[10px] text-red-500 font-mono mt-0.5">
              e.g. {stats.outlierExamples.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function DateCard({ col, stats }) {
  return (
    <div className="bg-white rounded-xl border border-border shadow-sm p-4 hover:shadow-md transition-shadow">
      <CardHeader col={col} type="date" />
      <NullBar nullPercent={stats.nullPercent} />
      <div className="mt-3 space-y-0">
        <StatItem label="Earliest" value={stats.earliest ?? '—'} mono />
        <StatItem label="Latest" value={stats.latest ?? '—'} mono />
        <StatItem label="Format" value={stats.detectedFormat} />
        <StatItem label="Unique Dates" value={stats.uniqueCount} mono />
        <StatItem label="Nulls" value={`${stats.nullCount} (${stats.nullPercent}%)`} mono />
      </div>
    </div>
  )
}

function CategoricalCard({ col, stats }) {
  return (
    <div className="bg-white rounded-xl border border-border shadow-sm p-4 hover:shadow-md transition-shadow">
      <CardHeader col={col} type="categorical" />
      <NullBar nullPercent={stats.nullPercent} />
      <div className="mt-3">
        <StatItem label="Unique Values" value={stats.uniqueCount} mono />
        <StatItem label="Nulls" value={`${stats.nullCount} (${stats.nullPercent}%)`} mono />
        {stats.top5 && stats.top5.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Top Values</p>
            <div className="space-y-1.5">
              {stats.top5.map(({ value, count, percent }) => (
                <div key={value}>
                  <div className="flex justify-between text-[11px] mb-0.5">
                    <span className="truncate text-text-primary font-mono max-w-[60%]">{value}</span>
                    <span className="text-text-secondary shrink-0">{count} · {percent}%</span>
                  </div>
                  <div className="w-full h-1 bg-amber-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function FreetextCard({ col, stats }) {
  return (
    <div className="bg-white rounded-xl border border-border shadow-sm p-4 hover:shadow-md transition-shadow">
      <CardHeader col={col} type="freetext" />
      <NullBar nullPercent={stats.nullPercent} />
      <div className="mt-3 space-y-0">
        <StatItem label="Unique Values" value={stats.uniqueCount} mono />
        <StatItem label="Avg Length" value={`${stats.avgLength} chars`} mono />
        <StatItem label="Min Length" value={`${stats.minLength} chars`} mono />
        <StatItem label="Max Length" value={`${stats.maxLength} chars`} mono />
        <StatItem label="Nulls" value={`${stats.nullCount} (${stats.nullPercent}%)`} mono />
      </div>
    </div>
  )
}

const CARD_COMPONENTS = {
  numeric: NumericCard,
  date: DateCard,
  categorical: CategoricalCard,
  freetext: FreetextCard,
}

export default function DataProfile() {
  const { dataset, columns, types, fileName, dataStats } = useData()
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')

  const { datasetStats, columnStats } = useMemo(() => {
    if (!dataset) return { datasetStats: null, columnStats: {} }
    return computeProfile(dataset, columns, types)
  }, [dataset, columns, types])

  const filteredColumns = useMemo(() => {
    if (!columns) return []
    return columns.filter(col => {
      const stats = columnStats[col]
      if (!stats) return false
      const matchesTab = activeTab === 'all' || stats.type === activeTab
      const matchesSearch = col.toLowerCase().includes(search.toLowerCase())
      return matchesTab && matchesSearch
    })
  }, [columns, columnStats, activeTab, search])

  const typeCounts = useMemo(() => {
    if (!columns) return {}
    return columns.reduce((acc, col) => {
      const t = columnStats[col]?.type || 'freetext'
      acc[t] = (acc[t] || 0) + 1
      return acc
    }, {})
  }, [columns, columnStats])

  if (!dataset) {
    return (
      <div className="max-w-lg mx-auto pt-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <BarChart3 className="w-7 h-7 text-slate-400" />
        </div>
        <h1 className="text-xl font-semibold text-text-primary mb-1">Data Profile</h1>
        <p className="text-sm text-text-secondary mb-6">Upload a dataset to see auto-generated statistics for every column.</p>
        <Link to="/upload">
          <button className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 transition-colors cursor-pointer">
            <Upload className="w-4 h-4" />
            Upload Data
          </button>
        </Link>
      </div>
    )
  }

  const outlierCols = columns.filter(col => columnStats[col]?.outlierCount > 0)

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Data Profile</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            {fileName} — auto-generated statistics for all {columns.length} columns
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      {datasetStats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { Icon: Database,   label: 'Total Rows',      value: datasetStats.rowCount.toLocaleString(), color: 'text-brand-blue' },
            { Icon: Columns3,   label: 'Columns',         value: datasetStats.colCount,                 color: 'text-brand-blue' },
            { Icon: TrendingDown, label: 'Null Rate',     value: `${datasetStats.nullPercent}%`,         color: datasetStats.nullPercent > 10 ? 'text-red-500' : 'text-emerald-600' },
            { Icon: Copy,       label: 'Duplicate Rows',  value: datasetStats.duplicateCount.toLocaleString(), color: datasetStats.duplicateCount > 0 ? 'text-amber-500' : 'text-emerald-600' },
          ].map(({ Icon, label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-border shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-xs text-text-secondary">{label}</span>
              </div>
              <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Type breakdown pills */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {Object.entries(TYPE_META).map(([type, meta]) => {
          const count = typeCounts[type] || 0
          if (!count) return null
          return (
            <div key={type} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${meta.bg} ${meta.border} ${meta.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
              {meta.label}: {count}
            </div>
          )
        })}
      </div>

      {/* Outlier summary banner */}
      {outlierCols.length > 0 && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-semibold text-red-700">
              {outlierCols.length} column{outlierCols.length !== 1 ? 's' : ''} with outliers (IQR method)
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {outlierCols.map(col => (
              <span key={col} className="inline-flex items-center gap-1 px-2.5 py-1 bg-white rounded-lg text-xs font-mono text-red-700 border border-red-100">
                {col} · {columnStats[col].outlierCount}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-1 bg-white border border-border rounded-lg p-1">
          {TABS.map(tab => {
            const count = tab.id === 'all' ? columns.length : (typeCounts[tab.id] || 0)
            if (tab.id !== 'all' && !count) return null
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-brand-blue text-white'
                    : 'text-text-secondary hover:text-text-primary hover:bg-slate-50'
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`ml-1.5 text-[10px] ${activeTab === tab.id ? 'opacity-80' : 'text-text-muted'}`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2 border border-border rounded-lg bg-white px-3 py-1.5 w-52 focus-within:border-brand-accent focus-within:ring-2 focus-within:ring-brand-accent/15 transition-all">
          <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search columns…"
            className="flex-1 text-xs outline-none bg-transparent placeholder:text-text-muted"
          />
        </div>
      </div>

      {/* Column cards grid */}
      {filteredColumns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="w-8 h-8 text-text-muted mb-3" />
          <p className="text-sm font-medium text-text-primary">No columns match</p>
          <p className="text-xs text-text-secondary mt-1">Try a different filter or search term.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredColumns.map(col => {
            const stats = columnStats[col]
            if (!stats) return null
            const CardComponent = CARD_COMPONENTS[stats.type] || FreetextCard
            return <CardComponent key={col} col={col} stats={stats} />
          })}
        </div>
      )}
    </div>
  )
}
