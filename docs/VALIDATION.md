# Validation locale — 20 octobre 2026

## Version locale 1.7.0

- `npm run check` : 64 tests unitaires réussis, 708 libellés sans traduction manquante, TypeScript et build réussis. Audit de 25 fichiers exécutables : aucun code CDN distant. Le build conserve un avertissement Vite sur la taille des bundles ; le chargement de 120 pages et l’OCR restent vérifiés séparément.
- Les nouvelles suites couvrent reprise/annulation/rotation des brouillons, quota, limite commune de vingt actions, exclusion des secrets, désactivation et effacement des trois magasins. Les vrais formulaires sont remplis avec Tab sur plusieurs pages ; leurs valeurs Unicode, options d’affichage/export, cases, radios et lecture seule sont relues avec pdf-lib et leur rendu avec PDF.js.
- Le panneau des objets est testé pour noms, masquage, verrouillage, ordre, sélection multiple, copie entre pages, suppression et annulation. Le redimensionnement est vérifié après rotation et zoom ; les polices et plusieurs lignes sont exportées. Le remplacement exact propose un avant/après et exclut réellement le texte en contour ; la recherche surligne et parcourt les occurrences.
- Les deux modes d’export sont vérifiés sur leurs octets finaux : champs interactifs dans la copie Nexus, absence de champs et de données `NexusEdits` dans la copie aplatie, exclusion des objets masqués et conservation des valeurs visibles.
- Un premier passage complet a réussi 48 scénarios sur 49. L’ancien scénario de correction visuelle attendait qu’Entrée ferme la saisie ; il est adapté à Entrée pour une nouvelle ligne et Ctrl+Entrée pour terminer. Le contrôle multiligne a ensuite mis en évidence une zone de sélection trop haute : corrigée en conservant la première ligne et le masque d’origine. La réédition, le déplacement, l’annulation et les positions dans le PDF final passent en relance ciblée.
- Un test supplémentaire de fichier partiellement endommagé vérifie que `BaseAnnots` est validé avant toute mutation : une page récupérable ne provoque pas la perte du rendu d’une autre page invalide.
- Validation navigateur finale : **49 scénarios réussis sur 49** lors d’un passage complet (5,2 min). Chromium, Chrome et Microsoft Edge sont utilisés dans des profils temporaires. Les parcours compilés hors connexion vérifient les brouillons, formulaires et deux exports sur Chrome et Edge, sans requête externe. Après un dernier ajustement de la police des corrections visuelles dans l’inspecteur, `npm run check` passe à nouveau et les quatre scénarios ciblés de saisie/export et d’extension compilée passent également.
- Paquet contrôlé : `manifest.json` à la racine, aucun dossier `src` ou `public` dans l’archive installable ; permissions inchangées (`storage`, `activeTab` ; `webRequest` et `downloads` facultatives). Les profils temporaires de test préaccordent certaines permissions : ils ne valident pas tous les dialogues de consentement du profil personnel.
- Livrables : `dist/`, `release/pdf-nexus-1.7.0.zip`, `release/pdf-nexus-source-1.7.0.zip` et [réalisation des cinq priorités](IMPLEMENTATION-ROADMAP.md). Aucun envoi GitHub ou Store.

Les limites restent explicites : vingt actions au maximum après reprise, stockage navigateur non équivalent à une sauvegarde externe, champs XFA/texte riche/mot de passe et scripts exclus, adaptation des polices de champs, blocs natifs sur une ligne, corrections visuelles conservant l’original, absence de caviardage sécurisé et de signatures numériques. Le repérage des cases reste conservateur.

## Version 1.6.9

