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
    <aside className="fixed top-0 left-0 h-screen w-56 flex flex-col z-50 bg-sidebar-bg">
      {/* Brand */}
      <div className="px-4 pt-5 pb-4 shrink-0 border-b border-white/[0.07]">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded bg-brand-blue flex items-center justify-center shrink-0">
            <span className="text-white text-[10px] font-bold leading-none select-none">EDI</span>
          </div>
          <span className="text-white text-[13px] font-semibold tracking-tight">Data Analysis Tool</span>
        </div>
        <p className="text-[11px] text-white/30 mt-1 ml-8">Edinburgh Airport</p>
      </div>

      {/* Dataset status pill */}
      <div className="px-3 py-2.5 shrink-0 border-b border-white/[0.05]">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white/[0.04]">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: hasData ? '#10B981' : '#334155' }}
          />
          <span className="text-[11px] truncate" style={{ color: hasData ? '#6EE7B7' : '#475569' }}>
            {hasData ? (fileName || 'Dataset loaded') : 'No data loaded'}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2.5 py-3 overflow-y-auto space-y-4">
        {navGroups.map(({ label, items }) => (
          <div key={label}>
            <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25 select-none">
              {label}
            </p>
            <div className="space-y-0.5">
              {items.map(({ to, label: itemLabel, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[13px] transition-colors duration-150 cursor-pointer ${
                      isActive
                        ? 'bg-brand-blue text-white font-medium'
                        : 'text-white/40 hover:bg-white/[0.05] hover:text-white/80'
                    }`
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
      <div className="px-4 py-3 shrink-0 border-t border-white/[0.07]">
        <p className="text-[10px] text-white/20">v1.0 · Internal Tool</p>
      </div>
    </aside>
  )
}
