# Architecture PDF Nexus

## Version locale 1.7.1

Le build Vite conserve les bundles applicatifs et le Worker de traitement lisibles (`minify: false`). Le plugin `readable-vendors-for-chrome` applique au module `Object.create` amont de PDF.js une substitution déterministe, protégée par son empreinte SHA-256 : Chrome et Edge 131+ possèdent nativement cette API, donc les anciens replis ActiveX, iframe et écriture de scripts n’ont plus d’usage. Le Worker PDF non minifié est packagé sous `vendor/pdfjs/pdf.worker.mjs` avec la même transformation et la même version que l’API. Un Worker Canvas PDF.js est testé dans les navigateurs compilés.

ExcelJS est résolu vers son bundle navigateur amont `dist/exceljs.bare.js`, qui conserve l’export XLSX et omet les polyfills historiques. `scripts/audit-remote-code.mjs` inspecte `dist/` et `scripts/audit-store-package.mjs` inspecte le ZIP final ; les deux partagent les contrôles centralisés dans `scripts/vendor-policy.mjs`. Les tests de régression vérifient aussi le code amont contre l’extrait du refus.

Les versions et transformations des dépendances embarquées sont décrites dans `vendor/BUILD-NOTES.txt` dans le paquet et dans l’archive source. Le build bloque si le module ciblé PDF.js est modifié lors d’une mise à jour de dépendance, jusqu’à sa revue explicite.

## Version locale 1.7.0

`storage/drafts.ts` utilise les magasins IndexedDB v3 `drafts` (index léger), `draftStates` (snapshot/historique/navigation), `draftSources` (octets par révision). Une file sérialise les mutations ; une époque invalide les sauvegardes en attente lors d’un effacement. Quotas : 5 brouillons, 250 Mio, 20 actions/20 Mio par historique. Les snapshots sont explicitement clonés sans sources ni propriétés étrangères. `useAutosave` différère l’écriture de 300 ms et déclenche aussi une tentative lors du masquage de l’onglet. Le statut ne devient enregistré qu’après validation de la transaction.

`FormLayer` rend des contrôles React à partir des widgets PDF.js avec transformation affine complète. `pdf/forms.ts` reconstruit seulement les types compatibles et leurs widgets sur les pages retenues, sans recopier leurs graphes Parent/Kids, scripts ou pages omises. Les valeurs d’export et d’affichage des listes sont distinctes ; `/V` et `/AS` des cases sont synchronisés après création des widgets. Les pages dupliquées reçoivent un nouveau groupe. Les champs non pris en charge utilisent leurs apparences aplaties dans une copie isolée.

`ObjectsPanel` pilote les annotations du modèle. `pdf/objects.ts` centralise translation (points et masque inclus), redimensionnement et accrochage. Nom, police, verrouillage et visibilité sont validés à la réimportation. Les deux modes d’export partagent le moteur : création des pages/champs, actualisation des apparences, aplatissement optionnel, capture du fond puis dessin des ajouts visibles. La copie aplatie ne sérialise aucune donnée `NexusEdits`.

`ExportDialog` génère les octets en worker puis rend ces mêmes octets avec PDF.js ; les opérations sont annulées en fermant/changing d’option. `SearchHighlights` utilise des Range DOM pour le texte natif et les coordonnées des mots pour l’OCR. `ReplaceDialog` valide les changements exacts dans un worker avant une application groupée et annulable. Les résultats de recherche sont invalidés à chaque changement de contenu. Les modes de rendu de texte non pleins, même hérités hors d’un bloc BT/ET, sont exclus de l’édition native.

Voir [IMPLEMENTATION-ROADMAP.md](IMPLEMENTATION-ROADMAP.md) pour les limites et les tests.

## Correctif local 1.6.9

Le détecteur de carrés valide aussi la composante d'encre complète qui entoure chaque proposition : un espace blanc interne à une lettre ne suffit plus. Les quatre coins et les bords ont des seuils plus conservateurs. Un trait horizontal attaché à un bord peut être conservé ; les contours ambigus sont écartés plutôt que promus systématiquement.

Le rendu d'analyse utilise une rotation nulle et tient compte de `UserUnit`. Les propositions sont transformées en points PDF une seule fois, puis `pdf/geometry.ts` projette leurs quatre coins dans la vue courante. La rotation et le zoom ne déclenchent plus une nouvelle recherche. Le rapprochement d'une proposition avec une annotation existante utilise le recouvrement des rectangles et conserve les réglages de l'annotation. Les repères masqués sont un état d'interface temporaire, indépendant du document et de son historique ; ils sont réinitialisés au redémarrage du repérage.