- `npm run check` : 54 tests unitaires réussis, aucun libellé non traduit, aucune erreur TypeScript, build et audit de code distant réussis.
- Suite navigateur complète : 38 scénarios réussis sur 39 au premier passage. Le seul échec concerne la reprise de l'ouverture automatique après redémarrage de Chrome (`opening-recovery.spec.ts`, attente du lecteur à la ligne 112). Ce scénario passe ensuite deux fois de suite lors d'une relance isolée ; l'intermittence est consignée, sans attribuer une cause non démontrée. Tous les scénarios de cases, y compris dans les trois navigateurs compilés, passent dès le passage complet.
- Régression reproduite avant correction : un PDF constitué d'une image avec sept lignes de lettres et trois cases produisait 139 repères. Le même test attend et obtient maintenant trois propositions, positionnées sur les cases. Les premiers tests de scans de 1.6.8 ne comportaient pas assez de texte pour révéler ce défaut.
- `checkbox-detection-regression.spec.ts` vérifie le scan textuel, les positions, le masquage par clic droit et Suppr sans créer d'annotation, la restauration des propositions au redémarrage du repérage, le recadrage, quatre rotations successives et les zooms 50/150/200/100 % sans déplacer ni dupliquer une case cochée.
- `checkbox-extension.spec.ts` passe sur le dossier `dist` compilé chargé dans des profils temporaires Chromium, Microsoft Edge et Chrome : scan riche en texte, trois vraies cases, widget natif séparé, cocher, masquer et absence de requête externe hors connexion.
- Les six scénarios ciblés de détection, réédition et localisation passent. La détection reste volontairement conservatrice pour les formes arrondies, dégradées ou accolées à des mots ; les propositions ne sont pas une reconnaissance universelle des formulaires.
- Livrables locaux : `dist/`, `release/pdf-nexus-1.6.9.zip`, archive source et `docs/ROADMAP.fr.md`. Aucun envoi vers GitHub ou le Store pour cette mise à jour locale.

## Version 1.6.8

- `npm run check` : 54 tests unitaires, audit des traductions, vérification TypeScript, build et audit de code distant réussis.
- Suite Playwright complète : 34 scénarios réussis, avec profils d'extension temporaires Chromium, Chrome et Microsoft Edge. Le passage ciblé final vérifie aussi la réouverture puis la suppression d'un ajout dans l'extension compilée hors connexion.
- `tests/editable.test.ts` couvre les familles d'annotations et les images, la conservation des modifications natives, la suppression après réouverture, les cycles successifs sans doublons, les filigranes/pagination/rotation, Info/XMP, les données invalides et les changements apportés par un autre éditeur. Aucune page source retirée n'est jointe au fichier exporté.
- `tests/checkboxes.test.ts` couvre les cases vides ou marquées, les petites dimensions, le gris, les traits fins, les interruptions, les cases attachées à une ligne, les faux positifs simples et les limites mémoire.
- `tests/e2e/reeditable.spec.ts` vérifie le texte noir indépendamment de la couleur des dessins, une nouvelle session après export, la sélection et la suppression des ajouts, le résultat PDF réellement rendu, et les cases fines/grises/cochées/scannées aux zooms 50 %, 150 % et 200 %.
- Livrables locaux : `dist/`, `release/pdf-nexus-1.6.8.zip` et archive source correspondante. Aucune publication GitHub ni soumission Store effectuée pour cette mise à jour.

Limites : les anciens exports aplatis ne contiennent pas les données nécessaires à la séparation automatique des ajouts. La détection des cases reste indicative, notamment sur les scans ; elle n'est pas une reconnaissance sémantique. Les filigranes/pagination et les exports raster/OCR restent aplatis. La conservation des données de réédition n'est pas garantie après enregistrement par un autre logiciel.

# Historique de validation — 10 octobre 2026

## Résultats observés

- `npm test` : **45 tests unitaires réussis**.
- `npx tsc --noEmit` : aucune erreur de types.
- `npm run build` : construction Vite et archive installable réussies.
- Suite navigateur **32 scénarios réussis lors d’un passage complet** en version 1.6.5 (environ 2,5 min). Extensions de production vérifiées dans Chromium, Microsoft Edge et Chrome installé 154.0.8037.98, avec des profils temporaires.
- `npm audit` : **0 vulnérabilité connue** au moment de la validation. Ce résultat ne constitue pas une certification de sécurité.

