'use strict';
/* Séance : déroulé de slides et de cartes (édition MJ), projection et transitions chez tous. */

const SLIDE_THEMES = [['parchemin', 'Parchemin'], ['sombre', 'Sombre'], ['sang', 'Sang'], ['mystique', 'Mystique'],
  ['nature', 'Nature'], ['glace', 'Glace'], ['epique', 'Épique']];

const sceneDe = (id) => ((S && S.scenes) || []).find((sc) => sc.id === id);
/** Aperçu d'une scène : son image, ou la texture de son sol pour une battle map peinte. */
const apercuScene = (sc) => (sc.image ? sc.image : terrainTexture(sc.fond || 'herbe', 64, 0).toDataURL());

/** Rendu d'une étape (projection, aperçu, vignettes) : une slide, ou la carte qu'elle affiche. */
function slideElement(s) {
  if (s.type === 'carte') {
    const sc = sceneDe(s.sceneId);
    const node = el('div', { class: 'slide slide-carte' }, el('span', { class: 'slide-carte-titre', text: sc ? `🗺 ${sc.titre}` : '⚠ Carte supprimée' }));
    if (sc) node.style.backgroundImage = `url("${apercuScene(sc)}")`;
    if (sc && !sc.image) node.style.backgroundSize = '64px';
    return node;
  }
  const node = el('div', { class: `slide theme-${s.style || 'parchemin'}${s.image ? ' has-img' : ''}` });
  if (s.image) node.style.backgroundImage = `url("${s.image}")`;
  node.append(el('div', { class: 'slide-inner' },
    el('div', { class: 'slide-ornament', text: '❦' }),
    el('h2', { class: 'slide-title', text: s.titre || '' }),
    s.texte ? el('p', { class: 'slide-text', text: s.texte }) : null));
  return node;
}

// ------------------------------------------------------------------ musiques (listes partagées éditeur / projection)
/** Pistes disponibles : ambiances intégrées puis musiques importées par le MJ. */
function listeMusiques() {
  const perso = ((S && S.musiquesPerso) || []).map((m) => ({ id: 'f:' + m.id, label: `${m.icone} ${m.nom}` }));
  return [...PISTES.map((p) => ({ id: p.id, label: `${p.icone} ${p.nom}` })), ...perso];
}
const nomMusique = (id) => (listeMusiques().find((m) => m.id === id) || {}).label;

/** Remplit un <select> de musiques sans le reconstruire si rien n'a changé (sinon il se ferme). */
function remplirMusiques(sel, debut, valeur) {
  remplirSelect(sel, [...debut, ...listeMusiques().map((m) => [m.id, m.label])], valeur);
}
/** Remplit un <select> ([valeur, texte]…) sans le reconstruire si rien n'a changé (sinon il se ferme). */
function remplirSelect(sel, opts, valeur) {
  const sig = JSON.stringify(opts);
  if (sel.dataset.sig !== sig) {
    sel.dataset.sig = sig;
    sel.replaceChildren(...opts.map(([value, text]) => el('option', { value, text })));
  }
  if (document.activeElement !== sel) sel.value = valeur;
}

// ------------------------------------------------------------------ édition (MJ)
let deckId = null;
let slideId = null;

const curDeck = () => (S && S.slides ? S.slides.decks.find((d) => d.id === deckId) : null);
const curSlide = () => { const d = curDeck(); return d ? d.slides.find((s) => s.id === slideId) : null; };

$('#slide-styles').append(...SLIDE_THEMES.map(([k, nom]) => el('button', {
  type: 'button', class: 'chip', 'data-style': k, onclick: () => patchSlide({ style: k }, true),
}, nom)));

