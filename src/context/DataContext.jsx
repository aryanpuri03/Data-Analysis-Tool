import { createContext, useContext, useState, useCallback, useMemo } from 'react'

const DataContext = createContext(null)

const MAX_HISTORY = 10

export function DataProvider({ children }) {
  const [dataset, setDatasetRaw] = useState(null)
  const [columns, setColumns] = useState([])
  const [types, setTypes] = useState({})
  const [fileName, setFileName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')

  // Undo/redo history — stores dataset snapshots
  const [history, setHistory] = useState([])   // array of { rows, columns }
  const [historyIdx, setHistoryIdx] = useState(-1)

  const canUndo = historyIdx > 0
  const canRedo = historyIdx < history.length - 1

  // ── Initial dataset load (replaces entire state, resets history) ──
  const setDataset = useCallback((rows, cols, inferredTypes, name) => {
    setDatasetRaw(rows)
    setColumns(cols)
    setTypes(inferredTypes)
    setFileName(name)
    // Seed history with the initial state
    const snap = { rows, columns: cols }
    setHistory([snap])
    setHistoryIdx(0)
  }, [])

  const updateTypes = useCallback((newTypes) => {
    setTypes(prev => ({ ...prev, ...newTypes }))
  }, [])

  // ── Update dataset (used by cleaning operations) ──
  // Pass { skipHistory: true } to skip adding a history entry (for intermediate operations)
  const updateDataset = useCallback((newRows, opts = {}) => {
    setDatasetRaw(newRows)
    const newCols = newRows && newRows.length > 0 ? Object.keys(newRows[0]) : columns
    setColumns(newCols)

    if (!opts.skipHistory) {
      const snap = { rows: newRows, columns: newCols }
      setHistory(prev => {
        // Discard any redo states ahead of current idx
        const trimmed = prev.slice(0, historyIdx + 1)
        const next = [...trimmed, snap].slice(-MAX_HISTORY)
        setHistoryIdx(next.length - 1)
        return next
      })
    }
  }, [columns, historyIdx])

  const undoClean = useCallback(() => {
    if (!canUndo) return
    const newIdx = historyIdx - 1
    const snap = history[newIdx]
    setDatasetRaw(snap.rows)
    setColumns(snap.columns)
    setHistoryIdx(newIdx)
  }, [canUndo, historyIdx, history])

  const redoClean = useCallback(() => {
    if (!canRedo) return
    const newIdx = historyIdx + 1
    const snap = history[newIdx]
    setDatasetRaw(snap.rows)
    setColumns(snap.columns)
    setHistoryIdx(newIdx)
  }, [canRedo, historyIdx, history])

  const clearDataset = useCallback(() => {
    setDatasetRaw(null)
    setColumns([])
    setTypes({})
    setFileName('')
    setHistory([])
    setHistoryIdx(-1)
  }, [])

  // ── Derived stats (memoised, never triggers extra re-renders) ──
  const dataStats = useMemo(() => {
    if (!dataset || !columns.length) return null
    const rowCount = dataset.length
    const columnCount = columns.length
    const numericCount = columns.filter(c => types[c] === 'numeric').length
    const categoricalCount = columns.filter(c => types[c] === 'categorical').length
    const dateCount = columns.filter(c => types[c] === 'date').length
    const freetextCount = columns.filter(c => types[c] === 'freetext').length

    let totalCells = 0
    let nullCells = 0
    for (const row of dataset) {
      for (const col of columns) {
        totalCells++
        const v = row[col]
        if (v === null || v === undefined || String(v).trim() === '' || String(v).toLowerCase() === 'null') nullCells++
      }
    }
    const nullRate = totalCells > 0 ? ((nullCells / totalCells) * 100).toFixed(1) : '0.0'

    return { rowCount, columnCount, numericCount, categoricalCount, dateCount, freetextCount, nullRate }
  }, [dataset, columns, types])

  const value = useMemo(() => ({
    dataset,
    columns,
    types,
    fileName,
    isLoading,
    loadingMessage,
    setIsLoading,
    setLoadingMessage,
    dataStats,
    canUndo,
    canRedo,
    setDataset,
    updateTypes,
    updateDataset,
    undoClean,
    redoClean,
    clearDataset,
  }), [
    dataset, columns, types, fileName, isLoading, loadingMessage,
    dataStats, canUndo, canRedo,
    setDataset, updateTypes, updateDataset, undoClean, redoClean, clearDataset,
  ])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const context = useContext(DataContext)
  if (!context) throw new Error('useData must be used within a DataProvider')
  return context
}
