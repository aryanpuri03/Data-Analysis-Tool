import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { DataProvider } from './context/DataContext'
import Sidebar from './components/Sidebar'
import Header from './components/Header'

// Lazy-load all module pages so they only download when navigated to
const DataUpload = lazy(() => import('./modules/upload/DataUpload'))
const DataProfile = lazy(() => import('./modules/profile/DataProfile'))
const DataClean = lazy(() => import('./modules/clean/DataClean'))
const PivotTable = lazy(() => import('./modules/pivot/PivotTable'))
const AIAssistant = lazy(() => import('./modules/ai/AIAssistant'))
const ReportBuilder = lazy(() => import('./modules/report/ReportBuilder'))
const DataChat = lazy(() => import('./modules/chat/DataChat'))
const IconLibrary = lazy(() => import('./modules/icons/IconLibrary'))
const TextAnalysis = lazy(() => import('./modules/textanalysis/TextAnalysis'))
const PptxTemplates = lazy(() => import('./modules/pptx/PptxTemplates'))

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
        <div className="ml-64 flex-1 flex flex-col min-h-screen">
          <Header />
          <main className="flex-1 mt-14 p-7 bg-bg min-w-0 overflow-x-hidden">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/upload"        element={<DataUpload />} />
                <Route path="/profile"       element={<DataProfile />} />
                <Route path="/clean"         element={<DataClean />} />
                <Route path="/pivot"         element={<PivotTable />} />
                <Route path="/chat"          element={<DataChat />} />
                <Route path="/ai"            element={<AIAssistant />} />
                <Route path="/report"        element={<ReportBuilder />} />
                <Route path="/text-analysis" element={<TextAnalysis />} />
                <Route path="/pptx"          element={<PptxTemplates />} />
                <Route path="/icons"         element={<IconLibrary />} />
                <Route path="*"              element={<Navigate to="/upload" replace />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>
    </DataProvider>
  )
}
