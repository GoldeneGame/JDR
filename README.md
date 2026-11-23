# ⚔ La Taverne — table de JDR en ligne

Application de jeu de rôle (style Donjons & Dragons) hébergée sur le PC du MJ.
Les joueurs n'installent rien : ils ouvrent un lien dans leur navigateur (PC, tablette ou téléphone).

Les outils du MJ sont dans le **bandeau du haut** : 🔗 Inviter, 🎬 Séance, 👹 Monstres, ♟ Pions, 🌫 Brouillard, 💡 Éclairage, 🎵 Musique, ⚙ Partie.
Chaque bouton ouvre un panneau par-dessus la carte (re-clic, ✕ ou Échap pour le fermer). La colonne de droite garde
le journal, les fiches, l'apparence des pions et l'initiative.

## Lancer une partie

1. Double-clique sur **`LaTaverne.exe`**. Le navigateur s'ouvre tout seul, et la fenêtre noire
   affiche les adresses, le mot de passe du MJ et le lien Internet.
   (Depuis le code source : `demarrer.bat`.)
2. Onglet **Maître du jeu**, puis saisis le mot de passe (`dragon` par défaut).
3. Les joueurs ouvrent le lien qu'on leur envoie et entrent **le nom de leur personnage**.
   - Nom nouveau : une fiche et un pion sont créés.
   - Nom existant : le joueur retrouve sa fiche (majuscules et accents ignorés).

Laisse la fenêtre noire ouverte pendant toute la partie. La fermer arrête le serveur.
Tout est sauvegardé automatiquement dans `data/` : fiches, cartes, pions, journal.

## Jouer à distance

**Option recommandée : tunnel Cloudflare** (gratuit, sans compte, sans toucher à la box)

1. Rien à faire : au lancement, l'application utilise `cloudflared.exe` placé à côté d'elle.
   S'il manque, elle le télécharge automatiquement une seule fois (~55 Mo).
2. Un lien `https://xxxx.trycloudflare.com` s'affiche dans la fenêtre
   et dans le menu **🔗 Inviter** du bandeau du haut (avec un bouton Copier).
3. Envoie ce lien aux joueurs (Discord, SMS…). ⚠ Le lien change à chaque lancement.

**Même maison / même Wi-Fi** : utilise l'adresse « Réseau local » (ex. `http://192.168.1.147:3000`).
Windows peut demander d'autoriser Node.js dans le pare-feu : accepte pour les réseaux privés.

