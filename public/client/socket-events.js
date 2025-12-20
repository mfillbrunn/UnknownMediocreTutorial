
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
  toast(`Secret two rounds ago was: ${secret.toUpperCase()}`);
});


// Timer begins
socket.on("forceTimerStarted", ({ deadline }) => {
  const bar = $("turnIndicatorSetter");
  bar.classList.add("your-turn");
  bar.textContent = "TIME LEFT: 30s";
});

// Timer tick (250ms)
socket.on("forceTimerTick", ({ remaining }) => {
  const bar = $("turnIndicatorSetter");
  const sec = Math.max(0, Math.ceil(remaining / 1000));

  bar.textContent = `TIME LEFT: ${sec}s`;
  bar.classList.add("your-turn");

  // --- NEW: Flash red when 5 seconds or less ---
  if (sec <= 5) {
    bar.classList.add("flash-warning");
  } else {
    bar.classList.remove("flash-warning");
  }
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
  const bar = $("turnIndicatorSetter");
  bar.textContent = "TIME LEFT: 0s";
  bar.classList.remove("flash-warning");

  $("submitSetterNewBtn").disabled = true;
  $("submitSetterNewBtn").classList.add("disabled-btn");
  $("newSecretInput").value = "";

  toast("Time ran out — old secret was kept!");
});

socket.on("suggestWord", ({ word }) => {
  if (myRole === state.guesser) {
    $("guessInput").value = word.toUpperCase();
  }
  if (myRole === state.setter) {
    $("newSecretInput").value = word.toUpperCase();
  }
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
  resetKeyboards();
  if (pendingState) {
    state = pendingState;
    window.state = state;
    pendingState = null;
    updateUI();
  }
  updateRoleLabels();
});
