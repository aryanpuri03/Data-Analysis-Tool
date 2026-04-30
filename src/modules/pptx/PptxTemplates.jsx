import { useState } from 'react'
import { Presentation, Download, Search, Tag, Star, Eye, X } from 'lucide-react'

const TEMPLATES = [
  {
    id: 'cx-monthly',
    name: 'CX Monthly Report',
    description: 'Monthly customer experience summary with KPIs, sentiment trends, and key themes.',
    tags: ['CX', 'Monthly', 'Sentiment'],
    slides: 12,
    featured: true,
    preview: null,
  },
  {
    id: 'nps-deep-dive',
    name: 'NPS Deep Dive',
    description: 'Net Promoter Score breakdown with promoter/detractor analysis and verbatim highlights.',
    tags: ['NPS', 'Survey', 'Verbatim'],
    slides: 10,
    featured: true,
    preview: null,
  },
  {
    id: 'q-review',
    name: 'Quarterly Review',
    description: 'Quarter-over-quarter performance summary with trend lines and department scorecards.',
    tags: ['Quarterly', 'KPIs', 'Trends'],
    slides: 16,
    featured: false,
    preview: null,
  },
  {
    id: 'text-insights',
    name: 'Text Analysis Insights',
    description: 'Presents free-text analysis results — top themes, sentiment distribution, and sample quotes.',
    tags: ['Text Analysis', 'Themes', 'Quotes'],
    slides: 8,
    featured: false,
    preview: null,
  },
  {
    id: 'exec-briefing',
    name: 'Executive Briefing',
    description: 'Concise C-suite summary with headline metrics, top issues, and recommended actions.',
    tags: ['Executive', 'Summary', 'Actions'],
    slides: 6,
    featured: true,
    preview: null,
  },
  {
    id: 'topic-search',
    name: 'Topic Search Results',
    description: 'Presents topic search findings with matched responses, relevance scores, and AI analysis.',
    tags: ['Topic Search', 'Verbatim', 'AI'],
    slides: 9,
    featured: false,
    preview: null,
  },
  {
    id: 'team-update',
    name: 'Team Update',
    description: 'Weekly or monthly team-level snapshot with operational metrics and action items.',
    tags: ['Team', 'Operational', 'Weekly'],
    slides: 7,
    featured: false,
    preview: null,
  },
  {
    id: 'benchmarking',
    name: 'Benchmarking Report',
    description: 'Year-on-year and peer benchmarking with indexed scores and gap analysis.',
    tags: ['Benchmarking', 'YoY', 'Comparison'],
    slides: 14,
    featured: false,
    preview: null,
  },
]

const TAG_COLOURS = {
  'CX':            'bg-blue-50 text-blue-600 border-blue-200',
  'Monthly':       'bg-slate-50 text-slate-500 border-slate-200',
  'Sentiment':     'bg-purple-50 text-purple-600 border-purple-200',
  'NPS':           'bg-amber-50 text-amber-600 border-amber-200',
  'Survey':        'bg-amber-50 text-amber-600 border-amber-200',
  'Verbatim':      'bg-orange-50 text-orange-600 border-orange-200',
  'Quarterly':     'bg-teal-50 text-teal-600 border-teal-200',
  'KPIs':          'bg-emerald-50 text-emerald-600 border-emerald-200',
  'Trends':        'bg-cyan-50 text-cyan-600 border-cyan-200',
  'Text Analysis': 'bg-violet-50 text-violet-600 border-violet-200',
  'Themes':        'bg-violet-50 text-violet-600 border-violet-200',
  'Quotes':        'bg-pink-50 text-pink-600 border-pink-200',
  'Executive':     'bg-indigo-50 text-indigo-600 border-indigo-200',
  'Summary':       'bg-slate-50 text-slate-500 border-slate-200',
  'Actions':       'bg-red-50 text-red-600 border-red-200',
  'Topic Search':  'bg-violet-50 text-violet-600 border-violet-200',
  'AI':            'bg-blue-50 text-blue-600 border-blue-200',
  'Team':          'bg-green-50 text-green-600 border-green-200',
  'Operational':   'bg-slate-50 text-slate-500 border-slate-200',
  'Weekly':        'bg-slate-50 text-slate-500 border-slate-200',
  'Benchmarking':  'bg-amber-50 text-amber-600 border-amber-200',
  'YoY':           'bg-amber-50 text-amber-600 border-amber-200',
  'Comparison':    'bg-orange-50 text-orange-600 border-orange-200',
}

