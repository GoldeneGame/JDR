'use strict';
/* Montée de niveau façon MMORPG : colonne de lumière dorée sur le pion, bannière « NIVEAU X », fanfare. */

const LANCEURS = { Barde: 'complet', Clerc: 'complet', Druide: 'complet', Ensorceleur: 'complet', Magicien: 'complet', Paladin: 'demi', 'Rôdeur': 'demi', Occultiste: 'pacte' };
const ATTAQUE_SUPP = ['Barbare', 'Guerrier', 'Moine', 'Paladin', 'Rôdeur'];
const SOUS_CLASSE = { Clerc: 1, Ensorceleur: 1, Occultiste: 1, Druide: 2, Magicien: 2 };

const bonusMaitrise = (n) => 2 + Math.floor((n - 1) / 4);

/** Ce que le personnage gagne en atteignant ce niveau (règles D&D 5e simplifiées). */
function gainsDuNiveau(classe, n, pvGain) {
  const g = [];
  if (pvGain > 0) g.push(`❤ +${pvGain} PV max`);
  if (bonusMaitrise(n) > bonusMaitrise(n - 1)) g.push(`⭐ Bonus de maîtrise +${bonusMaitrise(n)}`);
  const asi = [4, 8, 12, 16, 19];
  if (classe === 'Guerrier') asi.push(6, 14);
  if (classe === 'Roublard') asi.push(10);
  if (asi.includes(n)) g.push('💪 Amélioration de caractéristique (+2, ou un don)');
  if ((SOUS_CLASSE[classe] || 3) === n && classe) g.push('🌟 Choix de la sous-classe');
  if (n === 5 && ATTAQUE_SUPP.includes(classe)) g.push('⚔ Attaque supplémentaire');
  const type = LANCEURS[classe];
  let cercle = 0;
  if (type === 'complet' && n % 2 === 1 && n <= 17) cercle = (n + 1) / 2;
  if (type === 'pacte' && n % 2 === 1 && n <= 9) cercle = (n + 1) / 2;
  if (type === 'demi' && [2, 5, 9, 13, 17].includes(n)) cercle = [2, 5, 9, 13, 17].indexOf(n) + 1;
  if (cercle > 1 || (cercle === 1 && type === 'demi')) g.push(`✨ Sorts du ${cercle === 1 ? '1er' : cercle + 'e'} niveau débloqués`);
  if (n === 20) g.push('👑 Niveau maximum : capacité ultime !');
  return g;
}

// ------------------------------------------------------------------ fanfare synthétisée
let lvlAudio = null;
function fanfare() {
  if (localStorage.getItem('lvlSon') === '0') return;
  try {
    lvlAudio = lvlAudio || new (window.AudioContext || window.webkitAudioContext)();
    const ac = lvlAudio;
    if (ac.state === 'suspended') ac.resume();
    const t0 = ac.currentTime + 0.05;
    const out = ac.createGain();
    out.gain.value = 0.32;
    out.connect(ac.destination);
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

    // souffle ascendant (bruit filtré qui monte)
    const len = 1.6;
    const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * len), ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = ac.createBufferSource();
    noise.buffer = buf;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, t0);
    bp.frequency.exponentialRampToValueAtTime(6000, t0 + 1.2);
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.0001, t0);
    ng.gain.exponentialRampToValueAtTime(0.25, t0 + 0.9);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    noise.connect(bp).connect(ng).connect(out);
    noise.start(t0); noise.stop(t0 + len);

    // cloches cristallines en arpège
    const bell = (m, t, dur = 1.8, v = 0.22) => {
      for (const [mult, amp] of [[1, 1], [2.01, 0.35], [3.02, 0.12]]) {
        const o = ac.createOscillator();
        o.type = 'sine';
        o.frequency.value = hz(m) * mult;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v * amp, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur / mult);
        o.connect(g).connect(out);
        o.start(t); o.stop(t + dur);
      }
    };
    [72, 76, 79, 84, 88, 91].forEach((m, i) => bell(m, t0 + 0.55 + i * 0.09));

    // accord de cuivres triomphal (dents de scie filtrées)
    const brass = (m, t, dur, v = 0.09) => {
      for (const det of [-6, 6]) {
        const o = ac.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(m);
        o.detune.value = det;
        const f = ac.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(400, t);
        f.frequency.exponentialRampToValueAtTime(2600, t + 0.25);
        f.frequency.exponentialRampToValueAtTime(900, t + dur);
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v, t + 0.08);
        g.gain.setValueAtTime(v, t + dur * 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(f).connect(g).connect(out);
        o.start(t); o.stop(t + dur + 0.05);
      }
    };
    const tc = t0 + 1.15;
    brass(55, tc - 0.32, 0.3); // levée : sol–do
    brass(60, tc - 0.16, 0.2);
    for (const m of [48, 60, 64, 67, 72]) brass(m, tc, 2.2, m === 48 ? 0.12 : 0.08);
    bell(96, tc, 2.5, 0.12);
  } catch { /* son indisponible : tant pis */ }
}

