'use strict';
/* Musiques d'ambiance : le MJ choisit une piste, elle joue chez tout le monde.
   Les morceaux sont composés et joués en direct par le navigateur (Web Audio) : aucun fichier à télécharger. */

const PISTES = [
  { id: 'taverne', nom: 'Taverne', icone: '🍺', desc: 'Gigue joyeuse, luth et tambourin' },
  { id: 'voyage', nom: 'Voyage', icone: '🧭', desc: 'Route, harpe et flûte' },
  { id: 'foret', nom: 'Forêt enchantée', icone: '🌲', desc: 'Vent, oiseaux, notes de harpe' },
  { id: 'feu', nom: 'Feu de camp', icone: '🔥', desc: 'Guitare douce et crépitements' },
  { id: 'donjon', nom: 'Donjon', icone: '🕯️', desc: 'Bourdon grave, gouttes d\'eau' },
  { id: 'mystere', nom: 'Mystère', icone: '🔮', desc: 'Énigme, magie, tension légère' },
  { id: 'combat', nom: 'Combat', icone: '⚔️', desc: 'Tambours et cuivres rapides' },
  { id: 'boss', nom: 'Boss', icone: '🐉', desc: 'Chœurs et taikos menaçants' },
  { id: 'victoire', nom: 'Victoire', icone: '🏆', desc: 'Fanfare triomphale' },
  { id: 'tristesse', nom: 'Deuil', icone: '🥀', desc: 'Piano lent et cordes' },
  { id: 'orage', nom: 'Orage', icone: '⛈️', desc: 'Pluie, vent et tonnerre' },
];

