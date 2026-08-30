# Cuddle

Cuddle is a browser-only, single-player roguelite campaign for Vowel Play.
It reuses the app's screen router, theme variables, power/quest metadata, and
`server/wordlists/allowed_secrets.txt`, but it does not add or change any
server behavior.

## Generated files

- `public/cuddle/cuddle-engine.js` — deck, feedback, scoring, quests, upgrades,
  thresholds, run progression, and `localStorage` persistence.
- `public/cuddle/cuddle-quests.js` — quest conditions and Cuddle adaptations of
  the existing guesser reward IDs. `freezeSecret` is deliberately excluded.
- `public/cuddle/cuddle-ui.js` — card-only UI and the `#cuddleBtn` menu hook.
- `public/cuddle/cuddle.css` — isolated responsive styling.
- `public/cuddle/allowed-secrets.txt` — a public copy derived at patch time from
  the existing server secret list. Words with a Q not immediately followed by U
  are omitted because the physical Q card is QU.

Only `public/index.html` is edited. Four clearly marked blocks add the stylesheet,
main-menu button, empty screen mount, and script references. Re-running the patch
replaces those blocks rather than duplicating them.

## Rule interpretations made explicit

- A mulligan replaces 1 to 3 cards by default; "Bigger Mulligan" raises that
  maximum by one, up to five cards.
- QU is one physical card and contributes two letters. A submitted five-letter
  word draws five replacement cards, matching the rule "for every letter used,
  draw a new card." Using QU can therefore increase hand size by one.
- The round thresholds are cumulative-score gates. Solving the fixed secret is
  necessary, but the run also ends if total score is below that round's gate.
- Green tiles grant two temporary copies but no direct points; yellow tiles grant
  one temporary copy and score points; grey tiles cost one point.
- A quest is offered on guesses 3 and 6 by default, on guesses 2, 4, and 6 after
  one cadence upgrade, and on every guess after the second cadence upgrade.
- A quest reward earned on a successful final guess is banked and activated at
  the start of the next round so it is not wasted.

## Browser smoke checklist

1. Open **Cuddle** from the main menu and start a new run.
2. Confirm the opening hand has at least two vowel-bearing cards.
3. Build words only by clicking cards; no physical keyboard input is registered.
4. Verify yellow/green temporary copies, five replacement draws, mulligans, and
   grey-card recycling.
5. Complete the third-guess quest, refresh its reward choices when upgraded, and
   verify `freezeSecret` is never offered.
6. Solve a round, choose an upgrade, cross a 50-point boundary, and confirm the
   extra milestone choice.
7. Refresh the page and continue the saved run.
