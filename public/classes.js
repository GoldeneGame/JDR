'use strict';
/* Classes de personnage : choix sur la fiche, kit de départ (caracs, PV, CA, équipement, sorts) et montée de niveau. */

// ordre : caractéristiques de la plus importante à la moins importante (on y répartit 15, 14, 13, 12, 10, 8)
const CLASSES = [
  {
    id: 'Barbare', emoji: '🪓', de: 12, ordre: ['for', 'con', 'dex', 'sag', 'cha', 'int'],
    desc: 'Guerrier sauvage porté par sa rage, très résistant au combat.',
    sauv: 'Force, Constitution', armures: 'Légères, intermédiaires, boucliers',
    capacites: 'Rage (2 fois par repos long : +2 aux dégâts, résistance aux dégâts physiques), Défense sans armure',
    ca: (s) => 10 + mod(s.dex) + mod(s.con),
    equipement: 'Hache à deux mains (1d12 tranchant)\n2 hachettes (1d6, lancer)\n4 javelines (1d6)\nSac d\'explorateur',
    sorts: '',
    figurine: { tenue: 'cuir', couleurTenue: '#7a4a22', arme: 'hache', bouclier: false, tete: 'bandeau', cape: false },
  },
  {
    id: 'Barde', emoji: '🎻', de: 8, ordre: ['cha', 'dex', 'con', 'sag', 'int', 'for'],
    desc: 'Artiste et conteur dont la musique est magique : soutien, charme et polyvalence.',
    sauv: 'Dextérité, Charisme', armures: 'Légères',
    capacites: 'Inspiration bardique (d6, autant de fois que le mod. de Charisme), Incantation',
    ca: (s) => 11 + mod(s.dex),
    equipement: 'Rapière (1d8 perforant)\nDague (1d4)\nLuth\nArmure de cuir\nSac d\'artiste',
    sorts: 'Tours de magie : Moquerie cruelle, Illusion mineure\nNiveau 1 (2 emplacements) : Mot de guérison, Charme-personne, Fou rire, Vague tonnante',
    figurine: { tenue: 'tunique', couleurTenue: '#7d3fb0', arme: 'dague', bouclier: false, tete: 'rien', cape: true, couleurCape: '#c9a43a' },
  },
  {
    id: 'Clerc', emoji: '🙏', de: 8, ordre: ['sag', 'con', 'for', 'dex', 'cha', 'int'],
    desc: 'Serviteur d\'une divinité : soigne ses alliés et frappe ses ennemis de la magie divine.',
    sauv: 'Sagesse, Charisme', armures: 'Légères, intermédiaires, boucliers',
    capacites: 'Incantation, Domaine divin',
    ca: (s) => 16 + Math.min(2, mod(s.dex)),
    equipement: 'Masse d\'armes (1d6 contondant)\nCotte d\'écailles\nBouclier\nArbalète légère et 20 carreaux\nSymbole sacré',
    sorts: 'Tours de magie : Flamme sacrée, Thaumaturgie, Assistance\nNiveau 1 (2 emplacements) : Soins, Bénédiction, Bouclier de la foi, Éclair traçant',
    figurine: { tenue: 'robe', couleurTenue: '#e8e2d0', arme: 'masse', bouclier: true, tete: 'rien', cape: true, couleurCape: '#c9a43a' },
  },
  {
    id: 'Druide', emoji: '🌿', de: 8, ordre: ['sag', 'con', 'dex', 'int', 'cha', 'for'],
    desc: 'Gardien de la nature qui en tire sa magie et peut prendre forme animale.',
    sauv: 'Intelligence, Sagesse', armures: 'Légères, intermédiaires (pas de métal), boucliers',
    capacites: 'Druidique (langue secrète), Incantation',
    ca: (s) => 13 + mod(s.dex),
    equipement: 'Cimeterre (1d6 tranchant)\nBouclier en bois\nArmure de cuir\nFocaliseur druidique\nSac d\'explorateur',
    sorts: 'Tours de magie : Gourdin magique, Druidisme\nNiveau 1 (2 emplacements) : Soins, Enchevêtrement, Baies nourricières, Vague tonnante',
    figurine: { tenue: 'robe', couleurTenue: '#2f6b2f', arme: 'baton', bouclier: false, tete: 'capuche', cape: true, couleurCape: '#4a3a1a' },
  },
  {
    id: 'Ensorceleur', emoji: '🔥', de: 6, ordre: ['cha', 'con', 'dex', 'sag', 'int', 'for'],
    desc: 'La magie coule dans ses veines : peu de sorts, mais une puissance innée.',
    sauv: 'Constitution, Charisme', armures: 'Aucune',
    capacites: 'Incantation, Origine magique',
    ca: (s) => 10 + mod(s.dex),
    equipement: 'Arbalète légère (1d8) et 20 carreaux\n2 dagues (1d4)\nFocaliseur arcanique\nSac d\'exploration souterraine',
    sorts: 'Tours de magie : Trait de feu, Rayon de givre, Lumière, Prestidigitation\nNiveau 1 (2 emplacements) : Projectile magique, Bouclier',
    figurine: { tenue: 'robe', couleurTenue: '#a3271b', arme: 'baton', bouclier: false, tete: 'rien', cape: true, couleurCape: '#3a1f4a' },
  },
  {
    id: 'Guerrier', emoji: '⚔️', de: 10, ordre: ['for', 'con', 'dex', 'sag', 'int', 'cha'],
    desc: 'Maître des armes et des armures, solide et efficace dans toutes les mêlées.',
    sauv: 'Force, Constitution', armures: 'Toutes, boucliers',
    capacites: 'Style de combat (Défense : +1 CA en armure), Second souffle (1d10 + niveau PV, une fois par repos)',
    ca: () => 19,
    equipement: 'Épée longue (1d8 tranchant)\nBouclier\nCotte de mailles\nArbalète légère et 20 carreaux\nSac d\'explorateur',
    sorts: '',
    figurine: { tenue: 'armure', couleurTenue: '#7a1f1f', arme: 'epee', bouclier: true, tete: 'casque', cape: true, couleurCape: '#7a1f1f' },
  },
  {
    id: 'Magicien', emoji: '🧙', de: 6, ordre: ['int', 'con', 'dex', 'sag', 'cha', 'for'],
    desc: 'Érudit des arcanes : fragile, mais le plus vaste répertoire de sorts.',
    sauv: 'Intelligence, Sagesse', armures: 'Aucune',
    capacites: 'Incantation (grimoire), Restauration arcanique',
    ca: (s) => 10 + mod(s.dex),
    equipement: 'Bâton (1d6 contondant)\nGrimoire\nFocaliseur arcanique\nSac d\'érudit',
    sorts: 'Tours de magie : Trait de feu, Main du mage, Lumière\nNiveau 1 (2 emplacements) : Projectile magique, Armure du mage, Bouclier, Sommeil, Mains brûlantes, Détection de la magie',
    figurine: { tenue: 'robe', couleurTenue: '#2f4fa8', arme: 'baton', bouclier: false, tete: 'mage', cape: false },
  },
  {
    id: 'Moine', emoji: '👊', de: 8, ordre: ['dex', 'sag', 'con', 'for', 'int', 'cha'],
    desc: 'Combattant à mains nues, rapide et discipliné, qui maîtrise son ki.',
    sauv: 'Force, Dextérité', armures: 'Aucune',
    capacites: 'Défense sans armure (10 + Dex + Sag), Arts martiaux (1d4)',
    ca: (s) => 10 + mod(s.dex) + mod(s.sag),
    equipement: 'Épée courte (1d6 perforant)\n10 fléchettes (1d4)\nSac d\'explorateur',
    sorts: '',
    figurine: { tenue: 'tunique', couleurTenue: '#d9822b', arme: 'aucune', bouclier: false, tete: 'bandeau', cape: false, cheveux: 'chauve' },
  },
  {
    id: 'Occultiste', emoji: '👁️', de: 8, ordre: ['cha', 'con', 'dex', 'sag', 'int', 'for'],
    desc: 'A passé un pacte avec une entité puissante en échange de pouvoirs mystérieux.',
    sauv: 'Sagesse, Charisme', armures: 'Légères',
    capacites: 'Patron d\'outre-monde, Magie de pacte (emplacements récupérés au repos court)',
    ca: (s) => 11 + mod(s.dex),
    equipement: 'Arbalète légère (1d8) et 20 carreaux\n2 dagues (1d4)\nArmure de cuir\nFocaliseur arcanique\nSac d\'érudit',
    sorts: 'Tours de magie : Décharge occulte, Main du mage\nNiveau 1 (1 emplacement) : Maléfice, Armure d\'Agathys',
    figurine: { tenue: 'robe', couleurTenue: '#3a1f4a', arme: 'dague', bouclier: false, tete: 'capuche', cape: true, couleurCape: '#1a1a2a' },
  },
  {
    id: 'Paladin', emoji: '🛡️', de: 10, ordre: ['for', 'cha', 'con', 'sag', 'dex', 'int'],
    desc: 'Chevalier sacré lié par un serment : protège, soigne et châtie.',
    sauv: 'Sagesse, Charisme', armures: 'Toutes, boucliers',
    capacites: 'Sens divin, Imposition des mains (5 × niveau PV à répartir)',
    ca: () => 18,
    equipement: 'Épée longue (1d8 tranchant)\nBouclier\nCotte de mailles\n5 javelines (1d6)\nSymbole sacré',
    sorts: '',
    figurine: { tenue: 'armure', couleurTenue: '#c9a43a', arme: 'epee', bouclier: true, tete: 'rien', cape: true, couleurCape: '#f4f1e8' },
  },
  {
    id: 'Rôdeur', emoji: '🏹', de: 10, ordre: ['dex', 'sag', 'con', 'for', 'int', 'cha'],
    desc: 'Chasseur et pisteur des terres sauvages, redoutable à l\'arc.',
    sauv: 'Force, Dextérité', armures: 'Légères, intermédiaires, boucliers',
    capacites: 'Ennemi juré, Explorateur-né',
    ca: (s) => 14 + Math.min(2, mod(s.dex)),
    equipement: 'Arc long (1d8 perforant) et 20 flèches\n2 épées courtes (1d6)\nArmure d\'écailles\nSac d\'explorateur',
    sorts: '',
    figurine: { tenue: 'cuir', couleurTenue: '#2f6b2f', arme: 'arc', bouclier: false, tete: 'capuche', cape: true, couleurCape: '#2f5a2a' },
  },
  {
    id: 'Roublard', emoji: '🗡️', de: 8, ordre: ['dex', 'int', 'con', 'cha', 'sag', 'for'],
    desc: 'Furtif et habile : serrures, pièges et attaques sournoises dévastatrices.',
    sauv: 'Dextérité, Intelligence', armures: 'Légères',
    capacites: 'Attaque sournoise (+1d6), Expertise, Jargon des voleurs',
    ca: (s) => 11 + mod(s.dex),
    equipement: 'Rapière (1d8 perforant)\nArc court (1d6) et 20 flèches\nArmure de cuir\n2 dagues (1d4)\nOutils de voleur',
    sorts: '',
    figurine: { tenue: 'cuir', couleurTenue: '#3a3a3a', arme: 'dague', bouclier: false, tete: 'capuche', cape: true, couleurCape: '#2a2a2a' },
  },
];
const findClasse = (nom) => CLASSES.find((k) => norm(k.id) === norm(nom));
const norm = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const pvParNiveau = (k, con) => Math.max(1, Math.floor(k.de / 2) + 1 + mod(con));
const du = (k) => (/^[aeiouyéèêâîôûœ]/i.test(norm(k.id)) ? "de l'" : 'du ') + k.id;
const STAT_NOMS = { for: 'FOR', dex: 'DEX', con: 'CON', int: 'INT', sag: 'SAG', cha: 'CHA' };

