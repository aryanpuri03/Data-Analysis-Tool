import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { DataProvider } from './context/DataContext'
import Sidebar from './components/Sidebar'

// Lazy-load all module pages so they only download when navigated to
const DataUpload = lazy(() => import('./modules/upload/DataUpload'))
const DataProfile = lazy(() => import('./modules/profile/DataProfile'))
const DataClean = lazy(() => import('./modules/clean/DataClean'))
const ChartBuilder = lazy(() => import('./modules/charts/ChartBuilder'))
const PivotTable = lazy(() => import('./modules/pivot/PivotTable'))
const CorrelationMatrix = lazy(() => import('./modules/correlation/CorrelationMatrix'))
const AIAssistant = lazy(() => import('./modules/ai/AIAssistant'))
const CalculatedColumns = lazy(() => import('./modules/calculated/CalculatedColumns'))
const ReportBuilder = lazy(() => import('./modules/report/ReportBuilder'))
const Forecasting = lazy(() => import('./modules/forecast/Forecasting'))
const NLFilter = lazy(() => import('./modules/nlfilter/NLFilter'))
const AnomalyExplainer = lazy(() => import('./modules/anomaly/AnomalyExplainer'))
const DataChat = lazy(() => import('./modules/chat/DataChat'))
const CodeGenerator = lazy(() => import('./modules/codegen/CodeGenerator'))
const IconLibrary = lazy(() => import('./modules/icons/IconLibrary'))
const TextAnalysis = lazy(() => import('./modules/textanalysis/TextAnalysis'))

function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-brand-blue/20 border-t-brand-blue animate-spin" />
      <p className="text-xs text-text-muted font-medium">Loading…</p>
    </div>
  )
}

export default function App() {
  return (
    <DataProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="ml-56 flex-1 p-7 bg-bg min-w-0 overflow-x-hidden">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/upload"   element={<DataUpload />} />
              <Route path="/profile"  element={<DataProfile />} />
              <Route path="/clean"    element={<DataClean />} />
              <Route path="/charts"   element={<ChartBuilder />} />
              <Route path="/pivot"    element={<PivotTable />} />
              <Route path="/correlations" element={<CorrelationMatrix />} />
              <Route path="/chat"     element={<DataChat />} />
              <Route path="/ai"       element={<AIAssistant />} />
              <Route path="/calculated" element={<CalculatedColumns />} />
              <Route path="/report"   element={<ReportBuilder />} />
              <Route path="/forecast" element={<Forecasting />} />
              <Route path="/filter"   element={<NLFilter />} />
              <Route path="/anomalies" element={<AnomalyExplainer />} />
              <Route path="/text-analysis" element={<TextAnalysis />} />
              <Route path="/codegen"   element={<CodeGenerator />} />
              <Route path="/icons"    element={<IconLibrary />} />
<Route path="*"         element={<Navigate to="/upload" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </DataProvider>
  )
}
