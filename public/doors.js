'use strict';
/* Portes : clic pour ouvrir ou fermer (le MJ partout, un joueur à côté de son pion), clic droit du MJ pour verrouiller. */

const Portes = (() => {
  const layer = $('#door-layer');

  function render() {
    const sc = S && S.scene;
    if (!sc || !sc.id) { layer.replaceChildren(); return; }
    const cell = sc.cellule;
    const b = sc.brouillard;
    const fogVu = b && b.actif && b.rle ? (() => { const a = new Uint8Array(b.cols * b.rows); let i = 0; let v = 0; for (const n of b.rle) { if (v) a.fill(1, i, i + n); i += n; v ^= 1; } return a; })() : null;
    const seen = new Set();
    for (const [k, v] of Object.entries(sc.deco)) {
      if (v !== PORTE) continue;
      const [c, r] = k.split(',').map(Number);
      // les joueurs ne peuvent pas toucher une porte cachée dans le brouillard
      if (me.role !== 'mj' && fogVu && !fogVu[c + r * b.cols]) continue;
      seen.add(k);
      let d = layer.querySelector(`[data-k="${k}"]`);
      if (!d) {
        d = el('button', { type: 'button', class: 'door-btn', 'data-k': k });
        d.addEventListener('click', (ev) => { ev.stopPropagation(); basculer(c, r); });
        d.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (me.role === 'mj') socket.emit('porte:verrou', { c, r });
        });
        layer.append(d);
      }
      d.style.left = ((c * cell) / imgSize.w) * 100 + '%';
      d.style.top = ((r * cell) / imgSize.h) * 100 + '%';
      d.style.width = (cell / imgSize.w) * 100 + '%';
      d.style.height = (cell / imgSize.h) * 100 + '%';
      const etat = (sc.portes && sc.portes[k]) || 'f';
      d.dataset.etat = etat;
      d.title = (etat === 'o' ? 'Porte ouverte — clic pour la fermer' : etat === 'v' ? 'Porte verrouillée' : 'Porte fermée — clic pour l\'ouvrir')
        + (me.role === 'mj' ? (etat === 'v' ? ' · clic droit : déverrouiller' : ' · clic droit : verrouiller') : '');
    }
    for (const d of [...layer.children]) if (!seen.has(d.dataset.k)) d.remove();
  }

  function basculer(c, r) {
    socket.emit('porte:basculer', { c, r }, (res) => { if (res && !res.ok) toast(res.error); });
  }

  // ---------------------------------------------------------------- sons (grincement, claquement, verrou)
  let ac = null;
  function son(type) {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const t0 = ac.currentTime + 0.02;
      const out = ac.createGain();
      out.gain.value = 0.35;
      out.connect(ac.destination);
      const bruit = (dur) => {
        const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = ac.createBufferSource();
        src.buffer = buf;
        return src;
      };
      const choc = (t, f, v, dur = 0.12) => {
        const n = bruit(dur);
        const bp = ac.createBiquadFilter();
        bp.type = 'lowpass'; bp.frequency.value = f;
        const g = ac.createGain();
        g.gain.setValueAtTime(v, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        n.connect(bp).connect(g).connect(out);
        n.start(t); n.stop(t + dur);
      };
      if (type === 'ouvre' || type === 'ferme') {
        // grincement : oscillateur rugueux qui glisse, filtré
        const dur = type === 'ouvre' ? 0.9 : 0.45;
        const o = ac.createOscillator();
        o.type = 'sawtooth';
        const f0 = type === 'ouvre' ? 220 : 340;
        o.frequency.setValueAtTime(f0, t0);
        o.frequency.linearRampToValueAtTime(f0 * 1.45, t0 + dur * 0.4);
        o.frequency.linearRampToValueAtTime(f0 * 0.9, t0 + dur);
        const lfo = ac.createOscillator();
        lfo.frequency.value = 38;
        const lg = ac.createGain();
        lg.gain.value = 30;
        lfo.connect(lg).connect(o.frequency);
        const bp = ac.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 3;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(bp).connect(g).connect(out);
        o.start(t0); lfo.start(t0); o.stop(t0 + dur); lfo.stop(t0 + dur);
        if (type === 'ferme') choc(t0 + dur * 0.9, 300, 0.9, 0.25); // le battant claque
      } else {
        // verrou : deux cliquetis métalliques
        for (const [dt, f] of [[0, 3500], [0.09, 2400]]) {
          const o = ac.createOscillator();
          o.type = 'square'; o.frequency.value = f;
          const g = ac.createGain();
          g.gain.setValueAtTime(0.12, t0 + dt);
          g.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 0.05);
          o.connect(g).connect(out);
          o.start(t0 + dt); o.stop(t0 + dt + 0.06);
          choc(t0 + dt, 5000, 0.5, 0.04);
        }
      }
    } catch { /* pas de son */ }
  }
  socket.on('porte:son', ({ son: s } = {}) => son(s));

  socket.on('state', render);
  socket.on('map:patch', () => setTimeout(render, 0));
  return { render };
})();
