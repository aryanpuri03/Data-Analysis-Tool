/**
 * exportData.js
 * Client-side CSV and Excel export helpers using PapaParse and SheetJS.
 */

import Papa from 'papaparse'
import * as XLSX from 'xlsx'

function sanitizeFilename(name) {
  return (name || 'export').replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_')
}

/**
 * Download rows as a CSV file.
 * @param {object[]} rows
 * @param {string[]} columns  Column order
 * @param {string}   filename Without extension
 */
export function exportCSV(rows, columns, filename = 'export') {
  if (!rows || rows.length === 0) return
  const ordered = rows.map(row =>
    Object.fromEntries(columns.map(c => [c, row[c] ?? '']))
  )
  const csv = Papa.unparse(ordered, { columns })
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, `${sanitizeFilename(filename)}.csv`)
}

/**
 * Download rows as an Excel (.xlsx) file.
 * @param {object[]} rows
 * @param {string[]} columns  Column order
 * @param {string}   filename Without extension
 * @param {string}   [sheetName]
 */
export function exportExcel(rows, columns, filename = 'export', sheetName = 'Data') {
  if (!rows || rows.length === 0) return
  const ordered = rows.map(row =>
    Object.fromEntries(columns.map(c => [c, row[c] ?? '']))
  )
  const worksheet = XLSX.utils.json_to_sheet(ordered, { header: columns })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31))
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  triggerDownload(blob, `${sanitizeFilename(filename)}.xlsx`)
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
