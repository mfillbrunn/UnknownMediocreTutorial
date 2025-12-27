
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
    finalSecret: state.currentSecret,
    roundIndex: state.history.length
  };

  // Step 3: allow powers to modify feedback entry
  powerEngine.postScore(state, entry, roomId, io);

  // Step 4: commit entry to history
  state.history.push(entry);

  state.pendingGuess = "";
  state.guessCount++;
}


module.exports = {
  finalizeFeedback
};