## Validation 1.6.5

- L’utilisateur confirme que les PDF locaux s’ouvrent dans Nexus. Il signale toujours l’échec web avec `updateSessionRules` en 1.6.4. Le correctif 1.6.5 remplace entièrement la voie DNR pour les nouvelles activations.
- Les tests unitaires obsolètes d’installation des règles sont remplacés par la détection MIME, le filtrage des sous-ressources/HTML/erreurs/pièces jointes, les réponses tardives, la permission `webRequest`, la disponibilité du worker et l’absence d’appels aux deux API DNR bloquées. La baisse du nombre total reflète ce remplacement de moteur.
- Premier passage ciblé : **6 scénarios réussis** sur Chromium, Edge et Chrome installé ; les deux API DNR sont laissées sans réponse, l’observation des réponses et la navigation sont réelles. Les liens avec et sans suffixe, le redémarrage, les fichiers locaux et téléchargements passent. Les manifests temporaires préaccordent les permissions pour isoler le moteur ; la fenêtre native de consentement n’est pas automatisée.
- Passage complet final : **32 scénarios réussis**. Les essais supplémentaires vérifient une page HTML nommée `.pdf`, un PDF intégré dans une sous-frame, une redirection HTTP et la reprise après arrêt réel du worker par CDP dans chaque profil de test. Le bouton d’activation effectue bien une demande `webRequest` depuis un geste utilisateur ; le cas sans accord sort de l’attente avec une erreur.
- **Confirmation utilisateur obtenue le 10 octobre 2026** après rechargement de 1.6.5 et activation : « Le PDF web s’ouvre dans Nexus ». L’ouverture des PDF locaux avait été confirmée au retour de 1.6.4. Le parcours dans son profil habituel est donc confirmé séparément des essais automatisés.

### Audit du correctif demandé

| Exigence                                              | Preuve observée                                                                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Déplacer textes et signatures sans retour à l’origine | `drag-regression.spec.ts`, `forms-signatures.spec.ts` : gestes successifs, sortie de page, défilement, rotation/zoom, annuler/rétablir et contenu exporté vérifiés. |
| Zoom limité au PDF, saisie stable sur le document     | `interaction-regression.spec.ts`, `input-regression.spec.ts`, `live-editing.spec.ts`, `zoom-all-text.spec.ts` réussis dans le passage complet.                      |
| Activation web et ouverture dans le Chrome habituel   | Confirmation utilisateur après 1.6.5 ; nouvelle demande facultative et gestion sans accord également testées dans les trois navigateurs.                            |
| Ouverture locale et téléchargements                   | Ouverture locale confirmée par l’utilisateur ; fichiers locaux, nouveaux téléchargements et exclusion des exports vérifiés dans `opening.spec.ts`.                  |
| Résister au blocage DNR et au sommeil du worker       | `opening-recovery.spec.ts` réussi avec les deux API de règles bloquées, zéro appel à ces API, arrêt du worker, redémarrage et navigations réelles.                  |
| Livrer le correctif documenté                         | `dist/` et archives 1.6.5 ; documentation des permissions et des limites mise à jour.                                                                               |

L’avertissement de hinting de la police du formulaire de Rouen reste documenté ci-dessous ; il n’empêche pas les parcours vérifiés. Ces tests établissent les corrections demandées, pas une absence universelle de défauts sur tous les PDF.

## Historique de validation 1.6.4

