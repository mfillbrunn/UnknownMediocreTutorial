# Competitive Wordle refinement v5

Implement this specification completely against the repository state that is currently checked out. Do not reapply an obsolete v3/v4 patch by matching old line numbers. Inspect the current implementation first, identify the canonical source of each behavior, and edit that source.

Preserve unrelated user changes. Do not stop after describing a plan. Run the relevant tests and report exact files changed.

## 1. Visual direction and button translucency

The user said the buttons should be "to a good degree be see-through." Interpret that as **more translucent**, not more visually solid.

- Use alpha in the background color, not `opacity` on the whole control. Text, icons, focus rings, and hit targets must remain fully opaque.
- Use a restrained translucent range appropriate to the moonlit indigo background, approximately 0.52–0.68 at rest and slightly more opaque on hover/active.
- Keep contrast at WCAG AA for normal text.
- Retain the existing muted indigo / dusty rose visual language.
- Avoid gradients, neon glows, excessive shadows, glass-card nesting, and decorative pills.
- Disabled controls may be greyed, but must remain legible.
- Apply this consistently to menu, modal, summary, tutorial, header, and reward controls without changing Wordle tiles or other game-state cells into translucent buttons.

Create or reuse design tokens rather than repeating literal colors:
- general game/header surface
- elevated surface
- translucent control surface
- control hover surface
- border
- text
- muted text
- guesser accent
- setter accent
- easy / medium / hard accents

## 2. Star system: authoritative server behavior and matching client preview

Change the setter star model as follows:

- Any outcome that awarded 0 stars before remains 0 unless another existing rule explicitly guarantees a star.
- Outcomes that previously awarded 1 base star still award 1 base star.
- Outcomes that previously awarded 2 or 3 base stars now award exactly 2 base stars.
- The bonus star is the **only** mechanism that can make a total reach 3.
- Total stars remain capped at 3.
- Keep the bonus-star eligibility rule itself unchanged unless another item below overrides it.

Use one canonical helper or domain service shared by all server award paths. Avoid having separate threshold logic in preview, persistence, AI, and human-setter paths. The server is authoritative. The client preview must consume the same result or mirror it through a small explicitly tested pure function.

The intended normalization is:

```text
old base 0 -> new base 0
old base 1 -> new base 1
old base 2 -> new base 2
old base 3 -> new base 2

total = min(3, new base + eligible bonus star)
```

Required test matrix:

| Previous base | Bonus | Expected total |
|---:|:---:|---:|
| 0 | no | 0 |
| 1 | no | 1 |
| 1 | yes | 2 |
| 2 | no | 2 |
| 2 | yes | 3 |
| 3 | no | 2 |
| 3 | yes | 3 |

Update:
- server calculation
- client preview
- star animation/fill state
- round history and summary data
- tutorial/rules wording
- any AI-setter path
- analytics/stat aggregation only if it derives stars separately

Do not reinterpret a base two-star result as a bonus star. Persist base and bonus separately where the current schema permits it.

## 3. Hidden Guess interaction

When Hidden Guess is active for the setter decision:

- A valid setter submission awards exactly 1 total star whether the setter keeps the current secret or changes to another valid secret.
- Hidden Guess suppresses all additional base stars.
- Hidden Guess suppresses the bonus star.
- Invalid submissions still follow existing validation and award nothing.
- The server and preview must agree.
- Clear the Hidden Guess turn flag through the existing round/turn cleanup path so it cannot leak to a later decision.

Required tests:

```text
hidden + keep + otherwise 1-star + bonus eligible -> 1
hidden + change + otherwise 2-star + bonus eligible -> 1
hidden + change + otherwise 3-star + bonus eligible -> 1
hidden + invalid submission -> 0
next normal setter decision after hidden cleanup -> normal rules
```

## 4. Reward selection is currently broken

Reproduce the failure before changing code. Fix the root cause rather than masking it with CSS.

Inspect the current reward chooser end to end:
- card rendering
- click and keyboard event binding
- disabled/inert state
- overlays and `pointer-events`
- offer/reward IDs
- socket request and acknowledgement
- stale offer handling
- error recovery
- reroll/refresh flow
- server validation and application

Requirements:

1. Each selectable reward is a real button or has an accessible button inside it.
2. The clickable element owns stable `data-offer-id` and `data-reward-id` values.
3. Decorative icon, sheen, rarity, and description layers must use `pointer-events: none`; they must not intercept the click.
4. Register the selection listener once. Prefer delegated handling on the chooser container and clean it up when the chooser closes.
5. Extract and validate IDs before setting an in-flight/disabled state.
6. Disable the choices only after a valid selection has been initiated.
7. Include room/game/round/offer identifiers in the request as supported by the current protocol.
8. Ignore stale acknowledgements from old offers.
9. On server rejection, socket error, timeout, or application failure, clear the in-flight state and re-enable the still-current offer.
10. On success, close the chooser exactly once and apply the reward exactly once.
11. Keyboard Enter and Space must work.
12. Refresh Choices must generate a new offer ID; an acknowledgement from the old offer cannot select a card from the new offer.
13. Do not use a full-card pseudo-element that sits above the button hit target.

Add regression tests for:
- selecting each visible card by click
- keyboard selection
- successful acknowledgement
- rejection followed by a successful retry
- double-click deduplication
- refreshed offer rejecting an old acknowledgement
- opponent and player reward application where both paths exist

## 5. Remove Bet Miss from reward offers

Search case-insensitively for all spellings and identifiers, including likely forms such as:
- `betmiss`
- `betMiss`
- `BET_MISS`
- display text `Bet Miss`

Remove it from:
- reward registries exposed to selection
- rarity/category pools
- random offer generation
- deterministic Daily Challenge offer generation
- tutorial/rules reward lists
- client card metadata
- tests or fixtures that expect it to be offered

For backward compatibility, the server may retain a guarded handler capable of resolving an already-active legacy game, but no new normal, AI, tutorial, or Daily Challenge offer may contain it.

Add a test that enumerates every offer pool/mode/tier and proves Bet Miss cannot be generated.

## 6. Header surfaces

Every screen header must use the same background surface as the general game.

- Remove setter-specific and guesser-specific header background fills.
- Role color may remain as a restrained accent on an icon, small border, text label, or focus ring.
- This applies to desktop, mobile, tutorial, reward, summary, AI, and Daily Challenge states.
- Consolidate this into one canonical header rule/token rather than overriding it in multiple role selectors.
- Check pseudo-elements and media-query overrides for residual role fills.

## 7. Stop automatic zooming/scrolling to the guesser feedback row

Reproduce the issue and trace all possible causes:
- `scrollIntoView`
- `window.scrollTo`
- element `.focus()`
- `autofocus`
- hash navigation
- DOM replacement
- sticky positioning
- scroll anchoring
- modal focus restoration

After feedback is submitted/rendered, the page must preserve the user's scroll position. It must not jump to or lock onto the top feedback row.

Implementation guidance:
- Remove nonessential automatic scrolling.
- Where focus is required for keyboard play, use `focus({ preventScroll: true })`.
- Do not continuously restore scroll position or otherwise lock user scrolling.
- Use `overflow-anchor` only on the specific dynamic region if browser scroll anchoring is the cause.
- Do not disable normal user scrolling.

Add an integration/browser test where possible:
1. place the viewport at a known nonzero scroll position;
2. submit or receive guesser feedback;
3. wait for all animations/rendering;
4. assert the viewport position is unchanged within a small tolerance;
5. assert the user can then manually scroll.

## 8. Replace the Guess Again popup with a subtle turn indicator

Remove the large/blocking Guess Again popup.

At the same event that currently opens it:
- show one nonblocking role-color sheen that travels across the game viewport;
- optionally pair it with a small, short-lived `Guess again` badge;
- use `pointer-events: none`;
- do not move focus;
- do not alter scroll position;
- do not block gameplay;
- do not stack duplicate indicators;
- run once, then remove/reset cleanly;
- keep the animation restrained, approximately 0.8–1.2 seconds for the pass and no long persistent overlay;
- use a static brief fade under `prefers-reduced-motion: reduce`;
- retain an `aria-live="polite"` announcement so the turn change is not color-only.

Use the active role's accent color without changing the header background.

## 9. Quest highlight controls visible by default

The highlight controls that belong to a quest must be present on the quest badge by default.

- Do not require clicking the badge to reveal them.
- Remove the badge click-to-expand dependency and any hidden/collapsed default CSS.
- Keep selected, disabled, and unavailable states explicit.
- Buttons must remain usable by keyboard and fit on small screens.
- Clicking a highlight button must not also trigger the parent badge.
- The badge itself should not masquerade as a button when it no longer expands.
- Preserve the existing quest-highlight behavior; change discovery and presentation, not scoring.

Add a rendering test that loads a quest and confirms its highlight controls are visible and actionable before any badge click.

## 10. CSS redundancy reduction

Audit every CSS file actually loaded by the application, including style tags and dynamically loaded screen styles.

Do not solve this request by adding another broad `refinement-v5.css` that overrides v3/v4. Consolidate instead.

Required process:

1. Build a stylesheet load-order map from HTML/templates and runtime imports.
2. Identify:
   - duplicate selectors
   - exact duplicate declaration blocks
   - selectors that differ only to override old theme layers
   - repeated media-query blocks
   - repeated role color literals
   - dead selectors no longer present in markup
   - excessive `!important`
   - rules made obsolete by later files
3. Establish one small token/source-of-truth layer for color, spacing, radii, typography, surfaces, role accents, difficulty colors, and motion.
4. Move component rules to the component's canonical stylesheet.
5. Merge or delete obsolete refinement/override files and remove their `<link>`/import references.
6. Preserve genuinely separate component styles; the goal is not one giant file.
7. Prefer low-specificity component classes and `:where()` where appropriate.
8. Avoid selectors coupled to incidental DOM depth.
9. Remove dead comments and contradictory declarations.
10. Keep source maps/build behavior intact if a bundler is present.

