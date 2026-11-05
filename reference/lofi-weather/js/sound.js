'use strict';
/* ---------- sound: rain hiss, wind, thunder ---------- */
let audio = null, muted = true, noiseBuffer = null, rainGain = null, windGain = null;
function ensureAudio() {
  if (audio) { if (audio.state === 'suspended') audio.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  audio = new AC();
  noiseBuffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const loop = (type, freq) => {
    const src = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
    src.buffer = noiseBuffer; src.loop = true;
    filter.type = type; filter.frequency.value = freq;
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(audio.destination);
    src.start();
    return gain;
  };
  rainGain = loop('highpass', 1400);
  windGain = loop('lowpass', 380);
}
function updateAudio() {
  if (!audio) return;
  const now = audio.currentTime;
  rainGain.gain.setTargetAtTime(muted ? 0 : (V.rain * .06 + V.drizzle * .025), now, .4);
  windGain.gain.setTargetAtTime(muted ? 0 : clamp(V.wind / 14, 0, 1) * .12 * (.7 + .3 * Math.sin(L.time * .7)), now, .5);
}
function sound(kind) {
  if (!audio || muted || kind !== 'thunder') return;
  for (const [freq, vol, len, delay] of [[200, .4, 1.5, .4], [90, .45, 2.4, .5]]) {
    const at = audio.currentTime + delay, src = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
    src.buffer = noiseBuffer; filter.type = 'lowpass'; filter.frequency.value = freq;
    gain.gain.setValueAtTime(vol, at); gain.gain.exponentialRampToValueAtTime(.0005, at + len);
    src.connect(filter).connect(gain).connect(audio.destination);
    src.start(at, Math.random(), len + .02);
  }
}
