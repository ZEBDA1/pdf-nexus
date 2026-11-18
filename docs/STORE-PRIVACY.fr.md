# Déclaration Chrome Web Store — PDF Nexus 1.8.0

Ces textes correspondent au manifeste et au comportement de la version 1.8.0.

## Objectif unique

PDF Nexus permet d’ouvrir, lire, modifier, annoter, organiser, compresser, convertir et analyser des documents PDF dans une interface dédiée du navigateur, avec un traitement local par défaut.

## Code distant

Sélectionner **Non, je n’utilise pas de code distant**.

Justification, si un texte est demandé :

> PDF Nexus n’exécute aucun code distant. Tous les scripts, Web Workers, modules WebAssembly, ressources PDF.js, composants OCR Tesseract, polices et bibliothèques sont inclus dans le paquet de l’extension. Les valeurs CDN de secours de Tesseract.js et les replis hérités ActiveX/iframe de PDF.js sont supprimés de la version distribuée, et le Worker OCR refuse toute origine différente de celle de l’extension. Les requêtes réseau servent uniquement à charger un PDF explicitement ouvert par l’utilisateur ou, lorsque l’utilisateur active et configure lui-même une API d’IA compatible, à envoyer des extraits textuels après confirmation et à recevoir une réponse sous forme de données. Aucun code reçu du réseau n’est évalué ou exécuté.

## Justifications des permissions

### activeTab

> `activeTab` donne un accès temporaire à l’URL de l’onglet courant lorsque l’utilisateur ouvre le popup de PDF Nexus. Cet accès permet d’afficher la commande « Ouvrir le PDF de cet onglet dans Nexus » et de reprendre ce PDF dans l’éditeur après autorisation d’origine. L’extension ne lit pas l’historique et n’accède pas aux autres onglets.

### downloads

> Permission facultative, demandée uniquement lorsque l’utilisateur active « Ouvrir aussi les PDF téléchargés ». Elle permet de détecter la fin d’un nouveau téléchargement PDF, de consulter uniquement l’élément concerné et d’ouvrir sa copie locale dans Nexus. L’extension ne supprime, n’annule et ne parcourt pas les anciens téléchargements.

### storage

> `storage` conserve localement les préférences de l’utilisateur (y compris un éventuel profil d’identité local facultatif pour le remplissage de formulaires), l’état des options d’ouverture, les paramètres du coffre chiffré facultatif et la clé API personnelle facultative dans le stockage de session (`chrome.storage.session`) limité aux contextes de confiance. Les brouillons, fichiers récents et échanges utilisent séparément IndexedDB uniquement après consentement explicite de l’utilisateur (`storageConsent`). Ces données ne sont pas utilisées pour le suivi, la publicité ou l’analyse d’audience.

### webRequest

> Permission facultative, demandée uniquement lorsque l’utilisateur active l’ouverture automatique des PDF web. Nexus observe les en-têtes des navigations principales afin de reconnaître une réponse `application/pdf`, puis ouvre l’éditeur dans le même onglet via `chrome.tabs.update`. L’écoute est non bloquante : elle ne lit ni le corps des autres pages, ni les cookies, ni les sous-ressources, et aucune donnée de navigation n’est enregistrée ou transmise.

### Accès aux hôtes (optional_host_permissions)

> Les origines `https://*/*`, `http://*/*` et `file:///*` sont toutes facultatives et aucune n’est accordée à l’installation. Elles servent uniquement, après consentement explicite, à charger un PDF ouvert par l’utilisateur, à observer les réponses `application/pdf` si l’ouverture automatique est activée, à lire un fichier PDF local ou à interroger l’origine du fournisseur d’IA personnel configuré.

## Certification des données et politique de confidentialité

- **URL de la politique de confidentialité** : `https://github.com/ZEBDA1/pdf-nexus/blob/main/docs/PRIVACY.md` (contient la déclaration affirmative d’utilisation limitée / Limited Use requise par le Chrome Web Store).
- Cocher les trois certifications de l’usage limité après vérification des cases de collecte de données :
  - les données servent uniquement aux fonctionnalités visibles de PDF Nexus ;
  - les données ne sont ni vendues ni utilisées pour la publicité, le profilage ou l’évaluation de solvabilité ;
  - aucun humain ne lit les documents, sauf demande explicite de support de l’utilisateur ou obligation légale.

Le mode local ne transmet aucun document. Si l’utilisateur choisit le mode API personnelle, Nexus lui demande l’origine du fournisseur et confirme chaque envoi ; seuls les extraits nécessaires, les 6 derniers messages de la conversation et la clé API personnelle sont transmis au fournisseur choisi. Aucun document, brouillon ou fichier récent n’est écrit dans IndexedDB sans accord explicite (`storageConsent`), et un coffre local `AES-GCM` 256 bits (`PBKDF2`) facultatif permet de les chiffrer au repos.