let slidePending = null;
let slideTimer = null;
function patchSlide(patch, now = false) {
  const s = curSlide();
  if (!s) return;
  Object.assign(s, patch); // affichage immédiat
  if (!slidePending || slidePending.slideId !== s.id) { flushSlide(); slidePending = { deckId, slideId: s.id, patch: {} }; }
  Object.assign(slidePending.patch, patch);
  clearTimeout(slideTimer);
  if (now) flushSlide(); else slideTimer = setTimeout(flushSlide, 400);
  renderSlideList();
  renderSlidePreview();
}
function flushSlide() {
  clearTimeout(slideTimer);
  if (slidePending) socket.emit('slides:slide:update', slidePending);
  slidePending = null;
}

$('#deck-select').addEventListener('change', (ev) => { flushSlide(); deckId = ev.target.value; slideId = null; renderSlides(); });
$('#deck-new').addEventListener('click', () => {
  const titre = prompt('Titre du déroulé :', 'Séance ' + (((S.slides && S.slides.decks.length) || 0) + 1));
  if (titre === null) return;
  socket.emit('slides:deck:create', { titre }, (res) => { if (res && res.ok) { deckId = res.id; slideId = null; renderSlides(); } });
});
$('#deck-delete').addEventListener('click', () => {
  const d = curDeck();
  if (d && confirm(`Supprimer le déroulé « ${d.titre} » et ses ${d.slides.length} étapes ? (les cartes elles-mêmes sont conservées)`)) socket.emit('slides:deck:delete', { id: d.id });
});
$('#deck-titre').addEventListener('change', (ev) => socket.emit('slides:deck:update', { id: deckId, titre: ev.target.value }));

$('#slide-add').addEventListener('click', () => {
  flushSlide();
  socket.emit('slides:slide:add', { deckId, after: slideId }, (res) => { if (res && res.ok) { slideId = res.id; renderSlides(); $('#slide-titre').select(); } });
});
$('#slide-titre').addEventListener('input', (ev) => patchSlide({ titre: ev.target.value }));
$('#slide-texte').addEventListener('input', (ev) => patchSlide({ texte: ev.target.value }));
$('#slide-noimg').addEventListener('click', () => patchSlide({ image: null }, true));
$('#slide-scene').addEventListener('change', (ev) => { if (ev.target.value) patchSlide({ image: ev.target.value }, true); ev.target.value = ''; });
$('#slide-file').addEventListener('change', (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  if (file.size > 12 * 1024 * 1024) return toast('Image trop lourde (12 Mo maximum).');
  const reader = new FileReader();
  reader.onload = () => socket.emit('slides:slide:image', { deckId, slideId, data: reader.result }, (res) => {
    if (res && !res.ok) toast(res.error);
  });
  reader.readAsDataURL(file);
});
$('#slide-musique').addEventListener('change', (ev) => patchSlide({ musique: ev.target.value || null }, true));
$('#step-transition').addEventListener('change', (ev) => patchSlide({ transition: ev.target.value }, true));
$('#step-scene').addEventListener('change', (ev) => { if (ev.target.value) patchSlide({ sceneId: ev.target.value }, true); });

/** Ajoute une carte (scène) au déroulé, après l'étape sélectionnée. Utilisé aussi depuis l'onglet Cartes. */
function ajouterCarteAuDeroule(sceneId) {
  if (!curDeck()) { toast('Crée d\'abord un déroulé dans l\'onglet 📜 Déroulé.'); return; }
  flushSlide();
  socket.emit('slides:slide:add', { deckId, after: slideId, type: 'carte', sceneId }, (res) => {
    if (res && !res.ok) return toast(res.error);
    if (res && res.ok) { slideId = res.id; renderSlides(); toast('Carte ajoutée au déroulé.'); }
  });
}
$('#step-add-carte').addEventListener('change', (ev) => { if (ev.target.value) ajouterCarteAuDeroule(ev.target.value); ev.target.value = ''; });