## Évolution locale 1.6.8

`pdf/editable.ts` conserve les annotations courantes dans un flux JSON privé `/NexusEdits` de chaque page. L'export garde un instantané des références aux flux de base et des tables de ressources, puis dessine les ajouts dans un flux distinct à l'aide d'une nouvelle enveloppe `PDFPage`. Il n'attache jamais les fichiers source complets ni les instantanés de l'historique. Le rendu ordinaire reste un PDF lisible dans les autres lecteurs. Les filigranes et la pagination font partie du fond ; les modifications natives sont déjà appliquées à ses flux.

À l'ouverture ou à l'insertion d'un fichier, le worker de traitement valide la version, les tailles, les types, les coordonnées, les couleurs, les liens et les données d'image. Il restaure les références de base avant d'enregistrer une copie interne pour PDF.js, puis restitue les annotations au modèle de travail avec de nouveaux identifiants. Un condensat SHA-256 du contenu rendu évite de restaurer un fond obsolète si un autre éditeur a changé les flux de page. Si les données sont illisibles ou incohérentes, le rendu actuel reste intact et une notification signale la réédition indisponible. Les copies exportées après suppression ne reprennent pas les anciens flux d'annotations ni leurs ressources déconnectées.

`pdf/checkboxes.ts` combine les zones blanches fermées et les paires de contours pour repérer des cases fines, grises, petites ou légèrement interrompues, y compris certaines marques existantes. `PdfPage` effectue un rendu dédié proche de 2× et limité à 2 millions de pixels ; `workers/checkboxes.worker.ts`, distinct du gros worker de conversion, calcule les candidats. Les positions sont ramenées en coordonnées de page et ne dépendent pas du zoom. Les widgets existants et les zones de texte natif ordinaires sont exclus des propositions visuelles pour réduire les doublons et les lettres prises pour des cases. La détection reste indicative, particulièrement sur les scans. Le champ de sélection permet aussi de cocher/décocher une annotation restaurée.

Les couleurs de création sont séparées par outil. Le texte commence en noir. Les limites de réédition sont de 2 000 ajouts et 32 Mio de données par page ; l'import borne également les données d'édition cumulées à 128 Mio. Les anciens exports aplatis ne permettent pas une reconstitution fiable des éléments. L'option Info/XMP conserve les données privées nécessaires à la réédition et n'est pas une fonction de caviardage.

## Évolution 1.6.5

`webOpening.ts` enregistre `webRequest.onResponseStarted` synchroniquement dans le service worker, au démarrage et après octroi de la permission facultative. Le filtre API ne vise que HTTP(S) et `main_frame`. Le gestionnaire refuse POST, erreurs HTTP, téléchargements avec disposition `attachment`, URL avec identifiants et types autres que `application/pdf`. Il ne lit pas les corps de réponse et ne journalise pas la navigation. Pour les PDF admissibles, il vérifie le choix local puis compare l’URL courante/en attente à la réponse avant `tabs.update`, afin de ne pas reprendre un onglet passé à une autre navigation.

L’activation demande `webRequest` avec les origines HTTP(S), sans DNR ni `webRequestBlocking`. L’état affiché vérifie le réglage, les permissions et un message de disponibilité du listener au worker. La page ne prétend plus remplacer un worker absent : un délai produit une erreur explicite. Les nouvelles installations n’appellent jamais `updateDynamicRules` ou `updateSessionRules`. La désactivation enregistre d’abord le choix puis retire `webRequest` ainsi que l’ancienne permission DNR, conservée dans le manifest uniquement pour la transition. Les anciennes règles d’une installation précédente peuvent rester en place jusqu’à cette révocation ; elles ne sont plus réinstallées.

