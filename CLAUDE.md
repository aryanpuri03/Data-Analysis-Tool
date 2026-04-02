# Iconographpt

## Project Overview
Iconographpt is an internal browser-based platform for Edinburgh Airport's CX team. It started as an SVG icon library and is being extended into a data analysis and visualisation tool. Both modules live in the same project and are accessible from the same hosted URL.

**Module 1 — Icon Library:** Browse, upload, and manage SVG icons. Existing functionality, no changes.
**Module 2 — Data Analysis:** Upload CSV/Excel data, auto-profile it, clean it interactively, build charts, and generate AI-powered plain-English trend summaries.

## Goals
- Extend the existing icon library into a broader internal CX team platform
- Allow analysts to upload data and get instant profiling, cleaning, charting, and AI summaries without writing code
- Keep the tool entirely free to run — no paid services, no backend infrastructure
- Deploy to Vercel (free tier) — team accesses via URL, no local setup required
- Preserve all existing icon library functionality exactly as-is

## Constraints
- **Free to host** — Vercel free tier only. No paid backend services.
- **No separate backend server** — all data processing happens client-side in the browser. Vercel Edge Functions used only as a proxy for the Claude API key (see AI Insights below).
- **No build step for icon library** — the existing `index.html` must continue to work when opened directly in a browser, for backwards compatibility.
- **Data never leaves the browser** — uploaded datasets are held in React state for the session only. No server-side storage of user data.
- **Free and open source tooling only**

## Tech Stack

### Frontend (new platform shell)
- **React + Vite** — component-based UI, fast dev server, deploys cleanly to Vercel
- **Recharts** — chart rendering (bar, line, scatter, pie)
- **Tailwind CSS** — utility-first styling

### Data Processing (client-side, no backend)
- **PapaParse** — CSV parsing in the browser
- **SheetJS (xlsx)** — Excel (.xlsx) parsing in the browser
- All profiling, cleaning, and transformation logic written in plain JavaScript

### AI
- **Anthropic Claude API** — plain-English trend summaries
- **Vercel Edge Function** — thin proxy to keep the API key server-side and out of the client bundle. Free on Vercel, no spin-down delay unlike a full backend.

### Icon Library (existing, unchanged)
- **potrace.js** — PNG to SVG tracing in the browser
- **SVGO** — SVG optimisation (pipeline only)
- **IndexedDB** — persistent storage for browser-uploaded icons
- **JSON** — icon manifest

### Deployment
- **Vercel** — free tier, automatic deploys from main branch
- `ANTHROPIC_API_KEY` stored as a Vercel environment variable, accessed only by the Edge Function, never exposed to the client

## Project Structure
```
iconographpt/
├── public/
│   └── icons.json              # Auto-generated icon manifest
├── src/
│   ├── modules/
│   │   ├── icons/              # Icon library module (existing behaviour preserved)
│   │   │   └── IconLibrary.jsx
│   │   ├── upload/             # CSV/Excel upload and table preview
│   │   │   └── DataUpload.jsx
│   │   ├── profile/            # Auto-generated data profile panel
│   │   │   └── DataProfile.jsx
│   │   ├── clean/              # Interactive data cleaning UI
│   │   │   └── DataClean.jsx
│   │   ├── charts/             # Chart builder
│   │   │   └── ChartBuilder.jsx
│   │   └── insights/           # AI trend summary
│   │       └── AIInsights.jsx
│   ├── components/             # Shared UI components
│   ├── App.jsx
│   └── main.jsx
├── api/
│   └── insights.js             # Vercel Edge Function — Claude API proxy
├── icons/                      # Icon output directory (existing)
│   ├── Plane Fins/
│   ├── logos/
│   └── name logo/
├── source/                     # Source PNGs for icon pipeline (existing)
├── scripts/
│   ├── import.py               # Icon asset import pipeline (existing)
│   └── manifest.py             # Generates icons.json (existing)
├── index.html                  # Standalone icon viewer (existing, kept for backwards compat)
├── vite.config.js
├── package.json
└── CLAUDE.md
```

## Data Analysis Module — Feature Spec

### Upload
- Drag and drop or file picker for CSV and .xlsx files
- Parse entirely in the browser using PapaParse (CSV) or SheetJS (Excel)
- Show a preview table of the first 20 rows after upload
- Infer column types automatically: numeric, categorical, date, free text
- User can override inferred types via a dropdown on each column header
- Data lives in React state for the session — refreshing the page clears it. Warn the user of this clearly in the UI.

### Auto Data Profile
Generated immediately on upload. Shown as a summary panel the analyst sees before doing anything else.

Per column:
- Inferred type
- Row count and null count (absolute + %)
- Numerics: min, max, mean, median
- Categoricals: unique value count, top 5 most frequent values
- Dates: earliest, latest, detected format

Dataset-level:
- Total rows and columns
- Overall null %
- Duplicate row count

### Data Cleaning
All operations happen client-side on the in-memory dataset. A "steps applied" log is shown so the analyst can see and undo operations.

