import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, Play, Download, AlertCircle, Loader2, CheckCircle2, X, FileSpreadsheet } from 'lucide-react'
import calculatePy from '../../python/calculate.py?raw'

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/'

// Python wrapper that runs calculate.py logic inside Pyodide.
// calculate.py is injected into the VFS at /calculate.py before this runs.
const WRAPPER_SCRIPT = `
import sys
for _m in list(sys.modules.keys()):
    if _m in ('config', 'calculate'):
        del sys.modules[_m]
if '/' not in sys.path:
    sys.path.insert(0, '/')

import config
from calculate import find_summary_row, detect_is_empty, shift_columns, QUESTION_REGISTRY
from openpyxl import load_workbook
import pandas as pd

print("Loading workbook...")
wb = load_workbook(config.INPUT_PATH)
ws_summary = wb["Overall Summary"]
target_col = config.TARGET_COLUMN
label = ws_summary.cell(row=2, column=target_col).value
if label != config.REPORT_MONTH_LABEL:
    raise ValueError(
        f"Column {target_col} has label '{label}', expected '{config.REPORT_MONTH_LABEL}'. "
        f"Verify Report Month Label matches row 2 of column {target_col} in the template exactly."
    )
print(f"Target column validated: col {target_col} = '{label}'")
is_empty = detect_is_empty(ws_summary, target_col)
print(f"Shift mode: {'EXPANSION' if is_empty else 'ROLLING'}")
print("Shifting columns...")
shift_columns(wb, is_empty=is_empty)
print("Loading raw data...")
df = pd.read_excel(config.RAW_DATA_PATH, sheet_name=0)
print(f"Raw data: {len(df)} rows, {len(df.columns)} columns")
print("Writing manual inputs...")
pax_row = find_summary_row(ws_summary, "No. of Pax")
ws_summary.cell(row=pax_row, column=target_col).value = config.PASSENGER_COUNT
survey_row = find_summary_row(ws_summary, "No. of surveys achieved ")
ws_summary.cell(row=survey_row, column=target_col).value = len(df)
print(f"    - Survey count: {len(df)}")
for question in QUESTION_REGISTRY:
    print(f"Calculating: {question['name']}...")
    try:
        question["fn"](df, ws_summary, target_col)
    except Exception as e:
        print(f"  ERROR in {question['name']}: {e}")
wb.save(config.OUTPUT_PATH)
print("Done.")
`

function FileDropZone({ label, hint, file, onFile, accept = '.xlsx' }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <div
        className={`relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 cursor-pointer transition-colors
          ${dragging ? 'border-brand-accent bg-brand-accent/5' : file ? 'border-green-400 bg-green-50' : 'border-border hover:border-brand-accent/50 hover:bg-surface-raised'}
        `}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]) }}
        />
        {file ? (
          <>
            <FileSpreadsheet className="w-5 h-5 text-green-500" />
            <span className="text-xs font-medium text-green-700 text-center break-all">{file.name}</span>
            <button
              className="absolute top-1.5 right-1.5 p-0.5 rounded text-text-muted hover:text-text-primary"
              onClick={e => { e.stopPropagation(); onFile(null) }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            <Upload className="w-5 h-5 text-text-muted" />
            <span className="text-xs text-text-muted text-center">{hint}</span>
          </>
        )}
      </div>
    </div>
  )
}