const Musique = (() => {
  const mf = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (l) => l[Math.floor(Math.random() * l.length)];
  let ctx = null;
  let master = null;
  let verb = null;
  let noiseBuf = null;
  let cur = null; // piste en cours
  let timer = null;
  let volGlobal = 0.7; // choisi par le MJ
  let volLocal = 0.8; // réglage de cet appareil
  let muet = false;

  function audio() {
    if (ctx) return ctx;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(comp).connect(ctx.destination);
    // réverbération : réponse impulsionnelle de bruit qui s'éteint
    verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.8);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    verb.buffer = ir;
    verb.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    applyVolume();
    return ctx;
  }
  function applyVolume() {
    if (master) master.gain.setTargetAtTime(muet ? 0 : volGlobal * volLocal, ctx.currentTime, 0.15);
  }

  // ---------------------------------------------------------------- briques sonores
  function env(g, t, a, hold, d, v) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    if (hold) g.gain.setValueAtTime(v, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + d);
  }
  function out(tr, node, pan) {
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      node = p;
    }
    node.connect(tr.out);
  }
  function tone(tr, { t, f, fEnd = 0, fT = 0.08, d = 0.5, v = 0.2, type = 'triangle', a = 0.005, hold = 0, lp = 0, lpEnd = 0, q = 0.8, detune = 0, vib = 0, pan = 0 }) {
    const end = t + a + hold + d + 0.05;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t + fT);
    o.detune.value = detune;
    let node = o;
    if (vib) {
      const l = ctx.createOscillator();
      const lg = ctx.createGain();
      l.frequency.value = rnd(4.5, 5.5);
      lg.gain.value = vib;
      l.connect(lg).connect(o.frequency);
      l.start(t);
      l.stop(end);
    }
    if (lp) {
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.Q.value = q;
      fl.frequency.setValueAtTime(lp, t);
      if (lpEnd) fl.frequency.exponentialRampToValueAtTime(lpEnd, t + a + hold + d);
      node.connect(fl);
      node = fl;
    }
    const g = ctx.createGain();
    env(g, t, a, hold, d, v);
    node.connect(g);
    out(tr, g, pan);
    o.start(t);
    o.stop(end);
  }
  function noise(tr, { t, d = 0.2, v = 0.2, a = 0.002, type = 'bandpass', f = 1000, fEnd = 0, q = 1, pan = 0 }) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t);
    if (fEnd) fl.frequency.exponentialRampToValueAtTime(fEnd, t + a + d);
    const g = ctx.createGain();
    env(g, t, a, 0, d, v);
    s.connect(fl).connect(g);
    out(tr, g, pan);
    s.start(t, Math.random() * 1.5);
    s.stop(t + a + d + 0.05);
  }
  /** Bruit continu (vent, pluie, feu), avec éventuellement des rafales. */
  function bed(tr, { type = 'bandpass', f = 500, q = 1, v = 0.05, lfo = 0, depth = 0, gust = 0 }) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = v;
    if (lfo) {
      const l = ctx.createOscillator();
      const lg = ctx.createGain();
      l.frequency.value = lfo;
      lg.gain.value = depth;
      l.connect(lg).connect(fl.frequency);
      l.start();
      tr.nodes.push(l);
    }
    if (gust) {
      const l = ctx.createOscillator();
      const lg = ctx.createGain();
      l.frequency.value = gust;
      lg.gain.value = v * 0.7;
      l.connect(lg).connect(g.gain);
      l.start();
      tr.nodes.push(l);
    }
    s.connect(fl).connect(g).connect(tr.out);
    s.start();
    tr.nodes.push(s);
  }
  /** Bourdon tenu (notes graves continues). */
  function drone(tr, notes, v = 0.03, lp = 300) {
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = lp;
    const g = ctx.createGain();
    g.gain.value = v;
    fl.connect(g).connect(tr.out);
    for (const n of notes) {
      for (const dt of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mf(n);
        o.detune.value = dt;
        o.connect(fl);
        o.start();
        tr.nodes.push(o);
      }
    }
  }

  // ---------------------------------------------------------------- instruments
  const I = {
    luth: (tr, t, n, v = 0.15, d = 0.5, pan = 0) => {
      tone(tr, { t, f: mf(n), d, v, type: 'sawtooth', lp: mf(n) * 6, lpEnd: mf(n) * 1.2, pan });
      tone(tr, { t, f: mf(n), d: d * 0.7, v: v * 0.6, type: 'triangle', pan });
    },
    guitare: (tr, t, n, v = 0.13, d = 1.4, pan = 0) => {
      tone(tr, { t, f: mf(n), d, v, type: 'sawtooth', lp: mf(n) * 3, lpEnd: mf(n), pan });
      tone(tr, { t, f: mf(n), d, v: v * 0.7, type: 'triangle', pan });
    },
    harpe: (tr, t, n, v = 0.12, d = 1.8, pan = 0) => {
      tone(tr, { t, f: mf(n), d, v, type: 'triangle', pan });
      tone(tr, { t, f: mf(n) * 2, d: d * 0.35, v: v * 0.25, type: 'sine', pan });
    },
    piano: (tr, t, n, v = 0.15, d = 2.6) => {
      tone(tr, { t, f: mf(n), d, v, type: 'triangle', lp: 3200, lpEnd: 500 });
      tone(tr, { t, f: mf(n) * 2.002, d: d * 0.45, v: v * 0.3, type: 'sine' });
    },
    flute: (tr, t, n, dur, v = 0.08) => {
      tone(tr, { t, f: mf(n), a: 0.07, hold: dur * 0.7, d: dur * 0.5, v, type: 'sine', vib: mf(n) * 0.01 });
      tone(tr, { t, f: mf(n) * 2, a: 0.07, hold: dur * 0.7, d: dur * 0.4, v: v * 0.12, type: 'sine' });
      noise(tr, { t, d: 0.1, v: v * 0.3, f: mf(n) * 2, q: 4 });
    },
    nappe: (tr, t, notes, dur, v = 0.04, type = 'sawtooth', lp = 900) => {
      for (const n of notes) for (const dt of [-8, 8]) tone(tr, { t, f: mf(n), detune: dt, type, a: dur * 0.35, hold: dur * 0.35, d: dur * 0.6, v, lp });
    },
    choeur: (tr, t, notes, dur, v = 0.04) => {
      for (const n of notes) for (const dt of [-12, 0, 12]) tone(tr, { t, f: mf(n), detune: dt, type: 'sawtooth', a: dur * 0.3, hold: dur * 0.4, d: dur * 0.6, v: v * 0.6, lp: 1300, q: 3, vib: 2.5 });
    },
    cuivre: (tr, t, n, dur, v = 0.09, pan = 0) => {
      tone(tr, { t, f: mf(n), type: 'sawtooth', a: 0.04, hold: dur * 0.6, d: dur * 0.5, v, lp: mf(n) * 5, lpEnd: mf(n) * 2, vib: mf(n) * 0.005, pan });
      tone(tr, { t, f: mf(n), detune: 8, type: 'sawtooth', a: 0.05, hold: dur * 0.6, d: dur * 0.5, v: v * 0.6, lp: mf(n) * 4, pan });
    },
    basse: (tr, t, n, dur, v = 0.2, type = 'triangle') => tone(tr, { t, f: mf(n), type, a: 0.01, hold: dur * 0.5, d: dur * 0.6, v, lp: 700 }),
    cloche: (tr, t, n, v = 0.07, d = 3) => {
      for (const [k, g] of [[1, 1], [2.76, 0.4], [5.4, 0.18], [8.93, 0.07]]) tone(tr, { t, f: mf(n) * k, type: 'sine', d: d / Math.sqrt(k), v: v * g });
    },
    goutte: (tr, t, n, v = 0.05) => tone(tr, { t, f: mf(n), fEnd: mf(n) * 1.7, fT: 0.06, type: 'sine', d: 0.22, v, pan: rnd(-0.8, 0.8) }),
    grosseCaisse: (tr, t, v = 0.5) => tone(tr, { t, f: 130, fEnd: 42, fT: 0.12, type: 'sine', d: 0.42, v }),
    taiko: (tr, t, v = 0.6) => {
      tone(tr, { t, f: 100, fEnd: 48, fT: 0.25, type: 'sine', d: 1.0, v });
      noise(tr, { t, d: 0.25, v: v * 0.45, type: 'lowpass', f: 600 });
    },
    timbale: (tr, t, n, v = 0.4) => {
      tone(tr, { t, f: mf(n) * 1.05, fEnd: mf(n), fT: 0.05, type: 'sine', d: 1.2, v });
      noise(tr, { t, d: 0.1, v: v * 0.3, type: 'lowpass', f: 900 });
    },
    tambour: (tr, t, v = 0.3) => {
      tone(tr, { t, f: 190, fEnd: 95, fT: 0.07, type: 'sine', d: 0.22, v });
      noise(tr, { t, d: 0.06, v: v * 0.35, f: 600, q: 1 });
    },
    caisseClaire: (tr, t, v = 0.22) => {
      noise(tr, { t, d: 0.15, v, type: 'highpass', f: 1800 });
      tone(tr, { t, f: 210, fEnd: 150, fT: 0.04, type: 'triangle', d: 0.07, v: v * 0.6 });
    },
    charley: (tr, t, v = 0.06) => noise(tr, { t, d: 0.04, v, type: 'highpass', f: 8000 }),
    grelots: (tr, t, v = 0.06) => {
      for (let i = 0; i < 3; i++) noise(tr, { t: t + i * 0.014, d: 0.06, v, f: rnd(6000, 9000), q: 7, pan: 0.3 });
    },
    oiseau: (tr, t, v = 0.025) => {
      const f = rnd(2400, 4200);
      const pan = rnd(-0.9, 0.9);
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) tone(tr, { t: t + k * 0.1, f, fEnd: f * rnd(1.2, 1.6), fT: 0.05, type: 'sine', a: 0.01, d: 0.06, v, pan });
    },
    craquement: (tr, t, v = 0.1) => noise(tr, { t, d: rnd(0.01, 0.04), v, f: rnd(1200, 4500), q: 2, pan: rnd(-0.5, 0.5) }),
    tonnerre: (tr, t, v = 0.55) => {
      noise(tr, { t, a: 0.03, d: rnd(0.4, 0.8), v: v * 0.6, type: 'lowpass', f: 1500, fEnd: 200 });
      noise(tr, { t: t + 0.1, a: 0.2, d: rnd(3.5, 6), v, type: 'lowpass', f: 320, fEnd: 70 });
    },
  };

  // ---------------------------------------------------------------- les morceaux
  // Chaque piste : tempo (bpm), pas par temps (spb), réverbération, mise en place (init) et play(tr, pas, heure).
  const _ = null;
  const D = {
    taverne: {
      bpm: 112, spb: 3, reverb: 0.25,
      play(tr, s, t) {
        const M = [62, 66, 69, 74, 73, 71, 71, 67, 71, 74, 71, 67, 69, 66, 69, 74, 76, 78, 76, 73, 69, 73, 76, 73,
          74, 69, 66, 69, 74, 78, 79, 78, 76, 74, 71, 67, 69, 73, 76, 73, 71, 69, 74, 69, 66, 62, _, _];
        const CH = [[38, 62, 66, 69], [43, 62, 67, 71], [38, 62, 66, 69], [45, 61, 64, 69], [38, 62, 66, 69], [43, 62, 67, 71], [45, 61, 64, 67], [38, 62, 66, 69]];
        const i = s % 48;
        const k = i % 6;
        const ch = CH[Math.floor(i / 6)];
        const loop = Math.floor(s / 48);
        if (M[i]) I.luth(tr, t, M[i], 0.14, 0.45, 0.15);
        if (M[i] && loop % 2 === 1 && k % 3 === 0) I.flute(tr, t, M[i] + 12, tr.d * 2.6, 0.045);
        if (k === 0) I.basse(tr, t, ch[0], tr.d * 2.5);
        if (k === 3) I.basse(tr, t, ch[0] + 7, tr.d * 2.5, 0.16);
        if (k === 1 || k === 4) ch.slice(1).forEach((n, j) => I.luth(tr, t + j * 0.012, n - 12, 0.045, 0.3, -0.3));
        I.tambour(tr, t, k === 0 ? 0.34 : k === 3 ? 0.28 : 0.08);
        if (k === 3 || (loop > 0 && k === 5)) I.grelots(tr, t);
      },
    },
    voyage: {
      bpm: 84, spb: 4, reverb: 0.5,
      play(tr, s, t) {
        const CH = [[38, 57, 62, 65, 69], [36, 55, 60, 64, 67], [34, 53, 58, 62, 65], [36, 55, 60, 64, 67]];
        const FL = [69, _, 72, 74, 72, _, 69, _, 67, _, 64, 67, 69, _, _, _, 65, _, 67, 69, 70, _, 69, 67, 67, _, 64, 62, 64, _, _, _];
        const i = s % 128;
        const bar = Math.floor(i / 16);
        const k = i % 16;
        const ch = CH[Math.floor(bar / 2)];
        const loop = Math.floor(s / 128);
        if (i % 32 === 0) I.nappe(tr, t, ch.slice(1, 4), tr.d * 32, 0.022, 'sawtooth', 800);
        if (k % 2 === 0) {
          const arp = [1, 2, 3, 4, 3, 2, 1, 2][k / 2];
          I.harpe(tr, t, ch[arp] + (k === 8 ? 12 : 0), 0.08, 1.6, Math.sin(s / 5) * 0.5);
        }
        if (k === 0 || k === 8) I.basse(tr, t, ch[0], tr.d * 7, 0.16);
        if (k === 0 || k === 8) I.tambour(tr, t, 0.14);
        if (k === 12 && Math.random() < 0.5) I.tambour(tr, t, 0.07);
        if (loop % 2 === 1 && k % 4 === 0) {
          const n = FL[(i / 4) % 32];
          if (n) I.flute(tr, t, n, tr.d * 4.5, 0.07);
        }
      },
    },
    foret: {
      bpm: 70, spb: 4, reverb: 0.7,
      init(tr) { bed(tr, { f: 700, q: 0.6, v: 0.02, lfo: 0.07, depth: 350, gust: 0.05 }); },
      play(tr, s, t) {
        const CH = [[45, 57, 60, 64], [41, 57, 60, 65], [48, 55, 60, 64], [43, 55, 59, 62]];
        const PENTA = [69, 72, 74, 76, 79, 81, 84];
        const i = s % 128;
        const ch = CH[Math.floor(i / 32)];
        if (i % 32 === 0) {
          I.nappe(tr, t, ch.slice(1), tr.d * 32, 0.03, 'triangle', 1600);
          I.basse(tr, t, ch[0], tr.d * 24, 0.1, 'sine');
        }
        if (s % 2 === 0 && Math.random() < 0.3) I.harpe(tr, t, pick(PENTA), 0.06, 2.2, rnd(-0.6, 0.6));
        if (s % 32 === 16 && Math.random() < 0.7) {
          let n = pick(PENTA.slice(0, 5));
          for (let j = 0; j < 3; j++) { I.flute(tr, t + j * tr.d * 3, n, tr.d * 3.5, 0.05); n = pick(PENTA.slice(0, 5)); }
        }
        if (Math.random() < 0.035) I.oiseau(tr, t + rnd(0, tr.d));
      },
    },
    feu: {
      bpm: 78, spb: 4, reverb: 0.3,
      init(tr) { bed(tr, { type: 'lowpass', f: 380, q: 0.5, v: 0.03, gust: 0.3 }); },
      play(tr, s, t) {
        const CH = [[43, 55, 59, 62, 67], [40, 52, 55, 59, 64], [36, 52, 55, 60, 64], [38, 50, 54, 57, 62]];
        const PAT = { 0: 0, 2: 3, 4: 2, 6: 3, 8: 1, 10: 3, 12: 2, 14: 4 };
        const i = s % 64;
        const k = i % 16;
        const ch = CH[Math.floor(i / 16)];
        if (PAT[k] !== undefined) I.guitare(tr, t, ch[PAT[k]] + (PAT[k] === 0 ? 0 : 12), PAT[k] === 0 ? 0.14 : 0.08, 1.5, PAT[k] ? 0.2 : -0.1);
        if (Math.floor(s / 64) % 2 === 1 && k === 0) I.harpe(tr, t + tr.d * 2, ch[4] + 12, 0.05, 2.5);
        if (Math.random() < 0.55) I.craquement(tr, t + rnd(0, tr.d), rnd(0.04, 0.14));
      },
    },
    donjon: {
      bpm: 60, spb: 4, reverb: 0.9,
      init(tr) {
        drone(tr, [38, 45], 0.035, 260);
        bed(tr, { f: 300, q: 0.7, v: 0.018, lfo: 0.06, depth: 150, gust: 0.04 });
      },
      play(tr, s, t) {
        const i = s % 128;
        if (Math.random() < 0.06) I.goutte(tr, t + rnd(0, tr.d), Math.floor(rnd(82, 96)));
        if (i % 64 === 0) I.cloche(tr, t, 50, 0.07, 5);
        if (i === 0) I.nappe(tr, t, [50, 53, 57], tr.d * 64, 0.022, 'sawtooth', 600);
        if (i === 64) I.nappe(tr, t, [51, 55, 58], tr.d * 64, 0.022, 'sawtooth', 600);
        if (i === 96 || i === 100) I.taiko(tr, t, 0.16);
      },
    },
    mystere: {
      bpm: 70, spb: 4, reverb: 0.8,
      init(tr) { bed(tr, { f: 1800, q: 6, v: 0.006, lfo: 0.05, depth: 900 }); },
      play(tr, s, t) {
        const CH = [[45, 57, 60, 64, 71], [44, 56, 60, 63, 68], [41, 53, 57, 60, 64], [40, 52, 56, 59, 64]];
        const i = s % 128;
        const ch = CH[Math.floor(i / 32)];
        if (i % 32 === 0) {
          I.nappe(tr, t, ch.slice(1, 4), tr.d * 32, 0.03, 'triangle', 1200);
          I.basse(tr, t, ch[0], tr.d * 28, 0.12, 'sine');
        }
        if (i % 64 === 0) I.taiko(tr, t, 0.22);
        if (s % 3 === 0 && Math.random() < 0.75) I.cloche(tr, t, pick(ch.slice(1)) + 24, 0.03, 1.8);
      },
    },
    combat: {
      bpm: 150, spb: 4, reverb: 0.3,
      play(tr, s, t) {
        const R = [38, 34, 36, 33];
        const CH = [[62, 65, 69], [62, 65, 70], [64, 67, 72], [64, 69, 73]];
        const MEL = [62, 65, 69, 67, 65, 62, 65, 70, 67, 64, 67, 72, 69, _, 73, 76];
        const OST = [0, 0, 12, 0, 0, 12, 0, 12, 0, 0, 12, 0, 7, 12, 7, 12];
        const i = s % 64;
        const bar = Math.floor(i / 16);
        const k = i % 16;
        const loop = Math.floor(s / 64);
        I.luth(tr, t, R[bar] + OST[k], 0.09, 0.13, -0.2);
        if ([0, 6, 8, 10].includes(k)) I.grosseCaisse(tr, t, 0.5);
        if (k === 4 || k === 12) I.caisseClaire(tr, t, 0.22);
        if (k % 2 === 1) I.charley(tr, t, 0.04);
        if (k === 0 || k === 10) CH[bar].forEach((n) => I.cuivre(tr, t, n - 12, tr.d * 1.5, 0.045));
        if (k === 0) I.nappe(tr, t, CH[bar], tr.d * 16, 0.012, 'sawtooth', 1400);
        if (loop % 2 === 1 && k % 4 === 0 && MEL[bar * 4 + k / 4]) I.cuivre(tr, t, MEL[bar * 4 + k / 4], tr.d * 3.4, 0.07, 0.2);
        if (bar === 3 && k >= 12 && loop % 2 === 1) I.tambour(tr, t, 0.32);
      },
    },
    boss: {
      bpm: 96, spb: 4, reverb: 0.6,
      play(tr, s, t) {
        const CH = [[48, 55, 60, 63], [49, 56, 61, 65], [44, 56, 60, 63], [43, 55, 59, 62]];
        const MEL = [[72, 75], [73, 77], [75, 72], [74, 71]];
        const TK = { 0: 0.7, 3: 0.4, 6: 0.5, 8: 0.7, 11: 0.4, 14: 0.5 };
        const i = s % 64;
        const bar = Math.floor(i / 16);
        const k = i % 16;
        const ch = CH[bar];
        const loop = Math.floor(s / 64);
        if (TK[k]) I.taiko(tr, t, TK[k]);
        if (k % 2 === 0) tone(tr, { t, f: mf(ch[0] - 12), type: 'sawtooth', d: tr.d * 1.6, v: 0.12, lp: 420, lpEnd: 160 });
        if (k === 0) I.choeur(tr, t, ch.slice(1), tr.d * 16, 0.045);
        if (loop > 0 && (k === 0 || k === 8)) I.cuivre(tr, t, MEL[bar][k / 8], tr.d * 7, 0.065);
        if (i === 0) I.cloche(tr, t, 36, 0.09, 6);
        if (bar === 3 && k >= 12) I.caisseClaire(tr, t, 0.12 + (k - 12) * 0.05);
      },
    },
    victoire: {
      bpm: 112, spb: 4, reverb: 0.5,
      play(tr, s, t) {
        const FAN = { 0: [62, 3], 3: [62, 1], 4: [66, 4], 8: [69, 4], 12: [74, 4], 16: [71, 6], 22: [69, 2], 24: [67, 4], 28: [71, 4],
          32: [73, 3], 35: [73, 1], 36: [76, 4], 40: [73, 4], 44: [69, 4], 48: [74, 12] };
        const CH = [[38, 62, 66, 69], [43, 62, 67, 71], [45, 61, 64, 69], [38, 62, 66, 69]];
        const i = s % 64;
        const bar = Math.floor(i / 16);
        const k = i % 16;
        const ch = CH[bar];
        const loop = Math.floor(s / 64);
        const f = FAN[i];
        if (f) {
          I.cuivre(tr, t, f[0], tr.d * f[1] * 0.95, loop === 0 ? 0.09 : 0.06, 0.1);
          I.cuivre(tr, t, f[0] - (f[0] % 12 === 2 ? 5 : 3), tr.d * f[1] * 0.95, 0.04, -0.2);
        }
        if (k === 0) { I.nappe(tr, t, ch.slice(1), tr.d * 16, 0.02, 'sawtooth', 1500); I.basse(tr, t, ch[0], tr.d * 14, 0.16); }
        if (k === 0 || k === 8) I.timbale(tr, t, ch[0], 0.35);
        if (k === 4 || k === 12) I.caisseClaire(tr, t, 0.14);
        if (bar === 3 && k >= 8) I.caisseClaire(tr, t, 0.05 + (k - 8) * 0.02);
        if (loop > 0 && k % 2 === 0) I.harpe(tr, t, ch[1 + (k / 2) % 3] + 12, 0.04, 1.2);
      },
    },
    tristesse: {
      bpm: 58, spb: 4, reverb: 0.8,
      play(tr, s, t) {
        const CH = [[45, 57, 60, 64], [41, 57, 60, 65], [48, 55, 60, 64], [40, 56, 59, 64]];
        const MEL = [[[0, 76], [8, 74]], [[0, 72], [8, 69]], [[0, 67], [8, 72]], [[0, 71], [12, 68]]];
        const i = s % 64;
        const bar = Math.floor(i / 16);
        const k = i % 16;
        const ch = CH[bar];
        const loop = Math.floor(s / 64);
        if (k === 0) { I.piano(tr, t, ch[0], 0.14, 3.5); I.nappe(tr, t, ch.slice(1), tr.d * 16, 0.016, 'sawtooth', 700); }
        if (k === 4) I.piano(tr, t, ch[1], 0.08);
        if (k === 8) I.piano(tr, t, ch[2], 0.08);
        if (k === 12) I.piano(tr, t, ch[3], 0.08);
        if (loop % 2 === 1) for (const [st, n] of MEL[bar]) if (st === k) I.piano(tr, t, n, 0.12, 3);
      },
    },
    orage: {
      bpm: 60, spb: 4, reverb: 0.4,
      init(tr) {
        bed(tr, { f: 3200, q: 0.3, v: 0.05 });
        bed(tr, { type: 'lowpass', f: 900, q: 0.4, v: 0.04 });
        bed(tr, { f: 500, q: 0.8, v: 0.03, lfo: 0.08, depth: 300, gust: 0.06 });
        drone(tr, [33, 40], 0.018, 200);
      },
      play(tr, s, t) {
        if (s === 10 || (s > 30 && Math.random() < 0.012)) I.tonnerre(tr, t, rnd(0.35, 0.65));
      },
    },
  };

  // ---------------------------------------------------------------- lecture
  function tick() {
    if (!cur || !ctx || !cur.def) return;
    const ahead = document.hidden ? 1.6 : 0.3; // en arrière-plan, le navigateur ralentit les minuteries
    while (cur.next < ctx.currentTime + ahead) {
      try { cur.def.play(cur, cur.s, cur.next); } catch { /* note ignorée */ }
      cur.s++;
      cur.next += cur.d;
    }
  }
  function stopTrack(tr, fade = 1.5) {
    if (!tr) return;
    const now = ctx.currentTime;
    tr.out.gain.cancelScheduledValues(now);
    tr.out.gain.setValueAtTime(tr.out.gain.value, now);
    tr.out.gain.linearRampToValueAtTime(0, now + fade);
    setTimeout(() => {
      if (tr.file) { tr.file.pause(); tr.file.removeAttribute('src'); tr.file.load(); }
      for (const n of tr.nodes) { try { n.stop(); } catch { /* déjà arrêté */ } }
      tr.out.disconnect();
    }, fade * 1000 + 3000);
  }
  /** Musique importée par le MJ (fichier audio joué en boucle, avec fondu). */
  function playFile(id, url) {
    if (cur && cur.id === id) return;
    audio();
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    stopTrack(cur);
    const a = new Audio();
    a.loop = true;
    a.preload = 'auto';
    a.src = url;
    const tr = { id, file: a, nodes: [] };
    tr.out = ctx.createGain();
    tr.out.gain.setValueAtTime(0, ctx.currentTime);
    tr.out.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.5);
    ctx.createMediaElementSource(a).connect(tr.out);
    tr.out.connect(master);
    a.play().catch(() => { /* attend un clic (voir unlock) */ });
    cur = tr;
    clearInterval(timer);
    timer = null;
  }
  function play(id, url) {
    if (url) return playFile(id, url);
    const def = D[id];
    if (!def) return stop();
    if (cur && cur.id === id) return;
    audio();
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    stopTrack(cur);
    const tr = { id, def, nodes: [], s: 0, d: 60 / def.bpm / def.spb, next: ctx.currentTime + 0.15 };
    tr.out = ctx.createGain();
    tr.out.gain.setValueAtTime(0, ctx.currentTime);
    tr.out.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    tr.out.connect(master);
    const send = ctx.createGain();
    send.gain.value = def.reverb || 0.3;
    tr.out.connect(send).connect(verb);
    if (def.init) def.init(tr);
    cur = tr;
    if (!timer) timer = setInterval(tick, 50);
    tick();
  }
  function stop() {
    if (!cur) return;
    stopTrack(cur, 2);
    cur = null;
    clearInterval(timer);
    timer = null;
  }

  return {
    play,
    stop,
    current: () => (cur ? cur.id : null),
    blocked: () => !!(ctx && cur && (ctx.state !== 'running' || (cur.file && cur.file.paused))),
    unlock: () => {
      if (cur && cur.file && cur.file.paused) cur.file.play().catch(() => {});
      return ctx && ctx.state !== 'running' ? ctx.resume() : Promise.resolve();
    },
    setGlobal(v) { volGlobal = v; applyVolume(); },
    setLocal(v, m) { volLocal = v; muet = m; applyVolume(); },
  };
})();

