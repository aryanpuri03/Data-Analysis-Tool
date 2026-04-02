/**
 * Pre-written, tested Python/matplotlib templates.
 * The AI only needs to pick the template name and column names —
 * it never has to write syntax-sensitive code from scratch.
 */

const BRAND_BLUE = '#003F87'
const BRAND_ACCENT = '#00A3E0'

function esc(col) {
  return String(col).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export const TEMPLATES = {
  histogram: {
    label: 'Histogram',
    fields: ['col'],
    build: ({ col }) => `\
import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(12, 6))
data = df['${esc(col)}'].dropna()
ax.hist(data, bins=30, color='${BRAND_BLUE}', edgecolor='white', alpha=0.85)
ax.set_title('Distribution of ${col}', fontsize=14, fontweight='bold')
ax.set_xlabel('${col}')
ax.set_ylabel('Count')
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
plt.tight_layout()`,
  },

  bar_count: {
    label: 'Bar — Frequency',
    fields: ['col'],
    build: ({ col }) => `\
import matplotlib.pyplot as plt

counts = df['${esc(col)}'].value_counts().head(20)
fig, ax = plt.subplots(figsize=(12, 6))
counts.plot.bar(ax=ax, color='${BRAND_BLUE}', edgecolor='white')
ax.set_title('Count by ${col}', fontsize=14, fontweight='bold')
ax.set_xlabel('${col}')
ax.set_ylabel('Count')
ax.tick_params(axis='x', rotation=45)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
plt.tight_layout()`,
  },

  bar_mean: {
    label: 'Bar — Average',
    fields: ['x', 'y'],
    build: ({ x, y }) => `\
import matplotlib.pyplot as plt

grouped = (
    df.groupby('${esc(x)}')['${esc(y)}']
    .mean()
    .sort_values(ascending=False)
    .head(20)
)
fig, ax = plt.subplots(figsize=(12, 6))
grouped.plot.bar(ax=ax, color='${BRAND_BLUE}', edgecolor='white')
ax.set_title('Average ${y} by ${x}', fontsize=14, fontweight='bold')
ax.set_xlabel('${x}')
ax.set_ylabel('Mean ${y}')
ax.tick_params(axis='x', rotation=45)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
plt.tight_layout()`,
  },

  line: {
    label: 'Line Chart',
    fields: ['x', 'y'],
    build: ({ x, y }) => `\
import matplotlib.pyplot as plt
import numpy as np

line_data = (
    df.groupby('${esc(x)}')['${esc(y)}']
    .mean()
    .reset_index()
    .sort_values('${esc(x)}')
)
fig, ax = plt.subplots(figsize=(12, 6))
ax.plot(
    range(len(line_data)),
    line_data['${esc(y)}'],
    color='${BRAND_BLUE}', linewidth=2, marker='o', markersize=4,
)
ax.fill_between(range(len(line_data)), line_data['${esc(y)}'], alpha=0.08, color='${BRAND_BLUE}')
ax.set_xticks(range(len(line_data)))
ax.set_xticklabels(line_data['${esc(x)}'], rotation=45, ha='right')
ax.set_title('${y} over ${x}', fontsize=14, fontweight='bold')
ax.set_xlabel('${x}')
ax.set_ylabel('Mean ${y}')
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
plt.tight_layout()`,
  },

  scatter: {
    label: 'Scatter Plot',
    fields: ['x', 'y'],
    build: ({ x, y }) => `\
import matplotlib.pyplot as plt
import numpy as np

fig, ax = plt.subplots(figsize=(12, 6))
clean = df[['${esc(x)}', '${esc(y)}']].dropna()
ax.scatter(
    clean['${esc(x)}'], clean['${esc(y)}'],
    color='${BRAND_BLUE}', alpha=0.45, s=30, edgecolors='none',
)
# Trend line
try:
    z = np.polyfit(clean['${esc(x)}'], clean['${esc(y)}'], 1)
    p = np.poly1d(z)
    xs = np.linspace(clean['${esc(x)}'].min(), clean['${esc(x)}'].max(), 200)
    ax.plot(xs, p(xs), color='${BRAND_ACCENT}', linewidth=2, linestyle='--', label='Trend')
    ax.legend()
except Exception:
    pass
ax.set_title('${x} vs ${y}', fontsize=14, fontweight='bold')
ax.set_xlabel('${x}')
ax.set_ylabel('${y}')
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
plt.tight_layout()`,
  },

  boxplot: {
    label: 'Box Plot',
    fields: ['x', 'y'],
    build: ({ x, y }) => `\
import matplotlib.pyplot as plt

top_cats = df['${esc(x)}'].value_counts().head(12).index.tolist()
filtered = df[df['${esc(x)}'].isin(top_cats)]
groups  = [grp['${esc(y)}'].dropna().tolist() for _, grp in filtered.groupby('${esc(x)}')]
labels  = [name for name, _ in filtered.groupby('${esc(x)}')]

fig, ax = plt.subplots(figsize=(12, 6))
bp = ax.boxplot(groups, labels=labels, patch_artist=True, notch=False)
for patch in bp['boxes']:
    patch.set_facecolor('${BRAND_BLUE}')
    patch.set_alpha(0.7)
for element in ('whiskers', 'caps', 'medians', 'fliers'):
    plt.setp(bp[element], color='#333')
ax.set_title('${y} distribution by ${x}', fontsize=14, fontweight='bold')
ax.set_xlabel('${x}')
ax.set_ylabel('${y}')
ax.tick_params(axis='x', rotation=45)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
plt.tight_layout()`,
  },

  summary: {
    label: 'Summary Table',
    fields: [],
    build: () => `\
import matplotlib.pyplot as plt

numeric_cols = df.select_dtypes(include='number').columns.tolist()
stats = df[numeric_cols].describe().round(2).T
stats = stats[['count', 'mean', 'std', 'min', '50%', 'max']]
stats.columns = ['Count', 'Mean', 'Std Dev', 'Min', 'Median', 'Max']

fig, ax = plt.subplots(figsize=(14, max(3, len(stats) * 0.55 + 1.5)))
ax.axis('off')
tbl = ax.table(
    cellText=stats.values,
    rowLabels=stats.index,
    colLabels=stats.columns,
    cellLoc='center',
    loc='center',
)
tbl.auto_set_font_size(False)
tbl.set_fontsize(9)
tbl.scale(1, 1.6)
for (row, col), cell in tbl.get_celld().items():
    if row == 0 or col == -1:
        cell.set_facecolor('${BRAND_BLUE}')
        cell.set_text_props(color='white', fontweight='bold')
    elif row % 2 == 0:
        cell.set_facecolor('#f8fafc')
    cell.set_edgecolor('#e2e8f0')
ax.set_title('Dataset Summary Statistics', fontsize=14, fontweight='bold', pad=20)
plt.tight_layout()`,
  },

  correlation: {
    label: 'Correlation Heatmap',
    fields: [],
    build: () => `\
import matplotlib.pyplot as plt
import numpy as np

numeric_cols = df.select_dtypes(include='number').columns.tolist()
corr = df[numeric_cols].corr()

fig, ax = plt.subplots(figsize=(max(8, len(numeric_cols)), max(6, len(numeric_cols) - 1)))
im = ax.imshow(corr, cmap='RdYlGn', vmin=-1, vmax=1, aspect='auto')
plt.colorbar(im, ax=ax, shrink=0.8, label='Correlation')
ax.set_xticks(range(len(corr.columns)))
ax.set_yticks(range(len(corr.columns)))
ax.set_xticklabels(corr.columns, rotation=45, ha='right', fontsize=9)
ax.set_yticklabels(corr.columns, fontsize=9)
for i in range(len(corr)):
    for j in range(len(corr.columns)):
        val = corr.iloc[i, j]
        ax.text(j, i, f'{val:.2f}', ha='center', va='center', fontsize=8,
                color='white' if abs(val) > 0.65 else 'black')
ax.set_title('Correlation Matrix', fontsize=14, fontweight='bold')
plt.tight_layout()`,
  },
}

/**
 * Build the classification prompt sent to the AI.
 * The AI only needs to return a tiny JSON like:
 *   {"template":"bar_mean","x":"terminal","y":"nps_score"}
 */
export function buildClassificationPrompt(request, columns, types) {
  const colList = columns.map(c => `  - "${c}" (${types[c] || 'freetext'})`).join('\n')

  return `Dataset columns:
${colList}

User request: "${request}"

Choose the best template and fill in the column names. Reply with ONLY a JSON object — no other text.

Templates:
- histogram: {"template":"histogram","col":"<numeric>"}
- bar_count: {"template":"bar_count","col":"<categorical>"}
- bar_mean:  {"template":"bar_mean","x":"<categorical>","y":"<numeric>"}
- line:      {"template":"line","x":"<date or categorical>","y":"<numeric>"}
- scatter:   {"template":"scatter","x":"<numeric>","y":"<numeric>"}
- boxplot:   {"template":"boxplot","x":"<categorical>","y":"<numeric>"}
- summary:   {"template":"summary"}
- correlation: {"template":"correlation"}

Use ONLY column names from the list above. Pick the template that best matches the request.`
}