Quantitative acceptance:
- exact duplicate selector count should decrease materially;
- exact duplicate declaration-block count should decrease materially;
- loaded stylesheet count should not increase;
- `!important` count should not increase and should preferably decrease;
- total CSS bytes should decrease unless a clearly documented accessibility rule offsets it.

The patch driver creates a baseline redundancy report. Produce an after-report and summarize the deltas. Explain any remaining intentional duplicates.

## 11. Tests and completion criteria

Run the repository's existing tests and add focused tests for the changed behavior. At minimum:

- JavaScript syntax checks
- star normalization matrix
- Hidden Guess matrix and cleanup
- reward selection click/keyboard/ack/retry/stale-offer behavior
- Bet Miss absent from all generated offers
- quest controls visible without expansion
- no automatic feedback-row scroll, using a browser test where the repository supports one
- Guess Again indicator does not steal focus or intercept pointer input
- header role classes do not change header background
- Daily Challenge reward generation also excludes Bet Miss

Before finishing:
- run `git diff --check`;
- inspect mobile and desktop layouts;
- verify reduced-motion behavior;
- verify keyboard focus visibility;
- verify reward selection manually or through a DOM test;
- list all files changed;
- give test commands and results;
- call out any compatibility handler retained for old Bet Miss games.

Do not leave TODOs, placeholder icons, duplicate event listeners, or an additional catch-all override stylesheet.


## Repository-specific context generated by the v5 driver

- Current branch: `claude/game-ui-lobby-improvements-v66zpd`
- Current HEAD: `80a3b9bb76264b7c1719314fff79519ab55f26ea`
- Working tree dirty before implementation: `True`
- CSS baseline file: `.claude/css-redundancy-before-v5.json`

### Relevant source inventory

```json
{
  "counts_by_extension": {
    ".css": 19,
    ".html": 1,
    ".js": 215,
    ".json": 3,
    ".md": 2,
    ".sql": 1
  },
  "relevant_files": [
    "docs/adding-a-power.md",
    "public/client/daily-challenge.js",
    "public/client/dev-powers.js",
    "public/client/dev-reward-simulation.js",
    "public/client/play-menu.js",
    "public/client/power-choice-mode.js",
    "public/client/power-copy-v10.js",
    "public/client/power-functions.js",
    "public/client/power-keyboard.js",
    "public/client/power-loadouts.js",
    "public/client/power-log-format.js",
    "public/client/quest-charge-v9.js",
    "public/client/quest-choice.js",
    "public/client/quest-guide.js",
    "public/client/quest.js",
    "public/client/spy-charge.js",
    "public/client/summary.js",
    "public/client/tutorial-advanced.js",
    "public/client/tutorial-basic.js",
    "public/client/tutorial-menu.js",
    "public/client/tutorial-powers.js",
    "public/client/tutorial-progress.js",
    "public/client/tutorial-quest.js",
    "public/client/tutorial-star.js",
    "public/client/tutorial-ui.js",
    "public/css/game-menu.css",
    "public/css/powers.css",
    "public/css/tutorial-eli5.css",
    "public/css/tutorial.css",
    "public/powerEngine/POWER_POINTS.js",
    "public/powerEngine/QUEST_METADATA.js",
    "public/powerEngine/opponentPowerDescriptions.js",
    "public/powerEngine/power-tiers.js",
    "public/powerEngine/powerEngine.js",
    "public/powerEngine/powerMetadata.js",
    "public/powerEngine/powerPalettes.js",
    "public/powerEngine/powerRules.js",
    "public/powerEngine/powers/assassinWord.js",
    "public/powerEngine/powers/betMiss.js",
    "public/powerEngine/powers/blindGuess.js",
    "public/powerEngine/powers/blindSpot.js",
    "public/powerEngine/powers/confuseColors.js",
    "public/powerEngine/powers/countOnly.js",
    "public/powerEngine/powers/delayedIntel.js",
    "public/powerEngine/powers/doubleGuess.js",
    "public/powerEngine/powers/fakeFeedback.js",
    "public/powerEngine/powers/fieldReport.js",
    "public/powerEngine/powers/forceGuess.js",
    "public/powerEngine/powers/forceTimer.js",
    "public/powerEngine/powers/freezeSecret.js",
    "public/powerEngine/powers/hideTile.js",
    "public/powerEngine/powers/letterLockout.js",
    "public/powerEngine/powers/letterProbe.js",
    "public/powerEngine/powers/letterProfile.js",
    "public/powerEngine/powers/magicMode.js",
    "public/powerEngine/powers/nonsense.js",
    "public/powerEngine/powers/revealGreen.js",
    "public/powerEngine/powers/revealHistory.js",
    "public/powerEngine/powers/revealLetter.js",
    "public/powerEngine/powers/revealLocation.js",
    "public/powerEngine/powers/revealPenalty.js",
    "public/powerEngine/powers/rouletteSecret.js",
    "public/powerEngine/powers/stealthGuess.js",
    "public/powerEngine/powers/suggestGuess.js",
    "public/powerEngine/powers/suggestSecret.js",
    "public/powerEngine/powers/vowelRefresh.js",
    "public/powerEngine/powers/wiretap.js",
    "public/powerEngine/quest-copy-v7.js",
    "server/core/ai/aiPowerMeta.js",
    "server/core/dailyTracking.js",
    "server/core/modes/tutorialMode.js",
    "server/core/simulation/runPowerSimulation.js",
    "server/core/simulation/runQuestSimulation.js",
    "server/core/simulation/runRewardSimulation.js",
    "server/game-engine/finalizeFeedback.js",
    "server/power-choice/powerChoiceServer.js",
    "server/power-choice/powerTiers.js",
    "server/power-choice/rewardCategories.js",
    "server/powers/POWER_POINTS.js",
    "server/powers/POWER_RULES.js",
    "server/powers/logPowerUse.js",
    "server/powers/powerEngineServer.js",
    "server/powers/powerMetadata.js",
    "server/powers/powers/assassinWordServer.js",
    "server/powers/powers/betMissServer.js",
    "server/powers/powers/blindGuessServer.js",
    "server/powers/powers/blindSpotServer.js",
    "server/powers/powers/confuseColorsServer.js",
    "server/powers/powers/countOnlyServer.js",
    "server/powers/powers/delayedIntelServer.js",
    "server/powers/powers/fakeFeedbackServer.js",
    "server/powers/powers/fieldReportServer.js",
    "server/powers/powers/forceGuessServer.js",
    "server/powers/powers/forceTimerServer.js",
    "server/powers/powers/freezeSecretServer.js",
    "server/powers/powers/hideTileServer.js",
    "server/powers/powers/letterLockoutServer.js",
    "server/powers/powers/letterProbeServer.js",
    "server/powers/powers/letterProfileServer.js",
    "server/powers/powers/magicModeServer.js",
    "server/powers/powers/nonsenseServer.js",
    "server/powers/powers/questServer.js",
    "server/powers/powers/revealGreenServer.js",
    "server/powers/powers/revealHistoryServer.js",
    "server/powers/powers/revealLetterServer.js",
    "server/powers/powers/revealLocationServer.js",
    "server/powers/powers/revealPenaltyServer.js",
    "server/powers/powers/rouletteSecretServer.js",
    "server/powers/powers/spyChargeServer.js",
    "server/powers/powers/stealthGuessServer.js",
    "server/powers/powers/suggestGuessServer.js",
    "server/powers/powers/suggestSecretServer.js",
    "server/powers/powers/vowelRefreshServer.js",
    "server/powers/powers/wiretapServer.js",
    "server/powers/randomLoadout.js",
    "server/tests/dailyAiDifficultyEnforced.test.js",
    "server/tests/dailyConfig.test.js",
    "server/tests/oneWordLeftStillEarnsStar.test.js",
    "server/tests/rewardCategories.test.js",
    "server/utils/clearRoundPowerActivity.js",
    "server/utils/dailyConfig.js",
    "server/utils/delayedFeedback.js"
  ],
  "text_file_count": 241
}
```

### Current semantic search hits