Operations:
- **Null handling** — drop rows with nulls in a column, or fill with mean / median / mode / custom value
- **Duplicate removal** — detect and remove duplicate rows
- **Find and replace** — normalise inconsistent values within a column (e.g. "EasyJet" / "easyjet" / "easy jet")
- **Column rename** — inline editable column headers
- **Column drop** — remove columns not needed
- **Trim whitespace** — strip leading/trailing spaces from string columns
- **Type conversion** — convert column to a different type

### Chart Builder
- Select X axis column, Y axis column (or value column for pie)
- Select chart type: bar, line, scatter, pie
- Optional: group/colour by a categorical column
- Optional: filter rows before charting (e.g. terminal = "T1" only)
- Chart renders live as options are changed
- Download chart as PNG
- Powered by Recharts

### AI-Assisted Insights
- User clicks "Summarise" after profiling or charting
- A structured text summary of the dataset (column names, types, key stats, sample values) is built client-side and sent to the Edge Function
- The Edge Function forwards it to the Claude API with a CX-tuned system prompt
- Response is displayed as a plain-English paragraph the analyst can copy or regenerate
- **Raw row data is never sent to the API** — only the computed summary. Keeps token usage low and avoids sending PII.

Example of what gets sent:
```
Dataset: 1,243 rows, 8 columns.
Columns: response_date (date), terminal (categorical: T1, T2), nps_score (numeric, 0-10), queue_rating (numeric, 1-5)
NPS: Promoters 42%, Passives 31%, Detractors 27%. NPS = 15.
Trend: NPS declined from 22 in January to 15 in March.
Top free-text theme: "queue times" (34% of detractor responses).
```

### Edge Function (api/insights.js)
Thin Vercel Edge Function. Receives the dataset summary from the client, attaches the API key from the environment, forwards to Claude API, returns the response.

```js
// api/insights.js — Vercel Edge Function
export const config = { runtime: 'edge' }

export default async function handler(req) {
  const { summary } = await req.json()
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: 'You are a data analyst assistant for the Customer Experience team at Edinburgh Airport. Summarise the dataset trends in plain English, 2-3 sentences. Focus on what changed, what stands out, and what might need attention. No bullet points.',
      messages: [{ role: 'user', content: summary }]
    })
  })
  const data = await response.json()
  return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
}
```

## Icon Library Module — Spec (unchanged)

### How It Works
The existing `index.html` is preserved as a standalone file for backwards compatibility. The icon library is also surfaced as a React module (`src/modules/icons/`) within the platform UI, reading from `icons.json`.

### Naming Convention
```
{category}-{descriptor}.{ext}
```
- Lowercase only
- Hyphens, no underscores or spaces
- Category prefix always first

### Icon Categories
| Slug | Display Name |
|---|---|
| `Plane Fins` | Plane Fins |
| `logos` | Logos |
| `name logo` | Name Logo |

### SVG Standards
- viewBox must be `0 0 24 24`
- No raster embeds, no external font/style dependencies
- Single colour paths only
- Run SVGO on every output file

### icons.json Schema
Auto-generated by `scripts/manifest.py`. Do not edit manually.
```json
[
  {
    "name": "Departures",
    "slug": "wayfinding-departures",
    "category": "wayfinding",
    "tags": ["departures", "terminal", "flight"],
    "file": "icons/wayfinding/wayfinding-departures.svg",
    "source": "filesystem"
  }
]
```
Browser-uploaded icons use `"source": "indexeddb"` and are not written to this file.

### Import Pipeline
1. Place source images (PNG, JPG, JPEG, SVG) in `source/`
2. Run `python scripts/import.py`
3. Run `python scripts/manifest.py`
4. Open `index.html` or the platform UI to verify

### Browser Upload (in-viewer)
1. User selects PNGs via the upload button
2. potrace.js traces each PNG to SVG in the browser
3. Poor quality trace triggers a warning with option to cancel
4. User assigns name, category, optional tags
5. Saved to IndexedDB, persists across sessions on the same machine
6. Browser-uploaded icons show a badge and have a delete button
7. IndexedDB icons are local — clearing browser data removes them. UI warns of this.

## Build & Dev

```bash
npm install
npm run dev       # localhost:5173

# Icon pipeline (unchanged)
python scripts/import.py
python scripts/manifest.py
```

## Deployment

```bash
# Push to main branch — Vercel auto-deploys
# Set ANTHROPIC_API_KEY in Vercel project environment variables (Settings > Environment Variables)
# Never commit the API key to the repo
```

## MVP Definition of Done
- [ ] CSV upload parses and shows preview table
- [ ] Excel upload parses and shows preview table
- [ ] Data profile generates on upload for all column types
- [ ] At least 4 cleaning operations work (nulls, duplicates, find/replace, trim)
- [ ] Chart builder renders bar, line, and pie from selected columns
- [ ] AI summary generates via Edge Function and Claude API
- [ ] Icon library accessible as a module within the platform
- [ ] Existing `index.html` still works standalone (backwards compat)
- [ ] Deployed to Vercel on free tier
- [ ] Tested with at least 2 real CX datasets

## Out of Scope (MVP)
- User authentication
- Server-side data persistence
- PowerPoint / PDF export
- Saved pipeline templates
- Shareable dashboard links
- Scheduled data refresh or live API connectors
- Multi-colour icon variants
- Figma plugin
- CI/CD beyond Vercel auto-deploy