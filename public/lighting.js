'use strict';
/* Éclairage dynamique : obscurité sur la carte, sources de lumière (posées par le MJ, portées par les pions, feux du décor),
   ombres des murs (lancer de rayons case par case), vision dans le noir. */

const LUM = {
  bougie: { nom: 'Bougie', ico: '🕯️', r: 1, d: 2, col: [255, 190, 110], fl: 0.18 },
  torche: { nom: 'Torche', ico: '🔥', r: 4, d: 8, col: [255, 160, 70], fl: 0.12 },
  lanterne: { nom: 'Lanterne', ico: '🏮', r: 6, d: 12, col: [255, 205, 130], fl: 0.04 },
  feu: { nom: 'Feu de camp', ico: '🔥', r: 4, d: 8, col: [255, 120, 40], fl: 0.16 },
  magique: { nom: 'Sort de lumière', ico: '✨', r: 4, d: 8, col: [235, 240, 255], fl: 0 },
  arcane: { nom: 'Lueur arcanique', ico: '🔮', r: 3, d: 6, col: [150, 120, 255], fl: 0, pulse: true },
  infernale: { nom: 'Flammes infernales', ico: '😈', r: 3, d: 6, col: [255, 60, 40], fl: 0.1 },
  feerique: { nom: 'Lueur féerique', ico: '🧚', r: 2, d: 4, col: [110, 255, 170], fl: 0, pulse: true },
  lune: { nom: 'Clair de lune', ico: '🌙', r: 8, d: 16, col: [170, 195, 255], fl: 0 },
};
const AMBIANCES = [['☀️ Jour', 0], ['🌅 Crépuscule', 0.45], ['🌙 Nuit', 0.8], ['🌑 Ténèbres', 0.97]];
const DECO_LUM = { '🔥': 'feu', '🕯️': 'bougie', '🪔': 'bougie', '🏮': 'lanterne', '🔮': 'arcane', '🌀': 'arcane' };
/** Sols qui luisent faiblement dans le noir. */
const SOL_LUM = { lave: [255, 90, 30], acide: [140, 255, 60] };

