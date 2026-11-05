'use strict';
/* ---------- formats and export: the poster as an image, a video loop, an embed or a link ---------- */
const FORMATS = {
  poster: { label: 'Poster', ratio: '4:5', size: [1080, 1350] },
  square: { label: 'Square', ratio: '1:1', size: [1080, 1080] },
  story: { label: 'Story', ratio: '9:16', size: [1080, 1920] },
  banner: { label: 'Banner', ratio: '16:9', size: [1920, 1080] },
};
let format = 'poster';
function setFormat(name) {
  format = FORMATS[name] ? name : 'poster';
  nodes.poster.dataset.format = format;
  document.querySelectorAll('#formats button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.format === format)));
  const [w, h] = FORMATS[format].size;
  document.getElementById('png-size').textContent = w + ' × ' + h;
  document.getElementById('dock-format').textContent = FORMATS[format].ratio;
  if (!document.body.classList.contains('embed')) try { localStorage.setItem('pixel-weather:format', format); } catch { /* a convenience only */ }
  requestAnimationFrame(fitBig);
}
for (const [name, f] of Object.entries(FORMATS)) {
  const b = document.createElement('button'), [w, h] = f.size, k = 18 / Math.max(w, h);
  b.type = 'button'; b.className = 'opt'; b.dataset.format = name;
  b.innerHTML = '<span class="check">✓</span><span class="glyph"><i style="width:' + Math.round(w * k * .8) + 'px;height:' + Math.round(h * k * .8) + 'px"></i></span>' + f.label + '<span class="meta">' + f.ratio + '</span>';
  b.addEventListener('click', () => { setFormat(name); closeSheets(); });
  document.getElementById('formats').append(b);
}

// the poster is redrawn onto a canvas from the page itself: the gradient, both pixel layers, and every
// line of type at the exact place the browser set it, so the file matches what is on screen
let skyStops = null;
function paintPoster(ctx, outW) {
  const P = nodes.poster, pr = P.getBoundingClientRect(), k = outW / pr.width;
  ctx.save();
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.beginPath(); ctx.rect(0, 0, pr.width, pr.height); ctx.clip();
  const g = ctx.createLinearGradient(0, 0, 0, pr.height);
  for (const [at, color] of skyStops || [[0, '#5a8fc8'], [1, '#5a8fc8']]) g.addColorStop(at, color);
  ctx.fillStyle = g; ctx.fillRect(0, 0, pr.width, pr.height);
  ctx.imageSmoothingEnabled = false;
  const layer = el => { const r = el.getBoundingClientRect(); ctx.drawImage(el, r.left - pr.left, r.top - pr.top, r.width, r.height); };
  layer(skyCanvas);
  paintText(ctx, nodes.big, pr);
  layer(nodes.c);
  for (const el of P.querySelectorAll('*')) paintRules(ctx, el, pr);
  for (const el of P.children) if (el !== nodes.big && el.tagName !== 'CANVAS') paintText(ctx, el, pr);
  ctx.restore();
}
function paintRules(ctx, el, pr) {
  const cs = getComputedStyle(el), r = el.getBoundingClientRect();
  if (!r.width) return;
  const x = r.left - pr.left, y = r.top - pr.top;
  for (const [side, draw] of [
    ['Top', t => ctx.fillRect(x, y, r.width, t)], ['Bottom', t => ctx.fillRect(x, y + r.height - t, r.width, t)],
    ['Left', t => ctx.fillRect(x, y, t, r.height)], ['Right', t => ctx.fillRect(x + r.width - t, y, t, r.height)],
  ]) {
    const t = parseFloat(cs['border' + side + 'Width']);
    if (!t || cs['border' + side + 'Style'] === 'none') continue;
    ctx.fillStyle = cs['border' + side + 'Color'];
    draw(t);
  }
}
const metricCache = new Map();
function paintText(ctx, root, pr) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent;
    if (!text.trim()) continue;
    const el = node.parentElement, cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    ctx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    ctx.fillStyle = cs.color;
    ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    const key = ctx.font;
    if (!metricCache.has(key)) metricCache.set(key, ctx.measureText('Hg').fontBoundingBoxAscent);
    const ascent = metricCache.get(key), upper = cs.textTransform === 'uppercase';
    if (el.id === 'arrow') {
      // the wind arrow is turned by a css transform: turn it the same way round its centre
      const r = el.getBoundingClientRect();
      ctx.save();
      ctx.translate(r.left - pr.left + r.width / 2, r.top - pr.top + r.height / 2);
      ctx.rotate(arrowAngle * Math.PI / 180);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, 0);
      ctx.restore();
      continue;
    }
    // one glyph at a time, each at the position the browser gave it: spacing, kerning and tabular
    // figures all come out the same as on the page
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === ' ' || ch === '\n') continue;
      range.setStart(node, i); range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      if (!r.width) continue;
      ctx.fillText(upper ? ch.toUpperCase() : ch, r.left - pr.left, r.top - pr.top + ascent);
    }
  }
}
function fileName(ext) {
  const city = (WX.place ? WX.place.name : 'city').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const d = new Date();
  return 'lofi-weather-' + city + '-' + format + '-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.' + ext;
}
function save(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function flashDone(button, text) {
  const span = button.querySelector('span'), before = span.textContent;
  button.classList.add('done'); span.textContent = text;
  document.getElementById('announce').textContent = text;
  setTimeout(() => { button.classList.remove('done'); span.textContent = before; }, 1800);
}
function exportCanvas() {
  const [w, h] = FORMATS[format].size, out = document.createElement('canvas');
  out.width = w; out.height = h;
  return out;
}
document.getElementById('get-png').addEventListener('click', async e => {
  const button = e.currentTarget, out = exportCanvas();
  await document.fonts.ready;
  paintPoster(out.getContext('2d'), out.width);
  out.toBlob(blob => { save(blob, fileName('png')); flashDone(button, 'Saved'); }, 'image/png');
});
// a video: the same painter runs every frame for six seconds while the page keeps animating
const VIDEO_TYPES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
const videoType = window.MediaRecorder ? VIDEO_TYPES.find(t => MediaRecorder.isTypeSupported(t)) : null;
const videoButton = document.getElementById('get-video');
document.getElementById('video-type').textContent = videoType ? '6 s' : 'Unavailable';
if (!videoType) videoButton.disabled = true;
let recording = null;
videoButton.addEventListener('click', async () => {
  if (recording || !videoType) return;
  const out = exportCanvas(), ctx = out.getContext('2d'), span = videoButton.querySelector('span'), before = span.textContent;
  await document.fonts.ready;
  paintPoster(ctx, out.width);
  const stream = out.captureStream(30), rec = new MediaRecorder(stream, { mimeType: videoType, videoBitsPerSecond: 12e6 }), chunks = [];
  rec.ondataavailable = ev => ev.data.size && chunks.push(ev.data);
  rec.onstop = () => {
    recording = null; videoButton.disabled = false; span.textContent = before;
    save(new Blob(chunks, { type: videoType.split(';')[0] }), fileName(videoType.startsWith('video/mp4') ? 'mp4' : 'webm'));
    flashDone(videoButton, 'Saved');
  };
  recording = { ctx, w: out.width, ends: performance.now() + 6000 };
  videoButton.disabled = true;
  rec.start();
  const tick = () => {
    const left = Math.ceil((recording.ends - performance.now()) / 1000);
    if (left <= 0) { rec.stop(); return; }
    span.textContent = left + ' s';
    setTimeout(tick, 250);
  };
  tick();
});
// links: a quick city by name, any other place by its coordinates
function placeQuery(params) {
  const p = WX.place;
  if (!p) return;
  if (QUICK.some(q => q.name === p.name && q.latitude === p.latitude)) params.set('city', p.name);
  else { params.set('name', p.name); params.set('lat', p.latitude.toFixed(4)); params.set('lon', p.longitude.toFixed(4)); if (p.country) params.set('country', p.country); }
}
const pageUrl = () => location.origin + location.pathname;
async function copy(text, button, note) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const t = document.createElement('textarea');
    t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.append(t); t.select(); document.execCommand('copy'); t.remove();
  }
  flashDone(button, note);
}
document.getElementById('get-embed').addEventListener('click', e => {
  const q = new URLSearchParams();
  placeQuery(q);
  q.set('format', format); q.set('embed', '1');
  const [w, h] = FORMATS[format].size, name = WX.place ? WX.place.name : 'city';
  const code = '<iframe src="' + pageUrl() + '?' + q + '" title="Lo-Fi Weather: ' + name.replace(/"/g, '') + '" loading="lazy" style="width:100%;max-width:' + (w > h ? 960 : 540) + 'px;aspect-ratio:' + w + '/' + h + ';border:0"></iframe>';
  copy(code, e.currentTarget, 'Copied');
});
const TIME_NAMES = Object.fromEntries(Object.entries(LAB_TIMES).filter(([, v]) => v).map(([k, v]) => [v, k]));
document.getElementById('get-link').addEventListener('click', e => {
  const q = new URLSearchParams();
  placeQuery(q);
  if (format !== 'poster') q.set('format', format);
  if (WX.lab) q.set('w', WX.lab);
  if (WX.labTime) q.set('t', TIME_NAMES[WX.labTime]);
  copy(pageUrl() + '?' + q, e.currentTarget, 'Copied');
});

// the dock: one sheet open at a time; a click outside or Escape closes it
function closeSheets() {
  document.querySelectorAll('.sheet').forEach(s => { s.hidden = true; });
  document.querySelectorAll('#dock [data-sheet]').forEach(b => b.setAttribute('aria-expanded', 'false'));
}
document.querySelectorAll('#dock [data-sheet]').forEach(button => button.addEventListener('click', () => {
  const sheet = document.getElementById('sheet-' + button.dataset.sheet), open = sheet.hidden;
  closeSheets();
  if (!open) return;
  sheet.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  // the sheet opens above its own button, kept inside the dock
  if (button.dataset.sheet !== 'share' && innerWidth > 600) sheet.style.left = Math.max(0, Math.min(button.offsetLeft, button.parentElement.clientWidth - sheet.offsetWidth)) + 'px';
  if (button.dataset.sheet === 'city') nodes.q.focus();
}));
addEventListener('pointerdown', e => { if (!e.target.closest('#dock')) closeSheets(); });
addEventListener('keydown', e => { if (e.key === 'Escape') closeSheets(); });
