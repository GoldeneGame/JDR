'use strict';
/**
 * La Taverne — serveur de table de jeu de rôle.
 * Un MJ (mot de passe) + des joueurs (nom du personnage).
 * État de la partie sauvegardé dans data/partie.json.
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Version .exe (Node « single executable ») : les fichiers de l'interface sont
// embarqués dans l'exécutable, et les données vivent à côté du .exe.
let sea = null;
try { sea = require('node:sea'); if (!sea.isSea()) sea = null; } catch { sea = null; }

const ROOT = sea ? path.dirname(process.execPath) : __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const IMG_DIR = path.join(DATA_DIR, 'images');
const SON_DIR = path.join(DATA_DIR, 'musiques');
const SAVE_FILE = path.join(DATA_DIR, 'partie.json');

fs.mkdirSync(IMG_DIR, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

const CONFIG_FILE = path.join(ROOT, 'config.json');
const DEFAULT_CONFIG = { port: 3000, motDePasseMJ: 'dragon', tunnelCloudflare: true, ouvrirNavigateur: true };
if (!fs.existsSync(CONFIG_FILE)) {
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2)); } catch { /* dossier en lecture seule */ }
}
const config = Object.assign({}, DEFAULT_CONFIG, readJson(CONFIG_FILE, {}));

// ---------------------------------------------------------------- utilitaires
const uid = () => crypto.randomBytes(6).toString('hex');
const norm = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const str = (v, max = 200) => String(v ?? '').slice(0, max);
const num = (v, min, max, def = 0) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const pct = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 50; };
const mod = (v) => Math.floor(((Number(v) || 10) - 10) / 2);
const fmtMod = (m) => (m >= 0 ? '+' : '') + m;
const isColor = (c) => /^#[0-9a-f]{6}$/i.test(String(c || ''));
const COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6',
  '#bfef45', '#469990', '#9a6324', '#e6beff', '#fffac8', '#aaffc3', '#ffd8b1'];

// ---------------------------------------------------------------- dés
/** Formules : 1d20+5, 2d6+1d4-1, 2d20kh1 (avantage), 2d20kl1, 4d6kh3, d% */
function rollFormula(formula) {
  const f = String(formula || '').toLowerCase().replace(/\s+/g, '');
  if (!f || f.length > 60) throw new Error('Formule invalide');
  const re = /([+-])?(?:(\d*)d(\d+|%)(?:(kh|kl)(\d+))?|(\d+))/y;
  const parts = [];
  let pos = 0, total = 0, diceCount = 0;
  while (pos < f.length) {
    re.lastIndex = pos;
    const m = re.exec(f);
    if (!m || !m[0]) throw new Error('Formule invalide : ' + f);
    if (pos > 0 && !m[1]) throw new Error('Formule invalide : ' + f);
    pos = re.lastIndex;
    const sign = m[1] === '-' ? -1 : 1;
    if (m[3]) {
      const n = m[2] ? parseInt(m[2], 10) : 1;
      const faces = m[3] === '%' ? 100 : parseInt(m[3], 10);
      if (n < 1 || n > 100 || faces < 2 || faces > 1000) throw new Error('Trop de dés ou dé invalide');
      diceCount += n;
      if (diceCount > 200) throw new Error('Trop de dés');
      const rolls = Array.from({ length: n }, () => crypto.randomInt(1, faces + 1));
      let kept = rolls.map(() => true);
      if (m[4]) {
        const k = Math.min(n, Math.max(1, parseInt(m[5], 10)));
        const order = rolls.map((v, i) => [v, i]).sort((a, b) => (m[4] === 'kh' ? b[0] - a[0] : a[0] - b[0]));
        const keep = new Set(order.slice(0, k).map(([, i]) => i));
        kept = rolls.map((_, i) => keep.has(i));
      }
      const sum = rolls.reduce((s, v, i) => s + (kept[i] ? v : 0), 0);
      total += sign * sum;
      parts.push({ type: 'dice', sign, n, faces, keep: m[4] ? m[4] + m[5] : null, rolls, kept });
    } else {
      const value = parseInt(m[6], 10);
      total += sign * value;
      parts.push({ type: 'const', sign, value });
    }
  }
  if (!parts.some((p) => p.type === 'dice')) throw new Error('Il faut au moins un dé (ex : 1d20)');
  return { formula: f, total, parts };
}

// ---------------------------------------------------------------- état de la partie
const defaultState = () => ({
  characters: {},
  scenes: [],
  scene: { actif: null, grille: true, cellule: 70 },
  tokens: {},
  initiative: { entries: [], actif: null, round: 1 },
  log: [],
});
const saved = readJson(SAVE_FILE, {});
const state = Object.assign(defaultState(), saved);
state.scene = Object.assign(defaultState().scene, saved.scene || {});
state.initiative = Object.assign(defaultState().initiative, saved.initiative || {});

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
}
function saveNow() {
  clearTimeout(saveTimer);
  try {
    fs.writeFileSync(SAVE_FILE + '.tmp', JSON.stringify(state, null, 1));
    fs.renameSync(SAVE_FILE + '.tmp', SAVE_FILE);
  } catch (e) { console.error('Sauvegarde impossible :', e.message); }
}

function newCharacter(name) {
  const used = new Set(Object.values(state.characters).map((c) => c.couleur));
  return {
    id: uid(), name, race: '', classe: '', niveau: 1, alignement: '', historique: '',
    pv: 10, pvMax: 10, pvTemp: 0, ca: 10, vitesse: 9, xp: 0, po: 0,
    stats: { for: 10, dex: 10, con: 10, int: 10, sag: 10, cha: 10 },
    competences: '', inventaire: '', sorts: '', notes: '',
    couleur: COLORS.find((c) => !used.has(c)) || COLORS[Math.floor(Math.random() * COLORS.length)],
  };
}

// ---- apparence des pions (« skins »)
const CONTENUS = ['figurine', 'initiales', 'embleme', 'image', 'monstre'];
const VISUELS_MONSTRES = ['rat', 'serpent', 'bandit', 'kobold', 'gobelin', 'squelette', 'zombie', 'loup', 'sanglier', 'chauvesouris', 'orc', 'hobgobelin', 'gnoll', 'araignee', 'goule', 'spectre', 'ours', 'scorpion', 'ogre', 'chevalier', 'mage', 'troll', 'demon', 'golem', 'dragon', 'vampire'];
const FORMES = ['socle', 'rond', 'carre', 'hexa', 'ecu'];
const CADRES = ['simple', 'bronze', 'argent', 'or', 'feu', 'glace', 'nature', 'arcane', 'ombre', 'sacre', 'sang'];

// Petit personnage personnalisable : chaque option est une liste fermée (le client dessine le SVG).
const FIG_ENUMS = {
  cheveux: ['chauve', 'court', 'long', 'herisse', 'queue', 'chignon'],
  barbe: ['aucune', 'courte', 'longue', 'moustache'],
  oreilles: ['humaines', 'elfiques'],
  tenue: ['tunique', 'robe', 'armure', 'cuir'],
  tete: ['rien', 'casque', 'capuche', 'mage', 'couronne', 'cornes', 'bandeau'],
  arme: ['aucune', 'epee', 'hache', 'baton', 'arc', 'dague', 'masse', 'lance'],
};
const FIG_COLORS = ['peau', 'couleurCheveux', 'couleurTenue', 'couleurCape'];
const FIG_BOOLS = ['crocs', 'bouclier', 'cape'];
const PEAUX = ['#f6d3b3', '#e8b48a', '#c68642', '#8d5524', '#5c3a1e'];
const CHEVEUX = ['#2b1a10', '#6b3e1f', '#c98a3a', '#e8d27a', '#b8b8b8', '#a3271b'];
const TENUES = ['#24456b', '#7a1f1f', '#2f6b2f', '#5b2a86', '#8a6a2a'];

function defaultFigurine() {
  const r = (l) => l[Math.floor(Math.random() * l.length)];
  return {
    peau: r(PEAUX), cheveux: r(['court', 'long', 'queue', 'herisse']), couleurCheveux: r(CHEVEUX),
    barbe: 'aucune', oreilles: 'humaines', crocs: false,
    tenue: r(['tunique', 'cuir', 'armure']), couleurTenue: r(TENUES),
    tete: 'rien', arme: r(['epee', 'hache', 'baton', 'arc', 'dague']), bouclier: false,
    cape: true, couleurCape: r(TENUES),
  };
}
function normalizeFigurine(f = {}, base = defaultFigurine()) {
  const out = {};
  for (const [k, list] of Object.entries(FIG_ENUMS)) out[k] = list.includes(f[k]) ? f[k] : (list.includes(base[k]) ? base[k] : list[0]);
  for (const k of FIG_COLORS) out[k] = isColor(f[k]) ? f[k] : (isColor(base[k]) ? base[k] : '#888888');
  for (const k of FIG_BOOLS) out[k] = typeof f[k] === 'boolean' ? f[k] : !!base[k];
  return out;
}

function normalizeSkin(s = {}, base = {}) {
  const pick = (v, list, def) => (list.includes(v) ? v : def);
  const skin = {
    contenu: pick(s.contenu, CONTENUS, pick(base.contenu, CONTENUS, 'initiales')),
    embleme: s.embleme !== undefined ? str(s.embleme, 16) : (base.embleme || '⚔️'),
    image: base.image || null, // l'image ne change que via « token:image »
    forme: pick(s.forme, FORMES, pick(base.forme, FORMES, 'rond')),
    cadre: pick(s.cadre, CADRES, pick(base.cadre, CADRES, 'simple')),
    figurine: normalizeFigurine(s.figurine && typeof s.figurine === 'object' ? s.figurine : {}, base.figurine || defaultFigurine()),
    monstre: pick(s.monstre, VISUELS_MONSTRES, pick(base.monstre, VISUELS_MONSTRES, 'gobelin')),
  };
  if (skin.contenu === 'image' && !skin.image) skin.contenu = 'initiales';
  return skin;
}
for (const t of Object.values(state.tokens)) t.skin = normalizeSkin({}, t.skin || {});

function removeTokenImage(t) {
  const img = t && t.skin && t.skin.image;
  if (img && /^\/images\/pion-[a-f0-9]+\.(png|jpg|webp)$/.test(img)) fs.unlink(path.join(IMG_DIR, path.basename(img)), () => {});
}