La détection est asynchrone : le lecteur du navigateur peut apparaître brièvement avant Nexus. Le worker est réveillé par l’événement enregistré. Les liens dont les réponses sont cachées à l’API du navigateur ou qui exigent des cookies peuvent encore nécessiter une importation manuelle. [API WebRequest officielle](https://developer.chrome.com/docs/extensions/reference/api/webRequest).

## Historique 1.6.4 (voie remplacée en 1.6.5)

L’installation persistante est bornée à 6 secondes. En cas d’échec, les mêmes règles 100/101 sont installées en session (4 secondes maximum). `openingRuleMode` retient la voie effective, ce qui permet à la migration de restaurer directement la session après redémarrage. La vérification utilise les deux jeux indépendamment : une lecture persistante bloquée ne masque pas des règles de session actives. Aucun délai ne simule un succès ; les règles et les permissions sont relues.

Le réglage désactivé est enregistré avant nettoyage. Les deux jeux de règles sont retirés en parallèle avec délai borné, puis la permission DNR facultative est révoquée pour neutraliser aussi une installation tardive. Les opérations de stockage de la migration et du diagnostic sont bornées pour ne pas immobiliser la file du worker. La page attend 15 secondes la réponse du worker avant sa reprise directe, afin de laisser terminer la récupération normale.

Les règles de session sont en mémoire et disparaissent à la fermeture du navigateur ou à la mise à jour de l’extension : [documentation officielle Chrome](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest#method-updateSessionRules). La restauration nécessite le démarrage du worker ; une navigation extrêmement précoce avant cette restauration peut nécessiter un rechargement.

## Évolution 1.6.2–1.6.3

`permissions.html` est un troisième point d’entrée d’interface, dédié à l’autorisation web lorsque le popup n’a pas encore d’accès. `OpeningControl` distingue l’accès accordé des règles actives. `setAutomaticOpening` demande l’accès dans le geste utilisateur, observe aussi l’accord effectif, borne l’attente et reprend `configureOpening` dans la page si le service worker n’a pas répondu. Les erreurs identifient l’opération Chrome qui n’a pas répondu. Les permissions obligatoires restent `storage` et `activeTab`.

Le calque SVG persistant possède la capture du pointeur. Le brouillon de geste est conservé dans une référence synchrone ; le pointeur final, et non le dernier rendu React, détermine la position enregistrée. Les objets existants gardent leur clé et leur élément pendant le geste. Les réglages de sélection flottants ne changent pas la position du document. La réédition d’un texte natif cherche son occurrence dans le texte source original, indépendamment du nom modifié visible. Le déplacement du champ natif utilise le repère de la page, y compris si elle défile pendant le geste.

## Évolution 1.6.1

La locale courante est transmise aux workers de traitement. Les paramètres nommés des messages dynamiques (nombre de pages, statut HTTP, caractère absent d’une police) sont interpolés après traduction. Les erreurs de réseau, mot de passe, PDF invalide et quota disposent de messages adaptés. L’audit Babel suit également les expressions conditionnelles, callbacks optionnels et avertissements du convertisseur ; les tests couvrent les messages réellement affichés et le retour anglais → français.

`FileOpeningControl` lit séparément l’intention enregistrée, la permission `file:`/`downloads` effective et le réglage navigateur `isAllowedFileSchemeAccess`. Il se resynchronise au retour dans l’onglet et lors des événements de permissions/stockage. Une intention enregistrée ne suffit jamais à afficher « activé ». Le popup accède aux réglages et le guide ouvre les détails de l’extension. Les demandes restent déclenchées dans le geste de clic.

`public/_locales/fr` et `en` localisent la description Manifest V3 ; le choix dans l’application reste indépendant de la langue du navigateur. Référence : [internationalisation Chrome](https://developer.chrome.com/docs/extensions/reference/api/i18n). L’interface affiche la version de `package.json`, également synchronisée avec le manifest lors de la préparation d’une version.

## Évolution 1.6

`background/opening.ts` répare les consentements DNR existants sauf désactivation explicite. `tabs.onUpdated` ne traite que les URL `file:` PDF, après opt-in `automaticFiles`, permission d’origine et contrôle `isAllowedFileSchemeAccess`. Les autorisations partagées avec les téléchargements ne sont retirées qu’une fois les deux usages désactivés. Aucun content script ni nouvelle permission obligatoire.

`NativeEdit.offset` exprime un déplacement en points PDF ; le moteur inverse la partie linéaire de la CTM avant d’appliquer une translation locale au passage. `Annotation.replacement.mask` sépare la zone recouverte d’origine du texte déplacé. Le geste met à jour le même groupe d’historique.

`FormLayer` remplace depuis 1.7.0 l’ancien `CheckboxLayer` et lit les widgets compatibles de PDF.js ; `pdf/checkboxes.ts` analyse les composantes sombres du rendu pour proposer des carrés vides. Les annotations de cases sont enregistrées en coordonnées PDF, retrouvées géométriquement après un changement de résolution, puis aplaties à l’export. Les formulaires sont copiés dans un document isolé par page, édités puis aplatis afin de ne pas modifier les identifiants des opérations natives ni les pages dupliquées. Cela peut coûter davantage de mémoire sur les formulaires volumineux.

`SignatureDialog` crée une image PNG locale depuis un tracé ou un nom, sans stockage serveur ni certificat. `src/locales/en.json` complète le catalogue historique ; `t` interpole des paramètres nommés sans interpréter leur contenu. L’audit Babel des clés statiques fait partie de `npm run check`. Les réponses déterministes de l’assistant et les suggestions utilisent la langue choisie ; le modèle génératif reçoit une consigne de langue correspondante.

Application locale React + TypeScript, trois points d'entrée d’interface Vite (popup, éditeur et autorisations). Manifest V3, aucun content script et aucune permission permanente de site. Le popup ouvre l'éditeur ; IndexedDB permet de rouvrir les documents sans les transmettre.

`pdf/` utilise PDF.js et son worker local pour afficher et extraire le texte. Les pages sont rendues à l'approche du viewport ; les canvases quittant le viewport sont libérés. Les annotations sont conservées en coordonnées PDF et dessinées par pdf-lib à l'export ; depuis 1.6.8, leurs données permettent de les reprendre dans Nexus. Le texte natif compatible est réécrit par `native-text.ts` ; les autres passages passent en correction visuelle. Un nouveau document est créé pour les exports ; les actions et annotations interactives originales sont retirées de la copie pour éviter de recopier du contenu actif. Le fichier source reste inchangé.

`workers/processing.worker.ts` isole pdf-lib, fontkit, les codecs DOCX/XLSX et le traitement des pages. L'annulation termine ce worker. Les conversions raster travaillent séquentiellement avec limites de pixels. `ocr/` utilise Tesseract dans un worker dédié, sans blob worker, avec WASM et modèles embarqués. La CSP autorise la compilation WASM, jamais eval ou code distant.

`converters/` : DOCX et HTML produits à partir du texte ; XLSX par regroupement géométrique de lignes/colonnes, avec refus en l'absence de grille suffisamment cohérente ; DOCX vers PDF par extraction OOXML avec fflate et xmldom (mise en page simplifiée, entités/DTD interdites). Compression : réencodage structurel sans promesse de gain, ou rasterisation JPEG explicitement destructive pour texte, liens et vecteurs.

`ai/` : recherche/extraits déterministes hors ligne clairement désignés ; adaptateur de modèle natif du navigateur par détection de capacités ; API compatible Chat Completions vers une origine choisie et autorisée explicitement. Aucun fournisseur par défaut, aucune clé embarquée. Clé conservée dans chrome.storage.session (ou mémoire en développement), jamais IndexedDB/localStorage. Les seules capacités distantes sont des requêtes textuelles sans outils/actions automatiques ; le document est considéré comme une donnée non fiable. Consentement à chaque envoi.

`storage/` : paramètres dans Chrome Storage, fichiers et échanges dans IndexedDB. Les derniers documents sont limités à 10 fichiers et 100 Mio cumulés, 50 Mio/fichier. Aucun stockage cloud. Depuis 1.7.0, les brouillons sont également sauvegardés localement selon le réglage dédié ; les résultats OCR restent en mémoire. Exporter reste nécessaire pour une copie indépendante du stockage navigateur.

Contraintes : documents chiffrés lisibles avec mot de passe via PDF.js mais édition/export refusés ; pas de création/suppression de mot de passe avec pdf-lib ; pas de caviardage, signature numérique ou modification universelle du texte natif. La suppression de métadonnées concerne les champs Info et XMP exportés, pas les identités présentes dans les pages, images ou pièces jointes.

## Évolution 1.1

`pdf/native-text.ts` inspecte les flux décodés via pdf-lib, tokenize les chaînes/arrays PDF, construit les correspondances Unicode et encode les remplacements sans masque graphique. `PageRef.nativeEdits` fait partie du snapshot d’historique ; le rendu PDF.js utilise une reconstruction de la page, et le worker d’export applique les mêmes modifications. Les opérations natives ne modifient pas les octets source. Analyse et prévisualisation native actuellement sur le thread principal, avec limite de 8 Mo par flux : optimisation worker et corpus de gros documents à poursuivre.

`pdf/watermark.ts` centralise les paramètres et positions communs au rendu SVG et à l’export. `editor/Setup.tsx` orchestre les préférences initiales ; `i18n.ts` fournit les traductions françaises/anglaises avec repli français explicite. `background/opening.ts` configure une règle DNR optionnelle, strictement limitée aux navigations GET vers des URL `.pdf`. L’import local du popup utilise un transfert IndexedDB consommé par le nouvel onglet (`#pending=`), sans serveur.

## Évolution 1.2

`editor/LiveTextEditor.tsx` remplace l’ancien panneau NativeEditor par un champ sur la page et une barre flottante. `PdfPage` associe la sélection au bloc natif, y compris par occurrence lorsque plusieurs chaînes sont identiques, ou prépare une annotation de correction visuelle. Les modifications rejoignent immédiatement le modèle ; seule la reconstruction d’aperçu est différée de 180 ms. Les générations de rendu et de sélection obsolètes sont écartées. `App.commit` regroupe l’historique par session de saisie.

`pdf/text-style.ts` centralise la famille de remplacement, l’encodage WinAnsi, les styles CSS et l’échantillonnage du fond/texte. `Annotation.replacement` décrit les corrections visuelles explicitement distinctes de `NativeEdit`. Leur export recouvre le texte sans le supprimer ; le moteur de recherche/IA reçoit une mention explicite de cette coexistence. La police Noto Sans locale est passée aussi bien au prévisualiseur natif qu’au worker d’export.

## Évolution 1.3

`editor/usePdfZoom.ts` intercepte Ctrl+molette et Ctrl+/−/0 pendant le lecteur. Le zoom manuel par onglet relaie `tabs.onZoomChange` au facteur PDF, sans permission Tabs. Depuis 1.4, ces événements sont à sens unique : le zoom PDF n’est jamais renvoyé dans `tabs.setZoom`. Les valeurs des gestes rapprochés sont accumulées avant le rendu React. L’ancre est appliquée une seule fois après le changement synchrone de géométrie, sans ResizeObserver persistant ni défilement animé.

`AllTextEditor.tsx` extrait les passages d’une page à la fois, les associe aux opérateurs natifs par texte et occurrence, échantillonne leurs couleurs dans un raster temporaire puis libère ce raster. Il réutilise LiveTextEditor en panneau ; les lignes non réinscriptibles créent des corrections visuelles. PDF.js 6.4.299 isole les mappings de pages des différents documents ; les ressources sont détruites avec `loadingTask.destroy()`.

`background/downloads.ts` filtre les téléchargements complets, sûrs, externes à Nexus et valide leur copie locale. Le service worker écoute onChanged et enregistre les permissions nouvellement accordées. Une file séquentielle et une liste bornée en session empêchent les ouvertures en double. Aucun historique préexistant n’est parcouru. `opening.ts` ajoute la règle MIME pour les navigations GET ; aucune interception des sous-ressources des sites.

Références : [zoom manuel des onglets](https://developer.chrome.com/docs/extensions/reference/api/tabs), [conditions DNR sur les réponses](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest), [API Downloads](https://developer.chrome.com/docs/extensions/reference/api/downloads), [API PDF.js](https://mozilla.github.io/pdf.js/api/draft/api.js.html).

## Évolution 1.4

Le viewport de chaque page est dérivé immédiatement de sa géométrie de base et du zoom. Le canvas se redessine ensuite ; les dimensions de page ne dépendent plus de la fin d’un traitement natif asynchrone. Un seul gestionnaire de défilement dans Reader choisit la page courante ; les observateurs recréés à chaque changement de page ont été retirés. La capture de pointeur gère le mode Main sans interférer avec l’édition.

PdfPage relève les offsets de la sélection DOM avant de créer LiveTextEditor, qui transfère cette sélection au champ positionné dans le PDF. L’édition est active par défaut ; une réédition native retrouve les coordonnées du texte original. Les annulations externes sont synchronisées aussi dans le champ sur la page. Le popup peut reprendre un onglet HTTP(S) explicitement via `activeTab`, puis une permission limitée à l’origine. La migration DNR garde le consentement existant et ajoute la règle MIME aux anciennes installations activées.

## Évolution 1.5

`OpeningControl` partage état vérifié, attente et erreur entre popup et paramètres. `permissions.request` reste appelé dans le geste utilisateur, sans attente préalable. L’intention est conservée en stockage local ; le service worker finalise les règles via un message interne et reprend les activations autorisées lors de `permissions.onAdded` ou de son redémarrage. Une file sérialise installation, migration et désactivation. L’ouverture des téléchargements possède une commande indépendante. Référence : [permissions facultatives et geste utilisateur](https://developer.chrome.com/docs/extensions/reference/api/permissions).

`LiveTextEditor` compare uniquement l’objet sauvegardé correspondant à son passage : la modification d’une autre ligne ne réinitialise plus la taille demandée. Le champ numérique accepte les valeurs intermédiaires pendant la frappe ; seules les valeurs valides mettent à jour le document. La barre de format est un portail en coordonnées écran, indépendant du zoom et de la rotation du PDF, avec exclusion des clics de format dans la détection de sortie du champ.

`PdfPage` envoie les annotations de texte au brouillon dès chaque frappe, avec un identifiant de groupe pour l’historique. Les raccourcis d’export continuent de remonter à App. Reader regroupe les annotations dans un menu et affiche les réglages selon le mode actif.
