# Préparer la soumission de PDF Nexus 1.7.0

Ce guide décrit les étapes à effectuer. Il ne certifie pas l’acceptation par Google. Aucun correctif de chiffrement ni nouveau dialogue de consentement n’a été implémenté en rédigeant ce document.

## 1. Terminer la préparation de l’extension

La version actuelle fonctionne sur Chrome et Edge et son audit de production ne détecte pas de code CDN distant. Deux points de confidentialité restent à traiter avant de la présenter comme prête pour publication :

- Afficher aux nouveaux utilisateurs et aux utilisateurs qui mettent à jour un avis clair sur la conservation des fichiers récents, brouillons, annotations, valeurs de formulaires et historique. Obtenir leur choix avant les premières écritures persistantes concernées. Le choix doit rester modifiable dans les paramètres ; refuser ne doit pas empêcher l’édition et l’export.
- Revoir la protection des données persistantes. Nexus ne chiffre actuellement ni les documents récents ni les brouillons IndexedDB. La FAQ Google mentionne le chiffrement au repos. La solution recommandée est un coffre local chiffré, avec une gestion de clé réelle, par exemple déverrouillé par une phrase secrète que Nexus ne conserve pas. Inclure les autres données persistantes concernées et prévoir la migration ou la suppression des anciennes copies non chiffrées. Stocker une clé en clair à côté des fichiers ne constitue pas cette protection.

Le chiffrement est une recommandation technique pour traiter le point identifié, pas une garantie d’approbation. Ne pas annoncer un coffre ou des données chiffrées avant implémentation et tests. Désactiver la sauvegarde par défaut améliore le choix utilisateur, mais ne chiffre pas les données lorsque la sauvegarde est activée.

Références : [divulgation des changements](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements), [FAQ de confidentialité, dont les données locales et le chiffrement](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).

## 2. Publier la politique de confidentialité

Le texte actuel se trouve dans `docs/PRIVACY.md`. Après les correctifs, le mettre à jour pour décrire exactement le comportement livré, puis le publier à une URL HTTPS accessible sans connexion, sur le site du produit ou dans un dépôt GitHub public.

La page doit préciser : traitement des documents, conservation des récents et brouillons, limites d’historique, suppression, protection réellement mise en œuvre, gestion de la clé API, transmission facultative d’extraits et de messages au fournisseur choisi, absence de publicité et de télémétrie. Ne pas promettre « aucune donnée traitée » ou « aucun envoi possible » puisque l’assistant distant existe.

Tester l’URL dans une fenêtre privée déconnectée. C’est cette URL publique qu’il faut renseigner dans le Store, pas un chemin local Windows.

## 3. Ouvrir le tableau de bord