/** Première place libre en haut à gauche de la carte, pour que les nouveaux pions ne se chevauchent pas. */
function freeSpot(taille = 1) {
  const taken = Object.values(state.tokens);
  // les grandes créatures prennent plus de place (et les figurines debout dépassent vers le haut)
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 13; col++) {
      const x = 5 + col * 7 + (taille - 1) * 3;
      const y = 12 + row * 11 + (taille - 1) * 6;
      if (x > 95 || y > 92) continue;
      if (!taken.some((t) => Math.abs(t.x - x) < 3.4 * ((t.taille || 1) + taille) && Math.abs(t.y - y) < 5 * ((t.taille || 1) + taille))) return { x, y };
    }
  }
  return { x: 10 + Math.random() * 40, y: 10 + Math.random() * 40 };
}

function createToken({ label, couleur, taille = 1, ownerId = null, cache = false, skin = null, stats = null }) {
  const t = {
    id: uid(), label: str(label, 30), couleur: isColor(couleur) ? couleur : '#8b1e1e',
    taille: num(taille, 1, 4, 1), ownerId, cache: !!cache,
    ...freeSpot(num(taille, 1, 4, 1)),
    skin: normalizeSkin(skin || (ownerId ? { contenu: 'figurine', forme: 'socle', cadre: 'or' } : { cadre: 'simple' })),
  };
  // Monstres / PNJ : points de vie, CA et attaque (les PV des joueurs sont sur leur fiche)
  if (!ownerId && stats) {
    t.pvMax = num(stats.pv, 1, 9999, 10);
    t.pv = t.pvMax;
    t.ca = num(stats.ca, 0, 50, 10);
    if (stats.attaque) t.attaque = str(stats.attaque, 60);
    if (stats.degats) t.degats = str(stats.degats, 40);
    if (stats.modele) t.modele = str(stats.modele, 30);
  }
  state.tokens[t.id] = t;
  return t;
}

// ---------------------------------------------------------------- bestiaire (monstres prêts à poser)
// pv : formule de dés (la moyenne est utilisée, ou un jet si le MJ le demande) ; dex : bonus d'initiative
const BESTIAIRE = [
  { id: 'rat', nom: 'Rat géant', fp: '1/8', pv: '2d6', ca: 12, dex: 2, emb: '🐀', couleur: '#6b5a4a', attaque: 'Morsure +4', degats: '1d4+2' },
  { id: 'serpent', nom: 'Serpent venimeux', fp: '1/8', pv: '2d4', ca: 13, dex: 3, emb: '🐍', couleur: '#4a7a2a', attaque: 'Morsure +5', degats: '1d4+3d4' },
  { id: 'bandit', nom: 'Bandit', fp: '1/8', pv: '2d8+2', ca: 12, dex: 1, emb: '🗡️', couleur: '#5a3a2a', attaque: 'Cimeterre +3', degats: '1d6+1' },
  { id: 'kobold', nom: 'Kobold', fp: '1/8', pv: '2d6', ca: 12, dex: 2, emb: '🐲', couleur: '#a0522d', attaque: 'Dague +4', degats: '1d4+2' },
  { id: 'gobelin', nom: 'Gobelin', fp: '1/4', pv: '2d6', ca: 15, dex: 2, emb: '👺', couleur: '#4f7a2a', attaque: 'Cimeterre +4', degats: '1d6+2' },
  { id: 'squelette', nom: 'Squelette', fp: '1/4', pv: '2d8+4', ca: 13, dex: 2, emb: '💀', couleur: '#8a8270', cadre: 'ombre', attaque: 'Épée courte +4', degats: '1d6+2' },
  { id: 'zombie', nom: 'Zombie', fp: '1/4', pv: '3d8+9', ca: 8, dex: -2, emb: '🧟', couleur: '#5d7a4a', cadre: 'ombre', attaque: 'Coup +3', degats: '1d6+1' },
  { id: 'loup', nom: 'Loup', fp: '1/4', pv: '2d8+2', ca: 13, dex: 2, emb: '🐺', couleur: '#6a6a6a', cadre: 'nature', attaque: 'Morsure +4', degats: '2d4+2' },
  { id: 'sanglier', nom: 'Sanglier', fp: '1/4', pv: '2d8+2', ca: 11, dex: 0, emb: '🐗', couleur: '#5a3a1a', cadre: 'nature', attaque: 'Défenses +3', degats: '1d6+1' },
  { id: 'chauvesouris', nom: 'Chauve-souris géante', fp: '1/4', pv: '4d10', ca: 13, dex: 3, emb: '🦇', couleur: '#3a2a3a', cadre: 'ombre', attaque: 'Morsure +4', degats: '1d6+2' },
  { id: 'orc', nom: 'Orc', fp: '1/2', pv: '2d8+6', ca: 13, dex: 1, emb: '🪓', couleur: '#4a6a2a', cadre: 'sang', attaque: 'Hache à deux mains +5', degats: '1d12+3' },
  { id: 'hobgobelin', nom: 'Hobgobelin', fp: '1/2', pv: '2d8+2', ca: 18, dex: 1, emb: '🛡️', couleur: '#8a3a1a', cadre: 'bronze', attaque: 'Épée longue +3', degats: '1d8+1' },
  { id: 'gnoll', nom: 'Gnoll', fp: '1/2', pv: '5d8', ca: 15, dex: 1, emb: '🦴', couleur: '#8a6a3a', cadre: 'sang', attaque: 'Lance +4', degats: '1d6+2' },
  { id: 'araignee', nom: 'Araignée géante', fp: '1', pv: '4d10+4', ca: 14, dex: 3, emb: '🕷️', couleur: '#2a2a2a', cadre: 'ombre', taille: 2, attaque: 'Morsure +5 (poison)', degats: '1d8+3+2d8' },
  { id: 'goule', nom: 'Goule', fp: '1', pv: '5d8', ca: 12, dex: 2, emb: '🧟', couleur: '#6a5a7a', cadre: 'ombre', attaque: 'Griffes +4 (paralysie)', degats: '2d4+2' },
  { id: 'spectre', nom: 'Spectre', fp: '1', pv: '5d8', ca: 12, dex: 2, emb: '👻', couleur: '#5a6a8a', cadre: 'arcane', attaque: 'Toucher +4', degats: '3d6' },
  { id: 'ours', nom: 'Ours brun', fp: '1', pv: '4d10+12', ca: 11, dex: 0, emb: '🐻', couleur: '#6a4a2a', cadre: 'nature', taille: 2, attaque: 'Griffes +6', degats: '2d6+4' },
  { id: 'scorpion', nom: 'Scorpion géant', fp: '3', pv: '7d10+14', ca: 15, dex: 1, emb: '🦂', couleur: '#8a5a2a', taille: 2, attaque: 'Pince +4', degats: '1d8+2' },
  { id: 'ogre', nom: 'Ogre', fp: '2', pv: '7d10+21', ca: 11, dex: -1, emb: '👹', couleur: '#7a5a3a', cadre: 'bronze', taille: 2, attaque: 'Massue +6', degats: '2d8+4' },
  { id: 'chevalier', nom: 'Chevalier noir', fp: '3', pv: '8d8+16', ca: 18, dex: 0, emb: '⚔️', couleur: '#2a2a3a', cadre: 'argent', attaque: 'Épée longue +5 (×2)', degats: '1d8+3' },
  { id: 'mage', nom: 'Mage maléfique', fp: '6', pv: '9d8', ca: 12, dex: 2, emb: '🧙', couleur: '#4a2a6a', cadre: 'arcane', attaque: 'Trait de feu +6', degats: '4d10' },
  { id: 'troll', nom: 'Troll', fp: '5', pv: '8d10+40', ca: 15, dex: 1, emb: '🧌', couleur: '#3a6a4a', cadre: 'nature', taille: 2, attaque: 'Griffes +7 (×2)', degats: '2d6+4' },
  { id: 'demon', nom: 'Démon', fp: '6', pv: '11d10+33', ca: 15, dex: 2, emb: '😈', couleur: '#7a1a1a', cadre: 'feu', taille: 2, attaque: 'Griffes +6', degats: '2d6+3' },
  { id: 'golem', nom: 'Golem de pierre', fp: '10', pv: '17d10+85', ca: 17, dex: -1, emb: '🗿', couleur: '#7a7a7a', cadre: 'argent', taille: 2, attaque: 'Coup +10 (×2)', degats: '3d8+6' },
  { id: 'dragon', nom: 'Jeune dragon rouge', fp: '10', pv: '17d10+85', ca: 18, dex: 0, emb: '🐉', couleur: '#a01a1a', cadre: 'feu', taille: 3, attaque: 'Morsure +10', degats: '2d10+6+1d6' },
  { id: 'vampire', nom: 'Vampire', fp: '13', pv: '17d8+68', ca: 16, dex: 4, emb: '🧛', couleur: '#3a0a1a', cadre: 'sang', attaque: 'Morsure +9', degats: '1d6+4+3d6' },
];
/** Moyenne d'une formule de dés (ex. 2d6+2 → 9). */
function avgFormula(f) {
  return Math.max(1, Math.floor(rollFormula(f).parts.reduce((s, p) => s + p.sign * (p.type === 'dice' ? p.n * (p.faces + 1) / 2 : p.value), 0)));
}
for (const m of BESTIAIRE) m.pvMoyen = avgFormula(m.pv);

/** Nom libre suivant : « Gobelin 3 » s'il y a déjà Gobelin 1 et 2. */
function nextLabel(nom) {
  let max = 0;
  const re = new RegExp('^' + nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' (\\d+)$');
  for (const t of Object.values(state.tokens)) { const m = re.exec(t.label); if (m) max = Math.max(max, Number(m[1])); }
  return `${nom} ${max + 1}`;
}

const TEXT_FIELDS = { race: 40, classe: 40, alignement: 40, historique: 60, competences: 5000, inventaire: 5000, sorts: 5000, notes: 5000 };
const NUM_FIELDS = { niveau: [1, 30], pv: [-999, 9999], pvMax: [1, 9999], pvTemp: [0, 999], ca: [0, 50], vitesse: [0, 99], xp: [0, 9999999], po: [0, 9999999] };
const STAT_KEYS = ['for', 'dex', 'con', 'int', 'sag', 'cha'];