- Le retour utilisateur de 1.6.3 identifie précisément `updateDynamicRules` comme opération bloquée. La cause interne du blocage dans son profil n’est pas établie ; aucun fichier de son profil Chrome n’a été supprimé ou modifié.
- Tests unitaires : bascule vers les règles de session après délai, lecture persistante bloquée qui ne masque pas une session active, restauration directe de la session au démarrage, échec explicite si les deux installations se bloquent, désactivation malgré un nettoyage persistant bloqué et lecture de réglage bornée.
- Récupération vérifiée sur Chromium, Edge et Chrome installé : liens avec et sans suffixe, règles de session réellement présentes, restauration au redémarrage, puis arrêt de la reprise après retrait des règles.
- Test navigateur dédié : seul `updateDynamicRules` est remplacé par une promesse sans réponse. `updateSessionRules`, les règles installées, les navigations et le redémarrage sont réels. Le formulaire de Rouen est servi localement avec et sans suffixe `.pdf`. Les permissions sont préaccordées uniquement dans le manifest temporaire ; ce test ne valide pas le dialogue natif ni le profil personnel.
- Après le passage complet, séparation de l’ancien diagnostic enregistré et de l’erreur du clic courant dans l’interface ; reconstruction de production puis les trois tests de récupération relancés avec une ancienne erreur enregistrée : **3 réussis**, aucun ancien message affiché après succès.
- Contrôle supplémentaire d’une réponse tardive : après expiration, récupération puis désactivation, une installation persistante qui termine tardivement ne change pas le réglage désactivé ; les permissions révoquées maintiennent l’état inactif. Vérifié par test unitaire avec API simulée, sans nouvelle modification du code livré.
- Le retour utilisateur suivant a infirmé cette récupération dans son profil : `updateSessionRules` restait bloqué. Ce résultat a conduit au remplacement par la détection web en 1.6.5, confirmée ensuite par l’utilisateur.

## Validation 1.6.2–1.6.3

- Régression reproduite avant correction : la signature restait à son abscisse d’origine après un glisser de 80 pixels. Capture sur le SVG persistant, second glisser hors page, annuler/rétablir et export raster relu : la signature apparaît à la nouvelle position, sans encre à l’ancienne.
- Régression reproduite avant correction : un texte répété puis renommé affichait son champ de réédition 50 pixels trop loin après déplacement. La recherche de l’occurrence originale maintient désormais l’alignement.
- Ce scénario a été enrichi puis relancé après le passage complet : défilement de 40 pixels pendant un glisser du texte natif, maintien du champ sous le pointeur et position conservée après fermeture du champ, réussi.
- Régression reproduite avant correction : sélectionner un texte ajouté faisait apparaître des réglages qui déplaçaient le PDF pendant le geste. Sur une page tournée de 90° à 150 %, déplacement maintenant vérifié en coordonnées PDF et dans le texte exporté. Les réglages flottants ne modifient plus la géométrie du document.
- Manifest de production non modifié : popup vers onglet d’activation, appel réel de `chrome.permissions.request` avec geste utilisateur actif, absence d’accord et sortie d’attente contrôlée, vérifiés sur les trois navigateurs. L’horloge de page est accélérée pour tester le délai. **Le consentement dans la fenêtre native n’est pas accepté par l’automatisation.**
- Manifest temporaire avec accès préaccordé : règles supprimées, communication au worker volontairement laissée sans réponse, appel de demande interdit pour vérifier la réutilisation de l’accès ; la reprise directe réinstalle les vraies règles DNR, puis les PDF web, locaux et téléchargés s’ouvrent. Redémarrage et migration vérifiés dans les trois navigateurs.
- L’utilisateur signale encore une erreur générale après activation dans son profil Chrome habituel en 1.6.2. La version 1.6.3 a permis d’isoler le blocage de `updateDynamicRules` ; la version 1.6.4 ajoute la récupération en mémoire. **Ces versions ne résolvaient pas le problème dans ce profil. La confirmation de résolution concerne 1.6.5 (ci-dessus).** L’accès d’inspection native Windows a échoué au démarrage du runtime, et aucun navigateur Chrome habituel n’est connecté au contrôle de navigateur disponible.
- Le message `TT: undefined function: 32` fourni en capture est reproduit sur le formulaire de Rouen. Le code de PDF.js invalide les instructions de hinting TrueType incohérentes ; le scénario du formulaire continue de réussir pour rendu, sélection, saisie, zoom et déplacement. Le message n’est pas supprimé artificiellement et ne constitue pas une erreur de l’API d’ouverture.

