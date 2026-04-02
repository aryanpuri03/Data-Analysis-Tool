// Vercel Edge Function — validates password and sets auth cookie
export const config = { runtime: 'edge' }

function simpleHash(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16)
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const sitePassword = process.env.SITE_PASSWORD
  if (!sitePassword) {
    return new Response('No password configured', { status: 500 })
  }

  try {
    const { password } = await req.json()

    if (password === sitePassword) {
      const token = simpleHash(sitePassword)
      // Set cookie for 30 days
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'set-cookie': `site_auth=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
        },
      })
    }

    return new Response(JSON.stringify({ error: 'Incorrect password' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }
}
