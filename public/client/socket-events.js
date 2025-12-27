socket.on("simulProgress", ({ secretSubmitted, guessSubmitted }) => {

  // Notify BOTH players when setter submits (first time)
  if (secretSubmitted && !lastSimulSecret) {
    toast("Setter submitted their secret!");
  }
  // Notify BOTH players when guesser submits (first time)
  if (guessSubmitted && !lastSimulGuess) {
    toast("Guesser submitted their guess!");
  }
  // Save previous values so we don't re-toast
  lastSimulSecret = secretSubmitted;
  lastSimulGuess = guessSubmitted;
  });

socket.on("revealOldSecret", ({ secret }) => {
  toast(`Secret three rounds ago was: ${secret.toUpperCase()}`);
});


// Timer begins
socket.on("forceTimerStarted", () => {
  toast("⏱ Setter is now timed!");
});



socket.on("assassinUsed", ({ setter, word }) => {
  // Notify guesser only
  if (myRole === state.guesser) {
    toast("☠ The setter has armed an Assassin Word!");
  }

  // Optional: setter feedback (if you want)
  if (myRole === state.setter) {
    toast("Assassin Word set: " + word.toUpperCase());
  }
});

socket.on("forceTimerExpired", () => {
  toast("Time ran out — old secret was kept!");
});


socket.on("errorMessage", msg => {
  if ($("assassinModal").classList.contains("active")) {
    const inp = $("assassinInput");
    shake(inp);
    toast(msg);
    inp.value = "";
    inp.focus(); // IMPORTANT to avoid “freeze”
    return;
  }

  // fallback for secret errors
  shake($("newSecretInput"));
  toast(msg);
});

socket.on("roleAssigned", ({ role }) => {
  myRole = role;
  roleAssigned = true;
     localGuesserDraft = "";
  if (pendingState) {
    state = pendingState;
    window.state = state;
    pendingState = null;
    updateUI();
  }
  updateRoleLabels();
});