```json
{
  "Guess again": [
    "server/game-engine/scoring.js:4: * Score a guess against a secret word.",
    "public/client.js:615: title: \"Guess again\",",
    "public/index.html:525: <p>Quests appear on guesses <b>2, 4, and 6</b>. Each adds an optional rule to that guess. Completing it immediately opens a choice of three rewards. Later Quest completions have better rarity odds, so the Guesser must we",
    "public/game-engine/scoring.js:4: * Score a guess against a secret word.",
    "public/css/competitive-polish-v2.css:457: 2. Purpose-built Guess Again announcement",
    "public/client/tutorial-quest.js:5: // real guess against a real forced example quest, earns a real reward",
    "public/client/quest.js:279: // The running count replays each PAST guess against whatever"
  ],
  "bet miss": [
    "server/powers/powers/hideTileServer.js:10: // Field Report, Reveal Letter, Reveal Penalty, Bet Miss, Magic Mode, and",
    "server/core/stateFactory.js:33: // Bet Miss",
    "public/powerEngine/powers/betMiss.js:14: console.log(\"bet Miss clicked\");",
    "public/powerEngine/powers/betMiss.js:95: // Bet Miss \u2014 info badge"
  ],
  "betmiss": [
    "server/index.js:161: require(\"./powers/powers/betMissServer.js\");",
    "server/powers/logPowerUse.js:11: betMiss: \"guesser\",",
    "server/powers/POWER_RULES.js:16: betMiss: {",
    "server/powers/POWER_RULES.js:20: !state.powers.betMissUsed",
    "server/powers/POWER_POINTS.js:41: betMiss: 1.5, // Risky Maneuver \u2014 bet on miss count for a free green",
    "server/powers/powerMetadata.js:40: betMiss: { label: \"Risky Maneuver\", role: \"guesser\" },",
    "server/powers/powers/betMissServer.js:4: engine.registerPower(\"betMiss\", {",
    "server/powers/powers/betMissServer.js:6: if (state.powers.betMissUsed) return false;",
    "server/powers/powers/betMissServer.js:7: state.powers.betMissActive = true;",
    "server/powers/powers/betMissServer.js:8: state.powers.betMissUsed = true;",
    "server/powers/powers/betMissServer.js:9: state.powers.betMissNumber = action.betMissNumber;",
    "server/powers/powers/betMissServer.js:10: io.to(roomId).emit(\"powerUsed\", { type: \"betMiss\" });",
    "server/powers/powers/betMissServer.js:20: if (!state.powers?.betMissActive || state.turn !== state.setter) {",
    "server/powers/powers/betMissServer.js:23: const betMissNumber = state.powers.betMissNumber;",
    "server/powers/powers/betMissServer.js:24: if (typeof betMissNumber !== \"number\" ||betMissNumber < 0 ||betMissNumber > 5)",
    "server/powers/powers/betMissServer.js:25: {console.log(\"[betMiss] postScore exit: invalid betMissNumber\", betMissNumber);return;}",
    "server/powers/powers/betMissServer.js:31: if (betMissNumber === misses){",
    "server/powers/powers/betMissServer.js:52: console.log(\"[betMiss] no options left to reveal\");",
    "server/powers/powers/betMissServer.js:53: io.to(roomId).emit(\"betMissResult\", { correct: true, misses, betMissNumber, noLetterLeft: true });",
    "server/powers/powers/betMissServer.js:63: io.to(roomId).emit(\"betMissResult\", { correct: true, misses, betMissNumber, letter, index });",
    "server/powers/powers/betMissServer.js:66: io.to(roomId).emit(\"betMissResult\", { correct: false, misses, betMissNumber });",
    "server/powers/powers/betMissServer.js:68: state.powers.betMissNumber = null;",
    "server/powers/powers/betMissServer.js:69: state.powers.betMissActive= false;",
    "server/core/stateFactory.js:34: betMissActive : false,"
  ],
  "bonus star": [
    "public/ui/competitive-fixes-v2.js:104: setAttributeIfChanged(target, \"aria-label\", `Bonus star: ${letter} in ${positionLabel}`);",
    "public/ui/setter-notes-target-v9.js:155: target.setAttribute(\"aria-label\", `Bonus star: ${letter} in ${positionLabel}`);",
    "public/ui/v9-3-ui-fixes.js:87: <span>Bonus star</span>",
    "public/ui/v9-3-ui-fixes.js:95: `Bonus star: put ${hint.letter} in box ${hint.position + 1}`",
    "public/ui/setter-board.js:282: // which tile the bonus star is on, which is still worth showing on an",
    "public/ui/setter-board.js:475: `${count} of 3 cover-strength stars${bonusEarned ? \" plus one bonus star\" : \"\"}`",
    "public/ui/v9-2-ui-fixes.js:293: `Put ${hint.letter} in box ${hint.position + 1} for the bonus star`",
    "public/ui/gameplay-systems-v10.js:416: target.setAttribute(\"aria-label\", `Bonus star: ${letter} in ${positionLabel}`);",
    "public/client/tutorial-star.js:255: \"A better legal alternative earns more stars: 3 is best, so a 3-star switch is normally good to submit. A bonus star is available when you match the shown letter and position; that target comes from a best current secret",
    "public/client/spy-charge.js:166: ? `Bonus star: change to a legal secret with ${String(hint.letter).toUpperCase()} in position ${position}. `",
    "public/client/spy-charge.js:267: const bonusText = strength.bonusStar ? \" plus one bonus star\" : \"\";",
    "public/client/spy-charge.js:534: // scored (1-4 stars: base 0-3 plus the bonus star) -- separate from",
    "public/client/power-choice-mode.js:922: `Bonus star: ${letter} in ${positionLabel}${satisfied ? \" -- earned\" : \"\"}`",
    "public/client/power-choice-mode.js:929: // light blue as the bonus star readout above it, so the two visibly"
  ],
  "bonusStar": [
    "server/powers/powers/freezeSecretServer.js:21: spyChargeServer.commitAward(state, { baseStars: 1, bonusStars: 0 }, room, io);",
    "server/powers/powers/spyChargeServer.js:346: bonusStars: 0,",
    "server/powers/powers/spyChargeServer.js:413: const bonusStars =",
    "server/powers/powers/spyChargeServer.js:422: bonusStars,",
    "server/powers/powers/spyChargeServer.js:423: earnedStars: baseStars + bonusStars,",
    "server/powers/powers/spyChargeServer.js:455: const appliedBonusStars = Math.min(",
    "server/powers/powers/spyChargeServer.js:457: Math.max(0, Number(award?.bonusStars) || 0)",
    "server/powers/powers/spyChargeServer.js:461: appliedBaseStars + appliedBonusStars;",
    "server/powers/powers/spyChargeServer.js:485: bonusStars: Math.max(0, Number(award?.bonusStars) || 0),",
    "server/powers/powers/spyChargeServer.js:487: appliedBonusStars,",
    "server/powers/powers/spyChargeServer.js:689: bonusStars: 0,",
    "server/powers/powers/spyChargeServer.js:709: entry.bonusStarsEarned = Number(result?.appliedBonusStars ?? award.bonusStars ?? 0) || 0;",
    "server/utils/coverStrength.js:566: bonusStar: false",
    "server/utils/coverStrength.js:677: const bonusStar = !!(",
    "server/utils/coverStrength.js:713: bonusStar",
    "server/power-choice/powerChoiceServer.js:2177: const bonus = Math.max(0, Number(award?.bonusStars) || 0);",
    "server/power-choice/powerChoiceServer.js:2182: bonusStars: bonus,",
    "server/power-choice/powerChoiceServer.js:2196: const bonusStars = Math.max(0, Number(award?.bonusStars) || 0);",
    "server/power-choice/powerChoiceServer.js:2197: const appliedStars = Math.min(15 - before, baseStars + bonusStars);",
    "server/power-choice/powerChoiceServer.js:2199: const appliedBonusStars = Math.max(0, appliedStars - appliedBaseStars);",
    "server/power-choice/powerChoiceServer.js:2209: historyEntryV3.bonusStarsEarned = appliedBonusStars;",
    "server/power-choice/powerChoiceServer.js:2238: bonusStars,",
    "server/power-choice/powerChoiceServer.js:2240: appliedBonusStars,",
    "public/ui/v9-3-ui-fixes.js:436: (Number(payload?.appliedBonusStars) || 0)"
  ],
  "guess-again": [
    "public/client.js:620: roleClass: \"role-guesser guess-again-announce\",",
    "public/css/competitive-polish-v2.css:460: .big-announce.guess-again-announce {",
    "public/css/competitive-polish-v2.css:461: --guess-again-accent: var(--guesser-color, #60a5fa);",
    "public/css/competitive-polish-v2.css:463: radial-gradient(circle at 50% 43%, color-mix(in srgb, var(--guess-again-accent) 19%, transparent), transparent 42%),",
    "public/css/competitive-polish-v2.css:468: .big-announce.guess-again-announce .big-announce-card {",
    "public/css/competitive-polish-v2.css:474: border: 1px solid color-mix(in srgb, var(--guess-again-accent) 62%, rgba(255, 255, 255, 0.16));",
    "public/css/competitive-polish-v2.css:477: radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--guess-again-accent) 22%, transparent), transparent 43%),",
    "public/css/competitive-polish-v2.css:482: 0 0 45px color-mix(in srgb, var(--guess-again-accent) 15%, transparent);",
    "public/css/competitive-polish-v2.css:487: .big-announce.guess-again-announce .big-announce-card::before {",
    "public/css/competitive-polish-v2.css:494: border: 1px solid color-mix(in srgb, var(--guess-again-accent) 44%, transparent);",
    "public/css/competitive-polish-v2.css:496: background: color-mix(in srgb, var(--guess-again-accent) 11%, transparent);",
    "public/css/competitive-polish-v2.css:497: color: color-mix(in srgb, var(--guess-again-accent) 68%, white);",
    "public/css/competitive-polish-v2.css:503: .big-announce.guess-again-announce .big-announce-card::after {",
    "public/css/competitive-polish-v2.css:516: .big-announce.guess-again-announce .big-announce-icon {",
    "public/css/competitive-polish-v2.css:522: border: 1px solid color-mix(in srgb, var(--guess-again-accent) 66%, white 9%);",
    "public/css/competitive-polish-v2.css:525: linear-gradient(145deg, color-mix(in srgb, var(--guess-again-accent) 32%, rgba(255, 255, 255, 0.08)), rgba(7, 12, 20, 0.75));",
    "public/css/competitive-polish-v2.css:528: 0 0 28px color-mix(in srgb, var(--guess-again-accent) 29%, transparent);",
    "public/css/competitive-polish-v2.css:529: color: color-mix(in srgb, var(--guess-again-accent) 72%, white);",
    "public/css/competitive-polish-v2.css:533: animation: competitive-guess-again-turn 1.1s cubic-bezier(0.2, 0.75, 0.25, 1) both;",
    "public/css/competitive-polish-v2.css:536: .big-announce.guess-again-announce .big-announce-title {",
    "public/css/competitive-polish-v2.css:544: text-shadow: 0 0 24px color-mix(in srgb, var(--guess-again-accent) 23%, transparent);",
    "public/css/competitive-polish-v2.css:547: .big-announce.guess-again-announce .big-announce-sub {",
    "public/css/competitive-polish-v2.css:556: .big-announce.guess-again-announce .big-announce-sub-line:last-child {",
    "public/css/competitive-polish-v2.css:557: color: color-mix(in srgb, var(--guess-again-accent) 58%, white);"
  ],
  "guesser": [
    "COMPETITIVE_OVERHAUL_REVIEW.md:15: 8. **Quest tutorial** \u2014 identifies Quests as the Guesser bonus; explains guesses 2, 4, and 6, improving reward rarity, the guess-quality tradeoff, immediate reward effects, and the once-per-game refresh. The existing han",
    "COMPETITIVE_OVERHAUL_REVIEW.md:20: 13. **Role-aware headers** \u2014 styles header controls with the active Secretkeeper or Guesser color.",
    "COMPETITIVE_OVERHAUL_REVIEW.md:30: **Decision: round-scoped (\"until roles change\").** Informant (`revealLocation`) now expires the moment roles actually swap, matching the \"for the rest of the round\" card copy. `nextRoundTransition.js` strips any `revealL",
    "COMPETITIVE_OVERHAUL_REVIEW.md:60: 1. Finish Guesser quests on guesses 2, 4, and 6 and verify later offers improve in rarity.",
    "server/index.js:54: // \"how many secrets remain\" (the setter box, the guesser's Wiretap/Tap Line)",
    "server/index.js:88: guesserPowers: cfg.guesserPowers,",
    "server/network/socketHandlers.js:20: const { guesserVisibleHistoryCount } = require(\"../utils/delayedFeedback\");",
    "server/network/socketHandlers.js:678: // Wiretap live tap: while the guesser's wiretap is active this turn,",
    "server/network/socketHandlers.js:681: socket.on(\"guesserWiretapDraft\", ({ roomId, draft }) => {",
    "server/network/socketHandlers.js:687: if (!userId || userId !== state.guesser) return;",
    "server/network/socketHandlers.js:712: // If Delayed Intel is also active, the guesser hasn't unlocked the",
    "server/network/socketHandlers.js:717: const visibleCount = guesserVisibleHistoryCount(state);",
    "server/network/socketHandlers.js:938: ? [room.state.setter, room.state.guesser].filter(Boolean)",
    "server/network/socketHandlers.js:1051: if (!powerId || (powerRole !== \"setter\" && powerRole !== \"guesser\")) {",
    "server/network/socketHandlers.js:1084: const safeRoleFilter = [\"all\", \"setter\", \"guesser\"].includes(roleFilter) ? roleFilter : \"all\";",
    "server/network/socketHandlers.js:1153: const safeRole = role === \"setter\" || role === \"guesser\" ? role : null;",
    "server/network/socketHandlers.js:1167: if (!rewardId || (role !== \"setter\" && role !== \"guesser\") || ![1, 2, 3].includes(Number(tier))) {",
    "server/network/socketHandlers.js:1193: const safeRoleFilter = [\"all\", \"setter\", \"guesser\"].includes(roleFilter) ? roleFilter : \"all\";",
    "server/tests/informantRoundScope.test.js:17: guesser: \"playerB\",",
    "server/tests/informantRoundScope.test.js:27: guesser: [{ powerId: \"revealLocation\", userId: \"playerB\" }]",
    "server/tests/informantRoundScope.test.js:34: // Round 1: playerB (guesser) has an active Informant peek.",
    "server/tests/informantRoundScope.test.js:38: state.powers.powerChoicePersistentGrants.guesser.some(g => g.powerId === \"revealLocation\"),",
    "server/tests/informantRoundScope.test.js:49: !state.powers.powerChoicePersistentGrants.guesser.some(g => g.powerId === \"revealLocation\"),",
    "server/tests/informantRoundScope.test.js:57: // Round 2 initializes (even with playerB remaining the guesser, since a"
  ],
  "header": [
    "COMPETITIVE_OVERHAUL_REVIEW.md:20: 13. **Role-aware headers** \u2014 styles header controls with the active Secretkeeper or Guesser color.",
    "server/powers/powers/questServer.js:221: // pendingChoice's header comment in stateFactory.js) -- validates the pick",
    "server/powers/powers/questServer.js:750: // (see finalizeFeedback.js) -- see evaluateQuestProgress's header for",
    "server/powers/powers/fieldReportServer.js:156: // together from onGuessSubmitted (see file header), so there's a",
    "server/utils/wordListLoader.js:11: const header = lines.shift().split(/\\t+/);",
    "server/utils/wordListLoader.js:16: header.forEach((h, i) => (row[h] = cols[i]));",
    "public/client.js:766: updateAppHeader(state);",
    "public/client.js:768: updateLobbyHeader();",
    "public/client.js:904: // Update updateLobbyHeader",
    "public/client.js:906: function updateLobbyHeader() {",
    "public/client.js:2626: // One instance in the outer app-header (menus) plus one duplicated into",
    "public/client.js:2627: // each of setter/guesser's own headers (see index.html) -- all three",
    "public/client.js:2662: // The Letter Profile box's header title is also guide-mode-only --",
    "public/client.js:2694: // One instance in the outer app-header (menus) plus one duplicated into",
    "public/client.js:2695: // each of setter/guesser's own headers -- see setupGuideToggle's comment",
    "public/client.js:3078: function updateAppHeader(state) {",
    "public/client.js:3079: const roomCodeEl = document.querySelector(\".header-room-code\");",
    "public/client.js:3080: // Each screen (menu app-header, setter, guesser) now carries its own",
    "public/client.js:3081: // .header-role-badge instance instead of sharing one global element in",
    "public/client.js:3082: // the outer app-header -- only ever one is actually visible at a time",
    "public/client.js:3085: const roleBadgeEls = document.querySelectorAll(\".header-role-badge\");",
    "public/client.js:3096: el.className = \"role-badge header-role-badge\";",
    "public/client.js:3123: el.className = \"role-badge header-role-badge\";",
    "public/client.js:3130: // updateAppHeader() rebuilds the badge's innerHTML on every state update,"
  ],
  "hidden guess": [
    "server/core/phases/normal.js:248: // (Keep or New). Score BOTH the shown and hidden guesses against it and",
    "server/core/phases/normal.js:438: // both the shown (pendingGuess) and hidden guesses are now scored against it.",
    "server/utils/safeState.js:155: // Keep/New decision that immediately follows the hidden guess --",
    "server/power-choice/powerChoiceServer.js:1732: // (immediate-win check, handing a hidden guess off to the setter,",
    "public/client.js:1250: // hidden guess even while the draft row itself correctly stayed",
    "public/powerEngine/powers/doubleGuess.js:54: text: `${meta.label}: a second hidden guess is in play`,"
  ],
  "hiddenGuess": [],
  "highlight": [
    "server/core/modes/tutorialMode.js:278: // \"needed\" right up through the highlight-button demo step, and WACKY",
    "server/utils/remainingWords.js:179: highlightOld: false,",
    "server/utils/remainingWords.js:180: highlightNew: false,",
    "server/utils/remainingWords.js:202: highlightOld: false,",
    "server/utils/remainingWords.js:203: highlightNew: false,",
    "server/utils/remainingWords.js:270: highlightOld:",
    "server/utils/remainingWords.js:275: highlightNew:",
    "public/client.js:65: // A tutorial's highlight rings (DOM classes toggled in tutorial-ui.js) and",
    "public/client.js:69: // either, so without this a highlight ring left over from an abandoned",
    "public/client.js:87: window.clearHighlights?.();",
    "public/client.js:967: // summary tutorial (and its highlightRoundSummary() call) until the",
    "public/client.js:1249: // key-current highlight, which was leaking every letter of the",
    "public/client.js:2455: window.applyQuestGuideHighlight?.($(\"keyboardGuesser\"), localGuesserDraft, state.powers?.quest?.type, !!state.powers?.quest?.used, state);",
    "public/client.js:2674: // highlight target when it points at the Guide toggle) up or down --",
    "public/client.js:3005: // Optionally update keyboard highlights only",
    "public/ui/timers.js:35: // Active highlight",
    "public/ui/setter-board.js:595: // Exposed for tutorial-ui.js's highlightPowerButtonByText -- the Secretkeeper's",
    "public/ui/setter-board.js:597: // trying to highlight one has to force it open first or the highlight",
    "public/ui/setter-sidebar.js:290: // If the tutorial has Notes highlighted (see highlightNotesPanel() in",
    "public/ui/draftrow.js:343: // is confirmed, so the secret's letter there is worth highlighting.",
    "public/css/competitive-polish-v2.css:1839: tiles (an outline/box-shadow highlight only, see gameplay-ui.css). A",
    "public/css/competitive-polish-v2.css:1841: leaving only 4 visible -- instead of just suppressing the highlight. */",
    "public/css/components.css:185: \"light\" highlight details, baked directly onto each <symbol>'s",
    "public/css/components.css:507: /* Optional: highlight current draft keys without overriding solved colors */"
  ],
  "power-choice": [
    "server/tests/informantRoundScope.test.js:9: const { initializeRound } = require(\"../power-choice/powerChoiceServer\");",
    "server/tests/rewardCategories.test.js:2: // map to a real category (see server/power-choice/rewardCategories.js).",
    "server/tests/rewardCategories.test.js:10: } = require(\"../power-choice/powerChoiceServer\");",
    "server/core/applyAction.js:1: const powerChoiceServer = require(\"../power-choice/powerChoiceServer\"); // power-choice-mode-v2.2",
    "server/core/applyAction.js:9: // power-choice-mode-v2.2: mode actions and reward cards run before phases.",
    "server/core/stateFactory.js:254: gameMode: \"powerChoice\", // power-choice-mode-v2.2",
    "server/core/stateFactory.js:290: powerChoice: null, // power-choice-mode-v2.2",
    "server/core/ai/runAI.js:12: const powerChoiceServer = require(\"../../power-choice/powerChoiceServer\"); // power-choice-mode-v2.2",
    "server/core/ai/runAI.js:387: // power-choice-mode-v2.2: only choose a reward when a real card choice is pending.",
    "server/core/ai/runAI.js:449: // power-choice-mode-v2.2: difficulty controls whether the AI chases this quest.",
    "server/core/ai/runAI.js:516: // power-choice-mode-v2.2: choose top hint, keep, or a weaker switch by difficulty.",
    "server/core/phases/lobby.js:410: freshState.gameMode = state.gameMode || \"powerChoice\"; // power-choice-mode-v2.2",
    "server/core/phases/normal.js:523: // Exported for server/power-choice/powerChoiceServer.js -- lets the",
    "server/core/modes/tutorialMode.js:4: const powerChoiceServer = require(\"../../power-choice/powerChoiceServer\");",
    "server/core/simulation/runRewardSimulation.js:6: const powerChoice = require(\"../../power-choice/powerChoiceServer\");",
    "server/utils/safeState.js:103: // power-choice-mode-v2.2: keep each charge private and hide unselected cards.",
    "server/power-choice/powerChoiceServer.js:1878: // public/client/power-choice-mode.js) and this guess can't complete or",
    "public/index.html:1616: <script src=\"powerEngine/power-tiers.js?v=2.3-card-carousel\"></script> <!-- power-choice-mode-v2.2 -->",
    "public/index.html:1617: <script src=\"client/power-choice-mode.js?v=tutorial-motion-sim-2\"></script> <!-- power-choice-mode-v2.2 -->",
    "public/ui/competitive-fixes-v2.js:139: // element and tile decoration (power-choice-mode.js's",
    "public/ui/competitive-fixes-v2.js:142: if (document.body.classList.contains(\"power-choice-mode\")) return;",
    "public/ui/setter-notes-target-v9.js:136: // element (power-choice-mode.js's normalizeBonusTarget) -- bail out",
    "public/ui/setter-notes-target-v9.js:138: if (document.body.classList.contains(\"power-choice-mode\")) return;",
    "public/ui/v9-3-ui-fixes.js:45: // element (power-choice-mode.js's normalizeBonusTarget) -- bail out"
  ],
  "quest": [
    "COMPETITIVE_OVERHAUL_REVIEW.md:15: 8. **Quest tutorial** \u2014 identifies Quests as the Guesser bonus; explains guesses 2, 4, and 6, improving reward rarity, the guess-quality tradeoff, immediate reward effects, and the once-per-game refresh. The existing han",
    "COMPETITIVE_OVERHAUL_REVIEW.md:21: 14. **Rules rewrite** \u2014 documents Stars, Quests, and Rewards and removes the obsolete pre-match power-draft explanation.",
    "COMPETITIVE_OVERHAUL_REVIEW.md:23: 16. **Statistics** \u2014 archives per-round stars and completed quests and adds average stars/game and average quests/game. A Supabase migration adds optional indexed aggregates.",
    "COMPETITIVE_OVERHAUL_REVIEW.md:48: The client derives stars and quests from the archived `rounds` JSON, including a history fallback for old rows. The new Supabase columns are optional for the UI and exist for indexed dashboards and future queries.",
    "COMPETITIVE_OVERHAUL_REVIEW.md:60: 1. Finish Guesser quests on guesses 2, 4, and 6 and verify later offers improve in rarity.",
    "COMPETITIVE_OVERHAUL_REVIEW.md:66: 7. Load old Supabase matches without `starsEarned` or `questsFulfilled`; averages should show zero/fallback values rather than error.",
    "server/index.js:31: // request can't take the entire server down.",
    "server/index.js:89: questType: cfg.questType,",
    "server/index.js:90: questTypeRound2Choices: cfg.questTypeRound2Choices",
    "server/index.js:170: require(\"./powers/powers/questServer.js\");",
    "server/network/socketHandlers.js:32: runQuestSimulation,",
    "server/network/socketHandlers.js:33: runAllQuestSimulations,",
    "server/network/socketHandlers.js:34: saveQuestSimulation",
    "server/network/socketHandlers.js:35: } = require(\"../core/simulation/runQuestSimulation\");",
    "server/network/socketHandlers.js:1101: /* ---------- DEV: QUEST COMPLETION SIMULATION ---------- */",
    "server/network/socketHandlers.js:1102: socket.on(\"runQuestSimulation\", async ({ userId, questType, runs, aiDifficulty }, cb) => {",
    "server/network/socketHandlers.js:1104: if (!questType) return cb?.({ ok: false, error: \"Pick a quest first\" });",
    "server/network/socketHandlers.js:1110: const stats = await runQuestSimulation(",
    "server/network/socketHandlers.js:1111: { questType, runs: safeRuns, aiDifficulty: safeDifficulty },",
    "server/network/socketHandlers.js:1113: (progress) => socket.emit(\"questSimulationProgress\", progress)",
    "server/network/socketHandlers.js:1118: saved = await saveQuestSimulation(stats, context, userId);",
    "server/network/socketHandlers.js:1120: console.error(\"Quest simulation save failed:\", saveErr);",
    "server/network/socketHandlers.js:1125: console.error(\"Quest simulation failed:\", err);",
    "server/network/socketHandlers.js:1130: socket.on(\"runAllQuestSimulations\", async ({ userId, runs, aiDifficulty }, cb) => {"
  ],
  "reward": [
    "COMPETITIVE_OVERHAUL_REVIEW.md:9: 2. **Reward rarity badge** \u2014 COMMON, RARE, and LEGEND are integrated as vertical card end-caps.",
    "COMPETITIVE_OVERHAUL_REVIEW.md:10: 3. **Reward card action copy** \u2014 removes the repeated `CHOOSE` footer; the full card remains the button.",
    "COMPETITIVE_OVERHAUL_REVIEW.md:12: 5. **Reward typography** \u2014 increases responsive icon, title, description, and rarity sizes.",
    "COMPETITIVE_OVERHAUL_REVIEW.md:15: 8. **Quest tutorial** \u2014 identifies Quests as the Guesser bonus; explains guesses 2, 4, and 6, improving reward rarity, the guess-quality tradeoff, immediate reward effects, and the once-per-game refresh. The existing han",
    "COMPETITIVE_OVERHAUL_REVIEW.md:18: 11. **Reward recalculation** \u2014 replaces a reward-id allow-list with a universal post-reward bonus-target refresh/invalidation, covering both players and future rewards.",
    "COMPETITIVE_OVERHAUL_REVIEW.md:19: 12. **Reward screen formatting** \u2014 normalizes card spacing, toolbar buttons, focus states, and mobile layout.",
    "COMPETITIVE_OVERHAUL_REVIEW.md:21: 14. **Rules rewrite** \u2014 documents Stars, Quests, and Rewards and removes the obsolete pre-match power-draft explanation.",
    "COMPETITIVE_OVERHAUL_REVIEW.md:36: Only a small set of knowledge-reset rewards explicitly rerolled the letter target. That misses opponent rewards, indirect state changes, and future rewards. The patch invalidates/recomputes it after every successful rewa",
    "COMPETITIVE_OVERHAUL_REVIEW.md:40: Later rewards can add, erase, or loosen constraints. Reconstructing an earlier turn's best word from the final round state can be wrong. The patch adds a deterministic `bestWord` to cover analysis, resolves tied optimal ",
    "COMPETITIVE_OVERHAUL_REVIEW.md:62: 3. Select every reward type from both roles and verify the next active Secretkeeper decision uses a recalculated bonus target.",
    "COMPETITIVE_OVERHAUL_REVIEW.md:65: 6. Verify summary `Best word` values do not change after a later reset/constraint reward.",
    "COMPETITIVE_OVERHAUL_REVIEW.md:67: 8. Test reward cards at 320 px, tablet, and desktop widths, including keyboard focus and reduced-motion mode.",
    "server/network/socketHandlers.js:37: getRewardCatalog,",
    "server/network/socketHandlers.js:38: runRewardSimulation,",
    "server/network/socketHandlers.js:39: runAllRewardSimulations",
    "server/network/socketHandlers.js:40: } = require(\"../core/simulation/runRewardSimulation\");",
    "server/network/socketHandlers.js:1151: /* ---------- DEV: POWER CHOICE REWARD SIMULATION ---------- */",
    "server/network/socketHandlers.js:1152: socket.on(\"getRewardCatalog\", ({ role, tier }, cb) => {",
    "server/network/socketHandlers.js:1158: cb?.({ ok: true, rewards: getRewardCatalog(safeRole, safeTier) });",
    "server/network/socketHandlers.js:1160: console.error(\"Reward catalog lookup failed:\", err);",
    "server/network/socketHandlers.js:1165: socket.on(\"runRewardSimulation\", async ({ userId, role, tier, rewardId, runs, aiDifficulty }, cb) => {",
    "server/network/socketHandlers.js:1167: if (!rewardId || (role !== \"setter\" && role !== \"guesser\") || ![1, 2, 3].includes(Number(tier))) {",
    "server/network/socketHandlers.js:1168: return cb?.({ ok: false, error: \"Pick a role, tier, and reward first\" });",
    "server/network/socketHandlers.js:1175: const stats = await runRewardSimulation("
  ],
  "scrollIntoView": [
    "public/client/action-log.js:360: container.querySelector(\".log-scroll-anchor\")?.scrollIntoView({ behavior: \"smooth\", block: \"end\" });",
    "public/client/tutorial-ui.js:1712: target?.scrollIntoView({",
    "public/client/tutorial-ui.js:1927: el?.scrollIntoView({",
    "public/client/power-choice-mode.js:1088: next.scrollIntoView({ behavior: \"smooth\", block: \"nearest\" });"
  ],
  "scrollTo": [
    "public/client.js:998: if (list) list.scrollTop = list.scrollHeight;",
    "public/client.js:1323: container.scrollTop =",
    "public/client.js:1379: scrollBox.scrollTop =",
    "public/ui/gameplay-polish-v8.js:650: scrollBox.scrollTop = scrollBox.scrollHeight;",
    "public/ui/setter-sidebar.js:179: historyScroll.scrollTop = historyScroll.scrollHeight;",
    "public/ui/guesser-flow-v7.js:184: history.scrollTop =",
    "public/ui/guesser-flow-v7.js:437: history.scrollTop =",
    "public/ui/history.js:141: container.scrollHeight - container.scrollTop - container.clientHeight;",
    "public/ui/history.js:470: container.scrollTo({",
    "public/client/tutorial-ui.js:2624: window.scrollTo({ top: 0, behavior: \"smooth\" });",
    "public/client/power-choice-mode.js:1364: if (card) card.scrollTop = 0;"
  ],
  "setter": [
    "COMPETITIVE_OVERHAUL_REVIEW.md:25: 18. **Setter side panels** \u2014 applies Secretkeeper colors to the Spyometer, collapsed meter, and game log.",
    "COMPETITIVE_OVERHAUL_REVIEW.md:26: 19. **Secret locked notice** \u2014 clarifies the setter message and gives the popup a Secretkeeper-specific presentation.",
    "server/index.js:54: // \"how many secrets remain\" (the setter box, the guesser's Wiretap/Tap Line)",
    "server/index.js:87: setterPowers: cfg.setterPowers,",
    "server/network/socketHandlers.js:18: const { buildSetterRemainingBoxState, computeRemainingAfterGuess } = require(\"../utils/remainingWords\");",
    "server/network/socketHandlers.js:189: me.role === \"setter\"",
    "server/network/socketHandlers.js:634: /* ---------- SETTER REMAINING BOX ---------- */",
    "server/network/socketHandlers.js:635: socket.on(\"setterDraftSecret\", ({ roomId, draft }) => {",
    "server/network/socketHandlers.js:644: if (actingPlayer.role !== \"setter\") return;",
    "server/network/socketHandlers.js:645: if (userId !== room.state.setter) return;",
    "server/network/socketHandlers.js:653: // broadcast wasn't the setterDraftSecret event itself.",
    "server/network/socketHandlers.js:654: room.state.setterDraft = normalized;",
    "server/network/socketHandlers.js:656: const boxState = buildSetterRemainingBoxState(",
    "server/network/socketHandlers.js:663: socket.emit(\"setterRemainingBox\", boxState);",
    "server/network/socketHandlers.js:667: // setterLetterProfile: a partial (<5 letter) in-progress draft",
    "server/network/socketHandlers.js:672: \"setterLetterProfile\",",
    "server/network/socketHandlers.js:938: ? [room.state.setter, room.state.guesser].filter(Boolean)",
    "server/network/socketHandlers.js:1051: if (!powerId || (powerRole !== \"setter\" && powerRole !== \"guesser\")) {",
    "server/network/socketHandlers.js:1084: const safeRoleFilter = [\"all\", \"setter\", \"guesser\"].includes(roleFilter) ? roleFilter : \"all\";",
    "server/network/socketHandlers.js:1153: const safeRole = role === \"setter\" || role === \"guesser\" ? role : null;",
    "server/network/socketHandlers.js:1167: if (!rewardId || (role !== \"setter\" && role !== \"guesser\") || ![1, 2, 3].includes(Number(tier))) {",
    "server/network/socketHandlers.js:1193: const safeRoleFilter = [\"all\", \"setter\", \"guesser\"].includes(roleFilter) ? roleFilter : \"all\";",
    "server/tests/informantRoundScope.test.js:16: setter: \"playerA\",",
    "server/tests/informantRoundScope.test.js:26: setter: [],"
  ],
  "spyCharge": [
    "server/tests/oneWordLeftStillEarnsStar.test.js:4: // star\" floor as the general case (see spyChargeServer.js's",
    "server/tests/oneWordLeftStillEarnsStar.test.js:9: const spyChargeServer = require(\"../powers/powers/spyChargeServer\");",
    "server/tests/oneWordLeftStillEarnsStar.test.js:28: powers: { spyCharge: { enabled: true, total: 0, resetsUsed: 0 } }",
    "server/tests/oneWordLeftStillEarnsStar.test.js:36: const award = spyChargeServer.evaluateSecretChange(state, \"APPLE\", allowedSecrets);",
    "server/powers/powers/freezeSecretServer.js:3: const spyChargeServer = require(\"./spyChargeServer\");",
    "server/powers/powers/freezeSecretServer.js:17: // path spyChargeServer's own decision-turn awards go through",
    "server/powers/powers/freezeSecretServer.js:21: spyChargeServer.commitAward(state, { baseStars: 1, bonusStars: 0 }, room, io);",
    "server/powers/powers/spyChargeServer.js:67: function createSpyChargeState(state, setterPowerIds) {",
    "server/powers/powers/spyChargeServer.js:92: state.powers.spyCharge = createSpyChargeState(",
    "server/powers/powers/spyChargeServer.js:99: return state?.powers?.spyCharge || null;",
    "server/powers/powers/spyChargeServer.js:500: \"spyChargeAward\",",
    "server/powers/powers/spyChargeServer.js:560: type: \"spyChargeReset\",",
    "server/powers/powers/spyChargeServer.js:574: id: \"spyChargeReset\",",
    "server/powers/powers/spyChargeServer.js:642: createSpyChargeState,",
    "server/powers/powers/spyChargeServer.js:680: state?.powers?.spyCharge?.enabled &&",
    "server/core/stateFactory.js:181: spyCharge: {",
    "server/core/ai/runAI.js:9: const spyChargeServer = require(",
    "server/core/ai/runAI.js:10: \"../../powers/powers/spyChargeServer\"",
    "server/core/ai/runAI.js:113: spyChargeServer.isPowerLocked(",
    "server/core/ai/runAI.js:404: maybeUseSpyChargeReset(",
    "server/core/ai/runAI.js:508: spyChargeServer",
    "server/core/ai/runAI.js:616: function maybeUseSpyChargeReset(",
    "server/core/ai/runAI.js:634: spyChargeServer",
    "server/core/ai/runAI.js:652: spyChargeServer"
  ]
}
```

### CSS baseline summary

```json
{
  "css_file_count": 19,
  "duplicate_declaration_block_count": 129,
  "duplicate_declaration_occurrences": 331,
  "duplicate_selector_count": 260,
  "duplicate_selector_occurrences": 549,
  "important_count": 782,
  "loaded_css_references": [
    "css/account.css",
    "css/animations.css",
    "css/base.css",
    "css/competitive-polish-v2.css",
    "css/components.css",
    "css/features.css",
    "css/game-menu.css",
    "css/gameplay-ui.css",
    "css/history.css",
    "css/layout.css",
    "css/leaderboard.css",
    "css/mobile.css",
    "css/powers.css",
    "css/refinement-v4.css",
    "css/special-effects.css",
    "css/states.css",
    "css/themes.css",
    "css/tutorial-eli5.css",
    "css/tutorial.css"
  ],
  "top_duplicate_selectors": {
    "#keyboardSetter, #keyboardGuesser": [
      "public/css/components.css:1221",
      "public/css/features.css:1978",
      "public/css/mobile.css:10"
    ],
    "#menu #roundSummary": [
      "public/css/competitive-polish-v2.css:664",
      "public/css/features.css:1005",
      "public/css/refinement-v4.css:589"
    ],
    "#menu .match-header": [
      "public/css/competitive-polish-v2.css:679",
      "public/css/competitive-polish-v2.css:1144",
      "public/css/refinement-v4.css:616"
    ],
    "#menu .share-btn": [
      "public/css/competitive-polish-v2.css:668",
      "public/css/competitive-polish-v2.css:1256",
      "public/css/features.css:1011",
      "public/css/refinement-v4.css:594",
      "public/css/refinement-v4.css:857"
    ],
    "#menu .stored-round": [
      "public/css/competitive-polish-v2.css:946",
      "public/css/competitive-polish-v2.css:1284",
      "public/css/refinement-v4.css:692"
    ],
    "#menu .summary-actions": [
      "public/css/competitive-polish-v2.css:897",
      "public/css/competitive-polish-v2.css:1148",
      "public/css/refinement-v4.css:733"
    ],
    "#menu .summary-table .secret-cell, #menu .summary-table .guess-cell": [
      "public/css/competitive-polish-v2.css:1123",
      "public/css/refinement-v4.css:822",
      "public/css/refinement-v4.css:876"
    ],
    "#menu .summary-table td": [
      "public/css/competitive-polish-v2.css:1097",
      "public/css/refinement-v4.css:794",
      "public/css/refinement-v4.css:872"
    ],
    "#menu .summary-table th": [
      "public/css/competitive-polish-v2.css:1081",
      "public/css/refinement-v4.css:785",
      "public/css/refinement-v4.css:867"
    ],
    "#menu > .panel": [
      "public/css/competitive-polish-v2.css:659",
      "public/css/competitive-polish-v2.css:1252",
      "public/css/refinement-v4.css:578",
      "public/css/refinement-v4.css:854"
    ],
    "#menu.screen": [
      "public/css/competitive-polish-v2.css:648",
      "public/css/competitive-polish-v2.css:1248",
      "public/css/features.css:990"
    ],
    "#setterScreen.active, #guesserScreen.active": [
      "public/css/features.css:1973",
      "public/css/layout.css:421",
      "public/css/layout.css:459"
    ],
    "#startupScreen .menu-center": [
      "public/css/features.css:1389",
      "public/css/refinement-v4.css:80",
      "public/css/refinement-v4.css:242",
      "public/css/refinement-v4.css:260"
    ],
    "#submit-banner": [
      "public/css/special-effects.css:1",
      "public/css/special-effects.css:74",
      "public/css/special-effects.css:87"
    ],
    "#tutorialContinueBtn": [
      "public/css/tutorial-eli5.css:86",
      "public/css/tutorial.css:174",
      "public/css/tutorial.css:351",
      "public/css/tutorial.css:695"
    ],
    ".feedback-cell": [
      "public/css/components.css:32",
      "public/css/components.css:37",
      "public/css/components.css:41"
    ],
    ".game-menu": [
      "public/css/competitive-polish-v2.css:1639",
      "public/css/game-menu.css:1",
      "public/css/game-menu.css:227"
    ],
    ".game-menu .menu-buttons": [
      "public/css/competitive-polish-v2.css:1665",
      "public/css/competitive-polish-v2.css:2025",
      "public/css/competitive-polish-v2.css:2048"
    ],
    ".game-menu .menu-title": [
      "public/css/competitive-polish-v2.css:1660",
      "public/css/competitive-polish-v2.css:2020",
      "public/css/competitive-polish-v2.css:2038"
    ],
    ".header-role-badge": [
      "public/css/layout.css:244",
      "public/css/layout.css:477",
      "public/css/layout.css:652"
    ],
    ".header-room-code": [
      "public/css/layout.css:470",
      "public/css/layout.css:668",
      "public/css/mobile.css:111"
    ],
    ".history-row": [
      "public/css/history.css:6",
      "public/css/history.css:728",
      "public/css/mobile.css:61"
    ],
    ".past-game-row": [
      "public/css/account.css:1",
      "public/css/account.css:100",
      "public/css/account.css:122"
    ],
    ".pc-card-desc": [
      "public/css/competitive-polish-v2.css:1510",
      "public/css/gameplay-ui.css:2200",
      "public/css/gameplay-ui.css:2726"
    ],
    ".pc-card-grid": [
      "public/css/competitive-polish-v2.css:1435",
      "public/css/competitive-polish-v2.css:1863",
      "public/css/competitive-polish-v2.css:1916",
      "public/css/gameplay-ui.css:2091",
      "public/css/gameplay-ui.css:2415",
      "public/css/gameplay-ui.css:2658",
      "public/css/gameplay-ui.css:2775",
      "public/css/gameplay-ui.css:2794"
    ],
    ".pc-card-icon .pc-card-svg": [
      "public/css/competitive-polish-v2.css:1482",
      "public/css/gameplay-ui.css:2166",
      "public/css/gameplay-ui.css:2698"
    ],
    ".pc-card-icon .pc-fixed-reward-svg": [
      "public/css/competitive-polish-v2.css:1487",
      "public/css/gameplay-ui.css:2174",
      "public/css/gameplay-ui.css:2703",
      "public/css/gameplay-ui.css:2786"
    ],
    ".pc-choice-card": [
      "public/css/competitive-polish-v2.css:1442",
      "public/css/gameplay-ui.css:2098",
      "public/css/gameplay-ui.css:2419"
    ],
    ".pc-choice-card strong": [
      "public/css/competitive-polish-v2.css:1501",
      "public/css/gameplay-ui.css:2135",
      "public/css/gameplay-ui.css:2194",
      "public/css/gameplay-ui.css:2720"
    ],
    ".pc-choice-card[data-rarity]": [
      "public/css/competitive-polish-v2.css:175",
      "public/css/competitive-polish-v2.css:1183",
      "public/css/competitive-polish-v2.css:1590",
      "public/css/competitive-polish-v2.css:1929",
      "public/css/competitive-polish-v2.css:2003",
      "public/css/powers.css:911",
      "public/css/refinement-v4.css:353",
      "public/css/refinement-v4.css:553"
    ],
    ".pc-choice-card[data-rarity] .pc-card-body, .pc-choice-card[data-rarity] .pc-card-body-armed": [
      "public/css/competitive-polish-v2.css:1595",
      "public/css/competitive-polish-v2.css:1955",
      "public/css/refinement-v4.css:435",
      "public/css/refinement-v4.css:557"
    ],
    ".pc-choice-card[data-rarity] .pc-card-desc": [
      "public/css/competitive-polish-v2.css:362",
      "public/css/competitive-polish-v2.css:1221",
      "public/css/competitive-polish-v2.css:1965",
      "public/css/refinement-v4.css:448"
    ],
    ".pc-choice-card[data-rarity] .pc-card-icon::before": [
      "public/css/competitive-polish-v2.css:305",
      "public/css/competitive-polish-v2.css:1197",
      "public/css/competitive-polish-v2.css:1945",
      "public/css/refinement-v4.css:415"
    ],
    ".pc-choice-card[data-rarity] .pc-rarity-badge > small": [
      "public/css/competitive-polish-v2.css:415",
      "public/css/competitive-polish-v2.css:1232",
      "public/css/competitive-polish-v2.css:1623"
    ],
    ".pc-choice-card[data-rarity] .pc-tier.pc-rarity-badge": [
      "public/css/competitive-polish-v2.css:386",
      "public/css/competitive-polish-v2.css:1226",
      "public/css/competitive-polish-v2.css:1601"
    ],
    ".pc-choice-card[data-rarity] strong": [
      "public/css/competitive-polish-v2.css:353",
      "public/css/competitive-polish-v2.css:1217",
      "public/css/competitive-polish-v2.css:1961",
      "public/css/refinement-v4.css:442"
    ],
    ".pc-current-quest-host": [
      "public/css/gameplay-ui.css:273",
      "public/css/gameplay-ui.css:1484",
      "public/css/gameplay-ui.css:2396"
    ],
    ".pc-modal": [
      "public/css/gameplay-ui.css:1990",
      "public/css/gameplay-ui.css:2406",
      "public/css/gameplay-ui.css:2634",
      "public/css/gameplay-ui.css:2754"
    ],
    ".pc-modal h2": [
      "public/css/competitive-polish-v2.css:1355",
      "public/css/competitive-polish-v2.css:1907",
      "public/css/gameplay-ui.css:2078",
      "public/css/gameplay-ui.css:2647",
      "public/css/gameplay-ui.css:2765"
    ],
    ".pc-modal-card": [
      "public/css/competitive-polish-v2.css:1343",
      "public/css/competitive-polish-v2.css:1900",
      "public/css/gameplay-ui.css:2043",
      "public/css/gameplay-ui.css:2411",
      "public/css/gameplay-ui.css:2639",
      "public/css/gameplay-ui.css:2759"
    ],
    ".pc-modal-sub": [
      "public/css/competitive-polish-v2.css:1361",
      "public/css/competitive-polish-v2.css:1911",
      "public/css/gameplay-ui.css:2084",
      "public/css/gameplay-ui.css:2652",
      "public/css/gameplay-ui.css:2770"
    ],
    ".pc-rarity-odds": [
      "public/css/competitive-polish-v2.css:1",
      "public/css/powers.css:875",
      "public/css/powers.css:924"
    ],
    ".pc-refresh-choice-btn": [
      "public/css/competitive-polish-v2.css:46",
      "public/css/competitive-polish-v2.css:1171",
      "public/css/competitive-polish-v2.css:1299",
      "public/css/competitive-polish-v2.css:1398",
      "public/css/competitive-polish-v2.css:1876",
      "public/css/competitive-polish-v2.css:1923",
      "public/css/powers.css:850",
      "public/css/powers.css:921",
      "public/css/refinement-v4.css:481"
    ],
    ".pc-refresh-choice-btn:hover:not(:disabled), .pc-refresh-choice-btn:focus-visible:not(:disabled)": [
      "public/css/competitive-polish-v2.css:85",
      "public/css/powers.css:864",
      "public/css/refinement-v4.css:506"
    ],
    ".pc-refresh-icon": [
      "public/css/competitive-polish-v2.css:101",
      "public/css/competitive-polish-v2.css:1177",
      "public/css/refinement-v4.css:514"
    ],
    ".pc-reward-toolbar": [
      "public/css/competitive-polish-v2.css:7",
      "public/css/competitive-polish-v2.css:1159",
      "public/css/competitive-polish-v2.css:1303",
      "public/css/competitive-polish-v2.css:1367",
      "public/css/competitive-polish-v2.css:1871",
      "public/css/powers.css:839",
      "public/css/powers.css:918"
    ],
    ".pc-toolbar-copy": [
      "public/css/competitive-polish-v2.css:22",
      "public/css/competitive-polish-v2.css:1163",
      "public/css/competitive-polish-v2.css:1296",
      "public/css/competitive-polish-v2.css:1379"
    ],
    ".pc-toolbar-note": [
      "public/css/competitive-polish-v2.css:36",
      "public/css/competitive-polish-v2.css:1167",
      "public/css/competitive-polish-v2.css:1392"
    ],
    ".role-card.guesser": [
      "public/css/game-menu.css:84",
      "public/css/game-menu.css:533",
      "public/css/game-menu.css:1075"
    ],
    ".role-card.setter": [
      "public/css/game-menu.css:78",
      "public/css/game-menu.css:528",
      "public/css/game-menu.css:1063"
    ],
    ".summary-table": [
      "public/css/competitive-polish-v2.css:1821",
      "public/css/components.css:10",
      "public/css/features.css:1213"
    ],
    ".timer-option": [
      "public/css/game-menu.css:102",
      "public/css/game-menu.css:677",
      "public/css/game-menu.css:1026"
    ],
    ".timer-option input:checked + span": [
      "public/css/game-menu.css:123",
      "public/css/game-menu.css:688",
      "public/css/game-menu.css:1034"
    ],
    ".tutorial-action": [
      "public/css/tutorial-eli5.css:17",
      "public/css/tutorial-eli5.css:115",
      "public/css/tutorial.css:202",
      "public/css/tutorial.css:511"
    ],
    ".tutorial-body": [
      "public/css/tutorial-eli5.css:97",
      "public/css/tutorial.css:134",
      "public/css/tutorial.css:341",
      "public/css/tutorial.css:518"
    ],
    ".tutorial-bubble": [
      "public/css/tutorial-eli5.css:1",
      "public/css/tutorial.css:1",
      "public/css/tutorial.css:322",
      "public/css/tutorial.css:435"
    ],
    ".tutorial-bubble.collapsed": [
      "public/css/tutorial.css:225",
      "public/css/tutorial.css:330",
      "public/css/tutorial.css:715"
    ],
    ".tutorial-choice-card": [
      "public/css/tutorial-eli5.css:29",
      "public/css/tutorial-eli5.css:110",
      "public/css/tutorial.css:606"
    ],
    ".tutorial-choice-grid": [
      "public/css/tutorial-eli5.css:106",
      "public/css/tutorial.css:600",
      "public/css/tutorial.css:764"
    ],
    ".tutorial-header": [
      "public/css/tutorial.css:58",
      "public/css/tutorial.css:337",
      "public/css/tutorial.css:444"
    ],
    ".tutorial-text, #tutorialText": [
      "public/css/tutorial-eli5.css:5",
      "public/css/tutorial-eli5.css:100",
      "public/css/tutorial.css:523",
      "public/css/tutorial.css:768"
    ],
    "0%": [
      "public/css/animations.css:4",
      "public/css/animations.css:12",
      "public/css/animations.css:24",
      "public/css/animations.css:29",
      "public/css/animations.css:40",
      "public/css/animations.css:51",
      "public/css/animations.css:62",
      "public/css/animations.css:67",
      "public/css/animations.css:72",
      "public/css/animations.css:96",
      "public/css/animations.css:102",
      "public/css/animations.css:108",
      "public/css/animations.css:114",
      "public/css/animations.css:120",
      "public/css/animations.css:143",
      "public/css/animations.css:157",
      "public/css/competitive-polish-v2.css:571",
      "public/css/competitive-polish-v2.css:1998",
      "public/css/gameplay-ui.css:479",
      "public/css/gameplay-ui.css:800",
      "public/css/gameplay-ui.css:1148",
      "public/css/gameplay-ui.css:1337",
      "public/css/gameplay-ui.css:1437",
      "public/css/gameplay-ui.css:2519",
      "public/css/gameplay-ui.css:2897",
      "public/css/gameplay-ui.css:2901",
      "public/css/gameplay-ui.css:2905",
      "public/css/gameplay-ui.css:2944",
      "public/css/gameplay-ui.css:2949",
      "public/css/gameplay-ui.css:2975",
      "public/css/history.css:88",
      "public/css/history.css:118",
      "public/css/history.css:123",
      "public/css/history.css:128",
      "public/css/history.css:325",
      "public/css/history.css:332",
      "public/css/history.css:533",
      "public/css/history.css:813",
      "public/css/layout.css:535",
      "public/css/layout.css:570",
      "public/css/powers.css:405",
      "public/css/powers.css:413",
      "public/css/powers.css:424",
      "public/css/special-effects.css:40",
      "public/css/special-effects.css:113",
      "public/css/tutorial.css:311"
    ],
    "0%, 100%": [
      "public/css/animations.css:135",
      "public/css/competitive-polish-v2.css:625",
      "public/css/components.css:673",
      "public/css/features.css:242",
      "public/css/features.css:1517",
      "public/css/features.css:1929",
      "public/css/features.css:1959",
      "public/css/game-menu.css:405",
      "public/css/game-menu.css:798",
      "public/css/gameplay-ui.css:763",
      "public/css/gameplay-ui.css:768",
      "public/css/gameplay-ui.css:996",
      "public/css/gameplay-ui.css:2509",
      "public/css/gameplay-ui.css:2525",
      "public/css/gameplay-ui.css:2530",
      "public/css/gameplay-ui.css:2535",
      "public/css/gameplay-ui.css:2545",
      "public/css/history.css:290",
      "public/css/layout.css:231",
      "public/css/powers.css:15",
      "public/css/special-effects.css:259",
      "public/css/states.css:58",
      "public/css/tutorial.css:381"
    ],
    "0%, 40%, 100%": [
      "public/css/powers.css:296",
      "public/css/powers.css:300",
      "public/css/powers.css:304",
      "public/css/powers.css:308",
      "public/css/powers.css:312",
      "public/css/powers.css:316"
    ],
    "100%": [
      "public/css/animations.css:9",
      "public/css/animations.css:18",
      "public/css/animations.css:26",
      "public/css/animations.css:35",
      "public/css/animations.css:46",
      "public/css/animations.css:57",
      "public/css/animations.css:64",
      "public/css/animations.css:68",
      "public/css/animations.css:88",
      "public/css/animations.css:98",
      "public/css/animations.css:104",
      "public/css/animations.css:111",
      "public/css/animations.css:117",
      "public/css/animations.css:128",
      "public/css/animations.css:151",
      "public/css/animations.css:162",
      "public/css/competitive-polish-v2.css:573",
      "public/css/competitive-polish-v2.css:1999",
      "public/css/gameplay-ui.css:485",
      "public/css/gameplay-ui.css:811",
      "public/css/gameplay-ui.css:1352",
      "public/css/gameplay-ui.css:1441",
      "public/css/gameplay-ui.css:2521",
      "public/css/gameplay-ui.css:2898",
      "public/css/gameplay-ui.css:2902",
      "public/css/gameplay-ui.css:2907",
      "public/css/gameplay-ui.css:2946",
      "public/css/gameplay-ui.css:2952",
      "public/css/gameplay-ui.css:2982",
      "public/css/history.css:89",
      "public/css/history.css:119",
      "public/css/history.css:124",
      "public/css/history.css:129",
      "public/css/history.css:328",
      "public/css/history.css:338",
      "public/css/history.css:545",
      "public/css/history.css:820",
      "public/css/layout.css:543",
      "public/css/layout.css:582",
      "public/css/powers.css:409",
      "public/css/powers.css:415",
      "public/css/powers.css:426",
      "public/css/refinement-v4.css:479",
      "public/css/special-effects.css:62",
      "public/css/special-effects.css:134"
    ],
    "15%": [
      "public/css/gameplay-ui.css:1438",
      "public/css/layout.css:574",
      "public/css/powers.css:414"
    ],
    "18%": [
      "public/css/competitive-polish-v2.css:630",
      "public/css/special-effects.css:45",
      "public/css/special-effects.css:117"
    ],
    "20%": [
      "public/css/animations.css:5",
      "public/css/animations.css:25",
      "public/css/gameplay-ui.css:997",
      "public/css/layout.css:539",
      "public/css/powers.css:406"
    ],
    "25%": [
      "public/css/animations.css:76",
      "public/css/animations.css:109",
      "public/css/gameplay-ui.css:1439",
      "public/css/gameplay-ui.css:2546"
    ],
    "35%": [
      "public/css/gameplay-ui.css:480",
      "public/css/gameplay-ui.css:1342",
      "public/css/gameplay-ui.css:2976",
      "public/css/history.css:326",
      "public/css/history.css:537",
      "public/css/special-effects.css:121"
    ],
    "40%": [
      "public/css/animations.css:6",
      "public/css/animations.css:103",
      "public/css/animations.css:115",
      "public/css/animations.css:147",
      "public/css/animations.css:158",
      "public/css/game-menu.css:1194",
      "public/css/gameplay-ui.css:998",
      "public/css/powers.css:407"
    ],
    "50%": [
      "public/css/animations.css:15",
      "public/css/animations.css:32",
      "public/css/animations.css:43",
      "public/css/animations.css:54",
      "public/css/animations.css:63",
      "public/css/animations.css:80",
      "public/css/animations.css:97",
      "public/css/animations.css:138",
      "public/css/components.css:677",
      "public/css/features.css:245",
      "public/css/features.css:1520",
      "public/css/features.css:1932",
      "public/css/features.css:1963",
      "public/css/game-menu.css:406",
      "public/css/game-menu.css:799",
      "public/css/gameplay-ui.css:764",
      "public/css/gameplay-ui.css:2510",
      "public/css/gameplay-ui.css:2526",
      "public/css/gameplay-ui.css:2531",
      "public/css/gameplay-ui.css:2536",
      "public/css/history.css:291",
      "public/css/history.css:334",
      "public/css/history.css:816",
      "public/css/layout.css:234",
      "public/css/powers.css:16",
      "public/css/special-effects.css:260",
      "public/css/states.css:62",
      "public/css/tutorial.css:386"
    ],
    "50%, 90%": [
      "public/css/powers.css:297",
      "public/css/powers.css:301",
      "public/css/powers.css:305",
      "public/css/powers.css:309",
      "public/css/powers.css:313",
      "public/css/powers.css:317"
    ],
    "60%": [
      "public/css/animations.css:7",
      "public/css/animations.css:124",
      "public/css/gameplay-ui.css:770",
      "public/css/gameplay-ui.css:999",
      "public/css/gameplay-ui.css:2945",
      "public/css/powers.css:408"
    ],
    "70%": [
      "public/css/animations.css:110",
      "public/css/animations.css:116",
      "public/css/gameplay-ui.css:1347",
      "public/css/history.css:541"
    ],
    "75%": [
      "public/css/animations.css:84",
      "public/css/gameplay-ui.css:2547",
      "public/css/layout.css:578",
      "public/css/special-effects.css:56"
    ],
    "80%": [
      "public/css/animations.css:8",
      "public/css/gameplay-ui.css:1000",
      "public/css/gameplay-ui.css:1440",
      "public/css/history.css:336"
    ],
    ":root": [
      "public/css/animations.css:1",
      "public/css/competitive-polish-v2.css:1330",
      "public/css/refinement-v4.css:1",
      "public/css/themes.css:1"
    ],
    "from": [
      "public/css/competitive-polish-v2.css:577",
      "public/css/gameplay-ui.css:2036",
      "public/css/gameplay-ui.css:2514",
      "public/css/gameplay-ui.css:2540",
      "public/css/powers.css:38",
      "public/css/powers.css:419",
      "public/css/tutorial.css:153"
    ],
    "to": [
      "public/css/competitive-polish-v2.css:173",
      "public/css/competitive-polish-v2.css:578",
      "public/css/features.css:1438",
      "public/css/gameplay-ui.css:2037",
      "public/css/gameplay-ui.css:2515",
      "public/css/gameplay-ui.css:2541",
      "public/css/powers.css:39",
      "public/css/powers.css:420",
      "public/css/tutorial.css:157"
    ]
  },
  "total_css_bytes": 421708
}
```

Use this context only as a starting map. Open the actual files and follow current code paths before editing.