**Autres solutions** : Tailscale (VPN gratuit, chaque joueur l'installe) ou une redirection
du port 3000 sur ta box. Le tunnel Cloudflare reste le plus simple.

## Fonctionnalités

| | Joueur | MJ |
|---|---|---|
| Fiche de personnage (caracs, PV, CA, inventaire, sorts, notes…) | la sienne | toutes, modifiables |
| Lancer de dés : on choisit ses dés (d4 à d100), le bonus, l’avantage, puis **Lancer** ; les dés roulent à l’écran pour tous | ✔ | ✔ |
| Jets secrets (visibles du MJ seulement) | ✔ | ✔ (visibles de lui seul) |
| Chat, murmures privés | ✔ | ✔ + messages de narration |
| Carte avec grille et pions déplaçables | son pion | tous les pions |
| Pion = petit personnage à créer (peau, coiffure, barbe, tenue, couvre-chef, arme, bouclier, cape, modèles prêts) — ou emblème / portrait, avec cadre (or, feu, arcane…) | le sien | tous, y compris les monstres |
| Pions cachés (monstres en embuscade) | — | ✔ |
| Portes : s'ouvrent et se ferment d'un clic, se verrouillent ; fermées, elles arrêtent la vue et la lumière | ouvre celles à côté de son pion | ouvre, ferme, verrouille partout |
| Brouillard de guerre : zones révélées par le MJ ou explorées par les pions (les murs bloquent la vue) | ne voit que ce qui est révélé | révèle, cache, règle |
| Éclairage dynamique : nuit, torches, lanternes, sorts, feux du décor, ombres des murs, vision dans le noir | voit ce qui est éclairé, allume sa torche | règle tout |
| Initiative : ordre, tour actif, rounds | lance la sienne | gère tout |
| Cartes / scènes (images) | — | import et changement de scène |
| Battle maps : sol peint case par case (herbe, dalles, marbre, eau, lave, pont, palissade, murs…) et décor (arbres, tonneaux, coffres, portes…) | les voit en direct | crée et peint |
| Classes (12 classes : Barbare, Barde, Clerc, Druide, Ensorceleur, Guerrier, Magicien, Moine, Occultiste, Paladin, Rôdeur, Roublard) avec kit de départ et montée de niveau | la sienne | toutes |
| Monstres du bestiaire (26 : gobelins, loups, squelettes, orcs, ogres, troll, dragon…), dessinés et animés (le dragon bat des ailes, le serpent sort la langue, le spectre flotte…), ajoutés à tout moment, avec PV, CA et attaque | voit leur état (barre de vie) | ajoute, attaque |
| Dégâts et soins sur les joueurs et les monstres (nombre ou formule de dés, plusieurs cibles, moitié) | — | ✔ |
| Pions vivants : ils se balancent en permanence, respirent, clignent des yeux, leur cape ondule ; ils marchent quand on les déplace | ✔ | ✔ |
| Musique d'ambiance (taverne, voyage, forêt, feu de camp, donjon, mystère, combat, boss, victoire, deuil, orage) ou tes propres fichiers (MP3…), lancée par le MJ chez tout le monde | l'entend, règle son volume | lance, change, arrête |
| Diaporamas (slides) projetés en plein écran chez tous les joueurs | les voit | crée, projette |

Sur les boutons de dés : clic = ajouter un dé, clic droit = en retirer un. Animation et son se coupent sous le bouton Lancer.
Raccourcis du chat : `/r 1d20+5 Attaque` (jet public), `/sr 1d20` (jet secret).
Sur la fiche, clique sur un modificateur (+2, −1…) pour lancer d20 + modificateur.
Onglet **Pion** (ou double-clic sur ton pion) : personnalise son apparence (personnage, monstre dessiné, emblème, portrait).

## Battle maps

Bouton **🖌 Éditer la carte** (au-dessus de la carte) ou menu **🎬 Séance → onglet 🗺 Cartes → Créer une battle map** : choisis la taille
(en cases) et le sol de fond, puis peins :

- **Pinceau** (taille 1, 2 ou 3 cases), **Rectangle** (glisse pour remplir une zone), **Ligne** (droite horizontale ou verticale, idéale pour les murs), **Salle** (murs sur le pourtour + sol à l'intérieur, en un seul geste), **Remplir** (toute une zone identique) ;
- **Sol** : herbe, sous-bois, terre, sable, neige, pavés, dalles, plancher, tapis, eau, eau profonde, marais, glace, lave, gouffre, mur, roche ;
- **Décor** (plus de 80 éléments rangés par catégories, avec une recherche) : nature, camp & village, intérieur, donjon, trésors & objets, marques… ;
- **clic droit** = gomme.

**Importer une battle map toute faite** (image téléchargée ou dessinée) : dans l'éditeur, « Nouvelle battle map » → **🖼 Image importée**,
ou depuis l'onglet MJ (champ « cases en largeur »). Indique combien de cases compte la grille de l'image d'un bord à l'autre :
la grille de l'application et les pions s'alignent dessus. Les boutons **− / +** de l'éditeur permettent d'ajuster ensuite,
et tu peux décocher « Afficher la grille » si l'image a déjà la sienne. Le décor et le sol se peignent aussi par-dessus.

Les joueurs voient la carte se dessiner en direct. Astuce : trace d'abord la salle en **mur** au rectangle, puis l'intérieur en **dalles**.
On peut aussi peindre par-dessus une carte importée (image), par exemple pour ajouter du décor.

## Portes

Dans l'éditeur de battle map, pose le décor **🚪 Porte** dans l'ouverture d'un mur : elle se dessine en travers du passage
(orientée selon les murs voisins) et devient une vraie porte.
- **Clic** sur la porte : elle s'ouvre ou se ferme, avec un grincement chez tout le monde.
- **MJ** : ouvre et ferme n'importe quelle porte ; **clic droit** = verrouiller / déverrouiller (cadenas doré).
- **Joueurs** : ils ouvrent une porte **à côté de leur pion** (pas à travers la carte, ni dans le brouillard). Une porte
  verrouillée résiste : « elle est verrouillée » s'affiche au journal.
- Une porte fermée **arrête la vue et la lumière** comme un mur : derrière, le brouillard reste en place et les monstres
  restent cachés. En l'ouvrant, on découvre la pièce suivante.

## Brouillard de guerre

Menu **🌫 Brouillard** (MJ), réglé carte par carte :
- **Activer le brouillard** : la carte est recouvrue chez les joueurs. Toi, tu vois à travers (zones hachurées) ;
  « Voir comme les joueurs » montre exactement ce qu'ils voient.
- **Révéler / Cacher** avec le **pinceau** (taille 1 à 9 cases) ou le **rectangle**, puis **🖌 Peindre sur la carte** :
  clic gauche = l'outil choisi, clic droit = l'inverse, Échap pour arrêter. **Tout révéler** / **Tout recouvrir** d'un clic.
- **Exploration automatique** : en se déplaçant, les pions des joueurs révèlent ce qu'ils voient (portée réglable, 6 cases
  par défaut). Les murs et la roche bloquent la vue. De nuit (éclairage actif), la portée devient celle de leur lumière
  ou de leur vision dans le noir : sans torche, on ne voit presque rien.
- Les monstres et PNJ dans le brouillard ne sont **pas envoyés** aux joueurs (impossible de tricher) ; ils apparaissent
  dès que leur case est révélée, et les dégâts qu'ils subissent n'apparaissent pas dans le journal des joueurs.

## Éclairage dynamique

Menu **💡 Éclairage** (MJ), réglé carte par carte :
- **Activer l'éclairage**, puis choisis l'ambiance (☀️ Jour, 🌅 Crépuscule, 🌙 Nuit, 🌑 Ténèbres) ou règle l'obscurité au curseur.
- **Zones d'ombre** : peins l'ombre où tu veux sur la carte (pinceau ou rectangle), même sans activer l'éclairage,
  en 4 intensités : 🌗 pénombre, 🌘 ombre, 🌑 obscurité, ⬛ **ténèbres totales**. En ténèbres totales, les joueurs ne voient
  plus rien de la zone, et les monstres qui s'y cachent ne leur sont même pas envoyés (ils réapparaissent en sortant).
  Clic droit ou 🧽 Gomme pour effacer, « Tout effacer » pour repartir de zéro. Tu vois l'ombre atténuée et hachurée ;
  « Voir l'ombre comme les joueurs » la montre telle quelle.
- **Poser une lumière** : choisis le type (bougie, torche, lanterne, feu de camp, sort de lumière, lueur arcanique, flammes infernales,
  lueur féerique, clair de lune), **＋ Poser**, puis clic sur la carte (Maj + clic pour en poser plusieurs).
  Sur la carte, glisse une lumière pour la déplacer, clic droit pour la retirer. Le rayon se change dans la liste.
- **Les murs et la roche arrêtent la lumière** : les ombres sont calculées en direct (piliers, portes, couloirs).
- **Le décor éclaire** : les feux 🔥, les bougies 🕯️, les lampes 🪔, les lanternes 🏮, les boules de cristal 🔮, les portails 🌀, la lave et l'acide peints sur la battle map donnent de la lumière tout seuls.
- **Pions** : onglet **Pion** → « Lumière portée » (la lumière suit le pion quand il bouge) et « Vision dans le noir »
  (le joueur voit ses alentours en pénombre, lui seul). Les joueurs peuvent allumer leur propre torche.

Les flammes vacillent, les lueurs magiques pulsent. Le MJ voit la carte en pénombre pour garder la main ;
« Voir comme les joueurs » montre exactement ce qu'ils voient. Les monstres dans le noir restent invisibles pour les joueurs.

## Combat

**Ajouter des monstres** (menu **👹 Monstres** du bandeau) : choisis un monstre du bestiaire (son dessin s'affiche), le nombre, puis **Ajouter**.
Ils arrivent numérotés (Gobelin 1, Gobelin 2…) avec leurs PV, leur CA et leur attaque. Options : lancer leur initiative
(en secret), tirer leurs PV aux dés au lieu de la moyenne, les cacher aux joueurs (embuscade).
Un pion personnalisé (menu **♟ Pions**) peut aussi recevoir des PV et une CA ; dans l'onglet **Pion**, « Monstre » lui donne l'un des 26 dessins.

**Infliger des dégâts ou soigner** : clic droit sur un pion de la carte, ou bouton **💥** (groupe, initiative, liste des pions).
- Tape un nombre (`7`) ou une formule de dés (`2d6+3`, lancée une seule fois), puis **💥 Infliger** ou **💚 Soigner** ;
  les boutons −1, −2, −5, −10, +1, +5 agissent tout de suite.
- **Plusieurs cibles** (boule de feu…) : « Ajouter une cible », le même total touche tout le monde.
  Coche « Moitié » pour un jet de sauvegarde réussi.
- Pour un joueur, les PV temporaires absorbent d'abord les dégâts ; à 0 PV il est à terre.
  Un monstre à 0 PV est hors de combat (grisé, 💀) ; « Retirer les monstres vaincus » nettoie la carte.
- 🎲 lance l'attaque d'un monstre (jet pour toucher, puis dégâts).

Les joueurs voient les chiffres de dégâts s'envoler au-dessus des pions et l'état des monstres (barre de vie),
mais pas leurs PV exacts.

## Classes

Sur la fiche, choisis une **classe** dans la liste (ou « Autre » pour une classe libre). Une carte résume son dé de vie,
ses caractéristiques principales, ses sauvegardes et ses capacités.
- **⚡ Kit de départ** : répartit 15, 14, 13, 12, 10, 8 dans les caractéristiques selon la classe, calcule PV et CA,
  remplit compétences, équipement et sorts, et habille le pion. Proposé automatiquement sur une fiche vierge.
- **⬆ Monter de niveau** : +1 niveau et PV max augmentés (moyenne du dé de vie + mod. de Constitution).
  La montée de niveau se voit chez tout le monde : colonne de lumière dorée sur le pion, bannière « NIVEAU X » et fanfare.
  Le joueur concerné voit en plus ce qu'il gagne (PV, bonus de maîtrise, amélioration de caractéristique, nouveaux sorts…).
  Ça marche aussi en changeant le niveau à la main sur la fiche.

## Musique d'ambiance

Menu **🎵 Musique** (MJ) : clique sur une ambiance. Elle démarre chez tous les joueurs avec un fondu enchaîné ;
un nouveau clic l'arrête. Le curseur « Volume pour tous » règle le volume général.
Les morceaux sont composés et joués en direct par le navigateur : aucun fichier à télécharger, ils tournent en boucle sans fin.
Chaque joueur voit la piste en cours en haut de l'écran et peut y baisser ou couper le son pour lui seul.
Si le navigateur bloque le son (après un rechargement de la page), un bouton **🔊 Activer la musique** apparaît : un clic suffit.

**Tes propres musiques** (section « Mes musiques » du même panneau) : **📁 Importer des musiques…** ou glisse les fichiers
(MP3, OGG, M4A, WAV, FLAC). Par exemple la bande originale d'un jeu (Baldur's Gate 3…) ou d'un film que tu possèdes, ou des musiques libres de droits.
Ils sont rangés dans `data/musiques/`, se lancent d'un clic chez tous les joueurs et tournent en boucle. ✏ renomme, l'icône se change d'un clic, 🗑 supprime.
La musique est envoyée aux joueurs par ton PC : avec une petite connexion, préfère des MP3 de taille raisonnable.

## Configuration (`config.json`)

Créé automatiquement à côté de l'exe au premier lancement :

```json
{ "port": 3000, "motDePasseMJ": "dragon", "tunnelCloudflare": true, "ouvrirNavigateur": true }
```

Change le mot de passe du MJ avant de partager le lien sur Internet. Relance l'application après une modification.

## Séance : slides et cartes à la suite

Menu **🎬 Séance** (MJ), deux onglets :

- **🗺 Cartes & battle maps** : importer une carte, créer une battle map, afficher une carte, régler la grille.
  Le bouton **＋ Déroulé** d'une carte l'ajoute à la séance.
- **📜 Déroulé** : l'ordre de ta séance. Mélange des **slides** (**＋ Slide** : titre, texte d'ambiance, thème, image)
  et des **cartes** (menu **＋ Carte…**), par exemple : slide d'intro → battle map de l'embuscade → slide « après le combat ».
  Chaque étape a une **transition** (fondu, fondu au noir, coupure nette) et peut lancer une **musique** ou couper le son.
  Les étapes s'affichent en **mosaïque** (▦) ou en liste (☰) : **glisse-les** pour changer l'ordre, double-clic pour lancer.
  Chaque étape peut porter un **sigle** (⚔ combat, 💬 dialogue, 💀 boss… ou quelques lettres comme A1) pour t'y retrouver.

**▶ Lancer** démarre le déroulé chez tous les joueurs ; le MJ avance avec les flèches du clavier (ou Page suiv. / Page préc.)
ou les boutons. Sur une slide, elle s'affiche en grand ; sur une carte, la présentation s'efface et la carte apparaît sur la table,
avec en bas une petite barre pour passer à l'étape suivante. Pendant une slide, le MJ garde aussi un 🎵 pour changer de musique,
la couper ou régler le volume de tout le monde.

## Déplacer ou copier l'application

Le dossier `dist` se suffit à lui-même : `LaTaverne.exe` (+ `cloudflared.exe`). Copie-le où tu veux.
Les données (`data/`) et `config.json` sont créés à côté de l'exe. Pour garder ta partie,
copie aussi le dossier `data/`.

Si Windows affiche « Windows a protégé votre ordinateur » au premier lancement :
clique sur **Informations complémentaires**, puis **Exécuter quand même**.
L'avertissement apparaît parce que l'exe n'est pas signé.

## Reconstruire l'exe (développeur)

`npm install`, puis `npm run build` : le résultat est dans `dist/LaTaverne.exe`.

## Repartir à zéro

Arrête le serveur, puis supprime le dossier `data/`.
