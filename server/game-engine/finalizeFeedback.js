
const { scoreGuess } = require("../game-engine/scoring");
const { isConsistentWithHistory } = require("../game-engine/history");
/**
 * Applies the scoring pipeline:
 *   1. preScore power hooks
 *   2. base scoring
 *   3. postScore power hooks
 *   4. create history entry
 */
function finalizeFeedback(state, powerEngine, roomId, room, io) {
  const guess = state.pendingGuess;

  // Step 1: allow powers to hook BEFORE scoring
  powerEngine.preScore(state, guess, roomId, io);

  // Step 2: base scoring
  const fb = scoreGuess(state.secret, guess);

  // Build history entry
  const entry = {
    guess,
    fb,
    fbGuesser: [...fb],
    extraInfo: null,
    finalSecret: state.secret,
    roundIndex: state.history.length,
    powerEvents: [],
    fakeFeedback: null
  };

  // Step 3: allow powers to modify feedback entry (also captures any
  // power results broadcast during postScore, e.g. a resolved bet)
  powerEngine.postScore(state, entry, roomId, io);

  // Drain power-use events queued since the last entry (from applyPower
  // and the postScore call above) onto this entry, chronologically.
  entry.powerEvents = Array.isArray(state._pendingPowerEvents)
    ? [...state._pendingPowerEvents]
    : [];
  state._pendingPowerEvents = [];

  // Step 4: commit entry to history
  state.history.push(entry);
  state.pendingGuess = "";
}


module.exports = {
  finalizeFeedback
};
