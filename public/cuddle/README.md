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
- `public/cuddle/cuddle-ui.js` — card-only UI with an alphabetized, grouped,
  feedback-colored six-slot consonant hand, five free unlimited vowels, and unlimited positive letters; a collapsed-by-default run-details panel; and the
  `#cuddleBtn` menu hook.
- `public/cuddle/cuddle.css` — isolated responsive styling.
- `public/cuddle/allowed-secrets.txt` — a public copy derived at patch time from
  the existing server secret list. Q is copied as a normal one-letter card because U is always available.

Only `public/index.html` is edited. Four clearly marked blocks add the stylesheet,
main-menu button, empty screen mount, and script references. Re-running the patch
replaces those blocks rather than duplicating them.

## Rule interpretations made explicit

- A mulligan replaces 1 to 3 cards by default; "Bigger Mulligan" raises that
  maximum by one, up to five cards.
- Q is a normal one-letter card. A, E, I, O, and U are always available as unlimited cards and do not count toward the hand limit. Six consonant slots are counted; after a guess, finite used cards leave and only those counted slots refill.
- The round thresholds are cumulative-score gates. Solving the fixed secret is
  necessary, but the run also ends if total score is below that round's gate.
- A consonant becomes unlimited for the rest of the round as soon as it is yellow or green. It occupies one counted hand slot, shows an infinity badge, and may be selected repeatedly. Vowels are unlimited from the start and occupy no counted slots. Yellow tiles score points; grey tiles cost one point.
- Hand cards are grouped by letter and sorted alphabetically. Their colors show the best known result: green, yellow, neutral grey when unused, or red when confirmed absent. Duplicate finite cards use a count badge; unlimited positive cards use an infinity badge.
- A quest is offered on guesses 3 and 6 by default, on guesses 2, 4, and 6 after
  one cadence upgrade, and on every guess after the second cadence upgrade.
- A quest reward earned on a successful final guess is banked and activated at
  the start of the next round so it is not wasted.

## Browser smoke checklist

1. Open **Cuddle** from the main menu and start a new run.
2. Confirm A, E, I, O, and U are all present with infinity badges and that six consonant cards fill the counted hand.
3. Build words only by clicking cards; no physical keyboard input is registered.
4. Verify free unlimited vowels, unlimited yellow/green consonants, refill-to-six counted draws, grouped duplicate cards, mulligans, and grey-card recycling.
5. Complete the third-guess quest, refresh its reward choices when upgraded, and
   verify `freezeSecret` is never offered.
6. Solve a round, choose an upgrade, cross a 50-point boundary, and confirm the
   extra milestone choice.
7. Refresh the page and continue the saved run.
