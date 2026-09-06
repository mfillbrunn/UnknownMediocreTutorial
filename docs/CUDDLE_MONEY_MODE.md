# Cuddle Money Mode patch

This patch changes only the Cuddle single-player campaign. It keeps the engine's existing `state.score` field internally so old saves, shops, milestones, and upgrades keep working, but the interface treats that value as spendable **money**.

## What is included

- Normal rounds advance when the Wordle is solved. Cumulative score thresholds no longer decide whether a solved round passes.
- The score display becomes a dollar wallet. Existing tile, early-solve, mulligan, quest, and other bonuses still feed the wallet.
- After a solved normal round, a cash-out overlay steps through every submitted row. Each row receives a gold increment and the wallet counts upward before the round total appears.
- Every new run begins with a **Starting Bonus** choice drawn from three randomly selected permanent rewards; one choice is free.
- Boss I now gates round 3, so it happens after round 2 and the round-2 shop. The later gates remain before rounds 7 and 10, followed by the final boss.
- Optional mini-challenges can appear before non-boss rounds beginning with round 2. The player accepts or declines before play starts. Accepted challenges pay bonus money only when the Wordle is solved.
- Mini-challenges never stack on top of a real boss.
- Existing Cuddle saves are preserved. Starting a fresh run is recommended for seeing the Starting Bonus and the new first-boss timing cleanly.

## Implemented mini-challenges

| Challenge | Rule | Base bonus |
|---|---|---:|
| Pocket Tally | First two guesses show only the total green/yellow counts, not positions. | $16 |
| Fogged Slot | One feedback position is hidden for the first two guesses. | $12 |
| Blue Haze | Green and yellow are merged into blue for the first two guesses. | $14 |
| One Little Lie | One tile on the opening row is a lie, but the whole row's colors are hidden so it can't be picked out. | $10 |
| Locked Opener | No mulligan before the first submitted guess. | $8 |
| Five-Guess Sprint | One fewer guess than normal, never fewer than four. | $18 |
| Vowel Budget | At most two vowels in each of the first two guesses. | $10 |
| Clean Letters | The opening guess must contain five different letters. | $9 |
| Quick Start | Fifty seconds for each of the first two guesses; a timeout spends that guess. | $15 |

The final offer value grows by $2 per round after round 1, with a small Medium/Hard difficulty premium.

## Main tuning knobs

Open `public/cuddle/cuddle-money-mode.js` and edit the `CONFIG` object near the top:

```js
var CONFIG = Object.freeze({
  challengeChance: Object.freeze({ easy: 0.40, medium: 0.46, hard: 0.52 }),
  challengePityAfterMisses: 2,
  rewardPerCompletedRound: 2,
  difficultyRewardBonus: Object.freeze({ easy: 0, medium: 2, hard: 4 }),
  minimumGuessCap: 4,
  payoutRowPauseMs: 250,
  payoutBankDurationMs: 430,
  payoutCoinCount: 24
});
```

`challengePityAfterMisses: 2` means that after two consecutive eligible rounds without an offer, the following eligible round is guaranteed an offer.

To tune one challenge, edit its object in the `CHALLENGES` array. `baseReward` is its starting bounty, `turns` is the number of early guesses affected, and fields such as `limit` or `seconds` configure that particular effect.

## More challenge ideas

The strongest additions are rules that create a new decision without making a hand impossible. Before offering a word-shape restriction, use `game.getFeasibleWords()` to verify that at least one legal word can satisfy it.

### Feedback twists

1. **Delayed Peek — $12:** Hide the first row's feedback, then reveal it immediately after the second guess. This is a gentler version of a delayed-feedback boss.
2. **Odd Tiles — $10:** On the opening guess, reveal only positions 1, 3, and 5; mask positions 2 and 4.
3. **Warm/Cold — $13:** For two guesses, show only whether the row contains at least two useful tiles, not exact counts or positions.
4. **Shuffled Clues — $15:** The opening row shows the correct number of green/yellow/grey tiles, but their displayed positions are shuffled. Do not teach positional knowledge from that row.
5. **Second Look — $11:** Feedback appears normally for one second, then becomes hidden until the next guess. This tests memory rather than luck.
6. **Silent Grey — $9:** For two guesses, green and yellow appear normally but grey tiles remain visually blank.

