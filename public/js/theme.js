// ═══════════════════════════════════════════════════════════
// Haven — Shared Theme Switcher (loaded on all pages)
// ═══════════════════════════════════════════════════════════

// ── Color-conversion helpers ────────────────────────────
function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  let r, g, b;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
function rgbToHex(r, g, b) { return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join(''); }
function hsvToHex(h, s, v) { return rgbToHex(...hsvToRgb(h, s, v)); }

// ── Generate full theme palette from a single HSV accent ─
function generateCustomPalette(h, s, v) {
  const rgb = hsvToRgb(h, s, v);
  return {
    '--accent':        hsvToHex(h, s, v),
    '--accent-hover':  hsvToHex(h, Math.max(s - 0.15, 0), Math.min(v + 0.15, 1)),
    '--accent-dim':    hsvToHex(h, Math.min(s + 0.1, 1), Math.max(v - 0.2, 0)),
    '--accent-glow':   `rgba(${rgb.join(',')}, 0.25)`,
    '--bg-primary':    hsvToHex(h, 0.15, 0.10),
    '--bg-secondary':  hsvToHex(h, 0.12, 0.13),
    '--bg-tertiary':   hsvToHex(h, 0.10, 0.16),
    '--bg-hover':      hsvToHex(h, 0.10, 0.20),
    '--bg-active':     hsvToHex(h, 0.10, 0.24),
    '--bg-input':      hsvToHex(h, 0.15, 0.08),
    '--bg-card':       hsvToHex(h, 0.12, 0.12),
    '--text-primary':  '#e2e4f0',
    '--text-secondary':'#9498b3',
    '--text-muted':    '#5d6180',
    '--text-link':     hsvToHex((h + 210) % 360, 0.5, 1),
    '--border':        hsvToHex(h, 0.12, 0.20),
    '--border-light':  hsvToHex(h, 0.12, 0.25),
    '--success': '#43b581', '--danger': '#f04747', '--warning': '#faa61a',
    '--led-on': '#43b581', '--led-off': '#555', '--led-glow': 'rgba(67,181,129,0.5)',
  };
}

// ── Apply / clear custom theme CSS variables ────────────
function applyCustomVars(palette) {
  const el = document.documentElement;
  Object.entries(palette).forEach(([k, v]) => el.style.setProperty(k, v));
}
function clearCustomVars() {
  const keys = ['--accent','--accent-hover','--accent-dim','--accent-glow',
    '--bg-primary','--bg-secondary','--bg-tertiary','--bg-hover','--bg-active',
    '--bg-input','--bg-card','--text-primary','--text-secondary','--text-muted',
    '--text-link','--border','--border-light','--success','--danger','--warning',
    '--led-on','--led-off','--led-glow'];
  keys.forEach(k => document.documentElement.style.removeProperty(k));
}

// ── Barycentric maths for the triangle ──────────────────
function bary(px, py, ax, ay, bx, by, cx, cy) {
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  const u = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
  const v = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
  return { u, v, w: 1 - u - v };
}

// ── Draw hue rainbow bar on canvas ──────────────────────
function drawHueBar(ctx, w, h, selectedHue) {
  for (let x = 0; x < w; x++) {
    const [r, g, b] = hsvToRgb((x / w) * 360, 1, 1);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, 0, 1, h);
  }
  // Indicator line
  const ix = Math.round((selectedHue / 360) * w);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(ix, 0); ctx.lineTo(ix, h); ctx.stroke();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(ix, 0); ctx.lineTo(ix, h); ctx.stroke();
}

