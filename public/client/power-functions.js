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
// Freezze secret
function setKeyboardDisabled(container, disabled) {
  if (!container) return;
  container.classList.toggle("keyboard-disabled", disabled);
}



