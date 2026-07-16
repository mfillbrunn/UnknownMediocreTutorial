# Adding a new power

## Prompt template

```
Add a new power called "<PowerName>" to VS Wordle.

Role: <setter | guesser>
Trigger: <once per match | once per round | always-on | manual button click, etc.>
Effect: <plain-English description of the mechanic>
Visibility: <does this reveal something to only one player, or is it public to both?>
AI usage: <should the AI opponent be able to use this power? if yes, what triggers it to decide to use it?>

Follow the existing pattern used by <closest existing power, e.g. "magicMode" or "revealPenalty">
for wiring it into: state init, power rules (client+server), power metadata (client+server),
lobby pool, normal-phase transitions, safe-state redaction (if needed), AI usability, the
power's own client/server files, index.html script tag, and CSS for its activation flash
and any bespoke visual (e.g. a new modal, a tile animation).

Verify with a Playwright test (or two-page manual simulation) that: the power appears in the
power info panel, can be activated by a real player, the AI can use it if aiUsable, and nothing
leaks to the opponent that shouldn't (check both players' `safeState` view).
```

Fill in the bracketed parts and hand it over — that's enough context to implement a power correctly on the first pass.

## Checklist: files to touch per power

**Create (2 required, always):**

| File | Purpose |
|---|---|
| `server/powers/powers/<name>Server.js` | Mechanics: `apply(state, action, roomId, io)`, optionally `postScore`, `turnStart` |
| `public/powerEngine/powers/<name>.js` | UI: `PowerEngine.register("<name>", { role, tooltip, renderButton })`, click → `sendGameAction` |

**Edit (every power touches these):**

| File | What to add |
|---|---|
| `server/core/stateFactory.js` | Init flags, e.g. `<name>Used: false`, `<name>Active: false` |
| `server/powers/powerMetadata.js` | `{ label, role }` (+ `variants` if the power has sub-modes) |
| `public/powerEngine/powerMetadata.js` | `{ label, desc, icon, emoji, color }` — the player-facing copy |
| `server/powers/POWER_RULES.js` | `allowed(state)` — server-side gate on when it can fire |
| `public/powerEngine/powerRules.js` | `{ once, allowed(state, role) }` — client-side gate (must mirror server) |
| `server/core/phases/lobby.js` | Add name string to `SETTER_POWERS` or `GUESSER_POWERS` array for randomization |
| `server/core/transitions/normalTransitions.js` | Reset `<name>Active` (and similar) on round/turn transition |
| `public/index.html` | `<script src="powerEngine/powers/<name>.js"></script>` — easy to forget, fails silently |
| `public/css/powers.css` | `body.power-<name> #power-fx { ... animation: fx-flash ... }` activation flash |

**Edit conditionally:**

| File | When needed |
|---|---|
| `server/utils/safeState.js` | Only if the power should hide/mask something from one player (like `betMissActive` hiding the number from the setter, or `stealthGuessActive` masking the pending guess). Skip if the effect is public to both sides. |
| `server/core/ai/aiPowerMeta.js` | Only if the AI should be able to use this power — `{ role, aiUsable, isUsed, buildAction }`. Omitting this means the AI never uses it (safe default, but confirm that's intended). |
| Extra CSS/animation file (e.g. `public/css/history.css`, `public/css/features.css`) | Only if the power needs a bespoke visual beyond the generic flash — a new modal (like Marked Weakness/Bet Power), a tile animation (like Magic Mode's constraint-reveal), etc. |
| A new modal in `public/index.html` | Only if the power needs player input beyond a single button click (a letter picker, a bet amount, a word entry) — remember modals must live outside `.screen` ancestors or get reparented to `<body>`, per the containing-block issue that broke Marked Weakness/Assassin Word/Bet Power's visuals earlier. |