export default function CXMonthlyReport() {
  const [rawFile, setRawFile] = useState(null)
  const [templateFile, setTemplateFile] = useState(null)
  const [passengerCount, setPassengerCount] = useState('')
  const [targetColumn, setTargetColumn] = useState('15')
  const [monthLabel, setMonthLabel] = useState('')

  // status: idle | loading-pyodide | installing | running | done | error
  const [status, setStatus] = useState('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [logs, setLogs] = useState([])
  const [outputBlob, setOutputBlob] = useState(null)
  const [outputUrl, setOutputUrl] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  const pyRef = useRef(null)
  const logEndRef = useRef(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Revoke previous output URL to avoid memory leaks
  useEffect(() => {
    return () => { if (outputUrl) URL.revokeObjectURL(outputUrl) }
  }, [outputUrl])

  const canRun = rawFile && templateFile && passengerCount && monthLabel

  const run = useCallback(async () => {
    if (!canRun) return
    setLogs([])
    setOutputBlob(null)
    setOutputUrl(null)
    setErrorMsg('')

    const appendLog = (line) => setLogs(prev => [...prev, line])

    try {
      // ── Step 1: Load Pyodide ──
      if (!pyRef.current) {
        setStatus('loading-pyodide')
        setStatusMsg('Loading Python runtime (first run only, ~5 MB)…')
        if (!window.loadPyodide) {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script')
            s.src = `${PYODIDE_CDN}pyodide.js`
            s.onload = resolve
            s.onerror = () => reject(new Error('Failed to load Pyodide from CDN. Check your internet connection.'))
            document.head.appendChild(s)
          })
        }
        pyRef.current = await window.loadPyodide({ indexURL: PYODIDE_CDN })
      }

      const py = pyRef.current

      // ── Step 2: Install packages (idempotent after first run) ──
      setStatus('installing')
      setStatusMsg('Installing pandas and openpyxl…')
      await py.loadPackage(['pandas'])
      await py.runPythonAsync(`import micropip\nawait micropip.install('openpyxl')`)

      // ── Step 3: Write files to virtual filesystem ──
      setStatus('running')
      setStatusMsg('Running — this may take 30–60 seconds for large files…')

      const [rawBuf, templateBuf] = await Promise.all([
        rawFile.arrayBuffer(),
        templateFile.arrayBuffer(),
      ])
      py.FS.writeFile('/raw_data.xlsx', new Uint8Array(rawBuf))
      py.FS.writeFile('/template.xlsx', new Uint8Array(templateBuf))

      // ── Step 4: Write config ──
      const safeLabel = monthLabel.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      const configPy = [
        `INPUT_PATH = '/template.xlsx'`,
        `RAW_DATA_PATH = '/raw_data.xlsx'`,
        `OUTPUT_PATH = '/output.xlsx'`,
        `PASSENGER_COUNT = ${parseInt(passengerCount, 10)}`,
        `TARGET_COLUMN = ${parseInt(targetColumn, 10)}`,
        `REPORT_MONTH_LABEL = '${safeLabel}'`,
      ].join('\n')
      py.FS.writeFile('/config.py', configPy)

      // ── Step 5: Write calculate.py ──
      py.FS.writeFile('/calculate.py', calculatePy)

      // ── Step 6: Capture stdout and run ──
      py.setStdout({ batched: (line) => appendLog(line) })
      py.setStderr({ batched: (line) => appendLog('ERR: ' + line) })

      await py.runPythonAsync(WRAPPER_SCRIPT)

      // ── Step 7: Read output and offer download ──
      const outputBytes = py.FS.readFile('/output.xlsx')
      const blob = new Blob([outputBytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      setOutputBlob(blob)
      setOutputUrl(url)
      setStatus('done')
      setStatusMsg('')
    } catch (err) {
      setErrorMsg(String(err.message || err))
      setStatus('error')
      setStatusMsg('')
    }
  }, [canRun, rawFile, templateFile, passengerCount, targetColumn, monthLabel])

  const isRunning = ['loading-pyodide', 'installing', 'running'].includes(status)

  const outputFilename = monthLabel
    ? `CX_Output_${monthLabel.replace(/[^a-zA-Z0-9-]/g, '_')}.xlsx`
    : 'CX_Output.xlsx'

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-text-primary">CX Monthly Survey Report</h1>
        <p className="text-sm text-text-secondary mt-1">
          Calculates ~45 CX metrics from a Typeform export and writes them into the rolling
          summary workbook.
        </p>
      </div>

      {/* Inputs card */}
      <div className="bg-surface rounded-xl border border-border shadow-sm p-5 space-y-5">
        <p className="text-sm font-semibold text-text-primary">Files</p>

        <div className="grid grid-cols-2 gap-4">
          <FileDropZone
            label="This month's raw data"
            hint="Typeform export (.xlsx)"
            file={rawFile}
            onFile={setRawFile}
          />
          <FileDropZone
            label="Last month's CS output"
            hint="Rolling summary workbook (.xlsx)"
            file={templateFile}
            onFile={setTemplateFile}
          />
        </div>

        <p className="text-xs text-text-muted">
          Don't have a CS output file yet?{' '}
          <a
            href="/cx-report-template.xlsx"
            download="CX_Report_Template.xlsx"
            className="text-brand-accent hover:underline"
          >
            Download blank template
          </a>
        </p>
      </div>

      {/* Manual inputs card */}
      <div className="bg-surface rounded-xl border border-border shadow-sm p-5 space-y-4">
        <p className="text-sm font-semibold text-text-primary">Configuration</p>

        <div className="grid grid-cols-3 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Passenger count</span>
            <input
              type="number"
              min="0"
              placeholder="e.g. 184000"
              value={passengerCount}
              onChange={e => setPassengerCount(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-accent/40 focus:border-brand-accent"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Target column</span>
            <input
              type="number"
              min="1"
              placeholder="15"
              value={targetColumn}
              onChange={e => setTargetColumn(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-accent/40 focus:border-brand-accent"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Report month label</span>
            <input
              type="text"
              placeholder="e.g. Feb-26"
              value={monthLabel}
              onChange={e => setMonthLabel(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-accent/40 focus:border-brand-accent"
            />
            <span className="text-[11px] text-text-muted">Must match row 2 of the target column exactly</span>
          </label>
        </div>
      </div>

      {/* Run button */}
      <button
        onClick={run}
        disabled={!canRun || isRunning}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-brand-blue hover:bg-brand-blue-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {isRunning ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Play className="w-4 h-4" />
        )}
        {isRunning ? statusMsg : 'Run Report'}
      </button>

      {/* Log panel */}
      {(logs.length > 0 || isRunning) && (
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface-raised">
            <span className="text-xs font-semibold text-text-secondary">Output log</span>
            {isRunning && <Loader2 className="w-3.5 h-3.5 text-text-muted animate-spin" />}
            {status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
          </div>
          <div className="p-4 max-h-80 overflow-y-auto font-mono text-[12px] text-text-secondary leading-relaxed">
            {logs.map((line, i) => (
              <div
                key={i}
                className={line.startsWith('ERR:') ? 'text-red-500' : line.startsWith('Done') ? 'text-green-600 font-medium' : ''}
              >
                {line}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* Download */}
      {status === 'done' && outputUrl && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
          <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-800">Report generated successfully</p>
            <p className="text-xs text-green-600 mt-0.5">The original file was not modified.</p>
          </div>
          <a
            href={outputUrl}
            download={outputFilename}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition-colors shrink-0"
          >
            <Download className="w-4 h-4" />
            Download
          </a>
        </div>
      )}

      {/* Error */}
      {status === 'error' && errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-red-800">Error</p>
            <pre className="text-xs text-red-600 mt-1 whitespace-pre-wrap break-words font-mono">{errorMsg}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
