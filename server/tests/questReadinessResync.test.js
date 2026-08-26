// Regression test: a quest's ready/oneAway flags used to be a one-way
// latch -- onGuessSubmitted/turnStart (questServer.js) only ever flipped
// ready from false to true, never back. That's correct for the normal
// guess-by-guess flow (progress only moves forward), but state.history's
// feedback can also be mutated well after the fact by things that aren't
// a guess submission at all -- a Power Choice reward, the classic
// per-turn spy-charge letter reset, Vowel Refresh, Hide Evidence -- all
// of which funnel through resetLetterKnowledge.js's eraseLetterKnowledge.
// Without a way to re-derive ready/oneAway from the CURRENT history after
// one of those runs, a quest badge could stay lit "ready" (green) even
// once the history it was computed from no longer actually supports it.
const assert = require("assert");
const questServer = require("../powers/powers/questServer");
const { eraseLetterKnowledge } = require("../utils/resetLetterKnowledge");

function run() {
  // ---- 1. resyncQuestReadiness recomputes ready from the real, current
  // history -- including downgrading a ready flag that's stuck true for
  // history that doesn't actually satisfy the quest's threshold. ----
  {
    const state = {
      history: [
        { guess: "APPLE", fb: ["🟩", "⬛", "⬛", "⬛", "⬛"], fbGuesser: ["🟩", "⬛", "⬛", "⬛", "⬛"] }
        // Only 1 compliant guess recorded -- HARDMODE needs 4.
      ],
      powers: {
        quest: { type: "HARDMODE", used: false, ready: true, oneAway: false }
        // ready is stuck true here even though history only supports 1/4 --
        // simulates whatever got it into this state (this test asserts the
        // correction, not the original trigger).
      }
    };

    questServer.resyncQuestReadiness(state);

    assert.strictEqual(state.powers.quest.ready, false, "resyncQuestReadiness must correct a stuck ready flag back to false");
    assert.strictEqual(state.powers.quest.oneAway, false, "1/4 is not one-away from a threshold of 4");
  }

  // ---- 2. resyncQuestReadiness leaves a genuinely-earned ready flag
  // alone, and recognizes true readiness from scratch too (not just
  // downgrades). ----
  {
    const compliantEntry = () => ({
      guess: "AXXXX",
      fb: ["🟩", "⬛", "⬛", "⬛", "⬛"],
      fbGuesser: ["🟩", "⬛", "⬛", "⬛", "⬛"]
    });
    const state = {
      history: [compliantEntry(), compliantEntry(), compliantEntry(), compliantEntry()],
      powers: {
        quest: { type: "HARDMODE", used: false, ready: false, oneAway: false }
      }
    };

    questServer.resyncQuestReadiness(state);

    assert.strictEqual(state.powers.quest.ready, true, "4 compliant guesses must be recognized as ready, not just left alone");
  }

  // ---- 3. Never touches an already-claimed quest. ----
  {
    const state = {
      history: [],
      powers: {
        quest: { type: "HARDMODE", used: true, ready: false, oneAway: false }
      }
    };
    questServer.resyncQuestReadiness(state);
    assert.strictEqual(state.powers.quest.ready, false, "used quest must not be re-marked ready");
  }

  // ---- 4. eraseLetterKnowledge (the shared utility every letter-erasing
  // reward/power funnels through -- Power Choice rewards, the classic
  // spy-charge letter reset, Vowel Refresh, Hide Evidence) actually wires
  // this resync in, rather than requiring every caller to remember to. ----
  {
    const state = {
      history: [
        { guess: "APPLE", fb: ["🟩", "⬛", "⬛", "⬛", "⬛"], fbGuesser: ["🟩", "⬛", "⬛", "⬛", "⬛"] }
      ],
      extraConstraints: [],
      powers: {
        quest: { type: "HARDMODE", used: false, ready: true, oneAway: false }
      }
    };

    eraseLetterKnowledge(state, ["Z"]); // an unrelated letter -- still must trigger a resync

    assert.strictEqual(state.powers.quest.ready, false, "eraseLetterKnowledge must resync quest readiness, correcting a stuck ready flag");
  }

  console.log("PASS questReadinessResync: quest ready/oneAway can be corrected (not just latched forward), and eraseLetterKnowledge wires the resync in for every letter-erasing reward/power");
}

module.exports = { run };

if (require.main === module) {
  run();
}