// onglets du panneau Séance
function ongletSeance(nom) {
  $$('[data-seance-tab]').forEach((b) => b.classList.toggle('active', b.dataset.seanceTab === nom));
  $('#seance-deroule').hidden = nom !== 'deroule';
  $('#seance-cartes').hidden = nom !== 'cartes';
}
$$('[data-seance-tab]').forEach((b) => b.addEventListener('click', () => ongletSeance(b.dataset.seanceTab)));
$('#slide-up').addEventListener('click', () => { flushSlide(); socket.emit('slides:slide:move', { deckId, slideId, dir: -1 }); });
$('#slide-down').addEventListener('click', () => { flushSlide(); socket.emit('slides:slide:move', { deckId, slideId, dir: 1 }); });
$('#slide-delete').addEventListener('click', () => {
  const s = curSlide();
  const nom = s && (s.type === 'carte' ? `l'étape carte « ${(sceneDe(s.sceneId) || {}).titre || 'supprimée'} » (la carte reste dans l'onglet Cartes)` : `la slide « ${s.titre || 'sans titre'} »`);
  if (s && confirm(`Retirer ${nom} du déroulé ?`)) { flushSlide(); socket.emit('slides:slide:delete', { deckId, slideId }); }
});
$('#slide-show').addEventListener('click', () => {
  const d = curDeck();
  flushSlide();
  if (d) socket.emit('slides:present', { deckId, index: d.slides.findIndex((s) => s.id === slideId) });
});
$('#deck-present').addEventListener('click', () => {
  const d = curDeck();
  if (!d || !d.slides.length) return toast('Ajoute d\'abord des slides ou des cartes au déroulé.');
  flushSlide();
  socket.emit('slides:present', { deckId, index: 0 });
});

function renderSlideList() {
  const d = curDeck();
  if (!d) return;
  $('#slide-list').replaceChildren(...d.slides.map((s, i) => el('li', {
    class: 'slide-item' + (s.type === 'carte' ? ' etape-carte' : '') + (s.id === slideId ? ' active' : '') + (S.projection && S.projection.deckId === d.id && S.projection.index === i ? ' live' : ''),
    onclick: () => { flushSlide(); slideId = s.id; renderSlides(); },
  },
  el('span', { class: 'slide-num', text: i + 1 }),
  s.type === 'carte' ? el('span', { text: '🗺', title: 'Carte' }) : el('span', { class: `slide-dot theme-${s.style}` }),
  el('span', { class: 'grow', text: s.type === 'carte' ? ((sceneDe(s.sceneId) || {}).titre || '⚠ Carte supprimée') : (s.titre || 'Sans titre') }),
  s.transition === 'noir' ? el('span', { class: 'muted tiny', text: '◐', title: 'Fondu au noir' }) : s.transition === 'aucune' ? el('span', { class: 'muted tiny', text: '⇥', title: 'Coupure nette' }) : null,
  s.musique ? el('span', { class: 'muted tiny', text: s.musique === 'stop' ? '🔇' : '🎵', title: s.musique === 'stop' ? 'Coupe la musique' : nomMusique(s.musique) || 'Musique supprimée' }) : null,
  s.image ? el('span', { class: 'muted tiny', text: '🖼' }) : null)));
}
function renderSlidePreview() {
  const s = curSlide();
  $('#slide-preview').replaceChildren(s ? slideElement(s) : '');
  $$('#slide-styles [data-style]').forEach((b) => b.classList.toggle('active', !!s && b.dataset.style === s.style));
}

