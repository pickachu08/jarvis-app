# Installer Jarvis sur ton téléphone (iPhone/Android)

Jarvis est une **PWA** (web app installable) : une fois en ligne, tu l'ajoutes à ton écran d'accueil et elle se comporte comme une appli normale, avec une icône, en plein écran, et elle sauvegarde tes données directement sur ton téléphone — même sans connexion.

## Étape 1 — Mets le code en ligne avec GitHub Pages (gratuit)

1. Crée un compte sur [github.com](https://github.com) si tu n'en as pas.
2. Crée un nouveau dépôt (bouton vert **New**), nomme-le par exemple `jarvis-app`, coche **Public**, valide.
3. Sur la page du dépôt, clique **Add file → Upload files**, puis glisse-dépose **tous les fichiers et dossiers** de ce projet (`index.html`, `style.css`, `app.js`, `sw.js`, `manifest.webmanifest`, et le dossier `icons/` avec les images dedans).
4. Clique **Commit changes**.
5. Va dans **Settings → Pages** (menu de gauche).
6. Sous **Source**, choisis la branche `main` et le dossier `/ (root)`, puis **Save**.
7. Attends 1-2 minutes : GitHub te donne une adresse du type
   `https://ton-pseudo.github.io/jarvis-app/`

## Étape 2 — Installe-la sur ton téléphone

**Sur iPhone (Safari — obligatoire, ça ne marche pas depuis Chrome sur iOS) :**
1. Ouvre le lien GitHub Pages dans Safari.
2. Appuie sur l'icône de partage (le carré avec la flèche vers le haut).
3. Fais défiler et choisis **Sur l'écran d'accueil**.
4. Donne-lui un nom (Jarvis) et valide.

**Sur Android (Chrome) :**
1. Ouvre le lien dans Chrome.
2. Appuie sur le menu (⋮ en haut à droite).
3. Choisis **Ajouter à l'écran d'accueil** ou **Installer l'application** (le message peut apparaître automatiquement en bas de l'écran).
4. Valide.

Tu as maintenant une icône Jarvis sur ton écran d'accueil. Elle s'ouvre en plein écran, sans barre de navigateur, et tes données restent enregistrées d'une session à l'autre sur cet appareil.

## Notes importantes

- **Les données restent sur l'appareil.** Si tu désinstalles l'appli ou effaces les données de navigation, tes séances seront perdues. Il n'y a pas de synchronisation automatique entre ton téléphone et ton ordinateur avec cette version.
- **Pour mettre à jour l'appli** (si tu me redemandes des modifications plus tard) : remplace les fichiers modifiés dans ton dépôt GitHub (Upload files à nouveau), GitHub Pages se met à jour automatiquement en 1-2 minutes. Si l'appli déjà installée sur ton téléphone n'affiche pas les changements, ferme-la complètement (glisser vers le haut pour la fermer) et rouvre-la — elle se met à jour toute seule en arrière-plan.
- Tu peux aussi tester le site avant de l'installer en ouvrant simplement le lien GitHub Pages dans ton navigateur.
- **Scanner de code-barres** : la première fois que tu l'utilises, Safari te demande d'autoriser l'accès à la caméra — accepte. Si ça ne marche pas, vérifie dans Réglages iPhone → Safari → Caméra que l'accès est bien autorisé pour le site.
- Le scan et la recherche de produit (Open Food Facts) ont besoin d'internet — hors connexion, seule la checklist, le calendrier et les séances restent utilisables.
