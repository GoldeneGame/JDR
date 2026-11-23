'use strict';
/* Zones d'ombre peintes par le MJ : pénombre, ombre, obscurité, jusqu'aux ténèbres totales (rien n'est visible). */

const Ombres = (() => {
  const cv = $('#map-shade');
  const rect = $('#shade-rect');
  const NIVEAUX = [[1, '🌗 Pénombre', 0.3], [2, '🌘 Ombre', 0.55], [3, '🌑 Obscurité', 0.8], [4, '⬛ Ténèbres totales', 1], [0, '🧽 Gomme', 0]];
  const ALPHA = [0, 0.3, 0.55, 0.8, 1];
  let niv = null; // Uint8Array : niveau par case
  let dims = null;
  let apercu = false;
  const outil = { on: false, niveau: 4, forme: 'pinceau', taille: 2 };
  const pending = new Map();
  let sendTimer = null;

  const data = () => (S && S.scene && S.scene.id && S.scene.ombres) || null;

  function decode(o) {
    const a = new Uint8Array(o.cols * o.rows);
    let i = 0;
    for (let k = 0; k < o.rle.length; k += 2) { const v = Number(o.rle[k]); const n = o.rle[k + 1]; if (v) a.fill(v, i, i + n); i += n; }
    return a;
  }

  function draw() {
    const on = !!(niv && dims && niv.some((v) => v));
    cv.hidden = !on;
    if (!on) return;
    const W = imgSize.w; const H = imgSize.h;
    const k = Math.min(1, 1600 / Math.max(W, H));
    const cw = Math.round(W * k); const ch = Math.round(H * k);
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    const ctx = cv.getContext('2d');
    const mj = me.role === 'mj' && !apercu;
    const m = document.createElement('canvas');
    m.width = dims.cols; m.height = dims.rows;
    const mc = m.getContext('2d');
    const img = mc.createImageData(dims.cols, dims.rows);
    // le MJ voit à travers : l'ombre est atténuée chez lui
    for (let i = 0; i < niv.length; i++) img.data[i * 4 + 3] = Math.round(ALPHA[niv[i]] * (mj ? 0.6 : 1) * 255);
    mc.putImageData(img, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#05060b';
    ctx.fillRect(0, 0, cw, ch);
    if (mj) {
      ctx.strokeStyle = 'rgba(140, 120, 200, 0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = -ch; x < cw; x += 14) { ctx.moveTo(x + ch, 0); ctx.lineTo(x, ch); }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'destination-in';
    ctx.imageSmoothingEnabled = true;
    const gw = cw / dims.fx; const gh = ch / dims.fy;
    if ('filter' in ctx) ctx.filter = `blur(${Math.max(1.5, (gw / dims.cols) * 0.22)}px)`;
    ctx.drawImage(m, 0, 0, gw, gh);
    if ('filter' in ctx) ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
  }

  function refresh() {
    const o = data();
    if (o) {
      dims = { cols: o.cols, rows: o.rows, fx: o.fx || 1, fy: o.fy || 1 };
      if (!pending.size) niv = decode(o);
    } else if (!pending.size) {
      niv = null;
      dims = null;
    }
    draw();
  }

  // ---------------------------------------------------------------- pinceau du MJ
  function grille() {
    if (dims) return dims;
    const { cols, rows, cell } = mapGrid();
    dims = { cols, rows, fx: imgSize.w / (cols * cell), fy: imgSize.h / (rows * cell) };
    niv = new Uint8Array(cols * rows);
    return dims;
  }
  function flush() {
    sendTimer = null;
    const par = new Map();
    for (const [i, v] of pending) { if (!par.has(v)) par.set(v, []); par.get(v).push(i); }
    pending.clear();
    for (const [v, cells] of par) socket.emit('ombres:peindre', { ...dims, cells, niveau: v });
  }
  function paint(cells, v) {
    for (const i of cells) { niv[i] = v; pending.set(i, v); }
    draw();
    if (!sendTimer) sendTimer = setTimeout(flush, 90);
  }
  function cellAt(ev) {
    const r = $('#map').getBoundingClientRect();
    return [Math.floor(((ev.clientX - r.left) / r.width) * dims.cols * dims.fx), Math.floor(((ev.clientY - r.top) / r.height) * dims.rows * dims.fy)];
  }
  const inside = (c, r) => c >= 0 && r >= 0 && c < dims.cols && r < dims.rows;
  function brush(c0, r0) {
    const out = [];
    const t = outil.taille;
    const off = Math.floor((t - 1) / 2);
    for (let r = r0 - off; r < r0 - off + t; r++) for (let c = c0 - off; c < c0 - off + t; c++) if (inside(c, r)) out.push(c + r * dims.cols);
    return out;
  }
  function rectCells(a, b) {
    const out = [];
    for (let r = Math.max(0, Math.min(a[1], b[1])); r <= Math.min(dims.rows - 1, Math.max(a[1], b[1])); r++)
      for (let c = Math.max(0, Math.min(a[0], b[0])); c <= Math.min(dims.cols - 1, Math.max(a[0], b[0])); c++) out.push(c + r * dims.cols);
    return out;
  }
  function showRect(a, b) {
    const gw = 100 / (dims.cols * dims.fx); const gh = 100 / (dims.rows * dims.fy);
    rect.hidden = false;
    rect.style.left = Math.min(a[0], b[0]) * gw + '%';
    rect.style.top = Math.min(a[1], b[1]) * gh + '%';
    rect.style.width = (Math.abs(a[0] - b[0]) + 1) * gw + '%';
    rect.style.height = (Math.abs(a[1] - b[1]) + 1) * gh + '%';
  }
  $('#map-viewport').addEventListener('pointerdown', (ev) => {
    if (!outil.on || !S || !S.scene.id || ev.button > 2 || ev.button === 1 || !ev.target.closest('#map')) return;
    ev.preventDefault();
    ev.stopPropagation();
    grille();
    const v = ev.button === 2 ? 0 : outil.niveau; // clic droit = gomme
    const start = cellAt(ev);
    let last = start;
    if (outil.forme === 'pinceau') paint(brush(...start), v); else showRect(start, start);
    const move = (pe) => {
      const c = cellAt(pe);
      if (c[0] === last[0] && c[1] === last[1]) return;
      last = c;
      if (outil.forme === 'pinceau') paint(brush(...c), v); else showRect(start, c);
    };
    const up = () => {
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', up, true);
      if (outil.forme === 'rectangle') { rect.hidden = true; paint(rectCells(start, last), v); }
    };
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
  }, true);
  $('#map-viewport').addEventListener('contextmenu', (ev) => { if (outil.on) { ev.preventDefault(); ev.stopPropagation(); } }, true);

  function setOutil(on) {
    outil.on = on;
    if (on && typeof Brouillard !== 'undefined') Brouillard.stop();
    document.body.classList.toggle('shade-painting', on);
    $('#shade-paint').classList.toggle('active', on);
    $('#shade-paint').textContent = on ? '✋ Arrêter de peindre' : '🖌 Peindre l\'ombre sur la carte';
  }
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && outil.on) setOutil(false); });

  // ---------------------------------------------------------------- panneau
  $('#shade-niveaux').append(...NIVEAUX.map(([v, nom]) => el('button', { type: 'button', class: 'small' + (v === outil.niveau ? ' active' : ''), 'data-niv': v,
    onclick: (ev) => {
      outil.niveau = v;
      $$('#shade-niveaux [data-niv]').forEach((b) => b.classList.toggle('active', b === ev.currentTarget));
      setOutil(true);
    } }, nom)));
  $$('#shade-forme [data-forme]').forEach((b) => b.addEventListener('click', () => {
    outil.forme = b.dataset.forme;
    $$('#shade-forme [data-forme]').forEach((x) => x.classList.toggle('active', x === b));
    setOutil(true);
  }));
  $('#shade-taille').addEventListener('change', (ev) => { outil.taille = Number(ev.target.value); });
  $('#shade-paint').addEventListener('click', () => setOutil(!outil.on));
  $('#shade-clear').addEventListener('click', () => { if (confirm('Effacer toutes les zones d\'ombre de cette carte ?')) socket.emit('ombres:effacer'); });
  $('#shade-preview').addEventListener('change', (ev) => { apercu = ev.target.checked; draw(); });

  socket.on('state', refresh);
  addEventListener('resize', draw);
  return { refresh, stop: () => setOutil(false) };
})();
