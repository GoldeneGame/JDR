'use strict';
/* Combat côté MJ : dégâts et soins (joueurs comme monstres), bestiaire, attaques des monstres. */

// ------------------------------------------------------------------ fenêtre « Dégâts & soins »
const dmgTargets = new Set();

/** Ouvre la fenêtre pour ces pions, près du point cliqué (ou au centre). */
function openDegats(ids, x, y) {
  if (me.role !== 'mj') return;
  dmgTargets.clear();
  for (const id of ids) if (S.tokens[id]) dmgTargets.add(id);
  if (!dmgTargets.size) return;
  const pop = $('#dmg-pop');
  pop.hidden = false;
  renderDegats();
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  const px = x == null ? (innerWidth - w) / 2 : x + 12;
  const py = y == null ? (innerHeight - h) / 2 : y - 20;
  pop.style.left = clamp(px, 8, Math.max(8, innerWidth - w - 8)) + 'px';
  pop.style.top = clamp(py, 8, Math.max(8, innerHeight - h - 8)) + 'px';
  $('#dmg-val').focus();
}
function closeDegats() {
  $('#dmg-pop').hidden = true;
  dmgTargets.clear();
}

/** PV lisibles d'un pion pour le MJ. */
function pvText(t) {
  if (t.ownerId) {
    const c = S.characters[t.ownerId];
    return c ? `${c.pv}/${c.pvMax} PV${c.pvTemp ? ` (+${c.pvTemp})` : ''} · CA ${c.ca}` : '';
  }
  if (t.pvMax) return t.pv <= 0 ? '💀 hors de combat' : `${t.pv}/${t.pvMax} PV · CA ${t.ca}`;
  return 'sans PV';
}

function renderDegats() {
  if ($('#dmg-pop').hidden || !S) return;
  for (const id of [...dmgTargets]) if (!S.tokens[id]) dmgTargets.delete(id);
  if (!dmgTargets.size) return closeDegats();
  const targets = [...dmgTargets].map((id) => S.tokens[id]);
  $('#dmg-targets').replaceChildren(...targets.map((t) => {
    const h = tokenHealth(t);
    return el('div', { class: 'dmg-target' },
      miniToken(t, 28),
      el('div', { class: 'grow col0' },
        el('strong', { text: t.label }),
        el('span', { class: 'muted tiny', text: pvText(t) }),
        h == null ? null : el('div', { class: 'hp mini' }, el('div', { class: 'hp-fill', style: { width: h * 100 + '%', background: hpColor(h * 100) } }))),
      dmgTargets.size > 1 ? el('button', { type: 'button', class: 'tiny-btn', title: 'Retirer de la sélection', onclick: () => { dmgTargets.delete(t.id); renderDegats(); } }, '✕') : null);
  }));

  // Ajouter d'autres cibles (dégâts de zone : une boule de feu touche plusieurs créatures)
  const others = Object.values(S.tokens).filter((t) => !dmgTargets.has(t.id))
    .sort((a, b) => (!!a.ownerId === !!b.ownerId ? a.label.localeCompare(b.label) : a.ownerId ? -1 : 1));
  const sel = $('#dmg-add');
  sel.hidden = !others.length;
  sel.replaceChildren(el('option', { value: '', text: '＋ Ajouter une cible (dégâts de zone)…' }),
    ...others.map((t) => el('option', { value: t.id, text: `${t.label}${t.ownerId ? ' (joueur)' : ''} — ${pvText(t)}` })));
  sel.value = '';

  // Un seul monstre : son attaque, et de quoi le retirer
  const t = targets.length === 1 ? targets[0] : null;
  const box = $('#dmg-monster');
  box.replaceChildren();
  if (t && !t.ownerId) {
    box.append(
      t.attaque ? el('button', { type: 'button', class: 'small', title: `Lance 1d20 pour toucher, puis les dégâts (${t.degats || '—'})`, onclick: () => monsterAttack(t) }, `🎲 ${t.attaque}${t.degats ? ` · ${t.degats}` : ''}`) : null,
      el('button', { type: 'button', class: 'small danger', onclick: () => { if (confirm(`Retirer ${t.label} de la carte ?`)) socket.emit('token:remove', { id: t.id }); } }, '🗑 Retirer'));
  }
}

