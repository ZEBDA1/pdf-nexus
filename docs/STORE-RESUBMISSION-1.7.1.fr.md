# Nouvelle soumission 1.7.1 — Red Titanium

Le refus cite les replis anciens de `core-js/internals/object-create.js`, intégrés à la distribution de compatibilité PDF.js et au bundle par défaut d’ExcelJS. Ces routines peuvent assembler des balises et un schéma JavaScript pour d’anciennes versions d’Internet Explorer. Elles ne sont pas nécessaires à Chrome/Edge 131 et suivants.

Google [autorise la minification](https://developer.chrome.com/docs/webstore/program-policies/code-readability), mais interdit l’obscurcissement et la dissimulation des fonctionnalités. Ce correctif retire la logique signalée ; il ne se limite pas à reformater ou renommer les extraits.

## Changements vérifiables

- PDF.js 6.4.299 : le module `Object.create` complet est remplacé par `module.exports = Object.create` dans le lecteur et son Worker. La transformation de `scripts/vendor-policy.mjs` vérifie le SHA-256 exact du module amont avant de le remplacer. Les autres polyfills récents restent présents pour conserver Chrome 131.
- ExcelJS 4.4.0 : l’alias de compilation sélectionne le bundle navigateur officiel, non minifié et sans polyfills `dist/exceljs.bare.js`. La conversion XLSX reste disponible.
- `build.minify: false` conserve la présentation et les noms des bundles Nexus et du Worker de traitement. Le Worker PDF utilise le fichier amont lisible `pdf.worker.mjs`.
- `vendor/BUILD-NOTES.txt` explique les sources et transformations dans le paquet. Les licences et les notices amont sont conservées. Les composants OCR/WASM amont restent locaux ; leur minification amont n’est pas assimilée à de l’obscurcissement par ce correctif.
- Les scripts de `dist/` et du ZIP final sont contrôlés contre les replis signalés et le chargement de code CDN. Les tests incluent les extraits cités, le comportement natif d’`Object.create` et des ZIP de régression.
- La version du manifeste est **1.7.1**. Aucune permission supplémentaire.

## Étapes dans le tableau de bord

1. Tester localement `dist/` après avoir exporté les documents en cours et rechargé l’extension depuis `chrome://extensions` ou `edge://extensions`.
2. Ouvrir [la fiche PDF Nexus dans le tableau de bord](https://chrome.google.com/webstore/devconsole/3dab0ce1-0988-43c4-b985-d9d42065a876/dkpcbfafcmhacekpknhklbdkioaoamde/edit).
3. Dans **Package**, importer **`release/pdf-nexus-1.7.1.zip`**. Le manifeste se trouve à la racine. Ne pas importer l’archive `source` ni le dossier complet du projet.
4. Vérifier que le tableau de bord affiche **1.7.1** et joindre la note ci-dessous aux instructions de test ou à la réponse au support si le champ est disponible.
5. Vérifier les déclarations de confidentialité avant de soumettre de nouveau. Les points encore ouverts du [guide de publication 1.7.0](STORE-PUBLICATION-1.7.0.fr.md) ne sont pas résolus par ce correctif de lisibilité.

Le ZIP est préparé localement ; aucune publication n’est faite automatiquement. Les contrôles locaux ne garantissent pas l’acceptation par Google et ne remplacent pas une revue de l’ensemble de la fiche.

## Note pour l’équipe de validation (anglais)

> Version 1.7.1 addresses the Red Titanium report. We removed the entire obsolete Object.create compatibility fallback identified in both the PDF.js main library and its worker. Both now use the browser's native Object.create implementation. The ActiveX, hidden-iframe and generated-script fallback logic has been removed, not renamed or encoded. The replacement is guarded against the pinned upstream module's SHA-256.
>
> ExcelJS now uses its official unminified browser bundle without core-js polyfills. Application and processing-worker bundles are built with minification disabled, and the PDF worker is based on the unminified upstream source. Packaged vendor/BUILD-NOTES.txt documents the dependency origins and transformations, and upstream license notices are included.
>
> Automated checks scan the generated scripts and the actual upload ZIP for the reported legacy routines and remote executable-code loaders. PDF rendering, editing/export, spreadsheet conversion and local OCR are covered by functional tests. No new permissions or remote executable code were introduced.
