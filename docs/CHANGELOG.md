# Historique des Versions — PDF Nexus

Ce document conserve l'historique complet des versions, correctifs et évolutions techniques de PDF Nexus.

---

## Correctif 1.6.7 — OCR entièrement local pour Manifest V3

Les valeurs CDN de secours incluses par défaut dans Tesseract.js ont été retirées du code livré. Le Worker OCR est créé directement depuis le paquet de l’extension, refuse une origine différente et charge uniquement les moteurs et données linguistiques embarqués. Un audit de production bloque désormais la création de l’archive si une URL CDN ou un Worker distant réapparaît dans un fichier exécutable.

## Correctif 1.6.6 — permissions minimales pour le Store

La permission facultative `declarativeNetRequestWithHostAccess`, devenue inutile depuis le remplacement des règles DNR, a été retirée du manifeste. L’ouverture automatique des PDF web continue d’utiliser uniquement `webRequest`, après activation explicite par l’utilisateur. Cette version ne change pas le traitement des documents.

## Correctif 1.6.5 — ouverture web sans installation de règles

Le profil Chrome signalé bloque aussi bien `updateDynamicRules` que `updateSessionRules`. L’ouverture web utilise désormais `webRequest` en observation, puis `tabs.update` pour ouvrir Nexus dans le même onglet. Aucune règle DNR n’est installée. Le type PDF réel est vérifié, y compris pour les liens sans suffixe et après une redirection HTTP. Une page HTML nommée `.pdf` et les PDF intégrés dans une sous-frame restent sur leur site.

**Après mise à jour, activez de nouveau l’ouverture web et acceptez la nouvelle permission facultative de détection (`webRequest`)**, même si l’ancien accès aux sites était accordé. Le popup ouvre un onglet stable pour ce consentement. Aucun `webRequestBlocking`, content script, historique de navigation ni collecte de données. Les PDF locaux et téléchargements conservent leurs réglages distincts.

Les tests vérifient la nouvelle ouverture avec les deux API DNR bloquées. L’ouverture locale et l’ouverture du PDF web dans Nexus avec la version 1.6.5 sont validées dans Chrome et Edge.

## Historique 1.6.4 — récupération remplacée en 1.6.5

Si Chrome ne termine pas `updateDynamicRules`, Nexus installe les mêmes redirections en mémoire avec `updateSessionRules`. Le choix est enregistré et les règles sont restaurées au démarrage du navigateur, sans nouvelle permission. L’état « Activée » vérifie les règles présentes et l’accès effectif. La désactivation nettoie les deux jeux de règles et retire la permission de redirection, y compris si le nettoyage persistant se bloque.

Le diagnostic confirme le blocage de `updateDynamicRules` en 1.6.3. La récupération de 1.6.4 ayant également échoué sur `updateSessionRules` dans certains profils Chrome, la nouvelle architecture 1.6.5 a été adoptée. Les tests de panne injectée sont décrits dans [la validation](VALIDATION.md).

## Correctifs 1.6.2–1.6.3 — déplacements et activation

- Le glisser-déposer capture le pointeur sur le calque persistant : signatures, images et annotations restent déplaçables hors des limites de la page. Le dernier mouvement est pris en compte à la levée du pointeur et chaque déplacement reste annulable. Une signature placée passe immédiatement en sélection.
- Les réglages d’un objet sélectionné flottent dans l’éditeur, sans décaler le PDF au début du geste. Le texte répété puis renommé conserve son ancrage lors de la réédition après déplacement. Rotation et zoom sont pris en compte.
- Depuis le popup, une première autorisation web se confirme dans un onglet dédié. Un accès déjà accordé sert directement à réinstaller les règles, sans nouveau dialogue. Si le worker ne répond pas, l’éditeur tente l’installation directement. Une demande restée sans réponse expire avec une erreur explicite ; les étapes de vérification, installation et enregistrement sont distinguées.
- Les tests couvrent Chromium, Edge et Chrome dans des profils isolés.

## Version 1.6.1 — langues et autorisations

- [English installation and user guide](USER-GUIDE.en.md).
- Les messages de l’interface, des erreurs contrôlées et des traitements en worker suivent désormais le français ou l’anglais choisi : convertisseur, avertissements, progression, métadonnées et dates. Le titre d’onglet est traduit ; la description de l’extension suit la langue du navigateur. Les diagnostics techniques externes, le contenu des documents, les noms propres et les notices de licence gardent leur langue d’origine.
- Les PDF locaux et téléchargements disposent de cartes distinctes montrant l’état réel des autorisations. Un bouton permet de rétablir un accès retiré ; l’étape « Autoriser l’accès aux URL de fichiers » reste visible tant qu’elle manque. Le popup offre un accès direct à ces réglages. La commande de révocation indique explicitement qu’elle retire tous les accès aux sites et fichiers, y compris ceux de l’ouverture automatique.

## Nouveautés 1.6 — ouverture locale, déplacement et formulaires

