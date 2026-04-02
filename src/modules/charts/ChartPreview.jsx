import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  AreaChart, Area, ComposedChart,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie, Cell, Treemap,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Label,
} from 'recharts'

const GRID_DASH = { solid: '0', dashed: '5 5', dotted: '2 2' }

export default function ChartPreview({ chartType, chartData, yCol, y2Col, groupKeys, config }) {
  if (!chartData || chartData.length === 0) return null

  const { title, xLabel, yLabel, legend, xAxis, yAxis, series, canvas } = config

  // Title alignment map
  const titleAlign = { left: 'start', center: 'center', right: 'end' }

  // Common axis props
  const xAxisProps = {
    tick: { fontSize: xAxis.tickFontSize, fill: title.color },
    angle: -xAxis.tickRotation,
    textAnchor: xAxis.tickRotation > 0 ? 'end' : 'middle',
    height: xAxis.tickRotation > 0 ? 70 : 40,
    stroke: xAxis.showLine ? xAxis.lineColor : 'transparent',
    label: xLabel.text ? { value: xLabel.text, position: 'insideBottom', offset: -5, fontSize: xLabel.fontSize, fill: xLabel.color } : undefined,
  }
  const yAxisProps = {
    tick: { fontSize: yAxis.tickFontSize, fill: title.color },
    stroke: yAxis.showLine ? yAxis.lineColor : 'transparent',
    domain: [
      yAxis.minAuto ? 'auto' : yAxis.minValue,
      yAxis.maxAuto ? 'auto' : yAxis.maxValue,
    ],
    label: yLabel.text ? { value: yLabel.text, angle: -90, position: 'insideLeft', fontSize: yLabel.fontSize, fill: yLabel.color } : undefined,
  }

  const legendProps = legend.show ? {
    wrapperStyle: { fontSize: legend.fontSize },
    verticalAlign: (legend.position === 'top' || legend.position === 'bottom') ? legend.position : 'middle',
    align: (legend.position === 'left' || legend.position === 'right') ? legend.position : 'center',
    layout: (legend.position === 'left' || legend.position === 'right') ? 'vertical' : 'horizontal',
  } : false

  // Grid
  const gridProps = {
    horizontal: yAxis.showGridlines,
    vertical: xAxis.showGridlines,
    stroke: yAxis.showGridlines ? yAxis.gridColor : xAxis.gridColor,
    strokeDasharray: GRID_DASH[yAxis.gridStyle] || GRID_DASH.dashed,
  }

  const getColor = (i) => series.colors[i % series.colors.length]

  // Wrapper with title
  const ChartWrapper = ({ children }) => (
    <div style={{ backgroundColor: canvas.bgColor, padding: `${canvas.padding.top}px ${canvas.padding.right}px ${canvas.padding.bottom}px ${canvas.padding.left}px`, width: canvas.width, maxWidth: '100%' }}>
      {title.text && (
        <div style={{ textAlign: titleAlign[title.align] || 'center', marginBottom: 12 }}>
          <span style={{ fontSize: title.fontSize, fontWeight: title.fontWeight, color: title.color }}>
            {title.text}
          </span>
        </div>
      )}
      {children}
    </div>
  )

  const keys = groupKeys && groupKeys.length > 0 ? groupKeys : [yCol]
  const dash = { solid: undefined, dashed: '8 4', dotted: '3 3' }

  // ── Pie ──
  if (chartType === 'pie') {
    return (
      <ChartWrapper>
        <ResponsiveContainer width="100%" height={canvas.height - 60}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%" cy="50%"
              outerRadius={Math.min(canvas.height, canvas.width) * 0.3}
              innerRadius={series.pieInnerRadius}
              label={series.pieLabels ? ({ name, percent, value }) => {
                if (series.pieLabelFormat === 'value') return value
                if (series.pieLabelFormat === 'percentage') return `${(percent * 100).toFixed(0)}%`
                return `${name} (${(percent * 100).toFixed(0)}%)`
              } : false}
            >
              {chartData.map((_, i) => <Cell key={i} fill={getColor(i)} />)}
            </Pie>
            <Tooltip />
            {legendProps && <Legend {...legendProps} />}
          </PieChart>
        </ResponsiveContainer>
      </ChartWrapper>
    )
  }

  // ── Donut ──
  if (chartType === 'donut') {
    const outerR = Math.min(canvas.height, canvas.width) * 0.3
    return (
      <ChartWrapper>
        <ResponsiveContainer width="100%" height={canvas.height - 60}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%" cy="50%"
              outerRadius={outerR}
              innerRadius={outerR * 0.55}
              label={series.pieLabels ? ({ name, percent, value }) => {
                if (series.pieLabelFormat === 'value') return value
                if (series.pieLabelFormat === 'percentage') return `${(percent * 100).toFixed(0)}%`
                return `${name} (${(percent * 100).toFixed(0)}%)`
              } : false}
            >
              {chartData.map((_, i) => <Cell key={i} fill={getColor(i)} />)}
            </Pie>
            <Tooltip />
            {legendProps && <Legend {...legendProps} />}
          </PieChart>
        </ResponsiveContainer>
      </ChartWrapper>
    )
  }

  // ── Treemap ──
  if (chartType === 'treemap') {
    const treemapData = chartData.map((d, i) => ({ ...d, fill: getColor(i) }))
    return (
      <ChartWrapper>
        <ResponsiveContainer width="100%" height={canvas.height - 60}>
          <Treemap
            data={treemapData}
            dataKey="value"
            nameKey="name"
            stroke={canvas.bgColor}
            content={({ x, y, width, height, name, value, fill }) => {
              if (width < 30 || height < 20) return <rect x={x} y={y} width={width} height={height} fill={fill} stroke={canvas.bgColor} strokeWidth={2} />
              return (
                <g>
                  <rect x={x} y={y} width={width} height={height} fill={fill} stroke={canvas.bgColor} strokeWidth={2} rx={series.barRadius} />
                  <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="#fff" fontSize={11} fontWeight="bold">{name}</text>
                  <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="#fff" fontSize={10} opacity={0.8}>{value}</text>
                </g>
              )
            }}
          />
        </ResponsiveContainer>
      </ChartWrapper>
    )
  }

  // ── Scatter ──
  if (chartType === 'scatter') {
    return (
      <ChartWrapper>
        <ResponsiveContainer width="100%" height={canvas.height - 60}>
          <ScatterChart>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="x" type="number" name="X" {...xAxisProps} />
            <YAxis dataKey="y" type="number" name="Y" {...yAxisProps} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            {legendProps && <Legend {...legendProps} />}
            <Scatter data={chartData} fill={getColor(0)} opacity={0.6} />
          </ScatterChart>
        </ResponsiveContainer>
      </ChartWrapper>
    )
  }

  // ── Radar ──
  if (chartType === 'radar') {
    return (
      <ChartWrapper>
        <ResponsiveContainer width="100%" height={canvas.height - 60}>
          <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid stroke={yAxis.gridColor} />
            <PolarAngleAxis dataKey="name" tick={{ fontSize: xAxis.tickFontSize, fill: title.color }} />
            <PolarRadiusAxis tick={{ fontSize: yAxis.tickFontSize, fill: title.color }} />
            {keys.map((key, i) => (
              <Radar
                key={key}
                name={series.labels[key] || key}
                dataKey={key}
                stroke={getColor(i)}
                fill={getColor(i)}
                fillOpacity={0.25}
                strokeWidth={series.lineWidth}
              />
            ))}
            <Tooltip />
            {legendProps && <Legend {...legendProps} />}
          </RadarChart>
        </ResponsiveContainer>
      </ChartWrapper>
    )
  }

  // ── Combo (Bar + Line) ──
  if (chartType === 'combo') {
    return (
      <ChartWrapper>
        <ResponsiveContainer width="100%" height={canvas.height - 60}>
          <ComposedChart data={chartData}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip />
            {legendProps && <Legend {...legendProps} />}
            <Bar
              dataKey={yCol}
              name={series.labels[yCol] || yCol}
              fill={getColor(0)}
              radius={[series.barRadius, series.barRadius, 0, 0]}
            />
            {y2Col && y2Col !== yCol && (
              <Line
                type="monotone"
                dataKey={y2Col}
                name={series.labels[y2Col] || y2Col}
                stroke={getColor(1)}
                strokeWidth={series.lineWidth}
                dot={series.showDots ? { r: series.dotSize } : false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </ChartWrapper>
    )
  }

  // ── Line ──
  if (chartType === 'line') {
    return (
      <ChartWrapper>
        <ResponsiveContainer width="100%" height={canvas.height - 60}>
          <LineChart data={chartData}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip />
            {legendProps && <Legend {...legendProps} />}
            {keys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={series.labels[key] || key}
                stroke={getColor(i)}
                strokeWidth={series.lineWidth}
                strokeDasharray={dash[series.lineStyle]}
                dot={series.showDots ? { r: series.dotSize } : false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartWrapper>
    )
  }

  // ── Area ──
  if (chartType === 'area') {
    return (
      <ChartWrapper>
        <ResponsiveContainer width="100%" height={canvas.height - 60}>
          <AreaChart data={chartData}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip />
            {legendProps && <Legend {...legendProps} />}
            {keys.map((key, i) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                name={series.labels[key] || key}
                stroke={getColor(i)}
                fill={getColor(i)}
                fillOpacity={0.3}
                strokeWidth={series.lineWidth}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </ChartWrapper>
    )
  }

  // ── Stacked Area ──
  if (chartType === 'stackedArea') {
    return (
      <ChartWrapper>
        <ResponsiveContainer width="100%" height={canvas.height - 60}>
          <AreaChart data={chartData}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip />
            {legendProps && <Legend {...legendProps} />}
            {keys.map((key, i) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                name={series.labels[key] || key}
                stroke={getColor(i)}
                fill={getColor(i)}
                fillOpacity={0.6}
                strokeWidth={series.lineWidth}
                stackId="stack"
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </ChartWrapper>
    )
  }

  // ── Horizontal Bar ──
  if (chartType === 'horizontalBar') {
    return (
      <ChartWrapper>
        <ResponsiveContainer width="100%" height={canvas.height - 60}>
          <BarChart data={chartData} layout="vertical" barGap={series.barGap}>
            <CartesianGrid {...gridProps} />
            <XAxis type="number" {...yAxisProps} />
            <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: xAxis.tickFontSize, fill: title.color }} stroke={xAxis.showLine ? xAxis.lineColor : 'transparent'} />
            <Tooltip />
            {legendProps && <Legend {...legendProps} />}
            {keys.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                name={series.labels[key] || key}
                fill={getColor(i)}
                radius={[0, series.barRadius, series.barRadius, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>
    )
  }

  // ── Stacked Bar / 100% Stacked Bar ──
  if (chartType === 'stackedBar' || chartType === 'stackedBar100') {
    return (
      <ChartWrapper>
        <ResponsiveContainer width="100%" height={canvas.height - 60}>
          <BarChart data={chartData} barGap={series.barGap}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" {...xAxisProps} />
            <YAxis {...yAxisProps} domain={chartType === 'stackedBar100' ? [0, 100] : yAxisProps.domain} tickFormatter={chartType === 'stackedBar100' ? v => `${v}%` : undefined} />
            <Tooltip formatter={chartType === 'stackedBar100' ? (v) => `${v}%` : undefined} />
            {legendProps && <Legend {...legendProps} />}
            {keys.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                name={series.labels[key] || key}
                fill={getColor(i)}
                stackId="stack"
                radius={i === keys.length - 1 ? [series.barRadius, series.barRadius, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>
    )
  }

  // ── Bar (default) ──
  return (
    <ChartWrapper>
      <ResponsiveContainer width="100%" height={canvas.height - 60}>
        <BarChart data={chartData} barGap={series.barGap}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="name" {...xAxisProps} />
          <YAxis {...yAxisProps} />
          <Tooltip />
          {legendProps && <Legend {...legendProps} />}
          {keys.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              name={series.labels[key] || key}
              fill={getColor(i)}
              radius={[series.barRadius, series.barRadius, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartWrapper>
  )
}