function applyPatch(c, patch) {
  for (const [k, max] of Object.entries(TEXT_FIELDS)) if (k in patch) c[k] = str(patch[k], max);
  for (const [k, [min, max]] of Object.entries(NUM_FIELDS)) if (k in patch) c[k] = num(patch[k], min, max, c[k]);
  if (patch.stats && typeof patch.stats === 'object') {
    for (const k of STAT_KEYS) if (k in patch.stats) c.stats[k] = num(patch.stats[k], 1, 30, c.stats[k]);
  }
  if ('couleur' in patch && isColor(patch.couleur)) c.couleur = patch.couleur;
  if ('name' in patch) {
    const name = str(patch.name, 40).trim();
    const taken = Object.values(state.characters).some((o) => o.id !== c.id && norm(o.name) === norm(name));
    if (name.length >= 2 && !taken) c.name = name;
  }
  // Répercute nom / couleur sur le pion et l'initiative
  for (const t of Object.values(state.tokens)) if (t.ownerId === c.id) { t.label = c.name; t.couleur = c.couleur; }
  for (const e of state.initiative.entries) if (e.charId === c.id) { e.name = c.name; e.couleur = c.couleur; }
}

function sortInitiative() {
  state.initiative.entries.sort((a, b) => b.valeur - a.valeur);
}

// ---------------------------------------------------------------- diaporamas (slides projetées aux joueurs)
const SLIDE_STYLES = ['parchemin', 'sombre', 'sang', 'mystique', 'nature', 'glace', 'epique'];
state.slides = Object.assign({ decks: [], projection: null }, state.slides || {});

const TRANSITIONS = ['fondu', 'noir', 'aucune'];

/** Étape d'un déroulé : une slide projetée, ou une carte (scène) affichée sur la table. */
function newSlide(p = {}) {
  const commun = {
    id: uid(),
    // musique lancée quand l'étape arrive : null = ne rien changer, 'stop' = couper, sinon une piste
    musique: typeof p.musique === 'string' && /^(stop|f:[\w-]{1,40}|[a-z]{2,20})$/.test(p.musique) ? p.musique : null,
    transition: TRANSITIONS.includes(p.transition) ? p.transition : 'fondu',
  };
  if (p.type === 'carte') {
    return { ...commun, type: 'carte', sceneId: typeof p.sceneId === 'string' ? p.sceneId.slice(0, 40) : null };
  }
  return {
    ...commun,
    titre: str(p.titre, 120),
    texte: str(p.texte, 3000),
    style: SLIDE_STYLES.includes(p.style) ? p.style : 'parchemin',
    image: typeof p.image === 'string' && /^\/images\/[\w.-]+$/.test(p.image) ? p.image : null,
  };
}
const findDeck = (id) => state.slides.decks.find((d) => d.id === id);

/** Applique l'étape qui vient d'arriver : sa musique, et la carte à afficher s'il s'agit d'une carte. */
function appliquerEtape() {
  const p = state.slides.projection;
  const etape = p && findDeck(p.deckId)?.slides[p.index];
  if (!etape) return;
  const m = etape.musique;
  if (m === 'stop') musique.piste = null;
  else if (m && (PISTES_MUSIQUE.includes(m) || (m.startsWith('f:') && state.musiquesPerso.some((x) => 'f:' + x.id === m)))) musique.piste = m;
  if (etape.type === 'carte') {
    const sc = state.scenes.find((s) => s.id === etape.sceneId);
    if (sc && state.scene.actif !== sc.id) {
      state.scene.actif = sc.id;
      system(`Nouvelle scène : ${sc.titre}`);
    }
  }
}

/** Slide projetée en ce moment (ce que voient les joueurs), ou null. */
function currentProjection() {
  const p = state.slides.projection;
  const deck = p && findDeck(p.deckId);
  const slide = deck && deck.slides[p.index];
  if (!slide) return null;
  const extra = slide.type === 'carte' ? { titre: (state.scenes.find((sc) => sc.id === slide.sceneId) || {}).titre || 'Carte' } : {};
  return { deckId: deck.id, deckTitre: deck.titre, index: p.index, total: deck.slides.length, ...slide, ...extra };
}

// ---------------------------------------------------------------- serveur
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json',
};
const app = express();
if (sea) {
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const rel = req.path === '/' ? 'index.html' : req.path.replace(/^\/+/, '');
    let data;
    try { data = sea.getAsset('public/' + rel); } catch { return next(); }
    res.type(MIME[path.extname(rel)] || 'application/octet-stream').send(Buffer.from(data));
  });
} else {
  app.use(express.static(path.join(ROOT, 'public')));
}
app.use('/images', express.static(IMG_DIR, { maxAge: '1d' }));
app.use('/musiques', express.static(SON_DIR, { maxAge: '7d' }));
// Import d'une musique par le MJ (MP3, OGG, M4A, WAV…) : envoyée en HTTP, trop lourde pour le WebSocket
const SON_EXT = { 'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/ogg': '.ogg', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/wave': '.wav',
  'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/aac': '.aac', 'audio/webm': '.webm', 'audio/flac': '.flac', 'audio/x-flac': '.flac' };
app.post('/api/musique', express.raw({ type: () => true, limit: '120mb' }), (req, res) => {
  if (String(req.get('x-mj-password') || '') !== String(config.motDePasseMJ)) return res.status(403).json({ ok: false, error: 'Réservé au MJ.' });
  const ext = SON_EXT[String(req.get('content-type') || '').split(';')[0].trim().toLowerCase()];
  if (!ext) return res.status(400).json({ ok: false, error: 'Format non reconnu (MP3, OGG, M4A, WAV, FLAC…).' });
  if (!req.body || !req.body.length) return res.status(400).json({ ok: false, error: 'Fichier vide.' });
  if (state.musiquesPerso.length >= 100) return res.status(400).json({ ok: false, error: 'Bibliothèque pleine (100 musiques).' });
  fs.mkdirSync(SON_DIR, { recursive: true });
  const id = uid();
  const fichier = id + ext;
  fs.writeFile(path.join(SON_DIR, fichier), req.body, (err) => {
    if (err) return res.status(500).json({ ok: false, error: "Impossible d'enregistrer le fichier." });
    let nom = '';
    try { nom = decodeURIComponent(String(req.get('x-nom') || '')); } catch { /* nom illisible */ }
    nom = str(nom.replace(/.[a-z0-9]{2,4}$/i, '').replace(/[_]+/g, ' '), 60).trim() || 'Musique';
    const icone = str(String(req.get('x-icone') || ''), 8) || '🎵';
    state.musiquesPerso.push({ id, nom, fichier, icone });
    save();
    broadcastState();
    res.json({ ok: true, id });
  });
});
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 15e6, serveClient: false });

let tunnelUrl = null;
state.musiquesPerso = Array.isArray(state.musiquesPerso) ? state.musiquesPerso : [];
// Musique d'ambiance choisie par le MJ (jouée chez tout le monde ; non sauvegardée : silence au redémarrage)
const PISTES_MUSIQUE = ['taverne', 'voyage', 'foret', 'feu', 'donjon', 'mystere', 'combat', 'boss', 'victoire', 'tristesse', 'orage'];
const musique = { piste: null, volume: 0.7 };
const lanUrls = () => Object.values(os.networkInterfaces()).flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => `http://${i.address}:${config.port}`);

function presence() {
  const online = new Set();
  let mj = false;
  for (const so of io.sockets.sockets.values()) {
    if (so.data.role === 'player') online.add(so.data.charId);
    if (so.data.role === 'mj') mj = true;
  }
  return { online, mj };
}

function viewFor(so) {
  const isMj = so.data.role === 'mj';
  const { online, mj } = presence();
  const characters = {};
  for (const c of Object.values(state.characters)) {
    characters[c.id] = isMj || c.id === so.data.charId
      ? { ...c, online: online.has(c.id) }
      : { id: c.id, name: c.name, race: c.race, classe: c.classe, niveau: c.niveau, pv: c.pv, pvMax: c.pvMax,
          couleur: c.couleur, online: online.has(c.id), resume: true };
  }
  const tokens = {};
  for (const t of Object.values(state.tokens)) {
    if (!isMj && !visibleJoueurs(t)) continue;
    // Les joueurs ne voient pas les PV exacts des monstres : seulement leur état (par quarts)
    tokens[t.id] = isMj || t.ownerId || !t.pvMax ? t
      : { ...t, pv: undefined, pvMax: undefined, attaque: undefined, degats: undefined, sante: t.pv <= 0 ? 0 : Math.ceil((t.pv / t.pvMax) * 4) / 4 };
  }
  const active = state.scenes.find((s) => s.id === state.scene.actif);
  const ini = state.initiative;
  return {
    characters,
    tokens,
    scene: {
      ...state.scene,
      id: active ? active.id : null,
      image: active ? active.image : null,
      titre: active ? active.titre : '',
      battle: !!(active && !active.image),
      cellule: (active && active.cellule) || state.scene.cellule,
      grillePropre: !!(active && active.cellule),
      cols: active ? active.cols : null,
      rows: active ? active.rows : null,
      fond: active ? active.fond || null : null,
      sol: (active && active.sol) || {},
      deco: (active && active.deco) || {},
      portes: (active && active.portes) || {},
      eclairage: active ? eclairageDe(active) : defaultEclairage(),
      ombres: active && active.ombres && /[1-4]/.test(active.ombres.niv) ? { cols: active.ombres.cols, rows: active.ombres.rows,
        fx: active.ombres.fx, fy: active.ombres.fy, rle: rleNiv(active.ombres.niv) } : null,
      brouillard: active && active.brouillard ? { actif: active.brouillard.actif, cols: active.brouillard.cols, rows: active.brouillard.rows,
        auto: active.brouillard.auto, vue: active.brouillard.vue, fx: active.brouillard.fx, fy: active.brouillard.fy, rle: rle(active.brouillard.vu) } : null,
    },
    scenes: isMj ? state.scenes.map((s) => ({ id: s.id, titre: s.titre, image: s.image, battle: !s.image, fond: s.fond || null })) : [],
    initiative: {
      round: ini.round,
      actif: isMj || !ini.entries.find((e) => e.id === ini.actif)?.cache ? ini.actif : null,
      entries: ini.entries.filter((e) => isMj || !e.cache),
    },
    mjOnline: mj,
    liens: isMj ? { tunnel: tunnelUrl, local: lanUrls() } : null,
    projection: currentProjection(),
    musique,
    musiquesPerso: state.musiquesPerso,
    bestiaire: isMj ? BESTIAIRE.map(({ id, nom, fp, pv, pvMoyen, ca, emb, taille, attaque, degats }) => ({ id, nom, fp, pv, pvMoyen, ca, emb, taille: taille || 1, attaque, degats })) : null,
    slides: isMj ? { decks: state.slides.decks } : null,
  };
}

