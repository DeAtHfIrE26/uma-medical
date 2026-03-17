/**
 * Local development API server — mirrors Vercel serverless functions.
 * Run concurrently with Vite: npm run dev:all
 * Listens on port 3001; Vite dev server proxies /api/* → http://localhost:3001
 */

import http from 'http'
import fs   from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const envFile = path.join(__dirname, '.env')
function loadEnvFile() {
  if (!fs.existsSync(envFile)) return

  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return

    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 1) return

    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    process.env[key] = val
  })

  // Keep server-side key in sync with browser-prefixed key if needed.
  if (!process.env.GEMINI_API_KEY && process.env.VITE_GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY
  }
}

// Initial load on boot.
loadEnvFile()

// ─── Route map: URL path → file path ─────────────────────────────────────────
const ROUTES = {
  '/api/parse-bill':  path.join(__dirname, 'api', 'parse-bill.js'),
  '/api/export-bill': path.join(__dirname, 'api', 'export-bill.js'),
  '/api/register':    path.join(__dirname, 'api', 'register.js'),
}

// ─── Minimal req/res shim (matches Vercel's interface) ───────────────────────
function shimRes(raw, origin) {
  let _status = 200
  const _headers = { 'Access-Control-Allow-Origin': origin || '*' }

  return {
    status(code)       { _status = code; return this },
    setHeader(k, v)    { _headers[k] = v; return this },
    getHeader(k)       { return _headers[k] },
    send(body) {
      // Only write headers once
      if (!raw.headersSent) raw.writeHead(_status, _headers)
      raw.end(typeof body === 'string' ? body : JSON.stringify(body))
    },
  }
}

// ─── Read entire request body as string ──────────────────────────────────────
function readBody(req) {
  return new Promise(resolve => {
    let acc = ''
    req.on('data', c => { acc += c })
    req.on('end', () => resolve(acc))
  })
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // Reload .env on every request so key changes apply without manual API restarts.
  loadEnvFile()

  // Allow any localhost origin (Vite can use 5173 or 5174 depending on availability)
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const pathname = new URL(req.url, 'http://localhost:3001').pathname
  const handlerFile = ROUTES[pathname]

  if (!handlerFile || !fs.existsSync(handlerFile)) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: `No dev handler for ${pathname}` }))
    return
  }

  const bodyStr = await readBody(req)
  let bodyObj = {}
  try { bodyObj = bodyStr ? JSON.parse(bodyStr) : {} } catch (_) { /* ignore */ }

  const fakeReq = {
    method:  req.method,
    url:     req.url,
    headers: req.headers,
    body:    bodyObj,
  }
  const fakeRes = shimRes(res, origin)

  try {
    // On Windows, dynamic import() requires a file:// URL — plain Win32 paths like
    // "d:\..." are rejected by the ESM loader. pathToFileURL converts correctly.
    // Append a timestamp query param to bust Node's import cache on each request.
    const fileUrl = pathToFileURL(handlerFile).href + `?t=${Date.now()}`
    const mod = await import(fileUrl)
    const handler = mod.default ?? mod.handler
    if (typeof handler !== 'function') throw new Error('No default export in handler')
    await handler(fakeReq, fakeRes)
  } catch (err) {
    console.error(`[dev-api] Error in ${pathname}:`, err.message)
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message || 'Internal server error' }))
    }
  }
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('[dev-api] Port 3001 already in use — API server is already running, skipping.')
    // Exit cleanly so concurrently doesn't kill Vite too
    process.exit(0)
  } else {
    console.error('[dev-api] Server error:', err)
    process.exit(1)
  }
})

server.listen(3001, () => {
  console.log('\n[dev-api] Local API server ready → http://localhost:3001')
  console.log(`[dev-api] GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✓ SET' : '✗ MISSING — bill parsing will fail'}`)
  console.log('[dev-api] Available routes:')
  Object.keys(ROUTES).forEach(r => console.log(`  POST ${r}`))
  console.log()
})