## Validation 1.6.1

- Traduction anglaise du convertisseur et de ses limites, erreurs de plages et de formats à paramètres, erreur réelle d’extraction XLSX remontée par le worker, puis retour au français : scénario navigateur réussi. Les tests unitaires vérifient aussi les erreurs réseau/PDF normalisées et les unités de taille localisées.
- Popup anglais de l’extension de production et ressources de localisation du manifest : vérifiés dans Chromium et Edge. Le contrôle statique des clés de traduction réussit ; les diagnostics techniques externes et le contenu des documents ne sont pas traduits.
- États d’ouverture locale : autorisation révoquée, rétablissement et accès aux URL de fichiers manquant vérifiés avec une API Chrome simulée dans un scénario dédié à l’interface. Capture du guide d’autorisation contrôlée visuellement. Ce test d’interface ne remplace pas les essais réels de navigation ci-dessous ni la vérification manuelle du dialogue natif.
- Les captures du dialogue de signature anglais et de l’éditeur avec cases/signature ont été inspectées après le passage complet.

## Validation 1.6

- Reprise d’un PDF HTTP avec et sans suffixe, fichier `file:` dont le chemin comporte des espaces, téléchargement terminé, puis redémarrage et restauration des règles : vérifiés dans Chromium et Edge. Les permissions sont préaccordées dans le manifest de test ; l’octroi par la fenêtre native et le profil Chrome personnel de l’utilisateur ne sont pas automatisés.
- Réparation d’un consentement ancien sans règles ni état, respect d’une désactivation, conservation de la permission fichier partagée et refus des chemins réseau ou sans autorisation : tests unitaires.
- Déplacement natif au pointeur : réédition alignée, coordonnées extraites du PDF final et stabilité d’un second texte. Matrice graphique à 2× et rotation de page à 90° : position exportée vérifiée. Correction visuelle déplacée : masque original immobile, positions extraites, annulation/rétablissement et présence honnête de l’ancien texte.
- Formulaire synthétique : cocher une case vide, décocher une case d’origine, ajouter une signature et exporter. Le rendu réel du PDF exporté confirme les marques, la signature et les coordonnées textuelles. Les champs du PDF final sont aplatis.
- Carré imprimé synthétique : détection, clic, conservation après zoom à 150 %, décochage et annulation. Tests du détecteur sur carrés vides, rectangles, bruit, case déjà cochée et budget mémoire. Pas de garantie sur tous les formulaires ou scans réels.
- Interface anglaise : accueil, édition, menu formulaire, tracé/effacement de signature, nom saisi et paramètres. Assistant extractif : commandes anglaises et limites explicites. `i18n:check` vérifie les clés statiques recensées ; il ne certifie pas tous les diagnostics dynamiques de bibliothèques tierces.
- Contrôle visuel des captures de l’éditeur et du dialogue anglais. Aucun document transmis pour ces tests locaux.

## Validation 1.5

- Activation : demande limitée à DNR et HTTP(S), finalisation par message au service worker, reprise après disparition du popup, refus et échec des règles couverts par tests unitaires. Ouverture HTTP et MIME, migration et téléchargement activé séparément vérifiés dans Chromium et Edge.
- La fenêtre native d’autorisation n’est pas automatisée. Les tests de navigation utilisent des permissions préaccordées dans une copie temporaire du manifest ; le manifest livré conserve ses permissions facultatives. Le clic sans permissions dans un profil headless attend la réponse au dialogue et ne permet pas de confirmer ce dialogue.
- Saisie de taille par caractères successifs `2`, `4` : champ et texte exporté à 24 pt. Réduction puis raccourcissement d’un texte dans le panneau : conservation de la taille demandée. Focus maintenu après rendu.
- Texte ajouté : export par Ctrl+S depuis le champ actif, sans validation ni clic extérieur, puis extraction réelle du texte du fichier téléchargé.
- Contrôle visuel de `test-results/saisie-simplifiee.png` : modes principaux lisibles, menu Annoter, réglages de police et taille ancrés près du passage sélectionné. Couleur masquée hors contexte et choix d’un surlignage depuis le menu testés.

