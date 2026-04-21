import { useLocation } from 'react-router-dom'
import { useData } from '../context/DataContext'

const routeTitles = {
  '/upload':       'Data Upload',
  '/profile':      'Data Profile',
  '/clean':        'Data Cleaning',
  '/calculated':   'Calculated Columns',
  '/filter':       'Smart Filter',
  '/charts':       'Chart Builder',
  '/pivot':        'Pivot Table',
  '/correlations': 'Correlation Matrix',
  '/forecast':     'Forecasting',
  '/anomalies':    'Anomaly Explainer',
  '/text-analysis':'Text Analysis',
  '/chat':         'Chat with Data',
  '/ai':           'AI Assistant',
  '/codegen':      'Code Generator',
  '/report':       'Auto Report',
  '/icons':        'Icon Library',
}

export default function Header() {
  const { pathname } = useLocation()
  const { dataset, fileName } = useData()
  const hasData = !!dataset

  const pageTitle = routeTitles[pathname] ?? 'Business Analytics'

  return (
    <header className="header-shadow fixed top-0 left-64 right-0 h-14 bg-white z-40 flex items-center justify-between px-7">
      {/* Left — page title */}
      <div className="flex items-center gap-3">
        {/* Accent rule */}
        <span
          className="block w-1 h-5 rounded-full"
          style={{ background: 'linear-gradient(180deg, #00A3E0 0%, #003F87 100%)' }}
        />
        <h1 className="text-[15px] font-semibold text-text-primary tracking-tight">{pageTitle}</h1>
      </div>

      {/* Right — status + user */}
      <div className="flex items-center gap-4">
        {/* Dataset status */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-2 border border-border text-[12px]">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{
              background: hasData ? '#10B981' : '#94A3B8',
              boxShadow: hasData ? '0 0 5px rgba(16,185,129,0.45)' : 'none',
            }}
          />
          <span style={{ color: hasData ? '#059669' : '#64748B' }}>
            {hasData ? (fileName || 'Dataset loaded') : 'No data loaded'}
          </span>
        </div>

        {/* Divider */}
        <span className="block w-px h-5 bg-border" />

        {/* User badge */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
            style={{ background: 'linear-gradient(135deg, #003F87 0%, #0052AA 100%)' }}
          >
            AP
          </div>
          <span className="text-[13px] font-medium text-text-secondary">Aryan Puri</span>
        </div>
      </div>
    </header>
  )
}
