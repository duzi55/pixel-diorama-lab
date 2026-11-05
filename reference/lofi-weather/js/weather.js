'use strict';
/* ---------- weather: the live reading, and the look it turns into ---------- */
const CODES = {
  0: ['Clear sky', 'clear', 0], 1: ['Mainly clear', 'clear', .22], 2: ['Partly cloudy', 'cloud', .5], 3: ['Overcast', 'cloud', .95],
  45: ['Fog', 'fog', .85], 48: ['Freezing fog', 'fog', .85],
  51: ['Light drizzle', 'drizzle', .3], 53: ['Drizzle', 'drizzle', .5], 55: ['Dense drizzle', 'drizzle', .75],
  56: ['Freezing drizzle', 'drizzle', .4], 57: ['Freezing drizzle', 'drizzle', .7],
  61: ['Light rain', 'rain', .35], 63: ['Rain', 'rain', .65], 65: ['Heavy rain', 'rain', 1],
  66: ['Freezing rain', 'rain', .45], 67: ['Freezing rain', 'rain', .85],
  71: ['Light snow', 'snow', .35], 73: ['Snow', 'snow', .65], 75: ['Heavy snow', 'snow', 1], 77: ['Snow grains', 'snow', .3],
  80: ['Rain showers', 'rain', .5], 81: ['Rain showers', 'rain', .75], 82: ['Violent showers', 'rain', 1],
  85: ['Snow showers', 'snow', .55], 86: ['Heavy snow showers', 'snow', 1],
  95: ['Thunderstorm', 'storm', .85], 96: ['Thunderstorm, hail', 'storm', 1], 99: ['Thunderstorm, hail', 'storm', 1],
};
const LAB = {
  clear: { code: 0 }, heat: { code: 0, temp: 33 }, cloudy: { code: 2 }, overcast: { code: 3 }, fog: { code: 45 }, drizzle: { code: 53 },
  rain: { code: 63 }, downpour: { code: 65, wind: 9 }, storm: { code: 95, wind: 11 }, snow: { code: 73, temp: -3 }, blizzard: { code: 75, wind: 13, temp: -8 },
};
const LAB_TIMES = { live: null, dawn: 'rise', noon: 'noon', dusk: 'set', night: 'night' };
const WX = { place: null, data: null, lab: null, labTime: null, fetchedAt: 0 };
// T is where the picture is heading; V eases towards it so a change of city or sky dissolves instead of cutting
const T = { cloud: 0, rain: 0, drizzle: 0, snow: 0, fog: 0, storm: 0, wind: 2, windX: 1, windY: 0, temp: 15, night: 0, golden: 0, wet: 0, cover: 0, smoke: 0 };
const V = { ...T };
const minutesOf = iso => { const m = /T(\d\d):(\d\d)/.exec(iso || ''); return m ? +m[1] * 60 + +m[2] : null; };
function localNow() {
  const off = WX.data ? WX.data.utc_offset_seconds : -new Date().getTimezoneOffset() * 60;
  const d = new Date(Date.now() + off * 1000);
  const date = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return { minutes: d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60, month: d.getUTCMonth(), date, text: String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') };
}
function sunTimes() {
  const rise = WX.data && minutesOf(WX.data.daily.sunrise[0]), set = WX.data && minutesOf(WX.data.daily.sunset[0]);
  return { rise: rise == null ? 390 : rise, set: set == null ? 1110 : set };
}
function clockMinutes() {
  const { rise, set } = sunTimes();
  const pick = { rise: rise + 10, noon: (rise + set) / 2, set: set - 5, night: (set + 1440 + rise) / 2 % 1440 }[WX.labTime];
  return pick == null ? localNow().minutes : pick;
}
const smooth = (a, b, x) => ease(clamp((x - a) / (b - a), 0, 1));
function season(month, lat) {
  const north = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'][month];
  if (lat >= 0) return north;
  return { winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' }[north];
}
function setTargets() {
  const cur = WX.data ? WX.data.current : { weather_code: 1, temperature_2m: 15, wind_speed_10m: 2, wind_direction_10m: 240, precipitation: 0, snow_depth: 0 };
  const lab = WX.lab && LAB[WX.lab];
  const code = lab ? lab.code : cur.weather_code;
  const [, kind, amount] = CODES[code] || CODES[1];
  const precip = lab ? 0 : cur.precipitation || 0;
  T.temp = lab && lab.temp != null ? lab.temp : cur.temperature_2m;
  T.wind = lab && lab.wind != null ? lab.wind : cur.wind_speed_10m;
  const heading = ((lab ? 250 : cur.wind_direction_10m) + 180) * Math.PI / 180; // the API names where wind comes from
  T.windX = (Math.sin(heading) - Math.cos(heading)) / R2;
  T.windY = (-Math.sin(heading) - Math.cos(heading)) / R2;
  T.cloud = kind === 'clear' || kind === 'cloud' ? amount : kind === 'fog' ? .85 : clamp(.75 + amount * .25, 0, 1);
  if (!lab && cur.cloud_cover != null) T.cloud = kind === 'clear' || kind === 'cloud' ? Math.max(amount * .8, cur.cloud_cover / 100) : Math.max(T.cloud, cur.cloud_cover / 100);
  const rainy = kind === 'rain' || kind === 'storm';
  T.rain = rainy ? Math.max(amount, clamp(precip / 6, 0, 1)) : 0;
  T.drizzle = kind === 'drizzle' ? amount : 0;
  T.snow = kind === 'snow' ? amount : 0;
  T.fog = kind === 'fog' ? amount : kind === 'drizzle' ? .2 : kind === 'snow' ? amount * .25 : 0;
  T.storm = kind === 'storm' ? 1 : 0;
  T.wet = rainy || kind === 'drizzle' ? clamp(.45 + (T.rain + T.drizzle) * .6, 0, 1) : (!lab && precip > 0 ? .5 : 0);
  const depth = lab ? 0 : cur.snow_depth || 0;
  T.cover = kind === 'snow' ? clamp(.45 + amount * .5, 0, 1) : clamp(depth * 12, 0, 1);
  if (T.temp > 4 && kind !== 'snow') T.cover = Math.min(T.cover, clamp(depth * 6, 0, .6));
  T.smoke = T.temp < 14 ? clamp((14 - T.temp) / 12, .25, 1) : 0;
  const lat = WX.place ? WX.place.latitude : 43;
  const next = { season: season(localNow().month, lat), tropical: Math.abs(lat) < 27, city: cityFor(WX.place) };
  if (lab && (lab.code >= 71 && lab.code <= 86) && !next.tropical) next.season = 'winter';
  if (next.season !== look.season || next.tropical !== look.tropical || next.city !== look.city) { look = next; bake(); }
}
function updateSun() {
  const m = clockMinutes(), { rise, set } = sunTimes();
  const day = smooth(rise - 35, rise + 25, m) * (1 - smooth(set - 25, set + 35, m));
  T.night = 1 - day;
  T.golden = Math.max(Math.exp(-(((m - rise - 25) / 55) ** 2)), Math.exp(-(((m - set + 25) / 55) ** 2))) * (1 - T.cloud * .75);
  return { m, rise, set, day };
}
function ease1(dt) {
  const k = 1 - Math.exp(-dt * 1.6);
  for (const key in T) V[key] = key === 'windX' || key === 'windY' ? T[key] : lerp(V[key], T[key], k);
}

/* ---------- fetching ---------- */
const nodes = Object.fromEntries(['poster', 'big', 'bigname', 'region', 'native', 'coords', 'date', 'temp', 'clock', 'cond', 'wind', 'arrow', 'clouds', 'humid', 'sun', 'feels', 'tempF', 'q', 'results', 'search', 'status', 'quick', 'sound', 'c'].map(id => [id, document.getElementById(id)]));
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function setStatus(text) { nodes.status.textContent = text || ''; }
function remember(place) { try { localStorage.setItem('pixel-weather:place', JSON.stringify(place)); } catch { /* remembering the city is a convenience */ } }
function recall() { try { return JSON.parse(localStorage.getItem('pixel-weather:place')); } catch { return null; } }
// the city name spans the poster edge to edge, whatever its length
function fitBig() {
  const span = nodes.bigname, room = nodes.big.clientWidth;
  if (!room) return;
  span.style.fontSize = '100px';
  document.getElementById('dock').style.width = nodes.poster.offsetWidth + 'px';
  const size = Math.min(100 * room / span.offsetWidth, nodes.poster.clientWidth * .32);
  span.style.fontSize = size + 'px';
}
let retryTimer = 0, retries = 0;
async function loadPlace(place) {
  WX.place = place;
  nodes.bigname.textContent = place.name;
  nodes.region.textContent = [place.admin1, place.country].filter((v, k, a) => v && a.indexOf(v) === k).join(', ');
  nodes.native.textContent = NATIVE[cityFor(place)] || '';
  nodes.coords.textContent = Math.abs(place.latitude).toFixed(2) + '°' + (place.latitude >= 0 ? 'N' : 'S') + '  ' + Math.abs(place.longitude).toFixed(2) + '°' + (place.longitude >= 0 ? 'E' : 'W');
  fitBig();
  syncLab();
  document.getElementById('dock-city').textContent = place.name;
  [...nodes.quick.children].forEach(b => b.setAttribute('aria-pressed', String(b.textContent === place.name)));
  clearTimeout(retryTimer);
  if (!WX.data || WX.dataFor !== place) { WX.data = null; renderReadout(); }
  setStatus('Loading…');
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + place.latitude + '&longitude=' + place.longitude +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,snow_depth' +
    '&daily=sunrise,sunset&timezone=auto&forecast_days=1&wind_speed_unit=ms';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    if (WX.place !== place) return;
    WX.data = data;
    WX.dataFor = place;
    WX.fetchedAt = Date.now();
    retries = 0;
    remember(place);
    setStatus('');
    setTargets();
    renderReadout();
  } catch {
    if (WX.place !== place) return;
    setStatus('Offline · retrying');
    retryTimer = setTimeout(() => loadPlace(place), Math.min(60, 5 * 2 ** retries++) * 1000);
  }
}
let arrowAngle = 180;
function renderReadout() {
  const cur = WX.data && WX.data.current, lab = WX.lab && LAB[WX.lab];
  const code = lab ? lab.code : cur ? cur.weather_code : 1, [label] = CODES[code] || CODES[1];
  const temp = lab && lab.temp != null ? lab.temp : cur ? cur.temperature_2m : null;
  const wind = lab && lab.wind != null ? lab.wind : cur ? cur.wind_speed_10m : null;
  const dir = lab ? 250 : cur ? cur.wind_direction_10m : 0;
  const m = clockMinutes(), now = localNow();
  nodes.temp.textContent = temp == null ? '—' : Math.round(temp);
  nodes.tempF.textContent = temp == null ? '' : Math.round(temp * 9 / 5 + 32) + ' °F';
  // until the city's own reading arrives there is no honest local time, sky or sun to show
  nodes.clock.textContent = WX.labTime ? String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(Math.floor(m % 60)).padStart(2, '0') : cur ? now.text : '--:--';
  nodes.cond.textContent = cur || lab ? label + (lab || WX.labTime ? ' · preview' : '') : '—';
  const name = WX.place ? WX.place.name : 'the city';
  nodes.wind.textContent = wind == null ? '—' : COMPASS[Math.round(dir / 45) % 8] + ' ' + Math.round(wind) + ' m/s';
  arrowAngle = dir + 180;
  nodes.arrow.style.transform = 'rotate(' + arrowAngle + 'deg)'; // the arrow points where the wind blows to
  nodes.clouds.textContent = lab ? Math.round(T.cloud * 100) + '%' : cur ? cur.cloud_cover + '%' : '—';
  nodes.humid.textContent = cur ? cur.relative_humidity_2m + '%' : '—';
  const { rise, set } = sunTimes(), hm = v => String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(Math.round(v % 60)).padStart(2, '0');
  nodes.sun.textContent = WX.data ? hm(rise) + '–' + hm(set) : '—';
  nodes.feels.textContent = cur && !lab ? 'Feels like ' + Math.round(cur.apparent_temperature) + '°' : '';
  nodes.date.textContent = now.date;
  nodes.c.setAttribute('aria-label', name + ': ' + label + (temp == null ? '' : ', ' + Math.round(temp) + ' °C'));
}

/* ---------- search ---------- */
let searchTimer = 0, searchToken = 0, found = [], active = -1;
function placeLabel(p) { return [p.admin1, p.country].filter((v, k, a) => v && a.indexOf(v) === k).join(', '); }
function showResults(list) {
  found = list; active = -1;
  nodes.results.replaceChildren(...list.map((p, k) => {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'option');
    b.append(p.name + ' ');
    const span = document.createElement('span'); span.textContent = placeLabel(p); b.append(span);
    b.addEventListener('click', () => choose(k));
    li.append(b);
    return li;
  }));
}
function choose(k) {
  const p = found[k];
  if (!p) return;
  showResults([]);
  nodes.q.value = '';
  nodes.q.blur();
  closeSheets();
  WX.lab = null; WX.labTime = null; syncLab();
  loadPlace({ name: p.name, admin1: p.admin1, country: p.country, latitude: p.latitude, longitude: p.longitude });
}
nodes.q.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const text = nodes.q.value.trim();
  if (text.length < 2) { showResults([]); return; }
  searchTimer = setTimeout(async () => {
    const token = ++searchToken;
    try {
      const res = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=' + encodeURIComponent(text));
      const data = await res.json();
      if (token === searchToken) showResults(data.results || []);
    } catch { if (token === searchToken) showResults([]); }
  }, 260);
});
nodes.q.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!found.length) return;
    active = (active + (e.key === 'ArrowDown' ? 1 : -1) + found.length) % found.length;
    [...nodes.results.querySelectorAll('button')].forEach((b, k) => b.classList.toggle('active', k === active));
  }
  if (e.key === 'Escape') showResults([]);
});
nodes.search.addEventListener('submit', e => { e.preventDefault(); choose(active < 0 ? 0 : active); });
for (const p of QUICK) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.textContent = p.name; b.setAttribute('aria-pressed', 'false');
  b.addEventListener('click', () => { WX.lab = null; WX.labTime = null; syncLab(); loadPlace(p); closeSheets(); });
  nodes.quick.append(b);
}
// the lab: preview any sky over the current city, for showing what the square can do
function labRow(id, entries, key) {
  const row = document.getElementById(id);
  for (const [name, value] of entries) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = name; b.dataset.value = value == null ? '' : value;
    b.addEventListener('click', () => { WX[key] = value; syncLab(); setTargets(); renderReadout(); });
    row.append(b);
  }
}
function syncLab() {
  document.querySelectorAll('#lab-weather .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === (WX.lab || ''))));
  document.querySelectorAll('#lab-time .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === (WX.labTime || ''))));
  const preview = WX.lab || WX.labTime, city = WX.place ? WX.place.name : 'the city';
  const w = document.querySelector('#lab-weather .chip[aria-pressed="true"]'), t = document.querySelector('#lab-time .chip[aria-pressed="true"]');
  document.getElementById('dock-sky').textContent = !preview ? 'Live' : [WX.lab && w ? w.textContent : '', WX.labTime && t ? t.textContent : ''].filter(Boolean).join(' · ');
}
// the public set of skies; the rest of LAB still works through the url
labRow('lab-weather', [['Live', null], ['Clear', 'clear'], ['Heat', 'heat'], ['Cloudy', 'cloudy'], ['Fog', 'fog'], ['Rain', 'rain'], ['Storm', 'storm'], ['Snow', 'snow']], 'lab');
labRow('lab-time', [['Now', null], ['Dawn', 'rise'], ['Noon', 'noon'], ['Dusk', 'set'], ['Night', 'night']], 'labTime');
syncLab();
