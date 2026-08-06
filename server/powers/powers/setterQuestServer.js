// powers/powers/setterQuestServer.js — Setter Quest
//
// The setter's parallel to questServer.js's guesser quest: an always-on
// mechanic that doesn't sit in the drafted/random power pool (see
// lobby.js/draft.js -- the setter's regular power pool was cut from 2
// candidates-worth down to 1 pick specifically to make room for this).
//
// Every time the setter gets a fresh Keep/New decision (a new pending
// guess lands and it becomes their turn to react), they're shown up to TWO
// hint letters -- each independently a letter that ISN'T in their current
// secret but IS somewhere in another word still consistent with all
// feedback so far (i.e. a word they could plausibly switch their secret
// to without contradicting anything already revealed). The two letters
// don't need to come from the same alternate word -- each is picked on
// its own. If only one qualifying letter exists, the second slot is left
// empty (null) -- the client renders that as a dash. The guesser never
// sees either letter -- safeState.js redacts state.powers.setterQuest.
// hintLetters same as it does state.powers.doubleGuessHidden.
//
// If the setter actually commits a NEW secret containing one or both
// hint letters, progress advances by 1 per letter matched (so matching
// both in one switch is worth 2). A single switch CAN push progress past
// the 2-point reward threshold (e.g. 1 -> 3 by matching both at once) --
// that overflow point carries forward, since claiming the reward only
// ever subtracts 2, it doesn't reset to 0. But once progress has already
// reached 2+, no FURTHER crediting happens on later turns -- the setter
// has to actually claim the reward before banking any more, so progress
// can't just keep climbing turn after turn while sitting unclaimed. At
// 2+ they can spend the quest on a one-time "reset a
// letter" action -- mechanically identical to the Hide Evidence power
// (hideTileServer.js): erase all feedback for one chosen letter across
// every guess so far this round. resetRoundState.js's createInitialPowers()
// call wipes hintLetters/progress back to their defaults at every round
// boundary (a different player holds the setter role each round in the
// standard 2-round match, so there's nothing to preserve across that swap
// -- unlike state.powers.quest.type, which nextRoundTransition.js
// explicitly saves and restores because it has to follow the same player).
const { isConsistentWithHistory } = require("../../game-engine/history");

// Every letter that's (a) NOT in the given secret and (b) IS somewhere in
// at least one other word still consistent with the given history -- the
// full candidate pool computeHintLetters draws its two picks from.
function candidateHintLetters(secret, history, state, allowedSecrets) {
  const upperSecret = (secret || "").toUpperCase();
  const secretLetters = new Set(upperSecret.split(""));
  const candidates = new Set();

  for (const word of allowedSecrets || []) {
    const upper = word.toUpperCase();
    if (upper === upperSecret) continue;
    if (!isConsistentWithHistory(history || [], upper, state)) continue;
    for (const c of upper) {
      if (!secretLetters.has(c)) candidates.add(c);
    }
  }

  return candidates;
}

// Picks up to 2 hint letters, each independently -- they don't need to
// both appear in the same alternate word. Each pick prefers a letter
// that's ALSO not in the pending guess (so switching toward it doesn't
// simultaneously light up a tile in the guess about to be scored),
// falling back to any remaining candidate if every option is in the
// guess. The second pick never repeats the first. Returns an array of
// length 0, 1, or 2 (never null entries -- an unavailable second letter
// just means the array has length 1; the client renders that slot as a
// dash).
function computeHintLetters(secret, history, state, allowedSecrets, pendingGuess) {
  const candidates = candidateHintLetters(secret, history, state, allowedSecrets);
  if (!candidates.size) return [];

  const guessLetters = new Set((pendingGuess || "").toUpperCase().split(""));

  function pickFrom(pool) {
    if (!pool.length) return null;
    const avoidingGuess = pool.filter(l => !guessLetters.has(l));
    const finalPool = avoidingGuess.length ? avoidingGuess : pool;
    return finalPool[Math.floor(Math.random() * finalPool.length)];
  }

  const pool = [...candidates];
  const first = pickFrom(pool);
  if (!first) return [];

  const second = pickFrom(pool.filter(l => l !== first));
  return second ? [first, second] : [first];
}

// Called from transitionAfterGuess (normalTransitions.js) right as a fresh
// pending guess lands and turn passes to the setter -- state.secret is
// still whatever it currently is (the setter hasn't reacted yet) and
// state.history holds every guess already scored, exactly the inputs
// computeHintLetters needs. pendingGuess is the guess that just landed
// (not yet in state.history -- see computeHintLetters' own comment).
function rollHintLetterForTurn(state, allowedSecrets, pendingGuess) {
  if (!state.secret) return;
  state.powers.setterQuest ??= { hintLetters: [], progress: 0 };
  state.powers.setterQuest.hintLetters =
    computeHintLetters(state.secret, state.history, state, allowedSecrets, pendingGuess);
}

