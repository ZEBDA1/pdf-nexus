# Mise à jour locale 1.7.0 — réalisation de la feuille de route

## 1. Sauvegarde automatique

IndexedDB conserve jusqu’à cinq brouillons et 250 Mio. Les sources sont enregistrées une seule fois par révision ; chaque modification sauvegarde l’état des pages, les ajouts, les champs de formulaire, le filigrane, la navigation et jusqu’à vingt actions d’annulation dans une limite de 20 Mio. Le statut affiche l’heure ou une erreur avec réessai. L’accueil permet de reprendre ou de supprimer un brouillon. Le réglage de sauvegarde est distinct de celui des fichiers récents ; l’effacement global inclut les deux.

Les PDF chiffrés ne sont pas sauvegardés. Aucun mot de passe saisi ni clé API n’entre dans le modèle du brouillon. Le stockage local contient les PDF importés et leurs données préexistantes : il n’est pas chiffré par Nexus. Quota dépassé : erreur explicite, sans suppression automatique d’un autre brouillon. Une fermeture avant la fin de la sauvegarde ou la perte du stockage navigateur ne garantit pas la récupération ; exportez les documents importants.

Preuves : `drafts.spec.ts`, `native-forms.spec.ts`, `history.ts` et les tests d’effacement. L’historique profond reste limité par taille ; les octets sources ne sont pas dupliqués dans chaque action.

## 2. Formulaires natifs

Champs texte simples ou multilignes, dates sous forme textuelle, cases, radios, listes déroulantes et listes multisélection. Tab parcourt les champs dans l’ordre visuel, y compris vers la page suivante. Les valeurs d’un même champ réparti sur plusieurs pages restent communes ; une page dupliquée possède son propre groupe. Les champs en lecture seule ne sont pas modifiés. Les champs de mot de passe et texte riche sont exclus de l’édition.

L’export reconstruit les widgets compatibles, leurs valeurs, options d’affichage/export, limites de longueur et drapeaux de lecture seule. Il indique un ordre par lignes au lecteur PDF. Les actions JavaScript originales, calculs, validations, signatures numériques, XFA et structure PDF/UA ne sont pas conservés. Les polices des champs sont adaptées à Noto Sans. Les champs non pris en charge sont aplatis si leur apparence le permet, sinon l’export échoue explicitement.

Preuves : `forms.test.ts`, `native-forms.spec.ts`, `forms-signatures.spec.ts` ; valeurs relues avec pdf-lib et apparences rendues avec PDF.js.

## 3. Objets ajoutés

Panneau par page, ordre du premier plan vers le fond, sélection accessible sans viser l’objet, nom, affichage/masquage, verrouillage/déverrouillage, avancer/reculer, suppression. Maj/Ctrl + clic permet la sélection multiple ; boutons et Ctrl+C/Ctrl+V copient les ajouts vers la page courante dans Nexus. Le presse-papiers interne ne requiert aucune permission système et est vidé lors de l’effacement global. Le verrouillage est une aide d’édition, pas une protection cryptographique.

Les propriétés persistent dans les brouillons et les copies rééditables. Les objets masqués restent dans ces copies. Un objet verrouillé peut être sélectionné, renommé et déverrouillé ; il ne peut pas être déplacé, masqué, redimensionné ou supprimé tant qu’il est verrouillé.

Preuves : `objects.test.ts`, `roadmap.spec.ts`, `reeditable.spec.ts`.

## 4. Export au choix

**Continuer dans Nexus** conserve les ajouts séparément et propose de garder les vrais champs interactifs. **Partager une copie aplatie** fige les ajouts visibles et les champs, exclut les objets masqués et toute donnée privée `NexusEdits`. Un aperçu généré à partir des octets du fichier final permet de parcourir ses pages avant le téléchargement. Fermer le dialogue annule les traitements en cours.

La copie aplatie conserve le texte vectoriel lorsqu’il existe : ce n’est pas une conversion systématique en image. Elle ne supprime pas le texte recouvert par une correction visuelle et ne constitue pas un caviardage. Les conversions internes utilisent un export sans données de réédition. Le filigrane et la pagination restent intégrés au fond dans les deux formats.

Preuves : `objects.test.ts`, `forms.test.ts`, `roadmap.spec.ts` ; vérification du catalogue, des champs, du texte et du rendu final.

## 5. Édition et navigation

Les textes ajoutés proposent les polices locales/standard, avec adaptation à Noto Sans si les caractères ne sont pas représentables. Ajouts et corrections visuelles prennent en charge plusieurs lignes ; un bloc natif reste sur une ligne pour préserver les flux voisins. Les ajouts possèdent quatre poignées de redimensionnement, compatibles avec rotation/zoom ; Maj conserve les proportions. Les guides alignent les objets déplacés sur les bords/centres des autres objets visibles et de la page ; Maj désactive l’accrochage pendant le déplacement.

La recherche surligne les occurrences et permet le passage suivant/précédent, y compris entre pages. Les positions natives utilisent les plages du DOM ; celles issues d’OCR sont approximées à partir des mots reconnus. Le remplacement global est exact et sensible à la casse : il liste l’avant/après, permet de décocher des blocs, valide les substitutions dans un worker puis applique la sélection en une action annulable. Les blocs incompatibles, scans, corrections visuelles, ajouts et champs sont exclus ; aucun masque n’est créé implicitement. Un changement du document invalide les résultats de recherche périmés.

Les polices standard sont prévisualisées avec leurs équivalents système : leur métrique peut différer légèrement. La police Noto Sans est embarquée. L’aperçu d’export reste la référence. Aucun moteur de recomposition universelle des paragraphes ni caviardage sécurisé n’est annoncé.

Preuves : `objects.test.ts`, `native.test.ts`, `roadmap.spec.ts`, suites de saisie/déplacement/zoom.

## Interface

Accueil avec reprise des brouillons, statut de sauvegarde dans le titre, outils de création regroupés, bouton explicite « Objets ajoutés », réglages de police et taille contextuels, choix d’export décrits en langage courant et aperçu côte à côte. Les panneaux restent utilisables en fenêtre étroite ; les modales piègent le focus et les commandes portent des labels. Le français et l’anglais utilisent les catalogues embarqués. Le popup place l’ouverture manuelle au premier plan et propose de reprendre les brouillons enregistrés.

## Validation et livrables

Les résultats de la validation finale et ses limites sont consignés dans [VALIDATION.md](VALIDATION.md). Le dossier `dist` et les archives de production sont générés avec `npm run check`. Cette mise à jour reste locale ; aucune publication GitHub ou Store n’est effectuée.
