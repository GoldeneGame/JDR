'use strict';
/* Visuels des monstres du bestiaire : petites créatures dessinées en SVG, animées en CSS (classes mo-*).
   Même cadre que les figurines (viewBox 0 -20 100 132, sol vers y = 108). */

const MO = (() => {
  const O = '#2a1a10';
  const SW = `stroke="${O}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"`;
  const STEEL = '#c3cad3';
  const WOOD = '#7a4a22';
  const BONE = '#ece3cc';

  // --- primitives
  const g = (cls, ox, oy, ...c) => `<g class="${cls}" style="transform-origin:${ox}px ${oy}px">${c.join('')}</g>`;
  const E = (cx, cy, rx, ry, f, x = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${f}" ${SW} ${x}/>`;
  const En = (cx, cy, rx, ry, f, x = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${f}" ${x}/>`;
  const C = (cx, cy, r, f, x = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f}" ${SW} ${x}/>`;
  const Cn = (cx, cy, r, f, x = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f}" ${x}/>`;
  const P = (d, f, x = '') => `<path d="${d}" fill="${f}" ${SW} ${x}/>`;
  const Pn = (d, f, x = '') => `<path d="${d}" fill="${f}" ${x}/>`;
  const L = (d, c, w = 2.2) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  /** Membre épais avec contour (bras, jambe, cou, queue). */
  const limb = (d, c, w = 8) => L(d, O, w + 3.6) + L(d, c, w);
  /** Reflet horizontal autour de x = 50. */
  const mir = (...c) => `<g transform="matrix(-1 0 0 1 100 0)">${c.join('')}</g>`;
  /** Yeux qui brillent (pulsation) et clignent. */
  const eyes = (pts, col, r = 3.2, slit = false) => g('mo-eye', 50, 40, ...pts.map(([x, y]) =>
    Cn(x, y, r + 1.6, col, 'opacity=".35"') + C(x, y, r, col) + (slit ? En(x, y, 0.9, r * 0.8, O) : Cn(x + 0.6, y - 0.6, r * 0.35, '#fff'))));
  const brows = (y = 34) => L(`M36 ${y} L46 ${y + 4} M64 ${y} L54 ${y + 4}`, O, 2.6);
  const shadow = () => ''; // pas d'ombre au sol : seuls les personnages sont dessinés
  const scale = (sx, sy, ...c) => `<g transform="translate(50 108) scale(${sx} ${sy}) translate(-50 -108)">${c.join('')}</g>`;

  // --- armes tenues dans la main droite (main vers 77, 86)
  const ARMES = {
    massue: () => P('M73 92 L79 89 L93 54 Q90 47 83 50 Z', WOOD) + C(86, 58, 1.6, '#555') + C(84, 68, 1.6, '#555') + C(90, 52, 1.6, '#555'),
    cimeterre: () => P('M75 86 Q94 70 88 48 Q85 64 72 81 Z', STEEL) + P('M70 82 L80 88 L78 91 L68 85 Z', '#6b4a2a'),
    hache: () => L('M76 98 L84 46', O, 5.5) + L('M76 98 L84 46', WOOD, 3) + P('M82 50 Q96 46 96 62 Q90 58 84 60 Z', STEEL) + P('M83 50 Q72 44 72 58 Q77 55 82 58 Z', STEEL),
    lance: () => L('M78 104 L82 30', O, 5) + L('M78 104 L82 30', WOOD, 2.6) + P('M82 18 L87 32 L82 36 L77 32 Z', STEEL),
    dague: () => P('M76 84 L80 66 L83 84 Z', STEEL) + P('M73 85 L86 85 L85 88 L74 88 Z', '#6b4a2a'),
  };
  const griffes = (x, y) => P(`M${x - 4} ${y + 2} l-1 5 l3 -3 Z M${x} ${y + 3} l0 6 l2 -5 Z M${x + 4} ${y + 2} l1 5 l-3 -3 Z`, BONE);

  /** Créature debout générique (gobelin, orc, ogre, troll, démon…). */
  function biped(o) {
    const peau = o.peau;
    const dk = shade(peau, -0.3);
    const p = [shadow(26 * (o.sx || 1))];
    const pose = o.bras === 'tendus';
    // ailes et queue derrière
    if (o.ailes) {
      const wing = P('M38 64 L6 34 L10 52 L0 56 L12 64 L4 74 L34 76 Z', o.ailes) + L('M38 64 L10 52 M38 66 L12 64 M38 70 L6 74', shade(o.ailes, -0.35), 1.4);
      p.push(g('mo-wing-l', 38, 66, wing), mir(g('mo-wing-l', 38, 66, wing)));
    }
    if (o.queue) p.push(g('mo-tail', 40, 92, limb('M42 92 Q22 104 14 88 Q10 80 16 76', o.queue, 4.5), o.dard ? P('M12 78 L16 68 L22 78 Z', o.queue) : ''));
    // jambes
    const leg = (x, cls) => g(cls, x, 86, limb(`M${x} 86 L${x} 102`, o.jambes || peau, 8.5), E(x + (x < 50 ? -1 : 1), 105, 7, 4, o.pieds || dk));
    p.push(leg(42, 'mo-leg-l'), leg(58, 'mo-leg-r'));
    const up = [];
    // corps
    up.push(P('M31 62 Q28 93 38 93 L62 93 Q72 93 69 62 Q50 54 31 62 Z', peau));
    if (o.ventre) up.push(En(50, 79, 11, 10, o.ventre));
    if (o.tenue) up.push(P('M32 63 Q50 57 68 63 L67 84 L33 84 Z', o.tenue), L('M42 64 L42 83 M58 64 L58 83', shade(o.tenue, -0.35), 1.4));
    if (o.armure) up.push(P('M33 62 Q50 55 67 62 L66 80 Q50 85 34 80 Z', o.armure), P('M30 60 Q36 54 43 60 L40 67 L31 67 Z', shade(o.armure, 0.2)), P('M70 60 Q64 54 57 60 L60 67 L69 67 Z', shade(o.armure, 0.2)));
    if (o.pagne) up.push(P('M34 84 L66 84 L63 98 L56 93 L50 99 L44 93 L37 98 Z', o.pagne));
    if (o.taches) up.push(Cn(40, 70, 2.2, dk, 'opacity=".6"'), Cn(60, 74, 2.6, dk, 'opacity=".6"'), Cn(46, 86, 1.8, dk, 'opacity=".6"'));
    // bras
    const longs = o.brasLongs ? 10 : 0;
    const armL = pose ? 'M33 64 Q20 66 8 60' : `M33 64 Q22 72 23 ${86 + longs}`;
    const armR = pose ? 'M67 64 Q80 66 92 60' : `M67 64 Q78 72 77 ${86 + longs}`;
    const handL = pose ? [8, 60] : [23, 87 + longs];
    const handR = pose ? [92, 60] : [77, 87 + longs];
    up.push(g('mo-arm-l', 33, 64, limb(armL, peau, 7.5), C(handL[0], handL[1], 4.6, peau), o.griffes ? griffes(handL[0], handL[1] + 2) : ''));
    up.push(g('mo-arm-r', 67, 64, o.arme ? ARMES[o.arme]() : '', limb(armR, peau, 7.5), C(handR[0], handR[1], 4.6, peau), o.griffes ? griffes(handR[0], handR[1] + 2) : ''));
    // tête
    const h = [];
    if (o.oreilles === 'gob') h.push(P('M34 38 L6 26 L14 36 L31 47 Z', peau), Pn('M30 40 L13 32 L18 38 Z', '#d98a8a', 'opacity=".55"'), mir(P('M34 38 L6 26 L14 36 L31 47 Z', peau), Pn('M30 40 L13 32 L18 38 Z', '#d98a8a', 'opacity=".55"')));
    if (o.oreilles === 'pointues') h.push(P('M33 38 L20 30 L32 46 Z', peau), mir(P('M33 38 L20 30 L32 46 Z', peau)));
    if (o.museau === 'hyene') h.push(P('M33 30 L30 14 L42 24 Z', peau), mir(P('M33 30 L30 14 L42 24 Z', peau)));
    if (o.criniere) h.push(P('M36 26 Q34 14 42 18 Q46 8 50 16 Q54 8 58 18 Q66 14 64 26 Q66 44 70 58 L30 58 Q34 44 36 26 Z', o.criniere));
    h.push(E(50, 40, o.teteL || 18, 16.5, peau));
    if (o.cheveux) h.push(P('M37 30 L36 18 L42 24 L44 12 L49 22 L52 9 L55 22 L60 13 L61 25 L66 19 L64 31 Q50 23 37 30 Z', o.cheveux));
    if (o.cornes) h.push(P('M38 28 Q26 18 30 4 Q36 16 44 24 Z', o.cornes), mir(P('M38 28 Q26 18 30 4 Q36 16 44 24 Z', o.cornes)));
    if (o.museau === 'hyene') h.push(E(50, 49, 11, 8, shade(peau, 0.15)), En(50, 44, 4, 2.6, O), L('M43 53 Q50 57 57 53', O, 1.6));
    if (o.museau === 'lezard') h.push(E(50, 48, 12, 7.5, shade(peau, 0.12)), Cn(46, 45, 1, O), Cn(54, 45, 1, O), L('M40 51 Q50 55 60 51', O, 1.6), P('M42 26 L46 16 L50 25 L54 16 L58 26 Z', o.crete || dk));
    h.push(eyes([[42, 39], [58, 39]], o.yeux, 3.4, !!o.museau));
    h.push(brows(32));
    if (!o.museau) {
      h.push(L('M41 50 Q50 46 59 50', O, 2));
      if (o.crocs) h.push(P('M42 50 L44 43 L46 49 Z', BONE), P('M58 50 L56 43 L54 49 Z', BONE));
      else h.push(P('M45 48.5 L46.5 51.5 L48 48 Z', '#fff'), P('M55 48.5 L53.5 51.5 L52 48 Z', '#fff'));
    }
    up.push(g('mo-head', 50, 56, ...h));
    p.push(g('mo-up', 50, 100, ...up));
    return scale(o.sx || 1, o.sy || 1, ...p);
  }

  /** Bête à quatre pattes vue de profil (loup, sanglier, ours, rat). */
  function quad(o) {
    const c = o.c;
    const dk = shade(c, -0.3);
    const p = [shadow(32 * (o.sx || 1))];
    const legs = (x, col, cls) => g(cls, x, 88, limb(`M${x} 88 L${x} 103`, col, o.patte || 7), E(x + 2, 105, 5.5, 3.2, shade(col, -0.25)));
    // pattes du fond (plus sombres)
    p.push(legs(34, dk, 'mo-leg-r'), legs(64, dk, 'mo-leg-l'));
    // queue
    const tails = {
      touffue: () => g('mo-tail', 24, 80, P('M26 80 Q8 78 4 90 Q14 86 18 92 Q20 84 28 86 Z', c)),
      fine: () => g('mo-tail', 24, 84, L('M26 86 Q6 92 6 76 Q8 66 16 70', O, 3.6) + L('M26 86 Q6 92 6 76 Q8 66 16 70', o.queueC || c, 2)),
      courte: () => g('mo-tail', 24, 80, L('M25 80 q-6 -2 -6 -7 q4 0 3 4', O, 2.4)),
    };
    p.push(tails[o.queue || 'touffue']());
    const body = [E(48, 84, 27, 15, c)];
    if (o.ventre) body.push(Pn('M28 88 Q48 102 70 88 Q60 96 48 97 Q36 96 28 88 Z', o.ventre));
    if (o.criniere) body.push(P('M30 72 Q38 62 52 66 Q62 62 70 72 L64 74 L58 70 L52 74 L46 69 L40 74 L34 70 Z', o.criniere));
    p.push(g('mo-up', 48, 98, ...body));
    p.push(legs(40, c, 'mo-leg-l'), legs(70, c, 'mo-leg-r'));
    // tête
    const h = [];
    const ear = { pointues: P('M70 62 L72 46 L80 60 Z', c) + P('M78 62 L84 48 L88 63 Z', c), rondes: C(70, 62, 5, c) + C(84, 61, 5, c), roses: E(70, 60, 6, 8, '#d98a8a') + E(82, 60, 6, 8, '#d98a8a'), petites: P('M72 63 L74 55 L80 62 Z', c) };
    h.push(ear[o.oreilles || 'pointues']);
    h.push(E(78, 72, 12, 11, c));
    const ml = o.museau || 12;
    h.push(P(`M84 66 Q${88 + ml} 68 ${90 + ml} 74 Q${88 + ml} 82 82 81 Z`, shade(c, 0.1)));
    h.push(En(90 + ml, 73, o.groin ? 3.4 : 2.4, o.groin ? 4 : 2, o.groin ? '#d98a8a' : O, o.groin ? `${SW}` : ''));
    if (o.crocs) h.push(P(`M${86 + ml / 2} 79 l2 -6 l2 6 Z`, BONE));
    if (o.defenses) h.push(P(`M${84 + ml / 2} 80 Q${92 + ml / 2} 80 ${92 + ml / 2} 70 Q${88 + ml / 2} 76 ${82 + ml / 2} 76 Z`, BONE));
    h.push(eyes([[80, 69]], o.yeux || '#ffcc33', 2.6));
    h.push(L('M76 64 L84 67', O, 2.2));
    p.push(g('mo-head', 72, 78, ...h));
    return scale(o.sx || 1, o.sy || 1, ...p);
  }

  // --- créatures uniques
  function serpent() {
    const c = '#4f8a2c'; const v = '#d8c860';
    const neck = 'M52 92 Q72 84 62 66 Q52 52 62 42';
    return shadow(26) + g('mo-up', 50, 104,
      E(50, 100, 26, 8, c), En(50, 101, 18, 4, shade(c, -0.25)), E(48, 92, 19, 6.5, c), Pn('M36 92 L40 90 L44 92 L48 90 L52 92 L56 90 L60 92', 'none', `stroke="${v}" stroke-width="1.4"`)) +
      g('mo-head', 54, 90, limb(neck, c, 11), L(neck, v, 4),
        P('M54 40 Q60 30 72 34 Q80 38 76 44 Q70 50 58 48 Q52 46 54 40 Z', c),
        eyes([[63, 38], [71, 39]], '#ffd23a', 2.2, true),
        g('mo-tongue', 76, 44, L('M76 44 L86 46 M86 46 L90 43 M86 46 L90 49', '#e03030', 1.6)));
  }
  function chauvesouris() {
    const c = '#4a3a44'; const w = '#3a2a36';
    const wing = P('M42 58 Q28 38 4 42 Q12 50 8 60 Q16 58 20 68 Q26 60 32 70 Q36 62 42 66 Z', w) + L('M42 58 L8 60 M42 60 L20 68 M42 62 L32 70', shade(w, 0.25), 1.2);
    return shadow(16) + g('mo-float', 50, 60,
      g('mo-wing-l', 42, 60, wing), mir(g('mo-wing-l', 42, 60, wing)),
      E(50, 64, 11, 14, c), En(50, 68, 6, 8, shade(c, 0.18)),
      g('mo-head', 50, 52, P('M40 44 L36 28 L46 38 Z', c), mir(P('M40 44 L36 28 L46 38 Z', c)), C(50, 46, 10, c),
        eyes([[46, 45], [54, 45]], '#ff3030', 2), P('M46 51 L47 55 L48 51 Z', '#fff'), P('M54 51 L53 55 L52 51 Z', '#fff')),
      L('M46 77 l-2 5 M54 77 l2 5', O, 2));
  }
  function araignee() {
    const c = '#2c2a2e'; const leg = '#3c383e';
    const L4 = (side) => [
      limb('M42 70 Q24 50 14 60 L6 92', leg, 3.2), limb('M42 74 Q22 62 10 72 L6 100', leg, 3.2),
      limb('M43 78 Q24 76 16 86 L14 104', leg, 3.2), limb('M44 82 Q30 88 26 96 L26 106', leg, 3.2)].map((d, i) => g(i % 2 === side ? 'mo-leg-l' : 'mo-leg-r', 42, 74, d)).join('');
    return shadow(34) + L4(0) + mir(L4(1)) + g('mo-up', 50, 100,
      E(50, 88, 22, 16, c), P('M46 82 L54 82 L50 88 L54 94 L46 94 L50 88 Z', '#c02020'),
      E(50, 70, 13, 10, shade(c, 0.12)),
      eyes([[45, 66], [55, 66], [48, 62], [52, 62]], '#ff2a2a', 1.8),
      P('M45 76 Q44 82 47 84 L48 78 Z', BONE), P('M55 76 Q56 82 53 84 L52 78 Z', BONE));
  }
  function scorpion() {
    const c = '#a0662c'; const dk = shade(c, -0.3);
    const tail = 'M50 86 Q28 80 30 56 Q34 34 56 34';
    const pince = P('M30 80 Q18 76 14 66 Q10 58 16 54 Q16 62 22 64 Q20 56 26 54 Q30 62 28 70 Z', c);
    const legs = [0, 1, 2].map((i) => limb(`M${40 - i * 2} ${88 + i * 3} L${26 - i * 4} ${98 + i * 3}`, dk, 2.8)).join('');
    return shadow(34) + legs + mir(legs) + g('mo-arm-l', 34, 82, limb('M40 84 L30 80', c, 4), pince) + mir(g('mo-arm-l', 34, 82, limb('M40 84 L30 80', c, 4), pince)) +
      g('mo-tail', 50, 86, limb(tail, c, 7.5), Pn('M50 86 Q28 80 30 56 Q34 34 56 34', 'none', `stroke="${dk}" stroke-width="7" stroke-dasharray="1.2 5"`), P('M54 30 Q66 30 64 40 L58 38 Z', '#3a2010')) +
      g('mo-up', 50, 98, E(50, 92, 20, 12, c), E(50, 80, 12, 8, shade(c, 0.08)), L('M38 88 Q50 84 62 88 M38 93 Q50 89 62 93', dk, 1.4), eyes([[46, 84], [54, 84]], '#202020', 1.6));
  }
  function spectre() {
    const c = '#b8cde8';
    return g('mo-float', 50, 60,
      En(50, 62, 32, 40, '#9fb8ff', 'opacity=".18"'),
      P('M30 52 Q30 26 50 24 Q70 26 70 52 L72 96 Q66 90 62 98 Q56 90 50 98 Q44 90 38 98 Q34 90 28 96 Z', c, 'opacity=".85"'),
      g('mo-arm-l', 32, 56, P('M32 56 Q18 66 14 80 Q22 74 26 78 Q26 70 34 66 Z', c, 'opacity=".8"')),
      mir(g('mo-arm-l', 32, 56, P('M32 56 Q18 66 14 80 Q22 74 26 78 Q26 70 34 66 Z', c, 'opacity=".8"'))),
      P('M36 46 Q36 30 50 30 Q64 30 64 46 Q58 56 50 56 Q42 56 36 46 Z', '#1a1a2e'),
      eyes([[44, 44], [56, 44]], '#7fe8ff', 2.6), En(50, 52, 3, 2, '#7fe8ff', 'opacity=".5"'));
  }
  function squelette() {
    const p = [shadow(22)];
    p.push(g('mo-leg-l', 44, 86, limb('M44 86 L42 104', BONE, 3.6), E(41, 105, 5, 2.6, BONE)), g('mo-leg-r', 56, 86, limb('M56 86 L58 104', BONE, 3.6), E(59, 105, 5, 2.6, BONE)));
    const up = [
      P('M38 84 Q50 78 62 84 L58 90 L42 90 Z', BONE),
      limb('M50 58 L50 84', BONE, 3.4),
      ...[62, 67, 72, 77].map((y, i) => L(`M${38 + i} ${y} Q50 ${y + 3} ${62 - i} ${y}`, O, 4.6) + L(`M${38 + i} ${y} Q50 ${y + 3} ${62 - i} ${y}`, BONE, 2.6)),
      g('mo-arm-l', 36, 60, limb('M36 60 Q26 70 26 84', BONE, 3.2), P('M14 66 Q16 58 26 60 Q34 64 32 78 Q30 90 18 88 Q12 78 14 66 Z', '#6b4a2a'), C(23, 74, 3, '#b0a070')),
      g('mo-arm-r', 64, 60, P('M74 84 L88 40 L91 42 L78 86 Z', STEEL), limb('M64 60 Q74 70 75 84', BONE, 3.2), C(75, 85, 3.4, BONE)),
      g('mo-head', 50, 56, E(50, 38, 15, 15, BONE), P('M42 48 L58 48 L56 56 L44 56 Z', BONE), L('M46 50 L46 56 M50 50 L50 56 M54 50 L54 56', O, 1.2),
        En(44, 39, 4.4, 5, O), En(56, 39, 4.4, 5, O), eyes([[44, 39], [56, 39]], '#ff5a2a', 1.6), Pn('M48 46 L50 42 L52 46 Z', O)),
    ];
    p.push(g('mo-up', 50, 100, ...up));
    return p.join('');
  }
  function golem() {
    const s = '#8c8a86'; const dk = shade(s, -0.3); const rune = '#4ad6ff';
    const p = [shadow(34)];
    p.push(g('mo-leg-l', 40, 88, P('M32 86 L46 86 L46 104 L30 104 Z', dk)), g('mo-leg-r', 60, 88, P('M54 86 L68 86 L70 104 L54 104 Z', dk)));
    const up = [
      P('M24 58 L76 58 L72 90 L28 90 Z', s), L('M36 64 L42 74 L38 84 M62 66 L58 76', '#4a4846', 1.6), L('M42 74 L52 72', rune, 1.6),
      Cn(50, 72, 4, rune, 'class="mo-eye" style="transform-origin:50px 72px"'),
      g('mo-arm-l', 26, 62, P('M10 58 L28 58 L26 92 L8 92 Z', s), P('M6 92 L28 92 L28 104 L6 104 Z', dk)),
      g('mo-arm-r', 74, 62, P('M72 58 L90 58 L92 92 L74 92 Z', s), P('M72 92 L94 92 L94 104 L72 104 Z', dk)),
      g('mo-head', 50, 58, P('M38 34 L62 34 L64 56 L36 56 Z', s), L('M38 42 L62 42', dk, 2.4), eyes([[44, 47], [56, 47]], rune, 2.4)),
    ];
    p.push(g('mo-up', 50, 100, ...up));
    return p.join('');
  }
  function dragon() {
    const c = '#b8262a'; const dk = shade(c, -0.35); const v = '#f0c060';
    const wing = P('M36 52 L2 4 L6 22 L-6 24 L4 38 L-8 44 L8 54 L-2 64 L30 70 Z', dk) + L('M36 52 L6 22 M36 56 L4 38 M34 62 L8 54', shade(dk, -0.3), 1.6) + Pn('M36 52 L6 22 L4 38 L8 54 L30 70 Z', c, 'opacity=".45"');
    return shadow(36) +
      g('mo-wing-l', 36, 56, wing) + mir(g('mo-wing-l', 36, 56, wing)) +
      g('mo-tail', 62, 98, limb('M60 100 Q88 104 92 90 Q96 80 88 76', c, 7), P('M84 72 L96 74 L88 82 Z', dk)) +
      g('mo-leg-l', 36, 92, E(34, 98, 10, 9, c), griffes(34, 104)) + g('mo-leg-r', 64, 92, E(66, 98, 10, 9, c), griffes(66, 104)) +
      g('mo-up', 50, 104,
        P('M30 96 Q24 62 50 50 Q76 62 70 96 Q50 104 30 96 Z', c),
        P('M40 94 Q36 70 50 58 Q64 70 60 94 Q50 98 40 94 Z', v), L('M40 66 L60 66 M39 74 L61 74 M38 82 L62 82 M39 90 L61 90', shade(v, -0.3), 1.2),
        g('mo-arm-l', 36, 68, limb('M36 68 Q28 78 32 84', c, 5), griffes(32, 84)), mir(g('mo-arm-l', 36, 68, limb('M36 68 Q28 78 32 84', c, 5), griffes(32, 84))),
        g('mo-head', 50, 52, limb('M50 56 Q46 40 50 30', c, 10), P('M50 24 L52 30 L48 30 Z', dk),
          P('M38 14 Q28 2 30 -10 Q36 2 44 8 Z', '#e8dcc0'), mir(P('M38 14 Q28 2 30 -10 Q36 2 44 8 Z', '#e8dcc0')),
          P('M36 18 Q36 6 50 6 Q64 6 64 18 L62 30 Q56 38 50 38 Q44 38 38 30 Z', c),
          P('M41 30 Q50 34 59 30 L58 36 Q50 42 42 36 Z', shade(c, 0.15)), Cn(46, 31, 1, O), Cn(54, 31, 1, O),
          eyes([[43, 20], [57, 20]], '#ffd000', 2.6, true), L('M38 15 L46 19 M62 15 L54 19', O, 2.4),
          g('mo-fire', 50, 40, En(50, 41, 4, 2, '#ffb030', 'opacity=".9"'), En(50, 41, 2, 1, '#fff2a0')))) ;
  }

  // --- humanoïdes : figurines du créateur de personnage, sans les joues roses
  const FIGS = {
    bandit: { peau: '#e0aa7e', cheveux: 'court', couleurCheveux: '#2b1a10', barbe: 'courte', tenue: 'cuir', couleurTenue: '#5a3a2a', tete: 'capuche', arme: 'dague', cape: true, couleurCape: '#3a2a1a', oreilles: 'humaines' },
    hobgobelin: { peau: '#c0602a', cheveux: 'queue', couleurCheveux: '#1a1a1a', tenue: 'armure', couleurTenue: '#8a3a1a', tete: 'casque', arme: 'epee', bouclier: true, cape: true, couleurCape: '#5a1a0a', oreilles: 'elfiques', crocs: true },
    chevalier: { peau: '#8a9bb0', tenue: 'armure', couleurTenue: '#2a2a3a', tete: 'casque', arme: 'epee', bouclier: true, cape: true, couleurCape: '#5a0a0a', oreilles: 'humaines' },
    mage: { peau: '#b8b0a8', cheveux: 'long', couleurCheveux: '#f4f1e8', barbe: 'longue', tenue: 'robe', couleurTenue: '#3a1a5a', tete: 'mage', arme: 'baton', cape: true, couleurCape: '#1a0a2a', oreilles: 'humaines' },
    vampire: { peau: '#ece6e0', cheveux: 'court', couleurCheveux: '#141014', tenue: 'tunique', couleurTenue: '#1a1a2a', tete: 'rien', arme: 'aucune', cape: true, couleurCape: '#8a0a1a', oreilles: 'elfiques', crocs: true },
  };
  const ROUGE = { vampire: '#ff2a3a', chevalier: '#ff4a2a', mage: '#b070ff' };

  const DESSINS = {
    rat: () => quad({ c: '#8a7868', ventre: '#b8a898', sx: 0.62, sy: 0.6, oreilles: 'roses', queue: 'fine', queueC: '#d9a0a0', museau: 10, yeux: '#ff3030', crocs: true, patte: 5 }),
    serpent,
    kobold: () => biped({ peau: '#b0562a', ventre: '#d8a060', museau: 'lezard', crete: '#7a2a10', queue: '#b0562a', yeux: '#ffcc00', arme: 'dague', pagne: '#4a3020', cornes: '#e8dcc0', sx: 0.8, sy: 0.76 }),
    gobelin: () => biped({ peau: '#6f9a3a', ventre: '#8ab04f', oreilles: 'gob', yeux: '#ffd23a', arme: 'cimeterre', tenue: '#6b4a2a', pagne: '#4a3020', sx: 0.84, sy: 0.8 }),
    squelette,
    zombie: () => biped({ peau: '#8aa070', tenue: '#5a4a3a', pagne: '#3a3028', yeux: '#e8f0a0', griffes: true, bras: 'tendus', taches: true, sx: 0.98, sy: 1 }),
    loup: () => quad({ c: '#7c7c84', ventre: '#c8c8cc', oreilles: 'pointues', queue: 'touffue', museau: 13, yeux: '#ffd040', crocs: true, criniere: '#5c5c64', sx: 0.95, sy: 0.95 }),
    sanglier: () => quad({ c: '#6a4a2c', oreilles: 'petites', queue: 'courte', museau: 9, groin: true, defenses: true, criniere: '#3a2a1a', yeux: '#ff5030', sx: 0.95, sy: 0.88, patte: 6.5 }),
    chauvesouris,
    orc: () => biped({ peau: '#6a8a3a', oreilles: 'pointues', crocs: true, yeux: '#ff5030', arme: 'hache', armure: '#5a4a3a', pagne: '#3a2a1a', cheveux: '#1a1a1a', sx: 1.04, sy: 1 }),
    hobgobelin: null,
    gnoll: () => biped({ peau: '#b08a4a', museau: 'hyene', criniere: '#4a3020', yeux: '#ffdd44', arme: 'lance', tenue: '#5a3a2a', pagne: '#3a2a1a', taches: true, sy: 1.06 }),
    araignee,
    goule: () => biped({ peau: '#8a7a9a', oreilles: 'pointues', crocs: true, yeux: '#ff4040', griffes: true, brasLongs: true, pagne: '#3a2a2a', taches: true, sx: 0.92, sy: 0.98 }),
    spectre,
    ours: () => quad({ c: '#7a5030', ventre: '#9a7050', oreilles: 'rondes', queue: 'courte', museau: 8, yeux: '#2a1a10', crocs: true, sx: 1.12, sy: 1.12, patte: 9 }),
    scorpion,
    ogre: () => biped({ peau: '#b08a5a', ventre: '#c8a070', yeux: '#fff0a0', crocs: true, arme: 'massue', pagne: '#6b4a2a', oreilles: 'pointues', sx: 1.22, sy: 1.1, teteL: 17 }),
    chevalier: null,
    mage: null,
    troll: () => biped({ peau: '#5f8a5a', ventre: '#7aa070', oreilles: 'pointues', crocs: true, cheveux: '#2a3a2a', griffes: true, brasLongs: true, yeux: '#ffee55', pagne: '#4a3a2a', taches: true, sx: 1.04, sy: 1.18 }),
    demon: () => biped({ peau: '#b02a2a', ventre: '#d05040', cornes: '#2a1a1a', ailes: '#5a1010', queue: '#b02a2a', dard: true, yeux: '#ffdd00', griffes: true, crocs: true, sx: 1.08, sy: 1.08 }),
    golem,
    dragon,
    vampire: null,
  };

  const LISTE = Object.keys(DESSINS);
  const NOMS = { rat: 'Rat', serpent: 'Serpent', kobold: 'Kobold', gobelin: 'Gobelin', squelette: 'Squelette', zombie: 'Zombie', loup: 'Loup', sanglier: 'Sanglier',
    chauvesouris: 'Chauve-souris', orc: 'Orc', hobgobelin: 'Hobgobelin', gnoll: 'Gnoll', araignee: 'Araignée', goule: 'Goule', spectre: 'Spectre', ours: 'Ours',
    scorpion: 'Scorpion', ogre: 'Ogre', chevalier: 'Chevalier noir', mage: 'Mage', troll: 'Troll', demon: 'Démon', golem: 'Golem', dragon: 'Dragon', vampire: 'Vampire' };

  // Cadrage en médaillon (vignettes rondes) : tête et buste pour les créatures debout, la bête entière sinon
  const BUSTES = { serpent: '18 26 80 80', chauvesouris: '2 6 96 96', araignee: '4 36 92 92', scorpion: '8 26 84 84', spectre: '14 16 72 72',
    squelette: '20 18 62 62', golem: '6 24 88 88', dragon: '4 -14 92 92' };
  function busteVB(id) {
    if (BUSTES[id]) return BUSTES[id];
    const src = DESSINS[id].toString();
    const num = (k, d) => { const m = new RegExp(k + ': ([0-9.]+)').exec(src); return m ? Number(m[1]) : d; };
    const sx = num('sx', 1); const sy = num('sy', 1);
    if (src.includes('quad(')) { const w = 106 * sx; return `${(50 - 50 * sx).toFixed(1)} ${(108 - 66 * sy - (w - 66 * sy) / 2).toFixed(1)} ${w.toFixed(1)} ${w.toFixed(1)}`; }
    const b = 72 * Math.max(sy, sx * 0.9);
    return `${(50 - b / 2).toFixed(1)} ${(108 - 90 * sy).toFixed(1)} ${b.toFixed(1)} ${b.toFixed(1)}`;
  }
  const cache = new Map();
  /** SVG du monstre. seed (ex. id du pion) : décale les animations pour que deux gobelins ne bougent pas en même temps. */
  function svg(id, mode = 'pied', seed = '') {
    if (!LISTE.includes(id)) id = 'gobelin';
    let h = 11;
    for (const ch of String(seed) + id) h = (h * 31 + ch.charCodeAt(0)) | 0;
    h = Math.abs(h);
    const fd = -((h % 4000) / 1000);
    const fs = (0.85 + ((h >> 5) % 30) / 100).toFixed(2);
    if (FIGS[id]) {
      let s = figurineSVG(FIGS[id], mode).replace(/<ellipse[^>]*#ff6b6b[^>]*\/>/g, '');
      if (ROUGE[id]) s = s.replace(/(<g class="fa-eyes">)(.*?)(<\/g>)/, (m, a, b, c2) => a + b.replace(new RegExp(`fill="${O}"`, 'g'), `fill="${ROUGE[id]}"`) + c2);
      return s.replace(/style="--fd:[^;]*;--fs:[^"]*"/, `style="--fd:${fd}s;--fs:${fs}"`).replace('class="fig-svg fig-anim"', `class="fig-svg fig-anim mo-fig mo-${id}"`);
    }
    if (!cache.has(id)) cache.set(id, DESSINS[id]());
    const vb = mode === 'buste' ? busteVB(id) : '0 -20 100 132';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" class="fig-svg mo-anim mo-${id}" style="--fd:${fd}s;--fs:${fs}" overflow="visible">${cache.get(id)}</svg>`;
  }
  return { svg, LISTE, NOMS };
})();
