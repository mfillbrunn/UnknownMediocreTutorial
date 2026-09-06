# Cuddle Coach Expansion

This cumulative patch adds the requested helper progression, boss preparation shop, Cuddle Meter, unused-row money, and new boss rewards to **UnknownMediocreTutorial**. It includes the earlier Cuddle Money Mode files, so it can be applied either to a checkout that already has the first patch or to a compatible checkout without it.

## Files installed

- `public/cuddle/cuddle-money-mode.js`
- `public/cuddle/cuddle-money-mode.css`
- `public/cuddle/cuddle-coach-expansion.js`
- `public/cuddle/cuddle-coach-expansion.css`
- `docs/CUDDLE_MONEY_MODE.md`
- `docs/CUDDLE_COACH_EXPANSION.md`
- `docs/CUDDLE_HARDER_WORDLE_IDEAS.md`

The patch also updates the Cuddle script/style includes in `public/index.html` and preserves the first boss before round 3.

## Apply from VS Code

Place `patch_cuddle_coach_expansion.py` in:

```text
C:\Users\T-Dawg\Downloads
```

Preview:

```powershell
py -3 "C:\Users\T-Dawg\Downloads\patch_cuddle_coach_expansion.py" `
  --repo "C:\Users\T-Dawg\vswordle\UnknownMediocreTutorial" `
  --dry-run
```

Apply:

```powershell
py -3 "C:\Users\T-Dawg\Downloads\patch_cuddle_coach_expansion.py" `
  --repo "C:\Users\T-Dawg\vswordle\UnknownMediocreTutorial"
```

Start the app:

```powershell
cd "C:\Users\T-Dawg\vswordle\UnknownMediocreTutorial"
npm install
npm start
```

Use a new Cuddle run for the cleanest test of the Starting Bonus and all round-timing changes.

## Undo

```powershell
py -3 "C:\Users\T-Dawg\Downloads\patch_cuddle_coach_expansion.py" `
  --repo "C:\Users\T-Dawg\vswordle\UnknownMediocreTutorial" `
  --undo
