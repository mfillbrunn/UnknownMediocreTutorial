// powers/powers/setterQuestServer.js — Setter Quest
//
// The setter's parallel to questServer.js's guesser quest: an always-on
// mechanic that doesn't sit in the drafted/random power pool (see
// lobby.js/draft.js -- the setter's regular power pool was cut from 2
// candidates-worth down to 1 pick specifically to make room for this).
//
// Every time the setter gets a fresh Keep/New decision (a new pending
// guess lands and it becomes their turn to react), they're shown one hint
// letter -- a letter that ISN'T in their current secret but IS somewhere
// in another word still consistent with all feedback so far (i.e. a word
// they could plausibly switch their secret to without contradicting
// anything already revealed). The guesser never sees this letter --
// safeState.js redacts state.powers.setterQuest.hintLetter same as it
// does state.powers.doubleGuessHidden.
//
// If the setter actually commits a NEW secret containing that letter,
// progress advances by one (capped at 2). At 2/2 they can spend the quest
// on a one-time "reset a letter" action -- mechanically identical to the
// Hide Evidence power (hideTileServer.js): erase all feedback for one
// chosen letter across every guess so far this round. Unlike hideTile's
// own 2-uses-per-match cap, claiming this resets progress back to 0
// (not "used forever") so it can be earned again for the rest of the
// setter's round. resetRoundState.js's createInitialPowers() call wipes
// hintLetter/progress back to their defaults at every round boundary
// (a different player holds the setter role each round in the standard
// 2-round match, so there's nothing to preserve across that swap -- unlike
// state.powers.quest.type, which nextRoundTransition.js explicitly saves
// and restores because it has to follow the same player).
const { isConsistentWithHistory } = require("../../game-engine/history");

// Finds a letter that's (a) NOT in the given secret and (b) IS somewhere
// in at least one other word still consistent with the given history --
// i.e. a letter the setter could plausibly reveal by switching to a
// different, still-legal secret. Returns null if no such letter exists.
function computeHintLetter(secret, history, state, allowedSecrets) {
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

  if (!candidates.size) return null;
  const options = [...candidates];
  return options[Math.floor(Math.random() * options.length)];
}

// Called from transitionAfterGuess (normalTransitions.js) right as a fresh
// pending guess lands and turn passes to the setter -- state.secret is
// still whatever it currently is (the setter hasn't reacted yet) and
// state.history holds every guess already scored, exactly the inputs
// computeHintLetter needs.
function rollHintLetterForTurn(state, allowedSecrets) {
  if (!state.secret) return;
  state.powers.setterQuest ??= { hintLetter: null, progress: 0 };
  state.powers.setterQuest.hintLetter =
    computeHintLetter(state.secret, state.history, state, allowedSecrets);
}

// Called from normal.js whenever the setter commits an actual secret
// CHANGE (Keep/New reaction where the new secret differs from the old
// one) -- if it contains this turn's hint letter, advance progress by one
// (capped at 2, the reward threshold).
function creditSecretChange(state, newSecret) {
  const q = state.powers.setterQuest;
  if (!q || !q.hintLetter) return;

  const upper = (newSecret || "").toUpperCase();
  if (!upper.includes(q.hintLetter)) return;

  q.progress = Math.min(2, (q.progress || 0) + 1);
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
// apply(), just gated on quest progress instead of a use counter, and
// resets progress back to 0 (not "used forever") instead of permanently
// disabling anything.
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

  q.progress = 0;
  q.hintLetter = null;
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
  computeHintLetter,
  rollHintLetterForTurn,
  creditSecretChange,
  letterHasFeedback,
  applyReward,
  attemptReward
};
