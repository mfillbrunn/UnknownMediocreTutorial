# Ways to Make Cuddle Wordles Harder Without Making Them Miserable

The most enjoyable difficulty modifiers create a decision, hide a limited amount of information, or ask the player to manage a resource. Avoid rules that can silently make the round impossible. Before offering a word-building restriction, filter `game.getFeasibleWords()` and confirm that at least one legal guess can satisfy it.

## Best candidates to implement first

### 1. Feedback Tax

After each of the first two guesses, the player chooses one tile whose feedback will remain visible. The other four fade after a few seconds.

Why it works: the player controls what to remember, so it feels strategic rather than arbitrary.

### 2. Two-Step Intel

The first guess shows only the number of colored tiles. After guess two, the first row's exact colors appear.

Why it works: this is a gentler combination of Count Only and Delayed Feedback.

### 3. Moving Fog

Hide one feedback position on guess one and a different position on guess two. Never hide the same column twice.

Why it works: it creates uncertainty without permanently erasing an entire column.

### 4. Grey Echo

For the next guess, one confirmed-grey letter remains in the hand as a tempting decoy. Using it is allowed but reduces the challenge reward.

Why it works: it creates a risk/reward choice instead of a hard prohibition.

### 5. Narrow Hand

Temporarily reduce the counted consonant hand by one card, but guarantee that at least one feasible guess remains buildable.

Why it works: it emphasizes Cuddle's card-hand identity rather than copying ordinary Wordle restrictions.

### 6. One-Way Mulligan

A mulligan can be used only once during the challenge, but it replaces up to five cards.

Why it works: the player must decide when to make one powerful redraw.

### 7. Exact Change

The next guess must reuse exactly two distinct letters from the previous guess.

Why it works: it forces a balanced information guess without dictating the actual word.

### 8. Yellow Migration

Choose one known yellow letter. The next valid guess must use it in a position it has not occupied before.

Why it works: it reinforces Wordle reasoning and feels fair because it follows known information.

### 9. Green Anchor

One known green is locked into the draft. The remaining four positions must be built around it.

Why it works: it changes hand construction but does not contradict a true clue.

### 10. Low-Information Bounty

The player accepts a bonus for solving after an opening guess chosen from a short list of statistically weaker but still legal words.

Why it works: the difficulty is voluntary and transparent.

## Feedback modifiers

### Odd Window

For the first guess, reveal only positions 1, 3, and 5. Positions 2 and 4 reveal after the next guess.

### Warm or Cold

For two guesses, show only whether the row has at least two colored tiles. Do not reveal exact totals or positions.

### Color Budget

The first row reveals at most two colored tiles. Any additional colored feedback is delayed until after guess two.

### Spotlight

Before submitting, the player selects one column. Only that column's exact feedback is guaranteed; the rest displays count-only information.

### Inverted Memory

Feedback is shown normally for three seconds and then flips face-down. It becomes visible again on the results screen.

### Shuffled Intel

Show the correct counts of green, yellow, and grey, but shuffle their displayed positions. Mark the row clearly as shuffled so the player never mistakes it for normal feedback.

### Silent Greys

Green and yellow display normally, while grey tiles remain blank for the first two guesses. Grey cards should not be taught to the knowledge system until the effect ends.

### Delayed Column

Randomly select one column at round start. That column's feedback is revealed one guess late throughout the round.

## Guess-building rules

### Fresh Four

The second guess must test at least four letters not used in the opening guess.

### Echo Two

The second guess must reuse exactly two distinct opening letters.

### Vowel Contract

The next guess must contain exactly two distinct vowels. Offer only when a feasible word exists.

### Consonant Rush

The opening word may contain at most one vowel.

### Double Agent

One of the first two guesses must contain a repeated letter. The player decides which one.

### Edge Lock

The first and fifth letters of the next guess must differ from those positions in the previous guess.

### Alphabet District

Choose `A-I`, `J-R`, or `S-Z`; the next guess must include one letter from that district.

### No Grey Reuse

The next guess cannot use a confirmed-grey letter. Make this a one-turn rule rather than permanent hard mode.

### Hold the Clues

For one guess, all known green positions and all known yellow letters must be honored. Correct duplicate-letter minimums and maximums are essential.

### Three-Card Opener

The opening word may use no more than three distinct finite hand cards. Repeated letters and free vowels become more valuable.

## Resource pressure

### Expensive Mulligan

Mulligans remain available, but each one reduces the accepted challenge bounty by a fixed amount.

### Borrowed Row

Begin with one fewer row. Completing a quest during the round earns it back.

### Fragile Joker

Give a free Joker at round start, but it expires after guess two.

### Locked Pocket

Randomly lock one finite card until the player submits a guess using four other distinct letters.

### Interest Payment

The challenge gives money immediately, but failing its side objective costs only that advance—not the whole Wordle run.

### Streak Meter

