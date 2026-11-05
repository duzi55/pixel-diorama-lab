'use strict';
/* ---------- boot ---------- */
// url parameters: ?city=Tokyo or ?name=Paris&lat=48.85&lon=2.35, then &w=rain&t=dusk&format=story&embed=1
const params = new URLSearchParams(location.search);
const embedded = !!params.get('embed');
if (embedded) document.body.classList.add('embed');
if (PEOPLE_MODES.includes(params.get('people'))) people = params.get('people');
if (!embedded) {
  if (params.get('w') in LAB) WX.lab = params.get('w');
  if (params.get('t') in LAB_TIMES) WX.labTime = LAB_TIMES[params.get('t')];
}
let savedFormat = null;
try { savedFormat = localStorage.getItem('pixel-weather:format'); } catch { /* a convenience only */ }
setFormat(params.get('format') || (embedded ? 'poster' : savedFormat) || 'poster');
syncLab();
addEventListener('resize', fitBig);
document.fonts.ready.then(fitBig);
bake();
setTargets();
updateSun();
Object.assign(V, T);
const askedLat = parseFloat(params.get('lat')), askedLon = parseFloat(params.get('lon'));
const asked = isFinite(askedLat) && isFinite(askedLon) && Math.abs(askedLat) <= 90 && Math.abs(askedLon) <= 180
  ? { name: (params.get('name') || 'Here').slice(0, 60), country: (params.get('country') || '').slice(0, 60), latitude: askedLat, longitude: askedLon }
  : QUICK.find(q => q.name.toLowerCase() === (params.get('city') || '').toLowerCase());
loadPlace(asked || (params.get('city') ? QUICK[0] : recall() || QUICK[0]));
setInterval(() => { if (WX.place && Date.now() - WX.fetchedAt > 10 * 60e3) loadPlace(WX.place); renderReadout(); }, 30e3);
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  updateSun();
  ease1(dt);
  updateLife(dt);
  updateAudio();
  draw();
  if (recording) paintPoster(recording.ctx, recording.w);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__wx = { WX, T, V, L, setLab(w, t) { WX.lab = w; WX.labTime = t; syncLab(); setTargets(); updateSun(); renderReadout(); Object.assign(V, T); }, bake, draw };
