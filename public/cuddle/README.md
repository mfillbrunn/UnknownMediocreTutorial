# Cuddle

Cuddle is a browser-only, single-player roguelite campaign for Vowel Play.
It reuses the app's screen router, theme variables, power/quest metadata, and
the same two word lists the main game uses (`/api/allowed-guesses` for what
can be submitted, `/api/allowed-secrets` for what the secret can be), but it
does not add or change server behavior.

## Generated files

- `public/cuddle/cuddle-engine.js` - deck, feedback, scoring, quests, upgrades,
  thresholds, run progression, and `localStorage` persistence.
- `public/cuddle/cuddle-quests.js` - quest conditions and Cuddle adaptations of
  the existing guesser reward IDs. `freezeSecret` is deliberately excluded.
- `public/cuddle/cuddle-ui.js` - card-only interface. Vowels remain in a top row,
  consonants remain below, and each row sorts green, yellow, unused grey, then
  absent red, with alphabetical ordering inside each color group. The visible
  activity log is removed.
- `public/cuddle/cuddle.css` - isolated responsive Cuddle styling.
- `public/cuddle/site-integration.js` - moves the existing mode buttons into new
  Multiplayer and Single Player hub screens without replacing their IDs or
  click handlers. It also keeps tutorial highlighting and the My Games notice
  working after the move.
- `public/cuddle/site-integration.css` - styles the two hubs and equalizes the
  visible size of hollow and filled Secretkeeper stars in regular play.

Only `public/index.html` is edited. Four clearly marked blocks add stylesheet
references, the Cuddle button, an empty Cuddle screen mount, and script
references. All implementation code is added under `public/cuddle/`.
Re-running the patch replaces those blocks and generated files rather than
creating duplicates.

## Rule interpretations made explicit

- A mulligan replaces 1 to 3 cards by default; Bigger Mulligan raises that
  maximum by one, up to five cards.
- Q is its own finite card. U is selected separately from the always-available
  vowel row. A, E, I, O, and U do not count toward the hand limit.
- Six consonant slots are counted. After a guess, finite used consonants leave
  and the game draws only until those six counted slots are filled.
- The round thresholds are cumulative-score gates. Solving the fixed secret is
  necessary, but the run also ends if total score is below that round's gate.
- A consonant becomes unlimited for the rest of the round as soon as it is
  yellow or green. It occupies one counted hand slot and displays an infinity
  badge. Vowels are unlimited from the start and occupy no counted slots.
- Hand cards are grouped by letter. Each row sorts green first, then yellow,
  unused grey, and absent red; letters are alphabetical within each group.
- A quest is offered on guesses 3 and 6 by default, on guesses 2, 4, and 6 after
  one cadence upgrade, and on every guess after the second cadence upgrade.
- A quest reward earned on a successful final guess is banked and activated at
  the start of the next round so it is not wasted.

## Browser smoke checklist

1. On the landing menu, open Multiplayer and confirm Play with a Friend, Ranked,
   and My Games are present. Open Single Player and confirm Campaign and Cuddle
   are present. Confirm each child screen's top-level Back button returns to its
   parent hub.
2. Open Cuddle and start a new run. Confirm no visible activity log appears.
3. Confirm A, E, I, O, and U remain in the top row and consonants remain below.
   In each row, verify green, yellow, unused grey, then absent red ordering, with
   alphabetical ordering within each color. Q must display as Q, not QU.
4. Build words only by clicking cards; no physical keyboard input is registered.
5. Verify unlimited vowels, unlimited yellow/green consonants, refill-to-six
   counted draws, grouped duplicate cards, mulligans, and grey-card recycling.
6. In regular Secretkeeper play, confirm hollow and filled stars have the same
   visible outside size.
7. Complete the third-guess quest, refresh reward choices when upgraded, and
   verify `freezeSecret` is never offered.
8. Solve a round, choose an upgrade, cross a 50-point boundary, and confirm the
   extra milestone choice.
9. Refresh the page and continue the saved run.