$('#classe-select').replaceChildren(
  el('option', { value: '', text: '— Choisir une classe —' }),
  ...CLASSES.map((k) => el('option', { value: k.id, text: `${k.emoji} ${k.id}` })),
  el('option', { value: '*', text: '✎ Autre (texte libre)' }));

let classeLibre = false;
$('#classe-select').addEventListener('change', (ev) => {
  const c = S && S.characters[ficheId];
  if (!c) return;
  const v = ev.target.value;
  if (v === '*') {
    classeLibre = true;
    renderClasse(c);
    $('#classe-libre').focus();
    return;
  }
  classeLibre = false;
  sendPatch(c.id, { classe: v });
  const k = findClasse(v);
  // Fiche encore vierge : on propose tout de suite le kit de départ
  const vierge = Object.values(c.stats).every((x) => x === 10) && !c.inventaire && !c.sorts;
  if (k && vierge && confirm(`Appliquer le kit de départ ${du(k)} ?\n(caractéristiques, PV, CA, équipement, sorts et apparence du pion)`)) applyKit(c, k);
});

/** Kit de départ : caractéristiques réparties selon la classe, PV, CA, équipement, sorts et tenue du pion. */
function applyKit(c, k) {
  const valeurs = [15, 14, 13, 12, 10, 8];
  const stats = {};
  k.ordre.forEach((s, i) => { stats[s] = valeurs[i]; });
  const niveau = c.niveau || 1;
  const pvMax = Math.max(1, k.de + mod(stats.con) + (niveau - 1) * pvParNiveau(k, stats.con));
  sendPatch(c.id, {
    classe: k.id, stats, pvMax, pv: pvMax, ca: k.ca(stats),
    competences: `Sauvegardes : ${k.sauv}\nArmures : ${k.armures}\nCapacités : ${k.capacites}`,
    inventaire: k.equipement, sorts: k.sorts,
  });
  const t = tokenOfChar(c.id);
  if (t) {
    const fig = { ...((t.skin && t.skin.figurine) || {}), ...k.figurine };
    socket.emit('token:skin', { id: t.id, skin: { contenu: 'figurine', forme: 'socle', figurine: fig } });
  }
  toast(`Kit de départ ${du(k)} appliqué.`);
}

