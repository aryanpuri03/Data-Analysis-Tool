// Vercel Edge Middleware — password gate
// Set SITE_PASSWORD in Vercel Environment Variables
// Users enter the password once, get a cookie, and are in for 30 days

export const config = {
  matcher: ['/((?!api/auth|_vercel|favicon\\.ico).*)'],
}

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In — Iconographpt</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: #f0f2f5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      padding: 2.5rem;
      width: 100%;
      max-width: 380px;
      text-align: center;
    }
    .logo {
      font-size: 1.5rem;
      font-weight: 700;
      color: #0a1628;
      margin-bottom: 0.25rem;
    }
    .subtitle {
      font-size: 0.75rem;
      color: #6b7280;
      margin-bottom: 2rem;
    }
    label {
      display: block;
      text-align: left;
      font-size: 0.75rem;
      font-weight: 500;
      color: #374151;
      margin-bottom: 0.4rem;
    }
    input {
      width: 100%;
      padding: 0.7rem 1rem;
      border: 1px solid #d1d5db;
      border-radius: 10px;
      font-size: 0.9rem;
      font-family: inherit;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
    button {
      margin-top: 1.25rem;
      width: 100%;
      padding: 0.75rem;
      background: #2563eb;
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 0.9rem;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #1d4ed8; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .error {
      margin-top: 1rem;
      font-size: 0.75rem;
      color: #dc2626;
      display: none;
    }
    .error.show { display: block; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Iconographpt</div>
    <div class="subtitle">Edinburgh Airport CX — Internal Tool</div>
    <form id="form">
      <label for="pw">Password</label>
      <input type="password" id="pw" name="password" placeholder="Enter team password" autocomplete="current-password" required>
      <button type="submit" id="btn">Sign In</button>
    </form>
    <div class="error" id="err">Incorrect password. Please try again.</div>
  </div>
  <script>
    const form = document.getElementById('form');
    const btn = document.getElementById('btn');
    const err = document.getElementById('err');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.classList.remove('show');
      btn.disabled = true;
      btn.textContent = 'Checking…';
      try {
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: document.getElementById('pw').value }),
        });
        if (res.ok) {
          window.location.reload();
        } else {
          err.classList.add('show');
        }
      } catch {
        err.textContent = 'Something went wrong. Try again.';
        err.classList.add('show');
      }
      btn.disabled = false;
      btn.textContent = 'Sign In';
    });
  </script>
</body>
</html>`

export default function middleware(request) {
  const password = process.env.SITE_PASSWORD
  // If no password is set, skip auth entirely (open access)
  if (!password) return

  const cookie = request.headers.get('cookie') || ''
  const hasAuth = cookie.split(';').some(c => c.trim().startsWith('site_auth='))

  if (hasAuth) {
    // Verify the token matches
    const token = cookie.split(';').map(c => c.trim()).find(c => c.startsWith('site_auth='))
    const value = token?.split('=')[1]
    // Simple hash check — the cookie value is a hex hash of the password
    const expected = simpleHash(password)
    if (value === expected) return // authenticated, pass through
  }

  // Not authenticated — serve login page
  return new Response(LOGIN_HTML, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

function simpleHash(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit int
  }
  return Math.abs(hash).toString(16)
}