- **Liens et fichiers locaux** : les anciennes activations disposant déjà des permissions web sont réparées, même si le popup n’avait pas enregistré les règles. Une désactivation explicite reste respectée. Pour les PDF ouverts par Ctrl+O, glisser-déposer dans le navigateur ou adresse `file://`, activez **Paramètres → Ouverture des PDF → Ouvrir les PDF locaux dans Nexus**, puis **Autoriser l’accès aux URL de fichiers** dans les détails de l’extension. Les PDF locaux sont repris dans le même onglet. Les téléchargements ont leur propre interrupteur ; désactiver l’un ne retire plus l’accès nécessaire à l’autre.
- **Déplacer un texte** : cliquez sur le passage, puis faites glisser la poignée à gauche du champ. Les flèches du clavier déplacent aussi la poignée sélectionnée (Maj pour un pas de 10 points). Le rendu et l’export suivent le déplacement ; annuler/rétablir reste disponible. Une correction visuelle garde son masque à l’emplacement original, et conserve toujours l’ancien contenu sous-jacent.
- **Remplir et signer** : ce menu regroupe la création d’une signature dessinée ou saisie et le repérage des cases imprimées. La signature est une image locale, sans certificat numérique ; cliquez dans la page pour la placer, puis utilisez Lire pour la déplacer. Les cases interactives PDF sont directement cochables. **Repérer les cases** propose les carrés imprimés vides détectés sur les pages visibles ; cliquez pour cocher/décocher. Détection indicative, pas de reconnaissance universelle des formulaires. Les cases ajoutées manuellement restent disponibles dans Annoter.
- **Export des formulaires** : les apparences des champs d’origine sont aplaties et les choix de cases sont inclus dans le nouveau PDF. Les champs ne restent pas interactifs et les signatures numériques d’origine ne sont pas préservées.
- **Anglais étendu** : menus avancés, mise en forme, formulaires, paramètres, confirmations, progression et assistant extractif.

## Corrections 1.5 — activation et saisie simplifiées

- **Ouverture automatique** : le bouton indique l’attente de l’autorisation, le succès vérifié ou une erreur. L’installation des règles est finalisée dans le service worker et peut reprendre après fermeture du popup. Les permissions web sont demandées seules ; **Ouvrir aussi les PDF téléchargés** est une commande indépendante dans les paramètres. L’accès aux URL de fichiers reste un réglage du navigateur pour les copies téléchargées.
- **Barre simplifiée** : Lire, Modifier le texte, Ajouter du texte, Main et Annoter. Les outils d’annotation sont regroupés dans un menu ; couleur et taille apparaissent dans leur contexte. Le panneau **Modifier tout le texte** reste disponible en mode modification.
- **Saisie** : les champs conservent leur focus sans déplacer la page ; taper une taille à plusieurs chiffres ne la remplace plus par une valeur intermédiaire. Le réglage demandé reste stable pendant l’adaptation automatique de la largeur. La barre flottante de mise en forme garde une taille lisible au zoom.
- **Texte ajouté** : chaque frappe met à jour le brouillon et l’export. Plus de validation obligatoire. **Terminer**, **Échap**, **Ctrl+Entrée** ou un clic ailleurs ferme le champ en conservant le texte. Le bouton **Annuler** de l’éditeur restaure la session précédente. Les brouillons restent en mémoire : exportez avant de fermer l’onglet.

## Corrections 1.4 — navigation stable et édition sur le document

- Le lecteur s’ouvre désormais en **mode modification** : cliquez sur un passage ou sélectionnez une partie d’un bloc et écrivez à cet endroit. Une sélection partielle remplace uniquement les caractères sélectionnés, en conservant le reste du bloc. Le mode **Lire et sélectionner le texte** permet de copier sans ouvrir le champ d’édition.
- Le zoom a été corrigé : calcul immédiat des dimensions du PDF et correction unique du point sous la souris. Une action ultérieure de défilement n’est plus ramenée à l’ancienne position. Le numéro de page suit la position dans le document. **Main** ou le bouton du milieu de la souris permet de déplacer le document.
- Pour remplacer le lecteur Chrome/Edge : rechargez l’extension depuis `chrome://extensions` ou `edge://extensions`, rouvrez son popup et activez **l’ouverture automatique**. Les liens s'ouvrent dans le même onglet sous `chrome-extension://…/editor.html`.

## Nouveautés 1.3 — zoom, tous les textes et ouverture automatique

- **Zoom du document** : boutons, Ctrl+molette, Ctrl+/− et Ctrl+0 agissent sur le PDF. Dans l’onglet de l’extension, le zoom du menu du navigateur est également transmis au document ; menus et panneaux gardent leur taille.
- **Modifier tout le texte** : un panneau donne accès aux passages de chaque page. Saisie, police et taille modifient immédiatement le brouillon. Le PDF suit les changements sans bouton de validation.
- **Liens PDF & Téléchargements** : navigations HTTP(S) GET vers `.pdf` et réponses de type `application/pdf`. Après enregistrement, un onglet Nexus lit la copie locale.
- PDF.js est passé à **6.4.299**, avec adaptation de la libération des documents.

## Nouveautés 1.2 — texte en direct

- Activez **Modifier le texte existant**, cliquez un passage et écrivez **directement sur la page**. Chaque frappe met à jour le brouillon ; aucun bouton « Appliquer » n’est nécessaire. Le rendu PDF se renouvelle après une courte pause de saisie.
- La barre flottante règle police et taille. **Adapter à la largeur** réduit la taille si le remplacement est plus long. La police incorporée est conservée si possible ; sinon une police proche est choisie automatiquement, puis Noto Sans pour les caractères non représentables.
- Si le passage sélectionnable ne correspond pas à un bloc natif réinscriptible, une **correction visuelle** est proposée au même endroit.

## Nouveautés 1.1

- **Premier lancement** : choix de langue (français ou anglais), thème clair/sombre/système et ouverture web facultative.
- **Saisie sur la page** : outil Texte, clic sur la page et saisie en direct.
- **Filigrane** : couleur, taille, opacité, angle, position, répétition et pages paires/impaires.
