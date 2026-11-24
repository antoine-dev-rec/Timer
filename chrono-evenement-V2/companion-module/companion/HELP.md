# Chrono événement (Alive Events)

Module pour piloter l'application « Chrono événement » (version bureau) depuis Companion.

## Configuration
- **Adresse IP** : celle de l'ordinateur qui fait tourner le chrono (127.0.0.1 si Companion est sur la même machine).
- **Port** : 9595 par défaut (voir Réglages > Réseau et Stream Deck dans l'application).
- Si Companion est sur une autre machine : cocher « Autoriser l'accès depuis le réseau local » **et** « Autoriser aussi les commandes depuis le réseau » dans l'application.

## Actions
Lancer (play), Pause, Pause/Reprendre (bascule), Réinitialiser, Raccourci 1 à 10, Message (afficher / masquer / basculer), Message mémorisé 1 à 20, Ouvrir / fermer la sortie, Plein écran, sortie en plein écran ou en fenêtre sur l'écran N.

## Retours d'état (feedbacks)
- Statut du chrono (prêt, en cours, en pause, dépassement, terminé) : allume PLAY et PAUSE
- Couleur du seuil (vert / orange / rouge), clignotante en dépassement
- Message affiché, et quel message mémorisé est affiché
- Raccourci actif
- Sortie ouverte

## Variables
`time`, `status`, `phase`, `title`, `message`, `dur`, `active`, `mem1`–`mem10` (noms), `dur1`–`dur10` (durées), `msg1`–`msg20`.

## Presets
50 boutons colorés prêts à l'emploi (onglet Presets, 6 catégories). Mises en page conseillées : GUIDE-STREAMDECK.txt.
