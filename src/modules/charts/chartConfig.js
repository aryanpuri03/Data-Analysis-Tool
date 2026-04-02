/**
 * Default chart configuration and preset themes.
 * This config object is the single source of truth for all chart styling.
 */

export const defaultConfig = {
  // ── Titles & Labels ──
  title:  { text: '', fontSize: 18, fontWeight: 'bold', color: '#0F172A', align: 'center' },
  xLabel: { text: '', fontSize: 12, color: '#64748B' },
  yLabel: { text: '', fontSize: 12, color: '#64748B' },
  legend: { show: true, position: 'bottom', fontSize: 12 },

  // ── Axes ──
  xAxis: {
    showGridlines: false, gridColor: '#E2E8F0', gridStyle: 'dashed',
    tickFontSize: 11, tickRotation: 0, lineColor: '#CBD5E1', showLine: true,
  },
  yAxis: {
    showGridlines: true, gridColor: '#E2E8F0', gridStyle: 'dashed',
    tickFontSize: 11, lineColor: '#CBD5E1', showLine: true,
    minAuto: true, minValue: 0, maxAuto: true, maxValue: 100,
  },

  // ── Series ──
  series: {
    colors: ['#003F87', '#00A3E0', '#0EA5E9', '#6366F1', '#8B5CF6', '#EC4899', '#F43F5E', '#F97316', '#EAB308', '#22C55E', '#14B8A6', '#06B6D4'],
    labels: {},  // { originalKey: overriddenLabel }
    // Bar
    barRadius: 3, barGap: 4,
    // Line
    lineWidth: 2, lineStyle: 'solid', dotSize: 0, showDots: false,
    // Scatter
    scatterSize: 40, scatterShape: 'circle',
    // Pie
    pieLabels: true, pieLabelFormat: 'percentage', pieInnerRadius: 0,
  },

  // ── Canvas ──
  canvas: {
    bgColor: '#FFFFFF',
    width: 800, height: 500,
    padding: { top: 20, right: 30, bottom: 20, left: 30 },
  },
}

// Deep clone helper
const clone = (obj) => JSON.parse(JSON.stringify(obj))

export const presets = {
  clean: {
    label: 'Clean',
    desc: 'Minimal, Edinburgh Airport blue',
    apply: () => {
      const c = clone(defaultConfig)
      c.xAxis.showGridlines = false
      c.yAxis.showGridlines = false
      c.series.colors = ['#003F87', '#00A3E0', '#6366F1', '#8B5CF6', '#0EA5E9', '#14B8A6']
      c.series.barRadius = 4
      c.canvas.bgColor = '#FFFFFF'
      return c
    },
  },
  grid: {
    label: 'Grid',
    desc: 'Light gridlines, standard colours',
    apply: () => {
      const c = clone(defaultConfig)
      c.xAxis.showGridlines = true
      c.yAxis.showGridlines = true
      c.xAxis.gridColor = '#F1F5F9'
      c.yAxis.gridColor = '#F1F5F9'
      c.xAxis.gridStyle = 'solid'
      c.yAxis.gridStyle = 'solid'
      c.series.barRadius = 2
      return c
    },
  },
  dark: {
    label: 'Dark',
    desc: 'Dark background, bright accents',
    apply: () => {
      const c = clone(defaultConfig)
      c.canvas.bgColor = '#1a1a2e'
      c.title.color = '#F1F5F9'
      c.xLabel.color = '#94A3B8'
      c.yLabel.color = '#94A3B8'
      c.xAxis.lineColor = '#334155'
      c.yAxis.lineColor = '#334155'
      c.xAxis.gridColor = '#334155'
      c.yAxis.gridColor = '#334155'
      c.xAxis.showGridlines = true
      c.yAxis.showGridlines = true
      c.series.colors = ['#00A3E0', '#22D3EE', '#A78BFA', '#F472B6', '#34D399', '#FBBF24', '#FB923C']
      c.series.barRadius = 4
      return c
    },
  },
  print: {
    label: 'Print',
    desc: 'Monochrome, print-friendly',
    apply: () => {
      const c = clone(defaultConfig)
      c.canvas.bgColor = '#FFFFFF'
      c.xAxis.showGridlines = true
      c.yAxis.showGridlines = true
      c.xAxis.gridColor = '#E2E8F0'
      c.yAxis.gridColor = '#E2E8F0'
      c.xAxis.gridStyle = 'dotted'
      c.yAxis.gridStyle = 'dotted'
      c.series.colors = ['#1E293B', '#64748B', '#94A3B8', '#CBD5E1', '#475569', '#334155']
      c.series.barRadius = 0
      c.series.lineWidth = 1.5
      return c
    },
  },
}
