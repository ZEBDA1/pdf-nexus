# Déclaration Chrome Web Store — PDF Nexus 1.6.7

Ces textes correspondent au manifeste et au comportement de la version 1.6.7.

## Objectif unique

PDF Nexus permet d’ouvrir, lire, modifier, annoter, organiser, convertir et analyser des documents PDF dans une interface dédiée du navigateur, avec un traitement local par défaut.

## Code distant

Sélectionner **Non, je n’utilise pas de code distant**.

Justification, si un texte est demandé :

> PDF Nexus n’exécute aucun code distant. Tous les scripts, Web Workers, modules WebAssembly, ressources PDF.js, composants OCR Tesseract, polices et bibliothèques sont inclus dans le paquet de l’extension. Les valeurs CDN de secours de Tesseract.js sont supprimées de la version distribuée et le Worker OCR refuse toute origine différente de celle de l’extension. Les requêtes réseau servent uniquement à charger un PDF explicitement ouvert par l’utilisateur ou, lorsque l’utilisateur active et configure lui-même une API d’IA compatible, à envoyer des extraits textuels à cette API et à recevoir une réponse sous forme de données. Aucun code reçu du réseau n’est évalué ou exécuté.

## Justifications des permissions

### activeTab

> `activeTab` donne un accès temporaire à l’URL de l’onglet courant lorsque l’utilisateur ouvre le popup de PDF Nexus. Cet accès permet d’afficher la commande « Ouvrir le PDF de cet onglet dans Nexus » et de reprendre ce PDF dans l’éditeur. L’extension ne lit pas l’historique et n’accède pas aux autres onglets.

### downloads

> Permission facultative, demandée uniquement lorsque l’utilisateur active « Ouvrir aussi les PDF téléchargés ». Elle permet de détecter la fin d’un nouveau téléchargement PDF, de consulter uniquement l’élément concerné et d’ouvrir sa copie locale dans Nexus. L’extension ne supprime, n’annule et ne parcourt pas les anciens téléchargements.

### storage

> `storage` conserve localement les préférences de l’utilisateur, l’état des options d’ouverture et la clé API personnelle facultative dans le stockage de session du navigateur. Ces données sont nécessaires pour restaurer la configuration de Nexus entre les ouvertures. Elles ne sont pas utilisées pour le suivi, la publicité ou l’analyse d’audience.

### webRequest

> Permission facultative, demandée uniquement lorsque l’utilisateur active l’ouverture automatique des PDF web. Nexus observe les en-têtes des navigations principales afin de reconnaître une réponse `application/pdf`, puis ouvre l’éditeur dans le même onglet. L’écoute est non bloquante : elle ne lit ni le corps des autres pages, ni les cookies, ni les sous-ressources, et aucune donnée de navigation n’est enregistrée ou transmise.

### declarativeNetRequestWithHostAccess

Cette permission a été retirée depuis la version 1.6.6 car elle n’est plus utilisée. Après téléversement de `pdf-nexus-1.6.7.zip`, ce champ doit rester absent. Ne pas fournir une justification pour une permission inutile.

## Certification des données

Cocher les trois certifications de l’usage limité seulement après avoir vérifié que la politique de confidentialité publiée correspond au produit :

- les données servent uniquement aux fonctionnalités visibles de PDF Nexus ;
- les données ne sont ni vendues ni utilisées pour la publicité ou le profilage ;
- aucun humain ne lit les documents, sauf demande explicite de support de l’utilisateur ou obligation légale.

Le mode local ne transmet aucun document. Si l’utilisateur choisit le mode API personnelle, Nexus lui demande l’origine du fournisseur et confirme chaque envoi ; seuls les extraits nécessaires, les derniers messages de la conversation et la clé API personnelle sont transmis au fournisseur choisi. Cette transmission doit être indiquée dans la politique de confidentialité et dans les cases de données proposées par le tableau de bord.
