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