function sendDegats(montant, soin) {
  const m = String(montant ?? '').trim();
  if (!m) { $('#dmg-val').focus(); return toast('Indique un montant (ex : 7 ou 2d6+3).'); }
  socket.emit('degats', {
    cibles: [...dmgTargets], montant: m, soin,
    moitie: $('#dmg-half').checked, secret: $('#dmg-secret').checked,
  }, (res) => {
    if (res && !res.ok) return toast(res.error);
    $('#dmg-val').value = '';
    $('#dmg-half').checked = false;
  });
}

$('#dmg-form').addEventListener('submit', (ev) => { ev.preventDefault(); sendDegats($('#dmg-val').value, false); });
$('#dmg-heal').addEventListener('click', () => sendDegats($('#dmg-val').value, true));
$$('#dmg-pop [data-q]').forEach((b) => b.addEventListener('click', () => {
  const q = Number(b.dataset.q);
  sendDegats(String(Math.abs(q)), q < 0);
}));
$('#dmg-add').addEventListener('change', (ev) => {
  if (ev.target.value) { dmgTargets.add(ev.target.value); renderDegats(); }
});
$('#dmg-close').addEventListener('click', closeDegats);
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('#dmg-pop').hidden) closeDegats(); });
// On peut déplacer la fenêtre en la tirant par son titre
$('#dmg-pop .dmg-head').addEventListener('pointerdown', (ev) => {
  if (ev.target.closest('button')) return;
  const pop = $('#dmg-pop');
  const ox = ev.clientX - pop.offsetLeft;
  const oy = ev.clientY - pop.offsetTop;
  const move = (e) => { pop.style.left = (e.clientX - ox) + 'px'; pop.style.top = (e.clientY - oy) + 'px'; };
  const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
});

/** Attaque d'un monstre : jet pour toucher (bonus lu dans « Cimeterre +4 »), puis jet de dégâts. */
function monsterAttack(t) {
  if (!t || !t.attaque) return;
  const m = /([+-]\s*\d+)/.exec(t.attaque);
  roll('1d20' + (m ? m[1].replace(/\s+/g, '') : ''), `${t.label} — ${t.attaque}`);
  if (t.degats) setTimeout(() => roll(t.degats, `${t.label} — dégâts`), DICE_ANIM_MS + 200);
}

// ------------------------------------------------------------------ bestiaire
let bestiaireKey = '';
function renderBestiaire() {
  const list = (S && S.bestiaire) || [];
  const key = list.map((m) => m.id).join();
  const sel = $('#monster-model');
  if (key !== bestiaireKey) {
    bestiaireKey = key;
    const prev = sel.value;
    sel.replaceChildren(...list.map((m) => el('option', { value: m.id, text: `${m.emb} ${m.nom} — FP ${m.fp} · ${m.pvMoyen} PV · CA ${m.ca}` })));
    if (list.some((m) => m.id === prev)) sel.value = prev;
  }
  const m = list.find((x) => x.id === sel.value);
  const prev = $('#monster-preview');
  if (m && prev.dataset.mo !== m.id) { prev.dataset.mo = m.id; prev.innerHTML = MO.svg(m.id, 'pied', 'apercu'); }
  prev.hidden = !m;
  $('#monster-info').replaceChildren(...(m ? [
    el('span', { text: `⚔ ${m.attaque} · ${m.degats}` }),
    el('span', { text: `❤ ${m.pvMoyen} PV (${m.pv})` }),
    m.taille > 1 ? el('span', { text: ['', 'Moyen', 'Grand', 'Très grand', 'Gigantesque'][m.taille] }) : null,
  ].filter(Boolean) : []));
}
$('#monster-model').addEventListener('change', renderBestiaire);
$('#monster-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  socket.emit('monstre:ajouter', {
    modele: $('#monster-model').value,
    nombre: $('#monster-count').value,
    initiative: $('#monster-init').checked,
    pvAuxDes: $('#monster-roll').checked,
    cache: $('#monster-hidden').checked,
  }, (res) => {
    if (res && !res.ok) return toast(res.error);
    toast('Monstre(s) ajouté(s) sur la carte.');
  });
});
$('#monsters-clean').addEventListener('click', () => socket.emit('monstres:nettoyer'));

socket.on('state', () => {
  if (me.role !== 'mj') return;
  renderBestiaire();
  renderDegats();
  $('#monsters-clean').hidden = !Object.values(S.tokens).some((t) => !t.ownerId && t.pvMax && t.pv <= 0);
});