// ── Draw SV triangle on canvas ──────────────────────────
function drawTriangle(ctx, w, h, hue, selS, selV) {
  // Triangle vertices: A=top (pure hue), B=bottom-left (white), C=bottom-right (black)
  const pad = 8;
  const ax = w / 2, ay = pad;
  const bx = pad,   by = h - pad;
  const cx = w - pad, cy = h - pad;

  const pureRgb = hsvToRgb(hue, 1, 1);
  const img = ctx.createImageData(w, h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const bc = bary(x, y, ax, ay, bx, by, cx, cy);
      if (bc.u < -0.005 || bc.v < -0.005 || bc.w < -0.005) continue;
      const u = Math.max(0, bc.u), v = Math.max(0, bc.v), ww = Math.max(0, bc.w);
      const sum = u + v + ww;
      const nu = u / sum, nv = v / sum, nw = ww / sum;
      const i = (y * w + x) * 4;
      img.data[i]     = nu * pureRgb[0] + nv * 255;
      img.data[i + 1] = nu * pureRgb[1] + nv * 255;
      img.data[i + 2] = nu * pureRgb[2] + nv * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Draw triangle border
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath(); ctx.stroke();

  // Compute selected point from S, V
  // S = u/(u+v), V = u+v => u = S*V, v = (1-S)*V, w = 1-V
  const su = selS * selV, sv = (1 - selS) * selV, sw = 1 - selV;
  const px = su * ax + sv * bx + sw * cx;
  const py = su * ay + sv * by + sw * cy;

  // Draw indicator circle
  ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
}

// ── Initialise the custom-theme triangle editor ─────────
function initCustomThemeEditor() {
  const editor = document.getElementById('custom-theme-editor');
  if (!editor) return;

  const hueCanvas  = document.getElementById('custom-hue-bar');
  const triCanvas  = document.getElementById('custom-triangle');
  if (!hueCanvas || !triCanvas) return;

  const hueCtx = hueCanvas.getContext('2d');
  const triCtx = triCanvas.getContext('2d');

  // Load saved values or defaults (purple)
  const saved = JSON.parse(localStorage.getItem('haven_custom_hsv') || 'null');
  let hue = saved ? saved.h : 260;
  let sat = saved ? saved.s : 0.75;
  let val = saved ? saved.v : 0.95;

  function redrawHue() { drawHueBar(hueCtx, hueCanvas.width, hueCanvas.height, hue); }
  function redrawTri()  { drawTriangle(triCtx, triCanvas.width, triCanvas.height, hue, sat, val); }

  function apply() {
    const palette = generateCustomPalette(hue, sat, val);
    applyCustomVars(palette);
    localStorage.setItem('haven_custom_hsv', JSON.stringify({ h: hue, s: sat, v: val }));
    // Update the custom theme button swatch
    const swatch = document.getElementById('custom-theme-swatch');
    if (swatch) swatch.style.background = palette['--accent'];
  }

  function render() { redrawHue(); redrawTri(); apply(); }

  // ── Hue bar interaction ──
  function hueFromEvent(e) {
    const r = hueCanvas.getBoundingClientRect();
    const x = Math.max(0, Math.min((e.clientX ?? e.touches[0].clientX) - r.left, r.width));
    hue = (x / r.width) * 360;
    render();
  }
  let hueDrag = false;
  hueCanvas.addEventListener('mousedown',  (e) => { hueDrag = true; hueFromEvent(e); });
  window.addEventListener('mousemove',     (e) => { if (hueDrag) hueFromEvent(e); });
  window.addEventListener('mouseup',       ()  => { hueDrag = false; });
  hueCanvas.addEventListener('touchstart', (e) => { e.preventDefault(); hueFromEvent(e); });
  hueCanvas.addEventListener('touchmove',  (e) => { e.preventDefault(); hueFromEvent(e); });

  // ── Triangle interaction ──
  const pad = 8;
  const tw = triCanvas.width, th = triCanvas.height;
  const ax = tw / 2, ay = pad, bx = pad, by = th - pad, cx = tw - pad, cy = th - pad;

  function triFromEvent(e) {
    const r = triCanvas.getBoundingClientRect();
    const ex = (e.clientX ?? e.touches[0].clientX) - r.left;
    const ey = (e.clientY ?? e.touches[0].clientY) - r.top;
    // Scale to canvas coords
    const px = ex * (tw / r.width), py = ey * (th / r.height);
    const bc = bary(px, py, ax, ay, bx, by, cx, cy);
    // Clamp to triangle
    let u = Math.max(0, bc.u), v = Math.max(0, bc.v), w = Math.max(0, bc.w);
    const sum = u + v + w; u /= sum; v /= sum; w /= sum;
    // Extract S, V from barycentric
    val = Math.max(0.01, u + v);
    sat = val > 0 ? u / val : 0;
    render();
  }
  let triDrag = false;
  triCanvas.addEventListener('mousedown',  (e) => { triDrag = true; triFromEvent(e); });
  window.addEventListener('mousemove',     (e) => { if (triDrag) triFromEvent(e); });
  window.addEventListener('mouseup',       ()  => { triDrag = false; });
  triCanvas.addEventListener('touchstart', (e) => { e.preventDefault(); triFromEvent(e); });
  triCanvas.addEventListener('touchmove',  (e) => { e.preventDefault(); triFromEvent(e); });

  // Initial render
  render();

  // Expose show/hide helpers
  editor._show = () => { editor.style.display = 'block'; render(); };
  editor._hide = () => { editor.style.display = 'none'; };
}

// ────────────────────────────────────────────────────────
// Main theme-switcher init (shared on all pages)
// ────────────────────────────────────────────────────────
function initThemeSwitcher(containerId, socket) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const saved = localStorage.getItem('haven_theme') || 'haven';
  const editor = document.getElementById('custom-theme-editor');

  // If custom was saved, apply vars immediately
  if (saved === 'custom') {
    const hsv = JSON.parse(localStorage.getItem('haven_custom_hsv') || 'null');
    if (hsv) applyCustomVars(generateCustomPalette(hsv.h, hsv.s, hsv.v));
  }

  // Set active button
  container.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === saved);

    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('haven_theme', theme);

      // Update active state on ALL theme selectors on the page
      document.querySelectorAll('.theme-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.theme === theme);
      });

      // Persist to server if socket available
      if (socket && socket.connected) {
        socket.emit('set-preference', { key: 'theme', value: theme });
      }

      // Toggle custom theme editor
      if (theme === 'custom') {
        const hsv = JSON.parse(localStorage.getItem('haven_custom_hsv') || 'null');
        if (hsv) applyCustomVars(generateCustomPalette(hsv.h, hsv.s, hsv.v));
        if (editor && editor._show) editor._show();
      } else {
        clearCustomVars();
        if (editor && editor._hide) editor._hide();
      }
    });
  });

  // Initialise the custom editor canvases
  initCustomThemeEditor();

  // Show editor on load if custom was saved
  if (saved === 'custom' && editor && editor._show) {
    setTimeout(() => editor._show(), 50);
  }
}

function applyThemeFromServer(theme) {
  if (!theme) return;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('haven_theme', theme);
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === theme);
  });
  if (theme === 'custom') {
    const hsv = JSON.parse(localStorage.getItem('haven_custom_hsv') || 'null');
    if (hsv) applyCustomVars(generateCustomPalette(hsv.h, hsv.s, hsv.v));
    const editor = document.getElementById('custom-theme-editor');
    if (editor && editor._show) editor._show();
  } else {
    clearCustomVars();
    const editor = document.getElementById('custom-theme-editor');
    if (editor && editor._hide) editor._hide();
  }
}
