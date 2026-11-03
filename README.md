# Mon Classeur TCG

App web perso pour suivre ma collection **Riftbound**, **Yu-Gi-Oh** et **Pokémon** depuis mon iPhone.

- Adresse : https://ninbbus.github.io/ma-collection-tcg/
- Installation : ouvrir l'adresse dans Safari → Partager → « Sur l'écran d'accueil ».
- La collection est stockée sur le téléphone. Penser à exporter une sauvegarde (Réglages) de temps en temps vers iCloud Drive.

## Fonctionnement

- `app/` : l'application (HTML, CSS, JS, sans étape de build).
- `scripts/build-data.mjs` : récupère les catalogues de cartes et écrit `data/` au moment de la publication.
- `.github/workflows/deploy.yml` : publie sur GitHub Pages à chaque modification et chaque nuit (mise à jour des cartes). Lancement manuel possible depuis l'onglet **Actions**.

## Sources des cartes

- Riftbound : [Riftcodex](https://riftcodex.com) (base communautaire, non affiliée à Riot Games)
- Yu-Gi-Oh : [YGOPRODeck](https://ygoprodeck.com/api-guide/)
- Pokémon : [TCGdex](https://tcgdex.dev)