// ------------------------------------------------------------------ interface
const MUSIC_KEY = 'taverne-musique';
const musicOpts = (() => { try { return { volume: 0.8, muet: false, ...JSON.parse(localStorage.getItem(MUSIC_KEY)) }; } catch { return { volume: 0.8, muet: false }; } })();
const saveMusicOpts = () => { try { localStorage.setItem(MUSIC_KEY, JSON.stringify(musicOpts)); } catch { /* ignoré */ } };
Musique.setLocal(musicOpts.volume, musicOpts.muet);

$('#music-vol').value = Math.round(musicOpts.volume * 100);
$('#music-vol').addEventListener('input', (ev) => {
  musicOpts.volume = ev.target.value / 100;
  musicOpts.muet = false;
  Musique.setLocal(musicOpts.volume, false);
  saveMusicOpts();
  renderMusicBar();
});
$('#music-mute').addEventListener('click', () => {
  musicOpts.muet = !musicOpts.muet;
  Musique.setLocal(musicOpts.volume, musicOpts.muet);
  saveMusicOpts();
  renderMusicBar();
});
$('#music-unlock').addEventListener('click', () => Musique.unlock().then(renderMusicBar));
// Le navigateur n'autorise le son qu'après un clic : on débloque au premier geste.
for (const evt of ['pointerdown', 'keydown']) {
  document.addEventListener(evt, () => { if (Musique.blocked()) Musique.unlock().then(renderMusicBar); }, true);
}