function renderSlides() {
  if (!S || me.role !== 'mj' || !S.slides) return;
  const decks = S.slides.decks;
  if (!decks.some((d) => d.id === deckId)) deckId = decks.length ? decks[decks.length - 1].id : null;
  const sel = $('#deck-select');
  if (document.activeElement !== sel) {
    sel.replaceChildren(...decks.map((d) => el('option', { value: d.id, text: `${d.titre} (${d.slides.length})` })));
    sel.value = deckId || '';
  }
  sel.hidden = !decks.length;
  $('#deck-delete').hidden = !deckId;
  const d = curDeck();
  $('#deck-empty').hidden = !!d;
  $('#deck-editor').hidden = !d;
  // menu « ＋ Carte » : toutes les cartes et battle maps de l'onglet Cartes
  const scenesOpts = S.scenes.map((sc) => [sc.id, (sc.image ? '🖼 ' : '⚔ ') + sc.titre]);
  remplirSelect($('#step-add-carte'), [['', S.scenes.length ? '＋ Carte…' : '＋ Carte (aucune)'], ...scenesOpts], '');
  if (!d) return;
  if (document.activeElement !== $('#deck-titre')) $('#deck-titre').value = d.titre;
  if (!d.slides.some((s) => s.id === slideId)) slideId = d.slides.length ? d.slides[0].id : null;
  renderSlideList();

  const s = curSlide();
  $('#slide-editor').hidden = !s;
  if (!s) return;
  const carte = s.type === 'carte';
  $('#step-slide').hidden = carte;
  $('#step-carte').hidden = !carte;
  if (document.activeElement !== $('#step-transition')) $('#step-transition').value = s.transition || 'fondu';
  if (carte) {
    const opts = sceneDe(s.sceneId) ? scenesOpts : [[s.sceneId || '', '⚠ Carte supprimée'], ...scenesOpts];
    remplirSelect($('#step-scene'), opts, s.sceneId || '');
  }
  // ne pas écraser ce que le MJ est en train de taper
  if (!(slidePending && slidePending.slideId === s.id)) {
    if (document.activeElement !== $('#slide-titre')) $('#slide-titre').value = s.titre || '';
    if (document.activeElement !== $('#slide-texte')) $('#slide-texte').value = s.texte || '';
  }
  const scenes = $('#slide-scene');
  scenes.replaceChildren(el('option', { value: '', text: '— ou une carte —' }), ...S.scenes.filter((sc) => sc.image).map((sc) => el('option', { value: sc.image, text: sc.titre })));
  const debut = [['', '— Ne pas changer la musique —'], ['stop', '🔇 Couper la musique']];
  // musique importée supprimée depuis : on la signale plutôt que d'afficher « Ne pas changer »
  if (s.musique && s.musique !== 'stop' && !nomMusique(s.musique)) debut.push([s.musique, '⚠ Musique supprimée']);
  remplirMusiques($('#slide-musique'), debut, s.musique || '');
  renderSlidePreview();
}

// ------------------------------------------------------------------ projection (tout le monde)
let shownKey = null;  // slide actuellement affichée
let hiddenKey = null; // slide que ce joueur a choisi de réduire
let etapeKey;         // étape du déroulé déjà rendue (undefined avant le premier affichage : pas de transition à l'arrivée)

/** Voile noir qui se lève : « fondu » rapide ou « noir » plus long (il masque le changement de carte). */
function jouerTransition(type) {
  if (type !== 'fondu' && type !== 'noir') return;
  const t = $('#transition');
  clearTimeout(t._timer);
  t.className = 'transition';
  t.hidden = false;
  void t.offsetWidth; // relance l'animation même si la précédente n'était pas finie
  t.classList.add(type);
  t._timer = setTimeout(() => { t.hidden = true; t.className = 'transition'; }, type === 'noir' ? 1700 : 800);
}

