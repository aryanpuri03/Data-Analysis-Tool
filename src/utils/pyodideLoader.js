/**
 * pyodideLoader.js
 *
 * Singleton Pyodide loader — shared across all modules.
 * Pyodide (~25 MB) is downloaded and initialised only once per page load,
 * even if multiple components call getPyodide() concurrently.
 */

let _instance = null
let _loading = null

export async function getPyodide() {
  if (_instance) return _instance
  if (_loading) return _loading

  _loading = (async () => {
    if (!window.loadPyodide) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.js'
        s.onload = resolve
        s.onerror = () => reject(new Error('Failed to load Pyodide from CDN'))
        document.head.appendChild(s)
      })
    }
    const py = await window.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/' })
    await py.loadPackage(['pandas', 'numpy'])
    _instance = py
    _loading = null
    return py
  })()

  return _loading
}