function broadcastState() {
  for (const so of io.sockets.sockets.values()) if (so.data.role) so.emit('state', viewFor(so));
}

function canSee(so, e) {
  if (!so.data.role) return false;
  if (so.data.role === 'mj') return true;
  return !e.visibleTo || e.visibleTo.includes(so.data.charId);
}

function addLog(entry) {
  entry.id = uid();
  entry.t = Date.now();
  state.log.push(entry);
  if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
  for (const so of io.sockets.sockets.values()) if (canSee(so, entry)) so.emit('log', entry);
  save();
}

const system = (text) => addLog({ type: 'system', text });

/** Dégâts (ou soins) sur un pion : la fiche du joueur, ou les PV du monstre. */
function applyHit(t, n, soin) {
  const c = t.ownerId && state.characters[t.ownerId];
  const visibleTo = visibleJoueurs(t) ? null : []; // monstre caché (ou dans le brouillard) : seul le MJ est informé
  let text;
  if (c) {
    if (soin) {
      const avant = Math.max(0, c.pv);
      c.pv = Math.min(c.pvMax, avant + n);
      text = `💚 ${c.name} récupère ${c.pv - avant} PV (${c.pv}/${c.pvMax}).` + (avant === 0 && c.pv > 0 ? ' Et se relève !' : '');
    } else {
      const absorbe = Math.min(c.pvTemp || 0, n);
      c.pvTemp = (c.pvTemp || 0) - absorbe;
      const avant = c.pv;
      c.pv = Math.max(0, c.pv - (n - absorbe));
      text = `💥 ${c.name} subit ${n} dégâts${absorbe ? ` (dont ${absorbe} absorbés)` : ''} : ${c.pv}/${c.pvMax} PV.`
        + (c.pv === 0 && avant > 0 ? ` 🩸 ${c.name} est à terre !` : '');
    }
  } else if (t.pvMax) {
    if (soin) {
      t.pv = Math.min(t.pvMax, Math.max(0, t.pv) + n);
      if (t.pv > 0) t.mort = false;
      text = `💚 ${t.label} récupère des forces.`;
    } else {
      const avant = t.pv;
      t.pv = Math.max(0, t.pv - n);
      text = `💥 ${t.label} subit ${n} dégâts.`;
      if (t.pv === 0 && avant > 0) { t.mort = true; text += ` 💀 ${t.label} est hors de combat !`; }
    }
  } else {
    text = soin ? `💚 ${t.label} récupère ${n} PV.` : `💥 ${t.label} subit ${n} dégâts.`;
  }
  addLog({ type: 'combat', soin: !!soin, text, visibleTo });
  for (const so of io.sockets.sockets.values()) {
    if (so.data.role === 'mj' || (so.data.role && visibleJoueurs(t))) so.emit('degats:effet', { id: t.id, n, soin: !!soin });
  }
}

// ---------------------------------------------------------------- battle maps (sol + décor peints case par case)
const SOLS = ['herbe', 'foret', 'terre', 'sable', 'neige', 'paves', 'dalles', 'plancher', 'tapis', 'eau', 'eau-prof', 'marais',
  'glace', 'lave', 'gouffre', 'mur', 'roche', 'fleurs', 'chemin', 'gravier', 'boue', 'cendres', 'marbre', 'pont',
  'acide', 'cristal', 'palissade', 'arbres'];
const DECOS = ['🌲', '🌳', '🌴', '🌵', '🌿', '🌾', '🌸', '🍂', '🍄', '🪨', '🪵', '🐚',
  '🕳️', '🔥', '⛺', '🛢️', '📦', '🧺', '🪣', '🪜', '🪧', '🛶', '⚓', '🏮',
  '🔔', '🎯', '🚪', '🪑', '🛏️', '🛁', '📚', '🕯️', '🪔', '🍺', '🍷', '🍖',
  '🍞', '🫖', '🕰️', '🪞', '🧹', '🗝️', '🗿', '🏛️', '⛲', '⚰️', '🪦', '⚱️',
  '🏺', '🕸️', '🦴', '💀', '⛓️', '🧱', '⚠️', '🪤', '🌀', '🔮', '💰', '🪙',
  '💎', '👑', '💍', '🧪', '⚗️', '📜', '📖', '🗺️', '🗡️', '⚔️', '🛡️', '🏹',
  '🪓', '❌', '⭕', '⭐', '❓', '❗', '☠️', '🩸', '👣'];
const activeScene = () => state.scenes.find((s) => s.id === state.scene.actif);

// ---------------------------------------------------------------- éclairage dynamique (par carte)
const TYPES_LUMIERE = ['aucune', 'bougie', 'torche', 'lanterne', 'feu', 'magique', 'arcane', 'infernale', 'feerique', 'lune'];
const defaultEclairage = () => ({ actif: false, nuit: 0.8, murs: true, decor: true, lumieres: [] });
function eclairageDe(sc) {
  if (!sc) return null;
  sc.eclairage = Object.assign(defaultEclairage(), sc.eclairage || {});
  return sc.eclairage;
}
// ---------------------------------------------------------------- brouillard de guerre (par carte)
// vu : une chaîne de '0' (caché) / '1' (révélé), une lettre par case ; fx/fy : rapport image/grille pour les cartes importées
const MURS_SOL = new Set(['mur', 'roche', 'palissade', 'arbres']);
const PORTEE_LUMIERE = { bougie: 2, torche: 8, lanterne: 12, feu: 8, magique: 8, arcane: 6, infernale: 6, feerique: 4, lune: 16 };
function brouillardDe(sc, cols, rows) {
  if (!sc) return null;
  const b = Object.assign({ actif: false, cols: 0, rows: 0, vu: '', auto: true, vue: 6, fx: 1, fy: 1 }, sc.brouillard || {});
  if (!sc.image) { cols = sc.cols; rows = sc.rows; }
  cols = Math.min(400, Math.max(1, Math.round(cols || b.cols || 1)));
  rows = Math.min(400, Math.max(1, Math.round(rows || b.rows || 1)));
  if (b.cols !== cols || b.rows !== rows || b.vu.length !== cols * rows) {
    // nouvelle taille : on garde ce qui était déjà révélé
    const old = b;
    let vu = '';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) vu += c < old.cols && r < old.rows && old.vu[c + r * old.cols] === '1' ? '1' : '0';
    b.cols = cols; b.rows = rows; b.vu = vu;
  }
  sc.brouillard = b;
  return b;
}
/** Encodage compact pour l'envoi : longueurs des suites de cases, en commençant par les cases cachées. */
function rle(vu) {
  const out = [];
  let cur = '0';
  let n = 0;
  for (const ch of vu) { if (ch === cur) n++; else { out.push(n); cur = ch; n = 1; } }
  out.push(n);
  return out;
}
// ---------------------------------------------------------------- zones d'ombre peintes par le MJ
// niv : une lettre par case, '0' (aucune) à '4' (ténèbres totales : rien n'est visible, pas même les pions)
function ombresDe(sc, cols, rows) {
  if (!sc) return null;
  const o = Object.assign({ cols: 0, rows: 0, niv: '', fx: 1, fy: 1 }, sc.ombres || {});
  if (!sc.image) { cols = sc.cols; rows = sc.rows; }
  cols = Math.min(400, Math.max(1, Math.round(cols || o.cols || 1)));
  rows = Math.min(400, Math.max(1, Math.round(rows || o.rows || 1)));
  if (o.cols !== cols || o.rows !== rows || o.niv.length !== cols * rows) {
    let niv = '';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) niv += c < o.cols && r < o.rows ? (o.niv[c + r * o.cols] || '0') : '0';
    o.cols = cols; o.rows = rows; o.niv = niv;
  }
  sc.ombres = o;
  return o;
}
/** Encodage compact : [lettre, longueur, lettre, longueur…] */
function rleNiv(str) {
  const out = [];
  for (let i = 0; i < str.length;) { let j = i; while (j < str.length && str[j] === str[i]) j++; out.push(str[i], j - i); i = j; }
  return out;
}
const fogCell = (b, t) => [Math.floor((t.x / 100) * b.cols * b.fx), Math.floor((t.y / 100) * b.rows * b.fy)];
/** Un pion est-il visible des joueurs ? (pas caché par le MJ, et pas dans le brouillard — les pions des joueurs le sont toujours) */
function visibleJoueurs(t) {
  if (!t || t.cache) return false;
  if (t.ownerId) return true;
  const sc = activeScene();
  const b = sc && sc.brouillard;
  const o = sc && sc.ombres;
  if (o && o.niv && o.niv.includes('4')) {
    const [oc, orr] = fogCell(o, t);
    if (oc >= 0 && orr >= 0 && oc < o.cols && orr < o.rows && o.niv[oc + orr * o.cols] === '4') return false; // ténèbres totales
  }
  if (!b || !b.actif || !b.vu) return true;
  const [c, r] = fogCell(b, t);
  if (c < 0 || r < 0 || c >= b.cols || r >= b.rows) return true;
  return b.vu[c + r * b.cols] === '1';
}
/** Exploration : un pion de joueur révèle les cases qu'il voit (portée de vue, murs qui bloquent). Renvoie true si du nouveau. */
function explorer(t) {
  const sc = activeScene();
  const b = sc && sc.brouillard;
  if (!b || !b.actif || !b.auto || !t.ownerId) return false;
  const e = sc.eclairage;
  let R = b.vue;
  if (e && e.actif && e.nuit > 0.3) R = Math.max(1.5, PORTEE_LUMIERE[t.lumiere] || 0, t.vision || 0);
  const cx = (t.x / 100) * b.cols * b.fx;
  const cy = (t.y / 100) * b.rows * b.fy;
  const wall = (c, r) => MURS_SOL.has((sc.sol && sc.sol[c + ',' + r]) || sc.fond) || porteFermee(sc, c, r);
  const c0 = Math.floor(cx); const r0 = Math.floor(cy);
  const vu = b.vu.split('');
  let neuf = false;
  for (let r = Math.max(0, Math.floor(cy - R)); r <= Math.min(b.rows - 1, Math.ceil(cy + R)); r++) {
    for (let c = Math.max(0, Math.floor(cx - R)); c <= Math.min(b.cols - 1, Math.ceil(cx + R)); c++) {
      const i = c + r * b.cols;
      if (vu[i] === '1') continue;
      const tx = c + 0.5; const ty = r + 0.5;
      const d = Math.hypot(tx - cx, ty - cy);
      if (d > R + 0.5) continue;
      // ligne de vue : aucun mur entre le pion et la case (la case visée peut être un mur)
      let libre = true;
      const steps = Math.ceil(d * 3);
      for (let k = 1; k < steps; k++) {
        const px = Math.floor(cx + ((tx - cx) * k) / steps); const py = Math.floor(cy + ((ty - cy) * k) / steps);
        if ((px === c && py === r) || (px === c0 && py === r0)) continue;
        if (wall(px, py)) { libre = false; break; }
      }
      if (libre) { vu[i] = '1'; neuf = true; }
    }
  }
  if (neuf) b.vu = vu.join('');
  return neuf;
}
/** Portes : un 🚪 du décor. État dans scene.portes : 'o' ouverte, 'v' verrouillée, absente = fermée. */
const PORTE = '🚪';
const estPorte = (sc, c, r) => !!(sc && sc.deco && sc.deco[c + ',' + r] === PORTE);
const porteFermee = (sc, c, r) => estPorte(sc, c, r) && !(sc.portes && sc.portes[c + ',' + r] === 'o');
/** Géométrie de la grille (en % de la carte) quand on la connaît : battle map, ou carte importée avec brouillard. */
function grilleDe(sc) {
  if (!sc.image) return { cols: sc.cols, rows: sc.rows, fx: 1, fy: 1 };
  const b = sc.brouillard;
  return b && b.cols ? { cols: b.cols, rows: b.rows, fx: b.fx || 1, fy: b.fy || 1 } : null;
}
let fogTimer = null;
/** Diffusion groupée (pendant qu'un pion avance, on ne renvoie pas l'état à chaque pas). */
function broadcastSoon() {
  if (fogTimer) return;
  fogTimer = setTimeout(() => { fogTimer = null; broadcastState(); save(); }, 150);
}
const coord = (v, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : d; };
function cellFromCols(w, cols) {
  const W = Number(w);
  const n = Math.round(Number(cols));
  if (!(W > 0 && W < 30000) || !(n >= 2 && n <= 300)) return null;
  return Math.max(8, W / n);
}
function pruneMap(s) {
  for (const calque of ['sol', 'deco']) {
    for (const k of Object.keys(s[calque] || {})) {
      const [c, r] = k.split(',').map(Number);
      if (c >= s.cols || r >= s.rows) delete s[calque][k];
    }
  }
}