function TagPill({ label }) {
  const cls = TAG_COLOURS[label] || 'bg-slate-50 text-slate-500 border-slate-200'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {label}
    </span>
  )
}

function TemplateCard({ template, onPreview }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-100 transition-all group flex flex-col">
      {/* Thumbnail placeholder */}
      <div className="relative rounded-t-2xl overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 h-36 flex items-center justify-center shrink-0">
        <div className="flex flex-col items-center gap-2 text-slate-300">
          <Presentation className="w-10 h-10" />
          <span className="text-[11px] font-medium">{template.slides} slides</span>
        </div>
        {template.featured && (
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1 px-2 py-0.5 bg-amber-400 text-white text-[10px] font-bold rounded-full shadow-sm">
            <Star className="w-2.5 h-2.5" /> Featured
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/[0.06] transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
          <button
            onClick={() => onPreview(template)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-700 text-[11px] font-semibold rounded-lg shadow border border-slate-200 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" /> Preview
          </button>
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <p className="text-sm font-semibold text-slate-800 mb-1 leading-tight">{template.name}</p>
        <p className="text-xs text-slate-400 leading-relaxed mb-3 flex-1">{template.description}</p>
        <div className="flex flex-wrap gap-1 mb-4">
          {template.tags.map(t => <TagPill key={t} label={t} />)}
        </div>
        <button
          className="w-full flex items-center justify-center gap-2 py-2 bg-slate-800 hover:bg-blue-600 text-white text-xs font-semibold rounded-xl transition-all active:scale-95 shadow-sm"
          onClick={() => alert(`Download coming soon — "${template.name}"`)}
        >
          <Download className="w-3.5 h-3.5" /> Download Template
        </button>
      </div>
    </div>
  )
}

function PreviewModal({ template, onClose }) {
  if (!template) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-6" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
              <Presentation className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{template.name}</p>
              <p className="text-[11px] text-slate-400">{template.slides} slides</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Slide preview placeholder */}
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 mx-6 mt-5 rounded-xl h-48 flex items-center justify-center border border-slate-200">
          <div className="text-center text-slate-300 space-y-2">
            <Presentation className="w-12 h-12 mx-auto" />
            <p className="text-xs font-medium">Slide preview coming soon</p>
          </div>
        </div>

        <div className="px-6 py-5">
          <p className="text-sm text-slate-600 leading-relaxed mb-4">{template.description}</p>
          <div className="flex flex-wrap gap-1.5 mb-5">
            {template.tags.map(t => <TagPill key={t} label={t} />)}
          </div>
          <button
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-all active:scale-95 shadow-sm shadow-blue-200"
            onClick={() => alert(`Download coming soon — "${template.name}"`)}
          >
            <Download className="w-4 h-4" /> Download Template
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PptxTemplates() {
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState(null)
  const [previewTemplate, setPreviewTemplate] = useState(null)

  const allTags = [...new Set(TEMPLATES.flatMap(t => t.tags))].sort()

  const filtered = TEMPLATES.filter(t => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase()) || t.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()))
    const matchTag = !activeTag || t.tags.includes(activeTag)
    return matchSearch && matchTag
  })

  return (
    <div className="space-y-7 pb-8">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm shrink-0">
              <Presentation className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">PowerPoint Templates</h1>
          </div>
          <p className="text-sm text-slate-500 ml-10.5">
            Ready-made slide decks for CX reporting, NPS analysis, and data presentations
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] text-slate-400">Templates</p>
          <p className="text-base font-bold text-slate-700">{TEMPLATES.length}</p>
        </div>
      </div>

      {/* Search + tag filters */}
      <div className="space-y-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 text-slate-700 placeholder:text-slate-300 transition-all"
          />
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 mr-1">
            <Tag className="w-3 h-3" /> Filter
          </span>
          <button
            onClick={() => setActiveTag(null)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
              !activeTag ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
            }`}
          >
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                activeTag === tag
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Template grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-300">
          <Presentation className="w-10 h-10" />
          <p className="text-sm font-medium text-slate-400">No templates match your search</p>
          <button
            onClick={() => { setSearch(''); setActiveTag(null) }}
            className="text-xs text-blue-500 hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map(template => (
            <TemplateCard key={template.id} template={template} onPreview={setPreviewTemplate} />
          ))}
        </div>
      )}

      <PreviewModal template={previewTemplate} onClose={() => setPreviewTemplate(null)} />
    </div>
  )
}