## Validation 1.4

- Le formulaire public vierge de Rouen fourni par l’utilisateur est conservé comme fixture avec sa source. Son URL réelle a été vérifiée : HTTP 200 et `Content-Type: application/pdf`, sans suffixe `.pdf` dans le chemin. Les essais reproductibles servent cette copie avec les mêmes en-têtes depuis un serveur de test local.
- Sélection partielle par glisser de souris sur le titre, sans bouton d’activation : transfert des offsets dans le champ, remplacement du mot sélectionné, conservation du reste, réédition et extraction du texte exporté vérifiés.
- Rafale de 12 événements Ctrl+molette dans le même cycle : accumulation du zoom, largeur des menus inchangée. Mode Main à 200 % : déplacement dans les deux axes puis 20 mesures pendant une seconde pour exclure un retour de position pendant le rendu asynchrone.
- Dans les extensions de production sur Chrome et Edge : événements réels de molette avec Ctrl, contrôle de la stabilité du facteur après les événements, zoom natif de l’onglet et menus de largeur constante.
- Migration d’une ancienne configuration avec seulement la règle `.pdf` : fermeture et redémarrage du profil de test, restauration de la règle MIME puis ouverture du formulaire de Rouen dans Nexus et accès direct à la saisie.
- Reprise explicite d’un PDF affiché par le lecteur du navigateur : bouton du popup, bascule du même onglet dans Nexus, couche de texte visible. Les permissions sont préaccordées dans le profil de test ; le dialogue natif de consentement ne fait pas partie de l’automatisation.
- Les tests unitaires vérifient la migration sans nouveau consentement, le respect d’une désactivation ou révocation et la reprise de l’onglet uniquement après accord pour l’origine concernée.
- Capture `test-results/rouen-nexus.png` inspectée : formulaire rendu dans l’interface Nexus, barre de modification, mode Main, navigation compacte et outils d’export.

## Validation 1.3

- Ctrl+/−/0 et Ctrl+molette changent les dimensions du PDF tout en conservant la largeur de la barre latérale. Le zoom natif de l’onglet à 150 % modifie aussi le facteur PDF dans les versions de production Chrome et Edge.
- Le panneau « Modifier tout le texte » modifie une première page en natif, annule puis reprend la saisie, passe à la deuxième page et applique une correction visuelle à un bloc complexe. Le PDF exporté est relu : nouveau texte natif seul sur la première page, nouveau et ancien textes sur la correction visuelle de la seconde.
- Les tests de production ouvrent une URL `.pdf`, une réponse PDF sans suffixe, puis un véritable téléchargement via un lien de page HTML et `Content-Disposition: attachment`. Ils vérifient que la copie locale est lue dans le nouvel éditeur. Les deux profils de test disposent de l’accès aux fichiers locaux.
- L’export depuis cet éditeur crée un deuxième téléchargement mais ne rejoint pas la liste des fichiers ouverts automatiquement. Les tests unitaires couvrent les téléchargements incomplets, dangereux, absents, internes à Nexus, les formats non PDF et les noms de fichiers avec caractères spéciaux.
- Les permissions optionnelles sont préaccordées uniquement dans une copie temporaire du manifest pour les tests automatisés ; l’interaction avec le dialogue natif d’autorisation reste à vérifier manuellement. Le manifest livré utilise `storage` et, depuis 1.4, `activeTab` pour la reprise explicite de l’onglet courant. Aucune permission générale HTTP(S) n’est obligatoire.
- Migration PDF.js 6.4.299 : le test multipage reproduisait l’interférence de l’ancienne table globale de pages entre le document et son aperçu d’une page ; le nouveau moteur isole ces états. La suite complète de conversions, OCR local et extension hors connexion a été rejouée avec succès.
- Contrôle visuel de `test-results/all-text.png` : panneau éditable, réglages et correction affichée dans le document.

