// Suggest secret/guess
socket.on("suggestWord", ({ word }) => {
  const upper = word.toUpperCase();
  if (myRole === state.setter) {
    state.setterDraft = upper;
    updateUI();
  }
  if (myRole === state.guesser) {
    localGuesserDraft = upper.toLowerCase();
    updateUI();
  }
});


// REVEAL GREEN
function applyRevealGreenDraft(draft, state) {
  if (!state.revealGreenInfo) return draft;

  const { pos, letter } = state.revealGreenInfo;

  draft = (draft || "").toUpperCase().padEnd(5, "");

  // Only re-insert if the tile is empty
  if (!draft[pos]) {
    draft =
      draft.slice(0, pos) +
      letter +
      draft.slice(pos + 1);
  }

  return draft;
}