// Called from normal.js whenever the setter commits an actual secret
// CHANGE (Keep/New reaction where the new secret differs from the old
// one) -- advances progress by 1 for each of this turn's hint letters the
// new secret contains (so matching both is worth 2 in one switch). Once
// progress has already reached the 2-point reward threshold, no further
// crediting happens -- the setter has to actually claim the reward
// (applyReward subtracts 2, not resets to 0) before progress can climb
// again. This still lets ONE switch push progress past 2 in a single
// shot (e.g. 1 -> 3 by matching both letters at once) -- that overflow
// point carries into the reward same as before -- it just stops the
// setter from banking MORE on top of that across later turns while
// sitting on an unclaimed reward.
function creditSecretChange(state, newSecret) {
  const q = state.powers.setterQuest;
  if (!q || !Array.isArray(q.hintLetters) || !q.hintLetters.length) return;
  if ((q.progress || 0) >= 2) return;

  const upper = (newSecret || "").toUpperCase();
  const matched = q.hintLetters.filter(l => upper.includes(l)).length;
  if (!matched) return;

  q.progress = (q.progress || 0) + matched;
}

// Does this letter have any erasable feedback in the round so far? Shared
// by applyReward's own guard below and by runAI.js, which needs to pick a
// letter from the AI's secret that will actually DO something rather than
// wasting the activation on one that was never guessed.
function letterHasFeedback(state, letter) {
  const L = String(letter || "").toUpperCase();
  for (const entry of state.history) {
    const guess = (entry.guess || "").toUpperCase();
    for (let i = 0; i < guess.length; i++) {
      if (guess[i] !== L) continue;
      if ((Array.isArray(entry.fb) && entry.fb[i]) || (Array.isArray(entry.fbGuesser) && entry.fbGuesser[i])) {
        return true;
      }
    }
  }
  return false;
}

// The reward: identical erase-feedback mechanic to hideTileServer.js's
// apply(), just gated on quest progress instead of a use counter.
// Claiming subtracts 2 (the reward's cost) rather than resetting to 0 --
// see the file header: overflow progress beyond 2 isn't wasted, it
// carries straight into the next cycle.
function applyReward(state, letter, roomId, io) {
  const q = state.powers.setterQuest;
  if (!q || (q.progress || 0) < 2) return false;

  const L = String(letter || "").toUpperCase();
  if (!/^[A-Z]$/.test(L)) return false;

  if (!letterHasFeedback(state, L)) return false;

  for (const entry of state.history) {
    const guess = (entry.guess || "").toUpperCase();
    for (let i = 0; i < guess.length; i++) {
      if (guess[i] !== L) continue;
      if (Array.isArray(entry.fb)) entry.fb[i] = "";
      if (Array.isArray(entry.fbGuesser)) entry.fbGuesser[i] = "";
    }
  }

  q.progress = Math.max(0, (q.progress || 0) - 2);
  state.powers.setterQuestActive = true;
  state.powers.setterQuestLetters = [...(state.powers.setterQuestLetters || []), L];

  const payload = { type: "setterQuest", letter: L };
  io.to(roomId).emit("powerUsed", payload);

  // USE_SETTER_QUEST_RESET is a standing-option click (mirrors
  // questServer.js's attemptQuestClaim), not a normal apply()/postScore()
  // power activation, so it isn't wrapped by logPowerUse.js's automatic
  // emit capture -- push the log line directly in the same shape that
  // capture would have produced, so it shows up in the action log.
  if (!Array.isArray(state._pendingPowerEvents)) state._pendingPowerEvents = [];
  const logPayload = { id: "setterQuest", actorRole: "setter", emissions: [{ event: "powerUsed", payload }] };
  state._pendingPowerEvents.push(logPayload);
  io.to(roomId).emit("powerActivity", logPayload);

  return true;
}

// Entry point for the setter's tap on the quest badge's reward action --
// standing option like questServer.js's attemptQuestClaim, not tied to
// state.powerUsedThisTurn (so it never competes with the setter's other,
// separately-drafted power for the same turn's budget), but still scoped
// to the setter's own turn since it edits history the same way hideTile
// does mid-reaction.
function attemptReward(state, userId, letter, roomId, io) {
  if (userId !== state.setter) return false;
  if (state.turn !== state.setter) return false;
  return applyReward(state, letter, roomId, io);
}

module.exports = {
  computeHintLetters,
  rollHintLetterForTurn,
  creditSecretChange,
  letterHasFeedback,
  applyReward,
  attemptReward
};
