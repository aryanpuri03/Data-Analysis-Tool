import { useState } from 'react'

export default function IconLibrary() {
  const [loading, setLoading] = useState(true)

  return (
    <div className="-m-8 h-[calc(100vh)] relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-content-bg z-10">
          <div className="text-center">
            <div className="w-8 h-8 border-3 border-brand-blue/20 border-t-brand-blue rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm text-text-secondary">Loading Icon Library…</p>
          </div>
        </div>
      )}
      <iframe
        src="/index.html"
        title="Icon Library"
        className="w-full h-full border-0"
        onLoad={() => setLoading(false)}
      />
    </div>
  )
}