Ouvrir le [tableau de bord Chrome Web Store](https://chrome.google.com/webstore/devconsole/) puis l’élément PDF Nexus existant, ID `dkpcbfafcmhacekpknhklbdkioaoamde`. Garder les changements en brouillon pendant la préparation.

## 4. Renseigner « Pratiques en matière de confidentialité »

### Objectif unique — texte à copier

> PDF Nexus fournit un espace de travail pour consulter, compléter et préparer des documents PDF directement dans le navigateur, avec un traitement local par défaut.

### Code distant

Sélectionner **Non, je n’utilise pas de code distant** pour le paquet actuel audité.

Justification si demandée :

> Les scripts, Web Workers, composants OCR, moteurs WebAssembly et bibliothèques sont inclus dans le paquet de l’extension. Aucun JavaScript ou WebAssembly n’est téléchargé puis exécuté depuis un serveur distant. L’API d’IA facultative reçoit des extraits textuels après confirmation et renvoie des données affichées en texte ; sa réponse n’est pas exécutée comme du code.

Référence : [déclaration du code distant](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy).

### activeTab — texte à copier

> Après l’ouverture du popup par l’utilisateur, activeTab permet de lire l’URL de l’onglet actif et de proposer l’ouverture de son PDF dans Nexus. L’extension ne parcourt pas l’historique du navigateur.

### storage — texte à copier

> L’API storage conserve les préférences et l’état des options facultatives. La clé API personnelle, si elle est configurée, est conservée dans le stockage de session limité aux contextes de confiance. Les documents récents, brouillons et échanges utilisent séparément IndexedDB sur l’appareil. Aucun de ces stockages ne sert à la publicité ou au suivi d’audience.

### webRequest — texte à copier

> Permission facultative utilisée lorsque l’utilisateur active l’ouverture automatique des PDF web. Elle permet d’observer les en-têtes des navigations principales pour reconnaître une réponse PDF et ouvrir Nexus. L’écoute est non bloquante et ne lit ni les cookies ni le corps des autres pages.

### downloads — texte à copier

> Permission facultative utilisée lorsque l’utilisateur active l’ouverture des PDF téléchargés. Elle permet de détecter la fin d’un nouveau téléchargement PDF et d’ouvrir sa copie locale. Aucun inventaire des anciens téléchargements, suppression ou annulation n’est effectué.

### Accès aux hôtes — texte à copier si le champ est proposé

> Les accès HTTP(S) servent à charger les PDF ouverts par l’utilisateur et, après activation explicite, à reconnaître les réponses PDF pour les ouvrir dans Nexus. Le mode API personnelle demande l’origine du fournisseur choisi. L’accès aux fichiers locaux sert uniquement aux PDF ouverts ou téléchargés que l’utilisateur souhaite traiter dans Nexus. Ces accès sont facultatifs et ne sont pas accordés à l’installation.

Le mode API exige HTTPS hors localhost/127.0.0.1. L’option file nécessite également l’autorisation d’accès aux URL de fichiers dans Chrome.

### Ancienne permission DNR

`declarativeNetRequestWithHostAccess` n’existe plus dans le manifeste actuel. Si le tableau de bord la demande encore, vérifier le paquet importé et actualiser les champs après téléversement du bon paquet. Ne pas inventer une justification.

### Utilisation des données

Déclarer les traitements réellement présents, même locaux. Ne pas choisir « aucune donnée » uniquement parce que les fichiers restent sur l’appareil. Le tableau de bord n’a pas été inspecté dans le compte de l’utilisateur ; ses cases doivent être rapprochées des faits suivants :

| Donnée traitée                                                             | Usage réel à déclarer                                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Texte, images, contenu et champs des documents                             | Lecture, édition, formulaires, conversion, OCR, brouillons ; extraits facultativement envoyés à l’IA         |
| Noms, coordonnées et autres données présentes dans des documents ou champs | Contenu fourni par l’utilisateur, traité pour préparer son document ; pas de création de profil publicitaire |
| Questions et messages de l’assistant                                       | Historique local ; derniers messages transmis au fournisseur seulement dans le mode API confirmé             |
| Clé API personnelle                                                        | Authentification auprès du fournisseur configuré, stockage de session ; pas de collecte par un serveur Nexus |
| URL de l’onglet et réponses PDF                                            | Ouverture du document et détection facultative ; pas de lecture de la base d’historique Chrome               |
| Préférences et historique d’annulation                                     | Configuration et reprise du travail sur l’appareil                                                           |

Les catégories « contenu », « identification », « authentification », « communications » et « historique web » doivent être évaluées d’après leurs définitions affichées, pas d’après l’existence d’un compte Nexus. Les documents étant libres, ne pas supposer que leur contenu ne peut jamais être médical, financier ou personnel. Ne pas confondre le traitement d’une URL nécessaire à l’ouverture et la collecte d’un historique général.

Cocher les trois certifications d’usage limité seulement après avoir rapproché le comportement, la page publique et les champs du Store : pas de vente/transfert hors des usages autorisés, pas d’utilisation sans rapport avec l’objectif unique, pas d’utilisation pour évaluer la solvabilité ou le prêt. Leur formulation exacte est celle du tableau de bord.

Référence : [champs de confidentialité](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy).

## 5. Remplacer la description publique

Dans la fiche de présentation, remplacer les anciennes descriptions, y compris les traductions actives. Ne pas réutiliser la liste de formats qui a déclenché Yellow Argon. Le fichier `docs/STORE-LISTING.fr-en.md` fournit déjà une base sobre.

Description anglaise actualisée possible :

> PDF Nexus helps you review and prepare documents in your browser.
>
> Work in a dedicated editor to annotate pages, complete supported forms and arrange document pages. Added objects can be adjusted or removed when you reopen a Nexus-editable export. Choose an editable copy or a flattened copy, and review the result before downloading.
>
> Local drafts let you resume work on this device. Conversion and text recognition are included; layout and recognition accuracy depend on the source document.
>
> Existing text can be edited in compatible blocks. Visual corrections keep the original content underneath and must not be used to conceal sensitive information. Drawn signatures are visual marks, not certified digital signatures.
>
> Processing runs locally by default. An optional AI provider can receive selected excerpts after confirmation; its own charges and privacy terms may apply. The extension has no ads or analytics and requires no proprietary subscription. Automatic document opening is optional.

Référence : [présentation et mots-clés](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements).

## 6. Importer et soumettre après les correctifs

1. Générer et tester le paquet final. Si un numéro a déjà été publié ou soumis, utiliser un numéro supérieur selon l’état du tableau de bord.
2. Importer uniquement l’archive de production `pdf-nexus-VERSION.zip`, jamais `pdf-nexus-source-VERSION.zip`.
3. Vérifier `manifest.json` à la racine et la version affichée dans le tableau de bord.
4. Vérifier l’URL publique de confidentialité, les descriptions dans chaque langue, les permissions et les déclarations de données.
5. Enregistrer puis soumettre pour examen. Ne pas annoncer une approbation avant la réponse de Google.

Le ZIP 1.7.0 actuel est un livrable local fonctionnel ; les changements de code recommandés à l’étape 1 ne sont pas contenus dans ce guide ni dans ce ZIP.
