/* ============================================================
   Tres en Raya online by Belgra_77_Soft
   audio.js — Motor de audio 100% nativo con Web Audio API.
   Sin archivos externos: SFX sintetizados + banda sonora
   lo-fi / chill-hop generativa en bucle.
   ============================================================ */

const AudioEngine = (() => {
  "use strict";

  let ctx = null;          // AudioContext
  let master = null;       // Ganancia maestra SFX
  let musicBus = null;     // Bus de música (loop lo-fi)
  let musicTimer = null;
  let musicOn = true;
  let sfxOn = true;
  let unlocked = false;

  /* ---------- Utilidades ---------- */

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);

    musicBus = ctx.createGain();
    musicBus.gain.value = 0.16; // volumen ambiental suave
    const musicComp = ctx.createDynamicsCompressor();
    musicComp.threshold.value = -22;
    musicBus.connect(musicComp).connect(ctx.destination);
    return true;
  }

  // Desbloqueo requerido por navegadores móviles (iOS/Android)
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    unlocked = ctx.state === "running";
    if (unlocked && musicOn) startMusic();
  }

  function now() { return ctx.currentTime; }

  /** Nota senoidal/cuadrada con envolvente ADSR simple */
  function tone({ freq = 440, type = "sine", dur = 0.18, gain = 0.5, bus = "sfx", delay = 0, slideTo = null }) {
    const busNode = bus === "music" ? musicBus : master;
    const t = now() + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(busNode);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** Ruido filtrado para percusión tipo hi-hat / snare */
  function noise({ dur = 0.08, gain = 0.25, filterFreq = 6000, type = "highpass" }) {
    const t = now();
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
  }

  /* ================== SFX del juego ================== */

  const SFX = {
    /** Toque de ficha — timbre distinto por símbolo */
    tapX() {
      if (!ready()) return;
      tone({ freq: 480, type: "triangle", dur: 0.14, gain: 0.4 });
      tone({ freq: 960, type: "sine", dur: 0.09, gain: 0.22, delay: 0.02 });
    },
    tapO() {
      if (!ready()) return;
      tone({ freq: 320, type: "sine", dur: 0.2, gain: 0.42 });
      tone({ freq: 190, type: "sine", dur: 0.16, gain: 0.2, delay: 0.03 });
    },
    /** Burbuja de chat / mensaje recibido */
    msg() {
      if (!ready()) return;
      tone({ freq: 680, type: "sine", dur: 0.1, gain: 0.3 });
      tone({ freq: 920, type: "sine", dur: 0.12, gain: 0.28, delay: 0.08 });
    },
    /** Reacción de emoji de sentimiento */
    emoji() {
      if (!ready()) return;
      tone({ freq: 520, slideTo: 1040, type: "sine", dur: 0.2, gain: 0.3 });
      noise({ dur: 0.05, gain: 0.08, filterFreq: 8000 });
    },
    /** Empate */
    draw() {
      if (!ready()) return;
      [330, 330, 392].forEach((f, i) => tone({ freq: f, type: "sine", dur: 0.14, gain: 0.28, delay: i * 0.14 }));
    },
    /** Grito de victoria + fanfarria */
    fanfare() {
      if (!ready()) return;
      const seq = [392, 523.25, 659.25, 784];
      seq.forEach((f, i) => tone({ freq: f, type: "triangle", dur: 0.24, gain: 0.4, delay: i * 0.12 }));
      tone({ freq: 1046.5, type: "triangle", dur: 0.7, gain: 0.42, delay: 0.52 });
      noise({ dur: 0.3, gain: 0.1, filterFreq: 5000 });
    }
  };

  function ready() {
    if (!ctx || !sfxOn || ctx.state !== "running") return false;
    return true;
  }

  /* ================== Banda sonora lo-fi / chill-hop ==================
     Secuencia generativa: progresión ii–V–I–vi (Am9 vibes) a 72 BPM,
     acordes eléctricos suaves, bajo redondo, hi-hats y vinilo. */

  /* ===== MELODÍA ANIMADA: "Upbeat Chill" =====
   Progresión alegre con variaciones cada 2-4 compases,
   bajo melódico y patrones de batería orgánicos.
   BPM: 96 (más animado que 72) */

  function startMusic() {
    if (!ensure() || musicTimer) return;
    ctx.resume().catch(() => {});
    const BPM = 96;
    const beat = 60 / BPM;               // segundos por pulso (más rápido)
    const bar = beat * 4;                // compás 4/4
    let step = 0;

    // 5 progresiones alegres y diferentes (no la misma repetitiva)
    const PROGRESSIONS = [
      // 1. C - G - Am - F (pop-rock clásico, muy alegre)
      { root: 261.63, chord: [[261.63, 329.63, 392.0, 466.16], [196.0, 246.94, 329.63, 392.0], [220.0, 261.63, 329.63, 392.0], [174.61, 220.0, 261.63, 329.63]] },
      // 2. F - C - Bb - Bbdim (optimista con tensión)
      { root: 174.61, chord: [[174.61, 220.0, 246.94, 329.63], [261.63, 329.63, 392.0, 466.16], [233.08, 293.66, 349.23, 415.3], [261.63, 279.36, 293.66, 329.63]] },
      // 3. Am - F - C - G (pop-pensativo pero ascendente)
      { root: 220.0, chord: [[220.0, 261.63, 329.63, 392.0], [174.61, 220.0, 246.94, 329.63], [261.63, 329.63, 392.0, 466.16], [196.0, 246.94, 329.63, 392.0]] },
      // 4. G - D - Em - C (rock uplifting)
      { root: 196.0, chord: [[196.0, 246.94, 329.63, 392.0], [146.83, 174.61, 207.65, 246.94], [220.0, 261.63, 329.63, 392.0], [261.63, 329.63, 392.0, 466.16]] },
      // 5. Em - C - G - D (clásico pop-rock)
      { root: 164.81, chord: [[164.81, 196.0, 261.63, 329.63], [261.63, 329.63, 392.0, 466.16], [196.0, 246.94, 329.63, 392.0], [146.83, 174.61, 207.65, 246.94]] },
    ];

    // Variaciones de instrumentación cada 2 compases
    const VARIATIONS = [
      // Var A: añadir quinta justa
      (chord, step) => {
        if (step % 2 === 0) {
          // Añadir octava superior a la primera nota
          chord[0][0] *= 2;
        }
      },
      // Var B: cambiar ritmo de hats
      (chord, step) => {
        if (step % 2 === 1) {
          // Patrón de hats más rápido
          hatVariation = true;
        }
      },
      // Var C: fill de kick
      (chord, step) => {
        if (step % 2 === 0 && Math.random() > 0.5) {
          kick.now = now();
          kick(0);
          setTimeout(() => kick(0), beat * 0.25);
        }
      },
    ];

    // Patrones de hat más animados
    const hatPatterns = [
      () => { for (let i = 0; i < 16; i++) hat(bar * step + i * beat / 16); },
      () => { hat(bar * step + beat * 0.25); hat(bar * step + beat * 0.75); hat(bar * step + beat * 1.25); hat(bar * step + beat * 1.75); },
      () => { hat(bar * step + beat * 0.5); hat(bar * step + beat * 1.5); },
      () => { /* Silencio de hats cada 4 compases */ },
    ];

    const kickPatterns = [
      () => { kick(bar * step); kick(bar * step + beat * 2); kick(bar * step + beat * 4); },
      () => { kick(bar * step + beat * 0.5); kick(bar * step + beat * 1.5); kick(bar * step + beat * 2.5); },
      () => { kick(bar * step + beat * 1); kick(bar * step + beat * 3); },
      () => { /* Kick solo en los 1 y 3 */ },
    ];

    function scheduleBar() {
      if (!musicOn) return;
      const currentProg = PROGRESSIONS[step % PROGRESSIONS.length];
      const chord = currentProg.chord;
      const rootFreq = currentProg.root;

      // Aplicar variación cada 2 compases
      VARIATIONS.forEach(variation => variation(chord, step));

      // Aplicar patrón de batería aleatorio
      const kickPattern = kickPatterns[Math.floor(Math.random() * kickPatterns.length)];
      const hatPattern = hatPatterns[Math.floor(Math.random() * hatPatterns.length)];
      kickPattern();
      hatPattern();

      // Tocar acordes con arpegiación variada
      chord.forEach((notes, i) => {
        // Some notes arpeggiated, some chordal
        if (i % 2 === 0) {
          // Arpeggiado: notas secuenciales
          notes.forEach((freq, nIdx) => {
            const delay = nIdx * (beat * 0.1);
            const velocity = 0.3 + Math.random() * 0.2;
            pad(freq, beat * 0.8, bar * step - now() + delay);
          });
        } else {
          // Acorde completo simultáneo
          pad(chord[0], bar * 0.9, bar * step - now());
        }
      });

      // Bajo melódico con passing tones más activo
      const bassNotes = generateBassLine(rootFreq, chord, 8);
      bassNotes.forEach((freq, i) => {
        const delay = i * beat * 0.5;
        bass(freq, beat * 1.2, bar * step - now() + delay);
      });

      // Melodía principal cada 4 compases (línea simple y memorable)
      if (step % 4 === 0) {
        playMelodyFragment(rootFreq, bar * step);
      }

      step = (step + 1) % PROGRESSIONS.length;
      musicTimer = setTimeout(scheduleBar, bar * 1000 - 80);
    }
    scheduleBar();
  }

  // Genera línea de bajo melódica con passing tones
  function generateBassLine(rootFreq, chord, notesCount) {
    const notes = [];
    const scale = getScaleDegrees(rootFreq, chord);
    for (let i = 0; i < notesCount; i++) {
      // 60% tríada, 40% passing tone
      if (Math.random() > 0.4) {
        notes.push(chord[i % chord.length]);
      } else {
        const passingIdx = Math.floor(Math.random() * scale.length);
        notes.push(scale[passingIdx]);
      }
    }
    return notes;
  }

  // Obtiene grados de escala basados en la raíz
  function getScaleDegrees(rootFreq, chord) {
    // Pentatonic menor: 1, b3, 4, 5, b7
    const baseNote = rootFreq;
    const intervals = [0, 3, 5, 7, 10]; // semitonos desde la raíz
    return intervals.map(i => rootFreq * Math.pow(2, i / 12));
  }

  // Convierte frecuencia a índice de escala (aproximado)
  function freqToScaleIndex(freqOverRoot) {
    return 12 * Math.log2(freqOverRoot || 1);
  }

  // Toca un fragmento de melodía principal cada 4 compases
  function playMelodyFragment(rootFreq, startTime) {
    const melodyNotes = [
      rootFreq,
      rootFreq * 1.12246,   // mayor tercera
      rootFreq * 1.25992,   // quinta justa
      rootFreq * 1.4983,    // mayor sexta
      rootFreq * 1.68179,   // mayor séptima
    ];
    const rhythmPattern = [0, beat * 0.5, beat * 1, beat * 1.5, beat * 2];
    melodyNotes.forEach((freq, nIdx) => {
      const rIdx = nIdx % rhythmPattern.length;
      pad(freq, beat * 0.5, startTime + rhythmPattern[rIdx]);
    });
  }
    scheduleBar();
  }

  { 
function stopMusic() {
    if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
  }

  /* ================== API pública ================== */

  return {
    unlock,
    tapX:   (ok) => sfxOn && unlocked && SFX.tapX(ok),
    tapO:   () => sfxOn && unlocked && SFX.tapO(),
    msg:    () => sfxOn && unlocked && SFX.msg(),
    emoji:  () => sfxOn && unlocked && SFX.emoji(),
    draw:   () => sfxOn && unlocked && SFX.draw(),
    fanfare:() => sfxOn && unlocked && SFX.fanfare(),
    toggleMusic() {
      musicOn = !musicOn;
      if (musicOn) startMusic(); else stopMusic();
      return musicOn;
    },
    toggleSfx() { sfxOn = !sfxOn; return sfxOn; },
    get musicOn() { return musicOn; },
    get sfxOn() { return sfxOn; },
    unlockNow: unlock
  };
})();

// Exposición global para index.html / app.js
window.AudioEngine = AudioEngine;

// Desbloqueo de audio: primer gesto del usuario
["pointerdown", "touchstart", "keydown"].forEach((e) =>
  window.addEventListener(e, () => AudioEngine.unlock(), { once: true })
);

export default AudioEngine;