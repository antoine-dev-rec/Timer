MODULE BITFOCUS COMPANION - Chrono evenement (Alive Events)

Etat : code ecrit pour l'API @companion-module/base 1.x, verifie avec une simulation (actions, retours d'etat, variables),
mais PAS encore charge dans un vrai Companion. A valider par le technicien.

Documentation : https://companion.free/for-developers/module-development/
Modele officiel JavaScript : https://github.com/bitfocus/companion-module-template-js

Mise en place simple (sans npm cote Companion)
1. Produire le fichier .tgz du module : voir ../LISEZ-MOI-TECHNICIENS.txt (GitHub Actions, ou PREPARER-COMPANION.bat).
2. Dans Companion : Modules > importer un module (Import module package) > choisir le .tgz.
3. Connections > Add > "Chrono evenement" > IP du PC du chrono + port (9595 par defaut).
   Autre machine que celle du chrono : cocher dans l'application, Parametres > Reseau :
   "Autoriser l'acces depuis le reseau local" ET "Autoriser aussi les commandes depuis le reseau".

Mise en place en developpement (alternative) : npm install dans ce dossier, puis Settings > Developer modules path.

Contenu
- Actions : Lancer (play), Pause, Pause/Reprendre (bascule), Reinitialiser, Raccourci 1-10, Message (afficher/masquer/basculer),
  Message memorise 1-20, Ouvrir/Fermer la sortie, Plein ecran,
  Sortie plein ecran / en fenetre sur l'ecran N.
- Retours d'etat : statut (play/pause allumes), couleur du seuil avec clignotement en depassement, message affiche,
  message memorise affiche, raccourci actif, sortie ouverte.
- Variables : time, status, phase, title, message, dur, active, mem1..mem10, dur1..dur10, msg1..msg20.
- Presets (50, en 6 categories) : suivi, commandes PLAY/PAUSE/RESET, message, sortie, 10 raccourcis, 20 messages.
  Mise en page conseillee (15 touches et XL) : GUIDE-STREAMDECK.txt
- Source de l'etat : l'API JSON de l'application, interrogee 4 fois par seconde (http://IP:9595/api/state).