## Validation de l’édition en direct (1.2)

- Le champ situé sur la page conserve le focus pendant le renouvellement du rendu PDF ; remplacement d’une chaîne, saisie rapide de plusieurs caractères, export sans validation ni sortie préalable du champ : tous les derniers caractères sont présents dans le résultat.
- Une annulation restaure le texte original après plusieurs frappes et adaptations dans la même session ; rétablissement et choix de la seconde occurrence d’une chaîne identique restent vérifiés.
- Une police Noto Sans sous-ensemble est adaptée automatiquement lorsqu’un caractère manque. Test d’un remplacement français et d’un remplacement cyrillique, relus dans les instructions PDF.
- Un objet contenant plusieurs opérateurs de texte adjacents, non modifiable directement par le moteur, passe en correction visuelle. Le fond coloré est estimé, le texte est saisi en direct, puis la correction est reprise par clic et exportée. Le test vérifie explicitement que le nouveau texte **et l’ancien** sont extractibles : aucune suppression du contenu original n’est prétendue.
- Contrôle visuel de `test-results/live-editing.png` : champ ancré au texte, barre flottante et état de police adaptée.
- Les deux scénarios MV3 ont été enrichis pour saisir et rendre un remplacement natif dans l’extension de production, hors connexion, avant l’annotation et l’OCR.

## Validation des ajouts 1.1

- Le popup reçoit un fichier local et ouvre un nouvel onglet avec ce fichier ; testé sur Chrome for Testing et Edge, hors connexion. L’onglet de setup est créé lors de l’installation.
- Le setup passe en anglais, applique le thème sombre et conserve ces choix après rechargement. Les messages non traduits restent explicitement annoncés comme bêta.
- La saisie sur page prend le focus, accepte un texte français et se valide par Ctrl+Entrée. L’export contient ce texte.
- Un bloc natif est remplacé sans masque ; PDF.js retrouve le nouveau texte, pas l’ancien dans cette page. Police Helvetica-Bold et taille choisie conservées ; couleur et fond vérifiés visuellement lors du développement. Annuler/rétablir restaure les versions. Deux chaînes identiques sur une page : cliquer la seconde ne change que le second bloc.
- Tests unitaires d’une police incorporée sous-ensemble, caractère indisponible refusé, police de remplacement, texte multiligne à repositionnement explicite, bloc périmé refusé et conservation des instructions graphiques.
- Filigrane limité aux pages impaires : présence sur la première page et absence sur la seconde dans le PDF exporté ; positions et répétition couvertes en unitaire.
- Redirection d’une URL HTTP `.pdf?download=1`, chargement de son contenu dans l’extension et URL finale vérifiés sur Chrome et Edge. Le banc de test utilise une copie temporaire du manifest avec permissions préaccordées : **la boîte native d’autorisation facultative n’est pas automatisée** et reste à vérifier manuellement. Le manifest livré conserve uniquement `storage` à l’installation.
- Les scénarios OCR hors connexion ont détecté une incohérence de clé de cache après introduction de l’édition native ; corrigée et vérifiée par export TXT reconnu dans les deux navigateurs.

## Couverture effective

Un scénario supplémentaire ouvre 120 pages, navigue à la dernière et confirme que moins de 8 canvases de pages restent alloués. Le scénario d’export relit aussi la couche de texte et retrouve l’annotation française effectivement enregistrée.