const Lumiere = (() => {
  const dark = $('#map-light');
  const tint = $('#map-tint');
  let walls = null; // { cols, rows, g: Uint8Array, v: version }
  let wallsKey = '';
  const polyCache = new Map();
  let placing = null;
  let apercuJoueur = false;
  let raf = 0;
  let lastFrame = 0;

  const ecl = () => (S && S.scene && S.scene.id && S.scene.eclairage) || null;
  const actif = () => { const e = ecl(); return !!(e && e.actif); };

  // ---------------------------------------------------------------- murs
  function buildWalls() {
    const sc = S.scene;
    const { cols, rows } = mapGrid();
    const key = [sc.id, cols, rows, sc.fond, Object.keys(sc.sol).length, JSON.stringify(sc.sol).length, JSON.stringify(sc.portes || {}), Object.values(sc.deco).filter((v) => v === PORTE).length].join('|');
    if (key === wallsKey && walls) return;
    wallsKey = key;
    const g = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const v = sc.sol[c + ',' + r] || sc.fond;
      if (MURS.has(v)) g[c + r * cols] = 1;
      else if (sc.deco[c + ',' + r] === PORTE && !(sc.portes && sc.portes[c + ',' + r] === 'o')) g[c + r * cols] = 1; // porte fermée
    }
    walls = { cols, rows, g, v: (walls ? walls.v : 0) + 1 };
    polyCache.clear();
  }
  const isWall = (c, r) => c >= 0 && r >= 0 && c < walls.cols && r < walls.rows && walls.g[c + r * walls.cols] === 1;

  /** Zone éclairée par une lumière en (cx, cy), en cases : polygone obtenu en lançant des rayons jusqu'au premier mur. */
  function visibility(cx, cy, R) {
    const key = `${cx.toFixed(2)},${cy.toFixed(2)},${R.toFixed(1)},${walls.v}`;
    const hit = polyCache.get(key);
    if (hit) return hit;
    const n = Math.max(120, Math.min(720, Math.round(R * 45)));
    const pts = new Float32Array(n * 2);
    const c0 = Math.floor(cx); const r0 = Math.floor(cy);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const dx = Math.cos(a) || 1e-9; const dy = Math.sin(a) || 1e-9;
      let mx = c0; let my = r0;
      const ddx = Math.abs(1 / dx); const ddy = Math.abs(1 / dy);
      const sx = dx < 0 ? -1 : 1; const sy = dy < 0 ? -1 : 1;
      let sdx = (dx < 0 ? cx - mx : mx + 1 - cx) * ddx;
      let sdy = (dy < 0 ? cy - my : my + 1 - cy) * ddy;
      let dist = R;
      for (let guard = 0; guard < 400; guard++) {
        let d;
        if (sdx < sdy) { d = sdx; sdx += ddx; mx += sx; } else { d = sdy; sdy += ddy; my += sy; }
        if (d >= R) break;
        // la case de départ ne bloque pas (torche accrochée à un mur) ; la face du mur touché reste éclairée
        if ((mx !== c0 || my !== r0) && isWall(mx, my)) { dist = Math.min(R, d + 0.45); break; }
      }
      pts[i * 2] = cx + dx * dist;
      pts[i * 2 + 1] = cy + dy * dist;
    }
    if (polyCache.size > 400) polyCache.clear();
    polyCache.set(key, pts);
    return pts;
  }

  // ---------------------------------------------------------------- sources
  function tokenPos(t) {
    const e = tokenEls.get(t.id);
    const x = e ? parseFloat(e.style.left) : t.x;
    const y = e ? parseFloat(e.style.top) : t.y;
    return { x: Number.isFinite(x) ? x : t.x, y: Number.isFinite(y) ? y : t.y };
  }
  function sources(e) {
    const list = [];
    for (const l of e.lumieres) {
      const def = LUM[l.type] || LUM.torche;
      const r = l.rayon || def.r;
      list.push({ id: l.id, x: l.x, y: l.y, def, r, d: l.rayon ? r * 2 : def.d, ombres: true });
    }
    for (const t of Object.values(S.tokens)) {
      if (t.lumiere && LUM[t.lumiere]) {
        const p = tokenPos(t);
        const def = LUM[t.lumiere];
        list.push({ id: 't' + t.id, x: p.x, y: p.y, def, r: def.r, d: def.d, ombres: true });
      }
    }
    if (e.decor) {
      const cell = S.scene.cellule;
      for (const [k, v] of Object.entries(S.scene.deco)) {
        const tp = DECO_LUM[v];
        if (!tp) continue;
        const [c, r] = k.split(',').map(Number);
        list.push({ id: 'd' + k, x: ((c + 0.5) * cell / imgSize.w) * 100, y: ((r + 0.5) * cell / imgSize.h) * 100, def: LUM[tp], r: LUM[tp].r, d: LUM[tp].d, ombres: true });
      }
      let n = 0;
      for (const [k, v] of Object.entries(S.scene.sol)) {
        if (!SOL_LUM[v] || n++ > 300) continue;
        const [c, r] = k.split(',').map(Number);
        list.push({ id: 'l' + k, x: ((c + 0.5) * cell / imgSize.w) * 100, y: ((r + 0.5) * cell / imgSize.h) * 100,
          def: { col: SOL_LUM[v], fl: 0.08 }, r: 0.6, d: 1.6, ombres: false });
      }
    }
    return list;
  }

  // ---------------------------------------------------------------- rendu
  const noise = (t, seed) => Math.sin(t * 7.3 + seed) * 0.5 + Math.sin(t * 13.1 + seed * 2.1) * 0.3 + Math.sin(t * 23.7 + seed * 0.7) * 0.2;
  const seedOf = (id) => { let h = 3; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0; return (Math.abs(h) % 1000) / 37; };

  function frame(now) {
    raf = 0;
    const e = ecl();
    if (!e || !e.actif) { hide(); return; }
    draw(e, now / 1000);
    // on n'anime que si quelque chose vacille ou bouge
    raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    if (document.hidden || now - lastFrame < 45) { raf = requestAnimationFrame(tick); return; }
    lastFrame = now;
    frame(now);
  }

  function hide() {
    dark.hidden = true;
    tint.hidden = true;
    document.body.classList.remove('eclairage-on');
  }

  function draw(e, t) {
    buildWalls();
    const W = imgSize.w; const H = imgSize.h;
    const k = Math.min(1, 1600 / Math.max(W, H));
    const cw = Math.round(W * k); const ch = Math.round(H * k);
    for (const cv of [dark, tint]) {
      if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
      cv.hidden = false;
    }
    document.body.classList.add('eclairage-on');
    const cell = S.scene.cellule;
    const px = cell * k; // une case en pixels du canvas
    const mj = me.role === 'mj' && !apercuJoueur;
    const nuit = mj ? Math.min(e.nuit, 0.55) : e.nuit;

    const dc = dark.getContext('2d');
    const tc = tint.getContext('2d');
    dc.globalCompositeOperation = 'source-over';
    dc.clearRect(0, 0, cw, ch);
    dc.fillStyle = `rgba(6, 8, 18, ${nuit})`;
    dc.fillRect(0, 0, cw, ch);
    tc.clearRect(0, 0, cw, ch);
    if (nuit <= 0.02) return;
    dc.globalCompositeOperation = 'destination-out';
    tc.globalCompositeOperation = 'lighter';

    const clipPoly = (ctx, s) => {
      if (!s.ombres || !e.murs) return;
      const pts = visibility((s.x / 100) * W / cell, (s.y / 100) * H / cell, s.d * 1.2);
      ctx.beginPath();
      ctx.moveTo(pts[0] * px, pts[1] * px);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * px, pts[i + 1] * px);
      ctx.closePath();
      ctx.clip();
    };
    const tintAmt = Math.min(1, nuit * 1.1);
    for (const s of sources(e)) {
      const sd = seedOf(s.id);
      let f = 1 + (s.def.fl || 0) * noise(t, sd);
      if (s.def.pulse) f *= 1 + 0.08 * Math.sin(t * 2 + sd);
      const x = (s.x / 100) * cw; const y = (s.y / 100) * ch;
      const rd = s.d * px * f; const rb = s.r * px * f;
      const ratio = Math.min(0.95, rb / rd);
      // trou dans l'obscurité
      dc.save();
      clipPoly(dc, s);
      const g = dc.createRadialGradient(x, y, 0, x, y, rd);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(ratio, 'rgba(0,0,0,0.92)');
      g.addColorStop(Math.min(0.99, ratio + (1 - ratio) * 0.55), 'rgba(0,0,0,0.45)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      dc.fillStyle = g;
      dc.fillRect(x - rd, y - rd, rd * 2, rd * 2);
      dc.restore();
      // halo coloré
      const [r, gg, b] = s.def.col;
      tc.save();
      clipPoly(tc, s);
      const g2 = tc.createRadialGradient(x, y, 0, x, y, rd);
      g2.addColorStop(0, `rgba(${r},${gg},${b},${0.5 * tintAmt})`);
      g2.addColorStop(ratio, `rgba(${r},${gg},${b},${0.22 * tintAmt})`);
      g2.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      tc.fillStyle = g2;
      tc.fillRect(x - rd, y - rd, rd * 2, rd * 2);
      tc.restore();
    }
    // vision dans le noir : les pions du joueur (ou tous les pions des joueurs pour le MJ) voient sans couleur, en pénombre
    for (const tk of Object.values(S.tokens)) {
      if (!tk.vision) continue;
      if (me.role !== 'mj' && tk.ownerId !== me.charId) continue;
      if (me.role === 'mj' && !apercuJoueur) continue;
      const p = tokenPos(tk);
      const s = { x: p.x, y: p.y, d: tk.vision, ombres: true };
      const x = (p.x / 100) * cw; const y = (p.y / 100) * ch; const rd = tk.vision * px;
      dc.save();
      clipPoly(dc, s);
      const g = dc.createRadialGradient(x, y, 0, x, y, rd);
      g.addColorStop(0, 'rgba(0,0,0,0.5)');
      g.addColorStop(0.8, 'rgba(0,0,0,0.38)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      dc.fillStyle = g;
      dc.fillRect(x - rd, y - rd, rd * 2, rd * 2);
      dc.restore();
    }
  }

  function refresh() {
    if (!S) return;
    renderMarkers();
    renderPanel();
    if (!actif()) { hide(); if (raf) cancelAnimationFrame(raf); raf = 0; return; }
    if (!raf) raf = requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- MJ : marqueurs des lumières posées
  const markers = $('#light-markers');
  function renderMarkers() {
    const e = ecl();
    const show = me.role === 'mj' && e && (e.actif || placing);
    markers.hidden = !show;
    if (!show) return markers.replaceChildren();
    const seen = new Set();
    for (const l of e.lumieres) {
      seen.add(l.id);
      let m = markers.querySelector(`[data-id="${l.id}"]`);
      if (!m) {
        m = el('div', { class: 'light-marker', 'data-id': l.id });
        m.addEventListener('pointerdown', dragMarker);
        m.addEventListener('contextmenu', (ev) => { ev.preventDefault(); socket.emit('lumiere:supprimer', { id: l.id }); });
        markers.append(m);
      }
      if (!m.classList.contains('dragging')) { m.style.left = l.x + '%'; m.style.top = l.y + '%'; }
      m.textContent = (LUM[l.type] || LUM.torche).ico;
      m.title = `${(LUM[l.type] || LUM.torche).nom} — glisser pour déplacer, clic droit pour supprimer`;
    }
    for (const m of [...markers.children]) if (!seen.has(m.dataset.id)) m.remove();
  }
  function mapPos(ev) {
    const r = $('#map').getBoundingClientRect();
    return { x: clamp(((ev.clientX - r.left) / r.width) * 100, 0, 100), y: clamp(((ev.clientY - r.top) / r.height) * 100, 0, 100) };
  }
  function dragMarker(ev) {
    if (ev.button > 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    const m = ev.currentTarget;
    const l = ecl().lumieres.find((v) => v.id === m.dataset.id);
    if (!l) return;
    m.setPointerCapture(ev.pointerId);
    m.classList.add('dragging');
    let last = 0;
    const move = (pe) => {
      const p = mapPos(pe);
      m.style.left = p.x + '%'; m.style.top = p.y + '%';
      l.x = p.x; l.y = p.y; // l'éclairage suit en direct
      const now = Date.now();
      if (now - last > 120) { last = now; socket.emit('lumiere:modifier', { id: l.id, ...p }); }
    };
    const up = (pe) => {
      m.removeEventListener('pointermove', move);
      m.removeEventListener('pointerup', up);
      m.classList.remove('dragging');
      socket.emit('lumiere:modifier', { id: l.id, ...mapPos(pe) });
    };
    m.addEventListener('pointermove', move);
    m.addEventListener('pointerup', up);
  }

  // pose d'une lumière : clic sur la carte
  function startPlacing(type) {
    placing = type;
    document.body.classList.add('placing-light');
    toast('Clique sur la carte pour poser la lumière (Échap pour annuler).');
    renderMarkers();
  }
  function stopPlacing() {
    placing = null;
    document.body.classList.remove('placing-light');
  }
  $('#map-viewport').addEventListener('pointerdown', (ev) => {
    if (!placing || ev.button > 0) return;
    if (!ev.target.closest('#map')) return stopPlacing();
    ev.preventDefault();
    ev.stopPropagation();
    socket.emit('lumiere:ajouter', { ...mapPos(ev), type: placing });
    if (!ev.shiftKey) stopPlacing();
  }, true);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && placing) stopPlacing(); });

  // ---------------------------------------------------------------- panneau du MJ
  const typeOptions = (sel, withNone) => (withNone ? [['aucune', '— Aucune —']] : []).concat(Object.entries(LUM).map(([k, v]) => [k, `${v.ico} ${v.nom} (${v.r}/${v.d} cases)`]))
    .map(([k, txt]) => el('option', { value: k, text: txt, selected: k === sel }));
  $('#light-type').replaceChildren(...typeOptions('torche', false));
  $('#light-ambiances').append(...AMBIANCES.map(([nom, v]) => el('button', { type: 'button', class: 'small', 'data-nuit': v,
    onclick: () => socket.emit('eclairage:regler', { nuit: v, actif: true }) }, nom)));
  $('#light-on').addEventListener('change', (ev) => socket.emit('eclairage:regler', { actif: ev.target.checked }));
  $('#light-walls').addEventListener('change', (ev) => socket.emit('eclairage:regler', { murs: ev.target.checked }));
  $('#light-decor').addEventListener('change', (ev) => socket.emit('eclairage:regler', { decor: ev.target.checked }));
  $('#light-preview').addEventListener('change', (ev) => { apercuJoueur = ev.target.checked; refresh(); });
  let nuitTimer = null;
  $('#light-nuit').addEventListener('input', (ev) => {
    const v = ev.target.value / 100;
    if (ecl()) ecl().nuit = v;
    clearTimeout(nuitTimer);
    nuitTimer = setTimeout(() => socket.emit('eclairage:regler', { nuit: v }), 120);
  });
  $('#light-place').addEventListener('click', () => startPlacing($('#light-type').value));
  $('#light-clear').addEventListener('click', () => { if (confirm('Retirer toutes les lumières posées sur cette carte ?')) socket.emit('lumiere:supprimer', { id: '*' }); });

  function renderPanel() {
    if (me.role !== 'mj') return;
    const e = ecl();
    $('#light-none').hidden = !!e && !!S.scene.id;
    $('#light-body').hidden = !(e && S.scene.id);
    if (!e || !S.scene.id) return;
    $('#light-on').checked = e.actif;
    $('#light-walls').checked = e.murs;
    $('#light-decor').checked = e.decor;
    if (document.activeElement !== $('#light-nuit')) $('#light-nuit').value = Math.round(e.nuit * 100);
    $$('#light-ambiances [data-nuit]').forEach((b) => b.classList.toggle('active', e.actif && Math.abs(Number(b.dataset.nuit) - e.nuit) < 0.01));
    $('#light-clear').hidden = !e.lumieres.length;
    $('#light-list').replaceChildren(...e.lumieres.map((l, i) => el('li', { class: 'row' },
      el('span', { class: 'grow', text: `${i + 1}.` }),
      el('select', { class: 'grow', onchange: (ev) => socket.emit('lumiere:modifier', { id: l.id, type: ev.target.value }) }, ...typeOptions(l.type, false)),
      el('input', { type: 'number', min: 1, max: 40, class: 'w70', placeholder: String((LUM[l.type] || LUM.torche).r), value: l.rayon || '', title: 'Rayon de lumière vive (cases) ; vide = valeur du type',
        onchange: (ev) => socket.emit('lumiere:modifier', { id: l.id, rayon: ev.target.value }) }),
      el('button', { type: 'button', class: 'tiny-btn', title: 'Supprimer', onclick: () => socket.emit('lumiere:supprimer', { id: l.id }) }, '🗑'))));
    // pions qui portent une lumière
    const porteurs = Object.values(S.tokens).filter((t) => (t.lumiere && t.lumiere !== 'aucune') || t.vision);
    $('#light-carriers').replaceChildren(...porteurs.map((t) => el('li', { text: `${t.label} : ${t.lumiere && LUM[t.lumiere] ? LUM[t.lumiere].ico + ' ' + LUM[t.lumiere].nom : 'pas de lumière'}${t.vision ? ` · vision dans le noir ${t.vision} cases` : ''}` })));
    $('#light-carriers-empty').hidden = porteurs.length > 0;
  }

  // ---------------------------------------------------------------- onglet Pion : lumière portée et vision dans le noir
  $('#pion-lumiere').replaceChildren(...typeOptions('aucune', true));
  $('#pion-lumiere').addEventListener('change', (ev) => { if (pionId) socket.emit('token:lumiere', { id: pionId, lumiere: ev.target.value }); });
  $('#pion-vision').addEventListener('change', (ev) => { if (pionId) socket.emit('token:lumiere', { id: pionId, vision: Number(ev.target.value) }); });
  function renderPionLumiere() {
    const t = S && pionId && S.tokens[pionId];
    if (!t) return;
    if (document.activeElement !== $('#pion-lumiere')) $('#pion-lumiere').value = t.lumiere || 'aucune';
    if (document.activeElement !== $('#pion-vision')) $('#pion-vision').value = String(t.vision || 0);
  }

  socket.on('state', () => { refresh(); renderPionLumiere(); });
  socket.on('map:patch', () => { wallsKey = ''; });
  return { refresh, renderPionLumiere };
})();
