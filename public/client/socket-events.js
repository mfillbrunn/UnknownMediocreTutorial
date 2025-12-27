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
socket.on("forceTimerStarted", ({ durationMs }) => {
  const seconds = Math.ceil(durationMs / 1000);
  toast(`⏱ Setter is now timed — ${seconds} seconds to make a guess!`);
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


///FORCE GUESS

socket.on("forceGuessOptions", ({ options }) => {
  socket.on("forceGuessOptions",
  const modal = $("forceGuessModal");
  const p = $("forceGuessPrompt");

  p.textContent = "Choose a forced guess condition:";

  $("fgContains").textContent = `Contains ${options.contains}`;
  $("fgStarts").textContent   = `Starts with ${options.startsWith}`;
  $("fgEnds").textContent     = `Ends with ${options.endsWith}`;

  $("fgContains").onclick = () =>
    sendGameAction(roomId, { type: "CONFIRM_FORCE_GUESS", mode: "contains" });
  $("fgStarts").onclick = () =>
    sendGameAction(roomId, { type: "CONFIRM_FORCE_GUESS", mode: "startsWith" });
  $("fgEnds").onclick = () =>
    sendGameAction(roomId, { type: "CONFIRM_FORCE_GUESS", mode: "endsWith" });
  $("fgDouble").onclick = () =>
    sendGameAction(roomId, { type: "CONFIRM_FORCE_GUESS", mode: "doubleLetter" });

  modal.classList.add("active");
});