function renderProjection() {
  const p = S && S.projection;
  const overlay = $('#projection');
  const etape = p ? `${p.deckId}:${p.index}:${p.id}` : null;
  if (etapeKey !== undefined && etape && etape !== etapeKey) jouerTransition(p.transition || 'fondu');
  etapeKey = etape;
  if (!p) {
    overlay.hidden = true;
    $('#projection-pill').hidden = true;
    $('#seq-bar').hidden = true;
    shownKey = null;
    hiddenKey = null;
    return;
  }
  // Étape « carte » : la présentation s'efface, la carte est affichée sur la table ; le MJ garde ses commandes.
  const carte = p.type === 'carte';
  $('#seq-bar').hidden = !carte || me.role !== 'mj';
  if (carte) {
    overlay.hidden = true;
    $('#projection-pill').hidden = true;
    shownKey = null;
    $('#seq-count').textContent = `🎬 ${p.deckTitre} · ${p.index + 1} / ${p.total} · 🗺 ${p.titre}`;
    $('#seq-prev').disabled = p.index <= 0;
    $('#seq-next').disabled = p.index >= p.total - 1;
    return;
  }
  const key = etape;
  const content = JSON.stringify([p.titre, p.texte, p.style, p.image]);
  if (key !== shownKey || overlay.dataset.content !== content) {
    const fresh = key !== shownKey;
    shownKey = key;
    overlay.dataset.content = content;
    const node = slideElement(p);
    if (fresh && p.transition !== 'aucune') node.classList.add('enter');
    $('#projection-slide').replaceChildren(node);
  }
  $('#projection-count').textContent = `${p.deckTitre} · ${p.index + 1} / ${p.total}`;
  $('#proj-prev').disabled = p.index <= 0;
  $('#proj-next').disabled = p.index >= p.total - 1;
  const hidden = hiddenKey === key;
  overlay.hidden = hidden;
  $('#projection-pill').hidden = !hidden;
  if (me.role === 'mj') renderProjMusic();
}

/** Commandes de musique du MJ pendant la projection (elles agissent chez tout le monde). */
function renderProjMusic() {
  const m = (S && S.musique) || { piste: null, volume: 0.7 };
  remplirMusiques($('#proj-music'), [['', '— Aucune musique —']], m.piste || '');
  $('#proj-music-stop').disabled = !m.piste;
  if (document.activeElement !== $('#proj-music-vol')) $('#proj-music-vol').value = Math.round(m.volume * 100);
}
$('#proj-music').addEventListener('change', (ev) => {
  socket.emit(ev.target.value ? 'musique:jouer' : 'musique:stop', { piste: ev.target.value });
  ev.target.blur(); // rend les flèches du clavier à la navigation entre slides
});
$('#proj-music-stop').addEventListener('click', () => socket.emit('musique:stop'));
let projVolTimer = null;
$('#proj-music-vol').addEventListener('input', (ev) => {
  const v = ev.target.value / 100;
  Musique.setGlobal(v); // effet immédiat chez le MJ, puis envoi groupé à tous
  clearTimeout(projVolTimer);
  projVolTimer = setTimeout(() => socket.emit('musique:volume', { volume: v }), 120);
});
$('#proj-music-vol').addEventListener('change', (ev) => ev.target.blur());

$('#proj-prev').addEventListener('click', () => socket.emit('slides:step', { dir: -1 }));
$('#proj-next').addEventListener('click', () => socket.emit('slides:step', { dir: 1 }));
$('#proj-stop').addEventListener('click', () => socket.emit('slides:stop'));
$('#proj-hide').addEventListener('click', () => { hiddenKey = shownKey; renderProjection(); });
$('#projection-pill').addEventListener('click', () => { hiddenKey = null; renderProjection(); });
$('#seq-prev').addEventListener('click', () => socket.emit('slides:step', { dir: -1 }));
$('#seq-next').addEventListener('click', () => socket.emit('slides:step', { dir: 1 }));
$('#seq-stop').addEventListener('click', () => socket.emit('slides:stop'));
document.addEventListener('keydown', (ev) => {
  if (!S || !S.projection || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const surCarte = S.projection.type === 'carte';
  if (!surCarte && $('#projection').hidden) return; // présentation réduite par ce joueur
  if (ev.key === 'Escape' && !surCarte) { hiddenKey = shownKey; renderProjection(); return; }
  if (me.role !== 'mj') return;
  if (surCarte && typeof edit !== 'undefined' && edit.on) return; // éditeur de carte ouvert : les touches lui reviennent
  if (ev.key === 'ArrowRight' || ev.key === ' ' || ev.key === 'PageDown') { ev.preventDefault(); socket.emit('slides:step', { dir: 1 }); }
  if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') { ev.preventDefault(); socket.emit('slides:step', { dir: -1 }); }
});