io.on('connection', (socket) => {
  const isMj = () => socket.data.role === 'mj';
  const mjOnly = (fn) => (...args) => { if (isMj()) fn(...args); };
  const who = () => {
    if (isMj()) return { name: 'MJ', couleur: '#d4a64a', role: 'mj' };
    const c = state.characters[socket.data.charId];
    return c ? { name: c.name, couleur: c.couleur, role: 'player', id: c.id } : null;
  };
  const ok = (ack, data = {}) => typeof ack === 'function' && ack({ ok: true, ...data });
  const fail = (ack, error) => typeof ack === 'function' && ack({ ok: false, error });

  // ---- connexion
  socket.on('join', (p = {}, ack) => {
    if (typeof ack !== 'function') return;
    if (p.role === 'mj') {
      if (String(p.password || '') !== String(config.motDePasseMJ)) return fail(ack, 'Mot de passe MJ incorrect.');
      if (!presence().mj) system('Le Maître du jeu prend place derrière son écran.');
      socket.data.role = 'mj';
    } else {
      const name = str(p.name, 40).trim();
      if (name.length < 2) return fail(ack, 'Le nom doit faire au moins 2 caractères.');
      let c = Object.values(state.characters).find((x) => norm(x.name) === norm(name));
      if (!c) {
        c = newCharacter(name);
        state.characters[c.id] = c;
        createToken({ label: c.name, couleur: c.couleur, ownerId: c.id });
        system(`${c.name} rejoint l'aventure pour la première fois !`);
      } else if (!presence().online.has(c.id)) {
        system(`${c.name} est de retour à la table.`);
      }
      socket.data.role = 'player';
      socket.data.charId = c.id;
    }
    ok(ack, { role: socket.data.role, charId: socket.data.charId || null, log: state.log.filter((e) => canSee(socket, e)) });
    broadcastState();
    save();
  });

  socket.on('disconnect', () => {
    if (socket.data.role) broadcastState();
  });

  // ---- fiches
  socket.on('sheet:update', ({ id, patch } = {}) => {
    const c = state.characters[id];
    if (!c || !patch || typeof patch !== 'object') return;
    if (!isMj() && socket.data.charId !== id) return;
    const avant = { niveau: c.niveau, pvMax: c.pvMax };
    applyPatch(c, patch);
    if (c.niveau > avant.niveau) {
      // Montée de niveau : effet de lumière et fanfare chez tout le monde
      const t = Object.values(state.tokens).find((x) => x.ownerId === c.id);
      const fx = { charId: c.id, tokenId: t ? t.id : null, nom: c.name, classe: c.classe, couleur: c.couleur,
        niveau: c.niveau, ancien: avant.niveau, pvGain: Math.max(0, c.pvMax - avant.pvMax) };
      for (const so of io.sockets.sockets.values()) if (so.data.role) so.emit('niveau:up', fx);
      addLog({ type: 'niveau', text: `✨ ${c.name} atteint le niveau ${c.niveau} !` });
    }
    broadcastState();
    save();
  });

  socket.on('character:delete', mjOnly(({ id } = {}) => {
    const c = state.characters[id];
    if (!c) return;
    delete state.characters[id];
    for (const t of Object.values(state.tokens)) if (t.ownerId === id) { removeTokenImage(t); delete state.tokens[t.id]; }
    state.initiative.entries = state.initiative.entries.filter((e) => e.charId !== id);
    for (const so of io.sockets.sockets.values()) {
      if (so.data.charId === id) { so.emit('kicked', `Le MJ a supprimé le personnage ${c.name}.`); so.disconnect(true); }
    }
    system(`${c.name} a quitté l'aventure.`);
    broadcastState();
  }));

  // ---- dés & discussion
  socket.on('roll', ({ formula, label, secret } = {}, ack) => {
    const from = who();
    if (!from) return;
    let roll;
    try { roll = rollFormula(formula); } catch (e) { return fail(ack, e.message); }
    const visibleTo = secret ? (isMj() ? [] : [socket.data.charId]) : null;
    addLog({ type: 'roll', from, label: str(label, 60), roll, secret: !!secret, visibleTo });
    ok(ack);
  });

  socket.on('chat', ({ text, to, narration } = {}) => {
    const from = who();
    text = str(text, 2000).trim();
    if (!from || !text) return;
    if (narration && isMj()) return addLog({ type: 'narration', from, text });
    if (to) {
      let visibleTo, toName;
      if (to === 'mj') {
        if (isMj()) return;
        visibleTo = [socket.data.charId];
        toName = 'MJ';
      } else {
        const c = state.characters[to];
        if (!c) return;
        visibleTo = [c.id, socket.data.charId].filter(Boolean);
        toName = c.name;
      }
      return addLog({ type: 'chat', from, text, whisper: true, toName, visibleTo });
    }
    addLog({ type: 'chat', from, text });
  });

  socket.on('log:clear', mjOnly(() => {
    state.log = [];
    io.emit('log:reset');
    save();
  }));

  // ---- pions
  socket.on('token:move', ({ id, x, y } = {}) => {
    const t = state.tokens[id];
    if (!t) return;
    if (!isMj() && t.ownerId !== socket.data.charId) return;
    const avant = visibleJoueurs(t);
    t.x = pct(x);
    t.y = pct(y);
    const apres = visibleJoueurs(t);
    const decouvert = explorer(t);
    for (const so of io.sockets.sockets.values()) {
      if (so.data.role && (so.data.role === 'mj' || apres)) so.emit('token:moved', { id, x: t.x, y: t.y });
    }
    // entrée ou sortie du brouillard, ou nouvelles cases explorées : on renvoie l'état
    if (avant !== apres || decouvert) broadcastSoon();
    save();
  });

  socket.on('token:add', mjOnly((p = {}) => {
    if (!str(p.label, 30).trim()) return;
    const pv = Number(p.pv);
    createToken({ label: p.label.trim(), couleur: p.couleur, taille: p.taille, cache: p.cache,
      stats: pv >= 1 ? { pv, ca: p.ca, attaque: p.attaque, degats: p.degats } : null });
    broadcastState();
    save();
  }));

  socket.on('token:update', mjOnly(({ id, ...p } = {}) => {
    const t = state.tokens[id];
    if (!t) return;
    if ('label' in p && !t.ownerId && str(p.label, 30).trim()) t.label = str(p.label, 30).trim();
    if ('couleur' in p && isColor(p.couleur)) t.couleur = p.couleur;
    if ('taille' in p) t.taille = num(p.taille, 1, 4, 1);
    if ('cache' in p) t.cache = !!p.cache;
    if (!t.ownerId) {
      if ('pvMax' in p) { t.pvMax = num(p.pvMax, 1, 9999, t.pvMax || 10); if (t.pv == null) t.pv = t.pvMax; t.pv = Math.min(t.pv, t.pvMax); }
      if ('pv' in p && t.pvMax) { t.pv = num(p.pv, 0, t.pvMax, t.pv); t.mort = t.pv === 0; }
      if ('ca' in p) t.ca = num(p.ca, 0, 50, t.ca || 10);
    }
    broadcastState();
    save();
  }));

  // ---- monstres du bestiaire : le MJ en ajoute quand il veut, en un ou plusieurs exemplaires
  socket.on('monstre:ajouter', mjOnly(({ modele, nombre, cache, initiative, pvAuxDes } = {}, ack) => {
    const m = BESTIAIRE.find((x) => x.id === modele);
    if (!m) return fail(ack, 'Monstre inconnu.');
    const n = num(nombre, 1, 20, 1);
    const noms = [];
    for (let i = 0; i < n; i++) {
      const pv = pvAuxDes ? Math.max(1, rollFormula(m.pv).total) : m.pvMoyen;
      const t = createToken({
        label: nextLabel(m.nom), couleur: m.couleur, taille: m.taille || 1, cache,
        skin: { contenu: 'monstre', monstre: m.id, embleme: m.emb, forme: 'socle', cadre: m.cadre || 'sang' },
        stats: { pv, ca: m.ca, attaque: m.attaque, degats: m.degats, modele: m.id },
      });
      noms.push(t.label);
      if (initiative) {
        const roll = rollFormula('1d20' + fmtMod(m.dex || 0));
        state.initiative.entries.push({ id: uid(), name: t.label, couleur: t.couleur, tokenId: t.id, valeur: roll.total, cache: !!cache });
      }
    }
    if (initiative) sortInitiative();
    addLog({ type: 'system', text: `👹 Ajout${n > 1 ? 's' : ''} : ${noms.join(', ')}${cache ? ' (cachés)' : ''}.`, visibleTo: [] });
    broadcastState();
    save();
    ok(ack);
  }));

  // Retire d'un coup tous les monstres vaincus
  socket.on('monstres:nettoyer', mjOnly(() => {
    const morts = Object.values(state.tokens).filter((t) => !t.ownerId && t.pvMax && t.pv <= 0);
    for (const t of morts) { removeTokenImage(t); delete state.tokens[t.id]; }
    const ids = new Set(morts.map((t) => t.id));
    state.initiative.entries = state.initiative.entries.filter((e) => !ids.has(e.tokenId));
    broadcastState();
    save();
  }));

  // ---- dégâts et soins infligés par le MJ (un nombre, ou une formule de dés lancée une fois pour toutes les cibles)
  socket.on('degats', mjOnly(({ cibles, montant, soin, moitie, secret } = {}, ack) => {
    const list = (Array.isArray(cibles) ? cibles : []).slice(0, 50).map((id) => state.tokens[id]).filter(Boolean);
    if (!list.length) return fail(ack, 'Choisis au moins une cible.');
    const m = String(montant ?? '').trim().replace(/\s+/g, '');
    let total;
    if (/^\d{1,4}$/.test(m)) total = parseInt(m, 10);
    else {
      let roll;
      try { roll = rollFormula(m); } catch (e) { return fail(ack, e.message); }
      total = roll.total;
      addLog({ type: 'roll', from: who(), label: soin ? 'Soins' : 'Dégâts', roll, secret: !!secret, visibleTo: secret ? [] : null });
    }
    total = Math.max(0, total);
    if (moitie) total = Math.floor(total / 2);
    if (!total) return fail(ack, 'Le montant est nul.');
    for (const t of list) applyHit(t, total, !!soin);
    broadcastState();
    save();
    ok(ack, { total });
  }));

  // Apparence d'un pion : son propriétaire ou le MJ
  const canEditToken = (t) => t && (isMj() || (t.ownerId && t.ownerId === socket.data.charId));

  socket.on('token:skin', ({ id, skin, couleur, label, taille } = {}) => {
    const t = state.tokens[id];
    if (!canEditToken(t)) return;
    if (skin && typeof skin === 'object') t.skin = normalizeSkin(skin, t.skin);
    if (isColor(couleur)) {
      t.couleur = couleur;
      const c = t.ownerId && state.characters[t.ownerId];
      if (c) applyPatch(c, { couleur }); // couleur du personnage = couleur du pion
    }
    if (isMj()) {
      if (label !== undefined && !t.ownerId && str(label, 30).trim()) t.label = str(label, 30).trim();
      if (taille !== undefined) t.taille = num(taille, 1, 4, t.taille);
    }
    broadcastState();
    save();
  });

  // Lumière portée par un pion (torche, lanterne…) et vision dans le noir : le MJ, ou le joueur pour son pion
  socket.on('token:lumiere', ({ id, lumiere, vision } = {}) => {
    const t = state.tokens[id];
    if (!canEditToken(t)) return;
    if (lumiere !== undefined && TYPES_LUMIERE.includes(lumiere)) t.lumiere = lumiere;
    if (vision !== undefined) t.vision = num(vision, 0, 24, 0);
    broadcastState();
    save();
  });

  // ---- portes : le MJ ouvre, ferme et verrouille ; un joueur ouvre une porte proche de son pion
  socket.on('porte:basculer', ({ c, r } = {}, ack) => {
    const sc = activeScene();
    c = Number(c); r = Number(r);
    if (!sc || !socket.data.role || !estPorte(sc, c, r)) return fail(ack, "Il n'y a pas de porte ici.");
    const k = c + ',' + r;
    sc.portes = sc.portes || {};
    const etat = sc.portes[k];
    if (!isMj()) {
      const t = Object.values(state.tokens).find((x) => x.ownerId === socket.data.charId);
      const g = grilleDe(sc);
      if (!t) return fail(ack, "Tu n'as pas de pion sur la carte.");
      const b = sc.brouillard;
      if (b && b.actif && b.vu && b.vu[c + r * b.cols] !== '1') return fail(ack, "Tu ne vois pas cette porte.");
      if (g) {
        const tc = (t.x / 100) * g.cols * g.fx; const tr = (t.y / 100) * g.rows * g.fy;
        if (Math.hypot(tc - (c + 0.5), tr - (r + 0.5)) > 1.75) return fail(ack, 'Approche ton pion de la porte pour l\'ouvrir.');
      }
      if (etat === 'v') {
        addLog({ type: 'system', text: `🔒 ${t.label} essaie d'ouvrir une porte… elle est verrouillée.` });
        for (const so of io.sockets.sockets.values()) if (so.data.role) so.emit('porte:son', { c, r, son: 'verrou' });
        return fail(ack, 'La porte est verrouillée.');
      }
    }
    if (etat === 'o') delete sc.portes[k]; else sc.portes[k] = 'o';
    const ouverte = sc.portes[k] === 'o';
    for (const so of io.sockets.sockets.values()) if (so.data.role) so.emit('porte:son', { c, r, son: ouverte ? 'ouvre' : 'ferme' });
    if (ouverte) for (const t of Object.values(state.tokens)) if (t.ownerId) explorer(t);
    broadcastState();
    save();
    ok(ack, { ouverte });
  });
  socket.on('porte:verrou', mjOnly(({ c, r } = {}) => {
    const sc = activeScene();
    if (!sc || !estPorte(sc, Number(c), Number(r))) return;
    const k = c + ',' + r;
    sc.portes = sc.portes || {};
    if (sc.portes[k] === 'v') delete sc.portes[k]; else sc.portes[k] = 'v'; // verrouiller ferme la porte
    for (const so of io.sockets.sockets.values()) if (so.data.role === 'mj') so.emit('porte:son', { c: Number(c), r: Number(r), son: 'verrou' });
    broadcastState();
    save();
  }));

  socket.on('ombres:peindre', mjOnly(({ cols, rows, fx, fy, cells, niveau } = {}) => {
    const o = ombresDe(activeScene(), cols, rows);
    if (!o || !Array.isArray(cells)) return;
    if (fx !== undefined) o.fx = Math.min(1.5, Math.max(0.5, Number(fx) || 1));
    if (fy !== undefined) o.fy = Math.min(1.5, Math.max(0.5, Number(fy) || 1));
    const v = String(num(niveau, 0, 4, 0));
    const a = o.niv.split('');
    for (const i of cells.slice(0, 200000)) if (Number.isInteger(i) && i >= 0 && i < a.length) a[i] = v;
    o.niv = a.join('');
    broadcastSoon();
  }));
  socket.on('ombres:effacer', mjOnly(() => {
    const sc = activeScene();
    if (!sc || !sc.ombres) return;
    sc.ombres.niv = '0'.repeat(sc.ombres.cols * sc.ombres.rows);
    broadcastState();
    save();
  }));

  socket.on('brouillard:regler', mjOnly(({ actif, auto, vue, cols, rows, fx, fy } = {}) => {
    const b = brouillardDe(activeScene(), cols, rows);
    if (!b) return;
    if (fx !== undefined) b.fx = Math.min(1.5, Math.max(0.5, Number(fx) || 1));
    if (fy !== undefined) b.fy = Math.min(1.5, Math.max(0.5, Number(fy) || 1));
    if (actif !== undefined) b.actif = !!actif;
    if (auto !== undefined) b.auto = !!auto;
    if (vue !== undefined) b.vue = num(vue, 1, 40, 6);
    if (b.actif) for (const t of Object.values(state.tokens)) if (t.ownerId) explorer(t);
    broadcastState();
    save();
  }));
  socket.on('brouillard:peindre', mjOnly(({ cells, vu } = {}) => {
    const sc = activeScene();
    const b = sc && sc.brouillard;
    if (!b || !Array.isArray(cells)) return;
    const v = vu ? '1' : '0';
    const a = b.vu.split('');
    for (const i of cells.slice(0, 200000)) if (Number.isInteger(i) && i >= 0 && i < a.length) a[i] = v;
    b.vu = a.join('');
    broadcastSoon();
  }));
  socket.on('brouillard:tout', mjOnly(({ vu } = {}) => {
    const b = brouillardDe(activeScene());
    if (!b) return;
    b.vu = (vu ? '1' : '0').repeat(b.cols * b.rows);
    if (!vu) for (const t of Object.values(state.tokens)) if (t.ownerId) explorer(t);
    broadcastState();
    save();
  }));

  socket.on('eclairage:regler', mjOnly(({ actif, nuit, murs, decor } = {}) => {
    const e = eclairageDe(activeScene());
    if (!e) return;
    if (actif !== undefined) e.actif = !!actif;
    if (nuit !== undefined) { const n = Number(nuit); if (n >= 0 && n <= 1) e.nuit = Math.round(n * 100) / 100; }
    if (murs !== undefined) e.murs = !!murs;
    if (decor !== undefined) e.decor = !!decor;
    broadcastState();
    save();
  }));
  socket.on('lumiere:ajouter', mjOnly(({ x, y, type } = {}) => {
    const e = eclairageDe(activeScene());
    if (!e || e.lumieres.length >= 60) return;
    const tp = TYPES_LUMIERE.includes(type) && type !== 'aucune' ? type : 'torche';
    e.lumieres.push({ id: uid(), x: coord(x, 50), y: coord(y, 50), type: tp, rayon: null });
    if (!e.actif) e.actif = true;
    broadcastState();
    save();
  }));
  socket.on('lumiere:modifier', mjOnly(({ id, x, y, type, rayon } = {}) => {
    const e = eclairageDe(activeScene());
    const l = e && e.lumieres.find((v) => v.id === id);
    if (!l) return;
    if (x !== undefined) l.x = coord(x, l.x);
    if (y !== undefined) l.y = coord(y, l.y);
    if (TYPES_LUMIERE.includes(type) && type !== 'aucune') l.type = type;
    if (rayon !== undefined) l.rayon = rayon === null || rayon === '' ? null : num(rayon, 1, 40, 4);
    broadcastState();
    save();
  }));
  socket.on('lumiere:supprimer', mjOnly(({ id } = {}) => {
    const e = eclairageDe(activeScene());
    if (!e) return;
    e.lumieres = id === '*' ? [] : e.lumieres.filter((v) => v.id !== id);
    broadcastState();
    save();
  }));

  socket.on('token:image', ({ id, data } = {}, ack) => {
    const t = state.tokens[id];
    if (!canEditToken(t)) return fail(ack, 'Ce pion ne t\'appartient pas.');
    const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(String(data || ''));
    if (!m || m[2].length > 4e6) return fail(ack, 'Image invalide ou trop lourde.');
    const file = `pion-${uid()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    fs.writeFileSync(path.join(IMG_DIR, file), Buffer.from(m[2], 'base64'));
    removeTokenImage(t);
    t.skin.image = '/images/' + file;
    t.skin.contenu = 'image';
    broadcastState();
    save();
    ok(ack);
  });

  socket.on('token:remove', mjOnly(({ id } = {}) => {
    if (!state.tokens[id]) return;
    removeTokenImage(state.tokens[id]);
    delete state.tokens[id];
    state.initiative.entries = state.initiative.entries.filter((e) => e.tokenId !== id);
    broadcastState();
    save();
  }));

  // ---- scènes / cartes
  socket.on('scene:upload', mjOnly(({ titre, data, w, cols } = {}, ack) => {
    const m = /^data:image\/(png|jpeg|webp|gif);base64,(.+)$/.exec(String(data || ''));
    if (!m) return fail(ack, 'Image invalide (PNG, JPG, WEBP ou GIF).');
    const id = uid();
    const file = `${id}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    fs.writeFileSync(path.join(IMG_DIR, file), Buffer.from(m[2], 'base64'));
    const scene = { id, titre: str(titre, 60).trim() || 'Scène sans titre', image: '/images/' + file };
    // battle map importée : la grille suit celle dessinée sur l'image (nombre de cases en largeur)
    const cell = cellFromCols(w, cols);
    if (cell) { scene.cellule = cell; scene.sol = {}; scene.deco = {}; }
    state.scenes.push(scene);
    state.scene.actif = id;
    system(`Nouvelle scène : ${scene.titre}`);
    broadcastState();
    save();
    ok(ack);
  }));

  socket.on('scene:activer', mjOnly(({ id } = {}) => {
    const s = state.scenes.find((x) => x.id === id);
    state.scene.actif = s ? s.id : null;
    if (s) system(`Nouvelle scène : ${s.titre}`);
    broadcastState();
    save();
  }));

  socket.on('scene:supprimer', mjOnly(({ id } = {}) => {
    const s = state.scenes.find((x) => x.id === id);
    if (!s) return;
    state.scenes = state.scenes.filter((x) => x.id !== id);
    if (state.scene.actif === id) state.scene.actif = null;
    if (s.image) fs.unlink(path.join(IMG_DIR, path.basename(s.image)), () => {});
    broadcastState();
    save();
  }));

  // ---- battle maps
  socket.on('scene:battlemap', mjOnly(({ titre, cols, rows, fond } = {}, ack) => {
    const scene = {
      id: uid(), titre: str(titre, 60).trim() || 'Battle map', image: null,
      cols: num(cols, 4, 100, 20), rows: num(rows, 4, 100, 14),
      fond: SOLS.includes(fond) ? fond : 'herbe', sol: {}, deco: {},
    };
    state.scenes.push(scene);
    state.scene.actif = scene.id;
    system(`Nouvelle scène : ${scene.titre}`);
    broadcastState();
    save();
    ok(ack, { id: scene.id });
  }));

  // aligne la grille sur une image : N cases sur la largeur
  socket.on('map:cases', mjOnly(({ w, cols } = {}) => {
    const s = activeScene();
    const cell = cellFromCols(w, cols);
    if (!s || !s.image || !cell) return;
    s.cellule = cell;
    broadcastState();
    save();
  }));

  socket.on('map:taille', mjOnly(({ cols, rows } = {}) => {
    const s = activeScene();
    if (!s || s.image) return;
    s.cols = num(cols, 4, 100, s.cols);
    s.rows = num(rows, 4, 100, s.rows);
    pruneMap(s);
    if (s.brouillard) brouillardDe(s);
    if (s.ombres) ombresDe(s);
    broadcastState();
    save();
  }));

  socket.on('map:fond', mjOnly(({ fond } = {}) => {
    const s = activeScene();
    if (!s) return;
    if (SOLS.includes(fond)) s.fond = fond;
    else if (s.image) s.fond = null; // une carte importée peut rester sans fond peint
    broadcastState();
    save();
  }));

  socket.on('map:effacer', mjOnly(({ calque } = {}) => {
    const s = activeScene();
    if (!s || !['sol', 'deco'].includes(calque)) return;
    s[calque] = {};
    if (calque === 'deco') s.portes = {};
    broadcastState();
    save();
  }));

  // Coups de pinceau : on ne renvoie aux autres que les cases modifiées (léger même en peignant vite).
  socket.on('map:paint', mjOnly(({ calque, cells } = {}) => {
    const s = activeScene();
    if (!s || !['sol', 'deco'].includes(calque) || !Array.isArray(cells)) return;
    const allowed = calque === 'sol' ? SOLS : DECOS;
    const layer = s[calque] || (s[calque] = {});
    const maxC = s.image ? 400 : s.cols;
    const maxR = s.image ? 400 : s.rows;
    const applied = [];
    for (const it of cells.slice(0, 12000)) {
      if (!Array.isArray(it)) continue;
      const c = Number(it[0]);
      const r = Number(it[1]);
      if (!Number.isInteger(c) || !Number.isInteger(r) || c < 0 || r < 0 || c >= maxC || r >= maxR) continue;
      const v = it[2] == null ? null : String(it[2]);
      if (v !== null && !allowed.includes(v)) continue;
      if (v === null) delete layer[c + ',' + r]; else layer[c + ',' + r] = v;
      applied.push([c, r, v]);
    }
    if (!applied.length) return;
    for (const so of io.sockets.sockets.values()) {
      if (so.data.role && so !== socket) so.emit('map:patch', { sceneId: s.id, calque, cells: applied });
    }
    save();
  }));

  socket.on('scene:grille', mjOnly(({ grille, cellule } = {}) => {
    if (grille !== undefined) state.scene.grille = !!grille;
    if (cellule !== undefined) {
      const s = activeScene();
      if (s && s.cellule) s.cellule = Math.min(2000, Math.max(8, Number(cellule) || s.cellule));
      else state.scene.cellule = num(cellule, 10, 400, 70);
    }
    broadcastState();
    save();
  }));

  // ---- initiative
  const ini = state.initiative;
  const announceTurn = () => {
    const e = ini.entries.find((x) => x.id === ini.actif);
    if (e && !e.cache) system(`⚔ Au tour de ${e.name} !`);
  };

  socket.on('init:roll', () => {
    const c = state.characters[socket.data.charId];
    if (!c) return;
    const roll = rollFormula('1d20' + fmtMod(mod(c.stats.dex)));
    addLog({ type: 'roll', from: who(), label: 'Initiative', roll, visibleTo: null });
    const id = 'pc-' + c.id;
    const e = ini.entries.find((x) => x.id === id);
    if (e) e.valeur = roll.total;
    else ini.entries.push({ id, name: c.name, couleur: c.couleur, charId: c.id, valeur: roll.total, cache: false });
    sortInitiative();
    broadcastState();
    save();
  });

  socket.on('init:add', mjOnly(({ name, valeur, cache, couleur, tokenId } = {}) => {
    name = str(name, 30).trim();
    if (!name) return;
    let v = Number(valeur);
    if (valeur === '' || valeur == null || !Number.isFinite(v)) {
      const roll = rollFormula('1d20');
      addLog({ type: 'roll', from: who(), label: `Initiative de ${name}`, roll, secret: true, visibleTo: [] });
      v = roll.total;
    }
    ini.entries.push({ id: uid(), name, couleur: isColor(couleur) ? couleur : '#b33', tokenId: tokenId || null, valeur: num(v, -99, 999), cache: !!cache });
    sortInitiative();
    broadcastState();
    save();
  }));

  socket.on('init:set', mjOnly(({ id, valeur, cache } = {}) => {
    const e = ini.entries.find((x) => x.id === id);
    if (!e) return;
    if (valeur !== undefined) e.valeur = num(valeur, -99, 999, e.valeur);
    if (cache !== undefined) e.cache = !!cache;
    sortInitiative();
    broadcastState();
    save();
  }));

  socket.on('init:remove', mjOnly(({ id } = {}) => {
    ini.entries = ini.entries.filter((x) => x.id !== id);
    if (ini.actif === id) ini.actif = null;
    broadcastState();
    save();
  }));

  socket.on('init:step', mjOnly(({ dir } = {}) => {
    const list = ini.entries;
    if (!list.length) return;
    let i = list.findIndex((x) => x.id === ini.actif);
    if (i < 0) i = dir < 0 ? list.length - 1 : 0;
    else if (dir < 0) {
      i -= 1;
      if (i < 0) { i = list.length - 1; ini.round = Math.max(1, ini.round - 1); }
    } else {
      i += 1;
      if (i >= list.length) { i = 0; ini.round += 1; system(`— Round ${ini.round} —`); }
    }
    ini.actif = list[i].id;
    announceTurn();
    broadcastState();
    save();
  }));

  // ---- musique d'ambiance (MJ uniquement)
  socket.on('musique:jouer', mjOnly(({ piste } = {}) => {
    const perso = typeof piste === 'string' && piste.startsWith('f:') && state.musiquesPerso.some((m) => 'f:' + m.id === piste);
    if ((!PISTES_MUSIQUE.includes(piste) && !perso) || musique.piste === piste) return;
    musique.piste = piste;
    broadcastState();
  }));
  socket.on('musique:stop', mjOnly(() => {
    if (!musique.piste) return;
    musique.piste = null;
    broadcastState();
  }));
  socket.on('musique:renommer', mjOnly(({ id, nom, icone } = {}) => {
    const m = state.musiquesPerso.find((x) => x.id === id);
    if (!m) return;
    if (nom !== undefined) m.nom = str(nom, 60).trim() || m.nom;
    if (icone !== undefined) m.icone = str(icone, 8) || '🎵';
    broadcastState();
    save();
  }));
  socket.on('musique:supprimer', mjOnly(({ id } = {}) => {
    const i = state.musiquesPerso.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [m] = state.musiquesPerso.splice(i, 1);
    if (musique.piste === 'f:' + m.id) musique.piste = null;
    fs.unlink(path.join(SON_DIR, path.basename(m.fichier)), () => {});
    broadcastState();
    save();
  }));
  socket.on('musique:volume', mjOnly(({ volume } = {}) => {
    const v = Number(volume);
    if (!(v >= 0 && v <= 1)) return;
    musique.volume = Math.round(v * 100) / 100;
    broadcastState();
  }));

  // ---- diaporamas (MJ uniquement)
  const changed = () => { broadcastState(); save(); };

  socket.on('slides:deck:create', mjOnly(({ titre } = {}, ack) => {
    const deck = { id: uid(), titre: str(titre, 80).trim() || 'Nouveau déroulé', slides: [] };
    state.slides.decks.push(deck);
    changed();
    ok(ack, { id: deck.id });
  }));
  socket.on('slides:deck:update', mjOnly(({ id, titre } = {}) => {
    const deck = findDeck(id);
    if (!deck) return;
    if (titre !== undefined) deck.titre = str(titre, 80).trim() || deck.titre;
    changed();
  }));
  socket.on('slides:deck:delete', mjOnly(({ id } = {}) => {
    state.slides.decks = state.slides.decks.filter((d) => d.id !== id);
    if (state.slides.projection && state.slides.projection.deckId === id) state.slides.projection = null;
    changed();
  }));

  socket.on('slides:slide:add', mjOnly(({ deckId, after, type, sceneId } = {}, ack) => {
    const deck = findDeck(deckId);
    if (!deck) return fail(ack, 'Déroulé introuvable');
    if (deck.slides.length >= 200) return fail(ack, 'Ce déroulé est plein (200 étapes).');
    if (type === 'carte' && !state.scenes.some((sc) => sc.id === sceneId)) return fail(ack, 'Carte introuvable.');
    const slide = type === 'carte' ? newSlide({ type: 'carte', sceneId }) : newSlide({ titre: 'Nouvelle slide' });
    const i = deck.slides.findIndex((s) => s.id === after);
    deck.slides.splice(i >= 0 ? i + 1 : deck.slides.length, 0, slide);
    changed();
    ok(ack, { id: slide.id });
  }));
  socket.on('slides:slide:update', mjOnly(({ deckId, slideId, patch } = {}) => {
    const slide = findDeck(deckId)?.slides.find((s) => s.id === slideId);
    if (!slide || !patch) return;
    if (patch.sceneId !== undefined && !state.scenes.some((sc) => sc.id === patch.sceneId)) delete patch.sceneId;
    const clean = newSlide({ ...slide, ...patch, type: slide.type }); // le type d'une étape ne change pas
    const commun = {
      musique: 'musique' in patch ? clean.musique : (slide.musique || null),
      transition: clean.transition,
    };
    if (slide.type === 'carte') Object.assign(slide, commun, { sceneId: clean.sceneId });
    else {
      Object.assign(slide, commun, {
        titre: clean.titre, texte: clean.texte, style: clean.style,
        image: 'image' in patch ? clean.image : slide.image,
      });
    }
    changed();
  }));
  socket.on('slides:slide:delete', mjOnly(({ deckId, slideId } = {}) => {
    const deck = findDeck(deckId);
    if (!deck) return;
    deck.slides = deck.slides.filter((s) => s.id !== slideId);
    const p = state.slides.projection;
    if (p && p.deckId === deckId && p.index >= deck.slides.length) p.index = Math.max(0, deck.slides.length - 1);
    changed();
  }));
  socket.on('slides:slide:move', mjOnly(({ deckId, slideId, dir } = {}) => {
    const deck = findDeck(deckId);
    if (!deck) return;
    const i = deck.slides.findIndex((s) => s.id === slideId);
    const j = i + (dir < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= deck.slides.length) return;
    [deck.slides[i], deck.slides[j]] = [deck.slides[j], deck.slides[i]];
    changed();
  }));
  socket.on('slides:slide:image', mjOnly(({ deckId, slideId, data } = {}, ack) => {
    const slide = findDeck(deckId)?.slides.find((s) => s.id === slideId);
    if (!slide) return fail(ack, 'Slide introuvable');
    const m = /^data:image\/(png|jpeg|webp|gif);base64,(.+)$/.exec(String(data || ''));
    if (!m) return fail(ack, 'Image invalide (PNG, JPG, WEBP ou GIF).');
    const file = `slide-${uid()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    fs.writeFileSync(path.join(IMG_DIR, file), Buffer.from(m[2], 'base64'));
    slide.image = '/images/' + file;
    changed();
    ok(ack);
  }));

  socket.on('slides:present', mjOnly(({ deckId, index } = {}) => {
    const deck = findDeck(deckId);
    if (!deck || !deck.slides.length) return;
    state.slides.projection = { deckId, index: num(index, 0, deck.slides.length - 1, 0) };
    appliquerEtape();
    changed();
  }));
  socket.on('slides:step', mjOnly(({ dir } = {}) => {
    const p = state.slides.projection;
    const deck = p && findDeck(p.deckId);
    if (!deck) return;
    const avant = p.index;
    p.index = Math.min(deck.slides.length - 1, Math.max(0, p.index + (dir < 0 ? -1 : 1)));
    if (p.index !== avant) appliquerEtape();
    changed();
  }));
  socket.on('slides:stop', mjOnly(() => {
    state.slides.projection = null;
    changed();
  }));

  socket.on('init:clear', mjOnly(() => {
    ini.entries = [];
    ini.actif = null;
    ini.round = 1;
    system('Fin du combat.');
    broadcastState();
    save();
  }));
});

// ---------------------------------------------------------------- tunnel Cloudflare (accès Internet)
const CLOUDFLARED_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';

/** Trouve cloudflared ; sous Windows, le télécharge à côté du programme s'il manque (une seule fois). */
async function findCloudflared() {
  const local = path.join(ROOT, 'cloudflared.exe');
  if (fs.existsSync(local)) return local;
  if (!spawnSync('cloudflared', ['--version'], { windowsHide: true }).error) return 'cloudflared';
  if (process.platform !== 'win32' || process.arch !== 'x64') return null;
  console.log('  Téléchargement de cloudflared pour le lien Internet (une seule fois, ~60 Mo)…');
  try {
    const res = await fetch(CLOUDFLARED_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    fs.writeFileSync(local + '.part', Buffer.from(await res.arrayBuffer()));
    fs.renameSync(local + '.part', local);
    console.log('  cloudflared installé.\n');
    return local;
  } catch (e) {
    console.log('  Échec du téléchargement de cloudflared : ' + e.message);
    return null;
  }
}

async function startTunnel() {
  const bin = await findCloudflared();
  if (!bin) return tunnelMissing();
  console.log('  Ouverture du lien Internet…');
  let child;
  try {
    child = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${config.port}`], { windowsHide: true });
  } catch { return tunnelMissing(); }
  child.on('error', tunnelMissing);
  const onData = (buf) => {
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(buf.toString());
    if (m && m[0] !== tunnelUrl) {
      tunnelUrl = m[0];
      console.log('\n  🌍 Lien Internet à envoyer aux joueurs :  ' + tunnelUrl + '\n');
      broadcastState();
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('exit', () => { tunnelUrl = null; broadcastState(); });
  const stop = () => { try { child.kill(); } catch { /* déjà arrêté */ } };
  process.on('exit', stop);
}
function tunnelMissing() {
  console.log('  (cloudflared introuvable : pas de lien Internet automatique.');
  console.log('   Installe-le avec :  winget install --id Cloudflare.cloudflared  puis relance.)\n');
}

const quit = () => { saveNow(); process.exit(0); };
process.on('SIGINT', quit);
process.on('SIGTERM', quit);
process.on('SIGHUP', quit); // fermeture de la fenêtre sous Windows

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`\n  Le port ${config.port} est déjà utilisé : La Taverne est peut-être déjà ouverte.`);
    console.log('  Ferme l\'autre fenêtre, ou change "port" dans config.json.\n');
  } else console.error(e);
  if (sea) setTimeout(() => process.exit(1), 15000); else process.exit(1);
});

server.listen(config.port, '0.0.0.0', () => {
  const url = `http://localhost:${config.port}`;
  console.log('\n  ⚔  La Taverne est ouverte !\n');
  console.log(`  Sur ce PC          :  ${url}`);
  for (const u of lanUrls()) console.log(`  Réseau local       :  ${u}`);
  console.log(`  Mot de passe MJ    :  ${config.motDePasseMJ}   (modifiable dans config.json)`);
  console.log(`  Données            :  ${DATA_DIR}`);
  console.log('\n  Laisse cette fenêtre ouverte pendant la partie (la fermer arrête le serveur).\n');
  if (config.ouvrirNavigateur && process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  }
  if (config.tunnelCloudflare) startTunnel();
});
