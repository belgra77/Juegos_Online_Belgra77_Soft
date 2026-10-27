/* ============================================================
   Conecta 4 online by Belgra_77_Soft
   js/audio.js — Motor de audio 100% nativo con Web Audio API.
   SFX para discos en Conecta 4 + notificaciones + fanfarria +
   banda sonora lo-fi / chill-hop generativa en bucle.
   ============================================================ */

const AudioEngine = (() => {
  "use strict";
  let ctx = null, master = null, musicBus = null, musicTimer = null;
  let musicOn = true, sfxOn = true, unlocked = false;

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.16;
    const musicComp = ctx.createDynamicsCompressor();
    musicComp.threshold.value = -22;
    musicBus.connect(musicComp).connect(ctx.destination);
    return true;
  }
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    unlocked = ctx.state === "running";
    if (unlocked && musicOn) startMusic();
  }
  function now() { return ctx.currentTime; }

  function tone({ freq = 440, type = "sine", dur = 0.18, gain = 0.5, bus = "sfx", delay = 0, slideTo = null }) {
    const busNode = bus === "music" ? musicBus : master;
    const t = now() + delay;
    const osc = ctx.createOscillator(); osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(busNode);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  function noise({ dur = 0.08, gain = 0.25, filterFreq = 6000 }) {
    const t = now();
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = filterFreq;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
  }

  const SFX = {
    /** Ficha que cae (tono por color) */
    discRed: () => { if (!ready()) return; tone({ freq: 240, type: "triangle", dur: 0.22, gain: 0.38 }); tone({ freq: 480, type: "sine", dur: 0.12, gain: 0.18, delay: 0.05 }); },
    discYellow: () => { if (!ready()) return; tone({ freq: 330, type: "triangle", dur: 0.22, gain: 0.38 }); tone({ freq: 620, type: "sine", dur: 0.12, gain: 0.18, delay: 0.05 }); },
    /** Confirmación de ficha aterrizada */
    discLand: () => { if (!ready()) return; tone({ freq: 392, type: "sine", dur: 0.1, gain: 0.3 }); tone({ freq: 523, type: "triangle", dur: 0.08, gain: 0.2, delay: 0.04 }); },
    chat: () => { if (!ready()) return; tone({ freq: 680, type: "sine", dur: 0.1, gain: 0.3 }); tone({ freq: 920, type: "sine", dur: 0.12, gain: 0.28, delay: 0.08 }); },
    emoji: () => { if (!ready()) return; tone({ freq: 520, slideTo: 1040, type: "sine", dur: 0.2, gain: 0.3 }); noise({ dur: 0.05, gain: 0.08, filterFreq: 8000 }); },
    win: () => { if (!ready()) return; [523.25, 659.25, 783.99].forEach((f, i) => tone({ freq: f, type: "triangle", dur: 0.22, gain: 0.4, delay: i * 0.12 })); tone({ freq: 1046.5, type: "triangle", dur: 0.7, gain: 0.42, delay: 0.36 }); noise({ dur: 0.3, gain: 0.1, filterFreq: 5000 }); },
    fanfarria: () => { if (!ready()) return; const seq = [392, 523.25, 659.25, 784]; seq.forEach((f, i) => tone({ freq: f, type: "triangle", dur: 0.24, gain: 0.4, delay: i * 0.12 })); tone({ freq: 1046.5, type: "triangle", dur: 0.7, gain: 0.42, delay: 0.52 }); noise({ dur: 0.3, gain: 0.1, filterFreq: 5000 }); },
  };
  function ready() { if (!ctx || !sfxOn || ctx.state !== "running") return false; return true; }

  /* Banda sonora lo-fi / chill-hop en bucle */
  function startMusic() {
    if (!ensure() || musicTimer) return;
    ctx.resume().catch(() => {});
    const BPM = 72, beat = 60 / BPM, bar = beat * 4;
    let step = 0;
    const prog = [
      { root: 110.0, chord: [110.0, 164.81, 207.65, 261.63] },
      { root: 87.31, chord: [87.31, 130.81, 174.61, 220.0] },
      { root: 130.81, chord: [130.81, 196.0, 246.94, 329.63] },
      { root: 98.0, chord: [98.0, 146.83, 196.0, 246.94] },
    ];
    const pad = (freq, dur, delay = 0) => {
      const t = now() + delay;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const o1 = ctx.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = freq;
      const o2 = ctx.createOscillator(); o2.type = "triangle"; o2.frequency.value = freq * 1.002;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
      o1.connect(lp); o2.connect(lp); lp.connect(g).connect(musicBus);
      o1.start(t); o2.start(t); o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
    };
    const bass = (freq, dur, delay = 0) => {
      const t = now() + delay;
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = freq / 2;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(musicBus); o.start(t); o.stop(t + dur + 0.05);
    };
    const hat = (delay = 0) => {
      const t = now(); const len = Math.floor(ctx.sampleRate * 0.05);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      const s = ctx.createBufferSource(); s.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 8000;
      const g = ctx.createGain(); g.gain.value = 0.05;
      s.connect(f).connect(g).connect(musicBus); s.start(t);
    };
    const kick = (delay = 0) => {
      const t = now();
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(musicBus); o.start(t); o.stop(t + 0.2);
    };
    function scheduleBar() {
      if (!musicOn) return;
      const chord = prog[step % prog.length];
      const offset = now() + 0.08;
      [0, 1, 2, 3].forEach((i) => pad(chord.chord[i], bar * 0.9, offset - now()));
      bass(chord.root, beat * 1.4, offset - now());
      bass(chord.root * 1.5, beat * 0.8, offset - now() + beat * 2.5);
      kick(offset - now()); kick(offset - now() + beat * 2);
      hat(offset - now() + beat * 0.5); hat(offset - now() + beat * 1.5);
      hat(offset - now() + beat * 2.5); hat(offset - now() + beat * 3.5);
      step = (step + 1) % prog.length;
    
    // Variación cada 4 barras: cambiar intensidad y patrón
    if (step % 4 === 0) { intensityFactor = 0.9; }
    if (step % 4 === 1) { hatVariation = Math.random() > 0.5; }
    if (step % 4 === 2) { kickVariation = Math.random() > 0.5; }
    if (step % 4 === 3) { bassVariation = Math.random() > 0.5; }
    
    // Aplicar variaciones sutiles a los próximos scheduledBar
    const currentIntensity = intensityFactor !== undefined ? intensityFactor : 1.0;
    const currentHatVar = hatVariation !== undefined ? hatVariation : false;
    const currentKickVar = kickVariation !== undefined ? kickVariation : false;
    const currentBassVar = bassVariation !== undefined ? bassVariation : false;
      musicTimer = setTimeout(scheduleBar, bar * 1000 - 80);
    }
    scheduleBar();
  }
  function stopMusic() { if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; } }

  return {
    unlock,
    discRed: () => sfxOn && unlocked && SFX.discRed(),
    discYellow: () => sfxOn && unlocked && SFX.discYellow(),
    chat: () => sfxOn && unlocked && SFX.chat(),
    emoji: () => sfxOn && unlocked && SFX.emoji(),
    win: () => sfxOn && unlocked && SFX.win(),
    fanfarria: () => sfxOn && unlocked && SFX.fanfarria(),
    toggleMusic() { musicOn = !musicOn; if (musicOn) startMusic(); else stopMusic(); return musicOn; },
    toggleSfx() { sfxOn = !sfxOn; return sfxOn; },
    get musicOn() { return musicOn; },
    get sfxOn() { return sfxOn; },
    unlockNow: unlock,
  };
})();

window.AudioEngine = AudioEngine;
["pointerdown", "touchstart", "keydown"].forEach((e) => window.addEventListener(e, () => AudioEngine.unlock(), { once: true }));
export default AudioEngine;