function levelUp(c, k) {
  if (c.niveau >= 20) return;
  const gain = pvParNiveau(k, c.stats.con);
  sendPatch(c.id, { niveau: c.niveau + 1, pvMax: c.pvMax + gain, pv: c.pv + gain });
}

/** Appelé par renderSheet : met à jour le choix de classe et la carte d'informations. */
function renderClasse(c) {
  const k = findClasse(c.classe);
  const libre = classeLibre || (!!c.classe && !k);
  const sel = $('#classe-select');
  if (document.activeElement !== sel) sel.value = k ? k.id : libre ? '*' : '';
  $('#classe-libre').hidden = !libre;
  const box = $('#classe-box');
  box.hidden = !k;
  if (!k) return;
  const principales = k.ordre.slice(0, 2).map((s) => STAT_NOMS[s]).join(', ');
  box.replaceChildren(
    el('div', { class: 'classe-head' },
      el('span', { class: 'classe-emoji', text: k.emoji }),
      el('div', { class: 'grow col0' }, el('strong', { text: `${k.id} · niveau ${c.niveau}` }), el('span', { class: 'muted tiny', text: k.desc }))),
    el('div', { class: 'classe-facts' },
      el('span', { text: `🎲 Dé de vie d${k.de}` }),
      el('span', { text: `⭐ ${principales}` }),
      el('span', { text: `🛡 Sauv. ${k.sauv}` })),
    el('div', { class: 'muted tiny', text: k.capacites }),
    el('div', { class: 'row wrap' },
      el('button', { type: 'button', class: 'small', title: 'Remplace caractéristiques, PV, CA, compétences, équipement, sorts et tenue du pion',
        onclick: () => { if (confirm(`Appliquer le kit de départ ${du(k)} ? Les caractéristiques, PV, CA, compétences, équipement et sorts actuels seront remplacés.`)) applyKit(c, k); } }, '⚡ Kit de départ'),
      el('button', { type: 'button', class: 'small', disabled: c.niveau >= 20, title: `+1 niveau et +${pvParNiveau(k, c.stats.con)} PV max (moyenne du d${k.de} + mod. CON)`, onclick: () => levelUp(c, k) }, '⬆ Monter de niveau')));
}