Every guess that obeys a temporary hard-mode rule raises a bounty multiplier. Breaking the rule resets the multiplier but does not invalidate the guess.

### Cuddle Drain

The Cuddle Meter starts partly empty or requires three extra greys for this round. Pay a worthwhile bounty because this affects a helpful long-term resource.

## Time pressure that remains accessible

### Thinking Clock

A 45-second clock begins only after the first card is selected, not at round start.

### Banked Time

Give 90 seconds total for the first two guesses. Unused time from guess one carries to guess two.

### Pause Token

A timed challenge includes one player-controlled ten-second pause.

### Decision Clock

Only mulligan and submit decisions are timed; inspecting prior clues is not.

### Quick Draft

The timer stops once a valid five-letter draft is complete, allowing the player to review before submission.

Timers should pause when the browser tab is hidden and should have a reduced-pressure accessibility setting.

## Candidate-pool difficulty

### Crowded Neighborhood

Prefer secrets with many close alternatives, such as words sharing four letters or a common `_IGHT`, `_OUND`, or `S_A_E` frame.

### Duplicate Trouble

Increase the chance of answers with exactly one repeated letter. Announce this as a chapter trait rather than hiding the distribution change.

### Rare Placement

Prefer ordinary letters in unusual positions rather than simply choosing obscure words.

### False Friend Set

Choose a secret from a hand-curated family of five to ten similar answers. Display the family size before the round.

### Anti-Opener

Select an answer that tends to leave a large candidate set after the player's most frequently used opener. Use this sparingly and disclose it as a special boss trait.

### Theme Decoy

Reveal two themes: one true and one plausible decoy. Clearly label that exactly one is true.

## Boss concepts

### The Archivist

Previous feedback rows fade, but the player may pin one row permanently. Golden Thread and hints still work.

### The Tollkeeper

The player can buy normal feedback one tile at a time with money earned during the fight. At least one tile per row is free.

### The Mimic

Copies one lightweight modifier from the previous mini-challenge, giving the campaign a sense of continuity.

### The Gardener

Greys fill the Cuddle Meter only half as quickly, while greens count as bonus meter progress. This changes incentives without disabling the meter.

### The Mirror

The first two rows render right-to-left. Keyboard input and underlying positions remain normal; include strong column labels for accessibility.

### The Collector

After every guess, one unused hand card is temporarily set aside. A successful quest returns all collected cards.

### The Gambler

Before each guess, offer a choice: normal feedback, or masked feedback with a growing cash multiplier.

### The Locksmith

One column is locked. Complete a mini-objective—such as using five distinct letters—to unlock its feedback.

### The Conductor

Each guess gets a rhythm rule: five unique letters, exactly two vowels, reuse a yellow, then honor hard mode. Generate only rules with feasible words.

### The Cartographer

Feedback gives relative information: a yellow arrow indicates that a present letter belongs somewhere left or right of its guessed position.

## Voluntary difficulty contracts

These can appear before a round alongside Accept/Decline and pay extra money.

- **Clean Sweep:** solve without mulligans.
- **No Help Needed:** solve without Guesser Hints or Golden Compass.
- **Four-Row Contract:** solve with two rows still unused.
- **Information Hunter:** reduce the candidate pool by at least 80% with one guess.
- **Fresh Five:** submit one guess using five previously untested letters.
- **Yellow Rescue:** correctly reposition two known yellow letters in one guess.
- **Precision Play:** every guess after the first must obey all trustworthy clues.
- **Budget Solver:** spend no more than a displayed amount in the round.
- **Scout Then Strike:** play a high-coverage guess and then solve immediately on the next row.
- **Cuddleless:** solve before the Cuddle Meter fills.

## Difficulty safeguards

1. Run a feasibility check before offering any guess-building rule.
2. Never combine two modifiers that can contradict each other unless the combined candidate set is verified.
3. Keep fake feedback visually distinct from trustworthy clues.
4. Never update `knownPresent`, `knownAbsent`, or exact positions from hidden or false feedback.
5. Give timed modes a pause/hidden-tab safeguard.
6. Let players decline optional contracts without a penalty.
7. Make a harder modifier pay enough money to justify the risk.
8. Limit direct row loss to one row except for late-game bosses.
9. Prefer one meaningful rule for two guesses over five small rules for a whole round.
10. Track acceptance, completion, failure, and solve rate per modifier so weak designs can be rebalanced.

## Recommended difficulty ladder

### Early campaign

Use one-turn construction rules and partial feedback masks. Avoid reduced rows.

### Middle campaign

Combine a light information rule with a resource decision, such as Moving Fog plus one powerful mulligan.

### Late campaign

Use candidate-family pressure, temporary hard mode, or a reduced row paired with an earn-back objective.

### Final boss

Use a sequence of changing but individually simple rules. The player should understand the current rule at a glance and always have at least one feasible action.