| Domaine                | Vérification exécutée                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Installation MV3       | Chrome for Testing 156 et Microsoft Edge installé, profils temporaires, service worker actif et popup/éditeur chargés                                                                         |
| Éditeur                | Ouverture d’un PDF synthétique trois pages, couche de texte rendue, création d’annotation, undo/redo, duplication, rotation, téléchargement d’un PDF quatre pages et contrôle de sa structure |
| Export                 | pdf-lib relit les résultats ; toutes les familles d’annotations, lien URI, images, rotation, ordre/extraction/fusion testés sur fichiers construits                                           |
| Métadonnées            | Champs Info et XMP absents après export nettoyé, catalogue JavaScript non copié                                                                                                               |
| Conversions            | TXT et HTML vérifiés sur contenu, DOCX décompressé en OOXML, XLSX ouvert avec ExcelJS, DOCX/TXT/images vers PDF relus avec pdf-lib ; PNG/JPEG testés dans le navigateur                       |
| OCR                    | Scan synthétique sans texte, reconnaissance français/anglais, positions des mots et PDF avec texte extractible ; scans traités dans Chrome for Testing et Edge avec réseau coupé              |
| Hors connexion         | Extension ouverte et annotée/exportée/OCR exécuté avec `context.setOffline(true)` ; aucune requête HTTP(S) observée pendant ces scénarios                                                     |
| Assistant              | Recherche extractive avec pages, absence de résultats, motif dates/montants, distinction extraction/génération ; API simulée répondant correctement, 401 et réseau indisponible               |
| Données locales        | Récents créés puis effacement via UI ; aucun fichier personnel utilisé ; clé simulée de test retirée                                                                                          |
| Entrées et permissions | Signature PDF/image, fichiers vides, plages invalides, formats incorrects, URL dangereuse, HTTP externe, identifiants en URL ; permissions obligatoires limitées à storage et activeTab       |
| Annulation             | Worker refusé avant démarrage avec AbortError ; workers PDF et OCR disposent de chemins d’annulation pendant calcul, à compléter par scénarios de charge longue                               |

Les tests utilisent des fichiers synthétiques, jamais des documents personnels. Les appels fournisseur sont remplacés uniquement **dans le banc de test** par des réponses contrôlées ; l’application de production utilise une vraie requête réseau et ne possède aucune réponse IA fictive.

## Vérifications à poursuivre avant une diffusion publique

- Parcours d’installation manuelle via les pages Chrome/Edge et examen des boutiques. Le test Chrome utilise **Chrome for Testing**, pas le profil Chrome personnel.
- Test de la version minimale Chromium 131 : les tests exécutés utilisent les navigateurs récents disponibles. La compatibilité minimale est déclarée et la build legacy sélectionnée, mais pas validée sur cette ancienne version.
- Corpus représentatif de PDF volumineux, de scans flous, PDF avec polices CJK/RTL, formulaires, documents endommagés, signatures, fichiers chiffrés et restrictions diverses.
- Mesures mémoire/temps sur machines modestes et documents proches des plafonds ; rasterisation/archives conservent les résultats en mémoire. Rendu des canvases progressif, mais DOM des pages et miniatures non virtualisé.
- Appel réel à un fournisseur avec clé personnelle, coûts, CORS de serveur local, réponses complexes, coupure réseau en cours de réponse. Aucun secret fournisseur n’a été fourni pour cette validation.
- Modèle natif : disponibilité et téléchargement sur appareil compatible, performances en français, citations, contraintes de contexte. Cet adaptateur ne garantit pas la présence d’un modèle dans chaque navigateur.
- Audit accessibilité avec lecteurs d’écran, placement clavier d’annotations et tests visuels à toutes les résolutions.
- Vérification de l’impression physique, de la fidélité OCR des mots et des conversions sur fichiers réels. Toutes les limitations de conversion affichées restent applicables même si les scénarios synthétiques passent.

## Artefacts de contrôle

Une exécution complète génère `test-results/dashboard.png`, `test-results/editor.png`, `test-results/native-editor.png`, `test-results/live-editing.png`, `test-results/setup-english-dark.png`, ainsi que `test-results/extension-chromium.png` et `test-results/extension-msedge.png`. Une nouvelle exécution partielle peut effacer ces captures. Le rapport HTML Playwright est généré dans `playwright-report/`. Ces fichiers de test sont ignorés par Git et ne sont pas intégrés à l’extension.