// ------------------------------------------------------------------ effets visuels
function effetPion(tokenId, niveau) {
  const e = tokenId && tokenEls.get(tokenId);
  if (!e) return;
  e.querySelectorAll('.lvl-fx').forEach((x) => x.remove());
  const fx = el('div', { class: 'lvl-fx' },
    el('div', { class: 'lvl-ring' }),
    el('div', { class: 'lvl-ring r2' }),
    el('div', { class: 'lvl-pillar' }),
    ...Array.from({ length: 16 }, (_, i) => {
      const s = el('span', { class: 'lvl-spark', style: {
        left: (10 + Math.random() * 80) + '%',
        animationDelay: (0.3 + Math.random() * 1.6).toFixed(2) + 's',
        animationDuration: (1 + Math.random() * 0.9).toFixed(2) + 's',
      } });
      s.style.setProperty('--dx', (Math.random() * 30 - 15).toFixed(0) + 'px');
      s.style.setProperty('--sz', (3 + (i % 3) * 2) + 'px');
      return s;
    }),
    el('div', { class: 'lvl-float', text: `Niveau ${niveau} !` }));
  e.append(fx);
  e.classList.add('leveling');
  clearTimeout(e._lvlTimer);
  e._lvlTimer = setTimeout(() => { fx.remove(); e.classList.remove('leveling'); }, 4200);
}

function banniere(fx, moi) {
  document.querySelectorAll('.lvl-banner').forEach((x) => x.remove());
  const k = typeof findClasse === 'function' ? findClasse(fx.classe) : null;
  const gains = moi ? gainsDuNiveau(k ? k.id : fx.classe, fx.niveau, fx.pvGain) : [];
  const b = el('div', { class: 'lvl-banner' + (moi ? ' moi' : '') },
    el('div', { class: 'lvl-rays' }),
    el('div', { class: 'lvl-title', text: moi ? 'Niveau supérieur !' : fx.nom }),
    el('div', { class: 'lvl-num' }, el('small', { text: 'NIVEAU' }), el('span', { text: fx.niveau })),
    el('div', { class: 'lvl-sub', text: moi ? `${fx.nom}${k ? ' · ' + k.emoji + ' ' + k.id : fx.classe ? ' · ' + fx.classe : ''}` : 'passe au niveau supérieur' }),
    gains.length ? el('ul', { class: 'lvl-gains' }, ...gains.map((g, i) => el('li', { text: g, style: { animationDelay: (1.3 + i * 0.25) + 's' } }))) : null);
  document.body.append(b);
  setTimeout(() => b.classList.add('out'), moi ? 6500 : 3800);
  setTimeout(() => b.remove(), moi ? 7300 : 4600);
  b.addEventListener('click', () => b.classList.add('out'));
}

socket.on('niveau:up', (fx) => {
  const moi = me.role === 'player' && me.charId === fx.charId;
  effetPion(fx.tokenId, fx.niveau);
  banniere(fx, moi);
  fanfare();
});
