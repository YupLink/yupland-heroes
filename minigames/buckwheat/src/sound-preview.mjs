// The selected clean Suno cue is used in the public demo; QA may compare earlier samples.
const choice = import.meta.env.DEV ? new URLSearchParams(location.search).get('qaSound') : null;
const cleaned = !choice || choice === 'clean';
const sample = cleaned ? 'suno-2-clean.wav' : choice === '2' ? 'suno-2.wav' : choice === '1' ? 'suno-1.wav' : null;
const storageKey = 'buckwheat-match3:audio-approved-panel-v1';
const defaults = { musicEnabled: true, effectsEnabled: true, musicLevel: 70, effectsLevel: 85 };

function savedSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return {
      musicEnabled: typeof stored.musicEnabled === 'boolean' ? stored.musicEnabled : defaults.musicEnabled,
      effectsEnabled: typeof stored.effectsEnabled === 'boolean' ? stored.effectsEnabled : defaults.effectsEnabled,
      musicLevel: Number.isFinite(stored.musicLevel) ? Math.min(100, Math.max(0, stored.musicLevel)) : defaults.musicLevel,
      effectsLevel: Number.isFinite(stored.effectsLevel) ? Math.min(100, Math.max(0, stored.effectsLevel)) : defaults.effectsLevel,
    };
  } catch { return { ...defaults }; }
}

export function createSoundPreview(preloadMusic = false) {
  let settings = savedSettings();
  let context;
  let buffer;
  let music;
  let effectsBus;
  // Yupland Heroes (08.11): Safari и iPhone не играют музыку, если сервер не отдаёт файл
  // частями (Range), а наш отдаёт только целиком. Музыку скачиваем заранее и играем из
  // памяти (blob:); нажали «Играть» раньше — как докачается, переключаемся и играем.
  const musicUrl = `${import.meta.env.BASE_URL}audio/theme.mp3`;
  let musicMemory = null;
  let wantMusic = false;
  if (preloadMusic) fetch(musicUrl)
    .then(response => (response.ok ? response.blob() : null))
    .then(blob => {
      if (!blob) return;
      musicMemory = URL.createObjectURL(blob);
      if (music && wantMusic && music.paused) {
        music.src = musicMemory;
        void music.play().catch(() => {});
      }
    })
    .catch(() => {});

  function applySettings() {
    if (music) music.volume = settings.musicEnabled ? 0.19 * settings.musicLevel / 70 : 0;
    if (context && effectsBus) effectsBus.gain.setTargetAtTime(
      settings.effectsEnabled ? settings.effectsLevel / 85 : 0,
      context.currentTime,
      0.015,
    );
  }

  function setSettings(changes) {
    settings = { ...settings, ...changes };
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { /* Browser storage may be unavailable. */ }
    applySettings();
  }

  function start() {
    wantMusic = true;
    music ??= new Audio(musicMemory ?? musicUrl);
    music.loop = true;
    applySettings();
    void music.play().catch(() => {});
    if (!sample) return;
    context ??= new AudioContext();
    if (!effectsBus) {
      effectsBus = context.createGain();
      effectsBus.connect(context.destination);
    }
    void context.resume();
    if (!buffer) {
      void fetch(`${import.meta.env.BASE_URL}audio/${sample}`)
        .then(response => response.arrayBuffer())
        .then(bytes => context.decodeAudioData(bytes))
        .then(decoded => { buffer = decoded; });
    }
    applySettings();
  }

  function stop() {
    wantMusic = false;
    if (!music) return;
    music.pause();
    music.currentTime = 0;
  }

  function cue(kind, wave = 1) {
    if (!context || !buffer || !settings.effectsEnabled || !settings.effectsLevel) return;
    const cueSettings = kind === 'land'
      ? { duration: 0.16, volume: cleaned ? 0.4 : 0.14, rate: 0.82 }
      : kind === 'combo'
        ? { duration: 0.68, volume: cleaned ? 1 : 0.58, rate: Math.min(1.16, 0.94 + wave * 0.04) }
        : { duration: 0.34, volume: cleaned ? 0.9 : 0.42, rate: 1 };
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = cueSettings.rate;
    gain.gain.setValueAtTime(cueSettings.volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + cueSettings.duration);
    source.connect(gain).connect(effectsBus);
    source.start();
    source.stop(context.currentTime + cueSettings.duration);
  }

  return { start, stop, cue, hasEffects: () => !!sample, getSettings: () => ({ ...settings }), setSettings };
}