function renderMusicBar() {
  const id = Musique.current();
  const perso = id && id.startsWith('f:') ? ((S && S.musiquesPerso) || []).find((x) => 'f:' + x.id === id) : null;
  const p = perso ? { icone: perso.icone, nom: perso.nom } : PISTES.find((x) => x.id === id);
  $('#music-now').hidden = !p;
  if (p) $('#music-name').textContent = `${p.icone} ${p.nom}`;
  $('#music-mute').textContent = musicOpts.muet ? '🔇' : '🔊';
  $('#music-mute').title = musicOpts.muet ? 'Réactiver la musique sur cet appareil' : 'Couper la musique sur cet appareil';
  $('#music-unlock').hidden = !Musique.blocked();
}

// Panneau du MJ : une carte par piste
$('#music-grid').append(...PISTES.map((p) => el('button', {
  type: 'button', class: 'music-card', 'data-piste': p.id, title: p.desc,
  onclick: () => socket.emit(S && S.musique && S.musique.piste === p.id ? 'musique:stop' : 'musique:jouer', { piste: p.id }),
}, el('span', { class: 'music-ico', text: p.icone }), el('strong', { text: p.nom }), el('span', { class: 'muted tiny', text: p.desc }))));
$('#music-stop').addEventListener('click', () => socket.emit('musique:stop'));
let volSendTimer = null;
$('#music-global').addEventListener('input', (ev) => {
  const v = ev.target.value / 100;
  Musique.setGlobal(v);
  clearTimeout(volSendTimer);
  volSendTimer = setTimeout(() => socket.emit('musique:volume', { volume: v }), 120);
});

