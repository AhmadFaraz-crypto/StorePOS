import { createServer } from 'https'
import { WebSocketServer, type WebSocket } from 'ws'
import selfsigned from 'selfsigned'
import QRCode from 'qrcode'
import { readFileSync } from 'fs'
import { networkInterfaces } from 'os'
import { randomUUID } from 'crypto'

export interface ScannerInfo {
  url: string
  port: number
  token: string
  qrDataUrl: string
}

interface StartOptions {
  port?: number
  onScan: (code: string, format: string) => void
  onStatus: (connected: boolean) => void
}

let info: ScannerInfo | null = null

export function getScannerInfo(): ScannerInfo | null {
  return info
}

function lanIp(): string {
  const ifaces = networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address
    }
  }
  return '127.0.0.1'
}

export async function startScannerServer(opts: StartOptions): Promise<ScannerInfo> {
  const port = opts.port ?? 4711
  const ip = lanIp()
  const token = randomUUID()

  // Self-signed cert so mobile browsers allow camera access (they require a
  // secure context). The phone shows a one-time "not private" warning.
  const pems = selfsigned.generate([{ name: 'commonName', value: ip }], {
    days: 3650,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip }
        ]
      }
    ]
  })

  const zxingJs = readFileSync(require.resolve('@zxing/library/umd/index.min.js'), 'utf8')
  const page = phonePage()

  const server = createServer({ key: pems.private, cert: pems.cert }, (req, res) => {
    const url = new URL(req.url ?? '/', `https://${ip}:${port}`)
    if (url.pathname === '/vendor/zxing.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' })
      res.end(zxingJs)
      return
    }
    if (url.pathname === '/' || url.pathname === '/scan') {
      if (url.searchParams.get('token') !== token) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<h1>Invalid or expired pairing link</h1>')
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(page)
      return
    }
    res.writeHead(404)
    res.end('not found')
  })

  const wss = new WebSocketServer({ noServer: true })
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `https://${ip}:${port}`)
    if (url.pathname !== '/ws' || url.searchParams.get('token') !== token) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })

  wss.on('connection', (ws: WebSocket) => {
    opts.onStatus(true)
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'scan' && typeof msg.code === 'string') {
          opts.onScan(msg.code, typeof msg.format === 'string' ? msg.format : '')
        }
      } catch {
        // ignore malformed frames
      }
    })
    ws.on('close', () => opts.onStatus(wss.clients.size > 0))
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '0.0.0.0', () => resolve())
  })

  const url = `https://${ip}:${port}/scan?token=${token}`
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 240 })
  info = { url, port, token, qrDataUrl }
  return info
}

// The scanner page served to the phone. Self-contained; no external requests
// except /vendor/zxing.js from this same server. Kept free of backticks and
// ${} so it embeds cleanly inside this template literal.
function phonePage(): string {
  return [
    '<!doctype html>',
    '<html lang="en"><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">',
    '<title>StorePOS Scanner</title>',
    '<style>',
    '  * { box-sizing: border-box; }',
    '  html, body { margin: 0; height: 100%; background: #000; font-family: -apple-system, system-ui, sans-serif; }',
    '  #video { width: 100vw; height: 100vh; object-fit: cover; }',
    '  #overlay { position: fixed; inset: 0; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none; }',
    '  #status { margin: 16px; padding: 10px 14px; border-radius: 10px; background: rgba(0,0,0,.6); color: #fff; font-size: 15px; align-self: center; }',
    '  #status.ok { background: rgba(33,150,83,.85); }',
    '  #reticle { position: fixed; top: 50%; left: 50%; width: 70vw; max-width: 360px; height: 140px; transform: translate(-50%,-50%); border: 3px solid rgba(255,255,255,.9); border-radius: 14px; box-shadow: 0 0 0 100vmax rgba(0,0,0,.35); }',
    '  #last { margin: 16px; padding: 12px 16px; border-radius: 10px; background: rgba(0,0,0,.7); color: #fff; font-size: 18px; font-weight: 600; align-self: center; text-align: center; min-height: 20px; }',
    '  body.flash #reticle { border-color: #22c55e; }',
    '</style>',
    '</head><body>',
    '<video id="video" playsinline muted></video>',
    '<div id="reticle"></div>',
    '<div id="overlay">',
    '  <div id="status">Connecting…</div>',
    '  <div id="last"></div>',
    '</div>',
    '<script src="/vendor/zxing.js"></script>',
    '<script>',
    '  var params = new URLSearchParams(location.search);',
    '  var token = params.get("token");',
    '  var statusEl = document.getElementById("status");',
    '  var lastEl = document.getElementById("last");',
    '  var ws = null, wsReady = false;',
    '  function setStatus(t, ok){ statusEl.textContent = t; statusEl.className = ok ? "ok" : ""; }',
    '  function connect(){',
    '    ws = new WebSocket("wss://" + location.host + "/ws?token=" + token);',
    '    ws.onopen = function(){ wsReady = true; setStatus("Connected — point at a barcode", true); };',
    '    ws.onclose = function(){ wsReady = false; setStatus("Reconnecting…", false); setTimeout(connect, 1500); };',
    '    ws.onerror = function(){};',
    '  }',
    '  var lastCode = "", lastTime = 0;',
    '  function onScan(code, format){',
    '    var now = Date.now();',
    '    if (code === lastCode && (now - lastTime) < 1800) return;',
    '    lastCode = code; lastTime = now;',
    '    lastEl.textContent = code;',
    '    if (navigator.vibrate) navigator.vibrate(60);',
    '    document.body.classList.add("flash"); setTimeout(function(){ document.body.classList.remove("flash"); }, 180);',
    '    if (wsReady) ws.send(JSON.stringify({ type: "scan", code: code, format: String(format) }));',
    '  }',
    '  var hints = new Map();',
    '  var F = ZXing.BarcodeFormat;',
    '  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF, F.QR_CODE]);',
    '  var reader = new ZXing.BrowserMultiFormatReader(hints, 300);',
    '  connect();',
    '  reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, "video", function(result, err){',
    '    if (result) onScan(result.getText(), result.getBarcodeFormat());',
    '  }).catch(function(e){ setStatus("Camera error: " + (e && e.message ? e.message : e), false); });',
    '</script>',
    '</body></html>'
  ].join('\n')
}
