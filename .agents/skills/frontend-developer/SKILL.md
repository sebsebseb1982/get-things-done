---
name: frontend-playwright
description: >
  Développement frontend avec validation automatique via Playwright MCP.
  Utilise ce skill dès que l'utilisateur demande de créer, modifier, corriger ou améliorer
  une interface web, un composant, une page HTML/CSS/JS ou React — même sans mention explicite
  de tests ou de validation. Ce skill impose une boucle de validation systématique :
  chaque livraison frontend DOIT être vérifiée via le serveur MCP Playwright avant d'être
  considérée comme terminée. Ne jamais répondre "voilà c'est fait" sans avoir lancé la
  vérification Playwright.
compatibility:
  tools:
    - playwright (MCP server, obligatoire)
---

# Skill : Développement Frontend avec Validation Playwright

Ce skill encadre tout développement frontend en imposant une boucle de validation
systématique via le serveur MCP Playwright. L'objectif est de garantir que chaque
modification est réellement reflétée dans le navigateur avant d'être déclarée terminée.

---

## Principe fondamental

> **Ne jamais déclarer une tâche frontend terminée sans avoir validé visuellement
> et fonctionnellement le résultat via Playwright.**

Cette règle est non-négociable. Elle s'applique même pour les changements "mineurs"
(un texte, une couleur, un espacemen, un état interactif).

---

## Workflow obligatoire

### 1. Comprendre la demande
- Identifier clairement ce que l'utilisateur veut obtenir (rendu visuel, comportement,
  état interactif, responsive, etc.)
- Si la demande est ambiguë, poser UNE question ciblée avant de coder

### 2. Implémenter
- Écrire ou modifier le code frontend (HTML/CSS/JS, React, Vue, etc.)
- Appliquer les bonnes pratiques de design et d'accessibilité
- Respecter les contraintes techniques mentionnées par l'utilisateur

### 3. Lancer la validation Playwright (OBLIGATOIRE)

Utiliser le serveur MCP Playwright pour :

```
1. Ouvrir ou recharger la page concernée
2. Prendre un screenshot de l'état actuel
3. Vérifier les éléments demandés (présence, texte, style, interaction)
4. Effectuer les interactions nécessaires (clic, saisie, scroll, hover)
   selon ce que l'utilisateur a demandé
5. Prendre un screenshot final après interactions si pertinent
```

**Exemples de vérifications à effectuer selon la demande :**

| Demande utilisateur | Vérification Playwright |
|---|---|
| "Ajoute un bouton bleu" | Screenshot + vérifier que le bouton est visible et de la bonne couleur |
| "Le formulaire doit valider les emails" | Saisir un email invalide → vérifier le message d'erreur |
| "Menu hamburger en mobile" | Redimensionner viewport → cliquer le bouton → vérifier l'ouverture |
| "Affiche les données de l'API" | Attendre le chargement → vérifier que les données sont présentes |
| "Animation au hover" | Hover sur l'élément → screenshot |

### 4. Interpréter les résultats

**Si Playwright confirme le rendu attendu :**
- Présenter le résultat à l'utilisateur avec le screenshot comme preuve
- Résumer ce qui a été livré et validé

**Si Playwright révèle un problème :**
- Identifier la cause (erreur console, sélecteur manquant, style non appliqué, etc.)
- Corriger le code
- Relancer la validation depuis l'étape 3
- Répéter jusqu'à validation complète

---

## Règles de validation selon le type de tâche

### Composant statique (bouton, card, badge…)
- Screenshot avant/après
- Vérifier la présence dans le DOM avec un sélecteur approprié
- Vérifier les propriétés CSS critiques (couleur, taille, police) si demandé

### Formulaire
- Tester le chemin nominal (saisie valide → soumission)
- Tester un cas d'erreur (saisie invalide → message d'erreur visible)
- Vérifier l'état désactivé si pertinent

### Navigation / Routing
- Cliquer sur chaque lien/bouton de navigation impacté
- Vérifier que l'URL et/ou le contenu changent correctement

### Responsive / Mobile
- Tester au moins en viewport mobile (375px) et desktop (1280px)
- Vérifier que rien ne déborde ou ne disparaît

### Interactions dynamiques (dropdown, modal, tab, accordion…)
- Déclencher l'interaction via Playwright
- Vérifier l'état ouvert ET l'état fermé
- Vérifier le focus/accessibilité si possible

### Données dynamiques (fetch, état React, etc.)
- Attendre le rendu asynchrone (`waitForSelector` ou équivalent)
- Vérifier que les données sont bien affichées

---

## Communication avec l'utilisateur

Après chaque cycle de validation, communiquer clairement :

```
✅ Validé via Playwright
- Ce qui a été implémenté : [description courte]
- Ce qui a été vérifié : [liste des checks effectués]
- Screenshot : [joint si disponible]
```

En cas d'itération (bug trouvé par Playwright) :
```
🔍 Playwright a détecté un problème : [description]
→ Correction appliquée : [ce qui a changé]
→ Nouvelle validation en cours…
```

---

## Ce que ce skill ne remplace PAS

- Les tests unitaires (Jest, Vitest) pour la logique métier
- Les tests d'accessibilité approfondis (axe-core, audit manuel)
- La revue de code
- Les tests de performance (Lighthouse, WebVitals)

Ces aspects sont complémentaires et peuvent être adressés séparément si l'utilisateur le demande.

---

## Rappel final

Le serveur MCP Playwright est **toujours disponible** dans cet environnement.
Il n'y a aucune raison de livrer du frontend non validé. Si Playwright ne peut pas
accéder à la page (serveur non démarré, mauvaise URL), en informer l'utilisateur
immédiatement et proposer une solution (démarrer le serveur, corriger l'URL, etc.)
avant de continuer.