function syncMusic() {
  const m = (S && S.musique) || { piste: null, volume: 0.7 };
  if (document.activeElement !== $('#music-global')) Musique.setGlobal(m.volume);
  const perso = m.piste && m.piste.startsWith('f:') ? ((S && S.musiquesPerso) || []).find((x) => 'f:' + x.id === m.piste) : null;
  if (perso) Musique.play(m.piste, '/musiques/' + encodeURIComponent(perso.fichier));
  else if (m.piste && !m.piste.startsWith('f:')) Musique.play(m.piste);
  else Musique.stop();
  if (me.role === 'mj') renderMesMusiques();
  if (document.activeElement !== $('#music-global')) $('#music-global').value = Math.round(m.volume * 100);
  $$('#music-grid .music-card').forEach((b) => b.classList.toggle('active', b.dataset.piste === m.piste));
  $('#music-stop').disabled = !m.piste;
  renderMusicBar();
  setTimeout(renderMusicBar, 400); // le blocage du son par le navigateur n'est connu qu'après un instant
}
socket.on('state', syncMusic);
if (S) syncMusic();

// ------------------------------------------------------------------ musiques importées par le MJ
const SON_TYPES = { mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', webm: 'audio/webm', flac: 'audio/flac' };
const ICONES_PERSO = ['🎵', '🍺', '⚔️', '🐉', '🌲', '🔥', '🕯️', '🔮', '🏰', '🌊', '👑', '💀', '🥀', '⛈️', '🌙', '😈'];

function renderMesMusiques() {
  const list = (S && S.musiquesPerso) || [];
  const now = S && S.musique && S.musique.piste;
  $('#music-perso-empty').hidden = list.length > 0;
  $('#music-perso').replaceChildren(...list.map((m) => {
    const id = 'f:' + m.id;
    return el('div', { class: 'music-card perso' + (now === id ? ' active' : ''), 'data-piste': id },
      el('button', { type: 'button', class: 'music-ico-btn', title: "Changer l'icône", onclick: () => {
        const i = (ICONES_PERSO.indexOf(m.icone) + 1) % ICONES_PERSO.length;
        socket.emit('musique:renommer', { id: m.id, icone: ICONES_PERSO[i] });
      } }, m.icone),
      el('button', { type: 'button', class: 'music-play grow', title: now === id ? 'Arrêter' : 'Lancer chez tout le monde',
        onclick: () => socket.emit(now === id ? 'musique:stop' : 'musique:jouer', { piste: id }) },
        el('strong', { text: m.nom }), el('span', { class: 'muted tiny', text: now === id ? '▶ en cours' : 'fichier importé' })),
      el('button', { type: 'button', class: 'tiny-btn', title: 'Renommer', onclick: () => {
        const nom = prompt('Nom de la musique :', m.nom);
        if (nom && nom.trim()) socket.emit('musique:renommer', { id: m.id, nom: nom.trim() });
      } }, '✏'),
      el('button', { type: 'button', class: 'tiny-btn', title: 'Supprimer', onclick: () => {
        if (confirm(`Supprimer « ${m.nom} » de la bibliothèque ?`)) socket.emit('musique:supprimer', { id: m.id });
      } }, '🗑'));
  }));
}

async function importerMusiques(files) {
  const st = $('#music-upload-status');
  let n = 0;
  for (const file of files) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const type = SON_TYPES[ext] || file.type;
    if (!type || !type.startsWith('audio/')) { toast(`${file.name} : ce n'est pas un fichier audio.`); continue; }
    st.hidden = false;
    st.textContent = `⏳ Envoi de « ${file.name} » (${(file.size / 1048576).toFixed(1)} Mo)…`;
    try {
      const res = await fetch('/api/musique', {
        method: 'POST', body: file,
        headers: { 'content-type': type, 'x-mj-password': (session && session.password) || '', 'x-nom': encodeURIComponent(file.name) },
      });
      const r = await res.json().catch(() => ({ ok: false, error: 'Réponse illisible du serveur.' }));
      if (!r.ok) toast(`${file.name} : ${r.error}`);
      else n++;
    } catch {
      toast(`${file.name} : envoi impossible (fichier trop lourd ou connexion coupée).`);
    }
  }
  st.hidden = true;
  if (n) toast(n > 1 ? `${n} musiques ajoutées.` : 'Musique ajoutée.');
}
$('#music-file').addEventListener('change', (ev) => { importerMusiques([...ev.target.files]); ev.target.value = ''; });
// glisser-déposer des fichiers sur le panneau
const musicDrop = $('#music-drop');
musicDrop.addEventListener('dragover', (ev) => { ev.preventDefault(); musicDrop.classList.add('over'); });
musicDrop.addEventListener('dragleave', () => musicDrop.classList.remove('over'));
musicDrop.addEventListener('drop', (ev) => { ev.preventDefault(); musicDrop.classList.remove('over'); importerMusiques([...ev.dataTransfer.files]); });