### Guess-building rules

7. **Yellow Relay — $10:** The next guess must contain at least one currently known yellow letter. Only activate after the player has a yellow.
8. **Green Promise — $12:** A known green must stay in that position on the next guess. This is one-turn hard mode rather than a whole-round restriction.
9. **No Grey Reuse — $11:** The second guess may not reuse a letter confirmed grey on the first row.
10. **Echo Two — $10:** The second guess must reuse exactly two distinct letters from the first guess.
11. **Fresh Start — $8:** The opening word may contain no repeated letters and must include at least one consonant from the finite hand.
12. **Vowel Target — $9:** The opening word must contain exactly two vowels, offered only when a feasible opener exists.
13. **Edge Lock — $7:** The opening word's first and last letters must be different.
14. **Alphabet District — $9:** Randomly choose A-I, J-R, or S-Z; the opener must include at least one letter from that district.
15. **Double Agent — $13:** One of the first two guesses must contain a doubled letter. Check feasible words before offering.
16. **Consonant Rush — $11:** The opening word may contain at most one vowel.

### Hand and resource pressure

17. **Tiny Trade — $8:** The player starts with one fewer mulligan for this round only.
18. **Expensive Mulligan — $12:** Mulligans remain available, but each used mulligan removes $4 from the challenge bounty.
19. **Mystery Card — $12:** Hide the face of one finite hand card until it is selected; preserve its accessible label for screen readers.
20. **Heavy Card — $10:** Mark one finite hand card. The player earns the bounty only if that letter appears in a submitted guess.
21. **No Free U — $14:** U temporarily occupies a counted slot instead of being an unlimited vowel. Offer only when the hand remains viable.
22. **Three-Card Opener — $12:** The opening word must be composed from at most three distinct hand-card glyphs, so repeats become strategically useful.
23. **Save One — $9:** Finish the round with at least one mulligan remaining.
24. **Clean Sweep — $14:** Finish without using any mulligans.

### Risk choices and combos

25. **Choose Your Fog:** Before accepting, choose one hidden position for +$8 or two hidden positions for +$16.
26. **Bounty Ladder:** Accept a safe $10 modifier or press once to reveal a random harder $20 modifier. The second result must be accepted.
27. **Double Feature:** Combine two lightweight rules, such as Locked Opener plus Odd Tiles, for 1.6 times their combined base bounty.
28. **Cash Out Early:** After guess 3, let the player lock in half the challenge bounty; continuing keeps the full bounty at risk.
29. **Perfect Window:** Pay $8 for solving normally, plus another $8 when solved within the challenge's first three guesses.
30. **Comeback Contract:** Offer only after a failed challenge; the next accepted mini-boss pays 1.5 times its normal bounty.

## Suggested implementation pattern

For a feedback-only challenge, add a definition to `CHALLENGES` and handle its `effect` inside the `_applyBossFeedback` wrapper. Return separate `shown` and `learn` arrays so hidden or misleading colors do not accidentally update the player's known-letter state.

For a word-shape rule, add validation in `challengeValidationError()`. Return a friendly message instead of consuming the guess.

For a round-resource rule, apply it once in `acceptChallenge()` and store any original value on the challenge object if it must be restored later.

For a completion condition such as “keep one mulligan,” check it in the solved branch of `submitCuddleMoneyDraft()` before awarding `challenge.reward`.

## Manual test checklist

1. Start a new Easy, Medium, or Hard Cuddle run and confirm the Starting Bonus picker appears before play.
2. Complete rounds 1 and 2, visit the shop, and confirm Boss I appears before round 3.
3. Solve a round with money below the former target and confirm progression still succeeds.
4. Solve a round and confirm every history row receives a visible gold increment before the total and Collect button appear.
5. Accept, decline, win, and fail several mini-challenges. Confirm the bonus is paid only on a win.
6. Reload during a run and confirm the wallet, accepted challenge, boss gates, and campaign map survive.
7. Verify shops still deduct from the same wallet and never determine whether a solved round passes.
8. Turn on reduced-motion at the operating-system level and confirm the payout becomes fast rather than trapping the player in a long animation.
