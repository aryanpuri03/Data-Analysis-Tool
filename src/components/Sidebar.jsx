import { NavLink } from 'react-router-dom'
import { useData } from '../context/DataContext'
import {
  Upload, LayoutDashboard, Wand2, Sigma,
  Filter, BarChart3, Table2, GitMerge, TrendingUp, AlertTriangle, Type,
  Sparkles, Code2, FileText, Layers, MessageSquare,
} from 'lucide-react'

const navGroups = [
  {
    label: 'Data',
    items: [
      { to: '/upload',     label: 'Upload',          icon: Upload },
      { to: '/profile',    label: 'Profile',         icon: LayoutDashboard },
      { to: '/clean',      label: 'Clean',           icon: Wand2 },
      { to: '/calculated', label: 'Calculated Cols', icon: Sigma },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { to: '/filter',       label: 'Smart Filter',  icon: Filter },
      { to: '/charts',       label: 'Charts',        icon: BarChart3 },
      { to: '/pivot',        label: 'Pivot Table',   icon: Table2 },
      { to: '/correlations', label: 'Correlations',  icon: GitMerge },
      { to: '/forecast',     label: 'Forecasting',   icon: TrendingUp },
      { to: '/anomalies',    label: 'Anomalies',     icon: AlertTriangle },
      { to: '/text-analysis', label: 'Text Analysis', icon: Type },
    ],
  },
  {
    label: 'AI',
    items: [
      { to: '/chat',    label: 'Chat with Data', icon: MessageSquare },
      { to: '/ai',      label: 'AI Assistant',   icon: Sparkles },
      { to: '/codegen', label: 'Code Generator', icon: Code2 },
      { to: '/report',  label: 'Auto Report',    icon: FileText },
    ],
  },
  {
    label: 'Platform',
    items: [
      { to: '/icons', label: 'Icon Library', icon: Layers },
    ],
  },
]

export default function Sidebar() {
  const { dataset, fileName } = useData()
  const hasData = !!dataset

  return (
    <aside className="sidebar-gradient fixed top-0 left-0 h-screen w-64 flex flex-col z-50">
      {/* Brand */}
      <div className="px-5 pt-6 pb-5 shrink-0 border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #00A3E0 0%, #0079B8 100%)' }}
          >
            <span className="text-white text-[11px] font-bold leading-none select-none tracking-tight">EDI</span>
          </div>
          {/* Brand text */}
          <div className="min-w-0">
            <p className="text-white text-[13px] font-semibold leading-tight tracking-tight">Business Analytics</p>
            <p className="text-white/50 text-[11px] leading-tight mt-0.5">Data Analysis Tool</p>
          </div>
        </div>
        {/* Sub-brand */}
        <div className="mt-3 flex items-center gap-2 ml-12">
          <span
            className="inline-block w-3 h-px"
            style={{ background: '#00A3E0', opacity: 0.5 }}
          />
          <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: '#00A3E0', opacity: 0.7 }}>
            Edinburgh Airport
          </p>
        </div>
      </div>

      {/* Dataset status pill */}
      <div className="px-4 py-3 shrink-0 border-b border-white/[0.05]">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.06]">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{
              background: hasData ? '#10B981' : '#334155',
              boxShadow: hasData ? '0 0 6px rgba(16,185,129,0.5)' : 'none',
            }}
          />
          <span className="text-[11px] truncate" style={{ color: hasData ? '#6EE7B7' : '#475569' }}>
            {hasData ? (fileName || 'Dataset loaded') : 'No data loaded'}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5">
        {navGroups.map(({ label, items }) => (
          <div key={label}>
            <p className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] select-none"
              style={{ color: 'rgba(255,255,255,0.22)' }}>
              {label}
            </p>
            <div className="space-y-0.5">
              {items.map(({ to, label: itemLabel, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 py-[7px] rounded-md text-[13px] transition-all duration-150 cursor-pointer ${
                      isActive
                        ? 'text-white font-medium pl-2 pr-3 border-l-[3px] border-brand-accent'
                        : 'text-white/40 hover:text-white/80 px-2.5 hover:bg-white/[0.05]'
                    }`
                  }
                  style={({ isActive }) =>
                    isActive
                      ? { background: 'rgba(0,63,135,0.65)' }
                      : {}
                  }
                >
                  <Icon className="w-[15px] h-[15px] shrink-0" />
                  <span className="leading-none">{itemLabel}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 shrink-0 border-t border-white/[0.07]">
        <p className="text-[11px] italic" style={{ color: 'rgba(255,255,255,0.28)' }}>By Aryan Puri</p>
        <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.16)' }}>v1.0 · Internal Platform</p>
      </div>
    </aside>
  )
}
