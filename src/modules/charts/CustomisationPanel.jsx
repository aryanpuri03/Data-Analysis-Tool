import { useState } from 'react'
import { ChevronDown, ChevronRight, Info } from 'lucide-react'
import { presets } from './chartConfig'

function Section({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-border last:border-b-0">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer">
        {open ? <ChevronDown className="w-3.5 h-3.5 text-text-secondary" /> : <ChevronRight className="w-3.5 h-3.5 text-text-secondary" />}
        <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">{title}</span>
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  )
}

function Field({ label, children, inline = false }) {
  if (inline) {
    return (
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] font-medium text-text-secondary shrink-0">{label}</label>
        <div className="flex-1 max-w-[160px]">{children}</div>
      </div>
    )
  }
  return (
    <div>
      <label className="text-[11px] font-medium text-text-secondary block mb-1">{label}</label>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder }) {
  return <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full text-xs border border-border rounded-md px-2.5 py-1.5 bg-white" />
}

function NumberInput({ value, onChange, min, max, step = 1 }) {
  return <input type="number" value={value} onChange={e => onChange(Number(e.target.value))} min={min} max={max} step={step} className="w-full text-xs border border-border rounded-md px-2.5 py-1.5 bg-white font-mono" />
}

function SelectInput({ value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="w-full text-xs border border-border rounded-md px-2.5 py-1.5 bg-white">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function ColorInput({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={value} onChange={e => onChange(e.target.value)} className="w-7 h-7 rounded border border-border cursor-pointer p-0.5" />
      <input type="text" value={value} onChange={e => onChange(e.target.value)} className="flex-1 text-xs border border-border rounded-md px-2.5 py-1.5 font-mono bg-white" />
    </div>
  )
}

function Toggle({ value, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} className="rounded" />
      <span className="text-xs text-text-primary">{label}</span>
    </label>
  )
}

function SliderInput({ value, onChange, min, max, step = 1, label }) {
  return (
    <div className="flex items-center gap-2">
      <input type="range" value={value} onChange={e => onChange(Number(e.target.value))} min={min} max={max} step={step} className="flex-1 h-1.5 appearance-none bg-gray-200 rounded-full cursor-pointer" />
      <span className="text-[10px] font-mono text-text-secondary w-8 text-right">{value}</span>
    </div>
  )
}

export default function CustomisationPanel({ config, setConfig, chartType, seriesKeys, onExportSvg, onExportPng }) {
  const [pngRes, setPngRes] = useState(2)

  const update = (path, value) => {
    setConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const keys = path.split('.')
      let obj = next
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]]
      obj[keys[keys.length - 1]] = value
      return next
    })
  }

  const applyPreset = (presetKey) => {
    const preset = presets[presetKey]
    if (preset) setConfig(preset.apply())
  }

  return (
    <div className="rounded-lg border border-border bg-card-bg overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-gray-50">
        <h2 className="text-xs font-bold text-text-primary uppercase tracking-wider">Customise</h2>
      </div>
      <div className="max-h-[calc(100vh-12rem)] overflow-y-auto">

        {/* ══════════════ TITLES & LABELS ══════════════ */}
        <Section title="Titles & Labels" defaultOpen={true}>
          <Field label="Chart Title">
            <TextInput value={config.title.text} onChange={v => update('title.text', v)} placeholder="Enter chart title…" />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Size"><NumberInput value={config.title.fontSize} onChange={v => update('title.fontSize', v)} min={10} max={36} /></Field>
            <Field label="Weight"><SelectInput value={config.title.fontWeight} onChange={v => update('title.fontWeight', v)} options={[{ value: 'normal', label: 'Normal' }, { value: 'bold', label: 'Bold' }]} /></Field>
            <Field label="Align"><SelectInput value={config.title.align} onChange={v => update('title.align', v)} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }]} /></Field>
          </div>
          <Field label="Title Colour"><ColorInput value={config.title.color} onChange={v => update('title.color', v)} /></Field>

          <hr className="border-border" />
          <Field label="X Axis Label"><TextInput value={config.xLabel.text} onChange={v => update('xLabel.text', v)} placeholder="X axis label…" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Size"><NumberInput value={config.xLabel.fontSize} onChange={v => update('xLabel.fontSize', v)} min={8} max={24} /></Field>
            <Field label="Colour"><ColorInput value={config.xLabel.color} onChange={v => update('xLabel.color', v)} /></Field>
          </div>

          <Field label="Y Axis Label"><TextInput value={config.yLabel.text} onChange={v => update('yLabel.text', v)} placeholder="Y axis label…" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Size"><NumberInput value={config.yLabel.fontSize} onChange={v => update('yLabel.fontSize', v)} min={8} max={24} /></Field>
            <Field label="Colour"><ColorInput value={config.yLabel.color} onChange={v => update('yLabel.color', v)} /></Field>
          </div>

          <hr className="border-border" />
          <Toggle value={config.legend.show} onChange={v => update('legend.show', v)} label="Show Legend" />
          {config.legend.show && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Position"><SelectInput value={config.legend.position} onChange={v => update('legend.position', v)} options={[{ value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]} /></Field>
              <Field label="Font Size"><NumberInput value={config.legend.fontSize} onChange={v => update('legend.fontSize', v)} min={8} max={20} /></Field>
            </div>
          )}
        </Section>

        {/* ══════════════ AXES ══════════════ */}
        <Section title="Axes">
          <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-2">X Axis</p>
          <Toggle value={config.xAxis.showLine} onChange={v => update('xAxis.showLine', v)} label="Show axis line" />
          <Field label="Axis Line Colour"><ColorInput value={config.xAxis.lineColor} onChange={v => update('xAxis.lineColor', v)} /></Field>
          <Toggle value={config.xAxis.showGridlines} onChange={v => update('xAxis.showGridlines', v)} label="Show gridlines" />
          {config.xAxis.showGridlines && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Grid Colour"><ColorInput value={config.xAxis.gridColor} onChange={v => update('xAxis.gridColor', v)} /></Field>
              <Field label="Grid Style"><SelectInput value={config.xAxis.gridStyle} onChange={v => update('xAxis.gridStyle', v)} options={[{ value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' }]} /></Field>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Tick Font Size"><NumberInput value={config.xAxis.tickFontSize} onChange={v => update('xAxis.tickFontSize', v)} min={8} max={18} /></Field>
            <Field label="Tick Rotation"><SelectInput value={String(config.xAxis.tickRotation)} onChange={v => update('xAxis.tickRotation', Number(v))} options={[{ value: '0', label: '0°' }, { value: '45', label: '45°' }, { value: '90', label: '90°' }]} /></Field>
          </div>

          <hr className="border-border" />
          <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-2">Y Axis</p>
          <Toggle value={config.yAxis.showLine} onChange={v => update('yAxis.showLine', v)} label="Show axis line" />
          <Field label="Axis Line Colour"><ColorInput value={config.yAxis.lineColor} onChange={v => update('yAxis.lineColor', v)} /></Field>
          <Toggle value={config.yAxis.showGridlines} onChange={v => update('yAxis.showGridlines', v)} label="Show gridlines" />
          {config.yAxis.showGridlines && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Grid Colour"><ColorInput value={config.yAxis.gridColor} onChange={v => update('yAxis.gridColor', v)} /></Field>
              <Field label="Grid Style"><SelectInput value={config.yAxis.gridStyle} onChange={v => update('yAxis.gridStyle', v)} options={[{ value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' }]} /></Field>
            </div>
          )}
          <Field label="Tick Font Size"><NumberInput value={config.yAxis.tickFontSize} onChange={v => update('yAxis.tickFontSize', v)} min={8} max={18} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Toggle value={config.yAxis.minAuto} onChange={v => update('yAxis.minAuto', v)} label="Auto min" />
              {!config.yAxis.minAuto && <NumberInput value={config.yAxis.minValue} onChange={v => update('yAxis.minValue', v)} />}
            </div>
            <div>
              <Toggle value={config.yAxis.maxAuto} onChange={v => update('yAxis.maxAuto', v)} label="Auto max" />
              {!config.yAxis.maxAuto && <NumberInput value={config.yAxis.maxValue} onChange={v => update('yAxis.maxValue', v)} />}
            </div>
          </div>
        </Section>

        {/* ══════════════ SERIES / DATA ══════════════ */}
        <Section title="Series / Data">
          {/* Per-series colour + label overrides */}
          {seriesKeys && seriesKeys.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">Series Colours & Labels</p>
              {seriesKeys.map((key, i) => (
                <div key={key} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.series.colors[i % config.series.colors.length]}
                    onChange={e => {
                      const newColors = [...config.series.colors]
                      newColors[i] = e.target.value
                      update('series.colors', newColors)
                    }}
                    className="w-6 h-6 rounded border border-border cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={config.series.labels[key] || ''}
                    onChange={e => {
                      const newLabels = { ...config.series.labels, [key]: e.target.value }
                      update('series.labels', newLabels)
                    }}
                    placeholder={key}
                    className="flex-1 text-xs border border-border rounded-md px-2 py-1 bg-white"
                  />
                </div>
              ))}
            </div>
          )}

          <hr className="border-border" />

          {/* Bar-specific */}
          {['bar', 'horizontalBar', 'stackedBar', 'stackedBar100'].includes(chartType) && (
            <>
              <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">Bar Options</p>
              <Field label="Corner Radius"><SliderInput value={config.series.barRadius} onChange={v => update('series.barRadius', v)} min={0} max={8} /></Field>
              <Field label="Bar Gap"><SliderInput value={config.series.barGap} onChange={v => update('series.barGap', v)} min={0} max={20} /></Field>
            </>
          )}

          {/* Area-specific */}
          {(chartType === 'area' || chartType === 'stackedArea') && (
            <>
              <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">Area Options</p>
              <Field label="Line Width"><SliderInput value={config.series.lineWidth} onChange={v => update('series.lineWidth', v)} min={0.5} max={6} step={0.5} /></Field>
            </>
          )}

          {/* Line-specific */}
          {(chartType === 'line' || chartType === 'combo') && (
            <>
              <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">Line Options</p>
              <Field label="Line Width"><SliderInput value={config.series.lineWidth} onChange={v => update('series.lineWidth', v)} min={0.5} max={6} step={0.5} /></Field>
              <Field label="Line Style"><SelectInput value={config.series.lineStyle} onChange={v => update('series.lineStyle', v)} options={[{ value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' }]} /></Field>
              <Toggle value={config.series.showDots} onChange={v => update('series.showDots', v)} label="Show dots" />
              {config.series.showDots && <Field label="Dot Size"><SliderInput value={config.series.dotSize} onChange={v => update('series.dotSize', v)} min={1} max={8} /></Field>}
            </>
          )}

          {/* Radar-specific */}
          {chartType === 'radar' && (
            <>
              <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">Radar Options</p>
              <Field label="Line Width"><SliderInput value={config.series.lineWidth} onChange={v => update('series.lineWidth', v)} min={0.5} max={6} step={0.5} /></Field>
            </>
          )}

          {/* Treemap-specific */}
          {chartType === 'treemap' && (
            <>
              <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">Treemap Options</p>
              <Field label="Corner Radius"><SliderInput value={config.series.barRadius} onChange={v => update('series.barRadius', v)} min={0} max={8} /></Field>
            </>
          )}

          {/* Scatter-specific */}
          {chartType === 'scatter' && (
            <>
              <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">Scatter Options</p>
              <Field label="Dot Size"><SliderInput value={config.series.scatterSize} onChange={v => update('series.scatterSize', v)} min={10} max={200} step={10} /></Field>
              <Field label="Dot Shape"><SelectInput value={config.series.scatterShape} onChange={v => update('series.scatterShape', v)} options={[{ value: 'circle', label: 'Circle' }, { value: 'square', label: 'Square' }, { value: 'diamond', label: 'Diamond' }]} /></Field>
            </>
          )}

          {/* Pie / Donut specific */}
          {(chartType === 'pie' || chartType === 'donut') && (
            <>
              <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">{chartType === 'donut' ? 'Donut' : 'Pie'} Options</p>
              <Toggle value={config.series.pieLabels} onChange={v => update('series.pieLabels', v)} label="Show labels on slices" />
              {config.series.pieLabels && (
                <Field label="Label Format"><SelectInput value={config.series.pieLabelFormat} onChange={v => update('series.pieLabelFormat', v)} options={[{ value: 'value', label: 'Value' }, { value: 'percentage', label: 'Percentage' }, { value: 'both', label: 'Both' }]} /></Field>
              )}
              {chartType === 'pie' && (
                <Field label="Inner Radius (donut)"><SliderInput value={config.series.pieInnerRadius} onChange={v => update('series.pieInnerRadius', v)} min={0} max={120} step={5} /></Field>
              )}
            </>
          )}
        </Section>

        {/* ══════════════ CANVAS ══════════════ */}
        <Section title="Canvas">
          <Field label="Background Colour"><ColorInput value={config.canvas.bgColor} onChange={v => update('canvas.bgColor', v)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Width (px)"><NumberInput value={config.canvas.width} onChange={v => update('canvas.width', v)} min={400} max={2000} step={50} /></Field>
            <Field label="Height (px)"><NumberInput value={config.canvas.height} onChange={v => update('canvas.height', v)} min={200} max={1200} step={50} /></Field>
          </div>
          <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider mt-1">Padding</p>
          <div className="grid grid-cols-4 gap-2">
            <Field label="Top"><NumberInput value={config.canvas.padding.top} onChange={v => update('canvas.padding.top', v)} min={0} max={100} /></Field>
            <Field label="Right"><NumberInput value={config.canvas.padding.right} onChange={v => update('canvas.padding.right', v)} min={0} max={100} /></Field>
            <Field label="Bottom"><NumberInput value={config.canvas.padding.bottom} onChange={v => update('canvas.padding.bottom', v)} min={0} max={100} /></Field>
            <Field label="Left"><NumberInput value={config.canvas.padding.left} onChange={v => update('canvas.padding.left', v)} min={0} max={100} /></Field>
          </div>
        </Section>

        {/* ══════════════ PRESETS ══════════════ */}
        <Section title="Presets">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(presets).map(([key, preset]) => (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className="text-left p-2.5 rounded-lg border border-border hover:border-brand-blue hover:bg-blue-50/50 transition-colors cursor-pointer"
              >
                <p className="text-xs font-semibold text-text-primary">{preset.label}</p>
                <p className="text-[10px] text-text-secondary mt-0.5">{preset.desc}</p>
              </button>
            ))}
          </div>
        </Section>

        {/* ══════════════ EXPORT ══════════════ */}
        <Section title="Export" defaultOpen={false}>
          <div className="space-y-2">
            <button onClick={onExportSvg} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 transition-colors cursor-pointer">
              Export as SVG
            </button>
            <p className="text-[10px] text-text-secondary text-center">Recommended for PowerPoint — vector, editable</p>
          </div>

          <hr className="border-border" />

          <div className="space-y-2">
            <Field label="PNG Resolution">
              <SelectInput value={String(pngRes)} onChange={v => setPngRes(Number(v))} options={[{ value: '1', label: '1x (screen)' }, { value: '2', label: '2x (retina)' }, { value: '4', label: '4x (print)' }]} />
            </Field>
            <button onClick={() => onExportPng?.(pngRes)} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-brand-blue bg-white border border-brand-blue rounded-lg hover:bg-blue-50 transition-colors cursor-pointer" id="png-export-btn">
              Export as PNG
            </button>
          </div>

          <hr className="border-border" />

          <div className="flex gap-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200">
            <Info className="w-4 h-4 text-brand-blue shrink-0 mt-0.5" />
            <p className="text-[10px] text-blue-800 leading-relaxed">
              <strong>For PowerPoint:</strong> use SVG export. Insert → Pictures → This Device, select the .svg file. Once inserted, right-click → Group → Ungroup twice to edit individual chart elements.
            </p>
          </div>
        </Section>

      </div>
    </div>
  )
}
