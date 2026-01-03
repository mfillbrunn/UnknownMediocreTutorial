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
  if (myRole !== state.setter) return;

  const modal = $("forceGuessModal");
  const container = $("forceGuessOptionsContainer");
  container.innerHTML = "";

  options.forEach(o => {
    const btn = document.createElement("button");
    btn.className = "primary-btn small";

    btn.textContent = formatForceGuessOption(o);

    btn.onclick = () => {
      sendGameAction(roomId, {
        type: "CONFIRM_FORCE_GUESS",
        mode: o.type
      });
    };

    container.appendChild(btn);
  });

  modal.classList.add("active");
});

socket.on("timerTick", ({ timeRemaining }) => {
  if (!window.state) return;

  // Update authoritative values
  window.state.timeRemaining = timeRemaining;

  // Re-render ONLY the clocks
  renderChessClocks();
});

$("timeControlSelect").onchange = () => {
  const select = $("timeControlSelect");
  const seconds = parseInt(select.value, 10);

  if (!Number.isFinite(seconds)) return;

  // No time selected
  if (seconds === 0) {
    sendGameAction(roomId, {
      type: "SET_TIME_CONTROL",
      enabled: false
    });
    return;
  }

  const mode = $("timerModeSelect")?.value || "round";

  sendGameAction(roomId, {
    type: "SET_TIME_CONTROL",
    enabled: true,
    mode,
    seconds
  });
};

