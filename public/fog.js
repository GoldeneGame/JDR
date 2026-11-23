'use strict';
/* Brouillard de guerre : les joueurs ne voient que les zones révélées par le MJ ou explorées par leurs pions. */

const Brouillard = (() => {
  const cv = $('#map-fog');
  const rect = $('#fog-rect');
  let vu = null; // Uint8Array : 1 = révélé
  let dims = null; // { cols, rows, fx, fy }
  let apercu = false;
  const outil = { on: false, vu: true, forme: 'pinceau', taille: 2 };
  let cloud = null;

  const fog = () => (S && S.scene && S.scene.id && S.scene.brouillard) || null;

  function decode(b) {
    const n = b.cols * b.rows;
    const a = new Uint8Array(n);
    let i = 0;
    let v = 0;
    for (const run of b.rle) { if (v) a.fill(1, i, Math.min(n, i + run)); i += run; v ^= 1; }
    return a;
  }

  /** Texture de nuées sombres (générée une fois). */
  function cloudPattern(ctx) {
    if (!cloud) {
      cloud = document.createElement('canvas');
      cloud.width = cloud.height = 256;
      const c = cloud.getContext('2d');
      c.fillStyle = '#0e1016';
      c.fillRect(0, 0, 256, 256);
      const R = mulberry(42);
      for (let k = 0; k < 90; k++) {
        const x = R() * 256; const y = R() * 256; const r = 20 + R() * 60;
        for (const [dx, dy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) {
          const g = c.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
          const l = Math.round(24 + R() * 22);
          g.addColorStop(0, `rgba(${l},${l + 2},${l + 8},0.35)`);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          c.fillStyle = g;
          c.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
        }
      }
    }
    return ctx.createPattern(cloud, 'repeat');
  }

  function draw() {
    const b = fog();
    const on = !!(b && b.actif && vu);
    document.body.classList.toggle('brouillard-on', on);
    cv.hidden = !on;
    if (!on) return;
    const W = imgSize.w; const H = imgSize.h;
    const k = Math.min(1, 1600 / Math.max(W, H));
    const cw = Math.round(W * k); const ch = Math.round(H * k);
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    const ctx = cv.getContext('2d');
    const mj = me.role === 'mj' && !apercu;
    // masque : une case = un pixel, agrandi en douceur
    const m = document.createElement('canvas');
    m.width = dims.cols; m.height = dims.rows;
    const mc = m.getContext('2d');
    const img = mc.createImageData(dims.cols, dims.rows);
    for (let i = 0; i < vu.length; i++) img.data[i * 4 + 3] = vu[i] ? 0 : 255;
    mc.putImageData(img, 0, 0);
    const gw = (cw / dims.fx); const gh = (ch / dims.fy); // taille de la grille en pixels du canvas
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = mj ? 'rgba(10, 12, 20, 0.55)' : cloudPattern(ctx);
    ctx.fillRect(0, 0, cw, ch);
    if (mj) {
      // hachures : le MJ voit à travers, mais sait ce qui est caché
      ctx.strokeStyle = 'rgba(160, 170, 200, 0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = -ch; x < cw; x += 18) { ctx.moveTo(x, 0); ctx.lineTo(x + ch, ch); }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'destination-in';
    ctx.imageSmoothingEnabled = true;
    const blur = Math.max(2, (gw / dims.cols) * 0.35);
    if ('filter' in ctx) ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(m, 0, 0, gw, gh);
    if ('filter' in ctx) ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
  }

  function refresh() {
    const b = fog();
    if (b) {
      dims = { cols: b.cols, rows: b.rows, fx: b.fx || 1, fy: b.fy || 1 };
      if (!pending.size) vu = decode(b);
    } else { vu = null; dims = null; }
    draw();
    renderPanel();
  }

  // ---------------------------------------------------------------- outils du MJ
  const pending = new Map(); // index → révélé ?
  let sendTimer = null;
  function flush() {
    sendTimer = null;
    const rev = []; const hid = [];
    for (const [i, v] of pending) (v ? rev : hid).push(i);
    pending.clear();
    if (rev.length) socket.emit('brouillard:peindre', { cells: rev, vu: true });
    if (hid.length) socket.emit('brouillard:peindre', { cells: hid, vu: false });
  }
  function paint(cells, v) {
    for (const i of cells) { vu[i] = v ? 1 : 0; pending.set(i, v); }
    draw();
    if (!sendTimer) sendTimer = setTimeout(flush, 90);
  }
  function cellAt(ev) {
    const r = $('#map').getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width; const y = (ev.clientY - r.top) / r.height;
    return [Math.floor(x * dims.cols * dims.fx), Math.floor(y * dims.rows * dims.fy)];
  }
  const inside = (c, r) => c >= 0 && r >= 0 && c < dims.cols && r < dims.rows;
  function brush(c0, r0) {
    const out = [];
    const t = outil.taille;
    const off = Math.floor((t - 1) / 2);
    for (let r = r0 - off; r < r0 - off + t; r++) for (let c = c0 - off; c < c0 - off + t; c++) if (inside(c, r)) out.push(c + r * dims.cols);
    return out;
  }
  function rectCellsFog(a, b) {
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
    rect.classList.toggle('cacher', !outil.vu);
  }

  $('#map-viewport').addEventListener('pointerdown', (ev) => {
    const b = fog();
    if (!outil.on || !b || !b.actif || !vu || ev.button > 1 || !ev.target.closest('#map')) return;
    ev.preventDefault();
    ev.stopPropagation();
    // clic droit = l'inverse de l'outil choisi
    const v = ev.button === 2 ? !outil.vu : outil.vu;
    const start = cellAt(ev);
    let last = start;
    if (outil.forme === 'pinceau') paint(brush(...start), v);
    else showRect(start, start);
    const move = (pe) => {
      const c = cellAt(pe);
      if (c[0] === last[0] && c[1] === last[1]) return;
      last = c;
      if (outil.forme === 'pinceau') paint(brush(...c), v);
      else showRect(start, c);
    };
    const up = () => {
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', up, true);
      if (outil.forme === 'rectangle') { rect.hidden = true; paint(rectCellsFog(start, last), v); }
    };
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
  }, true);
  $('#map-viewport').addEventListener('contextmenu', (ev) => { if (outil.on && fog() && fog().actif) { ev.preventDefault(); ev.stopPropagation(); } }, true);

  function setOutil(on) {
    outil.on = on;
    if (on && typeof Ombres !== 'undefined') Ombres.stop();
    document.body.classList.toggle('fog-painting', on);
    $('#fog-paint').classList.toggle('active', on);
    $('#fog-paint').textContent = on ? '✋ Arrêter de peindre' : '🖌 Peindre sur la carte';
  }
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && outil.on) setOutil(false); });

  function activer(on) {
    const { cols, rows, cell } = mapGrid();
    socket.emit('brouillard:regler', { actif: on, cols, rows, fx: imgSize.w / (cols * cell), fy: imgSize.h / (rows * cell) });
  }
  $('#fog-on').addEventListener('change', (ev) => { activer(ev.target.checked); if (!ev.target.checked) setOutil(false); });
  $('#fog-auto').addEventListener('change', (ev) => socket.emit('brouillard:regler', { auto: ev.target.checked }));
  $('#fog-vue').addEventListener('change', (ev) => socket.emit('brouillard:regler', { vue: Number(ev.target.value) }));
  $('#fog-preview').addEventListener('change', (ev) => { apercu = ev.target.checked; draw(); });
  $('#fog-paint').addEventListener('click', () => setOutil(!outil.on));
  $$('#fog-mode [data-vu]').forEach((b) => b.addEventListener('click', () => {
    outil.vu = b.dataset.vu === '1';
    $$('#fog-mode [data-vu]').forEach((x) => x.classList.toggle('active', x === b));
    setOutil(true);
  }));
  $$('#fog-forme [data-forme]').forEach((b) => b.addEventListener('click', () => {
    outil.forme = b.dataset.forme;
    $$('#fog-forme [data-forme]').forEach((x) => x.classList.toggle('active', x === b));
    setOutil(true);
  }));
  $('#fog-taille').addEventListener('change', (ev) => { outil.taille = Number(ev.target.value); });
  $('#fog-all-show').addEventListener('click', () => socket.emit('brouillard:tout', { vu: true }));
  $('#fog-all-hide').addEventListener('click', () => { if (confirm('Recouvrir toute la carte de brouillard ?')) socket.emit('brouillard:tout', { vu: false }); });

  function renderPanel() {
    if (me.role !== 'mj') return;
    const hasScene = !!(S && S.scene.id);
    $('#fog-none').hidden = hasScene;
    $('#fog-body').hidden = !hasScene;
    const b = fog();
    const on = !!(b && b.actif);
    $('#fog-on').checked = on;
    $('#fog-tools').hidden = !on;
    if (!on && outil.on) setOutil(false);
    if (b) {
      $('#fog-auto').checked = b.auto;
      if (document.activeElement !== $('#fog-vue')) $('#fog-vue').value = b.vue;
    }
  }

  socket.on('state', refresh);
  addEventListener('resize', draw);
  return { refresh, draw, stop: () => { if (outil.on) setOutil(false); } };
})();
