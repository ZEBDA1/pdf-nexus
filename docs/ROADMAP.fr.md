# Feuille de route — priorités 1 à 5

Ces cinq priorités définissent le périmètre de la mise à jour locale 1.7.0. Leur réalisation et les preuves de validation sont suivies dans [IMPLEMENTATION-ROADMAP.md](IMPLEMENTATION-ROADMAP.md). Les exigences ci-dessous restent les critères de référence ; les limites de l’édition native et du caviardage restent distinctes.

## Priorité 1 — Sauvegarde automatique et reprise des brouillons

Conserver localement le travail en cours dans IndexedDB, proposer sa récupération après fermeture ou incident, afficher l'heure de la dernière sauvegarde et permettre de l'effacer. Définir des quotas explicites et gérer le manque d'espace. Ne jamais conserver un mot de passe ou une clé API dans le brouillon.

Critère de réussite : fermer l'onglet au milieu d'une modification et retrouver exactement le même document, ses pages et ses ajouts après réouverture, sans perdre la possibilité d'annuler les dernières actions selon la profondeur retenue.

## Priorité 2 — Remplissage des vrais formulaires

Ajouter les champs texte, les cases natives, les boutons radio et les listes déroulantes, avec navigation par Tab. Afficher clairement les champs interactifs du document et les cases simplement imprimées. Prévoir un export qui conserve les champs lorsque le moteur sait le faire ; proposer une copie aplatie séparément.

Critère de réussite : remplir un formulaire dans Nexus, l'ouvrir dans un autre lecteur et retrouver ses valeurs, ses champs et son ordre de navigation.

## Priorité 3 — Panneau des objets ajoutés

Lister les textes, cases, dessins et images par page. Permettre de sélectionner un objet depuis la liste, le renommer, le verrouiller, le déplacer dans l'ordre d'affichage ou le supprimer. Distinguer masquer un objet et le supprimer. Ajouter la sélection multiple et le copier-coller des ajouts.

Critère de réussite : retrouver et supprimer une petite case ou un tracé recouvert par une image sans devoir cliquer précisément dessus.

## Priorité 4 — Export au choix

Proposer explicitement un PDF avec données de réédition Nexus et une copie aplatie pour le partage. Indiquer ce qui reste modifiable, si les formulaires sont conservés et si des données d'édition sont incluses. Ajouter une prévisualisation du résultat avant téléchargement.

Critère de réussite : choisir le bon type de fichier sans devoir connaître le fonctionnement interne des annotations ; vérifier que la copie aplatie ne conserve pas les données de réédition ajoutées par Nexus.

## Priorité 5 — Qualité de l'édition et de la navigation

Améliorer l'adaptation des polices, le texte sur plusieurs lignes, les poignées de redimensionnement et les guides d'alignement. Signaler les substitutions et les corrections visuelles. Ajouter le surlignage des occurrences de recherche et le passage à l'occurrence suivante. Un remplacement global doit proposer un aperçu et exclure les blocs non pris en charge.

Critère de réussite : retoucher un passage courant avec une mise en page prévisible, puis contrôler l'export. L'édition universelle du texte natif et le caviardage sécurisé restent des chantiers distincts qui nécessitent un moteur et une validation adaptés.

## Qualité à maintenir à chaque version

Tester les formulaires réels, les scans riches en texte, les pages tournées/recadrées, les gros documents et les exports réouverts. Vérifier le paquet de production sur Chrome et Edge, hors connexion. Une modification de la détection des cases doit être testée à la fois sur le rappel des vraies cases et sur le nombre de lettres proposées à tort.

Le contrôle de reprise après redémarrage de Chrome a été intermittent pendant la validation 1.6.9, puis a réussi lors de deux relances isolées. Ce cas doit être surveillé et approfondi avant une prochaine publication ; sa cause n'est pas encore démontrée. Voir [VALIDATION.md](VALIDATION.md).

Le correctif 1.6.9 traitait les faux repères de cases et leur placement. La version locale 1.7.0 implémente les cinq priorités ci-dessus ; les limites et les preuves sont détaillées dans [IMPLEMENTATION-ROADMAP.md](IMPLEMENTATION-ROADMAP.md). La persistance de l’OCR, la recomposition universelle des paragraphes et le caviardage sécurisé restent des travaux distincts.