```

The patch creates timestamped backups in:

```text
.cuddle_coach_expansion_backups
```

## Between-round permanent rewards

### Remaining Setter Box

Unlocks an exact **Possible Answers** count beside the board. The counter is based on the current secret pool and every trustworthy clue received so far.

It understands duplicate letters and respects boss information rules:

- normal green, yellow, and grey feedback is applied exactly;
- count-only feedback filters by the visible green/yellow totals;
- blue feedback means present but does not assume the shown position is green;
- hidden positions are not inferred;
- delayed clues are used only after they become visible;
- fake-feedback rows are ignored.

The box is locked until the reward is selected or purchased as a permanent shop upgrade.

### Guesser Hint

Unlocks one recurring hint charge per eligible round. Using it reveals one exact correct letter and position, matching the Cuddle/Guesser Quest `revealLocation` behavior.

The reward stacks to four recurring hints per round. An armed **Reward Echo** also works with these custom rewards: it repeats the selected effect up to two additional times without adding duplicate history entries, stopping at that reward's cap. The expansion tracks:

- total hints used;
- total letters revealed by hints;
- number of rounds in which at least one hint was used;
- current charges;
- recurring hints per round;
- the round at which hints become available.

A Guesser Hint is guaranteed in the normal reward offer after round 3 when the player has not already unlocked one.

### Earlier Hints

Moves hint availability earlier, down to round 1. When selected before any Guesser Hint has been obtained, it also unlocks the first recurring hint and schedules it for the next numbered round. Later stacks continue moving the permanent start one round earlier.

### Softer Cuddle Meter

Reduces the meter requirement by three visible grey tiles per stack:

```text
12 -> 9 -> 6 -> 3
```

### Bigger Cuddle

Improves the full-meter reward in a fixed order:

```text
Free mulligan -> Joker -> Free letter -> Extra row
```

Each selection moves the reward up exactly one tier.

## Cuddle Meter

The meter is shown as a small grey heart on the play screen carrying the number of visible grey tiles still needed. It counts **down** to zero; when it reaches zero the heart briefly names what the fill granted (`+1 mulligan`, `+1 joker`, `free letter`, `+1 row`) and then settles back to the next requirement. It no longer appears as a progress card in the coach panel or as a detail badge in the round summary — the running totals stay under **Coach statistics** (Greys collected / Meter fills).

The meter fills from **visible grey feedback tiles**. Its default requirement is 12. Progress carries between rounds and overflow is retained after the meter fills.

Hidden tiles do not count until they are actually revealed. This includes delayed feedback: when an old row becomes visible later, its newly visible greys are counted then. Fake grey feedback is still a visible grey and therefore comforts the meter, even though it is not trusted by Possible Answers.

A reward earned after a solved row is not lost:

- mulligans can be banked for the next round;
- free-letter reveals can be banked;
- extra rows can be banked;
- an extra-row reward triggered on the final failed guess immediately opens a rescue row.

## Shop design

The existing shop is expanded into two categories.

### One-use supplies for the next boss

| Item | Cost | Effect |
|---|---:|---|
| Boss Breathing Room | $26 | Adds one row to the next boss round. |
| Opening Green | $35 | Reveals one exact correct letter and position when the next boss begins. |
| Ten-Letter Cull | $24 | Removes ten consonants that are not in the answer from the usable pool for the next boss. |
| Regular Wordle Hands | $28 | Gives unlimited mulligans during the next boss and bypasses a no-mulligan boss rule. |
| Theme Bundle | $16 | Reveals up to three available solution themes for the next boss. |
| Quest Autopilot | $24 | Ensures every boss guess has a quest and makes that quest complete automatically. |
| Double Quest Rewards | $24 | Gives two reward picks whenever a quest completes during the next boss. |
| Boss Reroll | $18 | At the next boss-choice screen, discards both opponents and draws a new pair. |

Except for Boss Reroll, supplies remain in inventory until a boss round actually begins. Normal rounds do not consume them. Boss Reroll remains stored until the player presses its button on a boss-choice screen.

Ten-Letter Cull also filters newly generated base-deck letters, so an Extra Letters-style effect cannot put a culled consonant back into that boss round.

### Permanent run upgrades

The shop can also sell permanent copies of:

- Remaining Setter Box;
- Guesser Hint;
- Earlier Hints;
- Softer Cuddle Meter;
- Bigger Cuddle.

“Permanent” means for the current Cuddle run and save, consistent with the campaign's existing upgrade model.

## Unused-row money

For every unused solution row in a solved, non-boss round, the payout is:

```text
5 * current green-tile money + current unused-solve money
```

With the base values of $2 per green and $10 for the existing unused-solve value, that is $20 per unused row before upgrades.

The expansion replaces the old single early-solve amount rather than adding the full amount on top of it. This prevents accidental double payment. Each unused row appears as its own golden `BONUS` row in the end-of-round money animation.

Boss rounds remain pass/fail and do not pay normal row money.

## New boss rewards

### Golden Compass

Once per round, reveals the most useful untested letter across all trustworthy remaining candidates, plus the percentage of candidates containing it. It does not reveal the letter's position.

### Second Cup

Once per run, when the final row would fail, automatically opens one rescue row. The charge is spent only when the rescue is needed.

### Golden Thread

When a complete five-letter draft contains at least one answer letter that has not yet been learned, the board pulses. On devices that support the browser vibration API, it also performs a short vibration pattern. It does not identify which letter triggered it.

The three rewards are added to the boss reward pool. One can also appear as a Starting Bonus because the opening selection is drawn from the same expanded reward book.

## Starting Bonus wording

The opening selection now uses:

```text
STARTING BONUS
Choose your Starting Bonus!
Choose one permanent bonus before your first Wordle.
```

It is no longer presented as a “free boss reward.”

## Saved-run compatibility

Expansion data is stored under:

```javascript
state.cuddleCoachExpansion
```

Existing Cuddle state fields are retained. Loading an older save creates missing expansion fields with safe defaults. Starting a new run resets expansion inventory and statistics for that run.

## Primary tuning locations

Open:

```text
public/cuddle/cuddle-coach-expansion.js
```

Near the top:

- `BASE_METER_THRESHOLD` controls the default 12-grey requirement.
- `MIN_METER_THRESHOLD` controls the minimum after upgrades.
- `UPGRADE_DEFINITIONS` controls stack limits and reward text.
- `SHOP_ITEMS` controls item costs and descriptions.
- `BOSS_REWARDS` controls the new boss reward descriptions.

## Manual test checklist

1. Start a new run and confirm the overlay says **Starting Bonus**, not boss reward.
2. Solve round 1 and verify Remaining Setter Box can appear as an in-between reward.
3. Unlock the box and confirm Possible Answers updates after each trustworthy clue.
4. Reach the ordinary reward after round 3 without a hint and confirm Guesser Hint is one of the choices.
5. Select multiple Guesser Hint rewards and confirm multiple charges appear each eligible round.
6. Select Earlier Hints before Guesser Hint and confirm it grants the first recurring hint for the next numbered round, then lowers the permanent start on later stacks.
7. Submit visible grey tiles until the heart chip counts down to zero; confirm it flashes the granted reward and then resets to the next requirement, and test each reward tier and threshold stack.
8. Buy each boss supply, play a normal round, and confirm it remains stored until the boss starts.
9. Test Ten-Letter Cull with a draw or bonus-letter reward and confirm culled letters stay unavailable.
10. Test Quest Autopilot and Double Quest Rewards separately and together.
11. Use Boss Reroll and confirm both offered opponents change while the current boss stage is preserved.
12. Solve with unused rows and confirm every unused row receives its own golden money increment.
13. Earn Golden Compass, Second Cup, and Golden Thread and test each behavior.
14. Reload the page during a run and confirm inventory, upgrades, hint statistics, and meter progress survive.
15. Enable reduced motion and confirm Golden Thread and payout effects remain readable without heavy animation.
