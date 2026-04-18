/**
 * Vercel Edge Function — Persistent Icon Storage
 * Uses Supabase as the backend so uploaded icons survive across browsers/devices.
 *
 * GET    /api/icons            → returns all user-uploaded icons
 * POST   /api/icons            → { name, slug, category, tags, dataUrl } → saves icon
 * DELETE /api/icons?slug=xxx   → deletes icon by slug
 *
 * Required env vars (set in Vercel project settings):
 *   SUPABASE_URL          — https://<project>.supabase.co
 *   SUPABASE_SERVICE_KEY  — service_role key (kept server-side)
 *
 * Supabase table (run once in SQL editor):
 *   create table icons (
 *     slug       text primary key,
 *     name       text not null,
 *     category   text not null,
 *     tags       text[] default '{}',
 *     data_url   text,
 *     created_at timestamptz default now()
 *   );
 */

export const config = { runtime: 'edge' }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
}

const tableUrl = () => `${process.env.SUPABASE_URL}/rest/v1/icons`

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return json({ error: 'Storage not configured — set SUPABASE_URL and SUPABASE_SERVICE_KEY in Vercel env vars' }, 503)
  }

  // GET — list all uploaded icons
  if (req.method === 'GET') {
    const resp = await fetch(`${tableUrl()}?select=*&order=created_at.asc`, {
      headers: sbHeaders(),
    })
    const data = await resp.json()
    if (!resp.ok) return json({ error: 'Failed to load icons', detail: data }, 502)
    // Normalise column name: data_url → dataUrl
    const icons = (Array.isArray(data) ? data : []).map(row => ({
      name: row.name,
      slug: row.slug,
      category: row.category,
      tags: row.tags || [],
      file: null,
      dataUrl: row.data_url,
      source: 'indexeddb', // keep existing source tag so UI treats them as deletable
    }))
    return json(icons)
  }

  // POST — save a new icon
  if (req.method === 'POST') {
    let body
    try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
    const { name, slug, category, tags, dataUrl } = body
    if (!name || !slug || !category) return json({ error: 'name, slug and category are required' }, 400)

    const resp = await fetch(tableUrl(), {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify({ name, slug, category, tags: tags || [], data_url: dataUrl || null }),
    })
    const data = await resp.json()
    if (!resp.ok) return json({ error: 'Failed to save icon', detail: data }, 502)
    return json({ ok: true })
  }

  // DELETE — remove an icon by slug
  if (req.method === 'DELETE') {
    const url = new URL(req.url)
    const slug = url.searchParams.get('slug')
    if (!slug) return json({ error: 'slug query param required' }, 400)

    const resp = await fetch(`${tableUrl()}?slug=eq.${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      headers: sbHeaders(),
    })
    if (!resp.ok) {
      const detail = await resp.text()
      return json({ error: 'Failed to delete icon', detail }, 502)
    }
    return json({ ok: true })
  }

  return json({ error: 'Method not allowed' }, 405)
}
