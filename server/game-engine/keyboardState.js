// game-engine/keyboardState.js

const KEYBOARD_LAYOUT = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["ENTER","Z","X","C","V","B","N","M","⌫"]
];

function getAgreedFeedbackAtIndex(h, i, isGuesser) {
  if (!isGuesser) return h.fb?.[i];

  if (!h.fakeFeedback) return h.fbGuesser?.[i];

  const r = h.fakeFeedback.real?.[i];
  const f = h.fakeFeedback.fake?.[i];

  return r === f ? r : null;
}

function getLetterStatusFromHistory(letter, state, isGuesser) {
  if (!state?.history) return null;

  const extraGreens = state.extraConstraints
    ?.filter(c => c.type === "GREEN")
    .map(c => c.letter);

  if (extraGreens?.includes(letter)) {
    return "green";
  }

  let strongest = null;

  for (const h of state.history) {
    if (!h?.guess || h.countOnlyApplied) continue;

    const guess = h.guess.toUpperCase();

    for (let i = 0; i < 5; i++) {

      if (h.hideTileApplied && h.hiddenIndices?.includes(i)) continue;

      const bsIdx = state.powers?.blindSpotIndex;
      const bsRound = state.powers?.blindSpotRoundIndex;

      if (
        isGuesser &&
        typeof bsIdx === "number" &&
        bsIdx === i &&
        typeof h.roundIndex === "number" &&
        h.roundIndex >= bsRound
      ) {
        continue;
      }

      if (guess[i] !== letter) continue;

      const fb = getAgreedFeedbackAtIndex(h, i, isGuesser);

      if (!fb) continue;

      if (fb === "🟩") strongest = "green";
      else if (fb === "🟨" && strongest !== "green") strongest = "yellow";
      else if (fb === "🟦" && !strongest) strongest = "blue";
      else if (fb === "⬛" && !strongest) strongest = "gray";
    }
  }

  return strongest;
}

function buildKeyboardState(state, isGuesser) {

  const keyboard = {};

  for (const row of KEYBOARD_LAYOUT) {
    for (const symbol of row) {

      if (!/^[A-Z]$/.test(symbol)) continue;

      const status = getLetterStatusFromHistory(symbol, state, isGuesser);

      keyboard[symbol] = status;
    }
  }

  return keyboard;
}

module.exports = {
  buildKeyboardState
};
