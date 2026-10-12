# Note de nouvelle soumission — PDF Nexus 1.6.7

## Correction de la référence Blue Argon

La version 1.6.7 supprime les mécanismes de code hébergé à distance présents dans les valeurs de secours de la distribution générique de Tesseract.js :

- suppression des URL CDN jsDelivr dans le Worker OCR livré ;
- suppression du chemin CDN par défaut du code principal Tesseract ;
- suppression de la création d’un Blob Worker contenant un `importScripts()` dynamique ;
- création directe du Worker OCR depuis une URL appartenant obligatoirement à l’origine de l’extension ;
- chargement du moteur OCR depuis le chemin local fixe `vendor/ocr/core/tesseract-core-simd-lstm.wasm.js` ;
- moteurs JavaScript/WebAssembly, modèles français et anglais et Worker OCR tous inclus dans le paquet ;
- audit de production qui interrompt la compilation si une URL CDN, un Worker distant ou un `importScripts()` distant est détecté dans un fichier exécutable.

L’OCR a ensuite été testé hors connexion dans le paquet Manifest V3 produit sur Chromium et Microsoft Edge. PDF Nexus n’exécute aucun code distant. Les communications facultatives avec un fournisseur d’IA configuré par l’utilisateur transportent uniquement des données textuelles et n’exécutent jamais la réponse comme du code.

## Texte court pour les notes destinées à l’examinateur

> Version 1.6.7 resolves Blue Argon. We removed Tesseract.js CDN fallback URLs and its Blob/importScripts worker path from the shipped code. The OCR worker now loads only from the extension origin, while all JavaScript, WebAssembly cores and French/English language data are packaged locally. A production audit rejects the build if remote CDN code, a remote Worker or a remote importScripts call is detected. Offline OCR was verified in the packaged MV3 extension on Chromium and Microsoft Edge. PDF Nexus does not execute remotely hosted code.
